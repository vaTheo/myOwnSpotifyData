/**
 * The one Spotify quota lock-out, read by every wrapper that reads Spotify
 * (spec 003 S08d, review round 1, M3): each `start*` refuses inside the lock
 * without a request, and each one remembers a quota answer it meets.
 * The browser edges (the Spotify session, the API client, the server, the
 * database) are replaced, so state.ts runs under Vitest without a browser.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../auth/session';
import type { TracklistRow } from '../db/schema';
import { QuotaError } from '../spotify/errors';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  serverConfigured: false,
}));

vi.mock('../auth/browser', async () => {
  const { signal: s } = await import('@preact/signals');
  return {
    auth: {
      session: s<Session | null>(null),
      lastAuthError: s<string | null>(null),
      logout: vi.fn(),
      clearAll: vi.fn(),
      beginLogin: vi.fn(),
    },
  };
});

vi.mock('../spotify/api', () => ({
  api: { get: mocks.get, post: mocks.post, put: mocks.put },
}));

vi.mock('../server/browser', async () => {
  const { signal: s } = await import('@preact/signals');
  return {
    get serverConfigured() {
      return mocks.serverConfigured;
    },
    serverClient: {},
    serverAuth: {
      session: s(null),
      linkSent: s(false),
      lastError: s(null),
      getAccessToken: vi.fn(),
      signOut: vi.fn(),
    },
  };
});

vi.mock('../db/repo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../db/repo')>()),
  wipeDb: vi.fn(async () => undefined),
  getMeta: vi.fn(async () => undefined),
  putMeta: vi.fn(async () => undefined),
  putMix: vi.fn(async () => undefined),
  getMixes: vi.fn(async () => []),
  getMixDeleted: vi.fn(async () => []),
}));

const { auth } = await import('../auth/browser');
const state = await import('./state');

const HOUR = 3_600_000;
const URL = 'https://soundcloud.com/demo/set';
const ALL_SCOPES =
  'playlist-modify-private user-library-read user-library-modify';

function row(title: string): TracklistRow {
  return {
    startSec: 0,
    endSec: null,
    artist: 'Artist',
    title,
    label: null,
    source: 'manual',
    gap: false,
    detected: null,
    referenceCount: null,
  };
}

function openMix(): void {
  state.mixState.value = {
    status: 'ready',
    view: {
      url: URL,
      title: 'Set',
      author: null,
      playerSrc: null,
      sources: { trackid: false, description: false, tracklistify: false },
      descriptionRows: [],
      trackid: null,
      oembedError: null,
      trackidError: null,
    },
  } as unknown as typeof state.mixState.value;
  state.mixRows.value = [row('One'), row('Two')];
}

function likeModel(): void {
  state.model.value = {
    playlistsById: new Map([['P', {}]]),
    entriesByPlaylist: new Map([['P', [{ position: 0, trackKey: 'k' }]]]),
    tracksByKey: new Map([['k', { uri: 'spotify:track:X' }]]),
  } as unknown as typeof state.model.value;
}

beforeEach(() => {
  mocks.get.mockReset();
  mocks.post.mockReset();
  mocks.put.mockReset();
  auth.session.value = {
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: Date.now() + HOUR,
    scope: ALL_SCOPES,
  };
  state.spotifyQuotaLock.value = null;
  state.banner.value = null;
  state.syncState.value = { status: 'idle' };
  state.spotifyCheckState.value = { status: 'idle' };
  state.createPlaylistState.value = { status: 'idle' };
  state.likeState.value = { status: 'idle' };
  openMix();
  likeModel();
});

describe('every Spotify reader refuses inside the lock, with no request', () => {
  beforeEach(() => {
    state.spotifyQuotaLock.value = Date.now() + HOUR;
  });

  it('Sync now / Sync this playlist (a banner, as sync failures are)', async () => {
    await state.startSync();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(state.syncState.value.status).toBe('idle');
    expect(state.banner.value?.text).toMatch(
      /^Spotify quota reached\. Sync again after /
    );
  });

  it('Check on Spotify (inline)', async () => {
    await state.startSpotifyCheck();
    expect(mocks.get).not.toHaveBeenCalled();
    const s = state.spotifyCheckState.value;
    expect(s.status === 'error' && s.message).toMatch(
      /^Spotify quota reached\. Check again after /
    );
  });

  it('Create playlist (inline, nothing written)', async () => {
    await state.startCreatePlaylist();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
    const s = state.createPlaylistState.value;
    expect(s.status === 'error' && s.message).toMatch(
      /^Spotify quota reached\. Try again after /
    );
  });

  it('Like all songs (inline, nothing written)', async () => {
    await state.startLikePlaylist('P');
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
    const s = state.likeState.value;
    expect(s.status === 'error' && s.message).toMatch(
      /^Spotify quota reached\. Try again after /
    );
  });

  it('the account read on the Connect tap', async () => {
    await state.recordConnectedAccount();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(state.banner.value?.text).toMatch(/^Spotify quota reached\./);
  });

  it('lets them read again once the lock lapsed', async () => {
    state.spotifyQuotaLock.value = Date.now() - 1;
    mocks.get.mockResolvedValue({ id: 'me' });
    await state.recordConnectedAccount();
    expect(mocks.get).toHaveBeenCalledWith('/me');
  });
});

describe('a quota answer to any reader is remembered for all', () => {
  const until = (): number => Date.now() + 2 * HOUR;

  it('from Check on Spotify', async () => {
    const end = until();
    mocks.get.mockRejectedValue(new QuotaError(end));
    await state.startSpotifyCheck();
    expect(state.spotifyQuotaLock.value).toBe(end);
  });

  it('from Create playlist, the inline line naming the held end', async () => {
    const held = Date.now() + 5 * HOUR;
    state.spotifyQuotaLock.value = null;
    mocks.get.mockRejectedValue(new QuotaError(until()));
    // A later end already held elsewhere wins, and the line names it.
    mocks.get.mockImplementationOnce(async () => {
      state.spotifyQuotaLock.value = held;
      throw new QuotaError(until());
    });
    await state.startCreatePlaylist();
    expect(mocks.post).not.toHaveBeenCalled();
    expect(state.spotifyQuotaLock.value).toBe(held);
    const s = state.createPlaylistState.value;
    expect(s.status === 'error' && s.message).toBe(
      state.heldQuotaMessage('create')
    );
  });

  it('from Like all songs, inline', async () => {
    const end = until();
    mocks.get.mockRejectedValue(new QuotaError(end));
    await state.startLikePlaylist('P');
    expect(mocks.put).not.toHaveBeenCalled();
    expect(state.spotifyQuotaLock.value).toBe(end);
    const s = state.likeState.value;
    expect(s.status === 'error' && s.message).toMatch(
      /^Spotify quota reached\. Try again after /
    );
  });

  it('from the account read on the Connect tap', async () => {
    const end = until();
    mocks.get.mockRejectedValue(new QuotaError(end));
    await state.recordConnectedAccount();
    expect(state.spotifyQuotaLock.value).toBe(end);
  });

  it('and Disconnect keeps it', async () => {
    const end = until();
    state.spotifyQuotaLock.value = end;
    await state.disconnect();
    expect(state.spotifyQuotaLock.value).toBe(end);
  });
});

describe('readMixesForSearch (S09 round 1)', () => {
  it('leaves the Mix screen state alone when the read fails', async () => {
    const repo = await import('../db/repo');
    vi.mocked(repo.getMixes).mockRejectedValueOnce(new Error('disk gone'));
    state.mixError.value = 'Could not reach the server';
    const before = state.savedMixes.value;
    const got = await state.readMixesForSearch();
    expect(got).toEqual({
      error: 'Could not read your saved mixes: disk gone',
    });
    expect(state.mixError.value).toBe('Could not reach the server');
    expect(state.savedMixes.value).toBe(before);
    state.mixError.value = null;
  });

  it('returns the mixes newest first and leaves mixError alone', async () => {
    const repo = await import('../db/repo');
    const older = { url: 'a', savedAt: 1 } as never;
    const newer = { url: 'b', savedAt: 2 } as never;
    vi.mocked(repo.getMixes).mockResolvedValueOnce([older, newer]);
    state.mixError.value = 'Already requested';
    expect(await state.readMixesForSearch()).toEqual({
      mixes: [newer, older],
    });
    expect(state.mixError.value).toBe('Already requested');
    state.mixError.value = null;
  });
});

describe('loadServerPending (S11, parked minor)', () => {
  it('a late read never puts older flags back over a newer one', async () => {
    const repo = await import('../db/repo');
    let releaseOld: (v: unknown) => void = () => undefined;
    vi.mocked(repo.getMeta)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseOld = resolve;
          })
      )
      .mockResolvedValueOnce({ history: true } as never);
    const first = state.loadServerPending();
    await state.loadServerPending();
    expect(state.serverPending.value).toEqual({ history: true });
    releaseOld({});
    await first;
    expect(state.serverPending.value).toEqual({ history: true });
    state.serverPending.value = null;
  });

  it('a late failed read leaves a newer good read alone', async () => {
    const repo = await import('../db/repo');
    let failOld: (e: unknown) => void = () => undefined;
    vi.mocked(repo.getMeta)
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            failOld = reject;
          })
      )
      .mockResolvedValueOnce({ mixes: true } as never);
    const first = state.loadServerPending();
    await state.loadServerPending();
    failOld(new Error('disk gone'));
    await first;
    expect(state.serverPending.value).toEqual({ mixes: true });
    expect(state.serverPendingError.value).toBeNull();
    state.serverPending.value = null;
  });

  it('a late read never undoes the flags a push request just wrote', async () => {
    const repo = await import('../db/repo');
    let releaseOld: (v: unknown) => void = () => undefined;
    vi.mocked(repo.getMeta)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseOld = resolve;
          })
      )
      .mockResolvedValueOnce({} as never);
    mocks.serverConfigured = true;
    try {
      const first = state.loadServerPending();
      // Signed out of the server: the flags are written, nothing is sent.
      await state.queueServerPush(['history']);
      expect(state.serverPending.value).toEqual({ history: true });
      releaseOld({});
      await first;
      expect(state.serverPending.value).toEqual({ history: true });
    } finally {
      mocks.serverConfigured = false;
      state.serverPending.value = null;
    }
  });
});
