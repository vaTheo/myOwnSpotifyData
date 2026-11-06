import { signal } from '@preact/signals';
import type { Period } from '../db/schema';
import { topArtists, topTracks } from '../model/aggregate';
import { model } from '../model/state';
import { routeHref } from '../router';
import { Flag } from './components/Flag';
import { Empty } from './components/Empty';
import { FeaturePills } from './components/FeaturePills';
import { PlaysBadge } from './components/PlaysBadge';
import { SegmentedButtons } from './components/SegmentedButtons';
import { TrackRow } from './components/TrackRow';
import { NoPlaylistNote } from './crate/shared';
import { PERIOD_LABEL, artistNames, plural } from './format';

const period = signal<Period>('short_term');
const kind = signal<'tracks' | 'artists'>('tracks');
const expanded = signal<string | null>(null);

const PERIOD_OPTIONS = (
  ['short_term', 'medium_term', 'long_term'] as const
).map((value) => ({ value, label: PERIOD_LABEL[value] }));

export function Top() {
  const m = model.value;
  if (!m || m.topItems.size === 0) return <Empty what="top lists" />;
  return (
    <section>
      <SegmentedButtons
        options={PERIOD_OPTIONS}
        value={period.value}
        onChange={(v) => {
          period.value = v;
        }}
      />
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
      {kind.value === 'tracks' ? (
        <ul class="list">
          {topTracks(m, period.value).map((t) => (
            <TrackRow
              key={t.item.id}
              rank={t.item.rank}
              imageUrl={t.item.imageUrl}
              title={t.item.name}
              subtitle={artistNames(t.item.artists)}
              spotifyUrl={t.item.spotifyUrl}
              onClick={() => {
                expanded.value =
                  expanded.value === t.item.id ? null : t.item.id;
              }}
              badges={
                <>
                  {t.playlistIds.length === 0 && m.playlists.length > 0 ? (
                    <Flag kind="todo">not in a playlist</Flag>
                  ) : (
                    <Flag>{plural(t.playlistIds.length, 'playlist')}</Flag>
                  )}
                  <PlaysBadge plays={t.plays} />
                  <FeaturePills trackId={t.item.id} />
                </>
              }
            >
              {expanded.value === t.item.id &&
                (t.playlistIds.length > 0 ? (
                  <ul class="sublist">
                    {t.playlistIds.map((id) => (
                      <li key={id}>
                        <a href={routeHref({ name: 'playlist', id })}>
                          {m.playlistsById.get(id)?.name ?? id}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div class="sublist">
                    <NoPlaylistNote />
                  </div>
                ))}
            </TrackRow>
          ))}
        </ul>
      ) : (
        <ul class="list">
          {topArtists(m, period.value).map((a) => (
            <TrackRow
              key={a.item.id}
              rank={a.item.rank}
              imageUrl={a.item.imageUrl}
              title={a.item.name}
              subtitle={`${plural(a.savedTracks, 'saved track')} · ${plural(a.playlistCount, 'playlist')}`}
              href={routeHref({ name: 'artist', key: a.item.id })}
              spotifyUrl={a.item.spotifyUrl}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
