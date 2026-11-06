import type { Model } from './aggregate';

/** Lowest year accepted from any source (catalogues hold "0000" and typos). */
export const MIN_YEAR = 1900;

/**
 * The whole year at the start of a date ("1993", "1993-05", "1993-05-17") or
 * a number, when it lies in 1900..current year + 1; otherwise null. Every
 * source goes through this, so a bad value is dropped, never shown as 0.
 */
export function parseYear(value: unknown, now: number = Date.now()): number | null {
  let year: number | null = null;
  if (typeof value === 'number' && Number.isInteger(value)) year = value;
  else if (typeof value === 'string') {
    const m = /^\s*(\d{4})(?:$|[-/\s])/.exec(value);
    if (m) year = Number(m[1]);
  }
  if (year === null) return null;
  const max = new Date(now).getUTCFullYear() + 1;
  return year >= MIN_YEAR && year <= max ? year : null;
}

/**
 * The year shown for a library track (spec 005 FR-011/FR-012): ReccoBeats'
 * earliest release first, then the album year a playlist sync stored, then
 * a Top list's. Null when no source dates it.
 */
export function yearOf(model: Model, trackId: string): number | null {
  const recco = model.features.get(trackId)?.releaseYear?.year;
  if (typeof recco === 'number') return recco;
  const album = model.tracksByKey.get(trackId)?.albumYear;
  if (typeof album === 'number') return album;
  for (const row of model.topItems.values()) {
    if (row.type !== 'tracks') continue;
    const hit = row.items.find((item) => item.id === trackId);
    if (hit && typeof hit.albumYear === 'number') return hit.albumYear;
  }
  return null;
}

/** "90s", "2000s", "2010s": the label of the decade holding `year`. */
export function decadeLabel(decade: number): string {
  return decade < 2000 ? `${String(decade).slice(2)}s` : `${decade}s`;
}

export function decadeOf(year: number): number {
  return Math.floor(year / 10) * 10;
}
