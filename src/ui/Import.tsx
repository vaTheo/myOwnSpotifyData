import { skipReasonText, type ImportSummary } from '../history/importer';
import { msg } from '../i18n';
import { historySummary, importState, startImport } from '../model/state';
import { Card } from './components/Card';
import { FileDrop } from './components/FileDrop';
import { ProgressBar } from './components/ProgressBar';
import { StatusLine } from './components/StatusLine';
import { formatDate, formatDateTime, notCountedLine } from './format';
import { windowClass } from './layout/windowClass';

/** "214,908 starts, 61% played through"; the clause is dropped at zero. */
function startsLine(o: {
  attempts: number;
  finished: number;
  skipped: number;
}): string {
  const t = msg().signin.import;
  const outcomes = o.finished + o.skipped;
  if (outcomes === 0) return t.starts(o.attempts);
  const pct = Math.round((o.finished / outcomes) * 100);
  return t.startsPlayedThrough(o.attempts, pct);
}

function Summary({ summary }: { summary: ImportSummary }) {
  const notCounted = notCountedLine(summary.counts);
  const t = msg().signin.import;
  return (
    <ul class="facts">
      <li>{t.creditedAcross(summary.plays, summary.tracks)}</li>
      <li>{t.matched(summary.matchedTracks)}</li>
      {summary.range && (
        <li>
          {t.range(
            formatDate(summary.range.first),
            formatDate(summary.range.last)
          )}
        </li>
      )}
      {summary.version === 2 && summary.zone && <li>{t.zone(summary.zone)}</li>}
      {summary.version === 2 && summary.outcomes && (
        <li>{startsLine(summary.outcomes)}</li>
      )}
      <li>
        {t.imported(
          formatDateTime(summary.importedAt),
          summary.processed.length
        )}
      </li>
      {notCounted && <li class="muted">{notCounted}</li>}
      {summary.skipped.map((s) => (
        <li class="error" key={s.name}>
          {t.skipped(s.name, skipReasonText(s.reason))}
        </li>
      ))}
    </ul>
  );
}

function Steps() {
  const t = msg().signin.import;
  return (
    <ol>
      <li>{t.step1}</li>
      <li>
        {t.step2Before}
        <strong>{t.step2Strong}</strong>
        {t.step2After}
      </li>
      <li>{t.step3}</li>
      <li>{t.step4}</li>
      <li>{t.step5}</li>
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
  const t = msg().signin.import;
  return (
    <div class="import">
      <Card>
        {summary && (
          <>
            <h2>{t.lastImport}</h2>
            <Summary summary={summary} />
          </>
        )}
        {/* Open until a first import exists; after that the steps fold
            away: they are read once and scrolled past every time after. */}
        <details class="import-steps" open={!summary}>
          <summary>{t.howTo}</summary>
          <Steps />
        </details>
        <h2>{t.theFile}</h2>
        <FileDrop
          label={compact ? t.dropCompact : t.drop}
          hint={t.hint}
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
            unit={t.unitFiles}
          />
        )}
        {state.status === 'cancelled' && (
          <StatusLine>{state.message}</StatusLine>
        )}
        {state.status === 'error' && (
          <StatusLine kind="error">{t.lastError(state.message)}</StatusLine>
        )}
      </Card>
    </div>
  );
}
