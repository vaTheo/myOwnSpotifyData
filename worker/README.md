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
uv run mix-worker login     # your email, then click the mail's link on this computer (once per computer)
uv run mix-worker run --once      # process the queue, then exit
uv run mix-worker run --watch     # keep polling every 60 s until Ctrl-C
```

### B. The packaged executable (no Python, no ffmpeg to install)

Download the file for your system from the [latest release](https://github.com/vaTheo/myOwnSpotifyData/releases/latest) (`worker-v…`) and put it in a folder of its own:

| System | File | First start |
|---|---|---|
| Windows 10/11 64-bit | `mix-worker-windows-x64.exe` | double-click; "Windows protected your PC" → More info → Run anyway |
| Linux 64-bit | `mix-worker-linux-x86_64` | `chmod +x mix-worker-linux-x86_64 && ./mix-worker-linux-x86_64` |
| macOS Apple silicon / Intel | `mix-worker-macos-arm64` / `mix-worker-macos-x86_64` | right-click → Open the first time (unsigned) |

The first start writes `mix-worker.env` beside the executable and exits. Fill `SUPABASE_URL` and `SUPABASE_KEY`, start
again: it asks for your email, you open the mail on that computer and click its link (a tab says "mix-worker is signed in"),
it keeps the session in that folder (`session.json`, next to it), then polls until you close the window. The same commands work from a terminal: `mix-worker-windows-x64.exe check`, `… run --once`.

Only **YouTube** links need one more thing: a JavaScript runtime on the computer, [Node](https://nodejs.org) or
[Deno](https://deno.com) (`check` says whether one is found). SoundCloud, Mixcloud and the rest need nothing.

## Before the first login (once, in the Supabase dashboard)

SQL editor: run `supabase/migrations/0002_jobs.sql` (after `0001_init.sql`). It adds the `claim_job` function the worker
calls and the `applied_at` column the app uses. Nothing else.

How `login` works: it asks Supabase for the same magic link the app uses, with `http://127.0.0.1:5173/myOwnSpotifyData/` as
the return address (a project of this app already allows it), and listens there for a minute or ten. Click the mail's link
**on the computer running the worker**; the link opens a local page that says it is signed in. The app's dev server
(`yarn dev`) must not be running at that moment, since it uses the same port. `login --code` types a 6-digit code instead,
but only works when the project's Magic Link email template carries `{{ .Token }}`, which a Free project on Supabase's
default mailer created after June 2026 cannot edit (custom SMTP unlocks it).

## What you see

One line per step, on the terminal and in the log file:

```
mix-worker 0.1.0 · https://….supabase.co · as you@example.com · on laptop
claimed 6f1c2d3e · https://soundcloud.com/…
  download ·   1 % · 1.0 MB of 98.0 MB · 4.1 MB/s · 23 s left
  download ·   5 % · 4.9 MB of 98.0 MB · 4.1 MB/s · 22 s left
  …
  download · 100 % · 98.0 MB
  download · abc123.m4a · 7260 s · 38.2 s
  scan · ffmpeg …/ffmpeg-linux-x86_64-v9.0.2 · one 12 s probe every 15 s · 484 probes · cooldown 3.0 s (±40 %)
  probe 1/484 · 00:00:00 · cut 375 KB 0.06 s · NEW · Stefan Gubatz — Noble Booth · DECH62001634 · Primary Colours · 99 %
  probe 2/484 · 00:00:15 · cut 375 KB 0.05 s · same track · Stefan Gubatz — Noble Booth · DECH62001634 · Primary Colours · 98 %
  probe 3/484 · 00:00:30 · cut 375 KB 0.06 s · no match
  …
  second pass · 210 probes found nothing · 104 places heard again (+7 s, speed ×1 then ×0.96 then ×1.04)
  gap 1/104 · 00:00:37 ×1 · no match
  gap 1/104 · 00:00:37 ×0.96 · NEW · Someone — Pitched Track · … · 91 %
  …
  second pass · found 9 in 104 places
  scan · 48 tracks · 2410.3 s
  clues · 35 read in 3.2 s
  candidate · 00:51:32 · Space Above — Leave Home (Edit Select Remix) · deezer · NLCK41072412
  clues · 12 on gaps · 15 set-wide · 3 candidates · 18 looked up
  write · 2026-11-06 Some set [6f1c2d3e].json · 0.0 s
  send · 24510 bytes · 0.4 s
  clean · audio removed · 0.0 s
done 6f1c2d3e
queue empty · next look in 60 s
alive · waiting for a request · next look in 30 s
queue empty · next look in 60 s
```

