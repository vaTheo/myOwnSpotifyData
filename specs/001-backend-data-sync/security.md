# Security review of the design (before any code)

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Date**: 2026-11-05 · **Scope**: the server design, the browser
side that talks to it, and what the server adds to the app's existing attack surface. Findings are ordered by severity; each one
says what changes in the contracts and tasks.

## What is protecting the data, in one paragraph

There is no server code of the owner's to attack. The data sits in a Supabase Postgres project reached through its REST gateway
with a **public** key; the only wall between the internet and the owner's listening history is Row Level Security (every row is
visible to `auth.uid() = owner_id` and to no one else) plus the fact that the only account that can exist is the owner's (signups
off, `create_user: false`). Above that wall sits the Supabase dashboard: whoever holds the owner's supabase.com login can read every
row with the SQL editor. Below it sits the browser: whoever can run script in the app's page (an XSS) can use the stored session as
the owner. The review is therefore about three things: never letting RLS fail open, keeping the two logins (supabase.com, the magic
link) hard to steal, and treating server rows as untrusted input once they come back.

## Findings

### S1 · HIGH · Supabase grants new tables to `anon` by default; the migration must revoke them

Supabase sets default privileges so that every new table in `public` is granted to `anon`, `authenticated` and `service_role`.
RLS still applies, so `anon` would read nothing, but a single table created with RLS forgotten (or a future `alter table … disable
row level security` typed in the SQL editor) would be world-readable with the public key. **Fix**: the migration ends with
`revoke all on all tables in schema public from anon; alter default privileges in schema public revoke all on tables from anon;`
and `grant` only what `authenticated` needs; a test in the quickstart proves the public key alone gets zero rows **and** a
second, temporary user gets zero rows. → contracts/server-schema.md "Grants", tasks T003, T045.

### S2 · HIGH · Magic link tokens in the URL hash; link scanners and history

The implicit magic link puts `access_token` and `refresh_token` in the URL. Mail providers' link scanners open links (consuming the
one-time link, sometimes before the owner), the tokens land in the browser history until replaced, and anyone who can read the
email can sign in from any browser. **Fix**: use the **PKCE flow** for the link: the app sends a `code_challenge` with the OTP
request and stores the verifier in `localStorage`; the link redirects with `?code=…` only; the app exchanges it with the verifier
(`grant_type=pkce`). A scanner that opens the link gets a code it cannot exchange; the link only works in the browser that asked
for it, which is the behaviour the spec wants anyway; no token is ever in a URL. The Spotify callback also uses `?code=`, so the
server link redirects to `<app>?link=server` and `main.tsx` branches on that marker, never on the presence of `code`. The app's
own PKCE helpers (`challengeFor`, `randomString`) are reused. → research D3, contracts (auth), tasks T006, T010, T014.

### S3 · HIGH · Rows pulled from the server are rendered as URLs and an iframe

`Mix.tsx` renders `MixRow.playerSrc` as an `<iframe src>`, `linkOut` and `playlistUrl` as `<a href>`, `Artist.tsx` renders
`ArtistReachRow.sourceUrl`, every screen renders `spotifyUrl`. Today those values are produced by the app's own validated lookups.
After this feature they can also come from the server, i.e. from anyone who holds the owner's dashboard login or a stolen session,
and a `javascript:` href or a phishing iframe would run in the owner's app. **Fix**: a pull validates every row before it is
written (`src/server/validate.ts`, pure, tested): keys are non-empty strings, `playerSrc` starts with the existing
`SC_PLAYER_PREFIX`, `spotifyUrl` starts with `https://open.spotify.com/`, `sourceUrl`/`linkOut`/`shazamUrl`/`imageUrl` are `https:`
URLs, numbers are finite, `version` fields are the expected literals; a row that fails is dropped and counted, and the pull reports
"n rows rejected" in `serverState`. → contracts/client-api.md, new task.

### S4 · MEDIUM · The supabase.com account is the master key

The dashboard reads every row, holds the `service_role` key and can disable RLS. There is no technical control in this repo for
it. **Fix**: the manual tells the owner to enable **MFA on supabase.com**, to never paste the `service_role` key anywhere, and to
keep the project in an organisation with only themselves. → README (task T041).

### S5 · MEDIUM · Anyone with the public key can email the owner a magic link

`POST /auth/v1/otp` with the owner's email sends them a link. With signups off nobody else can sign in, but it allows spamming the
owner and, since the built-in email service is limited (a few emails an hour, meant for development), locking the owner out of
sign-in for a while. **Fix**: keep the built-in rate limit (it bounds the spam); shorten the link's life in the dashboard (Email OTP
expiry 10 minutes, the minimum practical); show a generic "If this email has an account, a link was sent" instead of "no account
for this email" so the UI does not confirm the owner's address; and accept that a determined pest can delay a sign-in, which the
local-first design tolerates (the app keeps working). Custom SMTP is the upgrade path if it ever matters. → contracts (error
mapping), task T015, quickstart §1.

### S6 · MEDIUM · Two sessions in `localStorage`; XSS is the way in; Deezer JSONP is the existing hole

