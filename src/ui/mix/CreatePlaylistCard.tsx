import { auth } from '../../auth/browser';
import { digRows } from '../../features/mix/digLinks';
import { isIdentified } from '../../features/mix/spotifySearch';
import {
  createPlaylistState,
  mixRows,
  startCreatePlaylist,
  type MixView,
  type UnmatchedRow,
} from '../../model/state';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { DigLinks } from '../components/DigLinks';
import { ProgressBar } from '../components/ProgressBar';
import { SpotifyLink } from '../components/SpotifyLink';
import { StatusLine } from '../components/StatusLine';
import { formatClock, plural } from '../format';

/**
 * The create result's "not found" disclosure: each missed track once, with
 * every time it was played and where to dig for it. The count stays the row
 * count so it adds up with "added of total"; repeats are named beside it.
 */
function NotFound(p: { unmatched: UnmatchedRow[] }) {
  const rows = digRows(p.unmatched);
  const n = p.unmatched.length;
  return (
    <details class="mix-section">
      <summary>
        {n} not found
        {rows.length !== n && ` (${plural(rows.length, 'track')})`}
      </summary>
      <ul class="mix-notfound">
        {rows.map((d, i) => (
          <li key={i}>
            <span>
              {d.artist} – {d.title}
            </span>
            {d.times.length > 0 && (
              <span class="mix-caption">
                {d.times.map(formatClock).join(' · ')}
              </span>
            )}
            <DigLinks links={d.links} shazamUrl={d.shazamUrl} />
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Create a private Spotify playlist from the open mix's identified rows
 * (spec 003 §12, T083; ADR-03). The button shows whenever an identified row
 * exists; the scope is checked on tap inside `startCreatePlaylist`, which
 * reveals the `needScope` prompt. Every state and failure is inline here,
 * never a banner. `S08d` adds the Validated only / All tracks choice above
 * the button.
 */
export function CreatePlaylistCard(p: { view: MixView }) {
  const { view } = p;
  const cs = createPlaylistState.value;
  // The rows the create job will attempt (N). Also the `total` the error
  // line needs, which the `error` arm does not carry: an add-batch failure
  // happens only after every identified row resolved.
  const identifiedCount = mixRows.value.filter(isIdentified).length;
  const running =
    cs.status === 'resolving' ||
    cs.status === 'creating' ||
    cs.status === 'adding';
  return (
    <Card title="Create playlist" class="mix-create">
      {identifiedCount > 0 ? (
        <Button
          variant="filled"
          icon="queue_music"
          disabled={running}
          onClick={() => void startCreatePlaylist()}
        >
          {running ? 'Creating playlist…' : 'Create playlist from mix'}
        </Button>
      ) : (
        <p class="mix-caption">No identified track to add yet.</p>
      )}
      {cs.status === 'needScope' && (
        <>
          <StatusLine kind="warning">
            This app cannot create playlists yet — connect again to allow it.
            Your saved mixes stay on this browser.
          </StatusLine>
          <Button onClick={() => auth.logout()}>
            Connect again to allow playlists
          </Button>
        </>
      )}
      {cs.status === 'resolving' && (
        <ProgressBar
          label="Matching tracks"
          done={cs.done}
          total={cs.total}
          unit="tracks"
        />
      )}
      {cs.status === 'creating' && (
        <StatusLine>Creating the playlist…</StatusLine>
      )}
      {cs.status === 'adding' && <StatusLine>Adding tracks…</StatusLine>}
      {cs.status === 'done' && (
        <>
          <StatusLine kind="success">
            Created ‘{cs.name}’ — {cs.added} of {cs.total} tracks
          </StatusLine>
          {cs.url !== null && <SpotifyLink href={cs.url} label />}
          {cs.unmatched.length > 0 && <NotFound unmatched={cs.unmatched} />}
        </>
      )}
      {cs.status === 'error' && (
        <>
          <StatusLine kind="error">
            Could not create the playlist: {cs.message}
          </StatusLine>
          {cs.url != null && (
            <p>
              Playlist created · <SpotifyLink href={cs.url} label />
            </p>
          )}
          {/* `!== undefined`, not truthiness: a batch-1 failure reports
              `added: 0`, and "Added 0 of N before the error." must still
              show. */}
          {cs.added !== undefined && (
            <p class="mix-caption">
              Added {cs.added} of {identifiedCount} before the error.
            </p>
          )}
        </>
      )}
      {view.playlistUrl != null &&
        (cs.status === 'idle' || cs.status === 'needScope') && (
          <p>
            Playlist created · <SpotifyLink href={view.playlistUrl} label />
          </p>
        )}
    </Card>
  );
}
