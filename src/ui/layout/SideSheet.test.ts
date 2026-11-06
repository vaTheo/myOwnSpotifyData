import { describe, expect, it } from 'vitest';
import { sheetMode } from './SideSheet';

describe('sheetMode', () => {
  it('docks on large, is modal on medium and expanded, full screen on compact', () => {
    expect(sheetMode('large')).toBe('docked');
    expect(sheetMode('expanded')).toBe('modal');
    expect(sheetMode('medium')).toBe('modal');
    expect(sheetMode('compact')).toBe('fullscreen');
  });
});
