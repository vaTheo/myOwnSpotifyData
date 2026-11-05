# Research: A server and database holding the app's data

**Feature**: [spec.md](spec.md) · **Date**: 2026-11-05

Every unknown of the plan's Technical Context, resolved. Facts checked on 2026-11-05 are marked with their source.

## D1. Hosting: Supabase Free plan

- **Decision**: one Supabase project on the Free plan, created by the owner, holding a Postgres database behind PostgREST and
  Supabase Auth (GoTrue), with Row Level Security on every table.
- **Rationale**: it is a database with sign-in and per-row rules that a browser can call directly, so no server code of the owner's
  has to exist or stay alive; the owner suggested it; free at the owner's size.
- **Facts** ([pricing](https://supabase.com/pricing), [project pausing](https://supabase.com/docs/guides/platform/project-pausing)):
  500 MB database per project, 1 GB file storage, 5 GB egress a month, two active projects, no automatic backups on Free; a Free
  project with low activity over seven days is **paused**, and only the owner can resume it, from the dashboard ("Resume project"),
  for up to a year; an API request does not wake it. Ordinary use of the app a few times a week keeps it active.
- **Consequences for the design**: the app must have a `paused` state that names the dashboard (spec edge case updated); local data
  is the backup of the server as much as the reverse; Settings shows the used share of 500 MB.
- **Alternatives**: a VPS the owner writes (about €6/month, something to keep alive, no gain for a store-only server); Firebase
  (comparable, but no SQL and the owner asked for Supabase); a hand-exported backup file (no cross-device sync).

## D2. Client: plain `fetch` against PostgREST and GoTrue, no new dependency

- **Decision**: a `src/server/client.ts` in the shape of `src/spotify/client.ts`: injected `fetchFn`, a base URL and key, methods
  returning discriminated results (`{ ok: true, value } | { ok: false, reason, status }`), never throwing. Auth calls go to
  `/auth/v1/token` (password and refresh grants) and `/auth/v1/logout`; data calls go to `/rest/v1/<table>` with `apikey` and
  `Authorization: Bearer <access token>` headers, PostgREST filters, `Prefer: resolution=merge-duplicates` for upserts, and `Range`
  headers for paging.
- **Rationale**: ADR-06 (ask before adding a dependency) and the codebase rule "every fetch-based client takes an injected `fetchFn`
  and returns a result instead of throwing"; the calls needed are a dozen URLs; tests stay pure with a fake `fetchFn`.
- **Alternatives**: `@supabase/supabase-js` (2.119 on 2026-11-05, [npm](https://www.npmjs.com/package/@supabase/supabase-js)):
  convenient, but a dependency the owner has not approved, a bigger bundle, and its own session storage and realtime code the app
  does not need. Rejected unless the owner prefers it; the client interface in `contracts/client-api.md` is the same either way.

## D3. Sign-in: a magic link by email, signups disabled, one user created by the owner (owner's pick, 2026-11-05)

- **Decision**: the owner creates the single user in the dashboard (Authentication → Users → Add user, auto-confirm, no password)
  and turns off "Allow new users to sign up". Settings has an email field and a "Send me a link" button: the app calls
  `POST /auth/v1/otp` with `{ email, create_user: false, code_challenge, code_challenge_method: 's256' }` (the **PKCE flow**,
  security review S2) and a `redirect_to` of the app's own URL plus `?link=server`; the verifier is kept in `localStorage`
  (`server-pkce`). The emailed link redirects to the app with `?link=server&code=…` only; `main.tsx` branches on `link=server`
  (never on the presence of `code`, which the Spotify callback also uses), exchanges the code with
  `POST /auth/v1/token?grant_type=pkce` `{ auth_code, code_verifier }`, stores the session under `server-session`, and replaces
  the URL with the app's path and `#/settings`. No token is ever in a URL; a mail scanner that opens the link cannot exchange the
  code; the link only works in the browser that asked for it.
  Tokens are refreshed with the same margin logic as `auth/session.ts`; sign out revokes the refresh token and clears the key.
- **Rationale**: the owner prefers no password; one link per new browser is acceptable since a browser stays signed in; the
  publishable key is public, so disabling signups and `create_user: false` are what keep strangers out.
- **Setup it needs**: Authentication → URL Configuration: Site URL `https://vatheo.github.io/myOwnSpotifyData/`, additional redirect
  URL `http://127.0.0.1:5173/myOwnSpotifyData/`; a link opened on the phone must open in the browser that holds the app (the
  home-screen app opens links in Chrome; the quickstart checks this).
- **Alternatives**: the implicit link with tokens in the hash (rejected: tokens in URLs, consumable by link scanners, security
  review S2); email and password (no redirect, one secret to remember; declined by the owner); a six-digit email code typed
  in the app (`/auth/v1/verify`, no redirect either; needs the email template edited to include `{{ .Token }}`, kept as the fallback
  if the hash hand-off misbehaves on the phone); Supabase's "Sign in with Spotify" provider (needs the client secret in Supabase,
  which ADR-01 forbids).

## D4. Keys and settings: the publishable key, two public build settings

- **Decision**: `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` (an `sb_publishable_…` key) read in `src/env.ts` beside the Client ID;
  absent, the app is today's app. In CI they are repository variables, not secrets, since both are public by design.
- **Facts** ([migration guide](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys)): the publishable key
  replaces the legacy `anon` JWT, carries the same low privileges, is sent in the `apikey` header; legacy keys are deprecated by the
  end of 2026.
- **Consequence**: ADR-08, the constitution and CLAUDE.md say "a public URL and key" (edited on 2026-11-05).

## D5. Data layout: rows as JSON, one generic rows table, dataset stamps with a generation

- **Decision**: four tables. `datasets` holds one stamp per (owner, Spotify account, dataset name): `fetched_at`, `schema_version`,
  `generation`, `summary` (the meta summary the screens gate on), `row_count`, `pushed_at`. `dataset_rows` holds every row of the
  four replace-whole datasets as `(owner, account, dataset, generation, key, row jsonb)`. `mixes` holds one row per saved mix with
  `saved_at` and `deleted_at` (a tombstone). `jobs` is the queue of FR-017, empty this round.
- **Rationale**: PostgREST on hosted projects rejects bodies around 1 MB ([discussion](https://github.com/orgs/supabase/discussions/4639),
  [postgrest-js issue](https://github.com/supabase/postgrest-js/issues/414)), so a dataset cannot travel as one blob: it goes as
  batches of rows (500 per request, about 150 KB). Storing the row as `jsonb` mirrors ADR-05: an optional field added to a local row
  needs no server migration. A new `generation` per push makes the swap atomic for readers: rows are inserted under the new
  generation, then the stamp switches, then the old generation is deleted; a pull reads only the stamp's generation.
- **Alternatives**: one table per store with typed columns (a migration for every optional field, no gain for a single reader);
  Supabase Storage with one JSON file per dataset (no row-level paging, no RLS by row, a second API).

## D6. The sync rule: newer wins per dataset; per mix for mixes; tombstones for deletions

- **Decision**: the five datasets and their stamps:

  | Dataset | Local stores | Stamp (`fetched_at`) | Summary carried |
  |---|---|---|---|
  | `library` | `playlists`, `tracks`, `entries`, `topItems` | `lastSyncAt` meta | none |
  | `history` | `plays` | `historySummary.importedAt` | `historySummary` (version 2) |
  | `features` | `features` | max `updatedAt` of the rows | `rekordboxSummary` |
  | `reach` | `artistIdentity`, `artistReach` | `artistReachSummary.ranAt` | `artistReachSummary` (version 1) |
  | `mixes` | `mixes` | per row: `savedAt` | none |

  A device pushes a dataset when its local stamp is newer than the server's and pulls when the server's is newer; equal means
  nothing to do. `mixes` compares row by row by `savedAt`; `deleteMix` writes a tombstone (`deleted_at`) that a pull applies when
  newer than the local row. Job state metas (`syncState`, running states) are device-local and never synced; `keyNotation` is a
  display preference and never synced.
- **Rationale**: FR-006 and FR-011 as written; `savedAt` already exists on `MixRow`; the four library datasets are rebuilt whole by
  their jobs, so whole replacement is exact, never a merge.
- **Alternatives**: last-writer-wins by push time (rejected by the spec: an old laptop coming online would overwrite the phone);
  row-level merge for library datasets (nothing in the app edits those rows by hand, so a merge has no case).

## D7. When sync runs and what it blocks

- **Decision**: **push** runs at the tail of each job wrapper in `model/state.ts` (after `loadFromDb()`) and after `putMix` /
  `deleteMix`, with the dataset marked pending in `meta` (`serverPending`) first so a failed or offline push is retried on the next
  open. Push reads rows and never rebuilds the `Model`, so it does **not** join `jobsBusy()`; one push runs at a time and the next
  waits. **Pull** runs once per app open right after the first `loadFromDb()` when signed in, and again after sign-in; it writes
  library stores and ends in `loadFromDb()`, so it **joins `jobsBusy()`** and is skipped (not queued) while a job runs. `disconnect`
  resets the server signals and keeps the server session unless the owner also signs out; server data is kept.
- **Rationale**: the constitution's "a new job decides `jobsBusy()` and `disconnect`"; a pull that rebuilt the model under a running
  sync would clobber it, as §14 of How it works says of every other job.

## D8. Reaching a paused or offline project

- **Decision**: a network failure or a 5xx is `offline`; a 540-style "project paused" answer or a DNS failure after a successful
  session is shown as `paused` with the dashboard link; both leave local data as the working copy and keep the pending flags. No
  automatic retry loop: one retry on the next open or tap.
- **Rationale**: D1: a paused project cannot be woken by a request, so a retry loop would only spin; the spec's SC-003.

## D9. The used share of storage

- **Decision**: a Postgres function `storage_used()` (security definer, callable by the signed-in user only) returning
  `pg_database_size(current_database())`; Settings shows it as a share of 500 MB.
- **Rationale**: SC-004 and FR-003; the Free plan has no API for usage the browser can call.

## D10. Migrations and the one command

- **Decision**: `supabase/migrations/0001_init.sql` holds the schema, policies and the function; the owner applies it with
  `npx supabase@2 db push` after `npx supabase@2 link --project-ref <ref>`, or by pasting the file into the dashboard's SQL editor.
  Neither adds a dependency to `package.json`; CI does not touch the database.
- **Rationale**: FR-015 and ADR-06; a fresh project is reproducible from the file.

## D11. The Spotify account id: one `/me` call on the Connect tap (owner's pick, 2026-11-05)

- **Decision**: when the Spotify login completes (`auth.completeLogin` returns `'ok'` in `main.tsx`), the app calls `GET /me`
  once and compares the id with the `accountId` meta: absent → store it; equal → nothing; different → keep the stored id, show the
  notice "Signed in as a different Spotify account; Sync now to switch (local data is kept until you confirm)" and skip the pull.
  Every stamp carries `spotify_account_id`; a pull compares it with the local `accountId` and refuses on mismatch with the same
  notice. The sync job's account-switch confirm is unchanged and remains the only path that replaces a stored account id.
- **Rationale**: Connect is a tap, so one read there honours ADR-02 (no read on load); it removes the "adopt the one account the
  server holds" branch and the several-accounts screen state; the account-switch protection cannot be bypassed because Connect
  never overwrites a differing stored id.
- **Alternatives**: adopting the server's account on a fresh browser (the earlier design: an extra screen state when the server
  holds two accounts, and a pull that writes data before the app knows whose it is); reading `/me` on every open (a read on load,
  rejected by ADR-02).

## D12. Confirms

- **Decision**: one new `confirm()` for Remove server data, in `model/state.ts`; the Disconnect confirm's text gains "Server data is
  kept". The CLAUDE.md rule "Four `confirm()` calls only" is corrected in the docs pass: the code already holds more (the four mix
  "replace the working list" questions in `state.ts` and the Disconnect question in `Settings.tsx`), so the rule becomes "every
  `confirm()` is listed in How it works §14; destructive ones live in `model/state.ts`".
- **Rationale**: FR-014; the rule as written does not match the code the owner has.

## D13. Security (from [security.md](security.md), owner's picks of 2026-11-05)

- **Decision**: the migration revokes every privilege from `anon` and fixes the default privileges (S1); the magic link uses the
  PKCE flow (S2, D3); every pulled row passes a pure validator before it is written and rendered (S3, `src/server/validate.ts`);
  the manual requires MFA on supabase.com and forbids pasting the `service_role` key anywhere (S4); the OTP UI shows a generic
  "if this email has an account, a link was sent" and the dashboard's OTP expiry is set to 10 minutes (S5); a Content Security
  Policy `<meta>` lists the hosts the app talks to, the Supabase URL injected by Vite's `%VITE_SUPABASE_URL%` (S6, E2 accepted);
  refresh re-reads storage first and retries once on "already used" (S7); mixes are listed with `select=*` and filtered in the
  client, never by a list of urls in the query (S8); the previous generation is kept until the next push (S9);
  `storage_used()` sets `search_path = ''` (S10). Client-side encryption (E1) was declined by the owner and stays possible later
  without a schema change.
- **Rationale**: RLS is the only wall and must never fail open; the two logins must be hard to steal; server rows are a new
  untrusted input.

## Sizes (estimate, to be measured in the quickstart)

| Dataset | Rows (owner's library, order of magnitude) | Bytes per row | Total |
|---|---|---|---|
| library | 20 000 tracks + entries, a few hundred playlists | 300 | about 10 MB |
| history | 30 000 plays | 200 | about 6 MB |
| features | 20 000 | 200 | about 4 MB |
| reach | a few thousand | 300 | about 1 MB |
| mixes | tens | 10 000 | under 1 MB |

Far below 500 MB; a full first push is a few hundred requests of 500 rows; a pull of everything is about 20 MB of egress, so even a
daily full pull stays under the monthly 5 GB.
