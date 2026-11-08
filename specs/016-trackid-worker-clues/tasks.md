# Tasks: TrackId.net with the Shazam probes

**Input**: `specs/016-trackid-worker-clues/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md)
**Tests**: test-first. Worker: `cd worker && uv run python -m unittest discover -s tests`, every external call faked (a recorded real record as the fixture). App: Vitest, accepted and refused cases, no DOM tests. Numbering: round 016, ADR-17, F32, worker 0.7.0 (re-check `git ls-tree origin/main` before the first commit). Owner's rules to keep: **no probe at all inside a TrackId.net span**; a new origin `trackid`; a confirmed row starts at the span's start; exact link only, never a keyword search.

## Phase 1: Setup (decision first, docs lead)

- [ ] T001 Write `docs/architecture/700-adr/ADR-17-trackid-worker.md` (the worker asks TrackId.net by the exact mix link, skips probes inside a span, adds rows with a new origin `trackid`; options refused: confirm with one probe per span, fill only, keyword search, reuse the clue origin; release order app then worker; consequences and limits from `research.md` D1 to D7)
- [ ] T002 Amend `docs/architecture/700-adr/ADR-10-worker-name-lookup-for-clues.md` (the exact file name is under `docs/architecture/700-adr/`) with a short "Amended by ADR-17" note (a TrackId.net span is a candidate like a clue: not heard, unvalidated; the new origin is `trackid`), add the row to `docs/architecture/700-adr/README.md` and the page to `docs/README.md`
- [ ] T003 Edit `worker/CLAUDE.md` and `worker/AGENTS.md` (kept equal): the outbound host list gains `trackid.net` ("the exact mix link only, the list and the detail call, never the keyword endpoint"), and a line "TrackId.net never fails a request; no probe inside a guided span"; update the host sentence in `docs/architecture/000-how-it-works.md` §17 if it lists the hosts

## Phase 2: Foundational (the app first, then the worker's setting and client)

- [ ] T004 Write failing tests in `src/server/validate.test.ts` for the mix-row validator: accept `origin: 'trackid'` with a `trackid` object `{slug, spanStart, spanEnd, references?}`; accept `confirmedBy: 'trackid'` on a heard row; refuse an origin other than `replay`, `clue`, `trackid`; refuse `spanStart` above `spanEnd`, negative or non-finite seconds, seconds above 100000, a `slug` over 200 characters or not a string, a non-integer or negative `references`, a `trackid` object on a row without `origin: 'trackid'`, `confirmedBy` other than `'trackid'`; older rows unchanged (data-model.md fields, verbatim bounds)
- [ ] T005 Implement in `src/db/schema.ts` (`TracklistRow.origin` gains `'trackid'`, optional `confirmedBy?: 'trackid'`, optional `trackid?: {slug; spanStart; spanEnd; references?}`) and `src/server/validate.ts` (accept and bound them, line near 254), T004 green; no `DB_VERSION` bump
- [ ] T006 Failing tests then implement in `src/features/mix/worker.ts` (and its test) the mapping of the worker's rows: `origin: "trackid"` with `trackid: {slug, span_start, span_end, references}` to `origin: 'trackid'` plus `trackid`, `confirmed_by: "trackid"` to `confirmedBy`; a `trackid` row has no confidence and starts unvalidated like a clue; a result without the new fields maps as today; refused: a `trackid` object outside the bounds of T004
- [ ] T007 [P] Failing tests in `worker/tests/test_config.py` then implement `WORKER_TRACKID` in `worker/mix_worker/config.py` (`on` default, `off`, else `SettingsError("WORKER_TRACKID", "must be on or off")`), the line in `worker/.env.example` and `worker/mix_worker/env.example` (kept equal; the equality test stays green), a row in the `worker/README.md` settings table (US5)
- [ ] T008 [P] Save the fixture `worker/tests/fixtures/trackid_record.json`: a trimmed real detail record (fetch `https://trackid.net/api/public/audiostreams/temple-rat-yaga25-off-the-map`, keep `url`, `slug`, `title`, `duration` and the three `detectionProcesses` with at most 12 spans in all, including one reprocess span of a track already present, one span with an unparseable time added by the test, nothing else) plus `trackid_list.json` (the list answer with `rowCount 1`); no personal data

## Phase 3: User Story 3 - TrackId.net never costs a request (P1)

**Independent test**: a fake HTTP layer answers every failure case; each returns "unknown" with one log line and never raises.

