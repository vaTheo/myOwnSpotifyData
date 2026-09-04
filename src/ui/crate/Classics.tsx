import { signal } from '@preact/signals';
import type { PlayRow } from '../../db/schema';
import {
  CLASSIC_MIN_PLAYS_PER_YEAR,
  CLASSIC_MIN_YEARS,
  PAGE_SIZE,
  classics,
  monthKey,
  yearsWithPlays,
} from '../../model/crate';
import { historySummary } from '../../model/state';
import { Badge } from '../components/Badge';
import { Segmented } from '../components/Segmented';
import { formatDate, plural } from '../format';
import { classicSort } from './selections';
import {
  CrateRow,
  OpenMonthLink,
  Paged,
  PlaylistLinks,
  inNoPlaylist,
  useCrateRows,
} from './shared';

const expanded = signal<string | null>(null);
const limit = signal(PAGE_SIZE);

function yearOf(iso: string | undefined): number | null {
  if (!iso) return null;
  const year = new Date(iso).getFullYear();
  return Number.isFinite(year) ? year : null;
}

/**
 * Every year the export covers, gaps included: the strip prints a dash for a
 * year without plays, so the span comes from the import range and not from the
 * years that happen to have rows.
 */
function spanYears(rows: PlayRow[]): number[] {
  const range = historySummary.value?.range;
  const played = yearsWithPlays(rows);
  const first = yearOf(range?.first) ?? played[0] ?? new Date().getFullYear();
  const last = yearOf(range?.last) ?? played[played.length - 1] ?? first;
  const years: number[] = [];
  for (let y = first; y <= last; y += 1) years.push(y);
  return years.length > 0 ? years : [first];
}

function yearStrip(span: number[], perYear: Map<number, number>): string {
  return span
    .map((y) => `'${String(y).slice(2)} ${perYear.get(y) ?? '—'}`)
    .join(' · ');
}

export function Classics() {
  const rows = useCrateRows();
  const span = spanYears(rows);
  const items = classics(rows, classicSort.value);
  const shown = items.slice(0, limit.value);
  const caption =
    `Played ${CLASSIC_MIN_PLAYS_PER_YEAR}+ times in ` +
    `${CLASSIC_MIN_YEARS}+ of your ${span.length} years · ` +
    plural(items.length, 'track');
  return (
    <>
      <Segmented
        options={[
          { value: 'years', label: 'Most years' },
          { value: 'plays', label: 'Most plays' },
        ]}
        value={classicSort.value}
        onChange={(v) => {
          classicSort.value = v;
          limit.value = PAGE_SIZE;
        }}
      />
      <p class="caption">{caption}</p>
      {items.length === 0 ? (
        <p class="empty">
          No track reaches {CLASSIC_MIN_YEARS} years yet. Your history covers{' '}
          {plural(span.length, 'year')}.
        </p>
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
                  <Badge kind="top">
                    {item.yearsActive} of {span.length} years
                  </Badge>
                }
                badge2={
                  inNoPlaylist(item.row) ? (
                    <Badge kind="todo">not in a playlist</Badge>
                  ) : (
                    <Badge kind="plays">{plural(item.row.plays, 'play')}</Badge>
                  )
                }
              >
                <p class="muted">
                  {plural(item.row.plays, 'play')} · last{' '}
                  {formatDate(item.row.lastTs)}
                </p>
                <p class="strip">{yearStrip(span, item.perYear)}</p>
                <PlaylistLinks row={item.row} />
                <OpenMonthLink month={monthKey(new Date(item.row.lastTs))} />
              </CrateRow>
            ))}
          </ul>
          <Paged
            shown={shown.length}
            total={items.length}
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
