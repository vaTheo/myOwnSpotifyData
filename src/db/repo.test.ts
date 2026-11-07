import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeDb,
  deleteMeta,
  deleteMix,
  deletePlaylists,
  getAllRows,
  getFeatures,
  getMeta,
  getMixes,
  getPlaylists,
  openDb,
  putFeatures,
  putIdentities,
  putMeta,
  putMix,
  putReach,
  putTopItems,
  clearMixDeleted,
  getMixDeleted,
  replaceDataset,
  replacePlaylist,
  replacePlays,
  setDbEvents,
  wipeDb,
} from './repo';
import { setScopeForTests } from '../server/scopeBrowser';
import { ACTIVE_KEY, DEVICE_OWNER_KEY } from '../server/userScope';
import { DB_NAME, DB_VERSION, MIX_JOBS_META, reachKey } from './schema';
import type {
  ArtistIdentityRow,
  ArtistReachRow,
  EntryRow,
  FeatureRow,
  MixJobs,
  MixRow,
  PlayRow,
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

function mix(url: string, over: Partial<MixRow> = {}): MixRow {
  return {
    url,
    title: 'Some Mix by DJ',
    author: 'DJ',
    playerSrc: 'https://w.soundcloud.com/player/?url=x',
    slug: 'some-mix',
    sources: {
      trackid: true,
      description: false,
      pasted: false,
      linkOut: null,
    },
    rows: [
      {
        startSec: 0,
        endSec: 120,
        artist: 'A',
        title: 'B',
        label: null,
        source: 'trackid',
        gap: false,
        detected: { artist: 'A', title: 'B' },
        referenceCount: 3,
      },
    ],
    savedAt: 1000,
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

/** The nine stores of version 3: version 2 plus the two reach stores. */
const V3_STORES: [string, string | string[]][] = [
  ...V2_STORES,
  ['artistIdentity', 'artistId'],
  ['artistReach', 'key'],
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

describe('mixes', () => {
  it('round-trips mix rows and replaces them by url', async () => {
    await putMix(mix('https://soundcloud.com/u/one'));
    await putMix(mix('https://soundcloud.com/u/two', { title: 'Two' }));
    const stored = (await getMixes()).sort((a, b) =>
      a.url.localeCompare(b.url)
    );
    expect(stored.map((m) => m.url)).toEqual([
      'https://soundcloud.com/u/one',
      'https://soundcloud.com/u/two',
    ]);
    expect(stored[0]).toEqual(mix('https://soundcloud.com/u/one'));
    // A second put under the same url replaces rather than duplicates.
    await putMix(mix('https://soundcloud.com/u/one', { title: 'One again' }));
    const afterReplace = await getMixes();
    expect(afterReplace).toHaveLength(2);
    expect(
      afterReplace.find((m) => m.url === 'https://soundcloud.com/u/one')?.title
    ).toBe('One again');
    // deleteMix removes only the named row.
    await deleteMix('https://soundcloud.com/u/one');
    const afterDelete = await getMixes();
    expect(afterDelete.map((m) => m.url)).toEqual([
      'https://soundcloud.com/u/two',
    ]);
  });

  it('getMixes returns an empty array when the store is empty', async () => {
    await expect(getMixes()).resolves.toEqual([]);
  });
});

describe('database events', () => {
  it('reports a blocked upgrade, then opens once the old tab closes', async () => {
    const old = await openAt(2, V2_STORES);
    const blocked = vi.fn();
    setDbEvents({ blocked });
    const opening = openDb();
    await vi.waitFor(() => expect(blocked).toHaveBeenCalledTimes(1));
    old.close();
    const db = await opening;
    expect(db.version).toBe(DB_VERSION);
    expect(db.objectStoreNames.contains('artistReach')).toBe(true);
    setDbEvents({});
  });

  it('hands the database over when a newer version opens elsewhere', async () => {
    const superseded = vi.fn();
    setDbEvents({ superseded });
    await openDb();
    const newer = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION + 1);
      req.onblocked = () =>
        reject(new Error('the old connection was not closed'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    expect(superseded).toHaveBeenCalledTimes(1);
    expect(newer.version).toBe(DB_VERSION + 1);
    newer.close();
    setDbEvents({});
    // The superseded tab must not keep a cached connection around.
    await expect(closeDb()).resolves.toBeUndefined();
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

  it('upgrades a version 3 database, keeping its rows and adding the mixes store', async () => {
    const v3 = await openAt(3, V3_STORES);
    await putLegacyRow(v3, 'playlists', playlist('p1'));
    await putLegacyRow(v3, 'tracks', track('t1'));
    await putLegacyRow(v3, 'features', feature('t1'));
    await putLegacyRow(v3, 'artistIdentity', identity('a1'));
    await putLegacyRow(v3, 'artistReach', reachRow('a1', 'listenbrainz'));
    v3.close();
    const rows = await getAllRows();
    expect(rows.playlists).toEqual([playlist('p1')]);
    expect(rows.tracks).toEqual([track('t1')]);
    expect(rows.features).toEqual([feature('t1')]);
    expect(rows.artistIdentity).toEqual([identity('a1')]);
    expect(rows.artistReach).toEqual([reachRow('a1', 'listenbrainz')]);
    const db = await openDb();
    expect(db.version).toBe(DB_VERSION);
    expect(db.objectStoreNames.contains('mixes')).toBe(true);
    // The new store is reached through getMixes(), not getAllRows().
    await expect(getMixes()).resolves.toEqual([]);
    await putMix(mix('https://soundcloud.com/u/m'));
    await expect(getMixes()).resolves.toEqual([
      mix('https://soundcloud.com/u/m'),
    ]);
  });
});

describe('replaceDataset', () => {
  it('clears the stores, writes the rows and the metas in one transaction', async () => {
    await replacePlays([
      {
        trackId: 'old',
        plays: 1,
        msPlayed: 1,
        firstTs: 'a',
        lastTs: 'b',
        trackName: null,
        artistName: null,
      },
    ]);
    await putMeta('historySummary', { version: 1, importedAt: 1 });
    await replaceDataset(
      ['plays'],
      {
        plays: [
          {
            trackId: 'new',
            plays: 2,
            msPlayed: 2,
            firstTs: 'a',
            lastTs: 'b',
            trackName: null,
            artistName: null,
          },
        ],
      },
      { historySummary: { version: 2, importedAt: 99 } }
    );
    const rows = await getAllRows();
    expect(rows.plays.map((r) => r.trackId)).toEqual(['new']);
    expect(await getMeta('historySummary')).toEqual({
      version: 2,
      importedAt: 99,
    });
  });

  it('covers the four library stores', async () => {
    await replacePlaylist(
      playlist('p-old'),
      [track('t-old')],
      entries('p-old', ['t-old'])
    );
    await replaceDataset(
      ['playlists', 'tracks', 'entries', 'topItems'],
      {
        playlists: [playlist('p-new')],
        tracks: [track('t-new')],
        entries: entries('p-new', ['t-new']),
        topItems: [
          {
            key: 'tracks:short_term',
            type: 'tracks',
            period: 'short_term',
            fetchedAt: 1,
            items: [],
          },
        ],
      },
      { lastSyncAt: 123 }
    );
    const rows = await getAllRows();
    expect(rows.playlists.map((p) => p.id)).toEqual(['p-new']);
    expect(rows.tracks.map((t) => t.key)).toEqual(['t-new']);
    expect(rows.entries.map((e) => e.playlistId)).toEqual(['p-new']);
    expect(rows.topItems.map((t) => t.key)).toEqual(['tracks:short_term']);
    expect(await getMeta('lastSyncAt')).toBe(123);
  });

  it('a failing row leaves the old rows and the old meta in place', async () => {
    await replacePlays([
      {
        trackId: 'old',
        plays: 1,
        msPlayed: 1,
        firstTs: 'a',
        lastTs: 'b',
        trackName: null,
        artistName: null,
      },
    ]);
    await putMeta('historySummary', { version: 2, importedAt: 1 });
    await expect(
      replaceDataset(
        ['plays'],
        // A row without its key path cannot be stored: the put rejects and the
        // whole transaction aborts.
        { plays: [{ plays: 2 } as unknown as PlayRow] },
        { historySummary: { version: 2, importedAt: 99 } }
      )
    ).rejects.toBeTruthy();
    const rows = await getAllRows();
    expect(rows.plays.map((r) => r.trackId)).toEqual(['old']);
    expect(await getMeta('historySummary')).toEqual({
      version: 2,
      importedAt: 1,
    });
  });

  it('needs no database version bump', () => {
    expect(DB_VERSION).toBe(4);
  });
});

describe('deleteMix tombstones', () => {
  it('records the url and the time of a local deletion; a push clears it', async () => {
    await putMix(mix('https://soundcloud.com/a/one'));
    await putMix(mix('https://soundcloud.com/a/two'));
    await deleteMix('https://soundcloud.com/a/one', 1234);
    expect((await getMixes()).map((m) => m.url)).toEqual([
      'https://soundcloud.com/a/two',
    ]);
    expect(await getMixDeleted()).toEqual([
      { url: 'https://soundcloud.com/a/one', deletedAt: 1234 },
    ]);
    await deleteMix('https://soundcloud.com/a/two', 1300);
    await clearMixDeleted(['https://soundcloud.com/a/one']);
    expect(await getMixDeleted()).toEqual([
      { url: 'https://soundcloud.com/a/two', deletedAt: 1300 },
    ]);
  });

  it('deleting the same url twice keeps the newer time', async () => {
    await deleteMix('https://soundcloud.com/a/one', 10);
    await deleteMix('https://soundcloud.com/a/one', 20);
    expect(await getMixDeleted()).toEqual([
      { url: 'https://soundcloud.com/a/one', deletedAt: 20 },
    ]);
  });
});

describe('worker round additions (no DB_VERSION bump)', () => {
  it('keeps DB_VERSION at 4', () => {
    expect(DB_VERSION).toBe(4);
  });
  it('round-trips the optional worker fields of a mix', async () => {
    await openDb();
    const row: MixRow = {
      url: 'https://www.youtube.com/watch?v=abc',
      title: 'A set',
      author: 'Someone',
      playerSrc: null,
      slug: null,
      sources: {
        trackid: false,
        description: false,
        pasted: false,
        linkOut: null,
        worker: true,
      },
      rows: [],
      savedAt: 1,
      identifyJobId: '6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f',
      identifiedAt: 2,
    };
    await putMix(row);
    const back = (await getMixes()).find((m) => m.url === row.url);
    expect(back).toEqual(row);
  });
  it('round-trips and deletes the mixJobs meta', async () => {
    await openDb();
    const jobs: MixJobs = {
      'https://soundcloud.com/x/y': [
        {
          id: '6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f',
          status: 'queued',
          createdAt: 1,
          claimedBy: null,
          claimedAt: null,
          finishedAt: null,
          error: null,
          appliedAt: null,
        },
      ],
    };
    await putMeta(MIX_JOBS_META, jobs);
    expect(await getMeta(MIX_JOBS_META)).toEqual(jobs);
    await deleteMeta(MIX_JOBS_META);
    expect(await getMeta(MIX_JOBS_META)).toBeUndefined();
  });
});

describe('per-user names (ADR-13)', () => {
  const OWNER = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';

  /** A device the owner claimed, with `active` signed in (or nobody). */
  function scope(active: string | null, enabled: boolean): void {
    const map = new Map<string, string>();
    map.set(DEVICE_OWNER_KEY, JSON.stringify({ userId: OWNER }));
    if (active) {
      map.set(ACTIVE_KEY, JSON.stringify({ userId: active, email: 'o@x.y' }));
    }
    setScopeForTests({
      storage: {
        getItem: (k) => map.get(k) ?? null,
        setItem: (k, v) => void map.set(k, v),
        removeItem: (k) => void map.delete(k),
      },
      enabled,
    });
  }

  afterEach(async () => {
    await closeDb();
    setScopeForTests(null);
  });

  it.each([
    ['the claimer is active', OWNER, true],
    ['nobody is signed in', null, true],
    ['no server is set up', OWNER, false],
  ])('opens spotify-dj when %s', async (_label, active, enabled) => {
    scope(active, enabled);
    const db = await openDb();
    expect(db.name).toBe(DB_NAME);
    expect(DB_NAME).toBe('spotify-dj');
  });

  it('resolves the name through the scope at open and at wipe', async () => {
    const OTHER = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
    scope(OTHER, true);
    const db = await openDb();
    expect(db.name).toBe(`spotify-dj-u-${OTHER}`);
    await putMeta('accountId', 'other');
    await wipeDb();
    const names = (await indexedDB.databases()).map((d) => d.name);
    expect(names).not.toContain(`spotify-dj-u-${OTHER}`);
  });

  it('the claimer keeps every row of an existing version 4 database', async () => {
    await closeDb();
    await wipeDb();
    const v4 = await openAt(4, [...V3_STORES, ['mixes', 'url']]);
    await putLegacyRow(v4, 'playlists', playlist('p1'));
    await putLegacyRow(v4, 'tracks', track('t1'));
    await putLegacyRow(v4, 'features', feature('t1'));
    await putLegacyRow(v4, 'artistIdentity', identity('a1'));
    await putLegacyRow(v4, 'artistReach', reachRow('a1', 'listenbrainz'));
    await putLegacyRow(v4, 'mixes', mix('https://soundcloud.com/u/m'));
    await putLegacyRow(v4, 'meta', { name: 'accountId', value: 'me' });
    v4.close();
    scope(OWNER, true);
    const rows = await getAllRows();
    expect(rows.playlists).toEqual([playlist('p1')]);
    expect(rows.tracks).toEqual([track('t1')]);
    expect(rows.features).toEqual([feature('t1')]);
    expect(rows.artistIdentity).toEqual([identity('a1')]);
    expect(rows.artistReach).toEqual([reachRow('a1', 'listenbrainz')]);
    await expect(getMixes()).resolves.toEqual([
      mix('https://soundcloud.com/u/m'),
    ]);
    await expect(getMeta('accountId')).resolves.toBe('me');
    const db = await openDb();
    expect(db.name).toBe('spotify-dj');
    expect(db.version).toBe(DB_VERSION);
  });
});
