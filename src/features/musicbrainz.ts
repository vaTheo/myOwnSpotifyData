import {
  MAX_5XX_RETRIES,
  REACH_REQUEST_TIMEOUT_MS,
  backoffMs,
} from '../util/retry';

/** Reverse lookup: a Spotify artist URL in, the MusicBrainz artist out. */
export const MUSICBRAINZ_URL = 'https://musicbrainz.org/ws/2/url';

/** The documented rate, and the whole of this app's etiquette (spec §3.1). */
export const MB_INTERVAL_MS = 1000;

const SPOTIFY_ARTIST_URL = 'https://open.spotify.com/artist/';

export interface MbDeps {
  fetchFn: typeof fetch;
  sleep: (ms: number) => Promise<void>;
}

/**
 * `retryLater` is never "artist absent": a 503 means rate-limited or globally
 * busy, and a transport failure means nothing at all (spec §3.1).
 */
export type MbResult =
  | { status: 'ok'; mbid: string }
  | { status: 'notFound' }
  | { status: 'retryLater'; message: string };

export function mbUrl(artistId: string): string {
  const resource = encodeURIComponent(`${SPOTIFY_ARTIST_URL}${artistId}`);
  return `${MUSICBRAINZ_URL}?resource=${resource}&inc=artist-rels&fmt=json`;
}

function field(raw: unknown, name: string): unknown {
  if (typeof raw !== 'object' || raw === null) return undefined;
  return (raw as Record<string, unknown>)[name];
}

/**
 * The relation whose type is `free streaming` and which carries an `artist`
 * object; the `artist` guard is the load-bearing one. The echoed `resource`
 * is checked too, as cheap insurance against a future response shape.
 */
function mbidFrom(body: unknown): string | null {
  const resource = field(body, 'resource');
  if (typeof resource === 'string' && !resource.includes('/artist/')) {
    return null;
  }
  const relations = field(body, 'relations');
  if (!Array.isArray(relations)) return null;
  for (const relation of relations) {
    if (field(relation, 'type') !== 'free streaming') continue;
    const id = field(field(relation, 'artist'), 'id');
    if (typeof id === 'string' && id !== '') return id;
  }
  return null;
}

/**
 * One artist, at one request per second: the client owns its own pace, so the
 * runner adds no sleep of its own. A 5xx, an abort, a transport failure or a
 * truncated body back off up to `MAX_5XX_RETRIES` times and then answer
 * `retryLater`; only a 404 or an answer with no artist relation is a
 * `notFound`.
 */
export async function fetchMbid(
  artistId: string,
  deps: MbDeps
): Promise<MbResult> {
  const url = mbUrl(artistId);
  let failures = 0;

  /** Counts, backs off and reports whether the caller should try again. */
  async function retry(): Promise<boolean> {
    failures += 1;
    if (failures > MAX_5XX_RETRIES) return false;
    await deps.sleep(backoffMs(failures));
    return true;
  }

  for (;;) {
    await deps.sleep(MB_INTERVAL_MS);
    let res: Response;
    try {
      res = await deps.fetchFn(url, {
        signal: AbortSignal.timeout(REACH_REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      if (await retry()) continue;
      const reason = err instanceof Error ? err.message : String(err);
      return {
        status: 'retryLater',
        message: `MusicBrainz is unreachable: ${reason}`,
      };
    }
    if (res.status === 404) return { status: 'notFound' };
    if (res.status >= 500) {
      if (await retry()) continue;
      return {
        status: 'retryLater',
        message: `MusicBrainz server error ${res.status}`,
      };
    }
    if (!res.ok) {
      return {
        status: 'retryLater',
        message: `MusicBrainz error ${res.status}`,
      };
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      if (await retry()) continue;
      return {
        status: 'retryLater',
        message: 'MusicBrainz returned a malformed response',
      };
    }
    const mbid = mbidFrom(body);
    return mbid === null ? { status: 'notFound' } : { status: 'ok', mbid };
  }
}
