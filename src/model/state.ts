import { computed, signal } from '@preact/signals';
import { auth } from '../auth/browser';
import { getAllRows, getMeta, putMeta, wipeDb } from '../db/repo';
import {
  PASS_BY_ID,
  candidateIds,
  runLookup,
  type LookupState,
} from '../features/lookup';
import type { LibraryTrack } from '../features/rekordbox-match';
import {
  REKORDBOX_SUMMARY_META,
  runRekordboxImport,
  type RekordboxState,
  type RekordboxSummary,
} from '../features/rekordboxImport';
import {
  HISTORY_SUMMARY_META,
  runImport,
  type ImportState,
  type ImportSummary,
} from '../history/importer';
import { api } from '../spotify/api';
import {
  ACCOUNT_SWITCH_CONFIRM,
  ACCOUNT_SWITCH_NOTICE,
  LAST_SYNC_META,
  SYNC_STATE_META,
  runSync,
  type SyncState,
} from '../sync/runner';
import { formatDateTime } from '../ui/format';
import { describeError } from '../util/errors';
import { buildModel, type Model } from './aggregate';
import { errorBanner, warnBanner, type BannerMessage } from './banner';
import { resolveFeature } from './features';

export const model = signal<Model | null>(null);
export const syncState = signal<SyncState>({ status: 'idle' });
export const importState = signal<ImportState>({ status: 'idle' });
export const lastSyncAt = signal<number | null>(null);
export const historySummary = signal<ImportSummary | null>(null);
export const lookupState = signal<LookupState>({ status: 'idle' });
export const rekordboxState = signal<RekordboxState>({ status: 'idle' });
export const rekordboxSummary = signal<RekordboxSummary | null>(null);
export const banner = signal<BannerMessage | null>(null);

export type KeyNotation = 'camelot' | 'open' | 'classic';

const KEY_NOTATION_KEY = 'keyNotation';

/** `getItem` returns `string | null`, so narrow before trusting it. */
function storedNotation(): KeyNotation {
  try {
    const saved = localStorage.getItem(KEY_NOTATION_KEY);
    if (saved === 'camelot' || saved === 'open' || saved === 'classic') {
      return saved;
    }
  } catch {
    // Private mode or storage blocked: Camelot, and nothing is persisted.
  }
  return 'camelot';
}

/** Which notation every key pill prints. Default Camelot (spec §5). */
export const keyNotation = signal<KeyNotation>(storedNotation());

export function setKeyNotation(value: KeyNotation): void {
  keyNotation.value = value;
  try {
    localStorage.setItem(KEY_NOTATION_KEY, value);
  } catch {
    // The choice still applies to this session.
  }
}

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
  banner.value = warnBanner(CRATE_NOTICE);
  noticePending = true;
}

/** The banner's close button: dismissing the re-import notice retires it. */
export function dismissBanner(): void {
  const wasNotice = banner.value?.text === CRATE_NOTICE;
  banner.value = null;
  if (wasNotice && noticePending) void markNoticeShown();
}

/** A sync or an import clears its own message, never a pending notice. */
function clearBanner(): void {
  if (banner.value?.text !== CRATE_NOTICE) banner.value = null;
}

