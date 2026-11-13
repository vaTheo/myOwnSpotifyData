import type { TracklistRow } from '../../db/schema';
import { evidenceLevel, isFlagged } from './evidence';

/**
 * The per-track review of the open mix (spec 003 §12, T118, T127): the
 * filter chips, their counts and the header line. Pure. A filter hides
 * rows, never deletes them; gap rows show under All only and never count.
 * Round 010: every track is kept, so `validated` is never read here.
 */

export type ReviewFilter =
  | 'all'
  | 'notOnSpotify'
  | 'heardOnce'
  | 'solid'
  | 'flagged';

export type SpotifyStatus = 'unchecked' | 'found' | 'notFound';

/** The caption under any chip but All (ruling D2). */
export const FILTER_CAPTION =
  'Hidden, not deleted. Create playlist adds every identified track, not this filter.';

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

const LABELS: Record<ReviewFilter, string> = {
  all: 'All',
  notOnSpotify: 'Not on Spotify',
  heardOnce: 'Heard once',
  solid: 'Solid',
  flagged: 'Flagged',
};

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
    return { filter, label: `${LABELS[filter]} (${count})`, count };
  });
}

/** "N tracks · M on Spotify · L not found"; gaps never count. */
export function reviewLine(rows: readonly TracklistRow[]): string {
  const tracks = rows.filter((r) => !r.gap);
  const n = tracks.length;
  const found = tracks.filter((r) => spotifyStatus(r) === 'found').length;
  const notFound = tracks.filter((r) => spotifyStatus(r) === 'notFound').length;
  return `${n} ${n === 1 ? 'track' : 'tracks'} · ${found} on Spotify · ${notFound} not found`;
}
