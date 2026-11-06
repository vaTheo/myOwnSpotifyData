# Implementation Plan: See, steer and trust the worker's scans

**Branch**: `004-worker-progress-control` (work on `task/general-dev`) | **Date**: 2026-11-06 | **Spec**: [spec.md](spec.md)

## Summary

Each heard track keeps its clip count and best score (shown, sortable, filterable, never auto-removed). The worker writes its
progress into the request it runs; the phone shows it. A migration adds progress, a queue priority and a stop flag, so the
phone can cancel, move to top and stop. The worker keeps a run state per link so Ask again continues a stopped set. Frequent
refusals raise a VPN warning; the second pass runs speed by speed. Worker 0.4.0.

## Technical Context

**Language/Version**: worker Python 3.11–3.13; app TypeScript ~6.0.3, Preact. **Primary Dependencies**: none new.
**Storage**: `jobs` gains 3 columns (migration 0003, owner-applied); IndexedDB optional field `hits` (no bump); worker run
state files on the owner's computer. **Testing**: worker `unittest`, app Vitest. **Constraints**: server stores only; no
Spotify; every failure shown; `confirm()` list updated. **Scale**: one owner, one worker.

## Constitution Check

| Principle | Check | Status |
|---|---|---|
| I / ADR-08 | server stores progress and flags written by the owner's worker and app; computes nothing (`claim_job` only orders) | ✅ |
| II | no Spotify read; the existing one-minute pull while a request runs shows progress | ✅ |
| III | Create playlist unchanged; nothing auto-removed | ✅ |
| IV | no new source | ✅ |
| V | `hits` optional, no bump | ✅ |
| VII | stale progress, warnings, cancel/stop outcomes all shown; two new `confirm()` listed in §14 | ✅ |

## Project Structure

```text
supabase/migrations/0003_job_control.sql
worker/mix_worker/{scan.py, pipeline.py, server.py, cli.py, config.py, runstate.py (new)}
worker/tests/{test_scan, test_pipeline, test_server, test_runstate (new), test_config}.py
src/server/{sync.ts, validate.ts}, src/features/mix/worker.ts, src/model/state.ts, src/ui/Mix.tsx, src/db/schema.ts
docs: how-it-works §14 §16 §17, inventory F19, README + worker README, CHANGELOG, contracts of 002 (claim order)
```

## Complexity Tracking

None.
