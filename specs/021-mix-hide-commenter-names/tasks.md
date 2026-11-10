# Tasks: Comments without their commenter's name

**Input**: [plan.md](plan.md), [spec.md](spec.md)

**Tests**: test-first on the pure functions (no DOM tests). UI checked by `yarn regression` rows R02 and R03.

**Every commit**: `yarn typecheck && yarn lint && yarn test` green, exit code checked; message `type(scope): summary`; docs of what
the commit touches in the same commit. Commit as `vaTheo <98275045+vaTheo@users.noreply.github.com>`. No push.

## Phase 1: User Story 1 – Read a comment without its commenter (P1) 🎯 MVP

**Goal**: no commenter name on the Mix screen; chapter and description lines keep the uploader.
**Independent test**: demo "Sunrise", the candidate reads "from a comment", "night_owl" appears nowhere.

- [ ] T001 [US1] In `src/ui/mix/rowText.test.ts` change the expectations: `originText` of a comment clue with an author is "from a
  comment"; `clueLine` of a comment is "1:15 · text" (and the text alone without a time); add a chapter and a description clue
  with an author that keep "author · ". Run them and watch them fail
- [ ] T002 [US1] `src/ui/mix/rowText.ts`: `originText` returns "from a comment" for every comment clue; `clueLine` adds the author
  only when `kind !== 'comment'`; T001 green. Fix the doc comment of `TitleCell` in `src/ui/mix/TracklistTable.tsx`
- [ ] T003 [US1] Regression R02 (no "night_owl" on the candidate row) and R03 (the gap's comment line "mm:ss · text") in
  `tools/shots/regression.spec.ts` and `specs/003-web-first-redesign/regression.md`; run `yarn regression -g "R02|R03"`
- [ ] T004 Docs: how-it-works §10, inventory F34, README, CHANGELOG, `specs/003-web-first-redesign/contracts/screens.md`; commit
  T001–T004 `feat(mix): hide the commenter's name on comment clues`

## Dependencies

T001 → T002 → T003 → T004.
