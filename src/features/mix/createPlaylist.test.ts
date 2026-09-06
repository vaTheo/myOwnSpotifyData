import { describe, expect, it, vi } from 'vitest';
import { runCreatePlaylist } from './createPlaylist';
import type { CreatePlaylistState } from '../../model/state';
import type { Query, SpotifyClient } from '../../spotify/client';
import type { ApiPlaylist } from '../../spotify/types';
import type { TracklistRow } from '../../db/schema';
import { ApiError } from '../../spotify/errors';

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
}) {
  const misses = opts.misses ?? new Set<string>();
  const get = vi.fn(async (_path: string, query?: Query) => {
    if (opts.getReject) throw opts.getReject;
    const q = String(query?.q ?? '');
    const hit = opts.matchable.find((title) => q.includes(title));
    if (!hit || misses.has(hit)) return { tracks: { items: [] } };
    return {
      tracks: {
        items: [
          {
            uri: `spotify:track:${hit}`,
            id: hit,
            name: hit,
            artists: [{ id: null, name: ARTIST }],
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
    expect(done.unmatched).toEqual([{ artist: ARTIST, title: t(1) }]);
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
    expect(outcome).toEqual({
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
    expect(outcome).toEqual({
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
    expect(outcome).toEqual({ playlistId: null, url: null });
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
    expect(outcome).toEqual({ playlistId: null, url: null });
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
