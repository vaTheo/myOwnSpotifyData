# Tasks: See, steer and trust the worker's scans

**Input**: `specs/004-worker-progress-control/` (plan, research R1–R6, data-model, contracts, quickstart). Tests first.

## Phase 1: Setup
- [X] T001 Migration `supabase/migrations/0003_job_control.sql` (progress, priority, stop_requested_at, index, `claim_job` by priority) and the row in `specs/004-worker-progress-control/contracts/server-schema.md`
- [X] T002 [P] Settings `WORKER_REFUSAL_WARN_CALLS` (150), `WORKER_RESUME_DAYS` (7) in `worker/mix_worker/config.py`, both env templates, `worker/tests/test_config.py`

## Phase 2: US1 clip count and best score (P1)
- [X] T003 [US1] Tests then code: `scan.merge` counts `hits`; `track_entry`/write keep `hits`; candidates have none (`worker/tests/test_scan.py`, `worker/mix_worker/scan.py`)
- [X] T004 [US1] App: `TracklistRow.hits?` (`src/db/schema.ts`), `resultToRows` maps it, `validateMix` checks it (tests in `worker.test.ts`, `validate.test.ts`)
- [X] T005 [US1] Mix screen: "heard N× · best X %" in the row line, sort (time / clips / score) and "heard once" filter, view only (`src/ui/Mix.tsx`, `src/styles.css`)

## Phase 3: US2 progress (P1)
- [X] T006 [US2] Worker: `ServerClient.progress` (`worker/mix_worker/server.py`, test in `test_server.py`)
- [X] T007 [US2] Scan publishes progress (step, done/total, percent, minutes left, paused until) through a `progress` callable, throttled once a minute (`scan.py`, tests)
- [X] T008 [US2] Pipeline wires progress for download, scan, clues, send; write failures logged (`pipeline.py`, `cli.py`, tests)
- [X] T009 [US2] App: `pullJobs` selects the new columns; `validateJobRow`; `jobView.progress`; `requestStatusText` wording incl. stale news (`sync.ts`, `validate.ts`, `worker.ts`, tests)

## Phase 4: US3 queue control (P2)
- [X] T010 [US3] App: `cancelRequest`, `moveRequestToTop`, `stopRequest` in `src/server/sync.ts` (tests with fake client); `startCancelRequest`, `startMoveToTop`, `startStopRequest` in `src/model/state.ts` (confirm for cancel, stop); buttons on the Requests card
- [X] T011 [US3] Worker: a stop seen in a progress answer raises `StopRequested`; pauses sleep in 30 s slices with a progress write; the run ends "stopped early (by you)" (`scan.py`, `pipeline.py`, tests)

## Phase 5: US4 resume (P2)
- [X] T012 [US4] `worker/mix_worker/runstate.py` (load/save/clear, atomic, 7 days, same settings) with `worker/tests/test_runstate.py`
- [X] T013 [US4] Scan skips probes and second-pass places already in the state; saves after each probe; pipeline loads it, clears it on a normal end; `mix_info.resumed`; log "resuming at …" (tests)

## Phase 6: US5, US6
- [X] T014 [US5] Refusals under `WORKER_REFUSAL_WARN_CALLS` apart: one warning per run (log, progress, `mix_info.warnings`); card shows it (tests)
- [X] T015 [US6] Second pass speed by speed (R6), tests updated
- [X] T016 [US6] README + worker README: VPN note with the test day's numbers; troubleshooting

## Phase 7: Polish
- [X] T017 Docs: how-it-works §14 (two `confirm()`), §16, §17; inventory F19; CHANGELOG; 002 contract (claim order); worker 0.4.0, release notes
- [X] T018 Checks: worker unittest, `yarn typecheck && yarn lint && yarn test && yarn build`, unpiped
- [ ] T019 Owner: apply 0003, quickstart 1–6 (the owner's)
