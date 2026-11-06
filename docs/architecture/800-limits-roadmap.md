# 800 — Limits and roadmap

> **Status**: Living
> **Last updated**: 2026-11-06

What the app cannot do, what was decided against, and the ideas not built yet. A row moves to the
[feature inventory](100-features.md) once it ships. The decisions that cause most of these limits are in the
[ADR index](700-adr/README.md).

## 1. Platform limits (cannot be fixed in the app)

| Limit | Why | Source |
|---|---|---|
| No play counts from Spotify's Web API | the API has none; only the history export carries them | [ADR-07](700-adr/ADR-07-play-counts-from-export.md), [platform research](../research/2026-09-04-spotify-platform-research.md) |
| Daily quota on playlist reads, lock-out of hours | unpublished Spotify limit | [ADR-02](700-adr/ADR-02-no-spotify-reads-on-load.md) |
| Development Mode: owner listed in User Management, Premium | Spotify app mode | [README](../../README.md) "One-time setup" |
| No Spotify audio features, artist followers or popularity for new apps | Spotify stopped answering them | [BPM research](../research/2026-09-05-bpm-key-sources.md), [reach research](../research/2026-09-05-artist-reach-sources.md) |
| A token refresh never widens the scope | OAuth: the refresh keeps the original grant | [ADR-03](700-adr/ADR-03-library-writes-on-tap.md) |
| No browser-only path returns a full mix tracklist | public sources only know already-identified mixes | [Mix tracklist spec](../specs/2026-09-06-mix-tracklist-design.md) |
| Real Spotify playlist folders | not in the API | [Tracklistify spec](../specs/2026-09-28-tracklistify-import-design.md) |

## 2. Known limits of what is built

- Mix tracklist is a draft with holes: TrackId identified 32.6% of one measured 190-minute mix; a fresh upload is often absent.
- Artist reach covers only artists with a Spotify id who appear in a synced playlist; plays shown are plays of saved tracks.
- `N languages` (Wikidata sitelinks) is a floor, not an exact count.
- Playlist name and description caps (100 / 300) are defensive guesses, not measured Spotify maxima.
- A Tracklistify `tracklist.json` without `mix_info.audio_filename` and `.title` is refused.
- No DOM or component tests: the UI and the `start*` wrappers in `state.ts` are checked by hand.
- The worker (F19): Shazam's tolerance for unauthenticated calls is undocumented; the pacing (one 12 s probe a minute, 3 s
  cooldown, one pause) is a guess from the surviving Tracklistify copy, and a second refusal fails the request. A set is sampled
  once a minute, so a track played under a minute can be missed. The executables are unsigned; the ffmpeg inside is a GPL build;
  YouTube links need Node or Deno on the computer. Requests wait while the computer is off.
- The server (F18) is a Supabase Free project: it pauses after a week without traffic and only the dashboard resumes it; 500 MB
  of database; no automatic backups; a sign-in link only works in the browser that asked for it, within 10 minutes; the built-in
  email service sends a few links an hour at most.
- Server rows are stored in clear (the owner declined client-side encryption): whoever holds the supabase.com login can read them.

## 3. Out of scope, decided (not to be re-litigated without the owner)

Each spec has an "Out of scope" block; the main ones:

- Any server of the owner's own, Cloudflare Worker or paid service; the one exception is the owner's free-tier database with sign-in, declared by one second setting ([ADR-08](700-adr/ADR-08-owner-server-free-tier.md), which supersedes [ADR-01](700-adr/ADR-01-browser-only-pkce.md) on this point).
- Name search for artists or tracks in the reach and lookup jobs ([ADR-04](700-adr/ADR-04-keyless-sources-by-id.md)).
- Any audio fetch, fingerprinting or recognition **in the app or on the server**; the worker on the owner's computer does it
  ([ADR-09](700-adr/ADR-09-mix-identification-on-the-owners-computer.md)). MixesDB/1001Tracklists scraping.
- Adding to an existing playlist, editing a created playlist, public playlists, cover images.
- Charts, adjustable Crate thresholds, a single blended reach score, a reach number on track rows.
- Commit hooks, Dependabot, branch protection, PR templates, a docs checker ([ADR-06](700-adr/ADR-06-lean-tooling.md)).

## 4. Roadmap

The worker round shipped on 2026-11-06 (F19). Nothing is decided next; candidates discussed: a column of starts under 30 s on
track rows or a Crate-only play threshold, Linux/macOS binaries are already built, a second job kind on the same queue. New ideas are discussed with the owner first, get a dated spec under
[specs](../specs/), and are listed here until they ship.

| Idea | State | Notes |
|---|---|---|
| — | — | — |

## Links

- [Feature inventory](100-features.md)
- [How the app works](000-how-it-works.md)
- [ADR index](700-adr/README.md)
- [Specs](../specs/) · [Research](../research/)
- [Contributing](../dev-guide/000-contributing.md)
- [Documentation map](../README.md)
