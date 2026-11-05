# Tasks: A server and database holding the app's data

**Input**: Design documents from `/specs/001-backend-data-sync/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md),
[contracts/server-schema.md](contracts/server-schema.md), [contracts/client-api.md](contracts/client-api.md), [quickstart.md](quickstart.md)

**Tests**: included. The constitution's workflow is test-first ("Implementation is test-first"), and quickstart §4 lists the tests
that pin the rules. Every test task is written and seen failing before its implementation task. Tests sit next to source as
`src/**/*.test.ts`, Node environment, `fake-indexeddb/auto` for the repo, a fake `fetchFn` for the client; no DOM tests.

**Organization**: grouped by user story. Sign-in is foundational (no story can be exercised without it); US4 keeps sign-out,
removal and the Disconnect wording. After every task group: `yarn typecheck && yarn lint && yarn test`, then one commit
`type(scope): summary`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1 (data outlives the browser), US2 (two devices agree), US3 (server optional, state visible), US4 (sign in once, remove everything)

## Path Conventions

Single Vite app at the repository root: `src/` with a new `src/server/` folder, SQL under `supabase/migrations/`, docs under
`docs/`. Relative imports carry no extension (`moduleResolution: bundler`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: the settings, the SQL, the local rules, nothing behavioural yet.

- [X] T001 Add `SUPABASE_URL` and `SUPABASE_KEY` exports to `src/env.ts` read from `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY` (default `''`), and the two names (empty) to `.env.example`
- [X] T002 [P] Add `VITE_SUPABASE_URL: ${{ vars.VITE_SUPABASE_URL }}` and `VITE_SUPABASE_KEY: ${{ vars.VITE_SUPABASE_KEY }}` to the `yarn build` step env in `.github/workflows/ci.yml` (repository **variables**, the values are public)
- [X] T003 [P] Write `supabase/migrations/0001_init.sql` per `contracts/server-schema.md`: tables `datasets` (PK `(owner_id, spotify_account_id, name)`; `fetched_at bigint`, `schema_version int`, `generation bigint`, `summary jsonb null`, `row_count int`, `pushed_at timestamptz`), `dataset_rows` (PK `(owner_id, spotify_account_id, dataset, generation, store, key)`, `row jsonb`, index on `(owner_id, spotify_account_id, dataset, generation)`), `mixes` (PK `(owner_id, spotify_account_id, url)`; `saved_at bigint`, `deleted_at bigint null`, `row jsonb null`), `jobs` (`id uuid default gen_random_uuid()`, `kind text`, `payload jsonb`, `status text check in ('queued','claimed','done','failed')`, `claimed_by text null`, `claimed_at`/`finished_at timestamptz null`, `result jsonb null`, `error text null`, `created_at timestamptz default now()`); every table `owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade`; RLS enabled with one policy per command `using (owner_id = auth.uid())` and `with check (owner_id = auth.uid())`; grants to `authenticated` only; function `storage_used() returns bigint security definer set search_path = ''` returning `pg_catalog.pg_database_size(pg_catalog.current_database())`; then the grants block of `contracts/server-schema.md` verbatim: `revoke all on all tables in schema public from anon; revoke all on all functions in schema public from anon, public; alter default privileges in schema public revoke all on tables from anon; alter default privileges in schema public revoke all on functions from anon, public; grant select, insert, update, delete on datasets, dataset_rows, mixes, jobs to authenticated; grant execute on function storage_used() to authenticated;` (security review S1, S10)
- [X] T004 [P] Add a `<meta http-equiv="Content-Security-Policy">` to `index.html` per `contracts/client-api.md` "index.html": `default-src 'self'`; `connect-src 'self' https://api.spotify.com https://accounts.spotify.com %VITE_SUPABASE_URL%` plus every host found by `grep -rhoE 'https://[a-z0-9.-]+' src --include='*.ts' | sort -u` that is fetched (not link-only): ReccoBeats, MusicBrainz, ListenBrainz, Wikidata, en/fr Wikipedia, Wikimedia, SoundCloud oEmbed, TrackId.net; `script-src 'self' https://api.deezer.com`; `frame-src https://w.soundcloud.com`; `img-src 'self' https: data:`; `style-src 'self' 'unsafe-inline'`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'` (S6, E2)
- [X] T005 [P] Write `src/server/CLAUDE.md` (≤ 80 lines: Required inputs table with ADR-08, `contracts/*`, `src/spotify/client.ts` as the shape to copy, `src/db/CLAUDE.md`; Expected outputs: never throw, `ServerResult`, batches ≤ 500, no Spotify call, every failure to `serverState`) and the relative symlink `src/server/AGENTS.md -> CLAUDE.md`

