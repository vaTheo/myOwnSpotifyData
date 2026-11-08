# Documentation

> **Status**: Living
> **Last updated**: 2026-11-07

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
  - [ADR-08 — One server for the owner, on a free tier](architecture/700-adr/ADR-08-owner-server-free-tier.md)
  - [ADR-09 — Mix identification on the owner's computer](architecture/700-adr/ADR-09-mix-identification-on-the-owners-computer.md)
  - [ADR-10 — Name lookup for clues without identifier](architecture/700-adr/ADR-10-name-lookup-for-clues.md) (amended by the
    redesign's Mix review)
  - [ADR-11 — Web-first adaptive layout on Material Design 3](architecture/700-adr/ADR-11-web-first-material-3.md)
  - [ADR-12 — Automatic updates](architecture/700-adr/ADR-12-automatic-updates.md)
  - [ADR-13 — Opening a mix checks it on Spotify](architecture/700-adr/ADR-13-automatic-mix-check.md)
  - [ADR-14 — Users are server accounts](architecture/700-adr/ADR-14-users-by-server-account.md)
- [800 — Limits and roadmap](architecture/800-limits-roadmap.md)

## Dev guide

- [000 — Contributing](dev-guide/000-contributing.md) — commands, code conventions, the files that change together, the documentation
  rules, a feature round, releasing.
- [100 — Design guide](dev-guide/100-design-guide.md) — the rules every screen follows: tokens, size classes, tables, failures, Escape and
  scroll owners, a missing number, the definition of done for a UI change.

## Specs, newest first

One design document per feature round, dated. The first one is the base model; later ones build on it.

- 2026-11-08 — The last Mix row clicked stays marked (round 013): [`specs/013-mix-row-last-clicked/`](../specs/013-mix-row-last-clicked/spec.md)
- 2026-11-08 — Link a Spotify track to a not-found row (round 012): [`specs/012-mix-manual-spotify-link/`](../specs/012-mix-manual-spotify-link/spec.md)
- 2026-11-08 — Simpler Mix tracklist (round 010): [`specs/010-mix-table-simplify/`](../specs/010-mix-table-simplify/spec.md)
- 2026-11-07 — Sortable Mix tracklist (round 009): [`specs/009-mix-sortable-columns/`](../specs/009-mix-sortable-columns/spec.md)
- 2026-11-08 — Multi-user data (round 011): [`specs/011-multi-user-data/`](../specs/011-multi-user-data/spec.md), decision [ADR-14](architecture/700-adr/ADR-14-users-by-server-account.md)
- 2026-11-07 — Automatic updates (round 006): [`specs/006-automatic-updates/`](../specs/006-automatic-updates/spec.md), decision [ADR-12](architecture/700-adr/ADR-12-automatic-updates.md)
- [2026-11-06 — A web-first redesign of every screen](specs/2026-11-06-web-first-redesign-design.md) (full round under [`specs/003-web-first-redesign/`](../specs/003-web-first-redesign/spec.md); not to be confused with `specs/003-fill-scan-gaps/`, round 003 of the worker, recorded in the CHANGELOG)
- [2026-11-06 — Identify a mix on my computer (the worker)](specs/2026-11-06-mix-analysis-worker-design.md) (full round under [`specs/002-mix-analysis-worker/`](../specs/002-mix-analysis-worker/spec.md); the worker's manual: [`worker/README.md`](../worker/README.md))
- [2026-11-05 — A server and database holding the app's data](specs/2026-11-05-backend-data-sync-design.md) (full round under [`specs/001-backend-data-sync/`](../specs/001-backend-data-sync/spec.md))
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

- [2026-11-07 — ReccoBeats release years](research/2026-11-07-reccobeats-release-years.md)
- [2026-09-05 — Artist reach sources](research/2026-09-05-artist-reach-sources.md)
- [2026-09-05 — BPM and key sources](research/2026-09-05-bpm-key-sources.md)
- [2026-09-04 — Streaming history semantics](research/2026-09-04-history-export-semantics.md)
- [2026-09-04 — Spotify platform](research/2026-09-04-spotify-platform-research.md)
