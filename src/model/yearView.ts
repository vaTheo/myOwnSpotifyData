import { decadeOf } from './year';

/** Round 005 (US5): what the owner chose to see of a list's years. */
export interface YearViewState {
  /** Oldest first, undated last; off keeps the screen's own order. */
  sortByYear: boolean;
  /** The first year of the decade kept (1990 = the 90s), or null for all. */
  decade: number | null;
}

export const NO_YEAR_VIEW: YearViewState = { sortByYear: false, decade: null };

/**
 * The items the year view keeps, in the order it shows them: the decade
 * filter keeps items dated in [decade, decade + 9]; the year sort is stable
 * (ties and undated items keep the input order), undated items last. Never
 * mutates `items`.
 */
export function applyYearView<T>(
  items: readonly T[],
  yearOf: (item: T) => number | null,
  view: YearViewState
): T[] {
  const years = items.map((item) => ({ item, year: yearOf(item) }));
  const kept =
    view.decade === null
      ? years
      : years.filter(
          ({ year }) => year !== null && decadeOf(year) === view.decade
        );
  if (!view.sortByYear) return kept.map(({ item }) => item);
  return kept
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => {
      if (a.year === null && b.year === null) return a.index - b.index;
      if (a.year === null) return 1;
      if (b.year === null) return -1;
      return a.year - b.year || a.index - b.index;
    })
    .map(({ item }) => item);
}

/** The decades at least one item is dated in, oldest first. */
export function decadesPresent<T>(
  items: readonly T[],
  yearOf: (item: T) => number | null
): number[] {
  const set = new Set<number>();
  for (const item of items) {
    const year = yearOf(item);
    if (year !== null) set.add(decadeOf(year));
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * The view as it applies to a list: nothing when no item is dated (the
 * controls are hidden then), and no decade when the chosen one is absent
 * from this list (another playlist, another period), so a filter kept from
 * an earlier screen never empties a list it offers no chip to clear.
 */
export function effectiveYearView(
  view: YearViewState,
  decades: readonly number[]
): YearViewState {
  if (decades.length === 0) return NO_YEAR_VIEW;
  if (view.decade !== null && !decades.includes(view.decade)) {
    return { sortByYear: view.sortByYear, decade: null };
  }
  return view;
}
