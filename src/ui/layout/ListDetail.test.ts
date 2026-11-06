import { describe, expect, it } from 'vitest';
import { listDetailLayout } from './ListDetail';

describe('listDetailLayout', () => {
  it('gives the list the whole width without a selection', () => {
    for (const size of ['compact', 'medium', 'expanded', 'large'] as const) {
      expect(listDetailLayout(size, false)).toBe('list');
    }
  });

  it('puts the detail beside the list on expanded and large windows', () => {
    expect(listDetailLayout('expanded', true)).toBe('split');
    expect(listDetailLayout('large', true)).toBe('split');
  });

  it('shows the detail alone on compact and medium windows', () => {
    expect(listDetailLayout('compact', true)).toBe('detail');
    expect(listDetailLayout('medium', true)).toBe('detail');
  });
});
