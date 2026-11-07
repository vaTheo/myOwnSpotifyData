import { describe, expect, it } from 'vitest';
import type { AllRows, PlayRow, PlaylistRow, TrackRow } from '../db/schema';
import { buildModel } from './aggregate';
import { rarelyPlayed } from './rarelyPlayed';

const artist = { id: 'a', name: 'Artist' };

function track(key: string, over: Partial<TrackRow> = {}): TrackRow {
  return {
    key,
    id: key.startsWith('spotify:local:') ? null : key,
    uri: `spotify:track:${key}`,
    name: `Song ${key}`,
    artists: [artist],
    album: 'Album',
    durationMs: 1000,
    isrc: null,
    spotifyUrl: null,
    isLocal: key.startsWith('spotify:local:'),
    ...over,
  };
}

function playlist(id: string): PlaylistRow {
  return {
    id,
    name: id,
    snapshotId: 's',
    itemCount: 0,
    imageUrl: null,
    spotifyUrl: null,
    syncedAt: 1,
  };
}

function plays(trackId: string, n: number, over: Partial<PlayRow> = {}) {
  return {
    trackId,
    plays: n,
    msPlayed: n * 1000,
    firstTs: '2020-01-01T00:00:00Z',
    lastTs: '2020-01-02T00:00:00Z',
    trackName: null,
    artistName: null,
    ...over,
  } satisfies PlayRow;
}

const entry = (playlistId: string, trackKey: string, position = 0) => ({
  playlistId,
  position,
  trackKey,
  addedAt: null,
});

const rows: AllRows = {
  playlists: [playlist('p1'), playlist('p2')],
  tracks: [
    track('never'),
    track('one'),
    track('two'),
    track('three'),
    track('four'),
    track('shared'),
    track('zeroRow'),
    track('byName', { id: 'byName', name: 'Same Name' }),
    track('spotify:local:x'),
  ],
  entries: [
    entry('p1', 'never'),
    entry('p1', 'one', 1),
    entry('p1', 'two', 2),
    entry('p1', 'three', 3),
    entry('p1', 'four', 4),
    entry('p1', 'shared', 5),
    entry('p2', 'shared'),
    entry('p2', 'zeroRow', 1),
    entry('p2', 'byName', 2),
    entry('p2', 'spotify:local:x', 3),
  ],
  topItems: [],
  plays: [
    plays('one', 1),
    plays('two', 2),
    plays('three', 3),
    plays('four', 4),
    plays('shared', 1),
    plays('zeroRow', 0),
    // A relinked id: the history knows the song by artist and title.
    plays('other-id', 2, { trackName: 'Same Name', artistName: 'Artist' }),
  ],
  features: [],
  artistIdentity: [],
  artistReach: [],
} as unknown as AllRows;

const model = buildModel(rows);
const keys = (counts: number[], playlistId: string | null = null) =>
  rarelyPlayed(model, new Set(counts), playlistId).map((i) => i.track.key);

describe('rarelyPlayed', () => {
  it('lists the songs with no play at all', () => {
    expect(keys([0])).toEqual(['never', 'zeroRow']);
  });

  it('lists exactly the chosen counts, 4 plays never', () => {
    expect(keys([1])).toEqual(['one', 'shared']);
    expect(keys([2])).toEqual(['two', 'byName']);
    expect(keys([3])).toEqual(['three']);
    expect(keys([0, 1, 2, 3])).not.toContain('four');
  });

  it('puts the fewest plays first', () => {
    const plays = rarelyPlayed(model, new Set([0, 1, 2, 3]), null).map(
      (i) => i.plays
    );
    expect(plays).toEqual([...plays].sort((a, b) => a - b));
  });

  it('counts a song by artist and title when its id has no row', () => {
    const item = rarelyPlayed(model, new Set([2]), null).find(
      (i) => i.track.key === 'byName'
    );
    expect(item?.plays).toBe(2);
  });

  it('lists a song in two playlists once, naming both', () => {
    const items = rarelyPlayed(model, new Set([1]), null);
    expect(items.filter((i) => i.track.key === 'shared')).toHaveLength(1);
    expect(items.find((i) => i.track.key === 'shared')?.playlistIds).toEqual([
      'p1',
      'p2',
    ]);
  });

  it('limits to one playlist and keeps every playlist of a song', () => {
    expect(keys([1], 'p2')).toEqual(['shared']);
    const only = rarelyPlayed(model, new Set([1]), 'p2');
    expect(only[0].playlistIds).toEqual(['p1', 'p2']);
    expect(keys([0], 'p1')).toEqual(['never']);
  });

  it('leaves out a local file the history gave no count', () => {
    expect(keys([0])).not.toContain('spotify:local:x');
  });

  it('builds a play row for a song the history never mentions', () => {
    const item = rarelyPlayed(model, new Set([0]), null)[0];
    expect(item.row).toMatchObject({
      trackId: 'never',
      plays: 0,
      trackName: 'Song never',
      artistName: 'Artist',
    });
  });

  it('is empty for no counts', () => {
    expect(keys([])).toEqual([]);
  });
});
