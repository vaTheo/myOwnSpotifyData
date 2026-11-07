import { describe, expect, it } from 'vitest';
import { buildDemo } from '../dev/demo';
import { buildModel } from './aggregate';
import { coverage } from './coverage';

describe('coverage', () => {
  it('is memoised on the model: a progress tick does not recount', () => {
    const rows = buildDemo('full', 1).rows;
    const a = buildModel(rows);
    const first = coverage(a);
    expect(coverage(a)).toBe(first);
    const b = buildModel(rows);
    const second = coverage(b);
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });
});
