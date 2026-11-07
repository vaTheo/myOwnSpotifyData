import { describe, expect, it, vi } from 'vitest';
import {
  applyYears,
  defaultChoice,
  rowAfterCreate,
  runCreatePlaylist,
  tracksToAdd,
} from './createPlaylist';
import type { CreatePlaylistState } from '../../model/state';
import type { Query, SpotifyClient } from '../../spotify/client';
import type { ApiPlaylist } from '../../spotify/types';
import type { MixRow, TracklistRow } from '../../db/schema';
import { ApiError, QuotaError } from '../../spotify/errors';

const ARTIST = 'Artist';
const PLAYLIST: ApiPlaylist = {
  id: 'PL',
  name: 'n',
  external_urls: { spotify: 'https://open.spotify.com/playlist/PL' },
};

function id(title: string): TracklistRow {
  return {
    startSec: null,
    endSec: null,
    artist: ARTIST,
    title,
    label: null,
    source: 'manual',
    gap: false,
    detected: null,
    referenceCount: null,
  };
}
const gap: TracklistRow = { ...id(''), gap: true };
const idRow: TracklistRow = { ...id('unknown'), artist: 'ID' };
const empty: TracklistRow = { ...id(''), artist: '' };

/** Padded so no title is a substring of another (T005 vs T050). */
function t(n: number): string {
  return `T${String(n).padStart(3, '0')}`;
}
function ids(n: number): TracklistRow[] {
  return Array.from({ length: n }, (_, i) => id(t(i)));
}

/**
 * A mocked client. `get` matches any query CONTAINING a matchable title —
 * format-agnostic, so it covers both searchTrack's field and plain queries —
 * unless the title is in `misses`. `post` returns the created playlist for
 * /me/playlists and {} for each items batch, optionally rejecting the create
 * or one items batch (1-based). Returned spies are asserted on directly; the
 * cast client is what the runner receives.
 */
function makeClient(opts: {
  matchable: string[];
  misses?: Set<string>;
  getReject?: unknown;
  createReject?: unknown;
  itemsRejectOnCall?: number;
  /** Round 005: album release date per title; absent = none. */
  dates?: Record<string, string>;
  /** Round 005: titles whose search rejects (the others answer). */
  getRejectFor?: Set<string>;
}) {
  const misses = opts.misses ?? new Set<string>();
  const get = vi.fn(async (_path: string, query?: Query) => {
    if (opts.getReject) throw opts.getReject;
    const q = String(query?.q ?? '');
    const hit = opts.matchable.find((title) => q.includes(title));
    if (hit && opts.getRejectFor?.has(hit)) throw new ApiError(0, 'offline');
    if (!hit || misses.has(hit)) return { tracks: { items: [] } };
    const date = opts.dates?.[hit];
    return {
      tracks: {
        items: [
          {
            uri: `spotify:track:${hit}`,
            id: hit,
            name: hit,
            artists: [{ id: null, name: ARTIST }],
            ...(date ? { album: { name: 'Al', release_date: date } } : {}),
          },
        ],
      },
    };
  });
  let itemsCalls = 0;
  const post = vi.fn(async (path: string) => {
    if (path === '/me/playlists') {
      if (opts.createReject) throw opts.createReject;
      return PLAYLIST;
    }
    itemsCalls += 1;
    if (opts.itemsRejectOnCall === itemsCalls)
      throw new ApiError(500, 'add failed');
    return {};
  });
  const client = { get, post } as unknown as Pick<
    SpotifyClient,
    'get' | 'post'
  >;
  return { client, get, post };
}

function record() {
  const states: CreatePlaylistState[] = [];
  return { states, onState: (s: CreatePlaylistState) => void states.push(s) };
}
const input = (rows: TracklistRow[]) => ({
  name: 'My Mix',
  description: 'From https://example/mix · via DJ Data',
  rows,
});
const itemsBatches = (post: ReturnType<typeof makeClient>['post']) =>
  (post.mock.calls as unknown as Array<[string, { uris: string[] }]>)
    .filter((c) => c[0] !== '/me/playlists')
    .map((c) => c[1].uris);

