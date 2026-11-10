# The worker drops a finding between two hits of one song: design

> **Status**: Implemented on `feat/worker-drop-sandwiched-hits` (2026-11-09, inventory F35, worker 0.7.2)
> **Last updated**: 2026-11-09

Date: 2026-11-09. Driven with the Spec Kit skills; the specification, plan and task list live under
[`specs/019-worker-drop-sandwiched-hits/`](../../specs/019-worker-drop-sandwiched-hits/spec.md). This page is the short record the
documentation map expects; the docs call it the sandwich round. No new ADR: no Spotify read, write or scope, no new host, no new
setting, no stored data change; a worker release (0.7.2).

## What it is

The owner asked to remove findings "when something is found in between two songs", then narrowed it: a **different song found between
two hits of one song** (A, X, A), filtered **in the worker**, the two A hits **at most 180 s apart** (the merge gap).

- **The rule** (`drop_sandwiched(hits, gap)` in `worker/mix_worker/scan.py`): for every song, take its hits in time order; each pair
  of neighbouring hits at most `gap` seconds apart drops every hit of another song whose time lies strictly between them. The song key
  is the merge's (Shazam id, else lower-cased artist and title). Every pair is judged on the hits as they came, so the result does not
  depend on any order of removal.
- **A, B, A, B within the gap** (two songs interleaved): B's first hit lies between the two A hits, A's second hit between the two B
  hits; both are dropped, the first A and the last B stay (it reads as a transition from A to B). Pinned by a test.
- **Edges**: a hit at the same second as an A hit is not between; the earliest hit is never between anything, so `tracks` never
  empties because of the rule; kept hits keep their input order.
- **Where**: in `scan()`, after the first and second passes, just before `merge`. `report["sandwiched"]` holds the count and the log
  says `scan · N findings between two hits of the same song dropped` when N > 0. `hits_out`, the run state (`remember`, one answer per probe) and the gaps keep every hit,
  so a dropped hit's stretch is still known and starts no gap.
- **Unchanged**: `merge`, `inside_known`, the F15 result shape, TrackId.net span rows, clue rows and gaps (built elsewhere), the app.
  The app's one-row-per-song rule (F34) still runs on every result.

## Links

- [How the app works](../architecture/000-how-it-works.md) §17 · [Feature inventory](../architecture/100-features.md) F35
- [Limits and roadmap](../architecture/800-limits-roadmap.md) · [Documentation map](../README.md)
