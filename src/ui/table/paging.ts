/**
 * The number of rows a paged table shows so the row at `index` is on the
 * page: the current count when it already is, else whole pages more. A
 * negative index (no such row) changes nothing.
 */
export function shownToReveal(
  index: number,
  shown: number,
  pageSize: number
): number {
  if (index < shown) return shown;
  return (Math.floor(index / pageSize) + 1) * pageSize;
}

/** The count after reaching the bottom: one page more, never past the total. */
export function shownAfterScroll(
  shown: number,
  total: number,
  pageSize: number
): number {
  return Math.min(shown + pageSize, Math.max(total, shown));
}
