import type { ImportSummary } from '../history/importer';
import {
  disconnect,
  historySummary,
  importState,
  isSyncBusy,
  lastSyncAt,
  startSync,
  syncState,
} from '../model/state';
import { routeHref } from '../router';
import { Progress } from './components/Progress';
import { formatDate, formatDateTime, plural } from './format';

function historyLine(summary: ImportSummary, zoneAtImport?: string): string {
  const parts = [
    `Imported ${formatDate(summary.importedAt)}:`,
    `${plural(summary.plays, 'play')} across`,
    `${plural(summary.tracks, 'track')}.`,
  ];
  if (summary.range) {
    parts.push(`${formatDate(summary.range.first)} –`);
    parts.push(`${formatDate(summary.range.last)}.`);
  }
  if (zoneAtImport) parts.push(`Months bucketed in ${zoneAtImport}.`);
  return parts.join(' ');
}

function HistoryCard() {
  const summary = historySummary.value;
  const importHref = routeHref({ name: 'import' });
  if (!summary) {
    return (
      <div class="card">
        <h2>Listening history</h2>
        <p>No history imported yet.</p>
        <p>
          <a href={importHref}>Import history</a>
        </p>
      </div>
    );
  }
  // Only a version 2 summary knows which zone bucketed its months; an older
  // one has no zone to compare, so it never shows the mismatch warning.
  const zoneAtImport = summary.version === 2 ? summary.zone : undefined;
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <div class="card">
      <h2>Listening history</h2>
      <p>{historyLine(summary, zoneAtImport)}</p>
      {zoneAtImport && zoneAtImport !== deviceZone && (
        <p class="warn">
          This phone is now on {deviceZone}. Re-import to re-bucket months.
        </p>
      )}
      <p>
        <a href={importHref}>Update import</a>
      </p>
    </div>
  );
}

export function Settings() {
  const state = syncState.value;
  const running = state.status === 'running';
  const locked = state.status === 'locked' && state.retryAt > Date.now();
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
      <HistoryCard />
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
