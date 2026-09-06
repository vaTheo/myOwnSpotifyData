import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAllRows,
  getMeta,
  putIdentities,
  putReach,
  wipeDb,
} from '../db/repo';
import type {
  ArtistIdentityRow,
  ArtistReachRow,
  ArtistRef,
  TrackRow,
} from '../db/schema';
import { buildModel } from '../model/aggregate';
import { DEEZER_API } from './deezer';
import { LISTENBRAINZ_STATS_URL } from './listenbrainz';
import { MUSICBRAINZ_URL } from './musicbrainz';
import { WIKIDATA_URL } from './wikidata';
import { PAGEVIEWS_URL } from './wikipedia';
import {
  ARTIST_REACH_SUMMARY_META,
  REACH_NOT_FOUND_TTL_MS,
  REACH_RETRY_LATER_TTL_MS,
  REACH_TTL_MS,
  reachCandidates,
  runReach,
  type ArtistReachSummary,
  type ReachCandidate,
  type ReachState,
} from './reachRun';

/** Flipped on inside a test to make the next reach write fail. */
const storage = vi.hoisted(() => ({ full: false }));

vi.mock('../db/repo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/repo')>();
  return {
    ...actual,
    putReach: async (rows: ArtistReachRow[]) => {
      if (storage.full) {
        throw new DOMException('over quota', 'QuotaExceededError');
      }
      await actual.putReach(rows);
    },
  };
});

const NOW = Date.UTC(2026, 8, 5, 12, 0, 0);

function json(
  body: unknown,
  status = 200,
  headers: HeadersInit = {}
): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

interface Handlers {
  mb?: (artistId: string) => Response;
  lb?: (mbid: string) => Response;
  wd?: (query: string) => Response;
  views?: (project: string, title: string) => Response;
  deezer?: (url: string) => unknown;
}

function setup(handlers: Handlers, wakeLock = true) {
  const requests: string[] = [];
  const sleeps: number[] = [];
  const states: ReachState[] = [];
  const release = vi.fn(async () => {});
  const fetchFn = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push(url);
    if (url.startsWith(MUSICBRAINZ_URL)) {
      const resource = new URL(url).searchParams.get('resource') ?? '';
      const id = resource.split('/').pop() ?? '';
      return handlers.mb ? handlers.mb(id) : json({}, 404);
    }
    if (url.startsWith(LISTENBRAINZ_STATS_URL)) {
      const mbid =
        url.slice(LISTENBRAINZ_STATS_URL.length + 1).split('/')[0] ?? '';
      return handlers.lb ? handlers.lb(mbid) : json(null, 204);
    }
    if (url === WIKIDATA_URL) {
      const body = String(init?.body ?? '');
      const query = decodeURIComponent(body.slice('query='.length));
      return handlers.wd ? handlers.wd(query) : json({ results: {} });
    }
    if (url.startsWith(PAGEVIEWS_URL)) {
      const rest = url.slice(PAGEVIEWS_URL.length + 1).split('/');
      return handlers.views
        ? handlers.views(rest[0] ?? '', rest[3] ?? '')
        : json({}, 404);
    }
    throw new Error(`unexpected request ${url}`);
  });
  const jsonpFn = vi.fn(async (url: string) => {
    requests.push(url);
    if (!handlers.deezer) throw new Error(`unexpected jsonp ${url}`);
    return handlers.deezer(url);
  });
  const deps = {
    fetchFn: fetchFn as unknown as typeof fetch,
    jsonpFn,
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
    now: () => NOW,
    onState: (state: ReachState) => {
      states.push(state);
    },
    ...(wakeLock ? { acquireWakeLock: async () => release } : {}),
  };
  return { deps, fetchFn, jsonpFn, requests, sleeps, states, release };
}

function candidate(over: Partial<ReachCandidate> = {}): ReachCandidate {
  return { artistId: 'a1', name: 'Hugo LX', isrcs: ['FRX010000001'], ...over };
}

