import { signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { useMemo } from 'preact/hooks';
import type { ArtistAgg, Model } from '../model/aggregate';
import { normalize } from '../model/normalize';
import {
  artistPlays,
  hasHistory,
  rankUnderTheRadar,
  reachFor,
} from '../model/reach';
import { artistReachSummary, model } from '../model/state';
import { routeHref } from '../router';
import { Artist } from './Artist';
import { UnderRadar } from './UnderRadar';
import { artistFilter, artistView, radarSort } from './artistSelections';
import { Empty } from './components/Empty';
import { Filter } from './components/Filter';
import { NoMatch } from './components/NoMatch';
import { SegmentedButtons } from './components/SegmentedButtons';
import { artistUrl, plural } from './format';
import { ListDetail, ListPane } from './layout/ListDetail';
import {
  countColumn,
  rankColumn,
  spotifyLinkColumn,
  titleColumn,
} from './table/columns';
import { DataTable, type Column } from './table/DataTable';
import { lastCall } from './table/lastCall';
import type { SortState } from './table/sort';

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

/* Kept while their inputs stay, so the table's memos hold (S13 A5). */
const savedColumnsOf = lastCall(savedColumns);
const filterRows = lastCall(
  (rows: SavedArtistRow[], query: string): SavedArtistRow[] =>
    query ? rows.filter((r) => normalize(r.agg.name).includes(query)) : rows
);
const rankOfRow = (r: SavedArtistRow): number => r.rank;
const keyOfRow = (r: SavedArtistRow): string => r.agg.key;

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
  const query = normalize(artistFilter.value);
  // Rank comes from the full list, so filtering never renumbers the rows.
  const list = filterRows(rows, query);
  return (
    <>
      <div class="toolbar">
        {p.switcher}
        <Filter
          value={artistFilter.value}
          onInput={(v) => {
            artistFilter.value = v;
          }}
          placeholder="Filter artists"
        />
      </div>
      {list.length === 0 ? (
        <NoMatch
          query={artistFilter.value}
          onClear={() => {
            artistFilter.value = '';
          }}
        />
      ) : (
        <DataTable
          label="Artists by saved tracks"
          noun="artist"
          columns={savedColumnsOf(hasHistory(m), reach)}
          rows={list}
          rowKey={keyOfRow}
          rankOf={rankOfRow}
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
 * The narrowed list beside an open artist: the open view's rows in its own
 * order (Under the radar's once its gate is passed, Saved tracks
 * otherwise), the shared filter on top, and one figure, the saved tracks.
 */
function ArtistPane(p: { m: Model; selected: string }) {
  const radar =
    artistView.value === 'radar' && artistReachSummary.value?.version === 1;
  const query = normalize(artistFilter.value);
  const order = radarSort.value;
  // Kept while the model, the view and the filter stay, so a `?d=` change
  // (the sheet following the arrows in the artist's tracks) redraws none
  // of the items (S13 A4).
  const items = useMemo(() => {
    const aggs = radar
      ? rankUnderTheRadar(p.m, order).map((r) => r.agg)
      : p.m.artists;
    const shown = query
      ? aggs.filter((a) => normalize(a.name).includes(query))
      : aggs;
    return shown.map((a) => ({
      id: a.key,
      title: a.name,
      subtitle: plural(a.trackKeys.size, 'track'),
      // No artist picture in the model: the slot keeps its place.
      imageUrl: null,
      href: routeHref({ name: 'artist', key: a.key }),
    }));
  }, [p.m, radar, order, query]);
  return (
    <ListPane
      label={radar ? 'Under the radar' : 'Artists by saved tracks'}
      head={
        <Filter
          value={artistFilter.value}
          onInput={(v) => {
            artistFilter.value = v;
          }}
          placeholder="Filter artists"
        />
      }
      empty={
        <NoMatch
          query={artistFilter.value}
          onClear={() => {
            artistFilter.value = '';
          }}
        />
      }
      selectedId={p.selected}
      items={items}
    />
  );
}

/**
 * Library · Artists (spec 003 §9, FR-020, US3): the table, or, with an
 * artist open (`#/artist/<key>`), the narrowed list beside the Artist
 * screen; full screen on a phone. `detail` is the artist's open track.
 */
export function Artists(p: { selected?: string; detail?: string }) {
  const m = model.value;
  const selected = p.selected ?? null;
  return (
    <ListDetail
      list={(narrow) =>
        narrow && m && selected !== null ? (
          <ArtistPane m={m} selected={selected} />
        ) : (
          <ArtistList />
        )
      }
      selectedId={selected}
      detail={
        selected === null ? null : (
          <Artist artistKey={selected} detail={p.detail} />
        )
      }
      onClose={() => {
        location.hash = routeHref({ name: 'artists' });
      }}
    />
  );
}

/**
 * The dispatcher (spec §5.1). The view switcher renders whatever the library
 * holds, so an empty one keeps the switcher instead of taking it down with
 * the list. The Playlists · Artists tabs are the frame's.
 */
function ArtistList() {
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
