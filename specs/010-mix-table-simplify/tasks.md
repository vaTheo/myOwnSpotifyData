---

description: "Task list for the simpler mix tracklist table"
---

# Tasks: Simpler mix tracklist table

**Input**: Design documents from `/specs/010-mix-table-simplify/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/row-links.md, quickstart.md

**Tests**: Vitest, pure functions only, tests next to source (no DOM tests); Playwright regression rows updated. Do not run `yarn shots` unless the owner asks.

**Format**: `- [ ] T### [P?] [US?] Description with file path` · `[P]` = different files, no dependency on an unfinished task.

## Phase 1: Setup

- [x] T001 Check the worktree: `git status`; the uncommitted edits to `src/features/mix/createPlaylist.ts`, `mixList.ts`, `review.ts` (`validated !== false`) are superseded by T004–T006, so keep or revert them first and run `yarn test` for a green baseline

## Phase 2: Foundational (blocks the stories)

- [x] T002 [P] Add `shazam` and `soundcloud` glyphs (inline SVG paths, 24px viewBox, same shape as the other entries) to `PATHS` in `src/ui/icons.tsx`
- [x] T003 Rewrite `playLinks(row, libraryTrackId)` in `src/ui/mix/rowText.ts`: drop the `phone` parameter; Spotify is one `{label: 'Play on Spotify', href: 'spotify:track:<id>', app: true}` (id from `row.spotify.id`, else the library trackId not starting with `spotify:` only when `row.spotify === undefined`); keep Shazam after it (`row.shazamUrl && row.source === 'tracklistify'`); update `src/ui/mix/rowText.test.ts` (one app link on every device, no "Open in Spotify app")

## Phase 3: User Story 1 - A leaner table (P1) 🎯 MVP

**Goal**: no Source, In your library, Clips column or Validate button; every track kept; Confidence and Clips merged and sortable.

**Independent Test**: open a mix with identified, manual and gap rows; the columns and Validate are gone, Delete removes a row, Confidence shows "×3 · 92%" and sorts hits then percent (quickstart step 2).

- [x] T004 [P] [US1] In `src/features/mix/review.ts` remove `'toReview'` and `'validated'` from `ReviewFilter`, `inFilter`, `LABELS`, `reviewChips`, and the "K validated" part of `reviewLine`; update `src/features/mix/review.test.ts`
- [x] T005 [P] [US1] In `src/features/mix/createPlaylist.ts` make `tracksToAdd(rows)` return every identified row; remove `CreateChoice` and `defaultChoice`; update `createPlaylist.test.ts`
- [x] T006 [P] [US1] In `src/features/mix/mixList.ts` drop "· N validated" from the saved chip; update `mixList.test.ts`
- [x] T007 [US1] In `src/model/state.ts` delete `toggleValidated`, the Create-playlist choice state and its `CreateChoice`/`defaultChoice` imports (around lines 50–54, 698–713, 1574)
- [x] T008 [US1] In `src/ui/mix/CreatePlaylistCard.tsx` remove the Validated only / All tracks `SegmentedButtons` and the "No validated track yet" text; the count is `tracksToAdd(rows).length`
- [x] T009 [P] [US1] In `src/ui/mix/ReviewHead.tsx` update the line (no "validated") and its comment
- [x] T010 [US1] In `src/ui/mix/tracklistSort.ts` remove the `source`, `clips`, `library` and `review` ids from `SortId`, `SORT_FIRST`, `sortValue` and `sortChoices`; keep `confidence` (hits×1000+percent, missing null); update `src/ui/mix/tracklistSort.test.ts`
- [x] T011 [US1] In `src/ui/mix/TracklistTable.tsx` delete the Source column and `SourceCell`/`SOURCE_ICON`, the In your library column, the `clips` column and the `counted` plumbing, the Validate button and `toggleValidated` import; Review cell is Delete only; drop `FILTER_CAPTION`'s "Validated only" wording in `src/features/mix/review.ts` accordingly
- [x] T012 [US1] In `src/ui/mix/TracklistTable.tsx` make the Confidence cell show times heard then percent ("×3 · 92%", a part omitted when missing; add a pure `confidenceText(row)` to `src/ui/mix/rowText.ts` with tests in `rowText.test.ts`) and keep its header sort and phone meta line
- [x] T013 [US1] Remove the `.icon-btn.mix-validate` rules in `src/styles.css` (~line 3541)

