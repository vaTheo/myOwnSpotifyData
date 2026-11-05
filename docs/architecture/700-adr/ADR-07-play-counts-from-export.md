# ADR-07 — Play counts come only from the history export; history views gate on a versioned summary

> **Status**: Accepted
> **Date**: 2026-09-04

## Context

Spotify's Web API has no play counts, and recently-played is limited to the last 50 tracks. The only full record is the _Extended
streaming history_ export the owner requests from Spotify's privacy page. Its semantics (`reason_end`, `skipped`, `ms_played`) need rules.

## Options considered

| Option | Description | For | Against |
|---|---|---|---|
| Poll recently-played | Count plays from now on | automatic | no past; needs a running client |
| Import the export *(chosen)* | Parse the zip locally in a worker | the whole history, offline | manual, arrives by email, re-import to refresh |

## Decision

Play counts come from the imported export only: a play counts once a track was listened to for at least 30 seconds; `trackdone` is
finished, `fwdbtn`/`backbtn`/`endplay`/`unknown` or the `skipped` flag is skipped; months are bucketed in the device's zone at import.
An import replaces the whole history and asks first when it covers less. Views built on newer data gate on the summary's version
(`historySummary.version === 2` for the Crate, `artistReachSummary.version === 1` for Under the radar), never on sniffing rows.

## Consequences

**Positive:** real counts, the whole history, nothing uploaded.

**Negative / watch for:** counts are as fresh as the last import; an import made before the Crate must be redone once; moving time zone
calls for a re-import.

## Links

- Specs: [the app](../../specs/2026-09-04-spotify-dj-webapp-design.md), [Crate](../../specs/2026-09-04-crate-history-views-design.md)
- Research: [history export semantics](../../research/2026-09-04-history-export-semantics.md)
- [How the app works](../000-how-it-works.md) §8, §13
- [ADR index](README.md)
- [Limits and roadmap](../800-limits-roadmap.md)
- [Contributing](../../dev-guide/000-contributing.md)
