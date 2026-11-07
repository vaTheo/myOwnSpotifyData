import type { TracklistRow } from '../../db/schema';
import type { SpotifyClient } from '../../spotify/client';
import { isIdentified, searchTrack } from './spotifySearch';

/**
 * Check on Spotify (spec 003 §12, T117): on a tap only, never on load or
 * open (ADR-02), each named track not checked yet goes through the same
 * `searchTrack`/`pickMatch` as Create playlist, one at a time. A read, no
 * write. The answer is kept on the row (`spotify`, `checkedAt`), so Create
 * playlist reuses a found track instead of searching again.
 */

const TRACK_PREFIX = 'spotify:track:';

/** The rows a check asks about: named tracks never checked; no gap, no ID. */
export function rowsToCheck(rows: readonly TracklistRow[]): TracklistRow[] {
  return rows.filter((r) => isIdentified(r) && r.spotify === undefined);
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
 * Each answer put back where its row still stands, by identity: a row
 * edited or deleted during the check keeps its new state.
 */
export function applyChecks(
  rows: readonly TracklistRow[],
  checked: ReadonlyMap<TracklistRow, TracklistRow>
): TracklistRow[] {
  return rows.map((r) => checked.get(r) ?? r);
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
  /** One row answered: the row as it was, as it is now, the count so far. */
  onChecked: (
    before: TracklistRow,
    after: TracklistRow,
    done: number,
    total: number
  ) => void;
}

export type SpotifyCheckOutcome =
  | { status: 'done' | 'stopped'; done: number; total: number }
  | { status: 'error'; error: unknown; done: number; total: number };

/** Checks `rows` one at a time. Never throws: a failure ends the run. */
export async function runSpotifyCheck(
  deps: SpotifyCheckDeps,
  rows: readonly TracklistRow[]
): Promise<SpotifyCheckOutcome> {
  const total = rows.length;
  let done = 0;
  for (const row of rows) {
    if (deps.shouldStop()) return { status: 'stopped', done, total };
    let uri: string | null;
    try {
      uri = (await searchTrack(deps.client, row)).uri;
    } catch (error) {
      return { status: 'error', error, done, total };
    }
    done += 1;
    deps.onChecked(row, checkedRow(row, uri, deps.now()), done, total);
  }
  return { status: 'done', done, total };
}