function identity(over: Partial<ArtistIdentityRow> = {}): ArtistIdentityRow {
  return {
    artistId: 'a1',
    name: 'Hugo LX',
    mbid: null,
    mbidStatus: 'unchecked',
    qid: null,
    qidStatus: 'unchecked',
    qidCheckedAt: null,
    sitelinks: null,
    wikiTitles: { en: null, fr: null },
    deezerArtistId: null,
    deezerName: null,
    deezerStatus: 'unchecked',
    resolvedAt: 0,
    retryAfter: null,
    ...over,
  };
}

function reachRow(over: Partial<ArtistReachRow> = {}): ArtistReachRow {
  const artistId = over.artistId ?? 'a1';
  const source = over.source ?? 'listenbrainz';
  return {
    key: `${artistId}|${source}`,
    artistId,
    source,
    status: 'ok',
    value: 1,
    fetchedAt: NOW,
    retryAfter: null,
    sourceUrl: 'https://example.test/',
    ...over,
  };
}

function progressOf(states: ReachState[]): string[] {
  return states.flatMap((s) =>
    s.status === 'running' ? [`${s.step} ${s.done}/${s.total}`] : []
  );
}

/** The two-artist library every phase answers for. */
const HUGO = candidate();
const PEGGY = candidate({
  artistId: 'a2',
  name: 'Peggy Gou',
  isrcs: ['KRA000000002'],
});

const MBIDS: Record<string, string> = { a1: 'mb-1', a2: 'mb-2' };

const happy: Handlers = {
  mb: (artistId) =>
    json({
      resource: `https://open.spotify.com/artist/${artistId}`,
      relations: [
        { type: 'social network', artist: { id: 'wrong' } },
        { type: 'free streaming' },
        { type: 'free streaming', artist: { id: MBIDS[artistId] } },
      ],
    }),
  lb: (mbid) =>
    mbid === 'mb-1'
      ? json({
          payload: {
            artist_name: 'Hugo LX',
            total_user_count: 54,
            total_listen_count: 900,
          },
        })
      : json({
          payload: {
            artist_name: 'Peggy Gou',
            total_user_count: 5896,
            total_listen_count: 70_000,
          },
        }),
  deezer: (url) => {
    if (url === `${DEEZER_API}/track/isrc:FRX010000001?output=jsonp`) {
      return { artist: { id: 11, name: 'Hugo  LX' } };
    }
    if (url === `${DEEZER_API}/track/isrc:KRA000000002?output=jsonp`) {
      return { artist: { id: 22, name: 'Peggy Gou' } };
    }
    if (url === `${DEEZER_API}/artist/11?output=jsonp`) return { nb_fan: 585 };
    return { nb_fan: 202_216 };
  },
  // Pass 1 binds Peggy only; pass 2 (by MBID) finds nothing for Hugo.
  wd: (query) =>
    query.includes('wdt:P1902')
      ? json({
          results: {
            bindings: [
              {
                sid: { value: 'a2' },
                item: { value: 'http://www.wikidata.org/entity/Q1' },
                sitelinks: { value: '19' },
                en: { value: 'https://en.wikipedia.org/wiki/Peggy_Gou' },
                fr: { value: 'https://fr.wikipedia.org/wiki/Peggy_Gou' },
              },
            ],
          },
        })
      : json({ results: { bindings: [] } }),
  views: (project) =>
    json({
      items:
        project === 'en.wikipedia.org'
          ? [{ views: 200_000 }, { views: 89_000 }]
          : [{ views: 1000 }],
    }),
};

beforeEach(async () => {
  storage.full = false;
  await wipeDb();
});

