# Research: TrackId.net with the Shazam probes (round 016)

Decisions for [plan.md](plan.md). Owner's picks: both ways; a new origin `trackid`; a confirmed row starts at the span's start; no probe at all inside a span.

## D1 What TrackId.net returns (checked 2026-11-08 with plain `curl`, no key)

- `GET https://trackid.net/api/public/audiostreams?url=<encoded link>` answers `{"result":{"audiostreams":[…],"rowCount":N}}`; an unknown link answers `rowCount 0` (the owner's example `soundcloud.com/sound-metaphors/temple-rat-live`, and its `www.`, `m.`, `http`, trailing-slash spellings, all returned 0).
- `GET …/audiostreams/<slug>` answers the record: `url`, `slug`, `title`, `channel`, `duration` (`"01:29:47.3790000"`), `detectionProcesses[]` each with `detectionProcessMusicTracks[]`: `musicTrackId`, `startTime` and `endTime` (`"00:10:16.7580000"`), `artist`, `title`, `label`, `referenceCount`.
- The record seen (a 90-minute set) has three detection processes (one a reprocess) and spans that cover parts of the set, not all of it: gaps are normal.
- A keyword search exists (`?keywords=`); **not used** (name search, ADR-04/ADR-10).
- The docs page `trackid.net/api` answers 403 to an automated fetch; the endpoints above are the ones the app already uses (`src/features/mix/trackid.ts`).

## D2 The same two-call flow and guards as the app

List by the exact link; accept only `rowCount === 1` with one record whose `url` equals the link; call two by the record's own slug, accept only when the detail's `url` and `slug` both match. Anything else is unknown. `parse_spans` ports `tidSpansToRows` (flatten processes, merge a same-`musicTrackId` span that starts within 5 s of the earlier end, drop an unparseable or reversed span, drop a span with no artist or title). One fixture, a trimmed real detail record, is read by both the worker test and a new app-side check if cheap; otherwise the worker keeps its own copy and the port is pinned by cases listed in the contract.

## D3 Skip, never probe, inside a span (owner's rule)

- A span is **guided** when, shrunk by `TRACKID_EDGE_SECONDS = 10` at each edge, it still holds at least `TRACKID_MIN_CORE_SECONDS = 40`. The first-pass probe at time `t` is skipped when its window `[t, t+step)` lies inside a guided core.
- Skipped probes are neither hits nor misses: they never open a gap and never feed the second pass. They count as done in progress.
- The 10 s edges absorb a small offset between TrackId.net's timeline and the audio. The edge probes are ordinary probes, so a heard track at an edge is free evidence: the same track confirms the span (`confirmed_by`), another track at the start edge withdraws the span (the stretch is then probed normally from the start), another track at the end edge clips the span's row at the heard track's start.
- The one guard inside the skipped core is the record's length: a record whose `duration` differs from the audio's by more than 5 % is distrusted as a whole (a different cut of the set).
- Resume: the run state key gains the record's slug and a hash of the guided cores; a changed record starts the first pass over.

## D4 Rows

- A guided span's row: `origin: "trackid"`, `artist`, `song_name`, `time_in_mix` = the span's start (clipped), `metadata.label` when given, `trackid: {slug, span_start, span_end, references}`, no `confidence`, `hits` 0.
- A heard row confirmed by an edge probe keeps its Shazam fields and gains `confirmed_by: "trackid"`; its `time_in_mix` is the span's start (owner's pick), the probe time is only in the log.
- A span too short to guide (`< 40 s` core) is used only to fill a stretch still unidentified after both passes (a gap from `gaps_of`): a `trackid` row clipped to the gap.
- Order of steps: scan (guided) → TrackId.net rows → clues (so the clue step sees the smaller gap list) → write. A track already placed by a heard row for the same key within the span is not duplicated.

## D5 Failure and pacing

Two calls, each with a 10 s timeout, 250 ms apart, no retry, `User-Agent: mix-worker/<version>`. Any failure, odd answer or timeout is one log line and "unknown". It runs once, before the first probe, so the Shazam pacing, cooldown, breaks and refusal rules are untouched. A Stop during the two calls is checked before and after them.

## D6 App side

`origin: 'trackid'` is a third value. `src/server/validate.ts` accepts it, `confirmedBy: 'trackid'` and a bounded `trackid` object; `worker.ts` maps the worker's snake_case fields; the Mix row shows "from TrackId.net · not heard" and starts unvalidated like a clue, a confirmed heard row shows "confirmed by TrackId.net". Results from before this round show as today. The app is deployed before the worker is released.

## D7 Not in this round

Using TrackId.net's data for the app's own Look up (it already does); trusting its labels or reference counts for ranking; asking TrackId.net to analyse an unknown mix; sharing a record between users; a setting for the tolerances (constants in code).

## Risks to verify on a real mix (quickstart)

1. The span times line up with the audio within 10 s on a real known mix (edge probes name the span's track, not a neighbour).
2. The probe count really drops (SC-001) on a mix TrackId.net covers well.
3. The app shows the new rows and the mark, and an older app version is not given the new rows.
