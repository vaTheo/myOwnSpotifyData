# Research: the worker round

Sources: the surviving Tracklistify copy `marcopeise/tracklistify-extended` (main, 2026-02-13; betmoar's history up to
2025-09-17), `shazamio/ShazamIO` (master, 2026-11-02; release 0.9.0 of 2026-10-26), Supabase Auth docs (passwordless email),
yt-dlp 2025.04.30 on the owner's computer, the app's F15 fixture (`src/features/mix/tracklistify.test.ts`), and a read-only
research agent's report of 2026-11-06 (file:line citations below refer to those repositories at those revisions).

## D1. The scan tool: the worker's own scanner on ShazamIO (owner's pick, 2026-11-06)

- **Decision**: no Tracklistify. The worker cuts the audio into probes and recognises each with the ShazamIO library, then
  merges the hits and writes the JSON shape the app's F15 parser reads.
- **Rationale**: `betmoar/tracklistify`, the tool that produced the owner's `tracklist.json` samples, is gone from GitHub (404 on
  the web and the API) and was never on PyPI. Its surviving copy (`marcopeise/tracklistify-extended`, MIT) never reads `isrc`
  nor the Shazam `sections[].metadata` label (grep finds no `isrc` in its source; `label` there comes only from external
  tracklist sites), and writes neither `audio_filename` nor `metadata`, so the app's ISRC-first search would lose its input.
  The owner's samples carried ISRC on ~85 % of rows; Shazam's response has `track.isrc` and the label, so our own scanner
  keeps them.
- **Alternatives**: pin the surviving copy (rejected: no ISRC, filename-derived titles, a large tool for one call); vendor a
  private copy of betmoar's code (the owner has none at hand); a paid recognition API such as ACRCloud (a key and a cost; the
  hand-run tool was keyless).

## D2. ShazamIO facts the scanner is built on

- `shazamio` **0.9.0** (`requires-python >=3.11`), depends on `aiohttp`, `aiohttp-retry`, `pydantic`, `shazamio-core==2.0.0`
  (a Rust extension with `cp310-abi3` wheels for Linux x86_64 and Windows; it decodes AAC/MP4, MP3, Opus/WebM, FLAC, WAV itself,
  resampling to mono 16 kHz; **no ffmpeg, no pydub**). `uv pip install --dry-run shazamio` resolves on the owner's Python 3.13.5.
- `async with Shazam() as shazam: await shazam.recognize(data: str | Path | bytes, proxy=None, *, max_skew=None) -> dict`
  (`shazamio/api.py:437–444`). The library fingerprints **twelve seconds taken from the middle of the data**; "Shazam answers
  `matches: []` from 15 s up, for any track" (`api.py:28–50`, issue #150). The maintainer measured a 12 s window right 94 % of
  the time against 71 % for 10 s (issue #143). So the worker feeds exactly 12-second probes; a longer file would silently be
  reduced to its middle 12 s.
- Response (cassette `tests/cassettes/test_recognize/test_recognize_file.yaml`): `matches[0] = {id, offset, timeskew,
  frequencyskew}`; `track.key` (Shazam id), `track.title`, `track.subtitle` (artist), `track.isrc`, `track.url` (the Shazam
  page), `track.genres.primary`, `track.images.coverart`, `track.sections[type=="SONG"].metadata = [{title:"Album",text},
  {title:"Label",text}, {title:"Released",text}]`. `matches[].offset` is the position **inside the catalogue track**, not inside
  the probe. No match: `{"matches": [], …}` with no `track` key, sometimes `"retryms"`. **No confidence or score field**.
  Not confirmed on every response: `isrc` and `sections` (one cassette) — the scanner treats each as optional.
- `max_skew=1e-3` turns a skewed first match into a no-match: in the maintainer's set it "rejected 23 of 28 wrong answers and
  15 of 611 right ones" (`api.py:450–455`). Errors: `shazamio_core.SignatureError` on undecodable input; HTTP 429/5xx are
  retried inside the library with `ExponentialRetry(attempts=20, max_timeout=60)` (`api.py:113–119`), then
  `shazamio.RateLimited` is raised; `Retry-After` is not read.

## D3. Pacing: one probe at a time, a fixed cooldown, stop early on refusal

- **Decision**: probes are recognised strictly one after the other with `WORKER_COOLDOWN_SECONDS` (default **3.0**) of sleep
  before each call and an HTTP client whose retry budget is `attempts=5, max_timeout=60` (so a refusal surfaces within about
  two minutes, not twelve). On `RateLimited` the worker sleeps `WORKER_RATE_LIMIT_PAUSE_SECONDS` (default 300) once and retries
  the same probe; a second `RateLimited` fails the request with "Recognition service refused (rate limited); try later". An
  optional `WORKER_PROXY` (HTTP) is passed to every call.
- **Rationale**: the fork sleeps 2.25 s before every call and runs probes sequentially (`providers/shazam.py:29–35`,
  `utils/identification.py:172, 238`; its token bucket and circuit breaker are never wired in); the owner's two real scans ran
  that way. ShazamIO's open PR #258 saw 2–4 HTTP 429 answers in 11 calls with the fixed iPhone profile, and issue #120's maintainer
  advice is "add sleeps and process songs one by one". A slightly longer cooldown than the fork's and an early stop keep a
  home IP out of trouble; nothing documents Shazam's real quota, so the numbers are settings.
- **Alternatives**: parallel probes (rejected: 429s); the library's default twelve-minute retry (rejected: the worker would
  look hung; FR-017).

