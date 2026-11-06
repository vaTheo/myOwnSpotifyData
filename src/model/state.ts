import { computed, signal } from '@preact/signals';
import { auth } from '../auth/browser';
import {
  DB_BLOCKED_MESSAGE,
  DB_SLOW_MESSAGE,
  DB_SLOW_MS,
  DB_SUPERSEDED_MESSAGE,
  clearMixDeleted,
  deleteMeta,
  deleteMix,
  getAllRows,
  getMeta,
  getMixDeleted,
  getMixes,
  putMeta,
  putMix,
  replaceDataset,
  setDbEvents,
  wipeDb,
} from '../db/repo';
import {
  DB_VERSION,
  MIX_JOBS_META,
  SERVER_LAST_SYNC_META,
  SERVER_PENDING_META,
  SERVER_STAMPS_META,
  type MixJobView,
  type MixJobs,
  type MixRow,
  type RemovedTrack,
  type ServerPending,
  type ServerStamps,
  type TracklistRow,
} from '../db/schema';
import { jsonp } from '../features/jsonp';
import {
  editTracklistRow,
  hasManualRows,
  lookupMix,
} from '../features/mix/lookup';
import { recordRemoved } from '../features/mix/keepReview';
import { parseDescription, parsePasted } from '../features/mix/parse';
import { parseTracklistifyJson } from '../features/mix/tracklistify';
import { classifyMixInput, isShortLink, requestKey } from '../features/mix/url';
import { queueFailure, queueNote } from '../features/mix/queue';
import { requestStatusText } from '../features/mix/worker';
import { runCreatePlaylist } from '../features/mix/createPlaylist';
import { canCreatePlaylists } from '../features/mix/spotifySearch';
import {
  canLikeTracks,
  isLiking,
  likeCandidates,
  likeQuestion,
  runLikePlaylist,
} from '../features/like/likePlaylist';
import {
  PASS_BY_ID,
  candidateIds,
  runLookup,
  type LookupState,
} from '../features/lookup';
import {
  ARTIST_REACH_SUMMARY_META,
  reachCandidates,
  runReach,
  type ArtistReachSummary,
  type ReachState,
} from '../features/reachRun';
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
import { LINK_BROWSER_MESSAGE, type ServerResult } from '../server/client';
import { serverAuth, serverClient, serverConfigured } from '../server/browser';
import { DATASETS } from '../server/datasets';
import {
  JOB_HISTORY_MAX,
  UPDATE_APP_MESSAGE,
  readUsage,
  requestIdentify,
  runPull,
  cancelRequest,
  moveRequestToTop,
  stopRequest,
  runPush,
  runRemoveAll,
  type PushName,
  type SyncDeps,
} from '../server/sync';
import type { ServerStatus } from '../server/types';
import { api } from '../spotify/api';
import type { ApiProfile } from '../spotify/types';
import {
  ACCOUNT_META,
  ACCOUNT_MISMATCH_NOTICE,
  ACCOUNT_SWITCH_CONFIRM,
  ACCOUNT_SWITCH_NOTICE,
  LAST_SYNC_META,
  SYNC_STATE_META,
  resolveConnectedAccount,
  runSync,
  type SyncState,
} from '../sync/runner';
import { formatDateTime } from '../ui/format';
import { describeError, storageMessage } from '../util/errors';
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
export const reachState = signal<ReachState>({ status: 'idle' });
export const artistReachSummary = signal<ArtistReachSummary | null>(null);
export const banner = signal<BannerMessage | null>(null);

/**
 * The owner's server (ADR-08), as the Settings server card renders it. The
 * types live in `server/types.ts` so the runners can report without
 * importing this module.
 */
export type { ServerStampView, ServerStatus } from '../server/types';

export const SUPABASE_DASHBOARD_URL = 'https://supabase.com/dashboard';

/** The server session and the "link sent" notice, for the Settings card. */
export const serverSession = serverAuth.session;
export const serverLinkSent = serverAuth.linkSent;

function serverBaseState(): ServerStatus {
  if (!serverConfigured) return { status: 'unset' };
  if (!serverAuth.session.value) return { status: 'signedOut' };
  return {
    status: 'connected',
    lastSyncAt: null,
    usedBytes: null,
    stamps: [],
    rejected: 0,
  };
}

export const serverState = signal<ServerStatus>(serverBaseState());

/** True while a server pull rebuilds the model; part of jobsBusy(). */
const serverPulling = signal(false);

/** The last successful push or pull, for the card in every state. */
export const serverLastSyncAt = signal<number | null>(null);

/** The Free plan's database allowance, for the used share (SC-004). */
export const SERVER_FREE_BYTES = 500 * 1024 * 1024;

export const REMOVE_SERVER_DATA_CONFIRM =
  'Remove all your data from the server? Local data on this browser is kept.';

function serverDeps(): SyncDeps {
  return {
    client: serverClient,
    token: () => serverAuth.getAccessToken(),
    repo: {
      getAllRows,
      getMeta,
      putMeta,
      deleteMeta,
      replaceDataset,
      getMixes,
      putMix,
      deleteMix,
      getMixDeleted,
      clearMixDeleted,
    },
    now: () => Date.now(),
    onState: (state) => {
      serverState.value = state;
    },
    dbVersion: DB_VERSION,
  };
}

/** What a failed runner result means for the card (D8): never a banner. */
function serverFailure(
  res: Extract<ServerResult<unknown>, { ok: false }>
): ServerStatus {
  switch (res.kind) {
    case 'offline':
      return { status: 'offline', message: res.message };
    case 'paused':
      return { status: 'paused', dashboardUrl: SUPABASE_DASHBOARD_URL };
    case 'unauthorized':
      return serverAuth.session.value
        ? { status: 'error', message: res.message }
        : {
            status: 'error',
            message: `Signed out of the server: ${res.message}`,
          };
    default:
      return { status: 'error', message: res.message };
  }
}

