import { describe, expect, it } from 'vitest';
import type { TracklistRow } from '../../db/schema';
import { sortRows } from '../table/sort';
import {
  SORT_FIRST,
  effectiveSort,
  sortChoices,
  sortValue,
  type SortId,
} from './tracklistSort';

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

const line = (row: TracklistRow, matched = false) => ({
  row,
  match: matched ? ({} as never) : null,
});

describe('sortValue', () => {
  it('confidence is the Tracklistify score only, never zero when missing', () => {
    expect(sortValue('confidence', line(r({ confidence: 63 })))).toBe(63);
    expect(sortValue('confidence', line(r({ confidence: 0 })))).toBe(0);
    expect(sortValue('confidence', line(r({})))).toBeNull();
    expect(
      sortValue('confidence', line(r({ source: 'manual', confidence: 90 })))
    ).toBeNull();
    expect(
      sortValue('confidence', line(r({ gap: true, confidence: 90 })))
    ).toBeNull();
  });

  it('confidence sorts by times found first, then by the percentage', () => {
    const v = (hits: number | undefined, confidence: number) =>
      Number(sortValue('confidence', line(r({ hits, confidence }))));
    expect(v(3, 60)).toBeGreaterThan(v(2, 99));
    expect(v(2, 80)).toBeGreaterThan(v(2, 70));
    expect(v(1, 5)).toBeGreaterThan(v(undefined, 100));
  });

  it('a gap has no value in the columns about a track', () => {
    const gap = line(r({ gap: true, startSec: 60 }));
    for (const id of [
      'title',
      'source',
      'library',
      'spotify',
      'review',
      'released',
    ] as SortId[]) {
      expect(sortValue(id, gap)).toBeNull();
    }
    expect(sortValue('time', gap)).toBe(60);
  });

  it('spotify puts problems first, review puts to review first', () => {
    expect(sortValue('spotify', line(r({ spotify: 'not-found' })))).toBe(0);
    expect(sortValue('spotify', line(r({})))).toBe(1);
    expect(
      sortValue('spotify', line(r({ spotify: { id: 'i', url: 'u' } })))
    ).toBe(2);
    expect(sortValue('review', line(r({})))).toBe(0);
    expect(sortValue('review', line(r({ validated: true })))).toBe(1);
  });

  it('library, clips, label, year and time read their field', () => {
    expect(sortValue('library', line(r({}), true))).toBe(1);
    expect(sortValue('library', line(r({})))).toBe(0);
    expect(sortValue('clips', line(r({ hits: 3 })))).toBe(3);
    expect(sortValue('clips', line(r({})))).toBeNull();
    expect(sortValue('label', line(r({ label: 'Warp' })))).toBe('Warp');
    expect(sortValue('label', line(r({})))).toBeNull();
    expect(sortValue('released', line(r({ year: 1999 })))).toBe(1999);
    expect(sortValue('time', line(r({ startSec: null })))).toBeNull();
  });
});

describe('first directions', () => {
  it('confidence, clips and library start with the best first', () => {
    expect(SORT_FIRST.confidence).toBe('desc');
    expect(SORT_FIRST.clips).toBe('desc');
    expect(SORT_FIRST.library).toBe('desc');
    expect(SORT_FIRST.title).toBe('asc');
  });
});

describe('confidence sort end to end (US1)', () => {
  const rows = [
    line(r({ title: 'a', confidence: 63 })),
    line(r({ title: 'b' })),
    line(r({ title: 'c', confidence: 97 })),
    line(r({ title: 'd', confidence: 80 })),
    line(r({ title: 'e', gap: true, confidence: 50 })),
  ];
  const titles = (d: 'asc' | 'desc') =>
    sortRows(rows, (l) => sortValue('confidence', l), d).map(
      (l) => l.row.title
    );
  it('highest first, then lowest first, rows without one last both times', () => {
    expect(titles('desc')).toEqual(['c', 'd', 'a', 'b', 'e']);
    expect(titles('asc')).toEqual(['a', 'd', 'c', 'b', 'e']);
  });
});

describe('sortChoices and effectiveSort', () => {
  const plain = [r({}), r({})];
  const rich = [r({ confidence: 80, hits: 2, year: 2001 }), r({})];

  it('offers confidence, clips and released only when a row has them', () => {
    const ids = (rows: TracklistRow[]) => sortChoices(rows).map((c) => c.id);
    expect(ids(plain)).toEqual([
      'time',
      'title',
      'label',
      'source',
      'library',
      'spotify',
      'review',
    ]);
    expect(ids(rich)).toEqual([
      'time',
      'title',
      'label',
      'source',
      'confidence',
      'clips',
      'library',
      'released',
      'spotify',
      'review',
    ]);
  });

  it('keeps a choice that applies and falls back to set order when not', () => {
    const asked = { columnId: 'confidence', direction: 'asc' as const };
    expect(effectiveSort(asked, rich)).toEqual(asked);
    expect(effectiveSort(asked, plain)).toEqual({
      columnId: null,
      direction: 'asc',
    });
    const none = { columnId: null, direction: 'desc' as const };
    expect(effectiveSort(none, plain)).toEqual({
      columnId: null,
      direction: 'asc',
    });
  });
});
