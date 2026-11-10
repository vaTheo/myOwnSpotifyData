One executable per system, from `worker/` at this tag. Put it in a folder of its own, start it once (it writes
`mix-worker.env`), fill `SUPABASE_URL` and `SUPABASE_KEY`, start it again. The manual: `worker/README.md`.

- `mix-worker-windows-x64.exe`: Windows 10/11, 64-bit. Windows warns the first time ("Windows protected your PC"): More info → Run anyway.
- `mix-worker-linux-x86_64`: `chmod +x` first. Built on Ubuntu 22.04, runs on distributions with glibc 2.35 or newer.
- `mix-worker-macos-arm64` (Apple silicon) and `mix-worker-macos-x86_64` (Intel): right-click → Open the first time (unsigned).

Inside: yt-dlp, ShazamIO and a static ffmpeg built by BtbN/FFmpeg-Builds under the GPL v3, shipped unmodified through the
`imageio-ffmpeg` package (its own licence: BSD-2-Clause). The worker itself is MIT, like the app. YouTube links need Node or
Deno on the computer; other platforms need nothing else.

## What changed

- 0.7.2: **a wrong match inside a song is dropped**. When Shazam hears song A, then a different song, then A again, and the two A
  clips are at most `WORKER_MERGE_GAP_SECONDS` apart (3 minutes by default), the song in between is a false match inside A (a sample,
  a vocal, a quiet bar): the worker drops it and A stays one row with its clips added up. The log says "scan · N findings between two
  hits of the same song dropped". Only Shazam's clips are filtered: TrackId.net rows and comment rows are never dropped by it. No new
  setting (raising the merge gap raises both); the app needs no update.
- 0.7.1: **the mode follows the account**. `WORKER_MODE` now defaults to `auto`: after sign-in the worker asks the server whether the
  account is listed in `shared_workers` and runs as a shared worker if it is, as a personal worker if it is not (the start line says
  which). `personal` and `shared` still force a mode. A failed check (no network) ends the run with exit code 2 and never guesses a
  mode. A `mix-worker.env` you already have is kept: if it says `WORKER_MODE=shared` or `personal`, change it to `auto` (or delete the
  line). The app needs no update.
- 0.7.0: **TrackId.net**. The worker asks TrackId.net about the exact mix link (never a search by name; `WORKER_TRACKID=off` turns it
  off) once per request, before the first probe. When TrackId.net knows the mix, the first pass makes **one confirming Shazam probe
  per span** it names, centred on the span's middle, and **no other probe inside it**; each span becomes a row ("from TrackId.net",
  not heard) with a **Shazam check** (agrees, differs, no match, not asked). TrackId.net is the source of truth: a Shazam answer never
  replaces, clips or removes its row. When it knows nothing, fails or is off, the scan is as before. A `mix-worker.env` you already
  have is kept, so add `WORKER_TRACKID=on` by hand if you want the line. **The app must be updated first**: wait for the Pages
  deploy and hard-reload the app before using worker 0.7.0, because an old app refuses the new rows.
