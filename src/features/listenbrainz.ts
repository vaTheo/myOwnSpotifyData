import type { ReachStatus } from '../db/schema';
import { normalize } from '../model/normalize';
import {
  MAX_5XX_RETRIES,
  REACH_REQUEST_TIMEOUT_MS,
  backoffMs,
  parseRetryAfter,
} from '../util/retry';

/** The MBID and `/listeners` complete the URL. */
export const LISTENBRAINZ_STATS_URL =
  'https://api.listenbrainz.org/1/stats/artist';

/** "never more than ONE call per second" — the documented limit. */
export const LB_INTERVAL_MS = 1000;

const MAX_429_RETRIES = 5;
const DEFAULT_RETRY_AFTER_S = 10;
/** Above this the source pauses for the run instead of hanging the card. */
const MAX_RETRY_AFTER_S = 60;

export interface ListenBrainzDeps {
  fetchFn: typeof fetch;
  sleep: (ms: number) => Promise<void>;
}

export interface ListenersResult {
  status: ReachStatus;
  /** `payload.total_user_count`; null unless `status` is 'ok'. */
  value: number | null;
  /** `payload.total_listen_count`; null unless `status` is 'ok'. */
  listens: number | null;
  /** The request URL, kept as the row's provenance. */
  sourceUrl: string;
  /**
   * Set only when ListenBrainz asked for a wait longer than a minute: the
   * caller pauses the source for the rest of the run and stamps the later of
   * `now + pauseForMs` and the one-day floor on the `retryLater` rows it
   * writes for the artists still owed a request.
   */
  pauseForMs?: number;
}

/**
 * The request URL, exported because the run stamps `sourceUrl` on rows for
 * artists it never asked about — the ones still owed a request when
 * ListenBrainz names a wait longer than a minute (spec §4.3).
 *
 * The MBID is MusicBrainz's own `relation.artist.id`, so it is UUID-shaped
 * and encoding it changes nothing; it is defence against a future shape.
 * Wikipedia titles are the opposite case and must not be encoded (§3.2).
 */
export function listenersUrl(mbid: string): string {
  return `${LISTENBRAINZ_STATS_URL}/${encodeURIComponent(mbid)}/listeners`;
}

function field(raw: unknown, name: string): unknown {
  if (typeof raw !== 'object' || raw === null) return undefined;
  return (raw as Record<string, unknown>)[name];
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * One artist's `total_user_count`, with its own 429 and 5xx retries.
 *
 * `notFound` is reserved for the four answers that really mean "no number for
 * this artist": a 204, a 404, a payload without a finite `total_user_count`,
 * and a name the artist does not answer to. Every other non-2xx — a 401 the
 * day the endpoint moves behind auth included — is `retryLater`, so the run
 * pauses the source instead of writing a thirty-day `notFound` over the whole
 * library. Pacing (`LB_INTERVAL_MS`) belongs to the caller.
 */
export async function fetchListeners(
  mbid: string,
  name: string,
  deps: ListenBrainzDeps
): Promise<ListenersResult> {
  const sourceUrl = listenersUrl(mbid);
  const miss = (): ListenersResult => ({
    status: 'notFound',
    value: null,
    listens: null,
    sourceUrl,
  });
  const later = (pauseForMs?: number): ListenersResult => ({
    status: 'retryLater',
    value: null,
    listens: null,
    sourceUrl,
    pauseForMs,
  });
  let attempts429 = 0;
  let attempts5xx = 0;

  /** Counts, backs off and reports whether the caller should retry. */
  async function retryTransport(): Promise<boolean> {
    attempts5xx += 1;
    if (attempts5xx > MAX_5XX_RETRIES) return false;
    await deps.sleep(backoffMs(attempts5xx));
    return true;
  }

  for (;;) {
    let res: Response;
    try {
      res = await deps.fetchFn(sourceUrl, {
        signal: AbortSignal.timeout(REACH_REQUEST_TIMEOUT_MS),
      });
    } catch {
      // An abort and a dropped connection are the same thing here: no answer.
      if (await retryTransport()) continue;
      return later();
    }
    if (res.status === 429) {
      const seconds = parseRetryAfter(res.headers.get('Retry-After'));
      if (seconds !== null && seconds > MAX_RETRY_AFTER_S) {
        return later(seconds * 1000);
      }
      attempts429 += 1;
      if (attempts429 > MAX_429_RETRIES) return later();
      await deps.sleep((seconds ?? DEFAULT_RETRY_AFTER_S) * 1000);
      continue;
    }
    // 204 is `ok` as far as `Response` is concerned, and carries no body.
    if (res.status === 204 || res.status === 404) return miss();
    if (!res.ok) {
      if (await retryTransport()) continue;
      return later();
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      // A truncated 200 is a transport failure, not "no listeners".
      if (await retryTransport()) continue;
      return later();
    }
    const payload = field(body, 'payload');
    const value = num(field(payload, 'total_user_count'));
    if (value === null) return miss();
    const echoed = field(payload, 'artist_name');
    if (typeof echoed !== 'string' || normalize(echoed) !== normalize(name)) {
      return miss();
    }
    return {
      status: 'ok',
      value,
      listens: num(field(payload, 'total_listen_count')),
      sourceUrl,
    };
  }
}
