import { describe, expect, it, vi } from 'vitest';
import { AuthError } from '../spotify/errors';
import { challengeFor } from './pkce';
import {
  SCOPES,
  createSessionStore,
  type Session,
  type StorageLike,
} from './session';

class MemoryStorage implements StorageLike {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const NOW = 1_700_000_000_000;

function setup(
  opts: {
    session?: Session;
    pkce?: { verifier: string; state: string };
    responses?: Array<() => Response>;
    clientId?: string;
  } = {}
) {
  const storage = new MemoryStorage();
  if (opts.session) storage.setItem('session', JSON.stringify(opts.session));
  if (opts.pkce) storage.setItem('pkce', JSON.stringify(opts.pkce));
  const responses = opts.responses ?? [];
  const fetchFn = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error('unexpected request');
    return next();
  });
  const navigate = vi.fn();
  const store = createSessionStore({
    storage,
    fetchFn: fetchFn as unknown as typeof fetch,
    now: () => NOW,
    navigate,
    clientId: opts.clientId ?? 'cid',
    redirectUri: () => 'https://x.test/app/',
  });
  return { store, storage, fetchFn, navigate };
}

const live: Session = {
  accessToken: 'at',
  expiresAt: NOW + 3_600_000,
  refreshToken: 'rt',
  scope: SCOPES,
};
const stale: Session = { ...live, expiresAt: NOW + 30_000 };

describe('beginLogin', () => {
  it('stores the verifier and navigates to Spotify with its challenge', async () => {
    const { store, storage, navigate } = setup();
    await store.beginLogin();
    const pkce = JSON.parse(storage.getItem('pkce')!) as {
      verifier: string;
      state: string;
    };
    const url = new URL(navigate.mock.calls[0][0] as string);
    expect(url.searchParams.get('code_challenge')).toBe(
      await challengeFor(pkce.verifier)
    );
    expect(url.searchParams.get('state')).toBe(pkce.state);
    expect(url.searchParams.get('scope')).toBe(SCOPES);
    expect(url.searchParams.get('redirect_uri')).toBe('https://x.test/app/');
    expect(url.searchParams.get('client_id')).toBe('cid');
  });

  it('refuses to start without a client id and says why', async () => {
    const { store, navigate } = setup({ clientId: '' });
    await store.beginLogin();
    expect(navigate).not.toHaveBeenCalled();
    expect(store.lastAuthError.value).toMatch(/VITE_SPOTIFY_CLIENT_ID/);
  });
});

describe('completeLogin', () => {
  it('returns none when the url carries no code', async () => {
    const { store } = setup();
    await expect(store.completeLogin(new URLSearchParams(''))).resolves.toBe(
      'none'
    );
  });

  it('rejects a refused login and drops the verifier', async () => {
    const { store, storage } = setup({ pkce: { verifier: 'v', state: 's' } });
    await expect(
      store.completeLogin(new URLSearchParams('error=access_denied'))
    ).rejects.toMatchObject({ name: 'AuthError', reason: 'denied' });
    expect(storage.getItem('pkce')).toBeNull();
  });

  it('rejects when the verifier is missing or the state differs', async () => {
    const none = setup();
    await expect(
      none.store.completeLogin(new URLSearchParams('code=c&state=s'))
    ).rejects.toMatchObject({ reason: 'verifier' });
    const wrong = setup({ pkce: { verifier: 'v', state: 's' } });
    await expect(
      wrong.store.completeLogin(new URLSearchParams('code=c&state=other'))
    ).rejects.toMatchObject({ reason: 'state' });
  });

  it('exchanges the code and stores the session', async () => {
    const { store, storage, fetchFn } = setup({
      pkce: { verifier: 'v', state: 's' },
      responses: [
        () =>
          json({
            access_token: 'at',
            token_type: 'Bearer',
            scope: SCOPES,
            expires_in: 3600,
            refresh_token: 'rt',
          }),
      ],
    });
    await expect(
      store.completeLogin(new URLSearchParams('code=c&state=s'))
    ).resolves.toBe('ok');
    const body = Object.fromEntries(
      new URLSearchParams(
        (fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1]
          .body as string
      )
    );
    expect(body).toMatchObject({ code: 'c', code_verifier: 'v' });
    expect(store.session.value).toEqual(live);
    expect(JSON.parse(storage.getItem('session')!)).toEqual(live);
    expect(storage.getItem('pkce')).toBeNull();
  });
});

describe('getAccessToken', () => {
  it('rejects when not connected', async () => {
    const { store } = setup();
    await expect(store.getAccessToken()).rejects.toMatchObject({
      reason: 'missing',
    });
  });

  it('returns a live token without a request', async () => {
    const { store, fetchFn } = setup({ session: live });
    await expect(store.getAccessToken()).resolves.toBe('at');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('refreshes a token with under a minute left and keeps the old refresh token', async () => {
    const { store } = setup({
      session: stale,
      responses: [
        () =>
          json({
            access_token: 'at2',
            token_type: 'Bearer',
            scope: SCOPES,
            expires_in: 3600,
          }),
      ],
    });
    await expect(store.getAccessToken()).resolves.toBe('at2');
    expect(store.session.value).toEqual({
      ...live,
      accessToken: 'at2',
      refreshToken: 'rt',
    });
  });

  it('stores a rotated refresh token and refreshes once for concurrent callers', async () => {
    const { store, fetchFn } = setup({
      session: stale,
      responses: [
        () =>
          json({
            access_token: 'at2',
            token_type: 'Bearer',
            scope: SCOPES,
            expires_in: 3600,
            refresh_token: 'rt2',
          }),
      ],
    });
    const [a, b] = await Promise.all([
      store.getAccessToken(),
      store.getAccessToken(true),
    ]);
    expect([a, b]).toEqual(['at2', 'at2']);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(store.session.value?.refreshToken).toBe('rt2');
  });

  it('clears the session on invalid_grant', async () => {
    const { store, storage } = setup({
      session: stale,
      responses: [() => json({ error: 'invalid_grant' }, 400)],
    });
    const err = await store.getAccessToken().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).reason).toBe('expired');
    expect(store.session.value).toBeNull();
    expect(storage.getItem('session')).toBeNull();
    expect(store.lastAuthError.value).toMatch(/expired/);
  });

  it('propagates other token failures without clearing', async () => {
    const { store } = setup({
      session: stale,
      responses: [() => json({ error: 'server_error' }, 500)],
    });
    await expect(store.getAccessToken()).rejects.toMatchObject({
      name: 'TokenError',
    });
    expect(store.session.value).not.toBeNull();
  });
});

describe('logout and clearAll', () => {
  it('logout drops the session, clearAll also drops pkce', () => {
    const { store, storage } = setup({
      session: live,
      pkce: { verifier: 'v', state: 's' },
    });
    store.logout();
    expect(store.session.value).toBeNull();
    expect(storage.getItem('pkce')).not.toBeNull();
    store.clearAll();
    expect(storage.getItem('pkce')).toBeNull();
  });
});
