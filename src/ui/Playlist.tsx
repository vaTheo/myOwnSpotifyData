import { signal } from '@preact/signals';
import { useState } from 'preact/hooks';
import { auth } from '../auth/browser';
import {
  isLiking,
  likeButtonLabel,
  likeErrorText,
  likeSummary,
} from '../features/like/likePlaylist';
import {
  findSeedRow,
  playlistRanking,
  type Model,
  type RankedTrack,
  type SeedRef,
} from '../model/aggregate';
import { featureFor, type ResolvedFeature } from '../model/features';
import { formatKey } from '../model/keys';
import { trackYear } from '../model/year';
import { rankMatches, type MatchResult } from '../model/match';
import {
  historySummary,
  isSyncBusy,
  heldQuotaMessage,
  spotifyBusyMessage,
  keyNotation,
  likeState,
  model,
  startLikePlaylist,
  startSync,
  syncState,
} from '../model/state';
import { routeHref } from '../router';
import { Button } from './components/Button';
import { Flag } from './components/Flag';
import { IconButton } from './components/IconButton';
import { NoData } from './components/NoData';
import { ProgressBar } from './components/ProgressBar';
import { SegmentedButtons } from './components/SegmentedButtons';
import { SpotifyLink } from './components/SpotifyLink';
import { StatusLine } from './components/StatusLine';
import { artistNames, formatBpm, plural } from './format';
import { DETAIL_COMPACT_BELOW } from './layout/ListDetail';
import { windowClass } from './layout/windowClass';
import { matchCells, type MatchCells } from './playlist/matchCells';
import {
  addedColumn,
  albumColumn,
  artistsColumn,
  bpmColumn,
  durationColumn,
  keyColumn,
  playsColumn,
  rankColumn,
  spotifyLinkColumn,
  titleColumn,
  topFlagsColumn,
  yearColumn,
} from './table/columns';
import { yearSortOffered, type TableLayout } from './table/layout';
import { closeDetail, openDetail } from './details/navigate';
import { TrackSheet } from './details/TrackDetails';
import { DataTable, type Column } from './table/DataTable';
import { lastCall } from './table/lastCall';
import type { SortState } from './table/sort';
import { trackFilterView } from './filters/FilterBar';
import { EMPTY_FILTER, type TrackFilter } from './filters/trackFilter';

type Order = 'plays' | 'order' | 'match';

const order = signal<Order>('plays');
const DEFAULT_SORT: SortState = { columnId: null, direction: 'asc' };
/**
 * The header sort, on top of the order, for the playlist `sortOf` names: a
 * new order, or another playlist, starts from its own ranking.
 */
const sort = signal<SortState>(DEFAULT_SORT);
const sortOf = signal<string | null>(null);
/** The playlist table's filters, kept from one playlist to the next. */
const filter = signal<TrackFilter>(EMPTY_FILTER);
/**
 * Larger windows fold the filters behind a Filters button in the strip, so
 * a 900 px tall window still holds 15 rows (SC-001); a filter in force
 * keeps them shown.
 */
const filtersShown = signal(false);

/**
 * Spec §5: one seed per playlist, so walking from one playlist to another
 * with Match on asks for a new seed instead of ranking against a track that
 * is not in this list. The seed is the row that was tapped — its track key
 * (a local file has no Spotify id) *and* its position, because a playlist may
 * hold the same track twice. Replaced whole, so the signal actually changes.
 */
const seeds = signal<Record<string, SeedRef>>({});

/**
 * Handed to `rankMatches` and used again for the Relation cell, so the list
 * and the cells can never disagree about what "in tolerance" means. It is the
 * same 6% as the `tolerancePct` default in spec §2.
 */
const TOLERANCE_PCT = 6;

interface ListedRow {
  row: RankedTrack;
  feature: ResolvedFeature | null;
  cells: MatchCells;
}

function setSeed(playlistId: string, row: RankedTrack): void {
  seeds.value = {
    ...seeds.value,
    [playlistId]: { trackKey: row.track.key, position: row.entry.position },
  };
}

