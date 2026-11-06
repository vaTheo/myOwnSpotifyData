# Data model: mix identification requests and the worker

Builds on the server round's model (`../001-backend-data-sync/data-model.md`): the `jobs` table it created, the `mixes`
table and the local `mixes` store. No `DB_VERSION` bump: every local addition is an optional field or a `meta` row (ADR-05).

## Server: `jobs` (exists) + migration `0002_jobs.sql`

| Column | Type | Written by | Meaning |
|---|---|---|---|
| `id` | uuid PK | server default | request id; the app shows its first 8 characters on the Mix screen |
| `owner_id` | uuid | server default `auth.uid()` | RLS: the owner alone |
| `kind` | text | app | this round: `identify-mix` only; any other kind is ignored by this worker |
| `payload` | jsonb | app | `{ "url": "<canonical link>" }`; the worker refuses a payload without an https `url` |
| `status` | text | app (`queued`), worker (`claimed`, `done`, `failed`), worker on Ctrl-C (`queued` again) | state machine below |
| `claimed_by` | text | worker | the worker's name (hostname by default), shown as "on <name>" |
| `claimed_at` | timestamptz | worker | when taken; a `claimed` row older than the stale limit is taken again |
| `finished_at` | timestamptz | worker | when `done` or `failed` |
| `result` | jsonb | worker | the scan result (below), only on `done`; absent otherwise; under the request size limit |
| `error` | text | worker | one line, plain words, only on `failed`; cleared when the row is reclaimed |
| `created_at` | timestamptz | server default | queue order (oldest first) |
| `applied_at` | timestamptz | **new**, app | when a device merged the result into the saved mix; other devices then skip the result and get the mix through the mixes sync |

New in `0002_jobs.sql`: the `applied_at` column, an index on `(owner_id, status, created_at)`, and the function
`claim_job(p_worker text, p_stale_seconds integer) returns setof public.jobs` (security **invoker**, so RLS applies): one
`update … where id = (select … for update skip locked) returning *` that takes the oldest `queued` row, or a `claimed` row whose
`claimed_at` is older than the limit, and marks it `claimed` by the worker. Granted to `authenticated` only; the grants block of
`0001` already revoked functions from `anon`/`public` by default.

**States**: `queued` → `claimed` → `done` | `failed`; `claimed` → `queued` (worker stopped cleanly) or → `claimed` by another
worker (stale reclaim). `done` → `done` + `applied_at` (app). A `failed` row is never retried in place: "Ask again" inserts a new
`queued` row for the same url; the failed row stays as history. Rows are deleted only by "Remove server data" (all) — no pruning
this round.

**Validation on the worker before `claim_job`'s result is used**: `payload.url` is a string, parses as a URL, protocol `https:`.
**Validation on the app side of every pulled row** (`validate.ts`, security review S3): `id` uuid-shaped, `status` one of the four,
`claimed_by`/`error` strings capped at 200 characters, timestamps parse, `payload.url` https; `result` validated as a scan result
(below) only when the app is about to apply it. A row failing validation is dropped and counted in `rejected`.

## Scan result (`jobs.result`, the worker's output, the app's input)

The shape the hand import already reads (`src/features/mix/tracklistify.ts`, F15), now produced by the worker's own scan
(`worker/mix_worker/scan.py`, contracts/worker.md):

```jsonc
{
  "mix_info": {
    "title": "<set title from the platform's metadata>",
    "artist": "<uploader or channel, or absent>",
    "audio_filename": "<id>.m4a",                            // the file scanned (the parser requires it)
    "source_url": "<the request url>",                       // provenance; ignored by the parser
    "duration_seconds": 7260,                                // from the download tool's metadata, or absent
    "date": "2026-11-06", "track_count": 42
  },
  "tracks": [
    { "song_name": "…", "artist": "…", "time_in_mix": "HH:MM:SS", "confidence": 86.1,
      "metadata": { "isrc": "…", "label": "…", "shazam_id": "…", "links": { "shazam": "https://www.shazam.com/…" } } }  // each field only when Shazam reported it
  ]
}
```

Rules: the worker sends exactly the JSON it wrote to disk (FR-016), one entry per merged track in mix order. `tracks` empty
→ the request is `failed` ("No track identified"), never `done`. Serialized size over `WORKER_RESULT_MAX_BYTES` (900 000) →
`failed` ("Result too large"). The app parses it with `parseTracklistifyJson` (unchanged) and then runs `validateRow` on every
row as for any pulled mix row.

## Local (browser): additions, no bump

- `MixRow` (store `mixes`) gains optional fields: `identifyJobId?: string` (the last request whose rows were merged),
  `identifiedAt?: number` (its `finished_at`), and `sources.worker?: boolean` (true when at least one row came from a
  request; `sources.tracklistify` stays the hand-import flag so the existing screen logic is untouched). A worker mix has a real
  `url` (the canonical link), `title` from `mix_info.title`, `author` from `mix_info.artist`, `playerSrc` null, `slug` null.
- New `meta` row `MIX_JOBS_META = 'mixJobs'`: `Record<url, MixJobView[]>` (newest first, capped at 20 per url) where
  `MixJobView = { id, status, createdAt, claimedBy, claimedAt, finishedAt, error, appliedAt }` — the request history the Mix
  screen renders without a server call (FR-003). Written by the pull; deleted on server sign-out and on Remove server data.
- `ServerPending` gains no key: a merged result is pushed as `mixes` (the existing dataset) through `queueServerPush(['mixes'])`.

**Canonical link** (`requestKey(url)`, pure, `src/features/mix/url.ts`): a SoundCloud link → `normalizeMixUrl` (unchanged, so
the result joins the mix the lookup saved); any other link → the URL with its hash and tracking parameters (`utm_*`, `si`,
`feature`) removed, host lower-cased; not https → refused with an inline message. The same key is the `mixes` store key and
`payload.url`.

**Merge rule** (`mergeWorkerRows(existing: TracklistRow[], incoming: TracklistRow[])`, pure, `src/features/mix/worker.ts`):
rows of `existing` whose `source === 'tracklistify'` **and** whose `artist`/`title` still equal their `detected` values are
replaced by `incoming`; every other row (manual, pasted, TrackId, description, or an edited scan row) is kept; the result is
ordered by `startSec` (nulls last, stable), so a re-run replaces the untouched scan rows and never an edit (FR-006).

## Worker (the owner's computer): files, not tables

| Path (defaults) | Holds | Mode |
|---|---|---|
| `worker/.env` (git-ignored) | `SUPABASE_URL`, `SUPABASE_KEY` (the public ones), optional overrides | owner's |
| `~/.config/myownspotifydata-worker/session.json` | `{ email, access_token, refresh_token, expires_at }` | 0600, written by `login`, refreshed in place |
| `~/.cache/myownspotifydata-worker/<job id>/` | the downloaded audio; removed after the request ends (probes are cut to memory, never to files) | temp |
| `~/Music/mix-worker/<YYYY-MM-DD> <title> [<job id prefix>].json` | the result as sent (the hand-importable JSON, FR-016) | kept |
| `~/.cache/myownspotifydata-worker/worker.log` | one line per step with duration and outcome (FR-017) | appended |
