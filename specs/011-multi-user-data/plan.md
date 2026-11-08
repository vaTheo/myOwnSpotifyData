# Implementation Plan: Multi-user data

**Branch**: `011-multi-user-data` (work on `task/general-dev`) | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

## Summary

The server account (the Supabase user) becomes the unit that owns data. The server side already separates users (every table has
`owner_id = auth.uid()` row rules, and the worker signs in as its user), so the work is on the device: one local database and one
set of Spotify keys **per user**, chosen by who is signed in. Nothing is copied or renamed: the first user to sign in on a device
**claims the existing names** (`spotify-dj`, `session`, `pkce`), so the owner's data stays exactly where it is; every other user gets
names suffixed with their user id. A switch of user sets a pointer and reloads the page, so no in-memory singleton ever holds
another user's data. With server settings present, the app shows a sign-in screen until someone is signed in; without them, nothing
changes (the claimed names are the unscoped ones).

## Technical Context

**Language/Version**: TypeScript ~6.0.3, Preact + `@preact/signals`
**Primary Dependencies**: none new
**Storage**: IndexedDB (one database per user: `spotify-dj` for the claimer, `spotify-dj-u-<userId>` for others; stores and `DB_VERSION` 4 unchanged); `localStorage` keys per user for the Spotify session
**Testing**: Vitest, pure functions next to source (`userScope.test.ts`), `fake-indexeddb/auto` for the repo; a manual two-user run on the real project (quickstart)
**Target Platform**: browser, desktop first, Android phone
**Project Type**: single static web app
**Performance Goals**: switching user in under 5 s (SC-003): one reload, then the normal local load
**Constraints**: no store change, no data copy; no Spotify read on load; the server never computes; the app works without the server
**Scale/Scope**: a handful of users; one new pure module, one sign-in screen, edits to six existing files

## Constitution Check

| Principle | Status |
|---|---|
| I. Browser-first, one owner's server | **Amend**: "for the owner alone" becomes "for the owner and the accounts the owner creates". No secret, no proxy, no new setting. ADR-14 and a constitution MINOR bump (2.4.0). |
| II. No Spotify reads on load | Pass: the gate and the switch read only local state and the server session; the chain is unchanged and runs for the signed-in user only. |
| III. Writes on a tap | Pass: unchanged. |
| IV. External sources keyless | Pass: unchanged. |
| V. IndexedDB upgrades only add | Pass: no upgrade at all; a new user's database is created at the current version by the existing `upgrade`. Nothing renamed or rewritten, which is why claiming keeps names. |
| VI. Play counts from the export | Pass: unchanged, per user. |
| VII. Every failure shown | Pass: the sign-in screen shows link errors; an unreadable pointer falls back to the sign-in screen with a message. |

Re-checked after design: only Principle I changes, and it changes in ADR-14 first (Governance: the ADR index leads).

## Project Structure

### Documentation (this feature)

```text
specs/011-multi-user-data/
├── plan.md  research.md  data-model.md  quickstart.md
├── contracts/ui.md
└── spec.md, checklists/requirements.md
```

### Source Code

```text
src/server/userScope.ts          NEW  pure: claim, dbNameFor, keyFor, userIdFromToken, active pointer helpers
src/server/userScope.test.ts     NEW
src/server/session.ts            session gains `userId`; read from the token's `sub` for sessions stored before this round
src/db/schema.ts                 DB_NAME stays the claimer's name; `userDbName(userId)`
src/db/repo.ts                   dbName() resolves the active user's database (demo rule first, unchanged)
src/auth/browser.ts              Spotify session keys scoped by the active user
src/model/state.ts               completeServerLink activates (claim, pointer, reload on change); sign-out clears the pointer and reloads; disconnect and Remove server data act on the active scope
src/main.tsx                     boot: server configured and nobody signed in -> bootPhase 'signedout'
src/app.tsx, src/ui/signin/SignInGate.tsx   NEW  email field, "link sent" notice, errors; no data rendered
src/ui/settings/…                the server card shows the signed-in email and "N people use this device"
docs/architecture/700-adr/ADR-14-users-by-server-account.md   NEW
.specify/memory/constitution.md  Principle I amended, version 2.4.0
```

**Structure Decision**: scope lives in one small pure module that the db, auth and state layers import; nothing else learns about users.

## Complexity Tracking

| Item | Why needed | Simpler option rejected |
|---|---|---|
| Reload on user switch | Module-level singletons (`auth`, db promise, `model`, 40+ signals) would otherwise need a reset path per signal | Resetting every signal by hand: one missed signal leaks another user's rows (FR-002) |
| Claim by first sign-in | Keeps the owner's data in place with no copy, which Principle V forbids rewriting | Copying the database to a new name: hours of data duplicated, a failure window |
