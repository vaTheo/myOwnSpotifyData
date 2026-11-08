# Data model: TrackId.net with the Shazam probes

No table, no migration, no `DB_VERSION` bump. Only the mix row's optional fields and the worker's settings change.

## Mix row (app: `TracklistRow`, `src/db/schema.ts`; worker result track)

| Field | Type | Rule |
|---|---|---|
| `origin` | `'replay' \| 'clue' \| 'trackid'` (optional) | `'trackid'` = a track only TrackId.net gave: not heard, unvalidated, no confidence |
| `confirmedBy` (worker JSON `confirmed_by`) | `'trackid'` (optional) | set on a heard row that a guided span agrees with; absent otherwise |
| `trackid` | object (optional) | only on `origin 'trackid'` rows: `slug` (string, ≤ 200), `spanStart`, `spanEnd` (seconds, finite, ≥ 0, `spanEnd ≥ spanStart`, ≤ 100 000), `references` (integer ≥ 0, optional) |
| `confidence` | absent on `trackid` rows | never invented |

Worker JSON (F15) additions, all optional: a track's `origin: "trackid"`, `confirmed_by: "trackid"`, `trackid: {slug, span_start, span_end, references}`. `time_in_mix` stays `HH:MM:SS`.

## Worker (nothing stored)

| Item | Where | Rule |
|---|---|---|
| `WORKER_TRACKID` | settings | `on` (default) or `off`; anything else is a settings error |
| `TRACKID_EDGE_SECONDS` 10, `TRACKID_MIN_CORE_SECONDS` 40, `TRACKID_DURATION_TOLERANCE` 0.05, `TRACKID_SPAN_CAP` 500, `TRACKID_TIMEOUT_SECONDS` 10, `TRACKID_INTERVAL_SECONDS` 0.25 | code constants in `trackid.py` | not settings |
| Run state key | `runstate.py` | gains the record's slug and a hash of the guided cores |
