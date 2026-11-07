import type { AutoStep, ChainView } from '../../model/autoChain';

/**
 * True while the chain runs another step: a tap on this job's button is
 * then queued (it runs next) instead of being refused (round 006).
 */
export function otherStepRuns(view: ChainView, step: AutoStep): boolean {
  return view.current !== null && view.current !== step;
}

/** The job waits in the chain: its button says so. */
export function isWaiting(view: ChainView, step: AutoStep): boolean {
  return view.waiting.includes(step);
}
