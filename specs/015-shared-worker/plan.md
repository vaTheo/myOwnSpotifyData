# Implementation Plan: One worker for every user

**Branch**: `015-shared-worker` (spec branch `spec/shared-worker`) | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

**Numbering** (checked on `origin/main`, 2026-11-08): round **015** (main holds specs up to 014), **ADR-16** (main holds ADR-15), inventory row **F31** (main holds F30), migration **`0006_shared_worker.sql`** (main holds 0001 to 0005), constitution **2.6.0** (Principle I names the worker role), worker **0.6.0** (a new mode).

## Summary

A shared worker is an ordinary Supabase sign-in the owner creates in the dashboard and lists in one private table, `shared_workers`. It cannot see any table. It reaches the queue only through five `security definer` functions that each check the list first: `is_shared_worker`, `claim_any_job` (one request per user in turn, returns only the request id and link), `worker_set_progress`, `worker_finish_job` and `worker_release_job` (each acts only on a request the caller holds). The personal path (`claim_job` and the plain `PATCH` on `jobs`) is not touched, so a worker signed in as an ordinary user behaves exactly as today. The worker program gets `WORKER_MODE=personal|shared` (default personal); shared mode calls the five functions instead of the table. The app changes nothing.

## Technical Context

**Language/Version**: Python 3.12 (worker, standard library only), SQL for Postgres 15 (Supabase); TypeScript only for the audit test
**Primary Dependencies**: none new
**Storage**: server only: one table (`shared_workers`), one column on `jobs` (`claimed_by_user`), five functions (`0006_shared_worker.sql`); IndexedDB unchanged, no `DB_VERSION` bump
**Testing**: `python -m unittest discover -s tests` (the worker's server client faked for shared mode, the claim order and the refusals), `rules.test.ts` extended to read the new SQL (new table has no policy and no grant, each function is definer with `search_path ''`, checks the list first, executes for `authenticated` only), a manual two-user run on the real project (quickstart)
**Target Platform**: the owner's computer (Windows, Linux, macOS); the app is untouched
**Project Type**: the Supabase project plus the worker program
**Performance Goals**: one extra function call per poll and per progress write, same order as today; claim stays one statement
**Constraints**: no Spotify host, no secret in the app, one probe at a time per worker, the owner creates worker accounts only, an ordinary account never becomes a worker
**Scale/Scope**: a handful of users and one to a few workers

## Constitution Check

| Principle | Status |
|---|---|
| I. Browser-first, one owner's server | **Amend**: a named worker role may take any user's identification request through five functions; the server still stores and never computes; no secret in the app; no app change. ADR-16, constitution 2.6.0, ADR-14 and ADR-08 amendment notes. |
| II. No Spotify reads on load | Pass: untouched. |
| III. Writes on a tap | Pass: untouched. |
| IV. External sources keyless, by id | Pass: the worker's sources and pacing are unchanged. |
| V. IndexedDB upgrades only add | Pass: no upgrade. |
| VI. Play counts from the export | Pass: untouched. |
| VII. Every failure shown | Pass: a worker not on the list stops with a message and keeps the Windows window open; a refused write is a log line as today. |

Re-checked after design: only Principle I changes, in ADR-16 first. ADR-14's "a user never sees or changes another user's data" stays true for every personal table and for every user's requests: the shared role is the one named exception, and it sees a request's id and link only while it holds it.

## Project Structure

```text
specs/015-shared-worker/
├── plan.md  research.md  data-model.md  quickstart.md  tasks.md
├── contracts/server-sql.md, contracts/worker.md
└── spec.md, checklists/requirements.md
```

```text
supabase/migrations/0006_shared_worker.sql        NEW  shared_workers, jobs.claimed_by_user, five definer functions, grants last
worker/mix_worker/config.py                       EDIT WORKER_MODE (personal | shared), default personal
worker/mix_worker/server.py                       EDIT shared-mode methods beside the personal ones (same names, same results)
worker/mix_worker/cli.py                          EDIT choose the client by mode; the start check for shared; exit code 7; the start line names the mode
worker/mix_worker/env.example, worker/.env.example  EDIT WORKER_MODE line (kept equal)
worker/tests/test_server.py, test_cli.py, test_config.py  EDIT/NEW tests for shared mode
worker/pyproject.toml, mix_worker/__init__.py, uv.lock    EDIT version 0.6.0
src/server/rules.test.ts                          EDIT audit of the new table, column and functions
docs/architecture/700-adr/ADR-16-shared-worker.md NEW  decision; ADR-14 and ADR-08 amendment notes, ADR index
docs/…, CHANGELOG.md, README.md, worker/README.md EDIT inventory F31, how-it-works §16 §17, limits, owner steps
```

**Structure Decision**: personal mode is left alone on purpose (FR-007). Shared mode is a second small client with the same four methods the pipeline already calls (`claim`, `finish`, `progress`, `release`), so `pipeline.py` and `scan.py` do not change.

## Complexity Tracking

| Item | Why | Simpler option refused |
|---|---|---|
| Five functions instead of table policies | A table policy cannot limit columns, so a worker able to update `jobs` could also change `owner_id`; functions whitelist what they write | A policy on `jobs` for shared workers: one missed column leaks or hijacks a request |
| `claimed_by_user` column | Binds a held request to the worker account, so another shared worker cannot write on it and a stale reclaim is possible | Trust `claimed_by` (a free text name any worker can repeat) |
| Two clients in the worker | Personal mode stays byte-for-byte as today | One client with a branch inside every call |
