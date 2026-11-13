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
`w.soundcloud.com`) — and only when you start one of them. The app writes to
Spotify only when you explicitly ask, on that tap alone: **Create playlist
from mix** sends a name and the matched track ids to your own account, and
**Like all songs** saves a synced playlist's songs to your Liked Songs. No
Spotify token ever leaves the browser. If you
set up the optional server (below), every dataset the app builds, listening
history included, is copied to your own Supabase project and nowhere else;
the BPM and key and the artist listener and fan numbers a lookup finds are also
added to a store the people on your server share (nothing that says whose they
are, nothing personal).

## Quick start: what you have to do

Pick the line that matches you. Each one is a short list; the rest of this page is the detail.

### I only want to use the app

1. Open <https://vatheo.github.io/myOwnSpotifyData/> in your computer's browser (on a phone: Chrome → **Add to Home Screen**).
2. If it shows a **sign-in screen**, type your email, tap **Send me a link** and open the emailed link in the same browser within
   10 minutes. (No account yet? Ask the owner to add your email.)
3. Tap **Connect Spotify** and log in with your own Spotify account.
4. In **Settings**, tap **Sync now**. Play counts need one more step: request _Extended streaming history_ on Spotify's privacy page,
   and when the zip arrives import it in **Settings → Listening history**.

That is all. Nothing to install.

### I want to identify a DJ mix's tracks (the worker)

The **Identify on my computer** button on the **Mix** screen only records a request. A small program, the **worker**, must be
running on a computer to answer it. It is optional, and it needs the server (see below).

1. **In the app**: open **Mix**, paste the set's link, tap **Identify on my computer**. The request shows as _Queued_. The link
   SoundCloud's phone app copies (`https://on.soundcloud.com/…`) works too: the worker (0.7.4 or newer) finds the set it leads to.
