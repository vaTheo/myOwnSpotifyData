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
- No Spotify host, ever: the outbound hosts are the owner's project, the platform of the link, `amp.shazam.com` (plus the
  optional proxy) and, for clue lookups only (round 003, ADR-10), `api.deezer.com`, `musicbrainz.org`, `api.discogs.com` and, round 016 (ADR-17), `trackid.net` (the exact mix link only, the list and the detail call, never the keyword endpoint) and, spec 028, `on.soundcloud.com` (a share link's redirect only). `test_pipeline.py` asserts the fake client saw only the project's host.
- Spec 028 (worker 0.7.4, `links.py`, no I/O of its own, never raises): `Deps.address` (default `None`: nothing changes) gives the
  **working address** once per request, under the `download` step: a SoundCloud set address trimmed by `trim_soundcloud` (the app's
  `normalizeMixUrl`; both suites read `src/features/mix/url.cases.json`, a new case goes in the file), a share link followed by
  `resolve_short_link` (at most 3 requests, to `on.soundcloud.com` only; a `Location` accepted only as `https`, no user info, default
  port, on SoundCloud's hosts; one try), any other link as it arrives. The download, TrackId.net, the clues, the saved run and
  `source_url` use it; the request keeps its link (finish by id, the `claimed` line, the automatic Ask again). A `LinkFailure` fails
  the request before any download with one of three reasons. `cli.http_location` is the one real seam (one GET, no redirect
  followed, the body not read). `shared_link_allowed` accepts the short host too (ADR-16, amended).
- Round 016 `scan(guides=, spans=)` (both default `None`: nothing changes): a grid probe inside a guided core is skipped (done, not a miss), one `confirm` probe per span is remembered and resumed like a first-pass probe, a hit is absorbed into `span_checks`, never a row or a gap, when it names the span's track and the probe window `[t, t+probe_seconds]` overlaps `[start, end)`, or names another track and the window's center lies in `[start, end)` (half-open; `scan(probe_seconds=)`); the confirm probe is made before the first grid probe `t` with `confirm_at < t + step` (rest after the loop), an undecodable one is not remembered; `check_of` sends `confidence` as 0..1; `cli.http_get` follows no redirect, reads at most 2 MB and has a 10 s total deadline; the run state key carries the slug and a hash of the cores (`runstate.trackid_key`).
- The sandwich round (spec 019, worker 0.7.2): `drop_sandwiched(hits, gap)` runs in `scan()` after both passes, just before `merge`: a Shazam hit strictly between two neighbouring hits of another song at most the merge gap apart is dropped (pairs judged on the raw hits, so A, B, A, B keeps the first A and the last B); `report["sandwiched"]` counts them, one log line when > 0; `hits_out`, the run state (`remember`, per probe) and `report["gaps"]` keep the raw hits; TrackId.net, clue and gap rows are never filtered; `merge` and `inside_known` unchanged.
- The auto-resume round (spec 023, worker 0.7.3): after `done` with "Stopped early … (rate limited)" `cli.run_queue` plans, in memory
  (`autoresume.AutoResume`, keyed by link, lost on restart), one automatic Ask again `WORKER_AUTO_RESUME_MINUTES` (30, 0 = off) later; when due,
  between two requests, `ServerClient.enqueue` inserts the app's row (`{kind: 'identify-mix', payload: {url}}`, after the same open-request
  check), one try, a failure one log line; at most `WORKER_AUTO_RESUMES` (6) per link, reset by a complete run, not by a manual Ask again.
  Only a rate-limit stop (`Outcome.stopped`); never in shared mode (`SharedServerClient.enqueue` sends nothing), with `--once`, or with
  `WORKER_RESUME_DAYS=0` (no saved run: each ask would rescan from the start); each "off" case logs one line.
- TrackId.net never fails a request; one confirming probe per guided span and no other probe inside it; TrackId.net outranks Shazam inside its spans (ADR-17).
- Round 016 wiring (`Deps.trackid`, default `None`; `cli.http_get` is the one real fetch, one GET with `User-Agent: mix-worker/<version>`): called once per request after the download and length check, any exception caught and logged, `trusted` before use; `guides`/`spans` go to `deps.scan` only for a trusted record with spans, so otherwise the call is byte-identical to today's. `span_rows`/`merge_rows`/`uncovered` build the rows and clip the gaps for the clue step. With spans, `scan` returns instead of raising after a Stop, a refusal or an unreachable first pass (the rows come from the record); without spans it still raises.
- One probe at a time: `sleep(WORKER_COOLDOWN_SECONDS)` before every `recognize`; a `RateLimited` pauses once, twice fails the
  request; never a retry loop against a paused or unreachable server (exit 2/3).
- Round 003: the second pass and the clue step never fail a request (a refusal stops the second pass and keeps its hits; a
  clue failure is one log line). A name lookup only for a clue without identifier, equality by `match.py` only (its cases are
  shared with the app: `src/features/mix/match.cases.json`, `parse.cases.json`); a candidate is always `origin: "clue"`.
- A result is sent whole or not at all; the JSON on disk is written before it is sent; the audio and the request folder are
  deleted on every path; `tracks` empty is a failed request ("No track identified"), never `done` with an empty list.
- The result keeps the F15 shape pinned by `tests/test_scan.py` against the app's fixture keys; absent metadata is omitted,
  never `null`-filled; `time_in_mix` is the probe start as `HH:MM:SS`.
- A change meant for the owner's computer bumps the version in `pyproject.toml` and `mix_worker/__init__.py` (tested equal),
  then `uv lock`: the push to `main` releases `worker-v<version>` with the four executables; an unchanged version builds nothing.
- Exit codes: 0 ok / queue empty, 2 unreachable, 3 paused, 4 not signed in, 5 missing setting or tool, 6 config template
  written, 7 not (or no longer) a shared worker, 130 Ctrl-C (after releasing the request). A failed request never fails the run.
- Mode (`WORKER_MODE`, round 015, ADR-16): `auto` (default, round 017: after sign-in `is_shared_worker` says shared or personal; a failed check ends the run, no guess), `personal` or `shared` (both forced). Shared mode never reads a personal table:
  it uses only `is_shared_worker`, `claim_any_job`, `worker_set_progress`, `worker_finish_job`, `worker_release_job`; the start check
  and a 42501 during a run end with exit code 7.
- Settings: `config.py` is the one reader; every setting has a default in `.env.example` (shipped as `mix_worker/env.example`,
  kept byte-identical by `test_config.py`). The session file is 0600 and never in the repo; the `service_role` key is never used.
