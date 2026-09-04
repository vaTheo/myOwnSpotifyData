# Spotify DJ Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser-only Preact web app on GitHub Pages that logs into Spotify with PKCE, syncs the owner's own playlists into IndexedDB, imports the Extended Streaming History export for real play counts, and shows top tracks, playlists ranked by plays, and artists ranked by saved tracks.

**Architecture:** One Vite-built static site. Pure, unit-tested cores (PKCE, API client, sync planner, history parser, aggregation) sit behind thin I/O edges (localStorage, fetch, IndexedDB via `idb`, a Web Worker). State is a handful of Preact signals; screens are Preact function components routed by the URL hash.

**Tech Stack:** TypeScript 6.0.x, Vite 8, Preact 10 + @preact/signals, idb 8, fflate 0.8, Vitest 5, fake-indexeddb 6, ESLint 10 flat config, yarn classic, Node 24, GitHub Pages via Actions.

**Spec:** `docs/superpowers/specs/2026-09-04-spotify-dj-webapp-design.md` (authority). Research reference: `docs/superpowers/research/2026-09-04-spotify-platform-research.md`.

## Global Constraints

- Node 24 (`.nvmrc`), yarn classic 1.22. Install with `yarn`. Never `npm install`.
- `typescript` pinned `~6.0.3`. Do not upgrade: `typescript-eslint` 8 supports `<6.1` only.
- `vite` stays an explicit devDependency (Vitest peer, and now used directly).
- ESM everywhere (`"type": "module"`). With `moduleResolution: bundler`, relative imports carry **no** `.js` extension (this reverses the old NodeNext rule; CLAUDE.md is updated in Task 14).
- Prettier: single quotes, semicolons, ES5 trailing commas, 80 columns. Run `yarn format` before each commit.
- Before every commit: `yarn typecheck && yarn lint && yarn test` must pass. `yarn build` must pass in Tasks 1, 11, 12, 13, 14.
- Only the Client ID is configuration: `VITE_SPOTIFY_CLIENT_ID`. Never reference a client secret anywhere.
- Redirect URI is computed at runtime: `location.origin + import.meta.env.BASE_URL`. Vite `base` is `/myOwnSpotifyData/`. Dev is opened at `http://127.0.0.1:5173/myOwnSpotifyData/`, never `localhost`.
- Scopes: exactly `user-top-read playlist-read-private`.
- All Spotify list requests use `limit=50`. One request in flight at a time.
- A play counts when `ms_played >= 30000` and `spotify_track_uri` starts with `spotify:track:`.
- Sync runs only when the user taps Sync. Never on page load.
- Nothing is caught silently: every failure ends in a state signal that a screen renders.
- Commit messages: conventional prefix (`feat:`, `test:`, `chore:`, `docs:`), end with
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu`.
- Do not push. The owner pushes.

## File Structure

| File | Responsibility |
| --- | --- |
| `index.html` | Single page; loads `src/main.tsx`; manifest and icon links |
| `vite.config.ts` | `base`, Vitest `test.include` |
| `public/manifest.webmanifest`, `public/icon-192.png`, `public/icon-512.png` | PWA install on Android |
| `src/vite-env.d.ts` | Types `import.meta.env.VITE_SPOTIFY_CLIENT_ID` |
| `src/env.ts` | `CLIENT_ID`, `redirectUri()` |
| `src/router.ts` | `Route` union, `parseRoute`, `routeHref` (pure) |
| `src/main.tsx` | Boot: finish login from URL, load DB, render `<App/>` |
| `src/app.tsx` | Auth gate, route signal, screen switch, tab bar |
| `src/auth/pkce.ts` | Verifier, S256 challenge, authorize URL, token exchange and refresh (fetch injected) |
| `src/auth/session.ts` | `createSessionStore(deps)`: token persistence, single-flight refresh, login/logout |
| `src/auth/browser.ts` | The app's `auth` instance wired to `localStorage`, `fetch`, `location` |
| `src/spotify/errors.ts` | `ApiError`, `AuthError`, `NotAllowlistedError`, `QuotaError` |
| `src/spotify/types.ts` | The subset of Spotify API objects the app reads |
| `src/spotify/client.ts` | `createClient(deps)`: bearer, 401/429/5xx handling, queue, `paginate` |
| `src/spotify/api.ts` | The app's `api` client instance |
| `src/db/schema.ts` | Row types, `DjDb` schema, store names |
| `src/db/repo.ts` | `openDb`, `wipeDb`, `getAllRows`, `replacePlaylist`, `deletePlaylists`, `putTopItems`, `replacePlays`, `getMeta`, `putMeta` |
| `src/sync/planner.ts` | `selectOwned`, `planSync` (pure) |
| `src/sync/items.ts` | `mapPlaylistItem`, `buildEntries` (pure) |
| `src/sync/runner.ts` | `SyncState`, `runSync(deps, opts)` |
| `src/history/files.ts` | File-name matching, ordering, wrong-package detection (pure) |
| `src/history/records.ts` | `classify`, `PlayAggregator` (pure) |
| `src/history/process.ts` | `processFiles(files, post)`: unzip one entry at a time, parse, aggregate |
| `src/history/import.worker.ts` | Worker entry: runs `processFiles`, posts messages |
| `src/history/importer.ts` | `ImportState`, `ImportSummary`, `runImport(files, deps)` |
| `src/model/normalize.ts` | `normalize`, `nameKey` (pure) |
| `src/model/aggregate.ts` | `Model`, `buildModel`, `playsFor`, `playlistRanking`, `topTracks`, `topArtists`, `artistTracks`, `artistKey` (pure) |
| `src/model/state.ts` | Signals: `model`, `syncState`, `importState`, `lastSyncAt`, `historySummary`, `banner`; `loadFromDb`, `startSync`, `startImport`, `disconnect` |
| `src/ui/*.tsx` | One screen per file: Connect, Top, Playlists, Playlist, Artists, Artist, Import, Settings |
| `src/ui/components/*.tsx` | `Banner`, `Progress`, `SpotifyLink`, `Badge`, `TrackRow`, `Filter`, `Segmented` |
| `src/styles.css` | Mobile-first plain CSS |
| `.github/workflows/ci.yml` | check job + deploy job |

Spec deviations, decided while planning (each is smaller than the spec's version, none changes behaviour):

- The worker file does **not** use `/// <reference lib="webworker" />`: mixing the `webworker` and `DOM` libs in one program produces duplicate-identifier errors. The worker is typed against the DOM lib, which already declares `postMessage(message, options?)` and `onmessage`.
- The `entries` store has no secondary indexes. Per-playlist deletion uses a primary-key range on `[playlistId, position]`; every other lookup happens in memory.
- `history/process.ts` holds the unzip and parse logic so it is unit-testable in Node; `import.worker.ts` is a five-line wrapper.

Execution amendments (rulings made while executing; the committed code is the
authority where it differs from a task's code block below):

- Task 1: the Vite config imports `package.json` with `with { type: 'json' }`
  (Vite warns otherwise). CLAUDE.md received an interim correction right after
  Task 1 so later agents did not read stale NodeNext conventions.
- Task 7: the two internal sentinels in `getItemsPage` are plain `Error`s with
  specific messages (an `ApiError` with status 0 would have been reported as
  "Offline"); a `fields` variant is cached only once a non-empty page proved
  it; one more runner test covers an empty first playlist followed by a
  stripped page; the account-wipe test seeds a track row so it can fail.
- Task 11: `wipeDb(timeoutMs = 5000)` races `deleteDB` against a timer and
  rejects with a "still open in another tab" message when blocked, with a repo
  test; `disconnect()` wipes first and only logs out after success, showing a
  banner on failure.

---

### Task 1: Scaffold the Vite app and the hash router

**Files:**
- Create: `index.html`, `vite.config.ts`, `.prettierignore`, `src/vite-env.d.ts`, `src/env.ts`, `src/main.tsx`, `src/styles.css`, `src/router.ts`
- Modify: `package.json`, `tsconfig.json`, `.env.example` (`eslint.config.js` is unchanged: typescript-eslint's recommended config already lints `.tsx`)
- Delete: `src/index.ts`, `src/config.ts`, `src/config.test.ts`, `tsconfig.build.json`
- Test: `src/router.test.ts`

**Interfaces:**
- Produces: `parseRoute(hash: string): Route`, `routeHref(route: Route): string`, `Route` union; `CLIENT_ID: string`, `redirectUri(): string`.

- [ ] **Step 1: Replace dependencies and scripts**

Run:

```bash
yarn remove tsx
yarn add preact@^10.29.8 @preact/signals@^2.11.2 idb@^8.0.3 fflate@^0.8.3
yarn add -D fake-indexeddb@^6.2.5
```

Then edit `package.json` so the `scripts` block and the typescript pin read exactly:

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "format": "prettier --write .",
    "test": "vitest run"
  },
```

and in `devDependencies` change `"typescript": "^6.0.3"` to `"typescript": "~6.0.3"`. Run `yarn` once more so `yarn.lock` reflects the pin.

- [ ] **Step 2: Delete the Node entry point and its config**

```bash
git rm -q src/index.ts src/config.ts src/config.test.ts tsconfig.build.json
```

- [ ] **Step 3: Write the browser tsconfig**

Replace `tsconfig.json` entirely:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 4: Write the Vite config, env typing and env module**

`vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  base: '/myOwnSpotifyData/',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

`src/vite-env.d.ts`:

```ts
interface ImportMetaEnv {
  readonly VITE_SPOTIFY_CLIENT_ID?: string;
}

/** Injected by Vite `define` from package.json. */
declare const __APP_VERSION__: string;
```

`src/env.ts`:

```ts
export const CLIENT_ID: string = import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? '';

/** The app's own URL, registered verbatim in the Spotify dashboard. */
export function redirectUri(): string {
  return `${location.origin}${import.meta.env.BASE_URL}`;
}
```

`.env.example` (whole file):

```
VITE_SPOTIFY_CLIENT_ID=
```

`.prettierignore` (whole file), so `yarn format` leaves the design documents alone:

```
docs/
```

- [ ] **Step 5: Write index.html, a placeholder main.tsx and an empty stylesheet**

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, viewport-fit=cover"
    />
    <meta name="theme-color" content="#121212" />
    <link rel="manifest" href="manifest.webmanifest" />
    <link rel="icon" href="icon-192.png" />
    <title>DJ Data</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx` (temporary, replaced in Task 11):

```tsx
import { render } from 'preact';
import './styles.css';

render(<p>DJ Data</p>, document.getElementById('app')!);
```

`src/styles.css`: create it empty (one comment line `/* filled in Task 11 */`).

- [ ] **Step 6: Write the failing router test**

`src/router.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseRoute, routeHref } from './router';

describe('parseRoute', () => {
  it('defaults to top for empty or unknown hashes', () => {
    expect(parseRoute('')).toEqual({ name: 'top' });
    expect(parseRoute('#')).toEqual({ name: 'top' });
    expect(parseRoute('#/nope')).toEqual({ name: 'top' });
  });

  it('parses every list screen', () => {
    expect(parseRoute('#/top')).toEqual({ name: 'top' });
    expect(parseRoute('#/playlists')).toEqual({ name: 'playlists' });
    expect(parseRoute('#/artists')).toEqual({ name: 'artists' });
    expect(parseRoute('#/import')).toEqual({ name: 'import' });
    expect(parseRoute('#/settings')).toEqual({ name: 'settings' });
  });

  it('parses detail screens and decodes their ids', () => {
    expect(parseRoute('#/playlist/37i9dQ')).toEqual({
      name: 'playlist',
      id: '37i9dQ',
    });
    expect(parseRoute('#/artist/name%3Adaft%20punk')).toEqual({
      name: 'artist',
      key: 'name:daft punk',
    });
  });

  it('treats a detail route without an id as its list', () => {
    expect(parseRoute('#/playlist/')).toEqual({ name: 'playlists' });
    expect(parseRoute('#/artist')).toEqual({ name: 'artists' });
  });
});

describe('routeHref', () => {
  it('round-trips every route', () => {
    const routes = [
      { name: 'top' },
      { name: 'playlists' },
      { name: 'playlist', id: 'abc' },
      { name: 'artists' },
      { name: 'artist', key: 'name:daft punk' },
      { name: 'import' },
      { name: 'settings' },
    ] as const;
    for (const r of routes) {
      expect(parseRoute(routeHref(r))).toEqual(r);
    }
  });

  it('encodes ids', () => {
    expect(routeHref({ name: 'artist', key: 'name:daft punk' })).toBe(
      '#/artist/name%3Adaft%20punk'
    );
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `yarn test src/router.test.ts`
Expected: FAIL, `Failed to resolve import "./router"`.

- [ ] **Step 8: Implement the router**

`src/router.ts`:

```ts
export type Route =
  | { name: 'top' }
  | { name: 'playlists' }
  | { name: 'playlist'; id: string }
  | { name: 'artists' }
  | { name: 'artist'; key: string }
  | { name: 'import' }
  | { name: 'settings' };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  const [head, ...rest] = path.split('/');
  const tail = rest.join('/');
  switch (head) {
    case 'playlists':
      return { name: 'playlists' };
    case 'playlist':
      return tail
        ? { name: 'playlist', id: decodeURIComponent(tail) }
        : { name: 'playlists' };
    case 'artists':
      return { name: 'artists' };
    case 'artist':
      return tail
        ? { name: 'artist', key: decodeURIComponent(tail) }
        : { name: 'artists' };
    case 'import':
      return { name: 'import' };
    case 'settings':
      return { name: 'settings' };
    default:
      return { name: 'top' };
  }
}

