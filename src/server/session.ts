import { signal, type Signal } from '@preact/signals';
import { challengeFor, randomString } from '../auth/pkce';
import type { StorageLike } from '../auth/session';
import {
  LINK_BROWSER_MESSAGE,
  type ServerClient,
  type ServerResult,
} from './client';

/**
 * The owner's server session: a magic link in the PKCE flow (research D3,
 * security review S2). The verifier waits in `localStorage` under PKCE_KEY,
 * the link comes back as `?link=server&code=…`, and the tokens live under
 * SESSION_KEY next to the Spotify session. Never a token in a URL.
 */

export const SESSION_KEY = 'server-session';
export const PKCE_KEY = 'server-pkce';
/** The query marker `main.tsx` branches on; the Spotify callback has none. */
export const LINK_MARKER = 'server';
const REFRESH_MARGIN_MS = 60_000;

export interface ServerSession {
  accessToken: string;
  refreshToken: string;
  /** epoch ms */
  expiresAt: number;
  email: string;
}

export interface ServerSessionStore {
  session: Signal<ServerSession | null>;
  /** The email a link was sent to, for the generic Settings notice. */
  linkSent: Signal<string | null>;
  /** The last sign-in failure the owner can act on, or null. */
  lastError: Signal<string | null>;
  requestLink(email: string): Promise<ServerResult<void>>;
  completeLink(params: URLSearchParams): Promise<'none' | 'ok' | 'invalid'>;
  getAccessToken(): Promise<ServerResult<string>>;
  signOut(): Promise<void>;
}

export interface ServerSessionDeps {
  client: ServerClient;
  storage: StorageLike;
  now: () => number;
  redirectUri: () => string;
}

interface PkceRecord {
  verifier: string;
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

export function createServerSessionStore(
  deps: ServerSessionDeps
): ServerSessionStore {
  const session = signal<ServerSession | null>(
    readJson<ServerSession>(deps.storage, SESSION_KEY)
  );
  const linkSent = signal<string | null>(null);
  const lastError = signal<string | null>(null);
  let refreshing: Promise<ServerResult<string>> | null = null;

  function save(next: ServerSession | null): void {
    if (next) deps.storage.setItem(SESSION_KEY, JSON.stringify(next));
    else deps.storage.removeItem(SESSION_KEY);
    session.value = next;
  }

  function fresh(s: ServerSession): boolean {
    return s.expiresAt - deps.now() > REFRESH_MARGIN_MS;
  }

  async function requestLink(email: string): Promise<ServerResult<void>> {
    lastError.value = null;
    const record: PkceRecord = { verifier: randomString(64) };
    deps.storage.setItem(PKCE_KEY, JSON.stringify(record));
    const res = await deps.client.requestLink(
      email,
      `${deps.redirectUri()}?link=${LINK_MARKER}`,
      await challengeFor(record.verifier)
    );
    // A refused email (signups off, create_user false) reads as sent: the
    // screen must not confirm which address has an account (S5). Only an
    // unreachable server is reported.
    if (!res.ok && (res.kind === 'offline' || res.kind === 'paused')) {
      deps.storage.removeItem(PKCE_KEY);
      return res;
    }
    linkSent.value = email;
    return { ok: true, value: undefined };
  }

  async function completeLink(
    params: URLSearchParams
  ): Promise<'none' | 'ok' | 'invalid'> {
    if (params.get('link') !== LINK_MARKER) return 'none';
    const code = params.get('code');
    const record = readJson<PkceRecord>(deps.storage, PKCE_KEY);
    deps.storage.removeItem(PKCE_KEY);
    if (!code || !record) {
      lastError.value = LINK_BROWSER_MESSAGE;
      return 'invalid';
    }
    const res = await deps.client.exchangeCode(code, record.verifier);
    if (!res.ok) {
      lastError.value = res.message;
      return 'invalid';
    }
    save(res.value);
    lastError.value = null;
    linkSent.value = null;
    return 'ok';
  }

  async function doRefresh(): Promise<ServerResult<string>> {
    // Re-read storage first: another tab may have rotated the pair already,
    // and reusing the old refresh token would revoke the whole family (S7).
    for (let attempt = 0; attempt < 2; attempt++) {
      const current = readJson<ServerSession>(deps.storage, SESSION_KEY);
      if (!current) {
        save(null);
        return {
          ok: false,
          kind: 'unauthorized',
          message: 'Signed out of the server.',
        };
      }
      if (fresh(current)) {
        session.value = current;
        return { ok: true, value: current.accessToken };
      }
      const res = await deps.client.refresh(current.refreshToken);
      if (res.ok) {
        save(res.value);
        return { ok: true, value: res.value.accessToken };
      }
      if (res.kind === 'unauthorized') {
        save(null);
        return res;
      }
      if (res.kind === 'error' && /already used/i.test(res.message)) {
        // Lost the race against another tab: read what it stored and try once.
        continue;
      }
      return res;
    }
    save(null);
    return {
      ok: false,
      kind: 'unauthorized',
      message: 'The server session was used by another browser. Sign in again.',
    };
  }

  function getAccessToken(): Promise<ServerResult<string>> {
    const current = session.value;
    if (!current) {
      return Promise.resolve({
        ok: false,
        kind: 'unauthorized',
        message: 'Not signed in to the server.',
      });
    }
    if (fresh(current))
      return Promise.resolve({ ok: true, value: current.accessToken });
    refreshing ??= doRefresh().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function signOut(): Promise<void> {
    const current = session.value;
    if (current) await deps.client.signOut(current.accessToken);
    save(null);
    deps.storage.removeItem(PKCE_KEY);
    linkSent.value = null;
    lastError.value = null;
  }

  return {
    session,
    linkSent,
    lastError,
    requestLink,
    completeLink,
    getAccessToken,
    signOut,
  };
}
