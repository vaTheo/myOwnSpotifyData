import { msg } from '../../i18n';
import {
  isSyncBusy,
  lastSyncAt,
  reachState,
  spotifyBusyMessage,
  spotifyLockedUntil,
  chainView,
  requestJob,
  syncState,
} from '../../model/state';
import { isWaiting, otherStepRuns } from './chain';
import { Button } from '../components/Button';
import { ProgressBar } from '../components/ProgressBar';
import { StatusLine } from '../components/StatusLine';
import { quotaRefusal } from '../../spotify/quotaLock';
import { formatDateTime } from '../format';

/** The item's description, read when drawn (spec 031). */
export function syncDescription(): string {
  return msg().settings.sync.description;
}

/**
 * What the sync item reads, once for its button, its lines and its closed
 * line. The quota lock is a warning until `retryAt`; a lock-out another
 * reader met (Check on Spotify, Create playlist) holds the button too, with
 * its line (S08d).
 */
export function syncView() {
  const state = syncState.value;
  const running = state.status === 'running';
  const locked = state.status === 'locked' && state.retryAt > Date.now();
  // Re-renders when the shared lock lapses (its timer clears the signal).
  const shared = spotifyLockedUntil();
  // Said once: the sync's own line already names the same end.
  const sharedLine =
    locked && state.status === 'locked' && state.retryAt >= (shared ?? 0)
      ? null
      : quotaRefusal('sync', shared, Date.now(), formatDateTime);
  // One Spotify reader at a time (S13): Check on Spotify, Create playlist
  // or Like all songs running rests the button, with its line.
  const busyLine = running ? null : spotifyBusyMessage('sync');
  return { state, running, locked, shared, sharedLine, busyLine };
}

/**
 * Sync now, the item's main button: the one place a playlist read starts
 * (ADR-02). Filled only when it is the action needed now (spec 026).
 */
export function SyncMain(p: { act: boolean }) {
  const { state, running, shared, busyLine } = syncView();
  const text = msg().settings.sync;
  return (
    <Button
      variant={p.act ? 'filled' : 'tonal'}
      disabled={
        isSyncBusy(state) ||
        shared !== null ||
        busyLine !== null ||
        (reachState.value.status === 'running' &&
          !otherStepRuns(chainView.value, 'spotify'))
      }
      onClick={() => requestJob('spotify')}
    >
      {running
        ? text.syncing
        : isWaiting(chainView.value, 'spotify')
          ? msg().settings.words.waitingButton
          : text.syncNow}
    </Button>
  );
}

/**
 * Spotify sync (US5): last sync, progress, lock-outs, the last error, and
 * what Automatic updates does (moved from the Sync status block, spec 027).
 */
export function SyncSection() {
  const { state, locked, sharedLine, busyLine } = syncView();
  const text = msg().settings.sync;
  return (
    <>
      <StatusLine>
        {lastSyncAt.value
          ? text.lastSync(formatDateTime(lastSyncAt.value))
          : text.lastSyncNever}
      </StatusLine>
      {state.status === 'running' && (
        <ProgressBar
          label={state.current ?? text.working}
          done={state.done}
          total={state.total}
          unit={text.playlists}
        />
      )}
      {state.status === 'locked' && (
        <StatusLine kind={locked ? 'warning' : 'info'}>
          {locked
            ? text.quotaAfter(
                state.pending.length,
                formatDateTime(state.retryAt)
              )
            : text.quotaNow(state.pending.length)}
        </StatusLine>
      )}
      {sharedLine !== null && (
        <StatusLine kind="warning">{sharedLine}</StatusLine>
      )}
      {busyLine !== null && <StatusLine kind="warning">{busyLine}</StatusLine>}
      {state.status === 'cancelled' && <StatusLine>{state.message}</StatusLine>}
      {state.status === 'error' && (
        <StatusLine kind="error" quiet>
          {msg().settings.words.lastError(state.message)}
        </StatusLine>
      )}
      <p class="muted settings-credit">{text.autoNote}</p>
    </>
  );
}
