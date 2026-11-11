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
import { plural } from '../format';
import { fromUpdate, type ItemLine, type ItemTone } from './itemLines';

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

/** "Updating · 3 of 9 tracks", or the word alone with no total known. */
const progress = (word: string, done: number, total: number, unit: string) =>
  total > 0
    ? `${word} · ${done.toLocaleString()} of ${plural(total, unit)}`
    : word;

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
  switch (line.tone) {
    case 'running':
      return { tone: 'running', text: running };
    case 'waiting':
      return { tone: 'waiting', text: 'Waiting' };
    case 'error':
      return { tone: 'error', text: 'Failed' };
    case 'warning':
      return { tone: 'warning', text: line.text.split(' · ')[0] };
    case 'off':
      return { tone: 'off', text: 'Automatic updates off' };
    case 'ok':
      return never === null
        ? { tone: 'ok', text: 'Up to date' }
        : { tone: 'off', text: never };
  }
}

function spotifyRow(i: StatusInputs): StatusRow {
  const line = i.spotify;
  const p = i.spotifyProgress;
  const words: Record<ItemTone, string> = {
    running: progress('Syncing', p?.done ?? 0, p?.total ?? 0, 'playlist'),
    waiting: 'Waiting',
    error: 'Failed',
    // The lock-out's end stays in the Spotify sync item.
    warning: "Paused by Spotify's limit",
    off: 'Automatic updates off',
    ok: 'Up to date',
  };
  const never = !i.synced && (line.tone === 'ok' || line.tone === 'off');
  return {
    source: 'spotify',
    label: 'Spotify',
    tone: never ? 'off' : line.tone,
    text: never ? 'Never synced' : words[line.tone],
    retry: line.tone === 'error' ? i.spotifyRetry : null,
  };
}

function featuresRow(i: StatusInputs): StatusRow {
  const c = i.coverage;
  const state = jobState(
    i.features,
    progress('Updating', c?.covered ?? 0, c?.total ?? 0, 'track'),
    c === null || c.total === 0
      ? 'No tracks yet'
      : c.covered === 0
        ? 'Not looked up'
        : null
  );
  return {
    source: 'features',
    label: 'BPM and key',
    ...state,
    retry: i.features.retry,
  };
}

function reachRow(i: StatusInputs): StatusRow {
  const c = i.reachCoverage;
  const state = jobState(
    i.reach,
    progress('Updating', c?.covered ?? 0, c?.artists ?? 0, 'artist'),
    c === null || c.artists === 0
      ? 'No artists yet'
      : !i.reachChecked
        ? 'Not looked up'
        : null
  );
  return {
    source: 'reach',
    label: 'Artist reach',
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
  if (run.status === 'running') {
    return {
      ...base,
      tone: 'running',
      text: progress('Importing', run.index, run.total, 'file'),
    };
  }
  if (run.status === 'error') return { ...base, tone: 'error', text: 'Failed' };
  return imported
    ? { ...base, tone: 'ok', text: 'Imported' }
    : { ...base, tone: 'off', text: 'Not imported' };
}

/**
 * The server's state in a word: `serverStatusLine` without its date, its
 * data sets or its rows. "Up to date" only once the waiting flags are read
 * (spec 026, FR-007a); before that, "Synced".
 */
function serverRow(i: StatusInputs): StatusRow {
  const line = i.server;
  const first = line.text.split(' · ')[0];
  const text = ((): string => {
    switch (line.tone) {
      case 'off':
        return first;
      case 'error':
        return 'Failed';
      case 'warning':
        return first.startsWith('Offline') ? 'Offline' : 'Paused';
      case 'running':
        return 'Syncing';
      case 'waiting':
        return 'Changes to send';
      case 'ok':
        return first === 'Up to date' ? 'Up to date' : 'Synced';
    }
  })();
  return {
    source: 'server',
    label: 'Server',
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
    importRow('history', 'Listening history', i.historyRun, i.historyImported),
    serverRow(i),
  ];
}
