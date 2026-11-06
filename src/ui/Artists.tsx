import { signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import type { ArtistAgg, Model } from '../model/aggregate';
import { normalize } from '../model/normalize';
import { artistPlays, hasHistory, reachFor } from '../model/reach';
import { artistReachSummary, model } from '../model/state';
import { routeHref } from '../router';
import { UnderRadar } from './UnderRadar';
import { artistView } from './artistSelections';
import { Empty } from './components/Empty';
import { Filter } from './components/Filter';
import { NoMatch } from './components/NoMatch';
import { SegmentedButtons } from './components/SegmentedButtons';
import { artistUrl } from './format';
import {
  countColumn,
  rankColumn,
  spotifyLinkColumn,
  titleColumn,
} from './table/columns';
import { DataTable, type Column } from './table/DataTable';
import type { SortState } from './table/sort';

const filter = signal('');
const sort = signal<SortState>({ columnId: null, direction: 'asc' });

/** One artist of the Saved tracks table; a null figure is shown as `NoData`. */
export interface SavedArtistRow {
  agg: ArtistAgg;
  rank: number;
  plays: number | null;
  listeners: number | null;
  fans: number | null;
}

let rowsModel: Model | null = null;
let rowsReach = false;
let rowsCache: SavedArtistRow[] = [];

/**
 * Today's ranking (`model.artists`), with plays once a history is imported
 * and the reach figures once a lookup ran (the Under the radar gate).
 * Memoised on the model and the gate, so a keystroke in the filter costs no
 * recount.
 */
function savedRows(m: Model, reach: boolean): SavedArtistRow[] {
  if (rowsModel === m && rowsReach === reach) return rowsCache;
  const history = hasHistory(m);
  rowsCache = m.artists.map((agg, i) => {
    const r = reach && agg.id !== null ? reachFor(m, agg.id) : null;
    return {
      agg,
      rank: i + 1,
      plays: history ? artistPlays(m, agg) : null,
      listeners: r?.listenbrainz?.value ?? null,
      fans: r?.deezer?.value ?? null,
    };
  });
  rowsModel = m;
  rowsReach = reach;
  return rowsCache;
}

/**
 * # · name · tracks · playlists · plays (with a history) · listeners · fans
 * (once reach data exists) · link (spec 003 §9). A phone's item reads
 * "N tracks · N playlists".
 */
function savedColumns(
  history: boolean,
  reach: boolean
): Column<SavedArtistRow>[] {
  return [
    rankColumn(),
    titleColumn((r) => r.agg.name, {
      header: 'Name',
      hrefOf: (r) => routeHref({ name: 'artist', key: r.agg.key }),
    }),
    countColumn('tracks', 'Tracks', (r) => r.agg.trackKeys.size, {
      unit: ['track', 'tracks'],
    }),
    countColumn(
      'playlists',
      'Playlists',
      (r) => r.agg.playlistIds.size,
      { unit: ['playlist', 'playlists'] },
      { priority: 2 }
    ),
    ...(history
      ? [
          countColumn(
            'plays',
            'Plays',
            (r: SavedArtistRow) => r.plays,
            {},
            {
              compact: 'hidden',
            }
          ),
        ]
      : []),
    ...(reach
      ? [
          countColumn(
            'listeners',
            'Listeners',
            (r: SavedArtistRow) => r.listeners,
            {},
            {
              priority: 2,
              compact: 'hidden',
            }
          ),
          countColumn(
            'fans',
            'Fans',
            (r: SavedArtistRow) => r.fans,
            {},
            {
              priority: 2,
              compact: 'hidden',
            }
          ),
        ]
      : []),
    spotifyLinkColumn((r) => artistUrl(r.agg.id)),
  ];
}

/** Today's ranking and filter, as a table. */
function SavedTracks(p: { switcher: ComponentChildren }) {
  const m = model.value;
  if (!m || m.artists.length === 0) {
    return (
      <>
        <div class="toolbar">{p.switcher}</div>
        <Empty what="artists" />
      </>
    );
  }
  const reach = artistReachSummary.value?.version === 1;
  const rows = savedRows(m, reach);
  const query = normalize(filter.value);
  // Rank comes from the full list, so filtering never renumbers the rows.
  const list = query
    ? rows.filter((r) => normalize(r.agg.name).includes(query))
    : rows;
  return (
    <>
      <div class="toolbar">
        {p.switcher}
        <Filter
          value={filter.value}
          onInput={(v) => {
            filter.value = v;
          }}
          placeholder="Filter artists"
        />
      </div>
      {list.length === 0 ? (
        <NoMatch
          query={filter.value}
          onClear={() => {
            filter.value = '';
          }}
        />
      ) : (
        <DataTable
          label="Artists by saved tracks"
          noun="artist"
          columns={savedColumns(hasHistory(m), reach)}
          rows={list}
          rowKey={(r) => r.agg.key}
          rankOf={(r) => r.rank}
          sort={sort.value}
          onSort={(s) => {
            sort.value = s;
          }}
          resetKey={query}
          onOpen={(r) => {
            location.hash = routeHref({ name: 'artist', key: r.agg.key });
          }}
        />
      )}
    </>
  );
}

/**
 * The dispatcher (spec §5.1). The view switcher renders whatever the library
 * holds, so an empty one keeps the switcher instead of taking it down with
 * the list. The Playlists · Artists tabs are the frame's.
 */
export function Artists() {
  const switcher = (
    <SegmentedButtons
      options={[
        { value: 'saved', label: 'Saved tracks' },
        { value: 'radar', label: 'Under the radar' },
      ]}
      value={artistView.value}
      onChange={(v) => {
        artistView.value = v;
      }}
    />
  );
  return (
    <section>
      {artistView.value === 'saved' ? (
        <SavedTracks switcher={switcher} />
      ) : (
        <UnderRadar switcher={switcher} />
      )}
    </section>
  );
}
