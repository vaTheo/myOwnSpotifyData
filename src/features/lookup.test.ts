import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFeatures, putFeatures, wipeDb } from '../db/repo';
import type { FeatureRow, PlayRow, TrackRow } from '../db/schema';
import { buildModel, type Model } from '../model/aggregate';
import { MAX_IDS, RECCOBEATS_TRACK_URL, RECCOBEATS_URL } from './reccobeats';
import {
  LOOKUP_INTERVAL_MS,
  LOOKUP_NOT_FOUND_TTL_MS,
  PASS_BY_ID,
  PASS_BY_ISRC,
  PASS_YEARS,
  YEAR_WRITE_BATCH,
  candidateIds,
  runLookup,
  type LookupState,
} from './lookup';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const NOW = 1_700_000_000_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * `responses` answer the audio-features calls in order; `years` answers the
 * round-005 `/v1/track` calls (rid lookup and albums). By default ReccoBeats
 * knows no track id, so the year pass asks for ids and dates nothing.
 */
function setup(
  responses: Array<() => Response | Promise<Response>>,
  years: (url: string) => Response | Promise<Response> = () =>
    json({ content: [] })
) {
  const fetchFn = vi.fn<FetchLike>(async (url) => {
    if (url.startsWith(RECCOBEATS_TRACK_URL)) return years(url);
    const next = responses.shift();
    if (!next) throw new Error('unexpected extra request');
    return next();
  });
  const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
  const states: LookupState[] = [];
  const deps = {
    fetchFn: fetchFn as unknown as typeof fetch,
    sleep,
    now: () => NOW,
    onState: (state: LookupState) => {
      states.push(state);
    },
  };
  return { deps, fetchFn, sleep, states };
}

const featureCalls = (fetchFn: { mock: { calls: [string, ...unknown[]][] } }) =>
  fetchFn.mock.calls
    .map((c) => c[0])
    .filter((u) => u.startsWith(RECCOBEATS_URL));

function feature(id: string, isrc: string | null, tempo: number) {
  return {
    href: `https://open.spotify.com/track/${id}`,
    isrc,
    tempo,
    key: 5,
    mode: 1,
    energy: 0.6,
  };
}

function track(key: string, over: Partial<TrackRow> = {}): TrackRow {
  return {
    key,
    id: key,
    uri: `spotify:track:${key}`,
    name: `Track ${key}`,
    artists: [{ id: 'a1', name: 'Artist' }],
    album: 'Album',
    durationMs: 300_000,
    isrc: null,
    spotifyUrl: null,
    isLocal: false,
    ...over,
  };
}

function play(trackId: string, plays: number): PlayRow {
  return {
    trackId,
    plays,
    msPlayed: plays * 200_000,
    firstTs: '2026-01-01T12:00:00Z',
    lastTs: '2026-08-01T12:00:00Z',
    trackName: `Track ${trackId}`,
    artistName: 'Artist',
  };
}

function modelOf(tracks: TrackRow[], plays: PlayRow[]): Model {
  return buildModel({
    playlists: [],
    tracks,
    entries: [],
    topItems: [],
    plays,
    features: [],
    artistIdentity: [],
    artistReach: [],
  });
}

beforeEach(async () => {
  await wipeDb();
});

describe('candidateIds', () => {
  it('takes synced tracks with an id, then played tracks, deduped', () => {
    const model = modelOf(
      [
        track('t1', { isrc: 'gb-aht-21-00001' }),
        track('spotify:local:x', {
          id: null,
          uri: 'spotify:local:x',
          isLocal: true,
        }),
      ],
      [play('t1', 4), play('h1', 9), play('h2', 0)]
    );
    expect(candidateIds(model)).toEqual([
      { id: 't1', isrc: 'GBAHT2100001' },
      { id: 'h1', isrc: null },
    ]);
  });
});

