/**
 * The browser side of the owner's server (ADR-08): plain `fetch` against a
 * Supabase project's REST gateway (PostgREST) and auth service (GoTrue). Same
 * shape as `spotify/client.ts`: an injected `fetchFn`, and a discriminated
 * result instead of a throw, so a runner can never strand on an exception.
 * No retry loop here: the runners decide what a failure means.
 */

export type ServerFailureKind =
  'offline' | 'paused' | 'unauthorized' | 'tooLarge' | 'error';

export type ServerResult<T> =
  | { ok: true; value: T }
  | { ok: false; kind: ServerFailureKind; message: string; status?: number };

export interface ServerTokens {
  accessToken: string;
  refreshToken: string;
  /** epoch ms */
  expiresAt: number;
  email: string;
}

export interface ServerDeps {
  fetchFn: typeof fetch;
  /** The project URL, no trailing slash. */
  baseUrl: string;
  /** The publishable key: public by design, guarded by Row Level Security. */
  apiKey: string;
  now: () => number;
}

export type Query = Record<string, string>;

export interface ServerClient {
  /** `POST /auth/v1/otp`: a magic link in the PKCE flow (security review S2). */
  requestLink(
    email: string,
    redirectTo: string,
    codeChallenge: string
  ): Promise<ServerResult<void>>;
  /** `POST /auth/v1/token?grant_type=pkce` with the link's code and the stored verifier. */
  exchangeCode(
    authCode: string,
    codeVerifier: string
  ): Promise<ServerResult<ServerTokens>>;
  refresh(refreshToken: string): Promise<ServerResult<ServerTokens>>;
  signOut(accessToken: string): Promise<ServerResult<void>>;
  select<T>(
    table: string,
    query: Query,
    token: string,
    range?: [number, number]
  ): Promise<ServerResult<{ rows: T[]; total: number | null }>>;
  /** `POST` one row with `Prefer: return=representation`; the created row (worker round). */
  insert<T>(
    table: string,
    row: unknown,
    token: string
  ): Promise<ServerResult<T>>;
  /** `PATCH` the rows the filters match, returning them (worker round). */
  update<T>(
    table: string,
    query: Query,
    patch: unknown,
    token: string
  ): Promise<ServerResult<T[]>>;
  /** `POST` with `Prefer: resolution=merge-duplicates`; the rows array is one body. */
  upsert<T>(
    table: string,
    rows: T[],
    token: string
  ): Promise<ServerResult<void>>;
  remove(
    table: string,
    query: Query,
    token: string
  ): Promise<ServerResult<void>>;
  /** `DELETE` the rows the filters match, returning them (queue round). */
  removeReturning<T>(
    table: string,
    query: Query,
    token: string
  ): Promise<ServerResult<T[]>>;
  /** `POST /rpc/<name>` with the arguments as the JSON body (`{}` when absent). */
  rpc<T>(name: string, token: string, args?: unknown): Promise<ServerResult<T>>;
  /**
   * `POST` rows with `Prefer: resolution=ignore-duplicates,return=minimal` and
   * `?on_conflict=<columns>`: an existing row stays as it is (ADR-15).
   */
  insertIgnore(
    table: string,
    rows: unknown[],
    token: string,
    onConflict: string
  ): Promise<ServerResult<void>>;
}

export const MISSING_TABLE_MESSAGE =
  'The server has no tables yet. Apply supabase/migrations/0001_init.sql (see the README).';
export const LINK_BROWSER_MESSAGE =
  'Open the link in the browser that asked for it, within 10 minutes.';

function field(body: unknown, name: string): unknown {
  if (typeof body !== 'object' || body === null) return undefined;
  return (body as Record<string, unknown>)[name];
}

/** The human sentence out of a GoTrue or PostgREST error body. */
function bodyMessage(body: unknown, text: string, status: number): string {
  for (const name of ['msg', 'error_description', 'message', 'hint', 'error']) {
    const value = field(body, name);
    if (typeof value === 'string' && value) return value;
  }
  return text.trim().slice(0, 200) || `HTTP ${status}`;
}

