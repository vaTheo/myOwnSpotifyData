# 200 — Owner setup

> **Status**: Living
> **Last updated**: 2026-11-23

The owner's manual, part three: what the owner sets up once, the optional server, several people and the shared facts.

## I am the owner and set everything up (once)

1. **Spotify**: create a Web API app, add the two redirect URIs, add the users' accounts ([One-time setup](#one-time-setup), step 1).
2. **GitHub**: Pages → Source _GitHub Actions_, repository secret `VITE_SPOTIFY_CLIENT_ID`, push to `main` ([One-time setup](#one-time-setup), steps 2–3).
3. **Server (optional, needed for the worker and for several people)**: a free Supabase project, then run the migration files of
   `supabase/migrations/` in order in its SQL editor ([Server](#server-optional)).
4. **Add a person**: Supabase → Authentication → Users → Add user, then add their Spotify account to the Spotify app.
5. **Worker for everyone**: only if friends should be served too, see _shared mode_ in [Identify a mix from your computer](100-identify-a-mix.md#identify-a-mix-from-your-computer-optional-needs-the-server).

## One-time setup

1. Spotify developer dashboard: create an app with the **Web API** only. Under
   Settings add both redirect URIs, exactly:
   `http://127.0.0.1:5173/myOwnSpotifyData/` and
   `https://vatheo.github.io/myOwnSpotifyData/`. Under User Management add
   the account that will use the app. The owner needs Spotify Premium
   (Development Mode requirement).
2. GitHub: make the repository public, set Pages → Source to _GitHub
   Actions_, and add the repository secret `VITE_SPOTIFY_CLIENT_ID` (and, for
   the optional server, the two repository **variables** of the Server
   section below).
3. Push to `main`. CI type-checks, lints, tests, builds and deploys to
   `https://vatheo.github.io/myOwnSpotifyData/`.
4. Open that URL in your computer's browser. On the phone, open it in
   Chrome and use "Add to Home Screen".

## Server (optional)

One server, for you and the people you add, that keeps every dataset the app
builds so a new browser or a second device gets it all back after one
sign-in. It is a
[Supabase](https://supabase.com) Free project: a database with sign-in that
the browser talks to directly. It stores, never computes, never sees your
Spotify token, and the app works without it.

Set it up once:

1. Create a Free project on supabase.com. Note its **Project URL** and
   **publishable key** (Project Settings → API Keys).
2. Authentication → Sign In / Providers: Email on, **Allow new users to sign
   up off**. Authentication → URL Configuration: Site URL
   `https://vatheo.github.io/myOwnSpotifyData/`, and add
   `https://vatheo.github.io/myOwnSpotifyData/?link=server` and
   `http://127.0.0.1:5173/myOwnSpotifyData/?link=server` to Redirect URLs.
   Authentication → Email: OTP expiry 600 seconds.
3. Authentication → Users → Add user: your email, auto-confirm, no password.
4. Apply the schema: paste `supabase/migrations/0001_init.sql` into SQL
   Editor → Run (or `npx supabase@2 login`, `link --project-ref <ref>`,
   `db push`).
5. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` to `.env` locally and as
   repository **variables** on GitHub (they are public values), then push.

Using it:

- With the server set up, the app opens on a **sign-in screen** until you
  sign in: type your email, **Send me a link**, open the emailed link in the
  same browser within 10 minutes. The browser stays signed in. A new sign-in
  needs the network.
- After every sync, import, lookup, reach run, and every mix you save or
  delete, the app sends that data to the server. On open, when you come back
  to the app after a minute or more, and when the network returns, it fetches
  whatever another device sent since; while a request runs on your computer it
  also checks every minute, so the result appears without a tap. Newer wins, dataset by dataset, by the time the
  data was fetched or imported; a saved mix converges row by row.
- **Sync now with server** does both on demand; the card shows when each
  dataset was fetched here and on the server, the rows held, and the used
  share of the 500 MB. Its last row, **mixes**, shows your newest mix change
  here (a save or a delete), the newest one on the server as last synced, and
  how many saved mixes the server holds: the same time on both sides means
  your mixes are in step.
- **Sign out** keeps everything here and on the server, asks nothing and
  returns to the sign-in screen. It is also on the Connect screen, beside
  "Signed in as …", while Spotify is not connected. **Remove server data** deletes all your data
  on the server and keeps this browser's copy, after a question.
- Offline, the app works from local data and sends the pending changes on the
  next open. A Free project **pauses after a week without traffic**: the card
  says so, and only you can resume it, from the Supabase dashboard. Free
  projects have no backups; your local copy is the backup of the server as
  much as the reverse.

### Several people, one app

Each person who signs in to the server is a user with data of their own:
their own library, history, BPM and key, artist reach and saved mixes, on the
device and on the server.

- **Sign in first on your own devices.** The first person to sign in on a
  device after this update gets the data already stored there. Sign in
  yourself on each of your browsers before anyone else uses them.
- **Add a person**: Supabase dashboard → Authentication → Users → Add user:
  their email, auto-confirm, no password. Leave **Allow new users to sign up**
  off: an email you did not add gets no account and sees nothing. Then add
  their Spotify account to the Spotify app's User Management (one-time setup,
  step 1). Only you, the app's owner, need Premium; they do not. Spotify
  lets a Development Mode app list only a small number of people, set by
  Spotify.
- **They sign in** with their email on the sign-in screen, then **Connect
  Spotify** with their own account. Once more than one person has signed in on
  a device, Connect there always shows Spotify's account screen: check the
  account it names, and use "Not you?" if the browser is still logged in to
  Spotify as someone else. Their screens start empty and fill from their own
  syncs; yours do not change.
- **Sign out** before handing over a shared browser (Settings → Server, or
  the Connect screen when Spotify is not connected, which also says who is
  signed in). It signs you out of that browser only: your other devices and the worker stay signed in. Signing out
  of Spotify there too (on spotify.com) is wise. The next person signs in
  and sees only their data; when you sign back in, yours is there at once,
  with no question and no new sync. Every person's copy stays on that device
  (Settings → Server says "N people use this device"); there is no button yet
  to remove another person's copy. **Disconnect** and **Remove server data**
  touch only the signed-in person's data.
- The 500 MB of the Free project and Spotify's daily read quota are shared by
  everyone: a Spotify lock-out stops every person on that device.

### Shared BPM, key and artist reach

With the server set up, the BPM and key lookup and the artist reach lookup
first ask your server for what someone else on it already found, and only ask
ReccoBeats, ListenBrainz and Deezer for the rest. A second person's first
lookup is much shorter than the first person's.

- **Shared**: a track's BPM, key and major or minor as ReccoBeats answered,
  and an artist's ListenBrainz listeners and Deezer fans with the date. A row
  says nothing about who found it. Settings · Audio data and Artist reach say
  how many came from the store and how many were added, and a notice under
  the buttons says the numbers are shared.
- **Never shared**: your rekordbox values (a rekordbox value still wins on
  your side), play counts, library, playlists, history, saved mixes, release
  years. The store is never asked when the app opens.
- **One step, once**: in the Supabase dashboard, SQL Editor, run
  `supabase/migrations/0004_shared_facts.sql`, then `0005_shared_add_functions.sql`. Without them the lookups run as
  before and Settings shows the store's error.
- **Correct or remove a shared row**: nobody in the app can change or delete
  one (the first value for a track wins, and a wrong first value stays).
  Supabase dashboard → Table Editor → `shared_track_facts` or
  `shared_artist_reach`: edit the row, or delete it so the next lookup adds a
  good one.
- **Contributing what you already have**: values found before this update are
  not uploaded. To add them, clear the BPM and key results (and the artist
  reach results) held here and on the server, then run the lookup again; what
  the outside sources answer is then shared. There is no button for it yet.
- A row with only a BPM or only a key stays that way for everyone.

Keep it safe: turn on MFA for your supabase.com account, never copy the
`service_role` key anywhere, leave sign-ups off. The app checks every row it
gets back from the server before showing it, and the page declares the hosts
it may talk to. The worker's session file on your computer is yours alone
(readable by you only, outside the repo); it, too, never uses the
`service_role` key.

## Documentation

The [documentation map](../README.md) lists every page; the [feature inventory](../architecture/100-features.md)
says what is built and the project state; [CHANGELOG.md](../../CHANGELOG.md) says what changed when.
## Links

- Owner's manual: [000 — Using the app](000-using-the-app.md) · [100 — Identify a mix](100-identify-a-mix.md) ·
  [200 — Owner setup](200-owner-setup.md) · [300 — Developers](300-developers.md)
- [README](../../README.md) · [Worker manual](../../worker/README.md) · [CHANGELOG](../../CHANGELOG.md)
- [How the app works](../architecture/000-how-it-works.md) · [Feature inventory](../architecture/100-features.md) ·
  [Limits and roadmap](../architecture/800-limits-roadmap.md)
- [Contributing](../dev-guide/000-contributing.md)
- [Documentation map](../README.md)
