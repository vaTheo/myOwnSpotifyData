import { useState } from 'preact/hooks';
import { auth } from '../auth/browser';
import type { ReachRunCounts, ReachStep } from '../features/reachRun';
import type { RekordboxSummary } from '../features/rekordboxImport';
import type { ImportSummary } from '../history/importer';
import {
  artistReachSummary,
  coverage,
  disconnect,
  historySummary,
  isSyncBusy,
  jobsBusy,
  keyNotation,
  lastSyncAt,
  lookupState,
  model,
  reachCoverage,
  reachState,
  rekordboxState,
  rekordboxSummary,
  removeServerData,
  serverLastSyncAt,
  serverLinkSent,
  serverSession,
  serverState,
  setKeyNotation,
  startLookup,
  startServerLink,
  startServerSignOut,
  startServerSync,
  SERVER_FREE_BYTES,
  startReach,
  startRekordboxImport,
  startSync,
  syncState,
  type Coverage,
  type KeyNotation,
  type ReachCoverage,
} from '../model/state';
import { routeHref } from '../router';
import { ProgressBar } from './components/ProgressBar';
import { SegmentedButtons } from './components/SegmentedButtons';
import { formatDate, formatDateTime, plural } from './format';

/** The sign-in form of the server card: an email, a magic link (research D3). */
function ServerSignIn() {
  const [email, setEmail] = useState('');
  const sent = serverLinkSent.value;
  return (
    <>
      <p class="muted">
        Sign in to your server with a link sent to your email. Open the link in
        this browser, within 10 minutes.
      </p>
      <input
        class="filter"
        type="email"
        placeholder="Email"
        autocomplete="email"
        value={email}
        onInput={(e) => setEmail((e.currentTarget as HTMLInputElement).value)}
      />
      <div class="actions">
        <button
          type="button"
          class="primary"
          disabled={email.trim() === ''}
          onClick={() => void startServerLink(email)}
        >
          Send me a link
        </button>
      </div>
      {sent !== null && (
        <p class="muted">
          If this email has an account, a link was sent to {sent}. Open it in
          this browser within 10 minutes.
        </p>
      )}
    </>
  );
}

function usedShare(bytes: number): string {
  const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);
  return `${mb(bytes)} MB of ${mb(SERVER_FREE_BYTES)} MB used on the server`;
}

