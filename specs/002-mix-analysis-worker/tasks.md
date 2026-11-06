# Tasks: A worker on the owner's computer that identifies a mix's tracks from a link

**Input**: Design documents from `/specs/002-mix-analysis-worker/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md),
[contracts/server-schema.md](contracts/server-schema.md), [contracts/client-api.md](contracts/client-api.md),
[contracts/worker.md](contracts/worker.md), [quickstart.md](quickstart.md)

**Tests**: included, test-first (constitution "Development workflow"; quickstart §4). App tests next to source as
`src/**/*.test.ts` (Vitest, no DOM). Worker tests in `worker/tests/test_*.py` with the standard library's `unittest`, every
network, subprocess and library call injected and faked; no test touches the network, Shazam or a real download. Every test
task is written and seen failing before its implementation task.

**Organization**: by user story. Setup and Foundational carry what every story needs (the migration, the worker's settings,
session and server client, the app's schema additions). After every task group: `yarn typecheck && yarn lint && yarn test`
and `uv run --directory worker python -m unittest discover -s tests` (both unpiped, exit code checked), then one commit
`type(scope): summary`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1 (link → reviewed tracklist), US2 (states and failures visible, ask again), US3 (one command, packaged)

## Path Conventions

Vite app at the root (`src/`), SQL under `supabase/migrations/`, docs under `docs/`; the worker is a sibling `uv` project under
`worker/` (`worker/mix_worker/` package, `worker/tests/`), outside `tsconfig`, ESLint and Vitest. Relative TS imports carry no
extension.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: the SQL, the worker project skeleton, CI, ignore rules, the local rules. Nothing behavioural yet.

- [X] T001 Write `supabase/migrations/0002_jobs.sql` exactly as `contracts/server-schema.md` "0002_jobs.sql": `alter table public.jobs add column applied_at timestamptz`; index `jobs_owner_status_created on public.jobs (owner_id, status, created_at)`; function `claim_job(p_worker text, p_stale_seconds integer) returns setof public.jobs language sql security invoker set search_path = ''` doing the one `update … where id = (select id … where owner_id = auth.uid() and kind = 'identify-mix' and (status = 'queued' or (status = 'claimed' and claimed_at < now() - make_interval(secs => p_stale_seconds))) order by created_at limit 1 for update skip locked) returning j.*`; last line `grant execute on function public.claim_job(text, integer) to authenticated`; add the row to `specs/001-backend-data-sync/contracts/server-schema.md`'s table list ("a new table or column: … the grants block stays last", `src/server/CLAUDE.md`)
- [X] T002 [P] Create the worker project: `worker/pyproject.toml` (`[project] name = "mix-worker"`, `version = "0.1.0"`, `requires-python = ">=3.11,<3.14"`, `dependencies = ["yt-dlp>=2025.4.30", "shazamio==0.9.0", "imageio-ffmpeg>=0.6"]`, `[project.scripts] mix-worker = "mix_worker.cli:main"`, `[dependency-groups] build = ["pyinstaller>=6.11"]`, `[build-system]` hatchling or setuptools with `packages = ["mix_worker"]`), `worker/mix_worker/__init__.py` with `__version__ = "0.1.0"`, an empty `worker/tests/__init__.py`; run `uv sync --directory worker` and commit `worker/uv.lock`; record the resolved `imageio-ffmpeg` version and the licence of the ffmpeg binary it ships (read its wheel's `LICENSE*`/README and `imageio_ffmpeg.get_ffmpeg_version()`) in `research.md` D9 "To confirm" (research D9)
- [X] T003 [P] Add `worker/.env`, `worker/.venv/`, `worker/build/`, `worker/dist/`, `.tracklistify/` to `.gitignore`; add `worker/` to `globalIgnores` in `eslint.config.js` and to `.prettierignore` (create it with `worker/` if absent) so `yarn lint`/`yarn format` never read Python
- [X] T004 [P] Extend `.github/workflows/ci.yml` job `check`: after the three yarn steps add `actions/setup-python@v6` (`python-version: '3.13'`), `astral-sh/setup-uv@v6`, `uv sync --directory worker --frozen`, `uv run --directory worker python -m unittest discover -s tests -v` (research D9)
- [X] T005 [P] Write `worker/.env.example` listing every setting of `contracts/worker.md` "Settings" with its default and a one-line comment, `SUPABASE_URL=` and `SUPABASE_KEY=` empty first; this same file is the template the packaged form writes (FR-021 scenario 6)
- [X] T006 [P] Write `worker/CLAUDE.md` (≤ 80 lines: Required inputs — ADR-08, this round's `contracts/worker.md`, `research.md` D2–D7, `src/features/mix/tracklistify.ts` as the shape the JSON must satisfy; Expected outputs — stdlib only besides the three libraries, every external call injected, never a Spotify host, one probe at a time with the cooldown, the F15 JSON shape pinned by `test_scan.py`, exit codes of the contract) and the relative symlink `worker/AGENTS.md -> CLAUDE.md`; add the routing row `worker/`, the job queue → `worker/CLAUDE.md`, ADR-08, how-it-works §17 to the root `CLAUDE.md` table (root stays ≤ 150 lines)
- [X] T007 [P] Reword the last rule of `src/features/mix/CLAUDE.md` (currently uncommitted: "Never fetch or analyse mix audio." was removed) to "The app never fetches or analyses mix audio; the worker on the owner's computer does (ADR-08, spec 002)", restore the final newline, and add `../../../specs/002-mix-analysis-worker/contracts/client-api.md` to its Required inputs table

**Checkpoint**: `yarn typecheck && yarn lint && yarn test` green; `uv run --directory worker python -m unittest discover -s tests` reports 0 tests, exit 0; the migration applies on the owner's project (quickstart §1.2, owner).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: what every story needs: the app's schema and validation additions, the request key, and the worker's settings,
session and server client.

- [X] T008 Add to `src/db/schema.ts`: optional `MixRow.identifyJobId?: string`, `MixRow.identifiedAt?: number`, `MixRow['sources'].worker?: boolean`; `MIX_JOBS_META = 'mixJobs'`; `interface MixJobView { id: string; status: 'queued' | 'claimed' | 'done' | 'failed'; createdAt: number; claimedBy: string | null; claimedAt: number | null; finishedAt: number | null; error: string | null; appliedAt: number | null; rejected?: true }`; `type MixJobs = Record<string, MixJobView[]>` (data-model.md "Local")
- [X] T009 [P] Test in `src/db/repo.test.ts`: a `MixRow` with `identifyJobId`, `identifiedAt`, `sources.worker` round-trips through `putMix`/`getMixes`; a `MIX_JOBS_META` value round-trips through `putMeta`/`getMeta` and is removed by `deleteMeta` (no `DB_VERSION` bump: assert `DB_VERSION === 4`)
- [X] T010 [P] Test in `src/server/validate.test.ts` for `validateJobRow`: accepts a full row and a row with nulls; rejects a non-uuid `id`, a fifth `status`, a `claimed_by` over 200 characters, an `error` over 200 characters, an unparsable `created_at`, a `payload` without an https `url`, a non-object (data-model.md "Validation on the app side")
- [X] T011 Implement `validateJobRow(value: unknown): MixJobRow | null` in `src/server/validate.ts` (`MixJobRow` = the server row shape with `payload: { url: string }`, timestamps as ISO strings) per T010 (security review S3)
- [X] T012 [P] Test in `src/features/mix/url.test.ts` for `requestKey`: a SoundCloud permalink → `normalizeMixUrl`'s output; `on.soundcloud.com/x` → `null`; `https://www.youtube.com/watch?v=abc&si=xyz&feature=share#t=10` → `https://www.youtube.com/watch?v=abc`; `https://Mixcloud.com/a/b/?utm_source=x` → `https://mixcloud.com/a/b/`; `http://…` → `null`; free text → `null` (contracts/client-api.md)
- [X] T013 Implement `requestKey(input: string): string | null` in `src/features/mix/url.ts` per T012; export it beside `normalizeMixUrl`
- [X] T014 [P] Test in `worker/tests/test_config.py`: `load_settings(None, env={...})` defaults for every setting of `contracts/worker.md`; a `.env` file with comments, quotes and blank lines; environment overriding the file; `SUPABASE_URL` not https, empty key, a negative or non-numeric number, each → `SettingsError` naming the setting; `WORKER_NAME` defaults to `socket.gethostname()` (injected); `write_template(path)` writes `.env.example`'s content; `session_file_default()` resolves `~/.config/myownspotifydata-worker/session.json` on Linux/macOS and `%APPDATA%\myownspotifydata-worker\session.json` on Windows, or `session.json` beside the executable when that file exists (`sys.frozen` injected)
- [X] T015 Implement `worker/mix_worker/config.py` (`Settings` dataclass, `load_settings`, `write_template`, `SettingsError`, the default-path helpers for the session file, work dir, JSON dir, log file per OS) per T014, stdlib only
- [X] T016 [P] Test in `worker/tests/test_server.py` with a fake `opener` recording requests and returning canned responses: `send_otp` posts `{email, create_user: false}` to `/auth/v1/otp` with `apikey`; `verify` posts `{type: "email", email, token}` to `/auth/v1/verify` and returns the session triple; `refresh` posts to `/auth/v1/token?grant_type=refresh_token`; `claim` posts `{p_worker, p_stale_seconds}` to `/rest/v1/rpc/claim_job` with `Authorization: Bearer` and returns `None` on `[]` and the row on `[row]`; `finish` PATCHes `/rest/v1/jobs?id=eq.<id>&status=eq.claimed&claimed_by=eq.<name>` with `Prefer: return=representation` and reports `taken` when the answer is `[]`; `release` PATCHes `{status: "queued", claimed_by: null, claimed_at: null}`; `logout` posts to `/auth/v1/logout`; mapping: `URLError` → `offline`, 503 → `offline`, a 5xx whose body contains "paused" → `paused`, 401 → `unauthorized`, 413 → `too_large`, 429 with `Retry-After: 2` → one wait (injected `sleep`) then retry then `offline`; no method raises; no request ever goes to a host other than the base URL (contracts/server-schema.md "The requests", "Error mapping")
- [X] T017 Implement `worker/mix_worker/server.py` (`ServerClient`, `Result`, `ResultKind`) per T016 with `urllib.request`, JSON bodies, a 30 s timeout, never raising
- [X] T018 [P] Test in `worker/tests/test_session.py`: `save` writes JSON with mode 0600 (POSIX only, skip on Windows) and `load` reads it back; `load` of a missing or corrupt file → `None`; `ensure_fresh` returns the session untouched when more than 60 s remain, refreshes through a fake client and saves when under 60 s, and returns `None` (file removed) when the refresh answers `unauthorized`
- [X] T019 Implement `worker/mix_worker/session.py` (`Session` dataclass with `email`, `access_token`, `refresh_token`, `expires_at`; `load`, `save`, `ensure_fresh`, `clear`) per T018 (research D8)

