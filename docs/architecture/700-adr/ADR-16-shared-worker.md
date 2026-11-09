# ADR-16 — One worker for every user: a named worker role that reaches the queue only through five functions

> **Status**: Accepted
> **Date**: 2026-11-08

## Context

ADR-14 gave every user data of their own, and "the worker reads its signed-in user's queue". With friends on the app, each one
would have to run a worker of their own to identify a mix. The owner wants one worker, run on the owner's computer, that takes any
user's identification request and sends the result back to the right person, without opening a way into anyone's library. The
owner picked (2026-11-08): a separate worker role with its own functions, not a service key; both modes kept; the mode is a worker
setting checked against a list on the server; one request per user in turn.

## Options considered

| Option | Description | For | Against |
|---|---|---|---|
| A service key in the worker | the worker bypasses row security | nothing to write on the server | it sees every table of every user; one leak of the key ends ADR-14 |
| Table policies on `jobs` for listed workers | select and update policies that let a listed account see and change any request | familiar rules | a policy says which rows, not which columns: a worker could change `owner_id`, or read `result` of every request; one missed column, hard to audit |
| A worker per user | every friend installs and runs one | no server change | what the owner wants to avoid |
| A claim in the sign-in token (`app_metadata`) | the account carries "shared worker" in its token | no table | stays valid until the token expires; set by a dashboard form that is easy to mistype |
| Five functions and a private list *(chosen)* | the worker role has no privilege on any table; five `security definer` functions name what they return and write; the list `shared_workers` is edited only by the owner | one place to audit; removal works at the next call | the functions are new code the audit test must pin |

## Decision

A **shared worker** is an ordinary sign-in account the owner creates in the dashboard and adds to the table `shared_workers`. It
reaches the queue only through five functions.

- **The list.** `shared_workers(user_id, label, added_at)`: row security on, no policy, no grant for `authenticated`, `anon` or
  `public`. The owner adds or removes a row in the SQL editor; nothing the app or an ordinary account can call writes it.
- **No table privilege.** The worker account reads and writes no table. Each function starts with `require_shared_worker()`, which
  checks `auth.uid()` against the list on every call, so removal takes effect at the next call.
- **Five definer functions**, `security definer`, `search_path = ''`, `execute` for `authenticated` only: `is_shared_worker()`,
  `claim_any_job`, `worker_set_progress`, `worker_finish_job`, `worker_release_job`.
- **The claim returns only `id` and `payload`.** Never the owner, never a result, never another row.
- **A held request is bound to the account.** `claim_any_job` sets `jobs.claimed_by_user`; writes need the same worker name, the
  same account and the status `claimed`. `worker_finish_job` accepts only `status`, `finished_at`, `result` and `error`; the owner
  of the request cannot change.
- **One request per user in turn.** The claim orders by the owner's last turn (never served first), then `priority`, then
  `created_at`, in one statement with `for update skip locked`. The last turn lives in a private table,
  `shared_worker_turns(owner_id, served_at)` (row security on, no policy, no privilege for anyone), written only by `claim_any_job`
  after it takes a row. It is not read from `jobs.claimed_at`: the owner of a request can rewrite or delete their own `jobs` rows
  through the app's policies and would always go first.
- **Shared mode fetches SoundCloud links only.** The worker accepts an `https` link on `soundcloud.com`, `www.soundcloud.com` or
  `m.soundcloud.com` (the hosts the app itself creates requests for); anything else is finished as failed, "link not allowed in
  shared mode", before any download, so a friend's request cannot make the owner's computer fetch an arbitrary address (the owner's
  cookies, the local network). Personal mode is unchanged.
- **Both modes stay.** `WORKER_MODE=personal` is today's worker and `claim_job` is untouched; `shared` checks
  `is_shared_worker()` at start and stops with exit code 7 when the account is not on the list.

Still true: the server stores, never computes, never calls Spotify; no secret reaches the app.

## Consequences

**Positive:** friends get mix identification without installing anything; the worker cannot read a library, a playlist, a play
count or another request; the owner switches a worker off with one deleted row; a test reads the migration so the audit cannot drift.

**Negative / watch for:** a worker account that is not removed from the list after it leaks can take any request until removed; the
owner's computer carries every user's identification load; a turn is recorded when a request is taken, so a request released or
stalled still used its owner's turn; there is no per-user cap on queued requests, no shared result between two users who asked the same link, and no app
screen for workers (see Limits and roadmap).

## Amendment (round 017, worker 0.7.1): the mode follows the account

`WORKER_MODE` defaults to `auto`: after sign-in the worker asks `is_shared_worker` and runs shared when the account is listed,
personal when it is not. `personal` and `shared` stay as forced values (a forced `shared` on an unlisted account still exits 7). A
failed check ends the run with its exit code and never guesses. The server, the five functions and the isolation are unchanged: the
role is still granted only by the owner's row in `shared_workers`. Cost: an account the owner lists and also uses personally now
takes everyone's requests; keep a dedicated account for the role (the start line names the mode).

## Links

- Spec: [`specs/015-shared-worker/spec.md`](../../../specs/015-shared-worker/spec.md) · [plan](../../../specs/015-shared-worker/plan.md) · [research](../../../specs/015-shared-worker/research.md)
- Amends [ADR-14](ADR-14-users-by-server-account.md) (the shared worker is the one named exception to "the worker reads its signed-in user's queue") and [ADR-08](ADR-08-owner-server-free-tier.md) (the worker may serve every user); keeps [ADR-09](ADR-09-mix-identification-on-the-owners-computer.md) and [ADR-15](ADR-15-shared-track-facts.md)
- Constitution Principle I
- [ADR index](README.md)
- [Limits and roadmap](../800-limits-roadmap.md)
