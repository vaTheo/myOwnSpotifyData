# Implementation Plan: Scan evidence, a level on every row the worker hears

**Branch**: `feat/worker-scan-evidence` | **Date**: 2026-11-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/029-worker-scan-evidence/spec.md` (approved by the owner on 2026-11-13: "Ok you can plan for everrything you have said")

## Summary

The worker stops throwing away what Shazam says about a match. Each hit keeps its position in the track, its two skews, the
number of entries of the answer and the speed its probe was cut at. One new pure module, `worker/mix_worker/evidence.py`, turns
the hits of a scan into a level per row (Solid, Many candidates, Out of step, Heard once) and the speed the
track plays at in the mix. The result gains three optional fields on a heard row; nothing else in it moves, no row is removed, and
the scan asks nothing more of Shazam. Two small worker changes ride along: a probe shorter than 12 s is filled with silence, and
the TrackId.net check asks again at the second-pass speeds when normal speed does not agree. The app keeps the three fields, shows
the level and the speed in the column that showed the %, sorts on the level and adds two chips. Worker 0.7.5, feature F45.

## Technical Context

**Language/Version**: Python 3.11–3.13 (worker); TypeScript ~6.0.3 (app: Preact, Vite)

**Primary Dependencies**: none added. Padding uses the standard library (`wave`), not a new ffmpeg filter.

**Storage**: the worker's run-state file gains one key inside each stored entry (no version field exists, none is added). The app
adds three optional fields to a saved mix's row: no `DB_VERSION` bump, no migration (ADR-05).

**Testing**: `cd worker && uv run python -m unittest discover -s tests`; `yarn typecheck && yarn lint && yarn test` (Vitest). Every
Shazam answer is faked through the existing `recognise` / `cut` / `cut_at` seam. Before a merge: `yarn regression`, `yarn invariants`.

**Target Platform**: the worker on the owner's computer (source form and the four executables); the browser (computer and phone).

**Project Type**: command-line worker + static web app.

**Performance Goals**: no Shazam call added to a scan, except at most one per second-pass speed other than ×1 for each
TrackId.net span whose normal-speed check did not agree (two with the default speeds). The levels are computed once, after both
passes, on a few hundred hits.

**Constraints**: no new outbound host, no new library, no new setting; one probe at a time unchanged; no Spotify host; a level
never removes, merges or reorders a row; an app of today's `main` must apply a 0.7.5 result exactly as it applies a 0.7.4 one.

**Scale/Scope**: 1 new worker module and 3 edited (`scan.py`, `__init__.py`, `pyproject.toml` + `uv.lock`); 1 new app module and
9 edited; tests; the documents listed under Documentation.

## Constitution Check

*GATE: passed before Phase 0; checked again after Phase 1 (no change).*

| Principle | Check | Result |
|---|---|---|
| I. Browser-first, no secret, one owner's server | Nothing computed on the server; the worker runs on the owner's computer; the result is the same kind of JSON. | Pass |
| II. No Spotify reads on load | No Spotify call anywhere in this round. | Pass |
| III. Library writes only on a tap | No write. | Pass |
| IV. External sources keyless, by id; clients never throw | No new source. Shazam and TrackId.net are asked as today; the extra check probes use the same paced `ask`. | Pass |
| V. IndexedDB upgrades only add | Three optional fields on an existing row type; no store, no `DB_VERSION` change; `mixes` stays out of `buildModel`. | Pass |
| VI. Play counts from the export | Not touched. | Pass |
| VII. Every failure is shown | No new failure path: a hit without evidence gives a row without a level; a retry probe that fails is logged like any probe. | Pass |
| Tooling (ADR-06) | No dependency, no CI change. Worker version bump as the rule asks. | Pass |
| Workflow | Options were measured and put to the owner (research note, 2026-11-13), who picked. Test-first. Docs in the same commits (see Documentation). No ADR needed: no lasting rule changes. | Pass |

No violation: the Complexity Tracking table is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/029-worker-scan-evidence/
├── spec.md
├── plan.md              # this file
├── research.md          # R1–R10: the choices behind the plan
├── data-model.md        # hit evidence, row evidence, the level rules
├── quickstart.md        # release order and the owner's checks
├── contracts/
│   ├── result-shape.md  # the three new row fields (F15 additions)
│   ├── worker.md        # evidence.py, scan.py changes, log lines, run state
│   └── app.md           # types, texts, sort, chips, validation
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
worker/mix_worker/
├── evidence.py          # NEW, pure: heard_of, mix_speed, in_step, levels, the three constants
├── scan.py              # heard on every entry; merge keeps each row's hits; levels on the rows; log lines;
│                        #   pad_wav in cut_probe; confirm_due asks again at the second-pass speeds
├── __init__.py          # 0.7.5
worker/pyproject.toml, worker/uv.lock   # 0.7.5
worker/tests/
├── test_evidence.py     # NEW: the pure rules
├── test_scan.py         # added cases; pinned rows that now carry the new fields are updated
└── test_config.py       # the version pin only

src/features/mix/
├── evidence.ts          # NEW, pure: the level names, evidenceLevel, rank, isFlagged, bestEvidence
├── evidence.test.ts     # NEW
├── worker.ts            # trackExtras reads the three fields
├── oneRowPerSong.ts     # the merged line takes the best level
└── review.ts            # two filters: solid, flagged
src/db/schema.ts         # TracklistRow: evidence?, mixSpeed?, candidates?
src/server/validate.ts   # validateMix bounds the three fields
src/ui/mix/
├── rowText.ts           # evidence texts, speed text; "second listen" without the re-cut speed
├── TracklistTable.tsx   # the column is Evidence, wider
└── tracklistSort.ts     # the level decides first
src/dev/demo.ts          # rows of every level in the Sunrise and Dock mixes
tools/shots/regression.spec.ts, tools/shots/pages.ts   # the tests that pick "Confidence" by its text pick "Evidence"
```