**Checkpoint**: both suites green; nothing user-visible changed yet.

---

## Phase 3: User Story 1 — From a link to a reviewed tracklist, without touching my computer (Priority: P1) 🎯 MVP

**Goal**: tap on the phone → request on the server → the worker downloads, scans, sends → the next sync shows the rows →
Create playlist from mix works unchanged.

**Independent Test**: quickstart §3 scenarios 1–4 and 16.

### Tests for User Story 1 (write first, see them fail)

- [X] T020 [P] [US1] Test in `src/features/mix/worker.test.ts` for `resultToRows`: the F15 fixture of `tracklistify.test.ts` (import the fixture builder or copy its object) → `ok` with 3 rows, `source 'tracklistify'`, `isrc` set on the first, `shazamUrl` only on https shazam.com links, the synthetic `tracklistify:` url discarded, `title` with `⧸` restored to `/`; a result whose tracks carry no `metadata` → `ok` with `isrc`/`label`/`shazamUrl` null; a result with zero usable tracks → `ok: false`; a non-object → `ok: false`; a row with a `javascript:` shazam link → link dropped, row kept (contracts/client-api.md)
- [X] T021 [P] [US1] Test in `src/features/mix/worker.test.ts` for `mergeWorkerRows`: an untouched scan row (`source 'tracklistify'`, artist/title equal to `detected`) is replaced by the incoming rows; an edited scan row (artist differs from `detected`) is kept; a `manual`, a `pasted` and a `trackid` row are kept; the output is ordered by `startSec` with nulls last and stable among equals; empty existing → incoming as is (FR-006)
- [X] T022 [P] [US1] Test in `src/server/sync.test.ts` (extend the in-memory fake server with a `jobs` table and `claim_job`): `requestIdentify` returns `'exists'` when a queued or claimed row for the url exists, otherwise inserts `{kind: 'identify-mix', payload: {url}}` and returns its view; `runPull` after a `done` row with a valid `result`: the mix for `payload.url` exists locally with the merged rows, `identifyJobId`, `identifiedAt`, `sources.worker`, the server row got `applied_at`, `serverPending.mixes` is set, `MIX_JOBS_META[url][0].status === 'done'`; a second repo (another device) pulling the same server skips the apply (row already has `applied_at`) and still gets the mix through the mixes sync after the first pushes; a `done` row whose result fails `resultToRows` → `rejected` +1, no `applied_at`, the view marked `rejected`; the history is newest first and capped at 20; no request goes to a Spotify host (contracts/client-api.md "sync.ts")
- [X] T023 [P] [US1] Test in `worker/tests/test_download.py`: `download(url, dest, settings, ydl_factory=Fake)` passes `noplaylist True`, a `match_filter`, `format 'bestaudio/best'`, `outtmpl` under `dest`, `max_filesize`, `socket_timeout 30`, `retries 3`, `cookiefile` only when set, `ffmpeg_location` = the ffmpeg path; returns `Downloaded(path, title, uploader, duration)` from the fake's info (`requested_downloads[0]['filepath']`, `title`, `uploader` then `channel` then `artist`, `duration`); `reason_for` maps "Private video" / "Video unavailable" / "This video is private" → "Private or removed link", "Unsupported URL" → "Unsupported or unreachable link", the live-filter message → "Live streams are not supported", a `max_filesize` message → "Download refused (file too large)", a playlist with no entry → "Playlist links are not supported; paste one set", anything else → "Download failed: <first line>" (research D7)
- [X] T024 [P] [US1] Test in `worker/tests/test_scan.py`: `probe_times(7260, 60)` → `[0, 60, …, 7200]`, `probe_times(0, 60)` → `[0]` (unknown duration: probe until the cutter returns under 1000 bytes); `confidence_of({"frequencyskew": 0.001, "timeskew": 0.0005})` ≈ `0.6*99 + 0.4*99.5`, skews ≥ 0.1 → 0, missing skews → 0; `track_entry(cassette_response)` → exactly `{song_name, artist, time_in_mix, confidence, duration: None, metadata: {isrc, label, album, release_date, genres, shazam_id, artwork_url, links: {shazam}}}` with `time_in_mix` passed in as `"00:01:00"`, and omits `isrc`/`label`/`links` when absent, drops a non-https shazam url; `track_entry` of `{"matches": []}` → `None`; `merge` on hit sequences keyed by `shazam_id` with times: `A@0 A@60 B@120 B@180 A@240` → three rows at 0, 120, 240; `A@0 (none@60) A@120` with gap 180 → one row; `A@0 A@300` with gap 180 → two rows; the row's `confidence` is the best of its hits; `scan(...)` with fake `cut`/`recognise`/`sleep`: calls `sleep(cooldown)` before every `recognise`, passes `max_skew`, skips a `SignatureError` probe, on the first `RateLimited` sleeps `rate_limit_pause` and retries the same probe, on the second raises `ScanRefused`; stops when `cut` returns fewer than 1000 bytes; the JSON written by `write_result(...)` parses under the keys the app's parser requires (`mix_info.title`, `mix_info.audio_filename`, `tracks[*].song_name/artist`) (research D4–D6)
- [X] T025 [P] [US1] Test in `worker/tests/test_pipeline.py`: `run_one` with fakes for the client, downloader, cutter, recogniser, clock and sleep: on success the JSON file exists in the JSON dir named `<YYYY-MM-DD> <title> [<id8>].json`, the request folder is gone, `finish` received `{status: "done", finished_at, result}` whose `result` equals the file's content and whose `mix_info` has `title`, `artist`, `audio_filename`, `source_url`, `duration_seconds`, `date`, `track_count`; a download failure → `finish` with `{status: "failed", error: <reason>}` and the folder gone; zero rows → `"No track identified"`; a result over `WORKER_RESULT_MAX_BYTES` or a `too_large` answer → `"Result too large"`; a `payload` without an https url → `"Request has no valid link"`; `duration > WORKER_MAX_DURATION_SECONDS` → `"Set longer than 4 hours"`; an unexpected exception → `"Worker error: <type>"` and the loop continues; `finish` answering `taken` → logged, nothing raised; the fake client saw only the project's host (SC-005)
- [X] T026 [P] [US1] Covered in `sync.test.ts` (the apply sets `serverPending.mixes`, which `queueServerPush` carries); `startServerPull`'s tail reloads `mixJobs` through `loadSavedMixes()` (wrapper, checked by hand, Limits §2)

