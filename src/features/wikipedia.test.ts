import { describe, expect, it, vi } from 'vitest';
import {
  PAGEVIEWS_URL,
  WIKIPEDIA_INTERVAL_MS,
  fetchPageviews,
  pageviewWindow,
} from './wikipedia';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** 5 Sep 2026, the day the spec computes its worked example for. */
const NOW = Date.UTC(2026, 8, 5, 11, 30);

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/** One `items[]` entry per month, so a body is one call away from a sum. */
function views(...monthly: number[]): Response {
  return json({
    items: monthly.map((v, i) => ({
      project: 'en.wikipedia',
      article: 'Anetha',
      granularity: 'monthly',
      timestamp: `2025${String(9 + i).padStart(2, '0')}0100`,
      access: 'all-access',
      agent: 'user',
      views: v,
    })),
  });
}

function setup(responses: Array<() => Response | Promise<Response>>) {
  const fetchFn = vi.fn<FetchLike>(async () => {
    const next = responses.shift();
    if (!next) throw new Error('unexpected extra request');
    return next();
  });
  const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
  const deps = {
    fetchFn: fetchFn as unknown as typeof fetch,
    sleep,
    now: () => NOW,
  };
  return { deps, fetchFn, sleep };
}

function urlFor(project: string, title: string): string {
  return (
    `${PAGEVIEWS_URL}/${project}/all-access/user/${title}` +
    '/monthly/2025090100/2026083100'
  );
}

describe('pageviewWindow', () => {
  it('spans the twelve complete months before the current one', () => {
    expect(pageviewWindow(NOW)).toEqual({
      start: '2025090100',
      end: '2026083100',
    });
  });

  it('gives the same window on the first and the last day of a month', () => {
    const first = pageviewWindow(Date.UTC(2026, 8, 1, 0, 0));
    const last = pageviewWindow(Date.UTC(2026, 8, 30, 23, 59));
    expect(first).toEqual({ start: '2025090100', end: '2026083100' });
    expect(last).toEqual(first);
    // The day before is one month earlier on both ends, never a partial month.
    expect(pageviewWindow(Date.UTC(2026, 7, 31, 23, 59))).toEqual({
      start: '2025080100',
      end: '2026073100',
    });
  });

  it('crosses a year boundary and lands on short months', () => {
    expect(pageviewWindow(Date.UTC(2026, 0, 15))).toEqual({
      start: '2025010100',
      end: '2025123100',
    });
    // March: the window ends on 28 or 29 February, not on the 30th.
    expect(pageviewWindow(Date.UTC(2027, 2, 10))).toEqual({
      start: '2026030100',
      end: '2027022800',
    });
    expect(pageviewWindow(Date.UTC(2028, 2, 10))).toEqual({
      start: '2027030100',
      end: '2028022900',
    });
  });

  it('reads the clock in UTC, not in the device zone', () => {
    // Half an hour after midnight UTC on 1 September is still 31 August in
    // every western zone; half an hour before it is already 1 September in
    // every eastern one. Both must answer with the September window.
    expect(pageviewWindow(Date.UTC(2026, 8, 1, 0, 30))).toEqual({
      start: '2025090100',
      end: '2026083100',
    });
    expect(pageviewWindow(Date.UTC(2026, 7, 31, 23, 30))).toEqual({
      start: '2025080100',
      end: '2026073100',
    });
  });
});

