export type Route =
  | { name: 'top' }
  | { name: 'playlists' }
  | { name: 'playlist'; id: string }
  | { name: 'artists' }
  | { name: 'artist'; key: string }
  | { name: 'import' }
  | { name: 'settings' };

/** decodeURIComponent throws on a malformed escape; keep the raw segment. */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  const [head, ...rest] = path.split('/');
  const tail = rest.join('/');
  switch (head) {
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
    default:
      return `#/${route.name}`;
  }
}
