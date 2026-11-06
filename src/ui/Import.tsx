import type { ImportSummary } from '../history/importer';
import { historySummary, importState, startImport } from '../model/state';
import { Card } from './components/Card';
import { FileDrop } from './components/FileDrop';
import { ProgressBar } from './components/ProgressBar';
import { StatusLine } from './components/StatusLine';
import { formatDate, formatDateTime, notCountedLine, plural } from './format';
import { windowClass } from './layout/windowClass';

/** "214,908 starts, 61% played through"; the clause is dropped at zero. */
function startsLine(o: {
  attempts: number;
  finished: number;
  skipped: number;
}): string {
  const starts = plural(o.attempts, 'start');
  const outcomes = o.finished + o.skipped;
  if (outcomes === 0) return starts;
  const pct = Math.round((o.finished / outcomes) * 100);
  return `${starts}, ${pct}% played through`;
}

function Summary({ summary }: { summary: ImportSummary }) {
  const notCounted = notCountedLine(summary.counts);
  return (
    <ul class="facts">
      <li>
        {plural(summary.plays, 'play')} credited across{' '}
        {plural(summary.tracks, 'track')}
      </li>
      <li>{plural(summary.matchedTracks, 'track')} matched your playlists</li>
      {summary.range && (
        <li>
          From {formatDate(summary.range.first)} to{' '}
          {formatDate(summary.range.last)}
        </li>
      )}
      {summary.version === 2 && summary.zone && (
        <li>Months use {summary.zone}, this browser's zone at import</li>
      )}
      {summary.version === 2 && summary.outcomes && (
        <li>{startsLine(summary.outcomes)}</li>
      )}
      <li>
        Imported {formatDateTime(summary.importedAt)} from{' '}
        {plural(summary.processed.length, 'file')}
      </li>
      {notCounted && <li class="muted">{notCounted}</li>}
      {summary.skipped.map((s) => (
        <li class="error" key={s.name}>
          Skipped {s.name}: {s.reason}
        </li>
      ))}
    </ul>
  );
}

function Steps() {
  return (
    <ol>
      <li>Open spotify.com/account/privacy and sign in.</li>
      <li>
        Under "Download your data", tick{' '}
        <strong>Extended streaming history</strong> only, then request it.
      </li>
      <li>Confirm the email Spotify sends within 14 days.</li>
      <li>
        When the "your data is ready" email arrives (hours to a few weeks),
        download my_spotify_data.zip to this device.
      </li>
      <li>
        Pick that zip on this screen. Nothing is uploaded; the file is read here
        and only per-track play counts are kept.
      </li>
    </ol>
  );
}

/**
 * Import listening history (spec 003 §14, FR-039): one card at reading
 * width. The narrower-import question is asked by `startImport` in
 * `model/state.ts`, unchanged; this screen only hands it the files.
 */
export function Import() {
  const state = importState.value;
  const summary = historySummary.value;
  const compact = windowClass.value === 'compact';
  return (
    <div class="import">
      <Card>
        {summary && (
          <>
            <h2>Last import</h2>
            <Summary summary={summary} />
          </>
        )}
        {/* Open until a first import exists; after that the steps fold
            away: they are read once and scrolled past every time after. */}
        <details class="import-steps" open={!summary}>
          <summary>How to get the file</summary>
          <Steps />
        </details>
        <h2>The file</h2>
        <FileDrop
          label={
            compact
              ? 'Choose my_spotify_data.zip'
              : 'Drop my_spotify_data.zip here or choose a file'
          }
          hint="The JSON files inside it work too."
          accept=".zip,.json,application/zip,application/json"
          multiple
          disabled={state.status === 'running'}
          onFiles={(files) => void startImport(files)}
        />
        {state.status === 'running' && (
          <ProgressBar
            label={state.file}
            done={state.index}
            total={state.total}
            unit="files"
          />
        )}
        {state.status === 'cancelled' && (
          <StatusLine>{state.message}</StatusLine>
        )}
        {state.status === 'error' && (
          <StatusLine kind="error">Last error: {state.message}</StatusLine>
        )}
      </Card>
    </div>
  );
}
