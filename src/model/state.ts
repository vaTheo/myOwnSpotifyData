import { computed, signal } from '@preact/signals';
import { auth } from '../auth/browser';
import { getAllRows, getMeta, putMeta, wipeDb } from '../db/repo';
import {
  HISTORY_SUMMARY_META,
  runImport,
  type ImportState,
  type ImportSummary,
} from '../history/importer';
import { api } from '../spotify/api';
import {
  LAST_SYNC_META,
  SYNC_STATE_META,
  runSync,
  type SyncState,
} from '../sync/runner';
import { formatDateTime } from '../ui/format';
import { buildModel, type Model } from './aggregate';

export const model = signal<Model | null>(null);
export const syncState = signal<SyncState>({ status: 'idle' });
export const importState = signal<ImportState>({ status: 'idle' });
export const lastSyncAt = signal<number | null>(null);
export const historySummary = signal<ImportSummary | null>(null);
export const banner = signal<string | null>(null);

export const CRATE_NOTICE_META = 'crateNoticeShown';

const CRATE_NOTICE = 'The new Crate views need your history imported again.';

export type CrateStatus = 'empty' | 'reimport' | 'ready';

/**
 * What the Crate can show: an import made before the month buckets existed
 * carries no `version`, so it is detected from the summary and never by
 * sniffing rows.
 */
export const crateStatus = computed<CrateStatus>(() => {
  const summary = historySummary.value;
  if (!summary) return 'empty';
  return summary.version === 2 ? 'ready' : 'reimport';
});

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * The re-import notice is said once per browser; the hub's re-import card
 * carries it from then on. The meta flag is written when the user closes the
 * banner (`dismissBanner`) or on the next `loadFromDb` after the notice has
 * been on screen, so a sync or an import started before it was read no longer
 * retires it unseen. A reload with the notice still open counts as unshown and
 * says it one more time.
 */
let noticePending = false;

async function markNoticeShown(): Promise<void> {
  noticePending = false;
  await putMeta(CRATE_NOTICE_META, true);
}

async function showCrateNotice(): Promise<void> {
  // Already shown earlier in this session: it has had its turn.
  if (noticePending) return markNoticeShown();
  if ((await getMeta<boolean>(CRATE_NOTICE_META)) === true) return;
  banner.value = CRATE_NOTICE;
  noticePending = true;
}

/** The banner's close button: dismissing the re-import notice retires it. */
export function dismissBanner(): void {
  const wasNotice = banner.value === CRATE_NOTICE;
  banner.value = null;
  if (wasNotice && noticePending) void markNoticeShown();
}

/** A sync or an import clears its own message, never a pending notice. */
function clearBanner(): void {
  if (banner.value !== CRATE_NOTICE) banner.value = null;
}

export async function loadFromDb(): Promise<void> {
  try {
    model.value = buildModel(await getAllRows());
    lastSyncAt.value = (await getMeta<number>(LAST_SYNC_META)) ?? null;
    const saved = await getMeta<SyncState>(SYNC_STATE_META);
    if (saved && saved.status !== 'running') syncState.value = saved;
    historySummary.value =
      (await getMeta<ImportSummary>(HISTORY_SUMMARY_META)) ?? null;
    if (crateStatus.value === 'reimport') await showCrateNotice();
  } catch (err) {
    banner.value = `Could not open local storage: ${describeError(err)}`;
  }
}

async function acquireWakeLock(): Promise<() => Promise<void>> {
  const sentinel = await navigator.wakeLock.request('screen');
  return () => sentinel.release();
}

function lockMessage(retryAt: number): string {
  return `Spotify quota reached. Sync again after ${formatDateTime(retryAt)}.`;
}

/** True while a sync is running or the quota lock-out has not lapsed. */
export function isSyncBusy(state: SyncState, now = Date.now()): boolean {
  return (
    state.status === 'running' ||
    (state.status === 'locked' && state.retryAt > now)
  );
}

export async function startSync(priorityId?: string): Promise<void> {
  const current = syncState.value;
  if (current.status === 'running') return;
  if (current.status === 'locked' && current.retryAt > Date.now()) {
    banner.value = lockMessage(current.retryAt);
    return;
  }
  clearBanner();
  // Claim the running state synchronously so a second tap cannot start a
  // second sync before runSync reports its first state. `as SyncState` keeps
  // the signal at its declared union type: without it TypeScript narrows
  // syncState.value to this literal for the rest of the function.
  syncState.value = {
    status: 'running',
    done: 0,
    total: 0,
    current: null,
    pending: [],
  } as SyncState;
  await runSync(
    {
      client: api,
      now: () => Date.now(),
      onState: (state) => {
        syncState.value = state;
      },
      acquireWakeLock: 'wakeLock' in navigator ? acquireWakeLock : undefined,
    },
    { priorityId }
  );
  await loadFromDb();
  const state = syncState.value;
  if (state.status === 'error' && state.auth) {
    // Not allow-listed or login expired: back to the Connect screen with the reason.
    auth.lastAuthError.value = state.message;
    auth.logout();
    return;
  }
  if (state.status === 'error') banner.value = state.message;
  if (state.status === 'locked') banner.value = lockMessage(state.retryAt);
}

export async function startImport(files: File[]): Promise<void> {
  if (importState.value.status === 'running') return;
  clearBanner();
  await runImport(files, {
    createWorker: () =>
      new Worker(new URL('../history/import.worker.ts', import.meta.url), {
        type: 'module',
      }),
    knownTrackIds: new Set(model.value?.tracksByKey.keys() ?? []),
    now: () => Date.now(),
    onState: (state) => {
      importState.value = state;
    },
  });
  await loadFromDb();
  const state = importState.value;
  if (state.status === 'error') banner.value = state.message;
}

export async function disconnect(): Promise<void> {
  if (
    syncState.value.status === 'running' ||
    importState.value.status === 'running'
  ) {
    banner.value =
      'Wait for the current sync or import to finish before disconnecting.';
    return;
  }
  try {
    await wipeDb();
  } catch (err) {
    banner.value = `Could not delete local data: ${describeError(err)}`;
    return;
  }
  auth.clearAll();
  model.value = null;
  syncState.value = { status: 'idle' };
  importState.value = { status: 'idle' };
  lastSyncAt.value = null;
  historySummary.value = null;
  banner.value = null;
}
