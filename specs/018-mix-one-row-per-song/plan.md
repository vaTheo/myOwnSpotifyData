# Implementation Plan: One row per song in a scanned mix

**Branch**: `feat/mix-one-row-per-song` | **Date**: 2026-11-09 | **Spec**: [spec.md](spec.md)

## Summary

A pure `oneRowPerSong(rows)` in `src/features/mix/oneRowPerSong.ts` collapses the copies of a song inside one incoming result: key
`nameKey(artist, stripMixMarkers(title))` (the key `digRows` already groups by), keep the earliest timed copy, sum `hits`, keep the best
`confidence`. It runs on the incoming rows only, in the two places a scan's rows enter the app: `resultToRows` (worker result, after the
worker extras are attached, before `mergeWorkerRows([], rows)`) and `startTracklistifyImport` (hand import, on `parsed.rows`). Rows
already in a mix never pass through it, so manual, pasted, edited and kept rows are untouched (FR-005), and saved mixes are not rewritten
(FR-007).

## Technical Context

**Language/Version**: TypeScript ~6.0.3, Preact · **Dependencies**: none new · **Storage**: none (no `DB_VERSION` bump, rows keep their
shape) · **Testing**: Vitest, pure functions (`oneRowPerSong.test.ts`, a `worker.test.ts` case) · **Platform**: browser, Android ·
**Scope**: `src/features/mix/oneRowPerSong.ts` (new), `src/features/mix/worker.ts`, `src/model/state.ts`, tests, docs

## Constitution Check

| Principle | Verdict |
|---|---|
| I Browser-first | Pass: app only |
| II No Spotify reads on load | Pass: no read |
| III Writes on a tap | Pass: none; Create playlist already skips repeated tracks |
| IV External sources by id | Pass: no lookup; the name key only compares rows the app already has, it searches nothing |
| V IndexedDB only adds | Pass: nothing stored differently |
| VI Play counts | Pass: untouched |
| VII Failures shown | Pass: nothing can fail |

Complexity Tracking: none.

## Decisions (research)

- **Where**: after `trackExtras` in `resultToRows`, because the extras (`hits`, `confidence`, `origin`) line up with the parser's rows by
  index; merging before would drop them. In `startTracklistifyImport` on `parsed.rows`. Not inside `parseTracklistifyJson` (it would break
  that alignment). Not in the worker (owner's pick).
- **Key**: `nameKey` from `src/model/normalize.ts` on `artist` and `stripMixMarkers(title)` from `src/features/mix/digLinks.ts`.
- **Which rows merge**: identified rows of the incoming result (`isIdentified`, not `gap`). Gap rows pass unchanged.
- **Kept row**: earliest `startSec`, `null` last, ties in input order; `hits` = sum of defined `hits` (absent when none); `confidence` =
  max of defined numbers (else the first's value). Output keeps the input order of the kept rows (callers sort by time afterwards).

## Documentation (same commit as the code)

how-it-works §10 (worker result and hand import), `src/features/mix/CLAUDE.md` (expected outputs line), `specs/002-mix-analysis-worker/
contracts/client-api.md` (merge rule), inventory row, `README.md` (owner's manual, Mix), `CHANGELOG.md`, `docs/specs/2026-11-09-mix-one-
row-per-song-design.md` listed in `docs/README.md`.
