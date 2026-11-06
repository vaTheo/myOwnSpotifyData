import {
  MIX_DELETED_META,
  SERVER_LAST_SYNC_META,
  SERVER_PENDING_META,
  SERVER_STAMPS_META,
  type AllRows,
  type MixRow,
  type ServerPending,
  type ServerStamps,
  MIX_JOBS_META,
  type MixJobs,
  type MixJobView,
} from '../db/schema';
import { ACCOUNT_META, ACCOUNT_MISMATCH_NOTICE } from '../sync/runner';
import type { ServerClient, ServerResult } from './client';
import {
  DATASETS,
  batches,
  compareStamps,
  planMixes,
  rowKey,
  type DatasetDef,
  type DatasetName,
  type LocalDeletion,
  type Metas,
  type MixStamp,
  type StoreName,
} from './datasets';
import type { ServerStatus } from './types';
import { validateMix, validateRow, validateSummary } from './validate';
import { validateJobRow, type MixJobRow } from './validate';
import { mergeKeepingReview } from '../features/mix/keepReview';
import { jobView, resultToRows } from '../features/mix/worker';

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
  deleteMeta(name: string): Promise<void>;
  replaceDataset(
    stores: readonly StoreName[],
    rows: Partial<AllRows>,
    metas: Record<string, unknown>
  ): Promise<void>;
  getMixes(): Promise<MixRow[]>;
  putMix(row: MixRow): Promise<void>;
  deleteMix(url: string, deletedAt?: number): Promise<void>;
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

/** The `mixes` table row; `row` is null on a tombstone. */
interface MixServerRow {
  spotify_account_id: string;
  url: string;
  saved_at: number;
  deleted_at: number | null;
  row: unknown;
}

async function readMixStamps(
  deps: SyncDeps,
  token: string,
  account: string
): Promise<ServerResult<MixStamp[]>> {
  const res = await deps.client.select<
    Pick<MixServerRow, 'url' | 'saved_at' | 'deleted_at'>
  >(
    'mixes',
    { select: 'url,saved_at,deleted_at', spotify_account_id: `eq.${account}` },
    token
  );
  if (!res.ok) return res;
  return ok(
    res.value.rows.map((r) => ({
      url: r.url,
      savedAt: r.saved_at,
      deletedAt: r.deleted_at,
    }))
  );
}

/** Row by row with tombstones (US2): the newer of save and deletion wins. */
async function pushMixes(
  deps: SyncDeps,
  token: string,
  account: string
): Promise<ServerResult<boolean>> {
  const stamps = await readMixStamps(deps, token, account);
  if (!stamps.ok) return stamps;
  const local = await deps.repo.getMixes();
  const deleted = await deps.repo.getMixDeleted();
  const plan = planMixes(local, stamps.value, deleted);
  const rows: MixServerRow[] = [
    ...plan.push.map((row) => ({
      spotify_account_id: account,
      url: row.url,
      saved_at: row.savedAt,
      deleted_at: null,
      row,
    })),
    ...plan.tombstones.map((d) => ({
      spotify_account_id: account,
      url: d.url,
      saved_at: d.deletedAt,
      deleted_at: d.deletedAt,
      row: null,
    })),
  ];
  let done = 0;
  deps.onState({
    status: 'pushing',
    dataset: 'mixes',
    done,
    total: rows.length,
  });
  for (const batch of batches(rows, MIX_BATCH)) {
    const res = await deps.client.upsert('mixes', batch, token);
    if (!res.ok) return res;
    done += batch.length;
    deps.onState({
      status: 'pushing',
      dataset: 'mixes',
      done,
      total: rows.length,
    });
  }
  // Every local deletion is settled now: pushed, or superseded by the server.
  await deps.repo.clearMixDeleted(deleted.map((d) => d.url));
  return ok(rows.length > 0);
}

