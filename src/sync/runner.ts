import {
  deletePlaylists,
  getMeta,
  getPlaylists,
  putMeta,
  putTopItems,
  replacePlaylist,
  wipeDb,
} from '../db/repo';
import {
  PERIODS,
  topKey,
  type TopArtistItem,
  type TopTrackItem,
} from '../db/schema';
import { PAGE_LIMIT, type SpotifyClient } from '../spotify/client';
import {
  ApiError,
  AuthError,
  NotAllowlistedError,
  QuotaError,
} from '../spotify/errors';
import type {
  ApiPage,
  ApiPlaylistItem,
  ApiPlaylistSummary,
  ApiProfile,
  ApiTopArtist,
  ApiTrack,
} from '../spotify/types';
import { buildEntries, mapPlaylistItem, type MappedItem } from './items';
import { planSync, selectOwned, type ListedPlaylist } from './planner';

export type SyncState =
  | { status: 'idle' }
  | {
      status: 'running';
      done: number;
      total: number;
      current: string | null;
      pending: string[];
    }
  | {
      status: 'locked';
      retryAt: number;
      pending: string[];
      done: number;
      total: number;
    }
  | {
      status: 'error';
      message: string;
      pending: string[];
      /** Set when the user must reconnect (not allow-listed, or login expired). */
      auth?: true;
    };

export const SYNC_STATE_META = 'syncState';
export const LAST_SYNC_META = 'lastSyncAt';
export const ACCOUNT_META = 'accountId';

export interface RunnerDeps {
  client: SpotifyClient;
  now: () => number;
  onState: (state: SyncState) => void;
  /** Optional screen wake lock; resolves to a release function. */
  acquireWakeLock?: () => Promise<() => Promise<void>>;
}

export interface SyncOptions {
  priorityId?: string;
}

const ITEM_FIELDS =
  'total,items(added_at,is_local,item(type,id,uri,name,duration_ms,is_local,external_ids,external_urls,artists(id,name),album(name)))';
const TRACK_FIELDS =
  'total,items(added_at,is_local,track(type,id,uri,name,duration_ms,is_local,external_ids,external_urls,artists(id,name),album(name)))';
const FIELDS_CANDIDATES: ReadonlyArray<string | null> = [
  ITEM_FIELDS,
  TRACK_FIELDS,
  null,
];

function describeError(err: unknown): string {
  if (err instanceof NotAllowlistedError || err instanceof AuthError) {
    return err.message;
  }
  if (err instanceof ApiError && err.status === 0) {
    return 'Offline, showing cached data.';
  }
  if (err instanceof ApiError)
    return `Spotify error ${err.status}: ${err.message}`;
  if (err instanceof DOMException && err.name === 'QuotaExceededError') {
    return 'Local storage is full. Free space on the phone and try again.';
  }
  return err instanceof Error ? err.message : String(err);
}

function toTopTrack(t: ApiTrack, index: number): TopTrackItem {
  return {
    rank: index + 1,
    id: t.id ?? t.uri,
    name: t.name,
    artists: (t.artists ?? []).map((a) => ({ id: a.id ?? null, name: a.name })),
    album: t.album?.name ?? '',
    imageUrl: t.album?.images?.[0]?.url ?? null,
    spotifyUrl: t.external_urls?.spotify ?? null,
  };
}

function toTopArtist(a: ApiTopArtist, index: number): TopArtistItem {
  return {
    rank: index + 1,
    id: a.id,
    name: a.name,
    imageUrl: a.images?.[0]?.url ?? null,
    spotifyUrl: a.external_urls?.spotify ?? null,
  };
}

async function fetchProfileId(client: SpotifyClient): Promise<string> {
  try {
    return (await client.get<ApiProfile>('/me')).id;
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      throw new NotAllowlistedError();
    }
    throw err;
  }
}

async function fetchTopItems(
  client: SpotifyClient,
  now: () => number
): Promise<void> {
  for (const period of PERIODS) {
    const tracks = await client.get<ApiPage<ApiTrack>>('/me/top/tracks', {
      time_range: period,
      limit: PAGE_LIMIT,
    });
    await putTopItems({
      key: topKey('tracks', period),
      type: 'tracks',
      period,
      fetchedAt: now(),
      items: (tracks.items ?? []).map(toTopTrack),
    });
    const artists = await client.get<ApiPage<ApiTopArtist>>('/me/top/artists', {
      time_range: period,
      limit: PAGE_LIMIT,
    });
    await putTopItems({
      key: topKey('artists', period),
      type: 'artists',
      period,
      fetchedAt: now(),
      items: (artists.items ?? []).map(toTopArtist),
    });
  }
}

