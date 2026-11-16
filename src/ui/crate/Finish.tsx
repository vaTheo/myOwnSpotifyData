import { useMemo } from 'preact/hooks';
import { signal } from '@preact/signals';
import { lang, msg } from '../../i18n';
import {
  FINISH_MIN_OUTCOMES,
  finishRate,
  type FinishItem,
} from '../../model/crate';
import { Meter } from '../charts/Meter';
import { Flag } from '../components/Flag';
import { SegmentedButtons } from '../components/SegmentedButtons';
import { DetailsSection } from '../details/TrackDetails';
import { CRATE_TITLE } from '../layout/titles';
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

function tabOptions(): { value: Tab; label: string }[] {
  const text = msg().crate.finish;
  return [
    { value: 'finished', label: text.finished },
    { value: 'skipped', label: text.skipped },
  ];
}

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
    <DetailsSection title={CRATE_TITLE.finish}>
      <Meter pct={percentFinished(item)} />
      <p class="details-note">
        {msg().crate.finish.note(
          percentFinished(item),
          item.row.finished ?? 0,
          item.outcomes
        )}
      </p>
    </DetailsSection>
  );
}

/** The two band swatches and their words (spec 003, screens.md §6). */
function Legend() {
  const text = msg().crate.finish;
  return (
    <p class="legend">
      <span class="legend-item">
        <span class="swatch swatch-high" aria-hidden="true" />
        {text.legendHigh}
      </span>{' '}
      ·{' '}
      <span class="legend-item">
        <span class="swatch swatch-low" aria-hidden="true" />
        {text.legendLow}
      </span>
    </p>
  );
}

export function Finish({ detail }: { detail?: string }) {
  const rows = useCrateRows();
  const tab = finishTab.value;
  const items = useMemo(() => finishRate(rows, tab), [rows, tab]);
  const opened = items.find((item) => item.row.trackId === detail);
  const text = msg().crate;
  // Kept while its inputs stay, so the table's memos hold (S13 A5);
  // the model comes in by its rows.
  const columns = useMemo(
    () =>
      crateColumns<FinishItem>({
        metrics: [
          {
            id: 'rate',
            header: text.finish.pctFinished,
            priority: 1,
            // Narrower figures leave the Artist column readable at 1440
            // (re-review N2).
            width: '136px',
            sortValue: percentFinished,
            firstDirection: 'desc',
            cell: (item) => <Meter pct={percentFinished(item)} />,
            compact: 'meta',
          },
          {
            id: 'finished',
            header: text.finish.finished,
            align: 'end',
            priority: 2,
            width: '96px',
            sortValue: (item) => item.row.finished ?? 0,
            firstDirection: 'desc',
            cell: (item) => (
              <span>
                {text.finish.ofCount(item.row.finished ?? 0, item.outcomes)}
              </span>
            ),
            compact: 'hidden',
          },
          countColumn(
            'skipped',
            text.finish.skipped,
            (item) => item.row.skipped ?? null,
            {},
            { priority: 3, width: '88px', compact: 'hidden' }
          ),
          countColumn(
            'unclear',
            text.finish.unclear,
            (item) => item.unclear,
            {},
            {
              priority: 3,
              width: '88px',
              compact: 'hidden',
            }
          ),
        ],
        flag: (item) =>
          inNoPlaylist(item.row) ? (
            <Flag kind="todo">{msg().crate.common.notInPlaylist}</Flag>
          ) : null,
      }),
    [rows, lang.value]
  );
  // Control, caption and legend render before the data check, so an empty
  // result still leaves the control reachable (spec section 3).
  return (
    <>
      <div class="toolbar">
        <SegmentedButtons
          options={tabOptions()}
          value={tab}
          onChange={(v) => {
            finishTab.value = v;
          }}
        />
      </div>
      <p class="caption">
        {[
          tab === 'finished'
            ? text.finish.captionFinished
            : text.finish.captionSkipped,
          text.finish.clearPlus(FINISH_MIN_OUTCOMES),
          msg().n.track(items.length),
        ].join(' · ')}
      </p>
      <Legend />
      {items.length === 0 ? (
        <p class="empty">{text.finish.empty(FINISH_MIN_OUTCOMES)}</p>
      ) : (
        <CrateTable
          label={
            tab === 'finished'
              ? text.finish.tableFinished
              : text.finish.tableSkipped
          }
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
