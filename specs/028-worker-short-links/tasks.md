# Tasks: The worker takes phone share links and trims SoundCloud links

**Input**: Design documents from `specs/028-worker-short-links/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/app.md, contracts/worker.md, contracts/url-cases.md

**Tests**: written first (the constitution's workflow). A test task comes before the task that makes it pass.

**Every commit**: `yarn typecheck && yarn lint && yarn test` and `cd worker && uv run python -m unittest discover -s tests`, each
judged by its exit code, never through a pipe; `type(scope): summary`; the documents of what the commit touches in the same commit.
No push without the owner's OK. No `yarn shots` unless the owner asks. Line numbers in the tasks are those of the code before the
round.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (another file, no dependency on an unfinished task)
- **[Story]**: the user story of spec.md the task serves

## Phase 1: Setup

- [x] T001 Install in this worktree (`yarn install --frozen-lockfile`; `cd worker && uv sync --frozen`) and run the four gates once on the untouched branch; they must exit 0 before any change
- [x] T002 Commit the round's documents as they are: `specs/028-worker-short-links/` (spec, plan, research, data-model, quickstart, contracts, checklist, tasks) as `docs(worker): spec 028, phone share links`

---

## Phase 2: Foundational (blocks every story)

**Purpose**: one trim rule in both languages, and the seam the worker's pipeline uses.

- [x] T003 Create `src/features/mix/url.cases.json` with the 26 cases of `specs/028-worker-short-links/contracts/url-cases.md` (`{"trim": [{"input", "expected"}]}`, made-up names, ASCII paths) and `src/features/mix/url.cases.test.ts` (as `match.cases.test.ts`) that runs every case through `normalizeMixUrl`; it passes at once (it pins today's rule)
- [x] T004 Failing test `worker/tests/test_links.py` (`TrimCases`): the same file (path from the repo root, as `worker/tests/test_match.py` does) through `links.trim_soundcloud`
- [x] T005 `worker/mix_worker/links.py`: `PAGE_HOSTS`, `SHORT_HOST`, `trim_soundcloud(url) -> str | None` per contracts/worker.md (surrounding spaces removed; `http` or `https`; host lower-cased and in `PAGE_HOSTS`; query and fragment dropped; exactly one trailing slash dropped; fewer than two path parts or an unparsable link gives `None`; answer `https://soundcloud.com<path>`); T004 green
- [x] T006 Failing tests in `worker/tests/test_pipeline.py` for `Deps.address`: a different working address reaches the fakes for download, TrackId.net, clues and the run state (`runstate.path_for` of the working address), `mix_info.source_url` is the working address, `finish` goes to the job id, one log line `  link · <working address>`; an equal address logs no `link ·` line; a `LinkFailure` gives `failed` with its `reason`, logs `  link · <detail>` and calls no download; without `address` the existing tests stay as they are
- [x] T007 `worker/mix_worker/links.py`: `LinkFailure(reason, detail)` (frozen dataclass); `worker/mix_worker/pipeline.py`: `Deps.address: Callable[[str], str | LinkFailure] | None = None` and `run_one` per contracts/worker.md (after the https check and `news.step("download")`; `work` replaces `url` in `deps.download`, `deps.trackid`, `runstate.load`, `runstate.Recorder`, `deps.clues`, `write_result(source_url=)`); T006 green

**Checkpoint**: both suites green; nothing the owner sees has changed yet.

---

## Phase 3: User Story 1 - Identify a set from the phone's share link (P1)

**Goal**: a share link is recorded as a request, the worker finds the real address and downloads it.

**Independent Test**: `requestKey` of a short link is the short link; `working_address` of a short link with a faked 302 is the trimmed real address.

