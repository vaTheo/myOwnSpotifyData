import { routeHref } from '../../router';

/**
 * The Mix workspace's address rules (spec 003 §12, contracts/routes.md):
 * `#/mix/<key>` names an open saved mix; an unsaved lookup stays at `#/mix`.
 * Two pure halves so the workspace never fights itself: `routeAction` runs
 * when the address changes, `addressAfter` when the open mix changes.
 */

export type RouteAction = 'open' | 'missing' | 'close' | 'none';

/** What a new address (or the saved mixes finishing to load) asks for. */
export function routeAction(p: {
  prevKey: string | undefined;
  key: string | undefined;
  /** The saved mixes are read: before that, a key cannot be judged. */
  loaded: boolean;
  /** The url of the mix on screen, or null. */
  openUrl: string | null;
  saved: readonly string[];
}): RouteAction {
  if (p.key !== undefined) {
    if (!p.loaded || p.openUrl === p.key) return 'none';
    return p.saved.includes(p.key) ? 'open' : 'missing';
  }
  // Back from `#/mix/<key>`: close that mix, but never an unsaved lookup
  // that replaced it on screen.
  if (p.prevKey !== undefined && p.openUrl === p.prevKey) return 'close';
  return 'none';
}

/** The address the open mix asks for, or null when the current one fits. */
export function addressAfter(p: {
  key: string | undefined;
  openUrl: string | null;
  saved: boolean;
}): string | null {
  if (p.openUrl === null) return null;
  if (p.saved) {
    return p.key === p.openUrl
      ? null
      : routeHref({ name: 'mix', key: p.openUrl });
  }
  return p.key === undefined ? null : routeHref({ name: 'mix' });
}
