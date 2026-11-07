import type { FeatureValue } from '../db/schema';
import { parseYear } from '../model/year';
import { MAX_5XX_RETRIES, backoffMs, parseRetryAfter } from '../util/retry';

/** Batch endpoint; an id is either a Spotify track id or an ISRC. */
export const RECCOBEATS_URL = 'https://api.reccobeats.com/v1/audio-features';

/** Track lookup by Spotify id or ISRC (round 005: gives ReccoBeats' own id). */
export const RECCOBEATS_TRACK_URL = 'https://api.reccobeats.com/v1/track';

/** Albums asked per track; a track sits on far fewer in practice. */
export const ALBUM_PAGE_SIZE = 50;

/** 41 or more ids answer 400 "size must be between 1 and 40". */
export const MAX_IDS = 40;

const MAX_429_RETRIES = 5;
const DEFAULT_RETRY_AFTER_S = 10;
/** Above this, the wait is longer than the owner will sit with the app open. */
const MAX_RETRY_AFTER_S = 60;

export interface FetchDeps {
  fetchFn: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  /** Stamped on every value returned; the runner passes its own clock. */
  now?: () => number;
}

export type FetchedFeature = FeatureValue & { isrc: string | null };

export interface FeatureBatch {
  byId: Map<string, FetchedFeature>;
  byIsrc: Map<string, FetchedFeature>;
}

/** Uppercase and dash-free, so 'gb-aht-21-00123' and 'GBAHT2100123' meet. */
export function normalizeIsrc(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/-/g, '').toUpperCase();
  return cleaned === '' ? null : cleaned;
}

