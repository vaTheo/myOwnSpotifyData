import { describe, expect, it } from 'vitest';
import {
  AUTO_SYNC_AGE_MS,
  createChain,
  isSpotifyDue,
  type AutoStep,
  type ChainDeps,
  type ChainView,
  type StepResult,
} from './autoChain';

const T = 1_800_000_000_000;

interface Fake {
  deps: ChainDeps;
  calls: [AutoStep, boolean][];
  views: ChainView[];
  results: Partial<Record<AutoStep, StepResult>>;
  /** Steps whose run waits for `release(step)`. */
  block: Set<AutoStep>;
  release(step: AutoStep): void;
  autoOn: boolean;
  signedIn: boolean;
  lastSyncAt: number | null;
  lockedUntil: number | null;
  spotifyHeld: boolean;
  yearsBackfillDue: boolean;
  idle: Promise<void>;
}

function fake(init: Partial<Fake> = {}): Fake {
  const waiters = new Map<AutoStep, () => void>();
  const f: Fake = {
    calls: [],
    views: [],
    results: {},
    block: new Set(),
    release(step) {
      waiters.get(step)?.();
      waiters.delete(step);
    },
    autoOn: true,
    signedIn: true,
    lastSyncAt: null,
    lockedUntil: null,
    spotifyHeld: false,
    yearsBackfillDue: false,
    idle: Promise.resolve(),
    ...init,
    deps: undefined as unknown as ChainDeps,
  };
  f.deps = {
    autoOn: () => f.autoOn,
    signedIn: () => f.signedIn,
    busy: () => false,
    waitIdle: () => f.idle,
    now: () => T,
    lastSyncAt: () => f.lastSyncAt,
    lockedUntil: () => f.lockedUntil,
    spotifyHeld: () => f.spotifyHeld,
    yearsBackfillDue: () => f.yearsBackfillDue,
    run: async (step, auto) => {
      f.calls.push([step, auto]);
      if (f.block.has(step)) {
        await new Promise<void>((resolve) => waiters.set(step, resolve));
      }
      return f.results[step] ?? 'done';
    },
    onView: (view) => {
      f.views.push(view);
    },
  };
  return f;
}