- **Revised 2026-11-06 after the first live scan**: Shazam answered "rate limited" on the 4th call of a set at a 3 s
  cooldown (the computer had made about a dozen calls in the previous ten minutes). The library sends every call as an iPhone
  (hard-coded in `api.py`; PR #258 saw fewer 429s with other profiles, out of reach without patching it). Pacing is now
  adaptive: 6 s cooldown + a random 0–50 %, doubled after each rate limit (30 s cap), pauses of 300 s × n, three pauses per
  set before the request fails (`WORKER_RATE_LIMIT_PAUSES`). A 60-minute set: about 60 calls in 8 minutes when nothing refuses.
- **Revised again 2026-11-06 (owner's pick)**: three runs in a row, with and without a VPN, at 3 s and at 6 s, all got exactly
  three answers then a 429 with the iPhone profile. The same address answered an Android-profile call at once, with the same
  fields (ISRC, `SONG` section label, album, Shazam link). `WORKER_SHAZAM_DEVICE` (default `android`) sends recognitions as
  Android through a small `Shazam` subclass overriding `send_recognize_request_v2` and the platform header (`scan.shazam_for`);
  `iphone` keeps the library's own request.
  With Android holding (18 calls, no refusal), the default cooldown went back to 3 s (+0–50 %) at the owner's request; the
  adaptive doubling and the growing pauses stay as the safety net.

## D4. Probes: 12 s every 60 s, cut by ffmpeg to mono 16 kHz WAV bytes, no temp files

- **Decision**: for a set of duration `T` (from the download's metadata, else discovered when ffmpeg returns nothing), the
  scanner probes at `t = 0, 60, 120, …` (`WORKER_PROBE_STEP_SECONDS`, default **60**), each probe `ffmpeg -nostdin -hide_banner
  -loglevel error -ss <t> -t 12 -i <file> -vn -ac 1 -ar 16000 -f wav <scratch.wav>` read back as bytes (one scratch file
  beside the audio, overwritten per probe: on a pipe ffmpeg cannot seek back to fill the WAV header's sizes and the decoder
  refuses the payload with "unexpected end of file", found on 2026-11-06) and passed to `recognize(bytes)`. A
  probe under 1000 bytes (past the end, or unreadable) ends the scan; a `SignatureError` (silence) is skipped. `time_in_mix` is
  the probe start, `HH:MM:SS`.
- **Rationale**: the fork cuts 90 s MP3 files every 85 s with ffmpeg (`core/base.py:364–416`) and hands the file to the
  library, which only ever fingerprinted 10–12 s of it, so its real sampling was one 10–12 s probe every 85 s; `time_in_mix`
  there is the segment start too (`identification.py:256–258`). One probe a minute finds a 3-minute track two or three times
  and a 90-second one at least once, for 120 probes on a two-hour set: about 120 × (3 s + ~1.5 s) ≈ 9 minutes after the
  download, under SC-002's bound (the hand-run tool: ~85 probes, ~5 minutes). Mono 16 kHz WAV is what the extension resamples
  to anyway; one scratch file, deleted after each probe, is the only disk use beside the audio.
- **Alternatives**: the fork's 85 s step (fewer calls, misses short tracks; kept reachable through the setting); 30 s step
  (twice the calls, no evidence it finds more); passing the whole file (the library would fingerprint its middle only).

- **Revised 2026-11-06 (owner's pick)**: probes are **10 s** by default (`WORKER_PROBE_SECONDS`, 2–12); a probe shorter than
  the library's 12 s window is fingerprinted whole. The maintainer's measurement (issue #143: 71 % right at 10 s against 94 % at
  12 s on 234 songs) is recorded so the setting can go back to 12 if matches look thin. The worker logs one line per probe
  (NEW / same track / no match / skipped, with ISRC, label and confidence), the ffmpeg cut and any ffmpeg warning, and the
  download at 1 %, then every 5 %.

- **Revised again 2026-11-06 (owner's pick, after the first comparison)**: **12 s every 30 s**. The LYL Radio set (2 h 10)
  scanned at 10 s every 60 s gave 18 rows, 3 shared with the owner's Tracklistify playlist of 15; the worker matched 30 of 130
  probes and nothing in the first 49 minutes, and its single-probe rows (63–80 %) looked like wrong matches. Both tools
  fingerprint 12 s at most (`shazamio_core` takes a centred 12 s window), so Tracklistify heard 12 s every 85 s; 12 s every 30 s
  hears about 40 % of the set, at 240 calls for 2 h (about 20 minutes with the 3 s cooldown). The owner then chose the whole
  set: **12 s every 12 s**, probes end to end, 600 calls for 2 h (about 50 minutes); the rate-limit pauses (D3) are the guard.

## D5. Confidence and merging: the fork's formula, one row per run of matching probes

- **Decision**: `confidence = 0.6 × freq + 0.4 × time`, with `freq = 100 × (1 − min(|frequencyskew|, 0.1) / 0.1)` and the same
  for `timeskew`, taken from `matches[0]` (the fork's formula, `providers/shazam.py:58–72`), so the column means the same as in
  the owner's earlier imports. `max_skew` is passed as `WORKER_MAX_SKEW` (default **0.001**; 0 disables). Rows: a probe whose
  `track.key` equals the last row's key and comes within `WORKER_MERGE_GAP_SECONDS` (default **180**) of that row's last hit
  extends the row (its `confidence` becomes the best seen); any other key opens a new row; a key seen earlier but outside the
  gap opens a new row too (a replay is a real event, F15: no dedup). No minimum duration, no confidence threshold (F15's
  decisions stand: the owner prunes with Delete).
- **Rationale**: the library gives no score, and the owner's imports show skew-derived values (86–98) they already read; the
  fork's dedup and `filter_by_duration` (`core/track.py:244–308`) drop replays and short tracks, which F15 explicitly refused.
- **Alternatives**: a fixed 100 for every match (loses the one signal there is); the fork's "highest confidence wins the start
  time" (moves a track's start to a later probe; rejected).

- **Revised 2026-11-06 after the first live set**: `max_skew` defaults to **0.1**, not 0.001. In a DJ set tracks are pitched:
  a Kiosk Radio set matched Theo Muller at 25:00 with frequency skew −0.042 and time skew −0.044 (played about 4 % slow), and
  0.001 had turned that and every other pitched match into "no match" (14 probes in a row). The library compares the larger
  of the two skews of the first match. With equal time and frequency skews a match is a real track played at another speed, so
  the skew-derived confidence reads low (57) for a correct row; it stays display only (F15: no threshold).

## D6. Metadata emitted per track (the F15 shape)

`song_name` ← `track.title`; `artist` ← `track.subtitle`; `time_in_mix`; `confidence`; `duration: null`; `metadata.isrc`
← `track.isrc` (when present); `metadata.label` ← the `SONG` section's `Label` entry; `metadata.album` ← `Album`;
`metadata.release_date` ← `Released`; `metadata.genres` ← `[genres.primary]`; `metadata.shazam_id` ← `track.key`;
`metadata.artwork_url` ← `images.coverart`; `metadata.links.shazam` ← `track.url` (only when `https://` and on
`shazam.com`, the same rule the app applies). Absent fields are omitted, never `null`-filled. The parser (`tracklistify.ts`)
needs only `song_name`, `artist`, `mix_info.title`, `mix_info.audio_filename`; everything else is optional and verified by
`test_scan.py` against the app's fixture keys.

## D7. Download: yt-dlp imported, `bestaudio`, no post-processing, ffmpeg only for probes

- **Decision**: `yt_dlp.YoutubeDL({...}).extract_info(url, download=True)` in-process (so the Windows executable carries it,
  FR-023), with `noplaylist: True`, `match_filter: yt_dlp.utils.match_filter_func('!is_live')`, `format: 'bestaudio/best'`,
  `outtmpl: '<job dir>/%(id)s.%(ext)s'`, `max_filesize: 2 GiB`, `socket_timeout: 30`, `retries: 3`, `quiet`, optional
  `cookiefile` (`WORKER_YTDLP_COOKIES`), `ffmpeg_location` (the packaged ffmpeg of D9, or `WORKER_FFMPEG`). The returned info gives `title`, `uploader`/`channel`, `duration`, `requested_downloads[0].filepath`. No
  `-x` extraction: shazamio-core decodes the native container (SoundCloud MP3/AAC, YouTube WebM-Opus/M4A, Mixcloud M4A), so
  ffmpeg is needed only for the probes. `yt_dlp.utils.DownloadError` messages map to the one-line reasons of FR-018 ("Private
  video" / "Video unavailable" / "This video is private" → "Private or removed link"; "Unsupported URL" → "Unsupported or
  unreachable link"; the live filter → "Live streams are not supported"; `max_filesize` → "Download refused (file too
  large)"; anything else → "Download failed: <first line>"). A playlist URL without a single item → "Playlist links are not
  supported; paste one set".
- **Rationale**: FR-015 (any link yt-dlp supports, no platform treated specially), FR-023; a subprocess would not exist inside
  the executable. Recent yt-dlp needs a JavaScript runtime (Node or Deno) for YouTube; the manual says so and the worker's
  `check` reports whether one is on PATH, without failing (other platforms need none).
- **Alternatives**: a `yt-dlp` subprocess (rejected for the executable); `-x --audio-format m4a` (rejected: a re-encode and a
  second ffmpeg use for nothing).

## D8. Sign-in: the app's magic link caught on the local dev address (default), the email code as the option; a session file at 0600

- **Decision (revised 2026-11-06, after the owner found the template locked)**: `mix-worker login` asks for the email,
  generates a PKCE verifier, calls `POST /auth/v1/otp?redirect_to=http://127.0.0.1:5173/myOwnSpotifyData/?link=worker` with
  `{email, create_user: false, code_challenge, code_challenge_method: "s256"}` (the app's own request), listens on
  `127.0.0.1:5173` for the link's redirect (`?code=…`, up to ten minutes; the owner opens the mail on that computer), exchanges
  it with `POST /auth/v1/token?grant_type=pkce {auth_code, code_verifier}`, and stores the session. Nothing to configure: that
  address is the dev redirect URL every project already allows (ADR-01). `login --code` keeps the typed six-digit code
  (`POST /auth/v1/otp`, then `POST /auth/v1/verify {type: "email", email, token}`) for a project whose template carries
  `{{ .Token }}`. Both store `{email, access_token, refresh_token,
  expires_at}` in `WORKER_SESSION_FILE` (default `~/.config/myownspotifydata-worker/session.json` on Linux/macOS,
  `%APPDATA%\myownspotifydata-worker\session.json` on Windows; beside the executable when a `session.json` exists there),
  mode 0600. Every run refreshes when under 60 s of validity remain (`grant_type=refresh_token`); a 401 on refresh exits 4
  ("run `mix-worker login` again"). `logout` calls `/auth/v1/logout` and deletes the file. No dashboard setup: Supabase locked
  the auth email templates of new Free projects on its default mailer on 2026-06-03 (changelog "Changes to email template
  customisation on Free tier"; custom SMTP unlocks them), and the owner's project of 2026-11-05 is one of them, so the
  `{{ .Token }}` line cannot be added there; the link needs no template. Signups stay off; one mail per 60 s.
- **Rationale**: the computer running the worker has a mail client and a browser, so the link lands where the verifier is;
  no password (declined for the app), never the `service_role` key (the owner's standing rule; it would bypass RLS). The session
  is an ordinary user session under the same RLS as the app's. Port 5173 is taken only during `login` and only when the app's
  dev server is not running; the message says so and points at `--code`.
- **Alternatives**: custom SMTP to unlock the template (a third-party mail account to keep; kept as the way to the `--code`
  form if ever wanted); pasting the link's redirect URL into the terminal (fiddlier than the local catcher); `service_role`
  (rejected).

## D9. Packaging: a `uv` project, stdlib tests, ffmpeg from a wheel, PyInstaller executables for three systems (owner's pick)

- **Decision**: `worker/pyproject.toml` (`[project] name = "mix-worker"`, `requires-python = ">=3.11,<3.14"`, dependencies
  `yt-dlp`, `shazamio==0.9.0`, `imageio-ffmpeg`; `[project.scripts] mix-worker = "mix_worker.cli:main"`; `[dependency-groups]
  build = ["pyinstaller>=6.11"]`), `uv.lock` committed; tests with `unittest` (`python -m unittest discover -s worker/tests -t
  worker`), no pytest. **ffmpeg comes from `imageio-ffmpeg`**: that wheel carries a static `ffmpeg` binary per platform
  (Windows x64, Linux x86_64/aarch64, macOS x86_64/arm64) and exposes `imageio_ffmpeg.get_ffmpeg_exe()`; `uv sync` installs it
  for the command line form and PyInstaller packs it into each executable (`--collect-all imageio_ffmpeg`). `WORKER_FFMPEG`
  only overrides it. CI (`ci.yml`): `actions/setup-python@v6` 3.13 + `astral-sh/setup-uv@v6`, `uv sync --directory worker`,
  the unittest step. `worker-release.yml` on tag `worker-v*`: a matrix of `windows-latest`, `ubuntu-22.04` (older glibc, so the
  binary runs on more distributions), `macos-latest` (Apple silicon) and GitHub's Intel macOS runner while one is offered; each
  job: sync with `--group build`, the tests, `uv run pyinstaller mix-worker.spec` (`--onefile`, console, `--collect-all yt_dlp`,
  `--collect-all shazamio_core`, `--collect-all imageio_ffmpeg`), `./dist/mix-worker --version` then `check` (which runs
  `ffmpeg -version` from inside the bundle) as the smoke test, upload the asset named `mix-worker-<os>-<arch>[.exe]`; a final
  job creates one release with every asset (`gh release create <tag> --generate-notes`, `permissions: contents: write`). The
  executable reads `mix-worker.env` beside itself (or `--config PATH`); with no command it runs `login` if there is no session
  and then `run --watch`; with no config file it writes `mix-worker.env` from the template and exits 6.
- **Rationale**: FR-021–FR-023 and the owner's picks (three systems; "no way to install ffmpeg inside?" → yes, this way);
  PyInstaller cannot cross-build, so one runner per system builds; `uv` is on the owner's computer and locks every library;
  stdlib `unittest` adds no package (ADR-06). A wheel-shipped ffmpeg removes the one manual install of the previous design and
  the "ffmpeg beside the executable" edge case.
- **Confirmed on 2026-11-06 (smoke on this computer, a public YouTube video)**: download through yt-dlp with Node present
  (15 s for a 4-minute video), one probe recognised with `matches: 7`, `track.isrc`, the `Label` section and skews around 1e-5
  (confidence 99.9); `max_skew=0.001` kept the match.
- **Confirmed on 2026-11-06 (T002)**: `uv sync` resolves `imageio-ffmpeg 0.8.1` (BSD-2-Clause), `yt-dlp 2026.10.26`,
  `shazamio 0.9.0` + `shazamio-core 2.0.0`; the Linux binary is `ffmpeg-linux-x86_64-v9.0.2` (`n9.0.2-17-g2a571b6068-20260930`,
  a BtbN FFmpeg-Builds build configured `--enable-gpl --enable-version3`, so **GPL v3**), **172 MB**. The worker (MIT) runs it as a
  separate process and ships it unmodified, so the release notes and `worker/README.md` carry the GPL notice and the link to the
  build's source (github.com/BtbN/FFmpeg-Builds); each executable will be about 200 MB. Still to confirm: that `get_ffmpeg_exe()`
  resolves inside a PyInstaller one-file bundle on each system (the `check` smoke test, T044/T045).
- **Alternatives**: Nuitka (slower builds, no gain); ffmpeg beside the executable, downloaded by the owner (the previous
  design; rejected by the owner); the PyAV wheel (ffmpeg as a library, cutting probes in-process: no subprocess, but a 40 MB
  binary dependency with its own API; kept as the fallback if `imageio-ffmpeg` misbehaves inside the bundle); bundling a GPL
  ffmpeg build by hand in the release (licence bookkeeping; rejected).

## D10. The stale limit and the loop

- **Decision**: `WORKER_STALE_SECONDS` default **21600** (6 h: a slow download plus a 4-hour set at one probe a minute is under
  three hours); `WORKER_MAX_DURATION_SECONDS` default 0, no limit, since 2026-11-06 (the owner's pick after a 4 h 55 min all-night set was refused at 4 h), checked on yt-dlp's metadata before any audio is fetched (`extract_info(download=False)`, then `process_ie_result`), the reason naming the length and the limit; `run --once`
  claims until `claim_job` returns `[]`, `run --watch` then sleeps `WORKER_POLL_SECONDS` (default 60) and claims again; Ctrl-C
  during a request sets the row back to `queued` (best effort, 3 s timeout) and exits 130; a paused or unreachable server ends
  the run (exit 3 / 2), never a loop.
- **Rationale**: FR-010, FR-012, FR-013, FR-017, US2 scenario 4, the spec's edge cases.

## Sizes (to be measured in the quickstart)

A two-hour set: ~120 probes, ~9 minutes of scanning, a result of 20–60 KB (well under the 900 000-byte guard); the audio
(80–200 MB) deleted at the end; each executable ≈ 80–150 MB with ffmpeg inside.