function field(raw: unknown, name: string): unknown {
  if (typeof raw !== 'object' || raw === null) return undefined;
  return (raw as Record<string, unknown>)[name];
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** The Spotify id is the last path segment of `href`. */
function idFromHref(href: unknown): string | null {
  if (typeof href !== 'string') return null;
  const last = href
    .replace(/[?#].*$/, '')
    .split('/')
    .filter((segment) => segment !== '')
    .pop();
  return last ?? null;
}

/** ReccoBeats' own id: a short non-empty string (a uuid), else null. */
function ridOf(value: unknown): string | null {
  return typeof value === 'string' && value !== '' && value.length <= 100
    ? value
    : null;
}

function majorFrom(mode: unknown): boolean | null {
  if (mode === 1) return true;
  if (mode === 0) return false;
  return null;
}

function toFeature(raw: unknown, fetchedAt: number): FetchedFeature {
  const tempo = num(field(raw, 'tempo'));
  const key = num(field(raw, 'key'));
  const rid = ridOf(field(raw, 'id'));
  return {
    ...(rid === null ? {} : { rid }),
    // A zero tempo is not a tempo; -1 is the API's "key unknown".
    bpm: tempo !== null && tempo > 0 ? tempo : null,
    key:
      key !== null && Number.isInteger(key) && key >= 0 && key <= 11
        ? key
        : null,
    major: majorFrom(field(raw, 'mode')),
    energy: num(field(raw, 'energy')),
    fetchedAt,
    isrc: normalizeIsrc(field(raw, 'isrc')),
  };
}

/**
 * One GET, retried on 429 (five times, honouring `Retry-After`, unless it asks
 * for more than a minute, which ends the lookup at once) and on a 5xx, a
 * network failure or a truncated body (three times, backing off). Any other
 * status throws at once. Returns the parsed body. Shared by every ReccoBeats
 * call so they fail the same way; the pacing belongs to the caller.
 */
async function getJson(url: string, deps: FetchDeps): Promise<unknown> {
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
      res = await deps.fetchFn(url);
    } catch (err) {
      if (await retryTransport()) continue;
      const reason = err instanceof Error ? err.message : String(err);
      // `cause` is required by ESLint 10's preserve-caught-error rule.
      throw new Error(`ReccoBeats is unreachable: ${reason}`, { cause: err });
    }
    if (res.status === 429) {
      const parsedSeconds = parseRetryAfter(res.headers.get('Retry-After'));
      if (parsedSeconds !== null && parsedSeconds > MAX_RETRY_AFTER_S) {
        throw new Error(
          `ReccoBeats asked us to wait ${Math.ceil(parsedSeconds / 60)} min. Try again later.`
        );
      }
      attempts429 += 1;
      if (attempts429 > MAX_429_RETRIES) {
        throw new Error(
          'ReccoBeats rate limited the lookup too many times. Try again later.'
        );
      }
      await deps.sleep((parsedSeconds ?? DEFAULT_RETRY_AFTER_S) * 1000);
      continue;
    }
    if (res.status >= 500) {
      if (await retryTransport()) continue;
      throw new Error(`ReccoBeats server error ${res.status}`);
    }
    if (!res.ok) throw new Error(`ReccoBeats error ${res.status}`);
    try {
      return await res.json();
    } catch {
      // A truncated 200 is a transport failure, not "no results": marking
      // forty tracks notFound for ninety days over it would be wrong.
      if (await retryTransport()) continue;
      throw new Error('ReccoBeats returned a malformed response');
    }
  }
}

function contentOf(body: unknown): unknown[] {
  const content = field(body, 'content');
  return Array.isArray(content) ? content : [];
}

function checkBatch(ids: string[]): void {
  if (ids.length > MAX_IDS) {
    throw new Error(
      `ReccoBeats takes at most ${MAX_IDS} ids per request ` +
        `(size must be between 1 and ${MAX_IDS}), got ${ids.length}`
    );
  }
}

function idsQuery(ids: string[]): string {
  return ids.map(encodeURIComponent).join(',');
}

/**
 * One request for at most `MAX_IDS` ids, with `getJson`'s retries. The
 * batching and the one-request-per-second pacing belong to the caller.
 */
export async function fetchAudioFeatures(
  ids: string[],
  deps: FetchDeps
): Promise<FeatureBatch> {
  const byId = new Map<string, FetchedFeature>();
  const byIsrc = new Map<string, FetchedFeature>();
  if (ids.length === 0) return { byId, byIsrc };
  checkBatch(ids);
  const now = deps.now ?? Date.now;
  const body = await getJson(`${RECCOBEATS_URL}?ids=${idsQuery(ids)}`, deps);
  const fetchedAt = now();
  for (const raw of contentOf(body)) {
    const feature = toFeature(raw, fetchedAt);
    const id = idFromHref(field(raw, 'href'));
    if (id !== null) byId.set(id, feature);
    if (feature.isrc !== null) byIsrc.set(feature.isrc, feature);
  }
  return { byId, byIsrc };
}

/**
 * Round 005: ReccoBeats' own id for at most `MAX_IDS` Spotify ids, for rows
 * stored before the audio-features answer's `id` was kept. Spotify id ->
 * ReccoBeats id; a track ReccoBeats does not know is absent.
 */
export async function fetchTrackRids(
  ids: string[],
  deps: FetchDeps
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  checkBatch(ids);
  const body = await getJson(
    `${RECCOBEATS_TRACK_URL}?ids=${idsQuery(ids)}`,
    deps
  );
  for (const raw of contentOf(body)) {
    const spotifyId = idFromHref(field(raw, 'href'));
    const rid = ridOf(field(raw, 'id'));
    if (spotifyId !== null && rid !== null) out.set(spotifyId, rid);
  }
  return out;
}

/**
 * Round 005: the earliest valid release year among the albums ReccoBeats
 * lists for one of its tracks (the original release, not a compilation), or
 * null when none carries a year. One page of `ALBUM_PAGE_SIZE` albums.
 */
export async function fetchAlbumYear(
  rid: string,
  deps: FetchDeps
): Promise<number | null> {
  const url = `${RECCOBEATS_TRACK_URL}/${encodeURIComponent(rid)}/album?size=${ALBUM_PAGE_SIZE}`;
  const body = await getJson(url, deps);
  let earliest: number | null = null;
  for (const album of contentOf(body)) {
    const year = parseYear(field(album, 'releaseDate'));
    if (year !== null && (earliest === null || year < earliest))
      earliest = year;
  }
  return earliest;
}
