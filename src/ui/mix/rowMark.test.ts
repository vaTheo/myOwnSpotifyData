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

  it('clears the mark when another mix opens', () => {
    expect(markAfter(3, { type: 'open-mix' })).toBeNull();
    expect(markAfter(null, { type: 'open-mix' })).toBeNull();
  });
});