**Structure Decision**: the rules live in one pure module on each side (`evidence.py`, `evidence.ts`), so every threshold is
pinned by a table test and `scan.py` only carries data to it. `track_entry` keeps its shape (the F15 pin test stays), the
evidence rides on the entry under one key that never reaches the result.

## Design

Line numbers here, in research.md and in tasks.md are those of the code before the round (`origin/main` at `9aaf88b`).

### Worker: what a hit keeps

- `evidence.heard_of(response, speed=1.0) -> dict | None`: from `matches[0]`, `{"offset", "timeskew", "frequencyskew", "matches":
  len(matches), "speed"}`; `None` when `offset` or `timeskew` is not a number (`frequencyskew` may be absent: stored as `None`).
- At the three places an answer becomes an entry (`scan.py:641` first pass, `:718` second pass, `:477` the check probe), the entry
  gets `entry["heard"] = heard_of(response, speed)` when not `None`. `track_entry` itself is unchanged.
- `remember(...)` stores `dict(entry)` as today, so `heard` is in the run state and a resumed run reads it back (`:620-626`,
  `:700-706`). An entry stored by an older worker has no `heard`: its hit carries no evidence.
- `heard` never leaves the worker: `merge` builds a row from a copy of the first hit's entry without that key.

### Worker: levels

- `merge_with_hits(hits, gap) -> list[tuple[row, list[Hit]]]` does what `merge` does and also returns each row's hits; `merge` is
  `[row for row, _ in merge_with_hits(...)]`, so its tests stand.
- `evidence.levels(rows, probe_seconds) -> list[dict]` takes, per row, its key and its hits as `(time, heard | None)`, and returns
  per row the fields to add (possibly none). Rules, first that fits (data-model.md has them in full):
  1. **solid**: a hit of the row is in step with another hit of the same key, of this row or another.
  2. **candidates**: the first hit's answer has 10 entries or more.
  3. **out_of_step**: the row has two hits or more.
  4. **once**.
  There is no level for a hit lying between two hits of another track: `drop_sandwiched` removes it before (spec.md, decision 7).
  A row whose first hit has no `heard` gets no field at all.
- In step (`evidence.in_step`): for hits a before b, `probe_seconds × a.speed ≤ tb − ta ≤ 60` and
  `|b.offset − (a.offset + (tb − ta) × mix_speed(a))| ≤ 0.5`, with `mix_speed(h) = (1 + h.timeskew) / h.speed`.
