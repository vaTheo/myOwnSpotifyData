# Research: TrackId.net with the Shazam probes (round 016)

Decisions for [plan.md](plan.md). Owner's picks: both ways; a new origin `trackid`; a row starts at the span's start; one confirming probe per span and TrackId.net is the source of truth.

## D1 What TrackId.net returns (checked 2026-11-08 with plain `curl`, no key)

- `GET https://trackid.net/api/public/audiostreams?url=<encoded link>` answers `{"result":{"audiostreams":[…],"rowCount":N}}`; an unknown link answers `rowCount 0` (the owner's example `soundcloud.com/sound-metaphors/temple-rat-live`, and its `www.`, `m.`, `http`, trailing-slash spellings, all returned 0).
- `GET …/audiostreams/<slug>` answers the record: `url`, `slug`, `title`, `channel`, `duration` (`"01:29:47.3790000"`), `detectionProcesses[]` each with `detectionProcessMusicTracks[]`: `musicTrackId`, `startTime` and `endTime` (`"00:10:16.7580000"`), `artist`, `title`, `label`, `referenceCount`.
- The record seen (a 90-minute set) has three detection processes (one a reprocess) and spans that cover parts of the set, not all of it: gaps are normal.
- A keyword search exists (`?keywords=`); **not used** (name search, ADR-04/ADR-10).
- The docs page `trackid.net/api` answers 403 to an automated fetch; the endpoints above are the ones the app already uses (`src/features/mix/trackid.ts`).

## D2 The same two-call flow and guards as the app

List by the exact link; accept only `rowCount === 1` with one record whose `url` equals the link; call two by the record's own slug, accept only when the detail's `url` and `slug` both match. Anything else is unknown. `parse_spans` ports `tidSpansToRows` (flatten processes, merge a same-`musicTrackId` span that starts within 5 s of the earlier end, drop an unparseable or reversed span, drop a span with no artist or title). One fixture, a trimmed real detail record, is read by both the worker test and a new app-side check if cheap; otherwise the worker keeps its own copy and the port is pinned by cases listed in the contract.

## D3 One confirming probe per span, never more (owner's rule)

- A span is **guided** when, shrunk by `TRACKID_EDGE_SECONDS = 10` at each edge, it still holds at least `TRACKID_MIN_CORE_SECONDS = 40`. Inside a guided core the first-pass probes are skipped except **one confirming probe** with its 12 s window **centered on the span's middle** (`t = (start + end) / 2 − probe_seconds / 2`, which is also the middle of the core since the core is symmetric; cut with the same `cut(t)`; the Shazam pacing, errors and progress are the ordinary ones).
- Skipped probes are neither hits nor misses: they never open a gap and never feed the second pass. They count as done in progress. The confirming probe is an ordinary probe whose answer goes to the span's check instead of the hits list when it falls inside a core.
- Edge probes and probes outside every core are ordinary. A Shazam hit is **absorbed** into a span's check and does not become a row: a hit naming the span's own track is absorbed when the probe window `[t, t + probe_seconds]` overlaps the span's `[start, end)`, a hit naming another track only when the window's center `t + probe_seconds / 2` lies in `[start, end)` (half-open, so abutting spans never both absorb one hit). A hit absorbed by no span stays a row; the cost is that a neighbour's tail heard at a boundary may still be a row beside the span.
- The confirming probe is independent of the grid: before each grid probe at `t`, every unconfirmed guide with `confirm_at < t + step` is confirmed in order of `confirm_at` (so any step, nested and overlapping spans work), the rest after the loop. A confirm that was undecodable is not remembered.
- A span whose core is below 40 s is not guided: probed normally; its check comes from the ordinary hits inside its times (same track ⇒ `agrees`, only other tracks ⇒ `differs`, none ⇒ `no_match`).
- **TrackId.net is the source of truth** (owner): the row of a trusted span is TrackId.net's whatever the check says; no Shazam answer replaces, clips or removes it.
- The one guard on the record as a whole: its `duration` within 5 % of the audio's, else the record is not trusted (a different cut of the set).
- Resume: the run state key gains the record's slug and a hash of the guided cores; the confirming probes are remembered like any first-pass probe. A changed record starts the first pass over.

## D4 Rows and the Shazam check

- A span's row: `origin: "trackid"`, `artist`, `song_name`, `time_in_mix` = the span's start, `metadata.label` when given, `trackid: {slug, span_start, span_end, references}`, `shazam_check`, no `confidence`, `hits` 0.
- `shazam_check` = `{"outcome": "agrees" | "differs" | "no_match" | "not_asked", "artist"?, "song_name"?, "confidence"?}`; the last three only for `differs` (the track Shazam named at the best hit inside the span). `agrees` uses the match rule of `match.py` (artist core shared, cleaned title equal). `not_asked` when the confirming probe was never made (a refusal or Stop ended the scan before it, or it was skipped as undecodable).
- Order of steps: scan (guided) → span rows (absorbing the hits inside spans) → clues (on the gaps left, a stretch covered by a span row is not a gap) → write. Rows are sorted by `time_in_mix`.

## D5 Failure and pacing

Two calls, each with a 10 s total deadline (connect and reads together), 250 ms apart, no retry, no redirect followed (a 3xx is "unknown"), a body over 2 MB refused, `User-Agent: mix-worker/<version>`. Any failure, odd answer or timeout is one log line and "unknown". It runs once, before the first probe, so the Shazam pacing, cooldown, breaks and refusal rules are untouched. A Stop during the two calls is checked before and after them.

## D6 App side

`origin: 'trackid'` is a third value. `src/server/validate.ts` accepts it, a bounded `shazamCheck` and a bounded `trackid` object; `worker.ts` maps the worker's snake_case fields; the Mix row shows "from TrackId.net · not heard" and a line for the check ("Shazam agrees", "Shazam heard <artist> - <title> instead", "Shazam: no match"), and starts unvalidated like a clue. Results from before this round show as today. The app is deployed before the worker is released.

## D7 Not in this round

Using TrackId.net's data for the app's own Look up (it already does); trusting its labels or reference counts for ranking; asking TrackId.net to analyse an unknown mix; sharing a record between users; a setting for the tolerances (constants in code).

## Risks to verify on a real mix (quickstart)

1. The span times line up with the audio within 10 s on a real known mix (edge probes name the span's track, not a neighbour).
2. The probe count really drops (SC-001) on a mix TrackId.net covers well.
3. The app shows the new rows and the mark, and an older app version is not given the new rows.
