# Contract: the worker (`worker/`, Python)

The program on the owner's computer. Two forms from one code: `uv run mix-worker …` in the repo's `worker/` folder, and
one executable per system (`mix-worker-windows-x64.exe`, `mix-worker-linux-x86_64`, `mix-worker-macos-arm64`,
`mix-worker-macos-x86_64`) with `mix-worker.env` beside it (research D9); yt-dlp and ffmpeg are inside. Nothing here calls a
Spotify host (FR-019).

## Commands and exit codes

| Command | Does | Exit |
|---|---|---|
| `mix-worker check` | prints the settings it resolved (secrets masked), the ffmpeg it will use and its version, whether a JavaScript runtime is on PATH (YouTube only), whether a session exists; touches no network | 0, or 5 when a required setting is missing or ffmpeg cannot start |
| `mix-worker login` | email → code → session file (D8) | 0; 2/3 server; 4 refused code |
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
| `WORKER_MAX_DURATION_SECONDS` | 14400 | longer sets fail "Set longer than 4 hours" |
| `WORKER_PROBE_STEP_SECONDS` | 60 | one 12-second probe every N seconds (D4) |
| `WORKER_COOLDOWN_SECONDS` | 3.0 | sleep before every recognition call (D3) |
| `WORKER_RATE_LIMIT_PAUSE_SECONDS` | 300 | the one pause after a `RateLimited` |
| `WORKER_MAX_SKEW` | 0.001 | ShazamIO's `max_skew`; 0 disables (D5) |
| `WORKER_MERGE_GAP_SECONDS` | 180 | same track within this gap extends the row (D5) |
| `WORKER_RESULT_MAX_BYTES` | 900000 | larger results fail "Result too large" |

Validation at start (`check` and every command): URL is `https:`, key non-empty, numbers positive, the ffmpeg runnable
(`-version`); the first failure is printed with the setting's name and where to set it (exit 5).

## One request (`pipeline.run_one(job, settings, deps) -> Outcome`)

1. **Validate** `payload.url` (https). Otherwise `failed` "Request has no valid link".
2. **Download** (D7) into `<work>/<job id>/`; reason strings of D7 on failure. Duration over the maximum → `failed`.
3. **Scan** (D4, D5): probes until the end; a log line every 10 probes (`probe 40/120 · 23 hits`); zero rows → `failed` "No
   track identified"; `RateLimited` twice → `failed` "Recognition service refused (rate limited); try later".
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
- `session.py`: `load(path)`, `save(path, session)` (0600), `ensure_fresh(session, client, now)`.
- `download.py`: `download(url, dest_dir, settings, ydl_factory=yt_dlp.YoutubeDL) -> Downloaded | DownloadFailure`;
  `reason_for(message) -> str` (the D7 mapping, pure).
- `scan.py`: `probe_times(duration, step) -> list[int]` (pure); `cut_probe(ffmpeg, file, t) -> bytes`; `confidence_of(match)`
  (pure); `track_entry(response) -> dict | None` (pure, D6); `merge(hits: list[Hit], gap) -> list[dict]` (pure, D5);
  `scan(file, duration, settings, recognise: Callable[[bytes], Awaitable[dict]], cut: Callable[[int], bytes], sleep) -> list[dict]`.
- `pipeline.py`: `run_one(...)`, `run_loop(...)`; `cli.py`: argparse and exit codes; `__main__.py`: the no-command path.
- Tests (`worker/tests/`): fake `opener` returning canned `HTTPResponse`-like objects (claim → one row then `[]`; 401; 413; a
  paused 5xx body; a socket error); fake `recognise` returning the cassette shape (a hit, a no-match, a `RateLimited`), fake
  `cut` returning bytes of a given length; `merge` on hit sequences (A A B B A → three rows; A, no-match, A within the gap → one
  row; A … A after the gap → two rows); `track_entry` produces exactly the fixture's keys and omits absent ones;
  `reason_for` on the known messages; `load_settings` defaults, overrides, bad numbers; `run_one` end to end with fakes,
  asserting the JSON file exists, the folder is gone, and the `finish` body; Ctrl-C → `release` called.

## Outbound hosts (SC-005 review list)

The Supabase project (`SUPABASE_URL`), the platform the link points to (yt-dlp), `amp.shazam.com` (ShazamIO), and the proxy if
set. Never `api.spotify.com` or `accounts.spotify.com`: `test_pipeline.py` asserts the fake opener saw only the project host, and
the manual lists the hosts.
