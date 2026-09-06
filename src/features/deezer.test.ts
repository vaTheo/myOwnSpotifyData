import { describe, expect, it, vi } from 'vitest';
import type { TrackRow } from '../db/schema';
import { JSONP_TIMEOUT_MS } from './jsonp';
import {
  DEEZER_INTERVAL_MS,
  MAX_ISRC_CANDIDATES,
  candidateIsrcs,
  deezerArtistUrl,
  deezerTrackUrl,
  fetchDeezerFans,
  resolveDeezerArtist,
} from './deezer';

type JsonpLike = (url: string, timeoutMs: number) => Promise<unknown>;

const BAMBOUNOU = '4bqQAsBrjEqz1jSVFdcXJx';
const BRUCE = '5v1Ivi6ImXWyMHTZBFHvzB';

function setup(answers: Array<() => unknown>) {
  const jsonpFn = vi.fn<JsonpLike>(async () => {
    const next = answers.shift();
    if (!next) throw new Error('unexpected extra request');
    return next();
  });
  const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
  return { deps: { jsonpFn, sleep }, jsonpFn, sleep };
}

function track(key: string, over: Partial<TrackRow> = {}): TrackRow {
  return {
    key,
    id: key,
    uri: `spotify:track:${key}`,
    name: `Track ${key}`,
    artists: [{ id: BAMBOUNOU, name: 'Bambounou' }],
    album: 'Album',
    durationMs: 300_000,
    isrc: null,
    spotifyUrl: null,
    isLocal: false,
    ...over,
  };
}

describe('candidateIsrcs', () => {
  it('takes only tracks credited to exactly this artist, normalised and sorted', () => {
    const tracks = [
      track('t1', { isrc: 'FR-9W1-15-00002' }),
      track('t2', { isrc: 'fr9w11500001' }),
      // The same ISRC on a second pressing must not be asked twice.
      track('t3', { isrc: 'FR9W11500001' }),
      // "Bambounou x Bruce": two credits, so it never contributes.
      track('t4', {
        isrc: 'GB9W11500003',
        artists: [
          { id: BAMBOUNOU, name: 'Bambounou' },
          { id: BRUCE, name: 'Bruce' },
        ],
      }),
      // Another artist's track, a local file and a track with no ISRC.
      track('t5', {
        isrc: 'US9W11500004',
        artists: [{ id: BRUCE, name: 'Bruce' }],
      }),
      track('t6', { isrc: 'AA9W11500005', isLocal: true }),
      track('t7'),
    ];
    expect(candidateIsrcs(BAMBOUNOU, tracks)).toEqual([
      'FR9W11500001',
      'FR9W11500002',
    ]);
    expect(candidateIsrcs('unknown-artist', tracks)).toEqual([]);
  });

  it('ignores a name-only credit, which carries no id at all', () => {
    const tracks = [
      track('t1', {
        isrc: 'FR9W11500001',
        artists: [{ id: null, name: 'Bambounou' }],
      }),
    ];
    expect(candidateIsrcs(BAMBOUNOU, tracks)).toEqual([]);
  });
});

