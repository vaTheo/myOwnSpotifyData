# Quickstart: set up the server and prove the feature works

**Feature**: [spec.md](spec.md) · **Contracts**: [server-schema](contracts/server-schema.md), [client-api](contracts/client-api.md)

## 1. Create the project (owner, once)

1. On supabase.com, create a Free project; note its **Project URL** and **publishable key** (Project Settings → API Keys).
2. Authentication → Sign In / Providers: Email on, **Allow new users to sign up off**.
3. Authentication → URL Configuration: Site URL `https://vatheo.github.io/myOwnSpotifyData/`; Redirect URLs add
   `https://vatheo.github.io/myOwnSpotifyData/?link=server` and `http://127.0.0.1:5173/myOwnSpotifyData/?link=server`.
   Authentication → Email: OTP expiry 600 seconds.
4. Authentication → Users → Add user: the owner's email, auto-confirm, no password (sign-in is by magic link).
   Account → Security on supabase.com: enable MFA; never copy the `service_role` key anywhere (security review S4).
5. Apply the schema, one of:
   ```sh
   npx supabase@2 login
   npx supabase@2 link --project-ref <ref>
   npx supabase@2 db push
   ```
   or paste `supabase/migrations/0001_init.sql` into SQL Editor → Run.
6. Locally: `.env` gains `VITE_SUPABASE_URL=` and `VITE_SUPABASE_KEY=`. In GitHub: Settings → Secrets and variables → Actions →
   **Variables**, the same two names (they are public values).

## 2. Run

```sh
yarn
yarn dev            # http://127.0.0.1:5173/myOwnSpotifyData/
yarn typecheck && yarn lint && yarn test
```

## 3. Validation scenarios

| # | Scenario (spec) | Steps | Expected |
|---|---|---|---|
| 1 | US3-2: no server configured | run with the two settings empty | Settings says "No server set up"; every screen as today; no request to the server in the Network tab |
| 2 | US4-1: sign in once | Settings → Server → email → Send me a link; open the link from the email **in the same browser** | the app opens on Settings with status Connected; the URL is the app path + `#/settings` (no `code`, no token); reload keeps it; `localStorage` has `server-session` and no `server-pkce`; the Spotify `session` is unchanged |
| 2d | SC-007: link in another browser | request a link in browser A, open it in browser B | B shows "open the link in the browser that asked for it"; B is not signed in; A still can sign in by requesting a new link |
| 2b | Phone hand-off | on the Android phone, with the app on the home screen, open the link from the mail app | it opens in Chrome on the app's URL and signs in there; if the home-screen window and Chrome are separate storage, sign in from Chrome once and note it in the manual |
| 2c | Unknown email | send a link to an email that is not the owner's | Settings shows the same generic "If this email has an account, a link was sent"; no email is sent |
| 3 | US1-1 / SC-001: restore into an empty browser | on browser A: sync, import, run reach; on browser B (fresh profile): connect Spotify, sign in to the server | B shows the same Top, Playlists, Crate, Under the radar within a minute; the Network tab shows exactly one `api.spotify.com/v1/me` call, made by the Connect tap, and no other Spotify call before a tap |
| 3b | D11: another account | on B, connect with a second Spotify account while A's data is on the server | B shows the "different Spotify account" notice, pulls nothing, keeps its local data; Sync now asks the existing account-switch question |
| 4 | US1-3: gates after a restore | on B open Crate and Under the radar | both open; `historySummary.version === 2` and `artistReachSummary.version === 1` present in B's `meta` |
| 5 | US2-1: newer wins | sync on A at t1, on B at t2 > t1, reopen A | A pulls B's library; the `datasets` row for `library` has `fetched_at = t2` |
| 6 | US2-3: mix edit and delete | edit a mix on A, delete another on A; reopen B | B shows the edit and no longer lists the deleted mix (tombstone in `mixes`) |
| 7 | US3-1 / SC-003: offline | block the project host in DevTools; open every screen | all work; Settings says "Server offline" with the last sync time; nothing else changes |
| 8 | US3-3 / FR-008: pending push | while blocked, run a history import; unblock; reopen | the import reaches the server (stamp `history` updated); `serverPending` cleared |
| 9 | Paused project | pause the project from the dashboard (or wait a week); open the app | Settings says "Server paused" with the dashboard link; local data works |
| 10 | US4-4 / SC-006: remove server data | Settings → Remove server data → confirm | all four tables empty for the owner (SQL Editor: `select count(*) from dataset_rows`); other devices show local-only on next open |
| 11 | SC-004: used share | Settings → Server | shows "x MB of 500 MB"; matches `select pg_database_size(current_database())` |
| 12 | SC-007 / S1: public key alone | for each of `datasets`, `dataset_rows`, `mixes`, `jobs`: `curl "$URL/rest/v1/<table>?select=*" -H "apikey: $KEY"` and `curl -X POST "$URL/rest/v1/rpc/storage_used" -H "apikey: $KEY"` | `[]` or 401 for every table; the function call is refused; never a row |
| 12b | SC-007 / S1: a second user | create a temporary user in the dashboard, sign in with it in a private window, open Settings | every dataset shows empty on the server; `select count(*)` through that user's session is 0 for every table; delete the user afterwards |
| 13 | FR-018 / S3: tampered row | in SQL Editor, set a mix row's `row->>'playerSrc'` to `https://evil.example/` and a track's `spotifyUrl` to `javascript:alert(1)`; pull | both rows are rejected, Settings says "2 rows rejected"; the local rows are unchanged |
| 14 | FR-019 / S6: CSP | with the policy on, run every feature once on the phone: sync, import, BPM lookup (ReccoBeats), rekordbox, reach (MusicBrainz, ListenBrainz, Deezer, Wikidata, Wikimedia), mix lookup (SoundCloud, TrackId), player, create playlist, like, server sync | no CSP violation in the console; every feature works |

## 4. Tests that pin the rules (run by `yarn test`)

- `src/server/datasets.test.ts`: `compareStamps` (push / pull / same; null cases), `batches` (500), `planMixes` (edit, tombstone, both sides newer).
- `src/server/client.test.ts`: every error mapping of the schema contract with a fake `fetchFn`; never throws.
- `src/server/session.test.ts`: `requestLink` stores a verifier and sends its S256 challenge; `completeLink` exchanges `?link=server&code=` with the stored verifier and clears it, returns `'none'` without the marker, `'invalid'` without a verifier or on a 400; refresh margin; refresh re-reads storage first and retries once on "already used"; 401 on refresh → signed out; storage shape.
- `src/server/validate.test.ts`: every rule of `contracts/client-api.md` "validate.ts" with one accepted and one rejected case each (`javascript:` href, a foreign iframe src, a non-finite number, a summary with the wrong version, an extra unknown field kept).
- `src/server/sync.test.ts`: a push writes rows under a new generation then switches the stamp then drops the old; a pull refuses a newer `schema_version`; `history` rows and summary land together; an account mismatch is refused; a missing local `accountId` skips the pull.
- `src/sync/runner.test.ts`: `resolveConnectedAccount(undefined, 'a') === 'set'`, `('a','a') === 'same'`, `('a','b') === 'mismatch'`.
- `src/db/repo.test.ts`: `replaceDataset` clears and writes in one transaction; `DB_VERSION` unchanged.
