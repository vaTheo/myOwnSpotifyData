import { describe, expect, it } from 'vitest';
import { reachKey } from '../db/schema';
import type {
  AllRows,
  ArtistIdentityRow,
  ArtistReachRow,
  ArtistRef,
  PlayRow,
  PlaylistRow,
  ReachSource,
  TrackRow,
} from '../db/schema';
import { buildModel, type Model } from './aggregate';
import {
  hasHistory,
  isWellKnown,
  rankUnderTheRadar,
  reachCoverage,
  reachFor,
} from './reach';

function playlist(id: string): PlaylistRow {
  return {
    id,
    name: id,
    snapshotId: 's',
    itemCount: 0,
    imageUrl: null,
    spotifyUrl: null,
    syncedAt: 1,
  };
}

function track(key: string, artists: ArtistRef[]): TrackRow {
  return {
    key,
    id: key,
    uri: `spotify:track:${key}`,
    name: `Song ${key}`,
    artists,
    album: 'Album',
    durationMs: 1000,
    isrc: null,
    spotifyUrl: null,
    isLocal: false,
  };
}

/** trackName and artistName stay null so only the id path credits plays. */
function play(trackId: string, plays: number): PlayRow {
  return {
    trackId,
    plays,
    msPlayed: plays * 200_000,
    firstTs: '2026-01-01T12:00:00Z',
    lastTs: '2026-08-01T12:00:00Z',
    trackName: null,
    artistName: null,
  };
}

