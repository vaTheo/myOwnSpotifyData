import { deleteDB, openDB, type IDBPDatabase } from 'idb';
import { DEMO_DB_NAME, demoVariant } from '../dev/flag';
import {
  DB_NAME,
  DB_VERSION,
  MIX_DELETED_META,
  type AllRows,
  type ArtistIdentityRow,
  type ArtistReachRow,
  type DjDb,
  type EntryRow,
  type FeatureRow,
  type MixDeletedEntry,
  type MixRow,
  type PlayRow,
  type PlaylistRow,
  type TopItemsRow,
  type TrackRow,
} from './schema';

let dbPromise: Promise<IDBPDatabase<DjDb>> | null = null;

/** Shown while an older tab keeps the database at its old version. */
export const DB_BLOCKED_MESSAGE =
  'Another tab of DJ Data is holding the old database open. Close the other tabs of this app (and its home-screen window), then reload.';

/** Shown when the database has not opened after DB_SLOW_MS, whatever the cause. */
export const DB_SLOW_MESSAGE =
  'The local database is taking long to open. If this lasts, close the other tabs of DJ Data (and its home-screen window), then reload.';
export const DB_SLOW_MS = 8000;

/** Shown in the tab that handed its database over to a newer version. */
export const DB_SUPERSEDED_MESSAGE =
  'DJ Data was updated in another tab. Reload this one to continue.';

export interface DbEvents {
  /** Another connection blocks this tab's upgrade; the open waits for it. */
  blocked?: () => void;
  /** A newer version opened elsewhere; this tab closed its connection. */
  superseded?: () => void;
}

let events: DbEvents = {};

/** The app registers its banners here; tests register spies. */
export function setDbEvents(next: DbEvents): void {
  events = next;
}

/**
 * The demo of the visual loop (`yarn dev` with `?demo`, spec 003) keeps its
 * rows in a database of its own, so it never touches the owner's library.
 * Same stores, same version: nothing about the schema differs.
 */
function dbName(): string {
  return import.meta.env.DEV && demoVariant() !== null ? DEMO_DB_NAME : DB_NAME;
}

export function openDb(): Promise<IDBPDatabase<DjDb>> {
  dbPromise ??= openDB<DjDb>(dbName(), DB_VERSION, {
    // An older tab (or the home-screen window) still holds the database at
    // its previous version: the request waits until that connection closes,
    // so the user is told to close it instead of watching a spinner.
    blocked() {
      events.blocked?.();
    },
    // The mirror image: a newer version wants to upgrade from another tab.
    // Closing our connection lets it proceed; this tab must reload before it
    // touches the database again, and says so.
    blocking() {
      const pending = dbPromise;
      dbPromise = null;
      void pending?.then((db) => db.close());
      events.superseded?.();
    },
    // The browser closed the connection underneath us (storage cleared,
    // process killed): the next call reopens instead of failing forever.
    terminated() {
      dbPromise = null;
    },
    upgrade(db) {
      // Only what is missing: a version 1 database keeps every row it holds
      // and gains `features`; a version 2 database keeps every playlist,
      // track, play and feature row and gains the two reach stores; a version
      // 3 database keeps every row and gains `mixes`.
      if (!db.objectStoreNames.contains('playlists'))
        db.createObjectStore('playlists', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('tracks'))
        db.createObjectStore('tracks', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('entries'))
        db.createObjectStore('entries', {
          keyPath: ['playlistId', 'position'],
        });
      if (!db.objectStoreNames.contains('topItems'))
        db.createObjectStore('topItems', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('plays'))
        db.createObjectStore('plays', { keyPath: 'trackId' });
      if (!db.objectStoreNames.contains('features'))
        db.createObjectStore('features', { keyPath: 'trackId' });
      if (!db.objectStoreNames.contains('artistIdentity'))
        db.createObjectStore('artistIdentity', { keyPath: 'artistId' });
      if (!db.objectStoreNames.contains('artistReach'))
        db.createObjectStore('artistReach', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('mixes'))
        db.createObjectStore('mixes', { keyPath: 'url' });
      if (!db.objectStoreNames.contains('meta'))
        db.createObjectStore('meta', { keyPath: 'name' });
    },
  });
  return dbPromise;
}