async function pullMixes(
  deps: SyncDeps,
  token: string,
  account: string
): Promise<ServerResult<{ changed: boolean; rejected: number }>> {
  const stamps = await readMixStamps(deps, token, account);
  if (!stamps.ok) return stamps;
  const local = await deps.repo.getMixes();
  const deleted = await deps.repo.getMixDeleted();
  const plan = planMixes(local, stamps.value, deleted);
  let rejected = 0;
  let changed = false;
  if (plan.pull.length > 0) {
    // The full rows once, filtered here: never a list of urls in the query
    // (security review S8).
    const wanted = new Set(plan.pull);
    const full = await deps.client.select<MixServerRow>(
      'mixes',
      { select: '*', spotify_account_id: `eq.${account}` },
      token
    );
    if (!full.ok) return full;
    deps.onState({
      status: 'pulling',
      dataset: 'mixes',
      done: 0,
      total: plan.pull.length,
    });
    for (const item of full.value.rows) {
      if (!wanted.has(item.url) || item.deleted_at !== null) continue;
      const checked = validateMix(item.row);
      if (!checked.ok || checked.row.url !== item.url) {
        rejected++;
        continue;
      }
      await deps.repo.putMix(checked.row);
      changed = true;
    }
  }
  for (const url of plan.deleteLocal) {
    const stamp = stamps.value.find((s) => s.url === url);
    await deps.repo.deleteMix(url, stamp?.deletedAt ?? deps.now());
    changed = true;
  }
  return ok({ changed, rejected });
}

export const PAGE_SIZE = 1000;
/** A saved mix is a few KB of rows; fifty keep a body well under 1 MB. */
export const MIX_BATCH = 50;
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
  if (names.includes('mixes')) {
    const res = await pushMixes(deps, token.value, account);
    if (!res.ok) return res;
    if (res.value) pushed.push('mixes');
    await clearPending(deps.repo, 'mixes');
  }
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
  const mixes = await pullMixes(deps, token.value, account);
  if (!mixes.ok) return mixes;
  outcome.rejected += mixes.value.rejected;
  const jobs = await pullJobs(deps, token.value);
  if (!jobs.ok) return jobs;
  outcome.rejected += jobs.value.rejected;
  if (mixes.value.changed || jobs.value.applied > 0) {
    outcome.pulled.push('mixes');
  }
  await deps.repo.putMeta(SERVER_LAST_SYNC_META, deps.now());
  return ok(outcome);
}

/* ---------- identify requests (worker round, contracts/client-api.md) ---------- */

const JOB_KIND = 'identify-mix';
const JOB_FIELDS =
  'id,payload,status,claimed_by,claimed_at,finished_at,error,created_at,applied_at';
/** Round 004's columns (migration 0003); read only when the server has them. */
const JOB_FIELDS_0003 = `${JOB_FIELDS},progress,priority,stop_requested_at`;
/** A server without 0003 answers "column … does not exist" (PostgREST 42703). */
function missingColumn(message: string): boolean {
  return /does not exist|42703/i.test(message);
}
/** Requests kept per link on the Mix screen (FR-003). */
export const JOB_HISTORY_MAX = 20;
const UNEXPECTED_JOB_ROW =
  'The server answered an unexpected request row. Sync and try again.';

/**
 * The "Identify on my computer" tap: one open request per link (FR-004),
 * else one insert. Never a Spotify call, never a fetch of the platform.
 */
export async function requestIdentify(
  client: ServerClient,
  token: string,
  url: string
): Promise<ServerResult<MixJobView | 'exists'>> {
  const open = await client.select<{ id: string }>(
    'jobs',
    {
      select: 'id',
      kind: `eq.${JOB_KIND}`,
      'payload->>url': `eq.${url}`,
      status: 'in.(queued,claimed)',
    },
    token
  );
  if (!open.ok) return open;
  if (open.value.rows.length > 0) return ok('exists');
  const created = await client.insert<unknown>(
    'jobs',
    { kind: JOB_KIND, payload: { url } },
    token
  );
  if (!created.ok) return created;
  const view = jobView(created.value);
  if (view === null)
    return { ok: false, kind: 'error', message: UNEXPECTED_JOB_ROW };
  return ok(view);
}