- [x] T008 [P] [US1] Failing tests in `src/features/mix/url.test.ts`: `requestKey('https://on.soundcloud.com/abc123')` is that link (the expectation at `:322` changes from `null`); `http://On.SoundCloud.com/abc123?x=1#f` gives `https://on.soundcloud.com/abc123?x=1#f` and equals `classifyMixInput(...).url`; the bare host with or without `/` and a SoundCloud profile stay `null`; the permalink and other-host cases unchanged
- [x] T009 [US1] `src/features/mix/url.ts` `requestKey` per contracts/app.md (start from `classifyMixInput`; its doc comment says a short link is a request link the worker resolves); the comment at `src/features/mix/worker.ts:580` (the request key is the link of the request, not always the one downloaded); T008 green
- [x] T010 [US1] The two texts of contracts/app.md, word for word: `NOT_A_REQUEST_LINK` in `src/model/state.ts`, the share-link note in `src/ui/mix/MixDetail.tsx`
- [x] T011 [US1] App documents in the same commit: `docs/architecture/000-how-it-works.md` §10 (the short-link line and the `requestKey` line), an amendment note in `specs/002-mix-analysis-worker/contracts/client-api.md` (`requestKey`: a short link is a request link); gates; commit `feat(mix): a SoundCloud share link can be sent to the worker`. The owner's manual (`README.md`) says it with the worker commit (T025), when worker 0.7.4 makes it true
- [x] T012 [P] [US1] Failing tests in `worker/tests/test_links.py` (`ResolveShortLink`, `WorkingAddress`) with a fake `locate`: one 302 to a page address with the sharing parameters gives the trimmed address and one call; a `Location` on `www.` or `m.` is rewritten; a relative `Location` is joined; a chain short → short → page within 3 requests works; `working_address` of a short link is that answer; `locate` receives `LINK_TIMEOUT_SECONDS`
- [x] T013 [US1] `worker/mix_worker/links.py`: `MAX_REQUESTS`, `LINK_TIMEOUT_SECONDS`, the three reason texts, `resolve_short_link`, `working_address` (short-link branch; other links returned as they are for now); T012 green
- [x] T014 [US1] Failing tests in `worker/tests/test_cli.py` for `http_location(url, timeout)`: a 302 gives `(302, <Location>)` and no second request is made; a 404 gives `(404, None)`; a raising opener raises; the request carries `User-Agent: mix-worker/<version>`; `build_deps(settings).address` is set
- [x] T015 [US1] `worker/mix_worker/cli.py`: `http_location` (one GET, the no-redirect opener of `http_get`, the body not read) and `build_deps` wiring `address=lambda url: working_address(url, http_location)`; T014 green

**Checkpoint**: a short-link request is resolved and downloaded from its real address.

---

## Phase 4: User Story 2 - The worker works on the real, trimmed address (P1)

**Goal**: a SoundCloud link with parameters in a request is trimmed too, and one set has one saved run whatever link asked for it.

**Independent Test**: `working_address` of `…/user/some-mix?in_system_playlist=…` is `https://soundcloud.com/user/some-mix` without any call to `locate`.

- [x] T016 [US2] Failing tests in `worker/tests/test_links.py` (`WorkingAddress`): a page link with parameters, on `m.` or with a trailing slash gives the trimmed address; an already trimmed link gives itself; a profile gives itself; a link on another platform gives itself; `locate` is never called for any of them. In `worker/tests/test_pipeline.py`: a request for a short link and a request for the full link of the same set use the same run-state file
- [x] T017 [US2] `worker/mix_worker/links.py` `working_address`: the page-host branch (`trim_soundcloud(url) or url`); T016 green

---

## Phase 5: User Story 3 - A short link never sends the worker elsewhere (P1)

**Goal**: every answer that is not a SoundCloud set address fails the request with a reason; a shared worker accepts short links under the same rule.

**Independent Test**: the failure rows of contracts/worker.md, each with a faked answer, give the stated reason and no further call.