describe('fetchPageviews', () => {
  it('asks both projects with the stored title verbatim, paced apart', async () => {
    const { deps, fetchFn, sleep } = setup([() => views(1), () => views(2)]);
    await fetchPageviews(
      { en: '%C3%89tienne_de_Cr%C3%A9cy', fr: 'Anetha' },
      deps
    );
    expect(fetchFn.mock.calls.map((c) => c[0])).toEqual([
      'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article' +
        '/en.wikipedia.org/all-access/user/%C3%89tienne_de_Cr%C3%A9cy' +
        '/monthly/2025090100/2026083100',
      urlFor('fr.wikipedia.org', 'Anetha'),
    ]);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([WIKIPEDIA_INTERVAL_MS]);
    expect(WIKIPEDIA_INTERVAL_MS).toBe(250);
  });

  it('escapes a literal slash in a title so it cannot split the path', async () => {
    const { deps, fetchFn } = setup([() => views(1)]);
    await fetchPageviews({ en: 'AC/DC', fr: null }, deps);
    expect(fetchFn.mock.calls.map((c) => c[0])).toEqual([
      urlFor('en.wikipedia.org', 'AC%2FDC'),
    ]);
  });

  it('sums English and French views and keeps both parts', async () => {
    const { deps } = setup([() => views(3227), () => views(4000, 300, 31)]);
    const result = await fetchPageviews({ en: 'Anetha', fr: 'Anetha' }, deps);
    expect(result).toEqual({
      status: 'ok',
      value: 7558,
      en: 3227,
      fr: 4331,
      months: 12,
      sourceUrl: urlFor('en.wikipedia.org', 'Anetha'),
    });
  });

  it('counts a 404 on one language as zero and cites the one that answered', async () => {
    const { deps } = setup([
      () => json({ title: 'Not found.' }, 404),
      () => views(2791),
    ]);
    const result = await fetchPageviews(
      { en: 'Roza_Terenzi', fr: 'Roza_Terenzi' },
      deps
    );
    expect(result).toEqual({
      status: 'ok',
      value: 2791,
      en: 0,
      fr: 2791,
      months: 12,
      sourceUrl: urlFor('fr.wikipedia.org', 'Roza_Terenzi'),
    });
  });

  it('reads a 404 on both languages as notFound with no number', async () => {
    const { deps, fetchFn } = setup([
      () => json({ title: 'Not found.' }, 404),
      () => json({ title: 'Not found.' }, 404),
    ]);
    const result = await fetchPageviews({ en: 'Nobody', fr: 'Nobody' }, deps);
    expect(result).toEqual({
      status: 'notFound',
      value: null,
      en: null,
      fr: null,
      months: 12,
      sourceUrl: urlFor('en.wikipedia.org', 'Nobody'),
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('keeps an all-zero answer as ok with zero, not as notFound', async () => {
    const { deps } = setup([() => views(0, 0, 0)]);
    const result = await fetchPageviews({ en: 'Quiet_Artist', fr: null }, deps);
    expect(result.status).toBe('ok');
    expect(result.value).toBe(0);
    expect(result.en).toBe(0);
    expect(result.fr).toBeNull();
  });

  it('asks only for the language it holds a title for', async () => {
    const { deps, fetchFn, sleep } = setup([() => views(6464)]);
    const result = await fetchPageviews(
      { en: null, fr: 'Shanti_Celeste' },
      deps
    );
    expect(fetchFn.mock.calls.map((c) => c[0])).toEqual([
      urlFor('fr.wikipedia.org', 'Shanti_Celeste'),
    ]);
    expect(sleep).not.toHaveBeenCalled();
    expect(result.value).toBe(6464);
    expect(result.en).toBeNull();
  });

  it('ignores an item whose views field is not a number', async () => {
    const { deps } = setup([
      () =>
        json({
          items: [
            { timestamp: '2025090100', views: 100 },
            { timestamp: '2025100100', views: null },
            { timestamp: '2025110100' },
          ],
        }),
    ]);
    const result = await fetchPageviews({ en: 'Anz', fr: null }, deps);
    expect(result.value).toBe(100);
  });

  it('reports retryLater and no partial sum when a language keeps failing', async () => {
    const { deps, fetchFn, sleep } = setup([
      () => views(3227),
      () => json({}, 503),
      () => json({}, 503),
      () => json({}, 503),
      () => json({}, 503),
    ]);
    const result = await fetchPageviews({ en: 'Anetha', fr: 'Anetha' }, deps);
    expect(result).toEqual({
      status: 'retryLater',
      value: null,
      en: null,
      fr: null,
      months: 12,
      sourceUrl: urlFor('en.wikipedia.org', 'Anetha'),
    });
    expect(fetchFn).toHaveBeenCalledTimes(5);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([250, 2000, 4000, 8000]);
  });

  it('treats an aborted request as a transport failure', async () => {
    const abort = () =>
      Promise.reject(
        new DOMException('The operation was aborted.', 'TimeoutError')
      );
    const { deps } = setup([abort, abort, abort, abort]);
    const result = await fetchPageviews({ en: 'Anetha', fr: null }, deps);
    expect(result.status).toBe('retryLater');
    const recovered = setup([abort, () => views(42)]);
    const second = await fetchPageviews(
      { en: 'Anetha', fr: null },
      recovered.deps
    );
    expect(second.value).toBe(42);
  });

  it('makes no request at all when neither language has a title', async () => {
    const { deps, fetchFn } = setup([]);
    const result = await fetchPageviews({ en: null, fr: null }, deps);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'notFound',
      value: null,
      en: null,
      fr: null,
      months: 12,
      sourceUrl: '',
    });
  });

  it('aborts each hung request after fifteen seconds', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const { deps, fetchFn } = setup([() => views(1), () => views(1)]);
    await fetchPageviews({ en: 'Anz', fr: 'Anz' }, deps);
    expect(timeout.mock.calls).toEqual([[15_000], [15_000]]);
    expect(fetchFn.mock.calls[1][1]?.signal).toBeInstanceOf(AbortSignal);
    timeout.mockRestore();
  });
});
