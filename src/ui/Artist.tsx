import { signal } from '@preact/signals';
import type { ArtistIdentityRow } from '../db/schema';
import {
  artistTracks,
  topArtistById,
  type ArtistTrack,
  type Model,
} from '../model/aggregate';
import { featureFor } from '../model/features';
import { reachFor } from '../model/reach';
import { artistReachSummary, model } from '../model/state';
import { routeHref } from '../router';
import { Card } from './components/Card';
import { NoData } from './components/NoData';
import { SpotifyLink } from './components/SpotifyLink';
import {
  artistNames,
  artistUrl,
  formatDate,
  plural,
  profileLine,
} from './format';
import { Icon } from './icons';
import { DETAIL_COMPACT_BELOW } from './layout/ListDetail';
import { windowClass } from './layout/windowClass';
import {
  albumColumn,
  bpmColumn,
  countColumn,
  keyColumn,
  playsColumn,
  spotifyLinkColumn,
  titleColumn,
} from './table/columns';
import { openDetail } from './details/navigate';
import { TrackSheet } from './details/TrackDetails';
import { DataTable, type Column } from './table/DataTable';
import { trackFilterView } from './filters/FilterBar';
import { EMPTY_FILTER, type TrackFilter } from './filters/trackFilter';
import { lastCall } from './table/lastCall';
import type { SortState } from './table/sort';

const sort = signal<SortState>({ columnId: null, direction: 'asc' });
const filter = signal<TrackFilter>(EMPTY_FILTER);

/**
 * Rebuilt from the stored sitelink segment, so it is exact: `wikiTitles`
 * keeps the path exactly as Wikidata spelled it (percent-encoded, underscores
 * intact), which is why it is interpolated and never encoded again. English
 * first, French when that is the only article.
 */
function wikipediaUrl(identity: ArtistIdentityRow | undefined): string | null {
  const titles = identity?.wikiTitles;
  if (titles?.en) return `https://en.wikipedia.org/wiki/${titles.en}`;
  if (titles?.fr) return `https://fr.wikipedia.org/wiki/${titles.fr}`;
  return null;
}

/** One figure of the reach card: a number, or `NoData`, never a 0. */
function Figure(p: { value: number | null; label: string }) {
  return (
    <div class="figure">
      <span class="figure-value">
        {p.value === null ? <NoData /> : p.value.toLocaleString()}
      </span>
      <span class="figure-label">{p.label}</span>
    </div>
  );
}

/**
 * Spec 001 §5.4, as a card (spec 003 §10). Nothing at all before the first
 * run — the gate is the summary record, never sniffing rows — and nothing for
 * an artist with no Spotify id, which is the key every source in this
 * feature starts from. Each line is decided on its own, so an artist Wikidata
 * knows but neither audience source answered for still gets a language
 * count. Listeners and fans are two figures side by side, never summed.
 */
function ArtistReach(p: { m: Model; id: string | null }) {
  const summary = artistReachSummary.value;
  if (p.id === null || summary?.version !== 1) return null;
  const identity = p.m.identities.get(p.id);
  const reach = reachFor(p.m, p.id);
  const listeners = reach.listenbrainz?.value ?? null;
  const fans = reach.deezer?.value ?? null;
  const profile = profileLine(
    identity?.sitelinks ?? null,
    reach.wikipedia?.value ?? null
  );
  const unresolved = listeners === null && fans === null;
  const fetched = [reach.listenbrainz, reach.deezer, reach.wikipedia]
    .filter((row) => row !== undefined)
    .map((row) => row.fetchedAt);
  // The newest stamp among the rows that actually carry a number.
  const credit = [
    fetched.length > 0 ? `as of ${formatDate(Math.max(...fetched))}` : null,
    // Wherever a language count or a view count is on screen (spec §8).
    profile === null ? null : 'Wikipedia figures CC BY-SA 4.0',
  ].filter((part) => part !== null);
  // A link only where the id behind it is known (spec §5.4).
  const links: { label: string; href: string }[] = [];
  const mbid = identity?.mbid ?? null;
  if (mbid !== null) {
    links.push({
      label: 'ListenBrainz',
      href: `https://listenbrainz.org/artist/${mbid}/`,
    });
  }
  const deezerId = identity?.deezerArtistId ?? null;
  if (deezerId !== null) {
    links.push({
      label: 'Deezer',
      href: `https://www.deezer.com/artist/${deezerId}`,
    });
  }
  const wiki = wikipediaUrl(identity);
  if (wiki !== null) links.push({ label: 'Wikipedia', href: wiki });
  // A profile line is real reach data on screen, so "No reach data" must
  // never sit above one: the figures are dropped instead of contradicting
  // it. A bare link is only a page to visit, not data, so the sentence stays
  // beside links.
  return (
    <Card class="reach-card">
      {!unresolved && (
        <div class="reach-figures">
          <Figure value={listeners} label="ListenBrainz listeners" />
          <Figure value={fans} label="Deezer fans" />
        </div>
      )}
      {unresolved && profile === null && (
        <p class="reach-none">No reach data</p>
      )}
      {profile && <p class="reach-profile">{profile}</p>}
      {credit.length > 0 && <p class="reach-credit">{credit.join(' · ')}</p>}
      {(unresolved || links.length > 0) && (
        <div class="reach-links">
          {unresolved && (
            <a class="btn btn-tonal" href={routeHref({ name: 'settings' })}>
              <span>Look up artists</span>
            </a>
          )}
          {links.map((link) => (
            <a
              key={link.href}
              class="btn btn-outlined"
              href={link.href}
              target="_blank"
              rel="noopener"
            >
              <span>{link.label}</span>
              <Icon name="open_in_new" size={18} />
            </a>
          ))}
        </div>
      )}
    </Card>
  );
}