describe('runCreatePlaylist', () => {
  it('resolves identified rows in order and never searches inert rows', async () => {
    const rows = [id(t(0)), gap, id(t(1)), idRow, id(t(2)), empty];
    const { client, get, post } = makeClient({ matchable: [t(0), t(1), t(2)] });
    const { states, onState } = record();

    await runCreatePlaylist({ client, onState }, input(rows));

    expect(get).toHaveBeenCalledTimes(3); // only the 3 identified rows
    const resolving = states.filter((s) => s.status === 'resolving');
    expect(
      resolving.map((s) => (s.status === 'resolving' ? s.done : -1))
    ).toEqual([0, 1, 2, 3]);
    expect(
      resolving.every((s) => s.status === 'resolving' && s.total === 3)
    ).toBe(true);
    expect(itemsBatches(post)[0]).toEqual([
      'spotify:track:T000',
      'spotify:track:T001',
      'spotify:track:T002',
    ]);
  });

  it('carries the time and the Shazam link of an unmatched Tracklistify row', async () => {
    const shazamUrl = 'https://www.shazam.com/track/1/t001';
    const detected: TracklistRow = {
      ...id(t(1)),
      source: 'tracklistify',
      detected: { artist: ARTIST, title: t(1) },
      startSec: 4500,
      shazamUrl,
    };
    // Edited away from the detection: the link names the rejected ID.
    const edited: TracklistRow = {
      ...detected,
      startSec: 60,
      source: 'manual',
    };
    const { client } = makeClient({
      matchable: [t(1)],
      misses: new Set([t(1)]),
    });
    const { states, onState } = record();

    await runCreatePlaylist({ client, onState }, input([detected, edited]));

    const done = states.at(-1);
    if (done?.status !== 'done') throw new Error('expected done');
    expect(done.unmatched).toEqual([
      { artist: ARTIST, title: t(1), startSec: 4500, shazamUrl },
      { artist: ARTIST, title: t(1), startSec: 60, shazamUrl: null },
    ]);
  });

  it('collects unmatched rows in mix order and omits them from the batch', async () => {
    const rows = [id(t(0)), id(t(1)), id(t(2))];
    const { client, post } = makeClient({
      matchable: [t(0), t(1), t(2)],
      misses: new Set([t(1)]),
    });
    const { states, onState } = record();

    await runCreatePlaylist({ client, onState }, input(rows));

    const done = states.at(-1);
    if (done?.status !== 'done') throw new Error('expected done');
    expect(done.unmatched).toEqual([
      { artist: ARTIST, title: t(1), startSec: null, shazamUrl: null },
    ]);
    expect(done.added).toBe(2);
    expect(done.total).toBe(3);
    expect(itemsBatches(post)[0]).toEqual([
      'spotify:track:T000',
      'spotify:track:T002',
    ]);
  });

  it('batches 250 URIs into 100/100/50 add calls, order preserved', async () => {
    const rows = ids(250);
    const { client, post } = makeClient({
      matchable: rows.map((r) => r.title),
    });
    const { onState } = record();

    const outcome = await runCreatePlaylist({ client, onState }, input(rows));

    const batches = itemsBatches(post);
    expect(batches.map((b) => b.length)).toEqual([100, 100, 50]);
    expect(batches.flat()).toEqual(rows.map((r) => `spotify:track:${r.title}`));
    expect(outcome).toMatchObject({
      playlistId: 'PL',
      url: 'https://open.spotify.com/playlist/PL',
    });
  });

  it('creates the playlist but adds nothing when no row matched', async () => {
    const rows = ids(2);
    const matchable = rows.map((r) => r.title);
    const { client, post } = makeClient({
      matchable,
      misses: new Set(matchable),
    });
    const { states, onState } = record();

    await runCreatePlaylist({ client, onState }, input(rows));

    expect(post).toHaveBeenCalledTimes(1); // create only, no items call
    expect(post.mock.calls[0][0]).toBe('/me/playlists');
    expect(states.map((s) => s.status)).not.toContain('adding');
    const done = states.at(-1);
    expect(
      done?.status === 'done' && done.added === 0 && done.total === 2
    ).toBe(true);
  });

  it('sends {name, public:false, description} to POST /me/playlists', async () => {
    const rows = ids(1);
    const { client, post } = makeClient({
      matchable: rows.map((r) => r.title),
    });
    const { onState } = record();

    await runCreatePlaylist({ client, onState }, input(rows));

    expect(post.mock.calls[0]).toEqual([
      '/me/playlists',
      {
        name: 'My Mix',
        public: false,
        description: 'From https://example/mix · via DJ Data',
      },
    ]);
  });

  it('surfaces the url and partial added count when an add batch fails', async () => {
    const rows = ids(150); // -> batches of 100 and 50
    const { client } = makeClient({
      matchable: rows.map((r) => r.title),
      itemsRejectOnCall: 2,
    });
    const { states, onState } = record();

    const outcome = await runCreatePlaylist({ client, onState }, input(rows));

    const err = states.at(-1);
    if (err?.status !== 'error') throw new Error('expected error');
    expect(err.url).toBe('https://open.spotify.com/playlist/PL');
    expect(err.added).toBe(100); // batch 1 landed, batch 2 rejected
    expect(outcome).toMatchObject({
      playlistId: 'PL',
      url: 'https://open.spotify.com/playlist/PL',
    });
  });

  it('errors when the create fails; no items call and no id comes back', async () => {
    const rows = ids(2);
    const { client, post } = makeClient({
      matchable: rows.map((r) => r.title),
      createReject: new ApiError(403, 'Insufficient client scope'),
    });
    const { states, onState } = record();

    const outcome = await runCreatePlaylist({ client, onState }, input(rows));

    expect(post).toHaveBeenCalledTimes(1); // create attempted, no items call
    expect(itemsBatches(post)).toEqual([]);
    expect(states.at(-1)?.status).toBe('error');
    expect(outcome).toMatchObject({ playlistId: null, url: null });
  });

  it('errors before creating when a search fails; no POST is sent', async () => {
    const rows = ids(3);
    const { client, post } = makeClient({
      matchable: rows.map((r) => r.title),
      getReject: new ApiError(0, 'offline'),
    });
    const { states, onState } = record();

    const outcome = await runCreatePlaylist({ client, onState }, input(rows));

    expect(post).not.toHaveBeenCalled();
    expect(states.at(-1)?.status).toBe('error');
    expect(outcome).toMatchObject({ playlistId: null, url: null });
  });

  it('reuses a track Check on Spotify found instead of searching again (T117)', async () => {
    const checked: TracklistRow = {
      ...id(t(0)),
      spotify: { id: 'X1', url: 'https://open.spotify.com/track/X1' },
      checkedAt: 1,
    };
    const notFound: TracklistRow = {
      ...id(t(1)),
      spotify: 'not-found',
      checkedAt: 1,
    };
    const { client, get, post } = makeClient({ matchable: [t(1)] });
    const { onState } = record();

    await runCreatePlaylist({ client, onState }, input([checked, notFound]));

    expect(get).toHaveBeenCalledTimes(1); // only the row without an id
    expect(itemsBatches(post)[0]).toEqual([
      'spotify:track:X1',
      'spotify:track:T001',
    ]);
  });

  it('remembers a quota lock-out met by a search; nothing is written', async () => {
    const rows = ids(2);
    const { client, post } = makeClient({
      matchable: rows.map((r) => r.title),
      getReject: new QuotaError(5_000),
    });
    const { states, onState } = record();

    const outcome = await runCreatePlaylist({ client, onState }, input(rows));

    expect(post).not.toHaveBeenCalled();
    expect(states.at(-1)?.status).toBe('error');
    expect(outcome).toMatchObject({
      playlistId: null,
      url: null,
      quotaUntil: 5_000,
    });
  });

  it('remembers a quota lock-out met by an add batch, keeping the link', async () => {
    const rows = ids(2);
    const { client, post } = makeClient({
      matchable: rows.map((r) => r.title),
    });
    post.mockImplementation(async (path: string) => {
      if (path === '/me/playlists') return PLAYLIST;
      throw new QuotaError(9_000);
    });
    const { states, onState } = record();

    const outcome = await runCreatePlaylist({ client, onState }, input(rows));

    const err = states.at(-1);
    if (err?.status !== 'error') throw new Error('expected error');
    expect(err.added).toBe(0);
    expect(err.total).toBe(2);
    expect(post).toHaveBeenCalledTimes(2); // never retried
    expect(outcome).toMatchObject({
      playlistId: 'PL',
      url: 'https://open.spotify.com/playlist/PL',
      quotaUntil: 9_000,
    });
  });

  it('drives the state sequence resolving*->creating->adding->done', async () => {
    const rows = ids(2);
    const { client } = makeClient({ matchable: rows.map((r) => r.title) });
    const { states, onState } = record();

    await runCreatePlaylist({ client, onState }, input(rows));

    expect(states.map((s) => s.status)).toEqual([
      'resolving',
      'resolving',
      'resolving',
      'creating',
      'adding',
      'done',
    ]);
  });
});

