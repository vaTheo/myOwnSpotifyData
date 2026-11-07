/** Hub order, which is also the order of the rows on the Crate hub. */
export const CRATE_VIEWS = [
  'rotation',
  'gems',
  'classics',
  'year',
  'finish',
  'rarely-played',
] as const;

export type CrateView = (typeof CRATE_VIEWS)[number];

/**
 * `detail` is the track whose details sheet is open over a screen (spec 003,
 * contracts/routes.md): `?d=<id>` in the address, so a selection can be
 * bookmarked and closed with back. A list names its own row; any other
 * screen carries a track a search opened over it (US7). `key` on `mix` is
 * an open saved mix.
 */
export type Route = (
  | { name: 'overview' }
  | { name: 'top' }
  | { name: 'playlists' }
  | { name: 'playlist'; id: string }
  | { name: 'artists' }
  | { name: 'artist'; key: string }
  | { name: 'import' }
  | { name: 'settings' }
  | { name: 'mix'; key?: string }
  | { name: 'crate' }
  | { name: 'crateView'; view: CrateView; period?: string }
) & { detail?: string };

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
  const raw = hash.replace(/^#\/?/, '');
  const at = raw.indexOf('?');
  const route = parsePath(at === -1 ? raw : raw.slice(0, at));
  if (at === -1) return route;
  const detail = new URLSearchParams(raw.slice(at + 1)).get('d');
  return detail ? { ...route, detail } : route;
}

/** The path, without its `?d=` part; the detail parses on its own. */
function parsePath(path: string): Route {
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
    case 'mix':
      return tail ? { name: 'mix', key: decodeSegment(tail) } : { name: 'mix' };
    case 'top':
      return { name: 'top' };
    default:
      // The empty address, `#/` and anything unknown: the home (US8).
      return { name: 'overview' };
  }
}

function withDetail(href: string, detail: string | undefined): string {
  return detail ? `${href}?d=${encodeURIComponent(detail)}` : href;
}

function pathHref(route: Route): string {
  switch (route.name) {
    case 'overview':
      return '#/';
    case 'playlist':
      return `#/playlist/${encodeURIComponent(route.id)}`;
    case 'artist':
      return `#/artist/${encodeURIComponent(route.key)}`;
    case 'crateView':
      return route.period
        ? `#/crate/${route.view}/${encodeURIComponent(route.period)}`
        : `#/crate/${route.view}`;
    case 'mix':
      return route.key ? `#/mix/${encodeURIComponent(route.key)}` : '#/mix';
    default:
      return `#/${route.name}`;
  }
}

export function routeHref(route: Route): string {
  return withDetail(pathHref(route), route.detail);
}

/** The same route with its details sheet open on `detail`, or closed. */
export function withDetailOf(
  route: Route,
  detail: string | null | undefined
): Route {
  const next = { ...route };
  delete next.detail;
  return detail ? { ...next, detail } : next;
}

/**
 * Whether two routes are the same screen, a details sheet aside: opening or
 * closing a sheet keeps the list where it was scrolled (spec 003, US3).
 */
export function sameScreen(a: Route, b: Route): boolean {
  return routeHref(withDetailOf(a, null)) === routeHref(withDetailOf(b, null));
}

/** The five places of the navigation (contracts/routes.md, Destinations). */
export type Destination =
  'overview' | 'listening' | 'library' | 'mix' | 'settings';

export type DestinationTab = 'top' | 'crate' | 'playlists' | 'artists';

/** Where a route sits in the navigation, and the tab it opens there. */
export function destinationOf(route: Route): {
  destination: Destination;
  tab?: DestinationTab;
} {
  switch (route.name) {
    case 'overview':
      return { destination: 'overview' };
    case 'top':
      return { destination: 'listening', tab: 'top' };
    case 'crate':
    case 'crateView':
      return { destination: 'listening', tab: 'crate' };
    case 'playlists':
    case 'playlist':
      return { destination: 'library', tab: 'playlists' };
    case 'artists':
    case 'artist':
      return { destination: 'library', tab: 'artists' };
    case 'mix':
      return { destination: 'mix' };
    case 'settings':
    case 'import':
      return { destination: 'settings' };
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
