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
 *  cross-origin, so they are classified separately and resolved via oEmbed. */
const SHORTLINK_HOST = 'on.soundcloud.com';

/** A pasted link the screen knows how to look up: a canonical permalink, or an
 *  on.soundcloud.com mobile share link whose token oEmbed can resolve. */
export type MixInput =
  { kind: 'permalink'; url: string } | { kind: 'shortlink'; url: string };

/**
 * Sorts a pasted string into the one path that can look it up, or null when it
 * is neither a permalink nor a short link. A normalizable `soundcloud.com`
 * permalink is a `permalink` (its canonical form, ready for both providers and
 * the store key). An `on.soundcloud.com/<token>` link is a `shortlink`: the
 * token is the whole path, so the path/query/fragment are kept verbatim and
 * only the scheme (forced https) and host case are normalised — the redirect it
 * points at cannot be followed cross-origin, so oEmbed resolves it instead.
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

/** True when the input is an on.soundcloud.com mobile share link. */
export function isShortLink(input: string): boolean {
  return classifyMixInput(input)?.kind === 'shortlink';
}

/**
 * Drops a trailing `" by <author>"` (case-insensitive, tolerant of trailing
 * whitespace) from an oEmbed title when the author is known and something is
 * left. Left alone when `author` is empty, the suffix is absent, or stripping
 * would empty the title.
 */
function stripAuthorSuffix(title: string, author?: string): string {
  if (author === undefined || author.trim() === '') return title;
  const trimmed = title.trimEnd();
  const suffix = ` by ${author.trim()}`;
  if (!trimmed.toLowerCase().endsWith(suffix.toLowerCase())) return title;
  const head = trimmed.slice(0, trimmed.length - suffix.length).trimEnd();
  return head === '' ? title : head;
}

/**
 * Best-effort permalink for a short link, reconstructed from oEmbed's
 * `author_url` (the uploader profile) and `title`, so TrackId — which needs the
 * full permalink and rejects the short link and the numeric id — can be tried.
 * The slug is derived from the title the way SoundCloud slugs one (NFKD, drop
 * combining marks, lowercase, non-alphanumerics to single hyphens, trim
 * hyphens); the profile must be a one-segment `soundcloud.com/<user>`.
 *
 * SoundCloud oEmbed appends `" by <author_name>"` to the title (verified
 * 2026-09-06: the Lot Radio mix returned
 * `"Naone @ The Lot Radio 01-11-2025 by The Lot Radio"` while its real
 * permalink slug is `naone-the-lot-radio-01-11-2025`), but the slug is derived
 * from the title WITHOUT that suffix. When `author` is given, a trailing
 * `" by <author>"` is stripped first — without it the candidate carries a
 * spurious `-by-...` tail and TrackId returns rowCount 0 (measured).
 *
 * Returns null when the title slugs to nothing or the profile is not a lone
 * user segment. This is only a *candidate*: the TrackId guard (rowCount 1 AND
 * an exact url match) confirms it, so a wrong reconstruction is a notFound,
 * never a wrong mix.
 */
export function permalinkFromOembed(
  authorUrl: string,
  title: string,
  author?: string
): string | null {
  const slug = stripAuthorSuffix(title, author)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug === '') return null;
  let parsed: URL;
  try {
    parsed = new URL(authorUrl.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) return null;
  const segments = parsed.pathname.split('/').filter((s) => s.length > 0);
  if (segments.length !== 1) return null;
  return normalizeMixUrl(`https://soundcloud.com/${segments[0]}/${slug}`);
}
