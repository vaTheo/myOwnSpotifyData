import { signal } from '@preact/signals';
import type { Period } from '../db/schema';
import {
  topArtists,
  topTracks,
  type AnnotatedTopArtist,
  type AnnotatedTopTrack,
} from '../model/aggregate';
import { featureFor } from '../model/features';
import { model } from '../model/state';
import { routeHref } from '../router';
import { Button } from './components/Button';
import { Empty } from './components/Empty';
import { SegmentedButtons } from './components/SegmentedButtons';
import { openDetail } from './details/navigate';
import { TrackSheet } from './details/TrackDetails';
import { TOP_PERIOD_LABEL } from './format';
import { windowClass } from './layout/windowClass';
import {
  artistsColumn,
  bpmColumn,
  countColumn,
  coverColumn,
  keyColumn,
  playlistsColumn,
  playsColumn,
  rankColumn,
  spotifyLinkColumn,
  titleColumn,
} from './table/columns';
import { DataTable, type Column } from './table/DataTable';
import type { SortState } from './table/sort';
import { ComparePeriods } from './top/ComparePeriods';

const period = signal<Period>('short_term');
const kind = signal<'tracks' | 'artists'>('tracks');
const compare = signal(false);
const DEFAULT_SORT: SortState = { columnId: null, direction: 'asc' };
const tracksSort = signal<SortState>(DEFAULT_SORT);
const artistsSort = signal<SortState>(DEFAULT_SORT);

const PERIOD_OPTIONS = (
  ['short_term', 'medium_term', 'long_term'] as const
).map((value) => ({ value, label: TOP_PERIOD_LABEL[value] }));

/** Tracks: # · cover · title · artists · plays · playlists · BPM · key · link. */
function trackColumns(
  hasPlaylists: boolean,
  featureOf: (row: AnnotatedTopTrack) => ReturnType<typeof featureFor>
): Column<AnnotatedTopTrack>[] {
  return [
    rankColumn(),
    coverColumn((r) => r.item.imageUrl),
    titleColumn((r) => r.item.name),
    artistsColumn((r) => r.item.artists),
    playsColumn((r) => r.plays),
    playlistsColumn((r) => r.playlistIds.length, hasPlaylists),
    bpmColumn(featureOf),
    keyColumn(featureOf),
    spotifyLinkColumn((r) => r.item.spotifyUrl),
  ];
}

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
  spotifyLinkColumn((r) => r.item.spotifyUrl),
];

/** `detail` is the track whose details sheet is open (`?d=`). */
export function Top({ detail }: { detail?: string }) {
  const m = model.value;
  if (!m || m.topItems.size === 0) return <Empty what="top lists" />;
  const comparing = compare.value && windowClass.value === 'large';
  const hasPlaylists = m.playlists.length > 0;
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
        <DataTable
          label={`Top tracks, ${TOP_PERIOD_LABEL[period.value]}`}
          noun="track"
          columns={trackColumns(hasPlaylists, (r) => featureFor(m, r.item.id))}
          rows={topTracks(m, period.value)}
          rowKey={(r) => r.item.id}
          rankOf={(r) => r.item.rank}
          sort={tracksSort.value}
          onSort={(s) => {
            tracksSort.value = s;
          }}
          resetKey={period.value}
          selectedKey={detail ?? null}
          follow={detail !== undefined}
          onOpen={(r) => openDetail(r.item.id)}
        />
      ) : (
        <DataTable
          label={`Top artists, ${TOP_PERIOD_LABEL[period.value]}`}
          noun="artist"
          columns={ARTIST_COLUMNS}
          rows={topArtists(m, period.value)}
          rowKey={(r) => r.item.id}
          rankOf={(r) => r.item.rank}
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
