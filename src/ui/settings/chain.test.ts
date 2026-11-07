import { describe, expect, it } from 'vitest';
import { isWaiting, otherStepRuns } from './chain';

describe('chain buttons', () => {
  const view = {
    current: 'features' as const,
    waiting: ['reach' as const],
    failed: [],
  };
  it('queues a tap while another step runs', () => {
    expect(otherStepRuns(view, 'spotify')).toBe(true);
    expect(otherStepRuns(view, 'features')).toBe(false);
    expect(
      otherStepRuns({ current: null, waiting: [], failed: [] }, 'spotify')
    ).toBe(false);
  });
  it('says waiting for a queued step', () => {
    expect(isWaiting(view, 'reach')).toBe(true);
    expect(isWaiting(view, 'spotify')).toBe(false);
  });
});
