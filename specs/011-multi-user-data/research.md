# Research: Multi-user data

## D1 Server isolation already exists

`supabase/migrations/0001_init.sql`: `owner_id uuid default auth.uid()` on `datasets`, `dataset_rows`, `mixes`, `jobs`; one policy per
command with `owner_id = auth.uid()`; `anon` has no grant. `claim_job` (0002) is security invoker, so it only sees the caller's
rows; the worker signs in with its own magic-link session. **Decision**: no migration. The round adds an audit step (quickstart, a
second real user) rather than new rules. **Alternative** rejected: a new `users` table; nothing needs it.

## D2 One database per user, by name

IndexedDB has no rename and Principle V forbids rewriting. **Decision**: the first user to sign in on a device claims `spotify-dj`
(recorded in `localStorage` `deviceOwner`); every later user opens `spotify-dj-u-<userId>`. The owner's data never moves.
**Alternatives**: a `userId` field in every store (a rewrite of every row and every query: rejected); copy to a new name (rejected, see plan).

## D3 Spotify session per user

`auth/session.ts` keeps one `session` and one `pkce` key. **Decision**: the claimer keeps these exact keys; others use
`session:<userId>`, `pkce:<userId>`. A returning user is still connected to Spotify after a switch. The quota lock-out stays device-wide
(it belongs to the app's Client ID, S08d).

## D4 The switch is a pointer plus a reload

`localStorage` `activeUser` = `{ userId, email }`, read synchronously at module load by `db/repo.ts` and `auth/browser.ts`. A change
of user writes it and reloads. **Alternative**: a live reset of every signal (rejected, D-risk in plan).

## D5 The gate

With `VITE_SUPABASE_URL` and key set and no server session, the app renders only the sign-in screen. A stored session from before this
round has no `userId`: it is read from the access token's `sub` claim (no network). The owner is therefore claimed on the first load,
with no new sign-in.

## D6 Who may sign in

Already closed: sign-ups are off in the project and `/otp` is called with `create_user: false`; the generic "if this email has an
account" notice stays (S5). The Spotify side is the owner's allowlist; a user not on it gets the existing "not allow-listed" message.

## D7 The worker

Unchanged: it signs in as its user and reads that user's queue. A worker session of another user cannot see the owner's requests (D1).

## D8 Risks recorded

- Pre-update data goes to whoever signs in first on a device (spec assumption); the update note tells the owner to sign in first.
- A browser's `localStorage` is readable by anyone with devtools on a shared profile; no stronger than today.
- Free-tier storage is shared by all users: Settings keeps the used share.
