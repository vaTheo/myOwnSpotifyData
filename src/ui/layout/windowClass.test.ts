import { describe, expect, it } from 'vitest';
import { windowClassOf } from './windowClass';

describe('windowClassOf', () => {
  it('uses the boundaries 600, 840 and 1200, lower bound inclusive', () => {
    expect(windowClassOf(320)).toBe('compact');
    expect(windowClassOf(599)).toBe('compact');
    expect(windowClassOf(600)).toBe('medium');
    expect(windowClassOf(839)).toBe('medium');
    expect(windowClassOf(840)).toBe('expanded');
    expect(windowClassOf(1199)).toBe('expanded');
    expect(windowClassOf(1200)).toBe('large');
    expect(windowClassOf(2560)).toBe('large');
  });
});
