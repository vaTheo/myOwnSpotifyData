import { describe, expect, it, vi } from 'vitest';
import { challengeFor } from '../auth/pkce';
import type { ServerClient, ServerResult, ServerTokens } from './client';
import {
  PKCE_KEY,
  SESSION_KEY,
  createServerSessionStore,
  type ServerSession,
} from './session';

class MemoryStorage {
  map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

const ok = <T>(value: T): ServerResult<T> => ({ ok: true, value });
const fail = (
  kind: 'offline' | 'paused' | 'unauthorized' | 'tooLarge' | 'error',
  message: string = kind,
  status?: number
): ServerResult<never> => ({ ok: false, kind, message, status });

function tokens(over: Partial<ServerTokens> = {}): ServerTokens {
  return {
    accessToken: 'a1',
    refreshToken: 'r1',
    expiresAt: 10_000_000,
    email: 'me@example.com',
    ...over,
  };
}

function fakeClient(over: Partial<ServerClient> = {}): ServerClient {
  return {
    requestLink: vi.fn(async () => ok(undefined)),
    exchangeCode: vi.fn(async () => ok(tokens())),
    refresh: vi.fn(async () =>
      ok(tokens({ accessToken: 'a2', refreshToken: 'r2' }))
    ),
    signOut: vi.fn(async () => ok(undefined)),
    select: vi.fn(),
    upsert: vi.fn(),
    remove: vi.fn(),
    rpc: vi.fn(),
    ...over,
  } as unknown as ServerClient;
}

function store(
  client: ServerClient,
  storage = new MemoryStorage(),
  now = () => 1_000_000
) {
  return {
    storage,
    s: createServerSessionStore({
      client,
      storage,
      now,
      redirectUri: () => 'https://app.example/base/',
    }),
  };
}

describe('requestLink', () => {
  it('stores a verifier, sends its S256 challenge and the ?link=server redirect', async () => {
    const client = fakeClient();
    const { s, storage } = store(client);
    const res = await s.requestLink('me@example.com');
    expect(res.ok).toBe(true);
    const saved = JSON.parse(storage.getItem(PKCE_KEY)!) as {
      verifier: string;
    };
    expect(saved.verifier.length).toBeGreaterThanOrEqual(43);
    const call = (client.requestLink as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('me@example.com');
    expect(call[1]).toBe('https://app.example/base/?link=server');
    expect(call[2]).toBe(await challengeFor(saved.verifier));
    expect(s.linkSent.value).toBe('me@example.com');
  });

  it('a 4xx from /otp still reads as sent (generic UI), offline does not', async () => {
    const refused = store(
      fakeClient({
        requestLink: vi.fn(async () =>
          fail('error', 'Signups not allowed for otp', 422)
        ),
      })
    );
    const r1 = await refused.s.requestLink('x@example.com');
    expect(r1.ok).toBe(true);
    expect(refused.s.linkSent.value).toBe('x@example.com');
    const offline = store(
      fakeClient({ requestLink: vi.fn(async () => fail('offline')) })
    );
    const r2 = await offline.s.requestLink('x@example.com');
    expect(r2).toMatchObject({ ok: false, kind: 'offline' });
    expect(offline.s.linkSent.value).toBeNull();
  });
});

describe('completeLink', () => {
  it('exchanges ?link=server&code= with the stored verifier and stores the session', async () => {
    const client = fakeClient();
    const { s, storage } = store(client);
    storage.setItem(PKCE_KEY, JSON.stringify({ verifier: 'v1' }));
    const result = await s.completeLink(
      new URLSearchParams('link=server&code=c1')
    );
    expect(result).toBe('ok');
    expect(client.exchangeCode).toHaveBeenCalledWith('c1', 'v1');
    const saved = JSON.parse(storage.getItem(SESSION_KEY)!) as ServerSession;
    expect(saved).toEqual({
      accessToken: 'a1',
      refreshToken: 'r1',
      expiresAt: 10_000_000,
      email: 'me@example.com',
      // 'a1' is not a JWT: no `sub`, so no id (ADR-13).
      userId: null,
    });
    expect(storage.getItem(PKCE_KEY)).toBeNull();
    expect(s.session.value?.email).toBe('me@example.com');
  });

  it('is none without the marker, even with a code (the Spotify callback)', async () => {
    const client = fakeClient();
    const { s } = store(client);
    expect(
      await s.completeLink(new URLSearchParams('code=spotify&state=x'))
    ).toBe('none');
    expect(client.exchangeCode).not.toHaveBeenCalled();
  });

  it('is invalid without a code, without a verifier, or on a failed exchange; nothing stored', async () => {
    const noCode = store(fakeClient());
    noCode.storage.setItem(PKCE_KEY, JSON.stringify({ verifier: 'v1' }));
    expect(
      await noCode.s.completeLink(new URLSearchParams('link=server'))
    ).toBe('invalid');
    expect(noCode.storage.getItem(SESSION_KEY)).toBeNull();

    const noVerifier = store(fakeClient());
    expect(
      await noVerifier.s.completeLink(new URLSearchParams('link=server&code=c'))
    ).toBe('invalid');
    expect(noVerifier.s.lastError.value).toMatch(/browser that asked/);

    const bad = store(
      fakeClient({
        exchangeCode: vi.fn(async () =>
          fail('error', 'open the link in the browser that asked for it', 400)
        ),
      })
    );
    bad.storage.setItem(PKCE_KEY, JSON.stringify({ verifier: 'v1' }));
    expect(
      await bad.s.completeLink(new URLSearchParams('link=server&code=c'))
    ).toBe('invalid');
    expect(bad.storage.getItem(SESSION_KEY)).toBeNull();
    expect(bad.storage.getItem(PKCE_KEY)).toBeNull();
    expect(bad.s.lastError.value).toMatch(/browser that asked/);
  });
});

describe('getAccessToken', () => {
  const session: ServerSession = {
    accessToken: 'a1',
    refreshToken: 'r1',
    expiresAt: 1_000_000 + 120_000,
    email: 'me@example.com',
    userId: null,
  };

  it('returns the stored token while more than the margin remains', async () => {
    const client = fakeClient();
    const storage = new MemoryStorage();
    storage.setItem(SESSION_KEY, JSON.stringify(session));
    const { s } = store(client, storage);
    expect(await s.getAccessToken()).toEqual({ ok: true, value: 'a1' });
    expect(client.refresh).not.toHaveBeenCalled();
  });

  it('refreshes inside the 60 s margin, once for concurrent callers, and stores the new pair', async () => {
    const client = fakeClient();
    const storage = new MemoryStorage();
    storage.setItem(
      SESSION_KEY,
      JSON.stringify({ ...session, expiresAt: 1_000_000 + 30_000 })
    );
    const { s } = store(client, storage);
    const [t1, t2] = await Promise.all([
      s.getAccessToken(),
      s.getAccessToken(),
    ]);
    expect(t1).toEqual({ ok: true, value: 'a2' });
    expect(t2).toEqual({ ok: true, value: 'a2' });
    expect(client.refresh).toHaveBeenCalledTimes(1);
    expect(client.refresh).toHaveBeenCalledWith('r1');
    expect(JSON.parse(storage.getItem(SESSION_KEY)!)).toMatchObject({
      accessToken: 'a2',
      refreshToken: 'r2',
    });
  });

  it('re-reads storage before refreshing: a newer token from another tab is used as is', async () => {
    const client = fakeClient();
    const storage = new MemoryStorage();
    storage.setItem(
      SESSION_KEY,
      JSON.stringify({ ...session, expiresAt: 1_000_000 + 30_000 })
    );
    const { s } = store(client, storage);
    // Another tab refreshed meanwhile.
    storage.setItem(
      SESSION_KEY,
      JSON.stringify({
        ...session,
        accessToken: 'a-other',
        refreshToken: 'r-other',
        expiresAt: 1_000_000 + 3_600_000,
      })
    );
    expect(await s.getAccessToken()).toEqual({ ok: true, value: 'a-other' });
    expect(client.refresh).not.toHaveBeenCalled();
  });

  it('retries once on "already used" with the token re-read from storage, then signs out', async () => {
    const refresh = vi
      .fn<ServerClient['refresh']>()
      .mockResolvedValueOnce(
        fail('error', 'Invalid Refresh Token: Already Used', 400)
      )
      .mockResolvedValueOnce(
        ok(tokens({ accessToken: 'a3', refreshToken: 'r3' }))
      );
    const client = fakeClient({ refresh });
    const storage = new MemoryStorage();
    storage.setItem(
      SESSION_KEY,
      JSON.stringify({ ...session, expiresAt: 1_000_000 + 30_000 })
    );
    const { s } = store(client, storage);
    expect(await s.getAccessToken()).toEqual({ ok: true, value: 'a3' });
    expect(refresh).toHaveBeenCalledTimes(2);

    const twice = vi
      .fn<ServerClient['refresh']>()
      .mockResolvedValue(
        fail('error', 'Invalid Refresh Token: Already Used', 400)
      );
    const s2 = store(
      fakeClient({ refresh: twice }),
      (() => {
        const m = new MemoryStorage();
        m.setItem(
          SESSION_KEY,
          JSON.stringify({ ...session, expiresAt: 1_000_000 + 30_000 })
        );
        return m;
      })()
    );
    expect(await s2.s.getAccessToken()).toMatchObject({
      ok: false,
      kind: 'unauthorized',
    });
    expect(s2.s.session.value).toBeNull();
    expect(s2.storage.getItem(SESSION_KEY)).toBeNull();
  });

  it('a 401 on refresh clears the session; offline keeps it', async () => {
    const storage = new MemoryStorage();
    storage.setItem(
      SESSION_KEY,
      JSON.stringify({ ...session, expiresAt: 1_000_000 + 30_000 })
    );
    const { s } = store(
      fakeClient({
        refresh: vi.fn(async () => fail('unauthorized', 'expired', 401)),
      }),
      storage
    );
    expect(await s.getAccessToken()).toMatchObject({
      ok: false,
      kind: 'unauthorized',
    });
    expect(s.session.value).toBeNull();

    const storage2 = new MemoryStorage();
    storage2.setItem(
      SESSION_KEY,
      JSON.stringify({ ...session, expiresAt: 1_000_000 + 30_000 })
    );
    const off = store(
      fakeClient({ refresh: vi.fn(async () => fail('offline')) }),
      storage2
    );
    expect(await off.s.getAccessToken()).toMatchObject({
      ok: false,
      kind: 'offline',
    });
    expect(off.s.session.value?.accessToken).toBe('a1');
  });

  it('is unauthorized with no session', async () => {
    const { s } = store(fakeClient());
    expect(await s.getAccessToken()).toMatchObject({
      ok: false,
      kind: 'unauthorized',
    });
  });
});

describe('signOut', () => {
  it('calls /logout and clears both keys even when the call fails', async () => {
    const storage = new MemoryStorage();
    storage.setItem(SESSION_KEY, JSON.stringify(tokens()));
    storage.setItem(PKCE_KEY, JSON.stringify({ verifier: 'v' }));
    const client = fakeClient({ signOut: vi.fn(async () => fail('offline')) });
    const { s } = store(client, storage);
    await s.signOut();
    expect(client.signOut).toHaveBeenCalledWith('a1');
    expect(storage.getItem(SESSION_KEY)).toBeNull();
    expect(storage.getItem(PKCE_KEY)).toBeNull();
    expect(s.session.value).toBeNull();
  });
});

describe('userId (ADR-13)', () => {
  const ID = 'aaaaaaaa-1111-4111-8111-bbbbbbbbbbbb';
  const token = `x.${btoa(JSON.stringify({ sub: ID }))}.y`;

  it('a session stored before this round gets its id from the token, with no call', () => {
    const client = fakeClient();
    const storage = new MemoryStorage();
    storage.setItem(
      SESSION_KEY,
      JSON.stringify({
        accessToken: token,
        refreshToken: 'r',
        expiresAt: 9_999_999,
        email: 'me@example.com',
      })
    );
    const { s } = store(client, storage);
    expect(s.session.value?.userId).toBe(ID);
    expect(client.refresh).not.toHaveBeenCalled();
  });

  describe("a refresh never adopts another person's session (audit Finding 2)", () => {
    const A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
    const B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
    const tokenOf = (id: string, tag: string): string =>
      `${tag}.${btoa(JSON.stringify({ sub: id }))}.y`;
    const expiredA = {
      accessToken: tokenOf(A, 'a1'),
      refreshToken: 'rA',
      expiresAt: 1_000_000 + 30_000,
      email: 'a@example.com',
      userId: A,
    };

    function pinnedToA(refresh = vi.fn<ServerClient['refresh']>()) {
      const storage = new MemoryStorage();
      storage.setItem(SESSION_KEY, JSON.stringify(expiredA));
      const client = fakeClient({ refresh });
      const { s } = store(client, storage);
      return { s, storage, refresh };
    }

    it('same person: a rotated session from another tab is still adopted (S7)', async () => {
      const { s, storage, refresh } = pinnedToA();
      storage.setItem(
        SESSION_KEY,
        JSON.stringify({
          ...expiredA,
          accessToken: tokenOf(A, 'a-other'),
          refreshToken: 'rA2',
          expiresAt: 1_000_000 + 3_600_000,
        })
      );
      expect(await s.getAccessToken()).toEqual({
        ok: true,
        value: tokenOf(A, 'a-other'),
      });
      expect(refresh).not.toHaveBeenCalled();
    });

    it('same person: an expired session is refreshed and stored as before', async () => {
      const refresh = vi.fn<ServerClient['refresh']>(async () =>
        ok(tokens({ accessToken: tokenOf(A, 'a2'), refreshToken: 'rA2' }))
      );
      const { s, storage } = pinnedToA(refresh);
      expect(await s.getAccessToken()).toEqual({
        ok: true,
        value: tokenOf(A, 'a2'),
      });
      expect(refresh).toHaveBeenCalledWith('rA');
      expect(JSON.parse(storage.getItem(SESSION_KEY)!)).toMatchObject({
        refreshToken: 'rA2',
        userId: A,
      });
    });

    it('another person signed in in another tab: refused, nothing called, nothing written', async () => {
      const { s, storage, refresh } = pinnedToA();
      const sessionB = JSON.stringify({
        accessToken: tokenOf(B, 'b1'),
        refreshToken: 'rB',
        expiresAt: 1_000_000 + 3_600_000,
        email: 'b@example.com',
        userId: B,
      });
      storage.setItem(SESSION_KEY, sessionB);
      expect(await s.getAccessToken()).toEqual({
        ok: false,
        kind: 'unauthorized',
        message: 'The signed-in person changed in another tab. Reload.',
      });
      expect(refresh).not.toHaveBeenCalled();
      expect(storage.getItem(SESSION_KEY)).toBe(sessionB);
      expect(s.session.value?.userId).toBe(A);
    });

    it('another person whose stored token is also stale: never refreshed with their token', async () => {
      const { s, storage, refresh } = pinnedToA();
      const sessionB = JSON.stringify({
        accessToken: tokenOf(B, 'b1'),
        refreshToken: 'rB',
        expiresAt: 1_000_000 + 30_000,
        email: 'b@example.com',
        userId: B,
      });
      storage.setItem(SESSION_KEY, sessionB);
      expect(await s.getAccessToken()).toMatchObject({
        ok: false,
        kind: 'unauthorized',
        message: 'The signed-in person changed in another tab. Reload.',
      });
      expect(refresh).not.toHaveBeenCalled();
      expect(storage.getItem(SESSION_KEY)).toBe(sessionB);
    });

    it('another person found on the "already used" retry: refused, B never refreshed', async () => {
      const sessionB = JSON.stringify({
        accessToken: tokenOf(B, 'b1'),
        refreshToken: 'rB',
        expiresAt: 1_000_000 + 30_000,
        email: 'b@example.com',
        userId: B,
      });
      let storageRef: MemoryStorage | null = null;
      const refresh = vi
        .fn<ServerClient['refresh']>()
        .mockImplementationOnce(async () => {
          storageRef!.setItem(SESSION_KEY, sessionB);
          return fail('error', 'Invalid Refresh Token: Already Used', 400);
        });
      const { s, storage } = pinnedToA(refresh);
      storageRef = storage;
      expect(await s.getAccessToken()).toMatchObject({
        ok: false,
        kind: 'unauthorized',
        message: 'The signed-in person changed in another tab. Reload.',
      });
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(refresh).toHaveBeenCalledWith('rA');
      expect(storage.getItem(SESSION_KEY)).toBe(sessionB);
    });
  });

  it('a token without a valid sub leaves the id null', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      SESSION_KEY,
      JSON.stringify({
        accessToken: 'plain',
        refreshToken: 'r',
        expiresAt: 9_999_999,
        email: 'me@example.com',
      })
    );
    const { s } = store(fakeClient(), storage);
    expect(s.session.value?.userId).toBeNull();
  });
});
