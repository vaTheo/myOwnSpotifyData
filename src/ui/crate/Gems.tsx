import { signal } from '@preact/signals';
import type { PlayRow } from '../../db/schema';
import {
  GEM_WINDOWS,
  MIN_GEM_PLAYS,
  PAGE_SIZE,
  forgottenGems,
  hasMonthData,
  monthKey,
  yearsWithPlays,
} from '../../model/crate';
import { Badge } from '../components/Badge';
import { Segmented } from '../components/Segmented';
import { formatDate, plural } from '../format';
import { gemMonths } from './selections';
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

function gemLabel(months: number): string {
  if (months === 6) return '6 months';
  return months === 12 ? '1 year' : '2 years';
}

const OPTIONS = GEM_WINDOWS.map((n) => ({
  value: String(n),
  label: gemLabel(n),
}));

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

export function Gems() {
  const rows = useCrateRows();
  const now = new Date();
  const months = gemMonths.value;
  const items = forgottenGems(rows, now, months);
  const span = yearsWithPlays(rows).length;
  const since = monthLabel(cutoffMonth(now, months));
  return (
    <>
      <Segmented
        options={OPTIONS}
        value={String(months)}
        onChange={(v) => {
          gemMonths.value = Number(v);
          shown.value = PAGE_SIZE;
        }}
      />
      <p class="caption">
        Played {MIN_GEM_PLAYS}+ times, nothing since {since} ·{' '}
        {plural(items.length, 'track')}
      </p>
      {items.length === 0 ? (
        <div class="empty">
          <p>
            Nothing forgotten. Everything you have played {MIN_GEM_PLAYS}+ times
            has come round in the last{' '}
            {months === 12 ? 'year' : gemLabel(months)}.
          </p>
          {months !== 6 && (
            <button
              type="button"
              onClick={() => {
                gemMonths.value = 6;
                shown.value = PAGE_SIZE;
              }}
            >
              Try 6 months
            </button>
          )}
        </div>
      ) : (
        <>
          <ul class="list">
            {items.slice(0, shown.value).map((item, i) => {
              const id = item.row.trackId;
              const month = monthKey(item.lastPlayed);
              return (
                <CrateRow
                  key={id}
                  rank={i + 1}
                  row={item.row}
                  badge1={
                    <Badge kind="plays">{plural(item.row.plays, 'play')}</Badge>
                  }
                  badge2={
                    inNoPlaylist(item.row) ? (
                      <Badge kind="todo">not in a playlist</Badge>
                    ) : (
                      <Badge>last {monthLabel(month)}</Badge>
                    )
                  }
                  expanded={expanded.value === id}
                  onToggle={() => {
                    expanded.value = expanded.value === id ? null : id;
                  }}
                >
                  <p class="muted">
                    {plural(item.row.plays, 'play')} ·{' '}
                    {spanLabel(item.row, item.lastPlayed)}
                  </p>
                  <p class="strip">
                    {yearsActive(item.row).toLocaleString()} of{' '}
                    {plural(span, 'year')} · last {formatDate(item.row.lastTs)}
                  </p>
                  <PlaylistLinks row={item.row} />
                  <OpenMonthLink month={month} />
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