/** `Clear`, and leaving Match mode, drop this playlist's seed and no other. */
function clearSeed(playlistId: string): void {
  const next = { ...seeds.value };
  delete next[playlistId];
  seeds.value = next;
}

/** `Matching: Nightdrive · 126 BPM · 8A`; each part only when it is known. */
function seedCaption(name: string, f: ResolvedFeature | null): string {
  const parts = [`Matching: ${name}`];
  if (f && f.bpm !== null) parts.push(`${formatBpm(f.bpm)} BPM`);
  if (f && f.key !== null && f.major !== null) {
    parts.push(formatKey(f.key, f.major, keyNotation.value));
  }
  return parts.join(' · ');
}

/** Relation (same key, relative, boost, +1, −1), or "no data" alone. */
const relationColumn: Column<ListedRow> = {
  id: 'relation',
  header: 'Relation',
  priority: 1,
  width: '112px',
  cell: ({ cells }) =>
    cells.noData ? (
      <Flag>no data</Flag>
    ) : cells.relation ? (
      <Flag kind="relation">{cells.relation}</Flag>
    ) : null,
  compact: 'meta',
};

/** ΔBPM against the seed; out of tolerance it stays, the relation goes. */
const deltaColumn: Column<ListedRow> = {
  id: 'delta',
  header: 'ΔBPM',
  align: 'end',
  priority: 1,
  width: '88px',
  cell: ({ cells }) =>
    cells.noData ? null : cells.delta ? (
      <span class="dt-num">{cells.delta}</span>
    ) : (
      <NoData />
    ),
  compact: 'meta',
};

/**
 * Spec 003 §8: # · title · artists · album · length · added · plays ·
 * (relation · ΔBPM in Match) · top · BPM · key · released · link. Match's
 * two columns take the place of Album and Added, priority-4 columns, so the
 * title stays readable at 1440 (review of S02).
 */
function playlistColumns(m: Model, matching: boolean): Column<ListedRow>[] {
  const featureOf = (r: ListedRow) => r.feature;
  return [
    rankColumn(),
    titleColumn((r) => r.row.track.name),
    // The Released column (round 005) takes 88 px: the artists give way
    // so the title stays readable at 1440 (SC-001).
    artistsColumn((r) => r.row.track.artists, { width: 'minmax(0, 1fr)' }),
    ...(matching
      ? []
      : [
          albumColumn((r: ListedRow) => r.row.track.album || null, {
            priority: 4,
          }),
        ]),
    durationColumn((r) => r.row.track.durationMs, {
      priority: 4,
      firstDirection: 'asc',
    }),
    ...(matching
      ? []
      : [addedColumn((r: ListedRow) => r.row.entry.addedAt, { priority: 4 })]),
    // Spec 003 §8: a phone's Match line is relation · ΔBPM · BPM · key.
    playsColumn((r) => r.row.plays, matching ? { compact: 'hidden' } : {}),
    ...(matching ? [relationColumn, deltaColumn] : []),
    topFlagsColumn((r) => r.row.inTop, { sortValue: undefined }),
    bpmColumn(featureOf),
    keyColumn(featureOf),
    yearColumn((r) => yearOfListed(m, r)),
    spotifyLinkColumn((r) => r.row.track.spotifyUrl),
  ];
}

/**
 * Like-playlist spec §3: every line of the like job, shown only on the
 * playlist it belongs to, inline under the header. Every failure is printed
 * here; no banner.
 */
