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
  SHARED_NOTICE_REACH,
  sharedRunLine,
} from './lines';
import { isWaiting, otherStepRuns } from './chain';

export const REACH_DESCRIPTION =
  'Listeners and fans of your artists, for Under the radar: roughly 45 to 50 minutes for 1,000 artists, and you can stop it and come back.';

/** Look up artists, the item's main button (ADR-04). */
export function ReachMain() {
  const m = model.value;
  const state = reachState.value;
  const cov = m ? reachCoverage(m) : null;
  return (
    <Button
      variant="filled"
      disabled={
        state.status === 'running' ||
        (jobsBusy() && !otherStepRuns(chainView.value, 'reach')) ||
        !cov ||
        cov.artists === 0
      }
      onClick={() => requestJob('reach')}
    >
      {state.status === 'running'
        ? 'Looking up…'
        : isWaiting(chainView.value, 'reach')
          ? 'Waiting…'
          : 'Look up artists'}
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
  return (
    <>
      {cov && cov.artists > 0 ? (
        <StatusLine>{reachCoverageLine(cov)}</StatusLine>
      ) : (
        <StatusLine>Sync your playlists first.</StatusLine>
      )}
      {summary && <StatusLine>as of {formatDate(summary.ranAt)}</StatusLine>}
      {state.status === 'running' && (
        <ProgressBar
          label={`Resolving artists · ${SOURCE_LABEL[state.step]}`}
          done={state.done}
          total={state.total}
          unit={state.step === 'wikidata' ? 'batches' : 'artists'}
        />
      )}
      {state.status === 'done' && state.run.lookedUp === 0 && (
        <StatusLine kind="success">Nothing new to look up.</StatusLine>
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
        <StatusLine kind="error">Last error: {state.message}</StatusLine>
      )}
      {sharing && <p class="muted settings-credit">{SHARED_NOTICE_REACH}</p>}
      <p class="muted settings-credit">
        Artist data via MusicBrainz and ListenBrainz · Deezer · Wikidata (CC0) ·
        Wikipedia (CC BY-SA)
      </p>
    </>
  );
}
