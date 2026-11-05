# ADR-05 — IndexedDB upgrades only add; one connection per tab hands over

> **Status**: Accepted
> **Date**: 2026-09-05

## Context

The owner's database holds hours of synced playlists, an imported history and long reach runs. A schema change must never lose them. An
old tab left open blocks a version upgrade in a new one, and the app then hung on "Loading your library…".

## Options considered

| Option | Description | For | Against |
|---|---|---|---|
| Migrate by recreating stores | Drop and rebuild on a version bump | simple schema | loses data; forces a resync (quota) and a re-import |
| Additive upgrades *(chosen)* | Create only missing stores; optional fields with no bump | nothing lost | old rows lack new fields; code must accept `undefined` |

## Decision

`DB_VERSION` (now 4) is bumped only to add a store. The `upgrade` callback creates each missing store behind a guarded
`db.objectStoreNames.contains`. A new optional field on an existing row needs no bump: old rows read back `undefined`. `openDb` closes its
connection when a newer version opens elsewhere (`blocking`) and reports a blocked upgrade (`blocked`); `state.ts` shows both as banners,
and a database not open after eight seconds says so. Stores the `Model` does not need (`mixes`) stay out of `AllRows`/`buildModel`.

## Consequences

**Positive:** every upgrade keeps the owner's data; a stuck upgrade is explained.

**Negative / watch for:** readers of an optional field handle `undefined`; a feature gated on new data checks a versioned summary, not
the rows ([ADR-07](ADR-07-play-counts-from-export.md)).

## Links

- Specs: [BPM and key](../../specs/2026-09-05-bpm-key-design.md) (version 2), [Artist reach](../../specs/2026-09-05-artist-reach-design.md)
  (version 3), [Mix tracklist](../../specs/2026-09-06-mix-tracklist-design.md) (version 4)
- [How the app works](../000-how-it-works.md) §6
- [ADR index](README.md)
- [Limits and roadmap](../800-limits-roadmap.md)
- [Contributing](../../dev-guide/000-contributing.md)
