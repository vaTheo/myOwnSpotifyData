import type { StorageLike } from '../auth/session';

/**
 * The demo switch of the visual loop (spec 003, research D19).
 *
 * `?demo` (or `?demo=<variant>`) on `yarn dev` swaps in a demo library kept
 * in its own database, an in-memory Spotify session and no server, so the
 * owner's real data and logins in the same browser are never touched. It is
 * null in a production build (`import.meta.env.DEV` is false there) and in
 * the unit tests (no `location`), so every branch that tests it is dead code
 * outside `yarn dev`.
 */
export type DemoVariant =
  'full' | 'empty' | 'old-import' | 'no-reach' | 'locked' | 'signed-out';

export const DEMO_VARIANTS: readonly DemoVariant[] = [
  'full',
  'empty',
  'old-import',
  'no-reach',
  'locked',
  'signed-out',
];

export const DEMO_DB_NAME = 'spotify-dj-demo';

/** 6 Nov 2026, 12:00 UTC: the demo's "now"; the shots freeze the clock here. */
export const DEMO_NOW = Date.UTC(2026, 10, 6, 12, 0, 0);

/** Ids the shots navigate to, published on `window.__demo.ids`. */
export interface DemoIds {
  bigPlaylist: string | null;
  playlist: string | null;
  artist: string | null;
  track: string | null;
  mix: string | null;
}

export function demoVariant(): DemoVariant | null {
  if (!import.meta.env.DEV || typeof location === 'undefined') return null;
  const raw = new URLSearchParams(location.search).get('demo');
  if (raw === null) return null;
  return (DEMO_VARIANTS as readonly string[]).includes(raw)
    ? (raw as DemoVariant)
    : 'full';
}

/** A storage that lives and dies with the page: the demo's session. */
export function memoryStorage(seed: Record<string, string>): StorageLike {
  const items = new Map(Object.entries(seed));
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}
