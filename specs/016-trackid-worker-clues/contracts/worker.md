# Contract: the worker with TrackId.net

Complements `specs/002-mix-analysis-worker/contracts/worker.md` and `specs/003-fill-scan-gaps/contracts/worker.md`.

## Setting

`WORKER_TRACKID`: `on` (default) or `off`; anything else is a settings error (exit 5, "setting WORKER_TRACKID: must be on or off"). Same line in `.env.example` and `mix_worker/env.example` (kept equal; tested).

## The two calls (once per request, before the first probe)

| # | Request | Accepted when |
|---|---|---|
| 1 | `GET https://trackid.net/api/public/audiostreams?url=<urlencode(link)>` | `result.rowCount == 1`, one record, `record.url == link`, `record.slug` a non-empty string |
| 2 | `GET https://trackid.net/api/public/audiostreams/<urlencode(slug)>` | `result.slug == slug` and `result.url == link` |

10 s timeout each (a total deadline across connect and reads, not per socket operation), 250 ms apart, no retry, no redirect followed (a 3xx is "unknown"), a body over 2 MB refused, `User-Agent: mix-worker/<version>`. Any other outcome is "unknown" with one log line (`trackid · not known` or `trackid · <reason>`). The link is the request's own link only; no keyword endpoint.

## Trust and plan

- A record whose `duration` differs from the audio's by more than 5 % is not trusted (one log line).
- `parse_spans` (a port of `tidSpansToRows`): flatten every `detectionProcesses[].detectionProcessMusicTracks[]`; parse `startTime` and `endTime` as `HH:MM:SS[.fff]`; drop a span with an unparseable or reversed time, or no artist or title; merge a same-`musicTrackId` span that starts within 5 s of the earlier end; sort; cap at 500 (one log line).
- A span is **guided** when its core (start + 10 s to end − 10 s) is at least 40 s.

## Scan behaviour (owner's rule: one confirming probe per span, TrackId.net is the source of truth)

| Case | Behaviour |
|---|---|
| No record, `off`, or untrusted | `scan()` is called with no guides and behaves exactly as today (equivalence test) |
| A first-pass probe window `[t, t+step)` inside a guided core (start + 10 s to end − 10 s, core ≥ 40 s) | skipped: no cut, no cooldown, no Shazam call; counts as done in progress; neither a hit nor a miss |
| The middle of each guided span | exactly one confirming probe whose window is centered on the span's middle (`t = (start + end) / 2 − probe_seconds / 2`), an ordinary probe (cooldown, refusals, errors as today); its answer goes to the span's check. Trigger: before each grid probe at `t`, every guide not yet confirmed with `confirm_at < t + step` is confirmed in order of `confirm_at` (any step, nested and overlapping spans included); the remaining guides after the loop. An undecodable (skipped) confirm is not remembered, so a resume asks again |
| A probe at an edge or outside every core | an ordinary probe; a hit naming the span's own track is absorbed when the probe window `[t, t + probe_seconds]` overlaps the span's `[start, end)`, a hit naming another track only when the window's center `t + probe_seconds / 2` lies in `[start, end)` (half-open, so abutting spans never both absorb one hit); a hit absorbed by no span stays a row. A neighbour's tail heard at a boundary and naming another track stays a row unless the window's center is inside the span |
| A span with a core below 40 s | not guided: probed normally; its check comes from the ordinary hits inside its times |
| Check outcome | `agrees` (a hit inside the span names the same track by the `match.py` rule; since worker 0.7.6 by `trackid.names_track`, which also accepts an artist written with other spacing or punctuation inside the name and a remaster tag on a title: [spec 029's contract, amended](../../029-worker-scan-evidence/contracts/worker.md)), `differs` (only other tracks heard inside it: the best hit's artist, title, confidence as 0..1: the worker's 0..100 divided by 100, 3 decimals), `no_match` (probes made, none matched), `not_asked` (the confirming probe was not made) |
| Second pass | unchanged; it never receives a skipped probe as a miss. As built: a first-pass miss inside any span's times (guided or not) is covered, so it never triggers a second-pass probe or becomes a gap; a second-pass probe landing inside a span is absorbed like any other hit. |
| Resume | the confirming probe is remembered as kind `confirm` (key: the span index) and replayed on resume; the run state gains `trackid` (`{slug, cores}`, `runstate.trackid_key`) and a changed one starts over ("the TrackId.net spans changed since"). |

Rows after the scan: one `origin: "trackid"` row per trusted span with its check, whatever the check says; heard rows only outside every span; sorted by start time; then the clue step runs on the gaps left (a stretch a span covers is not a gap).

As built (batch E): `trackid.span_rows(spans, checks, slug)` (the slug comes from the `Record`), `merge_rows` (stable sort by start second), `uncovered(gaps, spans)` (clips each gap, drops what is left under 1 s). `Deps.trackid` defaults to `None`; a Stop is read by the `trackid` progress step before and after the lookup like the other steps outside the scan (it changes nothing there; the scan sees it). The client's own line is the reason when it knows nothing (the pipeline adds none), and an exception from the seam is logged as `trackid · failed (<ErrorName>)`. With spans, a Stop, a refusal or an unreachable first pass does not raise in `scan` even when only absorbed hits were found: the TrackId.net rows are sent, `stopped_early` as today; with no spans it raises as before. A record with no spans is not used. The real fetch is `cli.http_get` (`urllib.request`, an HTTP error status returned as `(status, body)`, a network error raised).

## Unchanged

One probe at a time; the cooldown and its spread; the breaks and the refusal handling; no Spotify host; the clue step's rules; the result is sent whole or not at all. The outbound host list gains `trackid.net` (asserted by the host test).
