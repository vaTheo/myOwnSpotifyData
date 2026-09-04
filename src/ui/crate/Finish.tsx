import { signal } from '@preact/signals';
import {
  FINISH_MIN_OUTCOMES,
  PAGE_SIZE,
  finishRate,
  rateBand,
  type FinishItem,
} from '../../model/crate';
import { Badge } from '../components/Badge';
import { Segmented } from '../components/Segmented';
import { plural } from '../format';
import { finishTab } from './selections';
import {
  CrateRow,
  Paged,
  PlaylistLinks,
  inNoPlaylist,
  useCrateRows,
} from './shared';

type Tab = 'finished' | 'skipped';

/** One row open at a time, keyed by track id. Reset when the tab changes. */
const expanded = signal<string | null>(null);
const limit = signal(PAGE_SIZE);

const TAB_OPTIONS: { value: Tab; label: string }[] = [
  { value: 'finished', label: 'Finished' },
  { value: 'skipped', label: 'Skipped' },
];

const CAPTION: Record<Tab, string> = {
  finished: 'Tracks you play to the end',
  skipped: 'You bail out of these',
};

/**
 * Both tabs show "<n>% finished", so the colour band is read off the integer
 * the row displays rather than off FinishItem.rate: the badge and the legend
 * can never disagree by a rounding step.
 */
function percentFinished(item: FinishItem): number {
  return Math.round(((item.row.finished ?? 0) / item.outcomes) * 100);
}

function rateKind(pct: number): 'plays' | 'skip' | undefined {
  const band = rateBand(pct / 100);
  if (band === 'high') return 'plays';
  if (band === 'low') return 'skip';
  return undefined;
}

export function Finish() {
  const rows = useCrateRows();
  const tab = finishTab.value;
  const items = finishRate(rows, tab);
  const shown = items.slice(0, limit.value);
  // Control, caption and legend render before the data check, so an empty
  // result still leaves the Segmented reachable (spec section 3).
  return (
    <>
      <Segmented
        options={TAB_OPTIONS}
        value={tab}
        onChange={(v) => {
          finishTab.value = v;
          expanded.value = null;
          limit.value = PAGE_SIZE;
        }}
      />
      <p class="caption">
        {CAPTION[tab]} · {FINISH_MIN_OUTCOMES}+ clear outcomes ·{' '}
        {plural(items.length, 'track')}
      </p>
      <p class="legend">65%+ green · under 35% red</p>
      {items.length === 0 ? (
        <p class="empty">
          No track has {FINISH_MIN_OUTCOMES} clear outcomes yet.
        </p>
      ) : (
        <>
          <ul class="list">
            {shown.map((item, i) => {
              const row = item.row;
              const pct = percentFinished(item);
              return (
                <CrateRow
                  key={row.trackId}
                  rank={i + 1}
                  row={row}
                  expanded={expanded.value === row.trackId}
                  onToggle={() => {
                    expanded.value =
                      expanded.value === row.trackId ? null : row.trackId;
                  }}
                  badge1={<Badge kind={rateKind(pct)}>{pct}% finished</Badge>}
                  badge2={
                    inNoPlaylist(row) ? (
                      <Badge kind="todo">not in a playlist</Badge>
                    ) : (
                      <Badge>
                        {(row.finished ?? 0).toLocaleString()} of{' '}
                        {item.outcomes.toLocaleString()}
                      </Badge>
                    )
                  }
                >
                  <p class="muted">
                    {plural(row.plays, 'play')} ·{' '}
                    {plural(row.attempts ?? 0, 'start')}
                  </p>
                  <p class="strip">
                    {(row.finished ?? 0).toLocaleString()} finished ·{' '}
                    {(row.skipped ?? 0).toLocaleString()} skipped ·{' '}
                    {item.unclear.toLocaleString()} unclear
                  </p>
                  <PlaylistLinks row={row} />
                </CrateRow>
              );
            })}
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
