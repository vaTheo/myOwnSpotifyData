# Tasks: One worker for every user

**Input**: `specs/015-shared-worker/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md)
**Tests**: test-first. Worker: `uv run python -m unittest discover -s tests` with every external call faked. App side: `rules.test.ts` audit only (no app change). The SQL itself cannot run in the tests: it is pinned by the audit and verified on the real project in the quickstart (T023). Numbering: round 015, ADR-16, F31, migration 0006, worker 0.6.0, constitution 2.6.0 (re-check `git ls-tree origin/main` before the first commit).

## Phase 1: Setup (decision first, docs lead)

- [ ] T001 Write `docs/architecture/700-adr/ADR-16-shared-worker.md` (a named worker role serves every user's identification request through five definer functions; no table privilege; the list `shared_workers` is edited only by the owner; one request per user in turn; personal mode kept; options refused: service key, table policies on `jobs`, worker per user, a token claim; consequences and limits from `research.md` D1 to D8)
- [ ] T002 Amend `docs/architecture/700-adr/ADR-14-users-by-server-account.md` and `ADR-08-owner-server-free-tier.md` with a short "Amended by ADR-16" note each (ADR-14: "the worker reads its signed-in user's queue" holds for personal mode; a shared worker is the one named exception; ADR-08: the worker may serve every user), add the row to `docs/architecture/700-adr/README.md` and the page to `docs/README.md`
- [ ] T003 Amend Principle I in `.specify/memory/constitution.md` (the server also lets a named worker role take any user's identification request through functions; still stores, never computes, no secret in the app), bump to 2.6.0 with the Sync Impact Report

## Phase 2: Foundational (blocks every story)

- [ ] T004 Write failing tests in `src/server/rules.test.ts` for the audit per `contracts/server-sql.md` "What rules.test.ts must pin" items 1 to 6: (a) it accepts the real `0006_shared_worker.sql`, (b) it reports `shared_workers` if it gained a policy or a grant to `authenticated`, `anon` or `public`, (c) it reports a shared-worker function that is not `security definer`, lacks `set search_path = ''`, grants execute to `anon` or `public`, or touches `jobs` before `require_shared_worker()`, (d) the definer allow-list is exactly the four of 0004/0005 plus the five plus `require_shared_worker`, (e) `claim_any_job` pins `for update skip locked`, the owner's latest claim in `order by` before `priority`, and returns only `id` and `payload`, (f) 0006 creates or alters no policy on `jobs`; keep every existing test name unchanged (`yarn invariants`)
- [ ] T005 Write `supabase/migrations/0006_shared_worker.sql` per `contracts/server-sql.md` and `data-model.md`: `shared_workers` (`user_id uuid primary key references auth.users (id) on delete cascade`, `label text not null default ''`, `added_at timestamptz not null default now()`), RLS on, no policy, `revoke all … from authenticated, anon, public`; `alter table public.jobs add column claimed_by_user uuid references auth.users (id) on delete set null`; `require_shared_worker()` (no grant), `is_shared_worker()`, `claim_any_job(p_worker text, p_stale_seconds integer)` returns `table (id uuid, payload jsonb)` with the order "owner's latest `claimed_at` ascending nulls first, `priority desc`, `created_at`" and `for update skip locked`, `worker_set_progress` returns `table (taken boolean, stop boolean)` always one row, `worker_finish_job` (allowed keys `status` in `done`/`failed`, `finished_at`, `result`, `error`, any other key `22023`), `worker_release_job`; every function `security definer`, `set search_path = ''`, `revoke all … from public, anon`, `grant execute … to authenticated` last; avoid the plpgsql name clash (`#variable_conflict use_column` or qualified columns); T004 green
- [ ] T006 [P] Failing tests in `worker/tests/test_config.py` then implement `WORKER_MODE` in `worker/mix_worker/config.py`: `personal` (default) or `shared`, anything else `SettingsError("WORKER_MODE", "must be personal or shared")`; add the line to `worker/.env.example` and `worker/mix_worker/env.example` (kept equal; the existing equality test stays green), and a row to the settings table in `worker/README.md`
- [ ] T007 [P] Failing tests in `worker/tests/test_server.py` for a shared-mode client with the personal client's four method names: `claim` posts `rpc/claim_any_job` with `p_worker` and `p_stale_seconds` and returns `None` on `[]` and the `{id, payload}` dict otherwise; `finish` posts `rpc/worker_finish_job` and answers `"done"` on `true`, `"taken"` on `false`; `progress` posts `rpc/worker_set_progress` and returns `{"stop", "taken"}` from the one row; `release` posts `rpc/worker_release_job` with the 3 s timeout; HTTP `42501` maps to a distinct result the caller can turn into exit 7; the personal client's tests stay untouched
- [ ] T008 Implement the shared-mode client in `worker/mix_worker/server.py` (a second class or methods beside the personal ones, same method names and return shapes so `pipeline.py` and `scan.py` do not change); T007 green

