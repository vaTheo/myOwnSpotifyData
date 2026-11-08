import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ServerResult } from './client';
import { createServerClient } from './client';
import {
  SHARED_MAX_IDS,
  SHARED_TIMEOUT_MS,
  createSharedFactsPort,
} from './sharedFacts';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const NOW = Date.parse('2026-11-08T12:00:00Z');
const id = (n: number) => `track${String(n).padStart(17, '0')}`;
const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function setup(
  respond: (url: string, init?: RequestInit) => Response | Promise<Response>,
  token: ServerResult<string> = { ok: true, value: 'tok' }
) {
  const fetchFn = vi.fn<FetchLike>(async (url, init) => respond(url, init));
  const client = createServerClient({
    fetchFn: fetchFn as unknown as typeof fetch,
    baseUrl: 'https://p.supabase.co',
    apiKey: 'k',
    now: () => NOW,
  });
  const port = createSharedFactsPort({
    client,
    getToken: async () => token,
    now: () => NOW,
  });
  return { port, fetchFn };
}

const bodyOf = (init?: RequestInit) => JSON.parse(String(init?.body));

afterEach(() => vi.useRealTimers());

describe('constants', () => {
  it('match the contract', () => {
    expect(SHARED_MAX_IDS).toBe(200);
    expect(SHARED_TIMEOUT_MS).toBe(10_000);
  });
});

describe('readTracks', () => {
  it('sends nothing for no ids', async () => {
    const { port, fetchFn } = setup(() => ok([]));
    expect(await port.readTracks([])).toEqual({ ok: true, value: [] });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('chunks at 200 ids and joins the answers', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => id(i));
    const { port, fetchFn } = setup((_url, init) =>
      ok(
        (bodyOf(init).ids as string[]).slice(0, 1).map((t) => ({
          track_id: t,
          bpm: 120,
          key: 1,
          major: true,
        }))
      )
    );
    const res = await port.readTracks(ids);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(fetchFn.mock.calls.map((c) => bodyOf(c[1]).ids.length)).toEqual([
      200, 200, 50,
    ]);
    expect(fetchFn.mock.calls[0]![0]).toBe(
      'https://p.supabase.co/rest/v1/rpc/get_track_facts'
    );
    expect(res).toMatchObject({ ok: true });
    if (res.ok)
      expect(res.value.map((r) => r.trackId)).toEqual([
        id(0),
        id(200),
        id(400),
      ]);
  });

  it('drops invalid and unasked rows', async () => {
    const { port } = setup(() =>
      ok([
        { track_id: id(1), bpm: 100, key: null, major: null },
        { track_id: id(2), bpm: 100, key: null, major: null },
        { track_id: id(1), bpm: 999, key: null, major: null },
        { track_id: id(3), bpm: 100, key: 12, major: null },
      ])
    );
    const res = await port.readTracks([id(1), id(3)]);
    expect(res).toEqual({
      ok: true,
      value: [{ trackId: id(1), bpm: 100, key: null, major: null }],
    });
  });

  it('does not ask for ids that cannot be Spotify ids', async () => {
    const { port, fetchFn } = setup(() => ok([]));
    await port.readTracks(['local-file', id(1)]);
    expect(bodyOf(fetchFn.mock.calls[0]![1]).ids).toEqual([id(1)]);
  });

  it('a failing chunk fails the call with the message', async () => {
    const { port } = setup(() => ok({ message: 'too many ids' }, 400));
    expect(await port.readTracks([id(1)])).toEqual({
      ok: false,
      message: 'too many ids',
    });
  });

  it('a non-list answer is a failure, not a throw', async () => {
    const { port } = setup(() => ok({ nope: true }));
    expect(await port.readTracks([id(1)])).toMatchObject({ ok: false });
  });
});

