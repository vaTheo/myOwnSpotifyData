# Contract: the worker with TrackId.net

Complements `specs/002-mix-analysis-worker/contracts/worker.md` and `specs/003-fill-scan-gaps/contracts/worker.md`.

## Setting

`WORKER_TRACKID`: `on` (default) or `off`; anything else is a settings error (exit 5, "setting WORKER_TRACKID: must be on or off"). Same line in `.env.example` and `mix_worker/env.example` (kept equal; tested).

## The two calls (once per request, before the first probe)

| # | Request | Accepted when |
|---|---|---|
| 1 | `GET https://trackid.net/api/public/audiostreams?url=<urlencode(link)>` | `result.rowCount == 1`, one record, `record.url == link`, `record.slug` a non-empty string |
| 2 | `GET https://trackid.net/api/public/audiostreams/<urlencode(slug)>` | `result.slug == slug` and `result.url == link` |

10 s timeout each, 250 ms apart, no retry, `User-Agent: mix-worker/<version>`. Any other outcome is "unknown" with one log line (`trackid · not known` or `trackid · <reason>`). The link is the request's own link only; no keyword endpoint.

## Trust and plan

- A record whose `duration` differs from the audio's by more than 5 % is not trusted (one log line).
- `parse_spans` (a port of `tidSpansToRows`): flatten every `detectionProcesses[].detectionProcessMusicTracks[]`; parse `startTime` and `endTime` as `HH:MM:SS[.fff]`; drop a span with an unparseable or reversed time, or no artist or title; merge a same-`musicTrackId` span that starts within 5 s of the earlier end; sort; cap at 500 (one log line).
- A span is **guided** when its core (start + 10 s to end − 10 s) is at least 40 s.

## Scan behaviour

| Case | Behaviour |
|---|---|
| No record, `off`, or untrusted | `scan()` is called with no guides and behaves exactly as today (equivalence test) |
| A first-pass probe window `[t, t+step)` inside a guided core | skipped: no cut, no cooldown, no Shazam call; counts as done in progress; neither a hit nor a miss |
| A probe at an edge or outside every core | an ordinary probe |
| An edge probe names the span's track (same rule as `match.py` equality of artist core and cleaned title) | that heard row gets `confirmed_by: "trackid"` and `time_in_mix` = the span's start |
| The start-edge probe names another track | the span is withdrawn: its stretch is probed normally; no `trackid` row for it |
| The end-edge probe names another track | the span's row ends where that heard track starts |
| Second pass | unchanged; it never receives a skipped probe as a miss |

Rows after the scan: one `origin: "trackid"` row per guided span still standing and not already a confirmed heard row; spans below the guide threshold are used only to fill a stretch still unidentified after both passes, clipped to it; then the clue step runs on the remaining gaps.

## Unchanged

One probe at a time; the cooldown and its spread; the breaks and the refusal handling; no Spotify host; the clue step's rules; the result is sent whole or not at all. The outbound host list gains `trackid.net` (asserted by the host test).
