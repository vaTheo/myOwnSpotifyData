import { msg } from '../../i18n';
import { model } from '../../model/state';
import { routeHref } from '../../router';
import { monthLabel } from '../format';

// Kept here too: the Crate views import it with the details' pieces.
export { monthLabel };

/**
 * Pieces the details sheet shares with the Crate views. They live here, not
 * in `crate/shared`, which opens the sheet: the details depend on nothing
 * of the Crate's, so the two never import each other.
 */

/**
 * The one sentence the details sheet shows when the track sits in none of
 * the synced playlists, so the wording exists once.
 */
export function NoPlaylistNote() {
  const m = model.value;
  if (!m) return null;
  return (
    <p>
      {m.playlists.length === 0
        ? msg().table.details.syncPlaylists
        : msg().table.details.notInAny(m.playlists.length)}
    </p>
  );
}

export function OpenMonthLink(p: { month: string }) {
  return (
    <p>
      <a href={routeHref({ name: 'crateView', view: 'year', period: p.month })}>
        {msg().table.details.openMonth(monthLabel(p.month))}
      </a>
    </p>
  );
}
