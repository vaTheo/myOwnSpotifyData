-- Round 014 (specs/014-shared-track-facts, ADR-15): a shared store of public
-- track and artist facts. Applied by the owner after 0003, the same way (SQL
-- editor or `supabase db push`). The two tables hold no user column and no
-- link to a library: a row says "this track has this BPM", nothing about who
-- found it. Signed-in users may only insert; nobody can select, update or
-- delete. Reading goes through two functions that take an id list (at most
-- 200) and return only the asked ids, so the table can never be listed.
-- Every check lives in the table, so it binds every writer.

create table public.shared_track_facts (
  track_id text primary key check (track_id ~ '^[0-9A-Za-z]{22}$'),
  bpm real check (bpm between 30 and 300),
  key smallint check (key between 0 and 11),
  major boolean,
  source text not null default 'reccobeats' check (source in ('reccobeats')),
  added_at timestamptz not null default now(),
  check (major is null or key is not null),
  check (bpm is not null or key is not null)
);

create table public.shared_artist_reach (
  artist_id text not null check (artist_id ~ '^[0-9A-Za-z]{22}$'),
  source text not null check (source in ('listenbrainz', 'deezer')),
  measured_on date not null check (measured_on between current_date - 7 and current_date + 1),
  value bigint not null check (value between 0 and 10000000000),
  added_at timestamptz not null default now(),
  primary key (artist_id, source, measured_on)
);

alter table public.shared_track_facts enable row level security;
alter table public.shared_artist_reach enable row level security;

-- Insert only. No select, update or delete policy exists, so RLS refuses them.
create policy shared_track_facts_insert on public.shared_track_facts
  for insert to authenticated with check (true);
create policy shared_artist_reach_insert on public.shared_artist_reach
  for insert to authenticated with check (true);

-- The only read: the asked ids, never a listing.
create function public.get_track_facts(ids text[])
returns table (track_id text, bpm real, key smallint, major boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if ids is null or cardinality(ids) = 0 then
    return;
  end if;
  if cardinality(ids) > 200 then
    raise exception 'too many ids' using errcode = '54000';
  end if;
  return query
    select f.track_id, f.bpm, f.key, f.major
    from public.shared_track_facts f
    where f.track_id = any(ids);
end
$$;

-- The newest measurement per artist and source.
create function public.get_artist_reach(ids text[])
returns table (artist_id text, source text, measured_on date, value bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if ids is null or cardinality(ids) = 0 then
    return;
  end if;
  if cardinality(ids) > 200 then
    raise exception 'too many ids' using errcode = '54000';
  end if;
  return query
    select distinct on (r.artist_id, r.source)
      r.artist_id, r.source, r.measured_on, r.value
    from public.shared_artist_reach r
    where r.artist_id = any(ids)
    order by r.artist_id, r.source, r.measured_on desc;
end
$$;

-- Grants last. Supabase's default privileges give new public tables to
-- authenticated (select, update, delete, truncate, ...), so everything is
-- revoked first, then authenticated gets insert on the two tables and execute
-- on the two functions, nothing more. anon gets nothing.
revoke all on public.shared_track_facts, public.shared_artist_reach from authenticated, anon, public;
revoke all on function public.get_track_facts(text[]) from public, anon;
revoke all on function public.get_artist_reach(text[]) from public, anon;
grant insert on public.shared_track_facts, public.shared_artist_reach to authenticated;
grant execute on function public.get_track_facts(ids text[]) to authenticated;
grant execute on function public.get_artist_reach(ids text[]) to authenticated;