/** The saved mix a result lands on: merged into the local one, or new. */
function mixWithResult(
  local: MixRow | undefined,
  url: string,
  row: MixJobRow,
  parsed: Extract<ReturnType<typeof resultToRows>, { ok: true }>,
  now: number
): MixRow {
  const identifiedAt =
    row.finished_at !== null ? Date.parse(row.finished_at) : now;
  if (local) {
    return {
      ...local,
      title: local.title ?? parsed.title,
      author: local.author ?? parsed.author,
      sources: { ...local.sources, worker: true },
      // A later result keeps the review (T125, owner D1).
      rows: mergeKeepingReview(local.rows, parsed.rows, local.removed ?? []),
      // Set-wide clues come from the worker alone: a new result replaces them.
      ...(parsed.clues.length > 0
        ? { clues: parsed.clues }
        : { clues: undefined }),
      // The run describes the last result only: replaced wholesale (T124).
      run: parsed.run,
      identifyJobId: row.id,
      identifiedAt,
      savedAt: now,
    };
  }
  return {
    url,
    title: parsed.title,
    author: parsed.author,
    playerSrc: null,
    slug: null,
    sources: {
      trackid: false,
      description: false,
      pasted: false,
      linkOut: null,
      worker: true,
    },
    rows: parsed.rows,
    ...(parsed.clues.length > 0 ? { clues: parsed.clues } : {}),
    ...(parsed.run ? { run: parsed.run } : {}),
    identifyJobId: row.id,
    identifiedAt,
    savedAt: now,
  };
}

/**
 * The request history per link (validated, newest first, capped) and the
 * apply of every done, unapplied result, oldest first: the rows join the
 * saved mix, the next push carries it, and `applied_at` is set with an
 * `is.null` guard so a second device skips it (data-model.md). A result the
 * safety check refuses is counted, flagged `rejected` locally, never marked.
 */
async function pullJobs(
  deps: SyncDeps,
  token: string
): Promise<ServerResult<{ rejected: number; applied: number }>> {
  const rows: MixJobRow[] = [];
  let rejected = 0;
  let fields = JOB_FIELDS_0003;
  for (let from = 0; ; from += PAGE_SIZE) {
    let page = await deps.client.select<unknown>(
      'jobs',
      { select: fields, kind: `eq.${JOB_KIND}`, order: 'created_at.desc' },
      token,
      [from, from + PAGE_SIZE - 1]
    );
    if (!page.ok && fields !== JOB_FIELDS && missingColumn(page.message)) {
      // Migration 0003 not applied yet: the requests still sync, without
      // progress or queue order.
      fields = JOB_FIELDS;
      page = await deps.client.select<unknown>(
        'jobs',
        { select: fields, kind: `eq.${JOB_KIND}`, order: 'created_at.desc' },
        token,
        [from, from + PAGE_SIZE - 1]
      );
    }
    if (!page.ok) return page;
    for (const raw of page.value.rows) {
      const valid = validateJobRow(raw);
      if (valid === null) rejected++;
      else rows.push(valid);
    }
    if (page.value.rows.length < PAGE_SIZE) break;
  }
  const previous = (await deps.repo.getMeta<MixJobs>(MIX_JOBS_META)) ?? {};
  const wasRejected = new Set(
    Object.values(previous)
      .flat()
      .filter((v) => v.rejected)
      .map((v) => v.id)
  );
  const jobs: MixJobs = {};
  const views = new Map<string, MixJobView>();
  for (const row of rows) {
    const list = (jobs[row.payload.url] ??= []);
    if (list.length >= JOB_HISTORY_MAX) continue;
    const view = jobView(row);
    if (view === null) continue;
    if (wasRejected.has(view.id)) view.rejected = true;
    list.push(view);
    views.set(view.id, view);
  }
  let applied = 0;
  const pending = rows
    .filter((r) => r.status === 'done' && r.applied_at === null)
    .reverse();
  for (const row of pending) {
    const view = views.get(row.id);
    const res = await deps.client.select<{ result: unknown }>(
      'jobs',
      { select: 'result', id: `eq.${row.id}` },
      token
    );
    if (!res.ok) return res;
    const parsed = resultToRows(res.value.rows[0]?.result);
    if (!parsed.ok) {
      rejected++;
      if (view) view.rejected = true;
      continue;
    }
    const url = row.payload.url;
    const local = (await deps.repo.getMixes()).find((m) => m.url === url);
    const now = deps.now();
    await deps.repo.putMix(mixWithResult(local, url, row, parsed, now));
    const flags =
      (await deps.repo.getMeta<ServerPending>(SERVER_PENDING_META)) ?? {};
    flags.mixes = true;
    await deps.repo.putMeta(SERVER_PENDING_META, flags);
    const marked = await deps.client.update<unknown>(
      'jobs',
      { id: `eq.${row.id}`, applied_at: 'is.null' },
      { applied_at: new Date(now).toISOString() },
      token
    );
    if (!marked.ok) return marked;
    if (view && marked.value.length > 0) view.appliedAt = now;
    applied++;
  }
  await deps.repo.putMeta(MIX_JOBS_META, jobs);
  return ok({ rejected, applied });
}

