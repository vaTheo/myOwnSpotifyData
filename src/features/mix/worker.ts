import type { Clue, MixJobView, MixRun, TracklistRow } from '../../db/schema';
import type { ServerStatus } from '../../server/types';
import { validateJobRow, type MixJobRow } from '../../server/validate';
import { decadeOf, parseYear } from '../../model/year';
import { evidenceExtras } from './evidence';
import { oneRowPerSong } from './oneRowPerSong';
import { parseTracklistifyJson } from './tracklistify';

/**
 * The pure rules of the identify request (specs/002-mix-analysis-worker,
 * contracts/client-api.md): the worker's result into scan rows, the merge
 * into a saved mix, a server row into the screen's view, and the one place
 * that words the button and the state line.
 */

export type WorkerResult =
  | {
      ok: true;
      title: string;
      author: string | null;
      rows: TracklistRow[];
      /** Round 003: set-wide clues (empty when none). */
      clues: Clue[];
      /** T124: what the worker said about its run, absent when nothing. */
      run?: MixRun;
    }
  | { ok: false; message: string };

/** Caps on third-party text kept from a result (data-model.md, round 003). */
export const CLUE_TEXT_MAX = 1000;
export const CLUE_AUTHOR_MAX = 200;
export const GAP_CLUES_MAX = 30;
export const SET_CLUES_MAX = 200;

const CLUE_KINDS = new Set(['comment', 'chapter', 'description']);

function cut(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/** One clue from the result, or null when it fails the checks (dropped). */
export function toClue(value: unknown): Clue | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.text !== 'string' || v.text.trim() === '') return null;
  if (typeof v.kind !== 'string' || !CLUE_KINDS.has(v.kind)) return null;
  const at = v.at;
  if (
    at !== null &&
    at !== undefined &&
    (typeof at !== 'number' || !Number.isFinite(at))
  ) {
    return null;
  }
  return {
    atSec: typeof at === 'number' ? at : null,
    author: cut(
      typeof v.author === 'string' ? v.author.trim() : '',
      CLUE_AUTHOR_MAX
    ),
    text: cut(v.text.trim(), CLUE_TEXT_MAX),
    kind: v.kind as Clue['kind'],
  };
}

function toClues(value: unknown, max: number): Clue[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(toClue)
    .filter((c): c is Clue => c !== null)
    .slice(0, max);
}

/** The worker's own additions on one track entry (round 003). */
function trackExtras(track: unknown): Partial<TracklistRow> {
  if (typeof track !== 'object' || track === null) return {};
  const t = track as Record<string, unknown>;
  const hits =
    typeof t.hits === 'number' &&
    Number.isInteger(t.hits) &&
    t.hits >= 1 &&
    t.origin !== 'clue' &&
    t.origin !== 'trackid'
      ? { hits: t.hits }
      : {};
  if (t.origin === 'replay') {
    const pct = t.speed_percent;
    return {
      origin: 'replay',
      ...hits,
      ...(typeof pct === 'number' && Number.isFinite(pct)
        ? { speedPercent: pct }
        : {}),
      ...yearExtras(t.metadata),
      ...evidenceExtras(t),
    };
  }
  if (t.origin === 'clue') {
    const clue = toClue(t.clue);
    return { origin: 'clue', ...(clue ? { clue } : {}) };
  }
  if (t.origin === 'trackid') {
    const trackid = toTrackid(t.trackid);
    const shazamCheck = toShazamCheck(t.shazam_check);
    return {
      origin: 'trackid',
      ...(trackid ? { trackid } : {}),
      ...(shazamCheck ? { shazamCheck } : {}),
    };
  }
  return { ...hits, ...yearExtras(t.metadata), ...evidenceExtras(t) };
}

const TRACKID_SECONDS_MAX = 100_000;
const TRACKID_TEXT_MAX = 200;

/** Round 016: the worker's `trackid` object, or null outside the bounds. */
function toTrackid(v: unknown): TracklistRow['trackid'] | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const a = o.span_start;
  const b = o.span_end;
  if (typeof o.slug !== 'string' || o.slug.length > TRACKID_TEXT_MAX)
    return null;
  if (typeof a !== 'number' || typeof b !== 'number') return null;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a < 0 || b < a || b > TRACKID_SECONDS_MAX) return null;
  const refs = o.references;
  return {
    slug: o.slug,
    spanStart: a,
    spanEnd: b,
    ...(typeof refs === 'number' && Number.isInteger(refs) && refs >= 0
      ? { references: refs }
      : {}),
  };
}

