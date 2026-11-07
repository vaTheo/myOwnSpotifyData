import type { RemovedTrack, TracklistRow } from '../../db/schema';
import { normalize } from '../../model/normalize';
import { cleanTitle } from '../rekordbox-match';
import { INERT, artistCore, sameTitle } from './spotifySearch';

/**
 * A later worker result keeps the owner's review (spec 003 T125, owner's
 * D1). Pure: the sync applies it when a result lands on a saved mix.
 */

/** What two tracks are compared on. */
export interface TrackName {
  artist: string;
  title: string;
  isrc?: string | null;
}

/** The most removed tracks a mix remembers; the oldest go first. */
export const REMOVED_MAX = 500;

function named(t: TrackName): boolean {
  return !INERT.has(normalize(t.artist)) && !INERT.has(normalize(t.title));
}

/**
 * The same recording: one ISRC, else the same artist (`artistCore`
 * equality, never containment) and the same title (`sameTitle` on the
 * cleaned titles: "Original Mix" drops, a remix name stays). Rows without
 * a real name ("ID", gaps) never match.
 */
export function sameTrack(a: TrackName, b: TrackName): boolean {
  const ia = a.isrc?.trim().toUpperCase();
  const ib = b.isrc?.trim().toUpperCase();
  if (ia && ib && ia === ib) return true;
  if (!named(a) || !named(b)) return false;
  const artist = artistCore(a.artist);
  if (artist === '' || artist !== artistCore(b.artist)) return false;
  const ta = cleanTitle(a.title);
  return ta !== '' && sameTitle(ta, cleanTitle(b.title));
}

/** A scan row the owner never edited: its text still reads as detected. */
function untouchedScan(row: TracklistRow): boolean {
  return (
    row.source === 'tracklistify' &&
    row.detected !== null &&
    row.artist === row.detected.artist &&
    row.title === row.detected.title
  );
}

/** The names a kept row answers to: its text, and what was detected. */
function namesOf(row: TracklistRow): TrackName[] {
  const names: TrackName[] = [
    { artist: row.artist, title: row.title, isrc: row.isrc },
  ];
  if (row.detected !== null) {
    names.push({ ...row.detected, isrc: row.isrc });
  }
  return names;
}

/** The review a scan row carries to the incoming row that replaces it. */
function review(row: TracklistRow): Partial<TracklistRow> {
  return {
    ...(row.validated !== undefined ? { validated: row.validated } : {}),
    ...(row.spotify !== undefined ? { spotify: row.spotify } : {}),
    ...(row.checkedAt !== undefined ? { checkedAt: row.checkedAt } : {}),
  };
}

/** Round 005: a year the row already had (Create playlist's Spotify album)
 *  stays when the incoming row carries none; an incoming year wins. */
function yearKept(
  before: TracklistRow,
  row: TracklistRow
): Partial<TracklistRow> {
  if (typeof row.year === 'number' || typeof before.year !== 'number')
    return {};
  return before.yearFrom === undefined
    ? { year: before.year }
    : { year: before.year, yearFrom: before.yearFrom };
}

/** By time, rows without a time last, stable among equals. */
export function byTime(rows: TracklistRow[]): TracklistRow[] {
  return rows
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

/**
 * A new result merged into a saved mix's rows (replaces `mergeWorkerRows`
 * in the sync):
 * - edited, typed, pasted, TrackId and description rows stay, and an
 *   incoming row matching one of them (its text or what was detected) is
 *   dropped;
 * - an incoming row matching a removed track is dropped;
 * - an untouched scan row that an incoming row matches is replaced by it,
 *   which carries `validated`, `spotify` and `checkedAt`;
 * - an untouched scan row nothing matches goes, as before, unless the
 *   owner validated it (a review is never lost to a shorter result);
 * - every other incoming row arrives To review. Gap rows are replaced.
 */
export function mergeKeepingReview(
  existing: readonly TracklistRow[],
  incoming: readonly TracklistRow[],
  removed: readonly RemovedTrack[]
): TracklistRow[] {
  const scans = existing.filter((r) => !r.gap && untouchedScan(r));
  const kept = existing.filter((r) => !untouchedScan(r));
  const keptNames = kept.filter((r) => !r.gap).flatMap(namesOf);
  const matched = new Set<TracklistRow>();
  const arriving: TracklistRow[] = [];
  for (const row of incoming) {
    if (row.gap) {
      arriving.push(row);
      continue;
    }
    if (removed.some((t) => sameTrack(t, row))) continue;
    if (keptNames.some((t) => sameTrack(t, row))) continue;
    // One existing row's review goes to one incoming row (fix round 1).
    const before = scans.find((s) => !matched.has(s) && sameTrack(s, row));
    if (before) {
      matched.add(before);
      arriving.push({ ...row, ...review(before), ...yearKept(before, row) });
    } else {
      arriving.push(row);
    }
  }
  const stillValidated = scans.filter(
    (s) => !matched.has(s) && s.validated === true
  );
  return byTime([...kept, ...stillValidated, ...arriving]);
}

/**
 * `deleteMixRow`'s memory (T125): a deleted row that was detected (a scan
 * or TrackId row, corrected or not) joins the mix's removed list by its
 * detected artist and title and its ISRC, at most `REMOVED_MAX`, the
 * oldest dropped, so a later result does not bring it back. Gaps and rows
 * with nothing detected (typed, pasted) leave it unchanged.
 */
export function recordRemoved(
  removed: readonly RemovedTrack[] | undefined,
  row: TracklistRow
): RemovedTrack[] | undefined {
  if (row.gap || row.detected === null) {
    return removed === undefined ? undefined : [...removed];
  }
  const name = row.detected;
  const next = [
    ...(removed ?? []),
    { artist: name.artist, title: name.title, isrc: row.isrc ?? null },
  ];
  return next.slice(-REMOVED_MAX);
}
