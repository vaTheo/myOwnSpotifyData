import { camelotNumber } from '../../model/keys';

/**
 * The sort value of a key column (spec 003, screens.md §4): Camelot order,
 * 1A, 1B, 2A, 2B … 12B, whatever notation is shown. Null when the key or the
 * mode is unknown, so the row goes last.
 */
export function keySortValue(
  key: number | null,
  major: boolean | null
): number | null {
  if (key === null || major === null) return null;
  return camelotNumber(key, major) * 2 + (major ? 1 : 0);
}

/** `3:35`, or `1:02:05` past an hour. */
export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