function LikeStatus({ playlistId }: { playlistId: string }) {
  const s = likeState.value;
  if (s.status === 'idle' || s.playlistId !== playlistId) return null;
  switch (s.status) {
    case 'needScope':
      return (
        <div class="like-status">
          <StatusLine kind="warning">
            This app cannot like songs yet — connect again to allow it. Your
            library stays in this browser.
          </StatusLine>
          <Button variant="tonal" onClick={() => auth.logout()}>
            Connect again to allow likes
          </Button>
        </div>
      );
    case 'checking':
      return (
        <div class="like-status">
          <ProgressBar
            label="Checking your Liked Songs…"
            done={s.done}
            total={s.total}
            unit="songs"
          />
        </div>
      );
    case 'liking':
      return (
        <div class="like-status">
          <ProgressBar
            label="Liking…"
            done={s.done}
            total={s.total}
            unit="songs"
          />
        </div>
      );
    case 'done':
      return (
        <div class="like-status">
          <StatusLine kind="success">{likeSummary(s)}</StatusLine>
        </div>
      );
    case 'error':
      return (
        <div class="like-status">
          <StatusLine kind="error">{likeErrorText(s)}</StatusLine>
        </div>
      );
  }
}

/**
 * The top bar's actions on a playlist (spec 003 §8): Sync this playlist and
 * Like all songs, with today's labels and disabled rules. Icon buttons on a
 * phone, where the labels become their names and tooltips.
 */
export function PlaylistActions({ id }: { id: string }) {
  const m = model.value;
  if (!m?.playlistsById.has(id)) return null;
  // Inside the one quota lock-out, whichever reader met it (S08d): the
  // button says so instead of "Syncing…" (round 1).
  const locked = heldQuotaMessage('sync');
  const running = syncState.value.status === 'running';
  // One Spotify reader at a time (S13): the other reader running is named.
  const syncBusy = running ? null : spotifyBusyMessage('sync');
  const busy =
    isSyncBusy(syncState.value) || locked !== null || syncBusy !== null;
  const like = likeState.value;
  const liking = isLiking(like);
  const likeBusy = liking ? null : spotifyBusyMessage('like');
  const syncLabel = running
    ? 'Syncing…'
    : (locked ?? syncBusy ?? (busy ? 'Syncing…' : 'Sync this playlist'));
  const likeLabel = likeBusy ?? likeButtonLabel(like, id);
  if (windowClass.value === 'compact') {
    return (
      <>
        <IconButton
          icon="sync"
          label={syncLabel}
          disabled={busy}
          onClick={() => void startSync(id)}
        />
        <IconButton
          icon="favorite"
          label={likeLabel}
          disabled={liking || likeBusy !== null}
          onClick={() => void startLikePlaylist(id)}
        />
      </>
    );
  }
  return (
    <>
      <Button
        variant="text"
        icon="sync"
        disabled={busy}
        onClick={() => void startSync(id)}
      >
        {syncLabel}
      </Button>
      <Button
        variant="text"
        icon="favorite"
        disabled={liking || likeBusy !== null}
        onClick={() => void startLikePlaylist(id)}
      >
        {likeLabel}
      </Button>
    </>
  );
}

const playlistColumnsOf = lastCall(playlistColumns);
const yearOfListed = (m: Model, r: ListedRow): number | null =>
  r.row.track.id ? trackYear(m, r.row.track.id) : null;
const positionOf = (r: ListedRow): string => String(r.row.entry.position);

/**
 * A playlist's rows as the table lists them: ranked, in playlist order, or
 * matched from the seed. Kept while the model, the playlist, the order and
 * the seed stay, so the table's memos hold across other renders (S13 A5).
 */
