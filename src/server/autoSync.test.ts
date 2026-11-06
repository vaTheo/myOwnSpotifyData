import { describe, expect, it } from 'vitest';
import { ACTIVE_POLL_MS, RESUME_GAP_MS, installAutoSync } from './autoSync';

function harness(over: { enabled?: boolean; active?: boolean } = {}) {
  const state = {
    now: 1_000_000,
    visibility: 'visible',
    enabled: over.enabled ?? true,
    active: over.active ?? false,
    syncs: 0,
    pulls: 0,
    listeners: {} as Record<string, () => void>,
    tick: (() => undefined) as () => void,
    cleared: false,
  };
  const uninstall = installAutoSync({
    doc: {
      get visibilityState() {
        return state.visibility;
      },
      addEventListener: (t, fn) => (state.listeners[t] = fn),
      removeEventListener: (t) => delete state.listeners[t],
    },
    win: {
      addEventListener: (t, fn) => (state.listeners[t] = fn),
      removeEventListener: (t) => delete state.listeners[t],
      setInterval: (fn) => {
        state.tick = fn;
        return 7;
      },
      clearInterval: () => (state.cleared = true),
    },
    now: () => state.now,
    enabled: () => state.enabled,
    hasActiveRequest: () => state.active,
    sync: () => {
      state.syncs++;
      return Promise.resolve();
    },
    pull: () => {
      state.pulls++;
      return Promise.resolve();
    },
  });
  return { state, uninstall };
}

describe('installAutoSync', () => {
  it('syncs on return to the app, but not twice within the gap', () => {
    const { state } = harness();
    state.listeners.visibilitychange?.();
    expect(state.syncs).toBe(0); // the open just synced
    state.now += RESUME_GAP_MS;
    state.listeners.visibilitychange?.();
    expect(state.syncs).toBe(1);
    state.now += 1_000;
    state.listeners.visibilitychange?.();
    expect(state.syncs).toBe(1);
  });

  it('does nothing when the app is hidden or nobody is signed in', () => {
    const { state } = harness({ enabled: false, active: true });
    state.now += RESUME_GAP_MS * 2;
    state.listeners.visibilitychange?.();
    state.listeners.online?.();
    state.tick();
    expect(state.syncs + state.pulls).toBe(0);
    state.enabled = true;
    state.visibility = 'hidden';
    state.listeners.visibilitychange?.();
    state.tick();
    expect(state.syncs + state.pulls).toBe(0);
  });

  it('syncs at once when the network comes back', () => {
    const { state } = harness();
    state.listeners.online?.();
    expect(state.syncs).toBe(1);
  });

  it('pulls every minute only while a request waits or runs', () => {
    const { state } = harness();
    state.now += ACTIVE_POLL_MS;
    state.tick();
    expect(state.pulls).toBe(0);
    state.active = true;
    state.tick();
    expect(state.pulls).toBe(1);
    state.now += ACTIVE_POLL_MS;
    state.tick();
    expect(state.pulls).toBe(2);
  });

  it('skips a tick right after a resume sync', () => {
    const { state } = harness({ active: true });
    state.now += RESUME_GAP_MS;
    state.listeners.visibilitychange?.();
    state.now += 5_000;
    state.tick();
    expect(state.syncs).toBe(1);
    expect(state.pulls).toBe(0);
  });

  it('uninstalls every trigger', () => {
    const { state, uninstall } = harness();
    uninstall();
    expect(state.listeners).toEqual({});
    expect(state.cleared).toBe(true);
  });
});
