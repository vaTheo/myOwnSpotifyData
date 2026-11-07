import { describe, expect, it } from 'vitest';
import type {
  AllRows,
  ArtistRef,
  MixRow,
  PlayRow,
  PlaylistRow,
  TrackRow,
} from '../../db/schema';
import { buildModel } from '../../model/aggregate';
import {
  buildSearchIndex,
  highlight,
  searchAll,
  type SearchEntry,
} from './searchIndex';

const kiasmos: ArtistRef = { id: 'kiasmos', name: 'Kiasmos' };
const other: ArtistRef = { id: 'other', name: 'Ólafur Arnalds' };

function track(key: string, name: string, artists: ArtistRef[]): TrackRow {
  return {
    key,
    id: key,
    uri: `spotify:track:${key}`,
    name,
    artists,
    album: 'Album',
    durationMs: 200_000,
    isrc: null,
    spotifyUrl: null,
    isLocal: false,
  };
}

function playlist(id: string, name: string, itemCount: number): PlaylistRow {
  return {
    id,
    name,
    snapshotId: 's',
    itemCount,
    imageUrl: null,
    spotifyUrl: null,
    syncedAt: 1,
  };
}

function play(
  trackId: string,
  plays: number,
  trackName: string | null,
  artistName: string | null
): PlayRow {
  return {
    trackId,
    plays,
    msPlayed: plays * 200_000,
    firstTs: '2024-01-02T10:00:00Z',
    lastTs: '2026-03-04T10:00:00Z',
    trackName,
    artistName,
  };
}

function mix(url: string, title: string | null, savedAt: number): MixRow {
  return {
    url,
    title,
    author: null,
    playerSrc: null,
    slug: null,
    sources: {
      trackid: false,
      description: false,
      pasted: true,
      linkOut: null,
    },
    rows: [],
    savedAt,
  };
}

function rows(over: Partial<AllRows> = {}): AllRows {
  return {
    playlists: [
      playlist('p1', 'Kiasmos essentials', 128),
      playlist('p2', 'Deep', 3),
    ],
    tracks: [
      track('t1', 'Blurred', [kiasmos]),
      track('t2', 'Looped', [kiasmos, other]),
      track('t3', 'Skiaround', [other]),
    ],
    entries: [
      { playlistId: 'p1', position: 0, trackKey: 't1', addedAt: null },
      { playlistId: 'p1', position: 1, trackKey: 't2', addedAt: null },
      { playlistId: 'p2', position: 0, trackKey: 't3', addedAt: null },
    ],
    topItems: [
      {
        key: 'artists:short_term',
        type: 'artists',
        period: 'short_term',
        fetchedAt: 1,
        items: [
          // Saved too: listed once.
          {
            rank: 1,
            id: 'kiasmos',
            name: 'Kiasmos',
            imageUrl: null,
            spotifyUrl: null,
          },
          {
            rank: 2,
            id: 'top-only',
            name: 'Kiasma Duo',
            imageUrl: null,
            spotifyUrl: null,
          },
        ],
      },
    ],
    plays: [
      play('t1', 142, 'Blurred', 'Kiasmos'),
      play('h1', 7, 'Kiasmic Dawn', 'Somebody'),
      // Library track's row: not listed a second time.
      play('t2', 3, 'Looped', 'Kiasmos'),
      play('h2', 2, null, null),
    ],
    features: [],
    artistIdentity: [],
    artistReach: [],
    ...over,
  };
}

const MIXES = [
  mix(
    'https://soundcloud.com/a/kiasmos-live',
    'Kiasmos live at Fabric',
    Date.UTC(2026, 10, 3, 12)
  ),
  mix('https://soundcloud.com/a/other', null, Date.UTC(2026, 9, 1, 12)),
];

const keyOf = (e: SearchEntry) => `${e.kind}:${e.id}`;