/** Round 016: the worker's `shazam_check` (`song_name` is the title). */
function toShazamCheck(v: unknown): TracklistRow['shazamCheck'] | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const outcome = o.outcome;
  if (outcome === 'agrees' || outcome === 'no_match' || outcome === 'not_asked')
    return { outcome };
  if (outcome !== 'differs') return null;
  const text = (x: unknown): string | null =>
    typeof x === 'string' && x.length <= TRACKID_TEXT_MAX ? x : null;
  const artist = text(o.artist);
  const title = text(o.song_name);
  const c = o.confidence;
  const confidence =
    typeof c === 'number' && Number.isFinite(c) && c >= 0 && c <= 1 ? c : null;
  return {
    outcome,
    ...(artist !== null ? { artist } : {}),
    ...(title !== null ? { title } : {}),
    ...(confidence !== null ? { confidence } : {}),
  };
}

/**
 * Round 005 (T004): a heard track's year from `metadata.release_date`;
 * `release_date_from` names the catalogue the worker filled it from, else it
 * is Shazam's. Absent when the date is missing or out of range.
 */
function yearExtras(metadata: unknown): Partial<TracklistRow> {
  if (typeof metadata !== 'object' || metadata === null) return {};
  const m = metadata as Record<string, unknown>;
  const year = parseYear(m.release_date);
  if (year === null) return {};
  const from = m.release_date_from;
  return {
    year,
    yearFrom:
      from === 'deezer' || from === 'musicbrainz' ? 'catalogue' : 'shazam',
  };
}

/** The tracks the F15 parser keeps (non-empty artist and title), in order. */
function keptTracks(result: object): unknown[] {
  const tracks = (result as { tracks?: unknown }).tracks;
  if (!Array.isArray(tracks)) return [];
  return tracks.filter((t) => {
    if (typeof t !== 'object' || t === null) return false;
    const { artist, song_name } = t as Record<string, unknown>;
    return (
      typeof artist === 'string' &&
      artist.trim() !== '' &&
      typeof song_name === 'string' &&
      song_name.trim() !== ''
    );
  });
}

/** Gap rows from `mix_info.gaps`, each with its clues (round 003). */
function gapRows(info: unknown): TracklistRow[] {
  const gaps = (info as { gaps?: unknown } | undefined)?.gaps;
  if (!Array.isArray(gaps)) return [];
  const rows: TracklistRow[] = [];
  for (const g of gaps) {
    if (typeof g !== 'object' || g === null) continue;
    const { start, end, clues } = g as Record<string, unknown>;
    if (typeof start !== 'number' || !Number.isFinite(start)) continue;
    if (typeof end !== 'number' || !Number.isFinite(end) || end < start)
      continue;
    const kept = toClues(clues, GAP_CLUES_MAX);
    if (kept.length === 0) continue;
    rows.push({
      startSec: start,
      endSec: end,
      artist: '',
      title: '',
      label: null,
      source: 'tracklistify',
      gap: true,
      // As detected, so the next result replaces it like any scan row.
      detected: { artist: '', title: '' },
      referenceCount: null,
      clues: kept,
    });
  }
  return rows;
}

/**
 * The result the worker sent, as scan rows. `parseTracklistifyJson` is the
 * same parser the hand import uses (F15), so a result and a hand-imported
 * JSON produce identical rows; its synthetic `tracklistify:` key is dropped
 * because the request's canonical link is the mix key. Every row is checked
 * once more here (security review S3): a non-finite number drops the row.
 * A song named at several times keeps one row (`oneRowPerSong`, spec 018).
 */
