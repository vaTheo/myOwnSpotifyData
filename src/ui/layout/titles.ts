import { topArtistById, type Model } from '../../model/aggregate';
import { routeHref, type CrateView, type Route } from '../../router';

/** The Crate views' names, in the top bar and on the hub cards. */
export const CRATE_TITLE: Record<CrateView, string> = {
  rotation: 'Heavy rotation',
  gems: 'Forgotten gems',
  classics: 'All-time classics',
  year: 'By year',
  finish: 'Finish rate',
  'rarely-played': 'Rarely played',
};

/**
 * The top bar's title and its "up" link (spec 003, FR-004). A tab root is
 * named after its destination, since its tabs already say which part is
 * open; a detail is named after its item and leads up to its list.
 */
export function screenTitle(
  route: Route,
  model: Model | null
): { title: string; up: string | null } {
  switch (route.name) {
    case 'overview':
      return { title: 'Overview', up: null };
    case 'top':
    case 'crate':
      return { title: 'Listening', up: null };
    case 'playlists':
    case 'artists':
      return { title: 'Library', up: null };
    case 'mix':
      return { title: 'Mix', up: null };
    case 'settings':
      return { title: 'Settings', up: null };
    case 'crateView':
      return {
        title: CRATE_TITLE[route.view],
        up: routeHref({ name: 'crate' }),
      };
    case 'playlist':
      return {
        title: model?.playlistsById.get(route.id)?.name ?? 'Playlist',
        up: routeHref({ name: 'playlists' }),
      };
    case 'artist': {
      const name =
        model?.artistsByKey.get(route.key)?.name ??
        (model ? topArtistById(model, route.key)?.name : null) ??
        'Artist';
      return { title: name, up: routeHref({ name: 'artists' }) };
    }
    case 'import':
      return {
        title: 'Import listening history',
        up: routeHref({ name: 'settings' }),
      };
  }
}
