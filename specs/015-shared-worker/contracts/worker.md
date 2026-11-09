# Contract: the worker in shared mode

Complements `specs/002-mix-analysis-worker/contracts/worker.md`. Personal mode is unchanged.

## Setting

`WORKER_MODE`: `auto` (default since worker 0.7.1: `is_shared_worker` after sign-in decides), `personal` or `shared`. Anything else is a settings error (exit 5, "setting WORKER_MODE: must be auto, personal or shared"). Same line in `.env.example` and the packaged `env.example` (they stay equal; tested).

## Start

1. Load settings, sign in as today (a worker account signs in by link or `login --code` like any account).
2. Shared mode only: `POST /rest/v1/rpc/is_shared_worker` `{}`. `false` → log "this account is not a shared worker: ask the owner to add it to shared_workers", exit **7**. A network or server error maps as today (exit 2 or 3).
3. The start line names the mode: `mix-worker 0.6.0 · <url> · as <email> · on <name> · shared worker` (personal mode keeps its present line).

## Requests (shared mode replaces these four; the pipeline calls the same method names)

| Method | Request | Result |
|---|---|---|
| `claim` | `POST /rest/v1/rpc/claim_any_job` `{ "p_worker", "p_stale_seconds" }` | `[]` → queue empty; `[ {id, payload} ]` → the request (same dict keys the worker reads today) |
| `finish` | `POST /rest/v1/rpc/worker_finish_job` `{ "p_id", "p_worker", "p_body": {status, finished_at, result \| error} }` | `true` → done; `false` → "taken" (reclaimed): log, discard, as today |
| `progress` | `POST /rest/v1/rpc/worker_set_progress` `{ "p_id", "p_worker", "p_progress" }` | `[{taken, stop}]` → same value shape `{"stop", "taken"}` as the personal client |
| `release` | `POST /rest/v1/rpc/worker_release_job` `{ "p_id", "p_worker" }` | best effort, 3 s timeout, as today |

Link rule (shared mode only): before any download the worker accepts only `https` links whose host is exactly `soundcloud.com`, `www.soundcloud.com` or `m.soundcloud.com` (no userinfo, port 443 or none). Anything else is finished through `finish` as failed with the reason `link not allowed in shared mode` and logged; nothing is downloaded and no cookie file is read. Personal mode never applies it.

Error mapping: `42501` on any shared call during a run → log "this account is no longer a shared worker", release nothing (it holds nothing it may write), exit **7**. All other mappings are the personal client's.

## Exit codes

0 ok, 2 unreachable, 3 paused, 4 not signed in, 5 missing or wrong setting or tool, 6 template written, **7 not a shared worker (new)**, 130 Ctrl-C. On a double-clicked Windows `.exe` the window stays open on every non-zero code (0.5.3).

## Unchanged

One probe at a time per worker; no Spotify host; the result shape (F15); the JSON written to disk before sending; the audio deleted on every path; `test_pipeline.py` still sees only the project's host.
