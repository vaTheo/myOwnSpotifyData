# 100 — Feature inventory

> **Status**: Living
> **Last verified**: 2026-11-07 against `worktree-task-design`
> **Last updated**: 2026-11-07

Every feature the app has today, where it lives and what state it is in. One row per feature the owner can see. Update this page in the
same commit as any feature change ([Contributing](../dev-guide/000-contributing.md), "One change, several files"). How each piece works:
[How the app works](000-how-it-works.md). What is not built, and the known limits: [Limits and roadmap](800-limits-roadmap.md).

| Symbol | Meaning |
|---|---|
| ✅ | Shipped on `main`, deployed, confirmed in the code |
| ⚠️ | Shipped, with a limit the owner must know (see the Limits column) |
| 🚧 | Started, not on `main` |
| ❌ | Decided against, or out of scope (see [Limits and roadmap](800-limits-roadmap.md)) |

## 1. Inventory

| # | Feature | Where the owner sees it | Entry in the code | Spec | Shipped | Status | Limits |
|---|---|---|---|---|---|---|---|
| F1 | Login (PKCE, Client ID only) | Connect screen | `src/auth/session.ts`, `src/ui/Connect.tsx` | [app](../specs/2026-09-04-spotify-dj-webapp-design.md) | 2026-09-04 `553892e` | ✅ | Owner must be in the Spotify app's User Management; Premium needed (Development Mode) |
| F2 | Spotify sync (top lists + owned playlists) | Settings · Spotify sync; a playlist's own button | `runSync` `src/sync/runner.ts:181`, `startSync` `src/model/state.ts:954` | [app](../specs/2026-09-04-spotify-dj-webapp-design.md) | 2026-09-04 `b25f16c` | ⚠️ | Unpublished daily quota on playlist reads: a lock-out of hours, one for every Spotify reader (`src/spotify/quotaLock.ts`), kept across reloads and Disconnect; never on load |
| F3 | History import (play counts) | `#/import`, from Settings · Listening history | `runImport` `src/history/importer.ts:108` | [app](../specs/2026-09-04-spotify-dj-webapp-design.md), [Crate](../specs/2026-09-04-crate-history-views-design.md) | 2026-09-04 `77b09bb` | ✅ | Needs the _Extended streaming history_ zip by email; months bucketed in the browser's time zone at import |
| F4 | Top tab | Listening · Top (`#/top`; the default route is now the Overview, F21) | `topTracks`/`topArtists` `src/model/aggregate.ts:257,273`, `src/ui/Top.tsx` | [app](../specs/2026-09-04-spotify-dj-webapp-design.md) | 2026-09-04 `93c8668` | ✅ | — |
| F5 | Playlists ranked by play count | Playlists, Playlist screen | `playlistRanking` `src/model/aggregate.ts:202`, `src/ui/Playlist.tsx` | [app](../specs/2026-09-04-spotify-dj-webapp-design.md) | 2026-09-04 `93c8668` | ✅ | Play counts only after F3 |
| F6 | Artists ranked by saved tracks | Artists · Saved tracks, Artist screen | `artistTracks` `src/model/aggregate.ts:305`, `src/ui/Artists.tsx`, `src/ui/Artist.tsx` | [app](../specs/2026-09-04-spotify-dj-webapp-design.md) | 2026-09-04 `9ac386b` | ✅ | — |
| F7 | Crate: Heavy rotation, Forgotten gems, All-time classics, By year, Finish rate | Listening · Crate, `#/crate/<view>` | `src/model/crate.ts`, `src/ui/crate/CrateView.tsx` | [Crate](../specs/2026-09-04-crate-history-views-design.md) | 2026-09-04 `78ea685` | ⚠️ | Gated on `historySummary.version === 2`: an older import must be redone once |
| F8 | BPM and key pills (ReccoBeats lookup, Rekordbox XML import, key notation) | Settings · Audio data; every track row | `runLookup` `src/features/lookup.ts:155`, `runRekordboxImport` `src/features/rekordboxImport.ts:35`, `src/model/keys.ts` | [BPM and key](../specs/2026-09-05-bpm-key-design.md) | 2026-09-05 `797b66e` | ⚠️ | ReccoBeats knows only part of the catalogue; 1 request/s |
| F9 | Match mode (re-rank a playlist around a seed track) | Playlist screen, third control | `rankMatches` `src/model/match.ts:63` | [BPM and key](../specs/2026-09-05-bpm-key-design.md) | 2026-09-05 `797b66e` | ✅ | Only tracks with BPM/key data rank by them |
| F10 | Safety and recovery: Connect again, account-switch confirm, narrower-import confirm, DB hand-over and slow-open banners | Settings, banners | `src/model/state.ts`, `src/model/banner.ts`, `src/db/repo.ts` | [app](../specs/2026-09-04-spotify-dj-webapp-design.md) (amended after the UX pass), plan [ux-polish](../plans/2026-09-05-ux-polish.md) | 2026-09-05 `1bd11c7`, 2026-09-06 `b250160` | ✅ | — |
| F11 | Artist reach: Under the radar (ListenBrainz listeners, Deezer fans, Well known) | Settings · Artist reach; Artists · Under the radar; Artist screen | `runReach` `src/features/reachRun.ts:132`, `rankUnderTheRadar` `src/model/reach.ts:192`, `src/ui/UnderRadar.tsx` | [Artist reach](../specs/2026-09-05-artist-reach-design.md) | 2026-09-06 `d3a11d1` | ⚠️ | 45–50 min per 1,000 artists; artists without a Spotify id are absent; numbers are small platform audiences, not Spotify listeners |
| F12 | Mix tracklist (SoundCloud oEmbed + TrackId.net + paste box, short links, saved mixes) | Mix tab → `#/mix` | `lookupMix` `src/features/mix/lookup.ts:51`, `startMixLookup` `src/model/state.ts:1225`, `src/ui/mix/Workspace.tsx` | [Mix tracklist](../specs/2026-09-06-mix-tracklist-design.md) | 2026-09-06 `a7a546e`, short links `fc1e241` `d60afd7` | ⚠️ | A draft with holes: TrackId identified 32.6% of one measured mix; fresh uploads often absent |
| F13 | Create playlist from mix (private, confident matches only; spec 003: Validated only or All tracks, `tracksToAdd`) | `#/mix` | `runCreatePlaylist` `src/features/mix/createPlaylist.ts:97`, `pickMatch` in `src/features/mix/spotifySearch.ts` | [Mix playlist](../specs/2026-09-06-mix-playlist-design.md) | 2026-09-07 `54e1ff7` | ✅ | Needs one re-login for `playlist-modify-private`; every tap makes a new playlist; refused inside the app's one Spotify quota lock-out |
| F14 | Like all songs (save a synced playlist's songs to Liked Songs) | Playlist screen | `runLikePlaylist` `src/features/like/likePlaylist.ts:97`, `startLikePlaylist` `src/model/state.ts:1976` | [Like all songs](../specs/2026-09-25-like-playlist-design.md) | 2026-09-25 `c9d0862` | ✅ | Needs one re-login for the two library scopes; uses the last sync, not a live read |
| F15 | Tracklistify JSON import + ISRC-exact Search | `#/mix` | `parseTracklistifyJson` `src/features/mix/tracklistify.ts:89`, `startTracklistifyImport` `src/model/state.ts:1314` | [Tracklistify import](../specs/2026-09-28-tracklistify-import-design.md) | 2026-09-28 `0fde8ed`, `8b4ba63` | ✅ | The scan itself runs off the phone (Tracklistify) |
| F16 | Dig links for tracks Search did not find | `#/mix`, under a created playlist | `digRows` `src/features/mix/digLinks.ts:90`, `src/ui/components/DigLinks.tsx` | none (commit `db78e6a` and its tests) | 2026-09-29 `db78e6a` | ✅ | Links out only; nothing is fetched |
| F17 | Stricter Search matching (whole-word artist runs, version tails, Mixed copies) | `#/mix` (F13) | `pickMatch`, `artistRuns`, `artistCore`, `isMixedCopy` in `src/features/mix/spotifySearch.ts` | none (commits and `spotifySearch.test.ts`); rule in [How it works](000-how-it-works.md) §10 | 2026-09-29 `175804e`…`cb5e1e8` | ✅ | Prefers "not found" to a wrong track |
| F19 | Identify a mix on my computer (the worker: yt-dlp + ShazamIO on the owner's computer; request button, states and history on the Mix screen, every request listed in the Mix screen's Mixes list; round 003: a second listen at ±4 %, comments and description read as clues, candidates looked up by name (ADR-10); round 004: clip count and best score per track, progress on its Mixes list row, Cancel / Move to top / Stop, resume a stopped set; one executable per system) | `#/mix` · Identify on my computer; `worker/` | `startIdentifyRequest` in `src/model/state.ts`, `pullJobs`/`requestIdentify` in `src/server/sync.ts`, `src/features/mix/worker.ts`, `worker/mix_worker/pipeline.py` | [Mix analysis worker](../specs/2026-11-06-mix-analysis-worker-design.md) | 2026-11-06 | ⚠️ | Shazam's quota is undocumented (a refusal fails the request); executables unsigned; YouTube needs Node or Deno on the computer; the owner's validation on the live project pending |
| F18 | Server sync (the owner's Supabase project, magic link, newer wins per dataset, mixes by row) | Settings · Server | `runPush`/`runPull` `src/server/sync.ts`, `startServerPull`/`queueServerPush` in `src/model/state.ts`, `ServerSection` in `src/ui/settings/ServerSection.tsx` | [Backend data sync](../specs/2026-11-05-backend-data-sync-design.md) | 2026-11-06 | ⚠️ | Free project pauses after a week idle (resume from the dashboard); no backups on Free; sign-in link opens in the browser that asked |
| F20 | Release year of every song (round 005): a **Released** column (priority 2, oldest first, a dash when undated) on Top (Tracks), Playlist, Artist, every Crate view and the open mix (its source in the tooltip); a line "Released 1993 · ReccoBeats (earliest album)" in the track details; a **decade** in the Filters; "Sort by year, oldest first" in the Filters where the header cannot sort (phones, tables under 720 px); on Mix a "Year, oldest first" sort and a Decade menu; the Activity button's "Looking up release years"; years from the syncs' album dates, a third "release years" pass of the BPM run (ReccoBeats' earliest album), Shazam and the worker's ISRC lookup on sets, the matched album on Create playlist | Every song table, the details sheet, the Filters, the open mix, Settings · Audio data, Activity (`specs/003-web-first-redesign/contracts/screens.md` "From main after the redesign started", built in S13c) | `yearOf` `src/model/year.ts`, `yearColumn` `src/ui/table/columns.tsx`, `TrackFilter.decade` `src/ui/filters/trackFilter.ts`, `yearSortOffered` `src/ui/table/layout.ts`, `PASS_YEARS` in `src/features/lookup.ts`, `fetchAlbumYear` `src/features/reccobeats.ts`, `fill_years` `worker/mix_worker/clues.py` | `specs/005-track-release-year/spec.md` | 2026-11-07 `6f7a2c2`, `69678f0` | ⚠️ | A year is only as good as its source (an album year can be a remaster's); the first BPM run with years takes about 45 min for a 5,000-track library; a playlist synced before the round has album years only once resynced; undated songs sort last |
| F21 | Web-first redesign (Material Design 3, dark, chartreuse): five destinations (Overview, Listening, Library, Mix, Settings) in a rail or a bottom bar; sortable tables with column priorities and two-line phone items; the track details sheet (`?d=`); list–detail for Playlists, Artists and Mix; Crate charts; Compare periods; search (`/`, Ctrl+K); BPM and key filters; the Overview home; Settings in seven sections; the Mix workspace (Mixes list with the queue, run line, Check on Spotify, per-track review, Validated only / All tracks); one Spotify quota lock-out shared by every reader; the dev-only visual loop (`yarn shots`, `?demo`) | every screen; Overview at `#/` | `src/ui/layout/AppFrame.tsx`, `src/ui/table/DataTable.tsx`, `src/ui/details/TrackDetails.tsx`, `src/ui/overview/blocks.ts`, `src/ui/search/searchIndex.ts`, `src/ui/filters/trackFilter.ts`, `src/ui/mix/Workspace.tsx`, `src/spotify/quotaLock.ts`, `tools/shots/` | [Web-first redesign](../specs/2026-11-06-web-first-redesign-design.md), [ADR-11](700-adr/ADR-11-web-first-material-3.md) | 2026-11-07 (branch `worktree-task-design`) | 🚧 | Not on `main` yet; dark only (no light theme); WebKit shots need system libraries; the speed run on the real profile is the owner's |
| F22 | Automatic updates (round 006): after the server sync, the Spotify sync when the library is older than 12 hours, then BPM and key, then Artist reach, one at a time; a Settings Updates section with one line per job and a per-device switch | Settings · Updates | `createChain` `src/model/autoChain.ts`, `updateLines` `src/model/updateLines.ts`, `runAutoChain`/`requestJob` in `src/model/state.ts`, `UpdatesSection` `src/ui/settings/UpdatesSection.tsx` | [`specs/006-automatic-updates/`](../../specs/006-automatic-updates/spec.md), [ADR-12](700-adr/ADR-12-automatic-updates.md) | 2026-11-07 | ✅ | Spotify at most once a session and only past 12 hours; history and rekordbox still need a file; no wake lock when automatic |

## 2. What leaves the browser

| Feature | Sent to | What | When |
|---|---|---|---|
| F1, F2, F13, F14 | Spotify Web API | the token, reads, and the two writes below | on a button; the F2 sync also from the automatic chain (F22) when the library is older than 12 hours |
| F8 | ReccoBeats | track ids, ISRCs | Settings · Audio data · Look up, or the automatic chain (F22) |
| F20 | ReccoBeats `/v1/track?ids=`, `/v1/track/{id}/album` | track ids, ReccoBeats' own track ids (no new host) | the same Look up, third pass |
| F11 | MusicBrainz, ListenBrainz, Deezer, Wikidata, Wikimedia | artist ids, ISRCs, article titles | Settings · Artist reach · Look up artists, or the automatic chain (F22) |
| F12 | SoundCloud (oEmbed, player), TrackId.net | the pasted mix URL | `#/mix` · Look up |
| F12 (Spotify Search) | Spotify Web API `GET /search` | a mix track's artist and title, or its ISRC (`searchTrack`) | `#/mix` · Check on Spotify (one track at a time, Stop) and Create playlist from mix, on a tap only |
| F18 | the owner's own Supabase project | every dataset the app builds: library and playlists, play counts, BPM and key, artist reach, saved mixes; never the Spotify token | after each job and on open, when signed in to the server |
| F19 | the owner's own Supabase project | the link of a set to identify (a request); the worker on the owner's computer sends back the tracklist JSON; the audio never leaves that computer | on the Identify on my computer tap; the worker, when the owner runs it |
| F19 (worker, round 003) | Deezer search and tracks, MusicBrainz recordings, Discogs releases (keyless) | from the owner's computer only: an artist and title written in a set's comment or description, or a Discogs/Deezer id from a link | per set, at most `WORKER_LOOKUPS` clues |
| F20 (worker 0.5.0) | Deezer `/track/isrc:`, MusicBrainz `/isrc/` (keyless, no new host) | from the owner's computer only: the ISRC of a heard track Shazam did not date | per set, after the clues, within the same `WORKER_LOOKUPS` |

No Spotify token ever leaves the browser; the listening history goes only to the owner's own server, when one is set up.

## 3. The two Spotify writes

| Write | Endpoint | Gate | Feature |
|---|---|---|---|
| Create a private playlist and add tracks | `POST /me/playlists`, `POST /playlists/{id}/items` | `playlist-modify-private`, a tap | F13 |
| Save songs to Liked Songs | `PUT /me/library` (after `GET /me/library/contains`) | `user-library-read` + `user-library-modify`, a tap, a `confirm()` | F14 |

Nothing else writes to the owner's Spotify account ([ADR-03](700-adr/ADR-03-library-writes-on-tap.md)).

## 4. Project state

- Verified 2026-11-07 on `worktree-task-design`: `yarn typecheck` and `yarn lint` clean, `yarn test` 91 files, 1,261 tests
  passing. CI deploys `main` to GitHub Pages.
- Last feature round on `main`: F20 (2026-11-07, release years, round 005, worker 0.5.0), after F19 (2026-11-06, the worker) and
  F18 (2026-11-06, the server). F21, the web-first redesign, is built on `worktree-task-design` (2026-11-07), has `origin/main`
  through F20 merged in (S13b) and waits for the owner's OK to merge.
- Round 006 (2026-11-07, automatic updates, F22) is rebased on the redesign: its Updates section is `src/ui/settings/UpdatesSection.tsx`.
- `DB_VERSION` 4; `SCOPES` include the two write scopes, so a pre-2026-09-25 session needs **Connect again** once.

## Links

- [How the app works](000-how-it-works.md)
- [Limits and roadmap](800-limits-roadmap.md)
- [ADR index](700-adr/README.md)
- [Specs](../specs/) · [CHANGELOG](../../CHANGELOG.md)
- [Contributing](../dev-guide/000-contributing.md)
- [Documentation map](../README.md)
