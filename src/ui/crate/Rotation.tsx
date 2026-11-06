import { signal } from '@preact/signals';
import type { PlayRow } from '../../db/schema';
import {
  MIN_ROTATION_PLAYS,
  MONTH_NAMES,
  PAGE_SIZE,
  ROTATION_WINDOWS,
  hasMonthData,
  heavyRotation,
  lastMonths,
  peakMonth,
  type RotationItem,
} from '../../model/crate';
import { historySummary } from '../../model/state';
import { routeHref } from '../../router';
import { Flag } from '../components/Flag';
import { SegmentedButtons } from '../components/SegmentedButtons';
import { DetailsSection } from '../details/TrackDetails';
import { plural } from '../format';
import { staleMonthKey, windowLabel } from './labels';
import { rotationMonths } from './selections';
import {
  CrateRow,
  CrateSheet,
  OpenMonthLink,
  Paged,
  Strip,
  inNoPlaylist,
  monthLabel,
  useCrateRows,
} from './shared';

const shown = signal(PAGE_SIZE);

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

function stripCells(row: PlayRow, keys: string[]): string[] {
  if (!hasMonthData(row)) return [];
  return keys.map((key) => {
    const n = row.months[key] ?? 0;
    return `${shortMonth(key)} ${n > 0 ? n.toLocaleString() : '—'}`;
  });
}

/** What the row used to expand into: the window's plays, month by month. */
function RotationExtra(p: { item: RotationItem; keys: string[] }) {
  const cells = stripCells(p.item.row, p.keys);
  const month = hasMonthData(p.item.row)
    ? peakMonth(p.item.row.months, p.keys)
    : null;
  return (
    <DetailsSection title="Heavy rotation">
      <p class="details-note">
        {p.item.windowPlays.toLocaleString()} of{' '}
        {plural(p.item.row.plays, 'play')}
      </p>
      {cells.length > 0 && <Strip cells={cells} />}
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
  return (
    <>
      <SegmentedButtons
        options={OPTIONS}
        value={String(months)}
        onChange={(v) => {
          rotationMonths.value = Number(v);
          shown.value = PAGE_SIZE;
        }}
      />
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
                    shown.value = PAGE_SIZE;
                  }}
                >
                  Try 6 months
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          <ul class="list">
            {items.slice(0, shown.value).map((item, i) => {
              const id = item.row.trackId;
              return (
                <CrateRow
                  key={id}
                  rank={i + 1}
                  row={item.row}
                  badge1={
                    <Flag kind="plays">{plural(item.windowPlays, 'play')}</Flag>
                  }
                  badge2={
                    item.isNew ? (
                      <Flag kind="top">New</Flag>
                    ) : inNoPlaylist(item.row) ? (
                      <Flag kind="todo">not in a playlist</Flag>
                    ) : (
                      <Flag>{item.row.plays.toLocaleString()} lifetime</Flag>
                    )
                  }
                  selected={detail === id}
                />
              );
            })}
          </ul>
          <Paged
            shown={shown.value}
            total={items.length}
            step={PAGE_SIZE}
            onMore={() => {
              shown.value += PAGE_SIZE;
            }}
          />
        </>
      )}
      <CrateSheet
        detail={detail}
        extra={opened && <RotationExtra item={opened} keys={keys} />}
      />
    </>
  );
}
