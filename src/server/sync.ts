import {
  SERVER_LAST_SYNC_META,
  SERVER_PENDING_META,
  SERVER_STAMPS_META,
  type AllRows,
  type MixRow,
  type ServerPending,
  type ServerStamps,
} from '../db/schema';
import { ACCOUNT_META, ACCOUNT_MISMATCH_NOTICE } from '../sync/runner';
import type { ServerClient, ServerResult } from './client';
import {
  DATASETS,
  batches,
  compareStamps,
  rowKey,
  type DatasetDef,
  type DatasetName,
  type LocalDeletion,
  type Metas,
  type StoreName,
} from './datasets';
import type { ServerStatus } from './types';
import { validateRow, validateSummary } from './validate';

/**
 * The two runners of the server sync (research D5–D7). Both take injected
 * deps and never throw; every failure is a `ServerResult` the state layer
 * maps to the server card. Neither calls Spotify: the account id comes from
 * the `accountId` meta (D11).
 */

/** The handful of repo functions the runners need, injected for the tests. */
export interface RepoLike {
  getAllRows(): Promise<AllRows>;
  getMeta<T>(name: string): Promise<T | undefined>;
  putMeta(name: string, value: unknown): Promise<void>;
  replaceDataset(
    stores: readonly StoreName[],
    rows: Partial<AllRows>,
    metas: Record<string, unknown>
  ): Promise<void>;
  getMixes(): Promise<MixRow[]>;
  putMix(row: MixRow): Promise<void>;
  deleteMix(url: string): Promise<void>;
  getMixDeleted(): Promise<LocalDeletion[]>;
  clearMixDeleted(urls: string[]): Promise<void>;
}

export interface SyncDeps {
  client: ServerClient;
  token: () => Promise<ServerResult<string>>;
  repo: RepoLike;
  now: () => number;
  onState: (state: ServerStatus) => void;
  /** The local `DB_VERSION`, written to every stamp and checked on a pull. */
  dbVersion: number;
}

export type PushName = DatasetName | 'mixes';

export interface PushOutcome {
  pushed: string[];
  skipped?: 'noAccount';
}

export interface PullOutcome {
  pulled: string[];
  /** Rows the safety check dropped (FR-018). */
  rejected: number;
  /** Datasets written by a newer app than this one; left alone. */
  stale: string[];
  /** Datasets whose summary failed the check; left alone. */
  refused?: string[];
  skipped?: 'noAccount';
}

/** The `datasets` table row. */
interface StampRow {
  spotify_account_id: string;
  name: DatasetName;
  fetched_at: number;
  schema_version: number;
  generation: number;
  summary: unknown;
  row_count: number;
}

interface DataRow {
  store: StoreName;
  key: string;
  row: unknown;
}

export const PAGE_SIZE = 1000;
export const UPDATE_APP_MESSAGE =
  'The server holds data written by a newer version of the app. Reload to update.';

const META_NAMES = [
  'lastSyncAt',
  'historySummary',
  'artistReachSummary',
  'rekordboxSummary',
] as const;

async function readMetas(repo: RepoLike): Promise<Metas> {
  const metas: Metas = {};
  for (const name of META_NAMES) {
    const value = await repo.getMeta<unknown>(name);
    if (value !== undefined) (metas as Record<string, unknown>)[name] = value;
  }
  return metas;
}

async function readStamps(
  deps: SyncDeps,
  token: string
): Promise<ServerResult<StampRow[]>> {
  const res = await deps.client.select<StampRow>(
    'datasets',
    { select: '*' },
    token
  );
  if (!res.ok) return res;
  return { ok: true, value: res.value.rows };
}

function ok<T>(value: T): ServerResult<T> {
  return { ok: true, value };
}

