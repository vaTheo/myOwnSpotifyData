import { useMemo } from 'preact/hooks';
import { signal } from '@preact/signals';
import { lang, msg } from '../../i18n';
import type { PlayRow } from '../../db/schema';
import {
  GEM_WINDOWS,
  MIN_GEM_PLAYS,
  forgottenGems,
  hasMonthData,
  lastMonths,
  monthKey,
  type GemItem,
} from '../../model/crate';
import { MonthBars } from '../charts/MonthBars';
import { monthSeries } from '../charts/series';
import { Flag } from '../components/Flag';
import { SegmentedButtons } from '../components/SegmentedButtons';
import { DetailsSection } from '../details/TrackDetails';
import { formatDate } from '../format';
import { CRATE_TITLE } from '../layout/titles';
import { countColumn } from '../table/columns';
import { gemMonths } from './selections';
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
  spanYears,
  useCrateRows,
} from './shared';
import { EMPTY_FILTER } from '../filters/trackFilter';

const sort = signal(DEFAULT_SORT);
const filter = signal(EMPTY_FILTER);

/** The chart's reach: two years, so a gem's last busy months show. */
const CHART_MONTHS = 24;

function options() {
  return GEM_WINDOWS.map((n) => ({
    value: String(n),
    label: msg().crate.gems.option(n),
  }));
}

/** Day 1 of the cutoff month: the caption names a month, not a day. */
function cutoffMonth(now: Date, months: number): string {
  return monthKey(new Date(now.getFullYear(), now.getMonth() - months, 1));
}

function spanLabel(row: PlayRow, lastPlayed: Date): string {
  const first = new Date(row.firstTs).getFullYear();
  const last = lastPlayed.getFullYear();
  return first === last ? String(first) : `${first} – ${last}`;
}

/** Years this track was played in at all, against the export's year count. */
function yearsActive(row: PlayRow): number {
  if (!hasMonthData(row)) return 0;
  const years = new Set<string>();
  for (const [key, n] of Object.entries(row.months)) {
    if (n > 0) years.add(key.slice(0, 4));
  }
  return years.size;
}

/** The view's figures for the opened track: the span, the years, the last month. */
function GemExtra(p: { item: GemItem; span: number; keys: string[] }) {
  const row = p.item.row;
  return (
    <DetailsSection title={CRATE_TITLE.gems}>
      <p class="details-note">
        {msg().n.play(row.plays)} · {spanLabel(row, p.item.lastPlayed)}
      </p>
      <p class="details-note">
        {msg().crate.gems.yearsOfLast(
          yearsActive(row),
          p.span,
          formatDate(row.lastTs)
        )}
      </p>
      <MonthBars series={monthSeries(row.months, p.keys, historyRange())} />
      <OpenMonthLink month={monthKey(p.item.lastPlayed)} />
    </DetailsSection>
  );
}

export function Gems({ detail }: { detail?: string }) {
  const rows = useCrateRows();
  const now = new Date();
  const months = gemMonths.value;
  // `now` counts by its day.
  const today = now.toDateString();
  const items = useMemo(
    () => forgottenGems(rows, now, months),
    [rows, today, months]
  );
  const span = spanYears(rows).length;
  const keys = lastMonths(now, CHART_MONTHS);
  const opened = items.find((item) => item.row.trackId === detail);
  const since = monthLabel(cutoffMonth(now, months));
  const text = msg().crate;
  // Kept while its inputs stay, so the table's memos hold (S13 A5);
  // the model comes in by its rows.
  const columns = useMemo(
    () =>
      crateColumns<GemItem>({
        metrics: [
          countColumn('plays', text.common.plays, (item) => item.row.plays, {
            unit: [text.common.unitPlay, text.common.unitPlays],
          }),
          {
            id: 'last',
            header: text.gems.lastPlayed,
            align: 'end',
            priority: 3,
            width: '120px',
            sortValue: (item) => item.lastPlayed.getTime(),
            firstDirection: 'desc',
            cell: (item) => (
              <span>{monthLabel(monthKey(item.lastPlayed))}</span>
            ),
            compact: 'hidden',
          },
        ],
        chart: chartColumn(
          text.gems.lastTwoYears,
          text.common.playsPerMonth,
          (item) => monthSeries(item.row.months, keys, historyRange()),
          keys.length
        ),
        flag: (item) =>
          inNoPlaylist(item.row) ? (
            <Flag kind="todo">{msg().crate.common.notInPlaylist}</Flag>
          ) : null,
      }),
    [rows, today, historyRange(), lang.value]
  );
  return (
    <>
      <div class="toolbar">
        <SegmentedButtons
          options={options()}
          value={String(months)}
          onChange={(v) => {
            gemMonths.value = Number(v);
          }}
        />
      </div>
      <p class="caption">
        {text.gems.caption(MIN_GEM_PLAYS, since)} ·{' '}
        {msg().n.track(items.length)}
      </p>
      {items.length === 0 ? (
        <div class="empty">
          <p>{text.gems.empty(MIN_GEM_PLAYS, months)}</p>
          {months !== 6 && (
            <button
              type="button"
              onClick={() => {
                gemMonths.value = 6;
              }}
            >
              {text.common.tryMonths(6)}
            </button>
          )}
        </div>
      ) : (
        <CrateTable
          label={text.gems.table(months)}
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
        extra={opened && <GemExtra item={opened} span={span} keys={keys} />}
      />
    </>
  );
}