/** Lets every pending microtask and promise callback run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const lastView = (f: Fake) => f.views[f.views.length - 1];

describe('isSpotifyDue', () => {
  it('is due when never synced', () => {
    expect(isSpotifyDue(null, null, T)).toBe(true);
  });
  it('is not due within 12 hours', () => {
    expect(isSpotifyDue(T - AUTO_SYNC_AGE_MS + 1, null, T)).toBe(false);
  });
  it('is due at 12 hours', () => {
    expect(isSpotifyDue(T - AUTO_SYNC_AGE_MS, null, T)).toBe(true);
  });
  it('is not due while locked', () => {
    expect(isSpotifyDue(null, T + 1, T)).toBe(false);
  });
  it('is due once the lock lapsed', () => {
    expect(isSpotifyDue(null, T - 1, T)).toBe(true);
  });
  it('is due when the years backfill is, however young the library', () => {
    expect(isSpotifyDue(T - 1000, null, T, true)).toBe(true);
  });
  it('is never due while locked, backfill or not', () => {
    expect(isSpotifyDue(null, T + 1, T, true)).toBe(false);
  });
  it('is 12 hours', () => {
    expect(AUTO_SYNC_AGE_MS).toBe(12 * 60 * 60 * 1000);
  });
});

describe('createChain', () => {
  it('runs the three steps in order', async () => {
    const f = fake();
    await createChain(f.deps).trigger();
    expect(f.calls).toEqual([
      ['spotify', true],
      ['features', true],
      ['reach', true],
    ]);
    expect(lastView(f)).toEqual({ current: null, waiting: [], failed: [] });
  });

  it('skips spotify when fresh', async () => {
    const f = fake({ lastSyncAt: T - 1000 });
    await createChain(f.deps).trigger();
    expect(f.calls).toEqual([
      ['features', true],
      ['reach', true],
    ]);
  });

  it('syncs spotify first on a young library while the years backfill is due', async () => {
    const f = fake({ lastSyncAt: T - 1000, yearsBackfillDue: true });
    await createChain(f.deps).trigger();
    expect(f.calls.map(([s]) => s)).toEqual(['spotify', 'features', 'reach']);
  });

  it('skips spotify while locked', async () => {
    const f = fake({ lockedUntil: T + 60_000 });
    await createChain(f.deps).trigger();
    expect(f.calls.map(([s]) => s)).toEqual(['features', 'reach']);
  });

  it('skips spotify while it is held (another account to confirm)', async () => {
    const f = fake({ spotifyHeld: true });
    await createChain(f.deps).trigger();
    expect(f.calls.map(([s]) => s)).toEqual(['features', 'reach']);
  });

  it('still runs a tapped spotify while held', async () => {
    const f = fake({ spotifyHeld: true });
    await createChain(f.deps).request('spotify');
    expect(f.calls).toEqual([['spotify', false]]);
  });

  it('runs spotify at most once per session', async () => {
    const f = fake();
    const chain = createChain(f.deps);
    await chain.trigger();
    await chain.trigger();
    expect(f.calls.filter(([s]) => s === 'spotify')).toHaveLength(1);
  });

  it('does not rerun a failed step', async () => {
    const f = fake({ lastSyncAt: T, results: { features: 'failed' } });
    const chain = createChain(f.deps);
    await chain.trigger();
    expect(lastView(f).failed).toEqual(['features']);
    f.calls = [];
    await chain.trigger();
    expect(f.calls).toEqual([['reach', true]]);
    expect(lastView(f).failed).toEqual(['features']);
  });

  it('is a no-op when triggered while running', async () => {
    const f = fake({ lastSyncAt: T, block: new Set(['features']) });
    const chain = createChain(f.deps);
    const first = chain.trigger();
    await flush();
    expect(lastView(f)).toEqual({
      current: 'features',
      waiting: ['reach'],
      failed: [],
    });
    await chain.trigger();
    f.release('features');
    await first;
    expect(f.calls).toEqual([
      ['features', true],
      ['reach', true],
    ]);
  });

  it('runs nothing when the switch is off', async () => {
    const f = fake({ autoOn: false });
    await createChain(f.deps).trigger();
    expect(f.calls).toEqual([]);
  });

  it('runs nothing when signed out', async () => {
    const f = fake({ signedIn: false });
    await createChain(f.deps).trigger();
    expect(f.calls).toEqual([]);
  });

  it('runs a request next, before the rest of the chain', async () => {
    const f = fake({ lastSyncAt: T, block: new Set(['features']) });
    const chain = createChain(f.deps);
    const run = chain.trigger();
    await flush();
    void chain.request('spotify');
    expect(lastView(f).waiting).toEqual(['spotify', 'reach']);
    f.release('features');
    await run;
    await flush();
    expect(f.calls).toEqual([
      ['features', true],
      ['spotify', false],
      ['reach', true],
    ]);
  });

  it('dedupes a request tapped twice', async () => {
    const f = fake({ lastSyncAt: T, block: new Set(['features']) });
    const chain = createChain(f.deps);
    const run = chain.trigger();
    await flush();
    void chain.request('reach');
    void chain.request('reach');
    f.release('features');
    await run;
    await flush();
    expect(f.calls).toEqual([
      ['features', true],
      ['reach', false],
    ]);
  });

  it('ignores a request for the step running', async () => {
    const f = fake({ lastSyncAt: T, block: new Set(['features']) });
    const chain = createChain(f.deps);
    const run = chain.trigger();
    await flush();
    void chain.request('features');
    f.release('features');
    await run;
    await flush();
    expect(f.calls.filter(([s]) => s === 'features')).toHaveLength(1);
  });

  it('runs a request with the switch off', async () => {
    const f = fake({ autoOn: false });
    await createChain(f.deps).request('features');
    expect(f.calls).toEqual([['features', false]]);
  });

  it('runs no request when signed out', async () => {
    const f = fake({ signedIn: false });
    await createChain(f.deps).request('features');
    expect(f.calls).toEqual([]);
  });

  it('clears a failure when a request succeeds', async () => {
    const f = fake({ lastSyncAt: T, results: { features: 'failed' } });
    const chain = createChain(f.deps);
    await chain.trigger();
    expect(lastView(f).failed).toEqual(['features']);
    f.results = {};
    await chain.request('features');
    expect(lastView(f).failed).toEqual([]);
  });

  it('runs no more steps after stop', async () => {
    const f = fake({ block: new Set(['spotify']) });
    const chain = createChain(f.deps);
    const run = chain.trigger();
    await flush();
    chain.stop();
    f.release('spotify');
    await run;
    expect(f.calls).toEqual([['spotify', true]]);
    expect(lastView(f).waiting).toEqual([]);
  });

  it('drops automatic steps once the switch is turned off', async () => {
    const f = fake({ block: new Set(['spotify']) });
    const chain = createChain(f.deps);
    const run = chain.trigger();
    await flush();
    f.autoOn = false;
    f.release('spotify');
    await run;
    expect(f.calls).toEqual([['spotify', true]]);
  });

  it('waits for an idle library before a step', async () => {
    let free!: () => void;
    const f = fake({ idle: new Promise<void>((r) => (free = r)) });
    const run = createChain(f.deps).trigger();
    await flush();
    expect(f.calls).toEqual([]);
    free();
    await run;
    expect(f.calls).toHaveLength(3);
  });
});
