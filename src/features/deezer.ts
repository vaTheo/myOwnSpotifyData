import type { TrackRow } from '../db/schema';
import { normalize } from '../model/normalize';
import { backoffMs } from '../util/retry';
import { JSONP_TIMEOUT_MS } from './jsonp';
import { normalizeIsrc } from './reccobeats';

export const DEEZER_API = 'https://api.deezer.com';

/**
 * Four requests per second: the research measured the quota at ~50 per 5 s
 * per IP and sized the job at <=8 req/s, and the owner chose half of that
 * envelope because a breach is invisible in the status line. The client owns
 * this pace, so the runner adds no sleep of its own.
 */
export const DEEZER_INTERVAL_MS = 250;

/** Ruling (spec §3.3): one artist costs at most four requests per run. */
export const MAX_ISRC_CANDIDATES = 3;

/** A quota refusal arrives as HTTP 200 with this code in the body. */
export const DEEZER_QUOTA_CODE = 4;

export const MAX_QUOTA_RETRIES = 5;

export interface DeezerDeps {
  jsonpFn: (url: string, timeoutMs: number) => Promise<unknown>;
  sleep: (ms: number) => Promise<void>;
}

export type DeezerIdentity =
  | { status: 'ok'; artistId: number; name: string }
  | { status: 'notFound' }
  | { status: 'retryLater'; message: string };

export type DeezerFans =
  | { status: 'ok'; fans: number; sourceUrl: string }
  | { status: 'notFound'; sourceUrl: string }
  | { status: 'retryLater'; message: string; sourceUrl: string };

export function deezerTrackUrl(isrc: string): string {
  return `${DEEZER_API}/track/isrc:${encodeURIComponent(isrc)}?output=jsonp`;
}

export function deezerArtistUrl(artistId: number): string {
  return `${DEEZER_API}/artist/${artistId}?output=jsonp`;
}

/**
 * `track.artist` is the release's main artist, so a candidate ISRC may only
 * come from a track credited to exactly this artist (spec §3.3): six of the
 * research's 61 resolved ISRCs otherwise landed on another entity and
 * returned a silently wrong number. Deduped and sorted, so a run is
 * deterministic, and normalised so Deezer's `/track/isrc:` path accepts them.
 */
export function candidateIsrcs(
  artistId: string,
  tracks: Iterable<TrackRow>
): string[] {
  const out = new Set<string>();
  for (const track of tracks) {
    if (track.isLocal) continue;
    if (track.artists.length !== 1) continue;
    if (track.artists[0].id !== artistId) continue;
    const isrc = normalizeIsrc(track.isrc);
    if (isrc !== null) out.add(isrc);
  }
  return [...out].sort();
}

function field(raw: unknown, name: string): unknown {
  if (typeof raw !== 'object' || raw === null) return undefined;
  return (raw as Record<string, unknown>)[name];
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

type Answer =
  { kind: 'body'; body: unknown } | { kind: 'retryLater'; message: string };

/**
 * One JSONP request, paced and quota-aware. The body is inspected and the
 * status is not, because a quota refusal is an HTTP 200; a rejection from the
 * transport (a timeout, a script error) is never a miss, since the body that
 * would have said "no such track" never arrived.
 */
async function ask(url: string, deps: DeezerDeps): Promise<Answer> {
  let refusals = 0;
  for (;;) {
    await deps.sleep(DEEZER_INTERVAL_MS);
    let body: unknown;
    try {
      body = await deps.jsonpFn(url, JSONP_TIMEOUT_MS);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return {
        kind: 'retryLater',
        message: `Deezer is unreachable: ${reason}`,
      };
    }
    if (num(field(field(body, 'error'), 'code')) !== DEEZER_QUOTA_CODE) {
      return { kind: 'body', body };
    }
    refusals += 1;
    if (refusals > MAX_QUOTA_RETRIES) {
      return {
        kind: 'retryLater',
        message:
          `Deezer is over quota: it refused ${MAX_QUOTA_RETRIES + 1} ` +
          `attempts (error ${DEEZER_QUOTA_CODE})`,
      };
    }
    await deps.sleep(backoffMs(refusals));
  }
}

/**
 * At most `MAX_ISRC_CANDIDATES` single-artist ISRCs, each accepted only when
 * the echoed Deezer name equals the Spotify name after `normalize()`. Every
 * other outcome is `notFound`: never a number from a collaboration or a remix
 * credit, and never a name search, which returned a 13-fan homonym for FISHER
 * during the research.
 */
export async function resolveDeezerArtist(
  name: string,
  isrcs: string[],
  deps: DeezerDeps
): Promise<DeezerIdentity> {
  const wanted = normalize(name);
  for (const isrc of isrcs.slice(0, MAX_ISRC_CANDIDATES)) {
    const answer = await ask(deezerTrackUrl(isrc), deps);
    if (answer.kind === 'retryLater') {
      return { status: 'retryLater', message: answer.message };
    }
    const artist = field(answer.body, 'artist');
    const artistId = num(field(artist, 'id'));
    const echoed = str(field(artist, 'name'));
    if (artistId === null || echoed === null) continue;
    if (normalize(echoed) !== wanted) continue;
    return { status: 'ok', artistId, name: echoed };
  }
  return { status: 'notFound' };
}

/** `nb_fan`: how many Deezer users pressed follow. One request. */
export async function fetchDeezerFans(
  artistId: number,
  deps: DeezerDeps
): Promise<DeezerFans> {
  const sourceUrl = deezerArtistUrl(artistId);
  const answer = await ask(sourceUrl, deps);
  if (answer.kind === 'retryLater') {
    return { status: 'retryLater', message: answer.message, sourceUrl };
  }
  const fans = num(field(answer.body, 'nb_fan'));
  return fans === null
    ? { status: 'notFound', sourceUrl }
    : { status: 'ok', fans, sourceUrl };
}