const playlistView = lastCall(
  (m: Model, id: string, ord: Order, seedRef: SeedRef | undefined) => {
    const ranked = playlistRanking(m, id);
    // Match ranks the plays order, so only `order` re-sorts by position.
    const rows =
      ord === 'order'
        ? [...ranked].sort((a, b) => a.entry.position - b.entry.position)
        : ranked;
    const featureOfRow = (r: RankedTrack) =>
      r.track.id ? featureFor(m, r.track.id) : null;
    // Ranked by position, not by track key: a playlist may hold the same track
    // twice, and two candidates sharing an id would collapse the second row.
    const byPosition = new Map(rows.map((r) => [String(r.entry.position), r]));
    const matching = ord === 'match';
    const seed = matching ? findSeedRow(rows, seedRef) : undefined;
    const seedFeature = seed ? featureOfRow(seed) : null;
    const seedPosition = seed?.entry.position;
    const listed: ListedRow[] = seedFeature
      ? rankMatches(
          seedFeature,
          // Exclude only the seed's own position (not its track id): the seed
          // bar already names the seed as "Matching: …", so it must not also
          // rank as the top result of its own list. A track that appears twice
          // in the playlist keeps its other row.
          rows
            .filter((r) => r.entry.position !== seedPosition)
            .map((r) => ({
              id: String(r.entry.position),
              feature: featureOfRow(r),
            })),
          TOLERANCE_PCT
        ).flatMap((match: MatchResult) => {
          const row = byPosition.get(match.id);
          return row
            ? [
                {
                  row,
                  feature: match.feature,
                  cells: matchCells(seedFeature, match, TOLERANCE_PCT),
                },
              ]
            : [];
        })
      : rows.map((row) => ({
          row,
          feature: featureOfRow(row),
          cells: matchCells(null, null, TOLERANCE_PCT),
        }));
    return { ranked, seed, seedFeature, seedPosition, listed };
  }
);

