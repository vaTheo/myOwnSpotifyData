# Research: See, steer and trust the worker's scans

Grounded in the test day (report "Worker 0.3 test day", 2026-11-06) and the code as of worker 0.3.3.

## R1. Clip count and best score per row

- **Decision**: `scan.merge` already keeps a row's best `confidence` over its run of hits; it also counts the hits merged
  into the row: `hits` (first and second pass). The F15 track gains `hits` (integer ≥ 1); `confidence` stays the best score.
  Candidates (`origin: "clue"`) carry neither. App: `TracklistRow.hits?`; the Mix screen shows "heard N× · best X %", a sort
  (time, clips, score) and a filter "heard once" that hides rows in the view only.
- **Rationale**: the owner keeps every track and judges them; the test day showed single-clip rows are where wrong matches sit
  (40 % of them under 70 %; BRUM: 9 of 22 heard rows outside the DJ's list).

## R2. Progress on the request

- **Decision**: a `progress jsonb` column on `jobs` (migration 0003), written by the worker with the same PATCH filter as
  `finish` (`id`, `status=claimed`, `claimed_by`): `{step, done, total, percent, minutes_left, paused_until, warning, at}`.
  Written at each step change and at most once a minute otherwise; a write failure is logged, never fatal. `minutes_left`:
  calls left × the mean time per call measured so far in this run (≥ 20 calls), rounded; refusals not predicted.
- **App**: `pullJobs` selects `progress`; `validateJobRow` checks it (finite numbers, short strings); `requestStatusText`
  words it ("First pass · 47 % · about 25 min left", "Paused by Shazam until 20:35"); "the computer stopped sending news"
  when `at` is over 10 minutes old. The automatic sync (one pull a minute while a request runs) already refreshes it.

## R3. Queue order, cancel, stop

- **Decision**: migration 0003 adds `priority integer not null default 0` and `stop_requested_at timestamptz`, and replaces
  `claim_job` to order by `priority desc, created_at`. Move to top: the app sets `priority = 1 + max(priority)` of the
  owner's queued requests. Cancel: the app deletes a queued request (`status=eq.queued` filter; a claimed one is offered Stop).
  Stop: the app sets `stop_requested_at` on a claimed request. Both cancel and stop ask `confirm()` (listed in how-it-works §14).
- **Worker**: each progress write returns the row (`Prefer: return=representation`); a non-null `stop_requested_at` raises
  `StopRequested` inside the scan; pauses sleep in 30 s slices with a progress write between, so a stop during a 6-minute
  pause ends within about 30 s. The scan then ends like a refusal limit: tracks kept, `stopped_early {at, reason: "by you"}`.
- **RLS**: unchanged; the owner's policies already allow these updates and deletes on their rows.

## R4. Resume

- **Decision**: the worker writes a run state per link to `<work_dir>/runs/<sha1(link)>.json` after every probe (atomic
  rename): `{link, step, probe_seconds, version, started, updated, duration, first: {t: entry|null}, second_done: [places],
  second_hits: [...]}`. A new request for the same link with the same `step` and `probe_seconds`, under 7 days old, skips
  every first-pass probe already in `first` (its hits re-enter the result) and the second-pass places already done; the
  log says "resuming at HH:MM:SS, N probes kept". A run that ends normally deletes its state; a stopped one keeps it.
- **Why per link**: Ask again makes a new request id; the link is the stable key (`requestKey`).

## R5. Network warning

- **Decision**: in the scan, two refusals less than `WORKER_REFUSAL_WARN_CALLS` (150) calls apart log once per run "Shazam
  refuses often: are you on a VPN or a shared network? (test day: on a VPN every 24–380 calls, without one once in 282)" and
  set `progress.warning` and `mix_info.warnings`.

## R6. Second pass by speed

- **Decision**: the places are heard at ×1 all first, then the still-empty ones at ×0.96, then at ×1.04 (the order of the
  test day's yield: 18 new in 292 calls, 8 in 213, 6 in 182). Same places, same calls in total; a stop costs the least.
