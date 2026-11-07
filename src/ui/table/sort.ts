/**
 * Table sorting (spec 003, FR-016, data-model §3). Pure, so the rules are
 * pinned by tests: stable, missing values last in both directions, text
 * compared without case or accents.
 */
export type SortDirection = 'asc' | 'desc';

/** `columnId: null` is the screen's own ranking. */
export interface SortState {
  columnId: string | null;
  direction: SortDirection;
}

export type SortValue = number | string | null;

const collator = new Intl.Collator(undefined, {
  sensitivity: 'base',
  numeric: true,
});

function compare(a: number | string, b: number | string): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator.compare(String(a), String(b));
}

export function sortRows<Row>(
  rows: readonly Row[],
  value: (row: Row) => SortValue,
  direction: SortDirection
): Row[] {
  const sign = direction === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, v: value(row) }))
    .sort((x, y) => {
      if (x.v === null || y.v === null) {
        if (x.v === y.v) return x.index - y.index;
        return x.v === null ? 1 : -1;
      }
      return sign * compare(x.v, y.v) || x.index - y.index;
    })
    .map((entry) => entry.row);
}

/**
 * A header click: another column sorts in its first direction, the current
 * one flips, and the rank column goes back to the screen's own ranking.
 */
export function nextSort(
  current: SortState,
  columnId: string,
  column: { firstDirection?: SortDirection; rank?: boolean }
): SortState {
  if (column.rank) return { columnId: null, direction: 'asc' };
  if (current.columnId === columnId) {
    return {
      columnId,
      direction: current.direction === 'asc' ? 'desc' : 'asc',
    };
  }
  return { columnId, direction: column.firstDirection ?? 'asc' };
}
