import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../spotify/errors';
import {
  AUTHORIZE_URL,
  TOKEN_URL,
  TokenError,
  buildAuthorizeUrl,
  challengeFor,
  exchangeCode,
  randomString,
  refreshTokens,
} from './pkce';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('randomString', () => {
  it('produces the requested length from the unreserved alphabet', () => {
    const s = randomString(64);
    expect(s).toHaveLength(64);
    expect(s).toMatch(/^[A-Za-z0-9\-._~]+$/);
    expect(randomString(64)).not.toBe(s);
  });
});

describe('challengeFor', () => {
  it('matches the RFC 7636 appendix B vector', async () => {
    await expect(
      challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
    ).resolves.toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
});

describe('buildAuthorizeUrl', () => {
  it('includes every PKCE parameter', () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: 'cid',
        redirectUri: 'https://x.test/app/',
        scope: 'user-top-read playlist-read-private',
        state: 'st',
        codeChallenge: 'ch',
      })
    );
    expect(`${url.origin}${url.pathname}`).toBe(AUTHORIZE_URL);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'cid',
      response_type: 'code',
      redirect_uri: 'https://x.test/app/',
      scope: 'user-top-read playlist-read-private',
      state: 'st',
      code_challenge_method: 'S256',
      code_challenge: 'ch',
    });
  });
});

describe('exchangeCode', () => {
  it('posts a form-encoded body and returns the token payload', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({
        access_token: 'at',
        token_type: 'Bearer',
        scope: 's',
        expires_in: 3600,
        refresh_token: 'rt',
      })
    );
    const res = await exchangeCode(
      { clientId: 'cid', code: 'c', redirectUri: 'https://x/', verifier: 'v' },
      fetchFn as unknown as typeof fetch
    );
    expect(res.access_token).toBe('at');
    const [url, init] = fetchFn.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(TOKEN_URL);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded'
    );
    expect(
      Object.fromEntries(new URLSearchParams(init.body as string))
    ).toEqual({
      grant_type: 'authorization_code',
      code: 'c',
      redirect_uri: 'https://x/',
      client_id: 'cid',
      code_verifier: 'v',
    });
  });

  it('throws TokenError with Spotify error code on failure', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(
        { error: 'invalid_grant', error_description: 'Refresh token revoked' },
        400
      )
    );
    await expect(
      refreshTokens(
        { clientId: 'cid', refreshToken: 'old' },
        fetchFn as unknown as typeof fetch
      )
    ).rejects.toMatchObject({
      name: 'TokenError',
      status: 400,
      code: 'invalid_grant',
      message: 'Refresh token revoked',
    });
    expect(new TokenError(400, 'x', 'y')).toBeInstanceOf(Error);
  });
});

describe('refreshTokens', () => {
  it('sends the refresh grant without a secret', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({
        access_token: 'at2',
        token_type: 'Bearer',
        scope: 's',
        expires_in: 3600,
      })
    );
    await refreshTokens(
      { clientId: 'cid', refreshToken: 'rt' },
      fetchFn as unknown as typeof fetch
    );
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(
      Object.fromEntries(new URLSearchParams(init.body as string))
    ).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'rt',
      client_id: 'cid',
    });
    expect(init.headers).not.toHaveProperty('Authorization');
  });

  it('turns an unreachable token endpoint into an offline ApiError', async () => {
    const fetchFn = vi.fn(() => {
      throw new TypeError('Failed to fetch');
    });
    const err = await refreshTokens(
      { clientId: 'cid', refreshToken: 'rt' },
      fetchFn as unknown as typeof fetch
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(0);
    expect((err as ApiError).message).toBe('Network error: Failed to fetch');
  });
});