/** The connected card: last sync, the per-dataset table, the used share. */
async function connectedView(rejected = 0): Promise<ServerStatus> {
  const rows = await getAllRows();
  const metas = {
    lastSyncAt: await getMeta<number>(LAST_SYNC_META),
    historySummary: await getMeta<ImportSummary>(HISTORY_SUMMARY_META),
    artistReachSummary: await getMeta<ArtistReachSummary>(
      ARTIST_REACH_SUMMARY_META
    ),
    rekordboxSummary: await getMeta<RekordboxSummary>(REKORDBOX_SUMMARY_META),
  };
  const seen = (await getMeta<ServerStamps>(SERVER_STAMPS_META)) ?? {};
  const previous = serverState.value;
  const usage = await readUsage(serverDeps());
  serverLastSyncAt.value =
    (await getMeta<number>(SERVER_LAST_SYNC_META)) ?? null;
  return {
    status: 'connected',
    lastSyncAt: serverLastSyncAt.value,
    usedBytes: usage.ok
      ? usage.value
      : previous.status === 'connected'
        ? previous.usedBytes
        : null,
    stamps: DATASETS.map((def) => ({
      name: def.name,
      localAt: def.stamp(rows, metas),
      serverAt: seen[def.name]?.fetchedAt ?? null,
      rows: seen[def.name]?.rows ?? null,
    })),
    rejected,
  };
}

let pushRunning = false;
let pushQueued = false;

/**
 * Flags the datasets as pending, then pushes everything pending, one push at
 * a time (a push started while one runs waits for it). Push reads only and
 * rebuilds no model, so it joins no jobsBusy(). A failed push keeps the
 * flags for the next open (FR-008); the card shows why, never a banner.
 */
export async function queueServerPush(
  names: readonly PushName[]
): Promise<void> {
  if (!serverConfigured) return;
  if (names.length > 0) {
    const pending = (await getMeta<ServerPending>(SERVER_PENDING_META)) ?? {};
    for (const name of names) pending[name] = true;
    await putMeta(SERVER_PENDING_META, pending);
  }
  if (!serverAuth.session.value) return;
  if (pushRunning) {
    pushQueued = true;
    return;
  }
  pushRunning = true;
  try {
    do {
      pushQueued = false;
      const pending = (await getMeta<ServerPending>(SERVER_PENDING_META)) ?? {};
      const list = Object.keys(pending) as PushName[];
      if (list.length === 0) break;
      const res = await runPush(serverDeps(), list);
      if (!res.ok) {
        serverState.value = serverFailure(res);
        break;
      }
      serverState.value = await connectedView();
    } while (pushQueued);
  } finally {
    pushRunning = false;
  }
}

/**
 * Pulls every dataset the server holds newer, then rebuilds the model. It
 * joins jobsBusy() (it writes the library stores) and is skipped, not
 * queued, while a job runs or the account notice is up. No Spotify read.
 * Answers whether it pulled (false: skipped, or failed into serverState).
 */
export async function startServerPull(): Promise<boolean> {
  if (!serverConfigured || !serverAuth.session.value) return false;
  if (jobsBusy()) return false;
  if (banner.value?.text === ACCOUNT_MISMATCH_NOTICE) return false;
  serverPulling.value = true;
  try {
    const res = await runPull(serverDeps());
    if (!res.ok) {
      serverState.value = serverFailure(res);
      if (res.message === ACCOUNT_MISMATCH_NOTICE) {
        banner.value = warnBanner(ACCOUNT_MISMATCH_NOTICE);
      }
      return false;
    }
    if (res.value.pulled.length > 0) {
      await loadFromDb();
      await loadSavedMixes();
    } else {
      // A request that only moved (waiting → running → failed) applies no
      // rows, but the Mix screen's request list still shows its new state.
      await reloadMixJobs();
    }
    serverState.value = await connectedView(res.value.rejected);
    if (res.value.stale.length > 0) {
      serverState.value = { status: 'error', message: UPDATE_APP_MESSAGE };
    }
  } finally {
    serverPulling.value = false;
  }
  // Whatever this device changed while the server was unreachable goes now.
  void queueServerPush([]);
  return true;
}

/** Signed in to Spotify and to the server: the automatic sync may run. */
export function serverAutoSyncEnabled(): boolean {
  return (
    serverConfigured &&
    serverAuth.session.value !== null &&
    auth.session.value !== null
  );
}

/** A request waits or runs on the computer: the Mix card is worth refreshing. */
export function hasActiveRequest(): boolean {
  return Object.values(mixJobs.value).some(
    (h) => h[0]?.status === 'queued' || h[0]?.status === 'claimed'
  );
}

/** The card's "Sync now with server", and the open: pending pushes, then a pull. */
export async function startServerSync(): Promise<void> {
  await queueServerPush([]);
  await startServerPull();
}

/**
 * Signs out of the server on this browser; local and server data stay. The
 * request states are the server's knowledge, so they leave with the session.
 */
export async function startServerSignOut(): Promise<void> {
  await serverAuth.signOut();
  serverState.value = serverBaseState();
  mixJobs.value = {};
  try {
    await deleteMeta(MIX_JOBS_META);
  } catch {
    // Nothing to show: the next pull rewrites it.
  }
}

/**
 * Removes every byte of the owner's data from the server, behind the one
 * new confirm (FR-014). Refused while a job runs, like Disconnect.
 */
export async function removeServerData(): Promise<void> {
  if (!serverConfigured || !serverAuth.session.value) return;
  if (jobsBusy()) {
    banner.value = warnBanner(
      'Wait for the current job to finish before removing server data.'
    );
    return;
  }
  if (!confirm(REMOVE_SERVER_DATA_CONFIRM)) return;
  const res = await runRemoveAll(serverDeps());
  if (res.ok) mixJobs.value = {};
  serverState.value = res.ok ? await connectedView() : serverFailure(res);
}

/**
 * One `/me` call on the Connect tap (research D11): stores the account id
 * when none is stored, keeps a differing one and says so. Never on load.
 */
