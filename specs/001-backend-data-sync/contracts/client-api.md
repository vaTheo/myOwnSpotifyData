# Contract: the browser-side server modules (`src/server/`)

Pure cores behind thin edges, as the rest of `src/` ([How it works](../../../docs/architecture/000-how-it-works.md) §2). Tests next to
each file; no DOM tests.

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
  requestLink(email: string, redirectTo: string): Promise<ServerResult<void>>;
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
  requestLink(email: string): Promise<ServerResult<void>>;          // POST /otp with redirectUri()
  completeLink(hash: string): 'none' | 'ok' | 'invalid';           // pure parse of '#access_token=…'; stores the session
  linkSent: Signal<string | null>;                                   // the email a link was sent to, for the Settings notice
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

## `src/server/sync.ts`

```ts
export interface SyncDeps { client: ServerClient; token: () => Promise<ServerResult<string>>; repo: RepoLike; now: () => number; onState: (s: ServerStatus) => void; dbVersion: number }
export function runPush(deps: SyncDeps, datasets: (DatasetName | 'mixes')[]): Promise<ServerResult<void>>;
export function runPull(deps: SyncDeps): Promise<ServerResult<{ pulled: string[] }>>;
export function runRemoveAll(deps: SyncDeps): Promise<ServerResult<void>>;
export function readUsage(deps: SyncDeps): Promise<ServerResult<number>>;
```

`RepoLike` is the handful of `db/repo.ts` functions the runners need (`getAllRows`, `getMeta`, `putMeta`, `replaceDataset`,
`getMixes`, `putMix`, `deleteMix`), injected so tests run on `fake-indexeddb` or a stub.

## `src/db/repo.ts` additions (no `DB_VERSION` bump)

```ts
export async function replaceDataset(name: DatasetName, rows: Partial<AllRows>, metas: Record<string, unknown>): Promise<void>;
// one readwrite transaction over the dataset's stores + meta: clear, put all, put summaries
```

## `src/model/state.ts` additions

`serverState` signal; `startServerLink` (sends the email), `startServerSignOut`, `startServerPull` (joins `jobsBusy()`), `queueServerPush`
(flags `serverPending`, runs one push at a time, never joins `jobsBusy()`), `removeServerData` (the one new `confirm()`); the five
job wrappers and the mix save/delete paths call `queueServerPush` at their tail; `disconnect` resets the signals and keeps the
server session and data.

## `src/main.tsx`

Before the router starts: `if (location.hash.startsWith('#access_token=')) { serverAuth.completeLink(location.hash); history.replaceState(null, '', '#/settings'); }`.
The Spotify PKCE callback keeps reading `location.search`; the two cannot collide.

## `src/ui/Settings.tsx`

A `ServerCard` above "Disconnect": the status line, the email field and "Send me a link" (signed out; then "Link sent to …, open it on
this device"), per-dataset stamps and the used share
(connected), "Sync now with server", "Sign out", "Remove server data" (danger). The Disconnect paragraph gains "Server data is
kept."
