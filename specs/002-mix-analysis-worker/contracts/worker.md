# Contract: the worker (`worker/`, Python)

The program on the owner's computer. Two forms from one code: `uv run mix-worker …` in the repo's `worker/` folder, and
one executable per system (`mix-worker-windows-x64.exe`, `mix-worker-linux-x86_64`, `mix-worker-macos-arm64`,
`mix-worker-macos-x86_64`) with `mix-worker.env` beside it (research D9); yt-dlp and ffmpeg are inside. Nothing here calls a
Spotify host (FR-019).

## Commands and exit codes

| Command | Does | Exit |
|---|---|---|
| `mix-worker check` | prints the settings it resolved (secrets masked), the ffmpeg it will use and its version, whether a JavaScript runtime is on PATH (YouTube only), whether a session exists; touches no network | 0, or 5 when a required setting is missing or ffmpeg cannot start |
| `mix-worker login` | email → the magic link opened on this computer, caught on 127.0.0.1:5173 → session file (D8); `--code`: the typed six-digit code instead | 0; 2/3 server; 4 refused, timed out, or port 5173 busy |
| `mix-worker logout` | revokes and deletes the session | 0 |
| `mix-worker run --once` | claims and processes requests until the queue is empty, then exits | 0 |
| `mix-worker run --watch [--interval N]` | as `--once`, then polls every N s (default `WORKER_POLL_SECONDS`) until stopped | 130 on Ctrl-C |
| `mix-worker` (no command; the double-click) | `login` when no session, then `run --watch` | as above |
| `mix-worker --version` | prints the version and exits | 0 |
| any | `--config PATH` reads that settings file instead of the default | |

Shared exits: **2** server unreachable (network or 5xx), **3** server paused ("resume it from the dashboard"), **4** not signed
in or refresh refused ("run `mix-worker login`"), **5** missing setting or tool, **6** config template written (packaged form,
first start). A failed *request* is not a failed *run*: the worker marks it `failed` and continues (FR-018).

## Settings (`worker/.env.example` = the template; environment overrides the file)

