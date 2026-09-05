/** Hub order, which is also the order of the rows on the Crate hub. */
export const CRATE_VIEWS = [
  'rotation',
  'gems',
  'classics',
  'year',
  'finish',
] as const;

export type CrateView = (typeof CRATE_VIEWS)[number];

export type Route =
  | { name: 'top' }
  | { name: 'playlists' }
  | { name: 'playlist'; id: string }
  | { name: 'artists' }
  | { name: 'artist'; key: string }
  | { name: 'import' }
  | { name: 'settings' }
  | { name: 'crate' }
  | { name: 'crateView'; view: CrateView; period?: string };

/** decodeURIComponent throws on a malformed escape; keep the raw segment. */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function isCrateView(value: string): value is CrateView {
  return (CRATE_VIEWS as readonly string[]).includes(value);
}

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  const [head, ...rest] = path.split('/');
  const tail = rest.join('/');
  switch (head) {
    case 'crate': {
      // `tail` is everything after `crate`, so split it again: the first
      // segment is the view, whatever follows is the period.
      const [view = '', ...periodParts] = tail.split('/');
      if (!isCrateView(view)) return { name: 'crate' };
      const period = periodParts.join('/');
      return period
        ? { name: 'crateView', view, period: decodeSegment(period) }
        : { name: 'crateView', view };
    }
    case 'playlists':
      return { name: 'playlists' };
    case 'playlist':
      return tail
        ? { name: 'playlist', id: decodeSegment(tail) }
        : { name: 'playlists' };
    case 'artists':
      return { name: 'artists' };
    case 'artist':
      return tail
        ? { name: 'artist', key: decodeSegment(tail) }
        : { name: 'artists' };
    case 'import':
      return { name: 'import' };
    case 'settings':
      return { name: 'settings' };
    default:
      return { name: 'top' };
  }
}

export function routeHref(route: Route): string {
  switch (route.name) {
    case 'playlist':
      return `#/playlist/${encodeURIComponent(route.id)}`;
    case 'artist':
      return `#/artist/${encodeURIComponent(route.key)}`;
    case 'crateView':
      return route.period
        ? `#/crate/${route.view}/${encodeURIComponent(route.period)}`
        : `#/crate/${route.view}`;
    default:
      return `#/${route.name}`;
  }
}

/** The `history` methods `visitEntry` needs, so it can be tested with a stub. */
export interface HistoryLike {
  state: unknown;
  replaceState(state: unknown, unused: string): void;
}

/** Marks a history entry the app has already been on. */
const VISITED = 'djVisited';

/**
 * Stamps the current history entry and reports whether the app is arriving on
 * it for the first time. A hash link creates an entry with no state, so `true`
 * means a new navigation — the screen should start at the top — and `false`
 * means back or forward, where `history.scrollRestoration` has already put the
 * page back where it was.
 */
export function visitEntry(h: HistoryLike): boolean {
  const state = h.state;
  const isObject = typeof state === 'object' && state !== null;
  if (isObject && (state as Record<string, unknown>)[VISITED] === true) {
    return false;
  }
  h.replaceState({ ...(isObject ? state : {}), [VISITED]: true }, '');
  return true;
}
