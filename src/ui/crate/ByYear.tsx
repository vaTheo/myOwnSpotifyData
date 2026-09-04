import { signal } from '@preact/signals';
import type { PlayRow } from '../../db/schema';
import {
  PAGE_SIZE,
  byYear,
  periodMonths,
  yearsWithPlays,
  type YearPeriod,
} from '../../model/crate';
import { Badge } from '../components/Badge';
import { Segmented } from '../components/Segmented';
import { formatDate, plural } from '../format';
import { yearPeriod, yearSel } from './selections';
import {
  CrateRow,
  Paged,
  PlaylistLinks,
  inNoPlaylist,
  monthLabel,
  useCrateRows,
} from './shared';

const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');

const PERIOD_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'winter', label: 'Winter' },
  { value: 'spring', label: 'Spring' },
  { value: 'summer', label: 'Summer' },
  { value: 'autumn', label: 'Autumn' },
  ...MONTHS.map((label, i) => ({ value: String(i + 1), label })),
];

const expanded = signal<string | null>(null);
const limit = signal(PAGE_SIZE);

/**
 * The route's period segment is applied once per value: arriving from
 * `Open Aug 2026 ›` selects 2026 and August, but a later tap on another chip is
 * never undone by a re-render of the same screen.
 */
let lastAppliedPeriod: string | null = null;

function applyPeriod(period: string): void {
  if (period === lastAppliedPeriod) return;
  lastAppliedPeriod = period;
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return;
  yearSel.value = Number(match[1]);
  yearPeriod.value = month;
  limit.value = PAGE_SIZE;
}

function toPeriod(value: string): YearPeriod {
  const month = Number(value);
  return month >= 1 && month <= 12 ? month : (value as YearPeriod);
}

function monthName(key: string): string {
  return MONTHS[Number(key.slice(5, 7)) - 1] ?? key;
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

function monthStrip(row: PlayRow, year: number): string {
  return MONTHS.map((label, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
    return `${label} ${row.months?.[key] ?? '—'}`;
  }).join(' · ');
}

export function ByYear({ period }: { period?: string }) {
  if (period) applyPeriod(period);
  const rows = useCrateRows();
  const years = yearsWithPlays(rows);
  const year =
    yearSel.value ?? years[years.length - 1] ?? new Date().getFullYear();
  const selection = yearPeriod.value;
  const result = byYear(rows, year, selection);
  const label = selectionLabel(year, selection);
  const shown = result.items.slice(0, limit.value);
  const caption =
    `${label} · ${plural(result.plays, 'play')} · ` +
    plural(result.tracks, 'track');
  return (
    <>
      <Segmented
        scroll
        options={years.map((y) => ({ value: String(y), label: String(y) }))}
        value={String(year)}
        onChange={(v) => {
          yearSel.value = Number(v);
          limit.value = PAGE_SIZE;
        }}
      />
      <Segmented
        scroll
        options={PERIOD_OPTIONS}
        value={String(selection)}
        onChange={(v) => {
          yearPeriod.value = toPeriod(v);
          limit.value = PAGE_SIZE;
        }}
      />
      <p class="caption">{caption}</p>
      {result.items.length === 0 ? (
        <p class="empty">No plays in {label}.</p>
      ) : (
        <>
          <ul class="list">
            {shown.map((item, i) => (
              <CrateRow
                key={item.row.trackId}
                rank={i + 1}
                row={item.row}
                expanded={expanded.value === item.row.trackId}
                onToggle={() => {
                  expanded.value =
                    expanded.value === item.row.trackId
                      ? null
                      : item.row.trackId;
                }}
                badge1={
                  <Badge kind="plays">
                    {plural(item.selectionPlays, 'play')}
                  </Badge>
                }
                badge2={
                  inNoPlaylist(item.row) ? (
                    <Badge kind="todo">not in a playlist</Badge>
                  ) : selection === 'all' ? (
                    <Badge>of {item.row.plays.toLocaleString()} all-time</Badge>
                  ) : (
                    <Badge>
                      of {item.yearPlays.toLocaleString()} in {year}
                    </Badge>
                  )
                }
              >
                <p class="muted">
                  {plural(item.row.plays, 'play')} lifetime · last{' '}
                  {formatDate(item.row.lastTs)}
                </p>
                <p class="strip">{monthStrip(item.row, year)}</p>
                <PlaylistLinks row={item.row} />
              </CrateRow>
            ))}
          </ul>
          <Paged
            shown={shown.length}
            total={result.items.length}
            step={PAGE_SIZE}
            onMore={() => {
              limit.value += PAGE_SIZE;
            }}
          />
        </>
      )}
    </>
  );
}