/** An untouched identity row: every step 'unchecked', nothing resolved. */
function identity(
  artistId: string,
  over: Partial<ArtistIdentityRow> = {}
): ArtistIdentityRow {
  return {
    artistId,
    name: `Artist ${artistId}`,
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

function reachRow(
  artistId: string,
  source: ReachSource,
  value: number | null,
  over: Partial<ArtistReachRow> = {}
): ArtistReachRow {
  return {
    key: reachKey(artistId, source),
    artistId,
    source,
    status: 'ok',
    value,
    fetchedAt: 2000,
    retryAfter: null,
    sourceUrl: `https://example.test/${source}/${artistId}`,
    ...over,
  };
}

function modelOf(over: Partial<AllRows>): Model {
  return buildModel({
    playlists: [],
    tracks: [],
    entries: [],
    topItems: [],
    plays: [],
    features: [],
    artistIdentity: [],
    artistReach: [],
    ...over,
  });
}

interface ArtistSpec {
  id: string | null;
  name: string;
  /** Tracks credited to this artist; must be >= `playlists`. */
  tracks?: number;
  playlists?: number;
  /** Credited to the artist's first track only, so the sum is this number. */
  plays?: number;
  listeners?: number;
  fans?: number;
  views?: number;
  identity?: Partial<ArtistIdentityRow>;
}

/** Builds a library where each artist has exactly the shape the spec asks. */
function library(specs: ArtistSpec[]): Partial<AllRows> {
  const playlistIds = new Set<string>();
  const tracks: TrackRow[] = [];
  const entries: AllRows['entries'] = [];
  const plays: PlayRow[] = [];
  const artistIdentity: ArtistIdentityRow[] = [];
  const artistReach: ArtistReachRow[] = [];
  specs.forEach((spec, index) => {
    const ref: ArtistRef = { id: spec.id, name: spec.name };
    const trackCount = spec.tracks ?? 1;
    const playlistCount = spec.playlists ?? 1;
    for (let t = 0; t < trackCount; t += 1) {
      const key = `t${index}-${t}`;
      const playlistId = `p${t % playlistCount}`;
      playlistIds.add(playlistId);
      tracks.push(track(key, [ref]));
      entries.push({
        playlistId,
        position: entries.length,
        trackKey: key,
        addedAt: null,
      });
    }
    if (spec.plays !== undefined) plays.push(play(`t${index}-0`, spec.plays));
    if (spec.id === null) return;
    if (spec.identity) artistIdentity.push(identity(spec.id, spec.identity));
    if (spec.listeners !== undefined)
      artistReach.push(reachRow(spec.id, 'listenbrainz', spec.listeners));
    if (spec.fans !== undefined)
      artistReach.push(reachRow(spec.id, 'deezer', spec.fans));
    if (spec.views !== undefined)
      artistReach.push(reachRow(spec.id, 'wikipedia', spec.views));
  });
  return {
    playlists: [...playlistIds].map(playlist),
    tracks,
    entries,
    plays,
    artistIdentity,
    artistReach,
  };
}

describe('reachFor', () => {
  it('returns the three sources and ignores a row that carries no number', () => {
    const model = modelOf({
      artistReach: [
        reachRow('a1', 'listenbrainz', 5051),
        reachRow('a1', 'deezer', null, { status: 'notFound' }),
        reachRow('a1', 'wikipedia', null, {
          status: 'retryLater',
          retryAfter: 9000,
        }),
        reachRow('a2', 'deezer', 703),
      ],
    });
    const one = reachFor(model, 'a1');
    expect(one.listenbrainz?.value).toBe(5051);
    expect(one.deezer).toBeUndefined();
    expect(one.wikipedia).toBeUndefined();
    expect(reachFor(model, 'a2').deezer?.value).toBe(703);
    const none = reachFor(model, 'nobody');
    expect([none.listenbrainz, none.deezer, none.wikipedia]).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('ignores an ok row whose value is null', () => {
    const model = modelOf({
      artistReach: [reachRow('a1', 'listenbrainz', null)],
    });
    expect(reachFor(model, 'a1').listenbrainz).toBeUndefined();
  });
});

describe('hasHistory', () => {
  it('is false with no imported rows and true with a zero-play row', () => {
    expect(hasHistory(modelOf({}))).toBe(false);
    expect(hasHistory(modelOf({ plays: [play('t1', 0)] }))).toBe(true);
  });
});

describe('isWellKnown', () => {
  it('is true only for an identity with at least one sitelink', () => {
    expect(isWellKnown(undefined)).toBe(false);
    expect(isWellKnown(identity('a1'))).toBe(false);
    expect(isWellKnown(identity('a1', { sitelinks: 0 }))).toBe(false);
    expect(isWellKnown(identity('a1', { sitelinks: 1 }))).toBe(true);
    expect(isWellKnown(identity('a1', { sitelinks: 19 }))).toBe(true);
  });

  it('reads the sitelink count alone, never the Wikipedia row', () => {
    const model = modelOf({
      artistIdentity: [identity('a1', { sitelinks: 1 })],
      artistReach: [reachRow('a1', 'wikipedia', null, { status: 'notFound' })],
    });
    expect(reachFor(model, 'a1').wikipedia).toBeUndefined();
    expect(isWellKnown(model.identities.get('a1'))).toBe(true);
  });
});

describe('rankUnderTheRadar groups', () => {
  const model = modelOf(
    library([
      { id: 'radar', name: 'Radar', listeners: 54 },
      { id: 'famous', name: 'Famous', identity: { sitelinks: 19 } },
      {
        id: 'views',
        name: 'Views Only',
        views: 4000,
        identity: { sitelinks: 0 },
      },
      { id: 'blank', name: 'Blank' },
      { id: null, name: 'Local Hero' },
    ])
  );

  it('groups radar, then unknown, then known, and numbers straight through', () => {
    const list = rankUnderTheRadar(model, 'plays');
    expect(list.map((r) => [r.artistId, r.group, r.rank])).toEqual([
      ['radar', 'radar', 1],
      ['blank', 'unknown', 2],
      ['views', 'unknown', 3],
      ['famous', 'known', 4],
    ]);
  });

  it('excludes an artist with no Spotify id', () => {
    expect(
      rankUnderTheRadar(model, 'plays').some((r) => r.agg.name === 'Local Hero')
    ).toBe(false);
  });

  it('carries the owner counts and the three numbers on every row', () => {
    const row = rankUnderTheRadar(model, 'plays')[0];
    expect(row).toMatchObject({
      artistId: 'radar',
      tracks: 1,
      playlists: 1,
      plays: 0,
      listeners: 54,
      fans: null,
      views: null,
      sitelinks: null,
    });
    const views = rankUnderTheRadar(model, 'plays')[2];
    expect(views.views).toBe(4000);
    expect(views.sitelinks).toBe(0);
  });
});

const TIES: ArtistSpec[] = [
  {
    id: 'a1',
    name: 'Same Name',
    tracks: 2,
    playlists: 1,
    plays: 5,
    listeners: 1,
  },
  {
    id: 'a2',
    name: 'Same Name',
    tracks: 2,
    playlists: 1,
    plays: 5,
    listeners: 2,
  },
  { id: 'b1', name: 'Beta', tracks: 2, playlists: 2, plays: 5, listeners: 3 },
  { id: 'c1', name: 'Gamma', tracks: 3, playlists: 1, plays: 5, listeners: 4 },
  { id: 'd1', name: 'Delta', tracks: 1, playlists: 1, plays: 9, listeners: 5 },
];

describe('rankUnderTheRadar sorts', () => {
  it('sorts by plays descending, then tracks, playlists, name and id', () => {
    const list = rankUnderTheRadar(modelOf(library(TIES)), 'plays');
    expect(list.map((r) => r.artistId)).toEqual(['d1', 'c1', 'b1', 'a1', 'a2']);
    expect(list.map((r) => r.plays)).toEqual([9, 5, 5, 5, 5]);
  });

  it('falls back to saved tracks for the whole model when no history is loaded', () => {
    const withoutPlays = TIES.map((spec) => {
      const copy = { ...spec };
      delete copy.plays;
      return copy;
    });
    const model = modelOf(library(withoutPlays));
    expect(hasHistory(model)).toBe(false);
    expect(rankUnderTheRadar(model, 'plays').map((r) => r.artistId)).toEqual([
      'c1',
      'b1',
      'a1',
      'a2',
      'd1',
    ]);
  });

  const NULLS: ArtistSpec[] = [
    { id: 'x1', name: 'X One', plays: 1, listeners: 500, fans: 10 },
    { id: 'x2', name: 'X Two', plays: 1, listeners: 50, fans: 20 },
    { id: 'x3', name: 'X Three', plays: 1, fans: 30 },
    { id: 'x4', name: 'X Four', plays: 1, listeners: 50, fans: 5 },
    { id: 'x5', name: 'X Five', plays: 1, listeners: 5 },
  ];

  it('sorts by listeners ascending with nulls last, breaking ties on fans', () => {
    const list = rankUnderTheRadar(modelOf(library(NULLS)), 'listeners');
    expect(list.map((r) => r.artistId)).toEqual(['x5', 'x4', 'x2', 'x1', 'x3']);
    expect(list.map((r) => r.listeners)).toEqual([5, 50, 50, 500, null]);
  });

  it('sorts by fans ascending with nulls last, breaking ties on listeners', () => {
    const list = rankUnderTheRadar(modelOf(library(NULLS)), 'fans');
    expect(list.map((r) => r.artistId)).toEqual(['x4', 'x1', 'x2', 'x3', 'x5']);
    expect(list.map((r) => r.fans)).toEqual([5, 10, 20, 30, null]);
  });
});

describe('rankUnderTheRadar memo', () => {
  it('returns the same array for the same model and sort, and a new one otherwise', () => {
    const model = modelOf(library(TIES));
    const plays = rankUnderTheRadar(model, 'plays');
    expect(rankUnderTheRadar(model, 'plays')).toBe(plays);
    const listeners = rankUnderTheRadar(model, 'listeners');
    expect(listeners).not.toBe(plays);
    expect(rankUnderTheRadar(model, 'listeners')).toBe(listeners);
    const rebuilt = modelOf(library(TIES));
    expect(rankUnderTheRadar(rebuilt, 'listeners')).not.toBe(listeners);
  });
});

describe('reachCoverage', () => {
  const model = modelOf(
    library([
      {
        id: 'a',
        name: 'A',
        listeners: 100,
        identity: {
          mbid: 'm-a',
          sitelinks: 4,
          wikiTitles: { en: 'A', fr: null },
        },
      },
      { id: 'b', name: 'B', fans: 200, identity: { mbid: 'm-b' } },
      {
        id: 'c',
        name: 'C',
        views: 300,
        identity: {
          mbidStatus: 'notFound',
          sitelinks: 1,
          wikiTitles: { en: null, fr: 'C_fr' },
        },
      },
      { id: 'd', name: 'D' },
      { id: null, name: 'Local Hero' },
    ])
  );

  it('counts the store over the candidates, with §2 definitions', () => {
    expect(reachCoverage(model)).toEqual({
      artists: 4,
      covered: 3,
      resolved: 2,
      listenbrainz: 1,
      deezer: 1,
      wikipedia: 2,
      wellKnown: 2,
    });
  });

  it('keeps the two invariants covered <= artists and wellKnown >= wikipedia', () => {
    const c = reachCoverage(model);
    expect(c.covered).toBeLessThanOrEqual(c.artists);
    expect(c.wellKnown).toBeGreaterThanOrEqual(c.wikipedia);
  });

  it('memoises on the model identity', () => {
    const first = reachCoverage(model);
    expect(reachCoverage(model)).toBe(first);
    expect(reachCoverage(modelOf({}))).not.toBe(first);
  });
});
