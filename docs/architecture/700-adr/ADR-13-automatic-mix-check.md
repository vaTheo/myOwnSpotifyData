# ADR-13 — Opening a mix checks it on Spotify by itself, once per mix

> **Status**: Accepted
> **Date**: 2026-11-08

## Context

Check on Spotify looks each named track of a mix up on Spotify, one search at a time, and keeps the answer on the row; Play on Spotify,
Create playlist and the "on Spotify" count all depend on it. Until now it started only from a tap ([ADR-02](ADR-02-no-spotify-reads-on-load.md),
[ADR-12](ADR-12-automatic-updates.md)), so a mix opened without the tap showed no Spotify answers. The owner asked that opening a mix
checks it when it has not been checked yet. Every search spends the same unpublished Spotify quota the playlist reads do.

## Options considered

| Option | Description | For | Against |
|---|---|---|---|
| Keep the tap | no change | no read without a tap | the owner taps on every mix |
| On opening a mix, once per mix *(chosen)* | a saved mix opened with named tracks never checked | answers are there when the mix is read; a mix is never searched twice (answers are saved with it) | a read on a user's own navigation, not a tap; up to one search per unchecked track |
| Only right after a lookup or an identify result | once, when the rows arrive | fewer reads | a mix saved earlier is never checked without a tap |

## Decision

`openMix` (`src/model/state.ts`, `maybeAutoCheck`) starts the same `startSpotifyCheck` a tap runs, when `autoCheckDue`
(`src/features/mix/spotifyCheck.ts`) says so: the per-device **Automatic updates** switch is on, a Spotify session exists, Spotify's
quota lock-out has lapsed, no other Spotify reader runs (sync, check, create, like), at least one named track was never checked, and this
page session has not tried this mix yet (a stopped or failed check is not retried on every reopen; the button stays). Every condition
that fails leaves the mix as it is and shows nothing: an automatic check never raises a refusal. Rows already checked, found or not found,
are skipped, so a mix is searched once. The run is the one a tap starts: "Checked 12 of 40" and Stop, the answers kept on the rows,
the mix saved at the end, failures (quota, network) inline, never a banner. A quota error sets the same lock-out. The demo
(`?demo`) never starts it. It reads Spotify and writes nothing there ([ADR-03](ADR-03-library-writes-on-tap.md) unchanged).

## Consequences

**Positive:** a mix opens with its Spotify answers; Play on Spotify and Create playlist need no earlier tap.

**Negative / watch for:** a mix with many unchecked tracks spends one search per track on opening; a mix opened first by a lookup
(not from the list) is not checked until it is reopened or the button is tapped. Turning Automatic updates off restores the tap-only
behaviour for the check as for the chain.

## Links

- Amends [ADR-02](ADR-02-no-spotify-reads-on-load.md) and [ADR-12](ADR-12-automatic-updates.md)
- Spec: [`specs/009-mix-sortable-columns/`](../../../specs/009-mix-sortable-columns/spec.md) (the round that asked for it)
- [How the app works](../000-how-it-works.md) §10
- [ADR index](README.md)
