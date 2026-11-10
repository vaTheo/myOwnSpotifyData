import { describe, expect, it } from 'vitest';
import type { AllRows, MixRow } from '../db/schema';
import {
  DATASETS,
  batches,
  compareStamps,
  datasetByName,
  mixStampView,
  planMixes,
  rowKey,
  type Metas,
} from './datasets';

function emptyRows(over: Partial<AllRows> = {}): AllRows {
  return {
    playlists: [],
    tracks: [],
    entries: [],
    topItems: [],
    plays: [],
    features: [],
    artistIdentity: [],
    artistReach: [],
    ...over,
  };
}

const REKORDBOX = {
  importedAt: 400,
  parsed: 0,
  withBpm: 0,
  withKey: 0,
  matched: 0,
  unmatched: 0,
};

function mix(url: string, savedAt: number): MixRow {
  return {
    url,
    title: null,
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

describe('DATASETS', () => {
  it('names the four replace-whole datasets with their stores', () => {
    expect(DATASETS.map((d) => d.name)).toEqual([
      'library',
      'history',
      'features',
      'reach',
    ]);
    expect(datasetByName('library').stores).toEqual([
      'playlists',
      'tracks',
      'entries',
      'topItems',
    ]);
    expect(datasetByName('history').stores).toEqual(['plays']);
    expect(datasetByName('features').stores).toEqual(['features']);
    expect(datasetByName('reach').stores).toEqual([
      'artistIdentity',
      'artistReach',
    ]);
  });

  it('stamps: library from lastSyncAt, history from a version-2 summary, reach from ranAt, features from the newest row', () => {
    const metas: Metas = {
      lastSyncAt: 100,
      historySummary: { version: 2, importedAt: 200 },
      artistReachSummary: { version: 1, ranAt: 300 },
      rekordboxSummary: REKORDBOX,
    };
    const rows = emptyRows({
      features: [
        { trackId: 'a', isrc: null, updatedAt: 10 },
        { trackId: 'b', isrc: null, updatedAt: 50 },
      ],
    });
    expect(datasetByName('library').stamp(rows, metas)).toBe(100);
    expect(datasetByName('history').stamp(rows, metas)).toBe(200);
    expect(datasetByName('reach').stamp(rows, metas)).toBe(300);
    expect(datasetByName('features').stamp(rows, metas)).toBe(50);
  });

  it('stamps are null when the data is absent or the summary is an older version', () => {
    const rows = emptyRows();
    expect(datasetByName('library').stamp(rows, {})).toBeNull();
    expect(
      datasetByName('history').stamp(rows, {
        historySummary: { importedAt: 5 },
      })
    ).toBeNull();
    expect(datasetByName('reach').stamp(rows, {})).toBeNull();
    expect(datasetByName('features').stamp(rows, {})).toBeNull();
  });

  it('summaries: history and reach carry theirs, features the rekordbox one, library none', () => {
    const metas: Metas = {
      historySummary: { version: 2, importedAt: 200 },
      artistReachSummary: { version: 1, ranAt: 300 },
      rekordboxSummary: REKORDBOX,
    };
    expect(datasetByName('history').summary(metas)).toEqual({
      version: 2,
      importedAt: 200,
    });
    expect(datasetByName('reach').summary(metas)).toEqual({
      version: 1,
      ranAt: 300,
    });
    expect(datasetByName('features').summary(metas)).toEqual(REKORDBOX);
    expect(datasetByName('library').summary(metas)).toBeNull();
  });
});

describe('rowKey', () => {
  it('serialises entries as playlistId#position (no NUL: Postgres refuses it in JSON) and every other store as its keyPath', () => {
    expect(rowKey('entries', { playlistId: 'p1', position: 7 })).toBe('p1#7');
    expect(rowKey('playlists', { id: 'p1' })).toBe('p1');
    expect(rowKey('tracks', { key: 'spotify:local:x' })).toBe(
      'spotify:local:x'
    );
    expect(rowKey('topItems', { key: 'tracks:short_term' })).toBe(
      'tracks:short_term'
    );
    expect(rowKey('plays', { trackId: 't1' })).toBe('t1');
    expect(rowKey('features', { trackId: 't1' })).toBe('t1');
    expect(rowKey('artistIdentity', { artistId: 'a1' })).toBe('a1');
    expect(rowKey('artistReach', { key: 'a1|deezer' })).toBe('a1|deezer');
  });
});

describe('compareStamps', () => {
  it('push when local is newer or the server has nothing', () => {
    expect(compareStamps(10, 5)).toBe('push');
    expect(compareStamps(10, null)).toBe('push');
  });
  it('pull when the server is newer or local has nothing', () => {
    expect(compareStamps(5, 10)).toBe('pull');
    expect(compareStamps(null, 10)).toBe('pull');
  });
  it('same when equal or both absent', () => {
    expect(compareStamps(7, 7)).toBe('same');
    expect(compareStamps(null, null)).toBe('same');
  });
});

describe('batches', () => {
  it('cuts 500 by default, the last one shorter, nothing for nothing', () => {
    const rows = Array.from({ length: 1201 }, (_, i) => i);
    const out = batches(rows);
    expect(out.map((b) => b.length)).toEqual([500, 500, 201]);
    expect(out[2][200]).toBe(1200);
    expect(batches([])).toEqual([]);
    expect(batches([1, 2, 3], 2).map((b) => b.length)).toEqual([2, 1]);
  });
});

describe('planMixes', () => {
  it('pushes a local mix the server lacks or holds older, pulls a newer server one, leaves equal alone', () => {
    const plan = planMixes(
      [mix('a', 10), mix('b', 10), mix('c', 10), mix('d', 10)],
      [
        { url: 'b', savedAt: 5, deletedAt: null },
        { url: 'c', savedAt: 20, deletedAt: null },
        { url: 'd', savedAt: 10, deletedAt: null },
        { url: 'e', savedAt: 3, deletedAt: null },
      ],
      []
    );
    expect(plan.push.map((m) => m.url)).toEqual(['a', 'b']);
    expect(plan.pull).toEqual(['c', 'e']);
    expect(plan.deleteLocal).toEqual([]);
    expect(plan.tombstones).toEqual([]);
  });

  it('a server tombstone newer than the local save deletes locally; older is overridden by a push', () => {
    const plan = planMixes(
      [mix('gone', 10), mix('kept', 30)],
      [
        { url: 'gone', savedAt: 10, deletedAt: 20 },
        { url: 'kept', savedAt: 10, deletedAt: 20 },
      ],
      []
    );
    expect(plan.deleteLocal).toEqual(['gone']);
    expect(plan.push.map((m) => m.url)).toEqual(['kept']);
    expect(plan.pull).toEqual([]);
  });

  it('a local deletion newer than the server row becomes a tombstone; older yields to the server row', () => {
    const plan = planMixes(
      [],
      [
        { url: 'x', savedAt: 10, deletedAt: null },
        { url: 'y', savedAt: 50, deletedAt: null },
        { url: 'z', savedAt: 10, deletedAt: 60 },
      ],
      [
        { url: 'x', deletedAt: 20 },
        { url: 'y', deletedAt: 20 },
        { url: 'z', deletedAt: 70 },
        { url: 'never-synced', deletedAt: 5 },
      ]
    );
    expect(plan.tombstones).toEqual([
      { url: 'x', deletedAt: 20 },
      { url: 'never-synced', deletedAt: 5 },
    ]);
    expect(plan.pull).toEqual(['y']);
    expect(plan.deleteLocal).toEqual([]);
  });

  it('both sides newer for different urls: both lists filled, each mix whole', () => {
    const plan = planMixes(
      [mix('a', 30), mix('b', 10)],
      [
        { url: 'a', savedAt: 20, deletedAt: null },
        { url: 'b', savedAt: 40, deletedAt: null },
      ],
      []
    );
    expect(plan.push.map((m) => m.url)).toEqual(['a']);
    expect(plan.pull).toEqual(['b']);
  });
});

describe('mixStampView (round 025)', () => {
  const m = (url: string, savedAt: number) => ({ url, savedAt }) as MixRow;

  it('Here is the newest save or deletion on this device; Server and Rows as last read', () => {
    expect(
      mixStampView([m('a', 10), m('b', 30)], [{ url: 'c', deletedAt: 20 }], {
        newestAt: 30,
        rows: 2,
      })
    ).toEqual({ name: 'mixes', localAt: 30, serverAt: 30, rows: 2 });
    expect(
      mixStampView([m('a', 10)], [{ url: 'c', deletedAt: 20 }], undefined)
    ).toEqual({ name: 'mixes', localAt: 20, serverAt: null, rows: null });
  });

  it('a deletion already sent still counts in Here', () => {
    expect(
      mixStampView([m('a', 10)], [], { newestAt: 40, rows: 1, deletedHereAt: 40 })
    ).toEqual({ name: 'mixes', localAt: 40, serverAt: 40, rows: 1 });
  });

  it('nothing here and an empty server: empty marks, zero rows', () => {
    expect(mixStampView([], [], { newestAt: null, rows: 0 })).toEqual({
      name: 'mixes',
      localAt: null,
      serverAt: null,
      rows: 0,
    });
  });
});
