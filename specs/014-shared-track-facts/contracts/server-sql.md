# Contract: the server side (`supabase/migrations/0004_shared_facts.sql`)

Rules of the file, in order: create the two tables with their checks; `alter table ... enable row level security`; (0004) no policy is the end state: 0005 revokes all table privileges, drops the two insert policies and adds the two `add_*` functions; the grants block **last** (`src/server/CLAUDE.md`).

## Policies

| Table | select | insert | update | delete |
|---|---|---|---|---|
| `shared_track_facts` | none (no policy, no grant) | none (through `add_track_facts` only; 0004's policy dropped by 0005) | none | none |
| `shared_artist_reach` | none | none (through `add_artist_reach` only) | none | none |

The checks live in the table (column and table `check` constraints), so they bind every writer including a policy change by mistake. `anon` gets nothing (the 0001 default-privilege revokes still apply; the grant block restates them).

## Functions (all four `security definer`, `set search_path = ''`, `language plpgsql stable`)

```text
public.get_track_facts(ids text[]) returns table (track_id text, bpm real, key smallint, major boolean)
public.get_artist_reach(ids text[]) returns table (artist_id text, source text, measured_on date, value bigint)
```

- `ids` null or empty: returns no rows. `cardinality(ids) > 200`: `raise exception 'too many ids'` (SQLSTATE `54000`).
- Returns only rows with `track_id = any(ids)` / `artist_id = any(ids)`; no `source`-less listing; `get_artist_reach` returns the newest `measured_on` per (artist_id, source).
- Reads only the one shared table, fully qualified (`public.shared_track_facts`), nothing else.
- `revoke all on function ... from public, anon;` then `grant execute ... to authenticated;`.
- Grants for tables: none for `authenticated`, `anon` or `public` (0005: `revoke all on public.shared_track_facts, public.shared_artist_reach from authenticated, anon, public`).

### `0005_shared_add_functions.sql`: the writes

```text
public.add_track_facts(rows jsonb) returns integer      -- rows [{track_id,bpm,key,major}]
public.add_artist_reach(rows jsonb) returns integer     -- rows [{artist_id,source,measured_on,value}]
```

- `security definer`, `set search_path = ''`, `language plpgsql`. `rows` null or not a JSON array: `22023`. Empty array: returns 0.
  More than 200 rows: `raise exception 'too many rows'` (`54000`).
- Inserts through `jsonb_to_recordset` into its one table, `on conflict (track_id) do nothing` /
  `on conflict (artist_id, source, measured_on) do nothing`; the table checks still bind, one bad row fails the whole call.
- Returns the number of rows passed in (not the number new: a duplicate is ignored silently); the client counts what it sent and ignores it.
- `revoke all on function ... from public, anon;` then `grant execute ... to authenticated;`.

## Requests (PostgREST)

| Purpose | Request |
|---|---|
| read tracks | `POST /rest/v1/rpc/get_track_facts` body `{"ids":[...]}` |
| read reach | `POST /rest/v1/rpc/get_artist_reach` body `{"ids":[...]}` |
| share tracks | `POST /rest/v1/rpc/add_track_facts` body `{"rows":[...]}`, at most 200 rows `{track_id,bpm,key,major}`; answers 200 with the count |
| share reach | `POST /rest/v1/rpc/add_artist_reach` body `{"rows":[...]}`, rows `{artist_id,source,measured_on,value}` |

A refused row answers 400 with the constraint name and stores none of the batch. Error mapping is the client's (`offline`, `paused`, `unauthorized`, `error`).

## What `rules.test.ts` must prove after this file (static, reads all migrations)

1. Every table except the two named shared tables keeps today's owner rules; any other table without `owner_id` is a finding.
2. The two shared tables: no `owner_id` or `user` column, RLS enabled, no policy and no grant to `authenticated`, `anon` or `public` after the last migration (0004's insert policy and grant are dropped and revoked by 0005), a check on every column listed in data-model.md.
3. A `security definer` function exists only from the allow-list (`storage_used`, `get_track_facts`, `get_artist_reach`, `add_track_facts`, `add_artist_reach`); each reads (get) or writes (add) only its own shared table, sets `search_path = ''`, caps the array at 200, writes `on conflict ... do nothing`, and is not granted to `anon` or `public`.
4. The numbers in the SQL equal the client constants (`SHARED_BPM_MIN/MAX`, `MAX_IDS_PER_READ`, the id regex).
