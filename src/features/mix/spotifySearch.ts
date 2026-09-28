import { hasScope, type Session } from '../../auth/session';
import type { TracklistRow } from '../../db/schema';
import { normalize } from '../../model/normalize';
import type { SpotifyClient } from '../../spotify/client';
import type { ApiSearchTracks, ApiTrack } from '../../spotify/types';
import { cleanTitle, primaryArtist } from '../rekordbox-match';

/**
 * True only when the granted scope carries `playlist-modify-private`, so the
 * app may create a private playlist. `hasScope` matches the whole token.
 */
export function canCreatePlaylists(session: Session | null): boolean {
  return hasScope(session, 'playlist-modify-private');
}

/**
 * The positive form of Mix.tsx's private `isInert`. `normalize` narrows `?` to
 * '', so a `?` row is inert too — the same behaviour the Mix screen relies on.
 */
export const INERT = new Set(['', 'id', 'unknown']);

export function isIdentified(row: TracklistRow): boolean {
  return (
    !row.gap &&
    !INERT.has(normalize(row.artist)) &&
    !INERT.has(normalize(row.title))
  );
}

/**
 * The first search result that is confidently the row's track, else null. A
 * wrong track is never returned: the artist must match across ALL credited
 * names, the title must be equal or a prefix (never a free substring), and the
 * result must be a real `spotify:track:` recording.
 */
export function pickMatch(
  row: TracklistRow,
  items: ApiTrack[]
): ApiTrack | null {
  const rowArtist = normalize(primaryArtist(row.artist));
  const rowTitle = cleanTitle(row.title);
  for (const item of items) {
    // Real track only: skips episodes and `spotify:local:` results, which
    // cannot be added by URI.
    if (!item.uri.startsWith('spotify:track:') || item.id === null) continue;
    const candTitle = cleanTitle(item.name);
    // Equality or prefix only. Prefix handles the remix case ('losing it' is a
    // prefix of 'losing it ted remix'); the reverse is NOT allowed, so a row
    // that asks for the remix cannot accept a bare original.
    if (candTitle !== rowTitle && !candTitle.startsWith(rowTitle)) continue;
    // Artist across EVERY credited name: a collab's primary artist is often
    // not the one a mix credits.
    const artistOk = item.artists.some((a) => {
      const n = normalize(a.name);
      // Guard the empties first: `x.includes('')` is vacuously true, so a row
      // whose primary artist normalises to '' (e.g. artist "?, Fisher" ->
      // primaryArtist "?" -> "") would otherwise disable the artist check and
      // let a wrong-artist same-title track through — breaking "never a wrong
      // track". An empty on either side is never a match.
      if (n === '' || rowArtist === '') return false;
      return n === rowArtist || n.includes(rowArtist) || rowArtist.includes(n);
    });
    if (artistOk) return item;
  }
  return null;
}

/** Any embedded `"` would close a `track:"…"` filter early; drop it. */
function stripQuotes(s: string): string {
  return s.replace(/"/g, '');
}

/** The result of resolving one mix row against Search. */
export interface RowMatch {
  row: TracklistRow;
  /** null = unmatched (nothing confident, or an inert row). */
  uri: string | null;
  matchedName: string | null;
}

/**
 * Resolve one row to a real Spotify track. Runs the RAW-text field query first
 * (`artist:"…" track:"…"`), then a plain `<artist> <title>` fallback, applying
 * `pickMatch` to each; returns the first confident hit or an unmatched result.
 * An inert row is never searched. Errors from `client.get` propagate.
 */
export async function searchTrack(
  client: Pick<SpotifyClient, 'get'>,
  row: TracklistRow
): Promise<RowMatch> {
  if (!isIdentified(row)) return { row, uri: null, matchedName: null };
  const artist = stripQuotes(primaryArtist(row.artist));
  const title = stripQuotes(row.title);
  // isrc/confidence are only trustworthy while the row still reads exactly
  // as Tracklistify detected it: editTracklistRow flips `source` away from
  // 'tracklistify' the moment artist/title differ from `detected`, so a row
  // the owner corrected never has its correction overridden by the stale
  // isrc of the identification they rejected.
  const trustDetection = row.source === 'tracklistify';
  const queries = [
    ...(trustDetection && row.isrc ? [`isrc:${row.isrc}`] : []),
    `artist:"${artist}" track:"${title}"`,
    `${row.artist} ${row.title}`,
  ];
  for (const q of queries) {
    const res = await client.get<ApiSearchTracks>('/search', {
      q,
      type: 'track',
      limit: 5,
    });
    const items = Array.isArray(res.tracks?.items) ? res.tracks.items : [];
    const hit = pickMatch(row, items);
    if (hit) return { row, uri: hit.uri, matchedName: hit.name };
  }
  return { row, uri: null, matchedName: null };
}
