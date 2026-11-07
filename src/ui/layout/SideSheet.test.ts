import { describe, expect, it } from 'vitest';
import { SHEET_COMPACT_BELOW, besideSheet, sheetMode } from './SideSheet';

describe('sheetMode', () => {
  it('docks on large, is modal on medium and expanded, full screen on compact', () => {
    expect(sheetMode('large')).toBe('docked');
    expect(sheetMode('expanded')).toBe('modal');
    expect(sheetMode('medium')).toBe('modal');
    expect(sheetMode('compact')).toBe('fullscreen');
  });
});

describe('besideSheet (S13c review I1)', () => {
  it('gives a table beside the docked sheet two-line items below 960 px', () => {
    expect(besideSheet(true, 'large')).toBe(SHEET_COMPACT_BELOW);
    expect(SHEET_COMPACT_BELOW).toBe(960);
    // No sheet, or a sheet over the table (modal, full screen): no change.
    expect(besideSheet(false, 'large')).toBeUndefined();
    expect(besideSheet(true, 'expanded')).toBeUndefined();
    expect(besideSheet(true, 'compact')).toBeUndefined();
  });
});