**Checkpoint**: `yarn typecheck && yarn lint && yarn test` green (nothing imports the new module yet); the SQL applies to a fresh Supabase project (quickstart §1).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the client, the session (magic link), the pure dataset rules, the repo primitive, the state signal and the Settings card
in its signed-out and connected shapes. Every story builds on these.

**⚠️ CRITICAL**: no user story work can begin until this phase is complete.

### Tests first

- [X] T006 [P] Write `src/server/client.test.ts` with a fake `fetchFn`: headers carry `apikey` and `Authorization: Bearer`; `requestLink` posts `{ email, create_user: false, code_challenge, code_challenge_method: 's256' }` to `/auth/v1/otp?redirect_to=<app>%3Flink%3Dserver`; `exchangeCode` posts `{ auth_code, code_verifier }` to `/auth/v1/token?grant_type=pkce`; `refresh` posts `grant_type=refresh_token`; `upsert` sends `Prefer: resolution=merge-duplicates`; `select` sends `Range` and parses `Content-Range` into `total`; error mapping per `contracts/server-schema.md` (network throw / 502 / 503 / 504 → `offline`; "project paused" 5xx body → `paused`; 401 → `unauthorized`; 413 → `tooLarge`; 422/400 on `/otp` → `error`; 400 on `grant_type=pkce` → `error` "open the link in the browser that asked for it, within 10 minutes"; 429 on `/otp` → `error` with the wait; other 4xx → `error` with the body's `message`/`hint`); never throws
- [X] T007 [P] Write `src/server/session.test.ts`: `requestLink(email)` stores `{ verifier }` under `localStorage` key `server-pkce` and passes `challengeFor(verifier)` to the client; `completeLink(new URLSearchParams('link=server&code=c'))` exchanges `c` with the stored verifier → `'ok'`, stores `{ accessToken, refreshToken, expiresAt, email }` under key `server-session` and removes `server-pkce`; params without `link=server` → `'none'`; `link=server` without `code`, without a stored verifier, or a 400 on the exchange → `'invalid'` and nothing stored; `getAccessToken` refreshes inside the 60 s margin, **re-reads storage before refreshing** and retries once on a 400 "already used" (S7); a 401 on refresh clears the session (`signedOut`); `signOut` calls `/auth/v1/logout` and clears both keys even when the call fails
- [X] T008 [P] Write `src/server/datasets.test.ts`: `DATASETS` names exactly `library`, `history`, `features`, `reach` with the stores of research D6; `stamp()` for each (library = `lastSyncAt` meta; history = `historySummary.importedAt`; features = max `updatedAt`; reach = `artistReachSummary.ranAt`; null when absent); `rowKey` serialises `entries` as `playlistId + '\u0000' + position` and the other stores as their keyPath; `compareStamps(local, server)` → `'push'` when local newer or server null (local non-null), `'pull'` when server newer or local null (server non-null), `'same'` when equal or both null; `batches` of 500 by default and the last one shorter; `planMixes` (edit newer on one side → push or pull; tombstone newer than local `savedAt` → `deleteLocal`; both sides newer for different urls → both lists)
- [X] T009 [P] Write `src/server/validate.test.ts`: every rule of `contracts/client-api.md` "validate.ts" with one accepted and one rejected case each: a `javascript:` `spotifyUrl`, a `playerSrc` outside `SC_PLAYER_PREFIX`, an `http:` `sourceUrl`, a non-finite `plays`, an empty key, `historySummary.version !== 2`, `artistReachSummary.version !== 1`; an unknown extra field is kept; `validateMix` accepts a row with `playerSrc: null` (S3)
- [X] T010 [P] Add to `src/db/repo.test.ts`: `replaceDataset('history', { plays }, { historySummary })` clears `plays`, writes the rows and the meta in one transaction (a failing row leaves the old rows and the old meta); `replaceDataset('library', …)` covers `playlists`, `tracks`, `entries`, `topItems`; `DB_VERSION` is still 4 and a version-4 database opens without an upgrade

### Implementation

- [X] T011 Implement `src/server/client.ts` per `contracts/client-api.md` (`createServerClient({ fetchFn, baseUrl, apiKey, now })`: `requestLink` (with the challenge), `exchangeCode`, `refresh`, `signOut`, `select` with `Range`/`Content-Range`, `upsert` with merge-duplicates, `remove`, `rpc`); `ServerResult<T>` discriminated union; the error mapping of T006; no retry loop (a single request per call)
- [X] T012 Implement `src/server/session.ts` (`createServerSessionStore({ client, storage, now, redirectUri })`: `session` signal, `requestLink` (verifier from `randomString`, challenge from `challengeFor` in `src/auth/pkce.ts`, stored under `server-pkce`, `redirect_to = redirectUri() + '?link=server'`, sets `linkSent`), `completeLink(params)` (exchange with the stored verifier, clears it), `getAccessToken` with the 60 s margin, a single in-flight refresh, storage re-read before a refresh and one retry on "already used" (S7), `signOut`); storage shape `{ accessToken, refreshToken, expiresAt, email }` under key `server-session`
- [X] T013 Implement `src/server/datasets.ts` (pure): `DatasetName`, `DatasetDef` with `stores`, `stamp`, `summary`; `DATASETS`; `rowKey`; `compareStamps`; `batches` (default 500); `planMixes`; `MixStamp = { url, savedAt, deletedAt }`
- [X] T014 Implement `src/server/validate.ts` (pure) per `contracts/client-api.md`: `validateRow(store, row)`, `validateMix(row)`, `validateSummary(name, value)`; reuse `SC_PLAYER_PREFIX` from `src/features/mix/oembed.ts`; `https:` check via `new URL()` and `protocol === 'https:'`; finite numbers via `Number.isFinite` (S3)
- [X] T015 Add `replaceDataset(name, rows, metas)` to `src/db/repo.ts`: one `readwrite` transaction over the dataset's stores plus `meta`, `clear()` then `put` every row, then `put` every meta; no `DB_VERSION` bump; export the three meta names `SERVER_STAMPS_META = 'serverStamps'`, `SERVER_PENDING_META = 'serverPending'`, `SERVER_LAST_SYNC_META = 'serverLastSync'` from `src/db/schema.ts` with their value types from `data-model.md`
- [X] T016 Add to `src/model/state.ts`: the `ServerStatus` union of `data-model.md` and the `serverState` signal (initial `{ status: 'unset' }` when `SUPABASE_URL === ''`, else `signedOut` or `connected` from the stored session); the browser singletons `serverClient` and `serverAuth` built in a new `src/server/browser.ts` from `env.ts`, `localStorage`, `fetch`, `redirectUri`; `startServerLink(email)` (always shows the generic sent message on 2xx **and** on a 4xx from `/otp`, S5; `error` only on `offline`/`paused`) and `completeServerLink(params)`; `disconnect` resets `serverState` to its signed-in/out base and keeps the server session
- [X] T017 In `src/main.tsx` `boot()`: `const serverLink = params.get('link') === 'server'`; the Spotify branch becomes `!serverLink && (params.has('code') || params.has('error'))`; when `serverLink`, after `render`, `await completeServerLink(params)` then `history.replaceState(history.state, '', location.pathname + '#/settings')`; the two `?code=` callbacks never meet (S2)
- [X] T018 Add `ServerCard` to `src/ui/Settings.tsx` above the Disconnect card: `unset` → "No server set up" and one line pointing at the manual; `signedOut` → email input + "Send me a link", then the generic "If this email has an account, a link was sent. Open it in this browser within 10 minutes." (S5); `error` → the message in `class="error"`; `connected` → "Connected as <email>", last sync "never" for now; `offline`/`paused`/`pushing`/`pulling` render placeholders that later tasks fill

**Checkpoint**: three checks green; quickstart scenarios 1 (unset), 2, 2b, 2c (magic link) pass by hand; a signed-in browser survives a reload.

---

## Phase 3: User Story 1 - My data outlives the browser (Priority: P1) 🎯 MVP

**Goal**: every dataset a job builds is pushed to the server; a fresh browser pulls every dataset the server holds after sign-in,
with no Spotify read, and the gates (Crate, Under the radar) open from the restored summaries.

**Independent Test**: quickstart scenarios 3 and 4: import on browser A, sign in on an empty browser B, see Crate and play counts
within a minute with no `api.spotify.com` request before a tap.

### Tests first

- [X] T019 [P] [US1] Write `src/server/sync.test.ts` for `runPush` with a fake client and a stub `RepoLike`: for a dataset with a local stamp newer than the server's, rows are upserted in batches of ≤ 500 under `generation = now`, each batch row `{ spotify_account_id, dataset, store, generation, key, row }`, **then** the `datasets` stamp is upserted with `fetched_at`, `schema_version = DB_VERSION`, `generation`, `summary`, `row_count`, **then** rows with `generation lt` the **previous** stamp's generation are deleted, so the previous generation survives until the next push (S9); `onState` sees `pushing` with `done`/`total`; a `same` comparison upserts nothing and clears `serverPending[name]`; a failed batch stops the push, leaves the server stamp untouched and keeps the pending flag; a `tooLarge` result is returned, never retried
- [X] T020 [P] [US1] Add `runPull` tests to `src/server/sync.test.ts`: one `GET datasets` read; for each stamp newer than `serverStamps[name].fetchedAt`, pages of `dataset_rows` filtered by `dataset`, `generation`, `spotify_account_id` are fetched with `Range` until `total` is reached and every row and summary passes `validate.ts` first, a failing row is dropped and counted (`rejected` in the result and in `onState`), a failing summary refuses that dataset; `replaceDataset` receives the accepted rows grouped by store plus the summary meta (history: rows **and** `historySummary` in the same call); `serverStamps` and `serverLastSync` metas are written after; a stamp with `schema_version > DB_VERSION` is skipped and the result carries `error` "update this browser's app"; when the local `accountId` meta differs from the stamp's `spotify_account_id` the pull is refused with `ACCOUNT_MISMATCH_NOTICE`; when the local `accountId` is absent the pull is skipped (`{ ok: true, value: { pulled: [], skipped: 'noAccount' } }`); no call to any Spotify URL (assert the fake fetch saw only the server base URL)

### Implementation

- [X] T021 [US1] Implement `runPush(deps, datasets)` in `src/server/sync.ts` per T019 (`RepoLike` = `getAllRows`, `getMeta`, `putMeta`, `replaceDataset`, `getMixes`, `putMix`, `deleteMix`; token via `deps.token()`; `mixes` handled in US2, skipped here)
- [X] T022 [US1] Implement `runPull(deps)` in `src/server/sync.ts` per T020, including the validation of every row and summary (S3), the account rule of research D11 (local `accountId` must match, absent skips) and the `schema_version` guard of `data-model.md` "Validation rules"
- [X] T023 [P] [US1] Add to `src/sync/runner.test.ts`: `resolveConnectedAccount(undefined, 'a') === 'set'`, `('a', 'a') === 'same'`, `('a', 'b') === 'mismatch'`; then export `resolveConnectedAccount` and `ACCOUNT_MISMATCH_NOTICE` from `src/sync/runner.ts` (pure, beside `ACCOUNT_META`)
- [X] T024 [US1] Add `recordConnectedAccount()` to `src/model/state.ts` per `contracts/client-api.md`: one `api.get<ApiProfile>('/me')`, `resolveConnectedAccount`, `putMeta(ACCOUNT_META, id)` only on `set`, `warnBanner(ACCOUNT_MISMATCH_NOTICE)` on `mismatch`, `errorBanner` on a failed `/me`; call it in `src/main.tsx` right after `auth.completeLogin(params)` returns `'ok'`, before `loadFromDb()`, and make `startServerPull` skip with no banner when `ACCOUNT_META` is absent or a mismatch banner is up (D11)
- [X] T025 [US1] Add to `src/model/state.ts`: `queueServerPush(names)` (sets `serverPending` in meta first, runs one push at a time, the next waits, maps the result to `serverState` and, on failure, `errorBanner` only when the failure hides data the owner expected) and `startServerPull()` (joins `jobsBusy()`: returns early with no banner while a job runs; ends in `loadFromDb()`; `loadSavedMixes()` after US2); call `startServerPull()` from `src/main.tsx` after the first `loadFromDb()` when signed in, and from `completeServerLink` after a successful link
- [X] T026 [US1] Call `queueServerPush` at the tail of `startSync` (`['library']`), `startImport` (`['history']`), `startLookup` and `startRekordboxImport` (`['features']`), `startReach` (`['reach']`) in `src/model/state.ts`, after each one's `loadFromDb()`, only when the job ended without error
- [X] T027 [US1] Extend `ServerCard` in `src/ui/Settings.tsx` (connected): last sync time (`serverLastSync`), a per-dataset table "dataset · fetched (local) · on server · rows" from `serverStamps` and the local stamps, a "Sync now with server" button (pull then push of pending) disabled while `jobsBusy()`, and `Progress` for `pushing`/`pulling`; after a pull with rejected rows, the line "n rows rejected by the safety check" (FR-018)

**Checkpoint**: three checks green; quickstart 3 and 4 pass; scenario 12 (publishable key alone sees no row) passes; commit
`feat(server): push datasets after each job, pull them on open`.

---

## Phase 4: User Story 2 - Two devices stay in agreement (Priority: P2)

**Goal**: newer wins per dataset in both directions; mixes converge per row, including edits and deletions, without a merge.

**Independent Test**: quickstart scenarios 5 and 6: sync on A then later on B, reopen A and see B's playlists; edit and delete
mixes on A, reopen B and see both.

### Tests first

- [X] T028 [P] [US2] Add to `src/server/sync.test.ts`: a `library` stamp older locally than on the server is pulled, newer is pushed, equal is left alone (both directions through `compareStamps`); a pull never writes a dataset whose server `fetched_at` equals the local stamp
- [X] T029 [P] [US2] Add mixes tests to `src/server/sync.test.ts`: `runPush(['mixes'])` reads `GET mixes?select=url,saved_at,deleted_at&spotify_account_id=eq.A`, upserts local rows newer than the server's as `{ spotify_account_id, url, saved_at, deleted_at: null, row }`, and pushes a tombstone `{ url, saved_at: now, deleted_at: now, row: null }` for every url in the local `mixDeleted` list; `runPull` reads `GET mixes?select=*&spotify_account_id=eq.A` and keeps only the urls `planMixes` returns (never a url list in the query, S8), validates each with `validateMix`, calls `putMix` for each accepted row and `deleteMix` for every tombstone newer than the local `savedAt`; a mix edited on both sides keeps the newer `savedAt` whole
- [X] T030 [P] [US2] Add to `src/db/repo.test.ts`: `deleteMix(url)` records the url in a `mixDeleted` meta list (with `Date.now()`), and a successful push clears it

### Implementation

- [X] T031 [US2] Extend `runPush` and `runPull` in `src/server/sync.ts` with the `mixes` branch per T029 (`planMixes` from `src/server/datasets.ts`; tombstones; `deleteLocal`)
- [X] T032 [US2] In `src/db/repo.ts`, make `deleteMix` append `{ url, deletedAt }` to the `mixDeleted` meta (export `MIX_DELETED_META = 'mixDeleted'` from `src/db/schema.ts`), and add `clearMixDeleted(urls)` for the push to call
- [X] T033 [US2] In `src/model/state.ts`, call `queueServerPush(['mixes'])` after every `putMix` and `deleteMix` path (`startMixLookup`, `startTracklistifyImport`, the row edit and replace actions, `startCreatePlaylist` when it stores `playlistUrl`, the delete action), and make `startServerPull` end with `loadSavedMixes()` as well as `loadFromDb()`

**Checkpoint**: three checks green; quickstart 5 and 6 pass; commit `feat(server): newer wins both ways, mixes by row with tombstones`.

---

## Phase 5: User Story 3 - The server is optional and its state is visible (Priority: P3)

**Goal**: unset, offline and paused servers never change a screen; Settings says which it is and when the last sync was; changes
made offline reach the server on the next open.

**Independent Test**: quickstart scenarios 7, 8 and 9.

### Tests first

- [X] T034 [P] [US3] Add to `src/server/sync.test.ts`: an `offline` result from the first request makes `runPull` return `offline` without touching the repo; `runPush` on `offline` keeps every pending flag; a `paused` result is passed through unchanged; on the next `runPush` with pending flags set, only the pending datasets are compared and pushed
- [X] T035 [P] [US3] Add to `src/server/client.test.ts`: the `paused` detection (5xx whose body mentions "paused", and a `TypeError` on fetch after a prior successful call in the same session is still `offline`, never `paused`)

### Implementation

- [X] T036 [US3] In `src/model/state.ts`, map `offline` → `serverState = { status: 'offline', message }` and `paused` → `{ status: 'paused', dashboardUrl: 'https://supabase.com/dashboard' }`; neither sets a banner; the pending flags survive; `startServerPull` on open runs once and never retries by itself; `queueServerPush` on open pushes the datasets flagged in `serverPending` before anything else
- [X] T037 [US3] In `src/ui/Settings.tsx` `ServerCard`: `offline` → "Server offline: <message>. Last sync <time>. Local data is in use."; `paused` → "Server paused. Resume it from the Supabase dashboard" with the link, then "Sync now with server"; `unset` keeps its one line; no other screen imports `serverState`
- [X] T038 [US3] In `src/main.tsx`, keep the boot order: paint, PKCE completion, magic link completion, `loadFromDb()`, then `startServerPull()` **after** `bootPhase.value = 'ready'` so a slow or paused server never delays the first paint or "Loading your library…"

**Checkpoint**: three checks green; quickstart 7, 8, 9 pass; commit `feat(server): offline and paused states, pending pushes retry on open`.

---

## Phase 6: User Story 4 - Signing in once, removing everything (Priority: P4)

**Goal**: sign out, remove every byte of the owner's data from the server behind a confirmation, say what Disconnect does, show
the used share of storage.

**Independent Test**: quickstart scenarios 10 and 11.

### Tests first

- [X] T039 [P] [US4] Add to `src/server/sync.test.ts`: `runRemoveAll` deletes from `dataset_rows`, `datasets`, `mixes` and `jobs` (in that order) for the owner and then clears `serverStamps`, `serverPending`, `serverLastSync` and `mixDeleted` metas; a failure on one table stops and reports which; `readUsage` posts to `/rest/v1/rpc/storage_used` and returns the number

### Implementation

- [X] T040 [US4] Implement `runRemoveAll(deps)` and `readUsage(deps)` in `src/server/sync.ts` per T039
- [X] T041 [US4] In `src/model/state.ts`: `startServerSignOut()` (revokes, clears, `serverState = signedOut`, keeps local data), `removeServerData()` with the one new `confirm('Remove all your data from the server? Local data on this browser is kept.')`, refused while `jobsBusy()`; `readUsage` called after every successful pull or push and stored in `serverState.connected.usedBytes`
- [X] T042 [US4] In `src/ui/Settings.tsx`: "Sign out" and "Remove server data" (`class="danger"`) buttons in `ServerCard` (connected), the used share line "x MB of 500 MB"; the Disconnect card's paragraph gains "Server data is kept." and its `confirm` text becomes `'Disconnect and delete all local data? Server data is kept.'`

**Checkpoint**: three checks green; quickstart 10 and 11 pass; commit `feat(server): sign out, remove server data, used share`.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: the documents that end a round (Contributing, "One change, several files"), the corrected `confirm()` rule, the
quickstart run on the phone.

- [X] T043 [P] Write `docs/specs/2026-11-05-backend-data-sync-design.md` (Status Implemented, Last updated, the decisions in brief, out of scope, compatibility, links to `specs/001-backend-data-sync/` and ADR-08, `## Links` answered) and list it in `docs/README.md`
- [X] T044 [P] Add a row F18 "Server sync (Supabase, magic link, newer wins per dataset)" to `docs/architecture/100-features.md` §1 with entry files `src/server/sync.ts`, `startServerPull` in `src/model/state.ts`, `ServerCard` in `src/ui/Settings.tsx`; add a row to §2 "What leaves the browser": "F18 | the owner's Supabase project | every dataset the app builds (library, playlists, play counts, reach, mixes); never the Spotify token | after each job and on open, when signed in"; reword the sentence "No token and no listening history ever leaves the browser" to "No Spotify token ever leaves the browser; the listening history goes only to the owner's own server"
- [X] T045 [P] Add §16 "`server/`: the owner's server" to `docs/architecture/000-how-it-works.md` (client, session, datasets, sync, the five datasets table of research D6, the generation swap, the pending flags, the states), a "Server pull" row in the §14 jobs table (started from open and Settings; in `jobsBusy()`: yes) and a "Server push" row (no), update §1's "No server" sentence and §3's "the only setting" sentence, and list every `confirm()` in §14
- [X] T046 [P] Update `README.md` (owner's manual): the "Nothing is uploaded" paragraph gains the server; a "Server" section with quickstart §1 (project, signups off, URL configuration, the user, the SQL, the two variables), the magic-link sign-in (same browser, ten minutes), what Disconnect and Remove server data do, the pause after a week and the dashboard "Resume project", and a "Keep it safe" paragraph: MFA on supabase.com, never copy the `service_role` key, signups stay off, what the app checks on pulled rows (S4, S1, S3)
- [X] T047 [P] Add the `CHANGELOG.md` entry (feature, the two settings, "the database does not upgrade itself: no version bump", the one new confirm) and update `docs/architecture/800-limits-roadmap.md` (free-tier pause, 500 MB, no backups on Free, the worker as the next round)
- [X] T048 Correct the `confirm()` rule in `CLAUDE.md` ("Every `confirm()` is listed in How it works §14; the destructive ones live in `model/state.ts`"), in `.specify/memory/constitution.md` (same wording, PATCH bump to 2.0.1 with its Sync Impact Report), and add the server row's "Then" column: "no Spotify read from a pull; pending flags survive a failure"
- [X] T049 Check the docs by hand per Contributing "Checking by hand": `wc -l CLAUDE.md src/**/CLAUDE.md` (≤ 150 / ≤ 80), `find . -name AGENTS.md -not -path './node_modules/*' -exec ls -l {} +`, and every relative link of the pages touched (T043–T048) resolves both ways
- [X] T050 Run the security scenarios of quickstart §3: 12 (public key alone, every table and the function), 12b (a temporary second user sees nothing, then delete it), 2d (a link opened in another browser fails), 13 (a tampered `playerSrc` and a `javascript:` href are rejected and counted), 14 (every feature once with the CSP on, no violation in the console); fix the CSP host list if a feature fails; record the results in `specs/001-backend-data-sync/security.md` under a "Verified" heading (done 2026-11-06 for the server-side checks; 12b, 2d, 13, 14 are the owner's browser checks, listed there)
- [ ] T051 Run `yarn typecheck && yarn lint && yarn test && yarn build`, then quickstart §3 scenarios 1–11 on the dev server and, after the owner's push, on the phone; record the measured sizes (research "Sizes") in the spec page of T043
- [X] T052 Commit `docs(server): spec page, inventory, how it works, manual, changelog` and hand the branch to the owner for the push (never push without the owner's OK)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies; T002, T003, T004, T005 in parallel after T001 (T001 is a one-line prerequisite of nothing, it can also run in parallel; listed first for the env names)
- **Foundational (Phase 2)**: depends on Setup; tests T006–T010 in parallel, then T011–T015 in parallel (different files), then T016 → T017 → T018 in order (state, then main, then Settings)
- **US1 (Phase 3)**: depends on Phase 2; T019, T020, T023 in parallel; T021 → T022 → T024 → T025 → T026 → T027
- **US2 (Phase 4)**: depends on US1 (extends `runPush`/`runPull`); T028–T030 in parallel; T031 → T032 → T033
- **US3 (Phase 5)**: depends on US1 (uses the pending flags and the states); independent of US2; T034, T035 in parallel; T036 → T037 → T038
- **US4 (Phase 6)**: depends on Phase 2 only for sign-out; `runRemoveAll` touches the `mixDeleted` meta of US2, so run after US2; T039; T040 → T041 → T042
- **Polish (Phase 7)**: after every story kept; T043–T047 in parallel; T048 → T049 → T050 → T051 → T052

### User Story Dependencies

- **US1 (P1)**: after Foundational; no other story
- **US2 (P2)**: after US1
- **US3 (P3)**: after US1; can run beside US2 (different test cases, same files `sync.ts` / `state.ts` / `Settings.tsx`, so sequence the edits)
- **US4 (P4)**: after US2 for `runRemoveAll`'s meta clearing; otherwise after Foundational

### Within Each User Story

- Tests written and seen failing before the implementation task they name
- `datasets.ts` (pure) before `sync.ts` before `state.ts` before `Settings.tsx`
- Story complete and committed before the next priority

### Parallel Opportunities

- Phase 1: T002, T003, T004, T005
- Phase 2: T006–T010; then T011–T015
- Phase 3: T019, T020, T023
- Phase 4: T028, T029, T030
- Phase 5: T034, T035
- Phase 7: T043–T047

---

## Parallel Example: Foundational

```bash
# The four test files together (different files, no shared state):
Task: "Write src/server/client.test.ts …"      # T006
Task: "Write src/server/session.test.ts …"     # T007
Task: "Write src/server/datasets.test.ts …"    # T008
Task: "Add replaceDataset tests to src/db/repo.test.ts …"  # T010

# Then the four implementations together:
Task: "Implement src/server/client.ts …"       # T011
Task: "Implement src/server/session.ts …"      # T012
Task: "Implement src/server/datasets.ts …"     # T013
Task: "Add replaceDataset to src/db/repo.ts …" # T015
```

## Parallel Example: User Story 1

```bash
Task: "Write runPush tests in src/server/sync.test.ts …"   # T019
Task: "Write runPull tests in src/server/sync.test.ts …"   # T020  (same file: write as two describe blocks, one author)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup (T001–T005), apply the SQL to the owner's project.
2. Phase 2 Foundational (T006–T018): sign in by magic link on two browsers.
3. Phase 3 US1 (T019–T027): push after a job, pull on open.
4. **STOP and VALIDATE**: quickstart 1–4 and 12. Commit.

### Incremental Delivery

1. US2 → quickstart 5, 6 → commit
2. US3 → quickstart 7, 8, 9 → commit
3. US4 → quickstart 10, 11 → commit
4. Polish → docs, checks, phone run → commit, owner pushes

### Notes

- Every task names its file; a task touching `src/model/state.ts` or `src/ui/Settings.tsx` is sequential with the others on that file
- `supabase/migrations/0001_init.sql` is applied by the owner (quickstart §1); CI never touches the database
- No new dependency; `npx supabase@2` is named only in the manual
- Commit after each phase at the latest; never push
