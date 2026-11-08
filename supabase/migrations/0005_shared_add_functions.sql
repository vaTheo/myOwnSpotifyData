-- Round 014 fix (ADR-15, "Revised"): inserts into the two shared tables go
-- through two definer functions. Applied after 0004 (and safe on a project
-- where two column grants were added by hand to try the plain insert).
-- Why: PostgREST's `on_conflict ... ignore-duplicates` insert needs select on
-- the conflict columns AND passes the row through the select policy, and there
-- is deliberately none (a select policy would allow listing the table). Real
-- project answers: 403 42501 "permission denied for table", then, after a
-- column grant, 403 42501 "new row violates row-level security policy".
-- After this file the tables carry no policy and no privilege for
-- authenticated, anon or public: they refuse everything except the owner role
-- and the definer functions. Written only through add_*, read only through get_*.

revoke all on public.shared_track_facts, public.shared_artist_reach from authenticated, anon, public;
drop policy if exists shared_track_facts_insert on public.shared_track_facts;
drop policy if exists shared_artist_reach_insert on public.shared_artist_reach;

-- The only write for tracks. Returns how many rows were passed in (not how
-- many were new: a duplicate is ignored silently). The table checks still bind:
-- one bad row fails the whole call.
create function public.add_track_facts(rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if rows is null or jsonb_typeof(rows) <> 'array' then
    raise exception 'rows must be a json array' using errcode = '22023';
  end if;
  if jsonb_array_length(rows) = 0 then
    return 0;
  end if;
  if jsonb_array_length(rows) > 200 then
    raise exception 'too many rows' using errcode = '54000';
  end if;
  insert into public.shared_track_facts (track_id, bpm, key, major)
    select r.track_id, r.bpm, r.key, r.major
    from jsonb_to_recordset(rows) as r(track_id text, bpm real, key smallint, major boolean)
    on conflict (track_id) do nothing;
  return jsonb_array_length(rows);
end
$$;

-- The only write for artist reach, same shape.
create function public.add_artist_reach(rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if rows is null or jsonb_typeof(rows) <> 'array' then
    raise exception 'rows must be a json array' using errcode = '22023';
  end if;
  if jsonb_array_length(rows) = 0 then
    return 0;
  end if;
  if jsonb_array_length(rows) > 200 then
    raise exception 'too many rows' using errcode = '54000';
  end if;
  insert into public.shared_artist_reach (artist_id, source, measured_on, value)
    select r.artist_id, r.source, r.measured_on, r.value
    from jsonb_to_recordset(rows) as r(artist_id text, source text, measured_on date, value bigint)
    on conflict (artist_id, source, measured_on) do nothing;
  return jsonb_array_length(rows);
end
$$;

revoke all on function public.add_track_facts(jsonb) from public, anon;
revoke all on function public.add_artist_reach(jsonb) from public, anon;
grant execute on function public.add_track_facts(rows jsonb) to authenticated;
grant execute on function public.add_artist_reach(rows jsonb) to authenticated;
