# Tasks: Multi-user data

**Input**: `specs/009-multi-user-data/` (plan.md, spec.md, research.md, data-model.md, contracts/ui.md, quickstart.md)
**Tests**: test-first, pure functions and `fake-indexeddb` (project rule); no DOM tests.

## Phase 1: Setup (decision first, docs lead)

- [x] T001 Write `docs/architecture/700-adr/ADR-13-users-by-server-account.md` (user = server account, claim by first sign-in, per-user database and Spotify keys, reload on switch; amends ADR-08 "owner alone"); link it from `docs/architecture/700-adr/README.md`, `docs/README.md` and ADR-08
- [x] T002 Amend Principle I in `.specify/memory/constitution.md` ("for the owner and the accounts the owner creates"), bump to 2.3.0 with the Sync Impact Report; mirror the line in `CLAUDE.md` (root) non-negotiable rules

## Phase 2: Foundational (blocks every story)

- [x] T003 Write failing tests in `src/server/userScope.test.ts`: `dbNameFor` and `keyFor` (claimer and no-server give the unscoped name, others `spotify-dj-u-<id>` / `base:<id>`), `claim` (first sign-in sets `deviceOwner`, a second never changes it), `userIdFromToken` (valid `sub`, malformed, missing), a non-UUID id is rejected
- [x] T004 Implement `src/server/userScope.ts` (pure, storage injected as `StorageLike`): `claim`, `dbNameFor`, `keyFor`, `userIdFromToken`, `readActive`, `writeActive`, `recordDeviceUser`, UUID check `/^[0-9a-f-]{36}$/` until T003 passes
- [x] T005 Add `userId` to `ServerSession` in `src/server/session.ts`: set from the token exchange, and for a session stored without it read the `sub` of the access token; extend `src/server/session.test.ts` (old stored session gains its id, no network call)

## Phase 3: User Story 1 - My current data stays mine (P1) MVP

**Independent test**: with a populated library on the device, open the updated app: same data, no new link, no re-sync.

- [x] T006 [US1] Failing test in `src/db/repo.test.ts` (`fake-indexeddb/auto`): with the claimer active, `openDb` opens `spotify-dj` and an existing version 4 database keeps every row
- [x] T007 [US1] Make `dbName()` in `src/db/repo.ts` resolve through `userScope` (demo rule first, unchanged); `DB_NAME` and `DB_VERSION` stay
- [x] T008 [US1] Scope the Spotify session keys in `src/auth/browser.ts` / `src/auth/session.ts` with `keyFor` (the claimer keeps `session` and `pkce`)
- [x] T009 [US1] In `src/model/state.ts` `completeServerLink`: on success `claim`, `writeActive`, `recordDeviceUser`; reload only when the active user changed. On boot with a stored session, activate it the same way (no new link for the owner)

## Phase 4: User Story 2 - A second person starts empty (P1)

**Independent test**: a second user signs in, sees every screen empty, connects their own Spotify and syncs; the owner's data is unchanged.

- [x] T010 [US2] Failing test in `src/db/repo.test.ts`: a non-claimer opens `spotify-dj-u-<id>` (empty), writes a row, and the claimer's database does not contain it
- [x] T011 [US2] Create `src/ui/signin/SignInGate.tsx` (email field, Send me a link, "If this email has an account, a link was sent", inline link errors, offline and paused notices) per `contracts/ui.md`
- [x] T012 [US2] In `src/main.tsx` and `src/app.tsx`: when `VITE_SUPABASE_URL` and key are set and there is no server session, `bootPhase = 'signedout'` renders only `SignInGate` and nothing of any user; without the settings nothing changes
- [x] T013 [US2] Audit the server rules in a test or SQL review note: every table in `supabase/migrations/` has `owner_id = auth.uid()` policies and no `anon` grant (extend an existing migrations test if one exists, else add `src/server/rules.test.ts` reading the SQL)

## Phase 5: User Story 3 - Two people, one browser (P2)

**Independent test**: sign out, sign in as another user, sign back in: each sees only their own data, no wipe, no question.

