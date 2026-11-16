import { msg } from '../../i18n';
import {
  artistReachSummary,
  jobsBusy,
  model,
  reachCoverage,
  reachState,
  chainView,
  requestJob,
  sharedPort,
} from '../../model/state';
import { Button } from '../components/Button';
import { ProgressBar } from '../components/ProgressBar';
import { StatusLine } from '../components/StatusLine';
import { formatDate } from '../format';
import {
  SOURCE_LABEL,
  pausedLine,
  reachCoverageLine,
  reachRunLine,
  sharedNoticeReach,
  sharedRunLine,
} from './lines';
import { isWaiting, otherStepRuns } from './chain';

/** The item's description, read when drawn (spec 031). */
export function reachDescription(): string {
  return msg().settings.reach.description;
}

/** Look up artists, the item's main button (ADR-04). */
export function ReachMain(p: { act: boolean }) {
  const m = model.value;
  const state = reachState.value;
  const cov = m ? reachCoverage(m) : null;
  const w = msg().settings.words;
  return (
    <Button
      variant={p.act ? 'filled' : 'tonal'}
      disabled={
        state.status === 'running' ||
        (jobsBusy() && !otherStepRuns(chainView.value, 'reach')) ||
        !cov ||
        cov.artists === 0
      }
      onClick={() => requestJob('reach')}
    >
      {state.status === 'running'
        ? w.lookingUp
        : isWaiting(chainView.value, 'reach')
          ? w.waitingButton
          : msg().settings.reach.lookUp}
    </Button>
  );
}

/** Artist reach (US5): the long lookup Under the radar reads (ADR-04). */
export function ReachSection() {
  const m = model.value;
  const state = reachState.value;
  const summary = artistReachSummary.value;
  const cov = m ? reachCoverage(m) : null;
  const sharedLine =
    state.status === 'done' ? sharedRunLine(state.shared, 'artists') : null;
  const sharing = sharedPort() !== undefined;
  const text = msg().settings.reach;
  const w = msg().settings.words;
  return (
    <>
      {cov && cov.artists > 0 ? (
        <StatusLine>{reachCoverageLine(cov)}</StatusLine>
      ) : (
        <StatusLine>{text.syncFirst}</StatusLine>
      )}
      {summary && (
        <StatusLine>{text.asOf(formatDate(summary.ranAt))}</StatusLine>
      )}
      {state.status === 'running' && (
        <ProgressBar
          label={text.resolving(SOURCE_LABEL[state.step])}
          done={state.done}
          total={state.total}
          unit={state.step === 'wikidata' ? text.batches : text.artists}
        />
      )}
      {state.status === 'done' && state.run.lookedUp === 0 && (
        <StatusLine kind="success">{w.nothingNew}</StatusLine>
      )}
      {state.status === 'done' && state.run.lookedUp > 0 && (
        <StatusLine kind="success">{reachRunLine(state.run)}</StatusLine>
      )}
      {sharedLine && (
        <StatusLine kind={sharedLine.kind}>{sharedLine.text}</StatusLine>
      )}
      {state.status !== 'idle' &&
        state.paused.map((step) => (
          <StatusLine key={step} kind="warning">
            {pausedLine(step)}
          </StatusLine>
        ))}
      {state.status === 'error' && (
        <StatusLine kind="error" quiet>
          {w.lastError(state.message)}
        </StatusLine>
      )}
      {sharing && <p class="muted settings-credit">{sharedNoticeReach()}</p>}
      <p class="muted settings-credit">{text.credit}</p>
    </>
  );
}
