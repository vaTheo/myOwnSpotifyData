import { describe, expect, it } from 'vitest';
import type { TracklistRow } from '../../db/schema';
import { tracklistView } from './tracklistView';

const r = (over: Partial<TracklistRow>): TracklistRow => ({
  startSec: 0,
  endSec: null,
  artist: 'A',
  title: 'T',
  label: null,
  source: 'tracklistify',
  gap: false,
  detected: { artist: 'A', title: 'T' },
  referenceCount: null,
  ...over,
});

const ALL = { decade: null, filter: 'all' as const };

describe('tracklistView (S13c review M2)', () => {
  const rows = [
    r({ year: 2004, hits: 2 }),
    r({ year: 1993, hits: 1, validated: true }),
    r({}),
    r({ year: 1991, hits: 3 }),
  ];

  it('keeps one decade, in set order', () => {
    const v = tracklistView(rows, { ...ALL, decade: 1990 }, null);
    expect(v.decades).toEqual([1990, 2000]);
    expect(v.decade).toBe(1990);
    expect(v.order).toEqual([1, 3]);
    expect(tracklistView(rows, ALL, null).order).toEqual([0, 1, 2, 3]);
  });

  it('falls back when the rows no longer allow a choice', () => {
    const undated = [r({}), r({})];
    const v = tracklistView(undated, { ...ALL, decade: 1990 }, null);
    expect(v.decade).toBeNull();
    expect(v.decades).toEqual([]);
    expect(v.order).toEqual([0, 1]);
    expect(tracklistView(undated, ALL, null).counted).toBe(false);
    // A decade the rows do not hold is ignored, never an empty list.
    expect(tracklistView(rows, { ...ALL, decade: 1970 }, null).order).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it('combines the decade with a review chip', () => {
    const v = tracklistView(
      rows,
      { ...ALL, decade: 1990, filter: 'validated' },
      null
    );
    expect(v.order).toEqual([1]);
  });

  it('keeps the row being edited visible whatever the view', () => {
    const v = tracklistView(
      rows,
      { ...ALL, decade: 2000, filter: 'validated' },
      2
    );
    expect(v.order).toEqual([2]);
    // An index past the rows (a row just deleted) is not added.
    expect(tracklistView(rows, { ...ALL, decade: 2000 }, 9).order).toEqual([0]);
  });
});
