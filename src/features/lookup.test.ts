import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFeatures, putFeatures, wipeDb } from '../db/repo';
import type { FeatureRow, PlayRow, TrackRow } from '../db/schema';
import { buildModel, type Model } from '../model/aggregate';
import { MAX_IDS, RECCOBEATS_URL } from './reccobeats';
import {
  LOOKUP_NOT_FOUND_TTL_MS,
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

function setup(responses: Array<() => Response | Promise<Response>>) {
  const fetchFn = vi.fn<FetchLike>(async () => {
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
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[0][0]).toBe(
      `${RECCOBEATS_URL}?ids=${ids.slice(0, 40).join(',')}`
    );
    expect(fetchFn.mock.calls[1][0]).toBe(
      `${RECCOBEATS_URL}?ids=${ids.slice(40).join(',')}`
    );
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000]);
    const rows = await getFeatures();
    expect(rows).toHaveLength(45);
    expect(rows.find((r) => r.trackId === 't0')?.reccobeats).toEqual({
      bpm: 124,
      key: 5,
      major: true,
      energy: 0.6,
      fetchedAt: NOW,
    });
    expect(states).toContainEqual({ status: 'running', done: 1, total: 2 });
    expect(states.at(-1)).toEqual({
      status: 'done',
      found: 45,
      notFound: 0,
      total: 45,
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
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000]);
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
    expect(states.at(-1)).toEqual({
      status: 'done',
      found: 2,
      notFound: 2,
      total: 4,
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
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toBe(`${RECCOBEATS_URL}?ids=old`);
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