/** Title · album · plays · playlists · BPM · key · link (spec 003 §10). */
function trackColumns(m: Model): Column<ArtistTrack>[] {
  const featureOf = (r: ArtistTrack) =>
    r.track.id ? featureFor(m, r.track.id) : null;
  return [
    titleColumn((r) => r.track.name),
    albumColumn((r) => r.track.album || null, {
      priority: 2,
      compact: 'subtitle',
    }),
    playsColumn((r) => r.plays),
    countColumn(
      'playlists',
      'Playlists',
      (r) => r.playlistIds.length,
      { unit: ['playlist', 'playlists'] },
      { priority: 2, width: '104px' }
    ),
    bpmColumn(featureOf),
    keyColumn(featureOf),
    spotifyLinkColumn((r) => r.track.spotifyUrl),
  ];
}

/* Kept while their inputs stay, so the table's memos hold (S13 A5). */
const trackColumnsOf = lastCall(trackColumns);
const artistTracksOf = lastCall(artistTracks);

/** `detail` is the track key whose details sheet is open (`?d=`). */
export function Artist({
  artistKey,
  detail,
}: {
  artistKey: string;
  detail?: string;
}) {
  const m = model.value;
  const agg = m?.artistsByKey.get(artistKey);
  // A top-list artist you have saved nothing from is in no playlist, so it has
  // no aggregate; the top list still knows the name of what you tapped.
  const top = m && !agg ? topArtistById(m, artistKey) : null;
  const name = agg?.name ?? top?.name ?? null;
  if (!m || name === null) {
    return (
      <div class="empty">
        <p>No saved tracks for this artist.</p>
        <a href="#/artists">Back to artists</a>
      </div>
    );
  }
  const artistId = agg?.id ?? top?.id ?? null;
  const url = artistUrl(artistId);
  const tracks = agg ? artistTracksOf(m, artistKey) : [];
  const filtered = trackFilterView({
    filter,
    rows: tracks,
    featureOf: (r) => (r.track.id ? featureFor(m, r.track.id) : null),
    textOf: (r) =>
      `${r.track.name} ${r.track.album} ${artistNames(r.track.artists)}`,
  });
  return (
    <section>
      <p class="detail-meta artist-meta">
        {plural(tracks.length, 'saved track')} in{' '}
        {plural(agg?.playlistIds.size ?? 0, 'playlist')}
        {url && (
          <>
            <span aria-hidden="true"> · </span>
            <SpotifyLink href={url} label />
          </>
        )}
      </p>
      {/* Only a playlist artist (an `agg`) is ever a reach candidate (spec
          §2 is `model.artists`): a top-list-only artist would never resolve,
          so no "Look up artists" is offered for one. */}
      <ArtistReach m={m} id={agg ? artistId : null} />
      {tracks.length === 0 ? (
        <p class="empty">No saved tracks from {name} in your playlists.</p>
      ) : (
        <>
          {filtered.bar}
          {filtered.empty ?? (
            <DataTable
              // Beside the list pane an expanded window may leave a phone's
              // width: the table follows its own width there (S04 parked fix 1).
              compact={windowClass.value === 'expanded' ? true : undefined}
              compactBelow={
                windowClass.value === 'expanded'
                  ? DETAIL_COMPACT_BELOW
                  : undefined
              }
              label={`Saved tracks by ${name}`}
              noun="track"
              columns={trackColumnsOf(m)}
              rows={tracks}
              only={filtered.only}
              rowKey={(t) => t.track.key}
              sort={sort.value}
              onSort={(s) => {
                sort.value = s;
              }}
              resetKey={artistKey}
              selectedKey={detail ?? null}
              follow={detail !== undefined}
              onOpen={(t) => openDetail(t.track.key)}
            />
          )}
        </>
      )}
      {detail && <TrackSheet trackRef={{ trackId: detail }} rowId={detail} />}
    </section>
  );
}
