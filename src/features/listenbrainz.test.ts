import { describe, expect, it, vi } from 'vitest';
import {
  LISTENBRAINZ_STATS_URL,
  fetchListeners,
  listenersUrl,
} from './listenbrainz';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** FISHER, the MBID the research probed live on 2026-09-05. */
const MBID = '886dc0c9-3351-4d2d-b762-060cf1e66929';
const LISTENERS_URL = `${LISTENBRAINZ_STATS_URL}/${MBID}/listeners`;

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

function setup(responses: Array<() => Response | Promise<Response>>) {
  const fetchFn = vi.fn<FetchLike>(async () => {
    const next = responses.shift();
    if (!next) throw new Error('unexpected extra request');
    return next();
  });
  const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
  const deps = { fetchFn: fetchFn as unknown as typeof fetch, sleep };
  return { deps, fetchFn, sleep };
}

const FISHER = {
  payload: {
    artist_mbid: MBID,
    artist_name: 'FISHER',
    from_ts: 1104537600,
    last_updated: 1757030400,
    range: 'all_time',
    total_listen_count: 69448,
    total_user_count: 5051,
  },
};

describe('fetchListeners', () => {
  it('asks the listeners endpoint and reads the three payload fields', async () => {
    const { deps, fetchFn } = setup([() => json(FISHER)]);
    const result = await fetchListeners(MBID, 'FISHER', deps);
    expect(fetchFn.mock.calls[0][0]).toBe(
      'https://api.listenbrainz.org/1/stats/artist/' +
        '886dc0c9-3351-4d2d-b762-060cf1e66929/listeners'
    );
    // The run stamps rows for artists it never asked about with this url.
    expect(listenersUrl(MBID)).toBe(fetchFn.mock.calls[0][0]);
    expect(result).toEqual({
      status: 'ok',
      value: 5051,
      listens: 69448,
      sourceUrl: LISTENERS_URL,
    });
  });

  it('reads the counts under payload only, never from the top level', async () => {
    const { deps } = setup([
      () => json({ artist_name: 'FISHER', total_user_count: 5051 }),
    ]);
    const result = await fetchListeners(MBID, 'FISHER', deps);
    expect(result.status).toBe('notFound');
    expect(result.value).toBeNull();
  });

  it('reads a 204 with an empty body as notFound', async () => {
    const { deps, fetchFn, sleep } = setup([
      () => new Response(null, { status: 204 }),
    ]);
    const result = await fetchListeners(MBID, 'Hugo LX', deps);
    expect(result).toEqual({
      status: 'notFound',
      value: null,
      listens: null,
      sourceUrl: LISTENERS_URL,
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('reads a payload without total_user_count as notFound', async () => {
    const { deps } = setup([
      () => json({ payload: { artist_name: 'FISHER', listeners: [] } }),
    ]);
    const result = await fetchListeners(MBID, 'FISHER', deps);
    expect(result.status).toBe('notFound');
    expect(result.listens).toBeNull();
  });

  it('stores no number when the echoed name is another artist', async () => {
    const { deps } = setup([
      () =>
        json({ payload: { ...FISHER.payload, artist_name: 'India Fisher' } }),
    ]);
    const result = await fetchListeners(MBID, 'FISHER', deps);
    expect(result.status).toBe('notFound');
    expect(result.value).toBeNull();
  });

  it('stores no number when the payload echoes no name at all', async () => {
    const { deps } = setup([
      () => json({ payload: { total_user_count: 5051 } }),
    ]);
    const result = await fetchListeners(MBID, 'FISHER', deps);
    expect(result.status).toBe('notFound');
  });

  it('accepts a name differing only by case, accents or punctuation', async () => {
    const shouty = setup([
      () => json({ payload: { artist_name: 'ANETHA', total_user_count: 705 } }),
    ]);
    expect((await fetchListeners(MBID, 'Anetha', shouty.deps)).value).toBe(705);
    const accented = setup([
      () =>
        json({
          payload: { artist_name: 'Étienne de Crécy', total_user_count: 12 },
        }),
    ]);
    expect(
      (await fetchListeners(MBID, 'Etienne de Crecy', accented.deps)).value
    ).toBe(12);
  });

  it('reads a 404 as notFound', async () => {
    const { deps, fetchFn } = setup([() => json({ error: 'not found' }, 404)]);
    const result = await fetchListeners(MBID, 'FISHER', deps);
    expect(result.status).toBe('notFound');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('waits Retry-After seconds on 429 and repeats the same request', async () => {
    const { deps, fetchFn, sleep } = setup([
      () => json({}, 429, { 'Retry-After': '3' }),
      () => json(FISHER),
    ]);
    const result = await fetchListeners(MBID, 'FISHER', deps);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([3000]);
    expect(fetchFn.mock.calls[1][0]).toBe(fetchFn.mock.calls[0][0]);
    expect(result.value).toBe(5051);
  });

  it('waits ten seconds without a header and gives up after five 429s', async () => {
    const { deps, fetchFn, sleep } = setup(
      Array.from({ length: 6 }, () => () => json({}, 429))
    );
    const result = await fetchListeners(MBID, 'FISHER', deps);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([
      10_000, 10_000, 10_000, 10_000, 10_000,
    ]);
    expect(fetchFn).toHaveBeenCalledTimes(6);
    expect(result).toEqual({
      status: 'retryLater',
      value: null,
      listens: null,
      sourceUrl: LISTENERS_URL,
    });
    expect(result.pauseForMs).toBeUndefined();
  });

  it('pauses the source when Retry-After asks for more than a minute', async () => {
    const { deps, fetchFn, sleep } = setup([
      () => json({}, 429, { 'Retry-After': '7200' }),
    ]);
    const result = await fetchListeners(MBID, 'FISHER', deps);
    expect(result.status).toBe('retryLater');
    expect(result.pauseForMs).toBe(7_200_000);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('backs off three times on 503 and then asks for a retry later', async () => {
    const { deps, fetchFn, sleep } = setup(
      Array.from({ length: 4 }, () => () => json({}, 503))
    );
    const result = await fetchListeners(MBID, 'FISHER', deps);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([2000, 4000, 8000]);
    expect(fetchFn).toHaveBeenCalledTimes(4);
    expect(result.status).toBe('retryLater');
    expect(result.pauseForMs).toBeUndefined();
  });

  it('treats an aborted request as a transport failure, then retries later', async () => {
    const abort = () =>
      Promise.reject(
        new DOMException('The operation was aborted.', 'TimeoutError')
      );
    const { deps, sleep } = setup([abort, abort, abort, abort]);
    const result = await fetchListeners(MBID, 'FISHER', deps);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([2000, 4000, 8000]);
    expect(result.status).toBe('retryLater');
    const recovered = setup([abort, () => json(FISHER)]);
    expect((await fetchListeners(MBID, 'FISHER', recovered.deps)).value).toBe(
      5051
    );
  });

  it('retries a truncated body instead of reporting no listeners', async () => {
    const { deps, fetchFn } = setup([
      () =>
        new Response('{"payload":{', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      () => json(FISHER),
    ]);
    const result = await fetchListeners(MBID, 'FISHER', deps);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(result.value).toBe(5051);
  });

  it('treats an authentication wall as retryLater, never notFound', async () => {
    const { deps, fetchFn } = setup(
      Array.from({ length: 4 }, () => () => json({ code: 401 }, 401))
    );
    const result = await fetchListeners(MBID, 'FISHER', deps);
    expect(result.status).toBe('retryLater');
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it('aborts a hung request after fifteen seconds', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const { deps, fetchFn } = setup([() => json(FISHER)]);
    await fetchListeners(MBID, 'FISHER', deps);
    expect(timeout).toHaveBeenCalledWith(15_000);
    expect(fetchFn.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    timeout.mockRestore();
  });
});
