# Implementation Plan: TrackId.net with the Shazam probes

**Branch**: `016-trackid-worker-clues` (work on `spec/trackid-worker`) | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

**Numbering** (checked on `origin/main`, 2026-11-08): round **016** (main holds specs up to 015), **ADR-17** (main holds ADR-16), inventory row **F32** (main holds F31), no migration, worker **0.7.0** (a new source; main holds 0.6.0), constitution unchanged (no principle changes; ADR-17 amends ADR-10 and names one new host).

Owner's picks (2026-11-08): both ways; a **new origin `trackid`**; a TrackId.net row **starts at the span's start**; **one confirming probe per guided span and TrackId.net is the source of truth** (third message: both answers are shown, a disagreement never changes the row).

## Summary

For each request the worker asks TrackId.net once (two calls: list by the exact link, then detail by slug, the app's own guards) before the first probe. A found, trusted record gives timed spans. **Guide**: inside a span (shrunk 10 s at each edge, core at least 40 s) the first-pass probes are skipped except **one confirming probe at the middle of the core**. **Rows**: every trusted span becomes a row `origin: "trackid"`, not heard, unvalidated, with the span's own times and a **Shazam check** (`agrees`, `differs` with the other track, `no_match`, `not_asked`). TrackId.net is the source of truth: a Shazam answer inside a span never replaces, clips or removes its row, and a hit inside a span is not a separate row; hits outside every span stay rows as today. TrackId.net unknown, down, slow or switched off (`WORKER_TRACKID=off`) leaves the scan exactly as today. The app learns the new origin first, then worker 0.7.0 is released.

## Technical Context

**Language/Version**: Python 3.12 (worker, standard library only); TypeScript ~6.0.3 (app: schema, validator, row text, badge)
**Primary Dependencies**: none new (`urllib` for the two calls, as `server.py` and `clues.py` do)
**Storage**: none new; IndexedDB unchanged (the row's `origin` is an optional field, no `DB_VERSION` bump); the server's `jobs.result` is jsonb
**Testing**: `unittest` with a fake HTTP layer and the recorded real record in `worker/tests/fixtures/` (one TrackId.net detail record, trimmed); Vitest for the app side; `test_scan.py` equivalence test (no TrackId data ⇒ identical probe list and rows); the host test extended with `trackid.net`
**Target Platform**: the owner's computer (worker) and the browser (app)
**Project Type**: the worker program plus a small app change
**Performance Goals**: two calls and ≤ 1 s added before the scan; ≥ 60 % fewer Shazam calls on a mix TrackId.net covers for ≥ 80 % (SC-001)
**Constraints**: one probe at a time, Shazam pacing unchanged, no Spotify host, exact link only, never fails a request, worker host list gains `trackid.net` only
**Scale/Scope**: one new worker module, edits to `scan.py`, `pipeline.py`, `config.py`, four app files, one ADR

## Constitution Check

| Principle | Status |
|---|---|
| I. Browser-first, one owner's server | Pass: the worker is outside the server (ADR-08); the app and the server gain no source. |
| II. No Spotify reads on load | Pass: untouched; no Spotify host. |
| III. Writes on a tap | Pass: untouched. |
| IV. External sources keyless, by id, never name search | Pass with a note: the worker asks TrackId.net by the **exact mix link** only (the app already does); the keyword search endpoint is not used. A span's track is a candidate, never looked up by name. |
| V. IndexedDB upgrades only add | Pass: an optional row field, no upgrade. |
| VI. Play counts from the export | Pass: untouched. |
| VII. Every failure shown | Pass: a TrackId.net failure is one log line; the Mix screen shows each row's origin. |

Re-checked after design: no principle changes. ADR-17 first (the ADR index leads); ADR-10 gets an amendment note for the new candidate origin.

## Project Structure

```text
specs/016-trackid-worker-clues/
├── plan.md  research.md  data-model.md  quickstart.md  tasks.md
├── contracts/worker.md, contracts/result-shape.md, contracts/ui.md
└── spec.md, checklists/requirements.md
```

```text
src/db/schema.ts                         EDIT  TracklistRow.origin gains 'trackid'; optional shazamCheck {outcome, artist?, title?, confidence?}; optional trackid {slug, spanStart, spanEnd, references}
src/server/validate.ts                   EDIT  accept origin 'trackid', shazamCheck, trackid (shape-checked, bounded)
src/features/mix/worker.ts               EDIT  map the worker's rows: origin trackid, shazam_check, trackid object
src/ui/mix/rowText.ts, TracklistTable.tsx EDIT  "from TrackId.net · not heard" badge, Shazam-check line, unvalidated like a clue
src/**/*.test.ts                         EDIT  accepted and refused cases for each
worker/mix_worker/trackid.py             NEW   fetch_trackid (two calls, guards), parse_spans (port of tidSpansToRows), plan_guides, span_rows (rows and Shazam checks)
worker/mix_worker/scan.py                EDIT  scan() takes guides; guided first pass; report gains guided counts
worker/mix_worker/pipeline.py            EDIT  call the lookup before the scan; fill after it; result rows and the log lines
worker/mix_worker/config.py, env examples EDIT  WORKER_TRACKID (on|off, default on); constants stay in code
worker/tests/test_trackid.py, test_scan.py, test_pipeline.py, test_config.py  NEW/EDIT
worker/pyproject.toml, __init__.py, uv.lock EDIT version 0.7.0
docs/…                                   ADR-17 (new), ADR-10 note, inventory F32, how-it-works §10 §17, README, worker/README, CHANGELOG, limits, CLAUDE.md lines
```

**Structure Decision**: the lookup, the span parsing, the guide plan and the fill are pure functions in `trackid.py` (every network call injected); `scan.py` only learns "these stretches are guided" and `pipeline.py` wires the three steps. The equivalence rule (no data ⇒ today) is tested at the `scan()` level.

## Complexity Tracking

| Item | Why | Simpler option refused |
|---|---|---|
| Guided first pass inside `scan()` | The skip must happen where the probes are scheduled, and the pacing, progress and resume logic live there | Run Shazam as today and only fill (no saving of calls): refused, the owner picked both |
| A new origin `trackid` | The owner picked it; clear on screen and in data | Reuse `clue`: refused by the pick |
| App first, then worker | The app's validator rejects an unknown origin today | Ship together: a cached older app would drop the mix on pull |

**Release order** (documented in ADR-17, the CHANGELOG and `quickstart.md`): merge the app change and wait for the Pages deploy, hard-reload the app on every device, then release worker 0.7.0. Worker 0.7.0 on an older app: the app refuses the new rows, so the owner updates the app first.
