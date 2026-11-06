One executable per system, from `worker/` at this tag. Put it in a folder of its own, start it once (it writes
`mix-worker.env`), fill `SUPABASE_URL` and `SUPABASE_KEY`, start it again. The manual: `worker/README.md`.

- `mix-worker-windows-x64.exe`: Windows 10/11, 64-bit. Windows warns the first time ("Windows protected your PC"): More info → Run anyway.
- `mix-worker-linux-x86_64`: `chmod +x` first. Built on Ubuntu 22.04, runs on distributions with glibc 2.35 or newer.
- `mix-worker-macos-arm64` (Apple silicon) and `mix-worker-macos-x86_64` (Intel): right-click → Open the first time (unsigned).

Inside: yt-dlp, ShazamIO and a static ffmpeg built by BtbN/FFmpeg-Builds under the GPL v3, shipped unmodified through the
`imageio-ffmpeg` package (its own licence: BSD-2-Clause). The worker itself is MIT, like the app. YouTube links need Node or
Deno on the computer; other platforms need nothing else.

## What changed

- 0.2.0: listens to 12 s every 15 s, 80 % of the set (was 10 s every 60 s): far more heard, fewer wrong matches; a 2 h set
  takes about 40 minutes (`WORKER_PROBE_STEP_SECONDS=12` hears all of it, `30` or `60` is quicker). A recognition that hangs is cut off after 45 s and retried, then skipped; the sign-in is refreshed
  before sending; a console that cannot print a title no longer stops the worker.
