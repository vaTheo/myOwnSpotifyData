import {
  isSyncBusy,
  lastSyncAt,
  reachState,
  spotifyBusyMessage,
  spotifyLockedUntil,
  startSync,
  syncState,
} from '../../model/state';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ProgressBar } from '../components/ProgressBar';
import { StatusLine } from '../components/StatusLine';
import { quotaRefusal } from '../../spotify/quotaLock';
import { formatDateTime, plural } from '../format';
import { sectionDomId } from './sections';

/**
 * Spotify sync (US5): the one place a playlist read starts, on a tap
 * (ADR-02). The quota lock is a warning until `retryAt`, as before; a
 * lock-out another reader met (Check on Spotify, Create playlist) holds the
 * button too, with its line (S08d).
 */
export function SyncSection() {
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
  return (
    <Card
      id={sectionDomId('sync')}
      class="settings-section"
      title="Spotify sync"
      description="Copies your playlists from Spotify into this browser, only when you tap Sync now."
    >
      <StatusLine>
        Last sync:{' '}
        {lastSyncAt.value ? formatDateTime(lastSyncAt.value) : 'never'}
      </StatusLine>
      {state.status === 'running' && (
        <ProgressBar
          label={state.current ?? 'Working'}
          done={state.done}
          total={state.total}
        />
      )}
      {state.status === 'locked' && (
        <StatusLine kind={locked ? 'warning' : 'info'}>
          Spotify quota reached with {plural(state.pending.length, 'playlist')}{' '}
          pending.{' '}
          {locked
            ? `Retry after ${formatDateTime(state.retryAt)}.`
            : 'You can retry now.'}
        </StatusLine>
      )}
      {sharedLine !== null && (
        <StatusLine kind="warning">{sharedLine}</StatusLine>
      )}
      {busyLine !== null && <StatusLine kind="warning">{busyLine}</StatusLine>}
      {state.status === 'cancelled' && <StatusLine>{state.message}</StatusLine>}
      {state.status === 'error' && (
        <StatusLine kind="error">Last error: {state.message}</StatusLine>
      )}
      <div class="actions">
        <Button
          variant="filled"
          disabled={
            isSyncBusy(state) ||
            shared !== null ||
            busyLine !== null ||
            reachState.value.status === 'running'
          }
          onClick={() => void startSync()}
        >
          {running ? 'Syncing…' : 'Sync now'}
        </Button>
      </div>
    </Card>
  );
}
