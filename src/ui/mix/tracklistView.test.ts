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
    r({ year: 1993, hits: 1 }),
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
    // A decade the rows do not hold is ignored, never an empty list.
    expect(tracklistView(rows, { ...ALL, decade: 1970 }, null).order).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it('combines the decade with a review chip', () => {
    const v = tracklistView(
      rows,
      { ...ALL, decade: 1990, filter: 'heardOnce' },
      null
    );
    expect(v.order).toEqual([1]);
  });

  it('keeps the row being edited visible whatever the view', () => {
    const v = tracklistView(
      rows,
      { ...ALL, decade: 2000, filter: 'heardOnce' },
      2
    );
    expect(v.order).toEqual([2]);
    // An index past the rows (a row just deleted) is not added.
    expect(tracklistView(rows, { ...ALL, decade: 2000 }, 9).order).toEqual([0]);
  });
});

describe('tracklistView: the Solid and Flagged chips (spec 029)', () => {
  const rows = [
    r({ evidence: 'solid', hits: 5 }),
    r({ evidence: 'candidates', hits: 1, candidates: 14 }),
    r({ gap: true, artist: '', title: '' }),
    r({ evidence: 'out_of_step', hits: 2 }),
    r({ evidence: 'once', hits: 1 }),
    r({ hits: 3 }),
  ];

  it('Solid keeps the solid rows, Flagged the flagged ones, in set order', () => {
    expect(tracklistView(rows, { ...ALL, filter: 'solid' }, null).order).toEqual(
      [0]
    );
    expect(
      tracklistView(rows, { ...ALL, filter: 'flagged' }, null).order
    ).toEqual([1, 3]);
  });

  it('a gap row shows under All only', () => {
    expect(tracklistView(rows, ALL, null).order).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
