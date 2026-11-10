import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { normalize } from '../model/normalize';
import {
  hasHistory,
  rankUnderTheRadar,
  type ReachGroup,
  type ReachSort,
  type UnderRadarRow,
} from '../model/reach';
import { artistReachSummary, model, reachCoverage } from '../model/state';
import { routeHref } from '../router';
import { radarFilter, radarSort } from './artistSelections';
import { Button } from './components/Button';
import { Card } from './components/Card';
import { Empty } from './components/Empty';
import { Filter } from './components/Filter';
import { NoMatch } from './components/NoMatch';
import { SegmentedButtons } from './components/SegmentedButtons';
import { artistUrl, formatDate, plural, profileLine } from './format';
import { windowClass } from './layout/windowClass';
import {
  countColumn,
  rankColumn,
  spotifyLinkColumn,
  titleColumn,
} from './table/columns';
import { DataTable, type Column } from './table/DataTable';
import type { TableLayout } from './table/layout';
import { lastCall } from './table/lastCall';
import type { SortState } from './table/sort';

/**
 * `radar` never carries a heading: it is the view. The other two always carry
 * theirs when they hold a row, so a list of nothing but unresolved artists
 * cannot read as if absence were the answer (spec §5.3). They are headings,
 * never filters, in the `radar`, `unknown`, `known` order the ranking gives.
 */
function groupHeading(group: string): ComponentChildren {
  if (group === 'unknown') {
    return (
      <>
        <span class="dt-group-title">No reach data</span>
        <span class="dt-group-note">
          Not resolved yet ·{' '}
          <a href={routeHref({ name: 'settings', item: 'reach' })}>
            Look up artists ›
          </a>
        </span>
      </>
    );
  }
  // The credit rides with the heading, so it shows exactly when Well known
  // rows (and their Wikipedia figures) are on screen, paging included.
  if (group === 'known') {
    return (
      <>
        <span class="dt-group-title">Well known</span>
        <span class="dt-group-note">Wikipedia figures CC BY-SA 4.0</span>
      </>
    );
  }
  return null;
}

/** The column a sort is read from; without a history, Most played is by tracks. */
function sortColumn(sort: ReachSort, history: boolean): string {
  if (sort === 'plays') return history ? 'plays' : 'tracks';
  return sort;
}

/**
 * # · name · tracks · playlists · plays (with a history) · listeners · fans ·
 * Wikipedia (Well known rows only) · link (spec 003 §9). Only the Plays,
 * Listeners and Fans headers sort, and they set the ranking's own sort; the
 * other columns do not sort. Listeners and fans are two columns, never
 * summed, and a missing number is `NoData`, never 0.
 */
function radarColumns(history: boolean): Column<UnderRadarRow>[] {
  // The table is presorted: these headers report a click, the ranking sorts.
  const sortable = { sortable: true, sortValue: undefined };
  const fixed = { sortValue: undefined };
  return [
    rankColumn({ rank: false }),
    titleColumn(
      (r) => r.agg.name,
      {
        header: 'Name',
        hrefOf: (r) => routeHref({ name: 'artist', key: r.agg.key }),
      },
      fixed
    ),
    countColumn(
      'tracks',
      'Tracks',
      (r) => r.tracks,
      { unit: ['track', 'tracks'] },
      // Without a history, "Most played" ranks by tracks: this header sets it.
      { priority: 2, compact: 'hidden', ...(history ? fixed : sortable) }
    ),
    countColumn(
      'playlists',
      'Playlists',
      (r) => r.playlists,
      { unit: ['playlist', 'playlists'] },
      { priority: 3, compact: 'hidden', ...fixed }
    ),
    ...(history
      ? [
          countColumn(
            'plays',
            'Plays',
            (r: UnderRadarRow) => r.plays,
            {},
            { compact: 'hidden', ...sortable }
          ),
        ]
      : []),
    countColumn(
      'listeners',
      'Listeners',
      (r) => r.listeners,
      { unit: ['listener', 'listeners'] },
      { firstDirection: 'asc', ...sortable }
    ),
    countColumn(
      'fans',
      'Fans',
      (r) => r.fans,
      { unit: ['fan', 'fans'] },
      { firstDirection: 'asc', ...sortable }
    ),
    {
      id: 'wikipedia',
      header: 'Wikipedia',
      priority: 3,
      width: 'minmax(0, 1.2fr)',
      // profileLine is null below one sitelink, which is exactly the `known`
      // group's own rule, so the line shows on Well known rows and nowhere
      // else.
      cell: (r) => {
        const line = profileLine(r.sitelinks, r.views);
        return line ? <span class="dt-text radar-wiki">{line}</span> : null;
      },
      title: (r) => profileLine(r.sitelinks, r.views) ?? undefined,
      // On a phone the figures take their own line under listeners and fans.
      compact: 'meta',
    },
    spotifyLinkColumn((r) => artistUrl(r.artistId)),
  ];
}

