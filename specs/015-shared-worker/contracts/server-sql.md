# Contract: the server side (`supabase/migrations/0006_shared_worker.sql`)

Applied by the owner after `0005`, in the SQL editor. Every function: `security definer`, `set search_path = ''`, `revoke all … from public, anon`, `grant execute … to authenticated` (last). A caller not in `shared_workers` gets error `42501` "not a shared worker" from every function except `is_shared_worker`, which answers `false`.

## Table and column

```sql
create table public.shared_workers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  label text not null default '',
  added_at timestamptz not null default now()
);
alter table public.shared_workers enable row level security;
revoke all on public.shared_workers from authenticated, anon, public;   -- no policy, no grant

alter table public.jobs add column claimed_by_user uuid references auth.users (id) on delete set null;
```

## Internal helper (no grant to anyone)

`public.require_shared_worker()` raises `42501` unless `exists (select 1 from public.shared_workers where user_id = auth.uid())`. `revoke all … from public, anon, authenticated`; the five functions call it first.

## Functions

| Function | Arguments | Returns | Rules |
|---|---|---|---|
| `is_shared_worker()` | none | boolean | `exists` on the list for `auth.uid()` |
| `claim_any_job(p_worker text, p_stale_seconds integer)` | worker name, stale limit | table `(id uuid, payload jsonb)`, zero or one row | one `update … where id = (select … for update skip locked)`; eligible: `kind = 'identify-mix'` and (`status = 'queued'` or claimed longer ago than the stale limit); order: owner's latest claim time ascending, owners never served first, then `priority desc`, then `created_at`; sets `status 'claimed'`, `claimed_by = p_worker`, `claimed_at = now()`, `claimed_by_user = auth.uid()`, clears `error`, `progress`, `stop_requested_at` |
| `worker_set_progress(p_id uuid, p_worker text, p_progress jsonb)` | | table `(taken boolean, stop boolean)`, always one row | updates `progress` where `id = p_id and status = 'claimed' and claimed_by = p_worker and claimed_by_user = auth.uid()`; updated → `taken false`, `stop = stop_requested_at is not null`; nothing updated → `taken true`, `stop false` |
| `worker_finish_job(p_id uuid, p_worker text, p_body jsonb)` | | boolean (true = written) | `p_body` keys allowed: `status` (`done` or `failed` only), `finished_at`, `result`, `error`; any other key raises `22023`; same hold filter as above |
| `worker_release_job(p_id uuid, p_worker text)` | | boolean | same hold filter; sets `status 'queued'`, clears `claimed_by`, `claimed_at`, `claimed_by_user` |

Notes for the build:
- In `claim_any_job` the output names `id` and `payload` clash with column names in plpgsql: use `#variable_conflict use_column` or qualify every column (`j.id`).
- None returns `owner_id`, `result` or any request the caller does not hold.
- `claim_job`, the `jobs` row policies and every other function stay as they are.

## What `rules.test.ts` must pin (audit, read from the migration files)

1. `shared_workers`: RLS enabled, **no** `create policy` on it, a `revoke all` from `authenticated, anon, public`, no grant to them.
2. Each of the five functions: `security definer`, `set search_path = ''`, execute granted to `authenticated` only (revoked from `public, anon`), and (except `is_shared_worker`) a call to `require_shared_worker()` before any statement on `jobs`.
3. `require_shared_worker` has no grant to `authenticated`.
4. The allow-list of definer functions grows to nine: the four of 0004/0005 plus these five, and the helper; every other function stays `security invoker`.
5. `claim_any_job` pins: `for update skip locked`, the `order by` on the owner's latest claim before `priority`, and that its return list holds only `id` and `payload`.
6. The `jobs` row policies are not changed by 0006 (no `create policy` or `alter policy` on `jobs`).
