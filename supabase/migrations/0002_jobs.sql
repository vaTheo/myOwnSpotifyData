-- Worker round (specs/002-mix-analysis-worker): the queue reserved by 0001
-- gets what the mix-identification worker and the app need. Applied by the
-- owner after 0001, the same way (SQL editor or `supabase db push`).

-- The app marks a done result once it merged it into the saved mix; other
-- devices skip the result and receive the mix through the mixes sync.
alter table public.jobs add column applied_at timestamptz;

create index jobs_owner_status_created on public.jobs (owner_id, status, created_at);

-- Takes the oldest queued request, or a claimed one left running longer than
-- p_stale_seconds (a worker that was stopped or lost power), and marks it
-- claimed by p_worker. Security invoker: RLS keeps it to the owner's rows.
-- `for update skip locked` makes two workers never take the same row.
create function public.claim_job(p_worker text, p_stale_seconds integer)
returns setof public.jobs
language sql
security invoker
set search_path = ''
as $$
  update public.jobs j
  set status = 'claimed', claimed_by = p_worker, claimed_at = now(), error = null
  where j.id = (
    select id from public.jobs
    where owner_id = auth.uid()
      and kind = 'identify-mix'
      and (status = 'queued'
        or (status = 'claimed' and claimed_at < now() - make_interval(secs => p_stale_seconds)))
    order by created_at
    limit 1
    for update skip locked
  )
  returning j.*;
$$;

-- Grants last (0001 fixed the default privileges: anon and public get nothing).
grant execute on function public.claim_job(text, integer) to authenticated;
