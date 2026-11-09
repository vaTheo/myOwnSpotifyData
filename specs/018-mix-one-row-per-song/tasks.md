# Tasks: One row per song in a scanned mix

Every commit: `yarn typecheck && yarn lint && yarn test` exit 0; `type(scope): summary`; docs in the same commit. No push.

## Phase 2: Foundational

- [x] T001 Write failing tests in `src/features/mix/oneRowPerSong.test.ts`: two copies at 750 and 2470 s give one row at 750; copies differing by case, accents and "(Original Mix)" merge; different artists same title stay two; `hits` 3 + 2 → 5, absent when no copy has hits; `confidence` max of defined values; a copy with `startSec: null` loses to a timed one; all null → first in input order kept; gap rows pass unchanged and never merge; output order = input order of kept rows; three copies merge into one
- [x] T002 Implement `oneRowPerSong(rows: readonly TracklistRow[]): TracklistRow[]` in `src/features/mix/oneRowPerSong.ts` (key `nameKey(artist, stripMixMarkers(title))`, only `isIdentified` non-gap rows merge); T001 green

## Phase 3: User Story 1 (P1)

- [x] T003 [US1] `src/features/mix/worker.ts` `resultToRows`: apply `oneRowPerSong` to the rows after `trackExtras` and the finiteness filter, before `mergeWorkerRows([], rows)`; add a `worker.test.ts` case (a result with one song at two times gives one row with summed hits)
- [x] T004 [US1] `src/model/state.ts` `startTracklistifyImport`: `mixRows.value = oneRowPerSong(parsed.rows)`
- [x] T005 [US1] Docs per plan "Documentation"; commit `feat(mix): one row per song in a scan result`

## Phase 4: User Story 2 (P1)

- [x] T006 [US2] Test in `src/features/mix/worker.test.ts` (or `keepReview.test.ts` where the merge with an existing mix is tested): an existing manual or edited row with the same song as two incoming copies stays, and the incoming copies collapse to one; commit with T005 if written before it

## Final

- [ ] T007 `yarn typecheck && yarn lint && yarn test`, `yarn regression`, `yarn invariants` (the Mix model outputs must stay equal unless a demo mix has duplicates: report), public-safe check
