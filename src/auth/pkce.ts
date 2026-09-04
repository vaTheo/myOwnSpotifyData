export const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
export const TOKEN_URL = 'https://accounts.spotify.com/api/token';

const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

export function randomString(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

function base64Url(bytes: ArrayBuffer): string {
  let bin = '';
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier)
  );
  return base64Url(digest);
}

export interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  codeChallenge: string;
}

export function buildAuthorizeUrl(p: AuthorizeParams): string {
  const query = new URLSearchParams({
    client_id: p.clientId,
    response_type: 'code',
    redirect_uri: p.redirectUri,
    scope: p.scope,
    state: p.state,
    code_challenge_method: 'S256',
    code_challenge: p.codeChallenge,
  });
  return `${AUTHORIZE_URL}?${query.toString()}`;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token?: string;
}

export class TokenError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    description: string
  ) {
    super(description);
    this.name = 'TokenError';
  }
}

async function postToken(
  body: Record<string, string>,
  fetchFn: typeof fetch
): Promise<TokenResponse> {
  const res = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new TokenError(
      res.status,
      typeof json.error === 'string' ? json.error : 'unknown',
      typeof json.error_description === 'string'
        ? json.error_description
        : `Token request failed with status ${res.status}`
    );
  }
  return json as unknown as TokenResponse;
}

export function exchangeCode(
  p: { clientId: string; code: string; redirectUri: string; verifier: string },
  fetchFn: typeof fetch = (input, init) => fetch(input, init)
): Promise<TokenResponse> {
  return postToken(
    {
      grant_type: 'authorization_code',
      code: p.code,
      redirect_uri: p.redirectUri,
      client_id: p.clientId,
      code_verifier: p.verifier,
    },
    fetchFn
  );
}

export function refreshTokens(
  p: { clientId: string; refreshToken: string },
  fetchFn: typeof fetch = (input, init) => fetch(input, init)
): Promise<TokenResponse> {
  return postToken(
    {
      grant_type: 'refresh_token',
      refresh_token: p.refreshToken,
      client_id: p.clientId,
    },
    fetchFn
  );
}
