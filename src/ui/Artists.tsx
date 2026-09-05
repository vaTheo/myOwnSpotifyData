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
  // Rank comes from the full list, so filtering never renumbers the rows.
  const ranks = new Map(
    m.artists.map((a, i): [string, number] => [a.key, i + 1])
  );
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
      {list.length === 0 ? (
        <div class="empty">
          <p>No artists match "{filter.value}".</p>
          <button
            type="button"
            onClick={() => {
              filter.value = '';
            }}
          >
            Clear filter
          </button>
        </div>
      ) : (
        <ul class="list">
          {list.map((a) => (
            <TrackRow
              key={a.key}
              rank={ranks.get(a.key) ?? 0}
              title={a.name}
              subtitle={`${plural(a.trackKeys.size, 'track')} · ${plural(a.playlistIds.size, 'playlist')}`}
              href={routeHref({ name: 'artist', key: a.key })}
              spotifyUrl={artistUrl(a.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
