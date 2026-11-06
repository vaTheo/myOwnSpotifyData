import type { ComponentChildren, JSX } from 'preact';
import { Fragment } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { PAGE_SIZE } from '../../model/crate';
import { Icon } from '../icons';
import { windowClass } from '../layout/windowClass';
import { moveIndex } from './keyboard';
import {
  nextSort,
  sortRows,
  type SortDirection,
  type SortState,
  type SortValue,
} from './sort';

/**
 * One column of a table (spec 003, data-model §3). `priority` 1 never hides;
 * 2 to 4 hide in that order as the table narrows (FR-018). `compact` is the
 * column's place in the two-line item drawn on phones (FR-017).
 */
export interface Column<Row> {
  id: string;
  header: string;
  /** The header is for screen readers only (a cover, a link column). */
  headerHidden?: boolean;
  align?: 'start' | 'end';
  priority: 1 | 2 | 3 | 4;
  /** A CSS grid track: `56px`, `minmax(0, 2fr)`. */
  width: string;
  sortValue?: (row: Row) => SortValue;
  /**
   * In a `presorted` table, the header is a sort button though the table
   * never sorts by it: the click is reported, the screen re-ranks.
   */
  sortable?: boolean;
  firstDirection?: SortDirection;
  /** The rank column: sorting by it restores the screen's own ranking. */
  rank?: boolean;
  cell: (row: Row, rank: number) => ComponentChildren;
  /** Full text for a truncated cell's tooltip (FR-023). */
  title?: (row: Row) => string | undefined;
  compact?: 'lead' | 'title' | 'subtitle' | 'meta' | 'trail' | 'hidden';
}

/** The grid template at each priority level: hidden columns get 0 px. */
function templates<Row>(columns: Column<Row>[]): Record<string, string> {
  const vars: Record<string, string> = {};
  for (let level = 1; level <= 4; level += 1) {
    vars[`--dt-cols-${level}`] = columns
      .map((c) => (c.priority <= level ? c.width : '0px'))
      .join(' ');
  }
  return vars;
}

/** How long the focus rests on a row before an open sheet follows it. */
const FOLLOW_DELAY_MS = 150;

function ariaSort(
  column: Column<unknown>,
  sort: SortState
): JSX.AriaAttributes['aria-sort'] {
  if (column.rank && sort.columnId === null) return 'ascending';
  if (sort.columnId !== column.id) return undefined;
  return sort.direction === 'asc' ? 'ascending' : 'descending';
}

/**
 * The tables of the redesign (spec 003, FR-015–FR-018, FR-022, FR-043,
 * FR-044). ARIA grid roles on CSS grid rows; header buttons sort; rows take
 * a roving tabindex. Ranks are computed before any sort or filter and travel
 * with their rows. Long lists grow 100 rows at a time, as before.
 */
