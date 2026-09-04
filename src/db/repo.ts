import { deleteDB, openDB, type IDBPDatabase } from 'idb';
import {
  DB_NAME,
  DB_VERSION,
  type AllRows,
  type DjDb,
  type EntryRow,
  type PlayRow,
  type PlaylistRow,
  type TopItemsRow,
  type TrackRow,
} from './schema';

let dbPromise: Promise<IDBPDatabase<DjDb>> | null = null;

export function openDb(): Promise<IDBPDatabase<DjDb>> {
  dbPromise ??= openDB<DjDb>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('playlists', { keyPath: 'id' });
      db.createObjectStore('tracks', { keyPath: 'key' });
      db.createObjectStore('entries', { keyPath: ['playlistId', 'position'] });
      db.createObjectStore('topItems', { keyPath: 'key' });
      db.createObjectStore('plays', { keyPath: 'trackId' });
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
    await Promise.race([deleteDB(DB_NAME), timeout]);
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
  ]);
  const [playlists, tracks, entries, topItems, plays] = await Promise.all([
    tx.objectStore('playlists').getAll(),
    tx.objectStore('tracks').getAll(),
    tx.objectStore('entries').getAll(),
    tx.objectStore('topItems').getAll(),
    tx.objectStore('plays').getAll(),
  ]);
  await tx.done;
  return { playlists, tracks, entries, topItems, plays };
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

export async function getMeta<T>(name: string): Promise<T | undefined> {
  const db = await openDb();
  const row = await db.get('meta', name);
  return row?.value as T | undefined;
}

export async function putMeta(name: string, value: unknown): Promise<void> {
  const db = await openDb();
  await db.put('meta', { name, value });
}

export async function getPlaylists(): Promise<PlaylistRow[]> {
  const db = await openDb();
  return db.getAll('playlists');
}
