/**
 * The charts' pure helpers (spec 003, data-model §6, research D10). They only
 * reshape the month buckets the import wrote (`PlayRow.months`); no play is
 * counted here that the model does not already count (FR-049).
 */
import type { PlayRow } from '../../db/schema';
import {
  MONTH_NAMES,
  monthKey,
  periodMonths,
  rateBand,
  yearsWithPlays,
  yearMonth,
  type RateBand,
  type YearPeriod,
} from '../../model/crate';

/** The imported history's span: ISO instants, or `YYYY-MM` month keys. */
export interface MonthRange {
  first: string;
  last: string;
}

/**
 * One bar of a chart: a month (`YYYY-MM`) or a year (`YYYY`); `value` null
 * is a period outside the history.
 */
export interface MonthPoint {
  key: string;
  value: number | null;
}

/** Per year: twelve months (January first, null outside the history). */
export interface YearTotals {
  year: number;
  months: (number | null)[];
  total: number;
  /** The year's busiest month, 0 without plays. */
  max: number;
}

/** A `YYYY-MM` key as is; an instant read in the local zone, as the importer did. */
function toMonthKey(value: string): string | null {
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? monthKey(d) : null;
}

/** Every month from `first` to `last`, both `YYYY-MM`, oldest first. */
export function monthKeys(first: string, last: string): string[] {
  const keys: string[] = [];
  let year = Number(first.slice(0, 4));
  let month = Number(first.slice(5, 7));
  for (
    let key = yearMonth(year, month);
    key <= last;
    key = yearMonth(year, month)
  ) {
    keys.push(key);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return keys;
}

/** The range as month keys; null (every month inside) when unknown. */
function monthBounds(
  range: MonthRange | null
): { first: string; last: string } | null {
  if (!range) return null;
  const first = toMonthKey(range.first);
  const last = toMonthKey(range.last);
  return first && last ? { first, last } : null;
}

/**
 * The plays of `keys`, in that order: 0 for a month inside the imported
 * history without plays, null for a month outside it (a gap, not a zero).
 */
export function monthSeries(
  months: Record<string, number> | undefined,
  keys: string[],
  range: MonthRange | null
): MonthPoint[] {
  const bounds = monthBounds(range);
  return keys.map((key) => {
    const inside = !bounds || (key >= bounds.first && key <= bounds.last);
    return { key, value: inside ? (months?.[key] ?? 0) : null };
  });
}

/**
 * Bar heights scaled to the series' own peak: at least 1 px for any play,
 * 0 for none (the baseline tick), null for a gap.
 */
export function barHeights(
  series: MonthPoint[],
  maxHeight: number
): (number | null)[] {
  const peak = Math.max(0, ...series.map((p) => p.value ?? 0));
  return series.map((p) => {
    if (p.value === null) return null;
    if (p.value <= 0 || peak === 0) return 0;
    return Math.max(1, Math.round((p.value / peak) * maxHeight));
  });
}

/** 0 for no plays, else 1–4 for the quartile of `max` (the busiest month). */
export function heatLevel(value: number | null, max: number): number {
  if (value === null || value <= 0 || max <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((value / max) * 4)));
}

/** The Meter's colour, by the same thresholds as the Finish rate rows. */
export function meterBand(pct: number): RateBand {
  return rateBand(pct / 100);
}

/**
 * Every year the export covers, gaps included, from the import range, then
 * the years played, then `fallbackYear`: the span `spanYears` gives the
 * Crate, so the grid and the Classics columns never disagree.
 */
export function yearSpan(
  rows: PlayRow[],
  range: MonthRange | null,
  fallbackYear: number
): number[] {
  const played = yearsWithPlays(rows);
  const yearOf = (value: string | undefined) => {
    const key = value === undefined ? null : toMonthKey(value);
    return key === null ? null : Number(key.slice(0, 4));
  };
  const first = yearOf(range?.first) ?? played[0] ?? fallbackYear;
  const last = yearOf(range?.last) ?? played[played.length - 1] ?? first;
  const years: number[] = [];
  for (let y = first; y <= last; y += 1) years.push(y);
  return years.length > 0 ? years : [first];
}

/** Per year of `yearSpan`, the plays of each month and of the year. */
export function yearMonthTotals(
  rows: PlayRow[],
  range: MonthRange | null,
  fallbackYear: number
): YearTotals[] {
  const sums = new Map<string, number>();
  for (const row of rows) {
    if (!row.months) continue;
    for (const [key, plays] of Object.entries(row.months)) {
      sums.set(key, (sums.get(key) ?? 0) + plays);
    }
  }
  const all = Object.fromEntries(sums);
  return yearSpan(rows, range, fallbackYear).map((year) => {
    const keys = MONTH_NAMES.map((_, i) => yearMonth(year, i + 1));
    const months = monthSeries(all, keys, range).map((p) => p.value);
    const values = months.map((v) => v ?? 0);
    return {
      year,
      months,
      total: values.reduce((a, b) => a + b, 0),
      max: Math.max(0, ...values),
    };
  });
}

/** The plays of a By year selection, by its rules (Winter opens in December). */
export function periodTotal(
  totals: YearTotals[],
  year: number,
  period: YearPeriod
): number {
  let total = 0;
  for (const key of periodMonths(year, period)) {
    const row = totals.find((t) => t.year === Number(key.slice(0, 4)));
    total += row?.months[Number(key.slice(5, 7)) - 1] ?? 0;
  }
  return total;
}

/** Plays per year of `years` (the span), as year points for the same bars. */
export function yearPoints(
  months: Record<string, number> | undefined,
  years: number[]
): MonthPoint[] {
  const sums = new Map<string, number>();
  for (const [key, plays] of Object.entries(months ?? {})) {
    const year = key.slice(0, 4);
    sums.set(year, (sums.get(year) ?? 0) + plays);
  }
  return years.map((y) => ({
    key: String(y),
    value: sums.get(String(y)) ?? 0,
  }));
}

/**
 * `Jun 2026`, or `Jun` when every month of the chart is in one year; a year
 * key is its year.
 */
export function pointLabel(key: string, withYear: boolean): string {
  if (key.length === 4) return key;
  const name = MONTH_NAMES[Number(key.slice(5, 7)) - 1] ?? key;
  return withYear ? `${name} ${key.slice(0, 4)}` : name;
}

/** True when the chart's points span more than one year. */
export function crossesYears(series: MonthPoint[]): boolean {
  return new Set(series.map((p) => p.key.slice(0, 4))).size > 1;
}

/** One month's value as the label and the tooltip read it. */
export function pointValue(value: number | null): string {
  return value === null ? 'not in the history' : value.toLocaleString();
}

/** The text alternative: `Plays per month: Jun 4, Jul 0, …`. */
export function seriesLabel(title: string, series: MonthPoint[]): string {
  const withYear = crossesYears(series);
  const parts = series.map(
    (p) => `${pointLabel(p.key, withYear)} ${pointValue(p.value)}`
  );
  return `${title}: ${parts.join(', ')}`;
}
