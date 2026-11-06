# Contract: migration 0003

```sql
alter table public.jobs add column progress jsonb, add column priority integer not null default 0,
  add column stop_requested_at timestamptz;
create index jobs_owner_status_priority on public.jobs (owner_id, status, priority desc, created_at);
create or replace function public.claim_job(p_worker text, p_stale_seconds integer) … order by priority desc, created_at …;
```

Requests: worker `PATCH jobs?id=eq.<id>&status=eq.claimed&claimed_by=eq.<w>` `{progress}` (returns the row: reads
`stop_requested_at`); app `PATCH jobs?id=eq.<id>&status=eq.queued` `{priority}`; app `DELETE jobs?id=eq.<id>&status=eq.queued`;
app `PATCH jobs?id=eq.<id>&status=eq.claimed` `{stop_requested_at: now}`. RLS and grants unchanged.
