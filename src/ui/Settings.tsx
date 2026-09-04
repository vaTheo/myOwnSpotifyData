import {
  disconnect,
  historySummary,
  importState,
  isSyncBusy,
  lastSyncAt,
  startSync,
  syncState,
} from '../model/state';
import { Progress } from './components/Progress';
import { formatDateTime, plural } from './format';

export function Settings() {
  const state = syncState.value;
  const running = state.status === 'running';
  const locked = state.status === 'locked' && state.retryAt > Date.now();
  const history = historySummary.value;
  const working = running || importState.value.status === 'running';
  return (
    <section>
      <h1>Settings</h1>
      <div class="card">
        <h2>Spotify sync</h2>
        <p>
          Last sync:{' '}
          {lastSyncAt.value ? formatDateTime(lastSyncAt.value) : 'never'}
        </p>
        {state.status === 'running' && (
          <Progress
            label={state.current ?? 'Working'}
            done={state.done}
            total={state.total}
          />
        )}
        {state.status === 'locked' && (
          <p class={locked ? 'warn' : ''}>
            Spotify quota reached with{' '}
            {plural(state.pending.length, 'playlist')} pending.{' '}
            {locked
              ? `Retry after ${formatDateTime(state.retryAt)}.`
              : 'You can retry now.'}
          </p>
        )}
        {state.status === 'error' && (
          <p class="error">Last error: {state.message}</p>
        )}
        <button
          type="button"
          class="primary"
          disabled={isSyncBusy(state)}
          onClick={() => void startSync()}
        >
          {running ? 'Syncing…' : 'Sync now'}
        </button>
      </div>
      <div class="card">
        <h2>Listening history</h2>
        <p>
          {history
            ? `Imported ${formatDateTime(history.importedAt)}: ${plural(history.plays, 'play')}.`
            : 'No history imported yet. Use the Import tab.'}
        </p>
      </div>
      <div class="card">
        <h2>Disconnect</h2>
        <p>
          Removes the Spotify login and deletes every cached playlist and play
          count from this browser.
        </p>
        <button
          type="button"
          class="danger"
          disabled={working}
          onClick={() => {
            if (confirm('Disconnect and delete all local data?')) {
              void disconnect();
            }
          }}
        >
          Disconnect
        </button>
      </div>
      <p class="muted">DJ Data v{__APP_VERSION__}</p>
    </section>
  );
}
