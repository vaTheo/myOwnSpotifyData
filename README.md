# myOwnSpotifyData

A small browser-only web app for preparing DJ sets from my own Spotify data:
most played tracks and artists per period, each playlist ranked by real play
counts, and artists ranked by how many of their tracks I have saved.

It runs entirely in the browser: login with PKCE, playlists cached in
IndexedDB, and Spotify's _Extended streaming history_ export imported locally
for play counts. Nothing is uploaded anywhere except the track ids the BPM and
key lookup sends to ReccoBeats, the artist ids, ISRCs and article titles the
artist-reach lookup sends to MusicBrainz, ListenBrainz, Deezer, Wikidata and
Wikimedia, and the SoundCloud link you paste into the Mix tracklist screen,
which goes to SoundCloud and TrackId.net (and loads the player from
`w.soundcloud.com`) — and only when you start one of them. The only thing the
app ever writes back to Spotify is a playlist you explicitly ask for: **Create
playlist from mix** sends a name and the matched track ids to your own Spotify
account, on that tap alone. No token and no listening history ever leaves the
browser.

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
  An import replaces the whole history; if the one you picked covers less than
  what is stored, the app asks before replacing it.
- **BPM and key** show as two small pills on every track row, once you have
  filled them in from the **Audio data** card in Settings.
  `Look up (ReccoBeats)` fetches Spotify's own tempo and key for the tracks
  ReccoBeats knows, and the `.xml` file input takes a rekordbox collection
  export (_File > Export Collection in xml format_), which wins wherever it
  has a value of its own. Neither starts by itself, and both pick up where
  they stopped. The key pill follows the notation chosen on the same card:
  Camelot, Open Key or classic names. Audio data via ReccoBeats (Spotify
  audio features).
- **Match** is the third control on a playlist. Tap a track and the list
  re-ranks around it: everything within ±6% BPM first, ordered by key relation
  (`same key`, `relative`, `+1`, `−1`, `boost`) and then by BPM distance, then
  the rest of the tracks that have data, then the ones that have none. A seed
  with a key but no BPM ranks by key relation alone and says so. Each row
  shows its relation and its ΔBPM against the seed. Tapping another row moves
  the seed; `Clear`, or leaving Match, drops it — for that playlist only.
- **Under the radar** is the second view on the Artists tab: the artists in
  your playlists with the smallest audiences, so you can tell one nobody has
  heard of from one everybody plays. Fill it in from the **Artist reach** card
  in Settings — `Look up artists` is one long job, roughly 45 to 50 minutes
  for 1,000 artists, it never starts by itself, and it picks up where it
  stopped, so you can stop it and come back. Then sort by `Most played`,
  `Fewest listeners` or `Fewest fans`; the filter box narrows by name and the
  ranks never renumber.
  The two numbers are **ListenBrainz listeners** (how many ListenBrainz users
  have ever played that artist) and **Deezer fans** (how many Deezer users
  pressed follow). They are small platform-specific audiences, **not** Spotify
  monthly listeners, and they disagree often enough that the app shows them
  side by side and never sums them. A number the app does not have is shown as
  missing, never as a zero.
  Artists with a Wikipedia article are moved to the bottom under **Well
  known** rather than hidden: the app subtracts the demonstrably famous, it
  does not claim to rank the rest. `N languages` there is Wikidata's article
  count, which is a floor rather than an exact total. Two things the view is
  not: artists Spotify gives no id for are absent from it entirely, and the
  plays are plays of the tracks you saved, not of everything the artist made.
  Artist data via MusicBrainz and ListenBrainz · Deezer · Wikidata (CC0) ·
  Wikipedia (CC BY-SA).
- **Mix tracklist** drafts the tracklist of a SoundCloud DJ mix from a link.
  Open the **Mix tracklist** card in Settings, paste a mix's link and tap
  `Look up`. It reads two free public sources — TrackId.net (a corpus of
  already-analysed mixes) and the mix's own SoundCloud description — matches
  each row against your synced library, shows the BPM and key pills and how
  many of your playlists hold it, and lets you correct any row or add your own.
  There is also a box to paste a tracklist you found elsewhere (MixesDB, a
  player comment) and the embedded player with its timed comments. Save a mix
  to keep the working list; saved mixes live only in this browser.
  It is a **draft with holes, not the full tracklist.** TrackId identified
  32.6% of the one real 190-minute mix measured, and a fresh upload is often
  not in its corpus at all (a three-day-old set came back with nothing); a
  SoundCloud description carries a tracklist only when the uploader wrote one,
  which is often not at all. Every stretch nothing
  was identified shows as an `ID · unidentified` row, and unreleased promos and
  dubplates are in no database, so expect to fill gaps by hand. The app never
  listens to the audio — it only shows what public sources already know, so it
  cannot identify a track no source has named.
  **To identify every track yourself, scan the audio on your computer** with an
  open-source tool such as Tracklistify or SongRec: they run off the phone and
  use Shazam to recognise the audio. Or, on the phone, open Shazam and turn on
  **Sync Shazam Library to Spotify** (Auto Shazam): a "My Shazam Tracks"
  playlist then appears in Spotify, shows up under Playlists here, and syncs
  like any other playlist.
  Once the list is right, **Create playlist from mix** turns it into a private
  Spotify playlist: it searches Spotify for each identified row, adds the tracks
  it can match with confidence, and lists the ones it could not under a
  "N not found" line so you can add them by hand — it never guesses a wrong
  track onto the playlist. The first time, Spotify needs one more permission:
  tap the button, then **Connect again → Connect Spotify** to grant it (your
  saved mixes stay on this phone), reopen the mix and tap the button again. It
  **never** creates a playlist on its own — only on that tap — and tapping it
  again makes **another** new playlist rather than editing the last one. A mix
  that has a playlist shows a **Playlist created · Open in Spotify ›** link when
  you reopen it.

- **Re-import once for the Crate.** An import made before the Crate shipped
  kept no month, start or skip data, so the year, month and finish-rate views
  stay empty until you import the export again; the app says so once and the
  Settings history card links straight to Import. Play counts from the old
  import keep working everywhere else in the meantime.
- **Connect again** in Settings signs you out and back in without deleting
  anything — the way back when a token refresh fails.
- **Disconnect** in Settings removes the login and all cached data. So does
  syncing while a different Spotify account is signed in, which asks first.