/* ---------- the selection rule (T119, T126, owner's D6) ---------- */

describe('tracksToAdd', () => {
  const validated: TracklistRow = { ...id('V'), validated: true };
  const toReview: TracklistRow = { ...id('R') };
  const candidate: TracklistRow = { ...id('C'), origin: 'clue' };
  const validCandidate: TracklistRow = {
    ...id('VC'),
    origin: 'clue',
    validated: true,
  };
  const heardOnce: TracklistRow = { ...id('H'), hits: 1 };
  const validGap: TracklistRow = { ...gap, validated: true };
  const rows = [
    validated,
    gap,
    toReview,
    candidate,
    validCandidate,
    heardOnce,
    validGap,
    idRow,
  ];

  it('Validated only keeps validated tracks, a validated candidate included', () => {
    expect(tracksToAdd(rows, 'validated')).toEqual([validated, validCandidate]);
  });

  it('All tracks keeps every track not removed, candidates included', () => {
    expect(tracksToAdd(rows, 'all')).toEqual([
      validated,
      toReview,
      candidate,
      validCandidate,
      heardOnce,
    ]);
  });

  it('an unvalidated candidate is out of Validated only and in All tracks', () => {
    expect(tracksToAdd([candidate], 'validated')).toEqual([]);
    expect(tracksToAdd([candidate], 'all')).toEqual([candidate]);
  });

  it('a validated candidate is in both', () => {
    expect(tracksToAdd([validCandidate], 'validated')).toEqual([
      validCandidate,
    ]);
    expect(tracksToAdd([validCandidate], 'all')).toEqual([validCandidate]);
  });

  it('a gap row is in neither, even marked validated; nor an ID row', () => {
    for (const choice of ['validated', 'all'] as const) {
      expect(tracksToAdd([gap, validGap, idRow], choice)).toEqual([]);
    }
  });

  it('keeps set order whatever the rows hold for the chips and the Sort', () => {
    // The Heard once chip and the Sort are view state: the rule reads only
    // the working list, so a heard-once row and clip counts change nothing.
    const a: TracklistRow = { ...id('A'), hits: 5, confidence: 90 };
    const b: TracklistRow = { ...id('B'), hits: 1, confidence: 99 };
    expect(tracksToAdd([a, b], 'all')).toEqual([a, b]);
  });

  it('a candidate starts To review, so Validated only leaves it out', () => {
    expect(candidate.validated).toBeUndefined();
    expect(tracksToAdd([validated, candidate], 'validated')).toEqual([
      validated,
    ]);
  });
});

