# A server and database holding the app's data: design

> **Status**: Implemented (shipped 2026-11-06, inventory F18)
> **Last updated**: 2026-11-06

Date: 2026-11-05. This round was driven with the Spec Kit skills; the full specification, research, data model, contracts,
security review, quickstart and task list live under [`specs/001-backend-data-sync/`](../../specs/001-backend-data-sync/spec.md)
at the repo root. This page is the short record the documentation map expects, with the decisions and what shipped.

## What it is

One server for the owner alone: a Supabase Free project (Postgres behind PostgREST, Supabase Auth) that holds every dataset the
app builds, per Spotify account, so a fresh browser restores everything after one sign-in and two devices converge on the newest
copy of each dataset. The server stores and never computes, never sees a Spotify token, and the app works whole without it
([ADR-08](../architecture/700-adr/ADR-08-owner-server-free-tier.md)).

## Decisions

1. **Plain `fetch`, no dependency.** `src/server/client.ts` is the shape of `src/spotify/client.ts`: an injected `fetchFn` and a
   `ServerResult` instead of a throw. The owner chose it over `@supabase/supabase-js`.
2. **Magic link in the PKCE flow.** The verifier waits in `localStorage` (`server-pkce`); the link comes back as
   `?link=server&code=…`, which `main.tsx` tells apart from Spotify's `?code=` callback; no token ever in a URL. Sign-ups are off in
   the project and `create_user: false` in the request, so only the owner's account exists.
3. **Rows as JSON, in batches, under a generation.** `dataset_rows` holds every row of the four replace-whole datasets (library,
   history, features, reach) as `jsonb`; a push writes them in batches of 500 under a new generation, then switches the `datasets`
   stamp, then drops the generation **before the previous one**, so one bad push stays recoverable. Hosted PostgREST rejects bodies
   around 1 MB.
4. **Newer wins per dataset** by the time the data was fetched or imported (`lastSyncAt`, `historySummary.importedAt`, the newest
   `features.updatedAt`, `artistReachSummary.ranAt`), never by push time. Mixes converge **per row** by `savedAt`, with tombstones
   for deletions (`deleteMix` records them in the `mixDeleted` meta).
5. **One `/me` call on the Connect tap** stores the Spotify account id; a differing stored id is never overwritten (the sync job's
   own question decides the switch); a pull refuses when the server holds another account only.
6. **Every pulled row is validated** before it is written or rendered (`src/server/validate.ts`): keys, finite numbers, `https:`
   links, `open.spotify.com` links, the SoundCloud player prefix, the summary versions the gates read. Rejected rows are counted and
   shown.
7. **Pull joins `jobsBusy()`, push does not.** A pull writes the library stores and ends in `loadFromDb()`; a push reads only. A
   push runs at the tail of each job and after every mix save or delete; the datasets are flagged in the `serverPending` meta first,
   so an offline push is retried on the next open.
8. **Offline and paused are states, not errors.** A Free project pauses after a week without traffic and only the dashboard resumes
   it; the card says so with the link. No retry loop.
9. **A Content Security Policy** in `index.html` lists every host the app talks to; the server URL is filled at build time by a
   small plugin in `vite.config.ts`.
10. **No client-side encryption** (declined by the owner): the data is protected by Row Level Security, sign-ups off, the PKCE link
    and MFA on the dashboard account. Rows are opaque JSON, so encryption can be added later without a schema change.

## Out of scope

- Fetching a mix's audio and identifying its tracks: the next round, a worker on the owner's computer polling the `jobs` table.
- Any job that runs on the server; any Spotify call from the server; more than one person.

## Compatibility

No `DB_VERSION` bump: four new `meta` names (`serverStamps`, `serverPending`, `serverLastSync`, `mixDeleted`) and one new
`localStorage` key (`server-session`, plus the transient `server-pkce`). Without the two build settings the app is exactly the
previous app. The `confirm()` for "Remove server data" is the one new question.

## Links

- [Spec Kit folder](../../specs/001-backend-data-sync/spec.md): [plan](../../specs/001-backend-data-sync/plan.md),
  [research](../../specs/001-backend-data-sync/research.md), [data model](../../specs/001-backend-data-sync/data-model.md),
  [security review](../../specs/001-backend-data-sync/security.md), [quickstart](../../specs/001-backend-data-sync/quickstart.md)
- [Feature inventory](../architecture/100-features.md) (F18)
- [How the app works](../architecture/000-how-it-works.md) §16
- [ADR-08](../architecture/700-adr/ADR-08-owner-server-free-tier.md)
- [ADR index](../architecture/700-adr/README.md)
- [Limits and roadmap](../architecture/800-limits-roadmap.md)
- [Documentation map](../README.md)
