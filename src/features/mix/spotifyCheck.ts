import type { SpotifyCheck, TracklistRow } from '../../db/schema';
import type { SpotifyClient } from '../../spotify/client';
import { isIdentified, searchTrack } from './spotifySearch';

/**
 * Check on Spotify (spec 003 §12, T117): on a tap, or when a saved mix opens
 * (`autoCheckDue`, ADR-13), never on load (ADR-02), each named track not checked yet goes through the same
 * `searchTrack`/`pickMatch` as Create playlist, one at a time. A read, no
 * write. The answer is kept on the row (`spotify`, `checkedAt`), so Create
 * playlist reuses a found track instead of searching again.
 */

const TRACK_PREFIX = 'spotify:track:';

/** The rows a check asks about: named tracks never checked; no gap, no ID. */
export function rowsToCheck(rows: readonly TracklistRow[]): TracklistRow[] {
  return rows.filter((r) => isIdentified(r) && r.spotify === undefined);
}

/**
 * Whether opening a mix starts Check on Spotify by itself (ADR-13): the
 * Automatic updates switch is on, a Spotify session exists, no quota lock-out
 * and no other Spotify reader runs (so the automatic check never shows a
 * refusal), the mix has named tracks never checked, and this page session has
 * not tried this mix yet (a stopped or failed check is not retried on every
 * reopen; the button stays).
 */
export function autoCheckDue(p: {
  switchOn: boolean;
  signedIn: boolean;
  lockedUntil: number | null;
  busy: boolean;
  rows: readonly TracklistRow[];
  alreadyTried: boolean;
}): boolean {
  return (
    p.switchOn &&
    p.signedIn &&
    p.lockedUntil === null &&
    !p.busy &&
    !p.alreadyTried &&
    rowsToCheck(p.rows).length > 0
  );
}

/** The row with Search's answer: the track's id and link, or not found. */
export function checkedRow(
  row: TracklistRow,
  uri: string | null,
  now: number
): TracklistRow {
  const id =
    uri !== null && uri.startsWith(TRACK_PREFIX)
      ? uri.slice(TRACK_PREFIX.length)
      : null;
  return {
    ...row,
    spotify:
      id !== null && /^[A-Za-z0-9]+$/.test(id)
        ? { id, url: `https://open.spotify.com/track/${id}` }
        : 'not-found',
    checkedAt: now,
  };
}

/** The track a check found, as a URI Create playlist can add, else null. */
export function storedUri(row: TracklistRow): string | null {
  return typeof row.spotify === 'object'
    ? `${TRACK_PREFIX}${row.spotify.id}`
    : null;
}

/**
 * One answer of a check, keyed by where its row stood and what it read
 * when the check started, never by object identity: a row edited,
 * reloaded or reopened during the run is a new object but the same track.
 */
export interface CheckAnswer {
  index: number;
  artist: string;
  title: string;
  spotify: SpotifyCheck;
  checkedAt: number;
  /** Round 005 (S13b I1): the found track's album year, from the same
   *  search answer; absent when not found or undated. */
  year?: number;
}

/** The answer for the row at `index`, from Search's URI (or null) and the
 *  matched album's year (kept only with a found track). */
export function answerFor(
  index: number,
  row: TracklistRow,
  uri: string | null,
  now: number,
  year: number | null = null
): CheckAnswer {
  const checked = checkedRow(row, uri, now);
  const spotify = checked.spotify as SpotifyCheck;
  return {
    index,
    artist: row.artist,
    title: row.title,
    spotify,
    checkedAt: now,
    ...(spotify !== 'not-found' && year !== null ? { year } : {}),
  };
}

function reads(row: TracklistRow | undefined, a: CheckAnswer): boolean {
  return (
    row !== undefined &&
    !row.gap &&
    row.artist === a.artist &&
    row.title === a.title
  );
}

/**
 * Each answer put on its row: the row at the same place when it still
 * reads the same artist and title; else the one unchecked row in the list
 * that reads them (a row above was deleted); else the answer is dropped
 * (the row was edited or deleted: its new text was never checked). A row
 * takes one answer at most. Everything else on the row (a new label) is
 * kept.
 */
export function applyAnswers(
  rows: readonly TracklistRow[],
  answers: readonly CheckAnswer[]
): TracklistRow[] {
  const out = rows.slice();
  const taken = new Set<number>();
  for (const a of answers) {
    let at = !taken.has(a.index) && reads(out[a.index], a) ? a.index : -1;
    if (at < 0) {
      const same = out
        .map((_, i) => i)
        .filter(
          (i) =>
            !taken.has(i) && reads(out[i], a) && out[i].spotify === undefined
        );
      if (same.length === 1) at = same[0];
    }
    if (at < 0) continue;
    taken.add(at);
    out[at] = {
      ...out[at],
      spotify: a.spotify,
      checkedAt: a.checkedAt,
      // Round 005: a dated row keeps its year (Shazam's or a catalogue's).
      ...(a.year !== undefined && typeof out[at].year !== 'number'
        ? { year: a.year, yearFrom: 'spotify' as const }
        : {}),
    };
  }
  return out;
}

/**
 * The answers a stored copy of the mix already holds, put on the rows that
 * have none (by place and text, as `applyAnswers`), so a save from rows
 * captured earlier (Create playlist's) never erases a check's answers.
 */
export function keepStoredAnswers(
  rows: readonly TracklistRow[],
  stored: readonly TracklistRow[]
): TracklistRow[] {
  const answers: CheckAnswer[] = [];
  stored.forEach((r, index) => {
    if (r.gap || r.spotify === undefined) return;
    if (rows[index]?.spotify !== undefined) return;
    answers.push({
      index,
      artist: r.artist,
      title: r.title,
      spotify: r.spotify,
      checkedAt: r.checkedAt ?? 0,
      ...(r.yearFrom === 'spotify' && typeof r.year === 'number'
        ? { year: r.year }
        : {}),
    });
  });
  return answers.length === 0 ? rows.slice() : applyAnswers(rows, answers);
}

/** "Checked 12 of 40". */
export function checkLine(done: number, total: number): string {
  return `Checked ${done} of ${total}`;
}

export interface SpotifyCheckDeps {
  client: Pick<SpotifyClient, 'get'>;
  now: () => number;
  /** Asked before each row: Stop, or the mix closed. */
  shouldStop: () => boolean;
  /** One row answered, with the count so far. */
  onChecked: (answer: CheckAnswer, done: number, total: number) => void;
}

export type SpotifyCheckOutcome =
  | { status: 'done' | 'stopped'; done: number; total: number }
  | { status: 'error'; error: unknown; done: number; total: number };

/**
 * Checks the `rowsToCheck` of `rows` (the list as it stands at the tap),
 * one at a time. Never throws: a failure ends the run.
 */
export async function runSpotifyCheck(
  deps: SpotifyCheckDeps,
  rows: readonly TracklistRow[]
): Promise<SpotifyCheckOutcome> {
  const targets = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => isIdentified(row) && row.spotify === undefined);
  const total = targets.length;
  let done = 0;
  for (const { row, index } of targets) {
    if (deps.shouldStop()) return { status: 'stopped', done, total };
    let match: { uri: string | null; year: number | null };
    try {
      match = await searchTrack(deps.client, row);
    } catch (error) {
      return { status: 'error', error, done, total };
    }
    done += 1;
    deps.onChecked(
      answerFor(index, row, match.uri, deps.now(), match.year),
      done,
      total
    );
  }
  return { status: 'done', done, total };
}
