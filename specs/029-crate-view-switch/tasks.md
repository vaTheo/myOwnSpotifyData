# Tasks: One Crate view screen with a view switch, and four small fixes (spec 029)

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/screens.md](contracts/screens.md), [quickstart.md](quickstart.md)

Tests: unit tests beside the source and regression rows are part of the plan (steps 1 to 6), so each story carries them. After every task: `yarn typecheck && yarn lint && yarn test`, read by exit code. One commit per phase, docs in the same commit.

## Phase 1: Setup

- [ ] T001 Confirm the baseline is green before any change: `yarn typecheck && yarn lint && yarn test` exit 0 on `task/dev-session-2`

## Phase 2: Foundational

- [ ] T002 Add pure `viewSwitchItems(current: CrateView)` to src/ui/crate/labels.ts returning six `{ view, label, href, current }` in `CRATE_VIEWS` order (label from `CRATE_TITLE`, href from `routeHref({ name: 'crateView', view })`, no period, no `?d=`), with tests in src/ui/crate/labels.test.ts

## Phase 3: US1 to US4 (P1) The view switch

**Goal**: move between the six Crate views without the hub; each view, address and link unchanged; usable at 390 px.

**Independent test**: quickstart steps 1 to 7.

- [ ] T003 [US1] Create src/ui/crate/ViewSwitch.tsx: on medium and wider a `<nav aria-label="Crate views">` of six links, the open one `aria-current="page"`; on compact a native `<select>` with a visually hidden label "Crate view" whose change sets `location.hash` to the picked view's href (Q1 B)
- [ ] T004 [US1] [US2] Draw `<ViewSwitch current={view} />` above `<Body>` in src/ui/crate/CrateView.tsx only when `crateStatus.value === 'ready'`; the gate card stays drawn alone (FR-008)
- [ ] T005 [US4] Styles for the switch in src/styles.css, tokens only: 48 px targets, the row scrolls inside itself when narrow (beside the docked sheet) and never pushes the table; the picker styled like the Rarely played playlist select
- [ ] T006 [US1] [US3] [US4] Regression rows in specs/003-web-first-redesign/regression.md and tests in tools/shots/regression.spec.ts: the switch at 1440 (six names, current marked, pick changes address and title, Back returns, hub unchanged); the picker at 390; "Open <month>" from Heavy rotation's sheet lands on By year with the month pressed; a setting survives a switch and back; a filter is per view; a switch closes the sheet; the gate shows no switch. Edit rows A06, F07, Y01 for six views
- [ ] T007 [US4] Add a Rarely played page to tools/shots/pages.ts so the six views are all shot with the switch
- [ ] T008 [US1] Docs with the code: specs/003-web-first-redesign/contracts/screens.md §6, components.md (view switch), routes.md (addresses unchanged, the switch links to them); docs/architecture/000-how-it-works.md §13 (Crate views)

## Phase 4: US5 (P2) Top caption

**Independent test**: quickstart step 8.

- [ ] T009 [P] [US5] Add pure `topCaption(kind, comparing, hasPlays)` to src/ui/format.ts with tests in src/ui/format.test.ts: Tracks with plays "Spotify's own ranking for this period. Plays come from your history import."; Tracks without plays and Artists "Spotify's own ranking for this period."; Compare "Spotify's own ranking, period by period."
- [ ] T010 [US5] Draw `<p class="caption">` under the toolbar in src/ui/Top.tsx using `topCaption`; `hasPlays` is true only where the table shows a Plays figure; add a regression row and test; update contracts/screens.md §4 and how-it-works §13 (Top)

## Phase 5: US6 (P2) One Artists filter

**Independent test**: quickstart step 9.

- [ ] T011 [P] [US6] Replace `filter` (src/ui/Artists.tsx) and `radarFilter` (src/ui/artistSelections.ts) with one exported `artistFilter` signal in src/ui/artistSelections.ts, read by src/ui/Artists.tsx (table and `ArtistPane`) and src/ui/UnderRadar.tsx; correct the comment in artistSelections.ts; add a regression row and test (text survives the switch both ways); update contracts/screens.md §9 and how-it-works §13 (Artists)

## Phase 6: US7 (P3) Activity links

**Independent test**: quickstart step 10.

- [ ] T012 [P] [US7] In src/ui/jobs.ts link sync to `settings/sync`, lookup and rekordbox to `settings/audio`, reach to `settings/reach`, server to `settings/server` through `routeHref({ name: 'settings', item })`; import, like and create playlist unchanged; update src/ui/jobs.test.ts; add a regression row and test; update contracts/screens.md §1

## Phase 7: US8 (P3) Wording

- [ ] T013 [P] [US8] In src/ui/crate/CrateEmpty.tsx: "These six views are built from…" and "The Crate's views need data the old import didn't keep. Your play counts still work everywhere else."; correct five to six in specs/003-web-first-redesign/spec.md FR-015 and FR-035 (naming Rarely played) and in contracts/screens.md §5; adjust any regression text that quotes the old wording

## Phase 8: Polish and cross-cutting

- [ ] T014 Docs sweep (FR-020): docs/architecture/100-features.md (F7, F23, a row for round 029), README.md (owner's manual), CHANGELOG.md, docs/architecture/800-limits-roadmap.md if a limit was found; a file-to-doc map for the report
- [ ] T015 `yarn typecheck && yarn lint && yarn test`, `yarn regression`, `yarn invariants`, each read by exit code
- [ ] T016 Visual loop (owner 2026-11-13): `yarn shots`, `yarn shots:summary` with 0 findings on the pages touched (Crate hub and views, Top, Artists, Settings), `yarn shots:sheet`; read the screenshots at the four widths; fix findings
- [ ] T017 Review by a separate reviewer: the diff against spec.md, contracts/screens.md, the design guide and ADR-11; the docs against the code; fix findings
- [ ] T018 Public-safe check of docs/dev-guide/000-contributing.md, then push `task/dev-session-2` and open one PR to `main` (owner 2026-11-13)

## Dependencies

- T002 before T003; T003 before T004; T004 before T005, T006, T007.
- Phases 4 to 7 are independent of Phase 3 and of each other (different files), except shared doc files: screens.md and regression files are edited one phase at a time.
- Phase 8 after all stories.

## Implementation strategy

MVP is Phase 3 (the owner's request). Phases 4 to 7 are small and independent; each is one commit. Phase 8 closes the round with the checks, the visual loop, the review and the PR.
