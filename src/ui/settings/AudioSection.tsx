import { useMemo } from 'preact/hooks';
import {
  candidateIds,
  PASS_BY_ID,
  PASS_BY_ISRC,
  PASS_RIDS,
  PASS_SHARED,
  PASS_YEARS,
} from '../../features/lookup';
import { msg } from '../../i18n';
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
  sharedPort,
  setKeyNotation,
  chainView,
  requestJob,
  startRekordboxImport,
  type KeyNotation,
} from '../../model/state';
import { Button } from '../components/Button';
import { FileDrop } from '../components/FileDrop';
import { ProgressBar } from '../components/ProgressBar';
import { SegmentedButtons } from '../components/SegmentedButtons';
import { StatusLine } from '../components/StatusLine';
import { formatDate } from '../format';
import {
  coverageLine,
  lookupDoneLine,
  rekordboxLine,
  sharedNoticeBpm,
  sharedRunLine,
  yearsLine,
} from './lines';
import { isWaiting, otherStepRuns } from './chain';

/** The key notations; Camelot and Open Key are names, Classic is a word. */
const notations = (): { value: KeyNotation; label: string }[] => [
  { value: 'camelot', label: 'Camelot' },
  { value: 'open', label: 'Open Key' },
  { value: 'classic', label: msg().settings.audio.classic },
];

/** A look-up pass (a `PASS_*` constant of `lookup.ts`) in the words shown. */
function passLabel(pass: string): string {
  const text = msg().settings.audio;
  const labels: Record<string, string> = {
    [PASS_BY_ID]: text.passById,
    [PASS_BY_ISRC]: text.passByIsrc,
    [PASS_YEARS]: text.passYears,
    [PASS_RIDS]: text.passRids,
    [PASS_SHARED]: text.passShared,
  };
  return Object.hasOwn(labels, pass) ? labels[pass] : pass;
}

/** Round 005: the candidates of the BPM coverage that `yearOf` dates. */
export function datedCount(m: Model): number {
  let dated = 0;
  for (const candidate of candidateIds(m)) {
    if (yearOf(m, candidate.id) !== null) dated++;
  }
  return dated;
}

/** The item's description, read when drawn (spec 031). */
export function audioDescription(): string {
  return msg().settings.audio.description;
}

/** The look-up's button state; a tap while the chain runs another step is queued (round 006). */
function lookupBlocked(): boolean {
  const m = model.value;
  const cov = m ? coverage(m) : null;
  // Every job ends in loadFromDb(), so no two of the five ever overlap
  // (spec §5.5): jobsBusy() gates this item as well as Disconnect.
  return (
    lookupState.value.status === 'running' ||
    (jobsBusy() && !otherStepRuns(chainView.value, 'features')) ||
    !cov ||
    cov.total === 0
  );
}

/** Look up BPM and key, the item's main button. */
export function AudioMain(p: { act: boolean }) {
  const lookup = lookupState.value;
  const w = msg().settings.words;
  return (
    <Button
      variant={p.act ? 'filled' : 'tonal'}
      disabled={lookupBlocked()}
      onClick={() => requestJob('features')}
    >
      {lookup.status === 'running'
        ? w.lookingUp
        : isWaiting(chainView.value, 'features')
          ? w.waitingButton
          : msg().settings.audio.lookUp}
    </Button>
  );
}

/** Audio data (US5): the ReccoBeats lookup, the Rekordbox XML, key notation. */
export function AudioSection() {
  const m = model.value;
  const lookup = lookupState.value;
  const rekordbox = rekordboxState.value;
  const summary = rekordboxSummary.value;
  const busy = jobsBusy();
  const cov = m ? coverage(m) : null;
  // The year scan reads every Top list per track: once per model, not once
  // per progress tick.
  const dated = useMemo(() => (m ? datedCount(m) : 0), [m]);
  const sharedLine =
    lookup.status === 'done' ? sharedRunLine(lookup.shared) : null;
  // The notice shows only with server settings and a session (never the demo).
  const sharing = sharedPort() !== undefined;
  const blocked = busy || !cov || cov.total === 0;
  const text = msg().settings.audio;
  const w = msg().settings.words;
  return (
    <>
      {cov && cov.total > 0 ? (
        <>
          <StatusLine>{coverageLine(cov)}</StatusLine>
          <StatusLine>{yearsLine(dated, cov.total)}</StatusLine>
        </>
      ) : (
        <StatusLine>{text.syncFirst}</StatusLine>
      )}
      {lookup.status === 'running' && (
        <ProgressBar
          label={text.lookingUpPass(passLabel(lookup.pass))}
          done={lookup.done}
          total={lookup.total}
          unit={text.tracks}
        />
      )}
      {lookup.status === 'done' && lookup.total === 0 && lookup.years === 0 && (
        <StatusLine kind="success">{w.nothingNew}</StatusLine>
      )}
      {lookup.status === 'done' && (lookup.total > 0 || lookup.years > 0) && (
        <StatusLine kind="success">{lookupDoneLine(lookup)}</StatusLine>
      )}
      {lookup.status === 'done' && sharedLine && (
        <StatusLine kind={sharedLine.kind}>{sharedLine.text}</StatusLine>
      )}
      {lookup.status === 'error' && (
        <StatusLine kind="error" quiet>
          {w.lastError(lookup.message)}
        </StatusLine>
      )}
      {sharing && <p class="muted settings-credit">{sharedNoticeBpm()}</p>}
      <FileDrop
        label={text.xmlLabel}
        hint={text.xmlHint}
        accept=".xml,text/xml,application/xml"
        disabled={blocked}
        onFiles={([file]) => void startRekordboxImport(file)}
      />
      {rekordbox.status === 'running' && (
        <ProgressBar
          label={rekordbox.file}
          done={rekordbox.index}
          total={rekordbox.total}
          unit={text.files}
        />
      )}
      {rekordbox.status === 'error' && (
        <StatusLine kind="error" quiet>
          {w.lastError(rekordbox.message)}
        </StatusLine>
      )}
      {summary && (
        <StatusLine>
          {[
            rekordboxLine(summary),
            text.importedOn(formatDate(summary.importedAt)),
          ].join(' · ')}
        </StatusLine>
      )}
      <h3 class="settings-label">{text.keyNotation}</h3>
      <SegmentedButtons
        options={notations()}
        value={keyNotation.value}
        onChange={setKeyNotation}
      />
      <p class="muted settings-credit">{text.credit}</p>
    </>
  );
}
