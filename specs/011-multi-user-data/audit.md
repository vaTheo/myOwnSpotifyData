# Audit: user data and sync (round 011)

T022, read-only audit at HEAD f4b7288 (branch `task/general-dev`). Every row below says "per user, because ..." or points to a
finding. A path was marked safe only after reading it; what needs a browser, a real Supabase project or a second Spotify account
is under "Not checked".

How the wall is built (read in `userScope.ts`, `scopeBrowser.ts`, `repo.ts`, `auth/browser.ts`): the page pins one scope at its
first call (`pinnedScope`, `scopeBrowser.ts:285`), which happens at module load of `auth/browser.ts` (`createSessionStore` reads
`session` at once), before any boot code. `openDb` caches one connection under that name; the Spotify keys go through `scopedView`
with the same pin. A page therefore never changes database or Spotify keys during its life. Every path to a different user ends in
a page load (`main.tsx:43`, `:79-85`, `:92`; `watchScope`, `watchSession`; sign-out `state.ts:485`). What is **not** pinned is the
server session (`server-session`, one per device): see Findings 2 and 4.

## 1. IndexedDB: `openDb`, `getAllRows`, `wipeDb`, `closeDb`, direct access

| Path | file:line | Scope | Per user because |
|---|---|---|---|
| `dbName()` | `db/repo.ts:55-61` | per user | demo rule first (dev only), then `scopedDbName(DB_NAME)`: `spotify-dj` for claimer/nobody/no server, `spotify-dj-u-<uuid>` otherwise; id is a uuid-checked string |
| `openDb` | `db/repo.ts:63` | per user | `dbPromise ??=` opens `dbName()` once; name pinned; `terminated()` reopens the same name; `blocking()` (`:77-83`) only affects the same name |
| `closeDb` | `db/repo.ts:117` (caller `:124` in `wipeDb`) | per user | closes the cached pinned connection |
| `wipeDb` | `db/repo.ts:123` | per user | `deleteDB(dbName())`, same pinned name |
| `wipeDb` callers | `state.ts:2370` (Disconnect), `sync/runner.ts:312` (account switch, after `ACCOUNT_SWITCH_CONFIRM`; auto run answers false), `dev/install.ts:89` (demo DB only) | per user | all go through `dbName()`; demo name is `spotify-dj-demo`, cannot equal a uuid name |
| `getAllRows` | `db/repo.ts:149` | per user | `openDb()` |
| `getAllRows` callers | `state.ts:253` (`serverDeps`), `:295` (`connectedView`), `:1143` (`loadFromDb`); `server/sync.ts:381` (`runPush`), `:502` (`runPull`) | per user | all reach `repo.openDb`; `sync.ts` only sees the injected `RepoLike` |
| Other repo functions | `repo.ts:199,214,224,229,238,245,255,264,271,276,289,319,325,330,345,379` | per user | each starts with `openDb()` |
| Importers of repo functions | `state.ts` (`:343,523,1097,1737,1754,1827,1857,1979,2035,2248,2351`), `features/rekordboxImport.ts:102,111`, `features/reachRun.ts:244,249,607`, `features/lookup.ts:201,228`, `history/importer.ts:173,192`, `sync/runner.ts:185,196,220,314,326,327,338,347`, `dev/install.ts:89-93` | per user | no other module imports `db/repo` (grep `db/repo'`); none opens a database itself |
| Direct IndexedDB | none outside `repo.ts` (grep `indexedDB`, `openDB`); the two workers (`history/import.worker.ts`, `features/rekordbox.worker.ts`) post rows back, the main thread writes | n/a | no second path to a database |
| Other persistence | no `sessionStorage`, cookie, Cache API, service worker, `BroadcastChannel` in `src/`; `worker/mix_worker` is Python (session file `session.json` 0600, run files `runs/<sha1(link)>.json`, result JSON on disk) | n/a | see section 6 for the worker |
| Meta names | `serverStamps`, `serverPending`, `serverLastSync`, `mixDeleted`, `mixJobs`, `accountId`, `lastSyncAt`, `syncState`, `crateNoticeShown`, summaries (`schema.ts:377-426`, `runner.ts:64-66`) | per user | all live in the `meta` store of the user's database, so another user cannot inherit pending flags, stamps, the account id or the 12-hour gate |

## 2. localStorage and sessionStorage keys (grep `getItem|setItem|removeItem|localStorage|sessionStorage`)

