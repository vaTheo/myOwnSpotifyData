import { describe, expect, it } from 'vitest';
import {
  activeLock,
  busyReader,
  busyRefusal,
  lapseDelay,
  laterLock,
  MAX_TIMER_MS,
  parseStoredLock,
  quotaRefusal,
} from './quotaLock';

const fmt = (ms: number) => `@${ms}`;

describe('activeLock', () => {
  it('holds while its end is ahead', () => {
    expect(activeLock(2_000, 1_000)).toBe(2_000);
  });
  it('is gone at its end and after, and when absent', () => {
    expect(activeLock(1_000, 1_000)).toBeNull();
    expect(activeLock(500, 1_000)).toBeNull();
    expect(activeLock(null, 1_000)).toBeNull();
  });
});

describe('laterLock', () => {
  it('keeps the later end, so a short answer never shortens a long lock', () => {
    expect(laterLock(null, 5)).toBe(5);
    expect(laterLock(9, 5)).toBe(9);
    expect(laterLock(3, 5)).toBe(5);
  });
});

describe('parseStoredLock', () => {
  it('reads a stored end still ahead', () => {
    expect(parseStoredLock('5000', 1_000)).toBe(5_000);
  });
  it('drops a lapsed, missing or malformed value', () => {
    expect(parseStoredLock('500', 1_000)).toBeNull();
    expect(parseStoredLock(null, 1_000)).toBeNull();
    expect(parseStoredLock('soon', 1_000)).toBeNull();
    expect(parseStoredLock('', 1_000)).toBeNull();
    expect(parseStoredLock('Infinity', 1_000)).toBeNull();
  });
});

describe('lapseDelay', () => {
  it('waits until the end, never less than zero', () => {
    expect(lapseDelay(1_500, 1_000)).toBe(500);
    expect(lapseDelay(500, 1_000)).toBe(0);
  });
  it('is capped at what setTimeout accepts', () => {
    expect(lapseDelay(10 * MAX_TIMER_MS, 0)).toBe(MAX_TIMER_MS);
  });
});

describe('quotaRefusal: every Spotify reader refuses inside the lock', () => {
  it('Sync now and Sync this playlist', () => {
    expect(quotaRefusal('sync', 2_000, 1_000, fmt)).toBe(
      'Spotify quota reached. Sync again after @2000.'
    );
  });
  it('Check on Spotify', () => {
    expect(quotaRefusal('check', 2_000, 1_000, fmt)).toBe(
      'Spotify quota reached. Check again after @2000.'
    );
  });
  it('Create playlist and Like all songs', () => {
    expect(quotaRefusal('create', 2_000, 1_000, fmt)).toBe(
      'Spotify quota reached. Try again after @2000.'
    );
    expect(quotaRefusal('like', 2_000, 1_000, fmt)).toBe(
      'Spotify quota reached. Try again after @2000.'
    );
  });
  it('lets every reader through once the lock lapsed, or without one', () => {
    for (const reader of [
      'sync',
      'check',
      'create',
      'like',
      'account',
    ] as const) {
      expect(quotaRefusal(reader, 1_000, 1_000, fmt)).toBeNull();
      expect(quotaRefusal(reader, null, 1_000, fmt)).toBeNull();
    }
  });
});

describe('busyReader / busyRefusal (S13: one Spotify reader at a time)', () => {
  const none = { sync: false, check: false, create: false, like: false };

  it('lets a reader start when no other reads Spotify', () => {
    expect(busyReader(none, 'check')).toBeNull();
    expect(busyRefusal(none, 'sync')).toBeNull();
  });

  it('ignores the asking reader itself (its own re-entry guard holds it)', () => {
    expect(busyReader({ ...none, check: true }, 'check')).toBeNull();
  });

  it('refuses each pair, naming the reader that runs', () => {
    expect(busyRefusal({ ...none, sync: true }, 'check')).toBe(
      'A sync is reading Spotify: check once it ends.'
    );
    expect(busyRefusal({ ...none, check: true }, 'create')).toBe(
      'Check on Spotify is reading Spotify: create the playlist once it ends.'
    );
    expect(busyRefusal({ ...none, create: true }, 'check')).toBe(
      'Create playlist is reading Spotify: check once it ends.'
    );
    expect(busyRefusal({ ...none, like: true }, 'sync')).toBe(
      'Like all songs is reading Spotify: sync once it ends.'
    );
    expect(busyRefusal({ ...none, check: true }, 'like')).toBe(
      'Check on Spotify is reading Spotify: like the songs once it ends.'
    );
    expect(busyRefusal({ ...none, sync: true }, 'create')).toBe(
      'A sync is reading Spotify: create the playlist once it ends.'
    );
  });

  it('names the first running one when several run', () => {
    expect(busyReader({ ...none, sync: true, like: true }, 'check')).toBe(
      'sync'
    );
  });
});
