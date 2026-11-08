# Quickstart: One worker for every user (round 015)

Prerequisites: round 014 deployed, migrations 0001 to 0005 applied, two app users (A and B) with a Spotify sync each.

## 1. Owner, once

1. Supabase dashboard → Authentication → Users → Add user: a dedicated email for the worker (not one used in the app). Copy its user id.
2. SQL editor: apply `supabase/migrations/0006_shared_worker.sql`, then `notify pgrst, 'reload schema';`.
3. SQL editor: `insert into public.shared_workers (user_id, label) values ('<worker user id>', 'owner PC');`

## 2. Checks (SQL editor, as the owner role, then as an ordinary account through the app)

| # | Check | Expected |
|---|---|---|
| 1 | As user A (an ordinary account, through the app's session): `rpc/is_shared_worker` | `false` |
| 2 | As user A: `rpc/claim_any_job`, `rpc/worker_finish_job` | error `42501` |
| 3 | As user A: `select * from shared_workers` | permission denied |
| 4 | As the worker account: `select * from jobs`, `select * from shared_workers` | permission denied |
| 5 | As the worker account: `rpc/is_shared_worker` | `true` |

## 3. Run

1. Set `WORKER_MODE=shared` in `worker/.env` (or `mix-worker.env` beside the `.exe`) and start the worker; sign in with the worker email. Start line ends with "shared worker".
2. User A and user B each request a mix identification from the app (A asks for three, B for one).
3. Expected: the worker takes A's oldest, then B's, then A's next (fair turns); progress shows on each user's own phone; each result lands in the requester's mixes only; A's Stop works on A's request only.
4. Remove the worker from the list (`delete from public.shared_workers where user_id = '<id>'`): the next poll exits with "no longer a shared worker" (exit 7), and a request it held returns to the queue after the stale limit.
5. Personal mode: `WORKER_MODE=personal`, signed in as user A: takes only A's requests, as before.
6. Two shared workers at once on the same queue: no request is taken twice.

Record the output of checks 1 to 5 and the order seen in step 3 here when done.

## Recorded output

_(pending: owner-run)_