function ServerCard() {
  const state = serverState.value;
  const session = serverSession.value;
  const lastSync = serverLastSyncAt.value;
  const working =
    jobsBusy() || state.status === 'pushing' || state.status === 'pulling';
  if (state.status === 'unset') {
    return (
      <div class="card">
        <h2>Server</h2>
        <p class="muted">
          No server set up. This browser keeps its own data. To share it across
          your devices, set the two server values described in the README.
        </p>
      </div>
    );
  }
  return (
    <div class="card">
      <h2>Server</h2>
      {state.status === 'error' && <p class="error">{state.message}</p>}
      {state.status === 'offline' && (
        <p class="warn">
          Server offline: {state.message} Last sync{' '}
          {lastSync ? formatDateTime(lastSync) : 'never'}. Local data is in use.
        </p>
      )}
      {state.status === 'paused' && (
        <p class="warn">
          Server paused. Resume it from the{' '}
          <a href={state.dashboardUrl} target="_blank" rel="noopener">
            Supabase dashboard
          </a>
          , then open the app again. Local data is in use.
        </p>
      )}
      {session === null ? (
        <ServerSignIn />
      ) : (
        <>
          <p>Connected as {session.email || 'the owner'}.</p>
          {state.status === 'connected' && (
            <>
              <p class="muted">
                Last sync with the server:{' '}
                {state.lastSyncAt ? formatDateTime(state.lastSyncAt) : 'never'}
              </p>
              <table class="stamps">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Here</th>
                    <th>Server</th>
                    <th>Rows</th>
                  </tr>
                </thead>
                <tbody>
                  {state.stamps.map((row) => (
                    <tr key={row.name}>
                      <td>{row.name}</td>
                      <td>{row.localAt ? formatDateTime(row.localAt) : '—'}</td>
                      <td>
                        {row.serverAt ? formatDateTime(row.serverAt) : '—'}
                      </td>
                      <td>{row.rows ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {state.rejected > 0 && (
                <p class="warn">
                  {plural(state.rejected, 'row')} rejected by the safety check
                  and left out.
                </p>
              )}
              {state.usedBytes !== null && (
                <p class="muted">{usedShare(state.usedBytes)}</p>
              )}
            </>
          )}
          <div class="actions">
            <button
              type="button"
              class="primary"
              disabled={working}
              onClick={() => void startServerSync()}
            >
              Sync now with server
            </button>
            <button
              type="button"
              disabled={working}
              onClick={() => void startServerSignOut()}
            >
              Sign out
            </button>
            <button
              type="button"
              class="danger"
              disabled={working}
              onClick={() => void removeServerData()}
            >
              Remove server data
            </button>
          </div>
          <p class="muted">
            Sign out keeps your data here and on the server. Remove server data
            deletes everything on the server and keeps this browser's copy.
          </p>
          {(state.status === 'pushing' || state.status === 'pulling') && (
            <ProgressBar
              label={`${state.status === 'pushing' ? 'Sending' : 'Fetching'} ${state.dataset}`}
              done={state.done}
              total={state.total}
              unit="rows"
            />
          )}
        </>
      )}
    </div>
  );
}

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

/** Spec §5: "BPM and key for 3,120 of 4,980 tracks · ReccoBeats 2,900 · …". */
function coverageLine(c: Coverage): string {
  const total = plural(c.total, 'track');
  return [
    `BPM and key for ${c.covered.toLocaleString()} of ${total}`,
    `ReccoBeats ${c.reccobeats.toLocaleString()}`,
    `Rekordbox ${c.rekordbox.toLocaleString()}`,
  ].join(' · ');
}

/** "parsed 1,204 · with BPM 1,190 · with key 1,050 · matched 820 · …" */
function rekordboxLine(s: RekordboxSummary): string {
  return [
    `parsed ${s.parsed.toLocaleString()}`,
    `with BPM ${s.withBpm.toLocaleString()}`,
    `with key ${s.withKey.toLocaleString()}`,
    `matched ${s.matched.toLocaleString()}`,
    `unmatched ${s.unmatched.toLocaleString()}`,
  ].join(' · ');
}

const NOTATIONS: { value: KeyNotation; label: string }[] = [
  { value: 'camelot', label: 'Camelot' },
  { value: 'open', label: 'Open Key' },
  { value: 'classic', label: 'Classic' },
];

function AudioCard() {
  const m = model.value;
  const lookup = lookupState.value;
  const rekordbox = rekordboxState.value;
  const summary = rekordboxSummary.value;
  // Every job ends in loadFromDb(), so no two of the five ever overlap
  // (spec §5.5): jobsBusy() gates this card as well as Disconnect.
  const busy = jobsBusy();
  const onXml = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) void startRekordboxImport(file);
  };
  const cov = m ? coverage(m) : null;
  return (
    <div class="card">
      <h2>Audio data</h2>
      {cov && cov.total > 0 ? (
        <p>{coverageLine(cov)}</p>
      ) : (
        <p class="muted">Sync or import a history first.</p>
      )}
      {lookup.status === 'running' && (
        <ProgressBar
          label={`Looking up · ${lookup.pass}`}
          done={lookup.done}
          total={lookup.total}
          unit="tracks"
        />
      )}
      {lookup.status === 'done' && lookup.total === 0 && (
        <p class="muted">Nothing new to look up.</p>
      )}
      {lookup.status === 'done' && lookup.total > 0 && (
        <p class="muted">
          found {lookup.found.toLocaleString()} · not found{' '}
          {lookup.notFound.toLocaleString()}
        </p>
      )}
      {lookup.status === 'error' && (
        <p class="error">Last error: {lookup.message}</p>
      )}
      <button
        type="button"
        disabled={busy || !cov || cov.total === 0}
        onClick={() => void startLookup()}
      >
        {lookup.status === 'running' ? 'Looking up…' : 'Look up (ReccoBeats)'}
      </button>
      <label class="file">
        <span>Rekordbox collection XML (File &gt; Export Collection)</span>
        <input
          type="file"
          accept=".xml,text/xml,application/xml"
          disabled={busy || !cov || cov.total === 0}
          onChange={onXml}
        />
      </label>
      {rekordbox.status === 'running' && (
        <ProgressBar
          label={rekordbox.file}
          done={rekordbox.index}
          total={rekordbox.total}
          unit="files"
        />
      )}
      {rekordbox.status === 'error' && (
        <p class="error">Last error: {rekordbox.message}</p>
      )}
      {summary && (
        <p class="muted">
          {rekordboxLine(summary)} · imported {formatDate(summary.importedAt)}
        </p>
      )}
      <p class="muted">Key notation</p>
      <SegmentedButtons
        options={NOTATIONS}
        value={keyNotation.value}
        onChange={setKeyNotation}
      />
      <p class="muted">Audio data via ReccoBeats (Spotify audio features).</p>
    </div>
  );
}

const SOURCE_LABEL: Record<ReachStep, string> = {
  musicbrainz: 'MusicBrainz',
  listenbrainz: 'ListenBrainz',
  deezer: 'Deezer',
  wikidata: 'Wikidata',
  wikipedia: 'Wikipedia',
};

/**
 * Spec §5.5: "Reach data for 806 of 1,204 artists · MusicBrainz 1,151 · …".
 * The source counts overlap on purpose, exactly as the Audio data card's do,
 * so they can add up to more than `covered`.
 */
function reachCoverageLine(c: ReachCoverage): string {
  const artists = plural(c.artists, 'artist');
  return [
    `Reach data for ${c.covered.toLocaleString()} of ${artists}`,
    `MusicBrainz ${c.resolved.toLocaleString()}`,
    `ListenBrainz ${c.listenbrainz.toLocaleString()}`,
    `Deezer ${c.deezer.toLocaleString()}`,
    `Wikipedia ${c.wikipedia.toLocaleString()}`,
    `well known ${c.wellKnown.toLocaleString()}`,
  ].join(' · ');
}

/**
 * What this run did, never what the store holds: `lookedUp` and `written`
 * are run-scoped, and `unresolved` is the whole-store figure the owner asks
 * for once a run has stopped (spec §5.5).
 */
function reachRunLine(run: ReachRunCounts): string {
  return [
    `Looked up ${plural(run.lookedUp, 'artist')}`,
    plural(run.written, 'new number'),
    `${run.unresolved.toLocaleString()} unresolved`,
  ].join(' · ');
}

function pausedLine(step: ReachStep): string {
  return (
    `${SOURCE_LABEL[step]} stopped answering after three tries; ` +
    'the rest of this run skipped it.'
  );
}

function ReachCard() {
  const m = model.value;
  const state = reachState.value;
  const summary = artistReachSummary.value;
  const busy = jobsBusy();
  const cov = m ? reachCoverage(m) : null;
  return (
    <div class="card">
      <h2>Artist reach</h2>
      {cov && cov.artists > 0 ? (
        <p>{reachCoverageLine(cov)}</p>
      ) : (
        <p class="muted">Sync your playlists first.</p>
      )}
      {state.status === 'running' && (
        <ProgressBar
          label={`Resolving artists · ${SOURCE_LABEL[state.step]}`}
          done={state.done}
          total={state.total}
          unit={state.step === 'wikidata' ? 'batches' : 'artists'}
        />
      )}
      {state.status === 'done' && state.run.lookedUp === 0 && (
        <p class="muted">Nothing new to look up.</p>
      )}
      {state.status === 'done' && state.run.lookedUp > 0 && (
        <p class="muted">{reachRunLine(state.run)}</p>
      )}
      {state.status !== 'idle' &&
        state.paused.map((step) => (
          <p key={step} class="warn">
            {pausedLine(step)}
          </p>
        ))}
      {state.status === 'error' && (
        <p class="error">Last error: {state.message}</p>
      )}
      <button
        type="button"
        disabled={busy || !cov || cov.artists === 0}
        onClick={() => void startReach()}
      >
        {state.status === 'running' ? 'Looking up…' : 'Look up artists'}
      </button>
      {summary && <p class="muted">as of {formatDate(summary.ranAt)}</p>}
      <p class="muted">
        Artist data via MusicBrainz and ListenBrainz · Deezer · Wikidata (CC0) ·
        Wikipedia (CC BY-SA)
      </p>
    </div>
  );
}

export function Settings() {
  const state = syncState.value;
  const running = state.status === 'running';
  const locked = state.status === 'locked' && state.retryAt > Date.now();
  // One predicate for all five jobs: the wipe below and the reach run must
  // never overlap either (spec §5.5).
  const working = jobsBusy();
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
          <ProgressBar
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
        {state.status === 'cancelled' && <p class="muted">{state.message}</p>}
        {state.status === 'error' && (
          <p class="error">Last error: {state.message}</p>
        )}
        <div class="actions">
          <button
            type="button"
            class="primary"
            disabled={
              isSyncBusy(state) || reachState.value.status === 'running'
            }
            onClick={() => void startSync()}
          >
            {running ? 'Syncing…' : 'Sync now'}
          </button>
          <button
            type="button"
            disabled={working}
            onClick={() => auth.logout()}
          >
            Connect again
          </button>
        </div>
        <p class="muted">
          Connect again signs you out and back in. Nothing on this phone is
          deleted.
        </p>
      </div>
      <HistoryCard />
      <AudioCard />
      <ReachCard />
      <ServerCard />
      <div class="card">
        <h2>Disconnect</h2>
        <p>
          Removes the Spotify login and deletes every cached playlist and play
          count from this browser. Server data is kept.
        </p>
        <button
          type="button"
          class="danger"
          disabled={working}
          onClick={() => {
            if (
              confirm(
                'Disconnect and delete all local data? Server data is kept.'
              )
            ) {
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
