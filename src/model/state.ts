import { signal } from '@preact/signals';
import { auth } from '../auth/browser';
import { getAllRows, getMeta, wipeDb } from '../db/repo';
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

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function loadFromDb(): Promise<void> {
  try {
    model.value = buildModel(await getAllRows());
    lastSyncAt.value = (await getMeta<number>(LAST_SYNC_META)) ?? null;
    const saved = await getMeta<SyncState>(SYNC_STATE_META);
    if (saved && saved.status !== 'running') syncState.value = saved;
    historySummary.value =
      (await getMeta<ImportSummary>(HISTORY_SUMMARY_META)) ?? null;
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

export async function startSync(priorityId?: string): Promise<void> {
  const current = syncState.value;
  if (current.status === 'running') return;
  if (current.status === 'locked' && current.retryAt > Date.now()) {
    banner.value = lockMessage(current.retryAt);
    return;
  }
  banner.value = null;
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
  banner.value = null;
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
