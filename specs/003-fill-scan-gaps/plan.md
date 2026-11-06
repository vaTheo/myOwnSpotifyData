# Implementation Plan: Fill the gaps of a worker scan

**Branch**: `003-fill-scan-gaps` (work happens on `task/general-dev`, merged to `main` with the owner's OK) | **Date**: 2026-11-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-fill-scan-gaps/spec.md`

## Summary

After the worker's first pass (12 s every 15 s, worker 0.2.0), the parts of the set without a hit become gaps. The worker
replays one unmatched probe out of two at +4 % and −4 % speed alternately (the owner's rule), reads the set's description,
chapters and timed comments through the yt-dlp it already ships, attaches the clues to the gaps they fall in, and turns a
clue that reads as one `Artist – Title` into a candidate row when Deezer's keyless search holds exactly that artist and title.
The result keeps the F15 shape with optional additions; the app shows replays, candidates ("from a comment") and the clues on
gap rows, and Create playlist includes the candidates. A refused second pass keeps what was found. Worker 0.3.0.

## Technical Context

**Language/Version**: worker Python 3.11–3.13 (`uv`); app TypeScript ~6.0.3, Preact. Unchanged.

**Primary Dependencies**: none new. yt-dlp (`getcomments`, `description`, `chapters`), the packaged ffmpeg (`asetrate` for the
speed correction), the standard library's `urllib` for Deezer (R5).

**Storage**: the result JSON on the server (`jobs.result`, existing) and on the owner's computer; the app's `mixes` store gains
optional fields (no `DB_VERSION` bump); the server's `mixes` rows carry them (validated on pull).

**Testing**: worker `unittest` (fakes for recognise, cut, sleep, yt-dlp and Deezer); app Vitest. Shared case files
(`parse.cases.json`, `match.cases.json`) read by both suites.

**Target Platform**: the owner's computer (Linux, Windows, macOS executables) and the Android phone browser.

**Project Type**: CLI worker + browser app (existing).

**Performance Goals**: a 2 h set in under 75 minutes end to end (SC-003); clues bounded at 90 s; lookups paced 0.2 s, 100 a
set at most.

**Constraints**: one recognition at a time with the existing pacing; no key, no paid service, no Spotify host; result under
`WORKER_RESULT_MAX_BYTES`; clue text is untrusted third-party text (plain, cut, never HTML).

**Scale/Scope**: one owner; a set yields ≈ 100–200 replays, ≤ a few hundred comments, ≤ 100 lookups.

## Constitution Check

| Principle | Check | Status |
|---|---|---|
| I. Browser-first, no secret, one server | no key anywhere; worker on the owner's computer; the server stores the result only | ✅ |
| II. No Spotify reads on load | nothing new on load; the app reads the result on the existing pull | ✅ |
| III. Library writes only on a tap | Create playlist unchanged; the worker never calls Spotify | ✅ |
| IV. Keyless, keyed by id, **never name search** | **amended**: the worker may search Deezer by name for a clue that carries no id, accepting exact equality only, and marks the row "from a comment" (owner's approval 2026-11-06). Constitution v2.1.0 (MINOR: an exception added), new ADR-10, Limits page. Everything else in IV holds | ⚠️ amendment in this round |
| V. IndexedDB upgrades only add | optional fields only, no bump | ✅ |
| VI. Play counts from the export | untouched | ✅ |
| VII. Every failure shown | clue and lookup failures in the worker log; second pass stopped is in the result and the Requests card line; mixes failing validation counted as today | ✅ |

Re-checked after design: same table; the only exception is IV, recorded in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/003-fill-scan-gaps/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md
├── contracts/worker.md, contracts/client-api.md
├── checklists/requirements.md
└── tasks.md            (/speckit-tasks)
```

### Source Code

```text
worker/mix_worker/
├── scan.py        # first pass records per-probe outcomes; replay() second pass; cut_probe(speed=…)
├── clues.py       # NEW: read (yt-dlp, thread, timeout), parse (description/chapters/comments), lookup (Deezer), match rules
├── pipeline.py    # wires second pass, clues, candidates; writes the additions
├── config.py      # four settings
worker/tests/      # test_scan (replay), test_clues (new), test_pipeline (additions, size cut), test_config
src/features/mix/
├── worker.ts      # resultToRows: origin, speedPercent, clue, gap rows with clues, set-wide clues
├── parse.cases.json, match.cases.json   # NEW shared cases (+ parse.test.ts / spotifySearch.test.ts read them)
src/db/schema.ts   # TracklistRow / MixRow optional fields, Clue
src/server/validate.ts  # validateMix checks the new fields
src/ui/Mix.tsx     # replay mark, candidate mark, gap clues, set-wide block
docs/              # ADR-10, constitution v2.1.0, Limits page, how-it-works §10 and §17, inventory F19/F20, README, CHANGELOG
```

**Structure Decision**: the existing two projects (`worker/`, `src/`); one new worker module (`clues.py`) holds everything
about clues so `scan.py` stays about audio.

## Complexity Tracking

| Exception | Why needed | Simpler alternative rejected because |
|---|---|---|
| Name search (Principle IV) in the worker | a comment or description gives a name, never an id; the owner asked for it and approved it | attaching clues only (no lookup) leaves every candidate to be typed by hand, which is what the owner asked to avoid |
