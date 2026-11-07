import { signal } from '@preact/signals';
import {
  MIN_ROTATION_PLAYS,
  MONTH_NAMES,
  ROTATION_WINDOWS,
  heavyRotation,
  lastMonths,
  peakMonth,
  type RotationItem,
} from '../../model/crate';
import { routeHref } from '../../router';
import { MonthBars } from '../charts/MonthBars';
import { monthSeries } from '../charts/series';
import { Flag } from '../components/Flag';
import { SegmentedButtons } from '../components/SegmentedButtons';
import { DetailsSection } from '../details/TrackDetails';
import { plural } from '../format';
import { countColumn } from '../table/columns';
import { historySummary } from '../../model/state';
import { staleMonthKey, windowLabel } from './labels';
import { rotationMonths } from './selections';
import {
  CrateSheet,
  CrateTable,
  DEFAULT_SORT,
  OpenMonthLink,
  chartColumn,
  crateColumns,
  historyRange,
  inNoPlaylist,
  monthLabel,
  useCrateRows,
} from './shared';
import { EMPTY_FILTER } from '../filters/trackFilter';

const sort = signal(DEFAULT_SORT);
const filter = signal(EMPTY_FILTER);

const OPTIONS = ROTATION_WINDOWS.map((n) => ({
  value: String(n),
  label: n === 1 ? '1 month' : `${n} months`,
}));

function shortMonth(key: string): string {
  return MONTH_NAMES[Number(key.slice(5, 7)) - 1];
}

function rangeLabel(keys: string[]): string {
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (first === last) return monthLabel(last);
  if (first.slice(0, 4) === last.slice(0, 4)) {
    return `${shortMonth(first)} – ${monthLabel(last)}`;
  }
  return `${monthLabel(first)} – ${monthLabel(last)}`;
}

function windowSeries(item: RotationItem, keys: string[]) {
  return monthSeries(item.row.months, keys, historyRange());
}

/** `New` first, then "not in a playlist" (today's precedence). */
function rotationFlag(item: RotationItem) {
  if (item.isNew) return <Flag kind="top">New</Flag>;
  if (inNoPlaylist(item.row)) return <Flag kind="todo">not in a playlist</Flag>;
  return null;
}

/** The view's figures for the opened track: the window, month by month. */
function RotationExtra(p: { item: RotationItem; keys: string[] }) {
  const months = p.item.row.months;
  const month = months ? peakMonth(months, p.keys) : null;
  return (
    <DetailsSection title="Heavy rotation">
      <p class="details-note">
        {p.item.windowPlays.toLocaleString()} of{' '}
        {plural(p.item.row.plays, 'play')}
      </p>
      <MonthBars series={windowSeries(p.item, p.keys)} />
      {month && <OpenMonthLink month={month} />}
    </DetailsSection>
  );
}

export function Rotation({ detail }: { detail?: string }) {
  const rows = useCrateRows();
  const now = new Date();
  const months = rotationMonths.value;
  const keys = lastMonths(now, months);
  const items = heavyRotation(rows, now, months);
  const caption = [rangeLabel(keys)];
  if (now.getDate() < 8) {
    const current = shortMonth(keys[keys.length - 1]);
    caption.push(`${current} is ${plural(now.getDate(), 'day')} in`);
  }
  caption.push(`${MIN_ROTATION_PLAYS}+ plays`, plural(items.length, 'track'));
  const opened = items.find((item) => item.row.trackId === detail);
  const stale = staleMonthKey(historySummary.value?.range, now);
  const columns = crateColumns<RotationItem>({
    metrics: [
      countColumn('window', 'Plays in window', (item) => item.windowPlays, {
        unit: ['play', 'plays'],
      }),
      countColumn(
        'lifetime',
        'Lifetime',
        (item) => item.row.plays,
        {},
        { priority: 3, width: '96px', compact: 'hidden' }
      ),
    ],
    chart: chartColumn(
      `Last ${windowLabel(months)}`,
      'Plays per month',
      (item) => windowSeries(item, keys),
      keys.length
    ),
    flag: rotationFlag,
  });
  return (
    <>
      <div class="toolbar">
        <SegmentedButtons
          options={OPTIONS}
          value={String(months)}
          onChange={(v) => {
            rotationMonths.value = Number(v);
          }}
        />
      </div>
      <p class="caption">{caption.join(' · ')}</p>
      {items.length === 0 ? (
        <div class="empty">
          {stale ? (
            <>
              <p>
                Your history ends {monthLabel(stale)}, so nothing falls in the
                last {windowLabel(months)}.
              </p>
              <a href={routeHref({ name: 'import' })}>Import a fresh export</a>
            </>
          ) : (
            <>
              <p>
                Nothing with {MIN_ROTATION_PLAYS}+ plays since{' '}
                {monthLabel(keys[0])}.
              </p>
              {months !== 6 && (
                <button
                  type="button"
                  onClick={() => {
                    rotationMonths.value = 6;
                  }}
                >
                  Try 6 months
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <CrateTable
          label={`Heavy rotation, last ${windowLabel(months)}`}
          items={items}
          columns={columns}
          sort={sort}
          filter={filter}
          resetKey={String(months)}
          detail={detail}
        />
      )}
      <CrateSheet
        detail={detail}
        extra={opened && <RotationExtra item={opened} keys={keys} />}
      />
    </>
  );
}