describe('reachCandidates', () => {
  it('collects single-artist ISRCs, sorted and deduped, and skips id-less artists', () => {
    const hugo: ArtistRef = { id: 'a1', name: 'Hugo LX' };
    const peggy: ArtistRef = { id: 'a2', name: 'Peggy Gou' };
    const nameOnly: ArtistRef = { id: null, name: 'Nameless' };
    const track = (
      key: string,
      artists: ArtistRef[],
      isrc: string | null,
      isLocal = false
    ): TrackRow => ({
      key,
      id: isLocal ? null : key,
      uri: `spotify:track:${key}`,
      name: `Track ${key}`,
      artists,
      album: 'Album',
      durationMs: 300_000,
      isrc,
      spotifyUrl: null,
      isLocal,
    });
    const tracks = [
      track('t1', [hugo], 'fr-x01-00-00001'),
      track('t2', [hugo], 'FRX010000001'),
      track('t3', [hugo], 'aaa010000000'),
      track('t4', [hugo, peggy], 'GBX999999999'),
      track('t5', [hugo], null),
      track('t6', [hugo], 'ZZZ010000000', true),
      track('t7', [peggy], 'KRA000000002'),
      track('t8', [nameOnly], 'US0000000001'),
    ];
    const model = buildModel({
      playlists: [
        {
          id: 'p1',
          name: 'Crate',
          snapshotId: 's',
          itemCount: tracks.length,
          imageUrl: null,
          spotifyUrl: null,
          syncedAt: 1,
        },
      ],
      tracks,
      entries: tracks.map((t, position) => ({
        playlistId: 'p1',
        position,
        trackKey: t.key,
        addedAt: null,
      })),
      topItems: [],
      plays: [],
      features: [],
      artistIdentity: [],
      artistReach: [],
    });
    expect(reachCandidates(model)).toEqual([
      {
        artistId: 'a1',
        name: 'Hugo LX',
        isrcs: ['AAA010000000', 'FRX010000001'],
      },
      { artistId: 'a2', name: 'Peggy Gou', isrcs: ['KRA000000002'] },
    ]);
  });
});

