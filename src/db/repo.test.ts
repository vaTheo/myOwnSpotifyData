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
  putIdentities,
  putMeta,
  putReach,
  putTopItems,
  replacePlays,
  replacePlaylist,
  wipeDb,
} from './repo';
import { DB_NAME, DB_VERSION, reachKey } from './schema';
import type {
  ArtistIdentityRow,
  ArtistReachRow,
  EntryRow,
  FeatureRow,
  PlaylistRow,
  ReachSource,
  TrackRow,
} from './schema';

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

function identity(
  artistId: string,
  over: Partial<ArtistIdentityRow> = {}
): ArtistIdentityRow {
  return {
    artistId,
    name: `Artist ${artistId}`,
    mbid: `mbid-${artistId}`,
    mbidStatus: 'ok',
    qid: 'Q1',
    qidStatus: 'ok',
    qidCheckedAt: 1000,
    sitelinks: 3,
    wikiTitles: { en: 'Some_Artist', fr: null },
    deezerArtistId: 42,
    deezerName: `Artist ${artistId}`,
    deezerStatus: 'ok',
    resolvedAt: 1000,
    retryAfter: null,
    ...over,
  };
}

function reachRow(
  artistId: string,
  source: ReachSource,
  over: Partial<ArtistReachRow> = {}
): ArtistReachRow {
  return {
    key: reachKey(artistId, source),
    artistId,
    source,
    status: 'ok',
    value: 5051,
    extra: { listens: 69448 },
    fetchedAt: 2000,
    retryAfter: null,
    sourceUrl: `https://example.test/${source}/${artistId}`,
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

/** The seven stores of version 2: version 1 plus `features`. */
const V2_STORES: [string, string | string[]][] = [
  ...V1_STORES,
  ['features', 'trackId'],
];

/** Opens the database at an old version with exactly the stores it had. */
function openAt(
  version: number,
  stores: [string, string | string[]][]
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, version);
    req.onupgradeneeded = () => {
      for (const [name, keyPath] of stores) {
        req.result.createObjectStore(name, { keyPath });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function putLegacyRow(
  db: IDBDatabase,
  store: string,
  row: object
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(row);
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

describe('artist identity and reach', () => {
  it('round-trips identity rows and replaces them by artist id', async () => {
    await putIdentities([identity('a1'), identity('a2')]);
    await putIdentities([
      identity('a2', {
        mbid: null,
        mbidStatus: 'retryLater',
        retryAfter: 5000,
        resolvedAt: 3000,
      }),
    ]);
    const stored = (await getAllRows()).artistIdentity.sort((a, b) =>
      a.artistId.localeCompare(b.artistId)
    );
    expect(stored.map((r) => r.artistId)).toEqual(['a1', 'a2']);
    expect(stored[0]).toEqual(identity('a1'));
    expect(stored[1].mbidStatus).toBe('retryLater');
    expect(stored[1].retryAfter).toBe(5000);
    expect(stored[1].qidCheckedAt).toBe(1000);
  });

  it('round-trips reach rows keyed by artist and source', async () => {
    await putReach([
      reachRow('a1', 'listenbrainz'),
      reachRow('a1', 'deezer', { value: 13984, extra: undefined }),
    ]);
    await putReach([
      reachRow('a1', 'listenbrainz', { value: 5100, fetchedAt: 2500 }),
    ]);
    const stored = (await getAllRows()).artistReach.sort((a, b) =>
      a.key.localeCompare(b.key)
    );
    expect(stored.map((r) => r.key)).toEqual(['a1|deezer', 'a1|listenbrainz']);
    expect(stored[0].value).toBe(13984);
    expect(stored[1].value).toBe(5100);
    expect(stored[1].extra).toEqual({ listens: 69448 });
  });

  it('accepts empty batches', async () => {
    await expect(putIdentities([])).resolves.toBeUndefined();
    await expect(putReach([])).resolves.toBeUndefined();
    const rows = await getAllRows();
    expect(rows.artistIdentity).toEqual([]);
    expect(rows.artistReach).toEqual([]);
  });
});

describe('migration', () => {
  it('upgrades a version 1 database, keeping its rows and adding features', async () => {
    const v1 = await openAt(1, V1_STORES);
    await putLegacyRow(v1, 'playlists', playlist('p1'));
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

  it('upgrades a version 2 database, keeping its rows and adding the two reach stores', async () => {
    const v2 = await openAt(2, V2_STORES);
    await putLegacyRow(v2, 'playlists', playlist('p1'));
    await putLegacyRow(v2, 'tracks', track('t1'));
    await putLegacyRow(v2, 'features', feature('t1'));
    v2.close();
    const rows = await getAllRows();
    expect(rows.playlists).toEqual([playlist('p1')]);
    expect(rows.tracks).toEqual([track('t1')]);
    expect(rows.features).toEqual([feature('t1')]);
    expect(rows.artistIdentity).toEqual([]);
    expect(rows.artistReach).toEqual([]);
    const db = await openDb();
    expect(db.version).toBe(DB_VERSION);
    expect(db.objectStoreNames.contains('artistIdentity')).toBe(true);
    expect(db.objectStoreNames.contains('artistReach')).toBe(true);
    await putIdentities([identity('a1')]);
    await putReach([reachRow('a1', 'listenbrainz')]);
    const after = await getAllRows();
    expect(after.artistIdentity).toEqual([identity('a1')]);
    expect(after.artistReach).toEqual([reachRow('a1', 'listenbrainz')]);
  });
});
