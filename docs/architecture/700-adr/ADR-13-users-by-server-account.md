# ADR-13 — Users are server accounts: one local database and one Spotify login per user, the first sign-in claims what exists

> **Status**: Accepted
> **Date**: 2026-11-08

## Context

ADR-08 gave the app one server "for the owner alone". The owner now wants friends to use the app with data of their own, while
everything that exists today stays the owner's. The server already separates accounts: every table carries `owner_id = auth.uid()`
row rules and `anon` has no grant; the worker signs in as its own user. The device does not: one IndexedDB database
(`spotify-dj`) and one Spotify session (`session`, `pkce`) per browser. Principle V forbids renaming or rewriting a store, and the
owner's library took hours to build.

## Options considered

| Option | Description | For | Against |
|---|---|---|---|
| Spotify account is the user | A database per Spotify account id | no server needed | the owner chose the email account as the user; shared devices need a sign-in anyway |
| A `userId` field in every row and query | one database, rows tagged | one connection | rewrites every row and every reader; one missed filter leaks a user's data |
| One database and one key set per server user; first sign-in claims the existing names *(chosen)* | `spotify-dj` and `session` stay the claimer's; others get a suffix | nothing copied or renamed; the owner's data does not move; isolation by name | a page reload on every switch of user |

## Decision

The user is the server account (email sign-in). The owner creates accounts in the Supabase dashboard (sign-ups stay off); a new user
signs in with their email, then connects their own Spotify account (the owner allowlists it in Spotify's dashboard).

- **Names.** The first user to sign in on a device **claims** the existing names (`deviceOwner` in `localStorage`, never changed):
  database `spotify-dj`, keys `session` and `pkce`. Every other user gets `spotify-dj-u-<userId>`, `session:<userId>`,
  `pkce:<userId>`. No store changes, no `DB_VERSION` bump, no copy.
- **Switching.** Completing a sign-in as another user writes the `activeUser` pointer and reloads the page, so no in-memory signal
  holds another user's data. Sign-out removes the server session and the pointer and reloads; it removes no data and asks nothing
  (refused while a job or a server push runs). Each page resolves its names once, at load, and keeps them: another tab's sign-in
  or sign-out reloads it instead of moving it onto another user's names.
- **The gate.** With the server settings present and nobody signed in, the app shows only a sign-in screen. Without the settings the
  app is the single-user browser-only app of today (every name is the unscoped one). The dev-only demo never shows it.
- **Unchanged.** The server schema and rules, the worker (it reads its signed-in user's queue), ADR-02/03/04 per user, the
  quota lock-out (device-wide, it belongs to the app's Client ID).

## Consequences

**Positive:** the owner's data stays where it is; a second person starts empty; isolation is by database name and by the server's row rules.

**Negative / watch for:** pre-update data goes to whoever signs in first on a device, so the owner signs in first on his own devices;
a new sign-in needs the network; every user's copy takes device storage and the shared free-tier share; the quota of Spotify reads is
the app's, shared by all users; there is no "remove this person from this device" button yet (Limits and roadmap); `localStorage`
is readable with devtools on a shared browser profile, no stronger than today.

## Links

- Spec: [`specs/009-multi-user-data/spec.md`](../../../specs/009-multi-user-data/spec.md)
- Amends [ADR-08](ADR-08-owner-server-free-tier.md) ("for the owner alone"); keeps [ADR-05](ADR-05-additive-indexeddb.md)
- Constitution Principle I
- [How the app works](../000-how-it-works.md) §6, §13, §14, §16 "Users" · [Feature inventory](../100-features.md) F24 · [Limits and roadmap](../800-limits-roadmap.md) §2
- [ADR index](README.md)
