# ADR-15 — One shared store of public track and artist facts, insert-only, read by id

> **Status**: Accepted
> **Date**: 2026-11-08

## Context

ADR-14 gave every user data of their own. Two users with overlapping libraries still look up the same tracks one by one: the BPM and
key run asks ReccoBeats at 1 request per second, so 1,000 known tracks cost about 17 minutes, and the artist reach run does the same
with its sources. BPM, key, listeners and fans are facts about a track or an artist, the same for everyone. The owner picked
(2026-11-08): share only such facts, BPM and key first, artist reach second; the owner's rekordbox values and everything about a
person's library stay private. The rule "a user never sees or changes another user's data" must not be loosened for anything
personal, and one wrong client must not be able to poison everyone.

## Options considered

| Option | Description | For | Against |
|---|---|---|---|
| Per-user only (today) | each user looks everything up alone | nothing new on the server | the same lookups repeated by every user; about 17 minutes per 1,000 known tracks |
| A shared table anyone can read and write (select-all and update policies) | any user lists and corrects rows | simple to write | anyone can list the table, overwrite a good value, or delete it; a single bad client poisons all |
| One shared store, insert-only, read by id through two definer functions *(chosen)* | no select, update or delete; rows checked by constraints; reads by at most 200 ids | no listing, no overwrite, bad rows refused by the database itself | a wrong value that got in stays until the owner removes it; a partial row stays partial |

## Decision

The owner's server holds one **shared store of public facts** beside the per-user tables: `shared_track_facts` (Spotify track id,
BPM, key, major or minor, source) and `shared_artist_reach` (Spotify artist id, source, date measured, value). It is the one
named exception to ADR-14's isolation; it stores, never computes, never calls Spotify.

- **No user column.** Neither table says who added a row.
- **Write only through `add_*`.** A signed-in user adds rows through `add_track_facts(rows)` and `add_artist_reach(rows)` (see
  "Revised" below); the tables carry no policy and no privilege for `authenticated`, and `anon` gets nothing. The first row for a
  key wins (`ON CONFLICT DO NOTHING` inside the function).
- **Checked by the database.** Constraints refuse a bad row, so they bind every writer: track id 22 base-62 characters, BPM 30 to
  300, key 0 to 11, `major` only with a key, at least one of BPM and key, source `reccobeats`; reach source `listenbrainz` or
  `deezer`, `measured_on` within a week back to a day ahead, value 0 to 10,000,000,000.
- **Read by id.** Two `security definer` functions, `get_track_facts(ids)` and `get_artist_reach(ids)`, with `search_path = ''`,
  return only the rows for the ids asked, at most **200 ids** per call; nobody can list a table.
- **Private stays private.** The rekordbox BPM and key, play counts, library, playlists, history, saved mixes, job state and
  release years are never sent (release years may come in a later round if the owner asks). Submissions are built from the outside
  answer only, never from a row's `rekordbox` field; a shared value is written into the ordinary `reccobeats` field and never
  replaces a rekordbox value.
- **Partial rows stay partial.** A row with only BPM or only key is shared as it is; nothing updates it, and the user whose run
  finds the full result still fills their own copy.
- **No backfill.** Values already in a user's library are not uploaded; the owner clears existing results and runs again to share
  them.
- **Reach freshness.** A shared reach number is used while it is younger than **90 days**; older numbers are measured again and the
  new one is added with its own date (the newest per source is returned).
- **Never in the way.** The store is asked once per run before the outside source, with a **10 s** timeout; with no server, no
  sign-in, or a failure, the run is today's run and its Settings card says so. Nothing is read on load.

## Consequences

**Positive:** a second user's run skips the lookups the first already did; the store cannot be listed, overwritten or emptied by a
user; bad rows are refused by the database, not only by the app; nothing personal can reach it by construction.

**Negative / watch for:** a wrong value that got in stays until the owner deletes it in the dashboard (no user can); a partial row
stays partial for everyone; the full run still takes the release-year pass, which is not shared, so the time saved is on the by-id
and ISRC passes; a test reads the migration so the numbers (BPM range, 200 ids) cannot drift from the client; the free-tier
storage is shared by the store too.

The 200 cap bounds one call, read or add; it does not bound how many add calls a user makes, so a signed-in user could fill the free
tier's storage. The owner adds every user, so the trust model accepts it.

## Revised (2026-11-08): inserts go through two definer functions

The first version let `authenticated` insert into the tables directly (an insert policy `with check (true)` and `grant insert`).
Checked on the real Supabase project, PostgREST's `POST /rest/v1/shared_track_facts?on_conflict=track_id` with
`Prefer: resolution=ignore-duplicates,return=minimal` failed under that insert-only grant, twice:

1. `403`, `42501 permission denied for table`: `ON CONFLICT` needs `select` on the conflict column.
2. After `grant select (track_id)`: `403`, `42501 new row violates row-level security policy`: `ON CONFLICT` also passes the row
   through the select policy, and there is deliberately none; adding one would let a user list the table.

So the plain insert cannot work. `0005_shared_add_functions.sql` takes the fallback recorded in research D6, (b): it revokes every
privilege on the two tables from `authenticated`, `anon` and `public`, drops both insert policies, and adds
`add_track_facts(rows jsonb)` and `add_artist_reach(rows jsonb)`: `security definer`, `search_path = ''`, at most 200 rows (`54000`),
a non-array refused (`22023`), `ON CONFLICT ... DO NOTHING`, the table checks still binding (one bad row fails the call), `execute`
for `authenticated` only. Written only through `add_*`, read only through `get_*`; the tables answer nothing else. Nothing about the
data, the checks or the first-row-wins rule changes.

## Links

- Spec: [`specs/014-shared-track-facts/spec.md`](../../../specs/014-shared-track-facts/spec.md) · [plan](../../../specs/014-shared-track-facts/plan.md) · [research](../../../specs/014-shared-track-facts/research.md)
- Amends [ADR-14](ADR-14-users-by-server-account.md) (one named exception to isolation); keeps [ADR-08](ADR-08-owner-server-free-tier.md) (stores, never computes) and [ADR-04](ADR-04-keyless-sources-by-id.md) (keyed by ids)
- Constitution Principle I
- [ADR index](README.md)
- [Limits and roadmap](../800-limits-roadmap.md)
