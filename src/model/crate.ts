import type { PlayRow } from '../db/schema';

export const ROTATION_WINDOWS = [1, 3, 6] as const; // months
export const GEM_WINDOWS = [6, 12, 24] as const; // months
export const MIN_GEM_PLAYS = 10;
export const MIN_ROTATION_PLAYS = 3;
export const CLASSIC_MIN_PLAYS_PER_YEAR = 3;
export const CLASSIC_MIN_YEARS = 3;
export const FINISH_MIN_OUTCOMES = 10;
export const PAGE_SIZE = 100;

const RATE_HIGH = 0.65;
const RATE_LOW = 0.35;

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';
export type YearPeriod = 'all' | Season | number; // 1..12

const SEASON_MONTHS: Record<Season, number[]> = {
  winter: [12, 1, 2],
  spring: [3, 4, 5],
  summer: [6, 7, 8],
  autumn: [9, 10, 11],
};

const MONTHS_OF_YEAR = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function yearMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Local zone, the same rule the importer used to write the month keys. */
export function monthKey(d: Date): string {
  return yearMonth(d.getFullYear(), d.getMonth() + 1);
}

/** Oldest first, ending with the month `now` falls in. */
export function lastMonths(now: Date, count: number): string[] {
  const keys: string[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    keys.push(monthKey(new Date(now.getFullYear(), now.getMonth() - back, 1)));
  }
  return keys;
}

export function periodMonths(year: number, period: YearPeriod): string[] {
  if (period === 'all') return MONTHS_OF_YEAR.map((m) => yearMonth(year, m));
  if (typeof period === 'number') return [yearMonth(year, period)];
  // Winter opens in December of the previous year.
  return SEASON_MONTHS[period].map((m) =>
    yearMonth(period === 'winter' && m === 12 ? year - 1 : year, m)
  );
}

/** Rows from an import before month buckets are ignored by every view. */
export function hasMonthData(
  row: PlayRow
): row is PlayRow & { months: Record<string, number> } {
  return row.months !== undefined;
}

export function yearsWithPlays(rows: PlayRow[]): number[] {
  const years = new Set<number>();
  for (const row of rows) {
    if (!hasMonthData(row)) continue;
    for (const [key, plays] of Object.entries(row.months)) {
      if (plays > 0) years.add(Number(key.slice(0, 4)));
    }
  }
  return [...years].sort((a, b) => a - b);
}

function sumMonths(months: Record<string, number>, keys: string[]): number {
  let total = 0;
  for (const key of keys) total += months[key] ?? 0;
  return total;
}

/** Last resort so rows that tie on every number keep a stable order. */
function compareNames(a: PlayRow, b: PlayRow): number {
  return (
    (a.trackName ?? '').localeCompare(b.trackName ?? '') ||
    a.trackId.localeCompare(b.trackId)
  );
}

export interface RotationItem {
  row: PlayRow;
  windowPlays: number;
  isNew: boolean;
}

export function heavyRotation(
  rows: PlayRow[],
  now: Date,
  months: number
): RotationItem[] {
  const keys = lastMonths(now, months);
  const items: RotationItem[] = [];
  for (const row of rows) {
    if (!hasMonthData(row)) continue;
    const windowPlays = sumMonths(row.months, keys);
    if (windowPlays < MIN_ROTATION_PLAYS) continue;
    items.push({ row, windowPlays, isNew: windowPlays === row.plays });
  }
  return items.sort(
    (a, b) =>
      b.windowPlays - a.windowPlays ||
      b.row.plays - a.row.plays ||
      compareNames(a.row, b.row)
  );
}

export interface GemItem {
  row: PlayRow;
  lastPlayed: Date;
}

/**
 * `now` minus `months` calendar months, keeping the time of day and clamping
 * to the end of a shorter month: 31 August minus 6 months is 28 February.
 */
export function gemCutoff(now: Date, months: number): Date {
  const day = now.getDate();
  const cutoff = new Date(now);
  cutoff.setDate(1);
  cutoff.setMonth(cutoff.getMonth() - months);
  const lastDay = new Date(
    cutoff.getFullYear(),
    cutoff.getMonth() + 1,
    0
  ).getDate();
  cutoff.setDate(Math.min(day, lastDay));
  return cutoff;
}