| Key | file:line | Scope | Right scope? |
|---|---|---|---|
| `session` (Spotify) | `auth/session.ts:15`, view `auth/browser.ts:24` | per user (claimer unscoped) | yes: pinned scope; `session:<uuid>` for others |
| `pkce` (Spotify) | `auth/session.ts:16`, same view | per user | yes; a callback landing in a page pinned to another user finds no verifier and fails ("started in another browser"), never mixes tokens |
| `server-session` | `server/session.ts:18`, `server/browser.ts:31` | per device, one at a time | yes by design (one signed-in user per browser); but not pinned to the page: Findings 2, 4 |
| `server-pkce` | `server/session.ts:19` | per device, transient | yes; a second request overwrites the first, the older link fails (no cross-user effect, the code is bound to the verifier) |
| `spotifyQuotaLock` | `spotify/quotaLock.ts:12`, `state.ts:864-927` | per app (device-wide) | yes: the lock belongs to the Client ID; `demo:` prefix in the demo. A tab only writes on change, so a shorter lock can overwrite a longer one (pre-existing) |
| `keyNotation` | `state.ts:948-969` | per device | a display preference; per device is a choice: a friend inherits the owner's notation. Acceptable, recorded |
| `autoUpdates` | `state.ts:976-1061` | per device | a choice: user A switching it off turns it off for B on that browser. Acceptable, recorded; per user would need a meta, not a key |
| `deviceOwner` | `userScope.ts:11,81` | per device | yes, the claim; Finding 8 |
| `activeUser` | `userScope.ts:12,67` | per device | yes, the pointer; read at load only (pinned), cleared on sign-out |
| `deviceUsers` | `userScope.ts:13,177` | per device | yes; holds every user's email in clear, only the count is shown (ADR-14 "localStorage readable with devtools") |
| other keys | none | n/a | `dev/flag.ts` `memoryStorage` is in memory (demo) |

## 3. Server layer: user switch, sign-out, sign-in as another user, in-flight work, offline

| Path | file:line | Scope | Per user because / finding |
|---|---|---|---|
| `runPush` | `server/sync.ts:366` (reads `ACCOUNT_META`, `getAllRows`, upserts) | per user | rows come from the pinned database; the server stamps filter by `spotify_account_id` and RLS `owner_id = auth.uid()`; **only holds if the token is the page's user: Finding 2** |
| `runPull` | `sync.ts:487` | per user | rows validated (`validateRow`, `validateSummary`, `validateMix`, `validateJobRow`) and written to the pinned database by `replaceDataset` (one transaction); validate is not the only wall: RLS (section 11) limits the select to the caller; account mismatch refuses (`ACCOUNT_MISMATCH_NOTICE`). Finding 2 applies to the token |
| `planMixes` | `server/datasets.ts:155` | per user | pure: local mixes vs stamps read with `spotify_account_id=eq.<account>` under the caller's RLS |
| `pushMixes`/`pullMixes` | `sync.ts:138-232` | per user | same; the pulled row's `url` must equal the server row's (`:215`) |
| `pullJobs` | `sync.ts:661` | per user | selects `jobs` of the caller only (RLS); applies a done result to the pinned database; `applied_at is.null` guard |
| `requestIdentify` | `sync.ts:574` | per user | insert takes `owner_id` from `auth.uid()` (default, and the insert policy checks it) |
| `cancelRequest`, `moveRequestToTop`, `stopRequest` | `sync.ts:802-860` | per user | filter by `id` (+status); a foreign id matches no row under RLS ("gone") |
| `runRemoveAll` | `sync.ts:768` | per user | deletes with `owner_id not.is.null`: **every** row RLS lets the caller see, i.e. only the caller's (rests on RLS, section 11 checked; Finding 2 for the token) ; then `deleteMeta` of the five server metas in the pinned database |
| `readUsage` | `sync.ts:788` | per app | `storage_used()` is database-wide: Finding 11 |
| `serverStamps`, `serverPending`, `serverLastSync`, `mixDeleted`, `mixJobs`, `accountId` | `schema.ts`, `sync.ts`, `state.ts:343` | per user | stored in the user's database (section 1) |
| `queueServerPush` | `state.ts:336` | per user | flags and rows from the pinned database; `pushRunning`/`pushQueued` are page-scoped and die with the page; token from the session (Finding 2) |
| `startServerPull` | `state.ts:380` | per user | skipped while `jobsBusy`; same token caveat |
| `queueAction`, `startIdentifyRequest` | `state.ts:2430`, `:1784` | per user | token from the session; RLS |
| User switch | `main.tsx:43`, `state.ts:580-632` | n/a | page load; no push or pull outlives it |
| Sign-out | `state.ts:462-490` | n/a | refused while a job or push runs; session removed first, pointer next, reload; a failure shows `serverState` error (no reload) |
| Sign-in as another user | `state.ts:644-665`, `main.tsx:77-86` | n/a | success always navigates (`afterLink`), the new page pins the new names |
| Offline / paused | `state.ts:271-290` | per user | `offline`/`paused` are states; flags stay in the user's database; a user who switches never carries them |

