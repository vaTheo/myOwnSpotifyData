import type { SortState } from './sort';

/** What a table draws at its width: see `DataTable`'s `onLayout`. */
export interface TableLayout {
  twoLine: boolean;
  widestPriority: 1 | 2 | 3 | 4;
}

/**
 * The highest priority the container queries of `styles.css` show at a
 * table width: 1 below 720 px, 2 below 960, 3 below 1120, else 4. Unmeasured
 * (no layout yet) counts as every column.
 */
export function widestPriority(width: number | null): 1 | 2 | 3 | 4 {
  if (width === null) return 4;
  if (width < 720) return 1;
  if (width < 960) return 2;
  if (width < 1120) return 3;
  return 4;
}

/**
 * A table width as one small number: the column-priority level times two,
 * plus one when the table is narrower than `compactBelow`. Equal widths of
 * one level give the same code, so storing it skips re-renders.
 */
export function widthLevel(width: number, compactBelow?: number): number {
  const narrow = compactBelow !== undefined && width < compactBelow;
  return widestPriority(width) * 2 + (narrow ? 1 : 0);
}

/**
 * `widthLevel` read back. Unmeasured: every column, and `narrow` null (the
 * window class decides two-line items then).
 */
export function levelOf(code: number | null): {
  widest: 1 | 2 | 3 | 4;
  narrow: boolean | null;
} {
  if (code === null) return { widest: 4, narrow: null };
  return {
    widest: Math.floor(code / 2) as 1 | 2 | 3 | 4,
    narrow: code % 2 === 1,
  };
}

/** The "Sort by year" switch is on while the table sorts by Released, oldest first. */
export function yearSortOn(sort: SortState): boolean {
  return sort.columnId === 'released' && sort.direction === 'asc';
}

/** The sort the switch sets: Released ascending, or back to the screen's own order. */
export function yearSortFor(on: boolean): SortState {
  return on
    ? { columnId: 'released', direction: 'asc' }
    : { columnId: null, direction: 'asc' };
}

/**
 * "Sort by year" is offered where the Released header cannot sort: two-line
 * items, or a table too narrow for priority 2 (screens.md "From main…" §2).
 * No layout yet offers nothing; the table reports one before it paints.
 */
export function yearSortOffered(layout: TableLayout | null): boolean {
  return layout !== null && (layout.twoLine || layout.widestPriority < 2);
}
