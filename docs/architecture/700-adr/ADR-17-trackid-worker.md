# ADR-17 — The worker asks TrackId.net by the exact mix link, probes each known stretch once, and TrackId.net is the source of truth

> **Status**: Accepted
> **Date**: 2026-11-08

## Context

The worker identifies a mix by cutting 12-second windows and asking Shazam for each, which takes long on a two-hour set. TrackId.net
is a public site where listeners have already written the tracklist of many known mixes, with the start and end of each track. The
app already reads it for Look up (`src/features/mix/trackid.ts`); the worker did not. The owner picked (2026-11-08): the worker uses
it both to skip probes and to fill stretches nobody heard; a new row origin `trackid`; one confirming probe per span, TrackId.net
being the source of truth. Release order: the app first, then worker 0.7.0.

## Options considered

| Option | Description | For | Against |
|---|---|---|---|
| Exact-link lookup, one confirming probe per span, a row per trusted span, Shazam kept as a check *(chosen)* | two calls by the mix link; inside a span with a core of 40 s or more, every first-pass probe is skipped except one 12 s probe centered on the span's middle; the other probes are skipped; a row per trusted span with origin `trackid` and a `shazam_check` | far fewer probes; one honest check per span; a disagreement is shown, never hidden | the check covers the middle only; a timeline offset beyond 10 s is caught only at the edges |
| No probe at all inside a span | trust the record blindly | fewest calls | a wrong or shifted record goes unnoticed; the owner wants a check |
| Shazam wins when they disagree | a Shazam answer replaces or clips the span's row | audio is the evidence | a 12 s probe over a mashup or an intro would overwrite a human tracklist; the owner chose TrackId.net as the truth |
| Fill only the gaps | use spans only where Shazam found nothing | no change to the scan | saves no probe, the main gain |
| The keyword search | find a record by the mix title | catches unlisted links | a name search (ADR-04, ADR-10) with homonym risk |
| Reuse the origin `clue` | spans as clue rows | no schema change | a clue carries a quote and a catalogue lookup; the owner wants to see where a row came from |

## Decision

- **The exact link only.** Two calls on `trackid.net`: the list by the link (accepted only with one record whose `url` equals the
  link), then the detail by that record's slug (its `url` and `slug` must match). Never the keyword endpoint. Anything else is
  "unknown".
- **TrackId.net never costs a request.** No record, a failure, a timeout, an odd answer, or `WORKER_TRACKID=off` leaves the scan
  byte-identical to today's. The record is trusted only when its duration is within 5 % of the audio's.
- **One confirming probe per span.** A span whose core (shrunk by 10 s at each edge) holds at least 40 s is guided: its first-pass
  probes are skipped, except one confirming probe centered on the span's middle. Edge probes and probes outside every core are
  ordinary. Shazam's pacing, one probe at a time and the refusal rules are untouched.
- **TrackId.net is the source of truth.** A trusted span becomes a row with origin `trackid`, starting at the span's start, with no
  confidence. A Shazam answer never replaces, clips or removes it: it is attached as `shazam_check` (`agrees`, `differs` with the
  track Shazam named, `no_match`, `not_asked`). A Shazam hit that names the span's track while its probe overlaps the span, or names another track while the probe's middle is inside the span, is absorbed, not a row.
- **A candidate like a clue.** A `trackid` row is not heard and unvalidated, shown "from TrackId.net · not heard"
  ([ADR-10](ADR-10-name-lookup-for-clues.md) amended). It goes into Create playlist unless the owner deletes it.
- **The app first.** `src/server/validate.ts` accepts the new origin and its bounded fields before worker 0.7.0 sends them; an old
  app refuses the new rows.

## Consequences

**Positive:** a known mix needs a fraction of the probes; stretches nobody heard are filled; the owner sees the origin and whether
the audio agreed.

**Negative / watch for:** coverage is partial (a record holds part of a set); a wrong record is only checked in the middle and at the
edges; there is no per-run cache of records; a commenter can be wrong; `trackid.net` joins the worker's outbound hosts.

## Links

- Spec: [`specs/016-trackid-worker-clues/spec.md`](../../../specs/016-trackid-worker-clues/spec.md) · [plan](../../../specs/016-trackid-worker-clues/plan.md) · [research](../../../specs/016-trackid-worker-clues/research.md)
- Amends [ADR-10](ADR-10-name-lookup-for-clues.md); keeps [ADR-04](ADR-04-keyless-sources-by-id.md) and [ADR-09](ADR-09-mix-identification-on-the-owners-computer.md)
- [ADR index](README.md)
- [Limits and roadmap](../800-limits-roadmap.md)