A push or pull started for A cannot complete against B's *database* after a switch: the page reloads and the pin never moves.
It can complete with B's *token* only through Finding 2 (a small window), which is why that finding is Important.

## 4. Automatic chain and `autoSync`

| Path | file:line | Per user because / finding |
|---|---|---|
| Boot while signed out | `main.tsx:55-75` | `signedOut` returns before `loadFromDb`, `startServerSync`, `runChain`, `installAutoSync`; only the router, `watchScope`, `watchSession` are installed. Per user: nothing runs |
| `runChain` guard | `main.tsx:148-152` | skips the demo and `serverSignInRequired()` |
| `installAutoSync` #1 | `main.tsx:156-169`, `server/autoSync.ts:43` | `enabled = serverAutoSyncEnabled` (`state.ts:415`): server configured, server session set, Spotify session set |
| `installAutoSync` #2 | `main.tsx:172-183` | `!serverAutoSyncEnabled() && !serverSignInRequired() && auth.session`; the two never run together |
| Spotify read | `autoChain.ts:304` (`signedIn` = Spotify session of the pinned user), `state.ts:1214 startSync` | tokens are the pinned user's keys; never another user's. Gap: after the server session ends mid-session the chain is not stopped: Finding 5 |
| 12-hour gate | `state.ts:1146` (`lastSyncAt` from `getMeta(LAST_SYNC_META)`), `autoChain.ts:260-269` | per user: the date lives in the user's database; a new user has `null` and syncs on connecting |
| Two tabs | `autoChain.ts` `spotifyRan` is per page | same user in two tabs can each sync once (pre-existing); different users cannot share a browser session (one `server-session`) |
| Signing out | `state.ts:477` `autoChain.stop()` only after the busy checks | a refused sign-out keeps the chain |

## 5. `disconnect`, `removeServerData`, account switch, sign-out, link, activation

| Path | file:line | Scope | Per user because / finding |
|---|---|---|---|
| `disconnect` | `state.ts:2360-2406` | per user | `wipeDb` (pinned name), `auth.clearAll` (scoped keys); keeps the server session, pointer, claim, device list, quota lock. Refused while `jobsBusy`. Stale signals and a running push: Finding 9 |
| `removeServerData` | `state.ts:492-505` | per user | confirm text says "your data"; `runRemoveAll` (RLS); sets `mixJobs = {}`; refused while a job runs (a push is not checked: it just runs on, harmless) |
| `ACCOUNT_SWITCH_CONFIRM` | `sync/runner.ts:69,308-312`, `state.ts:1260` | per user | the question wipes the pinned user's database only; an automatic run never asks |
| `startServerSignOut` | `state.ts:462-490` | per device | order: busy checks, `autoChain.stop()`, `serverAuth.signOut()` (always clears the session even when the call fails, `session.ts:199-206`), `writeActive(null)`, reload. A throwing `writeActive` shows an error and leaves the pointer on a signed-out user: harmless, the gate renders (`serverSignInRequired` is live) and the next activation overwrites it. Offline: Findings 3, 10 |
| `startServerLink` | `state.ts:539` | per device | writes `server-pkce`; a throwing `setItem` shows nothing: Finding 7 |
| `completeServerLink` | `state.ts:644-665` | per device | session saved, then `activateStored`; invalid account or throwing pointer write signs out again and shows a message; a failed link keeps any existing session and its message |
| `activateServerUser`/`activateStored` | `state.ts:580-640`, `userScope.ts:209-226` | per device | claim, pointer, device list; uuid check; compares the pinned scope before and after, reloads on any difference; partial write is undone (pointer cleared, session signed out) |
| `activate` with `deviceOwner` missing | `userScope.ts:86-92` | per device | `scopeOf` would map the user to `-u-<id>`; `activate` calls `claim` first so it cannot occur from the app; see Finding 8 |

