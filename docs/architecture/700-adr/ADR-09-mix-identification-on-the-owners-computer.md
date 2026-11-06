# ADR-09 — Mix identification by audio runs only on the owner's computer, keyless, one call at a time

> **Status**: Accepted
> **Date**: 2026-11-06

## Context

The app's rule for external data is "keyless, keyed by Spotify id or ISRC, never by name" (ADR-04), and "any audio fetch,
fingerprinting or recognition API" was out of scope for the browser (Limits §3). The owner wants a set's tracklist from a link
without sitting at the computer. The tool they ran by hand (F15, Tracklistify) is no longer public, and its surviving copy drops
the per-track ISRC the app's playlist matching relies on. ADR-08 left a job queue on the server and said any worker runs on the
owner's computer.

## Decision

- **Recognition by audio happens only in the worker**, the program on the owner's computer (`worker/`), never in the app and
  never on the server. The app's rule stands for `src/`: it never fetches or analyses audio; it only reads the JSON the worker
  sent, through the queue, and validates it like any pulled row.
- **The recogniser is keyless and paced.** Shazam through the ShazamIO library, as the hand-run tool was; one 12-second probe
  at a time with a cooldown, one pause on a refusal, then a failed request. No API key, no paid service; a key a future
  provider needs would live on the owner's computer only (ADR-08).
- **The result is the F15 shape.** One JSON per set with title, file name and one entry per track (time in the mix, artist,
  title, confidence, ISRC, label, Shazam link when known), so the app has one parser for the hand import and the worker.
- **The worker never calls Spotify** (Principle III stays at two write sites, both taps in the app) and ships as a `uv`
  project and as one unsigned executable per system built by CI from a tag, with yt-dlp and a static ffmpeg inside.

## Consequences

**Positive:** the phone only asks and reads; the computer does the work whenever it is on; ISRC is back on most rows; one
JSON shape for two paths; nothing new in the browser's dependency list.

**Negative / watch for:** Shazam's tolerance for unauthenticated calls is undocumented (the pacing is a guess from the
surviving copy and the library's issues; a refusal fails the request, never loops); the executables are unsigned (Windows and
macOS warn); the ffmpeg inside is a GPL v3 build shipped unmodified (the release notes say so); YouTube needs a JavaScript
runtime on the computer; a library that mimics a phone app may break with the service.

## Links

- Spec: [Identify a mix on my computer](../../specs/2026-11-06-mix-analysis-worker-design.md) (full round under
  `specs/002-mix-analysis-worker/`)
- [ADR-08](ADR-08-owner-server-free-tier.md) (the queue, the worker outside the server), [ADR-04](ADR-04-keyless-sources-by-id.md)
  (keyless sources in the app), [ADR-03](ADR-03-library-writes-on-tap.md) (two write sites)
- Constitution: `.specify/memory/constitution.md` Principle IV
- [ADR index](README.md) · [Limits and roadmap](../800-limits-roadmap.md)
