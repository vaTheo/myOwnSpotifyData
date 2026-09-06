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
  setKeyNotation,
  startLookup,
  startReach,
  startRekordboxImport,
  startSync,
  syncState,
  type Coverage,
  type KeyNotation,
  type ReachCoverage,
} from '../model/state';
import { routeHref } from '../router';
import { Progress } from './components/Progress';
import { Segmented } from './components/Segmented';
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
        <Progress
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
        <Progress
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
      <Segmented
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
        <Progress
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

/**
 * Spec §5.1: a plain link card, like the history card — no run, no state, so
 * it reads no `jobsBusy()`. `#/mix` is always reachable (spec §2): the screen
 * needs no import and no sync first.
 */
function MixCard() {
  return (
    <div class="card">
      <h2>Mix tracklist</h2>
      <p>
        Paste a SoundCloud DJ-mix link to draft its tracklist from public
        sources — or type your own.
      </p>
      <p>
        <a href={routeHref({ name: 'mix' })}>Open mix tracklist ›</a>
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
      <MixCard />
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