- Constants in `evidence.py`: `STEP_TOLERANCE_SECONDS = 0.5`, `STEP_MAX_GAP_SECONDS = 60`, `MANY_CANDIDATES = 10`.
- In `scan()` (`:759-774`): after `drop_sandwiched`, `pairs = merge_with_hits(filtered, gap)`, the fields of `levels(...)` are
  set on each row, one log line counts the levels, the rows are returned. `drop_sandwiched` and the order of rows are untouched.
- Row fields (contracts/result-shape.md): `evidence`, `mix_speed_percent` (one decimal; the middle value over the row's hits
  that are in step, else the first hit's), `candidates` (the first hit's count).

### Worker: log

- `_details(entry)` (`:301-306`) appends, when the entry has `heard`, `at M:SS in the track` and the speed in the mix
  (`−5.8 %`), before the %.
- One line after the second-pass summary: `  evidence · 11 solid · 27 many candidates · 4 out of step ·
  72 heard once` (levels with no row are left out; no line when no row has a level).

### Worker: padding

- `pad_wav(data, seconds=PROBE_SECONDS) -> bytes` in `scan.py`: reads the WAV with `wave`, appends zero frames up to `seconds`,
  writes it back; returns `data` unchanged when it is already that long, shorter than `MIN_PROBE_BYTES`, or unreadable.
- `cut_probe` (`:830-871`) returns `pad_wav(...)` of what ffmpeg wrote. A probe with no audio stays under `MIN_PROBE_BYTES`, so
  the three length checks (`:472`, `:634`, `:712`) behave as today and an unknown-length scan still ends.

### Worker: the TrackId.net check at the second-pass speeds

- In `confirm_due` (`:460-485`), after the normal-speed probe is absorbed: if its entry does not name the span's track (the
  `artist_matches` / `title_matches` test `absorb` already uses) and `cut_at` is given and `gap_step > 0`, each speed of
  `second_pass_order(speeds)` other than 1 is asked at the same place with `cut_at(guide.confirm_at, speed)`, through the same
  `ask`. The first entry that names the span's track is absorbed and ends the loop. An entry that does not is **not** absorbed,
  so `check_of` (`trackid.py:227-244`) is unchanged and "differs" still carries what normal speed heard.
- Run state: each retry is remembered under `confirm` with the key `"<span>@<speed:g>"` (the normal-speed key stays `"<span>"`);
  a resumed run replays them and asks only what is missing.
- Log: `  trackid confirm · span 3 · 00:44:41 ×1.09 · …`.

### App: data

