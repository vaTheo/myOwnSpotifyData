/**
 * Moving through table rows with the keyboard (spec 003, FR-043,
 * data-model §3): the arrows by one, PageUp and PageDown by a page, Home and
 * End to the ends, clamped to the rows on screen. Null means "not a moving
 * key", so the caller lets the browser handle it.
 */
export function moveIndex(
  current: number | null,
  key: string,
  count: number,
  page: number
): number | null {
  if (count === 0) return null;
  const last = count - 1;
  const from = current ?? -1;
  let next: number;
  switch (key) {
    case 'ArrowDown':
      next = from + 1;
      break;
    case 'ArrowUp':
      next = current === null ? 0 : from - 1;
      break;
    case 'PageDown':
      next = current === null ? 0 : from + page;
      break;
    case 'PageUp':
      next = current === null ? 0 : from - page;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = last;
      break;
    default:
      return null;
  }
  return Math.min(last, Math.max(0, next));
}
