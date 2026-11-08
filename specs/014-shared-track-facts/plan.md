# Implementation Plan: Shared track facts

**Branch**: `014-shared-track-facts` (work on `task/general-dev`) | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

**Numbering** (checked on `origin/main`, 2026-11-08): round **014** (main holds specs up to 013), **ADR-15** (main holds ADR-14), inventory row **F30** (main holds F29), migration **`0004_shared_facts.sql`** (main holds 0001 to 0003), constitution **2.5.0** (Principle I gains the shared store).

## Summary

Two small tables on the owner's server hold facts that are the same for everyone: BPM and key by Spotify track id, then listeners and fans by Spotify
artist id. No table carries a user column. Rows are added by any signed-in user with a plain insert (insert-only rule, a check constraint refuses bad
rows, no update, no delete, no select). Rows are read only by two `security definer` functions that take an array of ids (at most 200) and return the
rows that match, so nobody can list a table. The BPM and key run asks the store before ReccoBeats, writes what it gets into the track's `reccobeats`
field exactly as an outside answer would be, looks up only the rest, and sends the new outside answers back. The reach run does the same for the
ListenBrainz and Deezer numbers while they are younger than 90 days. The rekordbox field is never read into a submission and never written from the
store. With no server, signed out or unreachable, the run is today's run and the card says so.

## Technical Context

**Language/Version**: TypeScript ~6.0.3, Preact + `@preact/signals`; SQL for Postgres 15 (Supabase)
**Primary Dependencies**: none new
**Storage**: server only: two new tables and two functions (`0004_shared_facts.sql`); IndexedDB unchanged (no `DB_VERSION` bump, no new field: a store hit is written as an ordinary `reccobeats` value or `artistReach` row)
**Testing**: Vitest next to source, a fake `fetchFn` for the client, an in-memory fake of the two functions and the insert for the two-user test, `rules.test.ts` extended to read the new SQL; a manual run on the real project (quickstart)
**Target Platform**: browser, desktop first, Android phone
**Project Type**: single static web app plus the owner's Supabase project
**Performance Goals**: store read of 1,000 tracks in 5 requests (200 ids each), under 10 s; the by-id and by-ISRC passes of a run whose tracks are all known finish in under 1 minute (SC-001, measured on those two passes, see Spec problems in research D9)
**Constraints**: no Spotify read, no read on load, the server stores and never computes, the app works without it, the store never delays a run past one 10 s timeout
**Scale/Scope**: a handful of users; two tables, two functions, one client module, three edited feature files, one validator, one card line

## Constitution Check

| Principle | Status |
|---|---|
| I. Browser-first, one owner's server | **Amend**: the server holds one named shared store beside the per-user tables; still stores, never computes, never calls Spotify, no secret. ADR-15, constitution 2.5.0, ADR-14 amendment. |
| II. No Spotify reads on load | Pass: the store is read only inside a BPM and key run or a reach run (chain or button), never on load, never from Spotify. |
| III. Writes on a tap | Pass: unchanged; the store write is the server's, not Spotify's. |
| IV. External sources keyless, by id | Pass: the store is keyed by Spotify id only, never by name; the shortcut is consulted before the source and never replaces its rules; the reach pacing test stays green (the shortcut adds no sleep and removes requests only). |
| V. IndexedDB upgrades only add | Pass: no upgrade. |
| VI. Play counts from the export | Pass: play counts are never shared (FR-006). |
| VII. Every failure shown | Pass: a store failure is a line on the run's Settings card (`shared.error`), never silent, never a banner (the run itself succeeds). |

Re-checked after design: only Principle I changes, in ADR-15 first (the ADR index leads). ADR-14's sentence "a user never sees or changes another user's data" stays true for every personal table.

## Project Structure

### Documentation (this feature)

```text
specs/014-shared-track-facts/
├── plan.md  research.md  data-model.md  quickstart.md  tasks.md
├── contracts/server-sql.md, contracts/client-port.md, contracts/ui.md
└── spec.md, checklists/requirements.md
```

### Source Code

```text
supabase/migrations/0004_shared_facts.sql        NEW  two tables, check constraints, insert policies, two definer read functions, grants last
src/features/shared.ts                           NEW  types only: SharedFactsPort, SharedTrackFact, SharedReachFact, SharedRunNote
src/server/sharedFacts.ts                        NEW  the port over the server client: batches, validation, timeout, never throws; constants mirrored from the SQL
src/server/sharedFacts.test.ts                   NEW
src/server/client.ts                             `rpc` takes optional JSON args; new `insertIgnore` (POST, ignore-duplicates, return=minimal)
src/server/validate.ts                           `validateSharedTrackFact`, `validateSharedReachFact` for rows read back (untrusted input)
src/server/rules.test.ts                         audit knows the two shared tables and the two definer functions, refuses any other table without owner_id
src/features/lookup.ts                           LookupDeps.shared?; consult before pass 1; share after each outside batch; LookupState done gains shared?
src/features/reachRun.ts                         ReachDeps.shared?; consult before the MusicBrainz phase; share after each phase; ReachState done gains shared?
src/model/state.ts                               `sharedPort()` (undefined without server, session or in the demo); passed by startLookup and startReach
src/ui/settings/AudioSection.tsx, ReachSection.tsx, lines.ts   one line each (counts, error) and the one-sentence notice (FR-011)
docs/architecture/700-adr/ADR-15-shared-track-facts.md       NEW
docs/architecture/700-adr/ADR-14-users-by-server-account.md  amendment note
.specify/memory/constitution.md                   Principle I amended, version 2.5.0
```

**Structure Decision**: the features layer sees only a port (types in `features/shared.ts`), so `lookup.ts` and `reachRun.ts` never import the server folder (no module cycle, still pure behind injected deps). The server layer implements the port.

## Complexity Tracking

| Item | Why needed | Simpler option rejected |
|---|---|---|
| Two `security definer` read functions | FR-002 forbids listing; a select policy cannot limit a query to ids the caller names | A `using (true)` select policy: any user could page the whole table |
| Reach rows keyed by day, newest wins on read | FR-002 forbids update and delete, yet US4 needs a newer number to replace an old one | An update policy: breaks "no user can change a stored row" |
| An allow-list in `rules.test.ts` | Today's audit refuses every table without `owner_id` and every definer that reads a table, which is the guard we want kept | Loosening the audit for all tables |
