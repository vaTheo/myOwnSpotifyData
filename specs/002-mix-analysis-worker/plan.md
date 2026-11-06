# Implementation Plan: A worker on the owner's computer that identifies a mix's tracks from a link

**Branch**: `002-mix-analysis-worker` (work happens on `task/general-dev`, merged to `main` with the owner's OK) | **Date**: 2026-11-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-mix-analysis-worker/spec.md`

## Summary

From the phone, the owner pastes a link on the Mix screen and taps "Identify on my computer"; the app inserts one `identify-mix`
request in the server's `jobs` table. On the owner's computer, one Python command (`mix-worker`, a `uv` project under
`worker/`) claims the oldest request through a `claim_job` function, downloads the audio with yt-dlp, cuts it into segments with
ffmpeg, recognises each segment with the ShazamIO library (keyless, as the hand-run Tracklistify was; that tool is no longer
public), merges the hits into one row per track, writes the JSON in the shape the app's Tracklistify import already reads, sends
it as the request's result, deletes the audio and keeps the JSON. The same code also ships as one Windows executable
(PyInstaller, one per system, built by a CI matrix on Windows, Linux and macOS runners from a `worker-v*` tag) that reads a
settings file beside it and carries yt-dlp and a static ffmpeg inside. The app's next pull turns the result into rows of the saved mix
for that link; "Create playlist from mix" is unchanged. The worker never touches Spotify; the server stores and never computes.

## Technical Context

**Language/Version**: app: TypeScript ~6.0.3 on Preact, unchanged. Worker: Python 3.11–3.13 (owner's pick; 3.13.5 on the
owner's computer), managed by `uv` (present on the owner's computer), stdlib for everything but the two libraries below.

**Primary Dependencies**: app: none new. Worker (`worker/pyproject.toml`, `uv.lock` committed): `yt-dlp` (download),
`shazamio` (recognition; versions pinned by `research.md` D2), `imageio-ffmpeg` (a static `ffmpeg` binary per platform,
`research.md` D9); build-only, in a `uv` dependency group: `pyinstaller` (the executables, D9). System tools: `ffmpeg`/`ffprobe` on PATH (segments, metadata),
Node or Deno on PATH for YouTube links (yt-dlp's JavaScript runtime); nothing else. The worker imports `yt_dlp` (so the
executables carry it) and runs the packaged `ffmpeg` as a subprocess for the 12-second probes only (`research.md` D4, D7).

**Storage**: server: the existing `jobs` table plus migration `0002_jobs.sql` (`applied_at`, an index, `claim_job`). Browser:
optional `MixRow` fields and one `meta` row (`mixJobs`); no `DB_VERSION` bump. Computer: a session file (0600), a temp folder per
request, a kept JSON per result, one log.

**Testing**: app: Vitest next to source, as always. Worker: `unittest` from the standard library (`worker/tests/`), run by
`python -m unittest discover -s worker/tests -t worker`; CI gains `actions/setup-python`, `setup-uv` and that one step. No
network in any test: `urlopen`, the ffmpeg cutter, the yt-dlp factory and the recogniser are injected and faked.

**Target Platform**: the app on GitHub Pages (phone); the worker on the owner's Linux computer (Debian, Python 3.13, uv, ffmpeg,
yt-dlp 2025.04.30 already installed system-wide but the project pins its own in the venv) and, packaged, on Windows, Linux
and macOS 64-bit computers without Python or ffmpeg.

**Project Type**: web app (existing) + a CLI worker folder in the same repo.

**Performance Goals**: a request visible on the phone within two seconds (SC-001); a two-hour set scanned in under twice the
hand-run tool's time (SC-002) — one 12-second probe a minute, one call every ~4.5 s: ~120 calls and about 9 minutes after the
download for two hours (`research.md` D4); the pull applies one result in under a second.

**Constraints**: ADR-08 (server never computes, never sees a Spotify token; worker outside, polling outbound); Principle III (the
worker makes zero Spotify calls); ADR-06 (no new app dependency; the worker's two libraries are the owner's explicit pick, pinned);
Shazam's tolerance for unauthenticated calls (pacing from `research.md` D4, one call at a time, cooldown, stop on repeated
refusals); result body under ~1 MB (PostgREST); the Free project pauses after a week idle (worker exits with a hint, never spins).

