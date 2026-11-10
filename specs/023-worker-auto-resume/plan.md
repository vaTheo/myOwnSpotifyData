# Implementation Plan: The worker asks again by itself after a rate-limit stop

**Branch**: `feat/worker-auto-resume` | **Date**: 2026-11-10 | **Spec**: [spec.md](spec.md)

## Summary

A small `worker/mix_worker/autoresume.py` (`AutoResume(minutes, cycles, clock, off=)`: `after(url, outcome)` plans or not and
returns the log line, `take_due()` hands each due link out once, `queued(url, result)` counts a successful insert). `pipeline.Outcome`
gains `stopped` (the reason of a done request stopped early). `cli.run_queue` (new `clock=` seam, default `time.monotonic`) builds one
`AutoResume` per run (`off` = "shared mode" or "run --once"), inserts the due links after the session refresh and before the claim,
and calls `after` once a request ends. `ServerClient.enqueue(access_token, url)` = the app's `requestIdentify` (open check, then
`POST /rest/v1/jobs`); `SharedServerClient.enqueue` answers an error without a request. Version 0.7.3.

## Server check

`0001_init.sql`: `jobs.owner_id` defaults to `auth.uid()`, the `jobs_insert` policy checks `owner_id = auth.uid()`, `authenticated`
has `insert` on `jobs`; `0003` adds `priority default 0`. The worker's personal session is an authenticated user: the insert passes,
no migration.

## Documentation (same commit)

`worker/CLAUDE.md`, `worker/README.md` (settings, troubleshooting), `worker/RELEASE_NOTES.md` (0.7.3), `specs/002-mix-analysis-worker/
contracts/worker.md` (settings, seams) and `server-schema.md` (the worker's two requests), how-it-works §17, inventory F39,
`README.md` (owner's manual), `CHANGELOG.md`, `docs/README.md` (specs list).
