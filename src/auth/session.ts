import { signal, type Signal } from '@preact/signals';
import { AuthError } from '../spotify/errors';
import {
  TokenError,
  buildAuthorizeUrl,
  challengeFor,
  exchangeCode,
  randomString,
  refreshTokens,
} from './pkce';

export const SCOPES = 'user-top-read playlist-read-private';

const SESSION_KEY = 'session';
const PKCE_KEY = 'pkce';
const REFRESH_MARGIN_MS = 60_000;

export interface Session {
  accessToken: string;
  expiresAt: number;
  refreshToken: string;
  scope: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SessionDeps {
  storage: StorageLike;
  fetchFn: typeof fetch;
  now: () => number;
  navigate: (url: string) => void;
  clientId: string;
  redirectUri: () => string;
}

export interface SessionStore {
  session: Signal<Session | null>;
  lastAuthError: Signal<string | null>;
  beginLogin(): Promise<void>;
  completeLogin(params: URLSearchParams): Promise<'none' | 'ok'>;
  getAccessToken(forceRefresh?: boolean): Promise<string>;
  logout(): void;
  clearAll(): void;
}

interface PkceRecord {
  verifier: string;
  state: string;
}

function readJson<T>(storage: StorageLike, key: string): T | null {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function createSessionStore(deps: SessionDeps): SessionStore {
  const session = signal<Session | null>(
    readJson<Session>(deps.storage, SESSION_KEY)
  );
  const lastAuthError = signal<string | null>(null);
  let refreshing: Promise<string> | null = null;
  /** Bumped whenever the session is cleared, to strand refreshes in flight. */
  let generation = 0;

  function save(next: Session | null): void {
    if (next) {
      deps.storage.setItem(SESSION_KEY, JSON.stringify(next));
    } else {
      deps.storage.removeItem(SESSION_KEY);
      generation += 1;
      refreshing = null;
    }
    session.value = next;
  }

  async function beginLogin(): Promise<void> {
    if (!deps.clientId) {
      lastAuthError.value =
        'VITE_SPOTIFY_CLIENT_ID is not set. Add it to .env locally, or to the repository secret for the deployed site.';
      return;
    }
    const record: PkceRecord = {
      verifier: randomString(64),
      state: randomString(16),
    };
    deps.storage.setItem(PKCE_KEY, JSON.stringify(record));
    deps.navigate(
      buildAuthorizeUrl({
        clientId: deps.clientId,
        redirectUri: deps.redirectUri(),
        scope: SCOPES,
        state: record.state,
        codeChallenge: await challengeFor(record.verifier),
      })
    );
  }

  async function completeLogin(
    params: URLSearchParams
  ): Promise<'none' | 'ok'> {
    const error = params.get('error');
    if (error) {
      deps.storage.removeItem(PKCE_KEY);
      throw new AuthError('denied', `Spotify refused the login: ${error}`);
    }
    const code = params.get('code');
    if (!code) return 'none';
    const record = readJson<PkceRecord>(deps.storage, PKCE_KEY);
    deps.storage.removeItem(PKCE_KEY);
    if (!record) {
      throw new AuthError(
        'verifier',
        'This login was started in another browser. Start again from here.'
      );
    }
    if (params.get('state') !== record.state) {
      throw new AuthError('state', 'Login state mismatch. Start again.');
    }
    const res = await exchangeCode(
      {
        clientId: deps.clientId,
        code,
        redirectUri: deps.redirectUri(),
        verifier: record.verifier,
      },
      deps.fetchFn
    );
    if (!res.refresh_token) {
      throw new AuthError('missing', 'Spotify did not return a refresh token.');
    }
    save({
      accessToken: res.access_token,
      expiresAt: deps.now() + res.expires_in * 1000,
      refreshToken: res.refresh_token,
      scope: res.scope,
    });
    lastAuthError.value = null;
    return 'ok';
  }

  async function doRefresh(current: Session): Promise<string> {
    const started = generation;
    try {
      const res = await refreshTokens(
        { clientId: deps.clientId, refreshToken: current.refreshToken },
        deps.fetchFn
      );
      if (generation !== started) {
        // Logged out while this refresh was in flight: do not resurrect it.
        throw new AuthError('missing', 'Not connected to Spotify.');
      }
      save({
        accessToken: res.access_token,
        expiresAt: deps.now() + res.expires_in * 1000,
        refreshToken: res.refresh_token ?? current.refreshToken,
        scope: res.scope,
      });
      return res.access_token;
    } catch (err) {
      if (err instanceof TokenError && err.code === 'invalid_grant') {
        save(null);
        const message =
          'Spotify login expired (refresh tokens last six months). Connect again.';
        lastAuthError.value = message;
        throw new AuthError('expired', message);
      }
      throw err;
    }
  }

  function getAccessToken(forceRefresh = false): Promise<string> {
    const current = session.value;
    if (!current) {
      return Promise.reject(
        new AuthError('missing', 'Not connected to Spotify.')
      );
    }
    if (!forceRefresh && current.expiresAt - deps.now() > REFRESH_MARGIN_MS) {
      return Promise.resolve(current.accessToken);
    }
    const started = generation;
    refreshing ??= doRefresh(current).finally(() => {
      if (generation === started) refreshing = null;
    });
    return refreshing;
  }

  function logout(): void {
    save(null);
  }

  function clearAll(): void {
    save(null);
    deps.storage.removeItem(PKCE_KEY);
    lastAuthError.value = null;
  }

  return {
    session,
    lastAuthError,
    beginLogin,
    completeLogin,
    getAccessToken,
    logout,
    clearAll,
  };
}
