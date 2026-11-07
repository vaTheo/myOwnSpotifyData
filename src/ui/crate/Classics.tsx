import { signal } from '@preact/signals';
import {
  CLASSIC_MIN_PLAYS_PER_YEAR,
  CLASSIC_MIN_YEARS,
  classics,
  monthKey,
  type ClassicItem,
} from '../../model/crate';
import { MonthBars } from '../charts/MonthBars';
import { yearPoints } from '../charts/series';
import { Flag } from '../components/Flag';
import { SegmentedButtons } from '../components/SegmentedButtons';
import { DetailsSection } from '../details/TrackDetails';
import { formatDate, plural } from '../format';
import { countColumn } from '../table/columns';
import { classicSort } from './selections';
import {
  CrateSheet,
  CrateTable,
  DEFAULT_SORT,
  OpenMonthLink,
  chartColumn,
  crateColumns,
  inNoPlaylist,
  spanYears,
  useCrateRows,
} from './shared';
import { EMPTY_FILTER } from '../filters/trackFilter';

const sort = signal(DEFAULT_SORT);
const filter = signal(EMPTY_FILTER);

/** The view's figures for the opened track: plays per year, the last play. */
function ClassicExtra(p: { item: ClassicItem; span: number[] }) {
  const row = p.item.row;
  return (
    <DetailsSection title="All-time classics">
      <p class="details-note">
        {plural(row.plays, 'play')} · last {formatDate(row.lastTs)}
      </p>
      <MonthBars
        title="Plays per year"
        series={yearPoints(row.months, p.span)}
      />
      <OpenMonthLink month={monthKey(new Date(row.lastTs))} />
    </DetailsSection>
  );
}

export function Classics({ detail }: { detail?: string }) {
  const rows = useCrateRows();
  const span = spanYears(rows);
  const items = classics(rows, classicSort.value);
  const opened = items.find((item) => item.row.trackId === detail);
  const caption =
    `Played ${CLASSIC_MIN_PLAYS_PER_YEAR}+ times in ` +
    `${CLASSIC_MIN_YEARS}+ of your ${span.length} years · ` +
    plural(items.length, 'track');
  const columns = crateColumns<ClassicItem>({
    metrics: [
      {
        id: 'years',
        header: 'Years played',
        align: 'end',
        priority: 1,
        width: '128px',
        sortValue: (item) => item.yearsActive,
        firstDirection: 'desc',
        cell: (item) => (
          <span>
            {item.yearsActive} of {span.length}
            <span class="dt-unit">years</span>
          </span>
        ),
        compact: 'meta',
      },
      countColumn(
        'plays',
        'Plays',
        (item) => item.row.plays,
        {},
        { priority: 3, width: '96px', compact: 'hidden' }
      ),
    ],
    chart: chartColumn(
      'Per year',
      'Plays per year',
      (item) => yearPoints(item.row.months, span),
      span.length
    ),
    flag: (item) =>
      inNoPlaylist(item.row) ? (
        <Flag kind="todo">not in a playlist</Flag>
      ) : null,
  });
  return (
    <>
      <div class="toolbar">
        <SegmentedButtons
          options={[
            { value: 'years', label: 'Most years' },
            { value: 'plays', label: 'Most plays' },
          ]}
          value={classicSort.value}
          onChange={(v) => {
            classicSort.value = v;
          }}
        />
      </div>
      <p class="caption">{caption}</p>
      {items.length === 0 ? (
        <p class="empty">
          No track reaches {CLASSIC_MIN_YEARS} years yet. Your history covers{' '}
          {plural(span.length, 'year')}.
        </p>
      ) : (
        <CrateTable
          label={`All-time classics, ${classicSort.value === 'years' ? 'most years' : 'most plays'}`}
          items={items}
          columns={columns}
          sort={sort}
          filter={filter}
          resetKey={classicSort.value}
          detail={detail}
        />
      )}
      <CrateSheet
        detail={detail}
        extra={opened && <ClassicExtra item={opened} span={span} />}
      />
    </>
  );
}
