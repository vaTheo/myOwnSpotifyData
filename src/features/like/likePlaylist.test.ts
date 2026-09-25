import { describe, expect, it, vi } from 'vitest';
import type { Session } from '../../auth/session';
import type { EntryRow, TrackRow } from '../../db/schema';
import type { LikeState } from '../../model/state';
import type { Query, SpotifyClient } from '../../spotify/client';
import { ApiError } from '../../spotify/errors';
import {
  canLikeTracks,
  likeCandidates,
  likeErrorText,
  likeQuestion,
  likeSummary,
  runLikePlaylist,
} from './likePlaylist';

function track(key: string, uri: string): TrackRow {
  return {
    key,
    id: uri.startsWith('spotify:track:') ? key : null,
    uri,
    name: key,
    artists: [],
    album: '',
    durationMs: 0,
    isrc: null,
    spotifyUrl: null,
    isLocal: uri.startsWith('spotify:local:'),
  };
}
function entry(position: number, trackKey: string): EntryRow {
  return { playlistId: 'P', position, trackKey, addedAt: null };
}
function model(entries: EntryRow[], tracks: TrackRow[]) {
  return {
    entriesByPlaylist: new Map([['P', entries]]),
    tracksByKey: new Map(tracks.map((t) => [t.key, t])),
  };
}
const uri = (n: number) => `spotify:track:t${n}`;
const uris = (n: number) => Array.from({ length: n }, (_, i) => uri(i));

describe('canLikeTracks', () => {
  const s = (scope: string): Session => ({
    accessToken: 'a',
    expiresAt: 0,
    refreshToken: 'r',
    scope,
  });
  it('needs both library scopes', () => {
    expect(canLikeTracks(s('user-library-read user-library-modify'))).toBe(
      true
    );
    expect(canLikeTracks(s('user-library-modify'))).toBe(false);
    expect(canLikeTracks(s('user-library-read'))).toBe(false);
    expect(canLikeTracks(null)).toBe(false);
  });
});

describe('likeCandidates', () => {
  it('keeps playlist order and only spotify:track: URIs', () => {
    const m = model(
      [entry(2, 'b'), entry(0, 'a'), entry(1, 'loc'), entry(3, 'ep')],
      [
        track('a', 'spotify:track:a'),
        track('b', 'spotify:track:b'),
        track('loc', 'spotify:local:A:Al:T:100'),
        track('ep', 'spotify:episode:e'),
      ]
    );
    expect(likeCandidates(m, 'P')).toEqual({
      uris: ['spotify:track:a', 'spotify:track:b'],
      skipped: 2,
    });
  });

  it('duplicates: sends a song once and does not count it as skipped', () => {
    const m = model(
      [entry(0, 'a'), entry(1, 'a')],
      [track('a', 'spotify:track:a')]
    );
    expect(likeCandidates(m, 'P')).toEqual({
      uris: ['spotify:track:a'],
      skipped: 0,
    });
  });

  it('skips an entry whose track row is missing, and an unknown playlist', () => {
    const m = model([entry(0, 'gone')], []);
    expect(likeCandidates(m, 'P')).toEqual({ uris: [], skipped: 1 });
    expect(likeCandidates(m, 'nope')).toEqual({ uris: [], skipped: 0 });
  });
});

/** `saved` holds the URIs already liked; `putRejectOnCall` is 1-based. */
function setup(opts: {
  saved?: string[];
  getReject?: unknown;
  answer?: unknown;
  putRejectOnCall?: number;
  confirm?: boolean;
}) {
  const saved = new Set(opts.saved ?? []);
  const get = vi.fn(async (_path: string, query?: Query) => {
    if (opts.getReject) throw opts.getReject;
    if (opts.answer !== undefined) return opts.answer;
    return String(query?.uris)
      .split(',')
      .map((u) => saved.has(u));
  });
  let putCalls = 0;
  const put = vi.fn(async () => {
    putCalls += 1;
    if (putCalls === opts.putRejectOnCall)
      throw new ApiError(503, 'Spotify server error 503');
  });
  const confirm = vi.fn(() => opts.confirm ?? true);
  const states: LikeState[] = [];
  const deps = {
    client: { get, put } as unknown as Pick<SpotifyClient, 'get' | 'put'>,
    confirm,
    onState: (s: LikeState) => states.push(s),
  };
  return { deps, get, put, confirm, states, last: () => states.at(-1) };
}
const batchOf = (call: unknown[]) => String((call[1] as Query).uris);

