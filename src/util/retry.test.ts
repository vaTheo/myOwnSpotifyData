import { describe, expect, it } from 'vitest';
import { backoffMs, parseRetryAfter } from './retry';

describe('backoffMs', () => {
  it('doubles from two seconds and caps at sixty', () => {
    expect(backoffMs(1)).toBe(2000);
    expect(backoffMs(2)).toBe(4000);
    expect(backoffMs(6)).toBe(60_000);
  });
});

describe('parseRetryAfter', () => {
  it('reads a numeric header as seconds', () => {
    expect(parseRetryAfter('3')).toBe(3);
  });

  it('treats an absent, blank or unreadable header as unreadable', () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter('')).toBeNull();
    expect(parseRetryAfter('  ')).toBeNull();
    expect(parseRetryAfter('abc')).toBeNull();
  });

  it('rejects a negative value', () => {
    expect(parseRetryAfter('-1')).toBeNull();
  });
});
