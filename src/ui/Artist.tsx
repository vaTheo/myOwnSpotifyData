import { artistTracks } from '../model/aggregate';
import { model } from '../model/state';
import { routeHref } from '../router';
import { FeaturePills } from './components/FeaturePills';
import { PlaysBadge } from './components/PlaysBadge';
import { SpotifyLink } from './components/SpotifyLink';
import { TrackRow } from './components/TrackRow';
import { artistUrl, plural } from './format';

export function Artist({ artistKey }: { artistKey: string }) {
  const m = model.value;
  const agg = m?.artistsByKey.get(artistKey);
  if (!m || !agg) {
    return (
      <div class="empty">
        <p>No saved tracks for this artist.</p>
        <a href="#/artists">Back to artists</a>
      </div>
    );
  }
  const tracks = artistTracks(m, artistKey);
  return (
    <section>
      <h1>{agg.name}</h1>
      <p class="muted">
        {plural(tracks.length, 'saved track')} in{' '}
        {plural(agg.playlistIds.size, 'playlist')} ·{' '}
        <SpotifyLink href={artistUrl(agg.id)} />
      </p>
      <ul class="list">
        {tracks.map((t) => (
          <TrackRow
            key={t.track.key}
            title={t.track.name}
            subtitle={t.track.album}
            spotifyUrl={t.track.spotifyUrl}
            badges={
              <>
                <PlaysBadge plays={t.plays} />
                {t.track.id && <FeaturePills trackId={t.track.id} />}
              </>
            }
          >
            <ul class="sublist">
              {t.playlistIds.map((id) => (
                <li key={id}>
                  <a href={routeHref({ name: 'playlist', id })}>
                    {m.playlistsById.get(id)?.name ?? id}
                  </a>
                </li>
              ))}
            </ul>
          </TrackRow>
        ))}
      </ul>
    </section>
  );
}