- [x] T014 [US3] `startServerSignOut` in `src/model/state.ts`: remove the server session and the `activeUser` pointer, then reload; remove nothing else and ask nothing
- [x] T015 [US3] Sign-in as a different user while another is remembered: write the new pointer and reload, no `confirm()`; a test on the pure decision "reload needed" in `userScope.test.ts`
- [x] T016 [US3] `disconnect` and `removeServerData` in `src/model/state.ts` act on the active scope only (`wipeDb` uses the scoped name; `auth.clearAll` clears the scoped keys); test `wipeDb` removes only the active user's database
- [x] T017 [US3] Settings server card in `src/ui/settings/`: signed-in email, "N people use this device" when N > 1, Sign out; wording "your" on Remove server data and Disconnect

## Phase 6: User Story 4 - Without the server, nothing changes (P3)

- [x] T018 [US4] Test in `userScope.test.ts`: with no server configured every name and key equals today's; build once without the settings and confirm no sign-in screen (quickstart step 6)

## Phase 7: Polish and docs

- [x] T019 Run `yarn typecheck && yarn lint && yarn test`, judged by exit code
- [x] T020 Docs: how-it-works §6, §13, §14, §16 and a new short note on users; inventory row in `docs/architecture/100-features.md`; README (owner's manual: add a user, sign in, sign out, what a shared device keeps); CHANGELOG ("Several people, one app" plus the claim warning); `docs/architecture/800-limits-roadmap.md` (no remove-from-this-device button, free-tier storage shared, shared Spotify quota); `src/server/CLAUDE.md` and `src/db/CLAUDE.md` one line each
- [ ] T021 (after Phase 8) Manual run on the real project, quickstart steps 2 to 7 (two users, two Spotify accounts); report what was and was not checked

## Phase 8: Full review of everything that touches user data and sync (last, before the manual run)

- [X] T022 Audit, written to `specs/009-multi-user-data/audit.md`: list every path that reads or writes user data and prove it is per user. At least: every `openDb`/`getAllRows`/`wipeDb` caller and every `localStorage`/`sessionStorage` key in `src/` (Spotify session, `server-session`, `quota lock`, `keyNotation`, `autoUpdates`, `deviceOwner`, `activeUser`, `deviceUsers`, and any other) with its scope (per user, per device, per app) and why; the server layer end to end (`runPush`, `runPull`, `planMixes`, `runRemoveAll`, `readUsage`, `pullJobs`, `requestIdentify`, queued jobs, `serverPending`, `serverStamps`, `serverLastSync`, `mixDeleted` metas) for a user switch, a sign-out and a sign-in as another user, with in-flight pushes and pulls; the automatic chain and `autoSync` while signed out, while signing out, and across two tabs; `disconnect`, `removeServerData`, the account-switch question, `startServerSignOut`; the worker's queue and a result applied to the right user; every `signal` in `model/state.ts` that holds user rows and when it is reset; the demo and `VITE_DEMO_FAKE_SERVER` modes; a token refresh that fails mid-session; two tabs, two users, one device; the SQL rules against a second real user. Each item ends "per user, because …" or a numbered finding with a failure scenario.
- [X] T023 Fix every Critical and Important finding of T022 with a test each (one fix dispatch, one scoped re-review); minors go to Limits and roadmap.
- [ ] T024 Final whole-branch review of round 009 (most capable model), then the three gates by exit code, before T021.

## Dependencies

T001 → T002. T003 → T004 → T005. T004 → T006 → T007 → T008 → T009. T007 → T010. T011 → T012. T009 and T012 → T014 → T015 → T016 → T017. T013 and T018 can run in parallel with Phases 4 to 5. T019 → T020 → T022 → T023 → T024 → T021.

## Strategy

MVP is Phase 1 to 3: the owner's data keeps working through the new naming with nothing visible changing. Then the gate and a second user (Phase 4), then switching and sign-out (Phase 5). The gate (T012) goes in only after T009, so no state exists where the owner is locked out of their data.
