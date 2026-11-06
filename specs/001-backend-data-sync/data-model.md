# Data model: A server and database holding the app's data

**Feature**: [spec.md](spec.md) · **Research**: [research.md](research.md) · **Date**: 2026-11-05

Two sides: the four server tables, and the few local additions (no `DB_VERSION` bump: new `meta` names only, ADR-05).

## Server tables

All tables carry `owner_id uuid not null default auth.uid()` and a Row Level Security policy `owner_id = auth.uid()` for select,
insert, update and delete; the publishable key alone (no session) sees nothing.

### `datasets` — one stamp per dataset

| Column | Type | Meaning |
|---|---|---|
| `owner_id` | uuid | the signed-in owner (RLS) |
| `spotify_account_id` | text | the `accountId` meta of the device that pushed |
| `name` | text | `library` · `history` · `features` · `reach` |
| `fetched_at` | bigint (epoch ms) | the local stamp of D6; the value compared by newer-wins |
| `schema_version` | int | the local `DB_VERSION` of the pusher |
| `generation` | bigint | the rows generation a reader must select |
| `summary` | jsonb, nullable | the meta summary the screens gate on (`historySummary`, `artistReachSummary`, `rekordboxSummary`) |
| `row_count` | int | rows under `generation`, for Settings and for a pull's progress |
| `pushed_at` | timestamptz | when the stamp switched |

Primary key `(owner_id, spotify_account_id, name)`.

### `dataset_rows` — the rows of the four replace-whole datasets

| Column | Type | Meaning |
|---|---|---|
| `owner_id` | uuid | RLS |
| `spotify_account_id` | text | |
| `dataset` | text | the dataset name |
| `store` | text | the local store the row belongs to (`playlists`, `tracks`, `entries`, `topItems`, `plays`, `features`, `artistIdentity`, `artistReach`) |
| `generation` | bigint | the push that wrote it |
| `key` | text | the local keyPath value, serialised (`entries`: `playlistId#position`) |
| `row` | jsonb | the local row verbatim |

Primary key `(owner_id, spotify_account_id, dataset, generation, store, key)`; index on `(owner_id, spotify_account_id, dataset, generation)`.

### `mixes` — one row per saved mix, with tombstones

| Column | Type | Meaning |
|---|---|---|
| `owner_id` | uuid | RLS |
| `spotify_account_id` | text | |
| `url` | text | `MixRow.url` |
| `saved_at` | bigint | `MixRow.savedAt`; the value compared by newer-wins, per row |
| `deleted_at` | bigint, nullable | set by a `deleteMix` push; a pull deletes the local row when newer than `savedAt` |
| `row` | jsonb, nullable | the `MixRow` verbatim; null on a tombstone |

Primary key `(owner_id, spotify_account_id, url)`.

### `jobs` — the queue reserved by FR-017 (no rows this round)

| Column | Type | Meaning |
|---|---|---|
| `id` | uuid default gen_random_uuid() | |
| `owner_id` | uuid | RLS |
| `kind` | text | e.g. `mix-analysis` in the next round |
| `payload` | jsonb | what was submitted |
| `status` | text | `queued` → `claimed` → `done` \| `failed` |
| `claimed_by` | text, nullable | the worker's name |
| `claimed_at`, `finished_at` | timestamptz, nullable | |
| `result` | jsonb, nullable | |
| `error` | text, nullable | |
| `created_at` | timestamptz default now() | |

State transitions: `queued → claimed` (a worker), `claimed → done | failed` (the same worker), `failed → queued` (a retry from the app).
A worker signs in as the owner with its own credentials kept on the owner's computer; nothing in this round reads or writes the table.

### Function `storage_used()`

`security definer`, `returns bigint`, `pg_database_size(current_database())`, execute granted to `authenticated` only.

## Local additions (`meta` store, no version bump)

| Meta name | Value | Why |
|---|---|---|
| `serverStamps` | `Record<DatasetName, { fetchedAt: number; generation: number }>` | what this device last saw on the server, so a pull can skip unchanged datasets without listing rows |
| `serverPending` | `Partial<Record<DatasetName \| 'mixes', true>>` | datasets changed locally and not yet pushed; cleared after a successful push |
| `serverLastSync` | `number` | the last successful push or pull, shown in Settings |

`localStorage` key `server-session`: `{ accessToken, refreshToken, expiresAt, email }`, the shape of the Spotify `Session` minus scope.

## Signals (`model/state.ts`)

```ts
type ServerStatus =
  | { status: 'unset' }                       // no VITE_SUPABASE_URL
  | { status: 'signedOut' }
  | { status: 'offline'; message: string }
  | { status: 'paused'; dashboardUrl: string }
  | { status: 'pushing' | 'pulling'; dataset: string; done: number; total: number }
  | { status: 'connected'; lastSyncAt: number | null; usedBytes: number | null; stamps: ServerStampView[] }
  | { status: 'error'; message: string };     // the last failure, with its reason
```

`serverState` is rendered by the Settings server card; every failure sets `error` and, when it hides data the owner expected,
`banner` through `errorBanner` (never a string).

## Validation rules

- A push of a dataset requires a local stamp (`fetched_at`) strictly newer than the server's, or no server stamp; otherwise it is
  a no-op and the pending flag is cleared.
- A pull requires the server stamp strictly newer than the local one, and `schema_version <= DB_VERSION`; a newer server schema
  sets `error` "update this browser's app" and pulls nothing.
- A pull of `history` or `reach` writes the rows **and** the summary in one transaction, so the gate (ADR-07) never sees rows
  without a version.
- `spotify_account_id` must equal the local `accountId` meta, which Connect sets with one `/me` call (D11); a mismatch refuses
  the pull with the account-switch notice, never a silent overwrite; a missing local `accountId` (Spotify not connected) skips
  the pull.
