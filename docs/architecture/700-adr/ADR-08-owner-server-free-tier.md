# ADR-08 — One server for the owner, on a free tier, holding the app's data and a job queue

> **Status**: Accepted; "for the owner alone" amended by [ADR-14](ADR-14-users-by-server-account.md) (the owner's accounts)
> **Date**: 2026-11-05

## Context

Every dataset the app builds (library snapshot, playlists ranked, history summary and play counts, artist reach, saved mixes, audio
features, rekordbox) lives in one browser's IndexedDB and dies with it. The owner wants the same data on the phone, a laptop and any
fresh browser session, and wants, later, a worker that fetches a mix's audio and identifies its tracks (today a hand-run Tracklistify
scan imported as JSON, F15). Both need something outside the browser. ADR-01 forbade any server so that nothing had to be hosted, paid
or protected; the owner now accepts a server for themselves alone, on a free tier they would top up if outgrown.

Spec of the round: [Backend data sync](../../../specs/001-backend-data-sync/spec.md).

## Options considered

| Option | Description | For | Against |
|---|---|---|---|
| Stay browser-only | Export and import a backup file by hand | nothing changes | every device still a silo; no queue for a worker |
| A server the owner writes and hosts | Own API and database on a VPS | full control; could also run the worker | a box to keep alive and pay (about €6/month); its IP is blocked by YouTube anyway |
| A database-with-sign-in service on a free tier *(chosen)* | A hosted database with sign-in and per-row access rules, talked to from the browser; the owner's computer runs the future worker | nothing of the owner's to keep alive; free at the owner's size; the worker runs from a home IP, which YouTube accepts | the free project pauses after days of inactivity; a hosted service is a dependency; data leaves the phone |

## Decision

The app may talk to **one server, for the owner alone**: a hosted database with sign-in on a free tier (the owner suggested Supabase;
the plan confirms it), created and configured by the owner, declared by two public build settings beside `VITE_SPOTIFY_CLIENT_ID`: the project URL and
its publishable key, neither of them a secret.

What the server is and is not:

- **It stores, it never computes.** It holds, per Spotify account, the datasets the app builds, each with the time it was fetched or
  imported and its schema version. Newer wins per dataset; nothing is merged within one.
- **It never holds a Spotify token and never calls Spotify.** PKCE with the Client ID stays the only Spotify login, in the browser,
  as ADR-01 says; the two writes and every read stay in the browser, on a tap (ADR-02, ADR-03). Sign-in to the server is separate and
  remembered per browser.
- **It is optional.** Without a setting the app is the browser-only app; unreachable, every screen works from local data and Settings
  shows the server state. No read of the server may trigger a Spotify read.
- **It leaves room for a queue.** Its data model has a work-item shape (submitted by the app, claimed by a worker, finished with a
  result or a failure). Any worker runs **outside** the server, on the owner's own computer, some of the time, polling outbound; the
  server has no open port of the owner's and runs nothing. The first worker (mix fetch and identification) is its own later round.
- **Its public key is not a secret.** The browser-side key of such a service is public by design and guarded by the service's per-row
  rules; ADR-04's "keyless" stays true for external data sources. Any key a worker needs (a recognition service) lives on the owner's
  computer, never in the repo nor in the browser.
- **Everything to create it lives in the repo**: schema, access rules, configuration, one documented command; the three checks cover
  the code.

ADR-01 is superseded for "no server"; its PKCE, no-secret and `127.0.0.1` rules stay in force.

## Consequences

**Positive:** data survives a cleared browser and is the same on every device; heavy jobs can run once, anywhere; the phone becomes a
reader; the worker round needs no new infrastructure decision.

**Negative / watch for:** the owner's listening history now leaves the phone for the owner's server (the manual and the inventory's
"What leaves the browser" say so); the free project pauses after inactivity and must be woken; free storage is finite (Settings shows
the used share); a hosted service can change its free tier; a worker that only runs while the computer is on means queued jobs wait.

## Links

- Supersedes [ADR-01](ADR-01-browser-only-pkce.md) for the server; keeps its PKCE and no-secret rules
- Spec: [Backend data sync](../../../specs/001-backend-data-sync/spec.md)
- The first worker: [ADR-09](ADR-09-mix-identification-on-the-owners-computer.md), spec `specs/002-mix-analysis-worker/`
- Constitution: `.specify/memory/constitution.md` Principle I
- Amended by [ADR-14](ADR-14-users-by-server-account.md): several accounts, each with data of its own
- [ADR-15](ADR-15-shared-track-facts.md): one shared store of public facts beside the per-user tables (still stores, never computes)
- [ADR-02](ADR-02-no-spotify-reads-on-load.md), [ADR-03](ADR-03-library-writes-on-tap.md), [ADR-04](ADR-04-keyless-sources-by-id.md)
- [ADR index](README.md)
- [Limits and roadmap](../800-limits-roadmap.md)
- [Contributing](../../dev-guide/000-contributing.md)