describe('resolveDeezerArtist', () => {
  it('asks the ISRC endpoint only, never a name search, and keeps the id', async () => {
    const { deps, jsonpFn, sleep } = setup([
      () => ({
        id: 3135556,
        title: 'Cirrus',
        artist: { id: 4666432, name: 'Hugo LX' },
      }),
    ]);
    const result = await resolveDeezerArtist('Hugo LX', ['FR9W11500001'], deps);
    expect(result).toEqual({
      status: 'ok',
      artistId: 4666432,
      name: 'Hugo LX',
    });
    expect(jsonpFn.mock.calls[0]).toEqual([
      'https://api.deezer.com/track/isrc:FR9W11500001?output=jsonp',
      JSONP_TIMEOUT_MS,
    ]);
    expect(deezerTrackUrl('FR9W11500001')).toBe(jsonpFn.mock.calls[0][0]);
    expect(
      jsonpFn.mock.calls.every(
        (call) =>
          call[0].startsWith('https://api.deezer.com/track/isrc:') ||
          call[0].startsWith('https://api.deezer.com/artist/')
      )
    ).toBe(true);
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([
      DEEZER_INTERVAL_MS,
    ]);
    expect(DEEZER_INTERVAL_MS).toBe(250);
  });

  it('accepts a name that matches only after normalisation', async () => {
    const { deps } = setup([
      () => ({ artist: { id: 260, name: 'ETIENNE DE CRECY' } }),
    ]);
    expect(
      await resolveDeezerArtist('Étienne de Crécy', ['FR9W11500001'], deps)
    ).toEqual({ status: 'ok', artistId: 260, name: 'ETIENNE DE CRECY' });
  });

  it('rejects "Bambounou x Bruce" and takes the next candidate', async () => {
    const { deps, jsonpFn } = setup([
      () => ({ artist: { id: 7, name: 'Bambounou x Bruce' } }),
      () => ({ artist: { id: 4508817, name: 'Bambounou' } }),
    ]);
    const result = await resolveDeezerArtist(
      'Bambounou',
      ['FR9W11500001', 'FR9W11500002'],
      deps
    );
    expect(result).toEqual({
      status: 'ok',
      artistId: 4508817,
      name: 'Bambounou',
    });
    expect(jsonpFn).toHaveBeenCalledTimes(2);
  });

  it('rejects a homonym and a shortened credit rather than guess', async () => {
    const fisher = setup([
      () => ({ artist: { id: 13, name: 'India Fisher' } }),
    ]);
    expect(
      await resolveDeezerArtist('FISHER', ['AU9W11500001'], fisher.deps)
    ).toEqual({ status: 'notFound' });
    const byron = setup([
      () => ({ artist: { id: 5, name: 'Byron Aquarius' } }),
    ]);
    expect(
      await resolveDeezerArtist(
        'Byron the Aquarius',
        ['US9W11500001'],
        byron.deps
      )
    ).toEqual({ status: 'notFound' });
  });

  it('tries at most three candidates and asks for none without an ISRC', async () => {
    const { deps, jsonpFn } = setup(
      Array.from({ length: 3 }, () => () => ({
        artist: { id: 7, name: 'Someone Else' },
      }))
    );
    const isrcs = ['A1', 'A2', 'A3', 'A4', 'A5'];
    expect(await resolveDeezerArtist('Bambounou', isrcs, deps)).toEqual({
      status: 'notFound',
    });
    expect(jsonpFn).toHaveBeenCalledTimes(MAX_ISRC_CANDIDATES);
    expect(MAX_ISRC_CANDIDATES).toBe(3);
    const none = setup([]);
    expect(await resolveDeezerArtist('Bambounou', [], none.deps)).toEqual({
      status: 'notFound',
    });
    expect(none.jsonpFn).not.toHaveBeenCalled();
  });

  it('treats an id that is not a finite number and an odd error as misses', async () => {
    const { deps } = setup([
      () => ({ artist: { id: '4508817', name: 'Bambounou' } }),
      () => ({
        error: { type: 'DataException', message: 'no data', code: 800 },
      }),
    ]);
    expect(await resolveDeezerArtist('Bambounou', ['A1', 'A2'], deps)).toEqual({
      status: 'notFound',
    });
  });

  it('retries the quota error five times and then asks to come back later', async () => {
    const { deps, jsonpFn, sleep } = setup(
      Array.from({ length: 6 }, () => () => ({
        error: { type: 'Exception', message: 'Quota limit exceeded', code: 4 },
      }))
    );
    expect(await resolveDeezerArtist('Bambounou', ['A1'], deps)).toEqual({
      status: 'retryLater',
      message: 'Deezer is over quota: it refused 6 attempts (error 4)',
    });
    expect(jsonpFn).toHaveBeenCalledTimes(6);
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([
      250, 2000, 250, 4000, 250, 8000, 250, 16_000, 250, 32_000, 250,
    ]);
  });

  it('answers the quota once it clears and carries on with the candidate', async () => {
    const { deps, jsonpFn } = setup([
      () => ({ error: { code: 4 } }),
      () => ({ artist: { id: 4508817, name: 'Bambounou' } }),
    ]);
    expect(await resolveDeezerArtist('Bambounou', ['A1'], deps)).toEqual({
      status: 'ok',
      artistId: 4508817,
      name: 'Bambounou',
    });
    expect(jsonpFn.mock.calls[0][0]).toBe(jsonpFn.mock.calls[1][0]);
  });

  it('reads a JSONP timeout as retryLater, never as a miss', async () => {
    const { deps, jsonpFn } = setup([
      () => {
        throw new Error('JSONP request timed out after 10000 ms: url');
      },
    ]);
    expect(await resolveDeezerArtist('Bambounou', ['A1', 'A2'], deps)).toEqual({
      status: 'retryLater',
      message:
        'Deezer is unreachable: JSONP request timed out after 10000 ms: url',
    });
    expect(jsonpFn).toHaveBeenCalledTimes(1);
  });
});

describe('fetchDeezerFans', () => {
  it('costs one request when the artist id is already known', async () => {
    const { deps, jsonpFn, sleep } = setup([
      () => ({ id: 4666432, name: 'Hugo LX', nb_fan: 585 }),
    ]);
    expect(await fetchDeezerFans(4666432, deps)).toEqual({
      status: 'ok',
      fans: 585,
      sourceUrl: 'https://api.deezer.com/artist/4666432?output=jsonp',
    });
    expect(jsonpFn).toHaveBeenCalledTimes(1);
    expect(jsonpFn.mock.calls[0][0]).toBe(deezerArtistUrl(4666432));
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([250]);
  });

  it('reads an answer with no nb_fan as notFound, keeping the url', async () => {
    const { deps } = setup([() => ({ error: { code: 800 } })]);
    expect(await fetchDeezerFans(4666432, deps)).toEqual({
      status: 'notFound',
      sourceUrl: deezerArtistUrl(4666432),
    });
  });

  it('reads a transport failure as retryLater, keeping the url', async () => {
    const { deps } = setup([
      () => {
        throw new Error('JSONP request failed: url');
      },
    ]);
    expect(await fetchDeezerFans(4666432, deps)).toEqual({
      status: 'retryLater',
      message: 'Deezer is unreachable: JSONP request failed: url',
      sourceUrl: deezerArtistUrl(4666432),
    });
  });
});
