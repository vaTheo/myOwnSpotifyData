import { describe, expect, it, vi } from 'vitest';
import { createServerClient, type ServerClient } from './client';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const BASE = 'https://project.supabase.co';
const KEY = 'sb_publishable_test';

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

function client(
  respond: (url: string, init?: RequestInit) => Response | Promise<Response>
): { c: ServerClient; fetchFn: ReturnType<typeof vi.fn<FetchLike>> } {
  const fetchFn = vi.fn<FetchLike>(async (url, init) => respond(url, init));
  const c = createServerClient({
    fetchFn: fetchFn as unknown as typeof fetch,
    baseUrl: BASE,
    apiKey: KEY,
    now: () => 1_000_000,
  });
  return { c, fetchFn };
}

function headersOf(init?: RequestInit): Record<string, string> {
  return Object.fromEntries(
    Object.entries((init?.headers ?? {}) as Record<string, string>).map(
      ([k, v]) => [k.toLowerCase(), v]
    )
  );
}

describe('headers', () => {
  it('sends apikey and the bearer token on a data call', async () => {
    const { c, fetchFn } = client(() =>
      json([], 200, { 'Content-Range': '*/0' })
    );
    await c.select('datasets', { select: '*' }, 'tok');
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`${BASE}/rest/v1/datasets?select=*`);
    const h = headersOf(init);
    expect(h.apikey).toBe(KEY);
    expect(h.authorization).toBe('Bearer tok');
  });
});

describe('auth', () => {
  it('requestLink posts the PKCE challenge, create_user false, and redirect_to', async () => {
    const { c, fetchFn } = client(() => json({}));
    const res = await c.requestLink(
      'me@example.com',
      'https://app.example/base/?link=server',
      'challenge123'
    );
    expect(res.ok).toBe(true);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(
      `${BASE}/auth/v1/otp?redirect_to=${encodeURIComponent('https://app.example/base/?link=server')}`
    );
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({
      email: 'me@example.com',
      create_user: false,
      code_challenge: 'challenge123',
      code_challenge_method: 's256',
    });
  });

  it('exchangeCode posts grant_type=pkce and maps the tokens', async () => {
    const { c, fetchFn } = client(() =>
      json({
        access_token: 'a',
        refresh_token: 'r',
        expires_in: 3600,
        user: { email: 'me@example.com' },
      })
    );
    const res = await c.exchangeCode('code1', 'verifier1');
    expect(res).toEqual({
      ok: true,
      value: {
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: 1_000_000 + 3_600_000,
        email: 'me@example.com',
      },
    });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`${BASE}/auth/v1/token?grant_type=pkce`);
    expect(JSON.parse(init?.body as string)).toEqual({
      auth_code: 'code1',
      code_verifier: 'verifier1',
    });
  });

  it('refresh posts grant_type=refresh_token', async () => {
    const { c, fetchFn } = client(() =>
      json({
        access_token: 'a2',
        refresh_token: 'r2',
        expires_in: 10,
        user: {},
      })
    );
    const res = await c.refresh('r1');
    expect(res.ok).toBe(true);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`${BASE}/auth/v1/token?grant_type=refresh_token`);
    expect(JSON.parse(init?.body as string)).toEqual({ refresh_token: 'r1' });
  });

  it('signOut posts to /logout with the bearer token', async () => {
    const { c, fetchFn } = client(() => new Response(null, { status: 204 }));
    const res = await c.signOut('tok');
    expect(res.ok).toBe(true);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`${BASE}/auth/v1/logout`);
    expect(headersOf(init).authorization).toBe('Bearer tok');
  });

  it('a 4xx on /otp is an error (the UI stays generic), a 429 names the wait', async () => {
    const { c } = client(() =>
      json(
        {
          code: 422,
          error_code: 'otp_disabled',
          msg: 'Signups not allowed for otp',
        },
        422
      )
    );
    const res = await c.requestLink('x@example.com', 'https://a/', 'ch');
    expect(res).toMatchObject({ ok: false, kind: 'error', status: 422 });
    const limited = client(() =>
      json({ code: 429, msg: 'over_email_send_rate_limit' }, 429, {
        'Retry-After': '60',
      })
    );
    const r2 = await limited.c.requestLink('x@example.com', 'https://a/', 'ch');
    expect(r2).toMatchObject({ ok: false, kind: 'error', status: 429 });
    if (!r2.ok) expect(r2.message).toMatch(/60/);
  });

  it('a 400 on the pkce exchange says to open the link in the asking browser', async () => {
    const { c } = client(() =>
      json({ code: 400, error_code: 'bad_code_verifier', msg: 'invalid' }, 400)
    );
    const res = await c.exchangeCode('c', 'v');
    expect(res).toMatchObject({ ok: false, kind: 'error' });
    if (!res.ok) expect(res.message).toMatch(/browser that asked/);
  });
});