/* Kept while their inputs stay, so the table's memos hold (S13 A5). */
const radarColumnsOf = lastCall(radarColumns);
const filterRows = lastCall(
  (rows: UnderRadarRow[], query: string): UnderRadarRow[] =>
    query ? rows.filter((r) => normalize(r.agg.name).includes(query)) : rows
);
const rankOfRow = (r: UnderRadarRow): number => r.rank;
const keyOfRow = (r: UnderRadarRow): string => r.agg.key;
const groupOfRow = (r: UnderRadarRow) => r.group;

const SORT_OF_COLUMN: Record<string, ReachSort> = {
  plays: 'plays',
  tracks: 'plays',
  listeners: 'listeners',
  fans: 'fans',
};

/**
 * Spec §5.2: a card, not the `Empty` component, because the copy needs a
 * heading and a button — the same shape as `CrateEmpty`.
 */
function NoRun() {
  return (
    <Card title="No reach data yet">
      <p>
        Under the radar shows the artists in your playlists with the smallest
        audiences on ListenBrainz and Deezer, and moves the ones with a
        Wikipedia article to the bottom. It needs one lookup first: roughly 45
        to 50 minutes for 1,000 artists, and you can stop it and come back.
      </p>
      <Button
        variant="filled"
        onClick={() => {
          location.hash = routeHref({ name: 'settings', item: 'reach' });
        }}
      >
        Look up artists
      </Button>
    </Card>
  );
}

export function UnderRadar(p: { switcher: ComponentChildren }) {
  // Two-line items draw no sort headers: the sort control shows then.
  const [layout, setLayout] = useState<TableLayout | null>(null);
  const m = model.value;
  if (!m || m.artists.length === 0) {
    return (
      <>
        <div class="toolbar">{p.switcher}</div>
        <Empty what="artists" />
      </>
    );
  }
  const summary = artistReachSummary.value;
  // The one gate, per spec §2: the summary record, never sniffing rows.
  if (summary?.version !== 1) {
    return (
      <>
        <div class="toolbar">{p.switcher}</div>
        <NoRun />
      </>
    );
  }
  // Memoised on the model identity and the sort, so a keystroke in the filter
  // below costs one `includes` per row and no re-sort. The array it returns
  // is the memo's own and is never sorted or mutated here; `filter` copies.
  const rows = rankUnderTheRadar(m, radarSort.value);
  const query = normalize(radarFilter.value);
  // Ranks were assigned over the unfiltered list, so nothing renumbers, and a
  // heading whose rows have all been filtered out is not rendered.
  const shown = filterRows(rows, query);
  const cov = reachCoverage(m);
  const history = hasHistory(m);
  const count = (group: ReachGroup) =>
    shown.filter((r) => r.group === group).length;
  const sort: SortState = {
    columnId: sortColumn(radarSort.value, history),
    direction: radarSort.value === 'plays' ? 'desc' : 'asc',
  };
  return (
    <>
      <div class="toolbar">
        {p.switcher}
        {/* Headers sort where they are drawn; a phone, or a table too
            narrow for its names (two-line items), keeps the control. */}
        {(windowClass.value === 'compact' || layout?.twoLine) && (
          <SegmentedButtons
            scroll
            options={[
              { value: 'plays', label: 'Most played' },
              { value: 'listeners', label: 'Fewest listeners' },
              { value: 'fans', label: 'Fewest fans' },
            ]}
            value={radarSort.value}
            onChange={(v) => {
              radarSort.value = v;
            }}
          />
        )}
        <Filter
          value={radarFilter.value}
          onInput={(v) => {
            radarFilter.value = v;
          }}
          placeholder="Filter artists"
        />
      </div>
      <p class="caption">
        {cov.covered.toLocaleString()} of {plural(cov.artists, 'artist')} have
        reach data · as of {formatDate(summary.ranAt)}
      </p>
      {shown.length === 0 ? (
        query ? (
          <NoMatch
            query={radarFilter.value}
            onClear={() => {
              radarFilter.value = '';
            }}
          />
        ) : (
          // Every artist in the library is known by name only: none of them
          // has the Spotify id every source here is keyed on.
          <Empty what="artists" />
        )
      ) : (
        <>
          {count('radar') === 0 && !query && (
            <p class="muted">No under-the-radar artists yet.</p>
          )}
          <DataTable
            label="Under the radar"
            noun="artist"
            columns={radarColumnsOf(history)}
            rows={shown}
            rowKey={keyOfRow}
            rankOf={rankOfRow}
            presorted
            sort={sort}
            onSort={(s) => {
              const next = s.columnId ? SORT_OF_COLUMN[s.columnId] : undefined;
              if (next) radarSort.value = next;
            }}
            groupOf={groupOfRow}
            groupHeading={groupHeading}
            resetKey={`${radarSort.value} ${query}`}
            onLayout={setLayout}
            onOpen={(r) => {
              location.hash = routeHref({ name: 'artist', key: r.agg.key });
            }}
          />
        </>
      )}
    </>
  );
}
