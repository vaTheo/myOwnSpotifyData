# Data model

## Server (`supabase/migrations/0003_job_control.sql`)

| Column | Type | Written by | Meaning |
|---|---|---|---|
| `progress` | jsonb, null | worker (claimed row) | `{step, done, total, percent, minutes_left, paused_until, warning, at}` |
| `priority` | integer, default 0 | app (Move to top) | higher is taken first |
| `stop_requested_at` | timestamptz, null | app (Stop) | the worker ends the run when it sees it |

`claim_job` orders by `priority desc, created_at`. `step`: `download`, `first`, `second`, `clues`, `send`, `paused`.

## Result (F15 additions)

- track: `hits` (integer ≥ 1) for heard rows; `confidence` = best score.
- `mix_info.warnings`: `["refuses often"]` when R5 fired; `mix_info.resumed`: `{probes_kept, from}` when R4 resumed.
- `stopped_early.reason`: also `"by you"`.

## App

- `TracklistRow.hits?: number` (optional; no `DB_VERSION` bump); `validateMix` checks it (integer ≥ 1).
- `MixJobView.progress?`, `priority`, `stopRequestedAt` from `validateJobRow`.

## Worker (owner's computer only)

- `<work_dir>/runs/<sha1(link)>.json`: R4's run state; deleted on a normal end, kept 7 days otherwise.