describe('buildSearchIndex (data-model §9)', () => {
  const index = buildSearchIndex(buildModel(rows()), MIXES);

  it('lists library and history-only tracks, artists, playlists and mixes', () => {
    expect(index.map(keyOf).sort()).toEqual(
      [
        'track:t1',
        'track:t2',
        'track:t3',
        'track:h1',
        'artist:kiasmos',
        'artist:other',
        'artist:top-only',
        'playlist:p1',
        'playlist:p2',
        'mix:https://soundcloud.com/a/kiasmos-live',
        'mix:https://soundcloud.com/a/other',
      ].sort()
    );
  });

  it('de-duplicates by id', () => {
    const keys = index.map(keyOf);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives each entry a context line and a weight', () => {
    const find = (k: string) => index.find((e) => keyOf(e) === k)!;
    expect(find('track:t1')).toMatchObject({
      name: 'Blurred',
      context: 'Kiasmos · 142 plays',
      weight: 142,
    });
    expect(find('track:h1')).toMatchObject({
      name: 'Kiasmic Dawn',
      context: 'Somebody · 7 plays',
    });
    // No play count: the line says nothing about plays, never "0 plays".
    expect(find('track:t3').context).toBe('Ólafur Arnalds');
    expect(find('artist:kiasmos')).toMatchObject({
      context: '2 saved tracks',
      weight: 2,
    });
    expect(find('artist:top-only').context).toBe('In your top artists');
    expect(find('playlist:p1')).toMatchObject({
      context: '128 tracks',
      weight: 128,
    });
    expect(find('mix:https://soundcloud.com/a/kiasmos-live')).toMatchObject({
      name: 'Kiasmos live at Fabric',
      context: 'saved 3 Nov',
    });
    // An untitled mix is named by its link.
    expect(find('mix:https://soundcloud.com/a/other').name).toBe(
      'https://soundcloud.com/a/other'
    );
  });

  it('is memoised on the model and the mixes array', () => {
    const model = buildModel(rows());
    const first = buildSearchIndex(model, MIXES);
    expect(buildSearchIndex(model, MIXES)).toBe(first);
    expect(buildSearchIndex(model, [...MIXES])).not.toBe(first);
    expect(buildSearchIndex(buildModel(rows()), MIXES)).not.toBe(first);
  });
});

describe('searchAll', () => {
  const index = buildSearchIndex(buildModel(rows()), MIXES);

  it('returns the groups in the order Tracks, Artists, Playlists, Mixes', () => {
    const groups = searchAll(index, 'kia');
    expect(groups.map((g) => g.kind)).toEqual([
      'track',
      'artist',
      'playlist',
      'mix',
    ]);
  });

  it('matches normalize(query) as a substring, ignoring case and accents', () => {
    const artists = searchAll(index, 'OLAF')
      .find((g) => g.kind === 'artist')!
      .entries.map((e) => e.id);
    expect(artists).toEqual(['other']);
    expect(searchAll(index, 'xyz')).toEqual([]);
    expect(searchAll(index, '  ')).toEqual([]);
  });

  it('finds a track by its artist', () => {
    const tracks = searchAll(index, 'kiasmos').find((g) => g.kind === 'track')!;
    expect(tracks.entries.map((e) => e.id)).toEqual(['t1', 't2']);
  });

  it('ranks prefix and word-start matches first, then by weight', () => {
    const tracks = searchAll(index, 'kia').find((g) => g.kind === 'track')!;
    // h1 "Kiasmic Dawn" starts with it (7 plays); t1 and t2 match on the
    // artist's word (142 and 3 plays); t3 "Skiaround" only inside a word.
    expect(tracks.entries.map((e) => e.id)).toEqual(['h1', 't1', 't2', 't3']);
  });

  it('gives perGroup entries and the total', () => {
    const many = buildSearchIndex(
      buildModel(
        rows({
          playlists: Array.from({ length: 8 }, (_, i) =>
            playlist(`q${i}`, `Kia ${i}`, i)
          ),
        })
      ),
      []
    );
    const playlists = searchAll(many, 'kia', 5).find(
      (g) => g.kind === 'playlist'
    )!;
    expect(playlists.entries).toHaveLength(5);
    expect(playlists.total).toBe(8);
    expect(playlists.entries[0].id).toBe('q7');
    expect(
      searchAll(many, 'kia', 100).find((g) => g.kind === 'playlist')!.entries
    ).toHaveLength(8);
  });
});

describe('highlight', () => {
  it('finds the matched part in the original text', () => {
    expect(highlight('Ólafur Arnalds', 'olaf')).toEqual([0, 4]);
    expect(highlight('Café del Mar', 'cafe del')).toEqual([0, 8]);
    expect(highlight('Night-Drive', 'night drive')).toEqual([0, 11]);
    expect(highlight('Skiaround', 'KIA')).toEqual([1, 4]);
  });

  it('is null without a match or a query', () => {
    expect(highlight('Blurred', 'kia')).toBeNull();
    expect(highlight('Blurred', '')).toBeNull();
  });
});
