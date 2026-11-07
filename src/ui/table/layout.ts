import type { SortState } from './sort';

/** What a table draws at its width: see `DataTable`'s `onLayout`. */
export interface TableLayout {
  twoLine: boolean;
  widestPriority: 1 | 2 | 3 | 4;
}

/**
 * The highest priority the container queries of `styles.css` show at a
 * table width: 1 below 720 px, 2 below 960, 3 below 1120, else 4. Unmeasured
 * (no layout yet) counts as every column.
 */
export function widestPriority(width: number | null): 1 | 2 | 3 | 4 {
  if (width === null) return 4;
  if (width < 720) return 1;
  if (width < 960) return 2;
  if (width < 1120) return 3;
  return 4;
}

/** The narrowest a title may be drawn in a table (SC-001): about 20 characters. */
export const MIN_TITLE_PX = 160;

/**
 * A row's own padding (8 px start, 16 px end) and a cell's (8 px each
 * side), from `.dt`'s `--dt-pad` in `styles.css`; `layout.test.ts` reads
 * the stylesheet and fails if they drift.
 */
export const ROW_PAD = 24;
export const CELL_PAD = 16;

/** What `titleRoom` reads of a column. */
export interface ColumnTrack {
  id: string;
  priority: 1 | 2 | 3 | 4;
  /** A CSS grid track: `88px`, `minmax(0, 2fr)`, `minmax(200px, 1fr)`. */
  width: string;
}

/**
 * The width the title text gets in a table `width` px wide showing the
 * columns up to `level` (by default the level the container queries draw
 * there): the free width (after the fixed columns and the row's padding)
 * shared by the flexible columns' `fr`, a column's minimum honoured. Null
 * without a `title` column.
 */
export function titleRoom(
  columns: readonly ColumnTrack[],
  width: number,
  level: 1 | 2 | 3 | 4 = widestPriority(width)
): number | null {
  const shown = columns.filter((c) => c.priority <= level);
  if (!shown.some((c) => c.id === 'title')) return null;
  let free = width - ROW_PAD;
  const flex: { id: string; min: number; fr: number }[] = [];
  for (const c of shown) {
    const px = /^([\d.]+)px$/.exec(c.width);
    const mm = /^minmax\(([\d.]+)(?:px)?,\s*([\d.]+)fr\)$/.exec(c.width);
    if (px) free -= Number(px[1]);
    else if (mm) flex.push({ id: c.id, min: Number(mm[1]), fr: Number(mm[2]) });
  }
  // A track whose share is under its minimum takes the minimum; the others
  // share what is left. A title whose minimum does not fit overflows: its
  // room is what is free.
  // The minimums alone overflow: the title gets what the others leave.
  const mins = flex.reduce((n, t) => n + t.min, 0);
  const own = flex.find((t) => t.id === 'title');
  if (own && free < mins) {
    return Math.max(0, free - (mins - own.min) - CELL_PAD);
  }
  let open = flex;
  for (;;) {
    const fr = open.reduce((n, t) => n + t.fr, 0);
    const pinned = open.filter((t) => (free * t.fr) / fr < t.min);
    const title = open.find((t) => t.id === 'title');
    if (!title) return 0;
    if (pinned.includes(title)) {
      return Math.max(0, Math.min(free, title.min) - CELL_PAD);
    }
    if (pinned.length === 0) {
      return Math.max(0, (free * title.fr) / fr - CELL_PAD);
    }
    for (const t of pinned) free -= t.min;
    open = open.filter((t) => !pinned.includes(t));
  }
}

/**
 * The columns a table draws at `width` so its title stays readable (S13c
 * re-review N1): the container queries' level, lowered one priority at a
 * time while the title would get under `MIN_TITLE_PX`, as a narrower
 * window would. `fits` is false only when even the priority-1 columns
 * leave the title too narrow: then the table draws two-line items.
 */
export function fitLevel(
  columns: readonly ColumnTrack[],
  width: number
): { level: 1 | 2 | 3 | 4; fits: boolean } {
  let level = widestPriority(width);
  let room = titleRoom(columns, width, level);
  while (level > 1 && room !== null && room < MIN_TITLE_PX) {
    level = (level - 1) as 1 | 2 | 3;
    room = titleRoom(columns, width, level);
  }
  return { level, fits: room === null || room >= MIN_TITLE_PX };
}

/**
 * A table width as one small number: the column level it draws times two,
 * plus one when it draws two-line items: narrower than `compactBelow`, or
 * too narrow for a readable title even with only the priority-1 columns
 * (`fitLevel`). Equal widths of one level give the same code, so storing it
 * skips re-renders.
 */
export function widthLevel(
  width: number,
  compactBelow?: number,
  columns?: readonly ColumnTrack[]
): number {
  const fit = columns
    ? fitLevel(columns, width)
    : { level: widestPriority(width), fits: true };
  const narrow =
    (compactBelow !== undefined && width < compactBelow) || !fit.fits;
  return fit.level * 2 + (narrow ? 1 : 0);
}

/**
 * `widthLevel` read back. Unmeasured: every column, and `narrow` null (the
 * window class decides two-line items then).
 */
export function levelOf(code: number | null): {
  widest: 1 | 2 | 3 | 4;
  narrow: boolean | null;
} {
  if (code === null) return { widest: 4, narrow: null };
  return {
    widest: Math.floor(code / 2) as 1 | 2 | 3 | 4,
    narrow: code % 2 === 1,
  };
}

/** The "Sort by year" switch is on while the table sorts by Released, oldest first. */
export function yearSortOn(sort: SortState): boolean {
  return sort.columnId === 'released' && sort.direction === 'asc';
}

/** The sort the switch sets: Released ascending, or back to the screen's own order. */
export function yearSortFor(on: boolean): SortState {
  return on
    ? { columnId: 'released', direction: 'asc' }
    : { columnId: null, direction: 'asc' };
}

/**
 * "Sort by year" is offered where the Released header cannot sort: two-line
 * items, or a table too narrow for priority 2 (screens.md "From main…" §2).
 * No layout yet offers nothing; the table reports one before it paints.
 */
export function yearSortOffered(layout: TableLayout | null): boolean {
  return layout !== null && (layout.twoLine || layout.widestPriority < 2);
}
