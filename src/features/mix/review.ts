import type { TracklistRow } from '../../db/schema';
import { msg } from '../../i18n';
import { evidenceLevel, isFlagged } from './evidence';

/**
 * The per-track review of the open mix (spec 003 §12, T118, T127): the
 * filter chips, their counts and the header line. Pure. A filter hides
 * rows, never deletes them; gap rows show under All only and never count.
 * Round 010: every track is kept, so `validated` is never read here.
 */

export type ReviewFilter =
  'all' | 'notOnSpotify' | 'heardOnce' | 'solid' | 'flagged';

export type SpotifyStatus = 'unchecked' | 'found' | 'notFound';

/** What Check on Spotify said about the row (T117). */
export function spotifyStatus(row: TracklistRow): SpotifyStatus {
  if (row.spotify === undefined) return 'unchecked';
  return row.spotify === 'not-found' ? 'notFound' : 'found';
}

/** Whether the row shows under the chip. */
export function inFilter(row: TracklistRow, filter: ReviewFilter): boolean {
  if (filter === 'all') return true;
  if (row.gap) return false;
  switch (filter) {
    case 'notOnSpotify':
      return spotifyStatus(row) === 'notFound';
    case 'heardOnce':
      return row.hits === 1;
    // Spec 029: the evidence level; Flagged is out of step or many candidates.
    case 'solid':
      return evidenceLevel(row) === 'solid';
    case 'flagged':
      return isFlagged(row);
  }
}

export interface ReviewChip {
  filter: ReviewFilter;
  label: string;
  count: number;
}

/**
 * The chips with their counts: All, Not on Spotify,
 * Heard once only when a row has clip counts (round 004), then Solid and
 * Flagged only when a row has a known evidence level (spec 029).
 */
export function reviewChips(rows: readonly TracklistRow[]): ReviewChip[] {
  const tracks = rows.filter((r) => !r.gap);
  const filters: ReviewFilter[] = ['all', 'notOnSpotify'];
  if (rows.some((r) => r.hits !== undefined)) filters.push('heardOnce');
  if (rows.some((r) => evidenceLevel(r) !== null)) {
    filters.push('solid', 'flagged');
  }
  return filters.map((filter) => {
    const count = tracks.filter((r) => inFilter(r, filter)).length;
    const m = msg().mix.review;
    return { filter, label: m.chip(m.chips[filter], count), count };
  });
}

/** "N tracks · M on Spotify · L not found"; gaps never count. */
export function reviewLine(rows: readonly TracklistRow[]): string {
  const tracks = rows.filter((r) => !r.gap);
  const n = tracks.length;
  const found = tracks.filter((r) => spotifyStatus(r) === 'found').length;
  const notFound = tracks.filter((r) => spotifyStatus(r) === 'notFound').length;
  return msg().mix.review.line(n, found, notFound);
}
