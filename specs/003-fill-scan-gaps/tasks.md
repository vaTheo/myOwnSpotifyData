# Tasks: Fill the gaps of a worker scan

**Input**: `specs/003-fill-scan-gaps/` — spec.md, plan.md, research.md (R1–R8), data-model.md, contracts/worker.md,
contracts/client-api.md, quickstart.md

**Tests**: required by the project's rules (`worker/CLAUDE.md`: every external call faked, `unittest` green before each
commit; root `CLAUDE.md`: Vitest next to source, accepted **and** refused match cases). Tests are written before the code they
cover.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1 second pass, US2 clues, US3 candidates

## Phase 1: Setup

- [X] T001 Add the four settings `WORKER_REPLAY_SPEED_PERCENT` (4, 0–20, 0 = off), `WORKER_CLUES` (1, 0/1), `WORKER_CLUE_SECONDS` (90, ≥ 5), `WORKER_LOOKUPS` (100, ≥ 0) to `worker/mix_worker/config.py` (`Settings` fields `replay_speed_percent`, `clues`, `clue_seconds`, `lookups`), `worker/.env.example` and `worker/mix_worker/env.example` (byte-identical), with defaults asserted in `worker/tests/test_config.py`
- [X] T002 [P] Create `src/features/mix/parse.cases.json` (line cases: clock/index/side prefixes, dash kinds, trailing `[Label]`, non-track lines) and make `src/features/mix/parse.test.ts` run every case through `parseLines(…, 1)`; same file read later by `worker/tests/test_clues.py`
- [X] T003 [P] Create `src/features/mix/match.cases.json` (artist/title pairs with `accept: true|false`: "FISHER (OZ)"/"Fisher", "DJ Koze"/"Koze", "Four"/"Four Tet" refused, "Onceless"/"Onceless (Original Mix)", "Leave Home Edit Select Remix"/"Leave Home (Edit Select Remix)", "Closer Than Close"/"Closer Than Close (Mentor Original Radio Edit)" refused, "One"/"One More Time" refused) and a test in `src/features/mix/spotifySearch.test.ts` that runs each through `pickMatch`'s title and artist rules (exporting `artistCore`, `sameTitle` for the test only if needed)

## Phase 2: Foundational

- [X] T004 Record per-probe outcomes in the first pass: `scan()` in `worker/mix_worker/scan.py` returns `ScanResult(rows, outcomes)` where `outcomes` is a list of `(time, "hit" | "none" | "skip")`, every caller updated (`run_scan`, `pipeline.run_one`, tests in `worker/tests/test_scan.py`, `test_pipeline.py`); behaviour otherwise unchanged
- [X] T005 [P] `gaps_of(outcomes, step)` in `worker/mix_worker/scan.py`: maximal runs of non-hit probes → `[(start, end, [probe times])]`; tests for a set with no gap, a gap at the start, at the end, two gaps
- [X] T006 [P] Add the optional row fields to `src/db/schema.ts`: `Clue = {atSec: number|null; author: string; text: string; kind: 'comment'|'chapter'|'description'}`, `TracklistRow.origin?: 'replay'|'clue'`, `speedPercent?: number`, `clue?: Clue`, `clues?: Clue[]`, `MixRow.clues?: Clue[]` (no `DB_VERSION` bump, ADR-05)
- [X] T007 Check the new fields in `validateMix` (`src/server/validate.ts`): `origin` in the two values, `speedPercent` finite, each clue's `text`/`author` strings ≤ 1 000 characters, `atSec` finite or null, `kind` in the three values, ≤ 30 clues per row, ≤ 200 on the mix; accepted and refused cases in `src/server/validate.test.ts`

**Checkpoint**: worker suite and app suite green, nothing visible changed.

## Phase 3: User Story 1 — second listen on the gaps (P1) 🎯 MVP

