# Changelog

What changed, when, and what to do about it. Every push to `main` deploys to GitHub Pages; there are no versions. Entries group the work
by feature, newest first, and name their spec under `docs/specs/`. Entries before 2026-11-05 were reconstructed from the git history.

## 2026-11-06 — Fill the gaps of a scan (worker 0.3.0)

Where the first listen found nothing, the worker listens again (7 s later, at normal speed, then 4 % slower, then 4 % faster)
and reads the set's description, chapters and comments. Tracklists in them are read whatever the separator; the clues around
a part without a track show on it on the Mix screen; a clue naming one track becomes a row "from a comment · not heard" when
Deezer or MusicBrainz holds exactly that artist and title (ADR-10, constitution 2.1.0), and Create playlist includes it unless
deleted. A refusal during the second pass keeps what was found; the second pass skips stretches inside a track already heard, and
the worker takes a planned 3-minute break every 80 calls (all waits ± 40 %) so Shazam refuses less. After a refusal the
pace comes back down; a refusal once tracks were found sends them as done, "stopped early"; sends to the server are retried;
the Shazam library no longer retries silently. Since the day's refusals came at any pace, a refusal is now a flat 6-minute
pause (up to 8 a set) and the pace (2 s + 0–50 %, 0.3.3) is never slowed; a refusal pauses 3 min + 0–40 %. Spec: `specs/003-fill-scan-gaps/`. No `DB_VERSION` bump.

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
