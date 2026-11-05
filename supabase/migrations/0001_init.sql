-- myOwnSpotifyData — the owner's server (ADR-08, specs/001-backend-data-sync).
-- Four tables and one function. The server stores and never computes: every
-- row is JSON the browser wrote, keyed by the owner (auth.uid()) and the
-- Spotify account it belongs to. Row Level Security is the only wall between
-- the public key and the data, so the end of this file revokes every default
-- privilege from `anon` (security review S1).

-- One stamp per dataset: what the browser compares to decide push or pull.
create table public.datasets (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  spotify_account_id text not null,
  name text not null check (name in ('library', 'history', 'features', 'reach')),
  fetched_at bigint not null,
  schema_version integer not null,
  generation bigint not null,
  summary jsonb,
  row_count integer not null default 0,
  pushed_at timestamptz not null default now(),
  primary key (owner_id, spotify_account_id, name)
);

-- The rows of the four replace-whole datasets, as the browser stores them.
create table public.dataset_rows (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  spotify_account_id text not null,
  dataset text not null,
  generation bigint not null,
  store text not null,
  key text not null,
  row jsonb not null,
  primary key (owner_id, spotify_account_id, dataset, generation, store, key)
);

create index dataset_rows_generation_idx
  on public.dataset_rows (owner_id, spotify_account_id, dataset, generation);

-- One row per saved mix; a tombstone (deleted_at set, row null) propagates a
-- deletion to the other devices.
create table public.mixes (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  spotify_account_id text not null,
  url text not null,
  saved_at bigint not null,
  deleted_at bigint,
  row jsonb,
  primary key (owner_id, spotify_account_id, url)
);

-- The queue a worker on the owner's computer will pick from in a later round
-- (FR-017). Nothing writes or reads it in this round.
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'claimed', 'done', 'failed')),
  claimed_by text,
  claimed_at timestamptz,
  finished_at timestamptz,
  result jsonb,
  error text,
  created_at timestamptz not null default now()
);

-- Settings shows the used share of the free plan's 500 MB.
create function public.storage_used()
returns bigint
language sql
security definer
set search_path = ''
as $$
  select pg_catalog.pg_database_size(pg_catalog.current_database());
$$;

-- Row Level Security: the owner sees and writes only their own rows.
do $$
declare
  t text;
begin
  foreach t in array array['datasets', 'dataset_rows', 'mixes', 'jobs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (owner_id = auth.uid())',
      t || '_select', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (owner_id = auth.uid())',
      t || '_insert', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())',
      t || '_update', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (owner_id = auth.uid())',
      t || '_delete', t
    );
  end loop;
end
$$;

-- Grants. Supabase gives every new public table to `anon` by default; undo
-- that here and for every table created later in this schema (S1).
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon, public;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon, public;
grant select, insert, update, delete on public.datasets, public.dataset_rows, public.mixes, public.jobs to authenticated;
grant execute on function public.storage_used() to authenticated;