export async function recordConnectedAccount(): Promise<void> {
  try {
    const me = await api.get<ApiProfile>('/me');
    const cached = await getMeta<string>(ACCOUNT_META);
    const outcome = resolveConnectedAccount(cached, me.id);
    if (outcome === 'set') await putMeta(ACCOUNT_META, me.id);
    if (outcome === 'mismatch')
      banner.value = warnBanner(ACCOUNT_MISMATCH_NOTICE);
  } catch (err) {
    banner.value = errorBanner(
      `Could not read the Spotify account: ${describeError(err)}`
    );
  }
}

/** Sends the magic link; the card then shows the generic "if this email…" line. */
export async function startServerLink(email: string): Promise<void> {
  if (!serverConfigured) return;
  const res = await serverAuth.requestLink(email.trim());
  if (res.ok) return;
  serverState.value =
    res.kind === 'paused'
      ? { status: 'paused', dashboardUrl: SUPABASE_DASHBOARD_URL }
      : { status: 'offline', message: res.message };
}

/**
 * Finishes the magic link when the app opens on `?link=server&code=…`
 * (main.tsx). An invalid link leaves the owner signed out with the one
 * message they can act on.
 */
export async function completeServerLink(
  params: URLSearchParams
): Promise<'none' | 'ok' | 'invalid'> {
  const result = await serverAuth.completeLink(params);
  if (result === 'ok') serverState.value = serverBaseState();
  if (result === 'invalid') {
    serverState.value = {
      status: 'error',
      message: serverAuth.lastError.value ?? LINK_BROWSER_MESSAGE,
    };
  }
  return result;
}

export interface MixView {
  url: string;
  title: string | null;
  author: string | null;
  playerSrc: string | null;
  sources: MixRow['sources'];
  /**
   * The description's parsed rows, kept so the "Replace with the description
   * tracklist" button has something to apply. Empty when the description held
   * no listing, and empty on reopen (the raw description is not stored).
   */
  descriptionRows: TracklistRow[];
  /** TrackId provenance summary, or null when TrackId did not answer. */
  trackid: {
    slug: string;
    count: number;
    timeHitRate: number | null;
    empty: boolean;
  } | null;
  /** Layer error messages to show inline; null when the layer was fine. */
  oembedError: string | null;
  trackidError: string | null;
  /**
   * True when the input was an on.soundcloud.com mobile share link that
   * TrackId could not be confirmed for (oEmbed resolved it, but the guard did
   * not confirm the reconstructed permalink). The screen (§5.2) shows one
   * honest inline note; a confirmed short link keys on its resolved permalink
   * and behaves like any hit (no note).
   */
  shortLink: boolean;
  /** external_urls.spotify of the playlist last created for this mix. */
  playlistUrl?: string;
  /** Spotify id of that playlist; the only durable handle on it. */
  playlistId?: string;
}

export type MixState =
  | { status: 'idle' }
  | { status: 'looking'; url: string }
  | { status: 'ready'; view: MixView }
  | { status: 'error'; message: string }; // only "that is not a SoundCloud link"

/** The Mix screen's lookup/open state (spec §4). Never touched on load. */
export const mixState = signal<MixState>({ status: 'idle' });
/** The one working, editable tracklist; its own signal so an edit re-renders. */
export const mixRows = signal<TracklistRow[]>([]);
/**
 * The open mix's removed scan tracks (T125), saved with it as
 * `MixRow.removed` so a later worker result does not bring them back.
 */
export const mixRemoved = signal<RemovedTrack[]>([]);

/** The removed tracks a saved mix remembers, to start the open one with. */
function removedOf(url: string): RemovedTrack[] {
  return savedMixes.value.find((m) => m.url === url)?.removed ?? [];
}

/**
 * What a saved mix holds beyond the working list, kept when the mix is saved
 * again: the worker's set-wide clues, run and request, and the removed
 * tracks (Save mix used to drop the first three).
 */
function savedExtras(url: string): Partial<MixRow> {
  const prior = savedMixes.value.find((m) => m.url === url);
  const removed = mixRemoved.value;
  return {
    ...(prior?.clues ? { clues: prior.clues } : {}),
    ...(prior?.run ? { run: prior.run } : {}),
    ...(prior?.identifyJobId ? { identifyJobId: prior.identifyJobId } : {}),
    ...(prior?.identifiedAt ? { identifiedAt: prior.identifiedAt } : {}),
    ...(removed.length > 0 ? { removed } : {}),
  };
}
/** Saved mixes, newest first; loaded when the Mix screen mounts. */
export const savedMixes = signal<MixRow[]>([]);
/**
 * The Mix screen's inline channel for a storage failure §6 did not enumerate:
 * a rejected `putMix`/`deleteMix`, or a `getMixes` that could not be read. §6
 * keeps the Mix screen off `BannerMessage`; the two network layers speak
 * through `view.oembedError`/`view.trackidError` and a bad URL through
 * `mixState`'s error arm, but an IndexedDB read or write has nowhere else to
 * land and the global rule is that nothing is swallowed. Rendered inline
 * (Task 5), never a banner. (The paste-box "gentle inline note" of §4 is a
 * separate concern and lives in the screen's local state — see Task 5.)
 */
export const mixError = signal<string | null>(null);

/**
 * What the last queue action found, inline in the Mixes pane (ruling D4):
 * "Already taken by your computer" or "Already finished" when the request
 * had moved on. Cleared by the next action; failures stay in `mixError`.
 */
export const mixQueueNote = signal<string | null>(null);

export interface UnmatchedRow {
  artist: string;
  title: string;
  /** Seconds into the mix, or null when the row has no time. */
  startSec: number | null;
  /** Only while the row still reads as Tracklistify detected it. */
  shazamUrl: string | null;
}

/**
 * The Mix screen's create-playlist job state (spec §4). `needScope` is the
 * one-time re-login prompt arm; it does not count as "running" and joins no
 * jobsBusy(). Owned here (not in the runner) so the screen imports one signal
 * and createPlaylist.ts imports the type only (erased under
 * verbatimModuleSyntax, so the runner never pulls in auth/browser).
 */
