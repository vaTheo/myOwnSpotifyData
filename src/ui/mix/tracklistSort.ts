import type { TracklistRow } from '../../db/schema';
import { spotifyStatus } from '../../features/mix/review';
import { rowYear } from '../../features/mix/worker';
import { sourceLabel } from './rowText';
import type { SortDirection, SortState, SortValue } from '../table/sort';

/**
 * What each Mix tracklist column sorts by (spec 008). Pure, so every rule is
 * pinned by a test. `null` is a missing value: the table puts it last in both
 * directions and nothing prints it as zero. Ties keep the set's order.
 */

export type SortId =
  | 'time'
  | 'title'
  | 'label'
  | 'source'
  | 'confidence'
  | 'clips'
  | 'library'
  | 'released'
  | 'spotify'
  | 'review';

/** The part of a table line the sort reads. */
export interface SortLine {
  row: TracklistRow;
  /** The library match, or null; only its presence counts. */
  match: unknown;
}

/** The first click: best first for the counts, problems first for the status. */
export const SORT_FIRST: Record<SortId, SortDirection> = {
  time: 'asc',
  title: 'asc',
  label: 'asc',
  source: 'asc',
  confidence: 'desc',
  clips: 'desc',
  library: 'desc',
  released: 'asc',
  spotify: 'asc',
  review: 'asc',
};

const SPOTIFY_ORDER = { notFound: 0, unchecked: 1, found: 2 } as const;

export function sortValue(id: SortId, l: SortLine): SortValue {
  const { row } = l;
  switch (id) {
    case 'time':
      return row.startSec;
    case 'label':
      return row.label ? row.label : null;
    case 'clips':
      return row.hits ?? null;
    case 'confidence':
      // Only a row still reading as the scan heard it has a score.
      return !row.gap && row.source === 'tracklistify'
        ? (row.confidence ?? null)
        : null;
  }
  if (row.gap) return null;
  switch (id) {
    case 'title':
      return `${row.artist} – ${row.title}`;
    case 'source':
      return sourceLabel(row);
    case 'library':
      return l.match ? 1 : 0;
    case 'released':
      return rowYear(row);
    case 'spotify':
      return SPOTIFY_ORDER[spotifyStatus(row)];
    case 'review':
      return row.validated === true ? 1 : 0;
  }
}

const CHOICES: { id: SortId; label: string }[] = [
  { id: 'time', label: 'Time' },
  { id: 'title', label: 'Artist – Title' },
  { id: 'label', label: 'Label' },
  { id: 'source', label: 'Source' },
  { id: 'confidence', label: 'Confidence' },
  { id: 'clips', label: 'Clips heard' },
  { id: 'library', label: 'In your library' },
  { id: 'released', label: 'Released' },
  { id: 'spotify', label: 'Spotify' },
  { id: 'review', label: 'Review' },
];

/** Whether the open rows hold the values a column sorts by. */
function applies(id: SortId, rows: readonly TracklistRow[]): boolean {
  const some = (value: (r: TracklistRow) => unknown): boolean =>
    rows.some((r) => value(r) !== null && value(r) !== undefined);
  if (id === 'confidence') {
    return some((r) => sortValue('confidence', { row: r, match: null }));
  }
  if (id === 'clips') return some((r) => r.hits);
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
