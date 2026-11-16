import { msg } from '../../i18n';
import { topArtistById, type Model } from '../../model/aggregate';
import { routeHref, type CrateView, type Route } from '../../router';

/**
 * The Crate views' names, in the top bar and on the hub cards. Each name is
 * read from the catalogue (`frame.crateViews`, the one source) when it is
 * drawn, so it follows the language shown (spec 031).
 */
export const CRATE_TITLE: Record<CrateView, string> = {
  get rotation() {
    return msg().frame.crateViews.rotation;
  },
  get gems() {
    return msg().frame.crateViews.gems;
  },
  get classics() {
    return msg().frame.crateViews.classics;
  },
  get year() {
    return msg().frame.crateViews.year;
  },
  get finish() {
    return msg().frame.crateViews.finish;
  },
  get 'rarely-played'() {
    return msg().frame.crateViews['rarely-played'];
  },
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
      return { title: msg().frame.nav.overview, up: null };
    case 'top':
    case 'crate':
      return { title: msg().frame.nav.listening, up: null };
    case 'playlists':
    case 'artists':
      return { title: msg().frame.nav.library, up: null };
    case 'mix':
      return { title: msg().frame.nav.mix, up: null };
    case 'settings':
      return { title: msg().frame.nav.settings, up: null };
    case 'crateView':
      return {
        title: CRATE_TITLE[route.view],
        up: routeHref({ name: 'crate' }),
      };
    case 'playlist':
      return {
        title:
          model?.playlistsById.get(route.id)?.name ??
          msg().frame.titles.playlist,
        up: routeHref({ name: 'playlists' }),
      };
    case 'artist': {
      const name =
        model?.artistsByKey.get(route.key)?.name ??
        (model ? topArtistById(model, route.key)?.name : null) ??
        msg().frame.titles.artist;
      return { title: name, up: routeHref({ name: 'artists' }) };
    }
    case 'import':
      return {
        title: msg().frame.titles.import,
        up: routeHref({ name: 'settings' }),
      };
  }
}
