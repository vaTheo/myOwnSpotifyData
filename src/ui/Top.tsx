import { signal } from '@preact/signals';
import { useState } from 'preact/hooks';
import type { Period } from '../db/schema';
import {
  topArtists,
  topTracks,
  type AnnotatedTopArtist,
  type AnnotatedTopTrack,
  type Model,
} from '../model/aggregate';
import { featureFor } from '../model/features';
import { trackYear } from '../model/year';
import { model } from '../model/state';
import { routeHref } from '../router';
import { Button } from './components/Button';
import { Empty } from './components/Empty';
import { SegmentedButtons } from './components/SegmentedButtons';
import { openDetail } from './details/navigate';
import { TrackSheet } from './details/TrackDetails';
import { besideSheet } from './layout/SideSheet';
import { artistNames, artistUrl, TOP_PERIOD_LABEL } from './format';
import { windowClass } from './layout/windowClass';
import { spotifyTrackId, type ListenTrack } from './listen';
import {
  artistsColumn,
  bpmColumn,
  countColumn,
  coverColumn,
  keyColumn,
  listenColumn,
  playColumn,
  playlistsColumn,
  playsColumn,
  rankColumn,
  spotifyLinkColumn,
  titleColumn,
  yearColumn,
} from './table/columns';
import { yearSortOffered, type TableLayout } from './table/layout';
import { DataTable, type Column } from './table/DataTable';
import { lastCall } from './table/lastCall';
import type { SortState } from './table/sort';
import { ComparePeriods } from './top/ComparePeriods';
import { trackFilterView } from './filters/FilterBar';
import { EMPTY_FILTER, type TrackFilter } from './filters/trackFilter';

const period = signal<Period>('short_term');
const kind = signal<'tracks' | 'artists'>('tracks');
const compare = signal(false);
const DEFAULT_SORT: SortState = { columnId: null, direction: 'asc' };
const tracksSort = signal<SortState>(DEFAULT_SORT);
const artistsSort = signal<SortState>(DEFAULT_SORT);
const tracksFilter = signal<TrackFilter>(EMPTY_FILTER);

const PERIOD_OPTIONS = (
  ['short_term', 'medium_term', 'long_term'] as const
).map((value) => ({ value, label: TOP_PERIOD_LABEL[value] }));

/** A top track's play button and Listen menu (round 017). */
const trackOf = (r: AnnotatedTopTrack): ListenTrack => ({
  id: spotifyTrackId(r.item.id),
  artist: artistNames(r.item.artists),
  title: r.item.name,
});

/**
 * Tracks: play · # · cover · title · artists · plays · playlists · BPM ·
 * key · released · listen (play, listen: round 017).
 */
function trackColumns(
  hasPlaylists: boolean,
  featureOf: (row: AnnotatedTopTrack) => ReturnType<typeof featureFor>,
  yearOfRow: (row: AnnotatedTopTrack) => number | null
): Column<AnnotatedTopTrack>[] {
  return [
    playColumn(trackOf),
    rankColumn(),
    coverColumn((r) => r.item.imageUrl),
    titleColumn((r) => r.item.name),
    artistsColumn((r) => r.item.artists),
    playsColumn((r) => r.plays),
    playlistsColumn((r) => r.playlistIds.length, hasPlaylists),
    bpmColumn(featureOf),
    keyColumn(featureOf),
    yearColumn(yearOfRow),
    listenColumn(trackOf),
  ];
}

/* Kept while their inputs stay, so the tables' memos hold (S13 A5). */
const topTracksOf = lastCall(topTracks);
const topArtistsOf = lastCall(topArtists);
const trackColumnsOf = lastCall((m: Model, hasPlaylists: boolean) =>
  trackColumns(
    hasPlaylists,
    (r) => featureFor(m, r.item.id),
    (r) => trackYear(m, r.item.id)
  )
);
const rankOfItem = (r: { item: { rank: number } }): number => r.item.rank;
const keyOfItem = (r: { item: { id: string } }): string => r.item.id;

