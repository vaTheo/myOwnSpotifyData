export interface CompareSpot {
  col: number;
  index: number;
}

/**
 * The comparison's one tab stop (roving tabindex): the remembered item,
 * clamped to what exists. When the remembered column is empty, the first
 * column with items takes it, so the comparison never loses its tab stop.
 * Null only when every column is empty.
 */
export function tabStop(
  active: CompareSpot,
  lengths: number[]
): CompareSpot | null {
  if (lengths.length === 0) return null;
  let col = Math.min(Math.max(active.col, 0), lengths.length - 1);
  if (lengths[col] === 0) {
    col = lengths.findIndex((n) => n > 0);
    if (col < 0) return null;
    return { col, index: 0 };
  }
  return { col, index: Math.min(Math.max(active.index, 0), lengths[col] - 1) };
}