## 6. The worker

| Path | file:line | Scope | Per user because / finding |
|---|---|---|---|
| Sign-in | `worker/mix_worker/session.py:19-62`, `cli.py:325` | per worker | one session file; the account is whoever ran `mix-worker login` |
| `claim_job` | `server.py:186`, `0002_jobs.sql:124-143`, `0003_job_control.sql:163-183` | per user | `security invoker`, `owner_id = auth.uid()` in the subselect, RLS on the update; `execute` granted to `authenticated` only |
| Finish/progress/release | `server.py:196-231` | per user | `PATCH jobs?id=eq.&status=eq.claimed&claimed_by=eq.` under the worker's token; RLS limits to its user |
| Result into the app | `sync.ts:661 pullJobs` | per user | the app reads only the signed-in user's `jobs` rows (RLS) into the pinned database; a result for A is never selected by B's token; the only way is Finding 2 |
| Run state | `runstate.py` `runs/<sha1(link)>.json` | per worker | keyed by link, not user; after `logout`+`login` as another user a stopped run of a **public** set could resume for the new user: no private data, noted |
| Friends' requests | `0002_jobs.sql:129-142` | per user | a worker serves its own account only; a friend's requests wait forever: Finding 6 |
| Logout | `server.py:167`, `cli.py:375` | per user | global sign-out: Finding 3 |

## 7. Signals in `model/state.ts` that hold user rows (and `ui/`)

Every path to a different user reloads the page (section lead), so every signal is fresh for the next user. Disconnect resets
the list below in place.

| Signal | file:line | Reset on Disconnect (`state.ts`) | On a user change |
|---|---|---|---|
| `model` | `:166` | `:2378` | page load |
| `syncState`, `importState`, `lookupState`, `rekordboxState`, `reachState` | `:167-174` | yes | page load |
| `lastSyncAt`, `historySummary`, `rekordboxSummary`, `artistReachSummary` | `:169-175` | yes | page load |
| `banner` | `:176` | yes | page load |
| `serverState`, `serverLastSyncAt` | `:203,209` | yes | page load |
| `serverPending`, `serverPendingError` | `:217,219` | **no** (stale until the card re-reads) | page load. Finding 9 |
| `mixState`, `mixRows`, `mixRemoved`, `savedMixes`, `mixError`, `mixQueueNote`, `createPlaylistState`, `likeState`, `spotifyCheckState` | `:708-831,2120` | yes | page load |
| `mixJobs` | `:1772` | **no** (reset by `removeServerData` only) | page load. Finding 9 |
| `createChoice`, `mixCheckSaved`, `chainView` | `:844,2127,990` | no | page load; same-user cosmetic |
| `spotifyQuotaLock`, `keyNotation`, `autoUpdates` | `:884,964,988` | kept on purpose | device/app level, section 2 |
| `serverSession`/`serverLinkSent` (`serverAuth`) | `:188-189` | kept | device |
| `spotifyReturnDropped` | `:571` | n/a | set only on the gate |
| UI module signals (`SearchView recent/mixes`, `Playlist seeds`, `Artists rowsCache`, sort/filter signals, `Nav lastRoute*`) | `ui/**` | n/a | memory only, no storage (grep), die with the page |

Gate without reload (a refused refresh, `session.ts:140-180`): `bootPhase` stays, `App` renders `SignInGate` because
`serverSignInRequired()` reads the live session signal (`app.tsx:89`); every overlay (search, track sheet, banner) is inside
`AppFrame`, and there is no other `render` or portal in production code (grep). Behind the gate `model`, `mixRows` etc. remain in
memory. Could a later sign-in as **another** user in the same page reuse them? No: the only code that completes a sign-in is
`completeServerLink`, called from `boot()` after a load; the magic link opens a new load, and a sign-in in another tab reloads
this page (`watchSession`, `scopeChangedElsewhere`). `completeServerLink` returns `'reload'` when the activation moves the scope and
`main.tsx` navigates for every non-invalid result (`gate.ts:24`), so even the same-user case starts a fresh page. A running Spotify
job or queued chain step keeps running behind the gate for the same user: Finding 5.

