import type { AllRows, MixRow } from '../db/schema';
import { SC_PLAYER_PREFIX } from '../features/mix/oembed';
import type { DatasetName, StoreName } from './datasets';

/**
 * Every row that comes back from the server is untrusted input (security
 * review S3): it is rendered as links and one iframe. These checks run before
 * a pulled row is written or shown. A failing row is dropped and counted,
 * never fixed up; unknown extra fields are kept (optional fields need no
 * bump, ADR-05).
 */

export type Valid<T> = { ok: true; row: T } | { ok: false; reason: string };

type Row = Record<string, unknown>;

const SPOTIFY_PREFIX = 'https://open.spotify.com/';

function obj(v: unknown): v is Row {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function nonEmpty(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isHttps(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Absent, null, or an https URL. */
function optHttps(v: unknown): boolean {
  return v === undefined || v === null || isHttps(v);
}

function optSpotify(v: unknown): boolean {
  return (
    v === undefined ||
    v === null ||
    (typeof v === 'string' && v.startsWith(SPOTIFY_PREFIX))
  );
}

function optFinite(v: unknown): boolean {
  return v === undefined || v === null || finite(v);
}

function fail(reason: string): Valid<never> {
  return { ok: false, reason };
}

function checkRow(store: StoreName, r: Row): string | null {
  switch (store) {
    case 'playlists':
      if (!nonEmpty(r.id)) return 'id';
      if (typeof r.name !== 'string') return 'name';
      if (!optHttps(r.imageUrl)) return 'imageUrl';
      if (!optSpotify(r.spotifyUrl)) return 'spotifyUrl';
      if (!finite(r.syncedAt)) return 'syncedAt';
      return null;
    case 'tracks':
      if (!nonEmpty(r.key)) return 'key';
      if (typeof r.uri !== 'string') return 'uri';
      if (typeof r.name !== 'string') return 'name';
      if (!Array.isArray(r.artists)) return 'artists';
      if (!finite(r.durationMs)) return 'durationMs';
      if (!optSpotify(r.spotifyUrl)) return 'spotifyUrl';
      return null;
    case 'entries':
      if (!nonEmpty(r.playlistId)) return 'playlistId';
      if (!finite(r.position)) return 'position';
      if (!nonEmpty(r.trackKey)) return 'trackKey';
      return null;
    case 'topItems': {
      if (!nonEmpty(r.key)) return 'key';
      if (!Array.isArray(r.items)) return 'items';
      if (!finite(r.fetchedAt)) return 'fetchedAt';
      for (const item of r.items) {
        if (!obj(item)) return 'item';
        if (!optHttps(item.imageUrl)) return 'item.imageUrl';
        if (!optSpotify(item.spotifyUrl)) return 'item.spotifyUrl';
      }
      return null;
    }
    case 'plays':
      if (!nonEmpty(r.trackId)) return 'trackId';
      if (!finite(r.plays)) return 'plays';
      if (!finite(r.msPlayed)) return 'msPlayed';
      return null;
    case 'features':
      if (!nonEmpty(r.trackId)) return 'trackId';
      if (!finite(r.updatedAt)) return 'updatedAt';
      return null;
    case 'artistIdentity':
      if (!nonEmpty(r.artistId)) return 'artistId';
      if (typeof r.name !== 'string') return 'name';
      return null;
    case 'artistReach':
      if (!nonEmpty(r.key)) return 'key';
      if (!nonEmpty(r.artistId)) return 'artistId';
      if (!nonEmpty(r.source)) return 'source';
      if (!isHttps(r.sourceUrl)) return 'sourceUrl';
      if (!optFinite(r.value)) return 'value';
      if (!finite(r.fetchedAt)) return 'fetchedAt';
      return null;
  }
}

export function validateRow<S extends StoreName>(
  store: S,
  row: unknown
): Valid<AllRows[S][number]> {
  if (!obj(row)) return fail('not an object');
  const bad = checkRow(store, row);
  if (bad) return fail(`${store}.${bad}`);
  return { ok: true, row: row as AllRows[S][number] };
}

const CLUE_KINDS = new Set(['comment', 'chapter', 'description']);
const CLUE_TEXT_MAX = 1000;
const CLUE_AUTHOR_MAX = 200;

/** A worker clue (round 003): plain strings within their caps. */
function clueOk(c: unknown): boolean {
  if (!obj(c)) return false;
  return (
    typeof c.text === 'string' &&
    c.text.length <= CLUE_TEXT_MAX &&
    typeof c.author === 'string' &&
    c.author.length <= CLUE_AUTHOR_MAX &&
    (c.atSec === null || finite(c.atSec)) &&
    typeof c.kind === 'string' &&
    CLUE_KINDS.has(c.kind)
  );
}

function cluesOk(v: unknown, max: number): boolean {
  if (v === undefined) return true;
  return Array.isArray(v) && v.length <= max && v.every(clueOk);
}

export function validateMix(row: unknown): Valid<MixRow> {
  if (!obj(row)) return fail('not an object');
  if (!nonEmpty(row.url)) return fail('mixes.url');
  if (!finite(row.savedAt)) return fail('mixes.savedAt');
  if (row.playerSrc !== null && row.playerSrc !== undefined) {
    if (
      typeof row.playerSrc !== 'string' ||
      !row.playerSrc.startsWith(SC_PLAYER_PREFIX)
    ) {
      return fail('mixes.playerSrc');
    }
  }
  if (!obj(row.sources)) return fail('mixes.sources');
  if (!optHttps(row.sources.linkOut)) return fail('mixes.sources.linkOut');
  if (!optSpotify(row.playlistUrl)) return fail('mixes.playlistUrl');
  if (!Array.isArray(row.rows)) return fail('mixes.rows');
  for (const t of row.rows) {
    if (!obj(t)) return fail('mixes.row');
    if (typeof t.artist !== 'string' || typeof t.title !== 'string')
      return fail('mixes.row.text');
    if (!optFinite(t.startSec) || !optFinite(t.endSec))
      return fail('mixes.row.time');
    if (!optHttps(t.shazamUrl)) return fail('mixes.row.shazamUrl');
    if (t.origin !== undefined && t.origin !== 'replay' && t.origin !== 'clue')
      return fail('mixes.row.origin');
    if (t.speedPercent !== undefined && !finite(t.speedPercent))
      return fail('mixes.row.speedPercent');
    if (
      t.hits !== undefined &&
      !(typeof t.hits === 'number' && Number.isInteger(t.hits) && t.hits >= 1)
    )
      return fail('mixes.row.hits');
    if (t.clue !== undefined && !clueOk(t.clue)) return fail('mixes.row.clue');
    if (!cluesOk(t.clues, 30)) return fail('mixes.row.clues');
  }
  if (!cluesOk(row.clues, 200)) return fail('mixes.clues');
  return { ok: true, row: row as unknown as MixRow };
}

/** The summary a dataset's stamp carries, as the screens' gates expect it. */
export function validateSummary(name: DatasetName, value: unknown): boolean {
  switch (name) {
    case 'history':
      return obj(value) && value.version === 2 && finite(value.importedAt);
    case 'reach':
      return obj(value) && value.version === 1 && finite(value.ranAt);
    case 'features':
      return (
        value === null ||
        value === undefined ||
        (obj(value) && finite(value.importedAt))
      );
    case 'library':
      return value === null || value === undefined;
  }
}

/** A `jobs` row as the app reads it (worker round, data-model.md). */
export interface MixJobRow {
  id: string;
  payload: { url: string };
  status: 'queued' | 'claimed' | 'done' | 'failed';
  claimed_by: string | null;
  claimed_at: string | null;
  finished_at: string | null;
  error: string | null;
  created_at: string;
  applied_at: string | null;
  /** Round 004 (migration 0003); absent when the migration is not applied. */
  progress?: JobProgress | null;
  priority?: number;
  stop_requested_at?: string | null;
}

/** What the worker says about a running request (round 004). */
export interface JobProgress {
  step: string;
  done: number | null;
  total: number | null;
  percent: number | null;
  minutes_left: number | null;
  paused_until: string | null;
  warning: string | null;
  at: string | null;
}

const PROGRESS_TEXT_MAX = 200;

function optNum(v: unknown): number | null | undefined {
  if (v === undefined || v === null) return null;
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function optShort(v: unknown): string | null | undefined {
  if (v === undefined || v === null) return null;
  return typeof v === 'string' && v.length <= PROGRESS_TEXT_MAX ? v : undefined;
}

/** A worker's progress object, or null when absent or malformed (shown as none). */
export function validateProgress(v: unknown): JobProgress | null {
  if (!obj(v) || typeof v.step !== 'string' || v.step.length > 40) return null;
  const done = optNum(v.done);
  const total = optNum(v.total);
  const percent = optNum(v.percent);
  const minutes = optNum(v.minutes_left);
  const paused = optShort(v.paused_until);
  const warning = optShort(v.warning);
  const at = optShort(v.at);
  if (
    [done, total, percent, minutes, paused, warning, at].some(
      (x) => x === undefined
    )
  )
    return null;
  if (paused !== null && Number.isNaN(Date.parse(paused as string)))
    return null;
  if (at !== null && Number.isNaN(Date.parse(at as string))) return null;
  return {
    step: v.step,
    done: done as number | null,
    total: total as number | null,
    percent: percent as number | null,
    minutes_left: minutes as number | null,
    paused_until: paused as string | null,
    warning: warning as string | null,
    at: at as string | null,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOB_STATUSES = new Set(['queued', 'claimed', 'done', 'failed']);
/** `claimed_by` and `error` are rendered as text; a cap keeps a hostile row short. */
const JOB_TEXT_MAX = 200;

function optText(v: unknown): v is string | null | undefined {
  return (
    v === null ||
    v === undefined ||
    (typeof v === 'string' && v.length <= JOB_TEXT_MAX)
  );
}

function isDate(v: unknown): v is string {
  return typeof v === 'string' && Number.isFinite(Date.parse(v));
}

function optDate(v: unknown): v is string | null | undefined {
  return v === null || v === undefined || isDate(v);
}

/**
 * One pulled `jobs` row, or null when any field is off (security review S3:
 * every pulled row is checked before it is stored or rendered). `result` is
 * not part of the row here; it is fetched and checked separately when the
 * app is about to apply it.
 */
export function validateJobRow(value: unknown): MixJobRow | null {
  if (!obj(value)) return null;
  if (typeof value.id !== 'string' || !UUID.test(value.id)) return null;
  if (typeof value.status !== 'string' || !JOB_STATUSES.has(value.status))
    return null;
  if (!obj(value.payload) || !isHttps(value.payload.url)) return null;
  if (!optText(value.claimed_by) || !optText(value.error)) return null;
  if (!isDate(value.created_at)) return null;
  if (
    !optDate(value.claimed_at) ||
    !optDate(value.finished_at) ||
    !optDate(value.applied_at)
  )
    return null;
  return {
    id: value.id,
    payload: { url: value.payload.url as string },
    status: value.status as MixJobRow['status'],
    claimed_by: value.claimed_by ?? null,
    claimed_at: value.claimed_at ?? null,
    finished_at: value.finished_at ?? null,
    error: value.error ?? null,
    created_at: value.created_at,
    applied_at: value.applied_at ?? null,
    progress: validateProgress(value.progress),
    priority:
      typeof value.priority === 'number' && Number.isInteger(value.priority)
        ? value.priority
        : 0,
    stop_requested_at:
      typeof value.stop_requested_at === 'string' &&
      !Number.isNaN(Date.parse(value.stop_requested_at))
        ? value.stop_requested_at
        : null,
  };
}
