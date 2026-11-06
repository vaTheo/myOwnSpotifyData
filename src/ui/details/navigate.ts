import { parseRoute, routeHref, withDetailOf } from '../../router';

function go(hash: string, replace: boolean): void {
  if (replace) location.replace(`${location.href.split('#')[0]}${hash}`);
  else location.hash = hash;
}

/**
 * Opens the details sheet of `id` over the current screen (contracts/
 * routes.md): a first opening pushes `?d=`, so back closes it; moving to
 * another row while a sheet is open replaces the entry, so back never walks
 * through every row looked at.
 */
export function openDetail(id: string): void {
  const route = parseRoute(location.hash);
  const open = 'detail' in route && route.detail !== undefined;
  if (open && route.detail === id) return;
  go(routeHref(withDetailOf(route, id)), open);
}

/** Escape or ✕: the entry is replaced by the same screen without `?d=`. */
export function closeDetail(): void {
  go(routeHref(withDetailOf(parseRoute(location.hash), null)), true);
}
