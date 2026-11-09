# Implementation Plan: The worker drops a finding found between two hits of one song

**Branch**: `feat/worker-drop-sandwiched-hits` | **Date**: 2026-11-09 | **Spec**: [spec.md](spec.md)

## Summary

A pure `drop_sandwiched(hits, gap)` in `worker/mix_worker/scan.py` next to `merge`: sort hits by time; for each hit whose `_key` differs
from the key of both the nearest earlier hit of some song A and the nearest later hit of the same A... precisely: for a hit h, find the
nearest earlier hit p and nearest later hit n **with the same key as each other** around h — i.e. scan the sorted list for runs
`A, (non-A)+, A` with `time(second A) - time(first A) <= gap` and drop the non-A hits of the run. `scan()` calls it just before
`return merge(hits, gap)` (scan.py:750) and counts the dropped hits into `report["sandwiched"]` (a line in the run's report and progress).
`hits_out` (the run-state hits) stays the raw hits. Version 0.7.2.

## Technical Context

Python (standard library only; `uv run`), `unittest` with every external call injected; no new dependency; no new setting (reads
`merge_gap_seconds`); F15 result shape unchanged.

## Constitution Check

I Browser-first / worker outside the server: pass (worker only). IV: no lookup, no name search, hits already exist. II, III, V, VI, VII:
untouched (the owner sees the dropped count). Complexity Tracking: none.

## Decisions

- **Where**: after all hits are known (first and second pass), before `merge`; not in `inside_known` (that one skips probes; this one
  filters answers).
- **Key**: the existing `_key(entry)` (Shazam id, else lower-cased artist|title).
- **Run rule**: for consecutive A-hits (same key, sorted by time) a1 < a2 with at least one non-A hit between them in the full sorted
  list and `a2.time - a1.time <= gap`, the non-A hits between are dropped. Nearest-A pairs only, so A, X, A, Z, A chains drop X and Z.
- **Scope**: only entries in `hits`; TrackId rows, clue rows and gap rows are built elsewhere and are untouched.
- **Report**: `dropped` count in `report["sandwiched"]` and one progress line when > 0.

## Documentation (same commit)

`worker/RELEASE_NOTES.md` (0.7.2), `worker/README.md` if it lists the pipeline steps or settings, `specs/002-mix-analysis-worker/
contracts/worker.md` and `research.md` (merge decision D5 notes), `docs/architecture/000-how-it-works.md` §17, `worker/CLAUDE.md`
(expected outputs), the inventory row, `README.md` (owner's manual, worker) and `CHANGELOG.md`, a `docs/specs/2026-11-09-worker-drop-
sandwiched-hits-design.md` listed in `docs/README.md`. Version bump in `worker/pyproject.toml` and `worker/mix_worker/__init__.py`, then
`uv lock`.