| Name | Default | Meaning |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_KEY` | — (required) | the project URL and publishable key, the same public values the app builds with |
| `WORKER_NAME` | the hostname | `claimed_by`, shown on the phone as "on <name>" |
| `WORKER_SESSION_FILE` | `~/.config/myownspotifydata-worker/session.json` (`%APPDATA%\…` on Windows; beside the executable when present there) | the session (0600) |
| `WORKER_WORK_DIR` | `~/.cache/myownspotifydata-worker` (`%LOCALAPPDATA%\…`) | one sub-folder per request, deleted when it ends |
| `WORKER_JSON_DIR` | `~/Music/mix-worker` | the kept results, `<YYYY-MM-DD> <title> [<id prefix>].json` |
| `WORKER_LOG_FILE` | `<WORKER_WORK_DIR>/worker.log` | one line per step, appended |
| `WORKER_FFMPEG` | the packaged binary (`imageio_ffmpeg.get_ffmpeg_exe()`) | override only: another `ffmpeg` to use for the probes and as yt-dlp's `ffmpeg_location` |
| `WORKER_YTDLP_COOKIES` | unset | a Netscape cookies file for platforms that need a login |
| `WORKER_PROXY` | unset | HTTP proxy for the recognition calls only |
| `WORKER_STALE_SECONDS` | 21600 | `claim_job`'s `p_stale_seconds` |
| `WORKER_POLL_SECONDS` | 60 | `--watch` interval |
| `WORKER_HEARTBEAT_SECONDS` | 30 | `--watch`: an "alive" line this often while waiting |
| `WORKER_MAX_DURATION_SECONDS` | 0 | no limit (owner's pick); a positive value refuses longer sets on the metadata, before the download |
| `WORKER_PROBE_STEP_SECONDS` | 15 | one probe every N seconds; with 12 s probes, 80 % of the set heard (D4, revised 2026-11-06) |
| `WORKER_PROBE_SECONDS` | 12 | probe length sent to Shazam, 2–12 (D4, revised 2026-11-06); amendment, spec 029 (2026-11-13): a probe shorter than 12 s is filled with silence to 12 s, a probe with no audio is not (see `specs/029-worker-scan-evidence/contracts/worker.md`) |
| `WORKER_COOLDOWN_SECONDS` | 1.9 | sleep before every recognition call, + random 0–30 % (`WORKER_COOLDOWN_SPREAD_PERCENT`), never slowed after a refusal (owner's pick), doubled after each `RateLimited` (30 s cap) (D3) |
| `WORKER_RATE_LIMIT_PAUSE_SECONDS` | 180 | pause after a `RateLimited`, the same each time, + random 0–40 % (`WORKER_RATE_LIMIT_PAUSE_SPREAD_PERCENT`; round 003) |
| `WORKER_REFUSAL_WARN_CALLS` | 150 | two refusals closer than this many calls: one warning (round 004) |
| `WORKER_RESUME_DAYS` | 7 | Ask again on a stopped set resumes it within this many days (round 004) |
| `WORKER_RATE_LIMIT_PAUSES` | 8 | pauses per set; one more `RateLimited` stops the scan: done with the tracks found ("stopped early"), failed only when none |
| `WORKER_AUTO_RESUME_MINUTES` | 30 | after a done request stopped early by refusals, `run --watch` in personal mode inserts the app's Ask again row for the link this long later; 0 = off; also off when `WORKER_RESUME_DAYS` is 0 (nothing saved to resume from) (spec 023, worker 0.7.3) |
| `WORKER_AUTO_RESUMES` | 6 | automatic asks per link at most; a complete run resets the count, a manual Ask again does not; in memory, lost on restart (spec 023) |
| `WORKER_SHAZAM_DEVICE` | android | recognition profile, `android` or `iphone` (D3) |
| `WORKER_MAX_SKEW` | 0.1 | ShazamIO's `max_skew` (max of the first match's time and frequency skew); 0 disables (D5) |
| `WORKER_MERGE_GAP_SECONDS` | 180 | same track within this gap extends the row (D5); another song's hit between two hits of one track this close is dropped (worker 0.7.2, D5) |
| `WORKER_RESULT_MAX_BYTES` | 900000 | larger results fail "Result too large" |

Validation at start (`check` and every command): URL is `https:`, key non-empty, numbers positive, the ffmpeg runnable
(`-version`); the first failure is printed with the setting's name and where to set it (exit 5).

## One request (`pipeline.run_one(job, settings, deps) -> Outcome`)

1. **Validate** `payload.url` (https). Otherwise `failed` "Request has no valid link".
2. **Download** (D7) into `<work>/<job id>/`; reason strings of D7 on failure. Duration over the maximum → `failed`.
3. **Scan** (D4, D5): probes until the end; a log line every 10 probes (`probe 40/120 · 23 hits`); zero rows → `failed` "No
   track identified"; `RateLimited` twice → `failed` "Recognition service refused (rate limited); try later". Each
   recognition is cut off after 45 s; a timeout or network error retries the probe 3 times (10 s × attempt apart), then skips
   it; 3 probes skipped in a row → `failed` "Recognition service did not answer; try later". The access token is refreshed
   before the result is sent, since a scan can outlast it.
4. **Write** the JSON (data-model.md "Scan result"): `mix_info.title` ← download title (`⧸` for `/` is **not** applied; the
   title is text, not a filename), `artist` ← uploader, `audio_filename` ← the downloaded file's name, `source_url`,
   `duration_seconds`, `date`, `track_count`; `tracks` in mix order. Saved to `WORKER_JSON_DIR` first (FR-016).
5. **Send** `done` with the JSON as `result` (server-schema.md); over the byte guard or 413 → `failed` "Result too large".
   An empty PATCH answer (reclaimed elsewhere) → logged "request taken by <other>", nothing else.
6. **Clean**: the request's folder is removed on every path (success, failure, exception). The JSON stays.

Every step logs `step · outcome · <n> s`. An unexpected exception marks the request `failed` with "Worker error: <type>" and
the traceback goes to the log file only; the loop continues with the next request.

## Modules and the seams the tests use

- `config.py`: `load_settings(path: Path | None, env: Mapping) -> Settings` (pure over its inputs; parses `KEY=VALUE`, `#` comments,
  quotes). `write_template(path)`.