### Implementation for User Story 1

- [X] T027 [US1] Implement `src/features/mix/worker.ts`: `resultToRows` (reuse `parseTracklistifyJson`; then `validateRow`-style checks per row: finite `startSec`, strings, `https:` shazam link on `shazam.com`), `mergeWorkerRows`, `jobView(row)` (via `validateJobRow`, ISO → epoch ms), and the `MixJobView` helpers per T020–T021
- [X] T028 [US1] Add to `src/server/sync.ts`: `requestIdentify(deps, token, url)` and `pullJobs(deps, token)` called from `runPull` after the mixes branch (pages of 1000 with `Range`, `select` without `result`, `order=created_at.desc`; per `done`/unapplied row oldest first: `select=result`, `resultToRows`, `getMixes` → the local row or a new one, `mergeWorkerRows`, `putMix` with `identifyJobId`/`identifiedAt`/`sources.worker`, `PATCH … &applied_at=is.null` with `return=representation`, `serverPending.mixes`); `MIX_JOBS_META` written per url (newest first, 20 max, `rejected` kept local); add `MIX_JOBS_META` to `SERVER_METAS` so `runRemoveAll` clears it; `rejected` counted per T022
- [X] T029 [US1] Add to `src/model/state.ts`: `mixJobs` signal, loaded in `loadSavedMixes()` from `MIX_JOBS_META`; `startIdentifyRequest(url)`: `requestKey` (null → `mixError` "That is not a link the worker can take"), server state gate (unset/signedOut/offline/paused → `mixError` with the Settings wording), `getAccessToken`, `requestIdentify`, `'exists'` → `mixError` "Already requested", else prepend the view to `mixJobs[url]` and `putMeta`; not in `jobsBusy()`; `startServerSignOut` and `removeServerData` delete `MIX_JOBS_META` and reset `mixJobs` (contracts/client-api.md "state.ts")
- [X] T030 [US1] Add to `src/ui/Mix.tsx`: the "Identify on my computer" button under the link box (disabled while `mixState` is `looking` or `canAsk` is false; label from `requestStatusText`, T034), the latest request's state line for the current link/view url, `mixError` rendered inline as today; change `isTracklistifyView` to `!view.url.startsWith('https://')`; the provenance line "From your computer · <n> tracks · <date>" when `view.sources.worker`; keep every row control unchanged
- [X] T031 [US1] Implement `worker/mix_worker/download.py` (`download`, `Downloaded`, `DownloadFailure`, `reason_for`) per T023, importing `yt_dlp` lazily inside `download` so tests never import it; `ffmpeg_location` from `settings.ffmpeg`
- [X] T032 [US1] Implement `worker/mix_worker/scan.py` (`probe_times`, `cut_probe` running `[ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-ss", str(t), "-t", "12", "-i", file, "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", "pipe:1"]` via `subprocess.run(capture_output=True)`, `confidence_of`, `track_entry`, `merge`, `scan` (async, `shazamio.Shazam(http_client=HTTPClient(retry_options=ExponentialRetry(attempts=5, max_timeout=60)))` built lazily, `recognize(bytes, proxy=settings.proxy, max_skew=settings.max_skew or None)`), `write_result`, `ScanRefused`) per T024; `ffmpeg` resolved from `settings.ffmpeg` or `imageio_ffmpeg.get_ffmpeg_exe()` (research D2–D6, D9)
- [X] T033 [US1] Implement `worker/mix_worker/pipeline.py` (`run_one(job, settings, deps, log) -> Outcome`, `run_loop(settings, deps, log, once: bool)`) and `worker/mix_worker/log.py` (one line per step `step · outcome · <n> s` to stdout and the log file; the traceback to the file only) per T025; `cli.py` minimal `run --once` wiring (the full CLI is US3)
- [X] T034 [US1] Implement `requestStatusText(view, server)` in `src/features/mix/worker.ts` with its test in `worker.test.ts`: unset → "Server not set up (Settings)", signedOut → "Sign in to the server (Settings)", offline → "Server unreachable", paused → "Server paused — resume it from the dashboard", connected + no view → "Identify on my computer" (canAsk), queued → "Waiting for your computer since <time>" (no), claimed → "Running on <name> since <time>" (no), done → "Done <time>" (canAsk, label "Ask again"), failed → "Failed <time>: <error>" (canAsk, "Ask again"), rejected → "Result rejected — ask again" (canAsk)