export function resultToRows(result: unknown): WorkerResult {
  if (typeof result !== 'object' || result === null) {
    return { ok: false, message: 'The result is not a tracklist.' };
  }
  const parsed = parseTracklistifyJson(JSON.stringify(result));
  if (parsed.status === 'error') return { ok: false, message: parsed.message };
  // The parser keeps tracks in order and drops the same ones `keptTracks`
  // drops, so the worker's additions line up; on any mismatch none is used.
  const kept = keptTracks(result);
  const withExtras =
    kept.length === parsed.rows.length
      ? parsed.rows.map((row, i) => ({ ...row, ...trackExtras(kept[i]) }))
      : parsed.rows;
  const info = (result as { mix_info?: unknown }).mix_info;
  const rows = [...withExtras, ...gapRows(info)].filter(
    (row) =>
      (row.startSec === null || Number.isFinite(row.startSec)) &&
      (row.confidence === null ||
        row.confidence === undefined ||
        Number.isFinite(row.confidence))
  );
  if (rows.length === 0) {
    return { ok: false, message: 'No usable track in the result.' };
  }
  const mixInfo = info as { artist?: unknown; clues?: unknown } | undefined;
  const artist =
    typeof mixInfo?.artist === 'string' && mixInfo.artist.trim() !== ''
      ? mixInfo.artist.trim()
      : null;
  const run = toRun(info);
  return {
    ok: true,
    title: parsed.title,
    author: artist,
    // Spec 018: a song heard at several times keeps one row, the earliest.
    rows: mergeWorkerRows([], oneRowPerSong(rows)),
    clues: toClues(mixInfo?.clues, SET_CLUES_MAX),
    ...(run ? { run } : {}),
  };
}

/** Caps on the run's worker text (third-party to the app, kept short). */
export const RUN_TEXT_MAX = 200;
export const RUN_WARNINGS_MAX = 10;

function count(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;
}

function shortText(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== ''
    ? cut(v.trim(), RUN_TEXT_MAX)
    : null;
}

/**
 * T124 (owner's D3): the run's facts from `mix_info` — the second pass
 * (`places`, or round 003's `replays`), the resume, the early stop and
 * the warnings. A malformed part is dropped, never fixed up; undefined
 * when nothing is left.
 */
export function toRun(info: unknown): MixRun | undefined {
  if (typeof info !== 'object' || info === null) return undefined;
  const i = info as Record<string, unknown>;
  const run: MixRun = {};
  const sp = i.second_pass;
  if (typeof sp === 'object' && sp !== null) {
    const s = sp as Record<string, unknown>;
    const places = count(s.places ?? s.replays);
    const found = count(s.found);
    const stopped = s.stopped === null ? null : shortText(s.stopped);
    if (
      places !== null &&
      found !== null &&
      (s.stopped === null || stopped !== null)
    ) {
      run.secondPass = { places, found, stopped };
    }
  }
  const re = i.resumed;
  if (typeof re === 'object' && re !== null) {
    const kept = count((re as Record<string, unknown>).probes_kept);
    if (kept !== null && kept > 0) run.resumed = { probesKept: kept };
  }
  const se = i.stopped_early;
  if (typeof se === 'object' && se !== null) {
    const s = se as Record<string, unknown>;
    const at = typeof s.at === 'string' && CLOCK.test(s.at) ? s.at : null;
    const reason = shortText(s.reason);
    if (at !== null && reason !== null) run.stoppedEarly = { at, reason };
  }
  if (Array.isArray(i.warnings)) {
    const warnings = i.warnings
      .map(shortText)
      .filter((w): w is string => w !== null)
      .slice(0, RUN_WARNINGS_MAX);
    if (warnings.length > 0) run.warnings = warnings;
  }
  return Object.keys(run).length > 0 ? run : undefined;
}

/** A worker clock, "01:12:00" (hours may have one digit). */
export const CLOCK = /^\d{1,2}:\d{2}:\d{2}$/;

/** The worker's warning codes as the owner reads them. */
const WARNING_TEXT: Record<string, string> = {
  'refuses often': 'Shazam refuses often: a VPN or a shared network?',
};

export interface RunLineText {
  /** "Second pass: 41 places · 3 found · Resumed (120 clips kept)", or null. */
  line: string | null;
  /** "Stopped early at 01:12:00 (rate limited)", or null. */
  stoppedEarly: string | null;
  /** One sentence per warning. */
  warnings: string[];
}