export async function closeDb(): Promise<void> {
  const pending = dbPromise;
  dbPromise = null;
  if (pending) (await pending).close();
}

export async function wipeDb(timeoutMs = 5000): Promise<void> {
  await closeDb();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          'Local data is still open in another tab. Close the other tabs and try again.'
        )
      );
    }, timeoutMs);
  });
  try {
    await Promise.race([deleteDB(dbName()), timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

function playlistRange(playlistId: string): IDBKeyRange {
  return IDBKeyRange.bound(
    [playlistId, 0],
    [playlistId, Number.MAX_SAFE_INTEGER]
  );
}

export async function getAllRows(): Promise<AllRows> {
  const db = await openDb();
  const tx = db.transaction([
    'playlists',
    'tracks',
    'entries',
    'topItems',
    'plays',
    'features',
    'artistIdentity',
    'artistReach',
  ]);
  const [
    playlists,
    tracks,
    entries,
    topItems,
    plays,
    features,
    artistIdentity,
    artistReach,
  ] = await Promise.all([
    tx.objectStore('playlists').getAll(),
    tx.objectStore('tracks').getAll(),
    tx.objectStore('entries').getAll(),
    tx.objectStore('topItems').getAll(),
    tx.objectStore('plays').getAll(),
    tx.objectStore('features').getAll(),
    tx.objectStore('artistIdentity').getAll(),
    tx.objectStore('artistReach').getAll(),
  ]);
  await tx.done;
  return {
    playlists,
    tracks,
    entries,
    topItems,
    plays,
    features,
    artistIdentity,
    artistReach,
  };
}

/** Atomically replaces one playlist's entries and upserts its tracks. */
export async function replacePlaylist(
  playlist: PlaylistRow,
  tracks: TrackRow[],
  entries: EntryRow[]
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(['playlists', 'tracks', 'entries'], 'readwrite');
  const entryStore = tx.objectStore('entries');
  const trackStore = tx.objectStore('tracks');
  await Promise.all([
    entryStore.delete(playlistRange(playlist.id)),
    ...tracks.map((t) => trackStore.put(t)),
    ...entries.map((e) => entryStore.put(e)),
    tx.objectStore('playlists').put(playlist),
    tx.done,
  ]);
}

export async function deletePlaylists(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDb();
  const tx = db.transaction(['playlists', 'entries'], 'readwrite');
  await Promise.all([
    ...ids.map((id) => tx.objectStore('playlists').delete(id)),
    ...ids.map((id) => tx.objectStore('entries').delete(playlistRange(id))),
    tx.done,
  ]);
}

export async function putTopItems(row: TopItemsRow): Promise<void> {
  const db = await openDb();
  await db.put('topItems', row);
}

export async function replacePlays(rows: PlayRow[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('plays', 'readwrite');
  const store = tx.objectStore('plays');
  await Promise.all([store.clear(), ...rows.map((r) => store.put(r)), tx.done]);
}

/** Upserts a batch of feature rows; the lookup writes one batch at a time. */
export async function putFeatures(rows: FeatureRow[]): Promise<void> {
  if (rows.length === 0) return;
  const db = await openDb();
  const tx = db.transaction('features', 'readwrite');
  const store = tx.objectStore('features');
  await Promise.all([...rows.map((row) => store.put(row)), tx.done]);
}

export async function getFeatures(): Promise<FeatureRow[]> {
  const db = await openDb();
  return db.getAll('features');
}

/**
 * Upserts a batch of identity rows; the reach run writes each row as it
 * resolves, so a one-element batch is the normal call.
 */
export async function putIdentities(rows: ArtistIdentityRow[]): Promise<void> {
  if (rows.length === 0) return;
  const db = await openDb();
  const tx = db.transaction('artistIdentity', 'readwrite');
  const store = tx.objectStore('artistIdentity');
  await Promise.all([...rows.map((row) => store.put(row)), tx.done]);
}

/** Upserts a batch of reach rows, keyed `${artistId}|${source}`. */
export async function putReach(rows: ArtistReachRow[]): Promise<void> {
  if (rows.length === 0) return;
  const db = await openDb();
  const tx = db.transaction('artistReach', 'readwrite');
  const store = tx.objectStore('artistReach');
  await Promise.all([...rows.map((row) => store.put(row)), tx.done]);
}

export async function getMixes(): Promise<MixRow[]> {
  const db = await openDb();
  return db.getAll('mixes'); // newest-first ordering is applied in state.ts
}

export async function putMix(row: MixRow): Promise<void> {
  const db = await openDb();
  await db.put('mixes', row);
}

/**
 * Deletes a saved mix and records the deletion, so the server sync can push
 * a tombstone that removes it on the other devices too (US2). One
 * transaction: the row and its record go together.
 */
export async function deleteMix(
  url: string,
  deletedAt = Date.now()
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(['mixes', 'meta'], 'readwrite');
  const meta = tx.objectStore('meta');
  const current = (await meta.get(MIX_DELETED_META))?.value as
    MixDeletedEntry[] | undefined;
  const kept = (current ?? []).filter((d) => d.url !== url);
  const previous = (current ?? []).find((d) => d.url === url);
  kept.push({ url, deletedAt: Math.max(deletedAt, previous?.deletedAt ?? 0) });
  await Promise.all([
    tx.objectStore('mixes').delete(url),
    meta.put({ name: MIX_DELETED_META, value: kept }),
    tx.done,
  ]);
}

export async function getMixDeleted(): Promise<MixDeletedEntry[]> {
  return (await getMeta<MixDeletedEntry[]>(MIX_DELETED_META)) ?? [];
}

/** Called after the tombstones reached the server. */
export async function clearMixDeleted(urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  const current = await getMixDeleted();
  await putMeta(
    MIX_DELETED_META,
    current.filter((d) => !urls.includes(d.url))
  );
}

export async function getMeta<T>(name: string): Promise<T | undefined> {
  const db = await openDb();
  const row = await db.get('meta', name);
  return row?.value as T | undefined;
}

export async function putMeta(name: string, value: unknown): Promise<void> {
  const db = await openDb();
  await db.put('meta', { name, value });
}

export async function deleteMeta(name: string): Promise<void> {
  const db = await openDb();
  await db.delete('meta', name);
}

/**
 * Replaces whole stores and their metas in one readwrite transaction: the
 * server pull writes a dataset's rows and the summary its screens gate on
 * together, so a gate never sees rows without a version (ADR-07). A rejected
 * put aborts the whole transaction and leaves every old row and meta.
 */
export async function replaceDataset(
  stores: readonly (keyof AllRows)[],
  rows: Partial<AllRows>,
  metas: Record<string, unknown>
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([...stores, 'meta'], 'readwrite');
  const writes: Promise<unknown>[] = [];
  try {
    for (const name of stores) {
      const store = tx.objectStore(name);
      writes.push(store.clear());
      for (const row of rows[name] ?? []) {
        // A row without its key path makes `put` throw synchronously (a
        // DataError); the catch below aborts so the clear never commits.
        writes.push(
          (store as { put(value: unknown): Promise<unknown> }).put(row)
        );
      }
    }
    const meta = tx.objectStore('meta');
    for (const [name, value] of Object.entries(metas)) {
      writes.push(meta.put({ name, value }));
    }
    await Promise.all([...writes, tx.done]);
  } catch (err) {
    try {
      tx.abort();
    } catch {
      // Already aborted by the failed request.
    }
    // Every other request of the aborted transaction rejects too; settle
    // them here so none surfaces as an unhandled rejection.
    await Promise.allSettled([...writes, tx.done]);
    throw err;
  }
}

export async function getPlaylists(): Promise<PlaylistRow[]> {
  const db = await openDb();
  return db.getAll('playlists');
}