**Checkpoint**: quickstart scenarios 1–4 and 16 pass on the owner's project and this computer; both suites green; commit.

---

## Phase 4: User Story 2 — I see what happened to each request, including failures (Priority: P2)

**Goal**: every request's state and reason on the phone; ask again; stale reclaim; a clean stop; the server states' wording.

**Independent Test**: quickstart §3 scenarios 5–11, 13–15, 18.

### Tests for User Story 2

- [X] T035 [P] [US2] Test in `src/server/sync.test.ts`: `pullJobs` writes a `failed` row's `error` into the view and a `claimed` row's `claimed_by`/`claimed_at`; a row with `error` over 200 characters is rejected (counted), not truncated; after "Ask again" (`requestIdentify` on a url whose latest row is `failed`) the new row is first and the failed one still listed; `runRemoveAll` deletes `jobs` rows and `MIX_JOBS_META`
- [X] T036 [P] [US2] Test in `worker/tests/test_server.py` (extend): `claim` passes `p_stale_seconds` from settings; `finish` with `status failed` sends `error` and no `result`; `release` is sent on `KeyboardInterrupt` by `run_loop` (fake client records it) and the loop exits 130 (contracts/worker.md)
- [X] T037 [P] [US2] Test in `worker/tests/test_pipeline.py` (extend): `run_loop(once=True)` processes two rows in claim order and stops at `[]`; a `paused` claim answer → exit 3 and no further claim; `offline` → exit 2; `unauthorized` after one refresh → exit 4; a request failing does not stop the loop; the second request is still processed after the first raised

