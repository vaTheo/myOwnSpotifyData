import { describe, expect, it, vi } from 'vitest';
import { buildUrl, createClient, paginate, type Query } from './client';
import { ApiError, QuotaError } from './errors';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

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
  const getAccessToken = vi.fn(async (force?: boolean) =>
    force ? 'fresh' : 'tok'
  );
  const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
  const client = createClient({
    fetchFn: fetchFn as unknown as typeof fetch,
    getAccessToken,
    sleep,
    now: () => 1_000_000,
  });
  return { client, fetchFn, getAccessToken, sleep };
}

function authHeader(fetchFn: ReturnType<typeof vi.fn<FetchLike>>, i: number) {
  const init = fetchFn.mock.calls[i][1] as RequestInit;
  return (init.headers as Record<string, string>).Authorization;
}

describe('buildUrl', () => {
  it('prefixes relative paths and skips undefined query values', () => {
    expect(buildUrl('/me/top/tracks', { limit: 50, fields: undefined })).toBe(
      'https://api.spotify.com/v1/me/top/tracks?limit=50'
    );
  });
  it('passes absolute urls through', () => {
    expect(buildUrl('https://api.spotify.com/v1/x?a=1')).toBe(
      'https://api.spotify.com/v1/x?a=1'
    );
  });
});

describe('createClient', () => {
  it('sends the bearer token and returns parsed JSON', async () => {
    const { client, fetchFn } = setup([() => json({ id: 'me' })]);
    await expect(client.get('/me')).resolves.toEqual({ id: 'me' });
    expect(fetchFn.mock.calls[0][0]).toBe('https://api.spotify.com/v1/me');
    expect(authHeader(fetchFn, 0)).toBe('Bearer tok');
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    const { client, fetchFn, getAccessToken } = setup([
      () => json({}, 401),
      () => json({ ok: true }),
    ]);
    await expect(client.get('/me')).resolves.toEqual({ ok: true });
    expect(getAccessToken).toHaveBeenCalledWith(true);
    expect(authHeader(fetchFn, 1)).toBe('Bearer fresh');
  });

  it('gives up after a second 401', async () => {
    const { client } = setup([() => json({}, 401), () => json({}, 401)]);
    await expect(client.get('/me')).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
    });
  });

  it('waits Retry-After seconds on a plain 429 and retries', async () => {
    const { client, sleep } = setup([
      () => json({}, 429, { 'Retry-After': '3' }),
      () => json({ ok: true }),
    ]);
    await expect(client.get('/me')).resolves.toEqual({ ok: true });
    expect(sleep).toHaveBeenCalledWith(3000);
  });

  it('backs off from 2 s when Retry-After is unreadable', async () => {
    const { client, sleep } = setup([
      () => json({}, 429),
      () => json({}, 429),
      () => json({ ok: true }),
    ]);
    await client.get('/me');
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([2000, 4000]);
  });

  it('throws QuotaError with a 24 h retry when the body says quota', async () => {
    const { client } = setup([
      () => json({ error: { status: 429, reason: 'QUOTA_EXCEEDED' } }, 429),
    ]);
    const err = await client.get('/me').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(QuotaError);
    expect((err as QuotaError).retryAt).toBe(1_000_000 + 86_400_000);
  });

  it('throws QuotaError when Retry-After exceeds five minutes', async () => {
    const { client } = setup([() => json({}, 429, { 'Retry-After': '61389' })]);
    const err = await client.get('/me').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(QuotaError);
    expect((err as QuotaError).retryAt).toBe(1_000_000 + 61_389_000);
  });

  it('retries 5xx three times then fails', async () => {
    const ok = setup([
      () => json({}, 503),
      () => json({}, 502),
      () => json({}, 500),
      () => json({ ok: true }),
    ]);
    await expect(ok.client.get('/me')).resolves.toEqual({ ok: true });
    expect(ok.sleep).toHaveBeenCalledTimes(3);

    const bad = setup([
      () => json({}, 500),
      () => json({}, 500),
      () => json({}, 500),
      () => json({}, 500),
    ]);
    await expect(bad.client.get('/me')).rejects.toMatchObject({
      name: 'ApiError',
      status: 500,
    });
  });

  it('surfaces other errors with the Spotify message', async () => {
    const { client } = setup([
      () => json({ error: { status: 404, message: 'Not found' } }, 404),
    ]);
    await expect(client.get('/playlists/x')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      message: 'Not found',
    });
    expect(new ApiError(0, 'x')).toBeInstanceOf(Error);
  });

  it('runs one request at a time', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { client, fetchFn } = setup([
      () => gate.then(() => json({ n: 1 })),
      () => json({ n: 2 }),
    ]);
    const first = client.get('/a');
    const second = client.get('/b');
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchFn).toHaveBeenCalledTimes(1);
    release();
    await expect(first).resolves.toEqual({ n: 1 });
    await expect(second).resolves.toEqual({ n: 2 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe('paginate', () => {
  it('walks offsets until a short page', async () => {
    const calls: unknown[] = [];
    const get = async <T>(_path: string, query?: Query): Promise<T> => {
      calls.push(query);
      const offset = (query as { offset: number }).offset;
      return { items: offset === 0 ? new Array(50).fill(1) : [1, 2] } as T;
    };
    const pages = [];
    for await (const p of paginate<number>(get, '/x', { a: 'b' }))
      pages.push(p.items.length);
    expect(pages).toEqual([50, 2]);
    expect(calls).toEqual([
      { a: 'b', limit: 50, offset: 0 },
      { a: 'b', limit: 50, offset: 50 },
    ]);
  });

  it('stops when the total is reached', async () => {
    const get = async <T>(): Promise<T> =>
      ({ items: new Array(50).fill(1), total: 50 }) as T;
    let n = 0;
    for await (const page of paginate<number>(get, '/x')) {
      n += page.items.length > 0 ? 1 : 0;
    }
    expect(n).toBe(1);
  });

  it('treats a page without items as the last page', async () => {
    const get = async <T>(): Promise<T> => ({}) as T;
    let n = 0;
    for await (const p of paginate<number>(get, '/x')) {
      n += p.items.length;
    }
    expect(n).toBe(0);
  });
});
