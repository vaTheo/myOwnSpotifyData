/** The three SoundCloud hosts a real permalink can arrive on. */
const ALLOWED_HOSTS = new Set([
  'soundcloud.com',
  'www.soundcloud.com',
  'm.soundcloud.com',
]);

/**
 * Canonical SoundCloud permalink, or null when the input is not one.
 *
 * The output is the single string used three ways — sent to both providers,
 * compared by the TrackId guard, and used as the `mixes` store key — so one
 * mix cannot save twice under two tracking params. TrackId's `?url=` filter is
 * an exact string match, so the path is preserved verbatim: only the host is
 * lowercased and rewritten, the query and fragment are dropped, and exactly one
 * trailing slash is stripped.
 */
export function normalizeMixUrl(input: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    return null; // free text, or a scheme-less paste like "soundcloud.com/…"
  }
  // A permalink is a web link; reject ftp:, blob:, mailto: and the like.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const host = parsed.hostname.toLowerCase();
  // on.soundcloud.com short links need a redirect the app cannot follow
  // cross-origin, so they are not accepted here.
  if (!ALLOWED_HOSTS.has(host)) return null;
  // Drop the query and fragment (parsed.pathname already excludes both); strip
  // exactly one trailing slash. The path case is kept — an upper-cased path
  // returned rowCount 0 from TrackId in the research.
  let path = parsed.pathname;
  if (path.endsWith('/')) path = path.slice(0, -1);
  // Require /user/slug: a bare /user profile link is not a track.
  if (path.split('/').filter((segment) => segment.length > 0).length < 2) {
    return null;
  }
  return `https://soundcloud.com${path}`;
}