export function routeHref(route: Route): string {
  switch (route.name) {
    case 'playlist':
      return `#/playlist/${encodeURIComponent(route.id)}`;
    case 'artist':
      return `#/artist/${encodeURIComponent(route.key)}`;
    default:
      return `#/${route.name}`;
  }
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `yarn test src/router.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 10: Verify the whole toolchain**

Run: `yarn format && yarn typecheck && yarn lint && yarn test && yarn build`
Expected: all succeed; `dist/index.html` exists and references `/myOwnSpotifyData/assets/...`. If `yarn lint` complains about `index.html` or `dist/`, they are already ignored by `globalIgnores(['dist/', 'coverage/'])`; do not add rules.

Also run `yarn dev` briefly and open `http://127.0.0.1:5173/myOwnSpotifyData/`; the page shows "DJ Data". Stop the server.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + Preact browser app, add hash router

Replaces the Node entry point and secret-based config with a browser-only
build. Removes tsx and the build tsconfig; pins typescript to ~6.0.3.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

---

### Task 2: PKCE helpers

**Files:**
- Create: `src/auth/pkce.ts`
- Test: `src/auth/pkce.test.ts`

**Interfaces:**
- Produces:
  - `randomString(length: number): string`
  - `challengeFor(verifier: string): Promise<string>`
  - `buildAuthorizeUrl(p: AuthorizeParams): string` with `AuthorizeParams = { clientId; redirectUri; scope; state; codeChallenge }`
  - `exchangeCode(p: { clientId; code; redirectUri; verifier }, fetchFn?): Promise<TokenResponse>`
  - `refreshTokens(p: { clientId; refreshToken }, fetchFn?): Promise<TokenResponse>`
  - `TokenResponse = { access_token; token_type; scope; expires_in; refresh_token? }`
  - `class TokenError extends Error { status: number; code: string }`
  - constants `AUTHORIZE_URL`, `TOKEN_URL`

- [ ] **Step 1: Write the failing test**

`src/auth/pkce.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
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
    expect(Object.fromEntries(new URLSearchParams(init.body as string))).toEqual(
      {
        grant_type: 'authorization_code',
        code: 'c',
        redirect_uri: 'https://x/',
        client_id: 'cid',
        code_verifier: 'v',
      }
    );
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
    expect(Object.fromEntries(new URLSearchParams(init.body as string))).toEqual(
      { grant_type: 'refresh_token', refresh_token: 'rt', client_id: 'cid' }
    );
    expect(init.headers).not.toHaveProperty('Authorization');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/auth/pkce.test.ts`
Expected: FAIL, `Failed to resolve import "./pkce"`.

- [ ] **Step 3: Implement pkce.ts**

`src/auth/pkce.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/auth/pkce.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
yarn format && yarn typecheck && yarn lint && yarn test
git add src/auth/pkce.ts src/auth/pkce.test.ts
git commit -m "feat(auth): PKCE helpers with token exchange and refresh

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

---

### Task 3: Spotify errors, API types and the rate-limit-aware client

**Files:**
- Create: `src/spotify/errors.ts`, `src/spotify/types.ts`, `src/spotify/client.ts`
- Test: `src/spotify/client.test.ts`

**Interfaces:**
- Produces:
  - `class ApiError extends Error { status: number; body: unknown }`
  - `class AuthError extends Error { reason: 'missing' | 'expired' | 'state' | 'verifier' | 'denied' }`
  - `class NotAllowlistedError extends Error`
  - `class QuotaError extends Error { retryAt: number }` (epoch ms)
  - API object types: `ApiImage`, `ApiArtistRef`, `ApiTrack`, `ApiEpisode`, `ApiPlayable`, `ApiPlaylistItem`, `ApiPage<T>`, `ApiPlaylistSummary`, `ApiTopArtist`, `ApiProfile`
  - `type Query = Record<string, string | number | undefined>`
  - `interface ClientDeps { fetchFn; getAccessToken(forceRefresh?): Promise<string>; sleep(ms): Promise<void>; now(): number }`
  - `interface SpotifyClient { get<T>(path, query?): Promise<T>; pages<T>(path, query?, limit?): AsyncGenerator<ApiPage<T>> }`
  - `createClient(deps: ClientDeps): SpotifyClient`, `paginate(get, path, query?, limit?)`, `buildUrl(path, query?)`, `PAGE_LIMIT = 50`, `API_BASE`

- [ ] **Step 1: Write errors.ts and types.ts**

`src/spotify/errors.ts`:

```ts
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: unknown = null
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type AuthFailure = 'missing' | 'expired' | 'state' | 'verifier' | 'denied';

export class AuthError extends Error {
  constructor(
    public readonly reason: AuthFailure,
    message: string
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export class NotAllowlistedError extends Error {
  constructor() {
    super(
      "This Spotify account is not in the app's user list. Add it in the Spotify developer dashboard under User Management."
    );
    this.name = 'NotAllowlistedError';
  }
}

export class QuotaError extends Error {
  constructor(public readonly retryAt: number) {
    super('Spotify quota reached');
    this.name = 'QuotaError';
  }
}
```

`src/spotify/types.ts`:

```ts
export interface ApiImage {
  url: string;
  height: number | null;
  width: number | null;
}

export interface ApiArtistRef {
  id: string | null;
  name: string;
}

export interface ApiTrack {
  type?: 'track';
  id: string | null;
  uri: string;
  name: string;
  duration_ms: number;
  artists: ApiArtistRef[];
  album?: { name: string; images?: ApiImage[] };
  external_ids?: { isrc?: string };
  external_urls?: { spotify?: string };
  is_local?: boolean;
}

export interface ApiEpisode {
  type: 'episode';
  id: string;
  uri: string;
  name: string;
}

export type ApiPlayable = ApiTrack | ApiEpisode;

export interface ApiPlaylistItem {
  added_at: string | null;
  is_local?: boolean;
  /** Current field name (since February 2026). */
  item?: ApiPlayable | null;
  /** Legacy field name, still returned by some `fields` filters. */
  track?: ApiPlayable | null;
}

export interface ApiPage<T> {
  items: T[];
  total?: number;
  limit?: number;
  offset?: number;
  next?: string | null;
}

export interface ApiPlaylistSummary {
  id: string;
  name: string;
  snapshot_id: string;
  owner: { id: string };
  collaborative?: boolean;
  images?: ApiImage[] | null;
  items?: { total: number };
  tracks?: { total: number };
  external_urls?: { spotify?: string };
}

export interface ApiTopArtist {
  id: string;
  name: string;
  images?: ApiImage[];
  external_urls?: { spotify?: string };
}

export interface ApiProfile {
  id: string;
  display_name?: string | null;
}
```

- [ ] **Step 2: Write the failing client test**

`src/spotify/client.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { buildUrl, createClient, paginate, type Query } from './client';
import { ApiError, QuotaError } from './errors';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function setup(responses: Array<() => Response | Promise<Response>>) {
  const fetchFn = vi.fn<FetchLike>(async () => {
    const next = responses.shift();
    if (!next) throw new Error('unexpected extra request');
    return next();
  });
  const getAccessToken = vi.fn(async (force?: boolean) =>
    force ? 'fresh' : 'tok'
  );
  const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
  const client = createClient({
    fetchFn: fetchFn as unknown as typeof fetch,
    getAccessToken,
    sleep,
    now: () => 1_000_000,
  });
  return { client, fetchFn, getAccessToken, sleep };
}

function authHeader(fetchFn: ReturnType<typeof vi.fn<FetchLike>>, i: number) {
  const init = fetchFn.mock.calls[i][1] as RequestInit;
  return (init.headers as Record<string, string>).Authorization;
}

describe('buildUrl', () => {
  it('prefixes relative paths and skips undefined query values', () => {
    expect(buildUrl('/me/top/tracks', { limit: 50, fields: undefined })).toBe(
      'https://api.spotify.com/v1/me/top/tracks?limit=50'
    );
  });
  it('passes absolute urls through', () => {
    expect(buildUrl('https://api.spotify.com/v1/x?a=1')).toBe(
      'https://api.spotify.com/v1/x?a=1'
    );
  });
});

describe('createClient', () => {
  it('sends the bearer token and returns parsed JSON', async () => {
    const { client, fetchFn } = setup([() => json({ id: 'me' })]);
    await expect(client.get('/me')).resolves.toEqual({ id: 'me' });
    expect(fetchFn.mock.calls[0][0]).toBe('https://api.spotify.com/v1/me');
    expect(authHeader(fetchFn, 0)).toBe('Bearer tok');
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    const { client, fetchFn, getAccessToken } = setup([
      () => json({}, 401),
      () => json({ ok: true }),
    ]);
    await expect(client.get('/me')).resolves.toEqual({ ok: true });
    expect(getAccessToken).toHaveBeenCalledWith(true);
    expect(authHeader(fetchFn, 1)).toBe('Bearer fresh');
  });

  it('gives up after a second 401', async () => {
    const { client } = setup([() => json({}, 401), () => json({}, 401)]);
    await expect(client.get('/me')).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
    });
  });

  it('waits Retry-After seconds on a plain 429 and retries', async () => {
    const { client, sleep } = setup([
      () => json({}, 429, { 'Retry-After': '3' }),
      () => json({ ok: true }),
    ]);
    await expect(client.get('/me')).resolves.toEqual({ ok: true });
    expect(sleep).toHaveBeenCalledWith(3000);
  });

  it('backs off from 2 s when Retry-After is unreadable', async () => {
    const { client, sleep } = setup([
      () => json({}, 429),
      () => json({}, 429),
      () => json({ ok: true }),
    ]);
    await client.get('/me');
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([2000, 4000]);
  });

  it('throws QuotaError with a 24 h retry when the body says quota', async () => {
    const { client } = setup([
      () => json({ error: { status: 429, reason: 'QUOTA_EXCEEDED' } }, 429),
    ]);
    const err = await client.get('/me').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(QuotaError);
    expect((err as QuotaError).retryAt).toBe(1_000_000 + 86_400_000);
  });

  it('throws QuotaError when Retry-After exceeds five minutes', async () => {
    const { client } = setup([
      () => json({}, 429, { 'Retry-After': '61389' }),
    ]);
    const err = await client.get('/me').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(QuotaError);
    expect((err as QuotaError).retryAt).toBe(1_000_000 + 61_389_000);
  });

  it('retries 5xx three times then fails', async () => {
    const ok = setup([
      () => json({}, 503),
      () => json({}, 502),
      () => json({}, 500),
      () => json({ ok: true }),
    ]);
    await expect(ok.client.get('/me')).resolves.toEqual({ ok: true });
    expect(ok.sleep).toHaveBeenCalledTimes(3);

    const bad = setup([
      () => json({}, 500),
      () => json({}, 500),
      () => json({}, 500),
      () => json({}, 500),
    ]);
    await expect(bad.client.get('/me')).rejects.toMatchObject({
      name: 'ApiError',
      status: 500,
    });
  });

  it('surfaces other errors with the Spotify message', async () => {
    const { client } = setup([
      () => json({ error: { status: 404, message: 'Not found' } }, 404),
    ]);
    await expect(client.get('/playlists/x')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      message: 'Not found',
    });
    expect(new ApiError(0, 'x')).toBeInstanceOf(Error);
  });

  it('runs one request at a time', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { client, fetchFn } = setup([
      () => gate.then(() => json({ n: 1 })),
      () => json({ n: 2 }),
    ]);
    const first = client.get('/a');
    const second = client.get('/b');
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchFn).toHaveBeenCalledTimes(1);
    release();
    await expect(first).resolves.toEqual({ n: 1 });
    await expect(second).resolves.toEqual({ n: 2 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe('paginate', () => {
  it('walks offsets until a short page', async () => {
    const calls: unknown[] = [];
    const get = async <T>(_path: string, query?: Query): Promise<T> => {
      calls.push(query);
      const offset = (query as { offset: number }).offset;
      return { items: offset === 0 ? new Array(50).fill(1) : [1, 2] } as T;
    };
    const pages = [];
    for await (const p of paginate<number>(get, '/x', { a: 'b' }))
      pages.push(p.items.length);
    expect(pages).toEqual([50, 2]);
    expect(calls).toEqual([
      { a: 'b', limit: 50, offset: 0 },
      { a: 'b', limit: 50, offset: 50 },
    ]);
  });

  it('stops when the total is reached', async () => {
    const get = async <T>(): Promise<T> =>
      ({ items: new Array(50).fill(1), total: 50 }) as T;
    let n = 0;
    for await (const page of paginate<number>(get, '/x')) {
      n += page.items.length > 0 ? 1 : 0;
    }
    expect(n).toBe(1);
  });

  it('treats a page without items as the last page', async () => {
    const get = async <T>(): Promise<T> => ({}) as T;
    let n = 0;
    for await (const p of paginate<number>(get, '/x')) {
      n += p.items.length;
    }
    expect(n).toBe(0);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `yarn test src/spotify/client.test.ts`
Expected: FAIL, `Failed to resolve import "./client"`.

- [ ] **Step 4: Implement client.ts**

`src/spotify/client.ts`:

```ts
import { ApiError, QuotaError } from './errors';
import type { ApiPage } from './types';

export const API_BASE = 'https://api.spotify.com/v1';
export const PAGE_LIMIT = 50;

const QUOTA_LOCK_THRESHOLD_S = 300;
const QUOTA_DEFAULT_WAIT_MS = 24 * 60 * 60 * 1000;
const MAX_429_RETRIES = 6;
const MAX_5XX_RETRIES = 3;

export type Query = Record<string, string | number | undefined>;

export interface ClientDeps {
  fetchFn: typeof fetch;
  getAccessToken: (forceRefresh?: boolean) => Promise<string>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

export interface SpotifyClient {
  get<T>(path: string, query?: Query): Promise<T>;
  pages<T>(
    path: string,
    query?: Query,
    limit?: number
  ): AsyncGenerator<ApiPage<T>, void, undefined>;
}

export function buildUrl(path: string, query?: Query): string {
  const url = new URL(path.startsWith('http') ? path : `${API_BASE}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function backoffMs(attempt: number): number {
  return Math.min(2000 * 2 ** (attempt - 1), 60_000);
}

function parseRetryAfter(header: string | null): number | null {
  if (header === null) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function errorField(body: unknown, field: string): unknown {
  if (typeof body !== 'object' || body === null) return undefined;
  const error = (body as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) return undefined;
  return (error as Record<string, unknown>)[field];
}

export async function* paginate<T>(
  get: SpotifyClient['get'],
  path: string,
  query: Query = {},
  limit = PAGE_LIMIT
): AsyncGenerator<ApiPage<T>, void, undefined> {
  for (let offset = 0; ; offset += limit) {
    const page = await get<ApiPage<T>>(path, { ...query, limit, offset });
    const items = Array.isArray(page.items) ? page.items : [];
    yield { ...page, items };
    if (items.length < limit) return;
    if (typeof page.total === 'number' && offset + limit >= page.total) return;
  }
}

export function createClient(deps: ClientDeps): SpotifyClient {
  let chain: Promise<unknown> = Promise.resolve();

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = chain.then(task, task);
    chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  async function request<T>(url: string): Promise<T> {
    let token = await deps.getAccessToken();
    let retried401 = false;
    let attempts429 = 0;
    let attempts5xx = 0;
    for (;;) {
      let res: Response;
      try {
        res = await deps.fetchFn(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (err) {
        attempts5xx += 1;
        if (attempts5xx <= MAX_5XX_RETRIES) {
          await deps.sleep(backoffMs(attempts5xx));
          continue;
        }
        const reason = err instanceof Error ? err.message : String(err);
        throw new ApiError(0, `Network error: ${reason}`);
      }
      if (res.ok) return (await res.json()) as T;
      if (res.status === 401 && !retried401) {
        retried401 = true;
        token = await deps.getAccessToken(true);
        continue;
      }
      if (res.status === 429) {
        const body = await safeJson(res);
        const retryAfterS = parseRetryAfter(res.headers.get('Retry-After'));
        const quota = errorField(body, 'reason') === 'QUOTA_EXCEEDED';
        if (
          quota ||
          (retryAfterS !== null && retryAfterS > QUOTA_LOCK_THRESHOLD_S)
        ) {
          const waitMs =
            retryAfterS !== null ? retryAfterS * 1000 : QUOTA_DEFAULT_WAIT_MS;
          throw new QuotaError(deps.now() + waitMs);
        }
        attempts429 += 1;
        if (attempts429 > MAX_429_RETRIES) {
          throw new ApiError(429, 'Rate limited too many times in a row', body);
        }
        await deps.sleep(
          retryAfterS !== null ? retryAfterS * 1000 : backoffMs(attempts429)
        );
        continue;
      }
      if (res.status >= 500) {
        attempts5xx += 1;
        if (attempts5xx <= MAX_5XX_RETRIES) {
          await deps.sleep(backoffMs(attempts5xx));
          continue;
        }
        throw new ApiError(
          res.status,
          `Spotify server error ${res.status}`,
          await safeJson(res)
        );
      }
      const body = await safeJson(res);
      const message = errorField(body, 'message');
      throw new ApiError(
        res.status,
        typeof message === 'string' ? message : `Spotify error ${res.status}`,
        body
      );
    }
  }

  function get<T>(path: string, query?: Query): Promise<T> {
    return enqueue(() => request<T>(buildUrl(path, query)));
  }

  function pages<T>(
    path: string,
    query?: Query,
    limit?: number
  ): AsyncGenerator<ApiPage<T>, void, undefined> {
    return paginate<T>(get, path, query, limit);
  }

  return { get, pages };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `yarn test src/spotify/client.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 6: Commit**

```bash
yarn format && yarn typecheck && yarn lint && yarn test
git add src/spotify
git commit -m "feat(spotify): API client with 401 refresh, 429 backoff and quota lock-out

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

---

### Task 4: Session store and the app's auth and api instances

**Files:**
- Create: `src/auth/session.ts`, `src/auth/browser.ts`, `src/spotify/api.ts`
- Test: `src/auth/session.test.ts`

**Interfaces:**
- Consumes: Task 2 (`randomString`, `challengeFor`, `buildAuthorizeUrl`, `exchangeCode`, `refreshTokens`, `TokenError`), Task 3 (`AuthError`, `createClient`), Task 1 (`CLIENT_ID`, `redirectUri`).
- Produces:
  - `SCOPES = 'user-top-read playlist-read-private'`
  - `interface Session { accessToken; expiresAt; refreshToken; scope }`
  - `interface StorageLike { getItem; setItem; removeItem }`
  - `interface SessionDeps { storage; fetchFn; now; navigate(url); clientId; redirectUri(): string }`
  - `interface SessionStore { session: Signal<Session|null>; lastAuthError: Signal<string|null>; beginLogin(): Promise<void>; completeLogin(params: URLSearchParams): Promise<'none'|'ok'>; getAccessToken(forceRefresh?): Promise<string>; logout(): void; clearAll(): void }`
  - `createSessionStore(deps): SessionStore`
  - `auth: SessionStore` (browser instance), `api: SpotifyClient` (app instance)

- [ ] **Step 1: Write the failing test**

`src/auth/session.test.ts`:

```ts
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

function setup(opts: {
  session?: Session;
  pkce?: { verifier: string; state: string };
  responses?: Array<() => Response>;
  clientId?: string;
} = {}) {
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
    await expect(
      store.completeLogin(new URLSearchParams(''))
    ).resolves.toBe('none');
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/auth/session.test.ts`
Expected: FAIL, `Failed to resolve import "./session"`.

- [ ] **Step 3: Implement session.ts**

`src/auth/session.ts`:

```ts
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

  function save(next: Session | null): void {
    if (next) deps.storage.setItem(SESSION_KEY, JSON.stringify(next));
    else deps.storage.removeItem(SESSION_KEY);
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
    try {
      const res = await refreshTokens(
        { clientId: deps.clientId, refreshToken: current.refreshToken },
        deps.fetchFn
      );
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
    refreshing ??= doRefresh(current).finally(() => {
      refreshing = null;
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/auth/session.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Wire the browser instances**

`src/auth/browser.ts`:

```ts
import { CLIENT_ID, redirectUri } from '../env';
import { createSessionStore } from './session';

export const auth = createSessionStore({
  storage: localStorage,
  fetchFn: (input, init) => fetch(input, init),
  now: () => Date.now(),
  navigate: (url) => location.assign(url),
  clientId: CLIENT_ID,
  redirectUri,
});
```

`src/spotify/api.ts`:

```ts
import { auth } from '../auth/browser';
import { createClient } from './client';

export const api = createClient({
  fetchFn: (input, init) => fetch(input, init),
  getAccessToken: (force) => auth.getAccessToken(force),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
});
```

- [ ] **Step 6: Commit**

```bash
yarn format && yarn typecheck && yarn lint && yarn test
git add src/auth src/spotify/api.ts
git commit -m "feat(auth): session store with single-flight refresh and app instances

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

---

### Task 5: IndexedDB schema and repository

**Files:**
- Create: `src/db/schema.ts`, `src/db/repo.ts`
- Test: `src/db/repo.test.ts`

**Interfaces:**
- Produces (schema): `ArtistRef`, `PlaylistRow`, `TrackRow`, `EntryRow`, `TopType`, `Period`, `PERIODS`, `TopTrackItem`, `TopArtistItem`, `TopItemsRow`, `topKey(type, period)`, `PlayRow`, `MetaRow`, `AllRows`, `DjDb`, `DB_NAME`, `DB_VERSION`.
- Produces (repo): `openDb()`, `closeDb()`, `wipeDb()`, `getAllRows(): Promise<AllRows>`, `replacePlaylist(playlist, tracks, entries)`, `deletePlaylists(ids)`, `putTopItems(row)`, `replacePlays(rows)`, `getMeta<T>(name): Promise<T | undefined>`, `putMeta(name, value)`.

- [ ] **Step 1: Write schema.ts**

`src/db/schema.ts`:

```ts
import type { DBSchema } from 'idb';

export const DB_NAME = 'spotify-dj';
export const DB_VERSION = 1;

export interface ArtistRef {
  id: string | null;
  name: string;
}

export interface PlaylistRow {
  id: string;
  name: string;
  snapshotId: string;
  itemCount: number;
  imageUrl: string | null;
  spotifyUrl: string | null;
  syncedAt: number;
}

export interface TrackRow {
  /** Spotify track id, or the `spotify:local:` URI for local files. */
  key: string;
  id: string | null;
  uri: string;
  name: string;
  artists: ArtistRef[];
  album: string;
  durationMs: number;
  isrc: string | null;
  spotifyUrl: string | null;
  isLocal: boolean;
}

export interface EntryRow {
  playlistId: string;
  position: number;
  trackKey: string;
  addedAt: string | null;
}

export type TopType = 'tracks' | 'artists';
export type Period = 'short_term' | 'medium_term' | 'long_term';
export const PERIODS: readonly Period[] = [
  'short_term',
  'medium_term',
  'long_term',
];

export interface TopTrackItem {
  rank: number;
  id: string;
  name: string;
  artists: ArtistRef[];
  album: string;
  imageUrl: string | null;
  spotifyUrl: string | null;
}

export interface TopArtistItem {
  rank: number;
  id: string;
  name: string;
  imageUrl: string | null;
  spotifyUrl: string | null;
}

export type TopItemsRow = { key: string; period: Period; fetchedAt: number } & (
  | { type: 'tracks'; items: TopTrackItem[] }
  | { type: 'artists'; items: TopArtistItem[] }
);

export function topKey(type: TopType, period: Period): string {
  return `${type}:${period}`;
}

export interface PlayRow {
  trackId: string;
  plays: number;
  msPlayed: number;
  firstTs: string;
  lastTs: string;
  trackName: string | null;
  artistName: string | null;
}

export interface MetaRow {
  name: string;
  value: unknown;
}

export interface AllRows {
  playlists: PlaylistRow[];
  tracks: TrackRow[];
  entries: EntryRow[];
  topItems: TopItemsRow[];
  plays: PlayRow[];
}

export interface DjDb extends DBSchema {
  playlists: { key: string; value: PlaylistRow };
  tracks: { key: string; value: TrackRow };
  entries: { key: [string, number]; value: EntryRow };
  topItems: { key: string; value: TopItemsRow };
  plays: { key: string; value: PlayRow };
  meta: { key: string; value: MetaRow };
}
```

- [ ] **Step 2: Write the failing repo test**

`src/db/repo.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  deletePlaylists,
  getAllRows,
  getMeta,
  putMeta,
  putTopItems,
  replacePlays,
  replacePlaylist,
  wipeDb,
} from './repo';
import type { EntryRow, PlaylistRow, TrackRow } from './schema';

function playlist(id: string, snapshotId = 's1'): PlaylistRow {
  return {
    id,
    name: `Playlist ${id}`,
    snapshotId,
    itemCount: 2,
    imageUrl: null,
    spotifyUrl: null,
    syncedAt: 1,
  };
}

function track(key: string): TrackRow {
  return {
    key,
    id: key,
    uri: `spotify:track:${key}`,
    name: `Track ${key}`,
    artists: [{ id: 'a1', name: 'Artist' }],
    album: 'Album',
    durationMs: 1000,
    isrc: null,
    spotifyUrl: null,
    isLocal: false,
  };
}

function entries(playlistId: string, keys: string[]): EntryRow[] {
  return keys.map((trackKey, position) => ({
    playlistId,
    position,
    trackKey,
    addedAt: null,
  }));
}

beforeEach(async () => {
  await wipeDb();
});

describe('replacePlaylist', () => {
  it('writes playlist, tracks and entries', async () => {
    await replacePlaylist(
      playlist('p1'),
      [track('t1'), track('t2')],
      entries('p1', ['t1', 't2'])
    );
    const rows = await getAllRows();
    expect(rows.playlists.map((p) => p.id)).toEqual(['p1']);
    expect(rows.tracks.map((t) => t.key).sort()).toEqual(['t1', 't2']);
    expect(rows.entries.map((e) => e.trackKey)).toEqual(['t1', 't2']);
  });

  it('replaces the old entries of the same playlist and keeps other playlists', async () => {
    await replacePlaylist(
      playlist('p1'),
      [track('t1'), track('t2'), track('t3')],
      entries('p1', ['t1', 't2', 't3'])
    );
    await replacePlaylist(playlist('p2'), [track('t9')], entries('p2', ['t9']));
    await replacePlaylist(
      playlist('p1', 's2'),
      [track('t2')],
      entries('p1', ['t2'])
    );
    const rows = await getAllRows();
    expect(
      rows.entries.map((e) => `${e.playlistId}:${e.position}:${e.trackKey}`)
    ).toEqual(['p1:0:t2', 'p2:0:t9']);
    expect(rows.playlists.find((p) => p.id === 'p1')?.snapshotId).toBe('s2');
  });
});

describe('deletePlaylists', () => {
  it('removes the playlist rows and their entries only', async () => {
    await replacePlaylist(playlist('p1'), [track('t1')], entries('p1', ['t1']));
    await replacePlaylist(playlist('p2'), [track('t2')], entries('p2', ['t2']));
    await deletePlaylists(['p1']);
    const rows = await getAllRows();
    expect(rows.playlists.map((p) => p.id)).toEqual(['p2']);
    expect(rows.entries.map((e) => e.playlistId)).toEqual(['p2']);
    await expect(deletePlaylists([])).resolves.toBeUndefined();
  });
});

describe('top items, plays and meta', () => {
  it('stores top lists by key', async () => {
    await putTopItems({
      key: 'tracks:short_term',
      type: 'tracks',
      period: 'short_term',
      fetchedAt: 5,
      items: [],
    });
    await putTopItems({
      key: 'tracks:short_term',
      type: 'tracks',
      period: 'short_term',
      fetchedAt: 6,
      items: [],
    });
    const rows = await getAllRows();
    expect(rows.topItems).toHaveLength(1);
    expect(rows.topItems[0].fetchedAt).toBe(6);
  });

  it('replacePlays clears the previous import', async () => {
    const row = (trackId: string) => ({
      trackId,
      plays: 1,
      msPlayed: 40000,
      firstTs: '2020-01-01T00:00:00Z',
      lastTs: '2020-01-01T00:00:00Z',
      trackName: null,
      artistName: null,
    });
    await replacePlays([row('a'), row('b')]);
    await replacePlays([row('c')]);
    const rows = await getAllRows();
    expect(rows.plays.map((p) => p.trackId)).toEqual(['c']);
  });

  it('round-trips meta values and returns undefined when absent', async () => {
    await expect(getMeta('accountId')).resolves.toBeUndefined();
    await putMeta('accountId', 'me');
    await putMeta('syncState', { status: 'idle' });
    await expect(getMeta<string>('accountId')).resolves.toBe('me');
    await expect(getMeta('syncState')).resolves.toEqual({ status: 'idle' });
  });

  it('wipeDb empties everything', async () => {
    await putMeta('accountId', 'me');
    await wipeDb();
    await expect(getMeta('accountId')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `yarn test src/db/repo.test.ts`
Expected: FAIL, `Failed to resolve import "./repo"`.

- [ ] **Step 4: Implement repo.ts**

`src/db/repo.ts`:

```ts
import { deleteDB, openDB, type IDBPDatabase } from 'idb';
import {
  DB_NAME,
  DB_VERSION,
  type AllRows,
  type DjDb,
  type EntryRow,
  type PlayRow,
  type PlaylistRow,
  type TopItemsRow,
  type TrackRow,
} from './schema';

let dbPromise: Promise<IDBPDatabase<DjDb>> | null = null;

export function openDb(): Promise<IDBPDatabase<DjDb>> {
  dbPromise ??= openDB<DjDb>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('playlists', { keyPath: 'id' });
      db.createObjectStore('tracks', { keyPath: 'key' });
      db.createObjectStore('entries', { keyPath: ['playlistId', 'position'] });
      db.createObjectStore('topItems', { keyPath: 'key' });
      db.createObjectStore('plays', { keyPath: 'trackId' });
      db.createObjectStore('meta', { keyPath: 'name' });
    },
  });
  return dbPromise;
}

export async function closeDb(): Promise<void> {
  const pending = dbPromise;
  dbPromise = null;
  if (pending) (await pending).close();
}

export async function wipeDb(): Promise<void> {
  await closeDb();
  await deleteDB(DB_NAME);
}

function playlistRange(playlistId: string): IDBKeyRange {
  return IDBKeyRange.bound(
    [playlistId, 0],
    [playlistId, Number.MAX_SAFE_INTEGER]
  );
}

export async function getAllRows(): Promise<AllRows> {
  const db = await openDb();
  const tx = db.transaction([
    'playlists',
    'tracks',
    'entries',
    'topItems',
    'plays',
  ]);
  const [playlists, tracks, entries, topItems, plays] = await Promise.all([
    tx.objectStore('playlists').getAll(),
    tx.objectStore('tracks').getAll(),
    tx.objectStore('entries').getAll(),
    tx.objectStore('topItems').getAll(),
    tx.objectStore('plays').getAll(),
  ]);
  await tx.done;
  return { playlists, tracks, entries, topItems, plays };
}

/** Atomically replaces one playlist's entries and upserts its tracks. */
export async function replacePlaylist(
  playlist: PlaylistRow,
  tracks: TrackRow[],
  entries: EntryRow[]
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(['playlists', 'tracks', 'entries'], 'readwrite');
  const entryStore = tx.objectStore('entries');
  const trackStore = tx.objectStore('tracks');
  await Promise.all([
    entryStore.delete(playlistRange(playlist.id)),
    ...tracks.map((t) => trackStore.put(t)),
    ...entries.map((e) => entryStore.put(e)),
    tx.objectStore('playlists').put(playlist),
    tx.done,
  ]);
}

export async function deletePlaylists(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDb();
  const tx = db.transaction(['playlists', 'entries'], 'readwrite');
  await Promise.all([
    ...ids.map((id) => tx.objectStore('playlists').delete(id)),
    ...ids.map((id) => tx.objectStore('entries').delete(playlistRange(id))),
    tx.done,
  ]);
}

export async function putTopItems(row: TopItemsRow): Promise<void> {
  const db = await openDb();
  await db.put('topItems', row);
}

export async function replacePlays(rows: PlayRow[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('plays', 'readwrite');
  const store = tx.objectStore('plays');
  await Promise.all([store.clear(), ...rows.map((r) => store.put(r)), tx.done]);
}

export async function getMeta<T>(name: string): Promise<T | undefined> {
  const db = await openDb();
  const row = await db.get('meta', name);
  return row?.value as T | undefined;
}

export async function putMeta(name: string, value: unknown): Promise<void> {
  const db = await openDb();
  await db.put('meta', { name, value });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `yarn test src/db/repo.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
yarn format && yarn typecheck && yarn lint && yarn test
git add src/db
git commit -m "feat(db): IndexedDB schema and repository with per-playlist atomic replace

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

---

### Task 6: Sync planner and playlist item mapper

**Files:**
- Create: `src/sync/planner.ts`, `src/sync/items.ts`
- Test: `src/sync/planner.test.ts`, `src/sync/items.test.ts`

**Interfaces:**
- Consumes: `PlaylistRow`, `TrackRow`, `EntryRow` (Task 5); `ApiPlaylistSummary`, `ApiPlaylistItem`, `ApiTrack` (Task 3).
- Produces:
  - `type ListedPlaylist = Omit<PlaylistRow, 'syncedAt'>`
  - `selectOwned(items: ReadonlyArray<ApiPlaylistSummary | null | undefined>, meId: string): ListedPlaylist[]`
  - `interface SyncPlan { toDelete: string[]; toFetch: ListedPlaylist[]; unchanged: string[] }`
  - `planSync(listing: ListedPlaylist[], cached: PlaylistRow[], priorityId?: string): SyncPlan`
  - `interface MappedItem { track: TrackRow; addedAt: string | null }`
  - `mapPlaylistItem(raw: ApiPlaylistItem | null | undefined): MappedItem | null`
  - `buildEntries(playlistId: string, mapped: MappedItem[]): { tracks: TrackRow[]; entries: EntryRow[] }`

- [ ] **Step 1: Write the failing planner test**

`src/sync/planner.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { PlaylistRow } from '../db/schema';
import type { ApiPlaylistSummary } from '../spotify/types';
import { planSync, selectOwned, type ListedPlaylist } from './planner';

function api(id: string, owner = 'me', snapshot = 's1'): ApiPlaylistSummary {
  return {
    id,
    name: `P ${id}`,
    snapshot_id: snapshot,
    owner: { id: owner },
    images: [{ url: `https://i/${id}`, height: 1, width: 1 }],
    items: { total: 3 },
    external_urls: { spotify: `https://open.spotify.com/playlist/${id}` },
  };
}

function listed(id: string, snapshotId = 's1'): ListedPlaylist {
  return {
    id,
    name: `P ${id}`,
    snapshotId,
    itemCount: 3,
    imageUrl: null,
    spotifyUrl: null,
  };
}

function cached(id: string, snapshotId = 's1'): PlaylistRow {
  return { ...listed(id, snapshotId), syncedAt: 1 };
}

describe('selectOwned', () => {
  it('keeps playlists owned by me, mapping the fields the app stores', () => {
    const out = selectOwned([api('a'), api('b', 'someone'), null, api('c')], 'me');
    expect(out.map((p) => p.id)).toEqual(['a', 'c']);
    expect(out[0]).toEqual({
      id: 'a',
      name: 'P a',
      snapshotId: 's1',
      itemCount: 3,
      imageUrl: 'https://i/a',
      spotifyUrl: 'https://open.spotify.com/playlist/a',
    });
  });

  it('falls back to tracks.total and tolerates missing optional fields', () => {
    const out = selectOwned(
      [
        {
          id: 'x',
          name: 'X',
          snapshot_id: 's',
          owner: { id: 'me' },
          tracks: { total: 7 },
        },
      ],
      'me'
    );
    expect(out[0]).toMatchObject({ itemCount: 7, imageUrl: null, spotifyUrl: null });
  });
});

describe('planSync', () => {
  it('partitions into delete, fetch and unchanged', () => {
    const plan = planSync(
      [listed('a'), listed('b', 's2'), listed('new')],
      [cached('a'), cached('b'), cached('gone')]
    );
    expect(plan.toDelete).toEqual(['gone']);
    expect(plan.toFetch.map((p) => p.id)).toEqual(['b', 'new']);
    expect(plan.unchanged).toEqual(['a']);
  });

  it('moves the priority playlist to the front when it needs fetching', () => {
    const plan = planSync([listed('a'), listed('b'), listed('c')], [], 'c');
    expect(plan.toFetch.map((p) => p.id)).toEqual(['c', 'a', 'b']);
  });

  it('ignores a priority id that is unchanged or unknown', () => {
    const plan = planSync([listed('a'), listed('b')], [cached('b')], 'b');
    expect(plan.toFetch.map((p) => p.id)).toEqual(['a']);
    expect(planSync([listed('a')], [], 'zzz').toFetch.map((p) => p.id)).toEqual(['a']);
  });
});
```

- [ ] **Step 2: Write the failing items test**

`src/sync/items.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ApiPlaylistItem } from '../spotify/types';
import { buildEntries, mapPlaylistItem } from './items';

const track: ApiPlaylistItem = {
  added_at: '2024-01-01T00:00:00Z',
  is_local: false,
  item: {
    type: 'track',
    id: 't1',
    uri: 'spotify:track:t1',
    name: 'Song',
    duration_ms: 200000,
    artists: [
      { id: 'a1', name: 'Alpha' },
      { id: 'a2', name: 'Beta' },
    ],
    album: { name: 'Album' },
    external_ids: { isrc: 'ISRC1' },
    external_urls: { spotify: 'https://open.spotify.com/track/t1' },
  },
};

describe('mapPlaylistItem', () => {
  it('maps a normal track', () => {
    expect(mapPlaylistItem(track)).toEqual({
      addedAt: '2024-01-01T00:00:00Z',
      track: {
        key: 't1',
        id: 't1',
        uri: 'spotify:track:t1',
        name: 'Song',
        artists: [
          { id: 'a1', name: 'Alpha' },
          { id: 'a2', name: 'Beta' },
        ],
        album: 'Album',
        durationMs: 200000,
        isrc: 'ISRC1',
        spotifyUrl: 'https://open.spotify.com/track/t1',
        isLocal: false,
      },
    });
  });

  it('reads the legacy track field when item is absent', () => {
    expect(mapPlaylistItem({ ...track, item: undefined, track: track.item })?.track.key).toBe('t1');
  });

  it('drops null items and episodes', () => {
    expect(mapPlaylistItem(null)).toBeNull();
    expect(mapPlaylistItem({ added_at: null, item: null })).toBeNull();
    expect(
      mapPlaylistItem({
        added_at: null,
        item: { type: 'episode', id: 'e', uri: 'spotify:episode:e', name: 'Ep' },
      })
    ).toBeNull();
  });

  it('keys local files by uri with null ids and no link', () => {
    const local = mapPlaylistItem({
      added_at: null,
      is_local: true,
      item: {
        type: 'track',
        id: null,
        uri: 'spotify:local:Artist:Album:Title:180',
        name: 'Title',
        duration_ms: 180000,
        artists: [{ id: null, name: 'Artist' }],
        album: { name: 'Album' },
        external_urls: { spotify: 'https://should-be-dropped' },
      },
    });
    expect(local?.track).toMatchObject({
      key: 'spotify:local:Artist:Album:Title:180',
      id: null,
      isLocal: true,
      spotifyUrl: null,
      artists: [{ id: null, name: 'Artist' }],
    });
  });
});

describe('buildEntries', () => {
  it('numbers positions and dedupes tracks', () => {
    const a = mapPlaylistItem(track)!;
    const b = mapPlaylistItem({
      ...track,
      item: { ...track.item!, id: 't2', uri: 'spotify:track:t2' } as never,
    })!;
    const { tracks, entries } = buildEntries('p1', [a, b, a]);
    expect(tracks.map((t) => t.key)).toEqual(['t1', 't2']);
    expect(entries).toEqual([
      { playlistId: 'p1', position: 0, trackKey: 't1', addedAt: a.addedAt },
      { playlistId: 'p1', position: 1, trackKey: 't2', addedAt: b.addedAt },
      { playlistId: 'p1', position: 2, trackKey: 't1', addedAt: a.addedAt },
    ]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `yarn test src/sync`
Expected: FAIL, both files fail to resolve their imports.

- [ ] **Step 4: Implement planner.ts**

`src/sync/planner.ts`:

```ts
import type { PlaylistRow } from '../db/schema';
import type { ApiPlaylistSummary } from '../spotify/types';

export type ListedPlaylist = Omit<PlaylistRow, 'syncedAt'>;

export function selectOwned(
  items: ReadonlyArray<ApiPlaylistSummary | null | undefined>,
  meId: string
): ListedPlaylist[] {
  const out: ListedPlaylist[] = [];
  for (const p of items) {
    if (!p || p.owner?.id !== meId) continue;
    out.push({
      id: p.id,
      name: p.name,
      snapshotId: p.snapshot_id,
      itemCount: p.items?.total ?? p.tracks?.total ?? 0,
      imageUrl: p.images?.[0]?.url ?? null,
      spotifyUrl: p.external_urls?.spotify ?? null,
    });
  }
  return out;
}

export interface SyncPlan {
  toDelete: string[];
  toFetch: ListedPlaylist[];
  unchanged: string[];
}

export function planSync(
  listing: ListedPlaylist[],
  cached: PlaylistRow[],
  priorityId?: string
): SyncPlan {
  const listedIds = new Set(listing.map((p) => p.id));
  const cachedById = new Map(cached.map((p) => [p.id, p]));
  const toDelete = cached.filter((p) => !listedIds.has(p.id)).map((p) => p.id);
  const toFetch: ListedPlaylist[] = [];
  const unchanged: string[] = [];
  for (const p of listing) {
    const c = cachedById.get(p.id);
    if (c && c.snapshotId === p.snapshotId) unchanged.push(p.id);
    else toFetch.push(p);
  }
  if (priorityId) {
    const i = toFetch.findIndex((p) => p.id === priorityId);
    if (i > 0) toFetch.unshift(...toFetch.splice(i, 1));
  }
  return { toDelete, toFetch, unchanged };
}
```

- [ ] **Step 5: Implement items.ts**

`src/sync/items.ts`:

```ts
import type { EntryRow, TrackRow } from '../db/schema';
import type { ApiPlaylistItem, ApiTrack } from '../spotify/types';

export interface MappedItem {
  track: TrackRow;
  addedAt: string | null;
}

export function mapPlaylistItem(
  raw: ApiPlaylistItem | null | undefined
): MappedItem | null {
  if (!raw) return null;
  const item = raw.item ?? raw.track ?? null;
  if (!item || item.type === 'episode') return null;
  const track = item as ApiTrack;
  if (typeof track.uri !== 'string' || typeof track.name !== 'string') {
    return null;
  }
  const isLocal =
    raw.is_local === true ||
    track.is_local === true ||
    track.uri.startsWith('spotify:local:');
  const id = isLocal ? null : (track.id ?? null);
  return {
    addedAt: raw.added_at ?? null,
    track: {
      key: id ?? track.uri,
      id,
      uri: track.uri,
      name: track.name,
      artists: (track.artists ?? []).map((a) => ({
        id: a.id ?? null,
        name: a.name,
      })),
      album: track.album?.name ?? '',
      durationMs: track.duration_ms ?? 0,
      isrc: track.external_ids?.isrc ?? null,
      spotifyUrl: isLocal ? null : (track.external_urls?.spotify ?? null),
      isLocal,
    },
  };
}

export function buildEntries(
  playlistId: string,
  mapped: MappedItem[]
): { tracks: TrackRow[]; entries: EntryRow[] } {
  const tracks = new Map<string, TrackRow>();
  const entries: EntryRow[] = [];
  mapped.forEach((m, position) => {
    tracks.set(m.track.key, m.track);
    entries.push({
      playlistId,
      position,
      trackKey: m.track.key,
      addedAt: m.addedAt,
    });
  });
  return { tracks: [...tracks.values()], entries };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `yarn test src/sync`
Expected: PASS, 10 tests.

- [ ] **Step 7: Commit**

```bash
yarn format && yarn typecheck && yarn lint && yarn test
git add src/sync
git commit -m "feat(sync): playlist diff planner and item mapper

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

---

### Task 7: Sync runner

**Files:**
- Create: `src/sync/runner.ts`
- Modify: `src/db/repo.ts` (add `getPlaylists`), `src/db/repo.test.ts` (one test)
- Test: `src/sync/runner.test.ts`

**Interfaces:**
- Consumes: Task 3 (`SpotifyClient`, `paginate`, `PAGE_LIMIT`, `ApiError`, `AuthError`, `NotAllowlistedError`, `QuotaError`, API types), Task 5 (repo + schema), Task 6 (`selectOwned`, `planSync`, `mapPlaylistItem`, `buildEntries`).
- Produces:
  - `type SyncState = { status: 'idle' } | { status: 'running'; done; total; current: string | null; pending: string[] } | { status: 'locked'; retryAt; pending: string[]; done; total } | { status: 'error'; message; pending: string[]; auth?: true }` (`auth` marks errors that must send the user back to the Connect screen)
  - `interface RunnerDeps { client: SpotifyClient; now(): number; onState(state: SyncState): void; acquireWakeLock?(): Promise<() => Promise<void>> }`
  - `runSync(deps: RunnerDeps, opts?: { priorityId?: string }): Promise<void>` — never throws; reports through `onState` and persists non-running states under meta `syncState`.
  - Meta names: `SYNC_STATE_META = 'syncState'`, `LAST_SYNC_META = 'lastSyncAt'`, `ACCOUNT_META = 'accountId'`.
  - Repo addition: `getPlaylists(): Promise<PlaylistRow[]>`.

- [ ] **Step 1: Add `getPlaylists` to the repo with a test**

Append to `src/db/repo.ts`:

```ts
export async function getPlaylists(): Promise<PlaylistRow[]> {
  const db = await openDb();
  return db.getAll('playlists');
}
```

Add `getPlaylists` to the import list in `src/db/repo.test.ts` and this test inside the `replacePlaylist` describe block:

```ts
  it('getPlaylists lists only playlist rows', async () => {
    await replacePlaylist(playlist('p1'), [track('t1')], entries('p1', ['t1']));
    await expect(getPlaylists()).resolves.toEqual([playlist('p1')]);
  });
```

Run: `yarn test src/db/repo.test.ts` — expected PASS, 8 tests.

- [ ] **Step 2: Write the failing runner test**

`src/sync/runner.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAllRows,
  getMeta,
  putMeta,
  replacePlaylist,
  wipeDb,
} from '../db/repo';
import { paginate, type Query, type SpotifyClient } from '../spotify/client';
import { ApiError, QuotaError } from '../spotify/errors';
import type { ApiPlaylistItem, ApiPlaylistSummary } from '../spotify/types';
import { runSync, type SyncState } from './runner';

type Handler = (query: Query) => unknown;

function fakeClient(routes: Record<string, Handler>) {
  const calls: Array<{ path: string; query: Query }> = [];
  const get = async <T>(path: string, query: Query = {}): Promise<T> => {
    calls.push({ path, query });
    const handler = routes[path];
    if (!handler) throw new ApiError(404, `no route for ${path}`);
    const result = handler(query);
    if (result instanceof Error) throw result;
    return result as T;
  };
  const client: SpotifyClient = {
    get,
    pages: <T>(path: string, query?: Query, limit?: number) =>
      paginate<T>(get, path, query, limit),
  };
  return { client, calls };
}

function summary(
  id: string,
  owner = 'me',
  snapshot = 's1'
): ApiPlaylistSummary {
  return {
    id,
    name: `P ${id}`,
    snapshot_id: snapshot,
    owner: { id: owner },
    items: { total: 0 },
  };
}

function trackItem(id: string): ApiPlaylistItem {
  return {
    added_at: '2024-01-01T00:00:00Z',
    is_local: false,
    item: {
      type: 'track',
      id,
      uri: `spotify:track:${id}`,
      name: `T ${id}`,
      duration_ms: 1000,
      artists: [{ id: 'a1', name: 'A' }],
      album: { name: 'Al' },
    },
  };
}

const localItem: ApiPlaylistItem = {
  added_at: null,
  is_local: true,
  item: {
    type: 'track',
    id: null,
    uri: 'spotify:local:A:Al:Local:100',
    name: 'Local',
    duration_ms: 100000,
    artists: [{ id: null, name: 'A' }],
    album: { name: 'Al' },
  },
};

function page<T>(all: T[], query: Query) {
  const offset = Number(query.offset ?? 0);
  const limit = Number(query.limit ?? 50);
  return { items: all.slice(offset, offset + limit), total: all.length };
}

const p1Items: ApiPlaylistItem[] = [
  ...Array.from({ length: 60 }, (_, i) => trackItem(`t${i}`)),
  { added_at: null, item: null },
  {
    added_at: null,
    item: { type: 'episode', id: 'e', uri: 'spotify:episode:e', name: 'E' },
  },
  localItem,
];

function baseRoutes(
  playlists: ApiPlaylistSummary[],
  items: Record<string, ApiPlaylistItem[]>
): Record<string, Handler> {
  const routes: Record<string, Handler> = {
    '/me': () => ({ id: 'me' }),
    '/me/top/tracks': () => ({
      items: [
        {
          id: 'x',
          uri: 'spotify:track:x',
          name: 'X',
          duration_ms: 1,
          artists: [{ id: 'a1', name: 'A' }],
          album: { name: 'Al', images: [{ url: 'img', height: 1, width: 1 }] },
        },
      ],
    }),
    '/me/top/artists': () => ({ items: [{ id: 'a1', name: 'A' }] }),
    '/me/playlists': (q) => page(playlists, q),
  };
  for (const [id, list] of Object.entries(items)) {
    routes[`/playlists/${id}/items`] = (q) => page(list, q);
  }
  return routes;
}

async function run(
  routes: Record<string, Handler>,
  opts: { priorityId?: string; acquireWakeLock?: () => Promise<() => Promise<void>> } = {}
) {
  const states: SyncState[] = [];
  const { client, calls } = fakeClient(routes);
  await runSync(
    {
      client,
      now: () => 42,
      onState: (s) => states.push(s),
      acquireWakeLock: opts.acquireWakeLock,
    },
    { priorityId: opts.priorityId }
  );
  return { states, calls };
}

const itemCalls = (calls: Array<{ path: string; query: Query }>) =>
  calls.filter((c) => c.path.endsWith('/items'));

beforeEach(async () => {
  await wipeDb();
});

describe('runSync first sync', () => {
  it('stores profile, top lists, owned playlists and their items', async () => {
    const { states, calls } = await run(
      baseRoutes([summary('p1'), summary('other', 'someone'), summary('p2')], {
        p1: p1Items,
        p2: [trackItem('z')],
      })
    );
    expect(states.at(-1)).toEqual({ status: 'idle' });
    const rows = await getAllRows();
    expect(rows.playlists.map((p) => p.id).sort()).toEqual(['p1', 'p2']);
    expect(rows.playlists[0].syncedAt).toBe(42);
    expect(rows.entries.filter((e) => e.playlistId === 'p1')).toHaveLength(61);
    expect(rows.tracks.some((t) => t.isLocal)).toBe(true);
    expect(rows.topItems).toHaveLength(6);
    expect(rows.topItems.find((t) => t.key === 'tracks:short_term')).toMatchObject({
      type: 'tracks',
      items: [{ rank: 1, id: 'x', imageUrl: 'img' }],
    });
    await expect(getMeta('lastSyncAt')).resolves.toBe(42);
    await expect(getMeta('accountId')).resolves.toBe('me');
    await expect(getMeta('syncState')).resolves.toEqual({ status: 'idle' });
    expect(calls.some((c) => c.path === '/playlists/other/items')).toBe(false);
    expect(itemCalls(calls).map((c) => c.query.offset)).toEqual([0, 50, 0]);
    expect(String(itemCalls(calls)[0].query.fields)).toContain('item(');
    const running = states.filter((s) => s.status === 'running');
    expect(running.map((s) => (s.status === 'running' ? s.current : ''))).toContain('P p1');
  });

  it('skips unchanged playlists on the next sync and refetches changed ones', async () => {
    const routes = baseRoutes([summary('p1'), summary('p2')], {
      p1: [trackItem('a')],
      p2: [trackItem('b')],
    });
    await run(routes);
    const second = await run(routes);
    expect(itemCalls(second.calls)).toHaveLength(0);

    const changed = baseRoutes([summary('p1', 'me', 's2')], {
      p1: [trackItem('c')],
    });
    const third = await run(changed);
    expect(itemCalls(third.calls).map((c) => c.path)).toEqual(['/playlists/p1/items']);
    const rows = await getAllRows();
    expect(rows.playlists.map((p) => p.id)).toEqual(['p1']);
    expect(rows.entries.map((e) => e.trackKey)).toEqual(['c']);
  });

  it('fetches the priority playlist first', async () => {
    const { calls } = await run(
      baseRoutes([summary('p1'), summary('p2')], {
        p1: [trackItem('a')],
        p2: [trackItem('b')],
      }),
      { priorityId: 'p2' }
    );
    expect(itemCalls(calls).map((c) => c.path)).toEqual([
      '/playlists/p2/items',
      '/playlists/p1/items',
    ]);
  });
});

describe('runSync resilience', () => {
  it('locks on QuotaError, keeps finished playlists and lists the pending ones', async () => {
    const routes = baseRoutes([summary('p1'), summary('p2')], {
      p1: [trackItem('a')],
    });
    routes['/playlists/p2/items'] = () => new QuotaError(999);
    const { states } = await run(routes);
    expect(states.at(-1)).toEqual({
      status: 'locked',
      retryAt: 999,
      pending: ['p2'],
      done: 1,
      total: 2,
    });
    const rows = await getAllRows();
    expect(rows.playlists.map((p) => p.id)).toEqual(['p1']);
    await expect(getMeta('syncState')).resolves.toMatchObject({ status: 'locked' });
    await expect(getMeta('lastSyncAt')).resolves.toBeUndefined();
  });

  it('falls back through fields variants on 400', async () => {
    const routes = baseRoutes([summary('p1'), summary('p2')], {});
    const handler = (q: Query) =>
      String(q.fields ?? '').includes('item(')
        ? new ApiError(400, 'bad fields')
        : page([trackItem('a')], q);
    routes['/playlists/p1/items'] = handler;
    routes['/playlists/p2/items'] = handler;
    const { states, calls } = await run(routes);
    expect(states.at(-1)).toEqual({ status: 'idle' });
    const fields = itemCalls(calls).map((c) => String(c.query.fields ?? 'none'));
    expect(fields[0]).toContain('item(');
    expect(fields[1]).toContain('track(');
    expect(fields[2]).toContain('track(');
    expect(fields).toHaveLength(3);
  });

  it('falls back when a fields variant strips the playable objects', async () => {
    const routes = baseRoutes([summary('p1'), summary('p2')], {});
    const handler = (q: Query) =>
      String(q.fields ?? '').includes('item(')
        ? page([{ added_at: null, is_local: false }], q)
        : page([trackItem('a')], q);
    routes['/playlists/p1/items'] = handler;
    routes['/playlists/p2/items'] = handler;
    const { states, calls } = await run(routes);
    expect(states.at(-1)).toEqual({ status: 'idle' });
    const variants = itemCalls(calls).map((c) =>
      String(c.query.fields ?? '').includes('item(') ? 'item' : 'track'
    );
    expect(variants).toEqual(['item', 'track', 'track']);
    expect((await getAllRows()).entries).toHaveLength(2);
  });

  it('reports an error state with the message and pending ids', async () => {
    const routes = baseRoutes([summary('p1')], {});
    routes['/playlists/p1/items'] = () => new ApiError(500, 'boom');
    const { states } = await run(routes);
    expect(states.at(-1)).toEqual({
      status: 'error',
      message: 'Spotify error 500: boom',
      pending: ['p1'],
    });
  });

  it('turns a 403 on the profile into the allow-list message', async () => {
    const routes = baseRoutes([], {});
    routes['/me'] = () => new ApiError(403, 'Forbidden');
    const { states } = await run(routes);
    expect(states.at(-1)).toMatchObject({
      status: 'error',
      message: expect.stringContaining('user list'),
      auth: true,
    });
  });

  it('wipes the cache when a different account logs in', async () => {
    await replacePlaylist(
      {
        id: 'old',
        name: 'Old',
        snapshotId: 's',
        itemCount: 0,
        imageUrl: null,
        spotifyUrl: null,
        syncedAt: 1,
      },
      [],
      []
    );
    await putMeta('accountId', 'someone-else');
    await run(baseRoutes([summary('p1')], { p1: [] }));
    const rows = await getAllRows();
    expect(rows.playlists.map((p) => p.id)).toEqual(['p1']);
    await expect(getMeta('accountId')).resolves.toBe('me');
  });

  it('acquires and releases the wake lock even on failure', async () => {
    const release = vi.fn(async () => {});
    const acquireWakeLock = vi.fn(async () => release);
    const routes = baseRoutes([summary('p1')], {});
    routes['/playlists/p1/items'] = () => new ApiError(500, 'boom');
    await run(routes, { acquireWakeLock });
    expect(acquireWakeLock).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `yarn test src/sync/runner.test.ts`
Expected: FAIL, `Failed to resolve import "./runner"`.

- [ ] **Step 4: Implement runner.ts**

`src/sync/runner.ts`:

```ts
import {
  deletePlaylists,
  getMeta,
  getPlaylists,
  putMeta,
  putTopItems,
  replacePlaylist,
  wipeDb,
} from '../db/repo';
import {
  PERIODS,
  topKey,
  type TopArtistItem,
  type TopTrackItem,
} from '../db/schema';
import { PAGE_LIMIT, type SpotifyClient } from '../spotify/client';
import {
  ApiError,
  AuthError,
  NotAllowlistedError,
  QuotaError,
} from '../spotify/errors';
import type {
  ApiPage,
  ApiPlaylistItem,
  ApiPlaylistSummary,
  ApiProfile,
  ApiTopArtist,
  ApiTrack,
} from '../spotify/types';
import { buildEntries, mapPlaylistItem, type MappedItem } from './items';
import { planSync, selectOwned, type ListedPlaylist } from './planner';

export type SyncState =
  | { status: 'idle' }
  | {
      status: 'running';
      done: number;
      total: number;
      current: string | null;
      pending: string[];
    }
  | {
      status: 'locked';
      retryAt: number;
      pending: string[];
      done: number;
      total: number;
    }
  | {
      status: 'error';
      message: string;
      pending: string[];
      /** Set when the user must reconnect (not allow-listed, or login expired). */
      auth?: true;
    };

export const SYNC_STATE_META = 'syncState';
export const LAST_SYNC_META = 'lastSyncAt';
export const ACCOUNT_META = 'accountId';

export interface RunnerDeps {
  client: SpotifyClient;
  now: () => number;
  onState: (state: SyncState) => void;
  /** Optional screen wake lock; resolves to a release function. */
  acquireWakeLock?: () => Promise<() => Promise<void>>;
}

export interface SyncOptions {
  priorityId?: string;
}

const ITEM_FIELDS =
  'total,items(added_at,is_local,item(type,id,uri,name,duration_ms,is_local,external_ids,external_urls,artists(id,name),album(name)))';
const TRACK_FIELDS =
  'total,items(added_at,is_local,track(type,id,uri,name,duration_ms,is_local,external_ids,external_urls,artists(id,name),album(name)))';
const FIELDS_CANDIDATES: ReadonlyArray<string | null> = [
  ITEM_FIELDS,
  TRACK_FIELDS,
  null,
];

function describeError(err: unknown): string {
  if (err instanceof NotAllowlistedError || err instanceof AuthError) {
    return err.message;
  }
  if (err instanceof ApiError && err.status === 0) {
    return 'Offline, showing cached data.';
  }
  if (err instanceof ApiError) return `Spotify error ${err.status}: ${err.message}`;
  if (err instanceof DOMException && err.name === 'QuotaExceededError') {
    return 'Local storage is full. Free space on the phone and try again.';
  }
  return err instanceof Error ? err.message : String(err);
}

function toTopTrack(t: ApiTrack, index: number): TopTrackItem {
  return {
    rank: index + 1,
    id: t.id ?? t.uri,
    name: t.name,
    artists: (t.artists ?? []).map((a) => ({ id: a.id ?? null, name: a.name })),
    album: t.album?.name ?? '',
    imageUrl: t.album?.images?.[0]?.url ?? null,
    spotifyUrl: t.external_urls?.spotify ?? null,
  };
}

function toTopArtist(a: ApiTopArtist, index: number): TopArtistItem {
  return {
    rank: index + 1,
    id: a.id,
    name: a.name,
    imageUrl: a.images?.[0]?.url ?? null,
    spotifyUrl: a.external_urls?.spotify ?? null,
  };
}

async function fetchProfileId(client: SpotifyClient): Promise<string> {
  try {
    return (await client.get<ApiProfile>('/me')).id;
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      throw new NotAllowlistedError();
    }
    throw err;
  }
}

async function fetchTopItems(
  client: SpotifyClient,
  now: () => number
): Promise<void> {
  for (const period of PERIODS) {
    const tracks = await client.get<ApiPage<ApiTrack>>('/me/top/tracks', {
      time_range: period,
      limit: PAGE_LIMIT,
    });
    await putTopItems({
      key: topKey('tracks', period),
      type: 'tracks',
      period,
      fetchedAt: now(),
      items: (tracks.items ?? []).map(toTopTrack),
    });
    const artists = await client.get<ApiPage<ApiTopArtist>>(
      '/me/top/artists',
      { time_range: period, limit: PAGE_LIMIT }
    );
    await putTopItems({
      key: topKey('artists', period),
      type: 'artists',
      period,
      fetchedAt: now(),
      items: (artists.items ?? []).map(toTopArtist),
    });
  }
}

export async function runSync(
  deps: RunnerDeps,
  opts: SyncOptions = {}
): Promise<void> {
  const { client, now, onState } = deps;
  /** undefined = not probed yet; null = request without a fields filter. */
  let fields: string | null | undefined;
  let done = 0;
  let total = 0;
  let pending: string[] = [];

  async function setFinalState(state: SyncState): Promise<void> {
    onState(state);
    await putMeta(SYNC_STATE_META, state);
  }

  function running(current: string | null): void {
    onState({ status: 'running', done, total, current, pending });
  }

  async function getItemsPage(
    playlistId: string,
    offset: number
  ): Promise<ApiPage<ApiPlaylistItem>> {
    const candidates = fields === undefined ? FIELDS_CANDIDATES : [fields];
    let lastError: unknown = null;
    for (const candidate of candidates) {
      try {
        const page = await client.get<ApiPage<ApiPlaylistItem>>(
          `/playlists/${playlistId}/items`,
          { limit: PAGE_LIMIT, offset, fields: candidate ?? undefined }
        );
        if (!Array.isArray(page.items)) {
          lastError = new ApiError(0, 'Playlist items response had no items');
          continue;
        }
        const stripped =
          candidate !== null &&
          page.items.length > 0 &&
          !page.items.some((entry) => entry && ('item' in entry || 'track' in entry));
        if (stripped) {
          lastError = new ApiError(0, 'fields filter dropped the playable objects');
          continue;
        }
        fields = candidate;
        return page;
      } catch (err) {
        if (err instanceof ApiError && err.status === 400) {
          lastError = err;
          continue;
        }
        throw err;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new ApiError(400, 'Could not read playlist items');
  }

  async function fetchAllItems(playlistId: string): Promise<ApiPlaylistItem[]> {
    const out: ApiPlaylistItem[] = [];
    for (let offset = 0; ; offset += PAGE_LIMIT) {
      const page = await getItemsPage(playlistId, offset);
      out.push(...page.items);
      if (page.items.length < PAGE_LIMIT) break;
      if (typeof page.total === 'number' && offset + PAGE_LIMIT >= page.total) {
        break;
      }
    }
    return out;
  }

  const release = deps.acquireWakeLock
    ? await deps.acquireWakeLock().catch(() => null)
    : null;

  try {
    running('Profile');
    const me = await fetchProfileId(client);
    const cachedAccount = await getMeta<string>(ACCOUNT_META);
    if (cachedAccount !== undefined && cachedAccount !== me) await wipeDb();
    await putMeta(ACCOUNT_META, me);

    running('Top tracks and artists');
    await fetchTopItems(client, now);

    running('Playlists');
    const listing: ListedPlaylist[] = [];
    for await (const page of client.pages<ApiPlaylistSummary | null>(
      '/me/playlists'
    )) {
      listing.push(...selectOwned(page.items, me));
    }
    const plan = planSync(listing, await getPlaylists(), opts.priorityId);
    await deletePlaylists(plan.toDelete);
    total = plan.toFetch.length;
    pending = plan.toFetch.map((p) => p.id);

    for (const playlist of plan.toFetch) {
      running(playlist.name);
      const items = await fetchAllItems(playlist.id);
      const mapped = items
        .map(mapPlaylistItem)
        .filter((m): m is MappedItem => m !== null);
      const { tracks, entries } = buildEntries(playlist.id, mapped);
      await replacePlaylist({ ...playlist, syncedAt: now() }, tracks, entries);
      done += 1;
      pending = pending.filter((id) => id !== playlist.id);
    }

    await putMeta(LAST_SYNC_META, now());
    await setFinalState({ status: 'idle' });
  } catch (err) {
    if (err instanceof QuotaError) {
      await setFinalState({
        status: 'locked',
        retryAt: err.retryAt,
        pending,
        done,
        total,
      });
    } else {
      const auth =
        err instanceof NotAllowlistedError || err instanceof AuthError;
      await setFinalState({
        status: 'error',
        message: describeError(err),
        pending,
        ...(auth ? { auth: true as const } : {}),
      });
    }
  } finally {
    if (release) await release().catch(() => undefined);
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `yarn test src/sync/runner.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 6: Commit**

```bash
yarn format && yarn typecheck && yarn lint && yarn test
git add src/sync src/db
git commit -m "feat(sync): resumable, quota-aware playlist sync runner

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

---

### Task 8: History export file matching and record aggregation

**Files:**
- Create: `src/history/files.ts`, `src/history/records.ts`
- Test: `src/history/files.test.ts`, `src/history/records.test.ts`

**Interfaces:**
- Consumes: `PlayRow` (Task 5).
- Produces (files): `HISTORY_FILE: RegExp`, `baseName(path)`, `isHistoryFile(path)`, `historyFileIndex(path): number`, `sortHistoryFiles<T extends {name: string}>(files: T[]): T[]`, `isAccountDataFile(path)`, `isAccountDataRecord(record: unknown)`.
- Produces (records): `MIN_PLAY_MS = 30000`, `type RecordClass = 'credited' | 'short' | 'podcast' | 'audiobook' | 'unattributed' | 'malformed'`, `type ImportCounts = Record<RecordClass, number>`, `emptyCounts()`, `trackIdFromUri(uri: unknown): string | null`, `classify(record: unknown): RecordClass`, `class PlayAggregator { counts: ImportCounts; add(record: unknown): void; rows(): PlayRow[]; range(): {first, last} | null }`.

- [ ] **Step 1: Write the failing files test**

`src/history/files.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  baseName,
  historyFileIndex,
  isAccountDataFile,
  isAccountDataRecord,
  isHistoryFile,
  sortHistoryFiles,
} from './files';

describe('history file names', () => {
  it('matches audio and video files in any folder, year range or single year', () => {
    expect(isHistoryFile('MyData/Streaming_History_Audio_2013-2015_0.json')).toBe(true);
    expect(
      isHistoryFile(
        'Spotify Extended Streaming History/Streaming_History_Audio_2024_13.json'
      )
    ).toBe(true);
    expect(isHistoryFile('MyData/Streaming_History_Video_2018-2023.json')).toBe(true);
    expect(isHistoryFile('Streaming_History_Video_2024.json')).toBe(true);
    expect(isHistoryFile('streaming_history_audio_2020_1.JSON')).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isHistoryFile('ReadMeFirst_ExtendedStreamingHistory.pdf')).toBe(false);
    expect(isHistoryFile('StreamingHistory_music_0.json')).toBe(false);
    expect(isHistoryFile('Streaming_History_Audio.json')).toBe(false);
    expect(isHistoryFile('Playlist1.json')).toBe(false);
  });

  it('orders by the numeric suffix, not lexically, suffix-less files last', () => {
    const names = [
      'x/Streaming_History_Video_2024.json',
      'x/Streaming_History_Audio_2022-2023_11.json',
      'x/Streaming_History_Audio_2022_10.json',
      'x/Streaming_History_Audio_2020_2.json',
    ].map((name) => ({ name }));
    expect(sortHistoryFiles(names).map((f) => f.name)).toEqual([
      'x/Streaming_History_Audio_2020_2.json',
      'x/Streaming_History_Audio_2022_10.json',
      'x/Streaming_History_Audio_2022-2023_11.json',
      'x/Streaming_History_Video_2024.json',
    ]);
    expect(historyFileIndex('Streaming_History_Audio_2022_10.json')).toBe(10);
    expect(historyFileIndex('Streaming_History_Video_2024.json')).toBe(
      Number.MAX_SAFE_INTEGER
    );
  });

  it('extracts base names', () => {
    expect(baseName('a/b\\c.json')).toBe('c.json');
    expect(baseName('c.json')).toBe('c.json');
  });

  it('recognises the Account data package by name and by record shape', () => {
    expect(isAccountDataFile('MyData/StreamingHistory_music_3.json')).toBe(true);
    expect(isAccountDataFile('StreamingHistory_podcast_0.json')).toBe(true);
    expect(isAccountDataFile('Streaming_History_Audio_2020_0.json')).toBe(false);
    expect(
      isAccountDataRecord({ endTime: '2024-01-01 10:00', artistName: 'A', trackName: 'T', msPlayed: 1 })
    ).toBe(true);
    expect(isAccountDataRecord({ ts: 'x', ms_played: 1 })).toBe(false);
    expect(isAccountDataRecord(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Write the failing records test**

`src/history/records.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  MIN_PLAY_MS,
  PlayAggregator,
  classify,
  emptyCounts,
  trackIdFromUri,
} from './records';

function rec(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ts: '2024-01-01T00:00:00Z',
    platform: 'android',
    ms_played: 200000,
    conn_country: 'FR',
    ip_addr: null,
    master_metadata_track_name: 'Song',
    master_metadata_album_artist_name: 'Artist',
    master_metadata_album_album_name: 'Album',
    spotify_track_uri: 'spotify:track:t1',
    episode_name: null,
    episode_show_name: null,
    spotify_episode_uri: null,
    audiobook_title: null,
    audiobook_uri: null,
    audiobook_chapter_uri: null,
    audiobook_chapter_title: null,
    reason_start: 'trackdone',
    reason_end: 'trackdone',
    shuffle: false,
    skipped: false,
    offline: false,
    offline_timestamp: null,
    incognito_mode: false,
    ...over,
  };
}

describe('trackIdFromUri', () => {
  it('extracts the id from track uris only', () => {
    expect(trackIdFromUri('spotify:track:abc')).toBe('abc');
    expect(trackIdFromUri('spotify:episode:abc')).toBeNull();
    expect(trackIdFromUri('spotify:track:')).toBeNull();
    expect(trackIdFromUri(null)).toBeNull();
  });
});

describe('classify', () => {
  it('applies the 30 second rule to track plays', () => {
    expect(classify(rec())).toBe('credited');
    expect(classify(rec({ ms_played: MIN_PLAY_MS }))).toBe('credited');
    expect(classify(rec({ ms_played: MIN_PLAY_MS - 1 }))).toBe('short');
    expect(classify(rec({ ms_played: null }))).toBe('short');
  });

  it('classifies podcasts, audiobooks, null-metadata rows and junk', () => {
    expect(
      classify(rec({ spotify_track_uri: null, spotify_episode_uri: 'spotify:episode:e' }))
    ).toBe('podcast');
    expect(
      classify(rec({ spotify_track_uri: null, audiobook_uri: 'spotify:show:b' }))
    ).toBe('audiobook');
    expect(classify(rec({ spotify_track_uri: null }))).toBe('unattributed');
    expect(classify(null)).toBe('malformed');
    expect(classify('x')).toBe('malformed');
    expect(classify([])).toBe('malformed');
  });
});

describe('PlayAggregator', () => {
  it('counts plays per track with totals, first and last timestamps', () => {
    const agg = new PlayAggregator();
    agg.add(rec({ ts: '2024-03-01T00:00:00Z' }));
    agg.add(rec({ ts: '2022-01-01T00:00:00Z', ms_played: 50000 }));
    agg.add(rec({ ms_played: 1000 }));
    agg.add(rec({ spotify_track_uri: 'spotify:track:t2', ts: '2025-01-01T00:00:00Z', master_metadata_track_name: null }));
    agg.add(rec({ spotify_track_uri: null }));
    agg.add(42);
    expect(agg.counts).toEqual({
      ...emptyCounts(),
      credited: 3,
      short: 1,
      unattributed: 1,
      malformed: 1,
    });
    const rows = agg.rows().sort((a, b) => a.trackId.localeCompare(b.trackId));
    expect(rows).toEqual([
      {
        trackId: 't1',
        plays: 2,
        msPlayed: 250000,
        firstTs: '2022-01-01T00:00:00Z',
        lastTs: '2024-03-01T00:00:00Z',
        trackName: 'Song',
        artistName: 'Artist',
      },
      {
        trackId: 't2',
        plays: 1,
        msPlayed: 200000,
        firstTs: '2025-01-01T00:00:00Z',
        lastTs: '2025-01-01T00:00:00Z',
        trackName: null,
        artistName: 'Artist',
      },
    ]);
    expect(agg.range()).toEqual({
      first: '2022-01-01T00:00:00Z',
      last: '2025-01-01T00:00:00Z',
    });
  });

  it('fills names from a later record when the first was null', () => {
    const agg = new PlayAggregator();
    agg.add(rec({ master_metadata_track_name: null }));
    agg.add(rec());
    expect(agg.rows()[0].trackName).toBe('Song');
  });

  it('has no range when nothing was credited', () => {
    expect(new PlayAggregator().range()).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `yarn test src/history`
Expected: FAIL, both files fail to resolve imports.

- [ ] **Step 4: Implement files.ts**

`src/history/files.ts`:

```ts
/** Audio files carry a numeric suffix; Video files do not. */
export const HISTORY_FILE =
  /^Streaming_History_(Audio|Video)_\d{4}(?:-\d{4})?(?:_(\d+))?\.json$/i;

const ACCOUNT_DATA_FILE = /^StreamingHistory_(music|podcast|audiobook)_\d+\.json$/i;

export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function isHistoryFile(path: string): boolean {
  return HISTORY_FILE.test(baseName(path));
}

/** Numeric suffix, or MAX_SAFE_INTEGER for suffix-less (Video) files so they sort last. */
export function historyFileIndex(path: string): number {
  const match = HISTORY_FILE.exec(baseName(path));
  return match?.[2] !== undefined ? Number(match[2]) : Number.MAX_SAFE_INTEGER;
}

export function sortHistoryFiles<T extends { name: string }>(files: T[]): T[] {
  return [...files].sort(
    (a, b) =>
      historyFileIndex(a.name) - historyFileIndex(b.name) ||
      a.name.localeCompare(b.name)
  );
}

export function isAccountDataFile(path: string): boolean {
  return ACCOUNT_DATA_FILE.test(baseName(path));
}

export function isAccountDataRecord(record: unknown): boolean {
  if (!record || typeof record !== 'object') return false;
  return 'endTime' in record || 'msPlayed' in record;
}
```

- [ ] **Step 5: Implement records.ts**

`src/history/records.ts`:

```ts
import type { PlayRow } from '../db/schema';

export const MIN_PLAY_MS = 30_000;

export type RecordClass =
  | 'credited'
  | 'short'
  | 'podcast'
  | 'audiobook'
  | 'unattributed'
  | 'malformed';

export type ImportCounts = Record<RecordClass, number>;

export function emptyCounts(): ImportCounts {
  return {
    credited: 0,
    short: 0,
    podcast: 0,
    audiobook: 0,
    unattributed: 0,
    malformed: 0,
  };
}

interface RawRecord {
  ts?: unknown;
  ms_played?: unknown;
  spotify_track_uri?: unknown;
  spotify_episode_uri?: unknown;
  audiobook_uri?: unknown;
  master_metadata_track_name?: unknown;
  master_metadata_album_artist_name?: unknown;
}

const TRACK_PREFIX = 'spotify:track:';

export function trackIdFromUri(uri: unknown): string | null {
  if (typeof uri !== 'string' || !uri.startsWith(TRACK_PREFIX)) return null;
  const id = uri.slice(TRACK_PREFIX.length);
  return id.length > 0 ? id : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function classify(record: unknown): RecordClass {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return 'malformed';
  }
  const r = record as RawRecord;
  if (trackIdFromUri(r.spotify_track_uri)) {
    return typeof r.ms_played === 'number' && r.ms_played >= MIN_PLAY_MS
      ? 'credited'
      : 'short';
  }
  if (text(r.spotify_episode_uri)) return 'podcast';
  if (text(r.audiobook_uri)) return 'audiobook';
  return 'unattributed';
}

export class PlayAggregator {
  readonly counts: ImportCounts = emptyCounts();
  private readonly byId = new Map<string, PlayRow>();

  add(record: unknown): void {
    const cls = classify(record);
    this.counts[cls] += 1;
    if (cls !== 'credited') return;
    const r = record as RawRecord;
    const id = trackIdFromUri(r.spotify_track_uri);
    if (!id) return;
    const ts = text(r.ts) ?? '';
    const ms = r.ms_played as number;
    const row = this.byId.get(id);
    if (!row) {
      this.byId.set(id, {
        trackId: id,
        plays: 1,
        msPlayed: ms,
        firstTs: ts,
        lastTs: ts,
        trackName: text(r.master_metadata_track_name),
        artistName: text(r.master_metadata_album_artist_name),
      });
      return;
    }
    row.plays += 1;
    row.msPlayed += ms;
    if (ts && (!row.firstTs || ts < row.firstTs)) row.firstTs = ts;
    if (ts > row.lastTs) row.lastTs = ts;
    row.trackName ??= text(r.master_metadata_track_name);
    row.artistName ??= text(r.master_metadata_album_artist_name);
  }

  rows(): PlayRow[] {
    return [...this.byId.values()];
  }

  range(): { first: string; last: string } | null {
    let first = '';
    let last = '';
    for (const row of this.byId.values()) {
      if (row.firstTs && (!first || row.firstTs < first)) first = row.firstTs;
      if (row.lastTs > last) last = row.lastTs;
    }
    return first ? { first, last } : null;
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `yarn test src/history`
Expected: PASS, 11 tests.

- [ ] **Step 7: Commit**

```bash
yarn format && yarn typecheck && yarn lint && yarn test
git add src/history
git commit -m "feat(history): export file matching and play aggregation with the 30 s rule

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

---

### Task 9: Import pipeline, worker and main-thread importer

**Files:**
- Create: `src/history/process.ts`, `src/history/import.worker.ts`, `src/history/importer.ts`
- Test: `src/history/process.test.ts`, `src/history/importer.test.ts`

**Interfaces:**
- Consumes: Task 8 (`files.ts`, `records.ts`), Task 5 (`replacePlays`, `putMeta`, `PlayRow`).
- Produces:
  - `type ImportMessage = { type: 'progress'; file; index; total } | { type: 'done'; plays: PlayRow[]; counts: ImportCounts; range; processed: string[]; skipped: {name, reason}[] } | { type: 'error'; code: 'account-data-package' | 'no-files' | 'failed'; message }`
  - `processFiles(files: File[], post: (m: ImportMessage) => void): Promise<void>`
  - `ACCOUNT_DATA_MESSAGE: string`
  - `interface ImportSummary { importedAt; plays; tracks; matchedTracks; counts; range; processed; skipped }`
  - `type ImportState = { status: 'idle' } | { status: 'running'; file; index; total } | { status: 'done'; summary: ImportSummary } | { status: 'error'; message }`
  - `interface ImporterDeps { createWorker(): Worker; knownTrackIds: ReadonlySet<string>; now(): number; onState(state: ImportState): void }`
  - `runImport(files: File[], deps: ImporterDeps): Promise<void>` — never rejects.
  - `HISTORY_SUMMARY_META = 'historySummary'`

- [ ] **Step 1: Write the failing process test**

`src/history/process.test.ts`:

```ts
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { processFiles, type ImportMessage } from './process';

function rec(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ts: '2024-01-01T00:00:00Z',
    ms_played: 200000,
    master_metadata_track_name: 'Song',
    master_metadata_album_artist_name: 'Artist',
    master_metadata_album_album_name: 'Album',
    spotify_track_uri: 'spotify:track:t1',
    spotify_episode_uri: null,
    audiobook_uri: null,
    ...over,
  };
}

function zipFile(entries: Record<string, string>): File {
  const data = zipSync(
    Object.fromEntries(
      Object.entries(entries).map(([name, body]) => [name, strToU8(body)])
    )
  );
  return new File([new Uint8Array(data).buffer], 'my_spotify_data.zip');
}

function jsonFile(name: string, body: unknown): File {
  return new File([JSON.stringify(body)], name);
}

async function collect(files: File[]): Promise<ImportMessage[]> {
  const messages: ImportMessage[] = [];
  await processFiles(files, (m) => messages.push(m));
  return messages;
}

describe('processFiles', () => {
  it('reads a zip in numeric file order, aggregates plays and reports counts', async () => {
    const messages = await collect([
      zipFile({
        'Spotify Extended Streaming History/Streaming_History_Audio_2022-2023_11.json':
          JSON.stringify([rec({ ts: '2023-05-01T00:00:00Z' })]),
        'Spotify Extended Streaming History/Streaming_History_Audio_2020_2.json':
          JSON.stringify([
            rec({ ts: '2020-02-02T00:00:00Z' }),
            rec({ ms_played: 5000 }),
            rec({ spotify_track_uri: null }),
          ]),
        'Spotify Extended Streaming History/Streaming_History_Video_2024.json':
          JSON.stringify([
            rec({ spotify_track_uri: 'spotify:track:t2', ts: '2024-06-01T00:00:00Z' }),
          ]),
        'Spotify Extended Streaming History/ReadMeFirst_ExtendedStreamingHistory.pdf':
          '%PDF-1.4',
      }),
    ]);
    expect(messages.filter((m) => m.type === 'progress').map((m) => m.type === 'progress' && m.file)).toEqual([
      'Streaming_History_Audio_2020_2.json',
      'Streaming_History_Audio_2022-2023_11.json',
      'Streaming_History_Video_2024.json',
    ]);
    const done = messages.at(-1);
    expect(done?.type).toBe('done');
    if (done?.type !== 'done') return;
    expect(done.counts).toMatchObject({ credited: 3, short: 1, unattributed: 1 });
    expect(done.plays.map((p) => [p.trackId, p.plays])).toEqual([
      ['t1', 2],
      ['t2', 1],
    ]);
    expect(done.range).toEqual({
      first: '2020-02-02T00:00:00Z',
      last: '2024-06-01T00:00:00Z',
    });
    expect(done.processed).toHaveLength(3);
    expect(done.skipped).toEqual([]);
  });

  it('accepts loose json files and skips unreadable ones', async () => {
    const messages = await collect([
      jsonFile('Streaming_History_Audio_2021_0.json', [rec()]),
      new File(['{not json'], 'Streaming_History_Audio_2021_1.json'),
      jsonFile('Streaming_History_Audio_2021_2.json', { not: 'an array' }),
    ]);
    const done = messages.at(-1);
    if (done?.type !== 'done') throw new Error('expected done');
    expect(done.processed).toEqual(['Streaming_History_Audio_2021_0.json']);
    expect(done.skipped.map((s) => s.name)).toEqual([
      'Streaming_History_Audio_2021_1.json',
      'Streaming_History_Audio_2021_2.json',
    ]);
    expect(done.skipped[0].reason).toMatch(/unreadable/);
    expect(done.skipped[1].reason).toBe('not a JSON array');
  });

  it('rejects the Account data package by file name', async () => {
    const messages = await collect([
      zipFile({
        'MyData/StreamingHistory_music_0.json': JSON.stringify([
          { endTime: '2024-01-01 10:00', artistName: 'A', trackName: 'T', msPlayed: 1 },
        ]),
      }),
    ]);
    expect(messages).toEqual([
      { type: 'error', code: 'account-data-package', message: expect.stringContaining('Extended streaming history') },
    ]);
  });

  it('rejects the Account data package by record shape', async () => {
    const messages = await collect([
      jsonFile('Streaming_History_Audio_2024_0.json', [
        { endTime: '2024-01-01 10:00', artistName: 'A', trackName: 'T', msPlayed: 1 },
      ]),
    ]);
    expect(messages.at(-1)).toMatchObject({ type: 'error', code: 'account-data-package' });
  });

  it('reports when nothing matches', async () => {
    const messages = await collect([jsonFile('Playlist1.json', [])]);
    expect(messages).toEqual([
      { type: 'error', code: 'no-files', message: expect.stringContaining('Streaming_History_Audio') },
    ]);
  });
});
```

- [ ] **Step 2: Write the failing importer test**

`src/history/importer.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { getAllRows, getMeta, wipeDb } from '../db/repo';
import { runImport, type ImportState } from './importer';
import type { ImportMessage } from './process';
import { emptyCounts } from './records';

class FakeWorker {
  onmessage: ((event: MessageEvent<ImportMessage>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  constructor(private readonly script: ImportMessage[] | Error) {}
  postMessage() {
    queueMicrotask(() => {
      if (this.script instanceof Error) {
        this.onerror?.({ message: this.script.message } as ErrorEvent);
        return;
      }
      for (const m of this.script) {
        this.onmessage?.({ data: m } as MessageEvent<ImportMessage>);
      }
    });
  }
  terminate() {
    this.terminated = true;
  }
}

const play = (trackId: string) => ({
  trackId,
  plays: 3,
  msPlayed: 90000,
  firstTs: '2020-01-01T00:00:00Z',
  lastTs: '2021-01-01T00:00:00Z',
  trackName: 'S',
  artistName: 'A',
});

beforeEach(async () => {
  await wipeDb();
});

describe('runImport', () => {
  it('stores plays and a summary on done', async () => {
    const states: ImportState[] = [];
    const worker = new FakeWorker([
      { type: 'progress', file: 'f0', index: 0, total: 2 },
      {
        type: 'done',
        plays: [play('a'), play('b')],
        counts: { ...emptyCounts(), credited: 6 },
        range: { first: '2020-01-01T00:00:00Z', last: '2021-01-01T00:00:00Z' },
        processed: ['f0', 'f1'],
        skipped: [],
      },
    ]);
    await runImport([], {
      createWorker: () => worker as unknown as Worker,
      knownTrackIds: new Set(['a']),
      now: () => 77,
      onState: (s) => states.push(s),
    });
    expect(states[0]).toMatchObject({ status: 'running' });
    expect(states.at(-1)).toEqual({
      status: 'done',
      summary: {
        importedAt: 77,
        plays: 6,
        tracks: 2,
        matchedTracks: 1,
        counts: { ...emptyCounts(), credited: 6 },
        range: { first: '2020-01-01T00:00:00Z', last: '2021-01-01T00:00:00Z' },
        processed: ['f0', 'f1'],
        skipped: [],
      },
    });
    expect((await getAllRows()).plays.map((p) => p.trackId)).toEqual(['a', 'b']);
    await expect(getMeta('historySummary')).resolves.toMatchObject({ plays: 6 });
    expect(worker.terminated).toBe(true);
  });

  it('reports worker errors and crashes', async () => {
    const errored: ImportState[] = [];
    await runImport([], {
      createWorker: () =>
        new FakeWorker([{ type: 'error', code: 'no-files', message: 'nothing' }]) as unknown as Worker,
      knownTrackIds: new Set(),
      now: () => 1,
      onState: (s) => errored.push(s),
    });
    expect(errored.at(-1)).toEqual({ status: 'error', message: 'nothing' });

    const crashed: ImportState[] = [];
    await runImport([], {
      createWorker: () => new FakeWorker(new Error('boom')) as unknown as Worker,
      knownTrackIds: new Set(),
      now: () => 1,
      onState: (s) => crashed.push(s),
    });
    expect(crashed.at(-1)).toEqual({ status: 'error', message: 'boom' });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `yarn test src/history/process.test.ts src/history/importer.test.ts`
Expected: FAIL, imports unresolved.

- [ ] **Step 4: Implement process.ts**

`src/history/process.ts`:

```ts
import { unzipSync } from 'fflate';
import type { PlayRow } from '../db/schema';
import {
  baseName,
  isAccountDataFile,
  isAccountDataRecord,
  isHistoryFile,
  sortHistoryFiles,
} from './files';
import { PlayAggregator, type ImportCounts } from './records';

export type ImportMessage =
  | { type: 'progress'; file: string; index: number; total: number }
  | {
      type: 'done';
      plays: PlayRow[];
      counts: ImportCounts;
      range: { first: string; last: string } | null;
      processed: string[];
      skipped: { name: string; reason: string }[];
    }
  | {
      type: 'error';
      code: 'account-data-package' | 'no-files' | 'failed';
      message: string;
    };

export const ACCOUNT_DATA_MESSAGE =
  'These files are the "Account data" package, which has no track ids. Request "Extended streaming history" instead: Spotify account, Privacy settings, Download your data.';

interface Source {
  name: string;
  read: () => Promise<Uint8Array>;
}

async function collectSources(
  files: File[]
): Promise<{ sources: Source[]; accountDataSeen: boolean }> {
  const sources: Source[] = [];
  let accountDataSeen = false;
  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      const buffer = new Uint8Array(await file.arrayBuffer());
      const names: string[] = [];
      unzipSync(buffer, {
        filter: (entry) => {
          names.push(entry.name);
          return false;
        },
      });
      for (const name of names) {
        if (isAccountDataFile(name)) accountDataSeen = true;
        if (!isHistoryFile(name)) continue;
        sources.push({
          name: baseName(name),
          read: async () =>
            unzipSync(buffer, { filter: (entry) => entry.name === name })[
              name
            ] ?? new Uint8Array(),
        });
      }
    } else {
      if (isAccountDataFile(file.name)) accountDataSeen = true;
      if (!isHistoryFile(file.name)) continue;
      sources.push({
        name: baseName(file.name),
        read: async () => new Uint8Array(await file.arrayBuffer()),
      });
    }
  }
  return { sources: sortHistoryFiles(sources), accountDataSeen };
}

export async function processFiles(
  files: File[],
  post: (message: ImportMessage) => void
): Promise<void> {
  const { sources, accountDataSeen } = await collectSources(files);
  if (sources.length === 0) {
    post(
      accountDataSeen
        ? {
            type: 'error',
            code: 'account-data-package',
            message: ACCOUNT_DATA_MESSAGE,
          }
        : {
            type: 'error',
            code: 'no-files',
            message:
              'No Streaming_History_Audio_*.json files found. Pick my_spotify_data.zip or the JSON files inside it.',
          }
    );
    return;
  }
  const aggregator = new PlayAggregator();
  const processed: string[] = [];
  const skipped: { name: string; reason: string }[] = [];
  const decoder = new TextDecoder('utf-8');
  for (const [index, source] of sources.entries()) {
    post({ type: 'progress', file: source.name, index, total: sources.length });
    let parsed: unknown;
    try {
      parsed = JSON.parse(decoder.decode(await source.read()));
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      skipped.push({ name: source.name, reason: `unreadable: ${reason}` });
      continue;
    }
    if (!Array.isArray(parsed)) {
      skipped.push({ name: source.name, reason: 'not a JSON array' });
      continue;
    }
    if (parsed.length > 0 && isAccountDataRecord(parsed[0])) {
      post({
        type: 'error',
        code: 'account-data-package',
        message: ACCOUNT_DATA_MESSAGE,
      });
      return;
    }
    for (const record of parsed) aggregator.add(record);
    processed.push(source.name);
  }
  post({
    type: 'done',
    plays: aggregator.rows(),
    counts: aggregator.counts,
    range: aggregator.range(),
    processed,
    skipped,
  });
}
```

- [ ] **Step 5: Implement the worker and the importer**

`src/history/import.worker.ts`:

```ts
import { processFiles, type ImportMessage } from './process';

self.onmessage = (event: MessageEvent<{ files: File[] }>) => {
  const post = (message: ImportMessage) => self.postMessage(message);
  processFiles(event.data.files, post).catch((err: unknown) => {
    post({
      type: 'error',
      code: 'failed',
      message: err instanceof Error ? err.message : String(err),
    });
  });
};
```

`src/history/importer.ts`:

```ts
import { putMeta, replacePlays } from '../db/repo';
import type { ImportMessage } from './process';
import type { ImportCounts } from './records';

export const HISTORY_SUMMARY_META = 'historySummary';

export interface ImportSummary {
  importedAt: number;
  plays: number;
  tracks: number;
  matchedTracks: number;
  counts: ImportCounts;
  range: { first: string; last: string } | null;
  processed: string[];
  skipped: { name: string; reason: string }[];
}

export type ImportState =
  | { status: 'idle' }
  | { status: 'running'; file: string; index: number; total: number }
  | { status: 'done'; summary: ImportSummary }
  | { status: 'error'; message: string };

export interface ImporterDeps {
  createWorker: () => Worker;
  knownTrackIds: ReadonlySet<string>;
  now: () => number;
  onState: (state: ImportState) => void;
}

function storageMessage(err: unknown): string {
  if (err instanceof DOMException && err.name === 'QuotaExceededError') {
    return 'Local storage is full. Free space on the phone and try again.';
  }
  return err instanceof Error ? err.message : String(err);
}

export function runImport(files: File[], deps: ImporterDeps): Promise<void> {
  return new Promise((resolve) => {
    const worker = deps.createWorker();
    let finished = false;
    let currentFile = '';
    const finish = (state: ImportState) => {
      if (finished) return;
      finished = true;
      worker.terminate();
      deps.onState(state);
      resolve();
    };
    worker.onerror = (event) => {
      const reason = event.message || 'Import worker crashed';
      finish({
        status: 'error',
        message: currentFile ? `${reason} (while reading ${currentFile})` : reason,
      });
    };
    worker.onmessage = (event: MessageEvent<ImportMessage>) => {
      const message = event.data;
      if (message.type === 'progress') {
        currentFile = message.file;
        deps.onState({
          status: 'running',
          file: message.file,
          index: message.index,
          total: message.total,
        });
        return;
      }
      if (message.type === 'error') {
        finish({ status: 'error', message: message.message });
        return;
      }
      void (async () => {
        try {
          await replacePlays(message.plays);
          const summary: ImportSummary = {
            importedAt: deps.now(),
            plays: message.counts.credited,
            tracks: message.plays.length,
            matchedTracks: message.plays.filter((p) =>
              deps.knownTrackIds.has(p.trackId)
            ).length,
            counts: message.counts,
            range: message.range,
            processed: message.processed,
            skipped: message.skipped,
          };
          await putMeta(HISTORY_SUMMARY_META, summary);
          finish({ status: 'done', summary });
        } catch (err) {
          finish({ status: 'error', message: storageMessage(err) });
        }
      })();
    };
    deps.onState({ status: 'running', file: 'Reading files', index: 0, total: 0 });
    worker.postMessage({ files });
  });
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `yarn test src/history`
Expected: PASS, 18 tests.

- [ ] **Step 7: Commit**

```bash
yarn format && yarn typecheck && yarn lint && yarn test
git add src/history
git commit -m "feat(history): zip import pipeline, worker and importer

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

---

### Task 10: Name normalisation and the in-memory model

**Files:**
- Create: `src/model/normalize.ts`, `src/model/aggregate.ts`
- Test: `src/model/normalize.test.ts`, `src/model/aggregate.test.ts`

**Interfaces:**
- Consumes: schema types (Task 5).
- Produces:
  - `normalize(s: string): string`, `nameKey(artist: string, title: string): string`
  - `interface PlaysInfo { plays; msPlayed; source: 'id' | 'name' }`
  - `interface ArtistAgg { key; id: string | null; name; trackKeys: Set<string>; playlistIds: Set<string> }`
  - `interface Model { playlists; playlistsById; tracksByKey; entriesByPlaylist; playlistsOfTrack; artists; artistsByKey; topItems; topRank; playsById; playsByName }`
  - `artistKey(a: ArtistRef): string`, `buildModel(rows: AllRows): Model`
  - `playsFor(model, track: { id: string | null; name: string; artists: ArtistRef[] }): PlaysInfo | null`
  - `interface RankedTrack { entry: EntryRow; track: TrackRow; plays: PlaysInfo | null; inTop: Period[] }`, `playlistRanking(model, playlistId): RankedTrack[]`
  - `interface AnnotatedTopTrack { item: TopTrackItem; playlistIds: string[]; plays: PlaysInfo | null }`, `topTracks(model, period): AnnotatedTopTrack[]`
  - `interface AnnotatedTopArtist { item: TopArtistItem; savedTracks: number; playlistCount: number }`, `topArtists(model, period): AnnotatedTopArtist[]`
  - `interface ArtistTrack { track: TrackRow; plays: PlaysInfo | null; playlistIds: string[] }`, `artistTracks(model, key): ArtistTrack[]`

- [ ] **Step 1: Write the failing normalize test**

`src/model/normalize.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { nameKey, normalize } from './normalize';

describe('normalize', () => {
  it('folds accents, case and punctuation', () => {
    expect(normalize('Hôtel Costes 9')).toBe('hotel costes 9');
    expect(normalize("L'Impératrice")).toBe('l imperatrice');
    expect(normalize('Around the World - Radio Edit (2001)')).toBe(
      'around the world radio edit 2001'
    );
    expect(normalize('  Daft   Punk ')).toBe('daft punk');
    expect(normalize('Björk & Røyksopp')).toBe('bjork røyksopp');
  });

  it('builds a stable artist|title key', () => {
    expect(nameKey('DAFT PUNK', 'One More Time')).toBe('daft punk|one more time');
  });
});
```

Note: `ø` has no Unicode decomposition, so it survives normalisation; the assertion documents that.

- [ ] **Step 2: Write the failing aggregate test**

`src/model/aggregate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { AllRows, ArtistRef, PlaylistRow, TrackRow } from '../db/schema';
import {
  artistKey,
  artistTracks,
  buildModel,
  playlistRanking,
  playsFor,
  topArtists,
  topTracks,
} from './aggregate';

const daft = { id: 'daft', name: 'Daft Punk' };
const justice = { id: 'justice', name: 'Justice' };
const localArtist = { id: null, name: 'Local Hero' };

function track(
  key: string,
  artists: ArtistRef[] = [daft],
  over: Partial<TrackRow> = {}
): TrackRow {
  return {
    key,
    id: key.startsWith('spotify:local:') ? null : key,
    uri: key.startsWith('spotify:') ? key : `spotify:track:${key}`,
    name: `Song ${key}`,
    artists,
    album: 'Album',
    durationMs: 1000,
    isrc: null,
    spotifyUrl: null,
    isLocal: key.startsWith('spotify:local:'),
    ...over,
  };
}

function playlist(id: string, name = id): PlaylistRow {
  return { id, name, snapshotId: 's', itemCount: 0, imageUrl: null, spotifyUrl: null, syncedAt: 1 };
}

const rows: AllRows = {
  playlists: [playlist('p2', 'Zulu'), playlist('p1', 'Alpha')],
  tracks: [
    track('t1'),
    track('t2', [daft, justice]),
    track('t3', [justice]),
    track('spotify:local:x', [localArtist]),
    track('t4', [daft], { name: 'Relinked Song' }),
  ],
  entries: [
    { playlistId: 'p1', position: 1, trackKey: 't2', addedAt: null },
    { playlistId: 'p1', position: 0, trackKey: 't1', addedAt: null },
    { playlistId: 'p1', position: 2, trackKey: 't4', addedAt: null },
    { playlistId: 'p2', position: 0, trackKey: 't2', addedAt: null },
    { playlistId: 'p2', position: 1, trackKey: 't3', addedAt: null },
    { playlistId: 'p2', position: 2, trackKey: 'spotify:local:x', addedAt: null },
    { playlistId: 'gone', position: 0, trackKey: 't1', addedAt: null },
  ],
  topItems: [
    {
      key: 'tracks:short_term',
      type: 'tracks',
      period: 'short_term',
      fetchedAt: 1,
      items: [
        { rank: 1, id: 't3', name: 'Song t3', artists: [justice], album: '', imageUrl: null, spotifyUrl: null },
        { rank: 2, id: 't1', name: 'Song t1', artists: [daft], album: '', imageUrl: null, spotifyUrl: null },
        { rank: 3, id: 'unsaved', name: 'Not saved', artists: [daft], album: '', imageUrl: null, spotifyUrl: null },
      ],
    },
    {
      key: 'artists:short_term',
      type: 'artists',
      period: 'short_term',
      fetchedAt: 1,
      items: [
        { rank: 1, id: 'daft', name: 'Daft Punk', imageUrl: null, spotifyUrl: null },
        { rank: 2, id: 'nobody', name: 'Nobody', imageUrl: null, spotifyUrl: null },
      ],
    },
  ],
  plays: [
    { trackId: 't1', plays: 10, msPlayed: 1, firstTs: '', lastTs: '', trackName: 'Song t1', artistName: 'Daft Punk' },
    { trackId: 't2', plays: 5, msPlayed: 1, firstTs: '', lastTs: '', trackName: 'Song t2', artistName: 'Daft Punk' },
    { trackId: 'other-id', plays: 7, msPlayed: 2, firstTs: '', lastTs: '', trackName: 'Relinked Song', artistName: 'DAFT PUNK' },
    { trackId: 'other-id-2', plays: 1, msPlayed: 3, firstTs: '', lastTs: '', trackName: 'Relinked Song', artistName: 'Daft Punk' },
  ],
};

const model = buildModel(rows);

describe('buildModel', () => {
  it('sorts playlists by name and drops entries of unknown playlists', () => {
    expect(model.playlists.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(model.entriesByPlaylist.has('gone')).toBe(false);
    expect(model.entriesByPlaylist.get('p1')?.map((e) => e.trackKey)).toEqual(['t1', 't2', 't4']);
  });

  it('ranks artists by distinct saved tracks and keys local artists by name', () => {
    expect(model.artists.map((a) => [a.key, a.trackKeys.size, a.playlistIds.size])).toEqual([
      ['daft', 3, 2],
      ['justice', 2, 2],
      ['name:local hero', 1, 1],
    ]);
    expect(artistKey(localArtist)).toBe('name:local hero');
  });

  it('maps tracks to playlists', () => {
    expect([...model.playlistsOfTrack.get('t2')!]).toEqual(['p1', 'p2']);
    expect([...model.playlistsOfTrack.get('t1')!]).toEqual(['p1']);
  });
});

describe('playsFor', () => {
  it('prefers the exact id and falls back to artist and title', () => {
    expect(playsFor(model, track('t1'))).toEqual({ plays: 10, msPlayed: 1, source: 'id' });
    expect(playsFor(model, track('t4', [daft], { name: 'Relinked Song' }))).toEqual({
      plays: 8,
      msPlayed: 5,
      source: 'name',
    });
    expect(playsFor(model, track('t3', [justice]))).toBeNull();
    expect(playsFor(model, track('x', []))).toBeNull();
  });
});

describe('playlistRanking', () => {
  it('sorts by plays, then top rank, then position, and flags top lists', () => {
    const ranked = playlistRanking(model, 'p1');
    expect(ranked.map((r) => [r.track.key, r.plays?.plays ?? 0, r.inTop])).toEqual([
      ['t1', 10, ['short_term']],
      ['t4', 8, []],
      ['t2', 5, []],
    ]);
    const p2 = playlistRanking(model, 'p2');
    expect(p2.map((r) => r.track.key)).toEqual(['t2', 't3', 'spotify:local:x']);
    expect(playlistRanking(model, 'nope')).toEqual([]);
  });
});

describe('top lists', () => {
  it('annotates top tracks with playlists and plays', () => {
    expect(
      topTracks(model, 'short_term').map((t) => [t.item.id, t.playlistIds, t.plays?.plays ?? null])
    ).toEqual([
      ['t3', ['p2'], null],
      ['t1', ['p1'], 10],
      ['unsaved', [], null],
    ]);
    expect(topTracks(model, 'long_term')).toEqual([]);
  });

  it('annotates top artists with saved track counts', () => {
    expect(topArtists(model, 'short_term').map((a) => [a.item.id, a.savedTracks, a.playlistCount])).toEqual([
      ['daft', 3, 2],
      ['nobody', 0, 0],
    ]);
  });
});

describe('artistTracks', () => {
  it('lists an artist’s saved tracks by plays with their playlists', () => {
    expect(artistTracks(model, 'daft').map((t) => [t.track.key, t.plays?.plays ?? 0, t.playlistIds])).toEqual([
      ['t1', 10, ['p1']],
      ['t4', 8, ['p1']],
      ['t2', 5, ['p1', 'p2']],
    ]);
    expect(artistTracks(model, 'nope')).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `yarn test src/model`
Expected: FAIL, imports unresolved.

- [ ] **Step 4: Implement normalize.ts**

`src/model/normalize.ts`:

```ts
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function nameKey(artist: string, title: string): string {
  return `${normalize(artist)}|${normalize(title)}`;
}
```

- [ ] **Step 5: Implement aggregate.ts**

`src/model/aggregate.ts`:

```ts
import {
  PERIODS,
  topKey,
  type AllRows,
  type ArtistRef,
  type EntryRow,
  type Period,
  type PlayRow,
  type PlaylistRow,
  type TopArtistItem,
  type TopItemsRow,
  type TopTrackItem,
  type TrackRow,
} from '../db/schema';
import { nameKey, normalize } from './normalize';

export interface PlaysInfo {
  plays: number;
  msPlayed: number;
  source: 'id' | 'name';
}

export interface ArtistAgg {
  key: string;
  id: string | null;
  name: string;
  trackKeys: Set<string>;
  playlistIds: Set<string>;
}

export interface Model {
  playlists: PlaylistRow[];
  playlistsById: Map<string, PlaylistRow>;
  tracksByKey: Map<string, TrackRow>;
  entriesByPlaylist: Map<string, EntryRow[]>;
  playlistsOfTrack: Map<string, Set<string>>;
  artists: ArtistAgg[];
  artistsByKey: Map<string, ArtistAgg>;
  topItems: Map<string, TopItemsRow>;
  topRank: Map<string, Map<Period, number>>;
  playsById: Map<string, PlayRow>;
  playsByName: Map<string, { plays: number; msPlayed: number }>;
}

export function artistKey(a: ArtistRef): string {
  return a.id ?? `name:${normalize(a.name)}`;
}

export function buildModel(rows: AllRows): Model {
  const playlists = [...rows.playlists].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const playlistsById = new Map(playlists.map((p) => [p.id, p]));
  const tracksByKey = new Map(rows.tracks.map((t) => [t.key, t]));
  const entriesByPlaylist = new Map<string, EntryRow[]>();
  const playlistsOfTrack = new Map<string, Set<string>>();
  const artistsByKey = new Map<string, ArtistAgg>();

  for (const entry of rows.entries) {
    if (!playlistsById.has(entry.playlistId)) continue;
    const list = entriesByPlaylist.get(entry.playlistId) ?? [];
    list.push(entry);
    entriesByPlaylist.set(entry.playlistId, list);
    const owners = playlistsOfTrack.get(entry.trackKey) ?? new Set<string>();
    owners.add(entry.playlistId);
    playlistsOfTrack.set(entry.trackKey, owners);
    const track = tracksByKey.get(entry.trackKey);
    if (!track) continue;
    for (const ref of track.artists) {
      const key = artistKey(ref);
      const agg = artistsByKey.get(key) ?? {
        key,
        id: ref.id,
        name: ref.name,
        trackKeys: new Set<string>(),
        playlistIds: new Set<string>(),
      };
      agg.trackKeys.add(track.key);
      agg.playlistIds.add(entry.playlistId);
      artistsByKey.set(key, agg);
    }
  }
  for (const list of entriesByPlaylist.values()) {
    list.sort((a, b) => a.position - b.position);
  }
  const artists = [...artistsByKey.values()].sort(
    (a, b) =>
      b.trackKeys.size - a.trackKeys.size || a.name.localeCompare(b.name)
  );

  const topItems = new Map(rows.topItems.map((t) => [t.key, t]));
  const topRank = new Map<string, Map<Period, number>>();
  for (const row of rows.topItems) {
    if (row.type !== 'tracks') continue;
    for (const item of row.items) {
      const ranks = topRank.get(item.id) ?? new Map<Period, number>();
      ranks.set(row.period, item.rank);
      topRank.set(item.id, ranks);
    }
  }

  const playsById = new Map(rows.plays.map((p) => [p.trackId, p]));
  const playsByName = new Map<string, { plays: number; msPlayed: number }>();
  for (const p of rows.plays) {
    if (!p.trackName || !p.artistName) continue;
    const key = nameKey(p.artistName, p.trackName);
    const current = playsByName.get(key) ?? { plays: 0, msPlayed: 0 };
    current.plays += p.plays;
    current.msPlayed += p.msPlayed;
    playsByName.set(key, current);
  }

  return {
    playlists,
    playlistsById,
    tracksByKey,
    entriesByPlaylist,
    playlistsOfTrack,
    artists,
    artistsByKey,
    topItems,
    topRank,
    playsById,
    playsByName,
  };
}

export function playsFor(
  model: Model,
  track: { id: string | null; name: string; artists: ArtistRef[] }
): PlaysInfo | null {
  if (track.id) {
    const byId = model.playsById.get(track.id);
    if (byId) return { plays: byId.plays, msPlayed: byId.msPlayed, source: 'id' };
  }
  const artist = track.artists[0]?.name;
  if (!artist) return null;
  const byName = model.playsByName.get(nameKey(artist, track.name));
  return byName ? { ...byName, source: 'name' } : null;
}

function topPeriods(model: Model, id: string | null): Period[] {
  const ranks = id ? model.topRank.get(id) : undefined;
  return ranks ? PERIODS.filter((p) => ranks.has(p)) : [];
}

function bestRank(model: Model, id: string | null): number {
  const ranks = id ? model.topRank.get(id) : undefined;
  return ranks && ranks.size > 0
    ? Math.min(...ranks.values())
    : Number.POSITIVE_INFINITY;
}

export interface RankedTrack {
  entry: EntryRow;
  track: TrackRow;
  plays: PlaysInfo | null;
  inTop: Period[];
}

export function playlistRanking(model: Model, playlistId: string): RankedTrack[] {
  const ranked: RankedTrack[] = [];
  for (const entry of model.entriesByPlaylist.get(playlistId) ?? []) {
    const track = model.tracksByKey.get(entry.trackKey);
    if (!track) continue;
    ranked.push({
      entry,
      track,
      plays: playsFor(model, track),
      inTop: topPeriods(model, track.id),
    });
  }
  return ranked.sort(
    (a, b) =>
      (b.plays?.plays ?? 0) - (a.plays?.plays ?? 0) ||
      bestRank(model, a.track.id) - bestRank(model, b.track.id) ||
      a.entry.position - b.entry.position
  );
}

export interface AnnotatedTopTrack {
  item: TopTrackItem;
  playlistIds: string[];
  plays: PlaysInfo | null;
}

export function topTracks(model: Model, period: Period): AnnotatedTopTrack[] {
  const row = model.topItems.get(topKey('tracks', period));
  if (!row || row.type !== 'tracks') return [];
  return row.items.map((item) => ({
    item,
    playlistIds: [...(model.playlistsOfTrack.get(item.id) ?? [])],
    plays: playsFor(model, item),
  }));
}

export interface AnnotatedTopArtist {
  item: TopArtistItem;
  savedTracks: number;
  playlistCount: number;
}

export function topArtists(model: Model, period: Period): AnnotatedTopArtist[] {
  const row = model.topItems.get(topKey('artists', period));
  if (!row || row.type !== 'artists') return [];
  return row.items.map((item) => {
    const agg = model.artistsByKey.get(item.id);
    return {
      item,
      savedTracks: agg?.trackKeys.size ?? 0,
      playlistCount: agg?.playlistIds.size ?? 0,
    };
  });
}

export interface ArtistTrack {
  track: TrackRow;
  plays: PlaysInfo | null;
  playlistIds: string[];
}

export function artistTracks(model: Model, key: string): ArtistTrack[] {
  const agg = model.artistsByKey.get(key);
  if (!agg) return [];
  const out: ArtistTrack[] = [];
  for (const trackKey of agg.trackKeys) {
    const track = model.tracksByKey.get(trackKey);
    if (!track) continue;
    out.push({
      track,
      plays: playsFor(model, track),
      playlistIds: [...(model.playlistsOfTrack.get(trackKey) ?? [])],
    });
  }
  return out.sort(
    (a, b) =>
      (b.plays?.plays ?? 0) - (a.plays?.plays ?? 0) ||
      a.track.name.localeCompare(b.track.name)
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `yarn test src/model`
Expected: PASS, 10 tests.

- [ ] **Step 7: Commit**

```bash
yarn format && yarn typecheck && yarn lint && yarn test
git add src/model
git commit -m "feat(model): in-memory aggregation with name-fallback play counts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

---

### Task 11: App state, shell, Connect and Settings screens, base styles

**Files:**
- Create: `src/model/state.ts`, `src/app.tsx`, `src/ui/format.ts`, `src/ui/Connect.tsx`, `src/ui/Settings.tsx`, `src/ui/components/Banner.tsx`, `src/ui/components/Progress.tsx`, `src/ui/components/SpotifyLink.tsx`, `src/ui/components/Empty.tsx`
- Modify: `src/main.tsx` (replace), `src/styles.css` (replace)
- Test: `src/ui/format.test.ts`

**Interfaces:**
- Consumes: `auth` (Task 4), `api` (Task 4), repo (Task 5), `runSync`/`SyncState` (Task 7), `runImport`/`ImportState`/`ImportSummary`/`HISTORY_SUMMARY_META` (Task 9), `buildModel`/`Model` (Task 10), `parseRoute`/`routeHref`/`Route` (Task 1).
- Produces:
  - Signals: `model: Signal<Model | null>`, `syncState: Signal<SyncState>`, `importState: Signal<ImportState>`, `lastSyncAt: Signal<number | null>`, `historySummary: Signal<ImportSummary | null>`, `banner: Signal<string | null>`
  - `loadFromDb(): Promise<void>`, `startSync(priorityId?): Promise<void>`, `startImport(files: File[]): Promise<void>`, `disconnect(): Promise<void>`
  - `route: Signal<Route>`, `installRouter(): void`, `App` component
  - `formatTime(ms)`, `formatDateTime(ms)`, `formatDate(iso)`, `plural(n, word)`, `artistNames(artists: ArtistRef[])`, `artistUrl(id: string | null): string | null`, `PERIOD_LABEL: Record<Period, string>`
  - Components: `Banner({ message, onClose })`, `Progress({ label, done, total, unit? })`, `SpotifyLink({ href })`, `Empty({ what })`

- [ ] **Step 1: Write the failing format test**

`src/ui/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { artistNames, artistUrl, plural } from './format';

describe('format helpers', () => {
  it('pluralises', () => {
    expect(plural(1, 'playlist')).toBe('1 playlist');
    expect(plural(0, 'track')).toBe('0 tracks');
    expect(plural(2500, 'play')).toBe(`${(2500).toLocaleString()} plays`);
  });

  it('joins artist names', () => {
    expect(
      artistNames([
        { id: 'a', name: 'Alpha' },
        { id: null, name: 'Beta' },
      ])
    ).toBe('Alpha, Beta');
    expect(artistNames([])).toBe('');
  });

  it('links artists by id and not local-file artists', () => {
    expect(artistUrl('4tZwfgrHOc3mvqYlEYSvVi')).toBe(
      'https://open.spotify.com/artist/4tZwfgrHOc3mvqYlEYSvVi'
    );
    expect(artistUrl(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/ui/format.test.ts`
Expected: FAIL, `Failed to resolve import "./format"`.

- [ ] **Step 3: Implement format.ts**

`src/ui/format.ts`:

```ts
import type { ArtistRef, Period } from '../db/schema';

export const PERIOD_LABEL: Record<Period, string> = {
  short_term: '4 weeks',
  medium_term: '6 months',
  long_term: '1 year',
};

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { dateStyle: 'medium' });
}

export function plural(n: number, word: string): string {
  return `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
}

export function artistNames(artists: ArtistRef[]): string {
  return artists.map((a) => a.name).join(', ');
}

/** Playlist items only carry artist ids and names; the link is derived. */
export function artistUrl(id: string | null): string | null {
  return id ? `https://open.spotify.com/artist/${id}` : null;
}
```

Run: `yarn test src/ui/format.test.ts` — expected PASS, 3 tests.

- [ ] **Step 4: Write state.ts**

`src/model/state.ts`:

```ts
import { signal } from '@preact/signals';
import { auth } from '../auth/browser';
import { getAllRows, getMeta, wipeDb } from '../db/repo';
import {
  HISTORY_SUMMARY_META,
  runImport,
  type ImportState,
  type ImportSummary,
} from '../history/importer';
import { api } from '../spotify/api';
import {
  LAST_SYNC_META,
  SYNC_STATE_META,
  runSync,
  type SyncState,
} from '../sync/runner';
import { formatDateTime } from '../ui/format';
import { buildModel, type Model } from './aggregate';

export const model = signal<Model | null>(null);
export const syncState = signal<SyncState>({ status: 'idle' });
export const importState = signal<ImportState>({ status: 'idle' });
export const lastSyncAt = signal<number | null>(null);
export const historySummary = signal<ImportSummary | null>(null);
export const banner = signal<string | null>(null);

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function loadFromDb(): Promise<void> {
  try {
    model.value = buildModel(await getAllRows());
    lastSyncAt.value = (await getMeta<number>(LAST_SYNC_META)) ?? null;
    const saved = await getMeta<SyncState>(SYNC_STATE_META);
    if (saved && saved.status !== 'running') syncState.value = saved;
    historySummary.value =
      (await getMeta<ImportSummary>(HISTORY_SUMMARY_META)) ?? null;
  } catch (err) {
    banner.value = `Could not open local storage: ${describeError(err)}`;
  }
}

async function acquireWakeLock(): Promise<() => Promise<void>> {
  const sentinel = await navigator.wakeLock.request('screen');
  return () => sentinel.release();
}

function lockMessage(retryAt: number): string {
  return `Spotify quota reached. Sync again after ${formatDateTime(retryAt)}.`;
}

export async function startSync(priorityId?: string): Promise<void> {
  const current = syncState.value;
  if (current.status === 'running') return;
  if (current.status === 'locked' && current.retryAt > Date.now()) {
    banner.value = lockMessage(current.retryAt);
    return;
  }
  banner.value = null;
  await runSync(
    {
      client: api,
      now: () => Date.now(),
      onState: (state) => {
        syncState.value = state;
      },
      acquireWakeLock: 'wakeLock' in navigator ? acquireWakeLock : undefined,
    },
    { priorityId }
  );
  await loadFromDb();
  const state = syncState.value;
  if (state.status === 'error' && state.auth) {
    // Not allow-listed or login expired: back to the Connect screen with the reason.
    auth.lastAuthError.value = state.message;
    auth.logout();
    return;
  }
  if (state.status === 'error') banner.value = state.message;
  if (state.status === 'locked') banner.value = lockMessage(state.retryAt);
}

export async function startImport(files: File[]): Promise<void> {
  if (importState.value.status === 'running') return;
  banner.value = null;
  await runImport(files, {
    createWorker: () =>
      new Worker(new URL('../history/import.worker.ts', import.meta.url), {
        type: 'module',
      }),
    knownTrackIds: new Set(model.value?.tracksByKey.keys() ?? []),
    now: () => Date.now(),
    onState: (state) => {
      importState.value = state;
    },
  });
  await loadFromDb();
  const state = importState.value;
  if (state.status === 'error') banner.value = state.message;
}

export async function disconnect(): Promise<void> {
  auth.clearAll();
  await wipeDb();
  model.value = null;
  syncState.value = { status: 'idle' };
  importState.value = { status: 'idle' };
  lastSyncAt.value = null;
  historySummary.value = null;
  banner.value = null;
}
```

- [ ] **Step 5: Write the shared components**

`src/ui/components/Banner.tsx`:

```tsx
export function Banner(p: { message: string; onClose: () => void }) {
  return (
    <div class="banner" role="alert">
      <span>{p.message}</span>
      <button type="button" aria-label="Dismiss" onClick={p.onClose}>
        ×
      </button>
    </div>
  );
}
```

`src/ui/components/Progress.tsx`:

```tsx
export function Progress(p: {
  label: string;
  done: number;
  total: number;
  unit?: string;
}) {
  const unit = p.unit ?? 'playlists';
  return (
    <div class="progress">
      <div>{p.label}</div>
      {p.total > 0 && (
        <>
          <div class="progress-bar">
            <div style={{ width: `${Math.round((p.done / p.total) * 100)}%` }} />
          </div>
          <div class="muted">
            {p.done} / {p.total} {unit}
          </div>
        </>
      )}
    </div>
  );
}
```

`src/ui/components/SpotifyLink.tsx`:

```tsx
export function SpotifyLink(p: { href: string | null | undefined }) {
  if (!p.href) return null;
  return (
    <a class="spotify-link" href={p.href} target="_blank" rel="noopener">
      Open in Spotify
    </a>
  );
}
```

`src/ui/components/Empty.tsx`:

```tsx
export function Empty(p: { what: string }) {
  return (
    <div class="empty">
      <p>No {p.what} yet.</p>
      <a href="#/settings">Sync in Settings</a>
    </div>
  );
}
```

- [ ] **Step 6: Write Connect and Settings**

`src/ui/Connect.tsx`:

```tsx
import { auth } from '../auth/browser';

export function Connect() {
  const error = auth.lastAuthError.value;
  return (
    <div class="connect">
      <h1>DJ Data</h1>
      <p>
        Your most played tracks, your playlists ranked by plays, and the
        artists you have saved the most. Reads your top lists and the playlists
        you own. Nothing leaves this browser.
      </p>
      {error && <p class="error">{error}</p>}
      <button
        type="button"
        class="primary"
        onClick={() => void auth.beginLogin()}
      >
        Connect Spotify
      </button>
    </div>
  );
}
```

`src/ui/Settings.tsx`:

```tsx
import {
  disconnect,
  historySummary,
  lastSyncAt,
  startSync,
  syncState,
} from '../model/state';
import { Progress } from './components/Progress';
import { formatDateTime, plural } from './format';

export function Settings() {
  const state = syncState.value;
  const running = state.status === 'running';
  const locked = state.status === 'locked' && state.retryAt > Date.now();
  const history = historySummary.value;
  return (
    <section>
      <h1>Settings</h1>
      <div class="card">
        <h2>Spotify sync</h2>
        <p>
          Last sync:{' '}
          {lastSyncAt.value ? formatDateTime(lastSyncAt.value) : 'never'}
        </p>
        {state.status === 'running' && (
          <Progress
            label={state.current ?? 'Working'}
            done={state.done}
            total={state.total}
          />
        )}
        {state.status === 'locked' && (
          <p class={locked ? 'warn' : ''}>
            Spotify quota reached with {plural(state.pending.length, 'playlist')}{' '}
            pending.{' '}
            {locked
              ? `Retry after ${formatDateTime(state.retryAt)}.`
              : 'You can retry now.'}
          </p>
        )}
        {state.status === 'error' && (
          <p class="error">Last error: {state.message}</p>
        )}
        <button
          type="button"
          class="primary"
          disabled={running || locked}
          onClick={() => void startSync()}
        >
          {running ? 'Syncing…' : 'Sync now'}
        </button>
      </div>
      <div class="card">
        <h2>Listening history</h2>
        <p>
          {history
            ? `Imported ${formatDateTime(history.importedAt)}: ${plural(history.plays, 'play')}.`
            : 'No history imported yet. Use the Import tab.'}
        </p>
      </div>
      <div class="card">
        <h2>Disconnect</h2>
        <p>
          Removes the Spotify login and deletes every cached playlist and play
          count from this browser.
        </p>
        <button
          type="button"
          class="danger"
          onClick={() => {
            if (confirm('Disconnect and delete all local data?')) {
              void disconnect();
            }
          }}
        >
          Disconnect
        </button>
      </div>
      <p class="muted">DJ Data v{__APP_VERSION__}</p>
    </section>
  );
}
```

- [ ] **Step 7: Write app.tsx and replace main.tsx**

`src/app.tsx` (the `Screen` switch gets its remaining cases in Tasks 12 and 13):

```tsx
import { signal } from '@preact/signals';
import { auth } from './auth/browser';
import { banner } from './model/state';
import { parseRoute, routeHref, type Route } from './router';
import { Banner } from './ui/components/Banner';
import { Settings } from './ui/Settings';
import { Connect } from './ui/Connect';

export const route = signal<Route>(parseRoute(location.hash));

export function installRouter(): void {
  addEventListener('hashchange', () => {
    route.value = parseRoute(location.hash);
  });
}

const TABS: { route: Route; label: string }[] = [
  { route: { name: 'top' }, label: 'Top' },
  { route: { name: 'playlists' }, label: 'Playlists' },
  { route: { name: 'artists' }, label: 'Artists' },
  { route: { name: 'import' }, label: 'Import' },
  { route: { name: 'settings' }, label: 'Settings' },
];

function tabOf(r: Route): Route['name'] {
  if (r.name === 'playlist') return 'playlists';
  if (r.name === 'artist') return 'artists';
  return r.name;
}

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'settings':
      return <Settings />;
    default:
      return <p class="empty">Coming in the next task</p>;
  }
}

export function App() {
  if (!auth.session.value) return <Connect />;
  const current = route.value;
  return (
    <div class="app">
      {banner.value && (
        <Banner
          message={banner.value}
          onClose={() => {
            banner.value = null;
          }}
        />
      )}
      <main class="screen">
        <Screen route={current} />
      </main>
      <nav class="tabs">
        {TABS.map((tab) => (
          <a
            key={tab.label}
            href={routeHref(tab.route)}
            class={tabOf(current) === tab.route.name ? 'tab active' : 'tab'}
          >
            {tab.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
```

`src/main.tsx` (replace the placeholder):

```tsx
import { render } from 'preact';
import { App, installRouter } from './app';
import { auth } from './auth/browser';
import { loadFromDb } from './model/state';
import { AuthError } from './spotify/errors';
import './styles.css';

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  if (params.has('code') || params.has('error')) {
    try {
      await auth.completeLogin(params);
    } catch (err) {
      auth.lastAuthError.value =
        err instanceof AuthError
          ? err.message
          : `Login failed: ${err instanceof Error ? err.message : String(err)}`;
    }
    history.replaceState(null, '', location.pathname + location.hash);
  }
  installRouter();
  if (auth.session.value) await loadFromDb();
  render(<App />, document.getElementById('app')!);
}

void boot();
```

- [ ] **Step 8: Write the stylesheet**

`src/styles.css` (replace the placeholder; these classes cover Tasks 12 and 13 too):

```css
:root {
  color-scheme: dark;
  --bg: #121212;
  --surface: #1e1e1e;
  --surface-2: #2a2a2a;
  --text: #f5f5f5;
  --muted: #a0a0a0;
  --accent: #1db954;
  --danger: #e5484d;
  --warn: #f5a623;
  --tab-height: 56px;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font:
    16px/1.4 system-ui,
    -apple-system,
    'Segoe UI',
    Roboto,
    sans-serif;
}

.app {
  min-height: 100dvh;
}

.screen {
  padding: 12px 12px calc(var(--tab-height) + env(safe-area-inset-bottom) + 12px);
  max-width: 720px;
  margin: 0 auto;
}

h1 {
  font-size: 1.4rem;
  margin: 8px 0 12px;
}

h2 {
  font-size: 1.05rem;
  margin: 0 0 8px;
}

a {
  color: var(--accent);
}

.tabs {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  height: calc(var(--tab-height) + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  background: var(--surface);
  border-top: 1px solid #333;
}

.tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  text-decoration: none;
  font-size: 0.85rem;
  min-height: 48px;
}

.tab.active {
  color: var(--accent);
  font-weight: 600;
}

button {
  font: inherit;
  border: 0;
  border-radius: 8px;
  padding: 12px 16px;
  min-height: 48px;
  background: var(--surface-2);
  color: var(--text);
  cursor: pointer;
}

button:disabled {
  opacity: 0.5;
  cursor: default;
}

button.primary {
  background: var(--accent);
  color: #000;
  font-weight: 600;
}

button.danger {
  background: var(--danger);
  color: #fff;
}

.card {
  background: var(--surface);
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 12px;
}

.card ol {
  padding-left: 20px;
}

.card li {
  margin-bottom: 6px;
}

.muted {
  color: var(--muted);
}

.error {
  color: var(--danger);
}

.warn {
  color: var(--warn);
}

.banner {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  gap: 8px;
  align-items: center;
  background: #3a2a00;
  color: #ffd27a;
  padding: 10px 12px;
}

.banner button {
  min-height: 32px;
  padding: 4px 10px;
  background: transparent;
  color: inherit;
  margin-left: auto;
}

.progress-bar {
  height: 6px;
  background: var(--surface-2);
  border-radius: 3px;
  overflow: hidden;
  margin: 6px 0;
}

.progress-bar div {
  height: 100%;
  background: var(--accent);
}

.actions {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.row {
  display: flex;
  gap: 10px;
  align-items: center;
  min-height: 56px;
  padding: 8px 4px;
  border-bottom: 1px solid #2a2a2a;
}

.row .rank {
  width: 28px;
  text-align: right;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.cover {
  width: 40px;
  height: 40px;
  border-radius: 4px;
  object-fit: cover;
  flex: none;
  background: var(--surface-2);
}

.row .main {
  flex: 1;
  min-width: 0;
  color: inherit;
  text-decoration: none;
  text-align: left;
  background: none;
  padding: 0;
  min-height: 0;
  border-radius: 0;
}

.row .title {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row .sub {
  display: block;
  font-size: 0.85rem;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.badge {
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--muted);
}

.badge.plays {
  background: #143d24;
  color: #7ee2a3;
}

.badge.top {
  background: #1f2a44;
  color: #9cc0ff;
}

.spotify-link {
  font-size: 0.8rem;
  color: var(--accent);
  text-decoration: none;
  white-space: nowrap;
  padding: 8px 0;
}

.segmented {
  display: flex;
  background: var(--surface);
  border-radius: 10px;
  padding: 3px;
  margin-bottom: 10px;
}

.segmented button {
  flex: 1;
  min-height: 40px;
  padding: 8px;
  background: transparent;
  color: var(--muted);
  border-radius: 8px;
}

.segmented button.active {
  background: var(--surface-2);
  color: var(--text);
}

.filter {
  width: 100%;
  font: inherit;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid #333;
  background: var(--surface);
  color: var(--text);
  margin-bottom: 10px;
}

.empty {
  text-align: center;
  color: var(--muted);
  padding: 32px 12px;
}

.connect {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 100dvh;
  padding: 24px;
  max-width: 480px;
  margin: 0 auto;
  gap: 12px;
}

.sublist {
  list-style: none;
  margin: 0 0 0 38px;
  padding: 0 0 8px;
  font-size: 0.9rem;
  color: var(--muted);
}

.sublist li {
  padding: 6px 0;
}

.facts {
  padding-left: 18px;
}

.facts li {
  margin-bottom: 4px;
}

label.file {
  display: block;
}

label.file span {
  display: block;
  margin-bottom: 8px;
}

input[type='file'] {
  width: 100%;
}
```

- [ ] **Step 9: Verify the shell in the browser**

Run: `yarn format && yarn typecheck && yarn lint && yarn test && yarn build`
Expected: all pass.

Then, with a real `.env` containing `VITE_SPOTIFY_CLIENT_ID=<the owner's id>` and `http://127.0.0.1:5173/myOwnSpotifyData/` registered in the Spotify dashboard, run `yarn dev`, open `http://127.0.0.1:5173/myOwnSpotifyData/`, tap Connect Spotify, approve, and confirm the app returns with the tab bar visible and Settings showing "Last sync: never". If the Client ID is not available, confirm instead that the Connect screen renders and the button navigates to `accounts.spotify.com` with `code_challenge` in the URL. Stop the server.

- [ ] **Step 10: Commit**

```bash
git add src
git commit -m "feat(ui): app shell, connect and settings screens, state signals

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

---

### Task 12: Top, Playlists and Playlist screens

**Files:**
- Create: `src/ui/components/Badge.tsx`, `src/ui/components/PlaysBadge.tsx`, `src/ui/components/TrackRow.tsx`, `src/ui/components/Segmented.tsx`, `src/ui/components/Filter.tsx`, `src/ui/Top.tsx`, `src/ui/Playlists.tsx`, `src/ui/Playlist.tsx`
- Modify: `src/app.tsx` (`Screen` cases)

**Interfaces:**
- Consumes: state signals and `startSync` (Task 11), `topTracks`/`topArtists`/`playlistRanking`/`PlaysInfo` (Task 10), `normalize` (Task 10), `routeHref` (Task 1), format helpers and components (Task 11).
- Produces: `Badge({ kind?, children })`, `PlaysBadge({ plays: PlaysInfo | null })`, `TrackRow({ rank?, imageUrl?, title, subtitle?, href?, onClick?, spotifyUrl?, badges?, children? })`, `Segmented<T extends string>({ options, value, onChange })`, `Filter({ value, onInput, placeholder })`, screens `Top`, `Playlists`, `Playlist({ id })`.

- [ ] **Step 1: Write the list components**

`src/ui/components/Badge.tsx`:

```tsx
import type { ComponentChildren } from 'preact';

export function Badge(p: {
  kind?: 'plays' | 'top';
  children: ComponentChildren;
}) {
  return <span class={p.kind ? `badge ${p.kind}` : 'badge'}>{p.children}</span>;
}
```

`src/ui/components/PlaysBadge.tsx`:

```tsx
import type { PlaysInfo } from '../../model/aggregate';
import { plural } from '../format';
import { Badge } from './Badge';

export function PlaysBadge(p: { plays: PlaysInfo | null }) {
  if (!p.plays) return null;
  return (
    <Badge kind="plays">
      {plural(p.plays.plays, 'play')}
      {p.plays.source === 'name' ? ' (by name)' : ''}
    </Badge>
  );
}
```

`src/ui/components/TrackRow.tsx`:

```tsx
import type { ComponentChildren } from 'preact';
import { SpotifyLink } from './SpotifyLink';

export function TrackRow(p: {
  rank?: number;
  imageUrl?: string | null;
  title: string;
  subtitle?: string;
  href?: string;
  onClick?: () => void;
  spotifyUrl?: string | null;
  badges?: ComponentChildren;
  children?: ComponentChildren;
}) {
  const main = (
    <>
      <span class="title">{p.title}</span>
      {p.subtitle && <span class="sub">{p.subtitle}</span>}
      {p.badges && <div class="badges">{p.badges}</div>}
    </>
  );
  return (
    <li>
      <div class="row">
        {p.rank !== undefined && <span class="rank">{p.rank}</span>}
        {p.imageUrl && (
          <img class="cover" src={p.imageUrl} loading="lazy" alt="" />
        )}
        {p.href ? (
          <a class="main" href={p.href}>
            {main}
          </a>
        ) : p.onClick ? (
          <button type="button" class="main" onClick={p.onClick}>
            {main}
          </button>
        ) : (
          <div class="main">{main}</div>
        )}
        <SpotifyLink href={p.spotifyUrl} />
      </div>
      {p.children}
    </li>
  );
}
```

`src/ui/components/Segmented.tsx`:

```tsx
export function Segmented<T extends string>(p: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div class="segmented" role="tablist">
      {p.options.map((o) => (
        <button
          type="button"
          key={o.value}
          role="tab"
          aria-selected={o.value === p.value}
          class={o.value === p.value ? 'active' : ''}
          onClick={() => p.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
```

`src/ui/components/Filter.tsx`:

```tsx
export function Filter(p: {
  value: string;
  onInput: (value: string) => void;
  placeholder: string;
}) {
  return (
    <input
      class="filter"
      type="search"
      placeholder={p.placeholder}
      value={p.value}
      onInput={(e) => p.onInput((e.currentTarget as HTMLInputElement).value)}
    />
  );
}
```

- [ ] **Step 2: Write the Top screen**

`src/ui/Top.tsx`:

```tsx
import { signal } from '@preact/signals';
import type { Period } from '../db/schema';
import { topArtists, topTracks } from '../model/aggregate';
import { model } from '../model/state';
import { routeHref } from '../router';
import { Badge } from './components/Badge';
import { Empty } from './components/Empty';
import { PlaysBadge } from './components/PlaysBadge';
import { Segmented } from './components/Segmented';
import { TrackRow } from './components/TrackRow';
import { PERIOD_LABEL, artistNames, plural } from './format';

const period = signal<Period>('short_term');
const kind = signal<'tracks' | 'artists'>('tracks');
const expanded = signal<string | null>(null);

const PERIOD_OPTIONS = (
  ['short_term', 'medium_term', 'long_term'] as const
).map((value) => ({ value, label: PERIOD_LABEL[value] }));

export function Top() {
  const m = model.value;
  if (!m || m.topItems.size === 0) return <Empty what="top lists" />;
  return (
    <section>
      <h1>Most played</h1>
      <Segmented
        options={PERIOD_OPTIONS}
        value={period.value}
        onChange={(v) => {
          period.value = v;
        }}
      />
      <Segmented
        options={[
          { value: 'tracks', label: 'Tracks' },
          { value: 'artists', label: 'Artists' },
        ]}
        value={kind.value}
        onChange={(v) => {
          kind.value = v;
        }}
      />
      {kind.value === 'tracks' ? (
        <ul class="list">
          {topTracks(m, period.value).map((t) => (
            <TrackRow
              key={t.item.id}
              rank={t.item.rank}
              imageUrl={t.item.imageUrl}
              title={t.item.name}
              subtitle={artistNames(t.item.artists)}
              spotifyUrl={t.item.spotifyUrl}
              onClick={() => {
                expanded.value = expanded.value === t.item.id ? null : t.item.id;
              }}
              badges={
                <>
                  <Badge>{plural(t.playlistIds.length, 'playlist')}</Badge>
                  <PlaysBadge plays={t.plays} />
                </>
              }
            >
              {expanded.value === t.item.id && t.playlistIds.length > 0 && (
                <ul class="sublist">
                  {t.playlistIds.map((id) => (
                    <li key={id}>
                      <a href={routeHref({ name: 'playlist', id })}>
                        {m.playlistsById.get(id)?.name ?? id}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </TrackRow>
          ))}
        </ul>
      ) : (
        <ul class="list">
          {topArtists(m, period.value).map((a) => (
            <TrackRow
              key={a.item.id}
              rank={a.item.rank}
              imageUrl={a.item.imageUrl}
              title={a.item.name}
              subtitle={`${plural(a.savedTracks, 'saved track')} · ${plural(a.playlistCount, 'playlist')}`}
              href={routeHref({ name: 'artist', key: a.item.id })}
              spotifyUrl={a.item.spotifyUrl}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Write the Playlists and Playlist screens**

`src/ui/Playlists.tsx`:

```tsx
import { signal } from '@preact/signals';
import { normalize } from '../model/normalize';
import { model, syncState } from '../model/state';
import { routeHref } from '../router';
import { Badge } from './components/Badge';
import { Empty } from './components/Empty';
import { Filter } from './components/Filter';
import { TrackRow } from './components/TrackRow';
import { plural } from './format';

const filter = signal('');

export function Playlists() {
  const m = model.value;
  if (!m || m.playlists.length === 0) return <Empty what="playlists" />;
  const state = syncState.value;
  const pending = new Set(state.status === 'idle' ? [] : state.pending);
  const query = normalize(filter.value);
  const list = query
    ? m.playlists.filter((p) => normalize(p.name).includes(query))
    : m.playlists;
  return (
    <section>
      <h1>Playlists</h1>
      <Filter
        value={filter.value}
        onInput={(v) => {
          filter.value = v;
        }}
        placeholder="Filter playlists"
      />
      <ul class="list">
        {list.map((p) => (
          <TrackRow
            key={p.id}
            imageUrl={p.imageUrl}
            title={p.name}
            subtitle={plural(m.entriesByPlaylist.get(p.id)?.length ?? 0, 'track')}
            href={routeHref({ name: 'playlist', id: p.id })}
            spotifyUrl={p.spotifyUrl}
            badges={pending.has(p.id) ? <Badge>pending</Badge> : undefined}
          />
        ))}
      </ul>
    </section>
  );
}
```

`src/ui/Playlist.tsx`:

```tsx
import { signal } from '@preact/signals';
import { playlistRanking } from '../model/aggregate';
import { model, startSync, syncState } from '../model/state';
import { Badge } from './components/Badge';
import { PlaysBadge } from './components/PlaysBadge';
import { Segmented } from './components/Segmented';
import { SpotifyLink } from './components/SpotifyLink';
import { TrackRow } from './components/TrackRow';
import { PERIOD_LABEL, artistNames, plural } from './format';

const order = signal<'plays' | 'order'>('plays');

export function Playlist({ id }: { id: string }) {
  const m = model.value;
  const playlist = m?.playlistsById.get(id);
  if (!m || !playlist) {
    return (
      <div class="empty">
        <p>Playlist not synced yet.</p>
        <a href="#/playlists">Back to playlists</a>
      </div>
    );
  }
  const ranked = playlistRanking(m, id);
  const rows =
    order.value === 'plays'
      ? ranked
      : [...ranked].sort((a, b) => a.entry.position - b.entry.position);
  const sync = syncState.value;
  const busy =
    sync.status === 'running' ||
    (sync.status === 'locked' && sync.retryAt > Date.now());
  return (
    <section>
      <h1>{playlist.name}</h1>
      <p class="muted">
        {plural(ranked.length, 'track')} · <SpotifyLink href={playlist.spotifyUrl} />
      </p>
      <div class="actions">
        <button type="button" disabled={busy} onClick={() => void startSync(id)}>
          {busy ? 'Syncing…' : 'Sync this playlist'}
        </button>
      </div>
      <Segmented
        options={[
          { value: 'plays', label: 'By plays' },
          { value: 'order', label: 'Playlist order' },
        ]}
        value={order.value}
        onChange={(v) => {
          order.value = v;
        }}
      />
      <ul class="list">
        {rows.map((r, i) => (
          <TrackRow
            key={r.entry.position}
            rank={i + 1}
            title={r.track.name}
            subtitle={artistNames(r.track.artists)}
            spotifyUrl={r.track.spotifyUrl}
            badges={
              <>
                <PlaysBadge plays={r.plays} />
                {r.inTop.map((p) => (
                  <Badge kind="top" key={p}>
                    Top {PERIOD_LABEL[p]}
                  </Badge>
                ))}
              </>
            }
          />
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Route the new screens**

In `src/app.tsx`, add the imports:

```tsx
import { Playlist } from './ui/Playlist';
import { Playlists } from './ui/Playlists';
import { Top } from './ui/Top';
```

and replace the `Screen` function with:

```tsx
function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'top':
      return <Top />;
    case 'playlists':
      return <Playlists />;
    case 'playlist':
      return <Playlist id={route.id} />;
    case 'settings':
      return <Settings />;
    default:
      return <p class="empty">Coming in the next task</p>;
  }
}
```

- [ ] **Step 5: Verify and commit**

Run: `yarn format && yarn typecheck && yarn lint && yarn test && yarn build`
Expected: all pass.

With `yarn dev` and a connected account: tap Settings, Sync now, watch the progress, then check Top shows ranked tracks with playlist badges, Playlists lists your playlists, and a playlist opens ranked (all plays badges absent until the history import in Task 13). Stop the server.

```bash
git add src
git commit -m "feat(ui): top, playlists and playlist screens

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

---

### Task 13: Artists, Artist and Import screens

**Files:**
- Create: `src/ui/Artists.tsx`, `src/ui/Artist.tsx`, `src/ui/Import.tsx`
- Modify: `src/app.tsx` (`Screen` cases)

**Interfaces:**
- Consumes: `model`, `importState`, `historySummary`, `startImport` (Task 11), `artistTracks` (Task 10), `ImportSummary` (Task 9), components (Tasks 11 and 12).
- Produces: screens `Artists`, `Artist({ artistKey })`, `Import`.

- [ ] **Step 1: Write the Artists and Artist screens**

`src/ui/Artists.tsx`:

```tsx
import { signal } from '@preact/signals';
import { normalize } from '../model/normalize';
import { model } from '../model/state';
import { routeHref } from '../router';
import { Empty } from './components/Empty';
import { Filter } from './components/Filter';
import { TrackRow } from './components/TrackRow';
import { artistUrl, plural } from './format';

const filter = signal('');

export function Artists() {
  const m = model.value;
  if (!m || m.artists.length === 0) return <Empty what="artists" />;
  const query = normalize(filter.value);
  const list = query
    ? m.artists.filter((a) => normalize(a.name).includes(query))
    : m.artists;
  return (
    <section>
      <h1>Artists by saved tracks</h1>
      <Filter
        value={filter.value}
        onInput={(v) => {
          filter.value = v;
        }}
        placeholder="Filter artists"
      />
      <ul class="list">
        {list.map((a, i) => (
          <TrackRow
            key={a.key}
            rank={i + 1}
            title={a.name}
            subtitle={`${plural(a.trackKeys.size, 'track')} · ${plural(a.playlistIds.size, 'playlist')}`}
            href={routeHref({ name: 'artist', key: a.key })}
            spotifyUrl={artistUrl(a.id)}
          />
        ))}
      </ul>
    </section>
  );
}
```

`src/ui/Artist.tsx`:

```tsx
import { artistTracks } from '../model/aggregate';
import { model } from '../model/state';
import { routeHref } from '../router';
import { PlaysBadge } from './components/PlaysBadge';
import { SpotifyLink } from './components/SpotifyLink';
import { TrackRow } from './components/TrackRow';
import { artistUrl, plural } from './format';

export function Artist({ artistKey }: { artistKey: string }) {
  const m = model.value;
  const agg = m?.artistsByKey.get(artistKey);
  if (!m || !agg) {
    return (
      <div class="empty">
        <p>No saved tracks for this artist.</p>
        <a href="#/artists">Back to artists</a>
      </div>
    );
  }
  const tracks = artistTracks(m, artistKey);
  return (
    <section>
      <h1>{agg.name}</h1>
      <p class="muted">
        {plural(tracks.length, 'saved track')} in{' '}
        {plural(agg.playlistIds.size, 'playlist')} ·{' '}
        <SpotifyLink href={artistUrl(agg.id)} />
      </p>
      <ul class="list">
        {tracks.map((t) => (
          <TrackRow
            key={t.track.key}
            title={t.track.name}
            subtitle={t.track.album}
            spotifyUrl={t.track.spotifyUrl}
            badges={<PlaysBadge plays={t.plays} />}
          >
            <ul class="sublist">
              {t.playlistIds.map((id) => (
                <li key={id}>
                  <a href={routeHref({ name: 'playlist', id })}>
                    {m.playlistsById.get(id)?.name ?? id}
                  </a>
                </li>
              ))}
            </ul>
          </TrackRow>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Write the Import screen**

`src/ui/Import.tsx`:

```tsx
import type { ImportSummary } from '../history/importer';
import { historySummary, importState, startImport } from '../model/state';
import { Progress } from './components/Progress';
import { formatDate, formatDateTime, plural } from './format';

function Summary({ summary }: { summary: ImportSummary }) {
  const c = summary.counts;
  return (
    <ul class="facts">
      <li>
        {plural(summary.plays, 'play')} credited across{' '}
        {plural(summary.tracks, 'track')}
      </li>
      <li>{plural(summary.matchedTracks, 'track')} matched your playlists</li>
      {summary.range && (
        <li>
          From {formatDate(summary.range.first)} to{' '}
          {formatDate(summary.range.last)}
        </li>
      )}
      <li>
        Imported {formatDateTime(summary.importedAt)} from{' '}
        {plural(summary.processed.length, 'file')}
      </li>
      <li class="muted">
        Not counted: {c.short.toLocaleString()} under 30 s,{' '}
        {c.podcast.toLocaleString()} podcast, {c.audiobook.toLocaleString()}{' '}
        audiobook, {c.unattributed.toLocaleString()} without a track id,{' '}
        {c.malformed.toLocaleString()} unreadable
      </li>
      {summary.skipped.map((s) => (
        <li class="error" key={s.name}>
          Skipped {s.name}: {s.reason}
        </li>
      ))}
    </ul>
  );
}

export function Import() {
  const state = importState.value;
  const summary = historySummary.value;
  const onChange = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length > 0) void startImport(files);
  };
  return (
    <section>
      <h1>Import listening history</h1>
      <div class="card">
        <h2>How to get the file</h2>
        <ol>
          <li>Open spotify.com/account/privacy and sign in.</li>
          <li>
            Under "Download your data", tick{' '}
            <strong>Extended streaming history</strong> only, then request it.
          </li>
          <li>Confirm the email Spotify sends within 14 days.</li>
          <li>
            When the "your data is ready" email arrives (hours to a few weeks),
            download my_spotify_data.zip to this phone.
          </li>
          <li>
            Pick that zip below. Nothing is uploaded; the file is read here and
            only per-track play counts are kept.
          </li>
        </ol>
      </div>
      <div class="card">
        <label class="file">
          <span>Pick my_spotify_data.zip, or the JSON files inside it</span>
          <input
            type="file"
            accept=".zip,.json,application/zip,application/json"
            multiple
            disabled={state.status === 'running'}
            onChange={onChange}
          />
        </label>
        {state.status === 'running' && (
          <Progress
            label={state.file}
            done={state.index}
            total={state.total}
            unit="files"
          />
        )}
        {state.status === 'error' && <p class="error">{state.message}</p>}
      </div>
      {summary && (
        <div class="card">
          <h2>Last import</h2>
          <Summary summary={summary} />
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Route the new screens**

In `src/app.tsx`, add the imports:

```tsx
import { Artist } from './ui/Artist';
import { Artists } from './ui/Artists';
import { Import } from './ui/Import';
```

and make `Screen` exhaustive (no `default` any more):

```tsx
function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'top':
      return <Top />;
    case 'playlists':
      return <Playlists />;
    case 'playlist':
      return <Playlist id={route.id} />;
    case 'artists':
      return <Artists />;
    case 'artist':
      return <Artist artistKey={route.key} />;
    case 'import':
      return <Import />;
    case 'settings':
      return <Settings />;
  }
}
```

- [ ] **Step 4: Verify and commit**

Run: `yarn format && yarn typecheck && yarn lint && yarn test && yarn build`
Expected: all pass.

With `yarn dev`: Artists lists ranked artists, an artist shows tracks with their playlists. On Import, pick a zip (a real export if available, otherwise a zip built from the fixtures in `src/history/process.test.ts`) and confirm the summary appears and plays badges show on Top and Playlist screens. Stop the server.

```bash
git add src
git commit -m "feat(ui): artists, artist and import screens

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

---

### Task 14: PWA manifest and icons, GitHub Pages deploy, README and CLAUDE.md

**Files:**
- Create: `public/manifest.webmanifest`, `public/icon-192.png`, `public/icon-512.png`
- Modify: `.github/workflows/ci.yml`, `README.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: the built app (`yarn build` → `dist/`), `VITE_SPOTIFY_CLIENT_ID` (Task 1).
- Produces: a deployable site and the owner's setup checklist.

- [ ] **Step 1: Write the manifest and generate the icons**

`public/manifest.webmanifest`:

```json
{
  "name": "DJ Data",
  "short_name": "DJ Data",
  "start_url": "/myOwnSpotifyData/",
  "scope": "/myOwnSpotifyData/",
  "display": "standalone",
  "background_color": "#121212",
  "theme_color": "#121212",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
    {
      "src": "icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

Generate the two icons once (a Spotify-green disc on the app's dark background; no image library needed):

```bash
python3 - <<'EOF'
import struct, zlib

def png(size, path):
    cx = cy = size / 2
    r = size * 0.36
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            inside = (x - cx + 0.5) ** 2 + (y - cy + 0.5) ** 2 <= r * r
            row += bytes((29, 185, 84) if inside else (18, 18, 18))
        rows.append(bytes(row))
    raw = b''.join(rows)
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    out = b'\x89PNG\r\n\x1a\n'
    out += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
    out += chunk(b'IDAT', zlib.compress(raw, 9))
    out += chunk(b'IEND', b'')
    open(path, 'wb').write(out)

png(192, 'public/icon-192.png')
png(512, 'public/icon-512.png')
EOF
file public/icon-192.png public/icon-512.png
```

Expected: both reported as `PNG image data, 192 x 192` and `512 x 512`.

- [ ] **Step 2: Add the deploy job to CI**

Check the current major versions of the three Pages actions before writing them (each prints a `tag_name`):

```bash
for a in configure-pages upload-pages-artifact deploy-pages; do gh api repos/actions/$a/releases/latest --jq '.tag_name'; done
```

Replace `.github/workflows/ci.yml` with the following, substituting the majors printed above if they differ from `v6`, `v5`, `v5`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: yarn
      - run: yarn install --frozen-lockfile
      - run: yarn typecheck
      - run: yarn lint
      - run: yarn test

  deploy:
    needs: check
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: yarn
      - run: yarn install --frozen-lockfile
      - run: yarn build
        env:
          VITE_SPOTIFY_CLIENT_ID: ${{ secrets.VITE_SPOTIFY_CLIENT_ID }}
      - uses: actions/configure-pages@v6
      - uses: actions/upload-pages-artifact@v5
        with:
          path: dist
      - id: deployment
        uses: actions/deploy-pages@v5
```

- [ ] **Step 3: Rewrite README.md**

````markdown
# myOwnSpotifyData

A small browser-only web app for preparing DJ sets from my own Spotify data:
most played tracks and artists per period, each playlist ranked by real play
counts, and artists ranked by how many of their tracks I have saved.

It runs entirely in the browser: login with PKCE, playlists cached in
IndexedDB, and Spotify's *Extended streaming history* export imported locally
for play counts. Nothing is uploaded anywhere.

## Run locally

```sh
cp .env.example .env   # set VITE_SPOTIFY_CLIENT_ID
yarn
yarn dev               # open http://127.0.0.1:5173/myOwnSpotifyData/ (not localhost)
```

## Scripts

| Command          | What it does                                  |
| ---------------- | --------------------------------------------- |
| `yarn dev`       | Vite dev server                               |
| `yarn build`     | Production build to `dist/`                   |
| `yarn preview`   | Serve the production build locally            |
| `yarn test`      | Run the Vitest suite                          |
| `yarn lint`      | Lint with ESLint                              |
| `yarn typecheck` | Type-check without emitting                   |
| `yarn format`    | Format with Prettier                          |

## One-time setup

1. Spotify developer dashboard: create an app with the **Web API** only. Under
   Settings add both redirect URIs, exactly:
   `http://127.0.0.1:5173/myOwnSpotifyData/` and
   `https://vatheo.github.io/myOwnSpotifyData/`. Under User Management add
   the account that will use the app. The owner needs Spotify Premium
   (Development Mode requirement).
2. GitHub: make the repository public, set Pages → Source to *GitHub
   Actions*, and add the repository secret `VITE_SPOTIFY_CLIENT_ID`.
3. Push to `main`. CI type-checks, lints, tests, builds and deploys to
   `https://vatheo.github.io/myOwnSpotifyData/`.
4. On the phone, open that URL in Chrome and use "Add to Home Screen".

## Using it

- **Settings → Sync now** fetches your top lists and the playlists you own.
  Spotify enforces an unpublished daily quota on playlist reads; if it hits,
  the app keeps what it synced and tells you when to retry.
- **Import** takes `my_spotify_data.zip` from Spotify's privacy page
  (request *Extended streaming history*; it arrives by email). A play counts
  once a track was listened to for at least 30 seconds.
- **Disconnect** in Settings removes the login and all cached data.
````

- [ ] **Step 4: Rewrite CLAUDE.md**

````markdown
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Browser-only Preact web app the owner (a DJ) uses on an Android phone to see
their most played Spotify tracks, rank their own playlists by play count, and
rank artists by saved tracks. Public repo `vaTheo/myOwnSpotifyData`, single
`main` branch, deployed to GitHub Pages at
`https://vatheo.github.io/myOwnSpotifyData/`. Keep it lean: the owner has
explicitly declined extra tooling (commit hooks, Dependabot, branch
protection, PR templates) and wants the minimum that solves the request.

Design spec: `docs/superpowers/specs/2026-09-04-spotify-dj-webapp-design.md`.
Verified Spotify platform facts: `docs/superpowers/research/2026-09-04-spotify-platform-research.md`.

## Commands

Node 24 (`.nvmrc`), yarn classic 1.22. Install with `yarn`.

| Task                                     | Command                          |
| ---------------------------------------- | -------------------------------- |
| Dev server (open via 127.0.0.1)          | `yarn dev`                       |
| All tests                                | `yarn test`                      |
| One test file                            | `yarn test src/router.test.ts`   |
| Tests matching a name                    | `yarn test -t "throws when"`     |
| Watch mode                               | `yarn vitest`                    |
| Type-check (includes test files)         | `yarn typecheck`                 |
| Lint                                     | `yarn lint`                      |
| Format (not enforced in CI)              | `yarn format`                    |
| Production build to `dist/`              | `yarn build`                     |

CI (`.github/workflows/ci.yml`) runs `yarn install --frozen-lockfile`, `typecheck`, `lint`, `test` on every push to `main` and every PR, then a `deploy` job builds with the `VITE_SPOTIFY_CLIENT_ID` secret and publishes `dist/` to GitHub Pages on pushes to `main`. Run the three checks locally before pushing.

## Architecture

`src/` is one Vite app. Pure, unit-tested cores sit behind thin I/O edges:

- `auth/` PKCE helpers and the session store (`createSessionStore`), with `browser.ts` holding the app instance.
- `spotify/` the API client (`createClient`: bearer, 401 refresh-once, 429 backoff, quota lock-out, one request in flight) and the API types.
- `db/` `idb` schema and repository. Stores: `playlists`, `tracks`, `entries` (keyed `[playlistId, position]`), `topItems`, `plays`, `meta`.
- `sync/` planner (pure diff on `snapshot_id`), item mapper, runner (commits one playlist per transaction, persists `locked`/`error` state in meta).
- `history/` export file matching, the 30-second play rule, zip processing (`process.ts`, one file in memory at a time), the worker and the main-thread importer.
- `model/` in-memory aggregation (`buildModel`) and signals (`state.ts`).
- `ui/` one Preact component per screen plus small shared components; hash routes from `router.ts`.

## Conventions that are easy to get wrong

- **Bundler resolution.** `tsconfig.json` uses `moduleResolution: bundler`; relative imports carry **no** extension. Vite compiles JSX itself (`jsx: react-jsx`, `jsxImportSource: preact`); there is no framework plugin.
- **Tests sit next to source** as `src/**/*.test.ts`, run in Vitest's Node environment. IndexedDB tests import `fake-indexeddb/auto`. No DOM or component tests.
- **Only one setting exists**: `VITE_SPOTIFY_CLIENT_ID`, from `.env` locally and a repository secret in CI. The redirect URI is computed at runtime (`env.ts`). There is no client secret anywhere and must never be.
- **Never open `localhost`.** Spotify rejects it as a redirect URI; use `http://127.0.0.1:5173/myOwnSpotifyData/`.
- **Never sync on page load.** Spotify's unpublished daily quota on playlist reads locks accounts out for hours. Sync only from the Settings button or a playlist's own button.
- **Every failure is shown.** Errors end in a state signal that Settings or a banner renders; nothing is swallowed.

## Pinned dependencies (do not bump blindly)

- `typescript` is pinned `~6.0.3`. `typescript-eslint` 8.x supports TS `<6.1` only; TS 7 (npm `latest`) crashes `yarn lint`.
- `vite` is an explicit devDependency: Vitest declares it as a peer and yarn classic does not install peers, and the app build uses it directly.

## Style

ESLint flat config (`eslint.config.js`): `@eslint/js` recommended + `typescript-eslint` recommended + `eslint-config-prettier`. Prettier: single quotes, semicolons, ES5 trailing commas, 80 columns.
````

- [ ] **Step 5: Final verification and commit**

Run: `yarn format && yarn typecheck && yarn lint && yarn test && yarn build`
Expected: all pass; `dist/manifest.webmanifest`, `dist/icon-192.png` and `dist/icon-512.png` exist; `dist/assets/` contains a separate worker chunk for the importer.

Run `yarn preview` and open `http://127.0.0.1:4173/myOwnSpotifyData/`: the app loads from the production build. Stop the server.

```bash
git add -A
git commit -m "chore: PWA manifest and icons, GitHub Pages deploy job, docs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

Then report to the owner the four things only they can do: make the repo public, set Pages to GitHub Actions, add the `VITE_SPOTIFY_CLIENT_ID` secret, register the two redirect URIs and add their account in the Spotify dashboard. Do not push.
