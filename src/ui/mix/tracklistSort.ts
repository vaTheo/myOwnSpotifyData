import type { TracklistRow } from '../../db/schema';
import { spotifyStatus } from '../../features/mix/review';
import { rowYear } from '../../features/mix/worker';
import type { SortDirection, SortState, SortValue } from '../table/sort';

/**
 * What each Mix tracklist column sorts by (spec 009). Pure, so every rule is
 * pinned by a test. `null` is a missing value: the table puts it last in both
 * directions and nothing prints it as zero. Ties keep the set's order.
 */

export type SortId =
  'time' | 'artist' | 'title' | 'label' | 'confidence' | 'released' | 'spotify';

/** The part of a table line the sort reads. */
export interface SortLine {
  row: TracklistRow;
}

/** The first click: best first for the counts, problems first for the status. */
export const SORT_FIRST: Record<SortId, SortDirection> = {
  time: 'asc',
  artist: 'asc',
  title: 'asc',
  label: 'asc',
  confidence: 'desc',
  released: 'asc',
  spotify: 'asc',
};

const SPOTIFY_ORDER = { notFound: 0, unchecked: 1, found: 2 } as const;

export function sortValue(id: SortId, l: SortLine): SortValue {
  const { row } = l;
  switch (id) {
    case 'time':
      return row.startSec;
    case 'label':
      return row.label ? row.label : null;
    case 'confidence':
      // Only a row still reading as the scan heard it has a score. The merged
      // Confidence column (round 010, Clips folded in) sorts by
      // how many clips found it, then by the best percentage: a percentage
      // never reaches 1000, so the count always decides first.
      return !row.gap && row.source === 'tracklistify' && row.confidence != null
        ? (row.hits ?? 0) * 1000 + row.confidence
        : null;
  }
  if (row.gap) return null;
  switch (id) {
    // Spec 020: two columns, each on its own text; an empty one is missing.
    case 'artist':
      return row.artist.trim() !== '' ? row.artist : null;
    case 'title':
      return row.title.trim() !== '' ? row.title : null;
    case 'released':
      return rowYear(row);
    case 'spotify':
      return SPOTIFY_ORDER[spotifyStatus(row)];
  }
}

const CHOICES: { id: SortId; label: string }[] = [
  { id: 'time', label: 'Time' },
  { id: 'artist', label: 'Artist' },
  { id: 'title', label: 'Title' },
  { id: 'label', label: 'Label' },
  { id: 'confidence', label: 'Confidence' },
  { id: 'released', label: 'Released' },
  { id: 'spotify', label: 'Spotify' },
];

/** Whether the open rows hold the values a column sorts by. */
function applies(id: SortId, rows: readonly TracklistRow[]): boolean {
  const some = (value: (r: TracklistRow) => unknown): boolean =>
    rows.some((r) => value(r) !== null && value(r) !== undefined);
  if (id === 'confidence') {
    return some((r) => sortValue('confidence', { row: r }));
  }
  if (id === 'released') return some(rowYear);
  return true;
}

/** The columns the Sort select offers for these rows, in column order. */
export function sortChoices(
  rows: readonly TracklistRow[]
): { id: SortId; label: string }[] {
  return CHOICES.filter((c) => applies(c.id, rows));
}

/**
 * The sort in force: a choice the rows no longer allow (the last scored row
 * deleted) is the set's own order, never an empty list.
 */
export function effectiveSort(
  chosen: SortState,
  rows: readonly TracklistRow[]
): SortState {
  if (
    chosen.columnId !== null &&
    sortChoices(rows).some((c) => c.id === chosen.columnId)
  ) {
    return chosen;
  }
  return { columnId: null, direction: 'asc' };
}