/** T124: the open mix's run line, or null for a mix without a run. */
export function runLine(run: MixRun | undefined): RunLineText | null {
  if (!run) return null;
  const parts: string[] = [];
  const sp = run.secondPass;
  if (sp) {
    parts.push(
      `Second pass: ${sp.places} ${sp.places === 1 ? 'place' : 'places'} · ${sp.found} found` +
        (sp.stopped !== null ? ` · stopped (${sp.stopped})` : '')
    );
  }
  if (run.resumed) {
    parts.push(`Resumed (${run.resumed.probesKept} clips kept)`);
  }
  const stoppedEarly = run.stoppedEarly
    ? `Stopped early at ${run.stoppedEarly.at} (${run.stoppedEarly.reason})`
    : null;
  const warnings = (run.warnings ?? []).map((w) => WARNING_TEXT[w] ?? w);
  if (parts.length === 0 && stoppedEarly === null && warnings.length === 0)
    return null;
  return {
    line: parts.length > 0 ? parts.join(' · ') : null,
    stoppedEarly,
    warnings,
  };
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
    progress: valid.progress
      ? {
          step: valid.progress.step,
          done: valid.progress.done,
          total: valid.progress.total,
          percent: valid.progress.percent,
          minutesLeft: valid.progress.minutes_left,
          pausedUntil: epoch(valid.progress.paused_until),
          warning: valid.progress.warning,
          at: epoch(valid.progress.at),
        }
      : null,
    priority: valid.priority ?? 0,
    stopRequestedAt: epoch(valid.stop_requested_at ?? null),
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

/** Progress older than this is stale: the computer stopped sending news. */
export const PROGRESS_STALE_MS = 10 * 60 * 1000;

const STEP_NAMES: Record<string, string> = {
  download: 'Downloading',
  first: 'First pass',
  clues: 'Reading the comments',
  trackid: 'TrackId.net',
  send: 'Sending',
  paused: 'Paused by Shazam',
};

/** A progress step as the owner reads it: "First pass", "Second pass ×1.04". */
export function stepName(step: string): string {
  return step.startsWith('second')
    ? `Second pass ${step.slice('second'.length).trim()}`.trim()
    : (STEP_NAMES[step] ?? step);
}

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { timeStyle: 'short' });
}

/**
 * Round 004: what a running request is doing, from the worker's progress:
 * "First pass · 47 % · about 25 min left", "Paused by Shazam until 20:35",
 * plus the network warning and a note when news stopped coming.
 */
export function progressLine(view: MixJobView, now: number): string | null {
  const p = view.progress;
  if (!p) return null;
  const parts: string[] = [];
  const name = stepName(p.step);
  if (p.step === 'paused' && p.pausedUntil !== null) {
    parts.push(`Paused by Shazam until ${clock(p.pausedUntil)}`);
  } else {
    parts.push(name);
    if (p.percent !== null) parts.push(`${Math.round(p.percent)} %`);
    if (p.minutesLeft !== null)
      parts.push(`about ${Math.max(1, Math.round(p.minutesLeft))} min left`);
  }
  if (p.warning === 'refuses often') {
    parts.push('Shazam refuses often: a VPN or a shared network?');
  }
  if (p.at !== null && now - p.at > PROGRESS_STALE_MS) {
    parts.push(`last news ${clock(p.at)}: the computer stopped sending news`);
  }
  if (view.stopRequestedAt !== null && view.stopRequestedAt !== undefined) {
    parts.push('stopping…');
  }
  return parts.join(' · ');
}

