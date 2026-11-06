import {
  MONTH_NAMES,
  periodMonths,
  yearSetting,
  type Season,
  type YearPeriod,
} from '../../model/crate';
import { plural } from '../format';
import { heatLevel, periodTotal, type YearTotals } from './series';

/** Season headers over the months they cover; December opens next Winter. */
const SEASONS: { season: Season; span: number }[] = [
  { season: 'winter', span: 2 },
  { season: 'spring', span: 3 },
  { season: 'summer', span: 3 },
  { season: 'autumn', span: 3 },
];

export interface YearSelection {
  year: number;
  period: YearPeriod;
}

function keyOf(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * The By year picker as a heat grid (research D10): one row per year, twelve
 * month cells and the year's total, each shaded 0–4 against the owner's
 * busiest month and carrying its count. Cells, totals and the season headers
 * are buttons named like "Aug 2026, 143 plays"; a season picks that season of
 * the selected year by the By year rules (Winter includes the previous
 * December). Every month of the selection is outlined in `primary`. A month
 * outside the imported history is an empty, inert cell.
 */
export function YearMonthGrid({
  totals,
  selection,
  onSelect,
}: {
  totals: YearTotals[];
  selection: YearSelection | null;
  onSelect: (year: number, period: YearPeriod) => void;
}) {
  if (totals.length === 0) return null;
  const max = Math.max(0, ...totals.map((t) => t.max));
  const seasonYear = selection?.year ?? totals[totals.length - 1].year;
  const outlined = new Set(
    selection ? periodMonths(selection.year, selection.period) : []
  );
  const pressed = (year: number, period: YearPeriod) =>
    selection?.year === year && selection.period === period;

  return (
    <div class="ym-scroll">
      <table class="ym-grid">
        <caption class="visually-hidden">Plays per month and per year</caption>
        <thead>
          <tr>
            <td />
            {SEASONS.map(({ season, span }) => {
              const plays = periodTotal(totals, seasonYear, season);
              return (
                <th key={season} colSpan={span} scope="colgroup">
                  <button
                    type="button"
                    class="ym-season"
                    aria-pressed={pressed(seasonYear, season)}
                    aria-label={`${yearSetting(seasonYear, season)}, ${plural(plays, 'play')}`}
                    onClick={() => onSelect(seasonYear, season)}
                  >
                    {season[0].toUpperCase() + season.slice(1)}
                  </button>
                </th>
              );
            })}
            <td />
            <td />
          </tr>
          <tr>
            <td />
            {MONTH_NAMES.map((name) => (
              <th key={name} scope="col" class="ym-month">
                {name}
              </th>
            ))}
            <th scope="col" class="ym-month">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {totals.map((row) => (
            <tr key={row.year}>
              <th scope="row" class="ym-year">
                {row.year}
              </th>
              {row.months.map((value, i) => {
                const month = i + 1;
                const key = keyOf(row.year, month);
                if (value === null) {
                  return <td key={key} class="ym-out" />;
                }
                return (
                  <td key={key}>
                    <button
                      type="button"
                      class={`ym-cell heat-${heatLevel(value, max)}${outlined.has(key) ? ' selected' : ''}`}
                      aria-pressed={pressed(row.year, month)}
                      aria-label={`${yearSetting(row.year, month)}, ${plural(value, 'play')}`}
                      onClick={() => onSelect(row.year, month)}
                    >
                      {value > 0 ? value.toLocaleString() : ''}
                    </button>
                  </td>
                );
              })}
              <td>
                <button
                  type="button"
                  class={`ym-total${pressed(row.year, 'all') ? ' selected' : ''}`}
                  aria-pressed={pressed(row.year, 'all')}
                  aria-label={`${row.year}, ${plural(row.total, 'play')}`}
                  onClick={() => onSelect(row.year, 'all')}
                >
                  {row.total.toLocaleString()}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