- [ ] T009 [US3] Failing tests in `worker/tests/test_trackid.py` for `fetch_trackid(link, fetch, sleep, log)`: the recorded two-call flow returns a record with its spans; unknown cases (all return `None` and log one line): `rowCount 0`, `rowCount 2`, a record whose `url` differs from the link, an empty slug, a detail whose `slug` or `url` differs, a timeout, an HTTP error status, a malformed body, the keyword endpoint is never called (assert the requested URLs); the link is sent URL-encoded as the `url` query only; `User-Agent` set; 250 ms between the calls (injected sleep); `parse_spans` cases from `contracts/worker.md` (flatten processes, merge a same-`musicTrackId` span starting within 5 s, drop unparseable or reversed times, drop a span with no artist or title, sort, cap at 500)
- [ ] T010 [US3] Implement `worker/mix_worker/trackid.py`: `fetch_trackid`, `parse_spans`, the dataclasses (`Span`, `Record`), the constants of `data-model.md` (`TRACKID_EDGE_SECONDS` 10, `TRACKID_MIN_CORE_SECONDS` 40, `TRACKID_DURATION_TOLERANCE` 0.05, `TRACKID_SPAN_CAP` 500, `TRACKID_TIMEOUT_SECONDS` 10, `TRACKID_INTERVAL_SECONDS` 0.25), the duration parser for `"01:29:47.3790000"`, and `trusted(record, audio_duration)` (within 5 %; unknown audio duration is trusted); standard library only; T009 green
- [ ] T011 [US3] Extend the host test in `worker/tests/test_pipeline.py` (the "only the project's host" assertion) so the allowed hosts gain `trackid.net` and nothing else; a test that a pipeline run with a failing TrackId.net layer finishes the request exactly as one without it

## Phase 4: User Story 1 - A known mix is identified faster (P1) MVP

**Independent test**: a fake clock and fake Shazam over a 600-s mix with a TrackId.net record covering 60 to 420 s: no cut and no recognise call for a first-pass probe window inside the core (70 to 410 s), edge probes are ordinary, and with no record the probe list is identical to today's.

- [ ] T012 [US1] Failing tests in `worker/tests/test_scan.py`: (a) equivalence: `scan()` with no guides gives the same probe times, calls and rows as today (compare against a run with `guides=None`/empty); (b) guided: probe windows inside a core are skipped (no `cut`, no `recognise`, no sleep), they count as done in the progress and are neither misses nor hits, so `gaps_of` and the second pass never see them; (c) an edge probe naming the span's track marks that heard row `confirmed_by: "trackid"` with `time_in_mix` = the span's start; (d) a start-edge probe naming another track withdraws the span (its stretch is probed normally from then on); (e) an end-edge probe naming another track clips the span's row to where that track starts; (f) a span with a core below 40 s is not guided; (g) the run state key changes when the guided cores change (resume starts over); (h) refusal, pauses and the cooldown are unchanged
- [ ] T013 [US1] Implement in `worker/mix_worker/trackid.py` `plan_guides(spans, step)` (guided cores) and in `worker/mix_worker/scan.py` the `guides` parameter of `scan()` (default `None`, nothing changes) with the skip, the edge confirmation and withdrawal rules, the equality rule from `match.py` for "same track", and the `report` fields `guided` (`{spans, skipped_probes}`); T012 green
- [ ] T014 [US1] Extend `worker/mix_worker/runstate.py` so the run state key gains the record's slug and a hash of the guided cores (a changed record starts over, with the existing "starting over: why" line); add its tests to `worker/tests/test_runstate.py`; existing cases untouched

## Phase 5: User Story 2 - Stretches nobody heard are filled from TrackId.net (P1)

**Independent test**: a result whose guided spans appear as `trackid` rows and whose short spans fill a leftover gap, none duplicating a heard row.

- [ ] T015 [US2] Failing tests in `worker/tests/test_trackid.py` and `test_pipeline.py` for `trackid_rows(spans, guided, heard_rows, gaps)`: one row per standing guided span with `origin: "trackid"`, the span's artist and title, `time_in_mix` = the span's start, `trackid: {slug, span_start, span_end, references}`, `metadata.label` when given, no `confidence`, `hits` 0; a span confirmed by a heard row is not duplicated; a short span fills only a leftover gap, clipped to it; a row never starts before a heard row of another track ends (clipped); rows sorted with the heard rows by start time; the F15 pin in `test_scan.py` gains the three optional fields; the clue step receives the gap list minus the stretches the new rows cover
- [ ] T016 [US2] Implement `trackid_rows` in `worker/mix_worker/trackid.py` and wire `worker/mix_worker/pipeline.py`: (1) before the scan, if `settings.trackid` is on, `fetch_trackid` then `trusted`, log `trackid · <title> · <n> spans · <m> guided` or `trackid · not known` or the failure reason; (2) pass the plan to `deps.scan` as `guides` (a new optional hook; `scan_hooks` rules unchanged); (3) after the scan, build the rows and merge them with the heard rows; (4) then the clue step on the remaining gaps; a Stop during the two calls is checked before and after them; `worker/mix_worker/cli.py` builds the real `fetch` with `urllib` and the injected clock like the other calls; T015 green