/** `detail` is the entry position whose details sheet is open (`?d=`). */
export function Playlist({ id, detail }: { id: string; detail?: string }) {
  // What the table draws at its width: "Sort by year" shows in the
  // filters where its Released header cannot sort (round 005).
  const [layout, setLayout] = useState<TableLayout | null>(null);
  const m = model.value;
  const playlist = m?.playlistsById.get(id);
  if (!m || !playlist) {
    return (
      <div class="empty">
        <p>Playlist not synced yet.</p>
        <a href="#/playlists">Back to playlists</a>
      </div>
    );
  }
  const matching = order.value === 'match';
  const { ranked, seed, seedFeature, seedPosition, listed } = playlistView(
    m,
    id,
    order.value,
    seeds.value[id]
  );
  const headerSort = sortOf.value === id ? sort.value : DEFAULT_SORT;
  const filtered = trackFilterView({
    filter,
    rows: listed,
    featureOf: (r) => r.feature,
    textOf: (r) =>
      `${r.row.track.name} ${r.row.track.album} ${artistNames(r.row.track.artists)}`,
    yearOf: (r) => yearOfListed(m, r),
    yearSort: {
      sort: headerSort,
      onSort: (s) => {
        sort.value = s;
        sortOf.value = id;
      },
      offered: yearSortOffered(layout),
    },
  });
  const phone = windowClass.value === 'compact';
  const filtersOpen = phone || filtersShown.value || filtered.filtering;

  const meta = (
    <p class="detail-meta">
      {seedFeature
        ? plural(listed.length, 'other')
        : plural(ranked.length, 'track')}
      {playlist.spotifyUrl && (
        <>
          <span aria-hidden="true"> · </span>
          <SpotifyLink href={playlist.spotifyUrl} label />
        </>
      )}
    </p>
  );
  const noHistory = !historySummary.value && (
    <p class="caption">
      No play counts yet —{' '}
      <a href={routeHref({ name: 'import' })}>import your history</a>
    </p>
  );
  const orderControl = (
    <SegmentedButtons
      options={[
        { value: 'plays', label: 'By plays' },
        { value: 'order', label: 'Playlist order' },
        { value: 'match', label: 'Match' },
      ]}
      value={order.value}
      onChange={(v) => {
        order.value = v;
        sort.value = DEFAULT_SORT;
        if (v !== 'match') clearSeed(id);
      }}
    />
  );

  // A phone stacks cover, name and meta, then the order control. Larger
  // windows keep one strip above the table, without the name the top bar
  // already shows, so a 900 px tall window still holds 15 rows (SC-001).
  const head = phone ? (
    <>
      <div class="detail-head">
        {playlist.imageUrl ? (
          <img class="detail-cover" src={playlist.imageUrl} alt="" />
        ) : (
          <span class="detail-cover" aria-hidden="true" />
        )}
        <div class="detail-head-text">
          <p class="detail-name">{playlist.name}</p>
          {meta}
        </div>
      </div>
      <LikeStatus playlistId={id} />
      <div class="toolbar">{orderControl}</div>
      {noHistory}
    </>
  ) : (
    <>
      <div class="playlist-strip">
        {meta}
        {noHistory}
        <Button
          variant={filtersOpen ? 'tonal' : 'text'}
          icon="filter_list"
          aria-expanded={filtersOpen}
          disabled={filtered.filtering}
          onClick={() => {
            filtersShown.value = !filtersShown.value;
          }}
        >
          Filters
        </Button>
        {orderControl}
      </div>
      <LikeStatus playlistId={id} />
    </>
  );

  const seedBar = (
    <>
      {matching && !seed && (
        <p class="seed-bar caption">Select a track to match against</p>
      )}
      {matching && seed && (
        <div class="seed-bar">
          {/* The seed's row leaves the Match list, so after "Match from
              this track" the sheet hands the focus back here (its rowId is
              the seed's position). */}
          <p
            class="seed-caption"
            tabIndex={-1}
            data-row-id={String(seed.entry.position)}
          >
            {seedCaption(seed.track.name, seedFeature)}
          </p>
          <Button variant="text" icon="close" onClick={() => clearSeed(id)}>
            Clear
          </Button>
          {!seedFeature && (
            <StatusLine kind="warning">
              No BPM or key for this track yet
            </StatusLine>
          )}
          {seedFeature?.bpm === null && (
            <StatusLine>
              No BPM for this track — matching by key alone
            </StatusLine>
          )}
        </div>
      )}
    </>
  );

  const beside = windowClass.value === 'expanded' && !matching;
  const table = filtered.empty ?? (
    <DataTable
      // Beside the list pane an expanded window may leave a phone's width:
      // the table follows its own width there (S04 parked fix 1). Match
      // folds the pane and keeps the columns (ruling R1).
      compact={beside ? true : undefined}
      compactBelow={beside ? DETAIL_COMPACT_BELOW : undefined}
      label={`${playlist.name}, ${
        matching
          ? 'matches'
          : order.value === 'order'
            ? 'playlist order'
            : 'by plays'
      }`}
      noun="track"
      columns={playlistColumnsOf(m, matching && seedFeature !== null)}
      rows={listed}
      only={filtered.only}
      rowKey={positionOf}
      sort={headerSort}
      onSort={(s) => {
        sort.value = s;
        sortOf.value = id;
      }}
      resetKey={`${id} ${order.value} ${seedPosition ?? ''}`}
      onLayout={setLayout}
      selectedKey={detail ?? null}
      follow={!matching && detail !== undefined}
      // In Match mode a row is a seed, as before; otherwise it opens its
      // details, where "Match from this track" seeds from it.
      onOpen={
        matching
          ? (r) => setSeed(id, r.row)
          : (r) => openDetail(String(r.row.entry.position))
      }
    />
  );

  const opened = detail
    ? ranked.find((r) => String(r.entry.position) === detail)
    : undefined;
  // A track opened from search that this playlist does not hold.
  const searched = detail !== undefined && !opened && !/^\d+$/.test(detail);
  const sheet = searched ? (
    <TrackSheet trackRef={{ trackId: detail }} rowId={detail} />
  ) : (
    opened && (
      <TrackSheet
        trackRef={{ playlistId: id, position: opened.entry.position }}
        rowId={detail!}
        onMatch={() => {
          setSeed(id, opened);
          order.value = 'match';
          sort.value = DEFAULT_SORT;
          closeDetail();
        }}
      />
    )
  );

  return (
    <section
      class={windowClass.value === 'large' ? 'playlist-dense' : undefined}
      // Below large, Match takes the list pane's width (styles.css).
      data-matching={matching ? 'true' : undefined}
    >
      {head}
      {seedBar}
      {filtersOpen && filtered.bar}
      {table}
      {sheet}
    </section>
  );
}
