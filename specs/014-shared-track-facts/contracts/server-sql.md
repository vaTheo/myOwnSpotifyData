# Contract: the server side (`supabase/migrations/0004_shared_facts.sql`)

Rules of the file, in order: create the two tables with their checks; `alter table ... enable row level security`; one insert policy per table; the two functions; the grants block **last** (`src/server/CLAUDE.md`).

## Policies

| Table | select | insert | update | delete |
|---|---|---|---|---|
| `shared_track_facts` | none (no policy, no grant) | `to authenticated with check (true)` | none | none |
| `shared_artist_reach` | none | `to authenticated with check (true)` | none | none |

The checks live in the table (column and table `check` constraints), so they bind every writer including a policy change by mistake. `anon` gets nothing (the 0001 default-privilege revokes still apply; the grant block restates them).

## Functions (both `security definer`, `set search_path = ''`, `language plpgsql stable`)

```text
public.get_track_facts(ids text[]) returns table (track_id text, bpm real, key smallint, major boolean)
public.get_artist_reach(ids text[]) returns table (artist_id text, source text, measured_on date, value bigint)
```

- `ids` null or empty: returns no rows. `cardinality(ids) > 200`: `raise exception 'too many ids'` (SQLSTATE `54000`).
- Returns only rows with `track_id = any(ids)` / `artist_id = any(ids)`; no `source`-less listing; `get_artist_reach` returns the newest `measured_on` per (artist_id, source).
- Reads only the one shared table, fully qualified (`public.shared_track_facts`), nothing else.
- `revoke all on function ... from public, anon;` then `grant execute ... to authenticated;`.
- Grants for tables: `grant insert on public.shared_track_facts, public.shared_artist_reach to authenticated;` and nothing else.

## Requests (PostgREST)

| Purpose | Request |
|---|---|
| read tracks | `POST /rest/v1/rpc/get_track_facts` body `{"ids":[...]}` |
| read reach | `POST /rest/v1/rpc/get_artist_reach` body `{"ids":[...]}` |
| share tracks | `POST /rest/v1/shared_track_facts?on_conflict=track_id` `Prefer: resolution=ignore-duplicates,return=minimal`, body an array of at most 200 rows `{track_id,bpm,key,major}` |
| share reach | `POST /rest/v1/shared_artist_reach?on_conflict=artist_id,source,measured_on` same headers, rows `{artist_id,source,measured_on,value}` |

A refused row answers 400 with the constraint name and stores none of the batch. Error mapping is the client's (`offline`, `paused`, `unauthorized`, `error`).

## What `rules.test.ts` must prove after this file (static, reads all migrations)

1. Every table except the two named shared tables keeps today's owner rules; any other table without `owner_id` is a finding.
2. The two shared tables: no `owner_id` or `user` column, RLS enabled, insert policy only, no select, update or delete policy or grant, a check on every column listed in data-model.md.
3. A `security definer` function exists only from the allow-list (`storage_used`, `get_track_facts`, `get_artist_reach`); the two new ones read only their own shared table, set `search_path = ''`, cap the array at 200 and are not granted to `anon` or `public`.
4. The numbers in the SQL equal the client constants (`SHARED_BPM_MIN/MAX`, `MAX_IDS_PER_READ`, the id regex).