### Implementation for User Story 2

- [X] T038 [US2] Extend `pullJobs`/`jobView` and the Mix screen per T035: the collapsed "Earlier requests (n)" list under the state line, "Ask again" calling `startIdentifyRequest` for done/failed/rejected, "Already requested" inline; sign-out and removal already clear the meta (T029)
- [X] T039 [US2] Finish `run_loop` in `worker/mix_worker/pipeline.py` per T036–T037: `SIGINT`/`KeyboardInterrupt` → `release` (3 s timeout) then exit 130; the exit codes 2/3/4 on the claim's `Result`; `--watch` sleeping `poll_seconds` between empty claims; the log line "request taken by <name>" on a `taken` finish
- [ ] T040 [US2] Apply migration `0002` on the owner's project (owner; quickstart §1.2) and run scenarios 5–11, 13–15 and 18; fix what they find; commit

**Checkpoint**: every failure reaches the phone with a reason; an interrupted request is retaken; both suites green.

---

## Phase 5: User Story 3 — The worker is one command I understand, packaged too (Priority: P3)

**Goal**: `check`, `login`, `logout`, `run --once|--watch`, `--version`, `--config`; the no-command path; the template; the
manual; the three executables built by CI on a tag.

**Independent Test**: quickstart §3 scenarios 2, 11, 12, 17 and §1.3–1.4.