**Done differently (owner's pick at implementation)**: the owner kept their draft second pass already in `scan.py` (+7 s, one
place every 30 s, ×1 then ×0.96 then ×1.04); T008–T011 were done on that rule (tests `SecondPass`, `CutProbeSpeed` in
`worker/tests/test_scan.py`), not the one-in-two rule below.

**Goal**: replay one unmatched probe out of two at +4 % / −4 % alternately; a refusal keeps what was found.
**Independent test**: a fake set with a 12-probe gap: replays at probes 1,5,9 (+4) and 3,7,11 (−4); a fake hit on probe 7 at
−4 % becomes a row `origin: "replay"`, `speed_percent: -4`.

- [X] T008 [P] [US1] Tests in `worker/tests/test_scan.py`: the replay schedule (12-probe gap → 1+,3−,5+,7−,9+,11−; 1-probe gap → one +), pacing (cooldown + jitter before every replay), a hit marked `origin`/`speed_percent`, merge with first-pass rows by time, `RateLimited` beyond the pauses → `stopped="rate limited"` and the found hits kept, 3 no-answers in a row → `stopped="no answer"`, `replay_speed_percent=0` → no replay
- [X] T009 [P] [US1] Test in `worker/tests/test_scan.py` for `cut_probe(..., speed=1.04)`: the ffmpeg arguments carry `-t` = probe × speed **before** `-i` and `-af aresample=16000,asetrate=16640,aresample=16000` (fake subprocess)
- [X] T010 [US1] `cut_probe(ffmpeg, file, t, seconds, say, speed=1.0)` in `worker/mix_worker/scan.py` (R2)
- [X] T011 [US1] `async replay(gaps, *, speed_percent, cooldown, pause, max_pauses, max_skew, recognise, cut, sleep, classify, line, jitter, clock) -> ReplayResult(hits, replays, found, stopped)` in `worker/mix_worker/scan.py` (R1, R6), one log line per replay (`replay k/N · HH:MM:SS · +4 % · NEW|same track|no match · …`)
- [X] T012 [US1] Wire it in `run_scan`/`pipeline.run_one` (`worker/mix_worker/scan.py`, `worker/mix_worker/pipeline.py`): first pass → gaps → replay → rows merged (`merge`) → `mix_info.second_pass {replays, found, stopped}`; `write_result` adds `origin`/`speed_percent` to replayed tracks; test in `worker/tests/test_pipeline.py` that a refused second pass still sends `done` with the first pass's rows
- [X] T013 [US1] App: `resultToRows` in `src/features/mix/worker.ts` maps `origin`/`speed_percent`; tests in `src/features/mix/worker.test.ts`; Mix screen row shows "second listen · +4 %" in its provenance line (`src/ui/Mix.tsx` `provenanceLine`)

**Checkpoint**: US1 alone is shippable (worker 0.3.0-pre, replays only).

## Phase 4: User Story 2 — read the description, chapters and comments (P2)

**Goal**: clues with positions, attached to the gaps they fall in, shown on the Mix screen.
**Independent test**: the five fixtures in `worker/tests/fixtures/clues/` give R8's "Expected" clues offline.

