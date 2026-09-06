import { describe, expect, it, vi } from 'vitest';
import { REACH_REQUEST_TIMEOUT_MS } from '../util/retry';
import {
  MB_INTERVAL_MS,
  MUSICBRAINZ_URL,
  fetchMbid,
  mbUrl,
} from './musicbrainz';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const ARTIST = '2CIMQHirSU0MQqyYHq0eOx';
const MBID = '9dcd5e77-3915-4d4d-a80c-1c0b0d18f4de';
const RESOURCE = `https://open.spotify.com/artist/${ARTIST}`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function urlEntity(relations: unknown[], resource = RESOURCE): unknown {
  return { id: 'c0e0a1e2-0000-4000-8000-000000000001', resource, relations };
}

const FREE_STREAMING = {
  type: 'free streaming',
  'type-id': '769085a1-c2f7-4c24-a532-2375a77693bd',
  direction: 'backward',
  artist: { id: MBID, name: 'deadmau5' },
};

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

describe('fetchMbid', () => {
  it('asks the reverse url lookup and reads the free streaming relation', async () => {
    const { deps, fetchFn } = setup([() => json(urlEntity([FREE_STREAMING]))]);
    const result = await fetchMbid(ARTIST, deps);
    expect(fetchFn.mock.calls[0][0]).toBe(
      `${MUSICBRAINZ_URL}?resource=https%3A%2F%2Fopen.spotify.com%2Fartist%2F` +
        `${ARTIST}&inc=artist-rels&fmt=json`
    );
    expect(mbUrl(ARTIST)).toBe(fetchFn.mock.calls[0][0]);
    expect(result).toEqual({ status: 'ok', mbid: MBID });
  });

  it('sends no custom header, a 15 s abort signal and one request per second', async () => {
    const { deps, fetchFn, sleep } = setup([
      () => json(urlEntity([FREE_STREAMING])),
    ]);
    await fetchMbid(ARTIST, deps);
    const init = fetchFn.mock.calls[0][1];
    expect(init?.headers).toBeUndefined();
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.signal?.aborted).toBe(false);
    expect(REACH_REQUEST_TIMEOUT_MS).toBe(15_000);
    expect(MB_INTERVAL_MS).toBe(1000);
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([1000]);
  });

  it('skips a relation with no artist object and one of another type', async () => {
    const { deps } = setup([
      () =>
        json(
          urlEntity([
            { type: 'free streaming', direction: 'backward' },
            { type: 'social network', artist: { id: 'wrong-one' } },
            FREE_STREAMING,
          ])
        ),
    ]);
    expect(await fetchMbid(ARTIST, deps)).toEqual({
      status: 'ok',
      mbid: MBID,
    });
  });

  it('reads 404 and an answer with no artist relation as notFound', async () => {
    const missing = setup([() => json({ error: 'Not Found' }, 404)]);
    expect(await fetchMbid(ARTIST, missing.deps)).toEqual({
      status: 'notFound',
    });
    const empty = setup([() => json(urlEntity([]))]);
    expect(await fetchMbid(ARTIST, empty.deps)).toEqual({ status: 'notFound' });
  });

  it('refuses a resource that is not an artist url', async () => {
    const { deps } = setup([
      () =>
        json(
          urlEntity(
            [FREE_STREAMING],
            'https://open.spotify.com/user/cinthie-berlin'
          )
        ),
    ]);
    expect(await fetchMbid(ARTIST, deps)).toEqual({ status: 'notFound' });
  });

  it('never reads 503 as notFound: three backoffs, then retryLater', async () => {
    const { deps, fetchFn, sleep } = setup(
      Array.from({ length: 4 }, () => () => json({}, 503))
    );
    expect(await fetchMbid(ARTIST, deps)).toEqual({
      status: 'retryLater',
      message: 'MusicBrainz server error 503',
    });
    expect(fetchFn).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([
      1000, 2000, 1000, 4000, 1000, 8000, 1000,
    ]);
  });

  it('retries an aborted request and succeeds on the next attempt', async () => {
    const { deps, sleep } = setup([
      () =>
        Promise.reject(
          new DOMException('The operation was aborted', 'TimeoutError')
        ),
      () => json(urlEntity([FREE_STREAMING])),
    ]);
    expect(await fetchMbid(ARTIST, deps)).toEqual({ status: 'ok', mbid: MBID });
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([1000, 2000, 1000]);
  });

  it('gives up on a transport failure after the same three retries', async () => {
    const { deps, fetchFn } = setup(
      Array.from(
        { length: 4 },
        () => () => Promise.reject(new TypeError('Failed to fetch'))
      )
    );
    expect(await fetchMbid(ARTIST, deps)).toEqual({
      status: 'retryLater',
      message: 'MusicBrainz is unreachable: Failed to fetch',
    });
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it('retries a truncated body instead of reporting the artist absent', async () => {
    const { deps, fetchFn } = setup([
      () =>
        new Response('{"relations":[', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      () => json(urlEntity([FREE_STREAMING])),
    ]);
    expect(await fetchMbid(ARTIST, deps)).toEqual({ status: 'ok', mbid: MBID });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('reports any other status as retryLater, never as notFound', async () => {
    const { deps, fetchFn } = setup([() => json({}, 400)]);
    expect(await fetchMbid(ARTIST, deps)).toEqual({
      status: 'retryLater',
      message: 'MusicBrainz error 400',
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
