import type { Signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { decadesPresent } from '../../model/yearView';
import { decadeLabel } from '../../model/year';
import { EmptyState } from '../components/EmptyState';
import { yearSortFor, yearSortOn } from '../table/layout';
import type { SortState } from '../table/sort';
import { Icon } from '../icons';
import { KeyPicker } from './KeyPicker';
import {
  clearCriteria,
  filterError,
  filterTracks,
  forDecades,
  hasCriteria,
  isFiltering,
  type FilterFeature,
  type TrackFilter,
} from './trackFilter';

/** '' is no bound; anything else a number, or no bound if unreadable. */
function bound(text: string): number | null {
  if (text.trim() === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function BpmField(p: {
  label: string;
  placeholder: string;
  value: number | null;
  invalid: boolean;
  onValue: (value: number | null) => void;
}) {
  // The typed text is kept as typed ("12." on the way to "12.5"); a change
  // from outside (Clear filters) replaces it.
  const [text, setText] = useState(p.value === null ? '' : String(p.value));
  useEffect(() => {
    if (bound(text) !== p.value) {
      setText(p.value === null ? '' : String(p.value));
    }
  }, [p.value]);
  return (
    <input
      class="text-field filter-bpm"
      type="text"
      inputMode="decimal"
      autoComplete="off"
      placeholder={p.placeholder}
      aria-label={p.label}
      aria-invalid={p.invalid || undefined}
      aria-describedby={p.invalid ? 'filter-bpm-error' : undefined}
      value={text}
      onInput={(e) => {
        const input = e.currentTarget as HTMLInputElement;
        // Digits and one decimal point only: anything typed is a number.
        const clean = input.value
          .replace(/,/g, '.')
          .replace(/[^\d.]/g, '')
          .replace(/(\..*)\./g, '$1');
        if (clean !== input.value) input.value = clean;
        setText(clean);
        p.onValue(bound(clean));
      }}
    />
  );
}

/**
 * The filters above a track table (contracts/components.md, research D12,
 * FR-052): the text filter, the BPM range with its error, the key picker
 * and, once a BPM or key is set, "Clear filters" (the text keeps its own
 * clear). "Showing N of M" while anything narrows the table.
 */
export function FilterBar(p: {
  filter: Signal<TrackFilter>;
  shown: number;
  total: number;
  /** The text field's placeholder, which also names it. */
  placeholder?: string;
  /** The decades the table's rows are dated in; none hides the chips. */
  decades?: readonly number[];
  /**
   * The "Sort by year, oldest first" switch, drawn only where the
   * Released header cannot sort (round 005); null or absent draws nothing.
   */
  yearSort?: { on: boolean; onChange: (on: boolean) => void } | null;
}) {
  const decades = p.decades ?? [];
  const f = forDecades(p.filter.value, decades);
  const set = (patch: Partial<TrackFilter>) => {
    p.filter.value = { ...p.filter.value, ...patch };
  };
  const error = filterError(f);
  return (
    <div class="filter-bar">
      <div class="filter-bar-fields">
        <label class="filter-text">
          <Icon name="search" size={20} />
          <input
            type="search"
            placeholder={p.placeholder ?? 'Filter by title or artist'}
            aria-label={p.placeholder ?? 'Filter by title or artist'}
            value={f.text}
            onInput={(e) =>
              set({ text: (e.currentTarget as HTMLInputElement).value })
            }
          />
        </label>
        <div class="filter-bpm-range" role="group" aria-label="BPM range">
          <BpmField
            label="Minimum BPM"
            placeholder="Min BPM"
            value={f.bpmMin}
            invalid={error !== null}
            onValue={(bpmMin) => set({ bpmMin })}
          />
          <span aria-hidden="true">–</span>
          <BpmField
            label="Maximum BPM"
            placeholder="Max BPM"
            value={f.bpmMax}
            invalid={error !== null}
            onValue={(bpmMax) => set({ bpmMax })}
          />
        </div>
        <KeyPicker
          value={f.key}
          compatible={f.compatible}
          onChange={(key, compatible) => set({ key, compatible })}
        />
        {hasCriteria(f) && (
          <button
            type="button"
            class="filter-clear"
            onClick={() => {
              p.filter.value = clearCriteria(p.filter.value);
            }}
          >
            <Icon name="close" size={18} />
            <span>Clear filters</span>
          </button>
        )}
      </div>
      {(decades.length > 0 || p.yearSort) && (
        <div class="filter-bar-year">
          {decades.length > 0 && (
            <div class="filter-decades" role="group" aria-label="Decade">
              <span class="filter-decades-label" aria-hidden="true">
                Decade
              </span>
              <div class="segmented scroll">
                {decades.map((d) => {
                  const on = f.decade === d;
                  return (
                    <button
                      type="button"
                      key={d}
                      class={on ? 'active' : ''}
                      aria-pressed={on}
                      onClick={() => set({ decade: on ? null : d })}
                    >
                      <span>{decadeLabel(d)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {p.yearSort && (
            <button
              type="button"
              role="switch"
              class="filter-clear filter-year-sort"
              aria-checked={p.yearSort.on}
              onClick={() => p.yearSort?.onChange(!p.yearSort.on)}
            >
              {p.yearSort.on && <Icon name="check" size={18} />}
              <span>Sort by year, oldest first</span>
            </button>
          )}
        </div>
      )}
      {error && (
        <p id="filter-bpm-error" class="filter-error" role="alert">
          <Icon name="error" size={18} />
          {error}: no BPM filter applied
        </p>
      )}
      {isFiltering(f) && (
        <p class="filter-count caption" aria-live="polite">
          Showing {p.shown.toLocaleString()} of {p.total.toLocaleString()}
        </p>
      )}
    </div>
  );
}

/**
 * One track table's filtering, for the screens: the bar, the rows kept (a
 * set the table filters by, after its ranks are taken, FR-049) and, when
 * nothing is left, the empty state with its one action.
 */
export function trackFilterView<Row>(p: {
  filter: Signal<TrackFilter>;
  rows: readonly Row[];
  featureOf: (row: Row) => FilterFeature | null;
  textOf: (row: Row) => string;
  placeholder?: string;
  /** The row's release year (round 005): the decade chips filter by it. */
  yearOf?: (row: Row) => number | null;
  /**
   * The table's sort, and whether the Released header cannot sort it
   * (`yearSortOffered`): then the bar draws "Sort by year, oldest first",
   * on while the table sorts by Released ascending.
   */
  yearSort?: {
    sort: SortState;
    onSort: (sort: SortState) => void;
    offered: boolean;
  };
}): {
  bar: ComponentChildren;
  only: ReadonlySet<Row> | null;
  empty: ComponentChildren;
  /** Anything narrows the table (a decade it holds no row of does not). */
  filtering: boolean;
} {
  const decades = p.yearOf ? decadesPresent(p.rows, p.yearOf) : [];
  const f = forDecades(p.filter.value, decades);
  const active = isFiltering(f);
  const kept = active
    ? filterTracks(p.rows, p.featureOf, f, p.textOf, p.yearOf)
    : (p.rows as Row[]);
  const ys = p.yearSort;
  const bar = (
    <FilterBar
      filter={p.filter}
      shown={kept.length}
      total={p.rows.length}
      placeholder={p.placeholder}
      decades={decades}
      yearSort={
        ys?.offered && decades.length > 0
          ? {
              on: yearSortOn(ys.sort),
              onChange: (on) => ys.onSort(yearSortFor(on)),
            }
          : null
      }
    />
  );
  const empty =
    active && kept.length === 0 && p.rows.length > 0 ? (
      <EmptyState
        icon="filter_list"
        action={
          hasCriteria(f)
            ? {
                label: 'Clear filters',
                onClick: () => {
                  p.filter.value = clearCriteria(p.filter.value);
                },
              }
            : {
                label: 'Clear the text',
                onClick: () => {
                  p.filter.value = { ...p.filter.value, text: '' };
                },
              }
        }
      >
        <p>No tracks match these filters.</p>
      </EmptyState>
    ) : null;
  return { bar, only: active ? new Set(kept) : null, empty, filtering: active };
}
