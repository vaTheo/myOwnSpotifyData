# Contract: the browser-side server modules (`src/server/`)

Pure cores behind thin edges, as the rest of `src/` ([How it works](../../../docs/architecture/000-how-it-works.md) §2). Tests next to
each file; no DOM tests.

## `index.html` (security review S6, E2)

A `<meta http-equiv="Content-Security-Policy">` with `default-src 'self'; connect-src 'self' https://api.spotify.com
https://accounts.spotify.com %VITE_SUPABASE_URL% <every lookup host the app fetches>; script-src 'self' https://api.deezer.com;
frame-src https://w.soundcloud.com; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self';
form-action 'self'`. Vite replaces `%VITE_SUPABASE_URL%` at build time. The host list is built from
`grep -rhoE 'https://[a-z0-9.-]+' src` minus the link-only hosts, and verified feature by feature.

## `src/env.ts`

```ts
export const SUPABASE_URL: string;   // '' when unset → status 'unset'
export const SUPABASE_KEY: string;
```

## `src/server/client.ts`

```ts
export interface ServerDeps { fetchFn: typeof fetch; baseUrl: string; apiKey: string; now: () => number }
export type ServerResult<T> =
  | { ok: true; value: T }
  | { ok: false; kind: 'offline' | 'paused' | 'unauthorized' | 'tooLarge' | 'error'; message: string; status?: number };

export interface ServerClient {
  requestLink(email: string, redirectTo: string, codeChallenge: string): Promise<ServerResult<void>>;
  exchangeCode(authCode: string, codeVerifier: string): Promise<ServerResult<ServerTokens>>;
  refresh(refreshToken: string): Promise<ServerResult<ServerTokens>>;
  signOut(accessToken: string): Promise<ServerResult<void>>;
  select<T>(table: string, query: Record<string, string>, token: string, range?: [number, number]): Promise<ServerResult<{ rows: T[]; total: number | null }>>;
  upsert<T>(table: string, rows: T[], token: string): Promise<ServerResult<void>>;
  remove(table: string, query: Record<string, string>, token: string): Promise<ServerResult<void>>;
  rpc<T>(name: string, token: string): Promise<ServerResult<T>>;
}
export function createServerClient(deps: ServerDeps): ServerClient;
```

Never throws; a 401 on a data call is returned as `unauthorized` and the session layer decides whether to refresh.

## `src/server/session.ts`

```ts
export interface ServerSession { accessToken: string; refreshToken: string; expiresAt: number; email: string }
export interface ServerSessionStore {
  session: Signal<ServerSession | null>;
  requestLink(email: string): Promise<ServerResult<void>>;          // makes a verifier (randomString) + challenge (challengeFor), stores 'server-pkce', POST /otp with redirectUri() + '?link=server'
  completeLink(params: URLSearchParams): Promise<'none' | 'ok' | 'invalid'>;  // needs params.get('link') === 'server' and 'code'; exchanges with the stored verifier; clears 'server-pkce'
  linkSent: Signal<string | null>;                                   // the email a link was sent to, for the generic Settings notice
  getAccessToken(): Promise<ServerResult<string>>;   // refreshes with the same margin as auth/session.ts
  signOut(): Promise<void>;
}
export function createServerSessionStore(deps: { client: ServerClient; storage: StorageLike; now: () => number }): ServerSessionStore;
```

## `src/server/datasets.ts` (pure)

```ts
export type DatasetName = 'library' | 'history' | 'features' | 'reach';
export interface DatasetDef { name: DatasetName; stores: readonly StoreName[]; stamp(rows: AllRows, metas: Metas): number | null; summary(metas: Metas): unknown }
export const DATASETS: readonly DatasetDef[];
export function rowKey(store: StoreName, row: unknown): string;
export function compareStamps(local: number | null, server: number | null): 'push' | 'pull' | 'same';
export function batches<T>(rows: T[], size?: number): T[][];                 // default 500
export function planMixes(local: MixRow[], server: MixStamp[]): { push: MixRow[]; pull: string[]; deleteLocal: string[] };
```

## `src/server/validate.ts` (pure, security review S3)

