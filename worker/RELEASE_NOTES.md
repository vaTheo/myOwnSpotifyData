One executable per system, from `worker/` at this tag. Put it in a folder of its own, start it once (it writes
`mix-worker.env`), fill `SUPABASE_URL` and `SUPABASE_KEY`, start it again. The manual: `worker/README.md`.

- `mix-worker-windows-x64.exe`: Windows 10/11, 64-bit. Windows warns the first time ("Windows protected your PC"): More info → Run anyway.
- `mix-worker-linux-x86_64`: `chmod +x` first. Built on Ubuntu 22.04, runs on distributions with glibc 2.35 or newer.
- `mix-worker-macos-arm64` (Apple silicon) and `mix-worker-macos-x86_64` (Intel): right-click → Open the first time (unsigned).

Inside: yt-dlp, ShazamIO and a static ffmpeg built by BtbN/FFmpeg-Builds under the GPL v3, shipped unmodified through the
`imageio-ffmpeg` package (its own licence: BSD-2-Clause). The worker itself is MIT, like the app. YouTube links need Node or
Deno on the computer; other platforms need nothing else.
