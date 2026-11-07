import { auth } from '../../auth/browser';
import {
  tracksToAdd,
  type CreateChoice,
} from '../../features/mix/createPlaylist';
import { digRows } from '../../features/mix/digLinks';
import {
  createChoice,
  createChoiceFor,
  createPlaylistState,
  mixRows,
  spotifyLockedUntil,
  startCreatePlaylist,
  type MixView,
  type UnmatchedRow,
} from '../../model/state';
import { quotaRefusal } from '../../spotify/quotaLock';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { DigLinks } from '../components/DigLinks';
import { ProgressBar } from '../components/ProgressBar';
import { SpotifyLink } from '../components/SpotifyLink';
import { StatusLine } from '../components/StatusLine';
import { SegmentedButtons } from '../components/SegmentedButtons';
import { formatClock, formatDateTime, plural } from '../format';
import { Disclosure } from './Disclosure';

/**
 * The create result's "not found" disclosure: each missed track once, with
 * every time it was played and where to dig for it. The count stays the row
 * count so it adds up with "added of total"; repeats are named beside it.
 */
function NotFound(p: { unmatched: UnmatchedRow[] }) {
  const rows = digRows(p.unmatched);
  const n = p.unmatched.length;
  return (
    <Disclosure
      summary={
        <>
          {n} not found
          {rows.length !== n && ` (${plural(rows.length, 'track')})`}
        </>
      }
    >
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
    </Disclosure>
  );
}

/**
 * Create a private Spotify playlist from the open mix (spec 003 §12, T083,
 * T119; ADR-03). **Validated only** (the default once a track is validated)
 * or **All tracks** (owner's D6, `tracksToAdd`), with how many will be added;
 * the filter chips and the Sort never change it. The scope is checked on tap
 * inside `startCreatePlaylist`, which reveals the `needScope` prompt. Inside
 * the quota lock-out the button rests disabled with its line. Every state and
 * failure is inline here, never a banner.
 */
export function CreatePlaylistCard(p: { view: MixView }) {
  const { view } = p;
  const cs = createPlaylistState.value;
  const rows = mixRows.value;
  const choice = createChoiceFor(view.url, rows);
  const validatedCount = tracksToAdd(rows, 'validated').length;
  const allCount = tracksToAdd(rows, 'all').length;
  const count = choice === 'validated' ? validatedCount : allCount;
  const running =
    cs.status === 'resolving' ||
    cs.status === 'creating' ||
    cs.status === 'adding';
  // The one Spotify quota lock-out: said here unless the error says it.
  const lockLine = quotaRefusal(
    'create',
    spotifyLockedUntil(),
    Date.now(),
    formatDateTime
  );
  return (
    <Card title="Create playlist" class="mix-create">
      {allCount > 0 ? (
        <>
          <SegmentedButtons<CreateChoice>
            options={[
              {
                value: 'validated',
                label: `Validated only (${validatedCount})`,
              },
              { value: 'all', label: `All tracks (${allCount})` },
            ]}
            value={choice}
            onChange={(c) => {
              if (!running) createChoice.value = { url: view.url, choice: c };
            }}
          />
          <p class="mix-caption">
            {count > 0
              ? `${plural(count, 'track')} will be added, in set order.`
              : 'No validated track yet: validate tracks with ✓, or choose All tracks.'}
          </p>
          <Button
            variant="filled"
            icon="queue_music"
            disabled={running || count === 0 || lockLine !== null}
            onClick={() => void startCreatePlaylist()}
          >
            {running ? 'Creating playlist…' : 'Create playlist from mix'}
          </Button>
        </>
      ) : (
        <p class="mix-caption">No identified track to add yet.</p>
      )}
      {lockLine !== null && cs.status !== 'error' && !running && (
        <StatusLine kind="warning">{lockLine}</StatusLine>
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
              Added {cs.added} of {cs.total ?? count} before the error.
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
