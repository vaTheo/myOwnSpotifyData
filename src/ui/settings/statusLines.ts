/**
 * The Sync status block (spec 026, US3, FR-010): one line per source, its
 * state and the number of items this device holds from it, never folded.
 * Pure: the counts are the ones the app already holds (the model's
 * coverage, the import summaries, the server table's Rows), never a new read.
 * A missing number is left out or said in words, never printed as 0.
 */
import type { RekordboxSummary } from '../../features/rekordboxImport';
import type { ImportSummary } from '../../history/importer';
import type { AutoStep } from '../../model/autoChain';
import type { UpdateLine } from '../../model/updateLines';
import type { ServerStampView } from '../../server/types';
import { formatDate, plural } from '../format';
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

export interface StatusInputs {
  /** `spotifyStatusLine`: the sync's line or the shared lock-out. */
  spotify: ItemLine;
  spotifyRetry: AutoStep | null;
  library: { playlists: number; tracks: number } | null;
  features: Job;
  coverage: { covered: number; total: number } | null;
  /** Candidates with a release year, or null when unknown. */
  dated: number | null;
  rekordbox: RekordboxSummary | null;
  rekordboxRun:
    | { status: 'running'; index: number; total: number }
    | { status: 'error'; message: string }
    | { status: 'idle' | 'done' };
  reach: Job;
  reachCoverage: { covered: number; artists: number } | null;
  history: ImportSummary | null;
  historyRun:
    | { status: 'running'; index: number; total: number }
    | { status: 'error'; message: string }
    | { status: 'idle' | 'done' | 'cancelled' };
  /** `serverStatusLine`. */
  server: ItemLine;
  /** The server table's rows, when connected. */
  stamps: readonly ServerStampView[] | null;
}

const n = (v: number): string => v.toLocaleString();

const join = (...parts: (string | null)[]): string =>
  parts.filter((p): p is string => p !== null && p !== '').join(' · ');

/**
 * The state words of a job whose idle text is its count (BPM and key):
 * nothing more when idle, "Off" with the switch off, else the job's words.
 */
function stateAfterCount(job: Job): ItemLine {
  const line = fromUpdate(job);
  if (job.tone === 'ok') return { tone: 'ok', text: '' };
  if (job.tone === 'off') return { tone: 'off', text: 'Automatic updates off' };
  return line;
}

function spotifyRow(i: StatusInputs): StatusRow {
  // Each count only when there is one: no "0 playlists" beside tracks.
  const lib = i.library;
  const counts =
    lib === null
      ? null
      : join(
          lib.playlists > 0 ? plural(lib.playlists, 'playlist') : null,
          lib.tracks > 0 ? plural(lib.tracks, 'track') : null
        );
  return {
    source: 'spotify',
    label: 'Spotify → this device',
    tone: i.spotify.tone,
    text: join(counts, i.spotify.text),
    retry: i.spotify.tone === 'error' ? i.spotifyRetry : null,
  };
}

function featuresRow(i: StatusInputs): StatusRow {
  const c = i.coverage;
  const counts =
    c === null || c.total === 0
      ? 'No tracks yet'
      : join(
          `${n(c.covered)} of ${plural(c.total, 'track')}`,
          // No year known yet is a missing figure, never "release years 0".
          i.dated === null || i.dated === 0
            ? null
            : `release years ${n(i.dated)}`
        );
  const state = stateAfterCount(i.features);
  return {
    source: 'features',
    label: 'BPM and key (ReccoBeats)',
    tone: state.tone,
    text: join(counts, state.text),
    retry: i.features.retry,
  };
}

function rekordboxRow(i: StatusInputs): StatusRow {
  const r = i.rekordboxRun;
  const s = i.rekordbox;
  const held = s === null ? null : `${n(s.matched)} matched`;
  const base = {
    source: 'rekordbox' as const,
    label: 'Rekordbox',
    retry: null,
  };
  if (r.status === 'running') {
    return {
      ...base,
      tone: 'running',
      text: join(held, `Running · ${r.index} / ${r.total} files`),
    };
  }
  if (r.status === 'error') {
    return {
      ...base,
      tone: 'error',
      text: join(held, `Failed · ${r.message}`),
    };
  }
  return s === null
    ? { ...base, tone: 'off', text: 'Not imported' }
    : {
        ...base,
        tone: 'ok',
        text: join(held, `imported ${formatDate(s.importedAt)}`),
      };
}

function reachRow(i: StatusInputs): StatusRow {
  const c = i.reachCoverage;
  const counts =
    c === null || c.artists === 0
      ? 'No artists yet'
      : `${n(c.covered)} of ${plural(c.artists, 'artist')}`;
  const line = fromUpdate(i.reach);
  return {
    source: 'reach',
    label: 'Artist reach',
    tone: line.tone,
    text: join(counts, line.text),
    retry: i.reach.retry,
  };
}

function historyRow(i: StatusInputs): StatusRow {
  const r = i.historyRun;
  const s = i.history;
  const held = s === null ? null : plural(s.plays, 'play');
  const base = {
    source: 'history' as const,
    label: 'Listening history',
    retry: null,
  };
  if (r.status === 'running') {
    return {
      ...base,
      tone: 'running',
      text: join(held, `Importing · ${r.index} / ${r.total} files`),
    };
  }
  if (r.status === 'error') {
    return {
      ...base,
      tone: 'error',
      text: join(held, `Failed · ${r.message}`),
    };
  }
  return s === null
    ? { ...base, tone: 'off', text: 'Not imported' }
    : {
        ...base,
        tone: 'ok',
        text: join(held, `imported ${formatDate(s.importedAt)}`),
      };
}

/** "library 3,199 · history 12,000 · …": the server table's Rows, known ones. */
export function serverRows(
  stamps: readonly ServerStampView[] | null
): string | null {
  if (stamps === null) return null;
  const known = stamps
    .filter((s) => s.rows !== null)
    .map((s) => `${s.name} ${n(s.rows ?? 0)}`);
  return known.length === 0 ? null : known.join(' · ');
}

function serverRow(i: StatusInputs): StatusRow {
  const rows = serverRows(i.stamps);
  return {
    source: 'server',
    label: 'This device ↔ server',
    tone: i.server.tone,
    text: join(i.server.text, rows === null ? null : `on the server: ${rows}`),
    retry: null,
  };
}

/** The block's lines, in a fixed order: Spotify first, the server last. */
export function syncStatusRows(i: StatusInputs): StatusRow[] {
  return [
    spotifyRow(i),
    featuresRow(i),
    rekordboxRow(i),
    reachRow(i),
    historyRow(i),
    serverRow(i),
  ];
}
