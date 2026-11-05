# Contract: the server schema (`supabase/migrations/0001_init.sql`)

What the migration must create; the tables are specified in [data-model.md](../data-model.md). This page fixes the names and the
policies the client relies on.

## Names

- Schema `public`; tables `datasets`, `dataset_rows`, `mixes`, `jobs`; function `storage_used()`.
- `owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade` on every table.

## Row Level Security

Enabled on all four tables. One policy per command on each table, all with `using (owner_id = auth.uid())` and, for insert and
update, `with check (owner_id = auth.uid())`. `grant select, insert, update, delete` on the four tables to `authenticated` only;
nothing to `anon`. `grant execute on function storage_used() to authenticated`.

## Requests the client makes (PostgREST)

| Purpose | Request |
|---|---|
| read stamps | `GET /rest/v1/datasets?select=*` |
| write a stamp | `POST /rest/v1/datasets` with `Prefer: resolution=merge-duplicates` |
| push a batch | `POST /rest/v1/dataset_rows` (array of ≤ 500 rows) with `Prefer: resolution=merge-duplicates` |
| pull a page | `GET /rest/v1/dataset_rows?dataset=eq.X&generation=eq.N&spotify_account_id=eq.A&order=store,key` with `Range: 0-999` |
| drop old rows | `DELETE /rest/v1/dataset_rows?dataset=eq.X&spotify_account_id=eq.A&generation=lt.N` |
| mixes | `GET /rest/v1/mixes?select=url,saved_at,deleted_at` then `GET …&url=in.(…)` for the rows to pull; `POST` with merge for pushes and tombstones |
| remove all | `DELETE` on each table with `owner_id=eq.<uid>` (RLS limits it anyway) |
| used share | `POST /rest/v1/rpc/storage_used` |

Every request carries `apikey: <publishable key>` and `Authorization: Bearer <access token>`.

## Auth (GoTrue)

| Purpose | Request |
|---|---|
| request a link | `POST /auth/v1/otp` `{ email, create_user: false }` with query `redirect_to=<app URL>` → 200 empty; the email carries the link |
| complete | the link opens the app with `#access_token=…&refresh_token=…&expires_in=…&token_type=bearer&type=magiclink`; the app parses it, no request |
| refresh | `POST /auth/v1/token?grant_type=refresh_token` `{ refresh_token }` → `{ access_token, refresh_token, expires_in, user }` |
| sign out | `POST /auth/v1/logout` with the bearer token |

Project settings required: "Allow new users to sign up" **off**; the one user created by the owner in the dashboard; URL
Configuration with the app's public URL as Site URL and the `127.0.0.1` dev URL as an additional redirect. A `redirect_to` not in
that list is silently replaced by the Site URL.

## Error mapping the client must honour

| Answer | Client result |
|---|---|
| network failure, 502, 503, 504 | `offline` |
| a paused project (the gateway answers 5xx with a "project paused" body, or the host does not resolve) | `paused` |
| 401 on a data call | refresh once, then `signedOut` |
| 401 on a refresh | `signedOut` |
| 422 or 400 on `/otp` (unknown email with `create_user: false`, signups off) | `error` "no account for this email" |
| 429 on `/otp` | `error` with the wait (one link a minute by default) |
| 413 | `error` "batch too large" (the batch size is a constant; never silently retried) |
| any other 4xx | `error` with the body's `message` or `hint` |
