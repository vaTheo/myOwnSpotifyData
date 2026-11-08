# Data model: One worker for every user

## `public.shared_workers` (new)

| Column | Type | Rule |
|---|---|---|
| `user_id` | uuid, primary key | references `auth.users (id)` on delete cascade |
| `label` | text, not null, default `''` | free text for the owner ("owner's PC") |
| `added_at` | timestamptz, not null, default `now()` | |

Row security **on**, no policy, `revoke all … from authenticated, anon, public`. Written by the owner in the SQL editor only. Listed = allowed; row removed = disabled.

## `public.shared_worker_turns` (new, private)

| Column | Type | Rule |
|---|---|---|
| `owner_id` | uuid, primary key | references `auth.users (id)` on delete cascade |
| `served_at` | timestamptz, not null | when a shared worker last took a request of this owner |

Row security **on**, no policy, `revoke all … from authenticated, anon, public`. Written only by `claim_any_job` (upsert after it claims a row), read only by it (the fair order). Not read from `jobs.claimed_at`, which the owner of a request can rewrite.

## `public.jobs` (one column added)

| Column | Type | Rule |
|---|---|---|
| `claimed_by_user` | uuid, null | references `auth.users (id)` on delete set null; set by `claim_any_job` to the worker account that holds the request; `null` for a personal claim and after a release |

Existing columns, row policies, the index and `claim_job` are unchanged.

## What each function reads and writes (see [contracts/server-sql.md](contracts/server-sql.md))

| Function | Reads | Writes |
|---|---|---|
| `is_shared_worker()` | the list | nothing |
| `claim_any_job(p_worker, p_stale_seconds)` | queued or stale `identify-mix` requests of every user; `shared_worker_turns` | the chosen request: `status`, `claimed_by`, `claimed_at`, `claimed_by_user`; clears `error`, `progress`, `stop_requested_at`; upserts the owner's `shared_worker_turns.served_at`; returns `id`, `payload` |
| `worker_set_progress(p_id, p_worker, p_progress)` | the held request's `stop_requested_at` | `progress` |
| `worker_finish_job(p_id, p_worker, p_body)` | nothing | `status` (`done` or `failed`), `finished_at`, `result`, `error` |
| `worker_release_job(p_id, p_worker)` | nothing | `status` back to `queued`; `claimed_by`, `claimed_at`, `claimed_by_user` cleared |

## Worker setting (new)

`WORKER_MODE` = `personal` (default) or `shared`. Nothing else is stored.