/** Artists: # · image · name · saved tracks · playlists. */
const ARTIST_COLUMNS: Column<AnnotatedTopArtist>[] = [
  rankColumn(),
  coverColumn((r) => r.item.imageUrl, { round: true }),
  titleColumn((r) => r.item.name, {
    header: 'Name',
    hrefOf: (r) => routeHref({ name: 'artist', key: r.item.id }),
  }),
  countColumn('saved', 'Saved tracks', (r) => r.savedTracks, {
    unit: ['saved track', 'saved tracks'],
  }),
  countColumn(
    'playlists',
    'Playlists',
    (r) => r.playlistCount,
    { unit: ['playlist', 'playlists'] },
    { priority: 2 }
  ),
  spotifyLinkColumn((r) => artistUrl(r.item.id)),
];

/**
 * Top on its 4-week tracks list, for the Overview's "Top this month" card
 * (US8): its links then open the list they show, and a `?d=` names a row
 * of it, whatever period the owner last left Top on.
 */
export function showTopTracksThisMonth(): void {
  period.value = 'short_term';
  kind.value = 'tracks';
  compare.value = false;
}

/** `detail` is the track whose details sheet is open (`?d=`). */
export function Top({ detail }: { detail?: string }) {
  // What the tracks table draws at its width: "Sort by year" shows in the
  // filters where its Released header cannot sort (round 005).
  const [layout, setLayout] = useState<TableLayout | null>(null);
  const m = model.value;
  if (!m || m.topItems.size === 0) {
    return (
      <>
        <Empty what="top lists" />
        {detail && <TrackSheet trackRef={{ trackId: detail }} rowId={detail} />}
      </>
    );
  }
  const comparing = compare.value && windowClass.value === 'large';
  const hasPlaylists = m.playlists.length > 0;
  const tracks = topTracksOf(m, period.value);
  const featureOf = (r: AnnotatedTopTrack) => featureFor(m, r.item.id);
  const filtered = trackFilterView({
    filter: tracksFilter,
    rows: tracks,
    featureOf,
    textOf: (r) => `${r.item.name} ${artistNames(r.item.artists)}`,
    yearOf: (r) => trackYear(m, r.item.id),
    yearSort: {
      sort: tracksSort.value,
      onSort: (s) => {
        tracksSort.value = s;
      },
      offered: yearSortOffered(layout),
    },
  });
  return (
    <section>
      <div class="toolbar">
        {!comparing && (
          <SegmentedButtons
            options={PERIOD_OPTIONS}
            value={period.value}
            onChange={(v) => {
              period.value = v;
            }}
          />
        )}
        <SegmentedButtons
          options={[
            { value: 'tracks', label: 'Tracks' },
            { value: 'artists', label: 'Artists' },
          ]}
          value={kind.value}
          onChange={(v) => {
            kind.value = v;
          }}
        />
        {windowClass.value === 'large' && (
          <Button
            variant={compare.value ? 'filled' : 'outlined'}
            icon="view_column"
            aria-pressed={compare.value}
            onClick={() => {
              compare.value = !compare.value;
            }}
          >
            Compare periods
          </Button>
        )}
      </div>
      {comparing ? (
        <ComparePeriods kind={kind.value} />
      ) : kind.value === 'tracks' ? (
        <>
          {filtered.bar}
          {filtered.empty ?? (
            <DataTable
              label={`Top tracks, ${TOP_PERIOD_LABEL[period.value]}`}
              noun="track"
              columns={trackColumnsOf(m, hasPlaylists)}
              rows={tracks}
              only={filtered.only}
              rowKey={keyOfItem}
              rankOf={rankOfItem}
              sort={tracksSort.value}
              onSort={(s) => {
                tracksSort.value = s;
              }}
              resetKey={period.value}
              onLayout={setLayout}
              // Beside the docked sheet the table follows its own width.
              compactBelow={besideSheet(
                detail !== undefined,
                windowClass.value
              )}
              selectedKey={detail ?? null}
              follow={detail !== undefined}
              onOpen={(r) => openDetail(r.item.id)}
            />
          )}
        </>
      ) : (
        <DataTable
          label={`Top artists, ${TOP_PERIOD_LABEL[period.value]}`}
          noun="artist"
          columns={ARTIST_COLUMNS}
          rows={topArtistsOf(m, period.value)}
          rowKey={keyOfItem}
          rankOf={rankOfItem}
          sort={artistsSort.value}
          onSort={(s) => {
            artistsSort.value = s;
          }}
          resetKey={period.value}
          onOpen={(r) => {
            location.hash = routeHref({ name: 'artist', key: r.item.id });
          }}
        />
      )}
      {detail && <TrackSheet trackRef={{ trackId: detail }} rowId={detail} />}
    </section>
  );
}