- [X] T014 [P] [US2] Tests in `worker/tests/test_clues.py` for line parsing: every case of `src/features/mix/parse.cases.json`; mention stripping (`@someone: X - Y`, `@someone X - Y`); `Unreleased`/`ID`/`???` titles flagged not-a-track; two-dash lines give both readings; the sentence cut (`Mary Mac. Vinyl only` → also `Mary Mac`)
- [X] T015 [P] [US2] Tests in `worker/tests/test_clues.py` for the split search (R4, owner: separators are not standard): the Whomp list as posted (` // `) and re-written with new lines, ` | `, `•`, `;`, `1. 2.` numbering, `00:00` clocks → the same 15 pieces each time (clock version keeps times); "Deep Inside / Orbit" alone is not split; a comment with 2 tracks is not a tracklist; prose with dashes ("omg - what a drop") is not a tracklist
- [X] T016 [P] [US2] Tests in `worker/tests/test_clues.py` from the five fixtures: clue lists per R8 (set-wide Whomp list, the Vault reply at 3092.709, the Artaphine replies at 725.051 and 242.72, the Lot Radio replies at 495.566 and 2519.088, the BRUM description's 30 lines with the ≥ 5 run guard); YouTube shapes (chapters with `start_time`, a comment starting with `12:34`)
- [X] T017 [US2] `worker/mix_worker/clues.py`: `Clue` dataclass, `parse_line`, `split_tracklist` (the split search), `from_description`, `from_chapters`, `from_comments` (reply mention strip, set-wide tracklists), all pure
- [X] T018 [US2] `read(url, *, ydl_factory, timeout, line) -> list[Clue] | None` in `worker/mix_worker/clues.py`: one `extract_info(download=False, getcomments=True, socket_timeout=20)` (YouTube `max_comments` 500) in a daemon thread joined after `timeout`; failure or timeout → `None` and one log line (`clues · dropped after 90 s` / `clues · could not read: …`); tests with a fake `YoutubeDL` (slow, raising, normal)
- [X] T019 [US2] `attach(clues, gaps, margin=30)` and the size cut in `worker/mix_worker/clues.py`: clues inside a gap ± 30 s go to that gap (≤ 30 a gap, nearest first), set-wide ones to `mix_info.clues` (≤ 200), texts cut at 1 000 characters with `…`; drop the farthest first until the result fits `WORKER_RESULT_MAX_BYTES`, logged; tests
- [X] T020 [US2] Wire clues in `worker/mix_worker/pipeline.py` after the scan when `WORKER_CLUES=1`; `write_result` writes `mix_info.gaps` (still-empty gaps with clues) and `mix_info.clues`; log `clues · 35 read · 4 on gaps · 15 set-wide`; tests in `worker/tests/test_pipeline.py` (clues off, clues failing → result as today)
- [X] T021 [US2] App: `resultToRows` builds gap rows from `mix_info.gaps` (with `clues`) and returns set-wide `clues`; `mergeWorkerRows` keeps them as worker rows; stored on the `MixRow` (`src/features/mix/worker.ts`, `src/model/state.ts` where the result is applied); tests in `src/features/mix/worker.test.ts` (plain text kept, over-long cut, bad clue dropped)
- [X] T022 [US2] Mix screen (`src/ui/Mix.tsx`, `src/styles.css`): a gap row shows "N comments around here" folded (`<details>`), each clue as author · mm:ss · text, rendered as text (no HTML, no clickable links); set-wide clues in one folded block above the tracklist ("Tracklist from the description / from a comment")

**Checkpoint**: US1 + US2: replays and readable clues.

## Phase 5: User Story 3 — candidates from clues (P3)

**Goal**: an `Artist – Title` clue confirmed by exact equality in Deezer, then MusicBrainz (or a Discogs/Deezer link by id)
becomes a row "from a comment".
**Independent test**: with fake catalogue answers recorded from 2026-11-06 (R5, R8): Space Above (Deezer, ISRC), Rrose
(Deezer), Jala, The Real – Mary Mac, Nigm (MusicBrainz) accepted; Closer Than Close vs the Mentor edit, Ina Kacz, IPAR refused;
the Discogs 2-track master enriches the clue only.

- [X] T023 [P] [US3] Tests in `worker/tests/test_clues.py`: the equality rules on every case of `src/features/mix/match.cases.json` (same verdicts as the app)
- [X] T024 [P] [US3] Tests in `worker/tests/test_clues.py` with fake `fetch_json`: Deezer accept/refuse (R5 evidence), MusicBrainz fallback only when Deezer accepts nothing, User-Agent without email, pacing (0.2 s / 1.1 s / 2.5 s via fake sleep), `WORKER_LOOKUPS` cap, a catalogue error → no candidate and one log line, a track already in the set → no lookup; Discogs master with 1 track → candidate, with 2 → enriched text only, `(2)` suffix stripped; Deezer track link by id
- [X] T025 [US3] Port `normalize` (`src/model/normalize.ts`), `cleanTitle`, `artistRuns` (`src/features/rekordbox-match.ts`), `artistCore`, `sameTitle` (`src/features/mix/spotifySearch.ts`) to `worker/mix_worker/match.py`
- [X] T026 [US3] `lookup(clue, *, fetch_json, sleep, line, budget) -> Candidate | None` in `worker/mix_worker/clues.py`: title variants (as written, sentence cut), two-dash readings, Deezer `/search?q=`, then MusicBrainz `/ws/2/recording`, Discogs/Deezer links by id (R5, R8); `fetch_json` built on `urllib.request` with a 15 s timeout in `worker/mix_worker/clues.py`
- [X] T027 [US3] Wire candidates in `worker/mix_worker/pipeline.py`: for clues on still-empty gaps and set-wide clues; `write_result` adds candidate tracks (`origin: "clue"`, `clue`, `confidence` absent, `time_in_mix` = clue time or absent, `metadata.isrc`, `metadata.links.deezer|musicbrainz|discogs`); log one line per candidate; test in `worker/tests/test_pipeline.py` that the fake client still sees only the project's host for server calls and the catalogue hosts only for lookups
- [X] T028 [US3] App: `resultToRows` maps candidates (`origin: 'clue'`, `clue`, `isrc`); the Mix row shows "from a comment" / "from the description" with the clue's author and text; Create playlist includes them unchanged (identified rows); tests in `src/features/mix/worker.test.ts` and a `spotifySearch` case that a candidate's ISRC is tried first

## Phase 6: Polish, governance and docs

- [X] T029 Constitution v2.1.0 in `.specify/memory/constitution.md` (Principle IV: the worker may search a keyless catalogue by name for a clue without identifier, exact equality, marked; Sync Impact Report), new `docs/architecture/700-adr/ADR-10-name-lookup-for-clues.md` linked from the ADR index and ADR-04/ADR-09, `docs/architecture/800-limits-roadmap.md`
- [X] T030 [P] `worker/CLAUDE.md` (outbound hosts: `api.deezer.com`, `musicbrainz.org`, `api.discogs.com`; replay rule), `worker/README.md` (settings table, log lines, troubleshooting), root `CLAUDE.md` routing row unchanged unless a new folder appears
- [X] T031 [P] `docs/architecture/000-how-it-works.md` §10 (candidate and clue rows on the Mix screen) and §17 (second pass, clues, lookups), `docs/architecture/100-features.md` (F19 row or a new F20 row), inventory's "What leaves the browser" table (the worker's new hosts), `README.md` owner's manual, `CHANGELOG.md`
- [X] T032 Version 0.3.0 in `worker/pyproject.toml` and `worker/mix_worker/__init__.py`, `uv lock`, a line in `worker/RELEASE_NOTES.md`
- [X] T033 Run `cd worker && uv run python -m unittest discover -s tests` and `yarn typecheck && yarn lint && yarn test && yarn build` unpiped, exit codes checked
- [ ] T034 Owner validation (quickstart 1, 3–9): the LYL Radio set and the five reference sets, results compared with R8's table and the owner's playlist; record SC-001, SC-003 numbers in `docs/specs/` (a design page for round 003) — the owner's

## Dependencies & Execution Order

- Phase 1 → Phase 2 → US1 → US2 → US3 → Phase 6. US2 needs T004/T005 (gaps) but not US1's replay; US3 needs US2's clues.
- Within a story: tests first ([P] together), then code, then wiring, then the app.
- T029 (governance) must be committed before or with T027 (the first name lookup in code).

## Parallel Opportunities

- T002, T003 with T001. T005, T006 together after T004. T008, T009 together; T014, T015, T016 together; T023, T024 together.

## Implementation Strategy

1. Phases 1–2, then US1 (T008–T013): ship replays alone if the owner wants a quick 0.3.0.
2. US2 (T014–T022): clues readable on the phone.
3. US3 (T023–T028) with T029: candidates.
4. Phase 6, then the owner's validation (T034).