describe('runLookup', () => {
  it('pins the batch size and the notFound lifetime', () => {
    expect(MAX_IDS).toBe(40);
    expect(LOOKUP_NOT_FOUND_TTL_MS).toBe(90 * 24 * 60 * 60 * 1000);
  });

  it('asks in batches of forty, writes each batch and paces itself', async () => {
    const ids = Array.from({ length: 45 }, (_, i) => `t${i}`);
    const candidates = ids.map((id) => ({ id, isrc: null }));
    const { deps, fetchFn, sleep, states } = setup([
      () =>
        json({
          content: ids.slice(0, 40).map((id) => feature(id, null, 124)),
        }),
      () =>
        json({ content: ids.slice(40).map((id) => feature(id, null, 128)) }),
    ]);
    await runLookup(deps, candidates, []);
    // Two feature batches, then the year pass's two id batches.
    expect(fetchFn).toHaveBeenCalledTimes(4);
    expect(fetchFn.mock.calls[0][0]).toBe(
      `${RECCOBEATS_URL}?ids=${ids.slice(0, 40).join(',')}`
    );
    expect(fetchFn.mock.calls[1][0]).toBe(
      `${RECCOBEATS_URL}?ids=${ids.slice(40).join(',')}`
    );
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 1000, 1000]);
    const rows = await getFeatures();
    expect(rows).toHaveLength(45);
    expect(rows.find((r) => r.trackId === 't0')?.reccobeats).toEqual({
      bpm: 124,
      key: 5,
      major: true,
      energy: 0.6,
      fetchedAt: NOW,
    });
    expect(states).toContainEqual({
      status: 'running',
      pass: PASS_BY_ID,
      done: 40,
      total: 45,
    });
    expect(states.at(-1)).toEqual({
      status: 'done',
      found: 45,
      notFound: 0,
      total: 45,
      years: 0,
    });
  });

  it('retries the misses by ISRC and stores the hit under the track id', async () => {
    const candidates = [
      { id: 'hit', isrc: 'GBAHT2100001' },
      { id: 'byisrc', isrc: 'USAAA2100002' },
      { id: 'lost', isrc: 'FRXXX2100003' },
      { id: 'noisrc', isrc: null },
    ];
    const { deps, fetchFn, sleep, states } = setup([
      () => json({ content: [feature('hit', 'GBAHT2100001', 126)] }),
      () =>
        json({
          content: [
            {
              href: 'https://open.spotify.com/track/other',
              isrc: 'USAAA2100002',
              tempo: 130,
              key: 2,
              mode: 0,
              energy: 0.7,
            },
          ],
        }),
    ]);
    await runLookup(deps, candidates, []);
    expect(fetchFn.mock.calls[1][0]).toBe(
      `${RECCOBEATS_URL}?ids=USAAA2100002,FRXXX2100003`
    );
    // Two feature calls and one id batch for the two found tracks.
    expect(fetchFn.mock.calls[2][0]).toBe(
      `${RECCOBEATS_TRACK_URL}?ids=hit,byisrc`
    );
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 1000]);
    const rows = new Map((await getFeatures()).map((r) => [r.trackId, r]));
    expect(rows.get('byisrc')?.reccobeats).toEqual({
      bpm: 130,
      key: 2,
      major: false,
      energy: 0.7,
      fetchedAt: NOW,
    });
    expect(rows.get('lost')?.reccobeats).toEqual({
      notFound: true,
      checkedAt: NOW,
    });
    expect(rows.get('noisrc')?.reccobeats).toEqual({
      notFound: true,
      checkedAt: NOW,
    });
    // The denominator is the pass's own track count, so the bar fills once
    // per pass and never walks backwards when the ISRC pass starts.
    expect(states.filter((s) => s.status === 'running')).toEqual([
      { status: 'running', pass: PASS_BY_ID, done: 0, total: 4 },
      { status: 'running', pass: PASS_BY_ID, done: 4, total: 4 },
      { status: 'running', pass: PASS_BY_ISRC, done: 0, total: 2 },
      { status: 'running', pass: PASS_BY_ISRC, done: 2, total: 2 },
      { status: 'running', pass: PASS_YEARS, done: 0, total: 2 },
      { status: 'running', pass: PASS_YEARS, done: 1, total: 2 },
      { status: 'running', pass: PASS_YEARS, done: 2, total: 2 },
    ]);
    expect(states.at(-1)).toEqual({
      status: 'done',
      found: 2,
      notFound: 2,
      total: 4,
      years: 0,
    });
  });

  it('skips fresh rows and young markers, and keeps the rekordbox value', async () => {
    const existing: FeatureRow[] = [
      {
        trackId: 'has',
        isrc: null,
        reccobeats: {
          bpm: 120,
          key: 0,
          major: true,
          energy: 0.4,
          fetchedAt: 1,
        },
        updatedAt: 1,
      },
      {
        trackId: 'young',
        isrc: null,
        reccobeats: {
          notFound: true,
          checkedAt: NOW - LOOKUP_NOT_FOUND_TTL_MS + 1000,
        },
        updatedAt: 1,
      },
      {
        trackId: 'old',
        isrc: null,
        reccobeats: {
          notFound: true,
          checkedAt: NOW - LOOKUP_NOT_FOUND_TTL_MS,
        },
        rekordbox: {
          bpm: 128,
          key: 9,
          major: false,
          energy: null,
          fetchedAt: 5,
          matchedBy: 'title-artist',
          rbTitle: 'Track old',
          rbArtist: 'Artist',
        },
        updatedAt: 1,
      },
    ];
    await putFeatures(existing);
    const { deps, fetchFn } = setup([
      () => json({ content: [feature('old', null, 127)] }),
    ]);
    await runLookup(
      deps,
      [
        { id: 'has', isrc: null },
        { id: 'young', isrc: null },
        { id: 'old', isrc: null },
      ],
      existing
    );
    expect(featureCalls(fetchFn)).toEqual([`${RECCOBEATS_URL}?ids=old`]);
    const rows = new Map((await getFeatures()).map((r) => [r.trackId, r]));
    expect(rows.get('old')?.reccobeats).toEqual({
      bpm: 127,
      key: 5,
      major: true,
      energy: 0.6,
      fetchedAt: NOW,
    });
    expect(rows.get('old')?.rekordbox?.bpm).toBe(128);
    expect(rows.get('old')?.updatedAt).toBe(NOW);
  });

  it('reports an error and keeps the rows written before it', async () => {
    const ids = Array.from({ length: 41 }, (_, i) => `t${i}`);
    const candidates = ids.map((id) => ({ id, isrc: null }));
    const { deps, states } = setup([
      () =>
        json({
          content: ids.slice(0, 40).map((id) => feature(id, null, 124)),
        }),
      () => json({}, 500),
      () => json({}, 500),
      () => json({}, 500),
      () => json({}, 500),
    ]);
    await runLookup(deps, candidates, []);
    expect(states.at(-1)).toEqual({
      status: 'error',
      message: 'ReccoBeats server error 500',
    });
    expect(await getFeatures()).toHaveLength(40);
  });
});

