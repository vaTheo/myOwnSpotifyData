import { computed, signal } from '@preact/signals';
import { auth } from '../auth/browser';
import {
  DB_BLOCKED_MESSAGE,
  DB_SLOW_MESSAGE,
  DB_SLOW_MS,
  DB_SUPERSEDED_MESSAGE,
  deleteMix,
  getAllRows,
  getMeta,
  getMixes,
  putMeta,
  putMix,
  setDbEvents,
  wipeDb,
} from '../db/repo';
import type { MixRow, TracklistRow } from '../db/schema';
import { jsonp } from '../features/jsonp';
import {
  editTracklistRow,
  hasManualRows,
  lookupMix,
} from '../features/mix/lookup';
import { parseDescription, parsePasted } from '../features/mix/parse';
import { normalizeMixUrl } from '../features/mix/url';
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
}

const MIX_NOT_A_LINK =
  "That is not a SoundCloud track link. Paste the link to the mix's page.";
const REPLACE_WITH_DESCRIPTION =
  'Replace your edited tracklist with the one from the description?';
const REPLACE_WITH_PASTED =
  'Replace your edited tracklist with the pasted tracks?';

/**
 * Never on load: the mix lookup runs only from the Mix screen's button. It
 * does NOT join jobsBusy() and does NOT call loadFromDb() — it writes no
 * library store and rebuilds no model, so it clobbers nothing (spec §8).
 */
export async function startMixLookup(pastedUrl: string): Promise<void> {
  if (mixState.value.status === 'looking') return;
  mixError.value = null;
  const normUrl = normalizeMixUrl(pastedUrl);
  if (normUrl === null) {
    mixState.value = { status: 'error', message: MIX_NOT_A_LINK };
    return;
  }
  // Claim the looking state synchronously so a second tap cannot double-run.
  // `as MixState` keeps the signal at its declared union type, as startSync,
  // startLookup and startReach each do.
  mixState.value = { status: 'looking', url: normUrl } as MixState;
  // lookupMix never throws, so the state can never strand on `looking`.
  const { oembed, trackid } = await lookupMix(
    {
      // Bare `fetch` throws "Illegal invocation" once unbound from window.
      fetchFn: (input, init) => fetch(input, init),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    },
    normUrl
  );
  const parsed =
    oembed.status === 'ok'
      ? parseDescription(oembed.description)
      : { rows: [], linkOut: null };
  const descriptionRows = parsed.rows;
  const identified =
    trackid.status === 'ok' ? trackid.rows.filter((row) => !row.gap).length : 0;
  const view: MixView = {
    url: normUrl,
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
  };
  mixState.value = { status: 'ready', view };
  // Seed the working list from the richest layer that answered: TrackId's rows
  // (which already carry their gap rows) when it identified anything, else the
  // description's rows, else nothing.
  mixRows.value =
    trackid.status === 'ok' && trackid.rows.length > 0
      ? trackid.rows
      : descriptionRows;
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

/** Commits an edit to one row through the pure `editTracklistRow` rule. */
export function editMixRow(
  index: number,
  fields: { artist: string; title: string; label: string }
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

/** Removes one row (spec §4). */
export function deleteMixRow(index: number): void {
  mixRows.value = mixRows.value.filter((_, i) => i !== index);
}

/** Reads the saved mixes newest-first; called when the Mix screen mounts. */
export async function loadSavedMixes(): Promise<void> {
  try {
    const rows = await getMixes();
    savedMixes.value = rows.sort((a, b) => b.savedAt - a.savedAt);
  } catch (err) {
    mixError.value = `Could not read your saved mixes: ${describeError(err)}`;
  }
}

/** Saves the current mix and its working list, then refreshes the list. */
export async function saveMix(): Promise<void> {
  const state = mixState.value;
  if (state.status !== 'ready') return;
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
    savedAt: Date.now(),
  };
  try {
    await putMix(row);
  } catch (err) {
    mixError.value = `Could not save the mix: ${storageMessage(err)}`;
    return;
  }
  await loadSavedMixes();
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
  };
  mixState.value = { status: 'ready', view };
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
  savedMixes.value = [];
  mixError.value = null;
  lastSyncAt.value = null;
  historySummary.value = null;
  rekordboxSummary.value = null;
  artistReachSummary.value = null;
  banner.value = null;
  // keyNotation is a display preference, not data: it survives a wipe.
}
