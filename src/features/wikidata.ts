import type { ArtistIdentityRow } from '../db/schema';
import { REACH_REQUEST_TIMEOUT_MS } from '../util/retry';

export const WIKIDATA_URL = 'https://query.wikidata.org/sparql';

/**
 * Research §4.3 sizes a batch at ~200 and warns to chunk inside the 60 s
 * query timeout; 150 keeps headroom, and 1,000 artists is seven POSTs.
 */
export const WIKIDATA_BATCH_SIZE = 150;

export interface WikidataDeps {
  fetchFn: typeof fetch;
}

export interface WikidataHit {
  qid: string;
  /** `wikibase:sitelinks`, all languages; null when the item bound none. */
  sitelinks: number | null;
  /** Article path segments exactly as the sitelink spells them. */
  wikiTitles: { en: string | null; fr: string | null };
}

/**
 * `failed` is not `retryLater`: spec §3.2 leaves the whole batch `unchecked`
 * so the next run simply asks again, and counts one failure against the
 * Wikidata source.
 */
export type WikidataBatch =
  | { status: 'ok'; hits: Map<string, WikidataHit>; ambiguous: Set<string> }
  | { status: 'failed'; message: string };

/** TTLs are arguments because they are declared beside the run (spec §4.5). */
export interface WikidataFreshness {
  /** `REACH_TTL_MS`: an `ok` row's sitelinks and titles go stale at 90 days. */
  okMs: number;
  /** `REACH_NOT_FOUND_TTL_MS`: 30 days. */
  notFoundMs: number;
}

export function wikidataBatches(
  ids: string[],
  size = WIKIDATA_BATCH_SIZE
): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/** Every Spotify artist id and every MBID matches; nothing else may. */
const SAFE_ID = /^[A-Za-z0-9-]+$/;

function valuesBlock(ids: string[], name: string): string {
  const safe = ids.filter((id) => SAFE_ID.test(id)).map((id) => `"${id}"`);
  return `VALUES ?${name} { ${safe.join(' ')} }`;
}

const OPTIONALS = [
  '  OPTIONAL { ?item wikibase:sitelinks ?sitelinks }',
  '  OPTIONAL { ?en schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }',
  '  OPTIONAL { ?fr schema:about ?item ; schema:isPartOf <https://fr.wikipedia.org/> }',
].join('\n');

/**
 * Never `SAMPLE`: P1902 and P434 are both multi-valued, and sampling is what
 * produced a wrong "not recoverable" verdict during the research. The
 * `VALUES` join handles the multi-valued side correctly.
 */
function query(ids: string[], key: string, property: string): string {
  return [
    `SELECT ?${key} ?item ?sitelinks ?en ?fr WHERE {`,
    `  ${valuesBlock(ids, key)}`,
    `  ?item ${property} ?${key} .`,
    OPTIONALS,
    '}',
  ].join('\n');
}

export function spotifyIdQuery(ids: string[]): string {
  return query(ids, 'sid', 'wdt:P1902');
}

export function mbidQuery(mbids: string[]): string {
  return query(mbids, 'mbid', 'wdt:P434');
}

function field(raw: unknown, name: string): unknown {
  if (typeof raw !== 'object' || raw === null) return undefined;
  return (raw as Record<string, unknown>)[name];
}

/** A SPARQL JSON binding cell is `{ type, value }`. */
function bound(row: unknown, name: string): string | null {
  const value = field(field(row, name), 'value');
  return typeof value === 'string' && value !== '' ? value : null;
}

function qidFrom(item: string): string | null {
  const last = item.split('/').pop();
  return last === undefined || last === '' ? null : last;
}

function integer(raw: string | null): number | null {
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : null;
}

/**
 * Everything after `/wiki/`, kept verbatim — percent-encoded, underscores
 * intact — so the value drops straight into the pageviews path with no
 * decode/re-encode round trip. Taking the tail rather than the last segment
 * keeps a subpage title whole.
 */
function articleTitle(url: string | null): string | null {
  if (url === null) return null;
  const at = url.indexOf('/wiki/');
  if (at < 0) return null;
  const title = url.slice(at + '/wiki/'.length);
  return title === '' ? null : title;
}

