import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  deletePlaylists,
  getAllRows,
  getFeatures,
  getMeta,
  getPlaylists,
  openDb,
  putFeatures,
  putMeta,
  putTopItems,
  replacePlays,
  replacePlaylist,
  wipeDb,
} from './repo';
import { DB_NAME, DB_VERSION } from './schema';
import type { EntryRow, FeatureRow, PlaylistRow, TrackRow } from './schema';

function playlist(id: string, snapshotId = 's1'): PlaylistRow {
  return {
    id,
    name: `Playlist ${id}`,
    snapshotId,
    itemCount: 2,
    imageUrl: null,
    spotifyUrl: null,
    syncedAt: 1,
  };
}

function track(key: string): TrackRow {
  return {
    key,
    id: key,
    uri: `spotify:track:${key}`,
    name: `Track ${key}`,
    artists: [{ id: 'a1', name: 'Artist' }],
    album: 'Album',
    durationMs: 1000,
    isrc: null,
    spotifyUrl: null,
    isLocal: false,
  };
}

function entries(playlistId: string, keys: string[]): EntryRow[] {
  return keys.map((trackKey, position) => ({
    playlistId,
    position,
    trackKey,
    addedAt: null,
  }));
}

function feature(trackId: string, over: Partial<FeatureRow> = {}): FeatureRow {
  return {
    trackId,
    isrc: `ISRC${trackId}`,
    reccobeats: { bpm: 128, key: 9, major: false, energy: 0.8, fetchedAt: 10 },
    updatedAt: 20,
    ...over,
  };
}

/** The six stores of version 1, with the key paths that shipped. */
const V1_STORES: [string, string | string[]][] = [
  ['playlists', 'id'],
  ['tracks', 'key'],
  ['entries', ['playlistId', 'position']],
  ['topItems', 'key'],
  ['plays', 'trackId'],
  ['meta', 'name'],
];

