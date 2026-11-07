# ADR-02 — Never read Spotify playlists on load; sync only from a button

> **Status**: Accepted; amended by [ADR-12](ADR-12-automatic-updates.md) (an automatic sync when the library is older than 12 hours) and by [ADR-13](ADR-13-automatic-mix-check.md) (opening a mix checks it on Spotify)
> **Date**: 2026-09-04

## Context

Spotify enforces an unpublished daily quota on playlist reads. Hitting it locks the account out for hours. A phone app reopens often, so
any read on load spends that quota without the owner asking.

## Options considered

| Option | Description | For | Against |
|---|---|---|---|
| Sync on every load | Always fresh | no button | burns the quota; a lock-out on a normal day |
| Sync on load when stale | Sync if older than N hours | fresher data | still reads without a request; hard to reason about when locked |
| Sync only on a button *(chosen)* | Settings · Sync now, or a playlist's own button | the owner controls every read | data is as old as the last tap |

## Decision

The app never reads playlists on page load. `startSync` runs only from the Settings button or a playlist's own button. The runner diffs
on `snapshot_id`, commits one playlist per transaction, and persists `locked`/`error` state, so a quota hit keeps what was synced and
says when to retry. Features that need playlist contents (Like all songs, reach candidates, Match) use the **synced** entries, never a
fresh playlist read.

## Consequences

**Positive:** no surprise lock-out; a stopped sync resumes.

**Negative / watch for:** a new feature must not add a read on load or on navigation; the Like and Mix jobs read only the local copy.

## Links

- Spec: [the app](../../specs/2026-09-04-spotify-dj-webapp-design.md)
- Research: [Spotify platform](../../research/2026-09-04-spotify-platform-research.md)
- [How the app works](../000-how-it-works.md) §7, §14
- [ADR-12](ADR-12-automatic-updates.md), which amends this decision
- [ADR-13](ADR-13-automatic-mix-check.md), which amends it again
- [ADR index](README.md)
- [Limits and roadmap](../800-limits-roadmap.md)
- [Contributing](../../dev-guide/000-contributing.md)