After the first pass, the **second pass** listens again where nothing was found (not inside a stretch with the same track
just before and after it, up to 3 minutes: that is the same track): 7 s later than the probe that missed, at
normal speed, then 4 % slower, then 4 % faster (a DJ's pitch fader), stopping at the first match. Then the worker reads the
set's **description, chapters and comments** (the clues): the ones written around a part still without a track show on that
part on the Mix screen, a tracklist without times shows once above the tracklist, and a clue that reads as one
`Artist – Title` is looked up in Deezer, then MusicBrainz (a Discogs or Deezer link by its id). Only an exact artist and title
make a row, marked "from a comment · not heard"; it goes into Create playlist unless you delete it. A refusal during the second
pass, or comments that cannot be read, never fail the request.

A request that fails (a private link, no track identified, the recognition service refusing) is
marked failed with that reason, the phone shows it, and the worker moves on. Sets of any length are taken. Ctrl-C during a request puts it back in the
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
| `WORKER_HEARTBEAT_SECONDS` | 30 | `--watch`: an "alive" line this often while waiting, so you can see it still runs |
| `WORKER_MAX_DURATION_SECONDS` | 0 | no limit; set a number of seconds to refuse longer sets before the download |
| `WORKER_PROBE_STEP_SECONDS` | 15 | one probe every N seconds; with 12 s probes, 15 hears 80 % of the set (a 2 h set: 480 probes, about 40 minutes), 12 all of it, 30 or 60 for a quicker scan |
| `WORKER_PROBE_SECONDS` | 12 | the length of each probe sent to Shazam, 2 to 12 (Shazam fingerprints 12 s at most; 10 s matched 71 % against 94 %) |
| `WORKER_COOLDOWN_SECONDS` | 3.0 | the pause before every recognition call, give or take a random 40 % (1.8 to 4.2 s); every other wait (after a rate limit, a network retry) is spread ±40 % too; doubled after each rate limit, 30 s at most |
| `WORKER_RATE_LIMIT_PAUSE_SECONDS` | 300 | the pause after a "rate limited" answer; the second pause is twice as long, the third three times |
| `WORKER_RATE_LIMIT_PAUSES` | 3 | pauses allowed per set; one more refusal fails the request |
| `WORKER_SHAZAM_DEVICE` | android | the phone Shazam sees; `iphone` is the library's own default and was refused after three calls in testing |
| `WORKER_MAX_SKEW` | 0.1 | rejects a match more than 10 % off in pitch or speed; a DJ pitches tracks a few %, so keep it well above that; 0 disables |
| `WORKER_MERGE_GAP_SECONDS` | 180 | the same track heard again within this gap stays one row |
| `WORKER_RESULT_MAX_BYTES` | 900000 | larger results fail with "Result too large"; clues are left out first to fit |
| `WORKER_BREAK_EVERY_CALLS` | 80 | a planned break after this many recognition calls, before Shazam refuses; 0 = none |
| `WORKER_BREAK_SECONDS` | 180 | that break's length, ± 40 % |
| `WORKER_SECOND_PASS_STEP_SECONDS` | 30 | one place heard again every N seconds of a part without a track; 0 = no second pass |
| `WORKER_SECOND_PASS_OFFSET_SECONDS` | 7 | that place is this far after the probe that found nothing |
| `WORKER_SECOND_PASS_SPEEDS` | 0.96,1.04 | speeds tried after normal speed, in order; empty = normal only |
| `WORKER_CLUES` | 1 | read the description, chapters and comments; 0 = never |
| `WORKER_CLUE_SECONDS` | 90 | reading them may take this long, then it is dropped |
| `WORKER_LOOKUPS` | 100 | clues looked up by name per set (Deezer, then MusicBrainz); 0 = none, clues still shown |

## Where things go, what leaves the computer

- Outbound hosts: your Supabase project, the platform of the link (through yt-dlp), `amp.shazam.com` (ShazamIO), and
  the proxy if you set one. Never a Spotify host. The audio never leaves the computer; only the tracklist JSON is sent.
- On disk: the session file (mode 600), the work folder (emptied after each request), the kept JSON files, the log.
- Inside the executables: yt-dlp, ShazamIO and a static ffmpeg built by [BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds)
  under the **GPL v3**, shipped unmodified through the `imageio-ffmpeg` package (BSD-2-Clause). The worker and the app are MIT.

## Troubleshooting

- **"not signed in"**: `mix-worker login`, then click the mail's link on this computer within ten minutes.
- **"could not listen on port 5173"**: stop `yarn dev` (or whatever holds the port) and run `login` again.
- **"the project is paused"**: Supabase pauses a Free project after a week without traffic; resume it from the dashboard.
- **"Recognition service refused (rate limited)"**: Shazam throttled the computer's address four times before any track was
  found; wait, or raise `WORKER_COOLDOWN_SECONDS`. Once something was found, a refusal no longer fails the request: it is
  **done** with "Stopped early at 47:00 (rate limited); ask again later for the rest".
- **How the worker waits** (every wait ± 40 %): 3 s between calls; a 3-minute break every 80 calls; after a refusal a 5, 10,
  then 15-minute pause and twice the gap between calls, halved again after every 40 calls without refusal; a call without
  answer (45 s, or a Shazam server error) tried again after 10 s then 20 s; a send to your server tried again after 30 s,
  1 min and 2 min; Deezer or MusicBrainz busy, after 2 s then 4 s. The Shazam library itself never retries silently.
- **"no answer (TimeoutError…)" in the log**: one recognition took over 45 s; the probe is tried 3 times (10 s, then 20 s
  apart), then skipped and the scan goes on. Three probes in a row with no answer fail the request with "Recognition service
  did not answer; try later" (check the connection, then ask again).
- **"Live streams are not supported" / "Playlist links are not supported"**: paste the link of one recorded set.
- **YouTube: "Download failed"** mentioning a JavaScript runtime: install Node or Deno.
- **Result rejected** on the phone: the app refused the tracklist's shape; keep the JSON from your music folder and
  import it by hand to see the parser's message.

## For changes

Tests: `uv run python -m unittest discover -s tests` (no network, everything faked). Build the executable locally:
`uv run --group build pyinstaller mix-worker.spec`, then `dist/mix-worker --version` and `check`. A release
is automatic: every push to `main` that touches `worker/` reads the version in `pyproject.toml`; when no release
`worker-v<version>` exists, `.github/workflows/worker-release.yml` tests, builds the four executables and publishes the
release (tag included). To ship a change, bump the version in `pyproject.toml` **and** `mix_worker/__init__.py` (a test
checks they agree), run `uv lock`, add a line to `RELEASE_NOTES.md`, and merge.