export async function runSync(
  deps: RunnerDeps,
  opts: SyncOptions = {}
): Promise<void> {
  const { client, now, onState } = deps;
  /** undefined = not probed yet; null = request without a fields filter. */
  let fields: string | null | undefined;
  let done = 0;
  let total = 0;
  let pending: string[] = [];

  async function setFinalState(state: SyncState): Promise<void> {
    onState(state);
    await putMeta(SYNC_STATE_META, state);
  }

  function running(current: string | null): void {
    onState({ status: 'running', done, total, current, pending });
  }

  async function getItemsPage(
    playlistId: string,
    offset: number
  ): Promise<ApiPage<ApiPlaylistItem>> {
    const candidates = fields === undefined ? FIELDS_CANDIDATES : [fields];
    let lastError: unknown = null;
    for (const candidate of candidates) {
      try {
        const page = await client.get<ApiPage<ApiPlaylistItem>>(
          `/playlists/${playlistId}/items`,
          { limit: PAGE_LIMIT, offset, fields: candidate ?? undefined }
        );
        if (!Array.isArray(page.items)) {
          lastError = new Error('Playlist items response had no items');
          continue;
        }
        const stripped =
          candidate !== null &&
          page.items.length > 0 &&
          !page.items.some(
            (entry) => entry && ('item' in entry || 'track' in entry)
          );
        if (stripped) {
          lastError = new Error(
            'Could not read playlist items: the fields filter returned no playable objects'
          );
          continue;
        }
        if (page.items.length > 0) fields = candidate;
        return page;
      } catch (err) {
        if (err instanceof ApiError && err.status === 400) {
          lastError = err;
          continue;
        }
        throw err;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new ApiError(400, 'Could not read playlist items');
  }

  async function fetchAllItems(playlistId: string): Promise<ApiPlaylistItem[]> {
    const out: ApiPlaylistItem[] = [];
    for (let offset = 0; ; offset += PAGE_LIMIT) {
      const page = await getItemsPage(playlistId, offset);
      out.push(...page.items);
      if (page.items.length < PAGE_LIMIT) break;
      if (typeof page.total === 'number' && offset + PAGE_LIMIT >= page.total) {
        break;
      }
    }
    return out;
  }

  const release = deps.acquireWakeLock
    ? await deps.acquireWakeLock().catch(() => null)
    : null;

  try {
    running('Profile');
    const me = await fetchProfileId(client);
    const cachedAccount = await getMeta<string>(ACCOUNT_META);
    if (cachedAccount !== undefined && cachedAccount !== me) await wipeDb();
    await putMeta(ACCOUNT_META, me);

    running('Top tracks and artists');
    await fetchTopItems(client, now);

    running('Playlists');
    const listing: ListedPlaylist[] = [];
    for await (const page of client.pages<ApiPlaylistSummary | null>(
      '/me/playlists'
    )) {
      listing.push(...selectOwned(page.items, me));
    }
    const plan = planSync(listing, await getPlaylists(), opts.priorityId);
    await deletePlaylists(plan.toDelete);
    total = plan.toFetch.length;
    pending = plan.toFetch.map((p) => p.id);

    for (const playlist of plan.toFetch) {
      running(playlist.name);
      const items = await fetchAllItems(playlist.id);
      const mapped = items
        .map(mapPlaylistItem)
        .filter((m): m is MappedItem => m !== null);
      const { tracks, entries } = buildEntries(playlist.id, mapped);
      await replacePlaylist({ ...playlist, syncedAt: now() }, tracks, entries);
      done += 1;
      pending = pending.filter((id) => id !== playlist.id);
    }

    await putMeta(LAST_SYNC_META, now());
    await setFinalState({ status: 'idle' });
  } catch (err) {
    if (err instanceof QuotaError) {
      await setFinalState({
        status: 'locked',
        retryAt: err.retryAt,
        pending,
        done,
        total,
      });
    } else {
      const auth =
        err instanceof NotAllowlistedError || err instanceof AuthError;
      await setFinalState({
        status: 'error',
        message: describeError(err),
        pending,
        ...(auth ? { auth: true as const } : {}),
      });
    }
  } finally {
    if (release) await release().catch(() => undefined);
  }
}
