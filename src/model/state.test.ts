/**
 * The one Spotify quota lock-out, read by every wrapper that reads Spotify
 * (spec 003 S08d, review round 1, M3): each `start*` refuses inside the lock
 * without a request, and each one remembers a quota answer it meets.
 * The browser edges (the Spotify session, the API client, the server, the
 * database) are replaced, so state.ts runs under Vitest without a browser.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
      completeLink: vi.fn(async () => 'ok'),
      requestLink: vi.fn(async () => ({ ok: true, value: undefined })),
      signOut: vi.fn(async () => undefined),
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
const { serverAuth } = await import('../server/browser');
const { setScopeForTests } = await import('../server/scopeBrowser');
const scope = await import('../server/userScope');

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

  it('adds every identified track, whatever an old validated flag says (round 010)', async () => {
    state.mixRows.value = [
      { ...row('One'), validated: true },
      { ...row('Two'), validated: false },
    ];
    searchAnswers(['One', 'Two']);
    playlistAnswers();
    await state.startCreatePlaylist();
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(mocks.post).toHaveBeenCalledWith('/playlists/PL/items', {
      uris: ['spotify:track:Oneid', 'spotify:track:Twoid'],
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
  });

  it('keeps an edit the owner saved during the run (N1)', async () => {
    const store = await memoryStore();
    searchAnswers(['One', 'Two']);
    mocks.post.mockImplementation(async (path: string) => {
      if (path === '/me/playlists') {
        // The owner edits a track and saves while Create runs.
        state.editMixRow(1, { artist: 'Artist', title: 'Two', label: 'Warp' });
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
    expect(saved.rows[1].label).toBe('Warp');
    expect(saved.playlistId).toBe('PL');
  });

  /** Search finds every title; `dates` gives the album's release date, and
   *  a title in `failOn` makes its search fail (not a quota answer). */
  function datedSearch(dates: Record<string, string>, failOn?: string): void {
    mocks.get.mockImplementation(
      async (_path: string, query?: { q?: string }) => {
        const q = String(query?.q ?? '');
        if (failOn !== undefined && q.includes(failOn))
          throw new Error('Spotify answered 500');
        const t = ['One', 'Two'].find((f) => q.includes(f));
        if (t === undefined) return { tracks: { items: [] } };
        const answer = hit(t);
        const date = dates[t];
        if (date !== undefined)
          (answer.tracks.items[0] as Record<string, unknown>).album = {
            release_date: date,
          };
        return answer;
      }
    );
  }

  /** The open mix as saved before the tap. */
  async function savedBeforeTap(): Promise<Map<string, unknown>> {
    const store = await memoryStore();
    state.mixRows.value = [row('One'), row('Two')];
    expect(await state.saveMix()).toBe(true);
    const repo = await import('../db/repo');
    // An earlier save: the tap comes after it.
    const [first] = vi.mocked(repo.putMix).mock.calls.map((c) => c[0]);
    store.set(URL, { ...structuredClone(first), savedAt: 1 });
    state.savedMixes.value = [{ ...first, savedAt: 1 }];
    vi.mocked(repo.putMix).mockClear();
    return store;
  }

  it('the saved mix holds every row, each added one dated (S13b I3a)', async () => {
    const store = await memoryStore();
    state.mixRows.value = [row('One'), row('Two')];
    datedSearch({ One: '1993-05-17', Two: '2001' });
    playlistAnswers();
    await state.startCreatePlaylist();
    const saved = store.get(URL) as { rows: TracklistRow[] };
    expect(saved.rows.map((r) => r.title)).toEqual(['One', 'Two']);
    expect(saved.rows[0]).toMatchObject({ year: 1993, yearFrom: 'spotify' });
    expect(saved.rows[1]).toMatchObject({ year: 2001, yearFrom: 'spotify' });
    expect(state.mixRows.value[0].year).toBe(1993);
  });

  it('a search failing after a year was learned still saves the year (S13b I3b)', async () => {
    const store = await savedBeforeTap();
    datedSearch({ One: '1993' }, 'Two');
    await state.startCreatePlaylist();
    expect(state.createPlaylistState.value.status).toBe('error');
    expect(mocks.post).not.toHaveBeenCalled();
    const saved = store.get(URL) as { rows: TracklistRow[] };
    expect(saved.rows.map((r) => r.title)).toEqual(['One', 'Two']);
    expect(saved.rows[0]).toMatchObject({ year: 1993, yearFrom: 'spotify' });
    expect(saved.rows[1].year).toBeUndefined();
  });

  it('the same failure after the owner saved during the run keeps the owner copy, dated (S13b I3c, M2)', async () => {
    const store = await savedBeforeTap();
    datedSearch({ One: '1993' }, 'Two');
    const search = mocks.get.getMockImplementation()!;
    mocks.get.mockImplementation(
      async (path: string, query?: { q?: string }) => {
        if (String(query?.q ?? '').includes('Two')) {
          // The owner edits Two, deletes nothing, and saves mid-run.
          state.editMixRow(1, { artist: 'Artist', title: 'Two', label: 'Warp' });
          await state.saveMix();
        }
        return search(path, query);
      }
    );
    await state.startCreatePlaylist();
    const saved = store.get(URL) as { rows: TracklistRow[] };
    expect(saved.rows[1].label).toBe('Warp');
    expect(saved.rows[0]).toMatchObject({ year: 1993, yearFrom: 'spotify' });
  });

  it('the failure save keeps the removed tracks of the tap (S13b M1)', async () => {
    const store = await savedBeforeTap();
    state.mixRows.value = [
      row('One'),
      { ...row('Two'), detected: { artist: 'Scan', title: 'Heard' } },
    ];
    state.deleteMixRow(1);
    datedSearch({ One: '1993' }, 'One-never');
    // One is found and dated; then the playlist creation fails.
    mocks.post.mockRejectedValue(new Error('Spotify answered 500'));
    await state.startCreatePlaylist();
    const saved = store.get(URL) as {
      rows: TracklistRow[];
      removed?: unknown[];
    };
    expect(saved.rows.map((r) => r.title)).toEqual(['One']);
    expect(saved.rows[0].year).toBe(1993);
    expect(saved.removed).toEqual([
      { artist: 'Scan', title: 'Heard', isrc: null },
    ]);
  });

  it('a review saved during a successful run gets the years too (S13b M2)', async () => {
    const store = await memoryStore();
    datedSearch({ One: '1993', Two: '2001' });
    mocks.post.mockImplementation(async (path: string) => {
      if (path === '/me/playlists') {
        state.editMixRow(0, { artist: 'Artist', title: 'One', label: 'Warp' });
        await state.saveMix();
        return {
          id: 'PL',
          external_urls: { spotify: 'https://open.spotify.com/playlist/PL' },
        };
      }
      return {};
    });
    await state.startCreatePlaylist();
    const saved = store.get(URL) as { rows: TracklistRow[] };
    expect(saved.rows[0]).toMatchObject({ label: 'Warp', year: 1993 });
    expect(saved.rows[1]).toMatchObject({ year: 2001, yearFrom: 'spotify' });
    // The open rows show the same years (the edited row is a new object).
    expect(state.mixRows.value.map((r) => r.year)).toEqual([1993, 2001]);
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

/* ---------- ADR-14: the stored server session is the active user ---------- */

describe('activateServerUser', () => {
  const OWNER = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
  const OTHER = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
  const session = serverAuth.session as unknown as {
    value: { userId: string | null; email: string } | null;
  };

  beforeEach(() => {
    map.clear();
    mocks.serverConfigured = true;
    setScopeForTests({ storage, enabled: true });
    vi.mocked(serverAuth.signOut).mockClear();
  });

  afterEach(() => {
    mocks.serverConfigured = false;
    setScopeForTests(null);
    session.value = null;
    state.serverState.value = { status: 'unset' };
  });

  it("claims the owner's pre-update session on first load: no reload, today's names", () => {
    session.value = { userId: OWNER, email: 'me@x.y' };
    expect(state.activateServerUser()).toBe('ok');
    expect(scope.readActive(storage)).toEqual({
      userId: OWNER,
      email: 'me@x.y',
    });
    expect(scope.dbNameFor('spotify-dj', storage, true)).toBe('spotify-dj');
    expect(scope.keyFor('session', storage, true)).toBe('session');
    expect(serverAuth.signOut).not.toHaveBeenCalled();
  });

  it('a session whose token names no account is signed out with a message, never activated', async () => {
    session.value = { userId: null, email: 'me@x.y' };
    // The real signOut clears the card's state: the message must survive it.
    vi.mocked(serverAuth.signOut).mockImplementationOnce(async () => {
      state.serverState.value = { status: 'signedOut' };
    });
    expect(state.activateServerUser()).toBe('invalid');
    expect(scope.readActive(storage)).toBeNull();
    expect(map.size).toBe(0);
    expect(serverAuth.signOut).toHaveBeenCalledTimes(1);
    await vi.waitFor(() =>
      expect(state.serverState.value).toEqual({
        status: 'error',
        message: state.SERVER_NO_USER_MESSAGE,
      })
    );
  });

  it('a localStorage that refuses writes shows an error and signs out, never a blank page', async () => {
    session.value = { userId: OWNER, email: 'me@x.y' };
    setScopeForTests({
      storage: {
        getItem: () => null,
        setItem: () => {
          throw new DOMException('full', 'QuotaExceededError');
        },
        removeItem: () => undefined,
      },
      enabled: true,
    });
    expect(state.activateServerUser()).toBe('invalid');
    expect(serverAuth.signOut).toHaveBeenCalledTimes(1);
    await vi.waitFor(() =>
      expect(state.serverState.value).toEqual({
        status: 'error',
        message:
          'Could not record who is signed in on this device: Local storage is full. Free space on the phone and try again.',
      })
    );
  });

  it("completeServerLink: another user than the page's is 'reload'", async () => {
    scope.activate(storage, { userId: OWNER, email: 'me@x.y' }, true);
    setScopeForTests({ storage, enabled: true }); // the page opened as the owner
    session.value = { userId: OTHER, email: 'b@x.y' };
    await expect(
      state.completeServerLink(new URLSearchParams('link=server&code=c'))
    ).resolves.toBe('reload');
    expect(scope.readActive(storage)?.userId).toBe(OTHER);
  });

  it("completeServerLink: the same user is 'ok', no reload", async () => {
    scope.activate(storage, { userId: OWNER, email: 'me@x.y' }, true);
    setScopeForTests({ storage, enabled: true });
    session.value = { userId: OWNER, email: 'me@x.y' };
    await expect(
      state.completeServerLink(new URLSearchParams('link=server&code=c'))
    ).resolves.toBe('ok');
  });

  it("completeServerLink: a token without sub is 'invalid', signed out, message kept", async () => {
    session.value = { userId: null, email: 'me@x.y' };
    vi.mocked(serverAuth.signOut).mockImplementationOnce(async () => {
      state.serverState.value = { status: 'signedOut' };
    });
    await expect(
      state.completeServerLink(new URLSearchParams('link=server&code=c'))
    ).resolves.toBe('invalid');
    expect(serverAuth.signOut).toHaveBeenCalledTimes(1);
    expect(state.serverState.value).toEqual({
      status: 'error',
      message: state.SERVER_NO_USER_MESSAGE,
    });
    expect(scope.readActive(storage)).toBeNull();
  });

  it('a storage that fails half way through clears the pointer it wrote (never a user without a session)', async () => {
    session.value = { userId: OTHER, email: 'b@x.y' };
    setScopeForTests({
      storage: {
        ...storage,
        setItem: (k: string, v: string) => {
          if (k === scope.DEVICE_USERS_KEY) {
            throw new DOMException('full', 'QuotaExceededError');
          }
          map.set(k, v);
        },
      },
      enabled: true,
    });
    expect(state.activateServerUser()).toBe('invalid');
    expect(scope.readActive(storage)).toBeNull();
    expect(serverAuth.signOut).toHaveBeenCalledTimes(1);
  });

  it('a refused session clears a pointer left by an earlier user', () => {
    scope.activate(storage, { userId: OWNER, email: 'me@x.y' }, true);
    session.value = { userId: null, email: 'me@x.y' };
    expect(state.activateServerUser()).toBe('invalid');
    expect(scope.readActive(storage)).toBeNull();
    // The claim and the people of this device stay.
    expect(map.has(scope.DEVICE_OWNER_KEY)).toBe(true);
    expect(scope.readDeviceUsers(storage)).toHaveLength(1);
  });

  it('is none without a server', () => {
    mocks.serverConfigured = false;
    session.value = { userId: OWNER, email: 'me@x.y' };
    expect(state.activateServerUser()).toBe('none');
    expect(map.size).toBe(0);
  });
});

describe('the sign-in gate (round 011, FR-002)', () => {
  const session = serverAuth.session as unknown as {
    value: { userId: string | null; email: string } | null;
  };

  afterEach(() => {
    mocks.serverConfigured = false;
    session.value = null;
    state.serverState.value = { status: 'unset' };
  });

  it('is required with a server set up and nobody signed in', () => {
    mocks.serverConfigured = true;
    expect(state.serverSignInRequired()).toBe(true);
    session.value = {
      userId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
      email: 'me@x.y',
    };
    expect(state.serverSignInRequired()).toBe(false);
  });

  it('is never required without server settings (FR-008)', () => {
    expect(state.serverSignInRequired()).toBe(false);
  });

  it('a link sent clears an earlier offline notice; a failed one shows why', async () => {
    mocks.serverConfigured = true;
    state.serverState.value = { status: 'offline', message: 'No network.' };
    await state.startServerLink('me@x.y');
    expect(state.serverState.value).toEqual({ status: 'signedOut' });
    vi.mocked(serverAuth.requestLink).mockResolvedValueOnce({
      ok: false,
      kind: 'offline',
      message: 'Still no network.',
    });
    await state.startServerLink('me@x.y');
    expect(state.serverState.value).toEqual({
      status: 'offline',
      message: 'Still no network.',
    });
  });
});

describe('startServerSignOut (round 011 T014)', () => {
  const OWNER = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
  const OTHER = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
  const session = serverAuth.session as unknown as {
    value: { userId: string | null; email: string } | null;
  };
  const reload = vi.fn();
  const ask = vi.fn(() => true);

  beforeEach(async () => {
    map.clear();
    mocks.serverConfigured = true;
    scope.activate(storage, { userId: OWNER, email: 'me@x.y' }, true);
    scope.activate(storage, { userId: OTHER, email: 'b@x.y' }, true);
    map.set('session', 'owner spotify');
    map.set(`session:${OTHER}`, 'other spotify');
    setScopeForTests({ storage, enabled: true });
    session.value = { userId: OTHER, email: 'b@x.y' };
    reload.mockClear();
    ask.mockClear();
    vi.stubGlobal('location', { reload });
    vi.stubGlobal('confirm', ask);
    vi.mocked(serverAuth.signOut).mockReset();
    vi.mocked(serverAuth.signOut).mockImplementation(async () => {
      session.value = null;
    });
    const repo = await import('../db/repo');
    vi.mocked(repo.wipeDb).mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mocks.serverConfigured = false;
    setScopeForTests(null);
    session.value = null;
    state.syncState.value = { status: 'idle' };
    state.serverState.value = { status: 'unset' };
  });

  it('signs out, clears the pointer and reloads; removes nothing else, asks nothing', async () => {
    const repo = await import('../db/repo');
    await state.startServerSignOut();
    expect(serverAuth.signOut).toHaveBeenCalledTimes(1);
    expect(scope.readActive(storage)).toBeNull();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(ask).not.toHaveBeenCalled();
    expect(repo.wipeDb).not.toHaveBeenCalled();
    expect(auth.clearAll).not.toHaveBeenCalled();
    // The device's claim, its people and every user's Spotify keys stay.
    expect(map.has(scope.DEVICE_OWNER_KEY)).toBe(true);
    expect(scope.readDeviceUsers(storage)).toHaveLength(2);
    expect(map.get('session')).toBe('owner spotify');
    expect(map.get(`session:${OTHER}`)).toBe('other spotify');
  });

  it('is refused with a warning while a job runs: nothing signed out, no reload', async () => {
    state.syncState.value = {
      status: 'running',
    } as unknown as typeof state.syncState.value;
    await state.startServerSignOut();
    expect(state.banner.value).toEqual(
      expect.objectContaining({
        text: 'Wait for the current job to finish before signing out.',
      })
    );
    expect(serverAuth.signOut).not.toHaveBeenCalled();
    expect(scope.readActive(storage)?.userId).toBe(OTHER);
    expect(reload).not.toHaveBeenCalled();
  });

  it('a refused sign-out leaves the automatic chain alone', async () => {
    state.syncState.value = {
      status: 'running',
    } as unknown as typeof state.syncState.value;
    const before = { current: null, waiting: ['reach'], failed: [] };
    state.chainView.value = before as unknown as typeof state.chainView.value;
    await state.startServerSignOut();
    expect(state.chainView.value).toBe(before);
  });

  it('is refused while a server push runs: the push keeps its session', async () => {
    const repo = await import('../db/repo');
    let release!: (v: undefined) => void;
    vi.mocked(repo.getMeta).mockImplementationOnce(
      () => new Promise((r) => (release = r))
    );
    const push = state.queueServerPush([]);
    await state.startServerSignOut();
    expect(state.banner.value).toEqual(
      expect.objectContaining({
        text: 'Wait for the current sync to finish before signing out.',
      })
    );
    expect(serverAuth.signOut).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    release(undefined);
    await push;
    // Once the push is done, sign-out goes ahead.
    await state.startServerSignOut();
    expect(serverAuth.signOut).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('a storage that refuses the pointer shows why on the card, no reload', async () => {
    setScopeForTests({
      storage: {
        ...storage,
        removeItem: () => {
          throw new DOMException('denied', 'SecurityError');
        },
      },
      enabled: true,
    });
    await state.startServerSignOut();
    expect(state.serverState.value).toMatchObject({ status: 'error' });
    expect((state.serverState.value as { message: string }).message).toMatch(
      /^Could not sign out on this device: /
    );
    expect(reload).not.toHaveBeenCalled();
  });
});
