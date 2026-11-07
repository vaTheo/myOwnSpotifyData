import type { Model } from '../../model/aggregate';
import { routeHref, withDetailOf, type Route } from '../../router';
import type { SearchEntry } from './searchIndex';

/**
 * The `?d=` a searched track takes over `route` (contracts/routes.md): the
 * Spotify or play row's track id, except on a playlist that holds the
 * track, where it is that entry's position, so its row is the one selected.
 */
export function detailOver(
  route: Route,
  model: Model,
  trackId: string
): string {
  if (route.name !== 'playlist') return trackId;
  const entry = model.entriesByPlaylist
    .get(route.id)
    ?.find((e) => e.trackKey === trackId);
  return entry ? String(entry.position) : trackId;
}

/**
 * Where choosing a result goes (research D11): a track opens its details
 * over the current screen; an artist, a playlist or a mix opens its route.
 */
export function resultHref(
  route: Route,
  model: Model,
  entry: Pick<SearchEntry, 'kind' | 'id'>
): string {
  switch (entry.kind) {
    case 'track':
      return routeHref(withDetailOf(route, detailOver(route, model, entry.id)));
    case 'artist':
      return routeHref({ name: 'artist', key: entry.id });
    case 'playlist':
      return routeHref({ name: 'playlist', id: entry.id });
    case 'mix':
      return routeHref({ name: 'mix', key: entry.id });
  }
}

/** The screens that draw their own details sheet for `?d=`. */
const OWN_SHEET = new Set<Route['name']>([
  'top',
  'playlist',
  'artist',
  'crateView',
]);

/**
 * The track whose sheet the frame draws itself: a `?d=` over a screen that
 * has no list of its own (Settings, Mix, the Playlists list…), or null.
 */
export function frameDetail(route: Route): string | null {
  return route.detail && !OWN_SHEET.has(route.name) ? route.detail : null;
}

/** The last items opened from search this session, newest first, at most 5. */
export function rememberRecent(
  recent: readonly SearchEntry[],
  entry: SearchEntry,
  max = 5
): SearchEntry[] {
  return [
    entry,
    ...recent.filter((e) => e.kind !== entry.kind || e.id !== entry.id),
  ].slice(0, max);
}

/**
 * What Escape in the search field does: a field with text clears first,
 * an empty one closes the view (escape.ts: a search field clears itself).
 */
export function escapeAction(query: string): 'clear' | 'close' {
  return query === '' ? 'close' : 'clear';
}
