import { render } from 'preact';
import { useState } from 'preact/hooks';
import { yearSetting, type YearPeriod } from '../model/crate';
import { historySummary, model } from '../model/state';
import { MonthBars } from '../ui/charts/MonthBars';
import { Meter } from '../ui/charts/Meter';
import { YearMonthGrid } from '../ui/charts/YearMonthGrid';
import { monthKeys, monthSeries, yearMonthTotals } from '../ui/charts/series';

/**
 * `#/dev/charts` on `yarn dev ?demo` only (spec 003, step S05): the chart
 * blocks on demo data, for the visual loop, until S06 puts them on screens.
 */
function ChartsDemo() {
  const plays = model.value?.plays ?? [];
  const range = historySummary.value?.range ?? null;
  const totals = yearMonthTotals(plays, range, new Date().getFullYear());
  const last = totals[totals.length - 1]?.year ?? new Date().getFullYear();
  const [sel, setSel] = useState<{ year: number; period: YearPeriod }>({
    year: last,
    period: 'winter',
  });
  // The track played most in the last year shown, so both charts have bars.
  const inLast = (months: Record<string, number> | undefined) =>
    Object.entries(months ?? {})
      .filter(([key]) => key.startsWith(String(last)))
      .reduce((sum, [, n]) => sum + n, 0);
  const busiest = [...plays].sort(
    (a, b) => inLast(b.months) - inLast(a.months)
  )[0];
  const first = `${totals[0]?.year ?? last}-01`;
  const keys = monthKeys(first, `${last}-12`);
  return (
    <main class="screen">
      <h1>Charts</h1>
      <h2>Plays per month, whole span</h2>
      {busiest && (
        <MonthBars series={monthSeries(busiest.months, keys, range)} />
      )}
      <h2>Plays per month, {last}</h2>
      {busiest && (
        <MonthBars
          series={monthSeries(
            busiest.months,
            monthKeys(`${last}-01`, `${last}-12`),
            range
          )}
        />
      )}
      <h2>Finish rate</h2>
      <Meter pct={82} />
      <Meter pct={50} />
      <Meter pct={20} />
      <h2>By year</h2>
      <YearMonthGrid
        totals={totals}
        selection={sel}
        onSelect={(year, period) => setSel({ year, period })}
      />
      <p>Selected: {yearSetting(sel.year, sel.period)}</p>
    </main>
  );
}

/** Swaps the app for the demo page while the hash is `#/dev/charts`. */
export function installChartsDemo(app: () => void): void {
  const root = document.getElementById('app')!;
  let showing = false;
  const apply = () => {
    const charts = location.hash === '#/dev/charts';
    if (charts) render(<ChartsDemo />, root);
    else if (showing) app();
    showing = charts;
  };
  addEventListener('hashchange', apply);
  if (location.hash === '#/dev/charts') apply();
}