function stateLine(view: MixJobView): string {
  switch (view.status) {
    case 'queued':
      return `Waiting for your computer since ${when(view.createdAt)}`;
    case 'claimed':
      return (
        progressLine(view, Date.now()) ??
        `Running on ${view.claimedBy ?? 'your computer'} since ${when(view.claimedAt ?? view.createdAt)}`
      );
    case 'done':
      return view.rejected
        ? 'Result rejected — ask again'
        : // A worker that stopped early still sends what it found, with a note.
          `Done ${when(view.finishedAt)}${view.error ? ` · ${view.error}` : ''}`;
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
      return {
        button: 'Sign in to the server (Settings)',
        canAsk: false,
        line,
      };
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

/** One row of the Mix screen's "Requests to your computer" card. */
export interface RequestListItem {
  /**
   * The request key (`requestKey` output): the link the request carries. The
   * worker downloads it, or for a phone share link the set it leads to.
   */
  key: string;
  /** Round 004: the latest request's id and status, for Cancel, Move to top, Stop. */
  id: string;
  status: MixJobView['status'];
  /** The saved mix's title, else the link's host and last path part. */
  title: string;
  /** Short state badge. */
  label: 'Waiting' | 'Identifying' | 'Done' | 'Rejected' | 'Failed';
  /** The state line `requestStatusText` gives the same request. */
  line: string;
  /** Rows on the saved mix, when one exists. */
  tracks: number | null;
  /** Whether a saved mix exists for this key (the row opens it). */
  saved: boolean;
  /** A failed or rejected request the server can take again now. */
  canAskAgain: boolean;
}

/** A link without a title: its host and last path part. */
export function shortLink(key: string): string {
  try {
    const u = new URL(key);
    // A YouTube watch link is named by its video id, not "watch".
    const last =
      u.searchParams.get('v') ?? u.pathname.split('/').filter(Boolean).pop();
    const host = u.hostname.replace(/^www\./, '');
    return last ? `${host} · ${decodeURIComponent(last)}` : host;
  } catch {
    return key;
  }
}

function labelOf(view: MixJobView): RequestListItem['label'] {
  switch (view.status) {
    case 'queued':
      return 'Waiting';
    case 'claimed':
      return 'Identifying';
    case 'done':
      return view.rejected ? 'Rejected' : 'Done';
    case 'failed':
      return 'Failed';
  }
}

/** When a request last changed: finished, else claimed, else created. */
export function requestAt(v: MixJobView): number {
  return v.finishedAt ?? v.claimedAt ?? v.createdAt;
}

/**
 * The queue's order (T121): running first; then waiting in the order the
 * worker takes them (`claim_job`: priority high to low, then oldest first),
 * so Move to top shows the request first; then the finished ones, newest
 * first. A comparator for `sort`.
 */
export function queueOrder(a: MixJobView, b: MixJobView): number {
  const rank = (v: MixJobView): number =>
    v.status === 'claimed' ? 0 : v.status === 'queued' ? 1 : 2;
  const r = rank(a) - rank(b);
  if (r !== 0) return r;
  if (a.status === 'queued') {
    return (b.priority ?? 0) - (a.priority ?? 0) || a.createdAt - b.createdAt;
  }
  return requestAt(b) - requestAt(a);
}

/**
 * Every link's latest request, for the card, in `queueOrder`.
 */
export function requestList(
  jobs: Record<string, MixJobView[]>,
  mixes: readonly {
    url: string;
    title: string | null;
    rows: readonly { gap?: boolean }[];
  }[],
  server: ServerStatus
): RequestListItem[] {
  const latest = Object.entries(jobs)
    .map(([key, history]) => ({ key, view: history[0] }))
    .filter(
      (e): e is { key: string; view: MixJobView } => e.view !== undefined
    );
  latest.sort((a, b) => queueOrder(a.view, b.view));
  return latest.map(({ key, view }) => {
    const mix = mixes.find((m) => m.url === key);
    const label = labelOf(view);
    const text = requestStatusText(view, server);
    return {
      key,
      id: view.id,
      status: view.status,
      title: mix?.title ?? shortLink(key),
      label,
      line: text.line ?? '',
      tracks: mix ? mix.rows.filter((r) => !r.gap).length : null,
      saved: mix !== undefined,
      canAskAgain: (label === 'Failed' || label === 'Rejected') && text.canAsk,
    };
  });
}

/**
 * A tracklist row's own year, the one the Released column shows and the
 * year sort and decade use: null for a gap or an undated row (round 005).
 */
export function rowYear(row: TracklistRow): number | null {
  return !row.gap && typeof row.year === 'number' ? row.year : null;
}

/**
 * The subset of the tracklist the owner chose to look at, as indexes into
 * `rows` in set order (so Edit and Delete still act on the real row). "Heard
 * once" keeps rows matched by a single clip; `decade` keeps the rows dated in
 * that decade (round 005). Both hide, never delete. The order is the table's
 * own sort (spec 009).
 */
export function viewRows(
  rows: readonly TracklistRow[],
  heardOnce: boolean,
  decade: number | null = null
): number[] {
  return rows
    .map((_, i) => i)
    .filter((i) => !heardOnce || rows[i].hits === 1)
    .filter((i) => {
      if (decade === null) return true;
      const y = rowYear(rows[i]);
      return y !== null && decadeOf(y) === decade;
    });
}