- 0.6.0: a **shared mode**. With `WORKER_MODE=shared` (default `personal`, today's behaviour) the worker takes the identification
  requests of every user of the app, one request per user in turn, and sends each result to the person who asked. The account it
  signs in with must be listed by the owner in `shared_workers`; at start it asks the server and stops with **exit code 7** when it is
  not listed (also when the listing is removed during a run). The start line ends with "shared worker". Personal mode and its
  server calls are unchanged. Owner steps, once: create the worker user in the Supabase dashboard (a dedicated email) and add it to
  `shared_workers`; apply `supabase/migrations/0006_shared_worker.sql`; set `WORKER_MODE=shared` in `mix-worker.env` and sign in with
  the worker email. A `mix-worker.env` you already have is kept as it is, so add that line by hand.
- 0.5.3: the default of `WORKER_SECOND_PASS_SPEEDS` is `0.91,1.09,1` (both shifted speeds first, then normal speed), in the code, the
  packaged `mix-worker.env` template and `.env.example`. 0.5.2 still wrote `0.96,1.04`. A `mix-worker.env` you already have is kept
  as it is.
- 0.5.2: the second pass tries the speeds of `WORKER_SECOND_PASS_SPEEDS` in the order listed (the default and the packaged
  `mix-worker.env` template now match `worker/.env.example`). 0.5.1 shipped the older template and order. A double-clicked Windows
  executable that stops on a problem (bad or missing setting, first-start template, any crash) keeps its window open: it prints the
  message and waits for Enter.
- 0.5.1: every probe line says how long Shazam took to answer (`· shazam 6.8 s`), and the scan ends with a summary
  (`shazam · 712 answers · median 1.1 s · 140 over 5 s (20 %)`). On 2026-11-06 a call took 3 s in some hours and 9 s in others,
  with the clip cut unchanged: this tells a slow Shazam from our own pace.
- 0.5.0: each heard track carries its release year. Shazam's year is kept (an invalid one, like "0000", is removed); a track with an ISRC and no year gets the earliest
  year Deezer or MusicBrainz give for that ISRC (`release_date`, with `release_date_from`). These lookups share the
  `WORKER_LOOKUPS` cap with the clues (clues first; 0 turns both off); a catalogue that does not answer leaves the year out,
  never fails the set. The log has one "years" line per set.

- 0.4.1: back to 1.9 s + 0–30 % between Shazam calls (1.9 to 2.47 s). 0.4.0 shipped 1.5 s; a test at 1.0 s + 0–50 % was
  refused every ~21 calls, while ~780 calls at 1.9 s off the VPN had none. Stay off a VPN: on one, refusals came every 24–380 calls.
- 0.4.0: each heard track keeps how many 12 s clips matched it and its best score (`hits`); the phone shows the scan's
  progress (step, %, minutes left, Shazam pauses) and can Cancel, Move to top and Stop requests (needs migration
  `0003_job_control.sql`; without it the worker works as before and logs it once); Ask again continues a stopped set; two
  refusals close together warn about a VPN; the second pass tries ×1 everywhere, then ×0.96, then ×1.04.

- 0.3.3: every line of a tracklist (description, or a comment listing 3+ tracks) becomes a row, catalogue or not; a
  catalogue only adds the ISRC. Pacing: 1.5 s + 0–30 % between calls (1.5 to 1.95 s) and a 3-minute pause + 0–40 % after a refusal
  (3:00 to 4:12); both spreads only add time and are settings (`WORKER_COOLDOWN_SPREAD_PERCENT`,
  `WORKER_RATE_LIMIT_PAUSE_SPREAD_PERCENT`).

- 0.3.2 (also): a Shazam refusal is an exact 6-minute pause, up to 8 a set, and the pace (3.3 s ± 30 %, 2.31 to 4.29 s; every spread wait ± 30 %)
  is never slowed; planned breaks are off by default: the day's refusals showed neither helped.

- 0.3.2: the planned break is exactly `WORKER_BREAK_SECONDS`, now 2 min, without the ± 40 % spread (owner).

- 0.3.1: the planned-break count of Shazam calls runs across sets (a set started right after another no longer starts at
  zero); YouTube comments: the 100 newest only (a popular video's thread ran past the 90 s limit); "second pass · N new
  tracks" counts new tracks only. Also since 0.3.0: the second pass skips stretches inside a known track, a planned break
  every 80 calls, all waits ± 40 %, the pace recovers after a refusal, a refusal once tracks were found sends them as done
  ("stopped early"), sends to the server are retried, no silent library retries.

- 0.3.0: fills the gaps. Where nothing was found, a second listen 7 s later at normal speed, then 4 % slower and faster.
  The set's description, chapters and comments are read; a tracklist in them is understood whatever its separator; a clue
  naming one track becomes a row "from a comment · not heard" when Deezer or MusicBrainz holds exactly that artist and title.
  New settings: `WORKER_SECOND_PASS_*`, `WORKER_CLUES`, `WORKER_CLUE_SECONDS`, `WORKER_LOOKUPS`.

- 0.2.0: listens to 12 s every 15 s, 80 % of the set (was 10 s every 60 s): far more heard, fewer wrong matches; a 2 h set
  takes about 40 minutes; the pause between two calls is 2.5 s ± 50 % (`WORKER_PROBE_STEP_SECONDS=12` hears all of it, `30` or `60` is quicker). A recognition that hangs is cut off after 45 s and retried, then skipped; the sign-in is refreshed
  before sending; a console that cannot print a title no longer stops the worker.
