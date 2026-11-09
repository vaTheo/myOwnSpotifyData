# One row per song in a scanned mix: design

> **Status**: Implemented on `feat/mix-one-row-per-song` (2026-11-09, inventory F34)
> **Last updated**: 2026-11-09

Date: 2026-11-09. Driven with the Spec Kit skills; the specification, plan and task list live under
[`specs/018-mix-one-row-per-song/`](../../specs/018-mix-one-row-per-song/spec.md). This page is the short record the documentation map
expects; the docs call it the one-row round (its folder number, 018, is also the label F31 "Delete a mix forever" carries). No new ADR:
no Spotify read, write or scope, no stored data changes, no worker release.

## What it is

The owner saw the same song on several rows of a scanned mix (heard at 12:30 and again at 41:10) and asked for one row, at the first
time ("not a problem if the span is not correct"). Owner's picks: merge **in the app, when a new result arrives**, and **scan rows only**.

- **The rule** (`oneRowPerSong`): identified rows of one incoming result with the same `nameKey(artist, stripMixMarkers(title))` (the
  key the dig links group repeats by: case, accents, punctuation and "Original Mix" / "Extended Mix" ignored) become one row: the copy
  with the earliest time (no time last, ties in the result's order), every field its own except the clip count (`hits`, the sum of
  the copies', absent when none has one) and the confidence (the best of the copies' numbers). Gaps and `ID` rows never merge.
- **Where**: a worker result (`resultToRows`, after the worker's extras are attached, before the time sort) and a hand-imported
  Tracklistify JSON (`startTracklistifyImport`). Rows already in the mix (added, pasted, edited, kept) never pass through it; saved mixes
  are not rewritten until scanned or imported again.
- **Unchanged**: the worker (it still sends every span), `parseTracklistifyJson`, `mergeWorkerRows`, `mergeKeepingReview`.

## Links

- [How the app works](../architecture/000-how-it-works.md) §10 · [Feature inventory](../architecture/100-features.md) F34
- [Documentation map](../README.md)
