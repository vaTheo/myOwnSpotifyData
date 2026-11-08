# Changelog

What changed, when, and what to do about it. Every push to `main` deploys to GitHub Pages; there are no versions. Entries group the work
by feature, newest first, and name their spec under `docs/specs/`. Entries before 2026-11-05 were reconstructed from the git history.

## 2026-11-08 — A simpler Mix tracklist

Spec: `specs/010-mix-table-simplify/`. The open mix's table loses the **Source**, **In your library** and **Clips** columns and the
**Validate** button: every track is kept, and **Remove** (✕, or Delete in the row menu) is the only review action. The **To review** and
**Validated** chips are gone, and **Create playlist from mix** adds every track (no more Validated only / All tracks); old saved
"validated" marks are ignored. **Confidence** now carries the clip count, "×3 · 92%", and still sorts by times heard then percent; the Sort
menu loses Clips heard, Source, In your library and Review.

A found track's **Spotify** cell opens the Spotify app directly (`spotify:track:`) on every device; **Open in Spotify app** is gone from
the Listen menu, whose Play on Spotify is now that app link. On a phone the row says "On Spotify" and Play on Spotify is under More ›
Listen…. Each row gains one-click **Shazam** (when the scan knows its page) and **SoundCloud** (a search for the track) icons, each in a
new tab. No new request, no new host, no `DB_VERSION` bump.

## 2026-11-08 — Opening a mix checks it on Spotify

The Listen menu's **Play on Spotify** opens the Spotify app on a phone (the `spotify:track:` link); on a computer it opens the web page and
a new **Open in Spotify app** entry follows it. Without the app installed, the app link does nothing.

Opening a saved mix now runs **Check on Spotify** by itself for its named tracks never checked, once per mix per page session: only with
**Automatic updates** on, a Spotify session, no lock-out and no other Spotify job running, and never in the demo; the answers are saved with
the mix, so it is searched once. A refusal shows nothing; a failure shows inline as before. Decision: ADR-13 (amends ADR-02 and ADR-12;
constitution 2.3.0). No `DB_VERSION` bump.

Fix: a mix made by **Identify on my computer** or a Tracklistify import now shows its SoundCloud player when opened. Only a lookup stored
the player, so those mixes had none; it is now rebuilt from the mix's permalink on open (`soundcloudPlayerSrc`), with no request, and
nothing is added to the saved mix.

## 2026-11-07 — Sortable Mix tracklist

Every column of the open mix's tracklist with a comparable value now sorts from its header: **Confidence** (found most often first, then by %; click
again for the reverse), Time, Artist – Title, Label, Source, In your library, Released, Spotify and Review, plus a **Clips**
column when a set has clip counts. The **Sort** menu is rebuilt from the same columns, with **Set order** and a direction button, so
a phone can sort too; header and menu always agree. Tracks with no value stay last in both directions, and the sort is not saved with
the mix. "Best score" is now Confidence and "Year, oldest first" is Released. The Listen menu now starts with the direct pages, **Play on Spotify** (the Check answer, else the song in your library) and Shazam, before the search pages; the phone's "Open on Spotify" moves there. Spec: `specs/009-mix-sortable-columns/`. No
`DB_VERSION` bump.
## 2026-11-08 — Several people, one app

