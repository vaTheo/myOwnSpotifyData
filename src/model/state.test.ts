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

/* ---------- S13: one Spotify reader at a time, and the Mix wiring ---------- */

/** A search answer naming `title` by Artist, as `pickMatch` accepts it. */
function hit(title: string) {
  return {
    tracks: {
      items: [
        {
          uri: `spotify:track:${title}id`,
          id: `${title}id`,
          name: title,
          artists: [{ id: null, name: 'Artist' }],
        },
      ],
    },
  };
}

function searchAnswers(found: string[]): void {
  mocks.get.mockImplementation(
    async (_path: string, query?: { q?: string }) => {
      const q = String(query?.q ?? '');
      const t = found.find((f) => q.includes(f));
      return t === undefined ? { tracks: { items: [] } } : hit(t);
    }
  );
}

function playlistAnswers(): void {
  mocks.post.mockImplementation(async (path: string) =>
    path === '/me/playlists'
      ? {
          id: 'PL',
          external_urls: { spotify: 'https://open.spotify.com/playlist/PL' },
        }
      : {}
  );
}

async function putMixCalls() {
  const repo = await import('../db/repo');
  return vi.mocked(repo.putMix).mock.calls.map((c) => c[0]);
}

describe('one Spotify reader at a time (S13, B3/B6)', () => {
  beforeEach(() => {
    state.savedMixes.value = [];
    state.mixError.value = null;
  });

  const running = {
    sync: () => {
      state.syncState.value = {
        status: 'running',
        done: 0,
        total: 1,
        current: null,
        pending: [],
      } as never;
    },
    check: () => {
      state.spotifyCheckState.value = {
        status: 'running',
        url: 'https://soundcloud.com/demo/other',
        done: 0,
        total: 3,
        stopping: false,
      };
    },
    create: () => {
      state.createPlaylistState.value = {
        status: 'resolving',
        done: 0,
        total: 3,
        mixUrl: 'https://soundcloud.com/demo/other',
      };
    },
    like: () => {
      state.likeState.value = {
        status: 'liking',
        playlistId: 'Q',
        done: 0,
        total: 3,
      };
    },
  };

  for (const other of ['sync', 'create', 'like'] as const) {
    it(`Check on Spotify refuses while ${other} runs, inline`, async () => {
      running[other]();
      await state.startSpotifyCheck();
      expect(mocks.get).not.toHaveBeenCalled();
      const s = state.spotifyCheckState.value;
      expect(s.status === 'error' && s.message).toMatch(
        /is reading Spotify: check once it ends\.$/
      );
    });
  }

  for (const other of ['sync', 'check', 'like'] as const) {
    it(`Create playlist refuses while ${other} runs, inline`, async () => {
      running[other]();
      await state.startCreatePlaylist();
      expect(mocks.get).not.toHaveBeenCalled();
      expect(mocks.post).not.toHaveBeenCalled();
      const s = state.createPlaylistState.value;
      expect(s.status === 'error' && s.message).toMatch(
        /is reading Spotify: create the playlist once it ends\.$/
      );
      expect(s.mixUrl).toBe(URL);
    });
  }

  for (const other of ['sync', 'check', 'create'] as const) {
    it(`Like all songs refuses while ${other} runs, inline`, async () => {
      running[other]();
      await state.startLikePlaylist('P');
      expect(mocks.get).not.toHaveBeenCalled();
      const s = state.likeState.value;
      expect(s.status === 'error' && s.message).toMatch(
        /is reading Spotify: like the songs once it ends\.$/
      );
    });
  }

  for (const other of ['check', 'create', 'like'] as const) {
    it(`sync refuses while ${other} runs (a banner, as its refusals are)`, async () => {
      running[other]();
      await state.startSync();
      expect(mocks.get).not.toHaveBeenCalled();
      expect(state.syncState.value.status).toBe('idle');
      expect(state.banner.value?.text).toMatch(
        /is reading Spotify: sync once it ends\.$/
      );
    });
  }

  it('spotifyBusyMessage is null when nothing else reads Spotify', () => {
    expect(state.spotifyBusyMessage('check')).toBeNull();
    running.check();
    expect(state.spotifyBusyMessage('check')).toBeNull();
    expect(state.spotifyBusyMessage('create')).toMatch(/^Check on Spotify/);
  });
});

