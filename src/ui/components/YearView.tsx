import { signal, type Signal } from '@preact/signals';
import type { Model } from '../../model/aggregate';
import { decadeLabel, yearOf } from '../../model/year';
import {
  applyYearView,
  decadesPresent,
  effectiveYearView,
  NO_YEAR_VIEW,
  type YearViewState,
} from '../../model/yearView';

/**
 * Round 005 (US5): one view per screen, module level like the screens' other
 * controls, so leaving a screen and coming back keeps it and a reload resets
 * it. Never persisted.
 */
const views = new Map<string, Signal<YearViewState>>();

function viewSignal(screen: string): Signal<YearViewState> {
  let view = views.get(screen);
  if (!view) {
    view = signal(NO_YEAR_VIEW);
    views.set(screen, view);
  }
  return view;
}

/**
 * `yearOf` once per track and model: a Crate list asks for thousands of
 * tracks on every render, and `yearOf` may walk the Top lists for each. A
 * new model (any reload) starts a new cache.
 */
const yearCache = new WeakMap<Model, Map<string, number | null>>();

export function trackYear(m: Model, trackId: string): number | null {
  let cache = yearCache.get(m);
  if (!cache) {
    cache = new Map();
    yearCache.set(m, cache);
  }
  let year = cache.get(trackId);
  if (year === undefined) {
    year = yearOf(m, trackId);
    cache.set(trackId, year);
  }
  return year;
}

/**
 * The items `screen`'s year view keeps, in its order, and the decades its
 * controls offer. With the sort off and no decade, the screen's own order.
 */
export function yearViewOf<T>(
  screen: string,
  items: readonly T[],
  yearOf: (item: T) => number | null
): { shown: T[]; decades: number[] } {
  const decades = decadesPresent(items, yearOf);
  const view = effectiveYearView(viewSignal(screen).value, decades);
  return { shown: applyYearView(items, yearOf, view), decades };
}

/**
 * The "Sort by year" toggle and the decade chips of `screen`; nothing when
 * no item of the list is dated (`decades` empty).
 */
export function YearView(p: { screen: string; decades: number[] }) {
  if (p.decades.length === 0) return null;
  const state = viewSignal(p.screen);
  const view = effectiveYearView(state.value, p.decades);
  const set = (patch: Partial<YearViewState>): void => {
    state.value = { ...view, ...patch };
  };
  const chip = (active: boolean): string => (active ? 'chip active' : 'chip');
  return (
    <div class="yearview">
      <button
        type="button"
        class={chip(view.sortByYear)}
        aria-pressed={view.sortByYear}
        onClick={() => set({ sortByYear: !view.sortByYear })}
      >
        Sort by year
      </button>
      <button
        type="button"
        class={chip(view.decade === null)}
        aria-pressed={view.decade === null}
        onClick={() => set({ decade: null })}
      >
        All
      </button>
      {p.decades.map((d) => (
        <button
          type="button"
          key={d}
          class={chip(view.decade === d)}
          aria-pressed={view.decade === d}
          onClick={() => set({ decade: view.decade === d ? null : d })}
        >
          {decadeLabel(d)}
        </button>
      ))}
    </div>
  );
}

/** A dated song's year as a pill; nothing for an undated one, never 0. */
export function YearPill({ year }: { year: number | null | undefined }) {
  return typeof year === 'number' ? (
    <span class="pill year">{year}</span>
  ) : null;
}
