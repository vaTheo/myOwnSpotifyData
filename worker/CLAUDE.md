# Rules for the worker (`worker/`)

Complements the root `CLAUDE.md` for changes under `worker/`: the Python program on the owner's computer that takes
`identify-mix` requests from the server's `jobs` table, fetches the audio, identifies the tracks and sends the tracklist back
(ADR-08: it runs outside the server; the server stores and never computes). Two forms from one code: `uv run mix-worker` and
one PyInstaller executable per system.

## Required inputs

| Type     | File                                                                  | Why                                                                     |
| -------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Decision | `../docs/architecture/700-adr/ADR-08-owner-server-free-tier.md`       | the worker is outside the server, polls outbound, holds no Spotify token |
| Contract | `../specs/002-mix-analysis-worker/contracts/worker.md`                | commands, exit codes, settings, the pipeline, the seams the tests use    |
| Contract | `../specs/002-mix-analysis-worker/contracts/server-schema.md`         | every request the worker makes and the error mapping                    |
| Research | `../specs/002-mix-analysis-worker/research.md` D2–D7, D9              | ShazamIO facts, pacing, probes, confidence, merging, download, packaging |
| Shape    | `../src/features/mix/tracklistify.ts`                                 | the JSON the result must satisfy (`mix_info`, `tracks[]`, `metadata`)    |
| Tests    | `tests/test_*.py`                                                     | `unittest`, every external call injected and faked                       |

## Expected outputs

- Standard library only, besides `yt-dlp`, `shazamio` and `imageio-ffmpeg` (`pyproject.toml`); a new library is the owner's
  decision (ADR-06). `uv.lock` is committed; `uv sync --frozen` in CI.
- Every network call, subprocess, clock, sleep and library object is injected through `deps`; no test touches the network,
  Shazam, yt-dlp or a real download. `python -m unittest discover -s tests` is green before every commit.
- No Spotify host, ever: the outbound hosts are the owner's project, the platform of the link and `amp.shazam.com` (plus the
  optional proxy). `test_pipeline.py` asserts the fake client saw only the project's host.
- One probe at a time: `sleep(WORKER_COOLDOWN_SECONDS)` before every `recognize`; a `RateLimited` pauses once, twice fails the
  request; never a retry loop against a paused or unreachable server (exit 2/3).
- A result is sent whole or not at all; the JSON on disk is written before it is sent; the audio and the request folder are
  deleted on every path; `tracks` empty is a failed request ("No track identified"), never `done` with an empty list.
- The result keeps the F15 shape pinned by `tests/test_scan.py` against the app's fixture keys; absent metadata is omitted,
  never `null`-filled; `time_in_mix` is the probe start as `HH:MM:SS`.
- A change meant for the owner's computer bumps the version in `pyproject.toml` and `mix_worker/__init__.py` (tested equal),
  then `uv lock`: the push to `main` releases `worker-v<version>` with the four executables; an unchanged version builds nothing.
- Exit codes: 0 ok / queue empty, 2 unreachable, 3 paused, 4 not signed in, 5 missing setting or tool, 6 config template
  written, 130 Ctrl-C (after releasing the request). A failed request never fails the run.
- Settings: `config.py` is the one reader; every setting has a default in `.env.example` (shipped as `mix_worker/env.example`,
  kept byte-identical by `test_config.py`). The session file is 0600 and never in the repo; the `service_role` key is never used.