describe('Create playlist names its mix (S13, B2)', () => {
  beforeEach(async () => {
    const repo = await import('../db/repo');
    vi.mocked(repo.putMix).mockClear();
    state.savedMixes.value = [];
  });

  it('every state of the run carries the mix url', async () => {
    searchAnswers(['One', 'Two']);
    playlistAnswers();
    const seen: (string | undefined)[] = [];
    const stop = state.createPlaylistState.subscribe((s) => {
      if (s.status !== 'idle') seen.push(s.mixUrl);
    });
    await state.startCreatePlaylist();
    stop();
    expect(seen.length).toBeGreaterThan(2);
    expect(new Set(seen)).toEqual(new Set([URL]));
    expect(state.createPlaylistState.value.status).toBe('done');
  });

  it('closing the mix keeps a running create, and resets a finished one', () => {
    state.createPlaylistState.value = { status: 'adding', mixUrl: URL };
    state.closeMix();
    expect(state.createPlaylistState.value.status).toBe('adding');
    state.createPlaylistState.value = {
      status: 'error',
      message: 'x',
      mixUrl: URL,
    };
    state.closeMix();
    expect(state.createPlaylistState.value.status).toBe('idle');
  });
});

describe('the Mix wiring in state.ts (S13, B5)', () => {
  beforeEach(async () => {
    const repo = await import('../db/repo');
    vi.mocked(repo.putMix).mockClear();
    vi.mocked(repo.putMix).mockResolvedValue(undefined);
    vi.mocked(repo.getMixes).mockResolvedValue([]);
    state.savedMixes.value = [];
    state.mixError.value = null;
    state.mixRemoved.value = [];
    state.createChoice.value = null;
  });

  it('Create keeps the check answers already stored for the mix (B3)', async () => {
    const checkedTwo = {
      ...row('Two'),
      spotify: { id: 'S2', url: 'https://open.spotify.com/track/S2' },
      checkedAt: 7,
    };
    // Stored before the tap: Create re-reads it when it ends (N1).
    const repo = await import('../db/repo');
    vi.mocked(repo.getMixes).mockResolvedValue([
      { url: URL, rows: [row('One'), checkedTwo], savedAt: 1 } as never,
    ]);
    searchAnswers(['One', 'Two']);
    playlistAnswers();
    await state.startCreatePlaylist();
    const [saved] = await putMixCalls();
    expect(saved.rows[1]).toMatchObject({
      spotify: { id: 'S2' },
      checkedAt: 7,
    });
    expect(saved.playlistId).toBe('PL');
  });

  it('Validated only adds the validated tracks alone', async () => {
    state.mixRows.value = [{ ...row('One'), validated: true }, row('Two')];
    searchAnswers(['One', 'Two']);
    playlistAnswers();
    await state.startCreatePlaylist();
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.post).toHaveBeenCalledWith('/playlists/PL/items', {
      uris: ['spotify:track:Oneid'],
    });
  });

  it('a check on the open mix saves its answers with the mix', async () => {
    searchAnswers(['One']);
    const flashes = state.mixCheckSaved.value;
    await state.startSpotifyCheck();
    const calls = await putMixCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].rows[0]).toMatchObject({ spotify: { id: 'Oneid' } });
    expect(calls[0].rows[1]).toMatchObject({ spotify: 'not-found' });
    expect(state.mixCheckSaved.value).toBe(flashes + 1);
  });

  it('a check whose mix was closed saves on the saved copy, leaving the mix error alone (B4)', async () => {
    state.savedMixes.value = [
      { url: URL, rows: [row('One'), row('Two')], savedAt: 1 } as never,
    ];
    mocks.get.mockImplementation(async () => {
      state.closeMix();
      state.mixError.value = 'Could not save the mix: B';
      return hit('One');
    });
    await state.startSpotifyCheck();
    const calls = await putMixCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(URL);
    expect(calls[0].rows[0]).toMatchObject({ spotify: { id: 'Oneid' } });
    expect(calls[0].rows[1].spotify).toBeUndefined();
    expect(state.mixError.value).toBe('Could not save the mix: B');
  });

  it('Disconnect during a check writes nothing and shows nothing', async () => {
    mocks.get.mockImplementation(async () => {
      await state.disconnect();
      return hit('One');
    });
    await state.startSpotifyCheck();
    expect(await putMixCalls()).toHaveLength(0);
    expect(state.spotifyCheckState.value.status).toBe('idle');
  });

  it('Save mix keeps the clues, run, request and removed tracks', async () => {
    state.savedMixes.value = [
      {
        url: URL,
        rows: [],
        savedAt: 1,
        clues: { genres: ['techno'] },
        run: { id: 'r1' },
        identifyJobId: 'job-1',
        identifiedAt: 5,
      } as never,
    ];
    state.mixRemoved.value = [{ artist: 'A', title: 'T', isrc: null }];
    expect(await state.saveMix()).toBe(true);
    const [saved] = await putMixCalls();
    expect(saved).toMatchObject({
      clues: { genres: ['techno'] },
      run: { id: 'r1' },
      identifyJobId: 'job-1',
      identifiedAt: 5,
      removed: [{ artist: 'A', title: 'T', isrc: null }],
    });
  });

  it('deleting a scan row puts it in the removed tracks Save mix keeps', async () => {
    state.mixRows.value = [
      { ...row('One'), detected: { artist: 'Scan', title: 'Heard' } },
      row('Two'),
    ];
    state.deleteMixRow(0);
    expect(state.mixRows.value.map((r) => r.title)).toEqual(['Two']);
    await state.saveMix();
    const [saved] = await putMixCalls();
    expect(saved.removed).toEqual([
      { artist: 'Scan', title: 'Heard', isrc: null },
    ]);
  });
});