## Phase 3: User Story 1 - A friend asks for a mix and the owner's worker answers (P1) MVP

**Independent test**: with the worker's server faked as one queue holding requests of two users, a shared-mode run takes both, one at a time, and sends each result through `worker_finish_job` on the request it holds; no personal call is made.

- [ ] T009 [US1] Failing tests in `worker/tests/test_cli.py`: in shared mode the start asks `is_shared_worker` once; `true` → the start line ends with "shared worker" and the run claims through `claim_any_job`; the run loop, progress writes, the Stop reading, the release on Ctrl-C and the "queue empty" lines are the personal ones; personal mode makes no `is_shared_worker` call and prints its present line
- [ ] T010 [US1] Implement in `worker/mix_worker/cli.py`: pick the client by `settings.worker_mode`, the shared start check, the start line naming the mode (`mix-worker <version> · <url> · as <email> · on <name> · shared worker`); T009 green
- [ ] T011 [US1] Test in `worker/tests/test_pipeline.py` that a shared-mode client run (fake HTTP) still sees only the project's host and writes the F15 result unchanged through `worker_finish_job`

## Phase 4: User Story 2 - The worker sees only what it needs (P1)

**Independent test**: the audit proves the shared role has no table privilege and no function returns more than the request id and link.

- [ ] T012 [US2] Extend `src/server/rules.test.ts` with the real-file pins for the reads: `claim_any_job` returns exactly `id` and `payload` (no `owner_id`, `result`), `worker_set_progress` returns exactly `taken` and `stop`, the three write functions return a boolean, the hold filter (`status = 'claimed'`, `claimed_by = p_worker`, `claimed_by_user = auth.uid()`) appears in all three write functions, `worker_finish_job` rejects keys outside its list (the `22023` branch is in the file)
- [ ] T013 [US2] Pin in `src/server/rules.test.ts` that `claim_job` (personal) and every `jobs` policy are byte-for-byte unchanged by 0006 (no `create or replace function public.claim_job`, no policy statement on `jobs`)

## Phase 5: User Story 3 - Only the owner can run a shared worker (P1)

**Independent test**: an ordinary account is refused every shared function; removing a worker from the list stops it at the next call.

- [ ] T014 [US3] Failing tests then implement in `worker/mix_worker/cli.py`: `is_shared_worker` answers `false` → log "this account is not a shared worker: ask the owner to add it to shared_workers", return exit code **7** (`EXIT_NOT_SHARED`), add it to the exit-code list and the docstring; a `42501` from any shared call during a run → "this account is no longer a shared worker", exit 7, no release attempt; the console stays open on code 7 for a double-clicked Windows `.exe` (the 0.5.3 rule applies to every non-zero code: add a test)
- [ ] T015 [US3] Document the owner steps in `worker/README.md` (create the worker user in the dashboard with a dedicated email, apply 0006, `insert into public.shared_workers`, set `WORKER_MODE=shared`, remove the row to disable, exit code 7) and in the "Before the first login" section; no secret is shown

## Phase 6: User Story 4 - A personal worker keeps working (P2)

**Independent test**: with `WORKER_MODE` unset, every existing worker test passes unchanged and the personal client's requests are the same as before.

