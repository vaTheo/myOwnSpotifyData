# Changelog

What changed, when, and what to do about it. Every push to `main` deploys to GitHub Pages; there are no versions. Entries group the work
by feature, newest first, and name their spec under `docs/specs/`. Entries before 2026-11-05 were reconstructed from the git history.

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
