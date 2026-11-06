import {
  isSyncBusy,
  lastSyncAt,
  reachState,
  startSync,
  syncState,
} from '../../model/state';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ProgressBar } from '../components/ProgressBar';
import { StatusLine } from '../components/StatusLine';
import { formatDateTime, plural } from '../format';
import { sectionDomId } from './sections';

/**
 * Spotify sync (US5): the one place a playlist read starts, on a tap
 * (ADR-02). The quota lock is a warning until `retryAt`, as before.
 */
export function SyncSection() {
  const state = syncState.value;
  const running = state.status === 'running';
  const locked = state.status === 'locked' && state.retryAt > Date.now();
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
      {state.status === 'cancelled' && <StatusLine>{state.message}</StatusLine>}
      {state.status === 'error' && (
        <StatusLine kind="error">Last error: {state.message}</StatusLine>
      )}
      <div class="actions">
        <Button
          variant="filled"
          disabled={isSyncBusy(state) || reachState.value.status === 'running'}
          onClick={() => void startSync()}
        >
          {running ? 'Syncing…' : 'Sync now'}
        </Button>
      </div>
    </Card>
  );
}
