import { useState } from 'preact/hooks';
import { plural } from '../format';
import {
  barHeights,
  crossesYears,
  pointLabel,
  pointValue,
  seriesLabel,
  type MonthPoint,
} from './series';

const HEIGHT = 48; // px, the tallest bar
const ROW_HEIGHT = 24; // px, the tallest bar of the compact form
const TICK = 2; // px, a month without plays
const STEP = 10; // viewBox units per month
const BAR = 7; // viewBox units of a bar; the rest is the gap between bars

function tipAt(index: number, count: number): number {
  return ((index + 0.5) / count) * 100;
}

function tipText(point: MonthPoint): string {
  const value =
    point.value === null ? pointValue(null) : plural(point.value, 'play');
  return `${pointLabel(point.key, true)}: ${value}`;
}

/**
 * Plays per month or per year (research D10): one bar per point in
 * `primary`, scaled to the series' own peak, a baseline tick for 0 and
 * nothing for a period outside the imported history.
 *
 * The full form is one focusable image whose label lists every value;
 * hovering, tapping or clicking a bar, or the arrow keys once focused, shows
 * that point's exact value in the tooltip, announced through a live region
 * that stays mounted.
 *
 * `compact` fits a table row (24 px of bars, no axis, no tooltip, no tab
 * stop): the row is the tab stop and names the series in its own text
 * alternative (`seriesLabel`), so the bars are hidden from assistive
 * technology and carry the values only as a pointer's native title.
 */
export function MonthBars({
  series,
  title = 'Plays per month',
  compact = false,
  label: labelOverride,
}: {
  series: MonthPoint[];
  title?: string;
  compact?: boolean;
  /** The text alternative, for points that are not months or years. */
  label?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  if (series.length === 0) return null;
  const height = compact ? ROW_HEIGHT : HEIGHT;
  const heights = barHeights(series, height);
  const withYear = crossesYears(series);
  const width = series.length * STEP;
  const last = series.length - 1;
  const label = labelOverride ?? seriesLabel(title, series);
  const point = active === null ? null : series[active];

  const bars = heights.map((h, i) => {
    if (h === null) return null;
    const x = i * STEP + (STEP - BAR) / 2;
    const tall = h === 0 ? TICK : h;
    return (
      <rect
        key={series[i].key}
        class={
          h === 0
            ? 'month-bars-tick'
            : i === active
              ? 'month-bars-bar active'
              : 'month-bars-bar'
        }
        x={x}
        y={height - tall}
        width={BAR}
        height={tall}
      />
    );
  });

  if (compact) {
    return (
      <svg
        class="month-bars-svg compact"
        aria-hidden="true"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        <title>{label}</title>
        {bars}
      </svg>
    );
  }

  function fromPointer(e: PointerEvent): void {
    const box = (e.currentTarget as SVGElement).getBoundingClientRect();
    const at = Math.floor(((e.clientX - box.left) / box.width) * series.length);
    setActive(Math.min(last, Math.max(0, at)));
  }

  function onKey(e: KeyboardEvent): void {
    const from = active ?? last;
    const to =
      e.key === 'ArrowLeft'
        ? from - 1
        : e.key === 'ArrowRight'
          ? from + 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null;
    if (to === null) return;
    e.preventDefault();
    setActive(Math.min(last, Math.max(0, to)));
  }

  return (
    <div class="month-bars">
      <svg
        class="month-bars-svg"
        role="img"
        aria-label={label}
        tabIndex={0}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        // A tap or a click picks its bar before focus arrives, and focus
        // then keeps it; a touch's pointerleave does not clear it.
        onPointerDown={fromPointer}
        onPointerMove={fromPointer}
        onPointerLeave={(e) => {
          if (e.pointerType !== 'touch') setActive(null);
        }}
        onFocus={() => setActive((a) => a ?? last)}
        onBlur={() => setActive(null)}
        onKeyDown={onKey}
      >
        {bars}
      </svg>
      {point && active !== null && (
        <div
          class="chart-tip"
          aria-hidden="true"
          // Shifted by its own share of the width, so the first and last
          // points keep it inside the chart instead of past the window edge.
          style={{
            left: `${tipAt(active, series.length)}%`,
            transform: `translateX(-${tipAt(active, series.length)}%)`,
          }}
        >
          {tipText(point)}
        </div>
      )}
      <span class="visually-hidden" aria-live="polite">
        {point ? tipText(point) : ''}
      </span>
      <div class="month-bars-axis" aria-hidden="true">
        <span>{pointLabel(series[0].key, withYear)}</span>
        {last > 0 && <span>{pointLabel(series[last].key, withYear)}</span>}
      </div>
    </div>
  );
}
