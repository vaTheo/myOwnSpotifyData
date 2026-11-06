# Contract: the server schema (`supabase/migrations/0001_init.sql`)

What the migration must create; the tables are specified in [data-model.md](../data-model.md). This page fixes the names and the
policies the client relies on.

## Names

- Schema `public`; tables `datasets`, `dataset_rows`, `mixes`, `jobs`; function `storage_used()`. Migration `0002_jobs.sql`
  (worker round, `specs/002-mix-analysis-worker/contracts/server-schema.md`) adds `jobs.applied_at`, an index and `claim_job()`.
- `owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade` on every table.

## Row Level Security

Enabled on all four tables. One policy per command on each table, all with `using (owner_id = auth.uid())` and, for insert and
update, `with check (owner_id = auth.uid())`.

## Grants (security review S1)

Supabase grants new `public` tables to `anon` by default, so the migration must undo that explicitly:

```sql
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon, public;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon, public;
grant select, insert, update, delete on datasets, dataset_rows, mixes, jobs to authenticated;
grant execute on function storage_used() to authenticated;
```

`storage_used()` is `security definer set search_path = ''` and calls `pg_catalog.pg_database_size(pg_catalog.current_database())`
(S10).

## Requests the client makes (PostgREST)

| Purpose | Request |
|---|---|
| read stamps | `GET /rest/v1/datasets?select=*` |
| write a stamp | `POST /rest/v1/datasets` with `Prefer: resolution=merge-duplicates` |
| push a batch | `POST /rest/v1/dataset_rows` (array of ≤ 500 rows) with `Prefer: resolution=merge-duplicates` |
| pull a page | `GET /rest/v1/dataset_rows?dataset=eq.X&generation=eq.N&spotify_account_id=eq.A&order=store,key` with `Range: 0-999` |
| drop old rows | `DELETE /rest/v1/dataset_rows?dataset=eq.X&spotify_account_id=eq.A&generation=lt.P` where P is the **previous** stamp's generation, so one older generation survives until the next push (S9) |
| mixes | `GET /rest/v1/mixes?select=url,saved_at,deleted_at&spotify_account_id=eq.A` then `GET /rest/v1/mixes?select=*&spotify_account_id=eq.A` and pick the rows `planMixes` asks for in the client, never a list of urls in the query (S8); `POST` with merge for pushes and tombstones |
| remove all | `DELETE` on each table with `owner_id=eq.<uid>` (RLS limits it anyway) |
| used share | `POST /rest/v1/rpc/storage_used` |

Every request carries `apikey: <publishable key>` and `Authorization: Bearer <access token>`.

## Auth (GoTrue)

| Purpose | Request |
|---|---|
| request a link | `POST /auth/v1/otp` `{ email, create_user: false, code_challenge, code_challenge_method: 's256' }` with query `redirect_to=<app URL>?link=server` → 200 empty; the email carries the link (PKCE flow, S2) |
| complete | the link opens the app with `?link=server&code=<auth code>`; the app posts `POST /auth/v1/token?grant_type=pkce` `{ auth_code, code_verifier }` → `{ access_token, refresh_token, expires_in, user }` |
| refresh | `POST /auth/v1/token?grant_type=refresh_token` `{ refresh_token }` → `{ access_token, refresh_token, expires_in, user }` |
| sign out | `POST /auth/v1/logout` with the bearer token |

Project settings required: "Allow new users to sign up" **off**; the one user created by the owner in the dashboard; URL
Configuration with the app's public URL as Site URL and `<app URL>?link=server` plus the `127.0.0.1` equivalents as redirect URLs
(the list accepts exact URLs; `?link=server` must be present). A `redirect_to` not in that list is silently replaced by the Site
URL. Email OTP expiry set to 600 seconds (S5). MFA enabled on the supabase.com account (S4).

## Error mapping the client must honour

| Answer | Client result |
|---|---|
| network failure, 502, 503, 504 | `offline` |
| a paused project (the gateway answers 5xx with a "project paused" body, or the host does not resolve) | `paused` |
| 401 on a data call | refresh once, then `signedOut` |
| 401 on a refresh | `signedOut` |
| 422 or 400 on `/otp` (unknown email with `create_user: false`, signups off) | `error`; the UI shows the generic "If this email has an account, a link was sent" (S5) |
| 400 on `grant_type=pkce` (code used, expired, or a verifier from another browser) | `error` "open the link in the browser that asked for it, within 10 minutes" |
| 400 "already used" on a refresh | re-read storage, retry once, then `signedOut` (S7) |
| 429 on `/otp` | `error` with the wait (one link a minute by default) |
| 413 | `error` "batch too large" (the batch size is a constant; never silently retried) |
| any other 4xx | `error` with the body's `message` or `hint` |
