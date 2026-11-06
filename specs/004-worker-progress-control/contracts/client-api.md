# Contract: app (round 004)

- `src/server/sync.ts`: `pullJobs` selects `progress, priority, stop_requested_at`; new `cancelRequest(id)`,
  `moveRequestToTop(id)`, `stopRequest(id)` (results, never throw).
- `src/server/validate.ts`: `validateJobRow` checks the new columns; `validateMix` checks `hits`.
- `src/features/mix/worker.ts`: `resultToRows` maps `hits`; `requestStatusText` words progress, pauses, warnings, stale news.
- `src/model/state.ts`: `startCancelRequest`, `startMoveToTop`, `startStopRequest` (confirm for cancel and stop).
- `src/ui/Mix.tsx`: Requests card buttons; row line "heard N× · best X %"; sort and "heard once" filter.
