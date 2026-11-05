# Implementation Plan: A server and database holding the app's data

**Branch**: `001-backend-data-sync` (work happens on `task/general-dev`; the spec directory name is the feature id) | **Date**: 2026-11-05 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-backend-data-sync/spec.md`

## Summary

Give the owner one server, a Supabase Free project with Postgres, PostgREST and Auth, that holds every dataset the app builds
(library, history, features, reach, mixes) per Spotify account, so a fresh browser restores everything after one sign-in and two
devices converge on the newest copy of each dataset. The browser talks to it directly with plain `fetch` (no new dependency), rows
travel as JSON in batches under a per-push generation so swaps are atomic, newer wins per dataset by the time the data was fetched,
mixes by row with tombstones. The server stores and never computes; it never sees a Spotify token; without it the app is today's
app. A `jobs` table is created empty for the next round's worker (FR-017). Details: [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript ~6.0.3, Node 24, ES2022 target, Preact 10 + `@preact/signals`; SQL (Postgres 15+, Supabase)

**Primary Dependencies**: none added. Browser side: `fetch` against PostgREST and GoTrue (`src/server/client.ts`, modelled on
`src/spotify/client.ts`). Server side: `supabase/migrations/0001_init.sql`, applied with `npx supabase@2 db push` (not a repo dependency).

**Storage**: Supabase Postgres (four tables: `datasets`, `dataset_rows`, `mixes`, `jobs`; function `storage_used()`), RLS by
`owner_id = auth.uid()`. Locally: the existing IndexedDB (`DB_VERSION` stays 4; three new `meta` names) and one `localStorage` key
`server-session`.

**Testing**: Vitest (Node environment), `fake-indexeddb/auto` for repo tests, fake `fetchFn` for client tests; no DOM tests.

**Target Platform**: the browser (Chrome on Android, desktop browsers), static site on GitHub Pages; the hosted database.

**Project Type**: single Vite web app plus a `supabase/` folder of SQL; no server code of the owner's.

**Performance Goals**: a full first push of the owner's data in under five minutes on the phone (a few hundred requests of 500
rows); a pull of every dataset into an empty browser in under one minute (SC-001); unchanged datasets cost one `datasets` read.

**Constraints**: request bodies under about 1 MB (batches of 500 rows); no Spotify call from a pull (ADR-02); the app must work
whole when the server is unset, offline or paused; the Free plan pauses after seven days of inactivity and only the dashboard resumes
it; 500 MB database, 5 GB egress a month.

**Scale/Scope**: one owner, one or two Spotify accounts, about 20 MB of rows (research "Sizes"); five datasets; one new Settings
card; about eight new source files with their tests; one hook in `main.tsx`; one SQL migration; five documentation pages touched.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.* Constitution v2.0.0.

| Principle | Check | Result |
|---|---|---|
| I. Browser-first, no secret, one owner's server (ADR-01, ADR-08) | PKCE unchanged; no secret (publishable key is public, signups disabled); the server is a hosted database with sign-in on a free tier; it stores and never computes; never holds a token, never calls Spotify; app works whole without it (`status: 'unset'`); the worker stays outside (empty `jobs` table); IndexedDB stays the working copy | PASS |
| II. No Spotify reads on load (ADR-02) | a pull reads only the server; the Spotify account id comes from the `datasets` stamp (D11), never from `/me` | PASS |
| III. Writes only on a tap (ADR-03) | no new Spotify write, no new scope | PASS |
| IV. Keyless external sources (ADR-04) | external data sources unchanged; the server key is the service's public key, guarded by RLS; clients never throw (`ServerResult`) | PASS |
| V. Additive IndexedDB (ADR-05) | no new store, no `DB_VERSION` bump; new `meta` names and a `replaceDataset` repo function; `mixes` stays out of `buildModel` | PASS |
| VI. Play counts from the export only (ADR-07) | a pull writes `plays` rows and `historySummary` (version 2) in one transaction; the gates read the summary, never rows | PASS |
| VII. Every failure shown | `serverState` signal rendered by the Settings server card; `error`/`offline`/`paused` states carry a reason; `errorBanner` for failures that hide expected data | PASS |
| Tooling: lean, pins, no new dependency without asking | no dependency added; `npx supabase@2` only in the owner's manual; CI gains two build variables; TS and Vite pins untouched | PASS |
| Four `confirm()` calls, all in `model/state.ts` | a fifth confirm (Remove server data) in `model/state.ts`; the rule text is already behind the code (D12) | VIOLATION, justified below |
| New job decides `jobsBusy()` and `disconnect` | pull joins `jobsBusy()`; push does not; `disconnect` keeps the server session and data (D7) | PASS |
| Workflow: options to the owner, test-first, three checks, docs that end a round | choices recorded in research.md with alternatives; tests listed in quickstart §4; docs listed under Project Structure | PASS |

**Post-design re-check (after Phase 1)**: unchanged; the data model adds no store and no dependency; the `jobs` table holds no rows
and is read by nothing, so "the server never computes" holds.

## Project Structure

### Documentation (this feature)

```text
specs/001-backend-data-sync/
├── plan.md              # This file
├── research.md          # D1–D12 and the size estimate
├── data-model.md        # server tables, local meta, signals, validation rules
├── quickstart.md        # project setup, run, twelve validation scenarios, the tests
├── contracts/
│   ├── server-schema.md # tables, RLS, requests, auth, error mapping
│   └── client-api.md    # src/server/* interfaces, repo and state additions, the Settings card
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks output (not created here)
```

The round also ends with the repository documents (Contributing, "One change, several files"):
`docs/specs/2026-11-05-backend-data-sync-design.md` (a short page linking here), a feature inventory row and an updated "What leaves
the browser" table, a new §16 "server/" in How the app works and a row in the §14 jobs table, the README's "Nothing is uploaded"
paragraph and a "Server" section of the owner's manual, a CHANGELOG entry, Limits and roadmap, the corrected `confirm()` rule in
CLAUDE.md, and `src/server/CLAUDE.md` (required inputs, expected outputs) with its `AGENTS.md` symlink.

### Source Code (repository root)

```text
src/
├── env.ts                      # + SUPABASE_URL, SUPABASE_KEY
├── server/                     # new
│   ├── CLAUDE.md               # local rules (+ AGENTS.md symlink)
│   ├── client.ts               # fetch edge: PostgREST + GoTrue, ServerResult, never throws
│   ├── client.test.ts
│   ├── session.ts              # server session store (localStorage, refresh margin)
│   ├── session.test.ts
│   ├── datasets.ts             # pure: dataset defs, stamps, compareStamps, batches, planMixes, rowKey
│   ├── datasets.test.ts
│   ├── sync.ts                 # runPush, runPull, runRemoveAll, readUsage (injected deps)
│   └── sync.test.ts
├── db/
│   ├── repo.ts                 # + replaceDataset (one transaction), no DB_VERSION bump
│   └── repo.test.ts            # + replaceDataset tests
├── model/state.ts              # + serverState, startServerSignIn/SignOut/Pull, queueServerPush, removeServerData; job tails
└── ui/Settings.tsx             # + ServerCard; Disconnect text

