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
 * Letters SoundCloud transliterates that NFKD does NOT decompose: `ß`, `ø`,
 * `æ`, `œ`, `þ`, `ð`, `đ`, `ł` are distinct letters, not a base plus a
 * combining mark, so the accented-latin path (`é` to `e`) leaves them intact
 * and the `[^a-z0-9]` step would otherwise drop each to a hyphen — a mismatch
 * with SoundCloud's own slug (`ß` to `ss`, `ø` to `o`, `æ` to `ae`, …). Applied
 * before NFKD; the uppercase forms are mapped too, since transliteration runs
 * before the lowercase step. `å` is deliberately absent: it decomposes under
 * NFKD (`a` + combining ring) like any other accented latin letter.
 */
const TRANSLITERATION: Record<string, string> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  þ: 'th',
  ð: 'd',
  đ: 'd',
  ł: 'l',
  Æ: 'ae',
  Œ: 'oe',
  Ø: 'o',
  Þ: 'th',
  Ð: 'd',
  Đ: 'd',
  Ł: 'l',
};

function transliterate(text: string): string {
  let out = '';
  for (const ch of text) out += TRANSLITERATION[ch] ?? ch;
  return out;
}

/** The apostrophe glyphs SoundCloud drops from a slug: straight, both curly
 *  forms, and the backtick. */
const APOSTROPHES = /['\u2019\u2018`]/g;

/** How the slug pipeline treats an apostrophe. `'remove'` deletes it so
 *  `don't` becomes `dont` (SoundCloud's real behaviour); `'hyphen'` leaves it
 *  for the `[^a-z0-9]` step so `don't` becomes `don-t` (older reconstruction). */
type ApostropheMode = 'remove' | 'hyphen';

/** The shared slug pipeline: transliterate the special letters, NFKD + drop
 *  combining marks (accented latin like `\u00e9` to `e`), lowercase, apply the
 *  apostrophe rule for this variant, then non-alphanumerics to single hyphens,
 *  trimmed. Empty when the text slugs to nothing (symbol-only). */
function slugify(text: string, apostrophes: ApostropheMode): string {
  let slug = transliterate(text)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (apostrophes === 'remove') slug = slug.replace(APOSTROPHES, '');
  return slug.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Up to four candidate permalinks for a short link, reconstructed from oEmbed's
 * `author_url` (the uploader profile) and `title`, ordered most-likely first,
 * so TrackId — which needs the full permalink and rejects the short link and
 * the numeric id — can be tried on each behind its guard. The profile must be a
 * one-segment `soundcloud.com/<user>`.
 *
 * The candidates are the cross-product of two independent uncertainties in how
 * SoundCloud slugged the title:
 *
 * - the `" by <author>"` suffix oEmbed appends (verified 2026-09-06: the Lot
 *   Radio mix returned `"Naone @ The Lot Radio 01-11-2025 by The Lot Radio"`
 *   while its real slug is `naone-the-lot-radio-01-11-2025`) — sometimes the
 *   real slug omits it, sometimes it is genuinely part of the title, so both
 *   the stripped and the unstripped title are tried;
 * - the apostrophe — SoundCloud DROPS it (`don't` becomes `dont`), but a slug
 *   that turns every non-alphanumeric run into a hyphen produces `don-t`; both
 *   spellings are tried.
 *
 * Order: (1) suffix-stripped + apostrophes removed, (2) suffix-stripped +
 * apostrophes as hyphen, (3) not-stripped + apostrophes removed, (4)
 * not-stripped + apostrophes as hyphen. Each is normalised through
 * `normalizeMixUrl`, nulls dropped, then deduped preserving order — a title
 * with no apostrophe and no suffix collapses to a single candidate — and capped
 * at four. Empty when the profile is not a lone user segment or every variant
 * slugs to nothing.
 *
 * Each is only a *candidate*: the TrackId guard (rowCount 1 AND an exact url
 * match) confirms it, so a wrong reconstruction is a notFound, never a wrong
 * mix. The one residual risk is a slug collision with a *different* mix by the
 * same uploader, which the exact-match guard cannot distinguish.
 */
export function permalinkCandidates(
  authorUrl: string,
  title: string,
  author?: string
): string[] {
  let parsed: URL;
  try {
    parsed = new URL(authorUrl.trim());
  } catch {
    return [];
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return [];
  if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) return [];
  const segments = parsed.pathname.split('/').filter((s) => s.length > 0);
  if (segments.length !== 1) return [];
  const user = segments[0];

  const stripped = stripAuthorSuffix(title, author);
  const variants: Array<[string, ApostropheMode]> = [
    [stripped, 'remove'],
    [stripped, 'hyphen'],
    [title, 'remove'],
    [title, 'hyphen'],
  ];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const [text, mode] of variants) {
    const slug = slugify(text, mode);
    if (slug === '') continue;
    const url = normalizeMixUrl(`https://soundcloud.com/${user}/${slug}`);
    if (url === null || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length === 4) break;
  }
  return out;
}

/**
 * The single most-likely permalink for a short link, or null — a thin wrapper
 * over `permalinkCandidates`, kept so the public surface stays small. The live
 * short-link flow tries every candidate (`lookupMix`); this returns just the
 * first, which for a title with no apostrophe and no `" by <author>"` suffix is
 * the plain NFKD slug the older reconstruction produced.
 */
export function permalinkFromOembed(
  authorUrl: string,
  title: string,
  author?: string
): string | null {
  return permalinkCandidates(authorUrl, title, author)[0] ?? null;
}
