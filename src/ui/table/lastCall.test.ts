import { describe, expect, it, vi } from 'vitest';
import { lastCall } from './lastCall';

describe('lastCall (S13 A5): the last answer while the inputs stay', () => {
  it('answers the same object for the same inputs, without calling again', () => {
    const make = vi.fn((a: object, b: boolean) => ({ a, b }));
    const memo = lastCall(make);
    const a = {};
    const first = memo(a, true);
    expect(memo(a, true)).toBe(first);
    expect(make).toHaveBeenCalledTimes(1);
  });

  it('calls again when any input changes, by identity', () => {
    const make = vi.fn((a: object, b: boolean) => ({ a, b }));
    const memo = lastCall(make);
    const a = {};
    const first = memo(a, true);
    expect(memo(a, false)).not.toBe(first);
    expect(memo({}, false)).not.toBe(first);
    expect(make).toHaveBeenCalledTimes(3);
  });

  it('keeps only the last call', () => {
    const make = vi.fn((n: number) => [n]);
    const memo = lastCall(make);
    memo(1);
    memo(2);
    memo(1);
    expect(make).toHaveBeenCalledTimes(3);
  });
});
