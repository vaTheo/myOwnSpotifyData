import { describe, expect, it, vi } from 'vitest';
import {
  MAX_IDS,
  RECCOBEATS_TRACK_URL,
  RECCOBEATS_URL,
  fetchAlbumYear,
  fetchAudioFeatures,
  fetchTrackRids,
} from './reccobeats';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const NOW = 1_700_000_000_000;

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
  const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
  const deps = {
    fetchFn: fetchFn as unknown as typeof fetch,
    sleep,
    now: () => NOW,
  };
  return { deps, fetchFn, sleep };
}

const HOUSE = {
  href: 'https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp',
  isrc: 'GBAHT2100123',
  tempo: 124.5,
  key: 9,
  mode: 0,
  energy: 0.82,
};

describe('fetchAudioFeatures', () => {
  it('asks for one comma-separated batch and maps the payload', async () => {
    const { deps, fetchFn } = setup([() => json({ content: [HOUSE] })]);
    const batch = await fetchAudioFeatures(
      ['3n3Ppam7vgaVa1iaRUc9Lp', 'aaa'],
      deps
    );
    expect(fetchFn.mock.calls[0][0]).toBe(
      `${RECCOBEATS_URL}?ids=3n3Ppam7vgaVa1iaRUc9Lp,aaa`
    );
    expect(batch.byId.get('3n3Ppam7vgaVa1iaRUc9Lp')).toEqual({
      bpm: 124.5,
      key: 9,
      major: false,
      energy: 0.82,
      fetchedAt: NOW,
      isrc: 'GBAHT2100123',
    });
  });

  it('reads -1 as no key, mode 1 as major and absent numbers as null', async () => {
    const { deps } = setup([
      () =>
        json({
          content: [
            {
              href: 'https://open.spotify.com/track/one',
              isrc: 'US-AAA-21-00001',
              tempo: 128,
              key: -1,
              mode: 1,
              energy: 0.5,
            },
            {
              href: 'https://open.spotify.com/track/two',
              isrc: null,
              tempo: 0,
              mode: 7,
            },
          ],
        }),
    ]);
    const batch = await fetchAudioFeatures(['one', 'two'], deps);
    expect(batch.byId.get('one')).toEqual({
      bpm: 128,
      key: null,
      major: true,
      energy: 0.5,
      fetchedAt: NOW,
      isrc: 'USAAA2100001',
    });
    expect(batch.byId.get('two')).toEqual({
      bpm: null,
      key: null,
      major: null,
      energy: null,
      fetchedAt: NOW,
      isrc: null,
    });
  });

  it('indexes results by ISRC too and ignores a query on the href', async () => {
    const { deps } = setup([
      () =>
        json({
          content: [
            { ...HOUSE, href: 'https://open.spotify.com/track/abc?si=1' },
          ],
        }),
    ]);
    const batch = await fetchAudioFeatures(['abc'], deps);
    expect([...batch.byId.keys()]).toEqual(['abc']);
    expect(batch.byIsrc.get('GBAHT2100123')?.bpm).toBe(124.5);
  });

  it('makes no request for an empty list and refuses more than forty', async () => {
    const { deps, fetchFn } = setup([]);
    const empty = await fetchAudioFeatures([], deps);
    expect([empty.byId.size, empty.byIsrc.size]).toEqual([0, 0]);
    const many = Array.from({ length: MAX_IDS + 1 }, (_, i) => `id${i}`);
    await expect(fetchAudioFeatures(many, deps)).rejects.toThrow(/at most 40/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('waits Retry-After seconds on 429 and repeats the same request', async () => {
    const { deps, fetchFn, sleep } = setup([
      () => json({}, 429, { 'Retry-After': '3' }),
      () => json({ content: [HOUSE] }),
    ]);
    const batch = await fetchAudioFeatures(['3n3Ppam7vgaVa1iaRUc9Lp'], deps);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([3000]);
    expect(fetchFn.mock.calls[1][0]).toBe(fetchFn.mock.calls[0][0]);
    expect(batch.byId.size).toBe(1);
  });

  it('waits ten seconds when Retry-After is missing or unreadable', async () => {
    const { deps, sleep } = setup([
      () => json({}, 429),
      () => json({}, 429, { 'Retry-After': 'soon' }),
      () => json({ content: [] }),
    ]);
    await fetchAudioFeatures(['one'], deps);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([10_000, 10_000]);
  });

  it('gives up at once when Retry-After exceeds a minute, without sleeping', async () => {
    const { deps, sleep } = setup([
      () => json({}, 429, { 'Retry-After': '86400' }),
    ]);
    await expect(fetchAudioFeatures(['one'], deps)).rejects.toThrow(
      'ReccoBeats asked us to wait 1440 min. Try again later.'
    );
    expect(sleep).not.toHaveBeenCalled();
  });

  it('gives up after five 429 retries', async () => {
    const { deps, fetchFn } = setup(
      Array.from(
        { length: 6 },
        () => () => json({}, 429, { 'Retry-After': '1' })
      )
    );
    await expect(fetchAudioFeatures(['one'], deps)).rejects.toThrow(
      /rate limited/
    );
    expect(fetchFn).toHaveBeenCalledTimes(6);
  });

  it('backs off three times on 5xx and then gives up', async () => {
    const { deps, fetchFn, sleep } = setup(
      Array.from({ length: 4 }, () => () => json({}, 503))
    );
    await expect(fetchAudioFeatures(['one'], deps)).rejects.toThrow(
      'ReccoBeats server error 503'
    );
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([2000, 4000, 8000]);
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it('retries a network failure and then succeeds', async () => {
    const { deps, sleep } = setup([
      () => Promise.reject(new TypeError('Failed to fetch')),
      () => json({ content: [HOUSE] }),
    ]);
    const batch = await fetchAudioFeatures(['3n3Ppam7vgaVa1iaRUc9Lp'], deps);
    expect(batch.byId.size).toBe(1);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([2000]);
  });

  it('retries a truncated body instead of reporting no results', async () => {
    const { deps, fetchFn } = setup([
      () =>
        new Response('{"content":[', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      () => json({ content: [HOUSE] }),
    ]);
    const batch = await fetchAudioFeatures(['3n3Ppam7vgaVa1iaRUc9Lp'], deps);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(batch.byId.size).toBe(1);
  });

  it('treats a body with no content array as empty and throws on 400', async () => {
    const ok = setup([() => json({ message: 'nothing here' })]);
    const empty = await fetchAudioFeatures(['one'], ok.deps);
    expect([empty.byId.size, empty.byIsrc.size]).toEqual([0, 0]);
    const bad = setup([
      () => json({ message: 'size must be between 1 and 40' }, 400),
    ]);
    await expect(fetchAudioFeatures(['one'], bad.deps)).rejects.toThrow(
      'ReccoBeats error 400'
    );
    expect(bad.fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe('round 005: ReccoBeats ids and album years', () => {
  const RID = '0b1f9c4e-7a35-4a0e-9d2c-4b1f1d5e6a7b';

  it("keeps ReccoBeats' own id as rid on an audio-features value", async () => {
    const { deps } = setup([
      () =>
        json({
          content: [
            { ...HOUSE, id: RID },
            {
              ...HOUSE,
              id: 3,
              href: 'https://open.spotify.com/track/b',
              isrc: null,
            },
          ],
        }),
    ]);
    const batch = await fetchAudioFeatures(
      ['3n3Ppam7vgaVa1iaRUc9Lp', 'b'],
      deps
    );
    expect(batch.byId.get('3n3Ppam7vgaVa1iaRUc9Lp')?.rid).toBe(RID);
    expect(batch.byId.get('b')).not.toHaveProperty('rid');
  });

  it('maps Spotify ids to ReccoBeats ids from /track?ids=', async () => {
    const { deps, fetchFn } = setup([
      () =>
        json({
          content: [
            {
              id: RID,
              href: 'https://open.spotify.com/track/s1',
              isrc: 'X',
              trackTitle: 'T',
            },
            { id: '', href: 'https://open.spotify.com/track/s2' },
            { id: 'r3' },
          ],
        }),
    ]);
    const rids = await fetchTrackRids(['s1', 's2', 's3'], deps);
    expect(fetchFn.mock.calls[0][0]).toBe(
      `${RECCOBEATS_TRACK_URL}?ids=s1,s2,s3`
    );
    expect([...rids]).toEqual([['s1', RID]]);
  });

  it('makes no request for no ids and refuses more than forty', async () => {
    const { deps, fetchFn } = setup([]);
    expect((await fetchTrackRids([], deps)).size).toBe(0);
    await expect(
      fetchTrackRids(
        Array.from({ length: MAX_IDS + 1 }, (_, i) => `i${i}`),
        deps
      )
    ).rejects.toThrow(/at most 40/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns the earliest valid album year, ignoring junk dates', async () => {
    const { deps, fetchFn } = setup([
      () =>
        json({
          content: [
            {
              name: 'Mothership',
              albumType: 'compilation',
              releaseDate: '2007-11-12',
              releaseDateFormat: 'day',
            },
            {
              name: 'IV',
              albumType: 'album',
              releaseDate: '1971-11-08',
              releaseDateFormat: 'day',
            },
            { name: 'Bad', releaseDate: '0000' },
            { name: 'None' },
          ],
          page: 0,
          size: 50,
          totalElements: 4,
          totalPages: 1,
        }),
    ]);
    await expect(fetchAlbumYear(RID, deps)).resolves.toBe(1971);
    expect(fetchFn.mock.calls[0][0]).toBe(
      `${RECCOBEATS_TRACK_URL}/${RID}/album?size=50`
    );
  });

  it('answers null when no album carries a year or the body has no content', async () => {
    const { deps } = setup([
      () => json({ content: [{ name: 'X', releaseDate: null }] }),
      () => json({}),
    ]);
    await expect(fetchAlbumYear(RID, deps)).resolves.toBeNull();
    await expect(fetchAlbumYear(RID, deps)).resolves.toBeNull();
  });

  it('shares the 429 wait, the 5xx back-off and the malformed-body retry', async () => {
    const { deps, sleep } = setup([
      () => json({}, 429, { 'Retry-After': '2' }),
      () => json({}, 503),
      () => new Response('{"content":[', { status: 200 }),
      () => json({ content: [{ releaseDate: '1999' }] }),
    ]);
    await expect(fetchAlbumYear(RID, deps)).resolves.toBe(1999);
    expect(sleep.mock.calls[0][0]).toBe(2000);
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  it('throws on a 4xx and when ReccoBeats stays unreachable', async () => {
    const down = () => {
      throw new TypeError('Failed to fetch');
    };
    const { deps } = setup([() => json({}, 404), down, down, down, down]);
    await expect(fetchAlbumYear(RID, deps)).rejects.toThrow(
      'ReccoBeats error 404'
    );
    await expect(fetchTrackRids(['s1'], deps)).rejects.toThrow(/unreachable/);
  });
});
