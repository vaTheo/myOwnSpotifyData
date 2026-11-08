# Research: One worker for every user (round 015)

Decisions for [plan.md](plan.md). Owner's picks (2026-11-08): a separate worker role with its own function (not a service key); both modes kept; the mode is a worker setting checked against a list on the server; one request per user in turn.

## D1 A role made of functions, not of table policies

- **Decision**: a shared worker reads and writes the queue only through five `security definer` functions. It has no privilege on any table. Each function begins by checking that `auth.uid()` is in `shared_workers`.
- **Why**: a row policy can say which rows but not which columns. With an update policy on `jobs`, a shared worker could change `owner_id` and move a request into another user's data, or read `result` of every request. A function names exactly what it returns and writes.
- **Refused**: (a) a service key in the worker: sees everything, one leak ends ADR-14; (b) new select and update policies on `jobs` for listed workers: one missed column, hard to audit; (c) a worker per user: what the owner wants to avoid.

## D2 Who is a shared worker: a private list the owner edits

- **Decision**: table `shared_workers(user_id, label, added_at)`, row security on, **no policy and no grant** for `authenticated`, `anon` or `public`. The owner adds a row in the SQL editor (the owner role bypasses row security) and removes it to disable the worker.
- **Why**: nothing the app or an ordinary account can call writes the list (SC-003), and the check is re-run on every call, so removal takes effect at the next call. `on delete cascade` from `auth.users` removes a deleted worker.
- **Refused**: a claim in the sign-in token (`app_metadata`): stays valid until the token expires, and is set by a dashboard form that is easy to mistype.

## D3 One worker account is a normal sign-in

The worker signs in by email link or code exactly as today (`create_user: false`), so the owner first creates the user in the dashboard with a dedicated email (not the one used in the app), then adds its id to the list. No new login path. A worker account that opens the app has no data and no use for it.

## D4 Fair turns in one statement

- **Decision**: `claim_any_job` orders eligible requests by the owner's most recent claim time (`max(claimed_at)` over that owner's requests ever claimed by a shared worker, never-served owners first), then `priority desc`, then `created_at`.
- **Effect**: a user with ten requests and one with one are served alternately; "Move to top" reorders only within a user, as US5 asks. The statement stays a single `update … where id = (select … for update skip locked)`.
- **Known limit**: a released request clears `claimed_at`, so the owner counts as unserved by it; harmless.

## D5 What the claim returns

Only `id` and `payload` (the link). Not `owner_id`, not `result`, not other rows. The worker uses only those two fields today (`cli.py`, `pipeline.py`). The run's output goes back through `worker_finish_job`, which returns a boolean.

## D6 A held request is bound to the worker account

New column `jobs.claimed_by_user uuid` set by `claim_any_job` to `auth.uid()`. Writes require `claimed_by = p_worker and claimed_by_user = auth.uid() and status = 'claimed'`: another shared worker cannot write on it, and the personal path (which never sets the column) is not affected. A stale claim (older than the stale limit) is claimable by any shared worker, as today. An owner could set the column with the app's own update policy; the only effect is on their own request.

## D7 Mode is a setting, checked at start

`WORKER_MODE=personal|shared`, default `personal`, validated in `config.py`. Shared mode calls `is_shared_worker()` once at start: false stops with "this account is not a shared worker" and exit code **7** (new), the console held open on Windows (0.5.3 behaviour). A later refusal (the owner removed the worker) logs the same line and exits 7. The start line names the mode.

## D8 Not in this round

A per-user cap on queued requests; sharing a result between two users who asked the same link; an app screen for workers; the worker choosing which user to serve; Windows service install. Listed in Limits and roadmap.

## Risks to verify on the real project (quickstart)

1. `return query update … returning` inside plpgsql with `returns table (id, payload)`: column name clash with the output names. The migration uses `#variable_conflict use_column` or qualifies every column.
2. `for update skip locked` with an `order by` that uses a subquery: works on Postgres 15; confirm two simultaneous shared workers never take the same row.
3. The `shared_workers` table cannot be read or written by an ordinary account, and a listed account cannot read it either (the functions answer, the table does not).
