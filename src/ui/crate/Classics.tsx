import { signal } from '@preact/signals';
import {
  CLASSIC_MIN_PLAYS_PER_YEAR,
  CLASSIC_MIN_YEARS,
  PAGE_SIZE,
  classics,
  monthKey,
} from '../../model/crate';
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
  spanYears,
  useCrateRows,
} from './shared';

const expanded = signal<string | null>(null);
const limit = signal(PAGE_SIZE);

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
