import type { TracklistRow } from '../../db/schema';
import { inFilter, type ReviewFilter } from '../../features/mix/review';
import { rowYear, viewRows } from '../../features/mix/worker';
import { decadesPresent } from '../../model/yearView';

/** What the open mix's tracklist shows, and the controls it offers. */
export interface TracklistView {
  /** A row has clip counts: Clips heard and Best score are offered. */
  counted: boolean;
  /** The decades of the dated rows, oldest first; none hides the year controls. */
  decades: number[];
  /** The decade in force: one the rows no longer hold is none. */
  decade: number | null;
  /** Indexes into `rows`, in the order shown. */
  order: number[];
}

/**
 * The tracklist's view (spec 003 §12, round 004, round 005): the decade and
 * the review chip, as indexes into `rows` in set order so Edit and Delete act
 * on the real row. The order is the table's own sort (spec 008, see
 * `tracklistSort`). A choice the current rows no longer allow falls back and
 * never empties the list. The row being edited stays visible whatever the
 * view (main's rule: Add track's new row is undated and never heard).
 */
export function tracklistView(
  rows: readonly TracklistRow[],
  chosen: { decade: number | null; filter: ReviewFilter },
  editing: number | null
): TracklistView {
  const counted = rows.some((r) => r.hits !== undefined);
  const decades = decadesPresent(rows, rowYear);
  const decade =
    chosen.decade !== null && decades.includes(chosen.decade)
      ? chosen.decade
      : null;
  const viewed = viewRows(rows, false, decade);
  const kept =
    editing !== null && editing < rows.length && !viewed.includes(editing)
      ? [...viewed, editing]
      : viewed;
  const order = kept.filter(
    (i) => i === editing || inFilter(rows[i], chosen.filter)
  );
  return { counted, decades, decade, order };
}
