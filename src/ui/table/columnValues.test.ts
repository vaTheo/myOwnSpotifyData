import { describe, expect, it } from 'vitest';
import { camelot } from '../../model/keys';
import { formatDuration, keySortValue } from './columnValues';

describe('keySortValue', () => {
  it('orders keys by Camelot number, minor (A) before major (B)', () => {
    const all: { key: number; major: boolean }[] = [];
    for (let key = 0; key < 12; key += 1) {
      all.push({ key, major: false }, { key, major: true });
    }
    const codes = all
      .sort(
        (a, b) =>
          (keySortValue(a.key, a.major) ?? 0) -
          (keySortValue(b.key, b.major) ?? 0)
      )
      .map((k) => camelot(k.key, k.major));
    expect(codes).toEqual([
      '1A',
      '1B',
      '2A',
      '2B',
      '3A',
      '3B',
      '4A',
      '4B',
      '5A',
      '5B',
      '6A',
      '6B',
      '7A',
      '7B',
      '8A',
      '8B',
      '9A',
      '9B',
      '10A',
      '10B',
      '11A',
      '11B',
      '12A',
      '12B',
    ]);
  });

  it('is null when the key or the mode is missing', () => {
    expect(keySortValue(null, true)).toBeNull();
    expect(keySortValue(5, null)).toBeNull();
  });
});

describe('formatDuration', () => {
  it('writes minutes and padded seconds', () => {
    expect(formatDuration(215_000)).toBe('3:35');
    expect(formatDuration(61_000)).toBe('1:01');
    expect(formatDuration(59_400)).toBe('0:59');
  });
  it('adds hours past sixty minutes', () => {
    expect(formatDuration(3_725_000)).toBe('1:02:05');
  });
});