export function forgottenGems(
  rows: PlayRow[],
  now: Date,
  months: number
): GemItem[] {
  const cutoff = gemCutoff(now, months).getTime();
  const items: GemItem[] = [];
  for (const row of rows) {
    if (!hasMonthData(row)) continue;
    if (row.plays < MIN_GEM_PLAYS) continue;
    const lastPlayed = new Date(row.lastTs);
    // An unparseable timestamp gives NaN, which fails this test and is dropped.
    if (!(lastPlayed.getTime() < cutoff)) continue;
    items.push({ row, lastPlayed });
  }
  return items.sort(
    (a, b) => b.row.plays - a.row.plays || compareNames(a.row, b.row)
  );
}

export interface ClassicItem {
  row: PlayRow;
  yearsActive: number;
  perYear: Map<number, number>;
}

export function classics(
  rows: PlayRow[],
  sortBy: 'years' | 'plays'
): ClassicItem[] {
  const items: ClassicItem[] = [];
  for (const row of rows) {
    if (!hasMonthData(row)) continue;
    const totals = new Map<number, number>();
    for (const [key, plays] of Object.entries(row.months)) {
      if (plays <= 0) continue;
      const year = Number(key.slice(0, 4));
      totals.set(year, (totals.get(year) ?? 0) + plays);
    }
    let yearsActive = 0;
    for (const plays of totals.values()) {
      if (plays >= CLASSIC_MIN_PLAYS_PER_YEAR) yearsActive += 1;
    }
    if (yearsActive < CLASSIC_MIN_YEARS) continue;
    // Ascending, so the expansion strip can walk the years as they come.
    const perYear = new Map([...totals.entries()].sort((a, b) => a[0] - b[0]));
    items.push({ row, yearsActive, perYear });
  }
  return items.sort((a, b) =>
    sortBy === 'years'
      ? b.yearsActive - a.yearsActive ||
        b.row.plays - a.row.plays ||
        compareNames(a.row, b.row)
      : b.row.plays - a.row.plays ||
        b.yearsActive - a.yearsActive ||
        compareNames(a.row, b.row)
  );
}

export interface YearItem {
  row: PlayRow;
  selectionPlays: number;
  yearPlays: number;
}

export interface YearResult {
  items: YearItem[];
  plays: number;
  tracks: number;
}

export function byYear(
  rows: PlayRow[],
  year: number,
  period: YearPeriod
): YearResult {
  const selectionKeys = periodMonths(year, period);
  const yearKeys = periodMonths(year, 'all');
  const items: YearItem[] = [];
  let plays = 0;
  for (const row of rows) {
    if (!hasMonthData(row)) continue;
    const selectionPlays = sumMonths(row.months, selectionKeys);
    if (selectionPlays <= 0) continue;
    const yearPlays = sumMonths(row.months, yearKeys);
    items.push({ row, selectionPlays, yearPlays });
    plays += selectionPlays;
  }
  items.sort(
    (a, b) =>
      b.selectionPlays - a.selectionPlays ||
      b.row.plays - a.row.plays ||
      compareNames(a.row, b.row)
  );
  return { items, plays, tracks: items.length };
}

export interface FinishItem {
  row: PlayRow;
  rate: number;
  outcomes: number;
  unclear: number;
}

export function finishRate(
  rows: PlayRow[],
  tab: 'finished' | 'skipped'
): FinishItem[] {
  const items: FinishItem[] = [];
  for (const row of rows) {
    if (!hasMonthData(row)) continue;
    const finished = row.finished ?? 0;
    const outcomes = finished + (row.skipped ?? 0);
    if (outcomes < FINISH_MIN_OUTCOMES) continue;
    items.push({
      row,
      rate: finished / outcomes,
      outcomes,
      // Version 2 rows always have attempts >= outcomes; the clamp only keeps
      // a stale row from rendering a negative count.
      unclear: Math.max(0, (row.attempts ?? 0) - outcomes),
    });
  }
  return items.sort((a, b) =>
    tab === 'finished'
      ? b.rate - a.rate ||
        b.row.plays - a.row.plays ||
        compareNames(a.row, b.row)
      : a.rate - b.rate || b.outcomes - a.outcomes || compareNames(a.row, b.row)
  );
}

export type RateBand = 'high' | 'mid' | 'low';

/** 65% or more reads green, under 35% red, the rest grey. */
export function rateBand(rate: number): RateBand {
  if (rate >= RATE_HIGH) return 'high';
  if (rate < RATE_LOW) return 'low';
  return 'mid';
}