describe('defaultChoice', () => {
  it('is Validated only once any track is validated', () => {
    expect(defaultChoice([id('A'), { ...id('B'), validated: true }])).toBe(
      'validated'
    );
  });

  it('is All tracks while none is', () => {
    expect(defaultChoice([id('A'), id('B')])).toBe('all');
    expect(defaultChoice([])).toBe('all');
  });

  it('ignores a validated gap row', () => {
    expect(defaultChoice([id('A'), { ...gap, validated: true }])).toBe('all');
  });
});

describe('rowAfterCreate (S13 N1): what Create saves when it ends', () => {
  const mix = (rows: TracklistRow[], savedAt: number): MixRow =>
    ({ url: 'u', title: 't', rows, savedAt }) as unknown as MixRow;
  const made = {
    playlistUrl: 'https://open.spotify.com/playlist/PL',
    playlistId: 'PL',
  };

  it('keeps a review the owner saved during the run, adding only the playlist', () => {
    const tapped = mix([id('One'), id('Two')], 100);
    const stored = {
      ...mix([{ ...id('One'), validated: true }], 150),
      removed: [{ artist: 'A', title: 'Gone', isrc: null }],
    };
    const out = rowAfterCreate(tapped, stored, 120, made, 200);
    expect(out.rows).toEqual([{ ...id('One'), validated: true }]);
    expect(out.removed).toEqual([{ artist: 'A', title: 'Gone', isrc: null }]);
    expect(out).toMatchObject({ ...made, savedAt: 200 });
  });

  it('saves the rows of the tap when nothing was saved since, with stored answers', () => {
    const checked = {
      ...id('Two'),
      spotify: { id: 'S2', url: 'https://open.spotify.com/track/S2' },
      checkedAt: 7,
    };
    const tapped = mix([id('One'), id('Two')], 100);
    const stored = mix([id('One'), checked], 90);
    const out = rowAfterCreate(tapped, stored, 120, made, 200);
    expect(out.rows[1]).toMatchObject({ spotify: { id: 'S2' }, checkedAt: 7 });
    expect(out).toMatchObject({ ...made, savedAt: 200 });
  });

  it('saves the rows of the tap for a mix never saved', () => {
    const tapped = mix([id('One')], 100);
    expect(rowAfterCreate(tapped, undefined, 120, made, 200).rows).toEqual([
      id('One'),
    ]);
  });
});