The Spotify session already lives in `localStorage`; the server session joins it. The app renders no raw HTML and has no third-party
script **except** the Deezer JSONP transport (`features/jsonp.ts`), which by construction runs a remote script in the page: a
compromised or spoofed Deezer answer is code execution with both sessions in reach. That risk predates this feature; the server
raises what is at stake (the data is now writable remotely, see S3). **Fix within this round**: a Content Security Policy `<meta>`
in `index.html` with `default-src 'self'`, `connect-src` limited to the Spotify, Supabase and lookup hosts, `script-src 'self'
https://api.deezer.com`, `frame-src https://w.soundcloud.com`, `img-src 'self' https: data:`, `object-src 'none'`, `base-uri
'self'`, `form-action 'self'`. It does not stop the Deezer script, but it stops an injected script from sending the sessions
anywhere but the allowed hosts. **Optional, bigger**: replace JSONP with a keyless proxy-free alternative later (out of scope).
→ new task; verified by running every feature with the policy on.

### S7 · MEDIUM · Refresh token rotation across tabs

Supabase rotates refresh tokens and revokes the whole family when an old one is reused outside a short grace interval. Two tabs
refreshing at once with the same stored token can sign the owner out everywhere. **Fix**: one in-flight refresh per tab (already
in the design, as in `auth/session.ts`), **re-read `localStorage` before refreshing** so a tab that lost the race uses the newer
token, and treat a refresh 400 "already used" as "re-read storage, retry once". → task T010.

### S8 · LOW · Keys and filters appear in the provider's API logs

PostgREST request URLs (dataset names, mix URLs in `url=in.(…)` filters) are kept in Supabase's API logs for a time. Not secret,
but a mix URL is a trace of what the owner listened to. **Fix**: fetch mixes by `select=*` with the account filter and let the
client pick, instead of listing urls in the query. → contracts (mixes request).

### S9 · LOW · A faulty push can delete the only server copy; Free has no backups

The generation swap deletes the previous generation right after the stamp switches. A bug in a new push (wrong rows, then the
delete) leaves the server with bad data and nothing to fall back on. **Fix**: keep the **previous** generation too (delete
`generation < previous`), so one bad push is recoverable from the dashboard; storage allows it (research "Sizes"). → contracts,
task T016/T018.

### S10 · LOW · `security definer` function without a fixed `search_path`

`storage_used()` runs as its definer; without `set search_path = ''` a function it calls could be shadowed. **Fix**: declare
`set search_path = ''` and schema-qualify `pg_catalog.pg_database_size`. → task T003.

### S11 · INFO · Things that are already right

HTTPS everywhere in production; no client secret anywhere; the Spotify token never reaches the server (the design never sends it
and the CSP makes an accidental leak visible); the app is static with no inline script, so a `<meta>` CSP is enforceable; RLS
`with check` on inserts prevents writing rows for another owner; Disconnect keeps server data and Remove asks first.

## Two hardenings that were the owner's call (decided 2026-11-05)

- **E1 declined**: no client-side encryption this round; the data is protected by RLS, signups off, the PKCE link and MFA on the
  dashboard account (S4). It can be added later without a schema change, since rows are already opaque JSON.
- **E2 accepted**: the Content Security Policy is part of this round (task in Phase 1, verified in Phase 7).

### E1 · Client-side encryption (the server never sees the data in clear)

The design already stores every row as opaque JSON that the server never queries, so encrypting each row and summary in the
browser (WebCrypto AES-GCM, a key derived with PBKDF2 from a passphrase the owner types once per browser, kept as a
non-extractable key in IndexedDB) makes the server **zero-knowledge**: a Supabase breach, a stolen dashboard login, a stolen
session, or a curious provider sees ciphertext. Mix URLs become an HMAC so the key column leaks nothing either. Cost: one more
module with tests (`src/server/crypto.ts`, about a day), a passphrase to remember (losing it loses the server copy, never the local
one; a device with data re-pushes under a new passphrase), and a second prompt on each new browser (after the magic link). It
closes S4 and most of S3's remote-tamper case (a tampered ciphertext fails authentication and is dropped).

### E2 · Content Security Policy now (S6)

Cheap to add, but it must be verified feature by feature on the phone: every host the app calls has to be listed, and the Deezer
and SoundCloud player exceptions kept. If a host is missed, that feature silently fails until the policy is fixed. Recommended.

## Verified (2026-11-06, against the owner's project, public key alone)

| Check | Result |
|---|---|
| Auth settings | `disable_signup: true`, anonymous sign-in off, no third-party provider |
| `GET /rest/v1/<table>?select=*` for `datasets`, `dataset_rows`, `mixes`, `jobs` | 401, `permission denied` (S1: `anon` holds no grant, not even an empty list) |
| `POST /rest/v1/rpc/storage_used` | 401, `permission denied for function` (S10) |
| `POST /rest/v1/jobs` (an insert) | 401, `permission denied` |
| `POST /auth/v1/signup` with a valid-looking address | 422, `Signups not allowed for this instance` |
| `POST /auth/v1/otp` with `create_user: false` for an unknown address | 422, `Signups not allowed for otp` (S5) |
| OpenAPI listing with the public key | nothing exposed |

Still to run by the owner in a browser: 12b (a temporary second user sees nothing), 2d (a link opened in another browser fails),
13 (a tampered row is rejected and counted), 14 (every feature once with the policy on, no console violation).
