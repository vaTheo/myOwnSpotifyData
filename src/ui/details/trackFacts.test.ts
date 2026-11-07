import { describe, expect, it } from 'vitest';
import type {
  AllRows,
  ArtistRef,
  FeatureRow,
  PlayRow,
  PlaylistRow,
  TrackRow,
} from '../../db/schema';
import { buildModel } from '../../model/aggregate';
import { featureFor } from '../../model/features';
import { factsCache, trackFacts } from './trackFacts';

const daft = { id: 'daft', name: 'Daft Punk' };
const guest = { id: 'guest', name: 'Guest' };

function track(
  key: string,
  artists: ArtistRef[] = [daft],
  over: Partial<TrackRow> = {}
): TrackRow {
  const local = key.startsWith('spotify:local:');
  return {
    key,
    id: local ? null : key,
    uri: local ? key : `spotify:track:${key}`,
    name: `Song ${key}`,
    artists,
    album: 'Album',
    durationMs: 200_000,
    isrc: null,
    spotifyUrl: local ? null : `https://open.spotify.com/track/${key}`,
    isLocal: local,
    ...over,
  };
}

function playlist(id: string, name = id): PlaylistRow {
  return {
    id,
    name,
    snapshotId: 's',
    itemCount: 0,
    imageUrl: null,
    spotifyUrl: null,
    syncedAt: 1,
  };
}

function play(trackId: string, over: Partial<PlayRow> = {}): PlayRow {
  return {
    trackId,
    plays: 5,
    msPlayed: 600_000,
    firstTs: '2024-01-02T10:00:00Z',
    lastTs: '2026-03-04T10:00:00Z',
    trackName: `Song ${trackId}`,
    artistName: 'Daft Punk',
    months: { '2024-01': 2, '2026-03': 3 },
    attempts: 9,
    finished: 4,
    skipped: 3,
    ...over,
  };
}

function rows(over: Partial<AllRows> = {}): AllRows {
  return {
    playlists: [playlist('p1', 'Warm up'), playlist('p2', 'Peak')],
    tracks: [
      track('t1', [daft, guest]),
      track('t2'),
      track('spotify:local:x', [{ id: null, name: 'Local Hero' }]),
      // The history knows this one under another id (a relink).
      track('t4', [daft], { name: 'Relinked' }),
    ],
    entries: [
      { playlistId: 'p1', position: 0, trackKey: 't1', addedAt: null },
      { playlistId: 'p1', position: 1, trackKey: 't2', addedAt: null },
      { playlistId: 'p1', position: 2, trackKey: 't1', addedAt: null },
      { playlistId: 'p2', position: 0, trackKey: 't1', addedAt: null },
      {
        playlistId: 'p2',
        position: 1,
        trackKey: 'spotify:local:x',
        addedAt: null,
      },
      { playlistId: 'p2', position: 2, trackKey: 't4', addedAt: null },
    ],
    topItems: [
      {
        key: 'tracks:short_term',
        type: 'tracks',
        period: 'short_term',
        fetchedAt: 1,
        items: [
          {
            rank: 1,
            id: 'top-only',
            name: 'Top Only',
            artists: [guest],
            album: 'Top Album',
            imageUrl: null,
            spotifyUrl: 'https://open.spotify.com/track/top-only',
          },
        ],
      },
    ],
    plays: [
      play('t1'),
      play('old-id', { trackName: 'Relinked', plays: 7, months: undefined }),
      play('history-only', {
        trackName: 'Gone Song',
        artistName: 'Daft Punk',
        attempts: undefined,
        finished: undefined,
        skipped: undefined,
      }),
    ],
    features: [],
    artistIdentity: [],
    artistReach: [],
    ...over,
  };
}

const rb = (over: Partial<FeatureRow['rekordbox']> = {}) => ({
  bpm: 124,
  key: 9,
  major: false,
  energy: 0.7,
  fetchedAt: 100,
  matchedBy: 'title-artist' as const,
  rbTitle: 'x',
  rbArtist: 'y',
  ...over,
});

const recco = (over: object = {}) => ({
  bpm: 128,
  key: 2,
  major: true,
  energy: 0.4,
  fetchedAt: 200,
  ...over,
});