describe('runLookup — round 005 release years', () => {
  const value = (rid?: string) => ({
    bpm: 120,
    key: 0,
    major: true,
    energy: 0.4,
    fetchedAt: 1,
    ...(rid ? { rid } : {}),
  });
  const albumsOf = (dates: string[]) =>
    json({ content: dates.map((releaseDate) => ({ name: 'A', releaseDate })) });
  /** Answers `/track/{rid}/album` from `albums` and `/track?ids=` from `rids`. */
  const yearsRoute =
    (
      albums: Record<string, string[] | number>,
      rids: Record<string, string> = {}
    ) =>
    (url: string) => {
      const album = /\/track\/([^/?]+)\/album/.exec(url);
      if (album) {
        const answer = albums[album[1]];
        return typeof answer === 'number'
          ? json({}, answer)
          : albumsOf(answer ?? []);
      }
      const ids = new URL(url).searchParams.get('ids')!.split(',');
      return json({
        content: ids
          .filter((id) => rids[id])
          .map((id) => ({
            id: rids[id],
            href: `https://open.spotify.com/track/${id}`,
          })),
      });
    };

  it('dates found tracks by their stored rid, earliest album first, keeping the BPM', async () => {
    const { deps, fetchFn, sleep, states } = setup(
      [
        () =>
          json({
            content: [
              { ...feature('a', null, 124), id: 'rid-a' },
              { ...feature('b', null, 126), id: 'rid-b' },
            ],
          }),
      ],
      yearsRoute({ 'rid-a': ['2007-11-12', '1971-11-08', '0000'], 'rid-b': [] })
    );
    await runLookup(
      deps,
      [
        { id: 'a', isrc: null },
        { id: 'b', isrc: null },
      ],
      []
    );
    // No id batch: both rids came with the audio features.
    expect(fetchFn.mock.calls.map((c) => c[0])).toEqual([
      `${RECCOBEATS_URL}?ids=a,b`,
      `${RECCOBEATS_TRACK_URL}/rid-a/album?size=50`,
      `${RECCOBEATS_TRACK_URL}/rid-b/album?size=50`,
    ]);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 1000]);
    const rows = new Map((await getFeatures()).map((r) => [r.trackId, r]));
    expect(rows.get('a')).toMatchObject({
      reccobeats: { bpm: 124, rid: 'rid-a' },
      releaseYear: { year: 1971, checkedAt: NOW },
    });
    expect(rows.get('b')?.releaseYear).toEqual({ year: null, checkedAt: NOW });
    expect(states.at(-1)).toEqual({
      status: 'done',
      found: 2,
      notFound: 0,
      total: 2,
      years: 1,
    });
  });

  it('resumes: skips dated rows and young "none", asks rids for old rows, keeps rekordbox', async () => {
    const rekordbox = {
      bpm: 128,
      key: 9,
      major: false,
      energy: null,
      fetchedAt: 5,
      matchedBy: 'title-artist' as const,
      rbTitle: 'T',
      rbArtist: 'A',
    };
    const existing: FeatureRow[] = [
      {
        trackId: 'dated',
        isrc: null,
        reccobeats: value('r1'),
        releaseYear: { year: 1990, checkedAt: 1 },
        updatedAt: 1,
      },
      {
        trackId: 'young',
        isrc: null,
        reccobeats: value('r2'),
        releaseYear: {
          year: null,
          checkedAt: NOW - LOOKUP_NOT_FOUND_TTL_MS + 1000,
        },
        updatedAt: 1,
      },
      {
        trackId: 'stale',
        isrc: null,
        reccobeats: value('r3'),
        releaseYear: { year: null, checkedAt: NOW - LOOKUP_NOT_FOUND_TTL_MS },
        updatedAt: 1,
      },
      {
        trackId: 'old',
        isrc: null,
        reccobeats: value(),
        rekordbox,
        updatedAt: 1,
      },
      { trackId: 'unknown', isrc: null, reccobeats: value(), updatedAt: 1 },
      {
        trackId: 'missing',
        isrc: null,
        reccobeats: { notFound: true, checkedAt: NOW - 1 },
        updatedAt: 1,
      },
    ];
    await putFeatures(existing);
    const { deps, fetchFn, states } = setup(
      [],
      yearsRoute({ r3: ['1985'], 'r-old': ['1999-01-01'] }, { old: 'r-old' })
    );
    await runLookup(
      deps,
      existing.map((r) => ({ id: r.trackId, isrc: null })),
      existing
    );
    expect(fetchFn.mock.calls.map((c) => c[0])).toEqual([
      `${RECCOBEATS_TRACK_URL}?ids=old,unknown`,
      `${RECCOBEATS_TRACK_URL}/r3/album?size=50`,
      `${RECCOBEATS_TRACK_URL}/r-old/album?size=50`,
    ]);
    const rows = new Map((await getFeatures()).map((r) => [r.trackId, r]));
    expect(rows.get('dated')?.releaseYear?.year).toBe(1990);
    expect(rows.get('young')?.releaseYear?.checkedAt).toBe(
      NOW - LOOKUP_NOT_FOUND_TTL_MS + 1000
    );
    expect(rows.get('stale')?.releaseYear).toEqual({
      year: 1985,
      checkedAt: NOW,
    });
    expect(rows.get('old')).toMatchObject({
      reccobeats: { ...value(), rid: 'r-old' },
      rekordbox,
      releaseYear: { year: 1999, checkedAt: NOW },
    });
    // ReccoBeats knows no id for it: "none", asked again after the TTL.
    expect(rows.get('unknown')?.releaseYear).toEqual({
      year: null,
      checkedAt: NOW,
    });
    expect(rows.get('missing')?.releaseYear).toBeUndefined();
    expect(states.at(-1)).toEqual({
      status: 'done',
      found: 0,
      notFound: 0,
      total: 0,
      years: 2,
    });
  });

  it('keeps every year found before an error and reports it', async () => {
    const n = YEAR_WRITE_BATCH + 2;
    const existing: FeatureRow[] = Array.from({ length: n }, (_, i) => ({
      trackId: `t${i}`,
      isrc: null,
      reccobeats: value(`r${i}`),
      updatedAt: 1,
    }));
    const albums: Record<string, string[] | number> = {};
    existing.forEach((_, i) => (albums[`r${i}`] = [`${1980 + i}`]));
    albums[`r${n - 1}`] = 400;
    const { deps, states } = setup([], yearsRoute(albums));
    await runLookup(
      deps,
      existing.map((r) => ({ id: r.trackId, isrc: null })),
      existing
    );
    expect(states.at(-1)).toEqual({
      status: 'error',
      message: 'ReccoBeats error 400',
    });
    const rows = await getFeatures();
    const dated = rows.filter((r) => r.releaseYear?.year != null);
    expect(dated).toHaveLength(n - 1);
    expect(rows.find((r) => r.trackId === 't0')?.reccobeats).toEqual(
      value('r0')
    );
  });

  it('paces every request of the three passes one second apart', async () => {
    const ids = Array.from({ length: 41 }, (_, i) => `t${i}`);
    const order: string[] = [];
    const { deps, fetchFn, sleep } = setup(
      [
        () =>
          json({
            content: ids.slice(0, 40).map((id) => feature(id, null, 120)),
          }),
        () => json({ content: [] }),
        () => json({ content: [] }),
      ],
      yearsRoute(
        { 'r-t0': ['2001'], 'r-t1': ['2002'] },
        { t0: 'r-t0', t1: 'r-t1' }
      )
    );
    deps.sleep = vi.fn(async (ms: number) => {
      order.push(`sleep ${ms}`);
    });
    const inner = fetchFn.getMockImplementation()!;
    fetchFn.mockImplementation(async (url, init) => {
      order.push('fetch');
      return inner(url, init);
    });
    await runLookup(
      deps,
      ids.map((id) => ({ id, isrc: id === 't40' ? 'GBXXX2100040' : null })),
      []
    );
    // 3 feature calls (two by id, one by ISRC), 1 rid batch, 2 album calls.
    expect(fetchFn).toHaveBeenCalledTimes(6);
    expect(sleep).not.toHaveBeenCalled();
    expect(order).toEqual([
      'fetch',
      ...Array.from({ length: 5 }, () => [
        `sleep ${LOOKUP_INTERVAL_MS}`,
        'fetch',
      ]).flat(),
    ]);
  });
});
