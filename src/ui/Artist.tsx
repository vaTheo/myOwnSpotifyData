import { signal } from '@preact/signals';
import { artistTracks, topArtistById } from '../model/aggregate';
import { model } from '../model/state';
import { routeHref } from '../router';
import { FeaturePills } from './components/FeaturePills';
import { PlaysBadge } from './components/PlaysBadge';
import { SpotifyLink } from './components/SpotifyLink';
import { TrackRow } from './components/TrackRow';
import { artistUrl, plural } from './format';

/**
 * Rows toggled away from their default. The default is "the first three are
 * open": one or two tracks stay answered at a glance, forty stop scrolling.
 */
const opened = signal<Record<string, boolean>>({});
const OPEN_BY_DEFAULT = 3;

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
  const url = artistUrl(agg?.id ?? top?.id ?? null);
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
