import { signal } from '@preact/signals';
import { normalize } from '../model/normalize';
import { model } from '../model/state';
import { routeHref } from '../router';
import { Empty } from './components/Empty';
import { Filter } from './components/Filter';
import { TrackRow } from './components/TrackRow';
import { artistUrl, plural } from './format';

const filter = signal('');

export function Artists() {
  const m = model.value;
  if (!m || m.artists.length === 0) return <Empty what="artists" />;
  const query = normalize(filter.value);
  const list = query
    ? m.artists.filter((a) => normalize(a.name).includes(query))
    : m.artists;
  return (
    <section>
      <h1>Artists by saved tracks</h1>
      <Filter
        value={filter.value}
        onInput={(v) => {
          filter.value = v;
        }}
        placeholder="Filter artists"
      />
      <ul class="list">
        {list.map((a, i) => (
          <TrackRow
            key={a.key}
            rank={i + 1}
            title={a.name}
            subtitle={`${plural(a.trackKeys.size, 'track')} · ${plural(a.playlistIds.size, 'playlist')}`}
            href={routeHref({ name: 'artist', key: a.key })}
            spotifyUrl={artistUrl(a.id)}
          />
        ))}
      </ul>
    </section>
  );
}
