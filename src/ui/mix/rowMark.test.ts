import { describe, expect, it } from 'vitest';
import { markAfter } from './rowMark';

describe('markAfter', () => {
  it('marks the row clicked', () => {
    expect(markAfter(null, { type: 'click', index: 3 })).toBe(3);
  });

  it('moves the mark to another row clicked', () => {
    expect(markAfter(3, { type: 'click', index: 7 })).toBe(7);
  });

  it('keeps the mark when the marked row is clicked again', () => {
    expect(markAfter(3, { type: 'click', index: 3 })).toBe(3);
  });

  it('clears the mark when the marked row is deleted', () => {
    expect(markAfter(3, { type: 'delete', index: 3 })).toBeNull();
  });

  it('clears the mark even when another row is deleted', () => {
    expect(markAfter(3, { type: 'delete', index: 5 })).toBeNull();
    expect(markAfter(5, { type: 'delete', index: 3 })).toBeNull();
  });

  it('marks the row Add track made', () => {
    expect(markAfter(null, { type: 'add', index: 12 })).toBe(12);
    expect(markAfter(4, { type: 'add', index: 12 })).toBe(12);
  });

  it('keeps an index into mixRows, not a place in the view', () => {
    // The table passes `l.index` (the row's place in `mixRows`), so a sort
    // or filter that reorders the view leaves the mark on the same track,
    // and a filter that hides it leaves no visible row marked.
    const sorted = [5, 2, 9];
    const marked = markAfter(null, { type: 'click', index: sorted[0] });
    expect(marked).toBe(5);
    const resorted = [2, 9, 5];
    expect(resorted.indexOf(marked as number)).toBe(2);
    const filtered = [2, 9];
    expect(filtered.includes(marked as number)).toBe(false);
    expect(marked).toBe(5);
  });

  it('clears the mark when another mix opens', () => {
    expect(markAfter(3, { type: 'open-mix' })).toBeNull();
    expect(markAfter(null, { type: 'open-mix' })).toBeNull();
  });
});