**Checkpoint**: `yarn typecheck && yarn lint && yarn test` green; US1 works alone.

## Phase 4: User Story 2 - Play on Spotify opens the app (P1)

**Goal**: the Spotify cell link opens the app directly.

**Independent Test**: a found row's Spotify link href is `spotify:track:<id>`; the Listen menu has no "Open in Spotify app".

- [x] T014 [US2] In `src/ui/mix/TracklistTable.tsx` `SpotifyCell`, change the found-row `IconButton` to `href={`spotify:track:${row.spotify.id}`}`, no `external`/new tab, label `Play ${nameOf(row)} on Spotify`; compact found text becomes the same link when room allows
- [x] T015 [US2] In `src/ui/mix/TracklistTable.tsx` update `listenItems` to the T003 signature (drop the `phone` argument at both call sites)

**Checkpoint**: found rows open the Spotify app from the cell and the menu.

## Phase 5: User Story 3 - Shazam and SoundCloud icons (P2)

**Goal**: one-click Shazam and SoundCloud icons on each row.

**Independent Test**: a scan row with a Shazam page shows its icon opening it in a new tab; every named row shows the SoundCloud search icon; a manual row shows no Shazam icon.

- [x] T016 [P] [US3] Add `listenIcons(row)` to `src/ui/mix/rowText.ts` returning `{site: 'shazam' | 'soundcloud'; label; href}[]`: Shazam from `playLinks`' Shazam rule, SoundCloud from `digLinks(row.artist, row.title)` where `site === 'soundcloud'`, none for gap rows; labels "Shazam <track>" and "Search SoundCloud for <track>"; tests in `rowText.test.ts`
- [x] T017 [US3] In `src/ui/mix/TracklistTable.tsx` render the icons as `IconButton`s (`external`) in the Listen cell beside the `RowMenu`, and on the compact meta line; widen the Listen column in `src/styles.css`/column `width` so nothing wraps

**Checkpoint**: icons open the right pages; no horizontal scroll at phone width.

## Phase 6: Polish and docs

- [ ] T018 Update `src/dev/demo.ts` if it sets `validated` (lines ~837, ~872) so the demo still shows a mixed set without relying on it; update `tools/shots/pages.ts` (`mix-filter-validated`, `mix-create-validated`) only to stop referencing removed controls (do not run shots)
- [ ] T019 Update `tools/shots/regression.spec.ts` rows that click Validate, count "validated", use the Validated tab or the Create playlist choice (~lines 1022–1049, 1163–1169, create-playlist rows) and `specs/003-web-first-redesign/regression.md` to match; add a row for the merged Confidence cell and the icons
- [ ] T020 Docs round: `src/features/mix/CLAUDE.md` (D6 line, review rules), `docs/architecture/000-how-it-works.md`, `docs/architecture/100-features.md` (new F26 row), `README.md` (owner's manual: columns, Delete, app link, icons), `CHANGELOG.md`; ADR only if the owner wants "validated is gone" recorded
- [ ] T021 Run `yarn typecheck`, `yarn lint`, `yarn test` and `yarn regression` (A05 is a known stale failure); walk quickstart step 2 on `?demo`

## Dependencies

- T002, T003 before US2 and US3; T001 first.
- US1: T004–T006, T009, T010 in parallel; T007 needs T005; T008 needs T005 and T007; T011 needs T004, T007, T010; T012 after T011; T013 after T011.
- US2 after T003 and T011 (same file). US3 after T011 and T002.
- Polish after all stories.

## Parallel example

T002, T004, T005, T006, T009 touch different files and can run together.

## Implementation strategy

MVP = Phase 1–3 (the leaner table). Then US2 (tiny), then US3. Commit per phase, each green; push only with the owner's OK.
