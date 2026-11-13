# Tasks: Scan evidence, a level on every row the worker hears

**Input**: Design documents from `specs/029-worker-scan-evidence/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/result-shape.md, contracts/worker.md, contracts/app.md

**Tests**: written first (the constitution's workflow). A test task comes before the task that makes it pass.

**Every commit**: `yarn typecheck && yarn lint && yarn test` and `cd worker && uv run python -m unittest discover -s tests`, each
judged by its exit code, never through a pipe; `type(scope): summary`; the documents of what the commit touches in the same commit
(the table "Documentation" of plan.md says which). No push without the owner's OK. No `yarn shots` unless the owner asks. No live
call to Shazam, TrackId.net or any network in a test. Line numbers in the tasks are those of the code before the round
(`origin/main` at `9aaf88b`).

**Amendments during the build (2026-11-13)**

- Commits: the owner chose that implementers never stage or commit; each step is committed after its review passes.
- Steps: every step has its own implementer and its own reviewer (the owner's word); the larger batches are split
  (C1 T007+T008, C2 T009, C3 T010; E1 T013+T014, E2 T015; H1 T020, H2 T021).
- The level `inside` is not built (spec.md, decision 7): the sandwich rule already drops those hits. Wherever a task below names
  `inside`, "inside another track", the 30 s margin or five levels, that part is void: there are four levels. Task T008a removes
  it from the two rule modules written before the ruling.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (another file, no dependency on an unfinished task)
- **[Story]**: the user story of spec.md the task serves

## Phase 1: Setup

- [x] T001 Install in this worktree (`yarn install --frozen-lockfile`; `cd worker && uv sync --frozen`) and run the four gates once on the untouched branch; they exit 0 (1,845 app tests, 419 worker tests, 2026-11-13)
- [x] T002 Commit the round's documents as they are: `specs/029-worker-scan-evidence/` (plan, research, data-model, quickstart, contracts, tasks) as `docs(worker): spec 029, plan and tasks`

---

## Phase 2: Foundational (blocks every story)

**Purpose**: the rules, pure and pinned, on both sides. Nothing the owner sees changes yet.

- [x] T003 [P] Failing tests in new `worker/tests/test_evidence.py`: `heard_of` (a full answer; `matches` empty; no `offset`; `timeskew` a boolean; `frequencyskew` missing gives `None`; `speed` kept; `matches` is the list's length); `mix_speed` (first pass; re-cut at 1.09 with timeskew 0.0246 gives 0.94); `in_step` as a table (in step at original speed; in step on re-cut hits; 6 s apart is not a pair; 13.08 s apart after a ×1.09 hit is; 75 s apart is not; 0.6 s off is not; 0.4 s off is; the later hit first is not; a hit without evidence is not); `levels` (two hits of one row in step: solid; one hit in each of two rows of one key in step: both solid; two hits out of step: out_of_step; one hit 31 s inside a solid row of another key: inside; 29 s from its start or its end: not inside; inside a row that is not solid: not inside; 10 entries: candidates, 9: once; one hit: once; solid wins over 12 entries; inside wins over 12 entries; first hit without evidence: `{}`; `mix_speed_percent` is the median of the in-step hits, else the first hit's, one decimal; `candidates` is the first hit's count)
- [x] T004 `worker/mix_worker/evidence.py` per contracts/worker.md (constants, `LEVELS`, `heard_of`, `mix_speed`, `in_step`, `levels`); T003 passes; no import of `scan`
- [x] T005 [P] Failing tests in new `src/features/mix/evidence.test.ts`: `evidenceLevel` (each known word; an unknown word and an absent field give `null`), `evidenceRank` (5 to 1, 0 without), `isFlagged`, `bestEvidence` (best rank wins; the first among equals; `null` when none has a level), `evidenceExtras` (the three fields accepted; `evidence` empty, 33 characters long or a number left out; `mix_speed_percent` NaN, 51 or a string left out; `candidates` 0, 1.5 or 1001 left out)
- [x] T006 `src/db/schema.ts`: `evidence?`, `mixSpeed?`, `candidates?` on `TracklistRow` (after `speedPercent`, `:279-280`) with the comments of contracts/app.md; new `src/features/mix/evidence.ts` per contracts/app.md; T005 passes

**Checkpoint**: both suites green; no behaviour changed.

---

## Phase 3: User Story 1 - A level on every row Shazam heard (P1)

**Goal**: the result's heard rows carry `evidence`, `mix_speed_percent` and `candidates`; the app keeps them.

**Independent Test**: a scan with faked answers that carry positions gives one row of each level; `trackExtras` keeps the three fields.

- [x] T007 [US1] Failing tests in `worker/tests/test_scan.py`, class `Evidence`, with a fake `recognise` that returns an answer per probe time (track, `offset`, skews, number of entries): the six acceptance scenarios of User Story 1 (solid on the first pass; solid on second-pass hits at ×1.09 with `mix_speed_percent` −6.0; out_of_step; inside and its 30 s margin; candidates; once); rows, their order, `hits`, `confidence`, `origin` and `speed_percent` equal those of the same scan today (FR-005); no row holds the key `heard`; `merge` of hits whose entries hold `heard` returns rows without it; the number of `recognise` calls is the number of probes, as before (SC-001); one full row pinned as in contracts/result-shape.md
- [x] T008 [US1] `worker/mix_worker/scan.py`: `heard` set on the entry at `:641` and `:718` (speed 1, then the second-pass speed); `merge_with_hits` beside `merge` (`:205-222`), `merge` built on it; after `drop_sandwiched` (`:759-774`) the rows get the fields of `evidence.levels`; T007 passes. Existing tests whose pinned rows now carry the three fields (the cassette holds an `offset`) are updated, each named in the commit message; no other expectation changes
- [ ] T008a Amendment (spec.md, decision 7): the level `inside` and `INSIDE_MARGIN_SECONDS` removed from `worker/mix_worker/evidence.py` and its tests; `'inside'` removed from `src/features/mix/evidence.ts` and its tests (four levels; ranks 4 to 1; Flagged is `out_of_step` and `candidates`; the word `inside` on a row reads as no level)
- [ ] T009 [US1] Failing tests then code for the run state: a run stopped after the first pass and resumed gives the same levels and asks nothing again (`heard` is in the remembered entries); a state whose entries have no `heard` (as written by 0.7.4) gives rows without the three fields (User Story 5, scenario 3)
- [ ] T010 [US1] Failing tests then code for the log (`scan.py:301-306` `_details`, and one line after the second-pass summary): a hit line with evidence holds `at 1:32 in the track · −7.7 %` before the %; a hit without evidence reads as today; the line `evidence · 1 solid · 1 inside another track · 1 many candidates · 1 out of step · 1 heard once`, levels with no row left out, no line when no row has a level. Same commit: `worker/README.md` (the log example, the levels in words)
- [ ] T011 [P] [US1] Failing tests in `src/features/mix/worker.test.ts` (`trackExtras` through `resultToRows`: the three fields kept on a first-pass row and on a replay row; never on a clue or trackid row; a field out of bounds dropped and the row kept; a 0.7.4 row gives exactly today's row), `src/server/validate.test.ts` (`validateMix`: the three fields accepted; each refused out of bounds with its `mixes.row.…` reason; an unknown level word accepted), `src/features/mix/oneRowPerSong.test.ts` (the merged line takes the best level and that copy's `mixSpeed`; no level among the copies: today's line), `src/features/mix/tracklistify.test.ts` (the hand import ignores the three fields)
- [ ] T012 [US1] `src/features/mix/worker.ts` (`trackExtras` `:74-110`), `src/server/validate.ts` (`:270-276`), `src/features/mix/oneRowPerSong.ts` (`:44-56`) per contracts/app.md; T011 passes. Same commit: how-it-works §10 and §16

**Checkpoint**: a 0.7.5 result carries the levels and the app stores them; nothing shows yet.

---

## Phase 4: User Story 2 - The speed the track plays at, instead of the % (P1)

**Goal**: the owner reads the level and the speed in the Evidence column, sorts on it and filters with two chips.

**Independent Test**: rows with and without a level render the texts of contracts/app.md.

- [ ] T013 [US2] Failing tests in `src/ui/mix/rowText.test.ts` (`speedShort` and `speedText`: slower, faster, under 0.05; the short and long text of each level with and without `mixSpeed`, `hits`, `candidates`; an unknown level and no level read as today; a row whose `source` is no longer `tracklistify` gives `null` as today; `originText` of a replay row with `mixSpeed` is `second listen`, without it as today), `src/ui/mix/tracklistSort.test.ts` (levelled rows before rows without a level; the order of the five levels; the hit count inside a level; the choice reads `Evidence`), `src/features/mix/review.test.ts` and `src/ui/mix/tracklistView.test.ts` (`solid` and `flagged` filters; the two chips only when a row has a known level, after Heard once, with counts; a gap row under All only)
- [ ] T014 [US2] `src/ui/mix/rowText.ts` (`:108-114`, `:157-176`), `src/ui/mix/tracklistSort.ts` (`:40-47`, `:68`), `src/features/mix/review.ts` (`:10-60`), `src/ui/mix/TracklistTable.tsx` (`:360-370`: header `Evidence`, width `184px`); tokens only, no new colour; T013 passes. Same commit: how-it-works §13, the README's tracklist columns
- [ ] T015 [US2] `src/dev/demo.ts` (`:746-864`): `evidence`, `mixSpeed`, `candidates` on the heard rows of Sunrise and Dock, every level in Sunrise, one replay row whose `mixSpeed` differs from its `speedPercent`; `tools/shots/regression.spec.ts` (`:1741`, `:2002`: the Sort option and the column header picked by the text `Confidence`), `tools/shots/pages.ts` if it names the column, and `specs/003-web-first-redesign/regression.md` rows R07, R08, M01, M02 read `Evidence` and know the two chips; `yarn regression` exits 0

**Checkpoint**: on `?demo`, the Sunrise mix shows the five levels, the sort and the chips.

---

## Phase 5: User Story 3 - The TrackId.net check hears a pitched track (P2)

**Goal**: a real track played fast or slow reads "Shazam agrees".

**Independent Test**: a guided scan with a fake that names the span's track only at ×1.09.

- [ ] T016 [US3] Failing tests in `worker/tests/test_scan.py` (`GuidedScan`): normal speed names another track, ×0.91 names another, ×1.09 names the span's: outcome `agrees`, two extra calls, in the order of `second_pass_order`; normal speed agrees: no extra call; no speed agrees: outcome `differs` with what normal speed heard (a retry answer is not absorbed), exactly two extra calls; normal speed silent and ×0.91 agrees: `agrees`, one extra call; `gap_step=0`: no retry; `cut_at=None`: no retry; `remember("confirm", "2@1.09", …)` is called for an answered retry; a resumed run with those keys asks nothing again and gives the same outcome; the log line holds `×1.09`
- [ ] T017 [US3] `worker/mix_worker/scan.py` `confirm_due` (`:460-485`) per contracts/worker.md; `trackid.py` untouched; T016 passes. Same commit: `worker/README.md` (the TrackId.net section), how-it-works §17

---

## Phase 6: User Story 4 - No probe is lost to its length (P3)

- [ ] T018 [US4] Failing tests in `worker/tests/test_scan.py`: `pad_wav` (a 7 s mono 16 kHz WAV comes back 12 s long with the same parameters, its samples first and zeros after; a 12 s WAV comes back byte for byte; data under `MIN_PROBE_BYTES` and bytes that are not a WAV come back as they are; it never raises); `cut_probe` returns padded data for a short cut (through the seam the existing `CutProbeSpeed` tests use, `:835`); a scan of unknown length still ends on a probe with no audio
- [ ] T019 [US4] `worker/mix_worker/scan.py`: `pad_wav` and its use in `cut_probe` (`:830-871`); T018 passes. Same commit: the `WORKER_PROBE_SECONDS` line in `worker/.env.example` and `worker/mix_worker/env.example` (identical), its row in `worker/README.md` and in `specs/002-mix-analysis-worker/contracts/worker.md` (an amendment note)

---

## Phase 7: Version and release notes

- [ ] T020 `0.7.5` in `worker/mix_worker/__init__.py` and `worker/pyproject.toml`, `uv lock` for `worker/uv.lock`; the version test stays green; the top entry of `worker/RELEASE_NOTES.md` (levels and speed in the result; the check at the second-pass speeds; short probes filled with silence; no new setting; "The app needs no update; update it to see the levels")

---

## Phase 8: Documentation sweep and gates

- [ ] T021 The documents of plan.md not yet touched: `docs/architecture/100-features.md` (row F44; the lines of F19, F24, F26), `docs/architecture/800-limits-roadmap.md` (the mix-scan accuracy entry: built, and what stays unsolved), `docs/research/2026-11-13-shazam-mix-accuracy.md` (one line: built in spec 029), `CHANGELOG.md`, `specs/016-trackid-worker-clues/contracts/result-shape.md` (a pointer), `src/features/mix/CLAUDE.md` and `worker/CLAUDE.md` if a required input changed. Then the sweep: a file-to-document map of every file the round changed, each claim checked against the code; relative links answered
- [ ] T022 The four gates, `yarn regression` and `yarn invariants`, each by its exit code; the three public-safe commands of Contributing print nothing
- [ ] T023 Final review by a second reader: the code against spec.md and the three contracts, the documents against the code; findings fixed test-first, then T022 again
- [ ] T024 Report to the owner: the commits, the gates' output, what was not done, the push and PR text proposed; `spec.md` status set to Built after the owner's checks of quickstart.md

---

## Dependencies & Execution Order

- Phase 2 blocks everything. T003 → T004 and T005 → T006 are two independent pairs.
- Worker line: T007 → T008 → T009, T010; then T016 → T017 and T018 → T019 (each pair independent of the other); T020 last.
- App line: T011 → T012 → T013 → T014 → T015. It needs only Phase 2, so it can run beside the worker line.
- Phase 8 after both lines.

## Batches for the implementers

| Batch | Tasks | Files |
|---|---|---|
| A | T003, T004 | `worker/mix_worker/evidence.py`, `worker/tests/test_evidence.py` |
| B | T005, T006 | `src/features/mix/evidence.ts`, its test, `src/db/schema.ts` |
| C | T007 to T010 | `worker/mix_worker/scan.py`, `worker/tests/test_scan.py`, `worker/README.md` |
| D | T011, T012 | `src/features/mix/worker.ts`, `oneRowPerSong.ts`, `src/server/validate.ts`, their tests |
| E | T013 to T015 | `src/ui/mix/*`, `src/features/mix/review.ts`, `src/dev/demo.ts`, the regression rows |
| F | T016, T017 | `confirm_due` in `scan.py`, `test_scan.py` |
| G | T018, T019 | `pad_wav`, `cut_probe`, the setting's documents |
| H | T020, T021 | version, release note, the remaining documents |

Batches C, F and G all edit `scan.py`: they run one after the other. A and B can run together; D and E follow B.
