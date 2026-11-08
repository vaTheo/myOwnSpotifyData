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

## Scan behaviour (owner's rule: one confirming probe per span, TrackId.net is the source of truth)

| Case | Behaviour |
|---|---|
| No record, `off`, or untrusted | `scan()` is called with no guides and behaves exactly as today (equivalence test) |
| A first-pass probe window `[t, t+step)` inside a guided core (start + 10 s to end − 10 s, core ≥ 40 s) | skipped: no cut, no cooldown, no Shazam call; counts as done in progress; neither a hit nor a miss |
| The middle of each guided span | exactly one confirming probe whose window is centered on the span's middle (`t = (start + end) / 2 − probe_seconds / 2`), an ordinary probe (cooldown, refusals, errors as today); its answer goes to the span's check |
| A probe at an edge or outside every core | an ordinary probe; a hit whose time is inside some span's times (unshrunk) is absorbed into that span's check, not a row |
| A span with a core below 40 s | not guided: probed normally; its check comes from the ordinary hits inside its times |
| Check outcome | `agrees` (a hit inside the span names the same track by the `match.py` rule), `differs` (only other tracks heard inside it: the best hit's artist, title, confidence), `no_match` (probes made, none matched), `not_asked` (the confirming probe was not made) |
| Second pass | unchanged; it never receives a skipped probe as a miss |

Rows after the scan: one `origin: "trackid"` row per trusted span with its check, whatever the check says; heard rows only outside every span; sorted by start time; then the clue step runs on the gaps left (a stretch a span covers is not a gap).

## Unchanged

One probe at a time; the cooldown and its spread; the breaks and the refusal handling; no Spotify host; the clue step's rules; the result is sent whole or not at all. The outbound host list gains `trackid.net` (asserted by the host test).