/** The four tables, children first; a filter every visible row matches. */
const REMOVE_ORDER = ['dataset_rows', 'datasets', 'mixes', 'jobs'] as const;
const SERVER_METAS = [
  SERVER_STAMPS_META,
  SERVER_PENDING_META,
  SERVER_LAST_SYNC_META,
  MIX_DELETED_META,
  MIX_JOBS_META,
] as const;

/**
 * Removes every byte of the owner's data from the server (FR-014), then
 * forgets what this device knew about the server. Local data and the
 * Spotify account id stay. Row Level Security limits the deletes to the
 * owner; the filter only satisfies PostgREST's "no unfiltered delete" rule.
 */
export async function runRemoveAll(
  deps: SyncDeps
): Promise<ServerResult<void>> {
  const token = await deps.token();
  if (!token.ok) return token;
  for (const table of REMOVE_ORDER) {
    const res = await deps.client.remove(
      table,
      { owner_id: 'not.is.null' },
      token.value
    );
    if (!res.ok) {
      return { ...res, message: `Could not clear ${table}: ${res.message}` };
    }
  }
  for (const name of SERVER_METAS) await deps.repo.deleteMeta(name);
  return ok(undefined);
}

/** `storage_used()`: the database size in bytes, for the Settings share. */
export async function readUsage(deps: SyncDeps): Promise<ServerResult<number>> {
  const token = await deps.token();
  if (!token.ok) return token;
  const res = await deps.client.rpc<unknown>('storage_used', token.value);
  if (!res.ok) return res;
  const n = Number(res.value);
  return Number.isFinite(n)
    ? ok(n)
    : { ok: false, kind: 'error', message: 'storage_used() gave no number.' };
}

/* ---------- queue control from the phone (round 004) ---------- */

/** Removes a waiting request; a request already taken is left alone. */
export async function cancelRequest(
  client: ServerClient,
  token: string,
  id: string
): Promise<ServerResult<'cancelled' | 'gone'>> {
  const res = await client.removeReturning<unknown>(
    'jobs',
    { id: `eq.${id}`, status: 'eq.queued', select: 'id' },
    token
  );
  if (!res.ok) return res;
  return ok(res.value.length > 0 ? 'cancelled' : 'gone');
}

/** Makes a waiting request the next one the worker takes. */
export async function moveRequestToTop(
  client: ServerClient,
  token: string,
  id: string
): Promise<ServerResult<'moved' | 'gone'>> {
  const top = await client.select<{ priority: number }>(
    'jobs',
    {
      select: 'priority',
      kind: `eq.${JOB_KIND}`,
      status: 'eq.queued',
      order: 'priority.desc',
    },
    token,
    [0, 0]
  );
  if (!top.ok) return top;
  const highest = top.value.rows[0]?.priority;
  const next =
    (typeof highest === 'number' && Number.isFinite(highest) ? highest : 0) + 1;
  const res = await client.update<unknown>(
    'jobs',
    { id: `eq.${id}`, status: 'eq.queued' },
    { priority: next },
    token
  );
  if (!res.ok) return res;
  return ok(res.value.length > 0 ? 'moved' : 'gone');
}

/** Asks the worker to stop a running request; it keeps what it found. */
export async function stopRequest(
  client: ServerClient,
  token: string,
  id: string,
  now: number
): Promise<ServerResult<'asked' | 'gone'>> {
  const res = await client.update<unknown>(
    'jobs',
    { id: `eq.${id}`, status: 'eq.claimed' },
    { stop_requested_at: new Date(now).toISOString() },
    token
  );
  if (!res.ok) return res;
  return ok(res.value.length > 0 ? 'asked' : 'gone');
}
