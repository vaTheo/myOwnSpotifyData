import type { ReachStatus } from '../db/schema';
import {
  MAX_5XX_RETRIES,
  REACH_REQUEST_TIMEOUT_MS,
  backoffMs,
  parseRetryAfter,
} from '../util/retry';

/** Project, title and the window complete the URL. */
export const PAGEVIEWS_URL =
  'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article';

/** The two languages this app asks for, in the order it asks them. */
export const WIKIPEDIA_PROJECTS = {
  en: 'en.wikipedia.org',
  fr: 'fr.wikipedia.org',
} as const;

/** No rate limit is documented; four requests per second is the ruling. */
export const WIKIPEDIA_INTERVAL_MS = 250;

/** The window is the last twelve *complete* months, in UTC. */
export const PAGEVIEW_MONTHS = 12;

const MAX_429_RETRIES = 5;
const DEFAULT_RETRY_AFTER_S = 10;
const MAX_RETRY_AFTER_S = 60;

export type WikiLang = keyof typeof WIKIPEDIA_PROJECTS;

/** `ArtistIdentityRow.wikiTitles`: sitelink segments, or null. */
export interface WikiTitles {
  en: string | null;
  fr: string | null;
}

export interface PageviewWindow {
  /** `YYYYMMDD00`, the first day of the oldest month in the window. */
  start: string;
  /** `YYYYMMDD00`, the last day of the newest complete month. */
  end: string;
}

export interface WikipediaDeps {
  fetchFn: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

export interface PageviewsResult {
  status: ReachStatus;
  /** en + fr views over the window; null unless `status` is 'ok'. */
  value: number | null;
  /** Per-language sums: null when unasked or unusable, 0 on a 404. */
  en: number | null;
  fr: number | null;
  /** The window length, always `PAGEVIEW_MONTHS`. */
  months: number;
  /**
   * The URL of the first language that answered 200, else the first URL
   * asked, else '' when neither language had a title.
   */
  sourceUrl: string;
}

/** `YYYYMMDD00` in UTC. */
function stamp(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}00`;
}

/**
 * The last `PAGEVIEW_MONTHS` complete months before `now`. The month in
 * progress is excluded: a partial bucket reads as a collapse (Kettama's
 * August-2026 bucket is 402 against a 12,791 monthly average). UTC, because
 * the API is UTC-dated — unlike the Crate's deliberately local month buckets.
 */
export function pageviewWindow(now: number): PageviewWindow {
  const asked = new Date(now);
  const year = asked.getUTCFullYear();
  const month = asked.getUTCMonth();
  // Day 0 of the current month is the last day of the previous one, and
  // Date.UTC rolls a negative month back into the previous year on its own.
  return {
    start: stamp(new Date(Date.UTC(year, month - PAGEVIEW_MONTHS, 1))),
    end: stamp(new Date(Date.UTC(year, month, 0))),
  };
}

function field(raw: unknown, name: string): unknown {
  if (typeof raw !== 'object' || raw === null) return undefined;
  return (raw as Record<string, unknown>)[name];
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** One language: the summed views, `'notFound'` on a 404, or `'retryLater'`. */
async function fetchOne(
  url: string,
  deps: WikipediaDeps
): Promise<number | 'notFound' | 'retryLater'> {
  let attempts429 = 0;
  let attempts5xx = 0;

  async function retryTransport(): Promise<boolean> {
    attempts5xx += 1;
    if (attempts5xx > MAX_5XX_RETRIES) return false;
    await deps.sleep(backoffMs(attempts5xx));
    return true;
  }

  for (;;) {
    let res: Response;
    try {
      res = await deps.fetchFn(url, {
        signal: AbortSignal.timeout(REACH_REQUEST_TIMEOUT_MS),
      });
    } catch {
      if (await retryTransport()) continue;
      return 'retryLater';
    }
    // The one status that means "this article has no data", never a failure.
    if (res.status === 404) return 'notFound';
    if (res.status === 429) {
      const seconds = parseRetryAfter(res.headers.get('Retry-After'));
      if (seconds !== null && seconds > MAX_RETRY_AFTER_S) return 'retryLater';
      attempts429 += 1;
      if (attempts429 > MAX_429_RETRIES) return 'retryLater';
      await deps.sleep((seconds ?? DEFAULT_RETRY_AFTER_S) * 1000);
      continue;
    }
    if (!res.ok) {
      if (await retryTransport()) continue;
      return 'retryLater';
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      if (await retryTransport()) continue;
      return 'retryLater';
    }
    const items = field(body, 'items');
    let total = 0;
    for (const item of Array.isArray(items) ? items : []) {
      total += num(field(item, 'views')) ?? 0;
    }
    return total;
  }
}

/**
 * The en + fr view total over the last twelve complete months. Titles are the
 * stored sitelink segments and go into the path **verbatim apart from a
 * literal slash**: they are already percent-encoded, and a decode/re-encode
 * round trip would corrupt that (see `wikidata.ts`'s `articleTitle`). A raw
 * `/` is the one character a title can still carry that changes the path's
 * shape — `AC/DC` would otherwise 404 as a two-segment path — so it alone is
 * escaped here, at the point the URL is built.
 *
 * A 404 for one language contributes 0; a 404 for both is `notFound`. A
 * transport failure or a 5xx past its retries on either language makes the
 * whole result `retryLater` and stores no number at all — a partial sum kept
 * as `ok` would sit behind the ninety-day TTL and understate the artist.
 */
export async function fetchPageviews(
  titles: WikiTitles,
  deps: WikipediaDeps
): Promise<PageviewsResult> {
  const span = pageviewWindow(deps.now());
  const sums: Record<WikiLang, number | null> = { en: null, fr: null };
  let firstUrl = '';
  let okUrl = '';
  let answered = false;

  for (const lang of ['en', 'fr'] as WikiLang[]) {
    const title = titles[lang];
    if (title === null) continue;
    const project = WIKIPEDIA_PROJECTS[lang];
    const path = title.replace(/\//g, '%2F');
    const url =
      `${PAGEVIEWS_URL}/${project}/all-access/user/${path}` +
      `/monthly/${span.start}/${span.end}`;
    if (firstUrl === '') firstUrl = url;
    else await deps.sleep(WIKIPEDIA_INTERVAL_MS);
    const one = await fetchOne(url, deps);
    if (one === 'retryLater') {
      return {
        status: 'retryLater',
        value: null,
        en: null,
        fr: null,
        months: PAGEVIEW_MONTHS,
        sourceUrl: okUrl === '' ? firstUrl : okUrl,
      };
    }
    if (one === 'notFound') {
      sums[lang] = 0;
      continue;
    }
    sums[lang] = one;
    if (!answered) {
      okUrl = url;
      answered = true;
    }
  }

  if (!answered) {
    return {
      status: 'notFound',
      value: null,
      en: null,
      fr: null,
      months: PAGEVIEW_MONTHS,
      sourceUrl: firstUrl,
    };
  }
  return {
    status: 'ok',
    value: (sums.en ?? 0) + (sums.fr ?? 0),
    en: sums.en,
    fr: sums.fr,
    months: PAGEVIEW_MONTHS,
    sourceUrl: okUrl,
  };
}
