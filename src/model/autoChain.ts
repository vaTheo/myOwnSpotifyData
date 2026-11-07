/**
 * The automatic updates chain (round 006, ADR-11). After the server sync of
 * an open or a return to the app, it runs the Spotify sync when the library
 * is older than `AUTO_SYNC_AGE_MS`, then the BPM and key run, then Artist
 * reach: one at a time, never while another library job runs. Pure: the jobs
 * and every predicate are injected, so `state.ts` wires it and the tests
 * drive it with fakes.
 *
 * - A step that failed is not run again by the chain in the same page
 *   session (no retry loop); a tap, or the next open, runs it.
 * - The Spotify step runs at most once per page session, and never while
 *   Spotify's lock-out lasts.
 * - A tap (`request`) runs next, before the rest of the chain, even with the
 *   switch off.
 */

export type AutoStep = 'spotify' | 'features' | 'reach';

export const AUTO_STEPS: readonly AutoStep[] = ['spotify', 'features', 'reach'];

/** The library age after which an open syncs Spotify by itself. */
export const AUTO_SYNC_AGE_MS = 12 * 60 * 60 * 1000;

export type StepResult = 'done' | 'failed';

export interface ChainView {
  current: AutoStep | null;
  /** In run order, taps first. */
  waiting: AutoStep[];
  /** Steps that failed in this page session. */
  failed: AutoStep[];
}

export interface ChainDeps {
  /** The Automatic updates switch. */
  autoOn(): boolean;
  /** A Spotify session exists. */
  signedIn(): boolean;
  /** `jobsBusy()`. */
  busy(): boolean;
  /** Resolves once `busy()` is false. */
  waitIdle(): Promise<void>;
  now(): number;
  lastSyncAt(): number | null;
  /** `syncState.retryAt` while locked, else null. */
  lockedUntil(): number | null;
  /**
   * True while the automatic Spotify step must wait for the owner: another
   * account is connected and only a tap may answer the account-switch
   * question.
   */
  spotifyHeld(): boolean;
  /** Runs the job; `auto` is false for a tap. Never throws. */
  run(step: AutoStep, auto: boolean): Promise<StepResult>;
  onView(view: ChainView): void;
}

export interface Chain {
  /** Queues the automatic steps that are due and runs them. */
  trigger(): Promise<void>;
  /** A tap: the step runs next. */
  request(step: AutoStep): Promise<void>;
  /** Empties the queue; the running step finishes. */
  stop(): void;
}

export function isSpotifyDue(
  lastSyncAt: number | null,
  lockedUntil: number | null,
  now: number
): boolean {
  if (lockedUntil !== null && lockedUntil > now) return false;
  return lastSyncAt === null || now - lastSyncAt >= AUTO_SYNC_AGE_MS;
}

interface Entry {
  step: AutoStep;
  auto: boolean;
}

export function createChain(deps: ChainDeps): Chain {
  let queue: Entry[] = [];
  let current: AutoStep | null = null;
  let loop: Promise<void> | null = null;
  let spotifyRan = false;
  const failed = new Set<AutoStep>();

  const spotifyDueNow = () =>
    !deps.spotifyHeld() &&
    isSpotifyDue(deps.lastSyncAt(), deps.lockedUntil(), deps.now());

  const emit = () =>
    deps.onView({
      current,
      waiting: queue.map((e) => e.step),
      failed: AUTO_STEPS.filter((s) => failed.has(s)),
    });

  async function drain(): Promise<void> {
    while (queue.length > 0) {
      await deps.waitIdle();
      const entry = queue.shift();
      if (!entry) break;
      if (!deps.signedIn()) {
        queue = [];
        break;
      }
      if (entry.auto && !deps.autoOn()) {
        queue = queue.filter((e) => !e.auto);
        emit();
        continue;
      }
      if (entry.step === 'spotify') {
        if (entry.auto && !spotifyDueNow()) {
          emit();
          continue;
        }
        spotifyRan = true;
      }
      current = entry.step;
      emit();
      const result = await deps.run(entry.step, entry.auto);
      if (result === 'failed') failed.add(entry.step);
      else failed.delete(entry.step);
      current = null;
      emit();
    }
    emit();
  }

  function start(): Promise<void> {
    if (!loop) {
      loop = drain().finally(() => {
        loop = null;
      });
    }
    return loop;
  }

  return {
    trigger() {
      if (loop || !deps.autoOn() || !deps.signedIn()) return Promise.resolve();
      for (const step of AUTO_STEPS) {
        if (failed.has(step)) continue;
        if (step === 'spotify' && (spotifyRan || !spotifyDueNow())) continue;
        queue.push({ step, auto: true });
      }
      return start();
    },
    request(step) {
      if (!deps.signedIn()) return Promise.resolve();
      if (current === step) return loop ?? Promise.resolve();
      if (queue.some((e) => e.step === step && !e.auto)) return start();
      queue = queue.filter((e) => e.step !== step);
      const taps = queue.filter((e) => !e.auto).length;
      queue.splice(taps, 0, { step, auto: false });
      emit();
      return start();
    },
    stop() {
      queue = [];
      emit();
    },
  };
}
