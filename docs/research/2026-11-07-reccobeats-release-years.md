# ReccoBeats release years (2026-11-07)

> **Status**: Reference (verified on the date in the title; external facts may have changed since)
> **Last updated**: 2026-11-07

The ReccoBeats endpoints behind round 005's "release years" pass of the BPM and key run (`specs/005-track-release-year/`,
research R3). Probed by hand on 2026-11-07, keyless, from the browser origin `https://vatheo.github.io` (CORS echoes it). The
audio-features endpoint itself is described in [BPM and key sources](2026-09-05-bpm-key-sources.md).

## Endpoints

| Request | Answer (fields the app reads) | Use |
|---|---|---|
| `GET https://api.reccobeats.com/v1/audio-features?ids=` (≤ 40 Spotify ids or ISRCs) | `content[]` items now carry `id`, ReccoBeats' own uuid, beside `href` (the Spotify link) | pass 1 keeps it as `reccobeats.rid` |
| `GET https://api.reccobeats.com/v1/track?ids=` (≤ 40 Spotify ids or ISRCs) | `content[]` of `{id, href, …}`; a track ReccoBeats does not know is absent | the `rid` of rows stored before round 005, one call per 40 |
| `GET https://api.reccobeats.com/v1/track/{rid}/album?size=50` | `{content: [{name, albumType, releaseDate, releaseDateFormat}], totalElements}` | every album the track is on |

- `releaseDate` is a date string ("1971-11-08") whose precision `releaseDateFormat` names; only the first four digits are used.
- One track sits on its original album and on its compilations: *Stairway to Heaven* answered 1971 (the album) and 2007
  (compilations). The **earliest** valid year (1900 to next year) is therefore the original release.
- 41 or more ids answer 400, as on audio-features; 429 and 5xx are handled as there (one request per second, `Retry-After`).

## Decision

The BPM run's third pass asks the album list of every track ReccoBeats knows and keeps the earliest year (`fetchAlbumYear`,
`src/features/reccobeats.ts`); a track with no dated album is asked again after the 90-day not-found lifetime. Rejected: the
Spotify album year alone (it is often a remaster or a compilation, and needs a sync), any name search (ADR-04).

## Links

- Spec: `specs/005-track-release-year/spec.md` (research R3 in `research.md`)
- [BPM and key sources](2026-09-05-bpm-key-sources.md)
- [How the app works](../architecture/000-how-it-works.md) §9
- [Limits and roadmap](../architecture/800-limits-roadmap.md)
- [Documentation map](../README.md)