describe('runCreatePlaylist — round 005 years', () => {
  it('dates matched undated rows from Spotify; a dated row keeps its year', async () => {
    const shazam: TracklistRow = {
      ...id(t(1)),
      year: 1993,
      yearFrom: 'shazam',
    };
    const rows = [id(t(0)), shazam, id(t(2)), id(t(3)), gap];
    const { client } = makeClient({
      matchable: [t(0), t(1), t(2), t(3)],
      misses: new Set([t(2)]),
      dates: {
        [t(0)]: '1987-06-01',
        [t(1)]: '2010',
        [t(2)]: '1999',
        [t(3)]: 'n/a',
      },
    });
    const { onState } = record();

    const outcome = await runCreatePlaylist({ client, onState }, input(rows));

    expect(outcome.years.size).toBe(1);
    expect(outcome.rows[0]).toEqual({
      ...rows[0],
      year: 1987,
      yearFrom: 'spotify',
    });
    expect(outcome.rows[1]).toBe(shazam); // dated: unchanged
    expect(outcome.rows[2]).toBe(rows[2]); // unmatched: no year
    expect(outcome.rows[3]).toBe(rows[3]); // no valid album date
    expect(outcome.rows[4]).toBe(gap);
    expect(rows[0].year).toBeUndefined(); // the input is never mutated
  });

  it('keeps the years learned before a search fails', async () => {
    const rows = ids(3);
    const { client, post } = makeClient({
      matchable: rows.map((r) => r.title),
      dates: { [t(0)]: '2001-01-01' },
      getRejectFor: new Set([t(1)]),
    });
    const { states, onState } = record();

    const outcome = await runCreatePlaylist({ client, onState }, input(rows));

    expect(post).not.toHaveBeenCalled();
    expect(states.at(-1)?.status).toBe('error');
    expect(outcome.playlistId).toBeNull();
    expect(outcome.rows[0]).toMatchObject({ year: 2001, yearFrom: 'spotify' });
    expect(outcome.rows[1]).toBe(rows[1]);
  });

  it('keeps the years when the create fails', async () => {
    const rows = ids(2);
    const { client } = makeClient({
      matchable: rows.map((r) => r.title),
      dates: { [t(0)]: '1975', [t(1)]: '1976' },
      createReject: new ApiError(403, 'Insufficient client scope'),
    });
    const { onState } = record();

    const outcome = await runCreatePlaylist({ client, onState }, input(rows));

    expect(outcome.playlistId).toBeNull();
    expect(outcome.rows.map((r) => r.year)).toEqual([1975, 1976]);
  });
});

describe('applyYears', () => {
  it('sets years by row identity and leaves an edited or dated row alone', () => {
    const a = id(t(0));
    const b = id(t(1));
    const years = new Map([
      [a, 1990],
      [b, 1991],
    ]);
    const edited = { ...b, title: 'Edited' };
    const out = applyYears([a, edited], years);
    expect(out[0]).toEqual({ ...a, year: 1990, yearFrom: 'spotify' });
    expect(out[1]).toBe(edited);
    const rows = [a];
    expect(applyYears(rows, new Map())).toBe(rows);
  });
});