**Scale/Scope**: one owner, one or two computers, a few requests a week, sets of any length (a 5-hour set: 300 probes, about 40 minutes), results of
10–60 KB, history of ≤ 20 requests per link shown.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| I. Browser-first, no secret, one owner's server (ADR-08) | No secret in the repo or the browser; the server stores only; the worker runs on the owner's computer with a credential of its own | **Pass**: the worker signs in as the owner with an email code and keeps a session file at 0600 outside the repo; the publishable key is the only key in `worker/.env`; the `service_role` key is never used; `claim_job` is security invoker under RLS; the app works without the server (button disabled with the Settings wording) |
| II. No Spotify reads on load | Nothing new reads Spotify | **Pass**: request states come from the owner's server on open/sync; no Spotify call anywhere in the round |
| III. Writes only on a tap, two sites | No third write site; the worker holds no token | **Pass**: the playlist is created by the existing tap; FR-019; SC-005 checked by reviewing the worker's hosts (`research.md` D8) |
| IV. Keyless sources keyed by id, clients never throw, long jobs resume | Browser side unchanged; the worker's recognition is keyless | **Pass** with a note: Shazam identification is by audio, not by id — it runs on the owner's computer, outside the app, which ADR-08 allows; the Limits page is reworded (spec, Constitution notice). The browser-side request is one call under a second, not a long job; the worker resumes through stale reclaim |
| V. IndexedDB upgrades only add | No bump; optional fields; `mixes` out of `buildModel` | **Pass**: `identifyJobId`, `identifiedAt`, `sources.worker` optional; one new `meta` name |
| VI. Play counts from the export | untouched | **Pass** |
| VII. Every failure is shown | Inline on the Mix screen, never a banner; worker prints every step | **Pass**: `mixError` for app-side failures, the request's `error` line rendered, "Result rejected" for a refused result; the worker's log and exit codes (`contracts/worker.md`) |
| Tooling: lean, ask before a dependency | Three Python libraries, the CI Python step, PyInstaller and a second workflow with a three-system matrix | **Pass**: picked by the owner on 2026-11-06 (Python; ShazamIO; executables for the three systems with ffmpeg inside); the app's `package.json` is untouched; the release workflow runs only on a `worker-v*` tag |
| Confirms listed in How it works §14 | none new | **Pass** |

Post-design re-check (after Phase 1): unchanged, no violation to justify; Complexity Tracking stays empty.

## Project Structure

### Documentation (this feature)

```text
specs/002-mix-analysis-worker/
├── plan.md              # this file
├── spec.md
├── research.md          # D1–D9: tool availability, sign-in, ShazamIO facts, pacing, segments, merge, packaging, CI
├── data-model.md        # jobs columns and states, the result JSON, local additions, worker files
├── quickstart.md        # owner setup (template line, migration, uv sync, login) and validation scenarios
├── contracts/
│   ├── server-schema.md # 0002_jobs.sql, the requests, the error mapping
│   ├── client-api.md    # src/ additions and their tests
│   └── worker.md        # the CLI, settings, exit codes, the pipeline and the scanner's rules
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks output
```

### Source Code (repository root)

```text
worker/                          # new: the owner's-computer program (Python, uv project)
├── pyproject.toml               # name mix-worker, requires-python >=3.11,<3.14, deps yt-dlp + shazamio, script mix-worker
├── uv.lock
├── README.md                    # the owner's manual for the worker (install, login, run, settings, troubleshooting, the .exe)
├── .env.example                 # SUPABASE_URL, SUPABASE_KEY, WORKER_* defaults (the same file is the .exe's config template)
├── mix-worker.spec              # PyInstaller one-file build (entry mix_worker/__main__.py; yt_dlp, shazamio_core and imageio_ffmpeg's binary collected)
├── mix_worker/
│   ├── __init__.py
│   ├── __main__.py              # `python -m mix_worker` and the .exe entry: no command → login if needed, then run --watch
│   ├── cli.py                   # argparse: login, logout, check, run [--once|--watch] [--interval N], --config PATH
│   ├── config.py                # .env + environment → Settings dataclass with defaults and validation
│   ├── server.py                # urllib client: otp, verify, refresh, claim, finish, release; ServerError kinds
│   ├── session.py               # session file read/write (0600), refresh-with-margin
│   ├── download.py              # yt_dlp in-process: noplaylist, no live, bestaudio, title/uploader/duration/filepath; reason mapping
│   ├── scan.py                  # 12 s probes every 60 s cut by ffmpeg to WAV bytes → ShazamIO → confidence → merge → the F15 shape
│   ├── pipeline.py              # one request end to end: steps, timings, cleanup, the failure reasons
│   └── log.py                   # one line per step to stdout and the log file
└── tests/                       # unittest; fakes for urlopen, subprocess.run and the recogniser
    ├── test_config.py
    ├── test_server.py
    ├── test_session.py
    ├── test_download.py
    ├── test_scan.py             # segment plan, merge rule, result shape against the app's F15 fixture
    └── test_pipeline.py

supabase/migrations/0002_jobs.sql

src/features/mix/url.ts          # + requestKey
src/features/mix/worker.ts       # new, pure: mergeWorkerRows, resultToRows, jobView, requestStatusText
src/server/sync.ts               # + pullJobs, requestIdentify
src/server/validate.ts           # + validateJobRow
src/db/schema.ts                 # + optional MixRow fields, MIX_JOBS_META, MixJobView
src/model/state.ts               # + mixJobs, startIdentifyRequest; sign-out/remove clear the meta
src/ui/Mix.tsx                   # + the button, the state line, the history; real-url check; manual link
.github/workflows/ci.yml         # + setup-python and the unittest step
.github/workflows/worker-release.yml  # new: on tag worker-v*, matrix windows/ubuntu/macos: uv sync, unittest, pyinstaller, `--version` smoke test, one release with every asset
.gitignore                       # + worker/.env, worker/.venv/, .tracklistify/
```

**Structure Decision**: the worker is a sibling folder, not a package under `src/`: it is a different language, run on a
different machine, with its own test runner; `tsconfig` (`include: ["src"]`), ESLint and Vitest never see it. It shares the
repo so the result JSON shape, the migration and the manual live beside the app that reads them (ADR-08: "everything to create it
lives in the repo").

## Complexity Tracking

> No constitution violation to justify.