export type CreatePlaylistState =
  | { status: 'idle' }
  | { status: 'needScope' }
  | { status: 'resolving'; done: number; total: number }
  | { status: 'creating' }
  | { status: 'adding' }
  | {
      status: 'done';
      name: string;
      url: string | null;
      added: number;
      total: number;
      unmatched: UnmatchedRow[];
    }
  | {
      status: 'error';
      message: string;
      url?: string | null;
      added?: number;
    };

/**
 * The Playlist screen's like-all-songs job (like-playlist spec §3). Every arm
 * but idle names its playlist so the lines never show on another one.
 * `liked`/`toLike` on `error` are set only when the write phase failed.
 */
export type LikeState =
  | { status: 'idle' }
  | { status: 'needScope'; playlistId: string }
  | { status: 'checking'; playlistId: string; done: number; total: number }
  | { status: 'liking'; playlistId: string; done: number; total: number }
  | {
      status: 'done';
      playlistId: string;
      liked: number;
      already: number;
      skipped: number;
    }
  | {
      status: 'error';
      playlistId: string;
      message: string;
      liked?: number;
      toLike?: number;
    };

export const likeState = signal<LikeState>({ status: 'idle' });

export const createPlaylistState = signal<CreatePlaylistState>({
  status: 'idle',
});

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

// Both database events end in a banner: a blocked upgrade would otherwise
// leave "Loading your library…" on screen for as long as the other tab lives.
setDbEvents({
  blocked: () => {
    banner.value = errorBanner(DB_BLOCKED_MESSAGE);
  },
  superseded: () => {
    banner.value = warnBanner(DB_SUPERSEDED_MESSAGE);
  },
});

const DB_WAIT_MESSAGES: readonly string[] = [
  DB_BLOCKED_MESSAGE,
  DB_SLOW_MESSAGE,
];