## Phase 6: User Story 4 - The owner can see where each row came from (P2)

**Independent test**: the row text and badge rules on accepted and refused rows (pure functions, no DOM).

- [ ] T017 [US4] Failing tests in `src/ui/mix/rowText.test.ts`: `originText` gives "from TrackId.net · 10:16 to 14:17 · 31 references" for a `trackid` row (references omitted when absent, times as `M:SS` or `H:MM:SS` like the other rows), nothing new for a `clue` or `replay` row, and a confirmed heard row exposes the mark text "confirmed by TrackId.net"; a row without the new fields is unchanged
- [ ] T018 [US4] Implement in `src/ui/mix/rowText.ts` and `src/ui/mix/TracklistTable.tsx`: the "not heard" flag for `trackid` as for `clue` (the quote line stays for `clue` only), the origin text, the confirmed mark; tokens only, no new colour; update `docs/architecture/000-how-it-works.md` §10 and `specs/016-trackid-worker-clues/contracts/ui.md` only if the shown text differs

## Phase 7: Polish and docs

- [ ] T019 Bump the worker to 0.7.0: `worker/pyproject.toml`, `worker/mix_worker/__init__.py` (tested equal), `uv lock`, a `worker/RELEASE_NOTES.md` entry (TrackId.net, `WORKER_TRACKID`, no probe inside a span, release order: app first)
- [ ] T020 Docs: inventory row F32 in `docs/architecture/100-features.md` (state "built; the owner's run on a real mix (T024) pending"), how-it-works §10 (rows and origin) and §17 (the worker's TrackId.net step), `docs/architecture/800-limits-roadmap.md` (coverage is partial; timeline offset beyond 10 s is caught only at the edges; the keyword endpoint is not used; no per-run cache of records; an old app refuses the new rows), `CHANGELOG.md` entry dated 2026-11-08 (what changed, the release order, `WORKER_TRACKID`), `README.md` owner's manual line, root `CLAUDE.md` (external sources rule: the worker's TrackId.net exact-link lookup), `worker/README.md` (the step and its log lines)
- [ ] T021 Gates after the last edit, judged by exit code: `yarn typecheck`, `yarn lint`, `yarn test`, `cd worker && uv run python -m unittest discover -s tests`, `yarn invariants`; no `yarn shots`, no `yarn regression` unless the owner asks
- [ ] T022 Final whole-branch review on a mid-tier reviewer against `spec.md` and `contracts/worker.md`: the equivalence rule (no data, off, failure ⇒ today's scan), no probe inside a core, edge withdrawal and clipping, no keyword endpoint, no Spotify host, the validator bounds, nothing duplicated; one fix dispatch if needed
- [ ] T023 Commit, push `spec/trackid-worker`, open one PR (owner's OK first); merge when CI is green; the app deploys first by its own job, then the worker release builds: the owner hard-reloads the app before using worker 0.7.0
- [ ] T024 Owner-run: `specs/016-trackid-worker-clues/quickstart.md` checks 1 to 7 on the known and the unknown mix; record the output and the probe counts under "Recorded output"; pending

## Dependencies and order

- Phase 1 first (ADR before code). Phase 2: T004 before T005; T006 after T005; T007 and T008 in parallel with the app tasks (different folders).
- US3 (T009 to T011) needs T008 and T010 after T009. US1 (T012 to T014) needs T010. US2 (T015, T016) needs T013 and T010. US4 (T017, T018) needs T005 and can run right after Phase 2: build it **before** the worker work so the app can ship first.
- Polish after every story; T024 is the owner's.

## Implementation strategy

MVP is Phase 1, 2 and US3 + US1 + US2 (the worker side) with US4 (the app side), because the rows are only useful if the app accepts them. Build in batches with Sonnet subagents: batch A = T001 to T003 (docs), batch B = T004 to T006 + T017 to T018 (the app), batch C = T007 to T011 (worker setting, client, failure cases), batch D = T012 to T014 (guided scan), batch E = T015 to T016 (rows and wiring), batch F = T019 to T020 (version and docs); the controller runs T021 itself, then T022.

## Format validation

All tasks follow `- [ ] T### [P?] [US?] description with file path`. Parallel: T007 and T008 only. Story counts: US1 3, US2 2, US3 3, US4 2, US5 in T007; setup 3, foundational 5, polish 6.
