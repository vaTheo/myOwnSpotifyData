# 700 — ADR, the decisions that still hold

> **Status**: Living
> **Last updated**: 2026-11-07

One decision per file, kept when it no longer holds (marked `Superseded by …`). A decision belongs here when it outlives the feature round
that made it; the round's reasoning stays in its [spec](../../specs/). The first seven were taken during the rounds of 2026-09-04 to
2026-09-25 and written down on 2026-11-05; ADR-08 was taken on 2026-11-05, ADR-09, ADR-10 and ADR-11 on 2026-11-06 (ADR-10
amended the same day by the redesign's Mix review), ADR-12 on 2026-11-07.

| ADR | Decision | Status |
|---|---|---|
| [ADR-01](ADR-01-browser-only-pkce.md) | Browser-only static app: PKCE with a Client ID, no server, no secret, data in IndexedDB | Superseded by ADR-08 for "no server"; PKCE and no secret hold |
| [ADR-02](ADR-02-no-spotify-reads-on-load.md) | Never read Spotify playlists on load; sync only from a button | Amended by ADR-11: an automatic sync when the library is older than 12 hours |
| [ADR-03](ADR-03-library-writes-on-tap.md) | Write to the owner's Spotify library only on a tap, behind a whole-token scope check; never retry a POST | Accepted |
| [ADR-04](ADR-04-keyless-sources-by-id.md) | External data from free keyless sources, keyed by ids, never by name; clients never throw; long jobs start from Settings and resume | Accepted; amended by ADR-11 (the chain also starts them) |
| [ADR-05](ADR-05-additive-indexeddb.md) | IndexedDB upgrades only add stores; optional fields need no version bump; one connection hands over | Accepted |
| [ADR-06](ADR-06-lean-tooling.md) | Lean tooling: no hooks, Dependabot, templates or docs checker; TypeScript pinned; no DOM tests | Accepted |
| [ADR-07](ADR-07-play-counts-from-export.md) | Play counts come only from the history export; history views gate on a versioned summary | Accepted |
| [ADR-08](ADR-08-owner-server-free-tier.md) | One server for the owner on a free tier: stores the app's datasets and a job queue, never computes, never holds a token; workers run on the owner's computer | Accepted |
| [ADR-09](ADR-09-mix-identification-on-the-owners-computer.md) | Mix identification by audio runs only in the worker on the owner's computer, keyless (Shazam), one probe at a time; the app and the server never touch audio; the result keeps the F15 JSON shape | Accepted |
| [ADR-10](ADR-10-name-lookup-for-clues.md) | The worker may look a track up by name, only for a clue (comment, chapter, description) without identifier: keyless catalogues, exact equality, marked "from a comment" | Accepted; amended 2026-11-06 (a candidate joins **Validated only** once validated; **All tracks** includes it) |
| [ADR-11](ADR-11-web-first-material-3.md) | Web-first adaptive layout on Material Design 3: dark only, chartreuse seed and accent, five destinations, tables and side sheets; the Playwright visual loop as a dev-only check | Accepted |
| [ADR-12](ADR-12-automatic-updates.md) | Automatic updates: after the server sync, the Spotify sync (library older than 12 hours, at most once a session), then BPM and key, then Artist reach, one at a time; no wake lock, no banner; a per-device switch | Accepted |

## Skeleton

```markdown
# ADR-NN — <decision in one line>

> **Status**: Accepted | Proposed | Superseded by [ADR-NN](…)
> **Date**: YYYY-MM-DD

## Context
## Options considered   (a table: Option | Description | For | Against; the chosen one marked *(chosen)*)
## Decision
## Consequences         (**Positive:** … **Negative / watch for:** …)
## Links                (the specs, the code, this index)
```

## Links

- [How the app works](../000-how-it-works.md)
- [Feature inventory](../100-features.md)
- [Limits and roadmap](../800-limits-roadmap.md)
- [Specs](../../specs/) · [Research](../../research/)
- [Contributing](../../dev-guide/000-contributing.md)
- [Documentation map](../../README.md)
