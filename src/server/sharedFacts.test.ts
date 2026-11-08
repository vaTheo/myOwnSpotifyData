import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getFeatures, wipeDb } from '../db/repo';
import type { ArtistIdentityRow } from '../db/schema';
import { DEEZER_API } from '../features/deezer';
import { LISTENBRAINZ_STATS_URL } from '../features/listenbrainz';
import { runLookup, type LookupState } from '../features/lookup';
import { runReach, type ReachState } from '../features/reachRun';
import { RECCOBEATS_TRACK_URL, RECCOBEATS_URL } from '../features/reccobeats';
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
    expect(url).toBe('https://p.supabase.co/rest/v1/rpc/add_track_facts');
    expect(init?.method).toBe('POST');
    expect(bodyOf(init).rows).toHaveLength(200);
    expect(bodyOf(init).rows[0]).toEqual({
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
    expect(bodyOf(fetchFn.mock.calls[0]![1]).rows).toHaveLength(1);
    expect(await port.shareTracks([])).toEqual({ ok: true, value: 0 });
  });

  it('refuses each bad row before sending, so one never costs the batch', async () => {
    const bad = [
      ['bpm 0', fact(1, { bpm: 0 })],
      ['bpm 301', fact(2, { bpm: 301 })],
      ['key 12', fact(3, { key: 12 })],
      ['21-character id', fact(4, { trackId: 'x'.repeat(21) })],
      ['major without key', fact(5, { key: null, major: true })],
    ] as const;
    for (const [label, row] of bad) {
      const { port, fetchFn } = setup(
        () => new Response(null, { status: 201 })
      );
      // Alone: nothing is sent. Beside a good row: only the good row goes.
      expect(await port.shareTracks([row]), label).toEqual({
        ok: true,
        value: 0,
      });
      expect(fetchFn, label).not.toHaveBeenCalled();
      expect(await port.shareTracks([row, fact(9)]), label).toEqual({
        ok: true,
        value: 1,
      });
      expect(bodyOf(fetchFn.mock.calls[0]![1]).rows, label).toEqual([
        { track_id: id(9), bpm: 128, key: 5, major: false },
      ]);
    }
  });

  it('refuses a reach row a year ahead before sending', async () => {
    const { port, fetchFn } = setup(() => new Response(null, { status: 201 }));
    const row = {
      artistId: id(1),
      source: 'deezer' as const,
      value: 5,
      measuredAt: NOW + 366 * 86_400_000,
    };
    expect(await port.shareReach([row])).toEqual({ ok: true, value: 0 });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('a 400 fails the share but the run keeps its own results', async () => {
    await wipeDb();
    const { port } = setup(() =>
      ok({ message: 'violates check constraint "bpm_check"' }, 400)
    );
    const states: LookupState[] = [];
    const fetchFn = vi.fn<FetchLike>(async (url) => {
      if (url.startsWith(RECCOBEATS_TRACK_URL)) return ok({ content: [] });
      if (url.startsWith(RECCOBEATS_URL)) {
        return ok({
          content: [
            {
              href: `https://open.spotify.com/track/${id(1)}`,
              tempo: 120,
              key: 2,
              mode: 1,
              energy: 0.5,
            },
          ],
        });
      }
      throw new Error(url);
    });
    await runLookup(
      {
        fetchFn: fetchFn as unknown as typeof fetch,
        sleep: async () => {},
        now: () => NOW,
        onState: (st) => states.push(st),
        shared: { ...port, readTracks: async () => ({ ok: true, value: [] }) },
      },
      [{ id: id(1), isrc: null }],
      []
    );
    expect(states.at(-1)).toMatchObject({
      status: 'done',
      found: 1,
      shared: { sent: 0, error: 'violates check constraint "bpm_check"' },
    });
    expect((await getFeatures())[0]?.reccobeats).toMatchObject({ bpm: 120 });
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

describe('the add functions answer', () => {
  it('a bare number body (the integer the function returns) is a success', async () => {
    const { port } = setup((url) => {
      expect(url).toBe('https://p.supabase.co/rest/v1/rpc/add_track_facts');
      return ok(1);
    });
    expect(
      await port.shareTracks([
        { trackId: id(1), bpm: 128, key: 5, major: false },
      ])
    ).toEqual({ ok: true, value: 1 });
  });

  it('the cap error of a function becomes its message, and the run stops at it', async () => {
    const { port, fetchFn } = setup(() =>
      ok({ code: '54000', message: 'too many rows' }, 400)
    );
    const rows = Array.from({ length: 250 }, (_, i) => ({
      trackId: id(i),
      bpm: 128,
      key: 5,
      major: false,
    }));
    expect(await port.shareTracks(rows)).toEqual({
      ok: false,
      message: 'too many rows',
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('a 403 from the function is a failure, never a throw', async () => {
    const { port } = setup(() =>
      ok({ code: '42501', message: 'permission denied for function' }, 403)
    );
    expect(
      await port.shareTracks([
        { trackId: id(1), bpm: 128, key: 5, major: false },
      ])
    ).toMatchObject({ ok: false });
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
    expect(url).toBe('https://p.supabase.co/rest/v1/rpc/add_artist_reach');
    expect(bodyOf(init).rows).toEqual([
      {
        artist_id: id(1),
        source: 'deezer',
        measured_on: '2026-11-05',
        value: 99,
      },
    ]);
  });
});

describe('two users, one shared store (SC-001, SC-002)', () => {
  it('B asks ReccoBeats only for what A did not find, and reads nothing beyond four columns', async () => {
    await wipeDb();
    // The in-memory fake of the get and add functions (a duplicate is ignored).
    const store = new Map<string, Record<string, unknown>>();
    const tokensSeen = new Set<string>();
    const readAnswers: unknown[] = [];
    const respond = (url: string, init?: RequestInit): Response => {
      const auth = new Headers(init?.headers).get('Authorization') ?? '';
      tokensSeen.add(auth);
      if (url.endsWith('/rpc/get_track_facts')) {
        const rows = (bodyOf(init).ids as string[]).flatMap((i) =>
          store.has(i) ? [store.get(i)!] : []
        );
        readAnswers.push(rows);
        return ok(rows);
      }
      if (url.endsWith('/rpc/add_track_facts')) {
        const rows = bodyOf(init).rows as Record<string, unknown>[];
        for (const row of rows) {
          const t = row.track_id as string;
          if (!store.has(t)) store.set(t, row);
        }
        return ok(rows.length);
      }
      return ok({ message: 'unexpected' }, 404);
    };
    const serverFetch = vi.fn<FetchLike>(async (url, init) =>
      respond(url, init)
    );
    const client = createServerClient({
      fetchFn: serverFetch as unknown as typeof fetch,
      baseUrl: 'https://p.supabase.co',
      apiKey: 'k',
      now: () => NOW,
    });
    const portFor = (token: string) =>
      createSharedFactsPort({
        client,
        getToken: async () => ({ ok: true, value: token }),
        now: () => NOW,
      });

    const known = (lo: number, hi: number) => (n: number) => n >= lo && n < hi;
    async function runUser(
      token: string,
      from: number,
      knownByRb: (n: number) => boolean
    ) {
      await wipeDb();
      const asked: string[] = [];
      const fetchFn = vi.fn<FetchLike>(async (url) => {
        if (url.startsWith(RECCOBEATS_TRACK_URL)) return ok({ content: [] });
        if (!url.startsWith(RECCOBEATS_URL)) throw new Error(url);
        const ids = new URL(url).searchParams.get('ids')!.split(',');
        asked.push(...ids);
        return ok({
          content: ids
            .filter((t) => knownByRb(Number(t.slice(5))))
            .map((t) => ({
              href: `https://open.spotify.com/track/${t}`,
              isrc: null,
              tempo: 100 + (Number(t.slice(5)) % 50),
              key: Number(t.slice(5)) % 12,
              mode: 1,
              energy: 0.5,
            })),
        });
      });
      const states: LookupState[] = [];
      await runLookup(
        {
          fetchFn: fetchFn as unknown as typeof fetch,
          sleep: async () => {},
          now: () => NOW,
          onState: (st) => states.push(st),
          shared: portFor(token),
        },
        Array.from({ length: 100 }, (_, i) => ({
          id: id(from + i),
          isrc: null,
        })),
        []
      );
      const rows = new Map(
        (await getFeatures()).map((r) => [r.trackId, r.reccobeats])
      );
      return { asked, rows, last: states.at(-1) };
    }

    // A looks up 0..99; ReccoBeats knows 0..79.
    const a = await runUser('tokA', 0, known(0, 80));
    expect(a.asked).toHaveLength(100);
    expect(store.size).toBe(80);

    // B looks up 50..149; ReccoBeats knows all of them.
    const b = await runUser('tokB', 50, () => true);
    const stored = Array.from({ length: 30 }, (_, i) => id(50 + i));
    expect(b.asked.some((t) => stored.includes(t))).toBe(false);
    expect(new Set(b.asked)).toEqual(
      new Set(Array.from({ length: 70 }, (_, i) => id(80 + i)))
    );
    expect(b.last).toMatchObject({
      status: 'done',
      found: 100,
      shared: { fromStore: 30, sent: 70, error: null },
    });
    // The values B got from the store equal what A found.
    for (const t of stored) {
      const av = a.rows.get(t) as Record<string, unknown>;
      const bv = b.rows.get(t) as Record<string, unknown>;
      expect([bv.bpm, bv.key, bv.major]).toEqual([av.bpm, av.key, av.major]);
    }
    expect(store.size).toBe(150);
    // Both users' tokens reached the server; reads were lists of four columns.
    expect(tokensSeen).toEqual(new Set(['Bearer tokA', 'Bearer tokB']));
    for (const rows of readAnswers as Record<string, unknown>[][]) {
      for (const row of rows) {
        expect(Object.keys(row).sort()).toEqual([
          'bpm',
          'key',
          'major',
          'track_id',
        ]);
      }
    }
  });
});

describe('two users, one shared store, artist reach (SC-005)', () => {
  const reachNow = Date.parse('2026-11-08T12:00:00Z');
  const ids = ['artist000000000000000a', 'artist000000000000000b'];
  const known = (artistId: string, n: number): ArtistIdentityRow => ({
    artistId,
    name: artistId,
    mbid: `mb-${n}`,
    mbidStatus: 'ok',
    qid: 'Q9',
    qidStatus: 'ok',
    qidCheckedAt: reachNow,
    sitelinks: null,
    wikiTitles: { en: null, fr: null },
    deezerArtistId: n,
    deezerName: artistId,
    deezerStatus: 'ok',
    resolvedAt: reachNow,
    retryAfter: null,
  });

  it('B makes no ListenBrainz or Deezer fans request for what A measured, and the newest row wins', async () => {
    // The fake of get_artist_reach (newest row per artist and source) and
    // add_artist_reach (a duplicate is ignored), keyed like the table.
    const store = new Map<string, Record<string, unknown>>();
    const respond = (url: string, init?: RequestInit): Response => {
      if (url.endsWith('/rpc/get_artist_reach')) {
        const asked = bodyOf(init).ids as string[];
        const newest = new Map<string, Record<string, unknown>>();
        for (const row of store.values()) {
          if (!asked.includes(row.artist_id as string)) continue;
          const k = `${row.artist_id}|${row.source}`;
          const prior = newest.get(k);
          if (!prior || String(prior.measured_on) < String(row.measured_on)) {
            newest.set(k, row);
          }
        }
        return ok([...newest.values()]);
      }
      if (url.endsWith('/rpc/add_artist_reach')) {
        const rows = bodyOf(init).rows as Record<string, unknown>[];
        for (const row of rows) {
          const k = `${row.artist_id}|${row.source}|${row.measured_on}`;
          if (!store.has(k)) store.set(k, row);
        }
        return ok(rows.length);
      }
      return ok({ message: 'unexpected' }, 404);
    };
    const client = createServerClient({
      fetchFn: vi.fn<FetchLike>(async (url, init) =>
        respond(url, init)
      ) as unknown as typeof fetch,
      baseUrl: 'https://p.supabase.co',
      apiKey: 'k',
      now: () => reachNow,
    });
    const portFor = (token: string) =>
      createSharedFactsPort({
        client,
        getToken: async () => ({ ok: true, value: token }),
        now: () => reachNow,
      });

    async function runUser(token: string, artists: string[]) {
      await wipeDb();
      const outside: string[] = [];
      const states: ReachState[] = [];
      await runReach(
        {
          fetchFn: (async (input: string | URL) => {
            const url = String(input);
            outside.push(url);
            if (url.startsWith(LISTENBRAINZ_STATS_URL)) {
              return ok({
                payload: {
                  artist_name: 'x',
                  total_user_count: 100,
                  total_listen_count: 1,
                },
              });
            }
            return ok({ results: { bindings: [] } });
          }) as unknown as typeof fetch,
          jsonpFn: async (url: string) => {
            outside.push(url);
            return { nb_fan: 500 };
          },
          sleep: async () => {},
          now: () => reachNow,
          onState: (st) => states.push(st),
          shared: portFor(token),
        },
        artists.map((artistId) => ({ artistId, name: 'x', isrcs: [] })),
        artists.map((a) => known(a, ids.indexOf(a) + 1)),
        []
      );
      return { outside, last: states.at(-1) };
    }
    const measuring = (urls: string[]) =>
      urls.filter(
        (u) => u.startsWith(LISTENBRAINZ_STATS_URL) || u.startsWith(DEEZER_API)
      );

    // A measures both artists outside and gives the numbers.
    const a = await runUser('tokA', ids);
    expect(measuring(a.outside)).toHaveLength(4);
    expect(store.size).toBe(4);

    // B, the same day, asks nothing for them.
    const b = await runUser('tokB', ids);
    expect(measuring(b.outside)).toEqual([]);
    expect(b.last).toMatchObject({
      status: 'done',
      shared: { fromStore: 2, sent: 0, error: null },
    });

    // An older row (an earlier measured_on) never replaces the newer one.
    store.set(`${ids[0]}|deezer|2026-11-07`, {
      artist_id: ids[0],
      source: 'deezer',
      measured_on: '2026-11-07',
      value: 777,
    });
    const read = await portFor('tokB').readReach([ids[0]!]);
    expect(
      read.ok && read.value.find((r) => r.source === 'deezer')
    ).toMatchObject({
      value: 500,
      measuredAt: Date.parse('2026-11-08T00:00:00Z'),
    });
  });
});
