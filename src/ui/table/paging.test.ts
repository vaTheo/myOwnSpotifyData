import { describe, expect, it } from 'vitest';
import { shownToReveal } from './paging';

describe('shownToReveal: how many rows to show so one row is on the page', () => {
  it('keeps the count when the row is already shown', () => {
    expect(shownToReveal(0, 100, 100)).toBe(100);
    expect(shownToReveal(99, 100, 100)).toBe(100);
    expect(shownToReveal(150, 200, 100)).toBe(200);
  });

  it('grows by whole pages to reach the row', () => {
    expect(shownToReveal(100, 100, 100)).toBe(200);
    expect(shownToReveal(250, 100, 100)).toBe(300);
  });

  it('changes nothing for a row that is not in the table', () => {
    expect(shownToReveal(-1, 100, 100)).toBe(100);
  });
});
