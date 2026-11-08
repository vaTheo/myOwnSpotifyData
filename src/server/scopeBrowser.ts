import type { StorageLike } from '../auth/session';
import { SUPABASE_KEY, SUPABASE_URL } from '../env';
import {
  dbNameIn,
  keyIn,
  scopeChangedElsewhere,
  scopeOf,
  sessionChangedElsewhere,
} from './userScope';

/**
 * The browser side of `userScope` (ADR-13): which user's names this page
 * uses. The scope is resolved once, on first use, and kept for the page's
 * life: another tab changing the pointer must never move this page onto
 * another user's database or Spotify keys (FR-002); `watchScope` reloads the
 * page instead. No server client here, so the db layer stays free of it.
 * `enabled` comes from the server settings alone: without them every name is
 * today's (FR-008). Without `localStorage` (Vitest, blocked storage) too.
 */

interface ScopeSource {
  storage: StorageLike | null;
  enabled: boolean;
}

let override: ScopeSource | null = null;
let pinned: string | null = null;

/**
 * Tests only: inject a storage and the server switch; `null` restores the
 * browser's. Either way the pinned scope is dropped and resolved again.
 */
export function setScopeForTests(next: ScopeSource | null): void {
  override = next;
  pinned = null;
}

function source(): ScopeSource {
  if (override) return override;
  let storage: StorageLike | null = null;
  try {
    if (typeof localStorage !== 'undefined') storage = localStorage;
  } catch {
    storage = null; // storage blocked: today's names
  }
  return { storage, enabled: SUPABASE_URL !== '' && SUPABASE_KEY !== '' };
}

/** The storage the user pointer lives in, or null where there is none. */
export function scopeStorage(): StorageLike | null {
  return source().storage;
}

export function scopeEnabled(): boolean {
  return source().enabled;
}

/** This page's scope id (`''` = today's names), fixed on first use. */
export function pinnedScope(): string {
  if (pinned === null) {
    const { storage, enabled } = source();
    try {
      pinned = storage ? scopeOf(storage, enabled) : '';
    } catch {
      pinned = ''; // storage blocked: today's names
    }
  }
  return pinned;
}

/** `base` for the claimer, nobody or no server; `base-u-<id>` otherwise. */
export function scopedDbName(base: string): string {
  return dbNameIn(base, pinnedScope());
}

/** `base` for the claimer, nobody or no server; `base:<id>` otherwise. */
export function scopedKey(base: string): string {
  return keyIn(base, pinnedScope());
}

/** A view of `storage` where the listed keys carry this page's scope. */
export function scopedView(
  storage: StorageLike,
  keys: readonly string[]
): StorageLike {
  const map = (key: string): string =>
    keys.includes(key) ? scopedKey(key) : key;
  return {
    getItem: (key) => storage.getItem(map(key)),
    setItem: (key, value) => storage.setItem(map(key), value),
    removeItem: (key) => storage.removeItem(map(key)),
  };
}

interface StorageEventTarget {
  addEventListener(
    type: 'storage',
    listener: (e: { key: string | null; newValue?: string | null }) => void
  ): void;
}

/**
 * Reloads the page when another tab makes a different user active on this
 * device. Installed once from boot; a no-op without `window` or storage.
 */
export function watchScope(
  target: StorageEventTarget | undefined = typeof window === 'undefined'
    ? undefined
    : window,
  reload: () => void = () => location.reload()
): void {
  if (!target) return;
  const mine = pinnedScope();
  target.addEventListener('storage', (e) => {
    const { storage, enabled } = source();
    if (!storage) return;
    try {
      if (scopeChangedElsewhere(e.key, storage, enabled, mine)) reload();
    } catch {
      // Storage became unreadable: keep the page as it is.
    }
  });
}

/**
 * Reloads the page when another tab signs in to the server (this page shows
 * the sign-in screen) or signs out of it (this page is signed in). Installed
 * once from boot, beside `watchScope`. `signedIn` reads this page's session
 * at event time; the server client stays out of this module.
 */
export function watchSession(
  signedIn: () => boolean,
  target: StorageEventTarget | undefined = typeof window === 'undefined'
    ? undefined
    : window,
  reload: () => void = () => location.reload()
): void {
  if (!target) return;
  target.addEventListener('storage', (e) => {
    if (sessionChangedElsewhere(e.key, e.newValue ?? null, signedIn())) {
      reload();
    }
  });
}
