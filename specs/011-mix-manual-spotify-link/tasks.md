---

description: "Task list for adding a Spotify link to a not-found track"
---

# Tasks: Add a Spotify link to a track that was not found

**Input**: Design documents from `/specs/011-mix-manual-spotify-link/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/link-paste.md, quickstart.md

**Tests**: Vitest, pure functions only, tests next to source (no DOM tests); one Playwright regression row. Do not run `yarn shots` unless the owner asks.

**Format**: `- [ ] T### [P?] [US?] Description with file path` · `[P]` = different files, no dependency on an unfinished task.

## Phase 1: Foundational (blocks the stories)

- [x] T001 Add `spotifyBy?: 'owner'` to `TracklistRow` in `src/db/schema.ts` with a doc comment: set only with an object `spotify` when the owner pasted the link; cleared on rename and on Remove link; no `DB_VERSION` bump (ADR-05)
- [x] T002 [P] Create `src/features/mix/spotifyLink.ts` and `spotifyLink.test.ts`: `parseSpotifyTrackLink(text): string | null` (trim; `http(s)://open.spotify.com` or `play.spotify.com`, optional `/intl-xx/` segment, `/track/<id>`, query/fragment ignored; or `spotify:track:<id>`; id must match `^[A-Za-z0-9]{22}$`; albums, artists, playlists, episodes, `spotify.link`, other hosts, free text and empty return null); `linkedRow(row, id, now)` → `{ ...row, spotify: { id, url: 'https://open.spotify.com/track/<id>' }, spotifyBy: 'owner', checkedAt: now }`; `unlinkedRow(row)` → `spotify: 'not-found'`, `spotifyBy` removed, `checkedAt` kept; tests cover every row of contracts/link-paste.md including the example `https://open.spotify.com/track/1qGibBSuprByJCYMC4zRUG?si=f4ed2a88f4744bea`
- [x] T003 [P] In `src/server/validate.ts` accept `spotifyBy` only equal to `'owner'` and only beside an object `spotify` (else `fail('mixes.row.spotifyBy')`, same style as the `validated` check ~line 264); add cases to the server validate test next to it

## Phase 2: User Story 1 - Paste a link on a not-found track (P1) 🎯 MVP

**Goal**: tap the red mark, paste, confirm; the row is found.

**Independent Test**: quickstart step 2 first bullet and the refused-paste bullet.

- [x] T004 [US1] In `src/model/state.ts` add `linkMixRowSpotify(index: number, text: string): string | null` (returns the refusal message or null; uses `parseSpotifyTrackLink`, `linkedRow`, replaces the row in `mixRows`; messages "Paste a Spotify track link." for empty and "That is not a Spotify track link." otherwise; only acts on a named (`isIdentified`) row) and `unlinkMixRowSpotify(index)`; list nothing in the jobs table (no job, no `confirm()`)
- [x] T005 [P] [US1] Create `src/ui/mix/LinkForm.tsx`: inline form (text input labelled "Spotify track link", Link, Cancel, optional Remove link, a message line `role="alert"`), 48 px controls, tokens only, full width on a phone; props `{ name, initial?, onLink(text): string | null, onCancel, onRemove? }`; add its CSS to `src/styles.css`
- [x] T006 [US1] In `src/ui/mix/TracklistTable.tsx` make the not-found mark of `SpotifyCell` (computer and the phone "Not found" text) a button labelled "Link a Spotify track to <track>" that sets a `linking: number | null` state, and render `LinkForm` under that row (as the Edit form is rendered; keep `keyOf`/`revealKey` working for a linking row); on success close the form
- [x] T007 [US1] Pin FR-006 and the rename rule: tests in `src/features/mix/spotifyCheck.test.ts` (`rowsToCheck` skips a hand-linked row; `keepStoredAnswers` keeps it) and `src/features/mix/lookup.test.ts` (a rename drops `spotify` and `spotifyBy`; a label-only edit keeps both); in `src/features/mix/lookup.ts` `editTracklistRow` delete `spotifyBy` where it deletes `spotify`
- [x] T008 [US1] In `src/features/mix/keepReview.ts` carry `spotifyBy` wherever `spotify` is carried (line ~67 and the matching merge code) with a test in `keepReview.test.ts`

**Checkpoint**: typecheck, lint, test green; US1 works alone.

## Phase 3: User Story 2 - The pasted track goes into the playlist (P1)

**Goal**: Create playlist adds the linked track once.

**Independent Test**: tests below; quickstart step 2 Create playlist bullet.

- [x] T009 [US2] In `src/features/mix/createPlaylist.ts` push each URI once (keep order; a `Set` of seen URIs around both `uris.push(stored)` and `uris.push(match.uri)`); `added` counts distinct URIs; tests in `createPlaylist.test.ts`: a hand-linked row is added from `storedUri` with no search call, two rows with the same id add it once, a not-found row is skipped as before

## Phase 4: User Story 3 - Fix or remove a link (P2)

**Goal**: replace a wrong link, or remove it.

**Independent Test**: quickstart step 2 Replace/Remove bullet.

- [x] T010 [US3] In `src/ui/mix/TracklistTable.tsx` add "Replace link" and "Remove link" items to the row's More menu, shown only when `row.spotifyBy === 'owner'`; Replace opens `LinkForm` with the current id's URL; Remove calls `unlinkMixRowSpotify` (the form's Remove link button does the same); the Spotify cell of a hand-linked row stays the found app link
- [x] T011 [P] [US3] Test `unlinkedRow` and a replace (`linkedRow` over a hand-linked row) in `src/features/mix/spotifyLink.test.ts`; confirm the sort and counts treat the unlinked row as not found

## Phase 5: Polish and docs

- [ ] T012 Update `tools/shots/regression.spec.ts` and `specs/003-web-first-redesign/regression.md` with row M03: link the demo's not-found row with the example link (the row shows found, its Spotify href is `spotify:track:1qGibBSuprByJCYMC4zRUG`, counts move), an album link is refused with the message, Remove link returns it to not found; run `yarn regression` (A05 is a known stale failure; stop and report if port 5173 is held)
- [ ] T013 Docs round: `src/features/mix/CLAUDE.md` (local rule: a pasted link is stored by id, never verified or looked up), `docs/architecture/000-how-it-works.md` (§ mix: `spotifyLink.ts`, `spotifyBy`, the form), `docs/architecture/100-features.md` (new F27 row; check F26 is the last), `README.md` (owner's manual: how to link a not-found track), `CHANGELOG.md` (2026-11-08 entry), `docs/README.md` (specs map lists 011); no new ADR (state it in the CHANGELOG)
- [ ] T014 Run `yarn typecheck`, `yarn lint`, `yarn test` (exit codes) and walk quickstart step 2 on `?demo`

## Dependencies

- T001 before T002, T004, T007, T008; T002 before T004; T003 independent.
- US1: T004 and T005 before T006; T007 and T008 after T001.
- US2: T009 after T001 only (can run beside US1).
- US3: T010 after T006; T011 after T002.
- Polish after all stories.

## Parallel example

T002, T003 and T005 touch different files and can run together after T001.

## Implementation strategy

MVP = Phases 1–2. Then the playlist dedupe, then Replace/Remove. Commit per phase, each green; push only with the owner's OK.
