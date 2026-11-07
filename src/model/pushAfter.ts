import type { LookupState } from '../features/lookup';
import type { ReachState } from '../features/reachRun';

/**
 * Whether a finished run changed its dataset, so it is worth a push to the
 * server (round 006). The automatic chain runs these jobs on every return to
 * the app; a run with nothing to look up still stamps a new time, and pushing
 * on that alone re-sent the whole dataset each time, back and forth between
 * two devices.
 */
export function featuresChanged(state: LookupState): boolean {
  return state.status === 'done' && (state.total > 0 || state.years > 0);
}

export function reachChanged(state: ReachState): boolean {
  return (
    state.status === 'done' && (state.run.lookedUp > 0 || state.run.written > 0)
  );
}
