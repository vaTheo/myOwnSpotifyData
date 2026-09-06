/** SoundCloud oEmbed, a keyless public GET (spec §3.2). */
export const OEMBED_URL = 'https://soundcloud.com/oembed';

/** The only iframe src prefix the app will build a player from (spec §5.3). */
export const SC_PLAYER_PREFIX = 'https://w.soundcloud.com/player/';

export type OembedResult =
  | {
      status: 'ok';
      title: string;
      author: string;
      /** Passed on RAW (HTML entities and \r\n intact); the parser cleans it. */
      description: string;
      /**
       * The player iframe src, validated against SC_PLAYER_PREFIX, or null when
       * absent or from a foreign host. show_comments=true is NOT appended here:
       * MixRow.playerSrc stores this raw src and the screen (§5.2) appends it
       * when it builds the iframe.
       */
      playerSrc: string | null;
    }
  | { status: 'notFound' }
  | { status: 'error'; message: string };

/** `GET https://soundcloud.com/oembed?format=json&url=<encoded normUrl>`. */
export function oembedUrl(normUrl: string): string {
  return `${OEMBED_URL}?format=json&url=${encodeURIComponent(normUrl)}`;
}

function field(raw: unknown, name: string): unknown {
  if (typeof raw !== 'object' || raw === null) return undefined;
  return (raw as Record<string, unknown>)[name];
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * The iframe src out of the oEmbed `html`, kept only when it starts with the
 * literal SC_PLAYER_PREFIX (§5.3) — the check that makes "rebuild, don't
 * inject" safe. null when `html` is not a string, has no `src`, or the src is
 * from a foreign host.
 */
export function extractPlayerSrc(html: unknown): string | null {
  if (typeof html !== 'string') return null;
  const match = html.match(/\bsrc\s*=\s*"([^"]*)"/i);
  if (!match) return null;
  const src = match[1];
  return src.startsWith(SC_PLAYER_PREFIX) ? src : null;
}

/**
 * One keyless GET. A 404 — or any non-2xx — is `notFound` (a private, deleted
 * or mistyped mix is not a public track), never `error`; a transport failure
 * or a non-JSON body is `error`, whose `message` is a bare reason the screen
 * wraps as "The mix page could not be read: {message}" (§5.2). Default fetch
 * credentials only — never `credentials: 'include'` (spec §3).
 */
export async function fetchOembed(
  fetchFn: typeof fetch,
  normUrl: string
): Promise<OembedResult> {
  let res: Response;
  try {
    res = await fetchFn(oembedUrl(normUrl));
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
  if (!res.ok) return { status: 'notFound' };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { status: 'error', message: 'the mix page was not readable JSON' };
  }
  return {
    status: 'ok',
    title: str(field(body, 'title')),
    author: str(field(body, 'author_name')),
    description: str(field(body, 'description')),
    playerSrc: extractPlayerSrc(field(body, 'html')),
  };
}
