One executable per system, from `worker/` at this tag. Put it in a folder of its own, start it once (it writes
`mix-worker.env`), fill `SUPABASE_URL` and `SUPABASE_KEY`, start it again. The manual: `worker/README.md`.

- `mix-worker-windows-x64.exe`: Windows 10/11, 64-bit. Windows warns the first time ("Windows protected your PC"): More info → Run anyway.
- `mix-worker-linux-x86_64`: `chmod +x` first. Built on Ubuntu 22.04, runs on distributions with glibc 2.35 or newer.
- `mix-worker-macos-arm64` (Apple silicon) and `mix-worker-macos-x86_64` (Intel): right-click → Open the first time (unsigned).

Inside: yt-dlp, ShazamIO and a static ffmpeg built by BtbN/FFmpeg-Builds under the GPL v3, shipped unmodified through the
`imageio-ffmpeg` package (its own licence: BSD-2-Clause). The worker itself is MIT, like the app. YouTube links need Node or
Deno on the computer; other platforms need nothing else.

## What changed

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