## 8. Demo and `VITE_DEMO_FAKE_SERVER`

| Path | file:line | Per user / safe because |
|---|---|---|
| Demo switch | `dev/flag.ts:48-52` | `demoVariant()` returns `null` unless `import.meta.env.DEV`; a production build drops the branches (`main.tsx:121`, `repo.ts:57`, `auth/browser.ts:19`) |
| Demo database | `flag.ts:25`, `repo.ts:57` | `spotify-dj-demo`, never a uuid name |
| Demo Spotify session | `auth/browser.ts:26-35` | in memory only |
| Demo quota key | `state.ts:864-867` | `demo:` prefix |
| Demo and the gate | `state.ts:559-566` | `demo` makes `serverSignInRequired()` false; no gate in demo (recorded in the ledger) |
| `VITE_DEMO_FAKE_SERVER` | `server/browser.ts:17-26` | `import.meta.env.DEV &&` the flag; unreadable in production, so it cannot make the production app think a server is set up. In dev it can read a stored `server-session` of the dev origin and activate it; dev origin only |
| Shared keys | `state.ts:948,976` | the demo shares `keyNotation` and `autoUpdates` with the dev origin's real keys (dev only, harmless) |

## 9. Token refresh, 401, paused/offline

| Case | file:line | Result |
|---|---|---|
| Refresh refused (`unauthorized`) | `session.ts:163-166` | `save(null)`, gate appears live, other tabs reload; data untouched; messages via `serverFailure` (`state.ts:271`). Per user: nothing is shown. Memory and jobs behind the gate: section 7, Finding 5 |
| "Already used" | `session.ts:167-170` | re-read storage, retry once; after two tries sign out |
| Refresh network error | `session.ts:171` | returned as `offline`; flags kept |
| 401 with a fresh in-memory token (user removed in the dashboard) | `client.ts:180` | `unauthorized` error on the card, session kept until refresh; the user keeps local data, cannot sync: matches the spec edge case |
| Paused/offline | `client.ts:163-179` | states, no banner, no retry loop |
| Re-read adopts another user's session | `session.ts:140-158` | Finding 2 |
| Rotated tokens overwrite a newer session | `session.ts:159-162` | Finding 4 |

## 10. Two tabs, two users, one device

There is one `server-session`, so two users cannot be signed in at once.

| Order | Behaviour | Per user because / finding |
|---|---|---|
| A open (pinned A), B signs in in tab 2 | tab 2 writes session B (`session.ts:85`) then pointer B (`userScope.ts:67`); tab 1 gets the pointer event, scope differs, reloads (`scopeBrowser.ts:340`). Between the two events tab 1 still holds A's in-memory token | Finding 2 (window: only if tab 1's token expired and a trigger fires) |
| A open, B is the claimer or A is, either way | claimer vs non-claimer both change `scopeOf` | reload |
| A signs out in tab 2 (A claimer) | pointer removal does not change the scope (`''` both), the session removal event does: `watchSession` reloads (`userScope.ts:148-156`) | reload |
| Gate tab (nobody) and a sign-in elsewhere | `watchSession` reload | per user |
| Both tabs refresh the server token | S7 re-read-and-retry; nothing user-specific | Finding 4 only when a sign-in interleaves |
| Both tabs run the Spotify chain | same user only, one Spotify session key | pre-existing |
| Link tab exchanging while another tab shows the gate | the gate tab reloads on the session event; the link tab does not (no event for its own write) | fine |

## 11. SQL (`supabase/migrations/0001..0003`, all read)

| Object | file:line | Scope | Per user because / finding |
|---|---|---|---|
| `datasets`, `dataset_rows`, `mixes`, `jobs` | `0001:9-63` | per user | `owner_id uuid not null default auth.uid()` referencing `auth.users on delete cascade`; primary keys start with `owner_id` for the three data tables, so two users with the same Spotify account never collide; `jobs.id` is a random uuid (an insert with a known foreign id would only get a duplicate error) |
| Policies | `0001:75-100` | per user | `enable row level security` plus select/insert/update/delete on each of the four tables, `owner_id = auth.uid()` (and `with check` on insert and update, so an owner cannot be rewritten); no `to anon`/`public` policy |
| Grants | `0001:102-109` | per user | `revoke all` from `anon` on tables and functions and from `public` on functions, default privileges revoked, `authenticated` gets the four commands on the four tables, nothing on sequences or other objects |
| `claim_job` | `0002:124-146`, `0003:163-185` | per user | `security invoker`, `search_path = ''`, `owner_id = auth.uid()`, `execute` to `authenticated` only |
| `storage_used()` | `0001:66-73,109` | per app | `security definer`, reads no table, returns `pg_database_size(current_database())`: Finding 11 |
| `jobs` update | `0001:90-93` | per user | a user may change any column of their own rows, including `status` and `result`; they can only harm themselves, and the worker's filter `status=eq.claimed&claimed_by=eq.` covers the rest |
| `rules.test.ts` | `src/server/rules.test.ts` | repo only | audits the files, not the live project; blind spots in section 12 |