describe('runLikePlaylist', () => {
  it('checks in batches of 40 and zips the answer by index', async () => {
    const t = setup({ saved: [uri(1), uri(41), uri(84)] });
    await runLikePlaylist(t.deps, {
      playlistId: 'P',
      uris: uris(85),
      skipped: 0,
    });
    expect(t.get.mock.calls.map((c) => batchOf(c).split(',').length)).toEqual([
      40, 40, 5,
    ]);
    expect(t.get.mock.calls[0][0]).toBe('/me/library/contains');
    expect(t.confirm).toHaveBeenCalledWith(82, 85);
    const sent = t.put.mock.calls.flatMap((c) =>
      batchOf(c as unknown[]).split(',')
    );
    expect(sent).toEqual(
      uris(85).filter((u) => ![uri(1), uri(41), uri(84)].includes(u))
    );
    expect(
      t.put.mock.calls.map((c) => batchOf(c as unknown[]).split(',').length)
    ).toEqual([40, 40, 2]);
    expect((t.put.mock.calls[0] as unknown[])[0]).toBe('/me/library');
    expect(t.last()).toEqual({
      status: 'done',
      playlistId: 'P',
      liked: 82,
      already: 3,
      skipped: 0,
    });
  });

  it('reports progress for both phases', async () => {
    const t = setup({});
    await runLikePlaylist(t.deps, {
      playlistId: 'P',
      uris: uris(45),
      skipped: 1,
    });
    expect(t.states).toContainEqual({
      status: 'checking',
      playlistId: 'P',
      done: 40,
      total: 45,
    });
    expect(t.states).toContainEqual({
      status: 'liking',
      playlistId: 'P',
      done: 40,
      total: 45,
    });
  });

  it('all liked: no confirm and no write', async () => {
    const t = setup({ saved: uris(3) });
    await runLikePlaylist(t.deps, {
      playlistId: 'P',
      uris: uris(3),
      skipped: 2,
    });
    expect(t.confirm).not.toHaveBeenCalled();
    expect(t.put).not.toHaveBeenCalled();
    expect(t.last()).toEqual({
      status: 'done',
      playlistId: 'P',
      liked: 0,
      already: 3,
      skipped: 2,
    });
  });

  it('no Spotify songs: no request at all', async () => {
    const t = setup({});
    await runLikePlaylist(t.deps, { playlistId: 'P', uris: [], skipped: 4 });
    expect(t.get).not.toHaveBeenCalled();
    expect(t.put).not.toHaveBeenCalled();
    expect(t.last()).toEqual({
      status: 'done',
      playlistId: 'P',
      liked: 0,
      already: 0,
      skipped: 4,
    });
  });

  it('cancel writes nothing and returns to idle', async () => {
    const t = setup({ confirm: false });
    await runLikePlaylist(t.deps, {
      playlistId: 'P',
      uris: uris(2),
      skipped: 0,
    });
    expect(t.put).not.toHaveBeenCalled();
    expect(t.last()).toEqual({ status: 'idle' });
  });

  it('a check failure writes nothing', async () => {
    const t = setup({
      getReject: new ApiError(403, 'Insufficient client scope'),
    });
    await runLikePlaylist(t.deps, {
      playlistId: 'P',
      uris: uris(2),
      skipped: 0,
    });
    expect(t.put).not.toHaveBeenCalled();
    expect(t.last()).toEqual({
      status: 'error',
      playlistId: 'P',
      message: 'Could not check your Liked Songs: Insufficient client scope',
    });
  });

  it.each([
    ['a short array', [false]],
    ['a non-array', { saved: true }],
    ['non-booleans', [0, 1]],
  ])('malformed answer (%s) writes nothing', async (_label, answer) => {
    const t = setup({ answer });
    await runLikePlaylist(t.deps, {
      playlistId: 'P',
      uris: uris(2),
      skipped: 0,
    });
    expect(t.confirm).not.toHaveBeenCalled();
    expect(t.put).not.toHaveBeenCalled();
    expect(t.last()).toMatchObject({
      status: 'error',
      message:
        'Could not check your Liked Songs: Spotify returned an unexpected answer',
    });
  });

  it('write failure reports how many were liked before it', async () => {
    const t = setup({ putRejectOnCall: 2 });
    await runLikePlaylist(t.deps, {
      playlistId: 'P',
      uris: uris(88),
      skipped: 0,
    });
    expect(t.last()).toEqual({
      status: 'error',
      playlistId: 'P',
      message: 'Spotify server error 503',
      liked: 40,
      toLike: 88,
    });
  });
});

describe('copy', () => {
  it('asks with the exact count', () => {
    expect(likeQuestion(88, 120)).toBe(
      "88 of 120 songs from your last sync aren't in your Liked Songs yet. Like them?"
    );
    expect(likeQuestion(1, 1)).toBe(
      "1 of 1 song from your last sync isn't in your Liked Songs yet. Like it?"
    );
  });

  it('summarises only the non-zero parts', () => {
    expect(likeSummary({ liked: 88, already: 32, skipped: 1 })).toBe(
      'Liked 88 songs · 32 were already liked · 1 local file skipped'
    );
    expect(likeSummary({ liked: 1, already: 0, skipped: 0 })).toBe(
      'Liked 1 song'
    );
    expect(likeSummary({ liked: 0, already: 120, skipped: 0 })).toBe(
      'All 120 songs are already in your Liked Songs'
    );
    expect(likeSummary({ liked: 0, already: 1, skipped: 0 })).toBe(
      'Your 1 song is already in your Liked Songs'
    );
    expect(likeSummary({ liked: 0, already: 0, skipped: 3 })).toBe(
      'No Spotify songs to like · 3 local files skipped'
    );
  });

  it('names the progress in a write-phase error', () => {
    expect(likeErrorText({ message: 'boom', liked: 40, toLike: 88 })).toBe(
      'Liked 40 of 88, then: boom'
    );
    expect(likeErrorText({ message: 'boom' })).toBe('boom');
  });
});
