# Tasks: The release year of every track

**Input**: `specs/005-track-release-year/` (plan, research R1–R6, data-model, quickstart). Tests first.

## Phase 1: Foundation
- [X] T001 Optional fields in `src/db/schema.ts`; `src/model/year.ts` (`parseYear`, `yearOf`, `decadeOf`, `decadeLabel`)
- [ ] T002 Tests for `src/model/year.ts` in `src/model/year.test.ts`; `validate.ts` accepts/drops the new fields (`src/server/validate.ts`, tests)

## Phase 2: US1 sets (P1)
- [ ] T003 [US1] Worker: `Lookups.release_year(isrc)` (Deezer then MusicBrainz, earliest) and a fill step before send for heard tracks without `release_date` (`worker/mix_worker/clues.py`, `pipeline.py`, tests); 0.5.0
- [ ] T004 [US1] App: `resultToRows` sets `year`/`yearFrom` from `metadata.release_date(_from)` (`src/features/mix/worker.ts`, tests)

## Phase 3: US4 library (P1)
- [ ] T005 [US4] `release_date` in the playlist field filters and `albumYear` in `buildTrack`; Top items `albumYear` (`src/sync/runner.ts`, `src/sync/items.ts`, `src/spotify/types.ts`, tests)
- [ ] T006 [US4] ReccoBeats `rid` from audio-features, `fetchTrackRids`, `fetchAlbumYear` (`src/features/reccobeats.ts`, tests)
- [ ] T007 [US4] Pass 3 "release years" in `runLookup`, done state counts years; Settings line (`src/features/lookup.ts`, `src/ui/Settings.tsx`, tests incl. pacing)

## Phase 4: US2 + US5 view (P1)
- [ ] T008 [US5] `applyYearView` + `YearView` + year pill (`src/ui/components/YearView.tsx`, `src/model/year.ts`, tests)
- [ ] T009 [US5] Every song list: Top, Playlist, Artist, Crate views, Under the radar, Match (`src/ui/*`)
- [ ] T010 [US2] Mix: year on the row, Year sort beside time/clips/score, decade filter combined with "heard once" (`src/ui/Mix.tsx`, `src/features/mix/worker.ts` `viewRows`, tests)

## Phase 5: US3 Create playlist (P2)
- [ ] T011 [US3] `searchTrack` returns the matched album year; Create playlist saves it on undated rows, kept on partial failure (`spotifySearch.ts`, `createPlaylist.ts`, tests)

## Phase 6: Polish
- [ ] T012 Docs: research note (ReccoBeats albums), how-it-works, inventory, README, CHANGELOG, worker README/RELEASE_NOTES, `src/features/CLAUDE.md` if a rule changes
- [ ] T013 `yarn typecheck && yarn lint && yarn test`, worker tests, quickstart