describe('guards', () => {
  it('no token means no call', async () => {
    const { port, fetchFn } = setup(() => ok([]), {
      ok: false,
      kind: 'unauthorized',
      message: 'x',
    });
    const expected = { ok: false, message: 'Not signed in to the server' };
    expect(await port.readTracks([id(1)])).toEqual(expected);
    expect(await port.readReach([id(1)])).toEqual(expected);
    expect(
      await port.shareTracks([
        { trackId: id(1), bpm: 1e2, key: null, major: null },
      ])
    ).toEqual(expected);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('never throws when fetch rejects', async () => {
    const { port } = setup(() => {
      throw new TypeError('Failed to fetch');
    });
    expect(await port.readTracks([id(1)])).toMatchObject({ ok: false });
    expect(
      await port.shareTracks([
        { trackId: id(1), bpm: 120, key: null, major: null },
      ])
    ).toMatchObject({ ok: false });
  });

  it('a call that never answers ends after 10 s', async () => {
    vi.useFakeTimers();
    const { port } = setup(() => new Promise<Response>(() => {}));
    const pending = port.readTracks([id(1)]);
    await vi.advanceTimersByTimeAsync(SHARED_TIMEOUT_MS + 1);
    expect(await pending).toMatchObject({ ok: false });
  });
});

describe('shareTracks', () => {
  const fact = (n: number, over = {}) => ({
    trackId: id(n),
    bpm: 128,
    key: 5,
    major: false,
    ...over,
  });

  it('posts snake_case rows with ignore-duplicates, at most 200 per request', async () => {
    const { port, fetchFn } = setup(() => new Response(null, { status: 201 }));
    const rows = Array.from({ length: 250 }, (_, i) => fact(i));
    expect(await port.shareTracks(rows)).toEqual({ ok: true, value: 250 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(
      'https://p.supabase.co/rest/v1/shared_track_facts?on_conflict=track_id'
    );
    expect(new Headers(init?.headers).get('Prefer')).toBe(
      'resolution=ignore-duplicates,return=minimal'
    );
    expect(bodyOf(init)).toHaveLength(200);
    expect(bodyOf(init)[0]).toEqual({
      track_id: id(0),
      bpm: 128,
      key: 5,
      major: false,
    });
  });

  it('drops rows outside the ranges before sending and sends nothing for none', async () => {
    const { port, fetchFn } = setup(() => new Response(null, { status: 201 }));
    const bad = [
      fact(1, { bpm: 0 }),
      fact(2, { bpm: 301 }),
      fact(3, { key: 12 }),
      fact(4, { trackId: 'x'.repeat(21) }),
      fact(5, { bpm: null, key: null, major: null }),
      fact(6, { key: null }),
    ];
    expect(await port.shareTracks(bad)).toEqual({ ok: true, value: 0 });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await port.shareTracks([...bad, fact(7)])).toEqual({
      ok: true,
      value: 1,
    });
    expect(bodyOf(fetchFn.mock.calls[0]![1])).toHaveLength(1);
    expect(await port.shareTracks([])).toEqual({ ok: true, value: 0 });
  });

  it('a 400 becomes the constraint text', async () => {
    const { port } = setup(() =>
      ok(
        { message: 'violates check constraint "shared_track_facts_bpm_check"' },
        400
      )
    );
    expect(await port.shareTracks([fact(1)])).toEqual({
      ok: false,
      message: 'violates check constraint "shared_track_facts_bpm_check"',
    });
  });
});

describe('reach', () => {
  const day = Date.parse('2026-11-05T00:00:00Z');
  const fact = (over = {}) => ({
    artistId: id(1),
    source: 'deezer' as const,
    value: 99,
    measuredAt: day,
    ...over,
  });

  it('reads through get_artist_reach and validates', async () => {
    const { port, fetchFn } = setup(() =>
      ok([
        {
          artist_id: id(1),
          source: 'deezer',
          measured_on: '2026-11-05',
          value: 99,
        },
        {
          artist_id: id(1),
          source: 'deezer',
          measured_on: '2026-12-05',
          value: 99,
        },
        {
          artist_id: id(9),
          source: 'deezer',
          measured_on: '2026-11-05',
          value: 99,
        },
      ])
    );
    const res = await port.readReach([id(1)]);
    expect(fetchFn.mock.calls[0]![0]).toBe(
      'https://p.supabase.co/rest/v1/rpc/get_artist_reach'
    );
    expect(res).toEqual({ ok: true, value: [fact()] });
  });

  it('shares rows with measured_on, dropping those outside the window', async () => {
    const { port, fetchFn } = setup(() => new Response(null, { status: 201 }));
    const rows = [
      fact(),
      fact({ measuredAt: NOW + 365 * 86_400_000 }),
      fact({ measuredAt: NOW - 30 * 86_400_000 }),
      fact({ value: -1 }),
      fact({ value: 1.5 }),
    ];
    expect(await port.shareReach(rows)).toEqual({ ok: true, value: 1 });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(
      'https://p.supabase.co/rest/v1/shared_artist_reach?on_conflict=artist_id%2Csource%2Cmeasured_on'
    );
    expect(bodyOf(init)).toEqual([
      {
        artist_id: id(1),
        source: 'deezer',
        measured_on: '2026-11-05',
        value: 99,
      },
    ]);
  });
});
