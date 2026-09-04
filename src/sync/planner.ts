import type { PlaylistRow } from '../db/schema';
import type { ApiPlaylistSummary } from '../spotify/types';

export type ListedPlaylist = Omit<PlaylistRow, 'syncedAt'>;

export function selectOwned(
  items: ReadonlyArray<ApiPlaylistSummary | null | undefined>,
  meId: string
): ListedPlaylist[] {
  const out: ListedPlaylist[] = [];
  for (const p of items) {
    if (!p || p.owner?.id !== meId) continue;
    out.push({
      id: p.id,
      name: p.name,
      snapshotId: p.snapshot_id,
      itemCount: p.items?.total ?? p.tracks?.total ?? 0,
      imageUrl: p.images?.[0]?.url ?? null,
      spotifyUrl: p.external_urls?.spotify ?? null,
    });
  }
  return out;
}

export interface SyncPlan {
  toDelete: string[];
  toFetch: ListedPlaylist[];
  unchanged: string[];
}

export function planSync(
  listing: ListedPlaylist[],
  cached: PlaylistRow[],
  priorityId?: string
): SyncPlan {
  const listedIds = new Set(listing.map((p) => p.id));
  const cachedById = new Map(cached.map((p) => [p.id, p]));
  const toDelete = cached.filter((p) => !listedIds.has(p.id)).map((p) => p.id);
  const toFetch: ListedPlaylist[] = [];
  const unchanged: string[] = [];
  for (const p of listing) {
    const c = cachedById.get(p.id);
    if (c && c.snapshotId === p.snapshotId) unchanged.push(p.id);
    else toFetch.push(p);
  }
  if (priorityId) {
    const i = toFetch.findIndex((p) => p.id === priorityId);
    if (i > 0) toFetch.unshift(...toFetch.splice(i, 1));
  }
  return { toDelete, toFetch, unchanged };
}
