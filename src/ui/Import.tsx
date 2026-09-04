import type { ImportSummary } from '../history/importer';
import { historySummary, importState, startImport } from '../model/state';
import { Progress } from './components/Progress';
import { formatDate, formatDateTime, plural } from './format';

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
  const c = summary.counts;
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
        <li>Months use {summary.zone}, this phone's zone at import</li>
      )}
      {summary.version === 2 && summary.outcomes && (
        <li>{startsLine(summary.outcomes)}</li>
      )}
      <li>
        Imported {formatDateTime(summary.importedAt)} from{' '}
        {plural(summary.processed.length, 'file')}
      </li>
      <li class="muted">
        Not counted: {c.short.toLocaleString()} under 30 s,{' '}
        {c.podcast.toLocaleString()} podcast, {c.audiobook.toLocaleString()}{' '}
        audiobook, {c.unattributed.toLocaleString()} without a track id,{' '}
        {c.malformed.toLocaleString()} unreadable
      </li>
      {summary.skipped.map((s) => (
        <li class="error" key={s.name}>
          Skipped {s.name}: {s.reason}
        </li>
      ))}
    </ul>
  );
}

export function Import() {
  const state = importState.value;
  const summary = historySummary.value;
  const onChange = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length > 0) void startImport(files);
  };
  return (
    <section>
      <h1>Import listening history</h1>
      <div class="card">
        <h2>How to get the file</h2>
        <ol>
          <li>Open spotify.com/account/privacy and sign in.</li>
          <li>
            Under "Download your data", tick{' '}
            <strong>Extended streaming history</strong> only, then request it.
          </li>
          <li>Confirm the email Spotify sends within 14 days.</li>
          <li>
            When the "your data is ready" email arrives (hours to a few weeks),
            download my_spotify_data.zip to this phone.
          </li>
          <li>
            Pick that zip below. Nothing is uploaded; the file is read here and
            only per-track play counts are kept.
          </li>
        </ol>
      </div>
      <div class="card">
        <label class="file">
          <span>Pick my_spotify_data.zip, or the JSON files inside it</span>
          <input
            type="file"
            accept=".zip,.json,application/zip,application/json"
            multiple
            disabled={state.status === 'running'}
            onChange={onChange}
          />
        </label>
        {state.status === 'running' && (
          <Progress
            label={state.file}
            done={state.index}
            total={state.total}
            unit="files"
          />
        )}
        {state.status === 'error' && <p class="error">{state.message}</p>}
      </div>
      {summary && (
        <div class="card">
          <h2>Last import</h2>
          <Summary summary={summary} />
        </div>
      )}
    </section>
  );
}
