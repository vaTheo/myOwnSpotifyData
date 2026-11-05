# ADR-03 — Write to the owner's Spotify library only on a tap, behind a scope check

> **Status**: Accepted
> **Date**: 2026-09-06 (playlist creation), extended 2026-09-25 (Like all songs)

## Context

The app started read-only. Two rounds added writes: creating a private playlist from a mix, and saving a playlist's songs to Liked Songs.
A write the app cannot undo, made by mistake or twice, changes the owner's real library. A token refresh returns the scope of the
original grant, so an old session can never gain a new scope by itself.

## Options considered

| Option | Description | For | Against |
|---|---|---|---|
| Write automatically | Create or like as part of a lookup or sync | fewer taps | writes the owner did not ask for |
| Write on a tap, retried like reads | Same client path as GET | simple | a retried `POST` can create a duplicate playlist or duplicate tracks |
| Write on a tap, scope-gated, POST never retried *(chosen)* | Explicit button, whole-token scope check, re-login prompt, no POST retry | every write is deliberate and single | one re-login per new scope |

## Decision

The app writes to Spotify in exactly two places: **Create playlist from mix** (`POST /me/playlists`, `POST /playlists/{id}/items`) and
**Like all songs** (`PUT /me/library` after `GET /me/library/contains`, plus a `confirm()` naming the count). Each fires only on a
deliberate tap, never on load, a lookup or a reopen. `canCreatePlaylists` and `canLikeTracks` gate the buttons through `hasScope`, which
splits the scope on spaces; a missing scope shows **Connect again → Connect Spotify**. `post` is never retried on a 5xx or network error;
`put` is, because saving a set twice changes nothing. A created playlist is private, holds only confident matches and is never relabelled:
a second tap makes another playlist. Every failure is shown inline, never as a banner, and never touches the sync lock.

## Consequences

**Positive:** no surprise or duplicate write; failures are visible where they happened.

**Negative / watch for:** a third write needs a new ADR or an amendment here, a scope in `SCOPES`, a gate, and a re-login prompt.

## Links

- Specs: [Mix playlist](../../specs/2026-09-06-mix-playlist-design.md), [Like all songs](../../specs/2026-09-25-like-playlist-design.md),
  [Tracklistify import](../../specs/2026-09-28-tracklistify-import-design.md)
- [How the app works](../000-how-it-works.md) §3, §4, §10, §11
- [Feature inventory](../100-features.md) §3
- [ADR index](README.md)
- [Limits and roadmap](../800-limits-roadmap.md)
- [Contributing](../../dev-guide/000-contributing.md)
