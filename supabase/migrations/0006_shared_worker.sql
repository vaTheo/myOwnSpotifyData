-- Round 015 (ADR-16, specs/015-shared-worker): one worker for every user.
-- Applied by the owner after 0005, in the SQL editor. The owner lists one
-- account as a shared worker (insert into public.shared_workers ...); that
-- account reaches the queue of every user only through the five functions
-- below. It has no privilege on any table and no row policy: it can claim a
-- request (and see its id and payload), report progress on it, finish it or
-- release it, and nothing else. Every function checks the list first, so
-- removing a row from it stops that account at its next call.
-- claim_job (personal worker) and every policy on jobs stay as they are.

-- The list. No policy and no privilege for anyone: read by the definer
-- functions only, written by the owner in the SQL editor.
create table public.shared_workers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  label text not null default '',
  added_at timestamptz not null default now()
);
alter table public.shared_workers enable row level security;
revoke all on public.shared_workers from authenticated, anon, public;

-- Which account holds a claimed request: the filter of the three write
-- functions, so one shared worker cannot touch a request another holds.
alter table public.jobs add column claimed_by_user uuid references auth.users (id) on delete set null;

-- Internal helper: 42501 unless the caller is on the list. No grant to
-- anyone: only the definer functions below call it.
create function public.require_shared_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.shared_workers w where w.user_id = auth.uid()) then
    raise exception 'not a shared worker' using errcode = '42501';
  end if;
end
$$;

-- The one function that answers false instead of refusing.
create function public.is_shared_worker()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.shared_workers w where w.user_id = auth.uid());
$$;

-- Takes the next request of any user, or a claimed one left longer than
-- p_stale_seconds. Fair between owners: the owner served least recently comes
-- first (never served first), then priority, then age. Returns only id and
-- payload, zero or one row. `for update skip locked`: two workers never take
-- the same row.
create function public.claim_any_job(p_worker text, p_stale_seconds integer)
returns table (id uuid, payload jsonb)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.require_shared_worker();
  return query
  update public.jobs j
  set status = 'claimed', claimed_by = p_worker, claimed_at = now(),
      claimed_by_user = auth.uid(), error = null, progress = null,
      stop_requested_at = null
  where j.id = (
    select c.id from public.jobs c
    where c.kind = 'identify-mix'
      and (c.status = 'queued'
        or (c.status = 'claimed' and c.claimed_at < now() - make_interval(secs => p_stale_seconds)))
    order by (select max(h.claimed_at) from public.jobs h where h.owner_id = c.owner_id) asc nulls first,
      c.priority desc, c.created_at
    limit 1
    for update skip locked
  )
  returning j.id, j.payload;
end
$$;

-- Writes the progress of the request this worker holds. Always one row:
-- taken = true when it no longer holds it (finished, released, taken over),
-- stop = the owner asked to stop it.
create function public.worker_set_progress(p_id uuid, p_worker text, p_progress jsonb)
returns table (taken boolean, stop boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_stop timestamptz;
begin
  perform public.require_shared_worker();
  update public.jobs j
  set progress = p_progress
  where j.id = p_id and j.status = 'claimed' and j.claimed_by = p_worker
    and j.claimed_by_user = auth.uid()
  returning j.stop_requested_at into v_stop;
  if found then
    return query select false, v_stop is not null;
  else
    return query select true, false;
  end if;
end
$$;

-- Finishes the request this worker holds. p_body keys: status (done or
-- failed), finished_at, result, error; any other key is refused (22023), so
-- the worker cannot rewrite owner, kind, payload or priority. True = written.
create function public.worker_finish_job(p_id uuid, p_worker text, p_body jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_shared_worker();
  if p_body is null or jsonb_typeof(p_body) <> 'object' then
    raise exception 'body must be a json object' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(p_body) k where k not in ('status', 'finished_at', 'result', 'error')) then
    raise exception 'key not allowed' using errcode = '22023';
  end if;
  if coalesce(p_body ->> 'status', '') not in ('done', 'failed') then
    raise exception 'status must be done or failed' using errcode = '22023';
  end if;
  update public.jobs j
  set status = p_body ->> 'status',
      finished_at = coalesce((p_body ->> 'finished_at')::timestamptz, now()),
      result = p_body -> 'result',
      error = p_body ->> 'error'
  where j.id = p_id and j.status = 'claimed' and j.claimed_by = p_worker
    and j.claimed_by_user = auth.uid();
  return found;
end
$$;

-- Puts back the request this worker holds (Ctrl-C). True = released.
create function public.worker_release_job(p_id uuid, p_worker text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_shared_worker();
  update public.jobs j
  set status = 'queued', claimed_by = null, claimed_at = null, claimed_by_user = null
  where j.id = p_id and j.status = 'claimed' and j.claimed_by = p_worker
    and j.claimed_by_user = auth.uid();
  return found;
end
$$;

-- Grants last (0001 fixed the defaults: anon and public get nothing).
revoke all on function public.require_shared_worker() from public, anon, authenticated;
revoke all on function public.is_shared_worker() from public, anon;
revoke all on function public.claim_any_job(text, integer) from public, anon;
revoke all on function public.worker_set_progress(uuid, text, jsonb) from public, anon;
revoke all on function public.worker_finish_job(uuid, text, jsonb) from public, anon;
revoke all on function public.worker_release_job(uuid, text) from public, anon;
grant execute on function public.is_shared_worker() to authenticated;
grant execute on function public.claim_any_job(text, integer) to authenticated;
grant execute on function public.worker_set_progress(uuid, text, jsonb) to authenticated;
grant execute on function public.worker_finish_job(uuid, text, jsonb) to authenticated;
grant execute on function public.worker_release_job(uuid, text) to authenticated;
