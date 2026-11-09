import { digLinks } from '../features/mix/digLinks';
import type { RowMenuItem } from './mix/RowMenu';

/**
 * Where to listen to a track row (round 017): the play button and the Listen
 * menu of every track list read this. Pure; no request is made until the
 * owner opens a link.
 */
export interface ListenTrack {
  /** The Spotify track id, `null` when the row has none (a local file). */
  id: string | null;
  /** The row's artist names, as the row shows them. */
  artist: string;
  title: string;
}

/**
 * The Spotify track id of a stored id, `null` for a missing or empty id and
 * for a local file (stored as a `spotify:local:…` URI, which has no page).
 */
export function spotifyTrackId(id: string | null | undefined): string | null {
  if (!id || id.startsWith('spotify:')) return null;
  return id;
}

/**
 * The Listen menu: Play on Spotify (the app's own link, opened in place) and
 * the Spotify web page when the track has an id, then the five search pages
 * of `digLinks` (ADR-04: searches, never a page found by name).
 */
export function trackListenItems(track: ListenTrack): RowMenuItem[] {
  const items: RowMenuItem[] = [];
  if (track.id !== null) {
    items.push(
      {
        label: 'Play on Spotify',
        href: `spotify:track:${track.id}`,
        app: true,
      },
      {
        label: 'Open Spotify web page',
        href: `https://open.spotify.com/track/${track.id}`,
      }
    );
  }
  for (const { label, href } of digLinks(track.artist, track.title))
    items.push({ label, href });
  return items;
}
