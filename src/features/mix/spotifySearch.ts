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
 * track is never returned: one credited artist must be the row's artist (see
 * `artistCore`), the title must be equal or the row's title plus a version
 * tail (never a free substring or extra words), and the result must be a real
 * `spotify:track:` recording. An equal title anywhere in the results beats an
 * earlier version, and among equal titles the original beats a DJ-mix
 * compilation's "(Mixed)" copy.
 */
export function pickMatch(
  row: TracklistRow,
  items: ApiTrack[]
): ApiTrack | null {
  const rowArtist = artistCore(primaryArtist(row.artist));
  const rowTitle = cleanTitle(row.title);
  // A title that is only a marker ("(Mixed)") names no track at all.
  if (rowTitle === '' || rowArtist === '') return null;
  const candidates = items.filter(
    // Real track only: skips episodes and `spotify:local:` results, which
    // cannot be added by URI. Artist across EVERY credited name: a collab's
    // primary artist is often not the one a mix credits.
    (item) =>
      item.uri.startsWith('spotify:track:') &&
      item.id !== null &&
      item.artists.some((a) => artistCore(a.name) === rowArtist)
  );
  const exact = candidates.filter((item) =>
    sameTitle(cleanTitle(item.name), rowTitle)
  );
  if (exact.length > 0)
    return exact.find((item) => !isMixedCopy(item.name)) ?? exact[0];
  // A longer title is accepted only as a version of the row's: the extra part
  // must be a bracketed or " - " tail ("Losing It (Ted Remix)"), so a bare row
  // can take a remix but "One" never takes "One More Time". The reverse is
  // NOT allowed: a row that asks for the remix cannot accept a bare original.
  return (
    candidates.find((item) =>
      versionBases(item.name).some((base) => sameTitle(base, rowTitle))
    ) ?? null
  );
}

/** Where a version tail may start: an opening bracket or a spaced dash. */
const VERSION_TAIL = /\s*[([]|\s+[-–—]\s+/g;

/** The cleaned title before each possible version tail of a Spotify name. */
function versionBases(name: string): string[] {
  return [...name.matchAll(VERSION_TAIL)]
    .filter((m) => m.index > 0)
    .map((m) => cleanTitle(name.slice(0, m.index)));
}

/** Equal, or equal once the spaces between letters are ignored. */
function sameTitle(a: string, b: string): boolean {
  return a === b || unspaced(a) === unspaced(b);
}

/** Words that may lead a name without changing who it is. */
const NAME_PREFIXES = new Set(['the', 'dj', 'dr', 'mr', 'mc', 'lil']);

/** A trailing "(OZ)"/"[UK]" tag that tells same-named artists apart. */
const NAME_TAG = /\s*[([][^)\]]*[)\]]\s*$/;

/**
 * The name two credits must share: normalised, a trailing tag dropped and
 * leading "The"/"DJ"/"Dr"/… words removed, so "FISHER (OZ)" is "fisher" and
 * "DJ Koze" is "koze". Compared for equality, never containment — a word of
 * one name ("Four") is not the other artist ("Four Tet"). '' never matches.
 */
function artistCore(name: string): string {
  const words = normalize(name.replace(NAME_TAG, '')).split(' ');
  while (words.length > 1 && NAME_PREFIXES.has(words[0])) words.shift();
  return words.join(' ');
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
