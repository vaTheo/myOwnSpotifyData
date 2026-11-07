import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import {
  artistReachSummary,
  crateStatus,
  historySummary,
  lastSyncAt,
  loadSavedMixes,
  mixError,
  mixJobs,
  model,
  rekordboxSummary,
  savedMixes,
  serverLastSyncAt,
  serverState,
  spotifyLockedUntil,
  syncState,
} from '../../model/state';
import { MonthBars } from '../charts/MonthBars';
import { seriesLabel } from '../charts/series';
import { Card } from '../components/Card';
import { FeaturePills } from '../components/FeaturePills';
import { Flag } from '../components/Flag';
import { NoData } from '../components/NoData';
import { StatusLine } from '../components/StatusLine';
import { rotationMonths } from '../crate/selections';
import { CHIP_FLAG } from '../mix/MixListPane';
import {
  overviewBlocks,
  type OverviewBlock,
  type OverviewItem,
} from './blocks';

/**
 * Whether the saved mixes have been read once this session. Until then the
 * last-saved-mix card says it is reading; afterwards it shows what
 * `savedMixes` holds while a later visit reads them again.
 */
const mixesRead = signal(false);

/** After the first paint: when the browser is idle, else on the next task. */
function afterPaint(run: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(run, { timeout: 500 });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(run, 0);
  return () => clearTimeout(id);
}

/**
 * One item: the whole row is the link to the track's details over its
 * screen, a 48 px target; the title and artists are cut with an ellipsis
 * and said in full on hover.
 */
function Item(p: {
  item: OverviewItem;
  chart: boolean;
  chip?: OverviewBlock['chip'];
}) {
  const { item } = p;
  const body = (
    <>
      <span class="ov-item-text">
        <span class="ov-item-title" title={item.title}>
          {item.title}
        </span>
        {item.subtitle && (
          <span class="ov-item-subtitle" title={item.subtitle}>
            {item.subtitle}
          </span>
        )}
      </span>
      {p.chart && item.series && (
        <span class="ov-item-chart">
          <MonthBars compact series={item.series} />
          <span class="visually-hidden">
            {seriesLabel('Plays per month', item.series)}
          </span>
        </span>
      )}
      {item.trackId && !p.chart && (
        <span class="ov-item-pills">
          <FeaturePills trackId={item.trackId} />
        </span>
      )}
      {p.chip && <Flag kind={CHIP_FLAG[p.chip.kind]}>{p.chip.text}</Flag>}
      {item.value !== undefined && (
        <span class="ov-item-value">{item.value ?? <NoData />}</span>
      )}
    </>
  );
  return (
    <li>
      {item.href ? (
        <a class="ov-item" href={item.href}>
          {body}
        </a>
      ) : (
        <span class="ov-item">{body}</span>
      )}
    </li>
  );
}

/**
 * One block as a card: its title links to its screen; its figures, its
 * items, then its state lines; an empty or gated block says why and offers
 * the one action that fixes it.
 */
function BlockCard({ block }: { block: OverviewBlock }) {
  // The last saved mix leads with its title and chip, then its date.
  const mixFirst = block.id === 'mix';
  const list = block.items && block.items.length > 0 && (
    <ol class="ov-items">
      {block.items.map((item, i) => (
        <Item
          key={item.trackId ?? i}
          item={item}
          chart={block.id === 'rotation'}
          chip={block.chip}
        />
      ))}
    </ol>
  );
  return (
    <Card
      class={`ov-card ov-${block.id}`}
      title={
        <a class="ov-link" href={block.link}>
          <span>{block.title}</span>
          <span aria-hidden="true">›</span>
        </a>
      }
    >
      {mixFirst && list}
      {block.figures.length > 0 && (
        <dl class="ov-figures">
          {block.figures.map((f) => (
            <div key={f.label} class="ov-figure">
              <dt>{f.label}</dt>
              <dd>{f.value ?? <NoData />}</dd>
            </div>
          ))}
        </dl>
      )}
      {!mixFirst && list}
      {block.caption && <p class="ov-caption">{block.caption}</p>}
      {block.note && <StatusLine>{block.note}</StatusLine>}
      {block.reason && (
        <StatusLine kind={block.state === 'gated' ? 'warning' : 'info'}>
          {block.reason}
        </StatusLine>
      )}
      {block.warning && <StatusLine kind="warning">{block.warning}</StatusLine>}
      {block.error && <StatusLine kind="error">{block.error}</StatusLine>}
      {block.action && (
        <div class="ov-actions">
          <a class="btn btn-tonal" href={block.action.href}>
            <span>{block.action.label}</span>
          </a>
        </div>
      )}
    </Card>
  );
}

/**
 * The Overview, the home (spec 003, US8, contracts/screens.md §3): a feed
 * of cards, one column on phones, two on medium and expanded windows, three
 * on large ones. It renders from what the signals already hold, read from
 * IndexedDB at boot; nothing here reads Spotify (Principle II). The saved
 * mixes are read after the first paint (research D14).
 */
export function Overview() {
  useEffect(
    () =>
      afterPaint(() => {
        void loadSavedMixes().then(() => {
          mixesRead.value = true;
        });
      }),
    []
  );
  const blocks = overviewBlocks({
    model: model.value,
    historySummary: historySummary.value,
    crateStatus: crateStatus.value,
    rotationMonths: rotationMonths.value,
    syncState: syncState.value,
    lastSyncAt: lastSyncAt.value,
    // Re-renders when the shared lock lapses (its timer clears the signal).
    quotaLockUntil: spotifyLockedUntil(),
    rekordboxSummary: rekordboxSummary.value,
    artistReachSummary: artistReachSummary.value,
    serverState: serverState.value,
    serverLastSyncAt: serverLastSyncAt.value,
    mixes: mixesRead.value ? savedMixes.value : null,
    mixJobs: mixJobs.value,
    mixError: mixError.value,
    now: new Date(),
  });
  return (
    <section class="overview" aria-label="Overview">
      {blocks
        .filter((b) => b.state !== 'hidden')
        .map((b) => (
          <BlockCard key={b.id} block={b} />
        ))}
    </section>
  );
}
