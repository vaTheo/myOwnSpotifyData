import { signal } from '@preact/signals';
import type { PlaylistRow } from '../db/schema';
import type { Model } from '../model/aggregate';
import { normalize } from '../model/normalize';
import { model, syncState } from '../model/state';
import { routeHref } from '../router';
import { Empty } from './components/Empty';
import { EmptyState } from './components/EmptyState';
import { Filter } from './components/Filter';
import { Flag } from './components/Flag';
import { formatDate, plural } from './format';
import { ListDetail, ListPane } from './layout/ListDetail';
import { Playlist } from './Playlist';
import { coverColumn, countColumn, titleColumn } from './table/columns';
import { DataTable, type Column } from './table/DataTable';
import type { SortState } from './table/sort';

const filter = signal('');
const sort = signal<SortState>({ columnId: null, direction: 'asc' });

interface PlaylistListRow {
  playlist: PlaylistRow;
  tracks: number;
  pending: boolean;
}

/** "Synced 3 Nov 2026" on a phone's second line; the date alone in a cell. */
const syncedColumn: Column<PlaylistListRow> = {
  id: 'synced',
  header: 'Last synced',
  priority: 2,
  width: '160px',
  sortValue: (r) => r.playlist.syncedAt,
  firstDirection: 'desc',
  cell: (r) => (
    <span>
      <span class="dt-prefix">synced </span>
      {formatDate(r.playlist.syncedAt)}
    </span>
  ),
  compact: 'meta',
};

/** The "pending" flag while a sync still has this playlist to fetch. */
const statusColumn: Column<PlaylistListRow> = {
  id: 'status',
  header: 'Status',
  priority: 1,
  width: '112px',
  sortValue: (r) => (r.pending ? 0 : 1),
  firstDirection: 'asc',
  cell: (r) => (r.pending ? <Flag>pending</Flag> : null),
  compact: 'meta',
};

/** Spec 003 §7: cover · name · tracks · last synced · status. */
const COLUMNS: Column<PlaylistListRow>[] = [
  coverColumn((r) => r.playlist.imageUrl, {}, { priority: 2 }),
  titleColumn((r) => r.playlist.name, {
    header: 'Name',
    hrefOf: (r) => routeHref({ name: 'playlist', id: r.playlist.id }),
  }),
  countColumn('tracks', 'Tracks', (r) => r.tracks, {
    unit: ['track', 'tracks'],
  }),
  syncedColumn,
  statusColumn,
];

/** Today's order (`model.playlists`), filtered by name. */
function listRows(m: Model): PlaylistListRow[] {
  const state = syncState.value;
  const pending = new Set(
    state.status === 'idle' || state.status === 'cancelled' ? [] : state.pending
  );
  const query = normalize(filter.value);
  const list = query
    ? m.playlists.filter((p) => normalize(p.name).includes(query))
    : m.playlists;
  return list.map((playlist) => ({
    playlist,
    tracks: m.entriesByPlaylist.get(playlist.id)?.length ?? 0,
    pending: pending.has(playlist.id),
  }));
}

function FilterField() {
  return (
    <Filter
      value={filter.value}
      onInput={(v) => {
        filter.value = v;
      }}
      placeholder="Filter playlists"
    />
  );
}

function NoPlaylistMatch() {
  return (
    <EmptyState
      icon="search"
      action={{
        label: 'Clear filter',
        onClick: () => {
          filter.value = '';
        },
      }}
    >
      <p>No playlists match "{filter.value}".</p>
    </EmptyState>
  );
}

/**
 * Library · Playlists (spec 003 §7, FR-020, US3). Without a selection, a
 * full-width table; with one (`#/playlist/<id>`), the list narrows to a
 * pane and the playlist opens beside it from expanded windows, or full
 * screen on a phone. Below large, Match folds the pane (CSS): its two
 * columns need the width (ruling R1, S04 fix 1).
 * `detail` is the playlist's open track (`?d=`).
 */
export function Playlists(p: { selected?: string; detail?: string }) {
  const m = model.value;
  if (!m || m.playlists.length === 0) {
    return p.selected ? (
      <Playlist id={p.selected} detail={p.detail} />
    ) : (
      <Empty what="playlists" />
    );
  }
  const rows = listRows(m);
  const selected = p.selected ?? null;

  const list = (narrow: boolean) =>
    narrow ? (
      <ListPane
        label="Playlists"
        head={<FilterField />}
        empty={<NoPlaylistMatch />}
        selectedId={selected}
        items={rows.map((r) => ({
          id: r.playlist.id,
          title: r.playlist.name,
          subtitle: plural(r.tracks, 'track'),
          imageUrl: r.playlist.imageUrl,
          href: routeHref({ name: 'playlist', id: r.playlist.id }),
        }))}
      />
    ) : (
      <section>
        <div class="toolbar">
          <FilterField />
        </div>
        {rows.length === 0 ? (
          <NoPlaylistMatch />
        ) : (
          <DataTable
            label="Playlists"
            noun="playlist"
            columns={COLUMNS}
            rows={rows}
            rowKey={(r) => r.playlist.id}
            sort={sort.value}
            onSort={(s) => {
              sort.value = s;
            }}
            resetKey={filter.value}
            onOpen={(r) => {
              location.hash = routeHref({
                name: 'playlist',
                id: r.playlist.id,
              });
            }}
          />
        )}
      </section>
    );

  return (
    <ListDetail
      list={list}
      selectedId={selected}
      detail={
        selected === null ? null : <Playlist id={selected} detail={p.detail} />
      }
      onClose={() => {
        location.hash = routeHref({ name: 'playlists' });
      }}
    />
  );
}