function openV1(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      for (const [name, keyPath] of V1_STORES) {
        req.result.createObjectStore(name, { keyPath });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function putV1Playlist(db: IDBDatabase, row: PlaylistRow): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('playlists', 'readwrite');
    tx.objectStore('playlists').put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

beforeEach(async () => {
  await wipeDb();
});

describe('replacePlaylist', () => {
  it('writes playlist, tracks and entries', async () => {
    await replacePlaylist(
      playlist('p1'),
      [track('t1'), track('t2')],
      entries('p1', ['t1', 't2'])
    );
    const rows = await getAllRows();
    expect(rows.playlists.map((p) => p.id)).toEqual(['p1']);
    expect(rows.tracks.map((t) => t.key).sort()).toEqual(['t1', 't2']);
    expect(rows.entries.map((e) => e.trackKey)).toEqual(['t1', 't2']);
  });

  it('replaces the old entries of the same playlist and keeps other playlists', async () => {
    await replacePlaylist(
      playlist('p1'),
      [track('t1'), track('t2'), track('t3')],
      entries('p1', ['t1', 't2', 't3'])
    );
    await replacePlaylist(playlist('p2'), [track('t9')], entries('p2', ['t9']));
    await replacePlaylist(
      playlist('p1', 's2'),
      [track('t2')],
      entries('p1', ['t2'])
    );
    const rows = await getAllRows();
    expect(
      rows.entries.map((e) => `${e.playlistId}:${e.position}:${e.trackKey}`)
    ).toEqual(['p1:0:t2', 'p2:0:t9']);
    expect(rows.playlists.find((p) => p.id === 'p1')?.snapshotId).toBe('s2');
  });

  it('getPlaylists lists only playlist rows', async () => {
    await replacePlaylist(playlist('p1'), [track('t1')], entries('p1', ['t1']));
    await expect(getPlaylists()).resolves.toEqual([playlist('p1')]);
  });
});

describe('deletePlaylists', () => {
  it('removes the playlist rows and their entries only', async () => {
    await replacePlaylist(playlist('p1'), [track('t1')], entries('p1', ['t1']));
    await replacePlaylist(playlist('p2'), [track('t2')], entries('p2', ['t2']));
    await deletePlaylists(['p1']);
    const rows = await getAllRows();
    expect(rows.playlists.map((p) => p.id)).toEqual(['p2']);
    expect(rows.entries.map((e) => e.playlistId)).toEqual(['p2']);
    await expect(deletePlaylists([])).resolves.toBeUndefined();
  });
});

describe('top items, plays and meta', () => {
  it('stores top lists by key', async () => {
    await putTopItems({
      key: 'tracks:short_term',
      type: 'tracks',
      period: 'short_term',
      fetchedAt: 5,
      items: [],
    });
    await putTopItems({
      key: 'tracks:short_term',
      type: 'tracks',
      period: 'short_term',
      fetchedAt: 6,
      items: [],
    });
    const rows = await getAllRows();
    expect(rows.topItems).toHaveLength(1);
    expect(rows.topItems[0].fetchedAt).toBe(6);
  });

  it('replacePlays clears the previous import', async () => {
    const row = (trackId: string) => ({
      trackId,
      plays: 1,
      msPlayed: 40000,
      firstTs: '2020-01-01T00:00:00Z',
      lastTs: '2020-01-01T00:00:00Z',
      trackName: null,
      artistName: null,
    });
    await replacePlays([row('a'), row('b')]);
    await replacePlays([row('c')]);
    const rows = await getAllRows();
    expect(rows.plays.map((p) => p.trackId)).toEqual(['c']);
  });

  it('round-trips meta values and returns undefined when absent', async () => {
    await expect(getMeta('accountId')).resolves.toBeUndefined();
    await putMeta('accountId', 'me');
    await putMeta('syncState', { status: 'idle' });
    await expect(getMeta<string>('accountId')).resolves.toBe('me');
    await expect(getMeta('syncState')).resolves.toEqual({ status: 'idle' });
  });

  it('wipeDb empties everything', async () => {
    await putMeta('accountId', 'me');
    await wipeDb();
    await expect(getMeta('accountId')).resolves.toBeUndefined();
  });

  it('wipeDb rejects while another tab holds the database open, then succeeds once it closes', async () => {
    const other = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await expect(wipeDb(50)).rejects.toThrow(/another tab/);
    other.close();
    await expect(wipeDb()).resolves.toBeUndefined();
  });
});

describe('features', () => {
  it('round-trips feature rows and replaces them by track id', async () => {
    await putFeatures([feature('t1'), feature('t2')]);
    await putFeatures([
      feature('t2', {
        reccobeats: { notFound: true, checkedAt: 30 },
        updatedAt: 31,
      }),
    ]);
    const stored = (await getFeatures()).sort((a, b) =>
      a.trackId.localeCompare(b.trackId)
    );
    expect(stored.map((f) => f.trackId)).toEqual(['t1', 't2']);
    expect(stored[0]).toEqual(feature('t1'));
    expect(stored[1].reccobeats).toEqual({ notFound: true, checkedAt: 30 });
    expect((await getAllRows()).features).toHaveLength(2);
  });

  it('accepts an empty batch', async () => {
    await expect(putFeatures([])).resolves.toBeUndefined();
    await expect(getFeatures()).resolves.toEqual([]);
  });
});

describe('migration', () => {
  it('upgrades a version 1 database, keeping its rows and adding features', async () => {
    const v1 = await openV1();
    await putV1Playlist(v1, playlist('p1'));
    v1.close();
    const rows = await getAllRows();
    expect(rows.playlists).toEqual([playlist('p1')]);
    expect(rows.features).toEqual([]);
    const db = await openDb();
    expect(db.version).toBe(DB_VERSION);
    expect(db.objectStoreNames.contains('features')).toBe(true);
    await putFeatures([feature('t1')]);
    await expect(getFeatures()).resolves.toEqual([feature('t1')]);
  });
});
