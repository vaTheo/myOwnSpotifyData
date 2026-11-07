import { describe, expect, it } from 'vitest';
import {
  levelOf,
  widestPriority,
  widthLevel,
  yearSortFor,
  yearSortOn,
  yearSortOffered,
} from './layout';

describe('widestPriority', () => {
  it('follows the container queries 720, 960 and 1120 px', () => {
    expect(widestPriority(null)).toBe(4);
    expect(widestPriority(390)).toBe(1);
    expect(widestPriority(719)).toBe(1);
    expect(widestPriority(720)).toBe(2);
    expect(widestPriority(959)).toBe(2);
    expect(widestPriority(960)).toBe(3);
    expect(widestPriority(1119)).toBe(3);
    expect(widestPriority(1120)).toBe(4);
  });
});

describe('yearSortOffered', () => {
  it('offers the switch where the Released header is not drawn', () => {
    expect(yearSortOffered(null)).toBe(false);
    expect(yearSortOffered({ twoLine: true, widestPriority: 4 })).toBe(true);
    expect(yearSortOffered({ twoLine: false, widestPriority: 1 })).toBe(true);
    expect(yearSortOffered({ twoLine: false, widestPriority: 2 })).toBe(false);
  });
});

describe('widthLevel (S13c review M3)', () => {
  it('changes only when the level or the compactBelow side changes', () => {
    expect(widthLevel(721)).toBe(widthLevel(959));
    expect(widthLevel(719)).not.toBe(widthLevel(720));
    expect(widthLevel(500, 560)).not.toBe(widthLevel(600, 560));
    expect(levelOf(widthLevel(500, 560))).toEqual({ widest: 1, narrow: true });
    expect(levelOf(widthLevel(1200))).toEqual({ widest: 4, narrow: false });
    expect(levelOf(null)).toEqual({ widest: 4, narrow: null });
  });
});

describe('the Sort by year switch (S13c review M2)', () => {
  it('is on only for Released ascending, and off returns the default order', () => {
    expect(yearSortOn({ columnId: 'released', direction: 'asc' })).toBe(true);
    expect(yearSortOn({ columnId: 'released', direction: 'desc' })).toBe(false);
    expect(yearSortOn({ columnId: 'bpm', direction: 'asc' })).toBe(false);
    expect(yearSortFor(true)).toEqual({
      columnId: 'released',
      direction: 'asc',
    });
    expect(yearSortFor(false)).toEqual({ columnId: null, direction: 'asc' });
  });
});