export function DataTable<Row>(p: {
  label: string;
  columns: Column<Row>[];
  /** The rows in the screen's own ranking order. */
  rows: Row[];
  rowKey: (row: Row) => string;
  /** The row's rank; by default its place in `rows`. */
  rankOf?: (row: Row, index: number) => number;
  sort: SortState;
  onSort: (sort: SortState) => void;
  onOpen?: (row: Row) => void;
  selectedKey?: string | null;
  /** Heading rows between groups (Under the radar); kept in order. */
  groupOf?: (row: Row) => string | null;
  groupHeading?: (group: string) => ComponentChildren;
  /** A change resets the paging, as a sort change does. */
  resetKey?: string;
  /** What a row is called in the paging footer ("track", "artist"). */
  noun?: string;
  /**
   * A details sheet is open: moving the focus with the arrow keys opens the
   * focused row too, so the sheet follows (US3). Debounced, so a held key
   * changes the address once it stops.
   */
  follow?: boolean;
  /**
   * Two-line items whatever the window: a detail beside the list pane on an
   * expanded window is a phone's width (S04 fix 1).
   */
  compact?: boolean;
  /**
   * The rows arrive already in the order `sort` names (Under the radar's
   * three sorts): a header click only reports the column, the table never
   * re-sorts, and the group headings stay.
   */
  presorted?: boolean;
}) {
  const compact = p.compact ?? windowClass.value === 'compact';
  const [shown, setShown] = useState(PAGE_SIZE);
  const [active, setActive] = useState<number | null>(null);
  const [announce, setAnnounce] = useState('');
  const body = useRef<HTMLDivElement>(null);
  const followTimer = useRef<ReturnType<typeof setTimeout>>();
  // The sheet closed (or the table went): a pending follow would reopen it.
  useEffect(() => () => clearTimeout(followTimer.current), [p.follow]);

  const ranked = useMemo(() => {
    const rankOf = p.rankOf ?? ((_: Row, i: number) => i + 1);
    return p.rows.map((row, i) => ({ row, rank: rankOf(row, i) }));
  }, [p.rows, p.rankOf]);
  const column = p.columns.find((c) => c.id === p.sort.columnId);
  const ordered = useMemo(
    () =>
      column?.sortValue && !p.presorted
        ? sortRows(ranked, (r) => column.sortValue!(r.row), p.sort.direction)
        : ranked,
    [ranked, column, p.sort.direction, p.presorted]
  );

  useEffect(() => {
    setShown(PAGE_SIZE);
    setActive(null);
  }, [p.sort.columnId, p.sort.direction, p.resetKey]);

  const visible = ordered.slice(0, shown);
  const grouped =
    p.groupOf !== undefined && (p.presorted || p.sort.columnId === null);

  function focusRow(index: number): void {
    setActive(index);
    body.current
      ?.querySelector<HTMLElement>(`[data-index="${index}"]`)
      ?.focus();
  }

  function onKeyDown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (!target.matches('[data-index]')) return;
    const index = Number(target.dataset.index);
    if (e.key === 'Enter' && p.onOpen) {
      e.preventDefault();
      p.onOpen(visible[index].row);
      return;
    }
    const next = moveIndex(index, e.key, visible.length, 10);
    if (next === null) return;
    e.preventDefault();
    focusRow(next);
    if (p.follow && p.onOpen) {
      const open = p.onOpen;
      const row = visible[next].row;
      clearTimeout(followTimer.current);
      followTimer.current = setTimeout(() => {
        // Escape may have closed the sheet before the render that clears
        // this timer: follow only while a sheet is still open.
        if (location.hash.includes('?d=')) open(row);
      }, FOLLOW_DELAY_MS);
    }
  }

  function onRowClick(e: MouseEvent, row: Row, index: number): void {
    // A link or button inside the row does its own thing.
    if ((e.target as HTMLElement).closest('a, button')) return;
    setActive(index);
    p.onOpen?.(row);
  }

  function sortBy(c: Column<Row>): void {
    if (p.presorted) {
      p.onSort({ columnId: c.id, direction: c.firstDirection ?? 'asc' });
      setAnnounce(`Sorted by ${c.header}`);
      return;
    }
    const next = nextSort(p.sort, c.id, c);
    p.onSort(next);
    const by = next.columnId === null ? 'the default order' : c.header;
    setAnnounce(
      next.columnId === null
        ? `Sorted by ${by}`
        : `Sorted by ${by}, ${next.direction === 'asc' ? 'ascending' : 'descending'}`
    );
  }

  const tabTarget = active ?? 0;
  let lastGroup: string | null | undefined;

  const rowsOut = visible.map(({ row, rank }, index) => {
    const key = p.rowKey(row);
    const group = grouped
      ? (p.groupOf as (r: Row) => string | null)(row)
      : null;
    const heading =
      grouped && group !== lastGroup && group !== null && p.groupHeading
        ? p.groupHeading(group)
        : null;
    lastGroup = group;
    const selected = p.selectedKey === key;
    const common = {
      role: 'row' as const,
      tabIndex: index === tabTarget ? 0 : -1,
      'data-index': index,
      'data-row-id': key,
      'aria-selected': p.onOpen ? selected : undefined,
      onClick: (e: MouseEvent) => onRowClick(e, row, index),
      onFocus: () => setActive(index),
    };
    return (
      <Fragment key={key}>
        {heading && (
          <div role="row" class="dt-group">
            <div role="gridcell" data-span="true">
              {heading}
            </div>
          </div>
        )}
        {compact ? (
          <div {...common} class={selected ? 'dt-item selected' : 'dt-item'}>
            <CompactItem columns={p.columns} row={row} rank={rank} />
          </div>
        ) : (
          <div {...common} class={selected ? 'dt-row selected' : 'dt-row'}>
            {p.columns.map((c) => (
              <div
                role="gridcell"
                key={c.id}
                class={`dt-cell p${c.priority}${c.align === 'end' ? ' end' : ''}`}
                data-align={c.align ?? 'start'}
                title={c.title?.(row)}
              >
                {c.cell(row, rank)}
              </div>
            ))}
          </div>
        )}
      </Fragment>
    );
  });

  return (
    <div class="dt-wrap">
      <div
        class={compact ? 'dt compact' : 'dt'}
        role="grid"
        aria-label={p.label}
        aria-rowcount={ordered.length + 1}
        style={templates(p.columns)}
      >
        <div role="rowgroup" class={compact ? 'visually-hidden' : 'dt-head'}>
          <div role="row" class="dt-row dt-header-row">
            {p.columns.map((c) => (
              <div
                role="columnheader"
                key={c.id}
                class={`dt-cell p${c.priority}${c.align === 'end' ? ' end' : ''}`}
                data-align={c.align ?? 'start'}
                aria-sort={ariaSort(c as Column<unknown>, p.sort)}
              >
                {(c.sortValue || c.rank || (p.presorted && c.sortable)) &&
                !compact ? (
                  <button
                    type="button"
                    class="dt-sort"
                    onClick={() => sortBy(c)}
                  >
                    <span class={c.headerHidden ? 'visually-hidden' : ''}>
                      {c.header}
                    </span>
                    {p.sort.columnId === c.id && (
                      <Icon
                        name={
                          p.sort.direction === 'asc'
                            ? 'arrow_upward'
                            : 'arrow_downward'
                        }
                        size={16}
                      />
                    )}
                  </button>
                ) : (
                  <span class={c.headerHidden ? 'visually-hidden' : ''}>
                    {c.header}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
        <div role="rowgroup" class="dt-body" ref={body} onKeyDown={onKeyDown}>
          {rowsOut}
        </div>
      </div>
      <div class="visually-hidden" aria-live="polite">
        {announce}
      </div>
      {ordered.length > shown && (
        <div class="dt-footer">
          <p>
            Showing the top {shown.toLocaleString()} of{' '}
            {ordered.length.toLocaleString()}
            {p.noun ? ` ${p.noun}s` : ''}
          </p>
          <button type="button" onClick={() => setShown(shown + PAGE_SIZE)}>
            Show {PAGE_SIZE.toLocaleString()} more
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The item of a phone: lead, then title, subtitle (artists) and meta lines,
 * then trail. The subtitle has its own line so a long meta never cuts the
 * artists to a few letters; meta parts are spaced, not dotted, and wrap.
 */
function CompactItem<Row>(p: {
  columns: Column<Row>[];
  row: Row;
  rank: number;
}) {
  const part = (place: Column<Row>['compact']) =>
    p.columns.filter((c) => c.compact === place);
  const sub = part('subtitle');
  const meta = part('meta');
  return (
    <>
      <div role="gridcell" class="dt-item-lead">
        {part('lead').map((c) => (
          <Fragment key={c.id}>{c.cell(p.row, p.rank)}</Fragment>
        ))}
      </div>
      <div role="gridcell" class="dt-item-main">
        <div class="dt-item-title">
          {part('title').map((c) => (
            <Fragment key={c.id}>{c.cell(p.row, p.rank)}</Fragment>
          ))}
        </div>
        {sub.length > 0 && (
          <div class="dt-item-sub">
            {sub.map((c) => (
              <span key={c.id} class="dt-item-part">
                {c.cell(p.row, p.rank)}
              </span>
            ))}
          </div>
        )}
        {meta.length > 0 && (
          <div class="dt-item-meta">
            {meta.map((c) => (
              <span key={c.id} class="dt-item-part">
                {c.cell(p.row, p.rank)}
              </span>
            ))}
          </div>
        )}
      </div>
      <div role="gridcell" class="dt-item-trail">
        {part('trail').map((c) => (
          <Fragment key={c.id}>{c.cell(p.row, p.rank)}</Fragment>
        ))}
      </div>
    </>
  );
}