2. **On your computer**, download the file for your system from the
   [latest `worker-v…` release](https://github.com/vaTheo/myOwnSpotifyData/releases/latest) and put it in a folder of its own.
3. Start it once. It writes `mix-worker.env` and stops. Open that file and fill in `SUPABASE_URL` and `SUPABASE_KEY` (the same two
   public values the app uses; the owner gives them to you).
4. Start it again. It asks for your email: open the email **on that same computer** and click the link. Leave the window open.
5. Back in the app, the request goes _Queued → Identifying → Found tracks_ (about 40 minutes for a 2-hour set). Open the mix, review
   the tracks, then **Create playlist from mix**.

Good to know: turn your VPN off (Shazam refuses far more often with one); the request waits while the computer is off; update the
app (hard-reload) before a new worker version. Full manual: [`worker/README.md`](worker/README.md).

### I am the owner and set everything up (once)

1. **Spotify**: create a Web API app, add the two redirect URIs, add the users' accounts ([One-time setup](#one-time-setup), step 1).
2. **GitHub**: Pages → Source _GitHub Actions_, repository secret `VITE_SPOTIFY_CLIENT_ID`, push to `main` ([One-time setup](#one-time-setup), steps 2–3).
3. **Server (optional, needed for the worker and for several people)**: a free Supabase project, then run the migration files of
   `supabase/migrations/` in order in its SQL editor ([Server](#server-optional)).
4. **Add a person**: Supabase → Authentication → Users → Add user, then add their Spotify account to the Spotify app.
5. **Worker for everyone**: only if friends should be served too, see _shared mode_ in [Identify a mix from your computer](#identify-a-mix-from-your-computer-optional-needs-the-server).

## Documentation

The [documentation map](docs/README.md) lists every page; the [feature inventory](docs/architecture/100-features.md)
says what is built and the project state; [CHANGELOG.md](CHANGELOG.md) says what changed when.

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
| `yarn shots`     | Screenshot every page on demo data (dev only; see Contributing) |

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

## Using it

The app is made for a computer's browser first and works the same on the
phone. It is dark, with chartreuse marking what you act on.

### Getting around

- **Five places**, in the rail on the left (at the bottom on a phone):
  **Overview**, **Listening** (tabs _Top_ and _Crate_), **Library** (tabs
  _Playlists_ and _Artists_), **Mix** and **Settings**. Each place reopens on
  the tab you last used. Every old address (`#/top`, `#/playlist/…`) still
  works; opening the app with no address lands on the Overview.
- **Overview** sums up your data in cards, each one a link to its screen:
  _Listening_ (history range, plays, listening time, import date, a warning
  when the import is old), _Heavy rotation_'s top five, _Top this month_,
  _Library_ (playlists, last sync, a Spotify lock-out or pending playlists),
  _Coverage_ (how many tracks have BPM and key, how many artists have reach
  data), the _Last saved mix_ and the _Server_ when you have one. It is built
  only from what is already stored: opening it never reads Spotify. A card
  with nothing to show says why and offers the one action that fixes it.
- **The activity button** in the top bar shows any job running (sync, import,
  lookups, server sync, Like, Create playlist, a mix lookup) from every
  screen, with its progress; tapping a job leads to where it lives. It never
  starts or stops one.
- **Keyboard**: `/` or Ctrl+K opens the search, Escape closes the topmost
  pane, sheet or search, Tab moves through every control with a visible ring.

### Tables, sorting and details

- Every track list is a **table**: one column per value (title, artists,
  plays, BPM, key, and more where the screen has them). **Click a column
  header to sort** by it, again to reverse. The screen's own ranking is the
  default; ranks never renumber when you sort or filter, and rows without the
  value go last. When the window is narrow, the less important columns hide
  first; title, the main number, BPM and key stay. On a phone each row is two
  lines and there are no sort headers (the order controls, such as a
  playlist's order or Under the radar's sorts, stay).
- **▶ plays a track in Spotify**: every track list (Top, a playlist, an
  artist's tracks, every Crate view, the Overview's track cards) starts each
  row with the same ▶ as the Mix tracklist; one tap opens the track in the
  Spotify app, without opening the details. A row Spotify cannot open (a
  local file) has no ▶.
- **The headphones menu** at the end of each track row lists every way to
  open it: Play on Spotify, the Spotify web page, then a search on Beatport,
  Bandcamp, Discogs, SoundCloud and YouTube for its artist and title. It
  replaces the small Spotify icon on track lists; artist and playlist lists
  keep that icon. An artist's icon (Top artists, Artists, Under the radar,
  and "Open in Spotify" on an artist's page) opens the artist in the Spotify
  app, like ▶; a playlist's still opens the Spotify web page in a new tab.
- Long lists say "Showing the top 100 of 2,431" and show 100 more by
  themselves as you scroll near the end; the **Show 100 more** button stays
  as a fallback. Arrow keys
  move through a table; Enter opens the row.
- **Click a track to open its details** beside the list (full screen on a
  phone): album, length, added date, BPM, key, energy and where they came
  from, plays, listening time, first and last play, plays per month as a
  chart, finished and skipped, the playlists that hold it, and its Spotify
  link. The address carries it, so Back closes it and a bookmark reopens it.
- **Playlists, Artists and Mix** open the item you pick beside their list on
  a wide window; on a phone the item opens full screen with a back arrow.
- A value the app does not have shows as a dash ("no data"), never as 0.
- **Release year** is a column on every song table and a line in a track's
  details; a song no source dates shows a dash, never a 0. Sort by it like
  any column (oldest first, undated last; on a phone or wherever the column
  does not fit, _Sort by year, oldest first_ in the Filters). Years come from the album Spotify lists when you sync (a playlist
  synced before this feature gets them once it is synced again), from
  Settings → Audio data's look-up (ReccoBeats' earliest album year: the
  original release rather than a remaster or a compilation) and, on a mix,
  from Shazam and your computer.

### Find and filter

- **Search** (the field in the top bar, `/` or Ctrl+K) looks through your
  tracks (library and history), artists, playlists and saved mixes, ignoring
  case and accents. Results are grouped, five a group with _Show all_;
  choosing one opens it. Escape clears the text, a second Escape closes it.
  It searches only what is stored in this browser.
- **Filters** sit above every track table: the text filter, a **BPM range**
  (min and max), a **key** picker with _Include compatible keys_ (the same
  relations Match uses: same key, relative, ±1, boost) and a **decade** (80s,
  90s, 2000s…, the decades the list holds). While a filter is on,
  tracks without the value are hidden, the line says "Showing N of M", and
  _Clear filters_ removes them all. Keys follow your chosen notation.

### Listening

- **Top** lists your most played tracks or artists for 4 weeks, 6 months or
  all time. On a wide window, **Compare periods** shows the three periods
  side by side; pointing at a track marks it in the other columns.
- **Crate** is the "what do I play tonight" tab, built entirely from the
  imported history. The hub shows six cards with their headline figures and
  a small chart: _Heavy rotation_ (most plays in the last 1, 3 or 6 months),
  _Forgotten gems_ (10+ lifetime plays, nothing for 6 months, 1 year or 2
  years), _All-time classics_ (played in the most distinct years), _By year_
  (top tracks of a year, a season or a month) and _Finish rate_ (what you
  play to the end versus what you bail out of) and _Rarely played_ (songs in your playlists you played 0, 1, 2 or 3 times: pick the counts and, if you like, one playlist). Each view is a table with
  its own columns and charts: plays per month as small bars, plays per year
  for the classics (a year without plays is a zero mark), the finish rate as
  a meter in its band. **By year** picks its period on a year × month grid:
  click a year, a month or a season. Spotify's Web API has no play counts,
  so none of this can be filled in by syncing.

### Library

- **Playlists** is a table (cover, name, tracks, last synced, pending). A
  playlist shows its tracks with **Sync this playlist** and **Like all songs**
  above them, and its order: _By plays_, _Playlist order_ or _Match_. **Like
  all songs** saves the playlist's synced songs to your Liked Songs after a
  question that counts them (songs already liked are skipped); its messages
  stay under the playlist's header.
- **Match**: pick Match, then click a track and the list re-ranks around it:
  everything within ±6% BPM first, ordered by key relation (`same key`,
  `relative`, `+1`, `−1`, `boost`) and then by BPM distance, then the rest of
  the tracks that have data, then the ones that have none. A seed with a key
  but no BPM ranks by key relation alone and says so. Two columns show each
  track's relation and ΔBPM against the seed. Clicking another row moves the
  seed; `Clear`, or leaving Match, drops it, for that playlist only. A
  track's details also offer _Match from this track_.
- **Artists** has two views. _Saved tracks_ ranks artists by how many of
  their tracks you saved (with plays, listeners and fans as columns once you
  have them). **Under the radar** shows the artists in your playlists with
  the smallest audiences, so you can tell one nobody has heard of from one
  everybody plays. Fill it in from **Settings → Artist reach** — `Look up
  artists` is one long job, roughly 45 to 50 minutes for 1,000 artists, it
  never starts by itself, and it picks up where it stopped. Then sort by
  `Most played`, `Fewest listeners` or `Fewest fans`; the filter narrows by
  name and the ranks never renumber.
  The two numbers are **ListenBrainz listeners** (how many ListenBrainz users
  have ever played that artist) and **Deezer fans** (how many Deezer users
  pressed follow). They are small platform-specific audiences, **not** Spotify
  monthly listeners, and they disagree often enough that the app shows them
  in two columns and never sums them. A number the app does not have is
  shown as missing, never as a zero.
  Artists with a Wikipedia article are moved to the bottom under **Well
  known** rather than hidden: the app subtracts the demonstrably famous, it
  does not claim to rank the rest. `N languages` there is Wikidata's article
  count, which is a floor rather than an exact total. Two things the view is
  not: artists Spotify gives no id for are absent from it entirely, and the
  plays are plays of the tracks you saved, not of everything the artist made.
  Artist data via MusicBrainz and ListenBrainz · Deezer · Wikidata (CC0) ·
  Wikipedia (CC BY-SA).

### Settings

At the top, never folded, **Sync status**: the Automatic updates switch and
one short line per source — Spotify, BPM and key, Rekordbox, Artist reach,
Listening history, Server — with its state only: "Up to date" (with a tick,
even when only part of your tracks or artists have a value), "Imported",
"Not imported", "Not set up", "Changes to send", "Offline", "Paused by
Spotify's limit". No dates, no counts at rest: while something runs, its
line shows the progress ("Updating · 22,353 of 33,888 tracks", "Importing ·
2 of 5 files"). A failed job says "Failed" with its **Retry**. The counts,
dates and the server's rows are in each item, opened; what Automatic updates
does is explained in **Spotify sync**.

Below it, seven items grouped under **Spotify** (Spotify account, Spotify
sync), **Your data** (Listening history, Audio data, Artist reach) and
**Between devices** (Server), then the **Danger zone** apart. Each item is
closed to one line: its name, its state in a few words and in its colour
("Synced", "Running 40 %", "Failed"; an error or a warning shows even
closed; the numbers are in the item, opened) and its main button, highlighted
only when it is what to do now. Tap its header to open it: what it is,
every status line, progress, last error and action. An item that fails or
runs a job opens by itself, even while the page is open, unless you closed
it; links such as "Look up artists" land on their item, opened. Long jobs
start only here.

- **Spotify sync → Sync now** fetches your top lists and the playlists you
  own. Spotify enforces an unpublished daily quota; when it hits, the app
  keeps what it synced and says when to retry. **One lock-out for every
  Spotify read**: until then Sync, Check on Spotify, Create playlist and Like
  all songs wait, the lock-out survives a reload, and Disconnect keeps it.
  They also take turns: while one of them reads Spotify, the others' buttons
  rest and say which one runs.
- **Listening history → Import** takes `my_spotify_data.zip` from Spotify's
  privacy page (request _Extended streaming history_; it arrives by email):
  pick it, or drop it on the import area on a computer. A play counts once a
  track was listened to for at least 30 seconds. Months are bucketed in this
  browser's time zone at import time, so re-import after moving zones. An
  import replaces the whole history; if the one you picked covers less than
  what is stored, the app asks before replacing it.
- **Audio data** fills the BPM and key columns. `Look up BPM and key` fetches
  Spotify's own tempo and key for the tracks ReccoBeats knows, and the
  **Rekordbox** box takes a rekordbox collection export (_File > Export
  Collection in xml format_; pick the `.xml` file or drop it), which wins
  wherever it has a value of its own. Neither starts by itself, and both pick
  up where they stopped. The key follows the notation chosen there: Camelot,
  Open Key or classic names. The same look-up also dates your songs (a third
  pass asks ReccoBeats which albums each song is on and keeps the earliest
  year; about 45 minutes the first time for a 5,000-track library, later runs
  ask only new songs); the section says "Release years: N of M tracks".
  Audio data via ReccoBeats (Spotify audio features).
- **Re-import once for the Crate.** An import made before the Crate shipped
  kept no month, start or skip data, so the year, month and finish-rate views
  stay empty until you import the export again; the app says so once and the
  Listening history section links straight to Import. Play counts from the
  old import keep working everywhere else in the meantime.
- **Connect again** (Spotify account) signs you out and back in without
  deleting anything — the way back when a token refresh fails or a new
  permission is needed.
- **Disconnect**, alone in the Danger zone (open it first), removes the login and all cached
  data in this browser; server data is kept. With the server set up it removes
  only yours: other people's data on this device stays. So does syncing while a
  different Spotify account is signed in, which asks first.

### Mix

The Mix screen is a workspace: the **Mixes** list on the left (the link box,
Identify on my computer, the JSON import, then every saved mix and every
request to your computer in one list), the open mix on the right. On a
narrower window the list folds away while a mix is open; the **Mixes**
button brings it back. A saved mix has its own address (`#/mix/…`).

- **Look up** drafts the tracklist of a SoundCloud DJ mix from its link. It
  reads two free public sources — TrackId.net (a corpus of already-analysed
  mixes) and the mix's own SoundCloud description — matches each row against
  your synced library, shows BPM, key and how many of your playlists hold it,
  and lets you correct any row (the row's **More** menu: Edit, Delete) or add
  your own. There is also a box to paste a tracklist you found elsewhere
  (MixesDB, a player comment) and the embedded player with its timed
  comments. **Save mix** keeps the working list in this browser (and on your
  server when you have one). Once a mix is saved, every Delete, Edit, Link
  and Remove link on it is saved at once, with no tap, and reaches your other
  devices at their next sync; a mix open on the other device switches to the
  newer list unless you are editing a row there. Changing one mix on two
  devices at once keeps the change saved last.
  It is a **draft with holes, not the full tracklist.** TrackId identified
  32.6% of the one real 190-minute mix measured, and a fresh upload is often
  not in its corpus at all; a SoundCloud description carries a tracklist only
  when the uploader wrote one. Every stretch nothing was identified shows as
  an `ID · unidentified` row, and unreleased promos and dubplates are in no
  database, so expect to fill gaps by hand. The app never listens to the
  audio. **To identify every track, ask your computer**: tap **Identify on
  my computer** (any set link yt-dlp supports, YouTube and Mixcloud
  included) and run the worker when you are back at it; see "Identify a mix
  from your computer" below. You can also scan a local file with an
  open-source tool such as SongRec and import its JSON. Or, on the phone,
  turn on Shazam's **Sync Shazam Library to Spotify**: a "My Shazam Tracks"
  playlist then shows up under Playlists and syncs like any other.
- **The run line** under a mix's title says how the worker's scan went
  ("Second pass: 41 places · 3 found", "Resumed", "Stopped early at 01:12:00"
  with **Ask again**, warnings folded), and a running request shows its
  progress and **Stop** there too.
- **Review the tracks.** The line above the tracklist counts them ("40
  tracks · 30 on Spotify · 4 not found"). **Check on
  Spotify** looks each named track up on Spotify, one at a time ("Checked 12
  of 40", Stop), and keeps the answer on the row (a Spotify link, or "not
  found"); it runs when you tap it and also by itself when you open a saved mix with tracks not checked yet (once per mix, only with
  **Automatic updates** on, never while Spotify's lock-out lasts or another Spotify job runs), and saves the mix when it ends.
  Every track counts as kept; **Remove** (✕, or **Delete** in the row
  menu) takes a wrong one out. The columns are Time, **Artist**, **Title**, Label,
  **Confidence**, Released (when tracks have a year), Spotify, Listen and
  Review; on a phone each track shows its title, the artist under it, then
  the rest. **Confidence** reads "×3 · 92%": heard in 3 clips, best match
  92 %. A song the scan (or an imported JSON) heard at several times shows
  once, at its first time, its clips added up; rows you added or edited are
  never merged. The chips **All**, **Not on Spotify** and **Heard once** (tracks one
  12-second clip matched) show one group at a time; they never change what
  goes into a playlist. Click a column header to **sort** the tracklist by
  it (**Confidence** puts the tracks heard most often first, then by their
  %; click again for the least heard first; also Time, **Artist** (A to Z),
  **Title** (A to Z by the track name alone), Label, Released and Spotify); the
  **Sort** menu beside the chips offers the same choices, with **Set order**
  to go back, and is how a phone sorts. Tracks with no value always stay at
  the bottom; the sort is only how you look at the list and is not saved.
  A track found on Spotify has a play icon in the **Spotify** column that
  opens it in the Spotify app (on a computer without the app it does
  nothing); on a phone the row says "On Spotify" and has the same play icon
  on its second line, before the Shazam and SoundCloud icons, and **Play on
  Spotify** is also in the row menu under **Listen…**. Beside each track's **Listen** menu, a
  **Shazam** icon (when the scan knows the track's Shazam page) and a
  **SoundCloud** icon (a SoundCloud search for the artist and title) open in
  a new tab in one click; on a phone they sit on the row's second line. The
  **Listen** menu (**Listen…** in the row menu on a phone) opens first the
  pages that go straight to the track: **Play on Spotify** (from Check on
  Spotify, or from the same song in your library, in the Spotify app) and
  **Shazam** when known; then store and preview searches (Beatport,
  Bandcamp, Discogs, SoundCloud, YouTube), which are search pages because
  the app never looks a track up by name.
- **The last track you clicked stays highlighted.** Click anywhere on a
  row (its title, the Spotify play icon, a Shazam or SoundCloud icon, the
  menu) and it keeps the selected colour with a chartreuse bar on its left
  and glowing lines above and below it, so when you come back from Spotify
  or another tab you see where you were. With the keyboard, Enter or Space
  on a row marks it too. It follows the track when you sort
  or filter and stays while you edit or link it. Deleting a row, opening
  another mix, or replacing the whole list (a paste, the description,
  reopening the mix) clears it; it is not saved.
- **Link a track Spotify did not find.** Find it on Spotify yourself and
  copy its link (Share › Copy song link). Then tap the red "not found" mark
  in the **Spotify** column (on a phone, the "Not found on Spotify" words),
  paste the link in the field that opens in place of the row, and tap
  **Link**: the track now counts as on Spotify, its play icon opens that
  track, and Create playlist adds it. A song link like
  `https://open.spotify.com/track/1qGibBSuprByJCYMC4zRUG?si=…` or
  `spotify:track:…` works; an album, artist or playlist link, a
  `spotify.link` short link or other text is refused with a message. The app
  trusts the link as pasted (it never checks it on Spotify), and Check on
  Spotify never overwrites it. A wrong link? The row menu has **Replace
  link** and **Remove link** (back to not found). Changing the track's
  artist or title clears the link, like any Spotify answer. The link is
  saved like an edit: at once on a saved mix, else with **Save mix** or
  when a Check on Spotify run ends.
- **Create playlist from mix** turns the list into a private Spotify
  playlist with every track of the list (remove the ones you do not want
  first); the card says how many will be added, in set order. A track found
  from a comment ("from a comment · not heard") is included too. The app searches Spotify for each track (or uses the answer
  Check on Spotify already found), adds the ones it can match with
  confidence, and lists the others under "N not found" with the same
  Listen links, so you can add them by hand — it never guesses a wrong track.
  The first time, Spotify needs one more permission: tap the button, then
  **Connect again → Connect Spotify** to grant it (your saved mixes stay in
  this browser), reopen the mix and tap again. It **never** creates a
  playlist on its own — only on that tap — and tapping it again makes
  **another** new playlist rather than editing the last one. A mix with a
  playlist shows **Playlist created · Open in Spotify ›**.
- Every Mix message (lookup states, errors, Create playlist results, the
  queue) stays on the Mix screen, inline, never as a banner.

## Identify a mix from your computer (optional, needs the server)

The Mix screen's **Identify on my computer** button records a request on your
server. `worker/`, a small program you run on your computer, takes it:
downloads the set's audio, recognises it twelve seconds at a time with Shazam,
sends the tracklist back (ISRC and label when Shazam knows them) and deletes
the audio. The next sync shows the rows on the Mix screen, where you review
them and tap Create playlist from mix as before. The request's state is shown
on its row of the Mixes list (waiting, running on which computer, done,
failed with the reason) with Ask again. Where the first listen found nothing, the worker
listens again (7 s later, then 4 % slower and faster) and reads the set's
description and comments: they show on those parts of the tracklist (a
comment without the name of the person who wrote it), and a
comment that names a track the free catalogues (Deezer, MusicBrainz) hold
exactly becomes a row marked "from a comment · not heard", kept like every
track: remove it if it is wrong.
A link copied in SoundCloud's phone app (`https://on.soundcloud.com/…`) can be
asked as it is (worker 0.7.4 or newer): the app records the request under that
link, the worker asks SoundCloud where it leads, only inside SoundCloud's own
hosts, and the tracks land on the mix saved under the share link. If the link
cannot be followed, the request fails with its reason ("Short link not found;
paste the set's full link", "SoundCloud did not answer for the short link; ask
again later", "Short link does not lead to a SoundCloud set"). A set asked by
its share link and later pasted by its full `soundcloud.com/…` link is saved
as two mixes.
While a set is analysed, its row in the Mixes list shows where it is ("First pass · 47 % · about
25 min left", "Paused by Shazam until 20:35"); a waiting request has **Move to
top** and **Cancel**, a running one **Stop** (it keeps the tracks found, and Ask
again continues it later). Each heard track shows how many 12-second clips
matched it and its best score ("heard 3× · best 91 %"); sort by them, or show
only the tracks heard once to judge them. One thing is removed for you (worker
0.7.2): a different song heard between two clips of one song at most 3 minutes
apart (A, X, A) is a false match inside that song, so the worker drops it and
the log counts it (`WORKER_MERGE_GAP_SECONDS` sets the 3 minutes). Run the
worker without a VPN: Shazam refuses far more often on one. When Shazam stops
a set anyway, the tracks found are sent at once ("Stopped early … (rate
limited)") and, since worker 0.7.3, the worker asks again by itself 30 minutes
later, up to 6 times a set, continuing where it stopped (only the worker
started with `run --watch` or a double-click, on your own account; closing it
forgets the plan, so press Ask again then). The **Mixes**
list holds every link sent beside your saved mixes, one row per link with a
chip (Queued, Identifying, Paused, Stopping…, Found tracks, Failed, Rejected,
Saved, Playlist made): running first, then waiting in the order the worker
takes them, then the rest newest first. **Check now** asks the server again
(it also checks every minute while something waits or runs); a done row opens
its saved mix, a failed one has Ask again. If a request was already taken or
finished when you tapped Cancel, Move to top or Stop, the list says so. A new
result keeps your review: Spotify answers stay, removed tracks stay removed,
and only new tracks are added.
Each track also shows its release year (Shazam's, or the earliest Deezer or
MusicBrainz give for its ISRC, or the Spotify album Create playlist matched,
which dates the undated tracks); sort **by year** or keep one **decade**,
also with Heard once.
Every identified set stays in this browser and on the server.

Two ways to run it, both in the worker's manual, [`worker/README.md`](worker/README.md):

- from the repo with Python and uv: `cd worker && cp .env.example .env`
  (the same two public values as the app's `.env`), `uv sync`, `uv run
  mix-worker login` (click the mail's link on that computer), `uv run
  mix-worker run --once`;
- or one packaged executable per system (Windows, Linux, macOS) from a
  `worker-v…` release: put it in a folder, start it, fill the two values in the
  `mix-worker.env` it wrote, start again. ffmpeg and yt-dlp are inside; only
  YouTube links need Node or Deno on the computer.

Once, in the Supabase dashboard: run `supabase/migrations/0002_jobs.sql`.
Nothing else: the worker signs in with the same magic link as the app,
returned to a local address the project already allows. Requests wait while
the computer is off;
the audio never leaves your computer; the worker never talks to Spotify.
Since worker 0.7.0 (`WORKER_TRACKID`, on by default) it first asks TrackId.net about the exact mix link: for a mix TrackId.net knows it
makes one confirming Shazam probe per span and none other inside it, and each span is a row "from TrackId.net" with a Shazam check;
update the app (hard-reload) before using it.
By default the worker serves one account, the one that signed it in (yours): a
friend's **Identify on my computer** is recorded on the server but not taken,
and waits as Queued in their Mixes list until they Cancel it. To serve every
user, create a user with a dedicated
email in the Supabase dashboard, run `supabase/migrations/0006_shared_worker.sql`,
list that user (`insert into public.shared_workers (user_id, label) values
('<id>', 'my PC');`), and sign the worker in with that email. It then takes
one request per user in turn; delete the row to switch it off. Since worker 0.7.1 the mode follows the account (`WORKER_MODE=auto`,
the default): the worker asks the server whether the account is listed and says so on its start line; `personal` or `shared` in
`mix-worker.env` still force a mode.

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