```ts
export type Rejected = { store: string; key: string; reason: string };
export function validateRow(store: StoreName, row: unknown): { ok: true; row: AllRowsValue } | { ok: false; reason: string };
export function validateMix(row: unknown): { ok: true; row: MixRow } | { ok: false; reason: string };
export function validateSummary(name: DatasetName, value: unknown): boolean;
```

Rules: keys are non-empty strings; `playerSrc` is null or starts with `SC_PLAYER_PREFIX`; `spotifyUrl` is null or starts with
`https://open.spotify.com/`; `sourceUrl`, `linkOut`, `shazamUrl`, `imageUrl`, `playlistUrl` are null/absent or `https:` URLs;
numbers are finite; `historySummary.version === 2`, `artistReachSummary.version === 1`; unknown extra fields are kept (optional
fields need no bump, ADR-05). A pull drops a failing row, counts it, and `serverState` reports "n rows rejected".

## `src/server/sync.ts`

```ts
export interface SyncDeps { client: ServerClient; token: () => Promise<ServerResult<string>>; repo: RepoLike; now: () => number; onState: (s: ServerStatus) => void; dbVersion: number }
export function runPush(deps: SyncDeps, datasets: (DatasetName | 'mixes')[]): Promise<ServerResult<void>>;
export function runPull(deps: SyncDeps): Promise<ServerResult<{ pulled: string[] }>>;
export function runRemoveAll(deps: SyncDeps): Promise<ServerResult<void>>;
export function readUsage(deps: SyncDeps): Promise<ServerResult<number>>;
```

`runPull` validates every row and summary with `validate.ts` before `replaceDataset`. `RepoLike` is the handful of `db/repo.ts` functions the runners need (`getAllRows`, `getMeta`, `putMeta`, `replaceDataset`,
`getMixes`, `putMix`, `deleteMix`), injected so tests run on `fake-indexeddb` or a stub.

## `src/db/repo.ts` additions (no `DB_VERSION` bump)

```ts
export async function replaceDataset(name: DatasetName, rows: Partial<AllRows>, metas: Record<string, unknown>): Promise<void>;
// one readwrite transaction over the dataset's stores + meta: clear, put all, put summaries
```

## `src/sync/runner.ts` addition (pure)

```ts
export type ConnectedAccount = 'set' | 'same' | 'mismatch';
export function resolveConnectedAccount(cached: string | undefined, me: string): ConnectedAccount;
export const ACCOUNT_MISMATCH_NOTICE: string;   // "Signed in as a different Spotify account. Sync now to switch; local data is kept until you confirm."
```

## `src/model/state.ts` additions

`recordConnectedAccount()`: `api.get<ApiProfile>('/me')` once, then `resolveConnectedAccount(await getMeta(ACCOUNT_META), me.id)`:
`set` → `putMeta(ACCOUNT_META, me.id)`; `same` → nothing; `mismatch` → `banner = warnBanner(ACCOUNT_MISMATCH_NOTICE)` and no pull.
A failed `/me` (offline, 401) is shown as a banner and the pull is skipped; nothing else changes. Called from `main.tsx` right after
`auth.completeLogin(params)` returns `'ok'`, before `loadFromDb()`.


`serverState` signal; `startServerLink` (sends the email), `startServerSignOut`, `startServerPull` (joins `jobsBusy()`), `queueServerPush`
(flags `serverPending`, runs one push at a time, never joins `jobsBusy()`), `removeServerData` (the one new `confirm()`); the five
job wrappers and the mix save/delete paths call `queueServerPush` at their tail; `disconnect` resets the signals and keeps the
server session and data.

## `src/main.tsx`

In `boot()`, beside the Spotify branch: `const serverLink = params.get('link') === 'server';` → `await completeServerLink(params)`,
then `history.replaceState(history.state, '', location.pathname + '#/settings')`. The Spotify branch is `!serverLink && (params.has('code') || params.has('error'))`,
so the two `?code=` callbacks never meet.

## `src/ui/Settings.tsx`

A `ServerCard` above "Disconnect": the status line, the email field and "Send me a link" (signed out; then the generic "If this email
has an account, a link was sent. Open it on this device, in this browser, within 10 minutes."), per-dataset stamps and the used share
(connected), "Sync now with server", "Sign out", "Remove server data" (danger). The Disconnect paragraph gains "Server data is
kept."
