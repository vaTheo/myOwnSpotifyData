import type { HistoryRange } from '../../history/importer';
import { monthKey } from '../../model/crate';

/**
 * Spec §3: an export whose last play is older than this reads as stale. The
 * hub's provenance line and Heavy rotation's empty state both need it.
 */
export const STALE_MS = 35 * 24 * 60 * 60 * 1000;

/**
 * The month the export's last play falls in, read in the device zone, or null
 * while the export is still fresh. The importer bucketed its month keys
 * locally, so slicing the `Z`-suffixed string here would let the line name a
 * different month from the data it describes.
 */
export function staleMonthKey(
  range: HistoryRange | null | undefined,
  now: Date
): string | null {
  if (!range) return null;
  const last = Date.parse(range.last);
  if (Number.isNaN(last) || now.getTime() - last <= STALE_MS) return null;
  return monthKey(new Date(last));
}

/**
 * `2019 – 2026`, both years read in the device zone, or null when the export
 * has no range. Equal years still print twice: the line's shape is the span.
 */
export function yearSpanLabel(
  range: HistoryRange | null | undefined
): string | null {
  if (!range) return null;
  const first = new Date(range.first).getFullYear();
  const last = new Date(range.last).getFullYear();
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
  return `${first} – ${last}`;
}

/** `month`, `3 months`: the phrase after "the last" and "in the last". */
export function windowLabel(months: number): string {
  return months === 1 ? 'month' : `${months} months`;
}