- `TracklistRow` (`src/db/schema.ts:275-280`): `evidence?: string` (the worker's word, kept as it came), `mixSpeed?: number`
  (percent), `candidates?: number`.
- `src/features/mix/evidence.ts`: `LEVELS = ['solid', 'once', 'out_of_step', 'candidates']` (best first),
  `evidenceLevel(row)` (a known level, else `null`: an unknown word shows as no level), `evidenceRank(row)`, `isFlagged(row)`
  (candidates, out_of_step), `bestEvidence(rows)` (the row with the best level).
- `trackExtras` (`src/features/mix/worker.ts:74-110`): for a heard row (first pass and replay) only, `evidence` when a non-empty
  string of at most 32 characters, `mixSpeed` from `mix_speed_percent` when finite and between −50 and 50, `candidates` when a
  whole number from 1 to 1000. Anything else is dropped, the row stays.
- `validateMix` (`src/server/validate.ts:270-276`): the same three bounds; a value outside fails the mix like `hits` does.
- `oneRowPerSong` (`src/features/mix/oneRowPerSong.ts:44-56`): the merged line takes `evidence` and `mixSpeed` from the ranked copy
  with the best level; `candidates` stays the kept copy's.

### App: what the owner reads

- `rowText.ts`: `speedText(pct)`: `played 5.8 % slower`, `played 3.4 % faster`, `played at original speed` (under 0.05 %);
  `speedShort(pct)`: `−5.8 %`, `+3.4 %`, `0 %`.
- `confidenceShort` / `confidenceText` (`:157-176`), for a row with a known level (and still `source: 'tracklistify'`):

  | Level | Column | Full text (tooltip, screen reader, phone) |
  |---|---|---|
  | solid | `Solid ×11 · −5.8 %` | `Solid: heard 11×, the position in the track advances in step · played 5.8 % slower` |
  | once | `Heard once · −3.9 %` | `Heard once · played 3.9 % slower` |
  | out_of_step | `Out of step ×3 · −0.8 %` | `Out of step: heard 3×, the position in the track jumps · played 0.8 % slower` |
  | candidates | `Many candidates · −3.6 %` | `Many candidates: Shazam listed 12 for this answer · played 3.6 % slower` |

  The speed part is left out when the row has no `mixSpeed`. A row without a level reads as today.
- `originText` (`:108-114`): a replay row with `mixSpeed` reads `second listen`; without it, as today.
- `TracklistTable.tsx` (`:360-370`): header `Evidence`, width `184px`; the cell and its title use the same two functions.
- `tracklistSort.ts` (`:40-47`, `:68`): the choice reads `Evidence`; the value of a levelled row is
  `rank × 1 000 000 + hits × 1000 + confidence` with rank solid 4, once 3, out_of_step 2, candidates 1, so every levelled
  row sorts before a row without a level and the hit count decides inside a level. The id stays `confidence`.
- `review.ts` (`:10-60`): `ReviewFilter` gains `'solid'` and `'flagged'`; the chips `Solid (n)` and `Flagged (n)` are offered
  when some row has a known level, after `Heard once`.
- `src/dev/demo.ts` (`:746-864`): the Sunrise and Dock rows carry `evidence`, `mixSpeed` and `candidates`, every level present.

### Compatibility

| Case | What happens | Why |
|---|---|---|
| App of today's `main`, result of 0.7.5 | same rows as with 0.7.4 | `toRow` and `trackExtras` copy named fields only |
| New app, result of 0.7.4 or a mix saved before | rows read as today | every reader handles the fields being absent |
| Older app pulls a saved mix holding the new fields | accepted, fields kept | `validateMix` keeps unknown row keys (`validate.ts:11-12`) |
| A later worker writes a level this app does not know | row kept, shown with no level | `evidenceLevel` returns `null` |
| Resume from a 0.7.4 state file | old hits have no evidence | the state file is accepted (its settings key is unchanged) |

## Documentation (same commits as the code they describe)

| Document | Change |
|---|---|
| `specs/016-trackid-worker-clues/contracts/result-shape.md` | a note pointing to this round's contract for the three fields |
| `worker/README.md` | the log example with position and speed; the second pass text (the default speeds are 0.91, 1.09, 1); the levels; the check at the second-pass speeds; `WORKER_PROBE_SECONDS` row (shorter probes are filled with silence) |
| `worker/RELEASE_NOTES.md` | 0.7.5 entry: what changed, no new setting, "The app needs no update; update it to see the levels" |
| `worker/.env.example`, `worker/mix_worker/env.example` | the `WORKER_PROBE_SECONDS` comment (both files stay identical) |
| `specs/002-mix-analysis-worker/contracts/worker.md` | the `WORKER_PROBE_SECONDS` row, an amendment note |
| `docs/architecture/000-how-it-works.md` | §10 (the fields a result row brings), §13 (the Evidence cell, chips, sort), §16 (validation), §17 (evidence, levels, padding, the check's speeds) |
| `docs/architecture/100-features.md` | new row F45; the lines of F19, F24 and F26 that name the % or the Confidence column |
| `docs/architecture/800-limits-roadmap.md` | the mix-scan accuracy entry: what is now built, what stays unsolved |
| `docs/research/2026-11-13-shazam-mix-accuracy.md` | one line under the recommendation: built in spec 029 |
| `README.md` | the tracklist columns (Evidence, the levels in plain words, the chips, the sort) |
| `CHANGELOG.md` | one entry, with what to do (update the worker to 0.7.5; scan a set again to get levels on it) |
| `specs/003-web-first-redesign/regression.md` | rows R07, R08, M01, M02: Evidence instead of Confidence, the two chips |
| `src/features/mix/CLAUDE.md`, `worker/CLAUDE.md` | one line each if a required input changes (the new modules) |

## Complexity Tracking

Not needed.
