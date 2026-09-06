import { Fragment } from 'preact';
import { signal } from '@preact/signals';
import type { ArtistIdentityRow } from '../db/schema';
import { artistTracks, topArtistById, type Model } from '../model/aggregate';
import { reachFor } from '../model/reach';
import { artistReachSummary, model } from '../model/state';
import { routeHref } from '../router';
import { FeaturePills } from './components/FeaturePills';
import { PlaysBadge } from './components/PlaysBadge';
import { SpotifyLink } from './components/SpotifyLink';
import { TrackRow } from './components/TrackRow';
import {
  artistUrl,
  formatDate,
  plural,
  profileLine,
  reachLine,
} from './format';

/**
 * Rows toggled away from their default. The default is "the first three are
 * open": one or two tracks stay answered at a glance, forty stop scrolling.
 */
const opened = signal<Record<string, boolean>>({});
const OPEN_BY_DEFAULT = 3;

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

/**
 * Spec §5.4. Nothing at all before the first run — the gate is the summary
 * record, never sniffing rows — and nothing for an artist with no Spotify id,
 * which is the key every source in this feature starts from. Each line is
 * decided on its own, so an artist Wikidata knows but neither audience source
 * answered for still gets a language count.
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
      label: 'ListenBrainz ›',
      href: `https://listenbrainz.org/artist/${mbid}/`,
    });
  }
  const deezerId = identity?.deezerArtistId ?? null;
  if (deezerId !== null) {
    links.push({
      label: 'Deezer ›',
      href: `https://www.deezer.com/artist/${deezerId}`,
    });
  }
  const wiki = wikipediaUrl(identity);
  if (wiki !== null) links.push({ label: 'Wikipedia ›', href: wiki });
  return (
    <>
      <p class="reach">
        {unresolved ? 'No reach data.' : reachLine(listeners, fans)}
      </p>
      {profile && <p class="reach">{profile}</p>}
      {credit.length > 0 && <p class="reach">{credit.join(' · ')}</p>}
      {(unresolved || links.length > 0) && (
        <div class="provenance">
          {unresolved && (
            <span>
              <a href={routeHref({ name: 'settings' })}>Look up artists ›</a>
            </span>
          )}
          {links.length > 0 && (
            <span>
              {links.map((link, i) => (
                <Fragment key={link.href}>
                  {i > 0 && ' · '}
                  <a href={link.href} target="_blank" rel="noopener">
                    {link.label}
                  </a>
                </Fragment>
              ))}
            </span>
          )}
        </div>
      )}
    </>
  );
}

export function Artist({ artistKey }: { artistKey: string }) {
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
  // Named apart from the `id` the playlist sublist binds below.
  const artistId = agg?.id ?? top?.id ?? null;
  const url = artistUrl(artistId);
  const tracks = agg ? artistTracks(m, artistKey) : [];
  return (
    <section>
      <h1>{name}</h1>
      <p class="muted">
        {plural(tracks.length, 'saved track')} in{' '}
        {plural(agg?.playlistIds.size ?? 0, 'playlist')}
        {url && (
          <>
            {' · '}
            <SpotifyLink href={url} label />
          </>
        )}
      </p>
      <ArtistReach m={m} id={artistId} />
      {tracks.length === 0 && (
        <p class="empty">No saved tracks from {name} in your playlists.</p>
      )}
      <ul class="list">
        {tracks.map((t, i) => {
          const open = opened.value[t.track.key] ?? i < OPEN_BY_DEFAULT;
          return (
            <TrackRow
              key={t.track.key}
              title={t.track.name}
              subtitle={t.track.album}
              spotifyUrl={t.track.spotifyUrl}
              onClick={() => {
                opened.value = { ...opened.value, [t.track.key]: !open };
              }}
              badges={
                <>
                  <PlaysBadge plays={t.plays} />
                  {t.track.id && <FeaturePills trackId={t.track.id} />}
                </>
              }
            >
              {open && (
                <ul class="sublist">
                  {t.playlistIds.map((id) => (
                    <li key={id}>
                      <a href={routeHref({ name: 'playlist', id })}>
                        {m.playlistsById.get(id)?.name ?? id}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </TrackRow>
          );
        })}
      </ul>
    </section>
  );
}
