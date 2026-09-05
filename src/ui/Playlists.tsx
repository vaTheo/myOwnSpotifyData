import { signal } from '@preact/signals';
import { normalize } from '../model/normalize';
import { model, syncState } from '../model/state';
import { routeHref } from '../router';
import { Badge } from './components/Badge';
import { Empty } from './components/Empty';
import { Filter } from './components/Filter';
import { TrackRow } from './components/TrackRow';
import { plural } from './format';

const filter = signal('');

export function Playlists() {
  const m = model.value;
  if (!m || m.playlists.length === 0) return <Empty what="playlists" />;
  const state = syncState.value;
  const pending = new Set(state.status === 'idle' ? [] : state.pending);
  const query = normalize(filter.value);
  const list = query
    ? m.playlists.filter((p) => normalize(p.name).includes(query))
    : m.playlists;
  return (
    <section>
      <h1>Playlists</h1>
      <Filter
        value={filter.value}
        onInput={(v) => {
          filter.value = v;
        }}
        placeholder="Filter playlists"
      />
      {list.length === 0 ? (
        <div class="empty">
          <p>No playlists match "{filter.value}".</p>
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
          {list.map((p) => (
            <TrackRow
              key={p.id}
              imageUrl={p.imageUrl}
              title={p.name}
              subtitle={plural(
                m.entriesByPlaylist.get(p.id)?.length ?? 0,
                'track'
              )}
              href={routeHref({ name: 'playlist', id: p.id })}
              spotifyUrl={p.spotifyUrl}
              badges={pending.has(p.id) ? <Badge>pending</Badge> : undefined}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
