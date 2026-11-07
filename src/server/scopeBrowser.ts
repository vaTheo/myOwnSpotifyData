import type { StorageLike } from '../auth/session';
import { SUPABASE_KEY, SUPABASE_URL } from '../env';
import { dbNameFor, keyFor } from './userScope';

/**
 * The browser side of `userScope` (ADR-13): which user's names this page
 * uses. Read lazily at every call, from `localStorage`, so the db layer and
 * the Spotify session need no server client. `enabled` comes from the server
 * settings alone: without them every name is today's (FR-008). Under Vitest
 * there is no `localStorage`, so every name is today's too.
 */

interface ScopeSource {
  storage: StorageLike | null;
  enabled: boolean;
}

let override: ScopeSource | null = null;

/** Tests only: inject a storage and the server switch; `null` restores the browser's. */
export function setScopeForTests(next: ScopeSource | null): void {
  override = next;
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

/** `base` for the claimer, nobody or no server; `base-u-<id>` otherwise. */
export function scopedDbName(base: string): string {
  const { storage, enabled } = source();
  return storage ? dbNameFor(base, storage, enabled) : base;
}

/** `base` for the claimer, nobody or no server; `base:<id>` otherwise. */
export function scopedKey(base: string): string {
  const { storage, enabled } = source();
  return storage ? keyFor(base, storage, enabled) : base;
}