describe('Create playlist ends without losing the owner (S13 N1, N3)', () => {
  /** putMix and getMixes over one in-memory store, as IndexedDB would. */
  async function memoryStore() {
    const repo = await import('../db/repo');
    const store = new Map<string, unknown>();
    vi.mocked(repo.putMix).mockReset();
    vi.mocked(repo.putMix).mockImplementation(async (row) => {
      store.set(row.url, structuredClone(row));
    });
    vi.mocked(repo.getMixes).mockImplementation(
      async () => [...store.values()] as never
    );
    return store;
  }

  beforeEach(() => {
    state.savedMixes.value = [];
    state.mixError.value = null;
    state.mixRemoved.value = [];
    state.createChoice.value = null;
  });

  it('keeps a validate the owner saved during the run (N1)', async () => {
    const store = await memoryStore();
    searchAnswers(['One', 'Two']);
    mocks.post.mockImplementation(async (path: string) => {
      if (path === '/me/playlists') {
        // The owner validates a track and saves while Create runs.
        state.toggleValidated(1);
        await state.saveMix();
        return {
          id: 'PL',
          external_urls: { spotify: 'https://open.spotify.com/playlist/PL' },
        };
      }
      return {};
    });
    await state.startCreatePlaylist();
    const saved = store.get(URL) as {
      rows: TracklistRow[];
      playlistId: string;
    };
    expect(saved.rows[1].validated).toBe(true);
    expect(saved.playlistId).toBe('PL');
  });

  it('a create for another mix ending leaves the open mix error alone (N3)', async () => {
    await memoryStore();
    searchAnswers(['One', 'Two']);
    mocks.post.mockImplementation(async (path: string) => {
      if (path === '/me/playlists') {
        state.closeMix();
        state.mixError.value = 'Could not save the mix: B';
        return { id: 'PL', external_urls: {} };
      }
      return {};
    });
    await state.startCreatePlaylist();
    expect(state.mixError.value).toBe('Could not save the mix: B');
    expect(state.savedMixes.value.map((m) => m.url)).toEqual([URL]);
  });
});
