import { reviewLine } from '../../features/mix/review';
import { checkLine, rowsToCheck } from '../../features/mix/spotifyCheck';
import {
  checkLockMessage,
  mixRows,
  spotifyBusyMessage,
  spotifyCheckState,
  spotifyLockedUntil,
  startSpotifyCheck,
  stopSpotifyCheck,
} from '../../model/state';
import { Button } from '../components/Button';
import { ProgressBar } from '../components/ProgressBar';
import { StatusLine } from '../components/StatusLine';

/**
 * The open mix's review line and **Check on Spotify** (spec 003 §12, T117,
 * T118): "N tracks · K validated · M on Spotify · L not found"; the button
 * reads Spotify on a tap only (never on load or open, ADR-02), one track at
 * a time, with "Checked 12 of 40", a bar and Stop; a failure inline, never
 * a banner. The button rests disabled when every named track is checked,
 * and during a quota lock-out, with its message.
 */
export function ReviewHead(p: { url: string }) {
  const rows = mixRows.value;
  const s = spotifyCheckState.value;
  const mine = s.status !== 'idle' && s.url === p.url;
  const running = mine && s.status === 'running';
  const left = rowsToCheck(rows).length;
  // A quota lock-out (the check's or the sync's): no read until it lapses.
  const locked = spotifyLockedUntil();
  // One Spotify reader at a time (S13): a check of another mix, a sync,
  // Create playlist or Like all songs running rests the button.
  const busy =
    s.status === 'running' && !mine
      ? 'Check on Spotify is reading another mix: check this one once it ends.'
      : spotifyBusyMessage('check');
  return (
    <div class="mix-review-head">
      <div class="mix-review-line">
        <p class="mix-caption">{reviewLine(rows)}</p>
        {running ? (
          <Button
            variant="text"
            disabled={s.stopping}
            onClick={() => stopSpotifyCheck()}
          >
            {s.stopping ? 'Stopping…' : 'Stop'}
          </Button>
        ) : (
          <Button
            icon="search"
            disabled={left === 0 || locked !== null || busy !== null}
            onClick={() => void startSpotifyCheck()}
          >
            Check on Spotify
          </Button>
        )}
      </div>
      {running && (
        <div class="mix-item-progress">
          <ProgressBar
            label="Check on Spotify"
            done={s.done}
            total={Math.max(1, s.total)}
            showCount={false}
          />
          <p class="mix-caption" aria-live="polite">
            {checkLine(s.done, s.total)}
          </p>
        </div>
      )}
      {mine && s.status === 'finished' && (
        <p class="mix-caption">
          {s.stopped
            ? `Stopped · ${checkLine(s.done, s.total)}`
            : checkLine(s.done, s.total)}
        </p>
      )}
      {mine && s.status === 'error' ? (
        <StatusLine kind="error">{s.message}</StatusLine>
      ) : (
        !running &&
        (locked !== null ? (
          <StatusLine kind="warning">{checkLockMessage(locked)}</StatusLine>
        ) : (
          busy !== null &&
          left > 0 && <StatusLine kind="warning">{busy}</StatusLine>
        ))
      )}
    </div>
  );
}