What a second user learns from `storage_used()`: the total size of the project database (system catalogs and every user's rows),
and its growth between two calls. No row, name or per-user figure. Acceptable for a handful of invited users; the Settings share
for them is the whole project's share, which is the honest figure for the shared free tier.

## 12. The ledger's deferred items, re-assessed

| Item | Verdict |
|---|---|
| Reload of another tab while a Spotify job runs here | still Minor. Writes are per playlist or batch, transactional (`replacePlaylist`, `replaceDataset`), `syncState` `running` is ignored on load (`state.ts:1148`), reach/features resume. One wrinkle: a reload between `wipeDb` and `putMeta(ACCOUNT_META)` (`runner.ts:312-314`) leaves an empty database with no account; the next sync is an ordinary first sync and the data is still on the server |
| Push starting in the sign-out window | still Minor. It runs with the user's own token and rows (the token string is captured) and flags persist; no other user is involved |
| Refused-refresh gate unmounting the app | Minor, but the "nothing stays behind" claim needs the qualifier of Finding 5: jobs and queued chain steps continue behind it. Unsaved Workspace edits: the `mixRows` signal is never cleared, only the component unmounts, so they survive until a reload; unverified in a browser |
| `runRemoveAll` rests on RLS only | Minor, now verified against the three migrations (section 11); worse only with Finding 2 (a foreign token), which Finding 2's fix removes; the live policies are Not checked |
| Module-level readers before the gate | Minor. With nobody active the page pins the claimer's names and `auth` holds the claimer's Spotify session in memory behind the gate; nothing opens a database or calls anything (section 4). Visible only in devtools, which the ADR already accepts |
| `scopedStorage` test-only | Minor. Dead code with a live-resolving behaviour different from `scopedView` (the production pinned one); `scopeBrowser.test.ts` covers `scopedView`. Delete it or keep and say so |
| Rules audit blind spots | Minor. A `create table` inside a `do` body, `returns table`, and tables made in the dashboard are not audited; I read all three files by hand and found none of these |

## Findings

### Finding 1 (Important): Spotify authorize can auto-connect the previous person's Spotify account on a shared browser

Status: Fixed in ce2bf1d (T023): `show_dialog=true` when the device knows more than one person; tests in `pkce.test.ts` and `auth/session.test.ts`.

`src/auth/pkce.ts:38-49` (`buildAuthorizeUrl` sends no `show_dialog`).
Scenario: A signs in, connects Spotify (approved once, and logged in to Spotify in this browser), signs out of the app. B signs in
with their own email and taps **Connect**. Spotify, seeing a browser already logged in as A and the app already approved, may
redirect straight back with a code without showing a screen (Spotify's default when `show_dialog` is false). B's database now
syncs A's playlists and top items and pushes them to B's server rows; `recordConnectedAccount` stores A's Spotify id as B's
account (`state.ts:511`: no cached account, so "set", no question). FR-002/SC-004 broken by Spotify's own single sign-on.
Fix: add `show_dialog: 'true'` to the authorize query (the consent screen then names the account and offers "not you?"); test in
`pkce.test.ts`. Needs a second Spotify account to confirm (Not checked).

### Finding 2 (Important): the server token is not bound to the page's user; a refresh adopts whatever session is in storage

Status: Fixed in b364fe0 (T023): the store pins its user and a refresh refuses another person's stored session; tests in `server/session.test.ts`.

`src/server/session.ts:140-158` (`doRefresh` re-reads `server-session`) and `:182-197` (`getAccessToken`); consumers `state.ts:248-251`
(`serverDeps.token`), `:1805`, `:2441`.
Scenario: tab 1 is pinned to user A (database A) with an in-memory token that has expired (a background or frozen tab left for
over an hour). In tab 2 B signs in, which writes session B, then the pointer. In the short gap before tab 1's pointer event
reloads it, or when the event is late (a throttled or frozen background tab resumed by `visibilitychange`, which runs
`installAutoSync` `onVisible` -> `startServerSync` first), `getAccessToken` refreshes: it re-reads storage, finds B's fresh session
and returns B's token. `runPush` then uploads A's library under B's `owner_id` (A's stamp is newer than B's, so `compareStamps`
says push), or `runPull` writes B's rows into A's database, or `runRemoveAll` deletes B's server data. This is the one place the
pinned page and the shared session can disagree, and it is exactly FR-002. Likelihood is low; the fix is a few lines.
Fix: pin the session's user at load (`session.value?.userId` in `createServerSessionStore`) and, in `doRefresh` and
`getAccessToken`, refuse (return `unauthorized`, do not adopt the stored session, leave the reload to the watchers) when the
stored or refreshed session's `userId` differs; test: a stored session of another user is never returned.

### Finding 3 (Important): sign-out revokes the user's sessions everywhere

Status: Fixed in 3b656a2 (T023): `/auth/v1/logout?scope=local` in `client.ts` and the worker's `server.py`; tests in `client.test.ts` and `test_server.py`; the live project's behaviour stays for T021.

`src/server/client.ts:296-301` (`POST /auth/v1/logout` with no `scope`), `session.ts:199-206`, worker `server.py:167`.
Scenario: the owner signs out on a friend's computer (now routine, FR-006). GoTrue's `/logout` default scope is `global`, so every
refresh token of the owner is revoked: the phone falls back to the gate at its next refresh and the worker's `session.json` is
dead (it exits with code 4 until `mix-worker login`). The same happens for `mix-worker logout`. The docs say sign-out is "on this
browser". Not a leak, but the central multi-device and worker setup breaks silently. To confirm against the real project (T021).
Fix: `/auth/v1/logout?scope=local` in both clients (`client.ts`, `server.py`); test the URL.

### Finding 4 (Minor): rotated tokens can overwrite a newer session

`src/server/session.ts:159-162` (`save(res.value)` after the `await` of `client.refresh`).
Scenario: tab 1 (A) is mid-refresh when tab 2 completes B's link; tab 1 then writes A's rotated tokens over session B. Tab 2's new
page boots with session A and pointer B, `activateServerUser` activates A and reloads: B lands in A's data on A's session.
Window: one refresh round trip. Fix: before saving, re-read storage and save only if the stored refresh token is still the one
refreshed; otherwise return `unauthorized` and let the reload decide. Same area as Finding 2; one test.

### Finding 5 (Minor): jobs and queued chain steps continue after the server session ends mid-session

`src/model/autoChain.ts:304,342,351` and `state.ts:1030` (`signedIn: () => auth.session.value !== null`: the Spotify session only);
`state.ts:1054-1062` (`requestJob`, `setAutoUpdates` do not check the gate).
Scenario: a refused refresh brings back the gate while the chain has `features` and `reach` queued (or a Spotify sync running).
They run on, with the same user's Spotify keys and database, and no screen shows it. No other user is involved (a sign-in always
reloads), but the gate's promise "nothing runs" is not true in this window; `requestJob` and `setAutoUpdates` are not reachable
from the UI behind the gate. Fix: add `!serverSignInRequired()` to the chain's `signedIn`, and call `autoChain.stop()` from an
effect on `serverSignInRequired()`.