- `server.py`: `ServerClient(base_url, api_key, opener=urllib.request.urlopen)`; methods `send_otp(email)`, `verify(email,
  code)`, `refresh(token)`, `claim(access, worker, stale)`, `finish(access, job_id, worker, body)`, `release(access, job_id,
  worker)`, `logout(access)`; every method returns a `Result` (`ok | offline | paused | unauthorized | too_large | error` with
  `status`, `message`) and never raises; the mapping of `client.ts` (server-schema.md).
- Spec 023: `ServerClient.enqueue(access, url) -> Result` (`value` `"exists"` or `"queued"`; the app's open-request check then
  its insert; `SharedServerClient.enqueue` sends nothing and answers `error`); `autoresume.AutoResume(minutes, cycles, clock,
  off=)` with `after(url, outcome) -> str | None`, `take_due() -> list[str]`, `queued(url, result) -> str`; `Outcome.stopped`
  (the stop reason of a done request); `run_queue(..., clock=time.monotonic)`.
- `session.py`: `load(path)`, `save(path, session)` (0600), `ensure_fresh(session, client, now)`.
- `download.py`: `download(url, dest_dir, settings, ydl_factory=yt_dlp.YoutubeDL) -> Downloaded | DownloadFailure`;
  `reason_for(message) -> str` (the D7 mapping, pure).
- `scan.py`: `probe_times(duration, step) -> list[int]` (pure); `cut_probe(ffmpeg, file, t) -> bytes`; `confidence_of(match)`
  (pure); `track_entry(response) -> dict | None` (pure, D6); `merge(hits: list[Hit], gap) -> list[dict]` (pure, D5);
  `drop_sandwiched(hits: list[Hit], gap) -> tuple[list[Hit], int]` (pure, D5, worker 0.7.2: the kept hits and the count dropped);
  `scan(file, duration, settings, recognise: Callable[[bytes], Awaitable[dict]], cut: Callable[[int], bytes], sleep) -> list[dict]`.
- `pipeline.py`: `run_one(...)`, `run_loop(...)`; `cli.py`: argparse and exit codes; `__main__.py`: the no-command path.
- Tests (`worker/tests/`): fake `opener` returning canned `HTTPResponse`-like objects (claim → one row then `[]`; 401; 413; a
  paused 5xx body; a socket error); fake `recognise` returning the cassette shape (a hit, a no-match, a `RateLimited`), fake
  `cut` returning bytes of a given length; `merge` on hit sequences (A A B B A → three rows; A, no-match, A within the gap → one
  row; A … A after the gap → two rows); `drop_sandwiched` (A, X, A within the gap drops X; A, X, B and a wider A … A keep it;
  A, B, A, B within the gap keeps the first A and the last B); `track_entry` produces exactly the fixture's keys and omits absent ones;
  `reason_for` on the known messages; `load_settings` defaults, overrides, bad numbers; `run_one` end to end with fakes,
  asserting the JSON file exists, the folder is gone, and the `finish` body; Ctrl-C → `release` called.

## Outbound hosts (SC-005 review list)

The Supabase project (`SUPABASE_URL`), the platform the link points to (yt-dlp), `amp.shazam.com` (ShazamIO), and the proxy if
set. Never `api.spotify.com` or `accounts.spotify.com`: `test_pipeline.py` asserts the fake opener saw only the project host, and
the manual lists the hosts.

> Amendment, spec 028 (2026-11-13, worker 0.7.4): "One request" gains an address step between Validate and Download: `Deps.address` (default `None`: nothing changes) gives the working address (a SoundCloud set address trimmed, a share link `on.soundcloud.com/<token>` followed inside SoundCloud's hosts, any other link as it arrives), or a `LinkFailure` that finishes the request `failed` before any download. The download, TrackId.net, the clues, the saved run and `source_url` use that address; the request keeps its own link. New module `links.py`, new seam `cli.http_location`, and `on.soundcloud.com` joins the outbound hosts (a share link's redirect only, at most 3 requests). See `specs/028-worker-short-links/contracts/worker.md`.
>
> Amendment, round 016 (2026-11-08): the outbound host list also holds `trackid.net` (the exact mix link only, `WORKER_TRACKID`), and with a known mix the first pass skips its grid probes inside a TrackId.net span; see `specs/016-trackid-worker-clues/contracts/worker.md`. Everything above holds when TrackId.net knows nothing or is off.
