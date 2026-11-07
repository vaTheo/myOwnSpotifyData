import { useMemo } from 'preact/hooks';
import { signal } from '@preact/signals';
import {
  FINISH_MIN_OUTCOMES,
  finishRate,
  type FinishItem,
} from '../../model/crate';
import { Meter } from '../charts/Meter';
import { Flag } from '../components/Flag';
import { SegmentedButtons } from '../components/SegmentedButtons';
import { DetailsSection } from '../details/TrackDetails';
import { plural } from '../format';
import { countColumn } from '../table/columns';
import { finishTab } from './selections';
import {
  CrateSheet,
  CrateTable,
  DEFAULT_SORT,
  crateColumns,
  inNoPlaylist,
  useCrateRows,
} from './shared';
import { EMPTY_FILTER } from '../filters/trackFilter';

type Tab = 'finished' | 'skipped';

const sort = signal(DEFAULT_SORT);
const filter = signal(EMPTY_FILTER);

const TAB_OPTIONS: { value: Tab; label: string }[] = [
  { value: 'finished', label: 'Finished' },
  { value: 'skipped', label: 'Skipped' },
];

const CAPTION: Record<Tab, string> = {
  finished: 'Tracks you play to the end',
  skipped: 'You bail out of these',
};

/**
 * Both tabs show "<n>% finished", so the meter's band is read off the
 * integer it displays rather than off FinishItem.rate: the meter and the
 * legend can never disagree by a rounding step.
 */
function percentFinished(item: FinishItem): number {
  return Math.round(((item.row.finished ?? 0) / item.outcomes) * 100);
}

/** The view's figures for the opened track: the rate and its outcomes. */
function FinishExtra({ item }: { item: FinishItem }) {
  return (
    <DetailsSection title="Finish rate">
      <Meter pct={percentFinished(item)} />
      <p class="details-note">
        {percentFinished(item)}% finished ·{' '}
        {(item.row.finished ?? 0).toLocaleString()} of{' '}
        {plural(item.outcomes, 'clear outcome')}
      </p>
    </DetailsSection>
  );
}

/** The two band swatches and their words (spec 003, screens.md §6). */
function Legend() {
  return (
    <p class="legend">
      <span class="legend-item">
        <span class="swatch swatch-high" aria-hidden="true" />
        65%+ green
      </span>{' '}
      ·{' '}
      <span class="legend-item">
        <span class="swatch swatch-low" aria-hidden="true" />
        under 35% red
      </span>
    </p>
  );
}

export function Finish({ detail }: { detail?: string }) {
  const rows = useCrateRows();
  const tab = finishTab.value;
  const items = useMemo(() => finishRate(rows, tab), [rows, tab]);
  const opened = items.find((item) => item.row.trackId === detail);
  // Kept while its inputs stay, so the table's memos hold (S13 A5);
  // the model comes in by its rows.
  const columns = useMemo(
    () =>
      crateColumns<FinishItem>({
        metrics: [
          {
            id: 'rate',
            header: '% finished',
            priority: 1,
            width: '160px',
            sortValue: percentFinished,
            firstDirection: 'desc',
            cell: (item) => <Meter pct={percentFinished(item)} />,
            compact: 'meta',
          },
          {
            id: 'finished',
            header: 'Finished',
            align: 'end',
            priority: 2,
            width: '112px',
            sortValue: (item) => item.row.finished ?? 0,
            firstDirection: 'desc',
            cell: (item) => (
              <span>
                {(item.row.finished ?? 0).toLocaleString()} of{' '}
                {item.outcomes.toLocaleString()}
              </span>
            ),
            compact: 'hidden',
          },
          countColumn(
            'skipped',
            'Skipped',
            (item) => item.row.skipped ?? null,
            {},
            { priority: 3, width: '96px', compact: 'hidden' }
          ),
          countColumn(
            'unclear',
            'Unclear',
            (item) => item.unclear,
            {},
            {
              priority: 3,
              width: '96px',
              compact: 'hidden',
            }
          ),
        ],
        flag: (item) =>
          inNoPlaylist(item.row) ? (
            <Flag kind="todo">not in a playlist</Flag>
          ) : null,
      }),
    [rows]
  );
  // Control, caption and legend render before the data check, so an empty
  // result still leaves the control reachable (spec section 3).
  return (
    <>
      <div class="toolbar">
        <SegmentedButtons
          options={TAB_OPTIONS}
          value={tab}
          onChange={(v) => {
            finishTab.value = v;
          }}
        />
      </div>
      <p class="caption">
        {CAPTION[tab]} · {FINISH_MIN_OUTCOMES}+ clear outcomes ·{' '}
        {plural(items.length, 'track')}
      </p>
      <Legend />
      {items.length === 0 ? (
        <p class="empty">
          No track has {FINISH_MIN_OUTCOMES} clear outcomes yet.
        </p>
      ) : (
        <CrateTable
          label={`Finish rate, ${tab}`}
          items={items}
          columns={columns}
          sort={sort}
          filter={filter}
          resetKey={tab}
          detail={detail}
        />
      )}
      <CrateSheet
        detail={detail}
        extra={opened && <FinishExtra item={opened} />}
      />
    </>
  );
}
