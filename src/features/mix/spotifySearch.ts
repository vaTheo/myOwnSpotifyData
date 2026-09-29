import { hasScope, type Session } from '../../auth/session';
import type { TracklistRow } from '../../db/schema';
import { normalize } from '../../model/normalize';
import type { SpotifyClient } from '../../spotify/client';
import type { ApiSearchTracks, ApiTrack } from '../../spotify/types';
import { cleanTitle, isMixedCopy, primaryArtist } from '../rekordbox-match';

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
 * The search result that is confidently the row's track, else null. A wrong
 * track is never returned: the artist must match across ALL credited names,
 * the title must be equal or a prefix (never a free substring), and the result
 * must be a real `spotify:track:` recording. An equal title anywhere in the
 * results beats an earlier prefix one, so a row "One" takes "One" over a
 * higher-ranked "One More Time" by the same artist, and among equal titles
 * the original beats a DJ-mix compilation's "(Mixed)" copy.
 */
export function pickMatch(
  row: TracklistRow,
  items: ApiTrack[]
): ApiTrack | null {
  const rowArtist = normalize(primaryArtist(row.artist));
  const rowTitle = cleanTitle(row.title);
  // A title that is only a marker ("(Mixed)") names no track at all.
  if (rowTitle === '') return null;
  const candidates = items.filter(
    // Real track only: skips episodes and `spotify:local:` results, which
    // cannot be added by URI.
    (item) =>
      item.uri.startsWith('spotify:track:') &&
      item.id !== null &&
      artistMatches(rowArtist, item)
  );
  // Equality ignores spaces ('freakout' is 'freak out'); the prefix rule does
  // not: unspaced, 'freakout' would be a prefix of 'freak outer limits'.
  const exact = candidates.filter((item) => {
    const candTitle = cleanTitle(item.name);
    return candTitle === rowTitle || unspaced(candTitle) === unspaced(rowTitle);
  });
  if (exact.length > 0)
    return exact.find((item) => !isMixedCopy(item.name)) ?? exact[0];
  // Prefix handles the remix case ('losing it' is a prefix of 'losing it ted
  // remix'); the reverse is NOT allowed, so a row that asks for the remix
  // cannot accept a bare original. Whole words only: 'go' never takes 'gold'.
  return (
    candidates.find((item) =>
      cleanTitle(item.name).startsWith(`${rowTitle} `)
    ) ?? null
  );
}

/**
 * Artist across EVERY credited name: a collab's primary artist is often not
 * the one a mix credits. One name must hold the other as whole words, so
 * "timothy leary" matches "dr timothy leary" but "x" never matches "alex".
 */
function artistMatches(rowArtist: string, item: ApiTrack): boolean {
  return item.artists.some((a) => {
    const n = normalize(a.name);
    // Guard the empties first: `x.includes('')` is vacuously true, so a row
    // whose primary artist normalises to '' (e.g. artist "?, Fisher" ->
    // primaryArtist "?" -> "") would otherwise disable the artist check and
    // let a wrong-artist same-title track through — breaking "never a wrong
    // track". An empty on either side is never a match.
    if (n === '' || rowArtist === '') return false;
    return (
      ` ${n} `.includes(` ${rowArtist} `) || ` ${rowArtist} `.includes(` ${n} `)
    );
  });
}

/**
 * A cleaned title without the spaces between letters, which `normalize` made
 * from hyphens ('freak out' → 'freakout'). A space beside a digit stays, so
 * 'part 1 2' never becomes 'part 12'.
 */
function unspaced(s: string): string {
  return s.replace(/(?<=\p{L}) (?=\p{L})/gu, '');
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
      // Search's maximum. A common artist name ("Gemini") can push the right
      // track below the first five; ten costs the same one request.
      limit: 10,
    });
    const items = Array.isArray(res.tracks?.items) ? res.tracks.items : [];
    const hit = pickMatch(row, items);
    if (hit) return { row, uri: hit.uri, matchedName: hit.name };
  }
  return { row, uri: null, matchedName: null };
}