async function pushDataset(
  deps: SyncDeps,
  token: string,
  account: string,
  def: DatasetDef,
  rows: AllRows,
  metas: Metas,
  previous: StampRow | undefined,
  stamp: number
): Promise<ServerResult<number>> {
  const generation = deps.now();
  const flat: { store: StoreName; row: unknown }[] = [];
  for (const store of def.stores) {
    for (const row of rows[store]) flat.push({ store, row });
  }
  let done = 0;
  deps.onState({
    status: 'pushing',
    dataset: def.name,
    done,
    total: flat.length,
  });
  for (const batch of batches(flat)) {
    const res = await deps.client.upsert(
      'dataset_rows',
      batch.map(({ store, row }) => ({
        spotify_account_id: account,
        dataset: def.name,
        store,
        generation,
        key: rowKey(store, row),
        row,
      })),
      token
    );
    if (!res.ok) return res;
    done += batch.length;
    deps.onState({
      status: 'pushing',
      dataset: def.name,
      done,
      total: flat.length,
    });
  }
  const stamped = await deps.client.upsert(
    'datasets',
    [
      {
        spotify_account_id: account,
        name: def.name,
        fetched_at: stamp,
        schema_version: deps.dbVersion,
        generation,
        summary: def.summary(metas),
        row_count: flat.length,
      },
    ],
    token
  );
  if (!stamped.ok) return stamped;
  // Keep the previous generation until the next push: one bad push stays
  // recoverable from the dashboard (security review S9).
  if (previous) {
    const dropped = await deps.client.remove(
      'dataset_rows',
      {
        spotify_account_id: `eq.${account}`,
        dataset: `eq.${def.name}`,
        generation: `lt.${previous.generation}`,
      },
      token
    );
    if (!dropped.ok) return dropped;
  }
  const stamps =
    (await deps.repo.getMeta<ServerStamps>(SERVER_STAMPS_META)) ?? {};
  stamps[def.name] = { fetchedAt: stamp, generation, rows: flat.length };
  await deps.repo.putMeta(SERVER_STAMPS_META, stamps);
  return ok(flat.length);
}

async function clearPending(repo: RepoLike, name: PushName): Promise<void> {
  const pending =
    (await repo.getMeta<ServerPending>(SERVER_PENDING_META)) ?? {};
  if (!(name in pending)) return;
  delete pending[name];
  await repo.putMeta(SERVER_PENDING_META, pending);
}

/**
 * Pushes the named datasets whose local stamp is newer than the server's.
 * A dataset the server holds equal or newer is left alone and its pending
 * flag cleared; a failed batch returns at once and keeps the flag.
 */
export async function runPush(
  deps: SyncDeps,
  names: readonly PushName[]
): Promise<ServerResult<PushOutcome>> {
  const account = await deps.repo.getMeta<string>(ACCOUNT_META);
  if (account === undefined) return ok({ pushed: [], skipped: 'noAccount' });
  const token = await deps.token();
  if (!token.ok) return token;
  const stamps = await readStamps(deps, token.value);
  if (!stamps.ok) return stamps;
  const byName = new Map(
    stamps.value
      .filter((s) => s.spotify_account_id === account)
      .map((s) => [s.name, s])
  );
  const rows = await deps.repo.getAllRows();
  const metas = await readMetas(deps.repo);
  const pushed: string[] = [];
  for (const def of DATASETS) {
    if (!names.includes(def.name)) continue;
    const local = def.stamp(rows, metas);
    const previous = byName.get(def.name);
    if (
      compareStamps(local, previous?.fetched_at ?? null) !== 'push' ||
      local === null
    ) {
      await clearPending(deps.repo, def.name);
      continue;
    }
    const res = await pushDataset(
      deps,
      token.value,
      account,
      def,
      rows,
      metas,
      previous,
      local
    );
    if (!res.ok) return res;
    pushed.push(def.name);
    await clearPending(deps.repo, def.name);
  }
  // 'mixes' is pushed row by row: see the next round of this file (US2).
  await deps.repo.putMeta(SERVER_LAST_SYNC_META, deps.now());
  return ok({ pushed });
}

async function pullDataset(
  deps: SyncDeps,
  token: string,
  account: string,
  def: DatasetDef,
  stamp: StampRow
): Promise<
  ServerResult<{ rows: Partial<AllRows>; rejected: number; count: number }>