- [x] T018 [US3] Failing tests in `worker/tests/test_links.py` (`ResolveShortLinkFailures`), one per row of the table in contracts/worker.md: another host, `http:`, user info, a port, no `Location`, a 4th request refused (`too many redirects`), a profile, 400, 404, 410 (`NOT_FOUND`), 200 (`NOT_A_SET`), 401, 403, 429, 500 (`NO_ANSWER`), a raising `locate` (`NO_ANSWER`, detail the error's type name); each asserts the `reason`, the `detail`, and that no request left for a host other than `on.soundcloud.com`
- [x] T019 [US3] `worker/mix_worker/links.py`: the full mapping of contracts/worker.md in `resolve_short_link`; it never raises; T018 green
- [x] T020 [US3] Failing tests: `worker/tests/test_cli.py` `shared_link_allowed("https://on.soundcloud.com/x")` is true (the one edited expectation, `:665`), another host, `http:`, user info and a port stay false; `worker/tests/test_cli.py` (`SharedLinkRun`): a shared worker takes a short-link request and runs it, a request for another host is finished failed with `SHARED_LINK_REASON`
- [x] T021 [US3] `worker/mix_worker/cli.py`: `SHARED_HOSTS = links.PAGE_HOSTS + (links.SHORT_HOST,)`; T020 green

---

## Phase 6: User Story 4 - Nothing else changes (P1)

**Goal**: pinned, not built: these tests are expected green; a red one is a defect of an earlier task, fixed there.

- [x] T022 [US4] Pins in `worker/tests/test_pipeline.py` and `worker/tests/test_run_queue.py`: with the real `working_address` and a `locate` that fails the test if called, a request for an already trimmed SoundCloud link and one for a YouTube link make the same calls as without `address` and log no `link ·` line; after a rate-limited stop of a short-link request the automatic Ask again is planned and inserted with the request's own link; the `claimed` log line shows the request's link

---

## Phase 7: Polish and documents

- [x] T023 Version 0.7.4: `worker/pyproject.toml`, `worker/mix_worker/__init__.py` (tested equal), `cd worker && uv lock`; a 0.7.4 entry in `worker/RELEASE_NOTES.md`
- [x] T024 [P] Worker documents: `worker/CLAUDE.md` (hosts: `on.soundcloud.com`; the working address rule; at most 80 lines), `worker/README.md` (share links from the phone, the three reasons under troubleshooting, the host list), an amendment note in `specs/002-mix-analysis-worker/contracts/worker.md` (the address step, the new seam, the host list), `docs/architecture/000-how-it-works.md` §17 (a round 028 bullet; the shared-mode sentence), `docs/architecture/700-adr/ADR-16-shared-worker.md` (an amendment, round 028) and its row in `docs/architecture/700-adr/README.md`
- [x] T025 [P] Round documents: `docs/architecture/100-features.md` (row F43; `on.soundcloud.com` in the "what leaves the device" table), `docs/architecture/800-limits-roadmap.md` §2 (the shared-mode host line; new limits: one set under two links is two saved mixes, a worker before 0.7.4, paths outside ASCII), `CHANGELOG.md`, `docs/README.md` (the specs list), `specs/028-worker-short-links/spec.md` status
- [x] T026 Gates, then commit `feat(worker): follow a share link and trim SoundCloud addresses, version 0.7.4` (worker code, tests, lock, T023–T025)
- [x] T027 Final sweep: a file-to-doc map of `git diff origin/main --stat` (each changed file and the document that describes it); the four gates; `yarn regression`; `yarn invariants`; the public-safe check of `docs/dev-guide/000-contributing.md` ("Keep it public-safe"). Done 2026-11-13: regression 83 passed; invariants pass once the renamed test is in `RENAMED_TESTS` (`tools/shots/invariants.ts`); the three public-safe commands print nothing; `src/features/mix/CLAUDE.md` gained a bullet on the shared rule
- [x] T028 Review by a separate reviewer of the whole branch against spec.md, contracts/ and the documents (a document claim the code does not keep is a finding); one fix commit if needed, gates again. Done 2026-11-13, two passes (the code tried with about 30 hostile `Location` values, then every document and every new test read): spec PASS, quality PASS, nothing Critical or Important. Minor points taken: four resolver cases added (a `Location` without scheme both ways, user info or a port on the short host, an answer of the wrong shape), the saved-run test counts its two `link ·` lines, two encoded paths join the shared cases (28), the notes say their line numbers are the baseline's, the plan's document table and commit list match what was done. Left as they are: a relative `Location` on the short host is asked again and can end as "too many redirects" (safe, the host never changes); FR-002 to FR-005 have no test of their own (no DOM tests here; they follow from `requestKey`, and the two texts were read against the contract)
- [x] T029 Ask the owner's OK to push and merge; the owner's run of `specs/028-worker-short-links/quickstart.md` checks 1 to 9 stays pending until then. OK given on 2026-11-13 ("commit and push to main"); pushed to `main` as a fast-forward
- [ ] T030 Owner-run: `specs/028-worker-short-links/quickstart.md` checks 1 to 9 with worker 0.7.4, the output recorded under "Recorded output"; pending

---

## Dependencies

- T001 → T002 → Phase 2 → Phases 3, 4, 5 → Phase 6 → Phase 7.
- T003 before T004 (the file both read). T005 before T007 (`links.py` exists). T007 before T013–T022 (the seam).
- US1's app half (T008–T011) depends on nothing in the worker and is committed on its own.
- US2 (T016–T017) and US3 (T018–T021) both edit `links.py` after T013: one after the other, in either order.
- T022 after T015, T017, T021. T023–T025 after T022. T026 → T027 → T028 → T029.

## Parallel opportunities

- T008 (app tests) with T012 (worker tests): different suites.
- T024 with T025: different documents.
- Everything else touches `links.py`, `pipeline.py` or `cli.py` in sequence.

## Implementation strategy

- **MVP**: Phases 1 to 3. After T015 a share link from the phone is identified from its real address.
- Then US2 (the trim of a full link with parameters and the shared saved run), US3 (the failure reasons and shared mode), US4 (pins).
- The worker is released only by the merge (the version changes in T023), so the phases are steps of one release, not separate deliveries.
