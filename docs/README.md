# Documentation

> **Status**: Living
> **Last updated**: 2026-11-05

The map of the app's documentation, kept by hand: every page is listed here, in its section. How pages are named, headed and linked:
[Contributing](dev-guide/000-contributing.md), section "Documentation".

## Start here

- [README](../README.md) — what the app is, setup, the owner's manual.
- [100 — Feature inventory](architecture/100-features.md) — every feature, where it lives, its spec, when it shipped, its state.
- [000 — How the app works](architecture/000-how-it-works.md) — the reference for every "how does it work?" question.
- [CHANGELOG](../CHANGELOG.md) — what changed, when, and what to do after upgrading.

## Architecture

- [000 — How the app works](architecture/000-how-it-works.md)
- [100 — Feature inventory](architecture/100-features.md)
- [700 — ADR, the decisions that still hold](architecture/700-adr/README.md)
  - [ADR-01 — Browser-only static app, PKCE, no secret](architecture/700-adr/ADR-01-browser-only-pkce.md)
  - [ADR-02 — Never read Spotify playlists on load](architecture/700-adr/ADR-02-no-spotify-reads-on-load.md)
  - [ADR-03 — Library writes only on a tap, scope-gated](architecture/700-adr/ADR-03-library-writes-on-tap.md)
  - [ADR-04 — Keyless sources keyed by ids, resumable jobs](architecture/700-adr/ADR-04-keyless-sources-by-id.md)
  - [ADR-05 — Additive IndexedDB upgrades](architecture/700-adr/ADR-05-additive-indexeddb.md)
  - [ADR-06 — Lean tooling](architecture/700-adr/ADR-06-lean-tooling.md)
  - [ADR-07 — Play counts from the history export](architecture/700-adr/ADR-07-play-counts-from-export.md)
- [800 — Limits and roadmap](architecture/800-limits-roadmap.md)

## Dev guide

- [000 — Contributing](dev-guide/000-contributing.md) — commands, code conventions, the files that change together, the documentation
  rules, a feature round, releasing.

## Specs, newest first

One design document per feature round, dated. The first one is the base model; later ones build on it.

- [2026-09-28 — Import a Tracklistify JSON tracklist](specs/2026-09-28-tracklistify-import-design.md)
- [2026-09-25 — Like all songs of a playlist](specs/2026-09-25-like-playlist-design.md)
- [2026-09-06 — Create a Spotify playlist from a mix](specs/2026-09-06-mix-playlist-design.md)
- [2026-09-06 — Mix tracklist](specs/2026-09-06-mix-tracklist-design.md)
- [2026-09-05 — Artist reach (Under the radar)](specs/2026-09-05-artist-reach-design.md)
- [2026-09-05 — BPM and key](specs/2026-09-05-bpm-key-design.md)
- [2026-09-04 — The Crate: five history views](specs/2026-09-04-crate-history-views-design.md)
- [2026-09-04 — Spotify DJ web app (base)](specs/2026-09-04-spotify-dj-webapp-design.md)

## Plans (executed, history)

- [2026-09-28 — Tracklistify import](plans/2026-09-28-tracklistify-import.md)
- [2026-09-25 — Like all songs](plans/2026-09-25-like-playlist.md)
- [2026-09-06 — Mix playlist](plans/2026-09-06-mix-playlist.md)
- [2026-09-06 — Mix tracklist](plans/2026-09-06-mix-tracklist.md)
- [2026-09-05 — UX polish](plans/2026-09-05-ux-polish.md)
- [2026-09-05 — Artist reach](plans/2026-09-05-artist-reach.md)
- [2026-09-05 — BPM and key](plans/2026-09-05-bpm-key.md)
- [2026-09-04 — Crate history views](plans/2026-09-04-crate-history-views.md)
- [2026-09-04 — Spotify DJ web app](plans/2026-09-04-spotify-dj-webapp.md)

## Research (verified external facts)

- [2026-09-06 — Tracklist of a SoundCloud DJ mix](research/2026-09-06-mix-tracklist-sources.md)
- [2026-09-05 — Artist reach sources](research/2026-09-05-artist-reach-sources.md)
- [2026-09-05 — BPM and key sources](research/2026-09-05-bpm-key-sources.md)
- [2026-09-04 — Streaming history semantics](research/2026-09-04-history-export-semantics.md)
- [2026-09-04 — Spotify platform](research/2026-09-04-spotify-platform-research.md)
