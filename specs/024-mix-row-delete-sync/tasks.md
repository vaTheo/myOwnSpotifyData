# Tasks: A song deleted from a saved mix is deleted on every device

**Input**: [spec.md](spec.md), [plan.md](plan.md)

## Phase 1: User Story 1 - a row change on one device reaches the other (P1)

- [ ] T001 [US1] Tests first in src/model/state.test.ts (or a new src/model/mixAutoSave.test.ts): on a saved open mix, deleteMixRow / editMixRow / linkMixRowSpotify / unlinkMixRowSpotify each store the new rows with a newer savedAt and queue a `mixes` push; the removed tracks are saved with a delete; a lookup never saved stores nothing; a failed put sets mixError
- [ ] T002 [US1] Auto-save helper and calls in src/model/state.ts (deleteMixRow, editMixRow, linkMixRowSpotify, unlinkMixRowSpotify); update their doc comments ("Saved with Save mix" no longer true)
- [ ] T003 [US1] src/ui/mix/TracklistTable.tsx: nothing to change unless the UI needs the save result; keep Save mix

## Phase 2: User Story 2 - the open mix follows the newer copy (P1)

- [ ] T004 [US2] Tests: pull with a newer stored copy refreshes the open rows and mixRemoved and bumps mixRowsReplaced; an older or equal copy does not; a screen with an unsaved change keeps its rows; after the refresh the automatic check (keepChecks open) saves the newer rows
- [ ] T005 [US2] Open-copy stamp + changed-since flag + refresh in startServerPull, src/model/state.ts

## Phase 3: Polish

- [ ] T006 Regression row M07 in specs/003-web-first-redesign/regression.md and tools/shots/regression.spec.ts: delete a row of a saved demo mix, go back to the mixes list and reopen: the row is gone with no Save tap
- [ ] T007 Docs: inventory F40, how-it-works §10 and §16, README, CHANGELOG, Limits and roadmap, folder CLAUDE.md lines that state the Save-only rule; spec Status → Built
- [ ] T008 `yarn typecheck && yarn lint && yarn test` exit 0; `yarn regression` for M07 (and M04, which uses More › Delete)