export async function loadFromDb(): Promise<void> {
  try {
    model.value = buildModel(await getAllRows());
    lastSyncAt.value = (await getMeta<number>(LAST_SYNC_META)) ?? null;
    const saved = await getMeta<SyncState>(SYNC_STATE_META);
    if (saved && saved.status !== 'running') syncState.value = saved;
    historySummary.value =
      (await getMeta<ImportSummary>(HISTORY_SUMMARY_META)) ?? null;
    rekordboxSummary.value =
      (await getMeta<RekordboxSummary>(REKORDBOX_SUMMARY_META)) ?? null;
    if (crateStatus.value === 'reimport') await showCrateNotice();
  } catch (err) {
    banner.value = errorBanner(
      `Could not open local storage: ${describeError(err)}`
    );
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
    banner.value = warnBanner(lockMessage(current.retryAt));
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
  // Set only when the owner accepted the wipe, so the banner below explains
  // the cards that just emptied themselves.
  let accountSwitched = false;
  await runSync(
    {
      client: api,
      now: () => Date.now(),
      onState: (state) => {
        syncState.value = state;
      },
      confirmAccountSwitch: () => {
        const ok = confirm(ACCOUNT_SWITCH_CONFIRM);
        if (ok) accountSwitched = true;
        return ok;
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
  // Settings prints the same sync failure and the same lock in its own card.
  if (state.status === 'error') {
    banner.value = errorBanner(state.message, ['settings']);
  }
  if (state.status === 'locked') {
    banner.value = warnBanner(lockMessage(state.retryAt));
  }
  // Last, so it wins the banner: an error or a lock is still on the Settings
  // card, but nothing else on screen says why the data went away. It is a
  // notice, not a failure, so it is amber and never suppressed.
  if (accountSwitched) banner.value = warnBanner(ACCOUNT_SWITCH_NOTICE);
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
    currentRange: historySummary.value?.range ?? null,
    confirmReplace: (question) => confirm(question),
    onState: (state) => {
      importState.value = state;
    },
  });
  await loadFromDb();
  const state = importState.value;
  if (state.status === 'error') {
    banner.value = errorBanner(state.message, ['import']);
  }
}

export interface Coverage {
  total: number;
  covered: number;
  reccobeats: number;
  rekordbox: number;
}

/** A source value counts only once it carries a BPM or a key. */
function hasValue(v: { bpm: number | null; key: number | null }): boolean {
  return v.bpm !== null || v.key !== null;
}

/**
 * Spec §5's coverage line. `total` is every candidate id — §3's universe,
 * not the ids a lookup would still fetch, which would shrink to zero as the
 * lookup succeeds — and `covered` counts the ids that resolve to at least a
 * BPM or a key. The two source counts overlap on purpose: a track with both
 * a Rekordbox and a ReccoBeats value is counted in both, which is why they
 * can add up to more than `covered`.
 */
export function coverage(m: Model): Coverage {
  const candidates = candidateIds(m);
  let covered = 0;
  let reccobeats = 0;
  let rekordbox = 0;
  for (const candidate of candidates) {
    const row = m.features.get(candidate.id);
    if (!row) continue;
    // resolveFeature is already null unless a BPM or a key survived, which
    // is spec §5's counting rule word for word.
    if (resolveFeature(row)) covered++;
    if (row.rekordbox && hasValue(row.rekordbox)) rekordbox++;
    const recco = row.reccobeats;
    // A notFound marker is a checked id, not a value.
    if (recco && !('notFound' in recco) && hasValue(recco)) reccobeats++;
  }
  return { total: candidates.length, covered, reccobeats, rekordbox };
}

/**
 * The Rekordbox matcher works on Spotify tracks only: a local file has no
 * id to hang a FeatureRow on. Built with a loop rather than
 * `.filter().map()` so `id` narrows from `string | null` to `string`.
 */
function libraryTracks(m: Model): LibraryTrack[] {
  const out: LibraryTrack[] = [];
  for (const track of m.tracksByKey.values()) {
    if (track.isLocal || track.id === null) continue;
    out.push({
      id: track.id,
      name: track.name,
      artists: track.artists.map((a) => a.name),
      durationMs: track.durationMs,
    });
  }
  return out;
}

/** Never on load: the ReccoBeats lookup runs only from this button. */
export async function startLookup(): Promise<void> {
  if (lookupState.value.status === 'running') return;
  const m = model.value;
  if (!m) return;
  clearBanner();
  // Claimed synchronously so a second tap cannot start a second lookup.
  // `as LookupState` keeps the signal at its declared union type: without
  // it TypeScript narrows lookupState.value to this literal for the rest of
  // the function, as in startSync.
  lookupState.value = {
    status: 'running',
    pass: PASS_BY_ID,
    done: 0,
    total: 0,
  } as LookupState;
  // The existing rows come from the model, not from a fresh IndexedDB read:
  // every path that writes a FeatureRow reloads the model afterwards, and a
  // rejected read here would leave the state stuck on `running` forever,
  // because runLookup itself never throws.
  await runLookup(
    {
      // Bare `fetch` throws "Illegal invocation" once unbound from window.
      fetchFn: (input, init) => fetch(input, init),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now: () => Date.now(),
      onState: (state) => {
        lookupState.value = state;
      },
    },
    candidateIds(m),
    [...m.features.values()]
  );
  // Rows written batch by batch: reload even after an error, so a partial
  // run still shows its coverage.
  await loadFromDb();
  const state = lookupState.value;
  if (state.status === 'error') {
    banner.value = errorBanner(state.message, ['settings']);
  }
}

export async function startRekordboxImport(file: File): Promise<void> {
  if (rekordboxState.value.status === 'running') return;
  const m = model.value;
  if (!m) return;
  clearBanner();
  await runRekordboxImport(file, {
    createWorker: () =>
      new Worker(new URL('../features/rekordbox.worker.ts', import.meta.url), {
        type: 'module',
      }),
    library: libraryTracks(m),
    // Same reason as startLookup: the model is the freshest copy of the
    // rows, and a merge that dropped them would erase every ReccoBeats
    // value the matched tracks already hold.
    existing: [...m.features.values()],
    now: () => Date.now(),
    onState: (state) => {
      rekordboxState.value = state;
    },
  });
  await loadFromDb();
  const state = rekordboxState.value;
  if (state.status === 'error') {
    banner.value = errorBanner(state.message, ['settings']);
  }
}

export async function disconnect(): Promise<void> {
  if (
    syncState.value.status === 'running' ||
    importState.value.status === 'running' ||
    lookupState.value.status === 'running' ||
    rekordboxState.value.status === 'running'
  ) {
    banner.value = warnBanner(
      'Wait for the current sync, history import, lookup or Rekordbox import to finish before disconnecting.'
    );
    return;
  }
  try {
    await wipeDb();
  } catch (err) {
    banner.value = errorBanner(
      `Could not delete local data: ${describeError(err)}`
    );
    return;
  }
  auth.clearAll();
  model.value = null;
  syncState.value = { status: 'idle' };
  importState.value = { status: 'idle' };
  lookupState.value = { status: 'idle' };
  rekordboxState.value = { status: 'idle' };
  lastSyncAt.value = null;
  historySummary.value = null;
  rekordboxSummary.value = null;
  banner.value = null;
  // keyNotation is a display preference, not data: it survives a wipe.
}
