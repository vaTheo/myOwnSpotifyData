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

/** The mobile "Copy link" host. Its links are a redirect the app cannot follow
 *  cross-origin, so they are classified separately; the worker follows them. */
const SHORTLINK_HOST = 'on.soundcloud.com';

/** A pasted SoundCloud link: a canonical permalink, or an on.soundcloud.com
 *  mobile share link. */
export type MixInput =
  { kind: 'permalink'; url: string } | { kind: 'shortlink'; url: string };

/**
 * Sorts a pasted string into its kind of SoundCloud link, or null when it
 * is neither a permalink nor a short link. A normalizable `soundcloud.com`
 * permalink is a `permalink` (its canonical form, ready for both providers and
 * the store key). An `on.soundcloud.com/<token>` link is a `shortlink`: the
 * token is the whole path, so the path/query/fragment are kept verbatim and
 * only the scheme (forced https) and host case are normalised — the redirect it
 * points at cannot be followed cross-origin.
 */
export function classifyMixInput(input: string): MixInput | null {
  const permalink = normalizeMixUrl(input);
  if (permalink !== null) return { kind: 'permalink', url: permalink };
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (parsed.hostname.toLowerCase() !== SHORTLINK_HOST) return null;
  // A non-empty path is the short token; a bare host (or a lone slash) is not a
  // share link.
  if (parsed.pathname.split('/').filter((s) => s.length > 0).length === 0) {
    return null;
  }
  return {
    kind: 'shortlink',
    url: `https://${SHORTLINK_HOST}${parsed.pathname}${parsed.search}${parsed.hash}`,
  };
}

/** Query parameters that only track where a link was shared from. */
const TRACKING_PARAMS = new Set(['si', 'feature']);

/**
 * The canonical link of an identify request and the `mixes` key it lands on
 * (worker round, contracts/client-api.md). A SoundCloud permalink keeps
 * `normalizeMixUrl`'s form so the result joins the mix saved under it. A
 * phone share link (`on.soundcloud.com/<token>`) keeps `classifyMixInput`'s
 * form, the one a mix is saved under: the app cannot follow it, the
 * worker does (spec 028), so it is the request's link but not the address
 * downloaded. Any other SoundCloud link (a user page, a share link without a
 * token) is refused; any other `https:` link is kept with its hash and
 * tracking parameters dropped. Never `http:`, never free text.
 */
export function requestKey(input: string): string | null {
  const soundcloud = classifyMixInput(input);
  if (soundcloud !== null) return soundcloud.url;
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  const host = parsed.hostname.toLowerCase();
  if (ALLOWED_HOSTS.has(host) || host === SHORTLINK_HOST) return null;
  parsed.hash = '';
  for (const key of [...parsed.searchParams.keys()]) {
    if (key.startsWith('utm_') || TRACKING_PARAMS.has(key)) {
      parsed.searchParams.delete(key);
    }
  }
  return parsed.toString();
}
