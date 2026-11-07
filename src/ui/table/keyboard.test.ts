import { describe, expect, it } from 'vitest';
import { moveIndex, rovingTarget } from './keyboard';

describe('moveIndex', () => {
  it('moves by one with the arrows', () => {
    expect(moveIndex(3, 'ArrowDown', 10, 5)).toBe(4);
    expect(moveIndex(3, 'ArrowUp', 10, 5)).toBe(2);
  });

  it('moves by a page with PageUp and PageDown', () => {
    expect(moveIndex(3, 'PageDown', 10, 5)).toBe(8);
    expect(moveIndex(8, 'PageUp', 10, 5)).toBe(3);
  });

  it('jumps to the ends with Home and End', () => {
    expect(moveIndex(4, 'Home', 10, 5)).toBe(0);
    expect(moveIndex(4, 'End', 10, 5)).toBe(9);
  });

  it('clamps to the rows on screen', () => {
    expect(moveIndex(0, 'ArrowUp', 10, 5)).toBe(0);
    expect(moveIndex(9, 'ArrowDown', 10, 5)).toBe(9);
    expect(moveIndex(8, 'PageDown', 10, 5)).toBe(9);
    expect(moveIndex(2, 'PageUp', 10, 5)).toBe(0);
  });

  it('starts at the first row when nothing is selected', () => {
    expect(moveIndex(null, 'ArrowDown', 10, 5)).toBe(0);
    expect(moveIndex(null, 'End', 10, 5)).toBe(9);
  });

  it('returns null for other keys or an empty table', () => {
    expect(moveIndex(3, 'Enter', 10, 5)).toBeNull();
    expect(moveIndex(null, 'ArrowDown', 0, 5)).toBeNull();
  });
});

describe('rovingTarget (FR-043)', () => {
  it('is the first row until one has been focused', () => {
    expect(rovingTarget(null, 10)).toBe(0);
  });

  it('keeps a row that is still on screen', () => {
    expect(rovingTarget(4, 10)).toBe(4);
  });

  it('falls back to the last row when a filter leaves fewer', () => {
    expect(rovingTarget(19, 13)).toBe(12);
  });

  it('is 0 for an empty table, so nothing points past it', () => {
    expect(rovingTarget(5, 0)).toBe(0);
  });
});
