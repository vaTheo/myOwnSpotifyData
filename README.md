# myOwnSpotifyData

A small browser-only web app for preparing DJ sets from my own Spotify data:
most played tracks and artists per period, each playlist ranked by real play
counts, and artists ranked by how many of their tracks I have saved.

It runs entirely in the browser: login with PKCE, playlists cached in
IndexedDB, and Spotify's _Extended streaming history_ export imported locally
for play counts. Nothing is uploaded anywhere.

## Run locally

```sh
cp .env.example .env   # set VITE_SPOTIFY_CLIENT_ID
yarn
yarn dev               # open http://127.0.0.1:5173/myOwnSpotifyData/ (not localhost)
```

## Scripts

| Command          | What it does                       |
| ---------------- | ---------------------------------- |
| `yarn dev`       | Vite dev server                    |
| `yarn build`     | Production build to `dist/`        |
| `yarn preview`   | Serve the production build locally |
| `yarn test`      | Run the Vitest suite               |
| `yarn lint`      | Lint with ESLint                   |
| `yarn typecheck` | Type-check without emitting        |
| `yarn format`    | Format with Prettier               |

## One-time setup

1. Spotify developer dashboard: create an app with the **Web API** only. Under
   Settings add both redirect URIs, exactly:
   `http://127.0.0.1:5173/myOwnSpotifyData/` and
   `https://vatheo.github.io/myOwnSpotifyData/`. Under User Management add
   the account that will use the app. The owner needs Spotify Premium
   (Development Mode requirement).
2. GitHub: make the repository public, set Pages → Source to _GitHub
   Actions_, and add the repository secret `VITE_SPOTIFY_CLIENT_ID`.
3. Push to `main`. CI type-checks, lints, tests, builds and deploys to
   `https://vatheo.github.io/myOwnSpotifyData/`.
4. On the phone, open that URL in Chrome and use "Add to Home Screen".

## Using it

- **Crate** is the "what do I play tonight" tab, built entirely from the
  imported history: _Heavy rotation_ (most plays in the last 1, 3 or 6
  months), _Forgotten gems_ (10+ lifetime plays, nothing for 6 months, 1 year
  or 2 years), _All-time classics_ (played in the most distinct years), _By
  year_ (top tracks of a year, with season and month chips) and _Finish rate_
  (what you play to the end versus what you bail out of). Spotify's Web API
  has no play counts, so none of this can be filled in by syncing.
- **Settings → Sync now** fetches your top lists and the playlists you own.
  Spotify enforces an unpublished daily quota on playlist reads; if it hits,
  the app keeps what it synced and tells you when to retry.
- **Import** takes `my_spotify_data.zip` from Spotify's privacy page
  (request _Extended streaming history_; it arrives by email). A play counts
  once a track was listened to for at least 30 seconds. Months are bucketed
  in the phone's time zone at import time, so re-import after moving zones.
- **Re-import once for the Crate.** An import made before the Crate shipped
  kept no month, start or skip data, so the year, month and finish-rate views
  stay empty until you import the export again; the app says so once and the
  Settings history card links straight to Import. Play counts from the old
  import keep working everywhere else in the meantime.
- **Disconnect** in Settings removes the login and all cached data.
