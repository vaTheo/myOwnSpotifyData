/**
 * The Sync status block (spec 026, US3; spec 027): one line per source, its
 * label and its state in a few words, never folded. No date, no time, no
 * count at rest: "N of M <unit>" only while a source runs, from the figures
 * the app already holds (the model's coverage, the job's progress), never a
 * new read. The counts and dates stay in each opened item. A missing number
 * is left out, never printed as 0.
 */
import type { AutoStep } from '../../model/autoChain';
import type { UpdateLine } from '../../model/updateLines';
import { msg } from '../../i18n';
import { fromUpdate, type ItemLine, type ItemTone } from './itemLines';

const said = () => msg().settings.words;

export type StatusSource =
  'spotify' | 'features' | 'rekordbox' | 'reach' | 'history' | 'server';

export interface StatusRow {
  source: StatusSource;
  label: string;
  tone: ItemTone;
  text: string;
  /** The automatic step a Retry button runs, as on `updateLines`. */
  retry: AutoStep | null;
}

type Job = Pick<UpdateLine, 'tone' | 'text' | 'retry'>;

type Run =
  | { status: 'running'; index: number; total: number }
  | { status: 'error'; message: string }
  | { status: 'idle' | 'done' | 'cancelled' };

export interface StatusInputs {
  /** `spotifyStatusLine`: the sync's line or the shared lock-out. */
  spotify: ItemLine;
  spotifyRetry: AutoStep | null;
  /** The sync's progress while it runs, playlists done of total. */
  spotifyProgress: { done: number; total: number } | null;
  /** A Spotify sync has finished once on this device. */
  synced: boolean;
  features: Job;
  coverage: { covered: number; total: number } | null;
  rekordboxImported: boolean;
  rekordboxRun: Run;
  reach: Job;
  reachCoverage: { covered: number; artists: number } | null;
  /** An artist reach run has finished once (`artistReachSummary`). */
  reachChecked: boolean;
  historyImported: boolean;
  historyRun: Run;
  /** `serverStatusLine`. */
  server: ItemLine;
}

/**
 * "Updating · 3 of 9 tracks", or the word alone with no total known. The
 * sentence with its count is one catalogue entry (spec 031).
 */
const progress = (
  word: string,
  done: number,
  total: number,
  line: (done: number, total: number) => string
) => (total > 0 ? line(done, total) : word);

/**
 * The state words of an automatic job (BPM and key, Artist reach): its
 * progress while it runs, "Up to date" when idle whatever its coverage
 * (owner, 2026-11-11), `never` when nothing was looked up yet.
 */
function jobState(
  job: Job,
  running: string,
  never: string | null
): { tone: ItemTone; text: string } {
  const line = fromUpdate(job);
  const w = said();
  switch (line.tone) {
    case 'running':
      return { tone: 'running', text: running };
    case 'waiting':
      return { tone: 'waiting', text: w.waiting };
    case 'error':
      return { tone: 'error', text: w.failed };
    case 'warning':
      return { tone: 'warning', text: line.text.split(' · ')[0] };
    case 'off':
      return { tone: 'off', text: w.autoOff };
    case 'ok':
      return never === null
        ? { tone: 'ok', text: w.upToDate }
        : { tone: 'off', text: never };
  }
}

function spotifyRow(i: StatusInputs): StatusRow {
  const line = i.spotify;
  const p = i.spotifyProgress;
  const w = said();
  const words: Record<ItemTone, string> = {
    running: progress(
      w.syncing,
      p?.done ?? 0,
      p?.total ?? 0,
      msg().settings.status.syncing
    ),
    waiting: w.waiting,
    error: w.failed,
    // The lock-out's end stays in the Spotify sync item.
    warning: w.spotifyLimit,
    off: w.autoOff,
    ok: w.upToDate,
  };
  const never = !i.synced && (line.tone === 'ok' || line.tone === 'off');
  return {
    source: 'spotify',
    label: 'Spotify',
    tone: never ? 'off' : line.tone,
    text: never ? w.neverSynced : words[line.tone],
    retry: line.tone === 'error' ? i.spotifyRetry : null,
  };
}

function featuresRow(i: StatusInputs): StatusRow {
  const c = i.coverage;
  const w = said();
  const state = jobState(
    i.features,
    progress(
      w.updating,
      c?.covered ?? 0,
      c?.total ?? 0,
      msg().settings.status.updatingTracks
    ),
    c === null || c.total === 0
      ? w.noTracks
      : c.covered === 0
        ? w.notLookedUp
        : null
  );
  return {
    source: 'features',
    label: w.bpmKey,
    ...state,
    retry: i.features.retry,
  };
}

function reachRow(i: StatusInputs): StatusRow {
  const c = i.reachCoverage;
  const w = said();
  const state = jobState(
    i.reach,
    progress(
      w.updating,
      c?.covered ?? 0,
      c?.artists ?? 0,
      msg().settings.status.updatingArtists
    ),
    c === null || c.artists === 0
      ? w.noArtists
      : !i.reachChecked
        ? w.notLookedUp
        : null
  );
  return {
    source: 'reach',
    label: msg().settings.items.reach,
    ...state,
    retry: i.reach.retry,
  };
}

/** An import (Rekordbox, history): running, failed, imported or not. */
function importRow(
  source: 'rekordbox' | 'history',
  label: string,
  run: Run,
  imported: boolean
): StatusRow {
  const base = { source, label, retry: null };
  const w = said();
  if (run.status === 'running') {
    return {
      ...base,
      tone: 'running',
      text: progress(
        w.importing,
        run.index,
        run.total,
        msg().settings.status.importing
      ),
    };
  }
  if (run.status === 'error') return { ...base, tone: 'error', text: w.failed };
  return imported
    ? { ...base, tone: 'ok', text: w.imported }
    : { ...base, tone: 'off', text: w.notImported };
}

/**
 * The server's state in a word: `serverStatusLine` without its date, its
 * data sets or its rows. "Up to date" only once the waiting flags are read
 * (spec 026, FR-007a); before that, "Synced". `serverStatusLine` writes its
 * first words from the catalogue entries `words.upToDate` and
 * `words.offline`, and both lines are built in the same draw, so comparing
 * with those entries holds in every language (spec 031, research R4).
 */
function serverRow(i: StatusInputs): StatusRow {
  const line = i.server;
  const first = line.text.split(' · ')[0];
  const w = said();
  const text = ((): string => {
    switch (line.tone) {
      case 'off':
        return first;
      case 'error':
        return w.failed;
      case 'warning':
        return first === w.offline ? w.offline : w.paused;
      case 'running':
        return w.syncing;
      case 'waiting':
        return w.changesToSend;
      case 'ok':
        return first === w.upToDate ? w.upToDate : w.synced;
    }
  })();
  return {
    source: 'server',
    label: msg().settings.items.server,
    tone: line.tone,
    text,
    retry: null,
  };
}

/** The block's lines, in a fixed order: Spotify first, the server last. */
export function syncStatusRows(i: StatusInputs): StatusRow[] {
  return [
    spotifyRow(i),
    featuresRow(i),
    importRow('rekordbox', 'Rekordbox', i.rekordboxRun, i.rekordboxImported),
    reachRow(i),
    importRow(
      'history',
      msg().settings.items.history,
      i.historyRun,
      i.historyImported
    ),
    serverRow(i),
  ];
}
