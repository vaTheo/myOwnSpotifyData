import { useMemo } from 'preact/hooks';
import { candidateIds } from '../../features/lookup';
import type { Model } from '../../model/aggregate';
import { yearOf } from '../../model/year';
import {
  coverage,
  jobsBusy,
  keyNotation,
  lookupState,
  model,
  rekordboxState,
  rekordboxSummary,
  setKeyNotation,
  chainView,
  requestJob,
  startRekordboxImport,
  type KeyNotation,
} from '../../model/state';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { FileDrop } from '../components/FileDrop';
import { ProgressBar } from '../components/ProgressBar';
import { SegmentedButtons } from '../components/SegmentedButtons';
import { StatusLine } from '../components/StatusLine';
import { formatDate } from '../format';
import {
  coverageLine,
  lookupDoneLine,
  rekordboxLine,
  yearsLine,
} from './lines';
import { isWaiting, otherStepRuns } from './chain';
import { sectionDomId } from './sections';

const NOTATIONS: { value: KeyNotation; label: string }[] = [
  { value: 'camelot', label: 'Camelot' },
  { value: 'open', label: 'Open Key' },
  { value: 'classic', label: 'Classic' },
];

/** Round 005: the candidates of the BPM coverage that `yearOf` dates. */
function datedCount(m: Model): number {
  let dated = 0;
  for (const candidate of candidateIds(m)) {
    if (yearOf(m, candidate.id) !== null) dated++;
  }
  return dated;
}

/** Audio data (US5): the ReccoBeats lookup, the Rekordbox XML, key notation. */
export function AudioSection() {
  const m = model.value;
  const lookup = lookupState.value;
  const rekordbox = rekordboxState.value;
  const summary = rekordboxSummary.value;
  // Every job ends in loadFromDb(), so no two of the five ever overlap
  // (spec §5.5): jobsBusy() gates this section as well as Disconnect.
  const busy = jobsBusy();
  const cov = m ? coverage(m) : null;
  // The year scan reads every Top list per track: once per model, not once
  // per progress tick.
  const dated = useMemo(() => (m ? datedCount(m) : 0), [m]);
  const blocked = busy || !cov || cov.total === 0;
  // A tap while the chain runs another step is queued (round 006).
  const lookupBlocked =
    lookup.status === 'running' ||
    (busy && !otherStepRuns(chainView.value, 'features')) ||
    !cov ||
    cov.total === 0;
  return (
    <Card
      id={sectionDomId('audio')}
      class="settings-section"
      title="Audio data"
      description="BPM and key for your tracks, from ReccoBeats and your Rekordbox collection; release years from ReccoBeats."
    >
      {cov && cov.total > 0 ? (
        <>
          <StatusLine>{coverageLine(cov)}</StatusLine>
          <StatusLine>{yearsLine(dated, cov.total)}</StatusLine>
        </>
      ) : (
        <StatusLine>Sync or import a history first.</StatusLine>
      )}
      {lookup.status === 'running' && (
        <ProgressBar
          label={`Looking up · ${lookup.pass}`}
          done={lookup.done}
          total={lookup.total}
          unit="tracks"
        />
      )}
      {lookup.status === 'done' && lookup.total === 0 && lookup.years === 0 && (
        <StatusLine kind="success">Nothing new to look up.</StatusLine>
      )}
      {lookup.status === 'done' && (lookup.total > 0 || lookup.years > 0) && (
        <StatusLine kind="success">{lookupDoneLine(lookup)}</StatusLine>
      )}
      {lookup.status === 'error' && (
        <StatusLine kind="error">Last error: {lookup.message}</StatusLine>
      )}
      <div class="actions">
        <Button
          variant="filled"
          disabled={lookupBlocked}
          onClick={() => requestJob('features')}
        >
          {lookup.status === 'running'
            ? 'Looking up…'
            : isWaiting(chainView.value, 'features')
              ? 'Waiting…'
              : 'Look up BPM and key'}
        </Button>
      </div>
      <FileDrop
        label="Rekordbox collection XML (File > Export Collection)"
        hint="Drop the XML here or choose it"
        accept=".xml,text/xml,application/xml"
        disabled={blocked}
        onFiles={([file]) => void startRekordboxImport(file)}
      />
      {rekordbox.status === 'running' && (
        <ProgressBar
          label={rekordbox.file}
          done={rekordbox.index}
          total={rekordbox.total}
          unit="files"
        />
      )}
      {rekordbox.status === 'error' && (
        <StatusLine kind="error">Last error: {rekordbox.message}</StatusLine>
      )}
      {summary && (
        <StatusLine>
          {rekordboxLine(summary)} · imported {formatDate(summary.importedAt)}
        </StatusLine>
      )}
      <h3 class="settings-label">Key notation</h3>
      <SegmentedButtons
        options={NOTATIONS}
        value={keyNotation.value}
        onChange={setKeyNotation}
      />
      <p class="muted settings-credit">
        Audio data via ReccoBeats (Spotify audio features).
      </p>
    </Card>
  );
}
