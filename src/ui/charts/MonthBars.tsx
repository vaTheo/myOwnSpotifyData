import { useState } from 'preact/hooks';
import { plural } from '../format';
import {
  barHeights,
  pointLabel,
  pointValue,
  seriesLabel,
  type MonthPoint,
} from './series';

const HEIGHT = 48; // px, the tallest bar
const TICK = 2; // px, a month without plays
const STEP = 10; // viewBox units per month
const BAR = 7; // viewBox units of a bar; the rest is the gap between bars

function tipAt(index: number, count: number): number {
  return ((index + 0.5) / count) * 100;
}

/**
 * Plays per month (research D10): one bar per month in `primary`, scaled to
 * the series' own peak, a baseline tick for 0 and nothing for a month outside
 * the imported history. The SVG is one focusable image whose label lists
 * every value; hovering, or the arrow keys once focused, shows a month's
 * exact value in the tooltip.
 */
export function MonthBars({
  series,
  title = 'Plays per month',
}: {
  series: MonthPoint[];
  title?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  if (series.length === 0) return null;
  const heights = barHeights(series, HEIGHT);
  const withYear = new Set(series.map((p) => p.key.slice(0, 4))).size > 1;
  const width = series.length * STEP;
  const last = series.length - 1;
  const point = active === null ? null : series[active];

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
        aria-label={seriesLabel(title, series)}
        tabIndex={0}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        preserveAspectRatio="none"
        onPointerMove={fromPointer}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive(last)}
        onBlur={() => setActive(null)}
        onKeyDown={onKey}
      >
        {heights.map((h, i) => {
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
              y={HEIGHT - tall}
              width={BAR}
              height={tall}
            />
          );
        })}
      </svg>
      {point && active !== null && (
        <div
          class="chart-tip"
          aria-live="polite"
          // Shifted by its own share of the width, so the first and last
          // months keep it inside the chart instead of past the window edge.
          style={{
            left: `${tipAt(active, series.length)}%`,
            transform: `translateX(-${tipAt(active, series.length)}%)`,
          }}
        >
          {pointLabel(point.key, true)}:{' '}
          {point.value === null
            ? pointValue(null)
            : plural(point.value, 'play')}
        </div>
      )}
      <div class="month-bars-axis" aria-hidden="true">
        <span>{pointLabel(series[0].key, withYear)}</span>
        {last > 0 && <span>{pointLabel(series[last].key, withYear)}</span>}
      </div>
    </div>
  );
}
