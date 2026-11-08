/**
 * Round 011: the owner pastes a Spotify track link on a row Check on Spotify
 * did not find. Pure rules only: the text is parsed to a track id, which is
 * stored as given; never verified, never looked up (ADR-02, ADR-04).
 */
import type { TracklistRow } from '../../db/schema';

const ID = /^[A-Za-z0-9]{22}$/;
const HOSTS = new Set(['open.spotify.com', 'play.spotify.com']);

/** The track id of a pasted Spotify track link, or null. Accepts
 *  `http(s)://open.spotify.com/track/<id>` (or play.spotify.com) with an
 *  optional `/intl-xx/` segment and any query or fragment, and
 *  `spotify:track:<id>`. Everything else (albums, artists, playlists,
 *  episodes, `spotify.link` short links, other hosts, free text) is null. */
export function parseSpotifyTrackLink(text: string): string | null {
  const s = text.trim();
  if (!s) return null;
  const uri = /^spotify:track:([^\s:?#]+)$/.exec(s);
  if (uri) return ID.test(uri[1]) ? uri[1] : null;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!HOSTS.has(url.hostname.toLowerCase())) return null;
  if (url.username || url.password || url.port) return null;
  const m = /^\/(?:intl-[a-z]{2}(?:-[A-Za-z]{2})?\/)?track\/([^/]+)\/?$/.exec(
    url.pathname
  );
  if (!m) return null;
  return ID.test(m[1]) ? m[1] : null;
}

/** The row marked found with the owner's track. */
export function linkedRow(
  row: TracklistRow,
  id: string,
  now: number
): TracklistRow {
  return {
    ...row,
    spotify: { id, url: `https://open.spotify.com/track/${id}` },
    spotifyBy: 'owner',
    checkedAt: now,
  };
}

/** The row back to not found (Remove link); `checkedAt` kept. */
export function unlinkedRow(row: TracklistRow): TracklistRow {
  const out: TracklistRow = { ...row, spotify: 'not-found' };
  delete out.spotifyBy;
  return out;
}
