import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { STALE_MS, staleMonthKey, windowLabel, yearSpanLabel } from './labels';

// The device zone is the whole point of these helpers, so the file pins one
// far from UTC. Kiritimati is UTC+14: 31 Aug 23:30 UTC is 1 Sep there.
const ORIGINAL_TZ = process.env.TZ;

beforeAll(() => {
  process.env.TZ = 'Pacific/Kiritimati';
});

afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

const LATE = { first: '2018-12-31T23:00:00Z', last: '2026-08-31T23:30:00Z' };

describe('staleMonthKey', () => {
  it('names the last play month in the device zone, not in UTC', () => {
    const now = new Date('2026-11-01T00:00:00Z');
    expect(staleMonthKey(LATE, now)).toBe('2026-09');
  });

  it('returns null while the export is still fresh', () => {
    const now = new Date(Date.parse(LATE.last) + STALE_MS);
    expect(staleMonthKey(LATE, now)).toBe(null);
  });

  it('returns null without a range and for an unreadable timestamp', () => {
    const now = new Date('2026-11-01T00:00:00Z');
    expect(staleMonthKey(null, now)).toBe(null);
    expect(staleMonthKey(undefined, now)).toBe(null);
    expect(staleMonthKey({ first: 'nope', last: 'nope' }, now)).toBe(null);
  });
});

describe('yearSpanLabel', () => {
  it('reads both years in the device zone', () => {
    expect(yearSpanLabel(LATE)).toBe('2019 – 2026');
  });

  it('keeps both halves when the export covers one year', () => {
    expect(
      yearSpanLabel({ first: '2026-01-05T09:00:00Z', last: LATE.last })
    ).toBe('2026 – 2026');
  });

  it('returns null without a range and for an unreadable timestamp', () => {
    expect(yearSpanLabel(null)).toBe(null);
    expect(yearSpanLabel(undefined)).toBe(null);
    expect(yearSpanLabel({ first: 'nope', last: 'nope' })).toBe(null);
  });
});

describe('windowLabel', () => {
  it('drops the 1 so the hub reads "the last month"', () => {
    expect(windowLabel(1)).toBe('month');
    expect(windowLabel(3)).toBe('3 months');
    expect(windowLabel(6)).toBe('6 months');
  });
});
