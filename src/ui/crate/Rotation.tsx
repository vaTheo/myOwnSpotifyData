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
} from '../../model/crate';
import { historySummary } from '../../model/state';
import { routeHref } from '../../router';
import { Badge } from '../components/Badge';
import { Segmented } from '../components/Segmented';
import { plural } from '../format';
import { staleMonthKey, windowLabel } from './labels';
import { rotationMonths } from './selections';
import {
  CrateRow,
  OpenMonthLink,
  Paged,
  PlaylistLinks,
  inNoPlaylist,
  monthLabel,
  useCrateRows,
} from './shared';

const expanded = signal<string | null>(null);
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

function stripText(row: PlayRow, keys: string[]): string {
  if (!hasMonthData(row)) return '';
  return keys
    .map((key) => {
      const n = row.months[key] ?? 0;
      return `${shortMonth(key)} ${n > 0 ? n.toLocaleString() : '—'}`;
    })
    .join(' · ');
}

export function Rotation() {
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
  const stale = staleMonthKey(historySummary.value?.range, now);
  return (
    <>
      <Segmented
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
              const strip = stripText(item.row, keys);
              const month = hasMonthData(item.row)
                ? peakMonth(item.row.months, keys)
                : null;
              return (
                <CrateRow
                  key={id}
                  rank={i + 1}
                  row={item.row}
                  badge1={
                    <Badge kind="plays">
                      {plural(item.windowPlays, 'play')}
                    </Badge>
                  }
                  badge2={
                    item.isNew ? (
                      <Badge kind="top">New</Badge>
                    ) : inNoPlaylist(item.row) ? (
                      <Badge kind="todo">not in a playlist</Badge>
                    ) : (
                      <Badge>{item.row.plays.toLocaleString()} lifetime</Badge>
                    )
                  }
                  expanded={expanded.value === id}
                  onToggle={() => {
                    expanded.value = expanded.value === id ? null : id;
                  }}
                >
                  <p class="muted">
                    {item.windowPlays.toLocaleString()} of{' '}
                    {plural(item.row.plays, 'play')}
                  </p>
                  {strip && <p class="strip">{strip}</p>}
                  <PlaylistLinks row={item.row} />
                  {month && <OpenMonthLink month={month} />}
                </CrateRow>
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
    </>
  );
}
