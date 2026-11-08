# Data model: TrackId.net with the Shazam probes

No table, no migration, no `DB_VERSION` bump. Only the mix row's optional fields and the worker's settings change.

## Mix row (app: `TracklistRow`, `src/db/schema.ts`; worker result track)

| Field | Type | Rule |
|---|---|---|
| `origin` | `'replay' \| 'clue' \| 'trackid'` (optional) | `'trackid'` = a trusted TrackId.net span: not heard, unvalidated, no confidence, the source of truth for its stretch |
| `shazamCheck` (worker JSON `shazam_check`) | object (optional) | only on `origin 'trackid'` rows: `outcome` one of `agrees`, `differs`, `no_match`, `not_asked`; `artist`, `title` (worker `song_name`) strings ≤ 200 and `confidence` a finite number 0..1, only with `differs` |
| `trackid` | object (optional) | only on `origin 'trackid'` rows: `slug` (string, ≤ 200), `spanStart`, `spanEnd` (seconds, finite, ≥ 0, `spanEnd ≥ spanStart`, ≤ 100 000), `references` (integer ≥ 0, optional) |
| `confidence` | absent on `trackid` rows | never invented |

Worker JSON (F15) additions, all optional: a track's `origin: "trackid"`, `shazam_check: {outcome, artist?, song_name?, confidence?}`, `trackid: {slug, span_start, span_end, references}`. `time_in_mix` stays `HH:MM:SS`.

## Worker (nothing stored)

| Item | Where | Rule |
|---|---|---|
| `WORKER_TRACKID` | settings | `on` (default) or `off`; anything else is a settings error |
| `TRACKID_EDGE_SECONDS` 10, `TRACKID_MIN_CORE_SECONDS` 40, `TRACKID_DURATION_TOLERANCE` 0.05, `TRACKID_SPAN_CAP` 500, `TRACKID_TIMEOUT_SECONDS` 10, `TRACKID_INTERVAL_SECONDS` 0.25 | code constants in `trackid.py` | not settings |
| Run state key | `runstate.py` | gains the record's slug and a hash of the guided cores |
