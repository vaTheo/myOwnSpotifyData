import { describe, expect, it } from 'vitest';
import type {
  AllRows,
  ArtistRef,
  TracklistRow,
  TrackRow,
} from '../../db/schema';
import { buildModel } from '../../model/aggregate';
import { libraryTitleIndex, matchMixRow } from './match';

function track(
  key: string,
  name: string,
  artists: ArtistRef[],
  over: Partial<TrackRow> = {}
): TrackRow {
  return {
    key,
    id: key.startsWith('spotify:local:') ? null : key,
    uri: key.startsWith('spotify:') ? key : `spotify:track:${key}`,
    name,
    artists,
    album: 'Album',
    durationMs: 1000,
    isrc: null,
    spotifyUrl: null,
    isLocal: key.startsWith('spotify:local:'),
    ...over,
  };
}

function row(over: Partial<TracklistRow>): TracklistRow {
  return {
    startSec: null,
    endSec: null,
    artist: '',
    title: '',
    label: null,
    source: 'pasted',
    gap: false,
    detected: null,
    referenceCount: null,
    ...over,
  };
}

const rows: AllRows = {
  playlists: [
    {
      id: 'p1',
      name: 'One',
      snapshotId: 's',
      itemCount: 0,
      imageUrl: null,
      spotifyUrl: null,
      syncedAt: 1,
    },
    {
      id: 'p2',
      name: 'Two',
      snapshotId: 's',
      itemCount: 0,
      imageUrl: null,
      spotifyUrl: null,
      syncedAt: 1,
    },
  ],
  tracks: [
    track('fish1', 'Losing It', [{ id: 'a-fisher', name: 'Fisher' }]),
    track('amb1', 'Track A', [{ id: 'a-djx', name: 'DJ X' }]),
    track('amb2', 'Track A', [{ id: 'a-djx', name: 'DJ X' }]),
    track('idtrk', 'ID', [{ id: 'a-id', name: 'ID' }]),
    track('lt1', 'Losing It', [{ id: 'a-someone', name: 'Someone' }]),
    track('spotify:local:z', 'Local Cut', [{ id: null, name: 'Local' }]),
  ],
  entries: [
    { playlistId: 'p1', position: 0, trackKey: 'fish1', addedAt: null },
    { playlistId: 'p2', position: 0, trackKey: 'fish1', addedAt: null },
    { playlistId: 'p1', position: 1, trackKey: 'amb1', addedAt: null },
  ],
  topItems: [],
  plays: [],
  features: [],
  artistIdentity: [],
  artistReach: [],
};

const model = buildModel(rows);

describe('libraryTitleIndex', () => {
  it('keys by cleanTitle/primaryArtist/normalize and skips locals and id-less', () => {
    const index = libraryTitleIndex(model);
    expect(index.get('losing it|fisher')).toEqual(['fish1']);
    expect(index.get('track a|dj x')).toEqual(['amb1', 'amb2']);
    // The local track is not indexed under any key.
    expect(index.get('local cut|local')).toBeUndefined();
  });

  it('memoises one entry on Model identity', () => {
    expect(libraryTitleIndex(model)).toBe(libraryTitleIndex(model));
    const other = buildModel(rows);
    expect(libraryTitleIndex(other)).not.toBe(libraryTitleIndex(model));
  });
});

describe('matchMixRow', () => {
  // Fetched inside each test, not at describe scope: the index is module-level
  // memoised state, and computing it per test keeps the tests order-independent.
  it('hits a unique library track and returns its playlist count', () => {
    const index = libraryTitleIndex(model);
    const m = matchMixRow(
      model,
      index,
      row({ artist: 'FISHER', title: 'Losing It' })
    );
    expect(m).toEqual({ trackId: 'fish1', playlistCount: 2 });
  });

  it('returns null for an ambiguous key (two ids)', () => {
    const index = libraryTitleIndex(model);
    expect(
      matchMixRow(model, index, row({ artist: 'DJ X', title: 'Track A' }))
    ).toBeNull();
  });

  it('returns null for a gap row and for ID / ? / unknown, with no lookup', () => {
    const index = libraryTitleIndex(model);
    expect(matchMixRow(model, index, row({ gap: true }))).toBeNull();
    // idtrk keys as `id|id`, so a lookup WOULD hit — the inert guard wins.
    expect(
      matchMixRow(model, index, row({ artist: 'ID', title: 'ID' }))
    ).toBeNull();
    expect(
      matchMixRow(model, index, row({ artist: '?', title: '?' }))
    ).toBeNull();
    expect(
      matchMixRow(model, index, row({ artist: 'Unknown', title: 'unknown' }))
    ).toBeNull();
  });

  it('peels a trailing [bracket] into the label, so a remix tag keys on the original title', () => {
    // 'Losing It [Ted Remix]' -> label 'Ted Remix', title 'Losing It'; the
    // peeled row keys `losing it|someone` and hits the un-remixed library track.
    const index = libraryTitleIndex(model);
    const m = matchMixRow(
      model,
      index,
      row({ artist: 'Someone', title: 'Losing It', label: 'Ted Remix' })
    );
    expect(m).toEqual({ trackId: 'lt1', playlistCount: 0 });
  });
});
