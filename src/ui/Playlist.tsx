import { signal } from '@preact/signals';
import { playlistRanking } from '../model/aggregate';
import { isSyncBusy, model, startSync, syncState } from '../model/state';
import { Badge } from './components/Badge';
import { PlaysBadge } from './components/PlaysBadge';
import { Segmented } from './components/Segmented';
import { SpotifyLink } from './components/SpotifyLink';
import { TrackRow } from './components/TrackRow';
import { PERIOD_LABEL, artistNames, plural } from './format';

const order = signal<'plays' | 'order'>('plays');

export function Playlist({ id }: { id: string }) {
  const m = model.value;
  const playlist = m?.playlistsById.get(id);
  if (!m || !playlist) {
    return (
      <div class="empty">
        <p>Playlist not synced yet.</p>
        <a href="#/playlists">Back to playlists</a>
      </div>
    );
  }
  const ranked = playlistRanking(m, id);
  const rows =
    order.value === 'plays'
      ? ranked
      : [...ranked].sort((a, b) => a.entry.position - b.entry.position);
  const sync = syncState.value;
  const busy = isSyncBusy(sync);
  return (
    <section>
      <h1>{playlist.name}</h1>
      <p class="muted">
        {plural(ranked.length, 'track')} ·{' '}
        <SpotifyLink href={playlist.spotifyUrl} />
      </p>
      <div class="actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => void startSync(id)}
        >
          {busy ? 'Syncing…' : 'Sync this playlist'}
        </button>
      </div>
      <Segmented
        options={[
          { value: 'plays', label: 'By plays' },
          { value: 'order', label: 'Playlist order' },
        ]}
        value={order.value}
        onChange={(v) => {
          order.value = v;
        }}
      />
      <ul class="list">
        {rows.map((r, i) => (
          <TrackRow
            key={r.entry.position}
            rank={i + 1}
            title={r.track.name}
            subtitle={artistNames(r.track.artists)}
            spotifyUrl={r.track.spotifyUrl}
            badges={
              <>
                <PlaysBadge plays={r.plays} />
                {r.inTop.map((p) => (
                  <Badge kind="top" key={p}>
                    Top {PERIOD_LABEL[p]}
                  </Badge>
                ))}
              </>
            }
          />
        ))}
      </ul>
    </section>
  );
}
