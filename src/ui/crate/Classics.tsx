import { signal } from '@preact/signals';
import {
  CLASSIC_MIN_PLAYS_PER_YEAR,
  CLASSIC_MIN_YEARS,
  PAGE_SIZE,
  classics,
  monthKey,
  type ClassicItem,
} from '../../model/crate';
import { Flag } from '../components/Flag';
import { SegmentedButtons } from '../components/SegmentedButtons';
import { DetailsSection } from '../details/TrackDetails';
import { formatDate, plural } from '../format';
import { classicSort } from './selections';
import {
  CrateRow,
  CrateSheet,
  OpenMonthLink,
  Paged,
  Strip,
  inNoPlaylist,
  spanYears,
  useCrateRows,
} from './shared';

const limit = signal(PAGE_SIZE);

function yearCells(span: number[], perYear: Map<number, number>): string[] {
  return span.map((y) => `'${String(y).slice(2)} ${perYear.get(y) ?? '—'}`);
}

/** What the row used to expand into: plays per year, the last play. */
function ClassicExtra(p: { item: ClassicItem; span: number[] }) {
  const row = p.item.row;
  return (
    <DetailsSection title="All-time classics">
      <p class="details-note">
        {plural(row.plays, 'play')} · last {formatDate(row.lastTs)}
      </p>
      <Strip cells={yearCells(p.span, p.item.perYear)} />
      <OpenMonthLink month={monthKey(new Date(row.lastTs))} />
    </DetailsSection>
  );
}

export function Classics({ detail }: { detail?: string }) {
  const rows = useCrateRows();
  const span = spanYears(rows);
  const items = classics(rows, classicSort.value);
  const shown = items.slice(0, limit.value);
  const opened = items.find((item) => item.row.trackId === detail);
  const caption =
    `Played ${CLASSIC_MIN_PLAYS_PER_YEAR}+ times in ` +
    `${CLASSIC_MIN_YEARS}+ of your ${span.length} years · ` +
    plural(items.length, 'track');
  return (
    <>
      <SegmentedButtons
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
                selected={detail === item.row.trackId}
                badge1={
                  <Flag kind="top">
                    {item.yearsActive} of {span.length} years
                  </Flag>
                }
                badge2={
                  inNoPlaylist(item.row) ? (
                    <Flag kind="todo">not in a playlist</Flag>
                  ) : (
                    <Flag kind="plays">{plural(item.row.plays, 'play')}</Flag>
                  )
                }
              />
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
      <CrateSheet
        detail={detail}
        extra={opened && <ClassicExtra item={opened} span={span} />}
      />
    </>
  );
}
