# Identify a mix on my computer (the worker): design

> **Status**: Implemented (2026-11-06, inventory F19); the owner's validation on the live project and the Windows/macOS
> executables pending
> **Last updated**: 2026-11-06

Date: 2026-11-06. Driven with the Spec Kit skills; the specification, research, data model, contracts, quickstart and task list
live under [`specs/002-mix-analysis-worker/`](../../specs/002-mix-analysis-worker/spec.md). This page is the short record the
documentation map expects.

## What it is

On the Mix screen the owner pastes a set's link and taps **Identify on my computer**. The app records one request on the
owner's server (the `jobs` table of [ADR-08](../architecture/700-adr/ADR-08-owner-server-free-tier.md)). On the owner's
computer, `mix-worker` (a Python program under `worker/`, also packaged as one executable per system) takes the oldest request,
downloads the audio with yt-dlp, recognises it twelve seconds at a time with ShazamIO, merges the hits into one row per track,
writes the JSON the app's Tracklistify import already reads (F15), sends it back and deletes the audio. The next sync shows the
rows on the saved mix for that link; "Create playlist from mix" is unchanged. Recognition by audio happens only on the owner's
computer ([ADR-09](../architecture/700-adr/ADR-09-mix-identification-on-the-owners-computer.md)); the app and the server never
touch audio, the worker never touches Spotify.

## Decisions (owner's picks, 2026-11-06)

1. **Python, packaged.** The worker is Python 3.11–3.13 managed by `uv`, tests with the standard library's `unittest` (one
   Python step in CI), and one PyInstaller executable per system (Windows x64, Linux x86_64, macOS arm64 and x86_64) built by
   a release workflow on a `worker-v*` tag; yt-dlp and a static ffmpeg (from the `imageio-ffmpeg` wheel, GPL v3 build by
   BtbN) are inside, so nothing is installed by hand but Node or Deno for YouTube links.
2. **Own scanner on ShazamIO, no Tracklistify.** The tool the owner used (betmoar's) is gone from GitHub and its surviving
   copy emits no ISRC; the worker's scan writes the same JSON with ISRC, label and the Shazam link per track.
3. **One 12-second probe a minute, one call at a time.** ShazamIO only ever fingerprints twelve seconds; probes are cut by
   ffmpeg to mono 16 kHz WAV (through a scratch file: a pipe leaves the WAV header unfilled and the decoder refuses it), with a
   3-second cooldown before each call, a single 5-minute pause on a "rate limited" answer and a failed request on the second.
   Confidence is the fork's skew formula (so the column means what earlier imports meant); `max_skew=0.001` drops skewed
   matches; a track heard again within 180 s stays one row, a replay later is a new row (F15: no dedup, no threshold).
4. **Any link yt-dlp supports; the audio is deleted once the result is sent; the JSON is kept** in `~/Music/mix-worker`.
5. **Sign-in by the app's magic link, caught locally.** `mix-worker login` asks for the link in the PKCE flow with
   `http://127.0.0.1:5173/myOwnSpotifyData/` as the redirect (the dev address every project already allows), listens there, and
   exchanges the code it receives. Nothing to configure in the dashboard: the email code first planned needs a template line
   that a Free project created after June 2026 on the default mailer cannot edit (the owner hit that on 2026-11-06); `login
   --code` keeps that path for a project with custom SMTP. The session file lives outside the repo at mode 600; the
   `service_role` key is never used.
6. **Results apply once.** Migration `0002` adds `applied_at` and a `claim_job` function (oldest queued, or a request left
   running longer than six hours; `for update skip locked`); the app merges a done result into the saved mix, flags the mixes
   push and marks the row, so a second device gets the mix through the mixes sync. A result the safety check refuses is counted
   and shown as "Result rejected".
7. **The merge keeps edits.** Untouched scan rows are replaced by a new result; manual, pasted, TrackId, description and
   edited rows stay.

## Measurements (this computer, 2026-11-06)

A 4-minute public YouTube video: download 4–15 s (Node present), three probes recognised in 11 s (one merged row, ISRC and
label present, confidence 99.9). The Linux executable: 100 MB. A full set on the owner's project: to be recorded after the
owner's validation (quickstart §3 scenario 2).

## Out of scope (stated so it is not re-litigated)

A Spotify call from the worker or the server; audio in the browser; running the worker anywhere but the owner's computers;
a push notification to the phone; storing audio on the server; a confidence threshold or dedup; other job kinds; more than one
person; signed executables.

## Compatibility

No `DB_VERSION` bump: optional `MixRow` fields (`identifyJobId`, `identifiedAt`, `sources.worker`) and one `meta` name
(`mixJobs`). The hand import of a kept JSON still works. Without a server the Mix screen's button reads "Server not set up
(Settings)" and everything else is the previous app.
