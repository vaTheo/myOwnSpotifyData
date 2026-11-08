# Contract: the server side of the worker round (`supabase/migrations/0002_jobs.sql`)

Builds on `../../001-backend-data-sync/contracts/server-schema.md` (tables, RLS, grants, the error mapping). One new migration,
applied by the owner the same way as `0001` (SQL editor or `supabase db push`). Nothing of `0001` is altered.

## `0002_jobs.sql`

```sql
-- Worker round (spec 002): the app merges a done result once per owner, other
-- devices skip it and receive the mix through the mixes sync.
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
```

Invariants kept: RLS `owner_id = auth.uid()` on every statement; `anon` has no privilege on the table nor the function;
`status` keeps the four values of `0001` (`queued`, `claimed`, `done`, `failed`); `p_stale_seconds` is validated by the worker
(positive, default 21600) and by the function's `make_interval` (a negative value reclaims nothing useful, never errors).

## The requests

All with `apikey: <publishable key>` and `Authorization: Bearer <access token>`, `Content-Type: application/json`.

| Who | Request | Body / query | Answer used |
|---|---|---|---|
| app | `GET /rest/v1/jobs?kind=eq.identify-mix&payload->>url=eq.<url>&status=in.(queued,claimed)&select=id` | — | non-empty → "Already requested" |
| app | `POST /rest/v1/jobs` `Prefer: return=representation` | `{ "kind": "identify-mix", "payload": { "url": "<canonical>" } }` | `id`, `created_at` |
| app (pull) | `GET /rest/v1/jobs?kind=eq.identify-mix&select=id,payload,status,claimed_by,claimed_at,finished_at,error,created_at,applied_at&order=created_at.desc` with `Range` pages of 1000 | — | request history per url |
| app (pull) | `GET /rest/v1/jobs?id=eq.<id>&select=result` | — | one done, unapplied result at a time |
| app (pull) | `PATCH /rest/v1/jobs?id=eq.<id>&applied_at=is.null` `Prefer: return=representation` | `{ "applied_at": "<now>" }` | 0 rows → another device applied it first; keep the mix as pulled |
| worker | `POST /rest/v1/rpc/claim_job` | `{ "p_worker": "<name>", "p_stale_seconds": 21600 }` | `[]` → queue empty; `[row]` → the request |
| worker | `PATCH /rest/v1/jobs?id=eq.<id>&status=eq.claimed&claimed_by=eq.<name>` `Prefer: return=representation` | `{ "status": "done", "finished_at": "<now>", "result": { … } }` or `{ "status": "failed", "finished_at": "<now>", "error": "<one line>" }` | `[]` → the row was reclaimed by another worker: log, discard |
| worker (Ctrl-C) | same `PATCH` filter | `{ "status": "queued", "claimed_by": null, "claimed_at": null }` | best effort, 3 s timeout |
| worker (login) | `POST /auth/v1/otp?redirect_to=http://127.0.0.1:5173/myOwnSpotifyData/?link=worker` | `{ "email", "create_user": false, "code_challenge", "code_challenge_method": "s256" }` | 200 → the link is on its way; the worker listens on 127.0.0.1:5173 for `?code=` |
| worker (login) | `POST /auth/v1/token?grant_type=pkce` | `{ "auth_code": "<from the redirect>", "code_verifier": "<kept in memory>" }` | `access_token`, `refresh_token`, `expires_in` |
| worker (login --code) | `POST /auth/v1/otp` | `{ "email": "<owner>", "create_user": false }` | 200 → "check your mail" |
| worker (login --code) | `POST /auth/v1/verify` | `{ "type": "email", "email": "<owner>", "token": "<6 digits>" }` | `access_token`, `refresh_token`, `expires_in` |
| worker | `POST /auth/v1/token?grant_type=refresh_token` | `{ "refresh_token": "<…>" }` | new pair, stored in place |
| worker (logout) | `POST /auth/v1/logout?scope=local` (this session only; round 011 audit Finding 3) | — | session file removed |

Error mapping, same as `client.ts`: network failure or 5xx → `offline` (worker: exit 2 "server unreachable, try later"); a 5xx
whose body mentions the project being paused, or a DNS failure → `paused` (exit 3 with the dashboard hint); 401 → `unauthorized`
(worker: one refresh, then exit 4 "run `mix-worker login` again"); 413 → `tooLarge` (the request is marked `failed` "Result too
large" with a second, small PATCH); 429 → wait `Retry-After` once, then `offline`.

## Setup the owner does once (quickstart §1)

- Apply `0002_jobs.sql`. Nothing else: the worker's `login` uses the magic link and the dev redirect URL the project already
  allows. (`login --code` would need `Your code: {{ .Token }}` in the Magic Link template, which a Free project on the default
  mailer created after 2026-06-03 cannot edit without custom SMTP; signups stay **off** either way.)

## What stays true (security review 001)

S1 grants: nothing for `anon`; S3: every row the app reads is validated; S8: the app never sends a list of urls in a query (one
url per "Already requested" check, the history paged whole); the worker's credential is a user session, never the `service_role`
key; the worker's outbound hosts are the owner's project, the platform the link points to, and Shazam — never a Spotify host.
