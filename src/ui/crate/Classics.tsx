import { useMemo } from 'preact/hooks';
import { signal } from '@preact/signals';
import { lang, msg } from '../../i18n';
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
import { formatDate } from '../format';
import { CRATE_TITLE } from '../layout/titles';
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
  historyRange,
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
    <DetailsSection title={CRATE_TITLE.classics}>
      <p class="details-note">
        {msg().crate.classics.playsLast(row.plays, formatDate(row.lastTs))}
      </p>
      <MonthBars
        title={msg().crate.common.playsPerYear}
        series={yearPoints(row.months, p.span)}
      />
      <OpenMonthLink month={monthKey(new Date(row.lastTs))} />
    </DetailsSection>
  );
}

export function Classics({ detail }: { detail?: string }) {
  const rows = useCrateRows();
  const span = useMemo(() => spanYears(rows), [rows, historyRange()]);
  const items = useMemo(
    () => classics(rows, classicSort.value),
    [rows, classicSort.value]
  );
  const opened = items.find((item) => item.row.trackId === detail);
  const text = msg().crate;
  const caption =
    text.classics.caption(
      CLASSIC_MIN_PLAYS_PER_YEAR,
      CLASSIC_MIN_YEARS,
      span.length
    ) +
    ' · ' +
    msg().n.track(items.length);
  // Kept while its inputs stay, so the table's memos hold (S13 A5);
  // the model comes in by its rows.
  const columns = useMemo(
    () =>
      crateColumns<ClassicItem>({
        metrics: [
          {
            id: 'years',
            header: text.classics.yearsPlayed,
            align: 'end',
            priority: 1,
            width: '128px',
            sortValue: (item) => item.yearsActive,
            firstDirection: 'desc',
            cell: (item) => (
              <span>
                {text.classics.yearsOf(item.yearsActive, span.length)}
                <span class="dt-unit">{text.classics.unitYears}</span>
              </span>
            ),
            compact: 'meta',
          },
          countColumn(
            'plays',
            text.common.plays,
            (item) => item.row.plays,
            {},
            { priority: 3, width: '96px', compact: 'hidden' }
          ),
        ],
        chart: chartColumn(
          text.classics.perYear,
          text.common.playsPerYear,
          (item) => yearPoints(item.row.months, span),
          span.length
        ),
        flag: (item) =>
          inNoPlaylist(item.row) ? (
            <Flag kind="todo">{msg().crate.common.notInPlaylist}</Flag>
          ) : null,
      }),
    [rows, span, lang.value]
  );
  return (
    <>
      <div class="toolbar">
        <SegmentedButtons
          options={[
            { value: 'years', label: text.classics.mostYears },
            { value: 'plays', label: text.classics.mostPlays },
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
          {text.classics.empty(CLASSIC_MIN_YEARS, span.length)}
        </p>
      ) : (
        <CrateTable
          label={
            classicSort.value === 'years'
              ? text.classics.tableYears
              : text.classics.tablePlays
          }
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