describe('runReach', () => {
  it('runs the five phases in order and paces every source', async () => {
    const { deps, requests, sleeps, states } = setup(happy);
    await runReach(deps, [HUGO, PEGGY], [], []);
    expect(requests).toEqual([
      `${MUSICBRAINZ_URL}?resource=https%3A%2F%2Fopen.spotify.com%2Fartist%2Fa1&inc=artist-rels&fmt=json`,
      `${MUSICBRAINZ_URL}?resource=https%3A%2F%2Fopen.spotify.com%2Fartist%2Fa2&inc=artist-rels&fmt=json`,
      `${LISTENBRAINZ_STATS_URL}/mb-1/listeners`,
      `${LISTENBRAINZ_STATS_URL}/mb-2/listeners`,
      `${DEEZER_API}/track/isrc:FRX010000001?output=jsonp`,
      `${DEEZER_API}/artist/11?output=jsonp`,
      `${DEEZER_API}/track/isrc:KRA000000002?output=jsonp`,
      `${DEEZER_API}/artist/22?output=jsonp`,
      WIKIDATA_URL,
      WIKIDATA_URL,
      `${PAGEVIEWS_URL}/en.wikipedia.org/all-access/user/Peggy_Gou/monthly/2025090100/2026083100`,
      `${PAGEVIEWS_URL}/fr.wikipedia.org/all-access/user/Peggy_Gou/monthly/2025090100/2026083100`,
    ]);
    expect(sleeps).toEqual([
      1000, 1000, 1000, 1000, 250, 250, 250, 250, 250, 250,
    ]);
    expect(progressOf(states)).toEqual([
      'musicbrainz 0/2',
      'musicbrainz 1/2',
      'musicbrainz 2/2',
      'listenbrainz 0/2',
      'listenbrainz 1/2',
      'listenbrainz 2/2',
      'deezer 0/2',
      'deezer 1/2',
      'deezer 2/2',
      'wikidata 0/1',
      'wikidata 1/1',
      'wikidata 1/2',
      'wikidata 2/2',
      'wikipedia 0/1',
      'wikipedia 1/1',
    ]);
  });

  it('threads each phase writes into the next one from empty arrays', async () => {
    const { deps, release } = setup(happy);
    await runReach(deps, [HUGO, PEGGY], [], []);
    const rows = await getAllRows();
    expect(rows.artistIdentity).toEqual([
      identity({
        artistId: 'a1',
        name: 'Hugo LX',
        mbid: 'mb-1',
        mbidStatus: 'ok',
        qidStatus: 'notFound',
        qidCheckedAt: NOW,
        deezerArtistId: 11,
        deezerName: 'Hugo  LX',
        deezerStatus: 'ok',
        resolvedAt: NOW,
      }),
      identity({
        artistId: 'a2',
        name: 'Peggy Gou',
        mbid: 'mb-2',
        mbidStatus: 'ok',
        qid: 'Q1',
        qidStatus: 'ok',
        qidCheckedAt: NOW,
        sitelinks: 19,
        wikiTitles: { en: 'Peggy_Gou', fr: 'Peggy_Gou' },
        deezerArtistId: 22,
        deezerName: 'Peggy Gou',
        deezerStatus: 'ok',
        resolvedAt: NOW,
      }),
    ]);
    expect(rows.artistReach).toEqual([
      reachRow({
        artistId: 'a1',
        source: 'deezer',
        value: 585,
        sourceUrl: `${DEEZER_API}/artist/11?output=jsonp`,
      }),
      reachRow({
        artistId: 'a1',
        source: 'listenbrainz',
        value: 54,
        extra: { listens: 900 },
        sourceUrl: `${LISTENBRAINZ_STATS_URL}/mb-1/listeners`,
      }),
      reachRow({
        artistId: 'a2',
        source: 'deezer',
        value: 202_216,
        sourceUrl: `${DEEZER_API}/artist/22?output=jsonp`,
      }),
      reachRow({
        artistId: 'a2',
        source: 'listenbrainz',
        value: 5896,
        extra: { listens: 70_000 },
        sourceUrl: `${LISTENBRAINZ_STATS_URL}/mb-2/listeners`,
      }),
      reachRow({
        artistId: 'a2',
        source: 'wikipedia',
        value: 290_000,
        extra: { months: 12, en: 289_000, fr: 1000 },
        sourceUrl: `${PAGEVIEWS_URL}/en.wikipedia.org/all-access/user/Peggy_Gou/monthly/2025090100/2026083100`,
      }),
    ]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('reports the store summary and this run own counts', async () => {
    const { deps, states } = setup(happy);
    await runReach(deps, [HUGO, PEGGY], [], []);
    const summary: ArtistReachSummary = {
      version: 1,
      ranAt: NOW,
      artists: 2,
      covered: 2,
      resolved: 2,
      listenbrainz: 2,
      deezer: 2,
      wikipedia: 1,
      wellKnown: 1,
      paused: [],
    };
    expect(states.at(-1)).toEqual({
      status: 'done',
      summary,
      run: { lookedUp: 2, written: 5, unresolved: 0 },
      paused: [],
    });
    expect(await getMeta(ARTIST_REACH_SUMMARY_META)).toEqual(summary);
  });

  it('asks nothing at all when every row still answers', async () => {
    const rows = [
      identity({
        mbid: 'mb-1',
        mbidStatus: 'ok',
        qid: 'Q9',
        qidStatus: 'ok',
        qidCheckedAt: NOW - 1000,
        deezerArtistId: 11,
        deezerName: 'Hugo LX',
        deezerStatus: 'ok',
        resolvedAt: NOW - 1000,
      }),
    ];
    const reach = [
      reachRow({ source: 'listenbrainz', value: 54, fetchedAt: NOW - 1000 }),
      reachRow({ source: 'deezer', value: 585, fetchedAt: NOW - 1000 }),
    ];
    const { deps, fetchFn, jsonpFn, states } = setup({}, false);
    await runReach(deps, [HUGO], rows, reach);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(jsonpFn).not.toHaveBeenCalled();
    const last = states.at(-1);
    expect(last?.status).toBe('done');
    if (last?.status !== 'done') throw new Error('not done');
    expect(last.run).toEqual({ lookedUp: 0, written: 0, unresolved: 0 });
    expect(last.summary.covered).toBe(1);
  });

  it('re-asks at the thirty- and ninety-day marks and once retryAfter passes', async () => {
    const rows = [
      identity({
        // Permanent ids: never asked again, whatever the clock says.
        mbid: 'mb-1',
        mbidStatus: 'ok',
        qid: 'Q9',
        qidStatus: 'ok',
        qidCheckedAt: NOW - 1000,
        deezerArtistId: 11,
        deezerName: 'Hugo LX',
        deezerStatus: 'ok',
        resolvedAt: NOW - 1000,
      }),
      identity({
        artistId: 'a2',
        name: 'Peggy Gou',
        mbidStatus: 'notFound',
        qidStatus: 'notFound',
        qidCheckedAt: NOW - REACH_NOT_FOUND_TTL_MS,
        deezerStatus: 'notFound',
        resolvedAt: NOW - REACH_NOT_FOUND_TTL_MS,
      }),
      identity({
        artistId: 'a3',
        name: 'Anz',
        mbidStatus: 'retryLater',
        deezerStatus: 'notFound',
        resolvedAt: NOW - 1000,
        retryAfter: NOW,
      }),
      identity({
        artistId: 'a4',
        name: 'Anetha',
        mbidStatus: 'retryLater',
        deezerStatus: 'notFound',
        resolvedAt: NOW - 1000,
        retryAfter: NOW + 1,
      }),
    ];
    const reach = [
      // Exactly ninety days old: due.
      reachRow({
        source: 'listenbrainz',
        value: 54,
        fetchedAt: NOW - REACH_TTL_MS,
      }),
      reachRow({
        source: 'deezer',
        value: 585,
        fetchedAt: NOW - REACH_TTL_MS + 1,
      }),
    ];
    const queries: string[] = [];
    const { deps, requests } = setup({
      mb: () => json({}, 404),
      lb: () =>
        json({
          payload: {
            artist_name: 'Hugo LX',
            total_user_count: 61,
            total_listen_count: 1000,
          },
        }),
      wd: (query) => {
        queries.push(query);
        return json({ results: { bindings: [] } });
      },
    });
    const candidates = [
      HUGO,
      candidate({ artistId: 'a2', name: 'Peggy Gou', isrcs: [] }),
      candidate({ artistId: 'a3', name: 'Anz', isrcs: [] }),
      candidate({ artistId: 'a4', name: 'Anetha', isrcs: [] }),
    ];
    await putIdentities(rows);
    await putReach(reach);
    await runReach(deps, candidates, rows, reach);
    expect(
      requests
        .filter((url) => url.startsWith(MUSICBRAINZ_URL))
        .map((url) => new URL(url).searchParams.get('resource'))
    ).toEqual([
      'https://open.spotify.com/artist/a2',
      'https://open.spotify.com/artist/a3',
    ]);
    expect(
      requests.filter((url) => url.startsWith(LISTENBRAINZ_STATS_URL))
    ).toEqual([`${LISTENBRAINZ_STATS_URL}/mb-1/listeners`]);
    // Deezer's fresh number is left alone; a1 keeps its permanent id.
    expect(requests.filter((url) => url.startsWith(DEEZER_API))).toEqual([]);
    const stored = await getAllRows();
    expect(requests.filter((url) => url === WIKIDATA_URL)).toHaveLength(1);
    // Freshness is judged on the row as the run found it: a2's thirty-day-old
    // `notFound` QID is still refreshed although MusicBrainz rewrote a2's row
    // — and its `resolvedAt` — earlier in this same run.
    expect(queries[0]).toContain('"a2"');
    // A fresh `ok` QID is left alone; only a ninety-day-old one comes back.
    expect(queries[0]).not.toContain('"a1"');
    expect(stored.artistIdentity.find((r) => r.artistId === 'a1')?.mbid).toBe(
      'mb-1'
    );
    expect(
      stored.artistReach.find((r) => r.key === 'a1|listenbrainz')?.value
    ).toBe(61);
  });

  it('refreshes a ninety-day-old sitelink count and never drops a QID', async () => {
    const existing = [
      identity({
        mbidStatus: 'notFound',
        qid: 'Q9',
        qidStatus: 'ok',
        // Ninety days since Wikidata answered, but the MusicBrainz and Deezer
        // steps rewrote the row a day ago: the QID clock is its own field.
        qidCheckedAt: NOW - REACH_TTL_MS,
        sitelinks: 3,
        wikiTitles: { en: 'Hugo_LX', fr: null },
        deezerStatus: 'notFound',
        resolvedAt: NOW - REACH_NOT_FOUND_TTL_MS,
      }),
      identity({
        artistId: 'a2',
        name: 'Peggy Gou',
        mbidStatus: 'notFound',
        qid: 'Q8',
        qidStatus: 'ok',
        qidCheckedAt: NOW - REACH_TTL_MS,
        sitelinks: 2,
        wikiTitles: { en: null, fr: 'Peggy_Gou' },
        deezerStatus: 'notFound',
        resolvedAt: NOW - REACH_NOT_FOUND_TTL_MS,
      }),
    ];
    const { deps } = setup({
      // a1 comes back with a new count and a new title; a2 comes back empty.
      wd: () =>
        json({
          results: {
            bindings: [
              {
                sid: { value: 'a1' },
                item: { value: 'http://www.wikidata.org/entity/Q9' },
                sitelinks: { value: '7' },
                fr: { value: 'https://fr.wikipedia.org/wiki/Hugo_LX' },
              },
            ],
          },
        }),
      views: () => json({ items: [{ views: 12 }] }),
    });
    await runReach(
      deps,
      [
        candidate({ isrcs: [] }),
        candidate({ artistId: 'a2', name: 'Peggy Gou', isrcs: [] }),
      ],
      existing,
      []
    );
    const rows = await getAllRows();
    const byId = new Map(rows.artistIdentity.map((r) => [r.artistId, r]));
    expect(byId.get('a1')).toEqual(
      identity({
        mbidStatus: 'notFound',
        qid: 'Q9',
        qidStatus: 'ok',
        qidCheckedAt: NOW,
        sitelinks: 7,
        wikiTitles: { en: null, fr: 'Hugo_LX' },
        deezerStatus: 'notFound',
        resolvedAt: NOW,
      })
    );
    // A QID is permanent: a refresh that finds nothing only restarts the clock.
    expect(byId.get('a2')).toEqual(
      identity({
        artistId: 'a2',
        name: 'Peggy Gou',
        mbidStatus: 'notFound',
        qid: 'Q8',
        qidStatus: 'ok',
        qidCheckedAt: NOW,
        sitelinks: 2,
        wikiTitles: { en: null, fr: 'Peggy_Gou' },
        deezerStatus: 'notFound',
        resolvedAt: NOW,
      })
    );
  });

  it('leaves the whole Wikidata batch unchecked when a POST fails', async () => {
    const { deps, states } = setup({
      mb: () => json({}, 404),
      wd: () => json({}, 500),
    });
    await runReach(deps, [candidate({ isrcs: [] })], [], []);
    const rows = await getAllRows();
    expect(rows.artistIdentity[0]?.qidStatus).toBe('unchecked');
    expect(states.at(-1)?.status).toBe('done');
  });

  it('pauses a source after three failures and lets the others finish', async () => {
    const candidates = [
      candidate({ isrcs: [] }),
      candidate({ artistId: 'a2', name: 'Peggy Gou', isrcs: [] }),
      candidate({ artistId: 'a3', name: 'Anz', isrcs: [] }),
      candidate({ artistId: 'a4', name: 'Anetha', isrcs: [] }),
      candidate({ artistId: 'a5', name: 'Skee Mask', isrcs: [] }),
    ];
    const existing = [
      identity({
        artistId: 'a5',
        name: 'Skee Mask',
        mbid: 'mb-5',
        mbidStatus: 'ok',
      }),
    ];
    const { deps, states, requests, release } = setup({
      mb: () => json({ error: 'busy' }, 503),
      lb: () =>
        json({
          payload: {
            artist_name: 'Skee Mask',
            total_user_count: 3000,
            total_listen_count: 40_000,
          },
        }),
      wd: () => json({ results: { bindings: [] } }),
    });
    await runReach(deps, candidates, existing, []);
    // Four artists were due; the fourth is never reached.
    expect(
      requests
        .filter((url) => url.startsWith(MUSICBRAINZ_URL))
        .map((url) => new URL(url).searchParams.get('resource'))
    ).toEqual([
      ...Array.from({ length: 4 }, () => 'https://open.spotify.com/artist/a1'),
      ...Array.from({ length: 4 }, () => 'https://open.spotify.com/artist/a2'),
      ...Array.from({ length: 4 }, () => 'https://open.spotify.com/artist/a3'),
    ]);
    const rows = await getAllRows();
    const byId = new Map(rows.artistIdentity.map((r) => [r.artistId, r]));
    expect(byId.get('a1')?.mbidStatus).toBe('retryLater');
    expect(byId.get('a1')?.retryAfter).toBe(NOW + REACH_RETRY_LATER_TTL_MS);
    expect(byId.get('a3')?.mbidStatus).toBe('retryLater');
    // An artist the paused source never reached keeps its unchecked state:
    // a later phase may still create its row, but never a MusicBrainz field.
    expect(byId.get('a4')?.mbidStatus).toBe('unchecked');
    expect(byId.get('a4')?.mbid).toBeNull();
    // ListenBrainz still worked through the artist that already had an MBID.
    expect(rows.artistReach).toEqual([
      reachRow({
        artistId: 'a5',
        source: 'listenbrainz',
        value: 3000,
        extra: { listens: 40_000 },
        sourceUrl: `${LISTENBRAINZ_STATS_URL}/mb-5/listeners`,
      }),
    ]);
    expect(
      states.flatMap((s) =>
        s.status === 'running' && s.step === 'listenbrainz' ? [s.paused] : []
      )[0]
    ).toEqual(['musicbrainz']);
    const last = states.at(-1);
    if (last?.status !== 'done') throw new Error('not done');
    expect(last.paused).toEqual(['musicbrainz']);
    expect(last.summary.paused).toEqual(['musicbrainz']);
    expect(last.run).toEqual({ lookedUp: 5, written: 1, unresolved: 4 });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('stamps the artists ListenBrainz still owed when it asks for a long wait', async () => {
    const candidates = [HUGO, PEGGY];
    const existing = [
      identity({ mbid: 'mb-1', mbidStatus: 'ok', deezerStatus: 'notFound' }),
      identity({
        artistId: 'a2',
        name: 'Peggy Gou',
        mbid: 'mb-2',
        mbidStatus: 'ok',
        deezerStatus: 'notFound',
      }),
    ];
    const { deps, requests, states } = setup({
      lb: () => json({}, 429, { 'Retry-After': '172800' }),
      wd: () => json({ results: { bindings: [] } }),
    });
    await runReach(deps, candidates, existing, []);
    expect(
      requests.filter((url) => url.startsWith(LISTENBRAINZ_STATS_URL))
    ).toEqual([`${LISTENBRAINZ_STATS_URL}/mb-1/listeners`]);
    const rows = await getAllRows();
    expect(rows.artistReach).toEqual([
      reachRow({
        artistId: 'a1',
        source: 'listenbrainz',
        status: 'retryLater',
        value: null,
        retryAfter: NOW + 172_800_000,
        sourceUrl: `${LISTENBRAINZ_STATS_URL}/mb-1/listeners`,
      }),
      reachRow({
        artistId: 'a2',
        source: 'listenbrainz',
        status: 'retryLater',
        value: null,
        retryAfter: NOW + 172_800_000,
        sourceUrl: `${LISTENBRAINZ_STATS_URL}/mb-2/listeners`,
      }),
    ]);
    const last = states.at(-1);
    if (last?.status !== 'done') throw new Error('not done');
    expect(last.paused).toEqual(['listenbrainz']);
    expect(last.run.written).toBe(0);
  });

  it('writes the summary and keeps its rows when storage fails', async () => {
    const { deps, states, release } = setup(happy);
    const candidates = [HUGO];
    const onState = deps.onState;
    deps.onState = (state: ReachState) => {
      // The identities are written; the first reach row is not.
      if (state.status === 'running' && state.step === 'listenbrainz') {
        storage.full = true;
      }
      onState(state);
    };
    await runReach(deps, candidates, [], []);
    expect(states.at(-1)).toEqual({
      status: 'error',
      message: 'Local storage is full. Free space on the phone and try again.',
      paused: [],
    });
    const rows = await getAllRows();
    expect(rows.artistIdentity[0]?.mbid).toBe('mb-1');
    expect(rows.artistReach).toEqual([]);
    const summary = await getMeta<ArtistReachSummary>(
      ARTIST_REACH_SUMMARY_META
    );
    expect(summary?.version).toBe(1);
    expect(summary?.resolved).toBe(1);
    expect(summary?.covered).toBe(0);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('re-fetches only the fan count when the Deezer id is known', async () => {
    const existing = [
      identity({
        mbidStatus: 'notFound',
        qidStatus: 'notFound',
        qidCheckedAt: NOW - 1000,
        deezerArtistId: 11,
        deezerName: 'Hugo LX',
        deezerStatus: 'ok',
        resolvedAt: NOW - 1000,
      }),
    ];
    const stale = [
      reachRow({
        source: 'deezer',
        value: 500,
        fetchedAt: NOW - REACH_TTL_MS,
        sourceUrl: `${DEEZER_API}/artist/11?output=jsonp`,
      }),
    ];
    const { deps, requests } = setup({ deezer: () => ({ nb_fan: 585 }) });
    await runReach(deps, [HUGO], existing, stale);
    // The ISRC step is skipped: a Deezer artist id is permanent once found.
    expect(requests).toEqual([`${DEEZER_API}/artist/11?output=jsonp`]);
    const rows = await getAllRows();
    expect(rows.artistReach).toEqual([
      reachRow({
        source: 'deezer',
        value: 585,
        sourceUrl: `${DEEZER_API}/artist/11?output=jsonp`,
      }),
    ]);
  });

  it('names a paused source on the error state too', async () => {
    const candidates = [
      candidate({ isrcs: [] }),
      candidate({ artistId: 'a2', name: 'Peggy Gou', isrcs: [] }),
      candidate({ artistId: 'a3', name: 'Anz', isrcs: [] }),
      candidate({ artistId: 'a5', name: 'Skee Mask', isrcs: [] }),
    ];
    const existing = [
      identity({
        artistId: 'a5',
        name: 'Skee Mask',
        mbid: 'mb-5',
        mbidStatus: 'ok',
      }),
    ];
    const { deps, states } = setup({
      mb: () => json({ error: 'busy' }, 503),
      lb: () =>
        json({
          payload: {
            artist_name: 'Skee Mask',
            total_user_count: 3000,
            total_listen_count: 40_000,
          },
        }),
    });
    const onState = deps.onState;
    deps.onState = (state: ReachState) => {
      if (state.status === 'running' && state.step === 'listenbrainz') {
        storage.full = true;
      }
      onState(state);
    };
    await runReach(deps, candidates, existing, []);
    expect(states.at(-1)).toEqual({
      status: 'error',
      message: 'Local storage is full. Free space on the phone and try again.',
      paused: ['musicbrainz'],
    });
    const summary = await getMeta<ArtistReachSummary>(
      ARTIST_REACH_SUMMARY_META
    );
    expect(summary?.paused).toEqual(['musicbrainz']);
  });

  it('never throws when a source is unreachable', async () => {
    const { deps, states } = setup({
      mb: () => {
        throw new Error('Failed to fetch');
      },
      wd: () => json({ results: { bindings: [] } }),
    });
    await expect(runReach(deps, [HUGO], [], [])).resolves.toBeUndefined();
    const last = states.at(-1);
    if (last?.status !== 'done') throw new Error('not done');
    expect(last.paused).toEqual([]);
    const rows = await getAllRows();
    expect(rows.artistIdentity[0]?.mbidStatus).toBe('retryLater');
  });

  it('keeps rows written before an earlier stop, so a later run resumes', async () => {
    await putIdentities([identity({ mbid: 'mb-1', mbidStatus: 'ok' })]);
    await putReach([
      reachRow({ source: 'listenbrainz', value: 54, fetchedAt: NOW - 1000 }),
    ]);
    const before = await getAllRows();
    const { deps } = setup({
      wd: () => json({ results: { bindings: [] } }),
      deezer: (url) =>
        url.includes('/artist/11')
          ? { nb_fan: 585 }
          : { artist: { id: 11, name: 'Hugo LX' } },
    });
    await runReach(deps, [HUGO], before.artistIdentity, before.artistReach);
    const rows = await getAllRows();
    expect(rows.artistReach.map((r) => r.key)).toEqual([
      'a1|deezer',
      'a1|listenbrainz',
    ]);
    expect(
      rows.artistReach.find((r) => r.key === 'a1|listenbrainz')?.fetchedAt
    ).toBe(NOW - 1000);
  });
});