With the server set up, each person who signs in is a user with data of their own: library, history, BPM and key, artist reach
and saved mixes, on the device and on the server. You add a person in the Supabase dashboard (sign-ups stay off) and their Spotify
account in the Spotify app's User Management; they sign in with their email and connect their own Spotify. The app now opens on a
sign-in screen while nobody is signed in to the server, and shows nothing of anyone behind it. **Sign out** returns to it, asks
nothing and removes nothing; the next person sees only their data, and yours is back at once when you sign in again. Settings ·
Server says "Signed in as …" and "N people use this device"; Disconnect and Remove server data touch only your data.
**Sign in first on each of your own devices:** the first person to sign in on a device after this update gets the data already
stored there. Your session from before the update counts, so a browser you were already signed in on stays yours with no new link.
A new sign-in needs the network. Three fixes from the round's user-data audit: on a device more than one person uses,
**Connect Spotify** shows Spotify's account screen, so nobody is connected to the previous person's Spotify login by accident; a tab
left open never takes over the session of a person who signed in in another tab (it asks for a reload instead); and **Sign out**
signs out of this browser only, so your other devices and the worker on your computer stay signed in (`mix-worker logout` likewise),
and is also on the Connect screen, which says who is signed in, so a person who never connected Spotify can still hand over the device.
Decision: ADR-14 (amends ADR-08; constitution 2.4.0). Spec: `specs/011-multi-user-data/`. No
`DB_VERSION` bump: other users get a database of their own beside yours; no server change.

## 2026-11-07 — Lists keep loading as you scroll

Every long list (Top, Playlists, a playlist, Artists, the Crate views, Under the radar, a mix) now shows 100 more rows by itself when
you near the end, so you no longer tap **Show 100 more** again and again. The button stays under the list as a fallback (keyboard,
screen reader) and the "Showing the top N of M" line still counts. All the data was already on the device, so nothing is fetched.
Spec: `specs/008-infinite-lists/`.

## 2026-11-07 — Rarely played

Listening · Crate gains a sixth view, **Rarely played**: the songs of your playlists you played 0, 1, 2 or 3 times (the Never, 1, 2
and 3 chips, any combination), once per song with the playlists it is in, and a menu to look at one playlist. It sorts and filters
like the other song tables (BPM, key, year, decade). Play counts come from your history import, so the view asks for it first and
never calls a song "never played" without one; the counts are as of the last import. Nothing is read from Spotify and nothing is
stored. Spec: `specs/007-rarely-played-tracks/`.

## 2026-11-07 — BPM and key no longer sits at 0

After the release-year pass arrived, a finished BPM and key run showed `0 / 22,563 tracks` for about ten minutes (the ReccoBeats id
lookups, uncounted) and then needed one album request per song, about six hours. The id lookups are now a counted pass, and a song
Spotify already dates (a playlist sync or a Top list) is no longer asked of ReccoBeats; its year still shows, from the album.
Songs Spotify dates may show the album's year rather than ReccoBeats' earliest one. Playlists downloaded before the years existed
were never re-read (their snapshot had not changed), so Spotify's dates were missing for most songs: the next Spotify sync now
downloads each of those playlists once more (the playlist row gains an optional `withYears` marker), after which the year pass has
little left to ask. That sync runs by itself first on the next start (Server, Spotify, BPM and key, Artist reach, in that order) even
when the library is under 12 hours old. No `DB_VERSION` bump.

## 2026-11-07 — Automatic updates