describe('data calls', () => {
  it('upsert posts the rows with merge-duplicates', async () => {
    const { c, fetchFn } = client(() => new Response(null, { status: 201 }));
    const res = await c.upsert(
      'dataset_rows',
      [{ key: 'a' }, { key: 'b' }],
      'tok'
    );
    expect(res.ok).toBe(true);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`${BASE}/rest/v1/dataset_rows`);
    expect(init?.method).toBe('POST');
    expect(headersOf(init).prefer).toContain('resolution=merge-duplicates');
    expect(JSON.parse(init?.body as string)).toEqual([
      { key: 'a' },
      { key: 'b' },
    ]);
  });

  it('insert posts one row with return=representation and returns it (worker round)', async () => {
    const { c, fetchFn } = client(() =>
      json([{ id: 'u1', kind: 'identify-mix' }], 201)
    );
    const res = await c.insert<{ id: string }>(
      'jobs',
      { kind: 'identify-mix', payload: { url: 'https://x.y/z' } },
      'tok'
    );
    expect(res).toEqual({
      ok: true,
      value: { id: 'u1', kind: 'identify-mix' },
    });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`${BASE}/rest/v1/jobs`);
    expect(init?.method).toBe('POST');
    expect(headersOf(init).prefer).toBe('return=representation');
    expect(JSON.parse(init?.body as string)).toEqual({
      kind: 'identify-mix',
      payload: { url: 'https://x.y/z' },
    });
  });

  it('insert answered with no row is an error', async () => {
    const { c } = client(() => json([], 201));
    const res = await c.insert('jobs', { kind: 'x' }, 'tok');
    expect(res.ok).toBe(false);
  });

  it('update sends PATCH with the filters and returns the changed rows (worker round)', async () => {
    const { c, fetchFn } = client(() => json([{ id: 'u1' }], 200));
    const res = await c.update<{ id: string }>(
      'jobs',
      { id: 'eq.u1', applied_at: 'is.null' },
      { applied_at: '2026-11-06T10:00:00.000Z' },
      'tok'
    );
    expect(res).toEqual({ ok: true, value: [{ id: 'u1' }] });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`${BASE}/rest/v1/jobs?id=eq.u1&applied_at=is.null`);
    expect(init?.method).toBe('PATCH');
    expect(headersOf(init).prefer).toBe('return=representation');
    expect(JSON.parse(init?.body as string)).toEqual({
      applied_at: '2026-11-06T10:00:00.000Z',
    });
  });

  it('select sends the filters, the Range header, and parses Content-Range', async () => {
    const { c, fetchFn } = client(() =>
      json([{ key: 'a' }], 206, { 'Content-Range': '0-0/1234' })
    );
    const res = await c.select<{ key: string }>(
      'dataset_rows',
      { dataset: 'eq.library', generation: 'eq.5', order: 'store,key' },
      'tok',
      [0, 999]
    );
    expect(res).toEqual({
      ok: true,
      value: { rows: [{ key: 'a' }], total: 1234 },
    });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(
      `${BASE}/rest/v1/dataset_rows?dataset=eq.library&generation=eq.5&order=store%2Ckey`
    );
    const h = headersOf(init);
    expect(h.range).toBe('0-999');
    expect(h['range-unit']).toBe('items');
    expect(h.prefer).toContain('count=exact');
  });

  it('select reads an empty Content-Range as total 0 and a missing one as null', async () => {
    const empty = client(() => json([], 200, { 'Content-Range': '*/0' }));
    const r1 = await empty.c.select('datasets', {}, 'tok');
    expect(r1).toEqual({ ok: true, value: { rows: [], total: 0 } });
    const none = client(() => json([{ a: 1 }]));
    const r2 = await none.c.select('datasets', {}, 'tok');
    expect(r2).toEqual({ ok: true, value: { rows: [{ a: 1 }], total: null } });
  });

  it('remove sends DELETE with the filters', async () => {
    const { c, fetchFn } = client(() => new Response(null, { status: 204 }));
    const res = await c.remove(
      'dataset_rows',
      { dataset: 'eq.library', generation: 'lt.5' },
      'tok'
    );
    expect(res.ok).toBe(true);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(
      `${BASE}/rest/v1/dataset_rows?dataset=eq.library&generation=lt.5`
    );
    expect(init?.method).toBe('DELETE');
  });

  it('removeReturning sends DELETE asking for the rows back', async () => {
    const { c, fetchFn } = client(() => json([{ id: 'x' }]));
    const res = await c.removeReturning(
      'jobs',
      { id: 'eq.x', status: 'eq.queued', select: 'id' },
      'tok'
    );
    expect(res).toEqual({ ok: true, value: [{ id: 'x' }] });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`${BASE}/rest/v1/jobs?id=eq.x&status=eq.queued&select=id`);
    expect(init?.method).toBe('DELETE');
    expect(new Headers(init?.headers).get('Prefer')).toBe(
      'return=representation'
    );
  });

  it('rpc posts to /rpc/<name> and returns the value', async () => {
    const { c, fetchFn } = client(() => json(123456));
    const res = await c.rpc<number>('storage_used', 'tok');
    expect(res).toEqual({ ok: true, value: 123456 });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`${BASE}/rest/v1/rpc/storage_used`);
    expect(init?.method).toBe('POST');
  });
});

