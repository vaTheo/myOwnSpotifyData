# Tasks: Rarely played tracks in my playlists

**Input**: `specs/007-rarely-played-tracks/` (plan.md, spec.md, research.md, data-model.md, contracts/ui.md)
**Tests**: test-first, pure functions (project rule); no DOM tests.

## Phase 1: Setup

- [x] T001 Add `'rarely-played'` to `CRATE_VIEWS` in `src/router.ts` and its row in `src/router.test.ts`; add the title "Rarely played" in `src/ui/layout/titles.ts`

## Phase 2: Foundational

- [x] T002 Write the failing tests in `src/model/rarelyPlayed.test.ts` (counts 0..3, combination, one item per song with all playlist ids, playlist filter, name-matched plays, count above 3 excluded, local file)
- [x] T003 Implement `rarelyPlayed(model, counts, playlistId)` and `RareItem` in `src/model/rarelyPlayed.ts` until T002 passes

## Phase 3: User Story 1 - List the songs I never or barely played (P1) MVP

**Independent test**: Crate → Rarely played shows Never by default, chips combine, each row has Plays and Playlists.

- [x] T004 [US1] Add `rareCounts` (default `{0}`, never empty) and `rarePlaylist` signals to `src/ui/crate/selections.ts`
- [x] T005 [US1] Create `src/ui/crate/Rarely.tsx`: caption with import date, four toggle chips, `CrateTable` with Plays and Playlists columns, empty message
- [x] T006 [US1] Add the `rarely-played` case in `src/ui/crate/CrateView.tsx` and a sixth card in `src/ui/crate/CrateHub.tsx`

## Phase 4: User Story 2 - Narrow to one playlist (P2)

- [x] T007 [US2] Add the playlist menu to `src/ui/crate/Rarely.tsx` and the "Nothing to listen to in this playlist." message

## Phase 5: User Story 3 - Sort and filter like other song tables (P3)

- [x] T008 [US3] Confirm BPM, key, Released, Filters and the details sheet work on the view (they come from `crateColumns`, `CrateTable`, `CrateSheet`); fix any gap in `src/ui/crate/Rarely.tsx`

## Phase 6: Polish

- [x] T009 Run `yarn typecheck && yarn lint && yarn test`, judged by exit code
- [x] T010 Docs: how-it-works §12–§13, inventory row F23 in `docs/architecture/100-features.md`, README, CHANGELOG, `docs/README.md` if a page is added

## Dependencies

T001 → T005; T002 → T003 → T005; T004 → T005 → T006 → T007 → T008 → T009 → T010. T001 and T002 can run in parallel.

## Strategy

MVP is Phase 1 to 3. Then the playlist menu, then the check of the shared table features, then docs.
