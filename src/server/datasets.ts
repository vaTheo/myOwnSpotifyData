import type { ArtistReachSummary } from '../features/reachRun';
import type { RekordboxSummary } from '../features/rekordboxImport';
import type { ImportSummary } from '../history/importer';
import type { AllRows, MixRow } from '../db/schema';

/**
 * The pure rules of the server sync (research D5, D6): which local stores
 * form a dataset, what its stamp is, how two stamps compare, how rows are
 * batched, and how saved mixes converge row by row. No I/O here.
 */

export type DatasetName = 'library' | 'history' | 'features' | 'reach';
export type StoreName = keyof AllRows;

/** The metas a stamp or a summary is read from; every one optional. */
export interface Metas {
  lastSyncAt?: number;
  historySummary?: Partial<ImportSummary> & { importedAt?: number };
  artistReachSummary?: Partial<ArtistReachSummary> & { ranAt?: number };
  rekordboxSummary?: RekordboxSummary | null;
}

export interface DatasetDef {
  name: DatasetName;
  stores: readonly StoreName[];
  /** The `fetched_at` compared by newer-wins; null when the data is absent. */
  stamp(rows: AllRows, metas: Metas): number | null;
  /** The meta summary the screens gate on, carried with the stamp. */
  summary(metas: Metas): unknown;
  /** The meta name the summary is restored under, if any. */
  summaryMeta: string | null;
}

function finite(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export const DATASETS: readonly DatasetDef[] = [
  {
    name: 'library',
    stores: ['playlists', 'tracks', 'entries', 'topItems'],
    stamp: (_rows, metas) =>
      finite(metas.lastSyncAt) ? metas.lastSyncAt : null,
    summary: () => null,
    summaryMeta: null,
  },
  {
    name: 'history',
    stores: ['plays'],
    stamp: (_rows, metas) => {
      const s = metas.historySummary;
      return s && s.version === 2 && finite(s.importedAt) ? s.importedAt : null;
    },
    summary: (metas) => metas.historySummary ?? null,
    summaryMeta: 'historySummary',
  },
  {
    name: 'features',
    stores: ['features'],
    stamp: (rows) => {
      let max: number | null = null;
      for (const row of rows.features) {
        if (finite(row.updatedAt) && (max === null || row.updatedAt > max))
          max = row.updatedAt;
      }
      return max;
    },
    summary: (metas) => metas.rekordboxSummary ?? null,
    summaryMeta: 'rekordboxSummary',
  },
  {
    name: 'reach',
    stores: ['artistIdentity', 'artistReach'],
    stamp: (_rows, metas) => {
      const s = metas.artistReachSummary;
      return s && s.version === 1 && finite(s.ranAt) ? s.ranAt : null;
    },
    summary: (metas) => metas.artistReachSummary ?? null,
    summaryMeta: 'artistReachSummary',
  },
];

export function datasetByName(name: DatasetName): DatasetDef {
  const def = DATASETS.find((d) => d.name === name);
  if (!def) throw new Error(`unknown dataset ${name}`);
  return def;
}

/** The local keyPath of each store, as the `key` column of `dataset_rows`. */
export function rowKey(store: StoreName, row: unknown): string {
  const r = row as Record<string, unknown>;
  switch (store) {
    case 'entries':
      return `${String(r.playlistId)}\u0000${String(r.position)}`;
    case 'playlists':
      return String(r.id);
    case 'plays':
    case 'features':
      return String(r.trackId);
    case 'artistIdentity':
      return String(r.artistId);
    case 'tracks':
    case 'topItems':
    case 'artistReach':
      return String(r.key);
  }
}

/** Newer wins by the time the data was fetched or imported, never by push time. */
export function compareStamps(
  local: number | null,
  server: number | null
): 'push' | 'pull' | 'same' {
  if (local === null && server === null) return 'same';
  if (server === null) return 'push';
  if (local === null) return 'pull';
  if (local > server) return 'push';
  if (local < server) return 'pull';
  return 'same';
}

export const BATCH_SIZE = 500;

export function batches<T>(rows: readonly T[], size = BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

export interface MixStamp {
  url: string;
  savedAt: number;
  deletedAt: number | null;
}

export interface LocalDeletion {
  url: string;
  deletedAt: number;
}

export interface MixPlan {
  /** Local rows newer than the server's copy (or absent there). */
  push: MixRow[];
  /** Local deletions newer than the server's row. */
  tombstones: LocalDeletion[];
  /** Urls whose server row is newer than the local one (or absent locally). */
  pull: string[];
  /** Urls whose server tombstone is newer than the local save. */
  deleteLocal: string[];
}

/** Row by row: the newer of save and deletion wins, whole (spec US2). */
export function planMixes(
  local: readonly MixRow[],
  server: readonly MixStamp[],
  deletedLocally: readonly LocalDeletion[]
): MixPlan {
  const plan: MixPlan = { push: [], tombstones: [], pull: [], deleteLocal: [] };
  const byUrl = new Map(server.map((s) => [s.url, s]));
  const seen = new Set<string>();
  for (const row of local) {
    seen.add(row.url);
    const s = byUrl.get(row.url);
    if (!s) {
      plan.push.push(row);
      continue;
    }
    const serverTime = s.deletedAt ?? s.savedAt;
    if (row.savedAt > serverTime) plan.push.push(row);
    else if (row.savedAt < serverTime) {
      if (s.deletedAt !== null) plan.deleteLocal.push(row.url);
      else plan.pull.push(row.url);
    }
  }
  const deletions = new Map(deletedLocally.map((d) => [d.url, d]));
  for (const s of server) {
    if (seen.has(s.url)) continue;
    seen.add(s.url);
    const d = deletions.get(s.url);
    // A server tombstone needs nothing more, whichever side deleted first.
    if (s.deletedAt !== null) continue;
    if (d && d.deletedAt > s.savedAt) plan.tombstones.push(d);
    // Either never deleted here, or the server's save is newer than the local
    // deletion and the row comes back.
    else plan.pull.push(s.url);
  }
  for (const d of deletedLocally) {
    if (!seen.has(d.url)) plan.tombstones.push(d);
  }
  return plan;
}