supabase/
└── migrations/0001_init.sql    # datasets, dataset_rows, mixes, jobs, storage_used(), RLS, grants

.github/workflows/ci.yml        # build env: VITE_SUPABASE_URL, VITE_SUPABASE_KEY from repository variables
.env.example                    # + the two names
```

**Structure Decision**: one Vite app as today, with a new `src/server/` folder in the "pure cores behind thin I/O edges" shape of
every other folder, and a `supabase/` folder holding the SQL the owner applies. No `backend/` tree: there is no server code to run.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| A fifth `confirm()` (Remove server data), against "Four `confirm()` calls only, all in `model/state.ts`" | FR-014: removing every byte of the owner's listening history from a server is destructive and must be confirmed; the Disconnect question must also say server data is kept | Folding it into Disconnect would make Disconnect either delete server data (the spec defaults to keeping it) or ask two questions; a non-confirmed delete is a destructive tap. The rule text is also already behind the code: `state.ts` holds four mix "replace the working list" confirms and `Settings.tsx` holds the Disconnect one. The docs pass corrects the rule to "every `confirm()` is listed in How it works §14; destructive ones live in `model/state.ts`" rather than pretending to a count. |

## Phase 0 and Phase 1 outputs

- Phase 0: [research.md](research.md), all Technical Context unknowns resolved (D1–D12).
- Phase 1: [data-model.md](data-model.md), [contracts/server-schema.md](contracts/server-schema.md),
  [contracts/client-api.md](contracts/client-api.md), [quickstart.md](quickstart.md).

## Owner's picks (2026-11-05)

1. Plain `fetch`, no dependency (D2).
2. Sign-in by magic link (D3); email and password was declined.
3. One Spotify account (D11); the per-account keying stays.
4. Spec Kit files, ADR-08 and the constitution are committed before `/speckit-tasks`.
