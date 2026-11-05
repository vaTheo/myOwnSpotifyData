# ADR-04 — External data from free keyless sources, keyed by ids, in jobs that start from Settings and resume

> **Status**: Accepted
> **Date**: 2026-09-05

## Context

Spotify stopped answering audio features and artist popularity for new apps. BPM, key and artist reach must come from elsewhere, from a
browser, with no secret ([ADR-01](ADR-01-browser-only-pkce.md)). Matching by name gives wrong artists (homonyms) and wrong tracks.

## Options considered

| Option | Description | For | Against |
|---|---|---|---|
| Paid or keyed APIs | Last.fm, AudD, ACRCloud, scraped datasets | more coverage | a secret, a cost, or data the uploader does not own |
| Name search | Find the artist or track by text | covers id-less items | homonyms; silent wrong data |
| Free keyless sources by id *(chosen)* | ReccoBeats, MusicBrainz, ListenBrainz, Deezer, Wikidata, Wikimedia, keyed on Spotify ids and ISRCs | exact; free; browser-reachable | partial coverage; slow, paced jobs |

## Decision

Every external client is a pure function behind an injected `fetchFn` that returns a discriminated result and never throws; nothing is
swallowed. Lookups key on the Spotify track or artist id (and ISRC); name search is forbidden at every step. The ReccoBeats lookup,
the Rekordbox import and the artist-reach run start only from Settings, never on load; they write as they go and skip what is stored,
so a stopped run resumes. Each source is paced to its published limit; the reach run's pacing split is pinned by a test.

## Consequences

**Positive:** no wrong data from a homonym; no key; a long job survives a closed tab.

**Negative / watch for:** id-less artists are out of the reach feature; coverage is partial and the UI says so; the reach run is long
(45 to 50 minutes for 1,000 artists).

## Links

- Specs: [BPM and key](../../specs/2026-09-05-bpm-key-design.md), [Artist reach](../../specs/2026-09-05-artist-reach-design.md),
  [Mix tracklist](../../specs/2026-09-06-mix-tracklist-design.md)
- Research: [BPM and key sources](../../research/2026-09-05-bpm-key-sources.md),
  [artist reach sources](../../research/2026-09-05-artist-reach-sources.md),
  [mix tracklist sources](../../research/2026-09-06-mix-tracklist-sources.md)
- [How the app works](../000-how-it-works.md) §9, §10
- [ADR index](README.md)
- [Limits and roadmap](../800-limits-roadmap.md)
- [Contributing](../../dev-guide/000-contributing.md)