describe('trackFacts', () => {
  it('finds a track by its id', () => {
    const facts = trackFacts(buildModel(rows()), { trackId: 't1' });
    expect(facts?.title).toBe('Song t1');
    expect(facts?.album).toBe('Album');
    expect(facts?.durationMs).toBe(200_000);
    expect(facts?.spotifyUrl).toBe('https://open.spotify.com/track/t1');
    expect(facts?.isLocal).toBe(false);
  });

  it('finds a track by playlist and position', () => {
    const facts = trackFacts(buildModel(rows()), {
      playlistId: 'p1',
      position: 1,
    });
    expect(facts?.title).toBe('Song t2');
  });

  it('finds a track by its play row', () => {
    const facts = trackFacts(buildModel(rows()), { playRowId: 'history-only' });
    expect(facts?.title).toBe('Gone Song');
    expect(facts?.artists).toEqual([{ name: 'Daft Punk', artistKey: 'daft' }]);
    expect(facts?.album).toBeNull();
    expect(facts?.durationMs).toBeNull();
    expect(facts?.spotifyUrl).toBe(
      'https://open.spotify.com/track/history-only'
    );
    expect(facts?.plays?.plays).toBe(5);
    expect(facts?.plays?.attempts).toBeNull();
    expect(facts?.plays?.unclear).toBeNull();
  });

  it('finds a top track that is in no playlist', () => {
    const facts = trackFacts(buildModel(rows()), { trackId: 'top-only' });
    expect(facts?.title).toBe('Top Only');
    expect(facts?.album).toBe('Top Album');
    expect(facts?.playlists).toEqual([]);
  });

  it('gives null for an unknown or stale reference', () => {
    const m = buildModel(rows());
    expect(trackFacts(m, { trackId: 'nope' })).toBeNull();
    expect(trackFacts(m, { playlistId: 'p1', position: 9 })).toBeNull();
    expect(trackFacts(m, { playlistId: 'gone', position: 0 })).toBeNull();
    expect(trackFacts(m, { playRowId: 'nope' })).toBeNull();
  });

  it('links an artist only when saved', () => {
    const facts = trackFacts(buildModel(rows()), { trackId: 't1' });
    expect(facts?.artists).toEqual([
      { name: 'Daft Punk', artistKey: 'daft' },
      { name: 'Guest', artistKey: 'guest' },
    ]);
    const top = trackFacts(buildModel(rows({ tracks: [track('t2')] })), {
      trackId: 'top-only',
    });
    expect(top?.artists).toEqual([{ name: 'Guest', artistKey: null }]);
  });

  it('marks a local file, with no Spotify link', () => {
    const facts = trackFacts(buildModel(rows()), {
      playlistId: 'p2',
      position: 1,
    });
    expect(facts?.isLocal).toBe(true);
    expect(facts?.spotifyUrl).toBeNull();
    expect(facts?.audio).toBeNull();
    expect(facts?.artists).toEqual([
      { name: 'Local Hero', artistKey: 'name:local hero' },
    ]);
  });

  it('reads energy from the source row that resolveFeature picks', () => {
    const both: FeatureRow = {
      trackId: 't1',
      isrc: null,
      rekordbox: rb(),
      reccobeats: recco(),
      updatedAt: 1,
    };
    const m = buildModel(rows({ features: [both] }));
    const facts = trackFacts(m, { trackId: 't1' });
    expect(featureFor(m, 't1')?.source).toBe('rekordbox');
    expect(facts?.audio).toEqual({
      bpm: 124,
      key: 9,
      major: false,
      energy: 0.7,
      source: 'rekordbox',
      fetchedAt: 100,
    });
  });

  it('takes ReccoBeats energy when ReccoBeats is the source', () => {
    const row: FeatureRow = {
      trackId: 't1',
      isrc: null,
      rekordbox: rb({ bpm: null, key: null, major: null, energy: 0.9 }),
      reccobeats: recco(),
      updatedAt: 1,
    };
    const facts = trackFacts(buildModel(rows({ features: [row] })), {
      trackId: 't1',
    });
    expect(facts?.audio?.source).toBe('reccobeats');
    expect(facts?.audio?.energy).toBe(0.4);
    expect(facts?.audio?.fetchedAt).toBe(200);
    expect(facts?.audio?.bpm).toBe(128);
  });

  it('has no audio for a ReccoBeats miss', () => {
    const row: FeatureRow = {
      trackId: 't1',
      isrc: null,
      reccobeats: { notFound: true, checkedAt: 1 },
      updatedAt: 1,
    };
    const facts = trackFacts(buildModel(rows({ features: [row] })), {
      trackId: 't1',
    });
    expect(facts?.audio).toBeNull();
  });

  it('has null plays before an import', () => {
    const facts = trackFacts(buildModel(rows({ plays: [] })), {
      trackId: 't1',
    });
    expect(facts?.plays).toBeNull();
    expect(facts?.months).toBeNull();
    expect(facts?.peakMonth).toBeNull();
  });

  it('gives the plays of the id row, with its outcomes', () => {
    const facts = trackFacts(buildModel(rows()), { trackId: 't1' });
    expect(facts?.plays).toEqual({
      plays: 5,
      byName: false,
      msPlayed: 600_000,
      firstTs: '2024-01-02T10:00:00Z',
      lastTs: '2026-03-04T10:00:00Z',
      attempts: 9,
      finished: 4,
      skipped: 3,
      unclear: 2,
    });
    expect(facts?.months).toEqual({ '2024-01': 2, '2026-03': 3 });
    expect(facts?.peakMonth).toBe('2026-03');
  });

  it('counts by artist and title when the id has no play, as the column does', () => {
    const facts = trackFacts(buildModel(rows()), { trackId: 't4' });
    expect(facts?.plays?.plays).toBe(7);
    expect(facts?.plays?.byName).toBe(true);
    expect(facts?.months).toBeNull();
  });

  it('finds playlists by id, then by artist and title', () => {
    const m = buildModel(rows());
    expect(trackFacts(m, { trackId: 't1' })?.playlists).toEqual([
      { id: 'p1', name: 'Warm up' },
      { id: 'p2', name: 'Peak' },
    ]);
    // The play row's id is in no playlist; its artist and title are.
    expect(trackFacts(m, { playRowId: 'old-id' })?.playlists).toEqual([
      { id: 'p2', name: 'Peak' },
    ]);
  });
});

describe('factsCache (S13 A6)', () => {
  it('answers the same facts for the same model and an equal reference', () => {
    const m = buildModel(rows());
    const facts = factsCache();
    const first = facts(m, { trackId: 't1' });
    expect(first?.title).toBe('Song t1');
    expect(facts(m, { trackId: 't1' })).toBe(first);
  });

  it('works them out again for another reference or another model', () => {
    const m = buildModel(rows());
    const facts = factsCache();
    const first = facts(m, { playlistId: 'p1', position: 0 });
    expect(facts(m, { playlistId: 'p1', position: 1 })?.title).toBe('Song t2');
    const again = facts(buildModel(rows()), { playlistId: 'p1', position: 0 });
    expect(again).not.toBe(first);
    expect(again).toEqual(first);
  });
});
