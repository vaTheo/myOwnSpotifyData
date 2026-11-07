import { model } from '../../model/state';
import { routeHref } from '../../router';
import { monthLabel, plural } from '../format';

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
        ? 'Sync your playlists in Settings to see where this sits'
        : `Not in any of your ${plural(m.playlists.length, 'playlist')}`}
    </p>
  );
}

export function OpenMonthLink(p: { month: string }) {
  return (
    <p>
      <a href={routeHref({ name: 'crateView', view: 'year', period: p.month })}>
        Open {monthLabel(p.month)} ›
      </a>
    </p>
  );
}
