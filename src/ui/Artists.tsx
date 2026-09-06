import { signal } from '@preact/signals';
import { normalize } from '../model/normalize';
import { model } from '../model/state';
import { routeHref } from '../router';
import { UnderRadar } from './UnderRadar';
import { artistView } from './artistSelections';
import { Empty } from './components/Empty';
import { Filter } from './components/Filter';
import { NoMatch } from './components/NoMatch';
import { Segmented } from './components/Segmented';
import { TrackRow } from './components/TrackRow';
import { artistUrl, plural } from './format';

const filter = signal('');

/** Exactly today's screen: the same ranking, the same filter, the same rows. */
function SavedTracks() {
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
    <>
      <Filter
        value={filter.value}
        onInput={(v) => {
          filter.value = v;
        }}
        placeholder="Filter artists"
      />
      {list.length === 0 ? (
        <NoMatch
          query={filter.value}
          onClear={() => {
            filter.value = '';
          }}
        />
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
    </>
  );
}

/**
 * The dispatcher (spec §5.1). The h1 and the view switcher render whatever
 * the library holds, so an empty one keeps the switcher instead of taking it
 * down with the list.
 */
export function Artists() {
  return (
    <section>
      <h1>Artists</h1>
      <Segmented
        options={[
          { value: 'saved', label: 'Saved tracks' },
          { value: 'radar', label: 'Under the radar' },
        ]}
        value={artistView.value}
        onChange={(v) => {
          artistView.value = v;
        }}
      />
      {artistView.value === 'saved' ? <SavedTracks /> : <UnderRadar />}
    </section>
  );
}