export function createServerClient(deps: ServerDeps): ServerClient {
  const base = deps.baseUrl.replace(/\/+$/, '');

  function url(path: string, query?: Query): string {
    const qs = query ? new URLSearchParams(query).toString() : '';
    return `${base}${path}${qs ? `?${qs}` : ''}`;
  }

  async function call<T>(
    path: string,
    init: RequestInit & { token?: string; range?: [number, number] },
    parse: (res: Response, body: unknown) => T
  ): Promise<ServerResult<T>> {
    const headers: Record<string, string> = {
      apikey: deps.apiKey,
      'Content-Type': 'application/json',
      ...((init.headers as Record<string, string> | undefined) ?? {}),
    };
    if (init.token) headers.Authorization = `Bearer ${init.token}`;
    if (init.range) {
      headers.Range = `${init.range[0]}-${init.range[1]}`;
      headers['Range-Unit'] = 'items';
    }
    let res: Response;
    try {
      res = await deps.fetchFn(path, { ...init, headers });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        kind: 'offline',
        message: `Network error: ${reason}`,
      };
    }
    const text = await res.text().catch(() => '');
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    if (res.ok) {
      try {
        return { ok: true, value: parse(res, body) };
      } catch (err) {
        return {
          ok: false,
          kind: 'error',
          message: `Unexpected answer: ${err instanceof Error ? err.message : String(err)}`,
          status: res.status,
        };
      }
    }
    const status = res.status;
    if (status >= 500) {
      if (/paused/i.test(text)) {
        return {
          ok: false,
          kind: 'paused',
          message:
            'The server project is paused. Resume it from the Supabase dashboard.',
          status,
        };
      }
      return {
        ok: false,
        kind: 'offline',
        message: `Server unavailable (HTTP ${status})`,
        status,
      };
    }
    if (status === 401) {
      return {
        ok: false,
        kind: 'unauthorized',
        message: bodyMessage(body, text, status),
        status,
      };
    }
    if (status === 413) {
      return {
        ok: false,
        kind: 'tooLarge',
        message: 'Batch too large for the server.',
        status,
      };
    }
    if (status === 429) {
      const wait = res.headers.get('Retry-After');
      return {
        ok: false,
        kind: 'error',
        message: wait
          ? `Too many requests. Try again in ${wait} seconds.`
          : 'Too many requests. Try again in a minute.',
        status,
      };
    }
    if (status === 404 && field(body, 'code') === 'PGRST205') {
      return {
        ok: false,
        kind: 'error',
        message: MISSING_TABLE_MESSAGE,
        status,
      };
    }
    return {
      ok: false,
      kind: 'error',
      message: bodyMessage(body, text, status),
      status,
    };
  }

  function tokensOf(body: unknown): ServerTokens {
    const access = field(body, 'access_token');
    const refresh = field(body, 'refresh_token');
    const expiresIn = field(body, 'expires_in');
    if (typeof access !== 'string' || typeof refresh !== 'string') {
      throw new Error('no tokens in the answer');
    }
    const email = field(field(body, 'user'), 'email');
    return {
      accessToken: access,
      refreshToken: refresh,
      expiresAt:
        deps.now() + (typeof expiresIn === 'number' ? expiresIn : 3600) * 1000,
      email: typeof email === 'string' ? email : '',
    };
  }

  function contentTotal(res: Response): number | null {
    const header = res.headers.get('Content-Range');
    if (!header) return null;
    const total = header.split('/')[1];
    if (total === undefined || total === '*') return null;
    const n = Number(total);
    return Number.isFinite(n) ? n : null;
  }

  return {
    requestLink(email, redirectTo, codeChallenge) {
      return call(
        url('/auth/v1/otp', { redirect_to: redirectTo }),
        {
          method: 'POST',
          body: JSON.stringify({
            email,
            create_user: false,
            code_challenge: codeChallenge,
            code_challenge_method: 's256',
          }),
        },
        () => undefined
      );
    },

    async exchangeCode(authCode, codeVerifier) {
      const res = await call(
        url('/auth/v1/token', { grant_type: 'pkce' }),
        {
          method: 'POST',
          body: JSON.stringify({
            auth_code: authCode,
            code_verifier: codeVerifier,
          }),
        },
        (_res, body) => tokensOf(body)
      );
      // A used, expired or foreign code: the one message the owner can act on.
      if (!res.ok && res.kind === 'error' && res.status === 400) {
        return { ...res, message: LINK_BROWSER_MESSAGE };
      }
      return res;
    },

    refresh(refreshToken) {
      return call(
        url('/auth/v1/token', { grant_type: 'refresh_token' }),
        {
          method: 'POST',
          body: JSON.stringify({ refresh_token: refreshToken }),
        },
        (_res, body) => tokensOf(body)
      );
    },

    signOut(accessToken) {
      // scope=local: this browser's session only. GoTrue's default (global)
      // would sign out the user's other devices and the worker (audit F3).
      return call(
        url('/auth/v1/logout', { scope: 'local' }),
        { method: 'POST', token: accessToken },
        () => undefined
      );
    },

    select<T>(
      table: string,
      query: Query,
      token: string,
      range?: [number, number]
    ) {
      return call<{ rows: T[]; total: number | null }>(
        url(`/rest/v1/${table}`, query),
        {
          method: 'GET',
          token,
          range,
          headers: { Prefer: 'count=exact' },
        },
        (res, body) => {
          if (!Array.isArray(body)) throw new Error('not a list');
          return { rows: body as T[], total: contentTotal(res) };
        }
      );
    },

    async insert<T>(table: string, row: unknown, token: string) {
      const res = await call<unknown>(
        url(`/rest/v1/${table}`),
        {
          method: 'POST',
          body: JSON.stringify(row),
          token,
          headers: { Prefer: 'return=representation' },
        },
        (_res, body) => body
      );
      if (!res.ok) return res;
      if (!Array.isArray(res.value) || res.value.length === 0) {
        return {
          ok: false,
          kind: 'error',
          message: 'The server answered without the created row.',
        };
      }
      return { ok: true, value: res.value[0] as T };
    },
    update<T>(table: string, query: Query, patch: unknown, token: string) {
      return call<T[]>(
        url(`/rest/v1/${table}`, query),
        {
          method: 'PATCH',
          body: JSON.stringify(patch),
          token,
          headers: { Prefer: 'return=representation' },
        },
        (_res, body) => (Array.isArray(body) ? (body as T[]) : [])
      );
    },
    upsert(table, rows, token) {
      return call(
        url(`/rest/v1/${table}`),
        {
          method: 'POST',
          token,
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(rows),
        },
        () => undefined
      );
    },

    insertIgnore(table, rows, token, onConflict) {
      return call(
        url(`/rest/v1/${table}`, { on_conflict: onConflict }),
        {
          method: 'POST',
          token,
          headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
          body: JSON.stringify(rows),
        },
        () => undefined
      );
    },

    remove(table, query, token) {
      return call(
        url(`/rest/v1/${table}`, query),
        { method: 'DELETE', token, headers: { Prefer: 'return=minimal' } },
        () => undefined
      );
    },

    removeReturning<T>(table: string, query: Query, token: string) {
      return call<T[]>(
        url(`/rest/v1/${table}`, query),
        {
          method: 'DELETE',
          token,
          headers: { Prefer: 'return=representation' },
        },
        (_res, body) => (Array.isArray(body) ? (body as T[]) : [])
      );
    },

    rpc<T>(name: string, token: string, args?: unknown) {
      return call<T>(
        url(`/rest/v1/rpc/${name}`),
        { method: 'POST', token, body: JSON.stringify(args ?? {}) },
        (_res, body) => body as T
      );
    },
  };
}