function parse(body: unknown, key: string): WikidataBatch {
  const bindings = field(field(body, 'results'), 'bindings');
  if (!Array.isArray(bindings)) {
    return { status: 'failed', message: 'Wikidata returned no results' };
  }
  const hits = new Map<string, WikidataHit>();
  const ambiguous = new Set<string>();
  for (const row of bindings) {
    const id = bound(row, key);
    const item = bound(row, 'item');
    if (id === null || item === null || ambiguous.has(id)) continue;
    const qid = qidFrom(item);
    if (qid === null) continue;
    const seen = hits.get(id);
    if (seen !== undefined) {
      // Ambiguity the app cannot resolve must not promote an artist out of
      // the under-the-radar list (spec §3.2).
      if (seen.qid !== qid) {
        hits.delete(id);
        ambiguous.add(id);
      }
      continue;
    }
    const wikiTitles = {
      en: articleTitle(bound(row, 'en')),
      fr: articleTitle(bound(row, 'fr')),
    };
    // `sitelinks` and the two article URLs are three separate OPTIONALs, so
    // nothing in the query stops an item binding an article and no count. A
    // bound article *is* a sitelink, so the articles seen here are the floor:
    // without this, spec §2's invariant `wellKnown >= wikipedia` can break.
    const bound_ = integer(bound(row, 'sitelinks'));
    const articles = (wikiTitles.en ? 1 : 0) + (wikiTitles.fr ? 1 : 0);
    hits.set(id, {
      qid,
      sitelinks:
        bound_ === null && articles === 0
          ? null
          : Math.max(bound_ ?? 0, articles),
      wikiTitles,
    });
  }
  return { status: 'ok', hits, ambiguous };
}

/**
 * One POST for one batch. There is no retry: a failure leaves the batch
 * `unchecked` and the next run asks again (spec §3.2).
 */
async function ask(
  sparql: string,
  key: string,
  deps: WikidataDeps
): Promise<WikidataBatch> {
  let res: Response;
  try {
    res = await deps.fetchFn(WIKIDATA_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/sparql-results+json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ query: sparql }).toString(),
      signal: AbortSignal.timeout(REACH_REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { status: 'failed', message: `Wikidata is unreachable: ${reason}` };
  }
  if (!res.ok) {
    return { status: 'failed', message: `Wikidata error ${res.status}` };
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return {
      status: 'failed',
      message: 'Wikidata returned a malformed response',
    };
  }
  return parse(body, key);
}

/** Pass 1: the Spotify artist id itself, through P1902. */
export function resolveBySpotifyId(
  ids: string[],
  deps: WikidataDeps
): Promise<WikidataBatch> {
  return ask(spotifyIdQuery(ids), 'sid', deps);
}

/** Pass 2: the MBID MusicBrainz produced, through P434. */
export function resolveByMbid(
  mbids: string[],
  deps: WikidataDeps
): Promise<WikidataBatch> {
  return ask(mbidQuery(mbids), 'mbid', deps);
}

/**
 * Spec §3.2's pass-1 input: an unchecked id (an artist with no row included),
 * a `notFound` past its 30 days, an `ok` past its 90 days — that last one is
 * load-bearing, since an artist who gains their first article only leaves the
 * list when the sitelink count is refreshed. A `retryLater` waits for its own
 * `retryAfter`.
 *
 * The clock is `qidCheckedAt`, not `resolvedAt`: one identity row carries
 * three steps, a `notFound` MBID or Deezer id is rewritten every thirty days
 * and every write bumps `resolvedAt`, so a `resolvedAt` older than ninety days
 * is unreachable for those artists and the sitelink refresh would never fire.
 */
export function needsWikidata(
  row: ArtistIdentityRow | undefined,
  now: number,
  ttl: WikidataFreshness
): boolean {
  if (row === undefined) return true;
  // null means Wikidata has never answered about this artist.
  const checkedAt = row.qidCheckedAt ?? 0;
  switch (row.qidStatus) {
    case 'unchecked':
      return true;
    case 'notFound':
      return now - checkedAt >= ttl.notFoundMs;
    case 'ok':
      return now - checkedAt >= ttl.okMs;
    case 'retryLater':
      return row.retryAfter === null || now >= row.retryAfter;
  }
}