describe('error mapping', () => {
  it('a thrown fetch is offline, never a throw', async () => {
    const { c } = client(() => {
      throw new TypeError('Failed to fetch');
    });
    const res = await c.select('datasets', {}, 'tok');
    expect(res).toMatchObject({ ok: false, kind: 'offline' });
  });

  it.each([502, 503, 504])('a %s is offline', async (status) => {
    const { c } = client(() => new Response('bad gateway', { status }));
    expect(await c.select('datasets', {}, 'tok')).toMatchObject({
      ok: false,
      kind: 'offline',
      status,
    });
  });

  it('a 5xx whose body says the project is paused is paused', async () => {
    const { c } = client(
      () =>
        new Response(
          '<html>This project is paused. Resume it from the dashboard.</html>',
          { status: 503 }
        )
    );
    expect(await c.select('datasets', {}, 'tok')).toMatchObject({
      ok: false,
      kind: 'paused',
    });
  });

  it('a thrown fetch after a successful call is still offline, never paused', async () => {
    let n = 0;
    const { c } = client(() => {
      n++;
      if (n === 1) return json([], 200, { 'Content-Range': '*/0' });
      throw new TypeError('Failed to fetch');
    });
    expect((await c.select('datasets', {}, 'tok')).ok).toBe(true);
    expect(await c.select('datasets', {}, 'tok')).toMatchObject({
      ok: false,
      kind: 'offline',
    });
  });

  it('a 401 is unauthorized, a 413 is tooLarge', async () => {
    const u = client(() => json({ message: 'JWT expired' }, 401));
    expect(await u.c.select('datasets', {}, 'tok')).toMatchObject({
      ok: false,
      kind: 'unauthorized',
      status: 401,
    });
    const big = client(() => new Response('too big', { status: 413 }));
    expect(await big.c.upsert('dataset_rows', [{}], 'tok')).toMatchObject({
      ok: false,
      kind: 'tooLarge',
      status: 413,
    });
  });

  it('another 4xx is an error carrying the body message or hint', async () => {
    const { c } = client(() =>
      json(
        {
          code: 'PGRST204',
          message: 'Could not find column',
          hint: 'rename it',
        },
        400
      )
    );
    const res = await c.upsert('datasets', [{}], 'tok');
    expect(res).toMatchObject({ ok: false, kind: 'error', status: 400 });
    if (!res.ok) expect(res.message).toContain('Could not find column');
  });

  it('a 404 for a missing table is an error naming the migration', async () => {
    const { c } = client(() =>
      json(
        {
          code: 'PGRST205',
          message:
            "Could not find the table 'public.datasets' in the schema cache",
        },
        404
      )
    );
    const res = await c.select('datasets', {}, 'tok');
    expect(res).toMatchObject({ ok: false, kind: 'error', status: 404 });
    if (!res.ok) expect(res.message).toMatch(/migration/i);
  });
});
