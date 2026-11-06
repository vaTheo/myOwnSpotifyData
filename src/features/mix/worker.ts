import type { MixJobView, TracklistRow } from '../../db/schema';
import type { ServerStatus } from '../../server/types';
import { validateJobRow, type MixJobRow } from '../../server/validate';
import { parseTracklistifyJson } from './tracklistify';

/**
 * The pure rules of the identify request (specs/002-mix-analysis-worker,
 * contracts/client-api.md): the worker's result into scan rows, the merge
 * into a saved mix, a server row into the screen's view, and the one place
 * that words the button and the state line.
 */

export type WorkerResult =
  | { ok: true; title: string; author: string | null; rows: TracklistRow[] }
  | { ok: false; message: string };

/**
 * The result the worker sent, as scan rows. `parseTracklistifyJson` is the
 * same parser the hand import uses (F15), so a result and a hand-imported
 * JSON produce identical rows; its synthetic `tracklistify:` key is dropped
 * because the request's canonical link is the mix key. Every row is checked
 * once more here (security review S3): a non-finite number drops the row.
 */
export function resultToRows(result: unknown): WorkerResult {
  if (typeof result !== 'object' || result === null) {
    return { ok: false, message: 'The result is not a tracklist.' };
  }
  const parsed = parseTracklistifyJson(JSON.stringify(result));
  if (parsed.status === 'error') return { ok: false, message: parsed.message };
  const rows = parsed.rows.filter(
    (row) =>
      (row.startSec === null || Number.isFinite(row.startSec)) &&
      (row.confidence === null ||
        row.confidence === undefined ||
        Number.isFinite(row.confidence))
  );
  if (rows.length === 0) {
    return { ok: false, message: 'No usable track in the result.' };
  }
  const info = (result as { mix_info?: { artist?: unknown } }).mix_info;
  const artist =
    typeof info?.artist === 'string' && info.artist.trim() !== ''
      ? info.artist.trim()
      : null;
  return { ok: true, title: parsed.title, author: artist, rows };
}

/** A scan row the owner never edited: its text still reads as detected. */
function untouchedScanRow(row: TracklistRow): boolean {
  return (
    row.source === 'tracklistify' &&
    row.detected !== null &&
    row.artist === row.detected.artist &&
    row.title === row.detected.title
  );
}

/**
 * FR-006: a new result replaces the untouched scan rows and nothing else;
 * manual, pasted, TrackId, description and edited rows stay. Ordered by time,
 * rows without a time last, stable among equals (kept rows before incoming).
 */
export function mergeWorkerRows(
  existing: TracklistRow[],
  incoming: TracklistRow[]
): TracklistRow[] {
  const kept = existing.filter((row) => !untouchedScanRow(row));
  const all = [...kept, ...incoming];
  return all
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const x = a.row.startSec;
      const y = b.row.startSec;
      if (x === null && y === null) return a.index - b.index;
      if (x === null) return 1;
      if (y === null) return -1;
      return x - y || a.index - b.index;
    })
    .map((item) => item.row);
}

function epoch(value: string | null): number | null {
  return value === null ? null : Date.parse(value);
}

/** One pulled `jobs` row as the Mix screen keeps it, or null when refused. */
export function jobView(row: unknown): MixJobView | null {
  const valid: MixJobRow | null = validateJobRow(row);
  if (valid === null) return null;
  return {
    id: valid.id,
    status: valid.status,
    createdAt: Date.parse(valid.created_at),
    claimedBy: valid.claimed_by,
    claimedAt: epoch(valid.claimed_at),
    finishedAt: epoch(valid.finished_at),
    error: valid.error,
    appliedAt: epoch(valid.applied_at),
  };
}

export interface RequestStatusText {
  /** The button's label. */
  button: string;
  /** Whether a tap can record a request now. */
  canAsk: boolean;
  /** The latest request's state, or null when there is none. */
  line: string | null;
}

const ASK = 'Identify on my computer';
const ASK_AGAIN = 'Ask again';

function when(ms: number | null): string {
  if (ms === null) return '…';
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function stateLine(view: MixJobView): string {
  switch (view.status) {
    case 'queued':
      return `Waiting for your computer since ${when(view.createdAt)}`;
    case 'claimed':
      return `Running on ${view.claimedBy ?? 'your computer'} since ${when(view.claimedAt ?? view.createdAt)}`;
    case 'done':
      return view.rejected
        ? 'Result rejected — ask again'
        : `Done ${when(view.finishedAt)}`;
    case 'failed':
      return `Failed ${when(view.finishedAt)}: ${view.error ?? 'no reason given'}`;
  }
}

/**
 * FR-001, FR-003, FR-004 and US2 scenario 5 in one function: the server
 * states that cannot take a request carry the Settings card's wording; a
 * waiting or running request blocks a second one; a done, failed or
 * rejected one offers "Ask again".
 */
export function requestStatusText(
  view: MixJobView | undefined,
  server: ServerStatus
): RequestStatusText {
  const line = view ? stateLine(view) : null;
  switch (server.status) {
    case 'unset':
      return { button: 'Server not set up (Settings)', canAsk: false, line };
    case 'signedOut':
      return { button: 'Sign in to the server (Settings)', canAsk: false, line };
    case 'offline':
      return { button: 'Server unreachable', canAsk: false, line };
    case 'paused':
      return {
        button: 'Server paused — resume it from the dashboard',
        canAsk: false,
        line,
      };
    case 'pushing':
    case 'pulling':
      return { button: 'Syncing with the server…', canAsk: false, line };
    default:
      break;
  }
  if (view && (view.status === 'queued' || view.status === 'claimed')) {
    return { button: ASK, canAsk: false, line };
  }
  if (view) return { button: ASK_AGAIN, canAsk: true, line };
  return { button: ASK, canAsk: true, line: null };
}