### Tests for User Story 3

- [X] T041 [P] [US3] Test in `worker/tests/test_cli.py`: `main(["--version"])` prints `mix-worker 0.1.0` and returns 0; `main(["check"])` with fake settings prints the masked key (`sb_publishable_…` → first 8 characters + `…`), the ffmpeg path and version (fake runner), "JavaScript runtime: node found" / "none (YouTube links need Node or Deno)", "session: none" / "signed in as <email>", returns 0, and returns 5 with the setting's name when `load_settings` raises; `main(["login"])` reads the email and the code from injected `input`, calls `send_otp` then `verify`, saves the session, prints "signed in as <email>", returns 4 on a refused code; `main(["logout"])` calls `logout` and clears the file; `main([])` with no session runs `login` then `run --watch`; `main([])` with no config file beside a frozen executable writes the template and returns 6 printing its path; `--config PATH` is honoured by every command
- [X] T042 [P] [US3] Test in `worker/tests/test_config.py` (extend): `write_template` output equals `worker/.env.example` byte for byte (read the file relative to the package so the packaged form carries it as data)

### Implementation for User Story 3

- [X] T043 [US3] Implement the full `worker/mix_worker/cli.py` (argparse with subcommands `check`, `login`, `logout`, `run` with `--once`/`--watch`/`--interval`, global `--config` and `--version`; `main(argv=None, deps=None) -> int`) and `worker/mix_worker/__main__.py` (the no-command path; `sys.frozen` detection for the executable's folder) per T041–T042; `.env.example` shipped inside the package as `mix_worker/env.example` (copied in T042's test to assert equality with `worker/.env.example`)
- [ ] T044 [P] [US3] Write `worker/mix-worker.spec` (PyInstaller: one-file, console, `name='mix-worker'`, entry `mix_worker/__main__.py`, `collect_all('yt_dlp')`, `collect_all('shazamio_core')`, `collect_all('imageio_ffmpeg')`, `collect_data_files('mix_worker')` for `env.example`); verify on this computer: `uv sync --directory worker --group build && uv run --directory worker pyinstaller mix-worker.spec && ./worker/dist/mix-worker --version && ./worker/dist/mix-worker check` (the packed ffmpeg must print its version from inside the bundle); record the size in `research.md` D9 "To confirm" (research D9)
- [ ] T045 [P] [US3] Write `.github/workflows/worker-release.yml`: `on: push: tags: ['worker-v*']`; job `build` matrix `{os: windows-latest, asset: mix-worker-windows-x64.exe}`, `{os: ubuntu-22.04, asset: mix-worker-linux-x86_64}`, `{os: macos-latest, asset: mix-worker-macos-arm64}`, `{os: macos-15-intel, asset: mix-worker-macos-x86_64}` (drop the Intel entry if that runner label is not offered; note it in the manual); steps: checkout, `setup-python@v6` 3.13, `setup-uv@v6`, `uv sync --directory worker --frozen --group build`, the unittest step, `uv run --directory worker pyinstaller mix-worker.spec`, the `--version` and `check` smoke tests (with a throwaway `--config` file holding dummy https values), rename to the asset name, `actions/upload-artifact@v4`; job `release` (`needs: build`, `permissions: contents: write`): `download-artifact`, `gh release create "$GITHUB_REF_NAME" mix-worker-* --generate-notes` (`GH_TOKEN: ${{ github.token }}`) (research D9)
- [ ] T046 [US3] Write `worker/README.md`, the owner's manual: what it does, the two forms, install (`uv sync`), `login`, `check`, `run --once`/`--watch`, the packaged form per system (first start writes the config; the unsigned-program steps on Windows and macOS; `chmod +x` on Linux), every setting with its default (the table of `contracts/worker.md`), YouTube needs Node or Deno, the outbound hosts, the exit codes, "where my files go", the licence notice for the packed ffmpeg (T002's finding), troubleshooting (paused project, expired session, rate limited)
- [ ] T047 [US3] Tag `worker-v0.1.0` on `main` after the merge (owner's OK to push), watch the release job, download the Linux asset here and run scenario 17's steps on it; the owner runs the Windows and macOS assets (quickstart scenario 17); record each executable's size and the ffmpeg licence line in the spec page (Phase 6)

**Checkpoint**: `uv run mix-worker check|login|run` and the executables behave the same; both suites green.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: the round's documents, the standing decisions, the dead link, the measurements.

- [ ] T048 [P] Write `docs/specs/2026-11-06-mix-analysis-worker-design.md` (status, the decisions and their dates — ShazamIO instead of Tracklistify, email code, three executables with ffmpeg inside, any link, audio deleted — the out-of-scope list, compatibility with F15, the measurements of quickstart §3 scenario 2 and T047: download time, probes, scan time, result size, executable sizes); link it from `docs/README.md`
- [ ] T049 [P] Write `docs/architecture/700-adr/ADR-09-mix-identification-on-the-owners-computer.md`: context (betmoar's tool gone; audio recognition is by audio, not by id), decision (recognition by audio happens only in the worker on the owner's computer with a keyless service, one call at a time; audio never reaches the app or the server; the app only reads the resulting JSON through the queue; the app's "never fetch or analyse audio" rule stands for `src/`), consequences (Shazam's unknown quota, an unsigned executable, the dependency on a library that mimics an app); link it from the ADR index and from ADR-08 "Links"; amend `.specify/memory/constitution.md` Principle IV with one sentence pointing at ADR-09 (PATCH: 2.0.1 → 2.0.2, Last Amended 2026-11-06)
- [ ] T050 [P] Update `docs/architecture/000-how-it-works.md`: §10 adds `worker.ts` and the request button; §16 adds `pullJobs`/`requestIdentify`, the `mixJobs` meta and migration 0002; new §17 `worker/` (the pipeline, the probes, the merge, the files, the exit codes, the executables) with its heading in the table of contents; §14 jobs table gains "Identify request: not in `jobsBusy()`, no `confirm()`, Disconnect keeps it"
- [ ] T051 [P] Update `docs/architecture/100-features.md`: row **F19** "Identify a mix on my computer (worker: yt-dlp + ShazamIO, three executables)" with entry files, the spec page, date, ⚠️ and the known limits (Shazam quota unknown, unsigned executables, YouTube needs a JS runtime); §2 "What leaves the browser" gains the request link and the result; §3 states the two Spotify writes are unchanged
- [ ] T052 [P] Update `docs/architecture/800-limits-roadmap.md`: reword "Any audio fetch, fingerprinting or recognition API" to "… in the app; the worker on the owner's computer does it (ADR-09)"; §2 gains the worker's limits; "The next round" paragraph replaced (the worker shipped; next ideas listed)
- [ ] T053 [P] Update `README.md` (owner's manual): a "Identify a mix from your computer" section pointing at `worker/README.md`, the three executables, the email template line; "Keep it safe" gains "the worker's session file is yours alone; never the service_role key"; replace the dead `https://github.com/betmoar/tracklistify` link in `src/ui/Mix.tsx`'s info card with the worker manual's link and wording "Run the worker on your computer ›"
- [ ] T054 [P] `CHANGELOG.md` entry dated the merge day: the feature, the migration to apply, the template line, the tag that builds the executables
- [ ] T055 Run `yarn typecheck && yarn lint && yarn test` and the worker suite unpiped, `yarn build`, then the full quickstart §3 once more against the deployed app; mark the remaining owner scenarios (17 on Windows/macOS) as owner-run in this file; commit; ask the owner's OK to merge to `main` and push

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2 → US1 → US2 → US3 → Polish.** US2 extends US1's `pullJobs`, screen and loop; US3 wraps US1's `run --once`
  in the full CLI. Nothing in US3 blocks US1/US2 except the manual.
- Within a phase, `[P]` tasks touch different files and can run together; test tasks precede their implementation task.
- T040 and T047 need the owner (migration, tag, other machines); everything else runs here.

## Parallel Example: User Story 1

Write T020–T026 together (seven test files), then T027/T031/T032 together (app pure module, download, scan), then T028 →
T029 → T030 (sync, state, screen, in that order) and T033 (pipeline) beside them.

## Implementation Strategy

- **MVP** = Phases 1–3: a request from the phone, `uv run mix-worker run --once` here, the rows on the phone, the playlist
  tap. That alone replaces the hand-run flow.
- US2 makes it trustworthy (reasons, retake, clean stop); US3 makes it one command and ships the executables; Polish writes the
  round into the repo's documents and the standing decision (ADR-09).
- Every task group ends green and committed; the push to `main` waits for the owner's OK (constitution).
