-- Round 004 (specs/004-worker-progress-control): the phone sees a running
-- request's progress, reorders the queue and stops a run. Applied by the owner
-- after 0002, the same way (SQL editor or `supabase db push`). RLS and grants
-- are unchanged: the owner's policies already cover these columns.

-- Written by the worker on the request it runs (same filter as its result):
-- {step, done, total, percent, minutes_left, paused_until, warning, at}.
alter table public.jobs add column progress jsonb;
-- Move to top: the app raises it; higher is taken first.
alter table public.jobs add column priority integer not null default 0;
-- Stop: the app sets it on a running request; the worker ends the run.
alter table public.jobs add column stop_requested_at timestamptz;

create index jobs_owner_status_priority on public.jobs (owner_id, status, priority desc, created_at);

-- As in 0002, ordered by priority first.
create or replace function public.claim_job(p_worker text, p_stale_seconds integer)
returns setof public.jobs
language sql
security invoker
set search_path = ''
as $$
  update public.jobs j
  set status = 'claimed', claimed_by = p_worker, claimed_at = now(), error = null,
      progress = null, stop_requested_at = null
  where j.id = (
    select id from public.jobs
    where owner_id = auth.uid()
      and kind = 'identify-mix'
      and (status = 'queued'
        or (status = 'claimed' and claimed_at < now() - make_interval(secs => p_stale_seconds)))
    order by priority desc, created_at
    limit 1
    for update skip locked
  )
  returning j.*;
$$;

grant execute on function public.claim_job(text, integer) to authenticated;
