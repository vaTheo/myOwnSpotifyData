import { signal } from '@preact/signals';
import { useEffect, useMemo } from 'preact/hooks';
import {
  MONTH_NAMES,
  byYear,
  periodMonths,
  yearsWithPlays,
  type YearItem,
  type YearPeriod,
} from '../../model/crate';
import { MonthBars } from '../charts/MonthBars';
import { YearMonthGrid } from '../charts/YearMonthGrid';
import { monthSeries, yearChartKeys, yearMonthTotals } from '../charts/series';
import { Flag } from '../components/Flag';
import { SegmentedButtons } from '../components/SegmentedButtons';
import { DetailsSection } from '../details/TrackDetails';
import { formatDate, plural } from '../format';
import { windowClass } from '../layout/windowClass';
import { countColumn } from '../table/columns';
import { yearPeriod, yearSel } from './selections';
import {
  CrateSheet,
  CrateTable,
  DEFAULT_SORT,
  chartColumn,
  crateColumns,
  historyRange,
  inNoPlaylist,
  monthLabel,
  useCrateRows,
} from './shared';
import { EMPTY_FILTER } from '../filters/trackFilter';

const PERIOD_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'winter', label: 'Winter' },
  { value: 'spring', label: 'Spring' },
  { value: 'summer', label: 'Summer' },
  { value: 'autumn', label: 'Autumn' },
  ...MONTH_NAMES.map((label, i) => ({ value: String(i + 1), label })),
];

const sort = signal(DEFAULT_SORT);
const filter = signal(EMPTY_FILTER);

/**
 * The route's period segment is applied once per mount: arriving from
 * `Open Aug 2026 ›` selects 2026 and August on every visit, while a later tap
 * on another chip or cell stands until the screen is left and entered again.
 */
function applyPeriod(period: string): void {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return;
  yearSel.value = Number(match[1]);
  yearPeriod.value = month;
}

function toPeriod(value: string): YearPeriod {
  const month = Number(value);
  return month >= 1 && month <= 12 ? month : (value as YearPeriod);
}

function monthName(key: string): string {
  return MONTH_NAMES[Number(key.slice(5, 7)) - 1] ?? key;
}

/** `2022`, `Mar 2022`, `Jun – Aug 2022`, `Dec 2021 – Feb 2022`. */
function selectionLabel(year: number, period: YearPeriod): string {
  if (period === 'all') return String(year);
  const months = periodMonths(year, period);
  const first = months[0];
  const last = months[months.length - 1];
  if (first === last) return monthLabel(first);
  if (first.slice(0, 4) === last.slice(0, 4)) {
    return `${monthName(first)} – ${monthLabel(last)}`;
  }
  return `${monthLabel(first)} – ${monthLabel(last)}`;
}

/**
 * A row's months: the selected year's twelve, opened by the previous
 * December under Winter (spec §3), so the chart covers every month the
 * selection counted.
 */
function yearSeries(item: YearItem, year: number, period: YearPeriod) {
  return monthSeries(
    item.row.months,
    yearChartKeys(year, period),
    historyRange()
  );
}

/** The view's figures for the opened track: lifetime plays, the year's months. */
function YearExtra(p: {
  item: YearItem;
  year: number;
  selection: YearPeriod;
  label: string;
}) {
  const row = p.item.row;
  return (
    <DetailsSection title={p.label}>
      <p class="details-note">
        {plural(row.plays, 'play')} lifetime · last {formatDate(row.lastTs)}
      </p>
      <MonthBars series={yearSeries(p.item, p.year, p.selection)} />
    </DetailsSection>
  );
}

export function ByYear({
  period,
  detail,
}: {
  period?: string;
  detail?: string;
}) {
  useEffect(() => {
    if (period) applyPeriod(period);
  }, [period]);
  const rows = useCrateRows();
  const years = yearsWithPlays(rows);
  const thisYear = new Date().getFullYear();
  const year = yearSel.value ?? years[years.length - 1] ?? thisYear;
  const selection = yearPeriod.value;
  const result = useMemo(
    () => byYear(rows, year, selection),
    [rows, year, selection]
  );
  const label = selectionLabel(year, selection);
  const opened = result.items.find((item) => item.row.trackId === detail);
  const caption =
    `${label} · ${plural(result.plays, 'play')} · ` +
    plural(result.tracks, 'track');
  const select = (y: number, p: YearPeriod) => {
    yearSel.value = y;
    yearPeriod.value = p;
  };
  // Kept while its inputs stay, so the table's memos hold (S13 A5);
  // the model comes in by its rows.
  const columns = useMemo(
    () =>
      crateColumns<YearItem>({
        metrics: [
          countColumn(
            'selection',
            'Plays in selection',
            (item) => item.selectionPlays,
            { unit: ['play', 'plays'] },
            { width: '144px' }
          ),
          selection === 'all'
            ? countColumn(
                'of',
                'All time',
                (item) => item.row.plays,
                {},
                { priority: 3, width: '96px', compact: 'hidden' }
              )
            : countColumn(
                'of',
                `In ${year}`,
                (item) => item.yearPlays,
                {},
                { priority: 3, width: '96px', compact: 'hidden' }
              ),
        ],
        chart: chartColumn(
          'Per month',
          'Plays per month',
          (item) => yearSeries(item, year, selection),
          selection === 'winter' ? 13 : 12
        ),
        flag: (item) =>
          inNoPlaylist(item.row) ? (
            <Flag kind="todo">not in a playlist</Flag>
          ) : null,
      }),
    [rows, year, selection]
  );
  return (
    <>
      {windowClass.value === 'compact' ? (
        <>
          <SegmentedButtons
            scroll
            options={years.map((y) => ({ value: String(y), label: String(y) }))}
            value={String(year)}
            onChange={(v) => {
              yearSel.value = Number(v);
            }}
          />
          <SegmentedButtons
            scroll
            options={PERIOD_OPTIONS}
            value={String(selection)}
            onChange={(v) => {
              yearPeriod.value = toPeriod(v);
            }}
          />
        </>
      ) : (
        <YearMonthGrid
          totals={yearMonthTotals(rows, historyRange(), thisYear)}
          selection={{ year, period: selection }}
          onSelect={select}
        />
      )}
      <p class="caption">{caption}</p>
      {result.items.length === 0 ? (
        <p class="empty">No plays in {label}.</p>
      ) : (
        <CrateTable
          label={`By year, ${label}`}
          items={result.items}
          columns={columns}
          sort={sort}
          filter={filter}
          resetKey={`${year} ${selection}`}
          detail={detail}
        />
      )}
      <CrateSheet
        detail={detail}
        extra={
          opened && (
            <YearExtra
              item={opened}
              year={year}
              selection={selection}
              label={label}
            />
          )
        }
      />
    </>
  );
}
