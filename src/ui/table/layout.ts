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
 * "Sort by year" is offered where the Released header cannot sort: two-line
 * items, or a table too narrow for priority 2 (screens.md "From main…" §2).
 * No layout yet offers nothing; the table reports one before it paints.
 */
export function yearSortOffered(layout: TableLayout | null): boolean {
  return layout !== null && (layout.twoLine || layout.widestPriority < 2);
}
