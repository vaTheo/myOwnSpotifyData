# mix-worker — identify a set's tracks from your computer

The owner's-computer half of the app's **Identify on my computer** button (Mix screen). You paste a set's link on the
phone and tap; this program, running on your computer whenever you start it, takes the request from your Supabase project,
downloads the audio, recognises the tracks with Shazam twelve seconds at a time, writes a tracklist in the same JSON the
app's Tracklistify import reads, sends it back, and deletes the audio. The next sync shows the rows on the phone; the
playlist is still created by your tap there. Nothing here ever talks to Spotify.

Design record: `../specs/002-mix-analysis-worker/` (the spec, the research, the contracts). Rules for changes: `CLAUDE.md`.

## Two ways to run it

### A. From this folder (Linux, macOS, Windows with Python)

Needs Python 3.11–3.13 and [uv](https://docs.astral.sh/uv/). ffmpeg comes with the install.

```sh
cd worker
cp .env.example .env        # fill SUPABASE_URL and SUPABASE_KEY: the two public values of the app's .env
uv sync                     # installs yt-dlp, ShazamIO and a static ffmpeg into .venv
uv run mix-worker check     # what it resolved, nothing missing?
uv run mix-worker login     # your email, then the 6-digit code from the mail (once per computer)
uv run mix-worker run --once      # process the queue, then exit
uv run mix-worker run --watch     # keep polling every 60 s until Ctrl-C
```

### B. The packaged executable (no Python, no ffmpeg to install)

Download the file for your system from the latest `worker-v…` release of the repository and put it in a folder of its own:

| System | File | First start |
|---|---|---|
| Windows 10/11 64-bit | `mix-worker-windows-x64.exe` | double-click; "Windows protected your PC" → More info → Run anyway |
| Linux 64-bit | `mix-worker-linux-x86_64` | `chmod +x mix-worker-linux-x86_64 && ./mix-worker-linux-x86_64` |
| macOS Apple silicon / Intel | `mix-worker-macos-arm64` / `mix-worker-macos-x86_64` | right-click → Open the first time (unsigned) |

The first start writes `mix-worker.env` beside the executable and exits. Fill `SUPABASE_URL` and `SUPABASE_KEY`, start
again: it asks for your email and the code once, keeps the session in that folder (`session.json`, next to it), then polls
until you close the window. The same commands work from a terminal: `mix-worker-windows-x64.exe check`, `… run --once`.

Only **YouTube** links need one more thing: a JavaScript runtime on the computer, [Node](https://nodejs.org) or
[Deno](https://deno.com) (`check` says whether one is found). SoundCloud, Mixcloud and the rest need nothing.

## Before the first login (once, in the Supabase dashboard)

1. Authentication → Email Templates → **Magic Link**: add a line `Your code: {{ .Token }}` under the existing link. The
   app's own sign-in link keeps working; the worker uses the code.
2. SQL editor: run `supabase/migrations/0002_jobs.sql` (after `0001_init.sql`). It adds the `claim_job` function the worker
   calls and the `applied_at` column the app uses.

## What you see

One line per step, on the terminal and in the log file:

```
mix-worker 0.1.0 · https://….supabase.co · as you@example.com · on laptop
claimed 6f1c2d3e · https://soundcloud.com/…
  download · abc123.m4a · 7260 s · 38.2 s
  scan · 41 tracks · 540.3 s
  write · 2026-11-06 Some set [6f1c2d3e].json · 0.0 s
  send · 24510 bytes · 0.4 s
  clean · audio removed · 0.0 s
done 6f1c2d3e
queue empty
```

A request that fails (a private link, no track identified, a set over four hours, the recognition service refusing) is
marked failed with that reason, the phone shows it, and the worker moves on. Ctrl-C during a request puts it back in the
queue. The scanned JSON stays in your music folder, so you can also import it by hand on the Mix screen.

## Exit codes

| Code | Meaning | What to do |
|---|---|---|
| 0 | done, or the queue was empty | — |
| 2 | the server is unreachable | check the connection, try later |
| 3 | the Supabase project is paused | Resume project in the dashboard, then run again |
| 4 | not signed in, or the session expired | `mix-worker login` |
| 5 | a setting is missing or ffmpeg cannot start | the message names the setting and the file |
| 6 | the settings template was just written (packaged form) | fill the two values, start again |
| 130 | stopped with Ctrl-C | the current request was released |

## Settings

`worker/.env` (form A) or `mix-worker.env` beside the executable (form B); an environment variable with the same name wins.
Only the first two are required.

| Name | Default | Meaning |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_KEY` | — | the project URL and publishable key (public values; nothing secret lives here) |
| `WORKER_NAME` | the computer's hostname | shown on the phone as "Running on <name>" |
| `WORKER_SESSION_FILE` | `~/.config/myownspotifydata-worker/session.json` (`%APPDATA%\myownspotifydata-worker\` on Windows; `session.json` beside the executable when present) | the sign-in session, readable by you only |
| `WORKER_WORK_DIR` | `~/.cache/myownspotifydata-worker` (`%LOCALAPPDATA%\…` on Windows) | one folder per request while it runs; the log file |
| `WORKER_JSON_DIR` | `~/Music/mix-worker` | the kept tracklists, `<date> <title> [<id>].json` |
| `WORKER_LOG_FILE` | `<WORKER_WORK_DIR>/worker.log` | every line, with the time |
| `WORKER_FFMPEG` | the packaged ffmpeg | another ffmpeg to use instead |
| `WORKER_YTDLP_COOKIES` | none | a Netscape cookies file for platforms that need your login |
| `WORKER_PROXY` | none | an HTTP proxy for the recognition calls |
| `WORKER_STALE_SECONDS` | 21600 | a request left "running" longer than this (a crash, a power cut) is taken again |
| `WORKER_POLL_SECONDS` | 60 | `--watch`: seconds between two looks at the queue |
| `WORKER_MAX_DURATION_SECONDS` | 14400 | longer sets fail with "Set longer than 4 hours" |
| `WORKER_PROBE_STEP_SECONDS` | 60 | one 12-second probe every N seconds of the set |
| `WORKER_COOLDOWN_SECONDS` | 3.0 | the pause before every recognition call |
| `WORKER_RATE_LIMIT_PAUSE_SECONDS` | 300 | the one pause when the service answers "rate limited"; a second refusal fails the request |
| `WORKER_MAX_SKEW` | 0.001 | drops a skewed (likely wrong) match; 0 disables |
| `WORKER_MERGE_GAP_SECONDS` | 180 | the same track heard again within this gap stays one row |
| `WORKER_RESULT_MAX_BYTES` | 900000 | larger results fail with "Result too large" |

## Where things go, what leaves the computer

- Outbound hosts: your Supabase project, the platform of the link (through yt-dlp), `amp.shazam.com` (ShazamIO), and
  the proxy if you set one. Never a Spotify host. The audio never leaves the computer; only the tracklist JSON is sent.
- On disk: the session file (mode 600), the work folder (emptied after each request), the kept JSON files, the log.
- Inside the executables: yt-dlp, ShazamIO and a static ffmpeg built by [BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds)
  under the **GPL v3**, shipped unmodified through the `imageio-ffmpeg` package (BSD-2-Clause). The worker and the app are MIT.

## Troubleshooting

- **"not signed in"**: `mix-worker login`. The code mail needs the template line above; the code is valid one hour.
- **"the project is paused"**: Supabase pauses a Free project after a week without traffic; resume it from the dashboard.
- **"Recognition service refused (rate limited)"**: Shazam throttled the computer's address; wait, or raise
  `WORKER_COOLDOWN_SECONDS`. The request can be asked again from the phone.
- **"Live streams are not supported" / "Playlist links are not supported"**: paste the link of one recorded set.
- **YouTube: "Download failed"** mentioning a JavaScript runtime: install Node or Deno.
- **Result rejected** on the phone: the app refused the tracklist's shape; keep the JSON from your music folder and
  import it by hand to see the parser's message.

## For changes

Tests: `uv run python -m unittest discover -s tests` (no network, everything faked). Build the executable locally:
`uv run --group build pyinstaller mix-worker.spec`, then `dist/mix-worker --version` and `check`. A release:
tag `worker-vX.Y.Z` on `main`; the workflow builds the four executables and creates the release.