Settings opens on a new **Updates** section: one line per job (Server, Spotify, BPM and key, Artist reach, History, Rekordbox) with
its state, progress and time, and a Retry on a failed one. With **Automatic updates** on (default, per device), opening the app or
coming back after a minute runs, after the server sync: the Spotify sync if the library is older than 12 hours (counting a sync made
on the other device; never while Spotify's lock-out lasts, at most once a session), then the BPM and key lookup, then Artist reach,
one at a time and only for what is missing. Automatic runs keep no wake lock and raise no banner except the Spotify lock-out and an
expired login. A button tapped while another job runs now waits and runs next. Decision: ADR-12 (amends ADR-02 and ADR-04;
constitution 2.2.0). Spec: `specs/006-automatic-updates/`. No `DB_VERSION` bump, no new host.
## 2026-11-07 — A web-first redesign of every screen

The app is rebuilt for a computer's browser first, on Material Design 3: dark only, chartreuse as its colour, Roboto served by
the app. Five places in a side rail (a bottom bar on the phone): **Overview**, the new home that sums up your data from what is
stored (never a Spotify read on open), **Listening** (Top, Crate), **Library** (Playlists, Artists), **Mix** and **Settings**.
Every track list is a sortable table with columns that hide by priority (two-line items on the phone); a track's details open
beside the list with everything the app holds, including album, length, added date, energy, listening time and first play,
never shown before. Playlists, Artists and Mix open beside their lists. The Crate draws its numbers as charts (month bars,
finish meters, plays per year, By year's year × month grid); Top can **Compare periods** side by side. New: one **search**
(`/`, Ctrl+K) over tracks, artists, playlists and saved mixes; a **BPM range and key filter** (with compatible keys) on every
track table; Settings as one page of seven sections. The **Mix** screen is a workspace: one Mixes list holding saved mixes and
the requests to your computer (Move to top, Cancel, Stop, Ask again, "Already finished" when a request is gone), a run line
under the open mix, **Check on Spotify**, a per-track review (Validate, Remove, the chips To review, Validated, Not on Spotify,
Heard once), and Create playlist with **Validated only** or **All tracks** (a track from a comment joins Validated only once
validated; amends [ADR-10](docs/architecture/700-adr/ADR-10-name-lookup-for-clues.md)); a later worker result keeps the review.
One Spotify quota lock-out now holds for every Spotify read and survives a reload, and those reads take turns (sync,
Check on Spotify, Create playlist and Like all songs never run two at once; a running check shows in the Activity button). Old addresses keep working; `#/` opens the
Overview. Behaviour that changed: Check on Spotify reads `GET /search` on its own tap; Create playlist adds what Validated
only or All tracks picks (D6); a quota answer to any Spotify read now locks all of them. No new Spotify endpoint, scope, write
or host; rankings, Crate rules, Match and gates unchanged; no `confirm()` text changed; no `DB_VERSION` bump (optional Mix row
fields).
The release year (main's round 005) is a **Released** column on every song table and on the open mix, a line in a track's
details, a **decade** in the Filters, and _Sort by year, oldest first_ in the Filters wherever the column cannot be sorted from
its header (a phone, a narrow table); the open mix has a Year sort and a Decade menu; the Activity button says "Looking up
release years" during the look-up's third pass. A renamed mix track drops a year that belonged to the old track.
Proven against `main` before the merge: `yarn regression` drives every old address and every feature the demo can reach (71
tests on fake fixture files, rounds 003 and 004 included, nothing leaving the computer, every `confirm()` held to its
word-for-word list in How the app works §14), and `yarn invariants` finds `DB_VERSION`, every `confirm()` text, the external
hosts (code, CSP), the dependencies and `yarn.lock` (Playwright and axe added for development), every unit test of `main` still
running and the ranking, Crate, Match, Under the radar and release-year results on the demo data unchanged. It found two slips,
fixed: Escape pressed the moment a playlist or artist opened beside its list was lost; and a link to a mix this browser does
not hold, met while another mix was open, now says so above that mix.
For developers: `yarn shots`, a dev-only visual loop on `?demo` data. [ADR-11](docs/architecture/700-adr/ADR-11-web-first-material-3.md),
[spec](docs/specs/2026-11-06-web-first-redesign-design.md), the full round under `specs/003-web-first-redesign/`. Nothing to do
after upgrading.

## 2026-11-07 — Shazam's answer time in the worker log (worker 0.5.1)

Each probe line of the worker log says how long Shazam took to answer, and each scan ends with the median and the share of answers
over 5 s. The Kune scan (3 h) ran at about 3.3 s a call in some hours and 9 s in others, with the clip cut unchanged at 0.14 s: the
extra time was inside the Shazam call. The next sets will show whether slow answers follow the number of calls or the hour.

## 2026-11-07 — The release year of every song (worker 0.5.0)

Every song list shows the year a song came out, beside BPM and key, with "Sort by year" (oldest first, undated last) and decade
chips on Top (Tracks), a playlist, an artist and every Crate view; the Mix screen sorts by year and keeps one decade, with "heard
once". Years come from the album a sync downloads (`album(name,release_date)`; resync an older playlist to get them), from a new
third pass of Settings · Audio data · Look up (ReccoBeats' earliest album year, about 45 minutes the first time for 5,000 tracks),
from Shazam on identified sets, from the worker (Deezer then MusicBrainz by ISRC, within `WORKER_LOOKUPS`) and from the album
Create playlist matched. A pulled row with an invalid year loses that field, not the row. Spec: `specs/005-track-release-year/`.
No `DB_VERSION` bump, no migration, no new host.

## 2026-11-06 — See, steer and trust the worker's scans (worker 0.4.0)

Each heard track shows how many 12-second clips matched it and its best score ("heard 3× · best 91 %"), sortable, with a
"heard once" view; nothing is removed automatically. The Requests card shows a running scan's progress and has Cancel, Move
to top and Stop; Ask again continues a stopped set; Shazam refusing often raises a VPN warning; the second pass tries ×1
everywhere first. Needs `supabase/migrations/0003_job_control.sql` (the app and the worker work without it, minus these
controls). Spec: `specs/004-worker-progress-control/`. No `DB_VERSION` bump.

## 2026-11-06 — Fill the gaps of a scan (worker 0.3.0)

Where the first listen found nothing, the worker listens again (7 s later, at normal speed, then 4 % slower, then 4 % faster)
and reads the set's description, chapters and comments. Tracklists in them are read whatever the separator; the clues around
a part without a track show on it on the Mix screen; a clue naming one track becomes a row "from a comment · not heard" when
Deezer or MusicBrainz holds exactly that artist and title (ADR-10, constitution 2.1.0), and Create playlist includes it unless
deleted. A refusal during the second pass keeps what was found; the second pass skips stretches inside a track already heard, and
the worker takes a planned 3-minute break every 80 calls (all waits ± 40 %) so Shazam refuses less. After a refusal the
pace comes back down; a refusal once tracks were found sends them as done, "stopped early"; sends to the server are retried;
the Shazam library no longer retries silently. Since the day's refusals came at any pace, a refusal is now a flat 6-minute
pause (up to 8 a set) and the pace (1.9 s + 0–30 %: ~780 calls without a refusal off the VPN, while 1.0 s + 0–50 % was refused every ~21 calls) is never slowed; a refusal pauses 3 min + 0–40 %. Every line of a tracklist in the description (or a comment listing 3+ tracks) becomes a
row even when no catalogue knows the track. Spec: `specs/003-fill-scan-gaps/`. No `DB_VERSION` bump.

## 2026-11-06 — Identify a mix on my computer (the worker)

The Mix screen gains **Identify on my computer**: paste any set link yt-dlp supports, tap, and a request waits on the owner's
server. `worker/`, a Python program for the owner's computer (also one executable per system from a `worker-v*` tag), takes it,
downloads the audio, recognises it twelve seconds at a time with Shazam (ShazamIO), merges the hits into one row per track with
ISRC and label, sends the tracklist back in the shape the Tracklistify import reads, and deletes the audio. The next sync shows
the rows on the saved mix; Create playlist from mix is unchanged; the request's state and reason are shown, with Ask again
([ADR-09](docs/architecture/700-adr/ADR-09-mix-identification-on-the-owners-computer.md), [spec](docs/specs/2026-11-06-mix-analysis-worker-design.md),
the full round under `specs/002-mix-analysis-worker/`, the manual `worker/README.md`). No `DB_VERSION` bump, one new `meta`
name, no new app dependency. After upgrading: apply `supabase/migrations/0002_jobs.sql`, then `cd worker && uv sync && uv run
mix-worker login` (the mail's link, clicked on that computer; no email template change: Supabase locks them on new Free projects). A recognition that
hangs is cut off after 45 s and its probe retried, then skipped, so one slow answer never loses a whole set. The Mix screen lists every
request in a **Requests to your computer** card (state, Check now, Ask again, a done row opens its saved mix), and the
saved list gets its **Saved mixes** heading. The two info cards (full scan with SongRec, Auto Shazam) give way to **Run
the worker on your computer**, with the steps for Windows, macOS, Linux and from the code. The server sync runs on its own: back in the app
after a minute, when the network returns, and every minute while a request waits or runs (Spotify is still never read on
its own). Each new worker version is released by CI on its own, with the four executables to download. The worker now listens to 80 % of the set, 12 s every 15 s (was 10 s every
60 s), after a first comparison with Tracklistify on the same set. The Mix screen is a tab of its own (it was a card in
Settings).

## 2026-11-06 — A server and database holding the app's data

The app can now copy every dataset it builds to the owner's own Supabase Free project and get it back on any browser after a
magic-link sign-in: library and playlists, play counts, BPM and key, artist reach, saved mixes. Newer wins per dataset by the time the
data was fetched or imported; mixes converge row by row with tombstones. The server stores, never computes, never sees the Spotify
token; without the two new build settings the app is exactly the previous app ([ADR-08](docs/architecture/700-adr/ADR-08-owner-server-free-tier.md),
[spec](docs/specs/2026-11-05-backend-data-sync-design.md), the full round under `specs/001-backend-data-sync/`). A Content Security
Policy now lists every host the page may call. The database does not upgrade itself: no `DB_VERSION` bump, four new `meta` names.
One new question, Remove server data. After upgrading: nothing to do without a server; to set one up, the README's "Server" section
(project, sign-ups off, redirect URLs, the SQL in `supabase/migrations/`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY`).

## 2026-11-05 — Spec Kit skills

GitHub's Spec Kit (v1.3.1) is installed with `specify init --here --integration claude`: nine `/speckit-*` skills under `.claude/skills/`
(constitution, specify, clarify, plan, tasks, analyze, checklist, implement, converge) and their scripts, templates and constitution under
`.specify/`. Spec Kit writes its feature folders to `specs/` at the repo root and creates no branch (its git extension is not installed).
The docs rules of [Contributing](docs/dev-guide/000-contributing.md) still apply to what a round produces. After upgrading: nothing to do.

## 2026-11-05 — Documentation organised like the Armtek repos

The docs had a dense `CLAUDE.md` and unindexed specs. They now follow the Armtek layout (armtek-packager's harness rules, as applied in
ratatouille): `docs/specs`, `docs/plans` and `docs/research` moved out of `docs/superpowers/`; `docs/README.md` maps every page;
`docs/architecture/000-how-it-works.md` takes the architecture detail; `100-features.md` is the feature inventory and project state;
`800-limits-roadmap.md` lists limits, out-of-scope decisions and ideas; seven ADRs under `700-adr/` record the decisions that hold;
`docs/dev-guide/000-contributing.md` holds the commands and the documentation rules. `CLAUDE.md` has the four Armtek sections, with
`AGENTS.md` as a symlink, and `src/db/`, `src/features/` and `src/features/mix/` carry a local `CLAUDE.md`. No checker and no generated
index, by the owner's choice (ADR-06). After upgrading: nothing to do.

## 2026-09-29 — Search never takes a wrong track; dig links for the rest

Create playlist from mix matched some wrong tracks. `pickMatch` now requires whole-word artist identity (a credited artist equals a
leading run of the row's credit, so "Four" is not "Four Tet", and acts named with "&" or "," still match), an equal title or the row's
title plus a version tail, prefers an equal title anywhere in the results and an original over a "(Mixed)" copy, and matches nothing on a
marker-only title. Every track Search did not find is listed with Beatport, Bandcamp, Discogs, SoundCloud and YouTube search links and,
from a Tracklistify import, its Shazam page. Commits `175804e`…`cb5e1e8`, `db78e6a`. After upgrading: nothing to do.

## 2026-09-28 — Import a Tracklistify JSON tracklist

The Mix screen takes a Tracklistify `tracklist.json` (a scan made on the computer), with confidence, ISRC and Shazam URL per row, and
names the playlist `tracklistify/<title>`. Search tries an ISRC-exact query before text matching. Spec
`docs/specs/2026-09-28-tracklistify-import-design.md`. After upgrading: nothing to do.

## 2026-09-25 — Like all songs of a playlist

A Playlist screen button saves the playlist's synced songs to Liked Songs: it checks which are already liked, asks with the exact count,
then likes the rest, 40 per request. The client gains `put` (retried, empty body allowed); `SCOPES` gain `user-library-read
user-library-modify`; `hasScope` checks whole tokens. Spec `docs/specs/2026-09-25-like-playlist-design.md`. After upgrading: tap the
button once, then **Connect again → Connect Spotify** to grant the two library scopes.

## 2026-09-07 — Create a private Spotify playlist from a mix

The Mix screen turns the identified rows into a private playlist of the tracks Search matched with confidence, and lists the rest. The
client gains a never-retried `post`; `SCOPES` gain `playlist-modify-private`; `MixRow` keeps the last playlist's URL and id. Spec
`docs/specs/2026-09-06-mix-playlist-design.md`. After upgrading: **Connect again → Connect Spotify** once to grant the scope.

## 2026-09-06 — Mix tracklist

`#/mix` (from Settings · Mix tracklist) drafts a SoundCloud mix's tracklist from SoundCloud oEmbed and TrackId.net, plus a paste box, the
embedded player and saved mixes; `on.soundcloud.com` short links resolve. `DB_VERSION` 4 adds the `mixes` store. Spec
`docs/specs/2026-09-06-mix-tracklist-design.md`. After upgrading: nothing to do; the database upgrades itself.

## 2026-09-06 — Artist reach: Under the radar

Settings · Artist reach runs a resumable five-phase job (MusicBrainz, ListenBrainz, Deezer, Wikidata, Wikipedia); the Artists tab gains
Under the radar, sorted by plays, listeners or fans, with Well known at the bottom. `DB_VERSION` 3 adds `artistIdentity` and `artistReach`.
The database now hands over to a newer tab and says when it has not opened after eight seconds. Spec
`docs/specs/2026-09-05-artist-reach-design.md`. After upgrading: run Look up artists once (45–50 minutes per 1,000 artists).

## 2026-09-05 — UX pass: safer sync and import

Connect again in Settings; a confirm before an account switch wipes the data and before a narrower import replaces the history; the
import screen leads with the last import; the shell paints before loading; banners have a severity. Plan
`docs/plans/2026-09-05-ux-polish.md`. After upgrading: nothing to do.

## 2026-09-05 — BPM and key, and Match mode

Settings · Audio data fills BPM and key from ReccoBeats and from a rekordbox collection XML; every track row shows the pills in Camelot,
Open Key or classic notation; a playlist's Match control re-ranks around a seed track. `DB_VERSION` 2 adds `features`. Spec
`docs/specs/2026-09-05-bpm-key-design.md`. After upgrading: run the lookup or import an XML from Settings.

## 2026-09-04 — The Crate: five history views

Heavy rotation, Forgotten gems, All-time classics, By year and Finish rate, from month buckets and play outcomes stored at import. The
tab bar becomes Crate · Top · Playlists · Artists · Settings. Spec `docs/specs/2026-09-04-crate-history-views-design.md`. After
upgrading: import the history export again once, so months and outcomes are stored.

## 2026-09-04 — The Spotify DJ web app

Browser-only Preact app on GitHub Pages: PKCE login, sync of top lists and owned playlists into IndexedDB with quota handling, history
export import for play counts, Top, Playlists ranked by plays, Artists ranked by saved tracks. Spec
`docs/specs/2026-09-04-spotify-dj-webapp-design.md`. After upgrading: first setup in `README.md`.