> {
  const out: Partial<AllRows> = {};
  for (const store of def.stores)
    (out as Record<string, unknown[]>)[store] = [];
  let rejected = 0;
  let count = 0;
  let from = 0;
  deps.onState({
    status: 'pulling',
    dataset: def.name,
    done: 0,
    total: stamp.row_count,
  });
  for (;;) {
    const page = await deps.client.select<DataRow>(
      'dataset_rows',
      {
        select: 'store,key,row',
        spotify_account_id: `eq.${account}`,
        dataset: `eq.${def.name}`,
        generation: `eq.${stamp.generation}`,
        order: 'store,key',
      },
      token,
      [from, from + PAGE_SIZE - 1]
    );
    if (!page.ok) return page;
    for (const item of page.value.rows) {
      count++;
      const store = item.store;
      if (!def.stores.includes(store)) {
        rejected++;
        continue;
      }
      const checked = validateRow(store, item.row);
      if (!checked.ok) {
        rejected++;
        continue;
      }
      (out as Record<string, unknown[]>)[store].push(checked.row);
    }
    deps.onState({
      status: 'pulling',
      dataset: def.name,
      done: count,
      total: stamp.row_count,
    });
    const total = page.value.total;
    from += PAGE_SIZE;
    if (page.value.rows.length < PAGE_SIZE) break;
    if (total !== null && from >= total) break;
  }
  return ok({ rows: out, rejected, count });
}

/**
 * Pulls every dataset the server holds newer than this device's copy, rows
 * and summary in one local transaction. Refuses when the server holds
 * another Spotify account and not this one; skips when none is known here.
 */
export async function runPull(
  deps: SyncDeps
): Promise<ServerResult<PullOutcome>> {
  const account = await deps.repo.getMeta<string>(ACCOUNT_META);
  if (account === undefined) {
    return ok({ pulled: [], rejected: 0, stale: [], skipped: 'noAccount' });
  }
  const token = await deps.token();
  if (!token.ok) return token;
  const stamps = await readStamps(deps, token.value);
  if (!stamps.ok) return stamps;
  const mine = stamps.value.filter((s) => s.spotify_account_id === account);
  if (mine.length === 0 && stamps.value.length > 0) {
    return { ok: false, kind: 'error', message: ACCOUNT_MISMATCH_NOTICE };
  }
  const rows = await deps.repo.getAllRows();
  const metas = await readMetas(deps.repo);
  const outcome: PullOutcome = { pulled: [], rejected: 0, stale: [] };
  for (const def of DATASETS) {
    const stamp = mine.find((s) => s.name === def.name);
    if (!stamp) continue;
    if (stamp.schema_version > deps.dbVersion) {
      outcome.stale.push(def.name);
      continue;
    }
    if (compareStamps(def.stamp(rows, metas), stamp.fetched_at) !== 'pull')
      continue;
    if (!validateSummary(def.name, stamp.summary)) {
      (outcome.refused ??= []).push(def.name);
      continue;
    }
    const pulled = await pullDataset(deps, token.value, account, def, stamp);
    if (!pulled.ok) return pulled;
    const newMetas: Record<string, unknown> = {};
    if (def.name === 'library') newMetas.lastSyncAt = stamp.fetched_at;
    if (
      def.summaryMeta &&
      stamp.summary !== null &&
      stamp.summary !== undefined
    ) {
      newMetas[def.summaryMeta] = stamp.summary;
    }
    await deps.repo.replaceDataset(def.stores, pulled.value.rows, newMetas);
    outcome.rejected += pulled.value.rejected;
    outcome.pulled.push(def.name);
    const seen =
      (await deps.repo.getMeta<ServerStamps>(SERVER_STAMPS_META)) ?? {};
    seen[def.name] = {
      fetchedAt: stamp.fetched_at,
      generation: stamp.generation,
      rows: pulled.value.count - pulled.value.rejected,
    };
    await deps.repo.putMeta(SERVER_STAMPS_META, seen);
  }
  await deps.repo.putMeta(SERVER_LAST_SYNC_META, deps.now());
  return ok(outcome);
}
