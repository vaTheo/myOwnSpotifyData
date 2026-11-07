import { describe, expect, it } from 'vitest';
import { scrollLocker } from './scrollLock';

describe('scrollLocker (S13 A3)', () => {
  it('holds the page while one lock is held, then restores it', () => {
    const style = { overflow: 'auto' };
    const lock = scrollLocker(style);
    const release = lock();
    expect(style.overflow).toBe('hidden');
    release();
    expect(style.overflow).toBe('auto');
  });

  it('restores scrolling whatever order two locks are released in', () => {
    for (const order of [
      [0, 1],
      [1, 0],
    ]) {
      const style = { overflow: '' };
      const lock = scrollLocker(style);
      const releases = [lock(), lock()];
      releases[order[0]]();
      expect(style.overflow).toBe('hidden');
      releases[order[1]]();
      expect(style.overflow).toBe('');
    }
  });

  it('ignores a second release of the same lock', () => {
    const style = { overflow: '' };
    const lock = scrollLocker(style);
    const first = lock();
    const second = lock();
    first();
    first();
    expect(style.overflow).toBe('hidden');
    second();
    expect(style.overflow).toBe('');
  });
});