export async function loadFromDb(): Promise<void> {
  // Whatever keeps the database from opening, the screen says so after a
  // few seconds instead of showing "Loading your library…" indefinitely.
  const slow = setTimeout(() => {
    if (!banner.value) banner.value = errorBanner(DB_SLOW_MESSAGE);
  }, DB_SLOW_MS);
  try {
    const rows = await getAllRows();
    // Those banners are stale once the database has opened.
    if (banner.value && DB_WAIT_MESSAGES.includes(banner.value.text))
      banner.value = null;
    model.value = buildModel(rows);
    lastSyncAt.value = (await getMeta<number>(LAST_SYNC_META)) ?? null;
    const saved = await getMeta<SyncState>(SYNC_STATE_META);
    if (saved && saved.status !== 'running') syncState.value = saved;
    historySummary.value =
      (await getMeta<ImportSummary>(HISTORY_SUMMARY_META)) ?? null;
    rekordboxSummary.value =
      (await getMeta<RekordboxSummary>(REKORDBOX_SUMMARY_META)) ?? null;
    artistReachSummary.value =
      (await getMeta<ArtistReachSummary>(ARTIST_REACH_SUMMARY_META)) ?? null;
    serverLastSyncAt.value =
      (await getMeta<number>(SERVER_LAST_SYNC_META)) ?? null;
    if (crateStatus.value === 'reimport') await showCrateNotice();
  } catch (err) {
    banner.value = errorBanner(
      `Could not open local storage: ${describeError(err)}`
    );
  } finally {
    clearTimeout(slow);
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

/**
 * True while any of the five jobs is running (spec §5.5). Every one of them
 * ends in `loadFromDb()`, so a second job started mid-run would clobber the
 * first one's model rebuild. It reads `syncState.status === 'running'` and
 * deliberately not `isSyncBusy`: a Spotify quota lock-out lasting hours must
 * not block a reach run, which touches no Spotify endpoint.
 */
export function jobsBusy(): boolean {
  return (
    serverPulling.value ||
    syncState.value.status === 'running' ||
    importState.value.status === 'running' ||
    lookupState.value.status === 'running' ||
    rekordboxState.value.status === 'running' ||
    reachState.value.status === 'running'
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
  // Settings prints the same sync failure, lock and cancellation in its own
  // card.
  if (state.status === 'error') {
    banner.value = errorBanner(state.message, ['settings']);
  }
  if (state.status === 'locked') {
    banner.value = warnBanner(lockMessage(state.retryAt));
  }
  // A refused account switch is a cancellation, not a failure: amber, muted
  // on Settings (it already prints the same line inline), still visible from
  // a Playlist screen's own "Sync this playlist" trigger.
  if (state.status === 'cancelled') {
    banner.value = warnBanner(state.message, ['settings']);
  }
  // Last, so it wins the banner: an error or a lock is still on the Settings
  // card, but nothing else on screen says why the data went away. It is a
  // notice, not a failure, so it is amber and never suppressed.
  if (accountSwitched) banner.value = warnBanner(ACCOUNT_SWITCH_NOTICE);
  // A finished or quota-locked sync wrote newer playlists: to the server.
  if (state.status === 'idle' || state.status === 'locked') {
    void queueServerPush(['library']);
  }
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
  if (state.status === 'done') void queueServerPush(['history']);
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
 * Spec §5.5 and §5.3 import the reach coverage line from here, beside
 * `coverage`. It is implemented in `model/reach.ts`, where it can be unit
 * tested: importing `state.ts` under Vitest pulls in `auth/browser.ts`, which
 * touches `localStorage` at module scope.
 */
export { reachCoverage, type ReachCoverage } from './reach';

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
  if (state.status === 'done') void queueServerPush(['features']);
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
  if (state.status === 'done') void queueServerPush(['features']);
}

/** Never on load: the artist reach run starts only from this button. */
export async function startReach(): Promise<void> {
  if (reachState.value.status === 'running') return;
  const m = model.value;
  if (!m) return;
  clearBanner();
  // Claimed synchronously so a second tap cannot start a second run.
  // `as ReachState` keeps the signal at its declared union type, as in
  // startSync and startLookup.
  reachState.value = {
    status: 'running',
    step: 'musicbrainz',
    done: 0,
    total: 0,
    paused: [],
  } as ReachState;
  // Identities and reach rows come from the model, not from a fresh
  // IndexedDB read: a rejected read would strand the state on `running`
  // forever, because runReach itself never throws.
  await runReach(
    {
      // Bare `fetch` throws "Illegal invocation" once unbound from window.
      fetchFn: (input, init) => fetch(input, init),
      // Deezer sends no CORS header at all, so its four calls go through
      // the <script> transport; the client passes its own timeout.
      jsonpFn: jsonp,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now: () => Date.now(),
      onState: (state) => {
        reachState.value = state;
      },
      acquireWakeLock: 'wakeLock' in navigator ? acquireWakeLock : undefined,
    },
    reachCandidates(m),
    [...m.identities.values()],
    [...m.reach.values()]
  );
  // Rows written per artist: reload even after an error, so a partial run
  // still shows its coverage.
  await loadFromDb();
  const state = reachState.value;
  if (state.status === 'error') {
    banner.value = errorBanner(state.message, ['settings']);
  }
  if (state.status !== 'error') void queueServerPush(['reach']);
}

const MIX_NOT_A_LINK =
  "That is not a SoundCloud track link. Paste the link to the mix's page.";
const REPLACE_WITH_DESCRIPTION =
  'Replace your edited tracklist with the one from the description?';
const REPLACE_WITH_PASTED =
  'Replace your edited tracklist with the pasted tracks?';
const REPLACE_WITH_LOOKUP =
  'Looking up again replaces the current tracklist, including your edits. Continue?';
const REPLACE_WITH_TRACKLISTIFY =
  'Importing this file replaces the current tracklist, including your edits. Continue?';

/**
 * Never on load: the mix lookup runs only from the Mix screen's button. It
 * does NOT join jobsBusy() and does NOT call loadFromDb() — it writes no
 * library store and rebuilds no model, so it clobbers nothing (spec §8).
 */
export async function startMixLookup(pastedUrl: string): Promise<void> {
  if (mixState.value.status === 'looking') return;
  mixError.value = null;
  const input = classifyMixInput(pastedUrl);
  if (input === null) {
    mixState.value = { status: 'error', message: MIX_NOT_A_LINK };
    return;
  }
  // Claim the looking state synchronously so a second tap cannot double-run.
  // `as MixState` keeps the signal at its declared union type, as startSync,
  // startLookup and startReach each do.
  mixState.value = { status: 'looking', url: input.url } as MixState;
  // lookupMix never throws, so the state can never strand on `looking`.
  const { oembed, trackid, resolvedUrl } = await lookupMix(
    {
      // Bare `fetch` throws "Illegal invocation" once unbound from window.
      fetchFn: (input, init) => fetch(input, init),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    },
    input
  );
  const parsed =
    oembed.status === 'ok'
      ? parseDescription(oembed.description)
      : { rows: [], linkOut: null };
  const descriptionRows = parsed.rows;
  const identified =
    trackid.status === 'ok' ? trackid.rows.filter((row) => !row.gap).length : 0;
  // Key on the confirmed permalink when TrackId confirmed the candidate (for a
  // permalink `resolvedUrl` is the input, so this collapses to `input.url`);
  // otherwise the input url — the permalink, or the short link when TrackId did
  // not confirm it — so one mix never saves twice.
  const url =
    trackid.status === 'ok' && resolvedUrl !== null ? resolvedUrl : input.url;
  const view: MixView = {
    url,
    title: oembed.status === 'ok' ? oembed.title : null,
    author: oembed.status === 'ok' ? oembed.author : null,
    playerSrc: oembed.status === 'ok' ? oembed.playerSrc : null,
    sources: {
      trackid: trackid.status === 'ok',
      description: descriptionRows.length > 0,
      pasted: false,
      linkOut: parsed.linkOut,
    },
    descriptionRows,
    trackid:
      trackid.status === 'ok'
        ? {
            slug: trackid.slug,
            count: identified,
            timeHitRate: trackid.timeHitRate,
            empty: identified === 0,
          }
        : null,
    oembedError: oembed.status === 'error' ? oembed.message : null,
    trackidError: trackid.status === 'error' ? trackid.message : null,
    // A short link whose oEmbed resolved but whose TrackId lookup was not
    // confirmed: the screen shows the honest "mobile share link" note. Gated on
    // oEmbed ok so the note (which promises a player and description below) is
    // never shown when there is nothing to show — a failed oEmbed prints its
    // own error line instead.
    shortLink:
      input.kind === 'shortlink' &&
      oembed.status === 'ok' &&
      trackid.status !== 'ok',
  };
  mixState.value = { status: 'ready', view };
  // Seed the working list from the richest layer that answered: TrackId's rows
  // (which already carry their gap rows) when it identified anything, else the
  // description's rows, else nothing. Guarded exactly like the paste/apply
  // actions below (I2): a re-lookup must not silently discard curated edits.
  // A no-op guard on a first lookup, since mixRows.value is [] then.
  if (hasManualRows(mixRows.value) && !confirm(REPLACE_WITH_LOOKUP)) return;
  mixRemoved.value = removedOf(view.url);
  mixRows.value =
    trackid.status === 'ok' && trackid.rows.length > 0
      ? trackid.rows
      : descriptionRows;
}

/**
 * Imports a Tracklistify tracklist.json as a standalone mix — no SoundCloud
 * link exists for these, so the working list and a synthetic save key (spec
 * §4) are built directly from the file. Never on load: only from the Mix
 * screen's file picker. Parse/read failures go through `mixError` (the
 * general "nothing is swallowed" channel), never `mixState`'s `error` arm,
 * which is reserved for the one SoundCloud-link-shaped message.
 */
export async function startTracklistifyImport(file: File): Promise<void> {
  mixError.value = null;
  let text: string;
  try {
    text = await file.text();
  } catch (err) {
    mixError.value = `Could not read that file: ${storageMessage(err)}`;
    return;
  }
  const parsed = parseTracklistifyJson(text);
  if (parsed.status === 'error') {
    mixError.value = parsed.message;
    return;
  }
  if (hasManualRows(mixRows.value) && !confirm(REPLACE_WITH_TRACKLISTIFY)) {
    return;
  }
  const view: MixView = {
    url: parsed.url,
    title: parsed.title,
    author: null,
    playerSrc: null,
    sources: {
      trackid: false,
      description: false,
      pasted: false,
      linkOut: null,
      tracklistify: true,
    },
    descriptionRows: [],
    trackid: null,
    oembedError: null,
    trackidError: null,
    shortLink: false,
  };
  mixState.value = { status: 'ready', view };
  mixRemoved.value = removedOf(view.url);
  mixRows.value = parsed.rows;
}

/** Replaces the working list with the description's rows (spec §4/§5.2). */
export function applyDescriptionTracklist(): void {
  const state = mixState.value;
  if (state.status !== 'ready') return;
  mixError.value = null;
  if (state.view.descriptionRows.length === 0) return;
  if (hasManualRows(mixRows.value) && !confirm(REPLACE_WITH_DESCRIPTION))
    return;
  mixRows.value = state.view.descriptionRows;
}

/**
 * Parses pasted text and, when it holds a listing, replaces the working list.
 * Returns which of the three outcomes happened so the screen can render the
 * "gentle inline note" of §4 next to the paste box (a link-only paste or an
 * empty parse); a banner is forbidden on this screen (§6). A cancelled replace
 * reports `'added'` — tracks were found, so no note is shown.
 */
export function applyPastedTracklist(
  text: string
): 'added' | 'linkOnly' | 'empty' {
  const state = mixState.value;
  if (state.status !== 'ready') return 'empty';
  mixError.value = null;
  const parsed = parsePasted(text);
  if (parsed.rows.length === 0) {
    return parsed.linkOut !== null ? 'linkOnly' : 'empty';
  }
  if (hasManualRows(mixRows.value) && !confirm(REPLACE_WITH_PASTED)) {
    return 'added';
  }
  mixRows.value = parsed.rows;
  mixState.value = {
    status: 'ready',
    view: { ...state.view, sources: { ...state.view.sources, pasted: true } },
  };
  return 'added';
}

/**
 * Commits an edit to one row through the pure `editTracklistRow` rule.
 * `startSec` is optional (M5): omitted, the row's time is left alone; given
 * (a number, or `null` for "no time"), it replaces it — this is how a manual
 * add or an edited row gets a start time, which editing previously had no
 * field for.
 */
export function editMixRow(
  index: number,
  fields: {
    artist: string;
    title: string;
    label: string;
    startSec?: number | null;
  }
): void {
  const rows = mixRows.value.slice();
  const row = rows[index];
  if (!row) return;
  rows[index] = editTracklistRow(row, fields);
  mixRows.value = rows;
}

/** Appends a blank manual row for the owner to fill in (spec §4). */
export function addMixRow(): void {
  mixRows.value = [
    ...mixRows.value,
    {
      startSec: null,
      endSec: null,
      artist: '',
      title: '',
      label: null,
      source: 'manual',
      gap: false,
      detected: null,
      referenceCount: null,
    },
  ];
}

/**
 * Removes one row (spec §4). A scan row is remembered in the mix's removed
 * tracks (T125), so a later worker result leaves it out.
 */
export function deleteMixRow(index: number): void {
  const row = mixRows.value[index];
  if (!row) return;
  const removed = recordRemoved(mixRemoved.value, row);
  if (removed !== undefined) mixRemoved.value = removed;
  mixRows.value = mixRows.value.filter((_, i) => i !== index);
}

/** Validated or back To review (T118); saved with Save mix like an edit. */
export function toggleValidated(index: number): void {
  const rows = mixRows.value.slice();
  const row = rows[index];
  if (!row || row.gap) return;
  rows[index] = { ...row, validated: row.validated !== true };
  mixRows.value = rows;
}

/** Reads the saved mixes newest-first; called when the Mix screen mounts. */
export async function loadSavedMixes(): Promise<void> {
  mixError.value = null;
  try {
    const rows = await getMixes();
    savedMixes.value = rows.sort((a, b) => b.savedAt - a.savedAt);
    mixJobs.value = (await getMeta<MixJobs>(MIX_JOBS_META)) ?? {};
  } catch (err) {
    mixError.value = `Could not read your saved mixes: ${describeError(err)}`;
  }
}

/* ---------- identify on my computer (worker round) ---------- */

async function reloadMixJobs(): Promise<void> {
  try {
    mixJobs.value = (await getMeta<MixJobs>(MIX_JOBS_META)) ?? {};
  } catch (err) {
    mixError.value = `Could not read your requests: ${describeError(err)}`;
  }
}

/** The identify requests per canonical link, newest first (FR-003). */
export const mixJobs = signal<MixJobs>({});
export const ALREADY_REQUESTED =
  'Already requested. Your computer takes it the next time the worker runs.';
export const NOT_A_REQUEST_LINK =
  'That is not a link the worker can take: paste an https link to the set (a SoundCloud short link needs Look up first).';

/**
 * "Identify on my computer": one request on the owner's server for the link
 * in the box (FR-002), never a Spotify call, never a fetch of the platform.
 * Not in `jobsBusy()`: one request, under a second. Failures land in
 * `mixError`, inline on the Mix screen (FR-008).
 */
export async function startIdentifyRequest(url: string): Promise<void> {
  mixError.value = null;
  mixQueueNote.value = null;
  const key = requestKey(url);
  if (key === null) {
    mixError.value = NOT_A_REQUEST_LINK;
    return;
  }
  const latest = mixJobs.value[key]?.[0];
  const text = requestStatusText(latest, serverState.value);
  if (!text.canAsk) {
    mixError.value =
      latest && (latest.status === 'queued' || latest.status === 'claimed')
        ? ALREADY_REQUESTED
        : text.button;
    return;
  }
  if (!serverConfigured || !serverAuth.session.value) {
    mixError.value = 'Sign in to the server (Settings)';
    return;
  }
  const token = await serverAuth.getAccessToken();
  if (!token.ok) {
    serverState.value = serverFailure(token);
    mixError.value = `Could not reach the server: ${token.message}`;
    return;
  }
  const res = await requestIdentify(serverClient, token.value, key);
  if (!res.ok) {
    serverState.value = serverFailure(res);
    mixError.value = `Could not record the request: ${res.message}`;
    return;
  }
  if (res.value === 'exists') {
    mixError.value = ALREADY_REQUESTED;
    return;
  }
  const next: MixJobs = {
    ...mixJobs.value,
    [key]: [res.value, ...(mixJobs.value[key] ?? [])].slice(0, JOB_HISTORY_MAX),
  };
  mixJobs.value = next;
  try {
    await putMeta(MIX_JOBS_META, next);
  } catch (err) {
    mixError.value = `The request is recorded on the server but not here: ${storageMessage(err)}`;
  }
}

/**
 * Saves the current mix and its working list, then refreshes the list.
 * Returns whether the save succeeded (M7): the caller must not flash
 * "Saved ✓" on a rejected write, where `mixError` shows instead.
 */
export async function saveMix(): Promise<boolean> {
  const state = mixState.value;
  if (state.status !== 'ready') return false;
  mixError.value = null;
  const view = state.view;
  const row: MixRow = {
    url: view.url,
    title: view.title,
    author: view.author,
    playerSrc: view.playerSrc,
    slug: view.trackid?.slug ?? null,
    sources: view.sources,
    rows: mixRows.value,
    ...savedExtras(view.url),
    savedAt: Date.now(),
    playlistUrl: view.playlistUrl,
    playlistId: view.playlistId,
  };
  try {
    await putMix(row);
  } catch (err) {
    mixError.value = `Could not save the mix: ${storageMessage(err)}`;
    return false;
  }
  await loadSavedMixes();
  void queueServerPush(['mixes']);
  return true;
}

/**
 * Creates a private Spotify playlist from the open mix (spec §4). Never on
 * load: only from the Mix screen's "Create playlist from mix" tap. Not a
 * jobsBusy() job — it writes only the one mix row and rebuilds no model, so it
 * clobbers nothing; re-entry is guarded on its own state. Without the granted
 * playlist-modify-private scope it saves the mix (so beginLogin's full-page
 * navigation cannot lose it) and reveals the needScope prompt instead.
 */
export async function startCreatePlaylist(): Promise<void> {
  const status = createPlaylistState.value.status;
  if (status === 'resolving' || status === 'creating' || status === 'adding') {
    return;
  }
  const state = mixState.value;
  if (state.status !== 'ready') return;
  const view = state.view;
  const rows = mixRows.value;
  const extras = savedExtras(view.url);

  if (!canCreatePlaylists(auth.session.value)) {
    if (!(await saveMix())) return;
    createPlaylistState.value = { status: 'needScope' };
    return;
  }

  // Claim the running state synchronously so a second tap cannot double-run,
  // with the `as CreatePlaylistState` cast the codebase uses (startSync /
  // startMixLookup) to hold the signal at its declared union type.
  createPlaylistState.value = {
    status: 'resolving',
    done: 0,
    total: 0,
  } as CreatePlaylistState;

  const rawTitle = (view.title ?? 'Mix tracklist').trim() || 'Mix tracklist';
  const name = (
    view.sources.tracklistify ? `tracklistify/${rawTitle}` : rawTitle
  ).slice(0, 100);
  const description = (
    view.sources.tracklistify
      ? 'From a Tracklistify scan · via DJ Data'
      : `From ${view.url} · via DJ Data`
  ).slice(0, 300);

  const outcome = await runCreatePlaylist(
    {
      client: api,
      onState: (s) => {
        createPlaylistState.value = s;
      },
    },
    { name, description, rows }
  );

  // Persist whenever the playlist was created (even on a partial add failure).
  // Build the row from the CAPTURED view and rows, not the live signals: the
  // run is async and nothing disables navigation, so `mixRows`/`mixState` may
  // now hold another mix (or nothing, after `closeMix`). Reading them here
  // would save an empty or wrong tracklist. `putMix` the captured row directly
  // rather than through `saveMix` (which reads live state), then reflect the
  // link on the open view only if this same mix is still open.
  if (outcome.playlistId !== null) {
    const row: MixRow = {
      url: view.url,
      title: view.title,
      author: view.author,
      playerSrc: view.playerSrc,
      slug: view.trackid?.slug ?? null,
      sources: view.sources,
      rows,
      ...extras,
      savedAt: Date.now(),
      playlistUrl: outcome.url ?? undefined,
      playlistId: outcome.playlistId,
    };
    let saved = true;
    try {
      await putMix(row);
    } catch (err) {
      mixError.value = `Could not save the mix: ${storageMessage(err)}`;
      saved = false;
    }
    const open = mixState.value;
    if (open.status === 'ready' && open.view.url === view.url) {
      mixState.value = {
        status: 'ready',
        view: {
          ...open.view,
          playlistUrl: outcome.url ?? undefined,
          playlistId: outcome.playlistId,
        },
      };
    }
    // Only on success: loadSavedMixes clears mixError first, so calling it
    // after a rejected putMix would wipe the error we just set (nothing shown).
    if (saved) {
      await loadSavedMixes();
      void queueServerPush(['mixes']);
    }
  }
}

/**
 * Reopens a saved mix from memory with no network call — reopening must not
 * re-fetch, or never-on-load is broken (spec §4). The MixView is rebuilt from
 * the stored row: the two layer errors are null, the description rows empty
 * (the raw description is not stored), and the TrackId summary reconstructed
 * from the saved slug with its hit rate dropped.
 */
export function openMix(url: string): void {
  const row = savedMixes.value.find((mix) => mix.url === url);
  if (!row) return;
  mixError.value = null;
  mixRows.value = row.rows;
  mixRemoved.value = row.removed ?? [];
  const count = row.rows.filter((r) => !r.gap).length;
  const view: MixView = {
    url: row.url,
    title: row.title,
    author: row.author,
    playerSrc: row.playerSrc,
    sources: row.sources,
    descriptionRows: [],
    trackid:
      row.sources.trackid && row.slug !== null
        ? { slug: row.slug, count, timeHitRate: null, empty: count === 0 }
        : null,
    oembedError: null,
    trackidError: null,
    // A confirmed short link saved under its resolved permalink, so only an
    // unconfirmed one keeps an on.soundcloud.com url and re-shows the note.
    shortLink: isShortLink(row.url),
    playlistUrl: row.playlistUrl,
    playlistId: row.playlistId,
  };
  mixState.value = { status: 'ready', view };
}

/**
 * Returns to the idle saved-mixes screen (M9) — no network call, and no data
 * lost: a saved mix is already in `savedMixes`/IndexedDB, so only the
 * in-memory working list (never persisted unless `saveMix` ran) is cleared,
 * the same reset `openMix`/`disconnect` give a fresh screen.
 */
export function closeMix(): void {
  mixState.value = { status: 'idle' };
  mixRows.value = [];
  mixRemoved.value = [];
  mixError.value = null;
  createPlaylistState.value = { status: 'idle' };
}

/**
 * Likes every not-yet-liked song of a synced playlist (like-playlist spec).
 * Never on load: only from the Playlist screen's button. Not a jobsBusy() job
 * and no loadFromDb(): it writes no local store. Candidates come from the
 * synced entries, never a playlist read (the quota rule). Without both library
 * scopes it reveals the needScope prompt instead.
 */
export async function startLikePlaylist(playlistId: string): Promise<void> {
  if (isLiking(likeState.value)) return;
  const m = model.value;
  if (!m) return;
  if (!canLikeTracks(auth.session.value)) {
    likeState.value = { status: 'needScope', playlistId };
    return;
  }
  // Claim the running state synchronously so a second tap cannot double-run.
  likeState.value = {
    status: 'checking',
    playlistId,
    done: 0,
    total: 0,
  } as LikeState;
  await runLikePlaylist(
    {
      client: api,
      confirm: (toLike, total) => confirm(likeQuestion(toLike, total)),
      onState: (s) => {
        likeState.value = s;
      },
    },
    { playlistId, ...likeCandidates(m, playlistId) }
  );
}

/**
 * Deletes a saved mix, then refreshes the list. Precondition: reached from the
 * idle saved-mixes list (spec §5.2 renders Remove there only), so no mix is
 * open and `mixState` needs no reset.
 */
export async function removeMix(url: string): Promise<void> {
  mixError.value = null;
  try {
    await deleteMix(url);
  } catch (err) {
    mixError.value = `Could not remove the mix: ${describeError(err)}`;
    return;
  }
  await loadSavedMixes();
  void queueServerPush(['mixes']);
}

export async function disconnect(): Promise<void> {
  if (jobsBusy()) {
    banner.value = warnBanner(
      'Wait for the current sync, history import, lookup, Rekordbox import or artist lookup to finish before disconnecting.'
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
  reachState.value = { status: 'idle' };
  mixState.value = { status: 'idle' };
  mixRows.value = [];
  mixRemoved.value = [];
  savedMixes.value = [];
  mixError.value = null;
  mixQueueNote.value = null;
  createPlaylistState.value = { status: 'idle' };
  likeState.value = { status: 'idle' };
  lastSyncAt.value = null;
  historySummary.value = null;
  rekordboxSummary.value = null;
  artistReachSummary.value = null;
  banner.value = null;
  // The server session and the server's data are kept: Disconnect is about
  // this browser. Only the card's transient state goes back to its base.
  serverState.value = serverBaseState();
  serverLastSyncAt.value = null;
  // keyNotation is a display preference, not data: it survives a wipe.
}

/* ---------- queue control from the phone (round 004) ---------- */

export const CANCEL_REQUEST_CONFIRM =
  'Cancel this request? It leaves the queue; you can ask again later.';
export const STOP_REQUEST_CONFIRM =
  'Stop this scan? The computer ends it within about a minute and keeps the tracks found so far.';

/** The status a request has after a pull, or undefined when no longer listed. */
function pulledStatus(id: string): MixJobView['status'] | undefined {
  for (const history of Object.values(mixJobs.value)) {
    const view = history.find((v) => v.id === id);
    if (view) return view.status;
  }
  return undefined;
}

/**
 * Runs one queue action with a fresh token, then pulls so the list updates;
 * a 'gone' answer becomes `mixQueueNote` (`queueNote`: from the pulled
 * status only when the pull succeeded, T122 and review F2).
 */
async function queueAction(
  id: string,
  run: (token: string) => Promise<ServerResult<string>>,
  failure: string
): Promise<void> {
  mixError.value = null;
  mixQueueNote.value = null;
  if (!serverConfigured || !serverAuth.session.value) {
    mixError.value = 'Sign in to the server (Settings)';
    return;
  }
  const token = await serverAuth.getAccessToken();
  if (!token.ok) {
    serverState.value = serverFailure(token);
    mixError.value = queueFailure(failure, token.message);
    return;
  }
  const res = await run(token.value);
  if (!res.ok) {
    serverState.value = serverFailure(res);
    mixError.value = queueFailure(failure, res.message);
    return;
  }
  const pulled = await startServerPull();
  mixQueueNote.value = queueNote(res.value, pulled, pulledStatus(id));
}

export async function startCancelRequest(id: string): Promise<void> {
  if (!confirm(CANCEL_REQUEST_CONFIRM)) return;
  await queueAction(
    id,
    (t) => cancelRequest(serverClient, t, id),
    'Could not cancel the request'
  );
}

export async function startMoveToTop(id: string): Promise<void> {
  await queueAction(
    id,
    (t) => moveRequestToTop(serverClient, t, id),
    'Could not move the request'
  );
}

export async function startStopRequest(id: string): Promise<void> {
  if (!confirm(STOP_REQUEST_CONFIRM)) return;
  await queueAction(
    id,
    (t) => stopRequest(serverClient, t, id, Date.now()),
    'Could not stop the scan'
  );
}
