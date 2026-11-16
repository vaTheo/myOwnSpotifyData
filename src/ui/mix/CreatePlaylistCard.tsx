import { auth } from '../../auth/browser';
import { tracksToAdd } from '../../features/mix/createPlaylist';
import { digRows } from '../../features/mix/digLinks';
import {
  createPlaylistState,
  isCreating,
  mixRows,
  spotifyBusyMessage,
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
import { msg } from '../../i18n';
import { formatClock, formatDateTime } from '../format';
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
        rows.length !== n
          ? msg().mix.create.notFoundSongs(n, rows.length)
          : msg().mix.create.notFound(n)
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
 * T119; ADR-03). Every identified track is added (round 010, `tracksToAdd`),
 * with how many; the filter chips and the Sort never change it. The scope is checked on tap
 * inside `startCreatePlaylist`, which reveals the `needScope` prompt. Inside
 * the quota lock-out the button rests disabled with its line. Every state and
 * failure is inline here, never a banner.
 */
export function CreatePlaylistCard(p: { view: MixView }) {
  const { view } = p;
  const job = createPlaylistState.value;
  // Only this mix's run shows here (S13 B2); a run for another mix rests
  // the button with a line.
  const cs =
    job.status === 'idle' || job.mixUrl === view.url
      ? job
      : ({ status: 'idle' } as const);
  const elsewhere = isCreating(job) && job.mixUrl !== view.url;
  const rows = mixRows.value;
  const count = tracksToAdd(rows).length;
  const running = isCreating(cs);
  // The one Spotify quota lock-out: said here unless the error says it.
  const lockLine = quotaRefusal(
    'create',
    spotifyLockedUntil(),
    Date.now(),
    formatDateTime
  );
  // One Spotify reader at a time (S13): another one running rests it.
  const t = msg().mix.create;
  const busyLine = elsewhere ? t.busyElsewhere : spotifyBusyMessage('create');
  return (
    <Card title={t.title} class="mix-create">
      {count > 0 ? (
        <>
          <p class="mix-caption">{t.willAdd(count)}</p>
          <Button
            variant="filled"
            icon="queue_music"
            disabled={running || lockLine !== null || busyLine !== null}
            onClick={() => void startCreatePlaylist()}
          >
            {running ? t.creatingButton : t.button}
          </Button>
        </>
      ) : (
        <p class="mix-caption">{t.nothing}</p>
      )}
      {lockLine !== null && cs.status !== 'error' && !running && (
        <StatusLine kind="warning">{lockLine}</StatusLine>
      )}
      {busyLine !== null &&
        lockLine === null &&
        cs.status !== 'error' &&
        !running && <StatusLine kind="warning">{busyLine}</StatusLine>}
      {cs.status === 'needScope' && (
        <>
          <StatusLine kind="warning">{t.needScope}</StatusLine>
          <Button onClick={() => auth.logout()}>{t.connectAgain}</Button>
        </>
      )}
      {cs.status === 'resolving' && (
        <ProgressBar
          label={t.matching}
          done={cs.done}
          total={cs.total}
          unit={t.unit}
        />
      )}
      {cs.status === 'creating' && <StatusLine>{t.creating}</StatusLine>}
      {cs.status === 'adding' && <StatusLine>{t.adding}</StatusLine>}
      {cs.status === 'done' && (
        <>
          {/* The name is the one written on Spotify, kept as it is (FR-013). */}
          <StatusLine kind="success">
            {t.created(cs.name, cs.added, cs.total)}
          </StatusLine>
          {cs.url !== null && <SpotifyLink href={cs.url} label />}
          {cs.unmatched.length > 0 && <NotFound unmatched={cs.unmatched} />}
        </>
      )}
      {cs.status === 'error' && (
        <>
          <StatusLine kind="error">{t.failed(cs.message)}</StatusLine>
          {cs.url != null && (
            <p>
              {t.playlistCreated} <SpotifyLink href={cs.url} label />
            </p>
          )}
          {/* `!== undefined`, not truthiness: a batch-1 failure reports
              `added: 0`, and "Added 0 of N before the error." must still
              show. */}
          {cs.added !== undefined && (
            <p class="mix-caption">
              {t.addedBefore(cs.added, cs.total ?? count)}
            </p>
          )}
        </>
      )}
      {view.playlistUrl != null &&
        (cs.status === 'idle' || cs.status === 'needScope') && (
          <p>
            {t.playlistCreated} <SpotifyLink href={view.playlistUrl} label />
          </p>
        )}
    </Card>
  );
}