### Finding 6 (Minor): a friend's "Identify on my computer" request is never taken

`supabase/migrations/0002_jobs.sql:129-142`, `worker/mix_worker/server.py:186`.
Scenario: friend F taps Identify; the row is inserted under F's `owner_id`; the worker is signed in as the owner and `claim_job`
sees only the owner's rows. F's request stays "waiting for your computer" forever. Isolation is right (FR-010), the product is
not. Fix: document in the README and Limits that the worker serves the account that logged it in, and/or hide the button for
other accounts; no code needed for isolation.

### Finding 7 (Minor): a failing `localStorage` is not always shown; with blocked storage the bundle dies at load

`src/server/browser.ts:31` (`storage: localStorage` read at module load: a `SecurityError` aborts the module), `session.ts:85-90`
(`save` has no guard), `:98-115` (`requestLink`'s `setItem`), `:118-138` (`completeLink`).
Scenario: storage full or write-refused: opening a magic link throws inside `save`; `boot()` is `void boot()` so the rejection is
unhandled and the page stays on "Signing you in..." (`bootPhase = 'linking'`) with no message; **Send me a link** with a refused
`setItem` rejects silently. Blocked storage (private mode with storage denied) fails at module evaluation before `scopeBrowser`'s
guards matter. The first is a round 011 path (a pointer write is guarded in `activateStored`, the session write is not); the
module-load throw is pre-existing. Fix: wrap `save`/`requestLink` writes in try/catch and return `{ok:false}` with
`storageMessage(err)` into `serverState`; guard the `localStorage` read in `server/browser.ts` and `auth/browser.ts`.

### Finding 8 (Minor): the claim is one `localStorage` key

`src/server/userScope.ts:71-92`.
Scenario: `deviceOwner` is lost alone (storage partly evicted or edited) while `spotify-dj` survives: `scopeOf` maps the
claimer to `spotify-dj-u-<id>` (an empty database) until `claim` rewrites the key for **whoever signs in next**, who then owns
the old database and Spotify keys. Same exposure as the accepted "first sign-in claims"; the trigger is data loss, not the
owner's error. Fix: none needed beyond the update note; optionally refuse to activate when `spotify-dj` exists, `deviceOwner` is
absent and no pre-update marker is present (not worth the cost).

### Finding 9 (Minor): Disconnect leaves some signals and does not wait for a running push

`src/model/state.ts:2360-2406`.
Scenario: Disconnect resets the signals but not `serverPending`, `mixJobs`, `createChoice` (same user: the Mix screen's request
history reappears after reconnecting until the first pull), and `jobsBusy()` excludes a push (`:336`): a push in flight when the
database is wiped reopens an empty `spotify-dj-...` and writes `serverStamps` into it. Same user, same device; no leak. Fix: reset
the three signals in `disconnect`, and refuse while `pushRunning`.

### Finding 10 (Minor): offline sign-out leaves the server session valid; the result is discarded

`src/server/session.ts:199-206` (`await deps.client.signOut(...)` result ignored), `client.ts:296`.
Scenario: sign-out with no network or an expired access token: the local session is removed and the page reloads, so the next
person cannot use it, but the refresh token stays valid on the server (until revoked), and nothing says so. Fix: show a warning on
the gate when the call did not succeed ("signed out here; the server was not told").

### Finding 11 (Minor): `storage_used()` is database-wide

`supabase/migrations/0001_init.sql:66-73`. A second user sees the whole project's size and its changes over time (section 11).
Acceptable for invited users; recorded. Smallest change if it ever matters: sum the caller's `dataset_rows`/`mixes` sizes with
`pg_column_size` under RLS instead.

### Finding 12 (Minor): the spec's "the app says so" for a Spotify account another user already uses is not implemented

`specs/011-multi-user-data/spec.md` edge case 1. The app cannot know it (RLS hides other users' rows, which is the point), so the
sentence cannot be met without breaking isolation. Fix: reword the spec: each user's data stays separate and nothing is said.

### Finding 13 (Minor): two device-wide preferences and a per-device email list

`state.ts:948,976` (`keyNotation`, `autoUpdates`), `userScope.ts:13` (`deviceUsers`). Per device is a choice, recorded in
section 2: a second person inherits the notation and the Automatic updates switch of the previous one, and the browser stores every
user's email in clear. No data of another user is shown. Fix only if the owner wants per-user preferences (a `meta` row per user).

## Not checked

- Two real users on the real Supabase project: that RLS in the live database matches the migrations (a dashboard edit would not
  show in `rules.test.ts`), the grants on the live `claim_job`/`storage_used` ACLs, `create_user: false` and sign-ups off, the
  global scope of `/logout` (Finding 3), refresh token reuse behaviour (Finding 4).
- A second Spotify account and a browser with a live Spotify login: Finding 1.
- Browser behaviour: storage-event delivery to throttled or frozen background tabs (Finding 2), localStorage quota and
  blocked-storage errors (Finding 7), IndexedDB `blocking`/`deleteDB` across tabs, whether unsaved Workspace edits survive the gate.
- The worker with a second Supabase user, PyInstaller builds, and a worker session of another user on the same computer.
- `yarn shots`, `yarn regression` (the gate is not covered in demo, per the ledger) and the quickstart manual run (T021).