- [ ] T016 [US4] Confirm no existing worker test was edited except to add cases; add one test in `worker/tests/test_cli.py` that personal mode with the default setting never calls any `rpc/*` of 0006 and still calls `rpc/claim_job` and the `PATCH` on `jobs`; add the "personal worker and shared worker at once never take one request twice" case to the fake queue (held rows are invisible to the other claim)

## Phase 7: User Story 5 - Fair turns between users (P2)

**Independent test**: the audit pins the order; the real order is checked on the real project (quickstart step 3).

- [ ] T017 [US5] Add a worker-side test with a fake queue that two requests of one user and one of another come back A, B, A when the fake applies the documented order (documents the contract; the SQL itself is verified in T023), and the "Move to top" note in `docs/architecture/000-how-it-works.md` §17 (priority orders within a user only in shared mode)

## Phase 8: Polish and docs

- [ ] T018 Bump the worker to 0.6.0: `worker/pyproject.toml`, `worker/mix_worker/__init__.py` (tested equal), `uv lock`, a `worker/RELEASE_NOTES.md` entry (shared mode, exit code 7, the owner steps)
- [ ] T019 Docs: inventory row F31 in `docs/architecture/100-features.md` (state "built; the owner's run on the real project (T023) pending"), how-it-works §16 (the five functions, the list, the role) and §17 (worker modes), `docs/architecture/800-limits-roadmap.md` (the D8 list: no per-user cap, no shared result for the same link, no app screen for workers, an owner can set `claimed_by_user` on their own request), `CHANGELOG.md` entry (what changed and the three owner steps), `README.md` (owner's manual line), the `CLAUDE.md` lines (root: the worker role; `worker/CLAUDE.md`: mode, exit code 7, "shared mode never reads a personal table"; `src/server/CLAUDE.md`: the list and the five functions)
- [ ] T020 Gates after the last edit, judged by exit code: `yarn typecheck`, `yarn lint`, `yarn test`, `cd worker && uv run python -m unittest discover -s tests`, `yarn invariants`; no `yarn shots`, no `yarn regression` (no UI change)
- [ ] T021 Final whole-branch review on a mid-tier reviewer against `spec.md`, `contracts/server-sql.md` and the isolation rules (the shared role reads nothing but `id` and `payload` of a held request; no table privilege; personal mode untouched); one fix dispatch if needed
- [ ] T022 Commit, push `spec/shared-worker` renamed if needed, open the PR (owner's OK for push and merge to be asked first); merge only after CI is green
- [ ] T023 Owner-run: apply `0006_shared_worker.sql` on the real project, create the worker user, list it, run `specs/015-shared-worker/quickstart.md` section 2 (checks 1 to 5) and section 3 (two users, fair order, disable, personal mode, two workers) and record the output under "Recorded output" in the quickstart; pending

## Dependencies and order

- Phase 1 first (ADR before code), then Phase 2: T004 before T005; T006, T007 in parallel; T008 after T007.
- US1 (T009 to T011) needs T005 to T008. US2 (T012, T013) needs T005. US3 (T014, T015) needs T010. US4 (T016) needs T010. US5 (T017) needs T005.
- Polish (T018 to T022) after every story. T023 is the owner's and can run once the migration is applied (before merge for the SQL checks 1 to 5, after the release for the worker run).

## Implementation strategy

MVP is Phase 1 + 2 + US1: the migration and the shared client, then one worker serving two users on the faked queue. US2 and US3 are the security stories and are not optional before release. Build in batches with Sonnet subagents: batch A = T001 to T003 (docs), batch B = T004 to T005 (audit and migration), batch C = T006 to T008 (worker settings and client), batch D = T009 to T011, batch E = T012 to T017, batch F = T018 to T019; the controller runs T020 itself.

## Format validation

All tasks follow `- [ ] T### [P?] [US?] description with file path`. Parallel: T006 and T007 only (different files). Story counts: US1 3, US2 2, US3 2, US4 1, US5 1; setup 3, foundational 5, polish 6.
