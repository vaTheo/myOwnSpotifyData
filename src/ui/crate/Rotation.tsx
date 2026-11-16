import { useMemo } from 'preact/hooks';
import { signal } from '@preact/signals';
import { lang, msg } from '../../i18n';
import {
  MIN_ROTATION_PLAYS,
  ROTATION_WINDOWS,
  heavyRotation,
  lastMonths,
  peakMonth,
  type RotationItem,
} from '../../model/crate';
import { routeHref } from '../../router';
import { CRATE_TITLE } from '../layout/titles';
import { MonthBars } from '../charts/MonthBars';
import { monthSeries } from '../charts/series';
import { Flag } from '../components/Flag';
import { SegmentedButtons } from '../components/SegmentedButtons';
import { DetailsSection } from '../details/TrackDetails';
import { countColumn } from '../table/columns';
import { historySummary } from '../../model/state';
import { staleMonthKey } from './labels';
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

function options() {
  return ROTATION_WINDOWS.map((n) => ({
    value: String(n),
    label: msg().crate.rotation.option(n),
  }));
}

function shortMonth(key: string): string {
  return msg().months[Number(key.slice(5, 7)) - 1];
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
  const text = msg().crate;
  if (item.isNew) return <Flag kind="top">{text.rotation.new}</Flag>;
  if (inNoPlaylist(item.row)) {
    return <Flag kind="todo">{text.common.notInPlaylist}</Flag>;
  }
  return null;
}

/** The view's figures for the opened track: the window, month by month. */
function RotationExtra(p: { item: RotationItem; keys: string[] }) {
  const months = p.item.row.months;
  const month = months ? peakMonth(months, p.keys) : null;
  return (
    <DetailsSection title={CRATE_TITLE.rotation}>
      <p class="details-note">
        {msg().crate.rotation.ofPlays(p.item.windowPlays, p.item.row.plays)}
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
  // `now` counts by its day.
  const today = now.toDateString();
  const items = useMemo(
    () => heavyRotation(rows, now, months),
    [rows, today, months]
  );
  const text = msg().crate;
  const caption = [rangeLabel(keys)];
  if (now.getDate() < 8) {
    const current = shortMonth(keys[keys.length - 1]);
    caption.push(text.rotation.dayIn(current, now.getDate()));
  }
  caption.push(
    text.common.playsPlus(MIN_ROTATION_PLAYS),
    msg().n.track(items.length)
  );
  const opened = items.find((item) => item.row.trackId === detail);
  const stale = staleMonthKey(historySummary.value?.range, now);
  // Kept while its inputs stay, so the table's memos hold (S13 A5);
  // the model comes in by its rows.
  const columns = useMemo(
    () =>
      crateColumns<RotationItem>({
        metrics: [
          countColumn(
            'window',
            text.rotation.inWindow,
            (item) => item.windowPlays,
            { unit: [text.common.unitPlay, text.common.unitPlays] }
          ),
          countColumn(
            'lifetime',
            text.rotation.lifetime,
            (item) => item.row.plays,
            {},
            { priority: 3, width: '96px', compact: 'hidden' }
          ),
        ],
        chart: chartColumn(
          text.rotation.lastWindow(months),
          text.common.playsPerMonth,
          (item) => windowSeries(item, keys),
          keys.length
        ),
        flag: rotationFlag,
      }),
    [rows, today, months, lang.value]
  );
  return (
    <>
      <div class="toolbar">
        <SegmentedButtons
          options={options()}
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
              <p>{text.rotation.staleEmpty(monthLabel(stale), months)}</p>
              <a href={routeHref({ name: 'import' })}>
                {text.rotation.importFresh}
              </a>
            </>
          ) : (
            <>
              <p>
                {text.rotation.nothingSince(
                  MIN_ROTATION_PLAYS,
                  monthLabel(keys[0])
                )}
              </p>
              {months !== 6 && (
                <button
                  type="button"
                  onClick={() => {
                    rotationMonths.value = 6;
                  }}
                >
                  {text.common.tryMonths(6)}
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <CrateTable
          label={text.rotation.table(months)}
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
