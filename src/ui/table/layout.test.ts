import { describe, expect, it } from 'vitest';
import { widestPriority, yearSortOffered } from './layout';

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
