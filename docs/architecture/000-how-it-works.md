# 000 — How the app works

> **Status**: Living
> **Last updated**: 2026-11-07

The reference for every "how does X work?" question. The [README](../../README.md) is the owner's manual (setup and daily use), the
[feature inventory](100-features.md) lists what is built and where, the [changelog](../../CHANGELOG.md) says what changed when, the
dated [specs](../specs/) hold the reasoning of each round, and the [research notes](../research/) the verified external facts. The
decisions that still hold are in the [ADR index](700-adr/README.md); the rules for working on the repo are in
[Contributing](../dev-guide/000-contributing.md); the [documentation map](../README.md) lists every page.

## 1. The app in one paragraph

A browser-only Preact web app the owner (a DJ) uses mainly in a web browser on a computer, and on an Android phone (added to the
home screen from Chrome). It shows their most
played Spotify tracks, ranks their own playlists by play count, ranks artists by saved tracks, and helps prepare sets (BPM and key,
match mode, under-the-radar artists, SoundCloud mix tracklists). Public repo `vaTheo/myOwnSpotifyData`, single `main` branch, deployed
to GitHub Pages at `https://vatheo.github.io/myOwnSpotifyData/` by CI. No server code of the owner's: login is PKCE with a Client ID only
([ADR-01](700-adr/ADR-01-browser-only-pkce.md)), data lives in IndexedDB, play counts come from Spotify's history export
([ADR-07](700-adr/ADR-07-play-counts-from-export.md)).

Stack: Node 24 (`.nvmrc`), yarn classic 1.22, Vite 8 (JSX compiled by Vite itself, no framework plugin), Preact 10 + `@preact/signals`,
`idb`, `fflate`, TypeScript `~6.0.3`, Vitest in the Node environment.

## 2. Shape: pure cores behind thin I/O edges

`src/` is one Vite app. Every computation is a pure, unit-tested function; the I/O (fetch, IndexedDB, workers, `confirm()`, the DOM) sits
in thin edges around it. Every fetch-based client takes an injected `fetchFn` and returns a discriminated result instead of throwing.
`model/state.ts` holds the signals and the thin `start*` wrappers that wire the cores to the browser singletons; those wrappers are not
unit-tested. Tests sit next to the source as `src/**/*.test.ts`; there are no DOM or component tests.

| Folder           | Role                                                          |
| ---------------- | ------------------------------------------------------------- |
| `auth/`          | PKCE, the session store, scopes (§3)                          |
| `spotify/`       | the API client and types (§4)                                 |
| `util/`          | shared retry helpers and the reach timeout (§5)               |
| `db/`            | IndexedDB schema and repository (§6)                          |
| `sync/`          | playlist sync planner and runner (§7)                         |
| `history/`       | streaming-history export import (§8)                          |
| `features/`      | Audio data (BPM and key) and Artist reach acquisition (§9)    |
| `features/mix/`  | Mix tracklist and Create playlist from mix (§10)              |
| `features/like/` | Like all songs (§11)                                          |
| `model/`         | aggregation, Crate, keys, match, reach, banner, signals (§12) |
| `ui/`            | one component per screen, routes (§13)                        |

## 3. `auth/`

- PKCE helpers (`pkce.ts`) and the session store (`createSessionStore`, `session.ts`), with `browser.ts` holding the app instance.
- `SCOPES` (`src/auth/session.ts:12`): `user-top-read playlist-read-private playlist-modify-private user-library-read user-library-modify`.
- `hasScope` splits `session.scope` on spaces, never `String.includes`, so a substring cannot satisfy it.
- A token refresh returns the scope the **original** grant had, so it can never widen an old session: a feature that needs a new scope
  shows **Connect again → Connect Spotify** ([ADR-03](700-adr/ADR-03-library-writes-on-tap.md)).
- The redirect URI is computed at runtime (`env.ts`). The settings are `VITE_SPOTIFY_CLIENT_ID` and the two public server values
  `VITE_SUPABASE_URL`/`VITE_SUPABASE_KEY` (§16); there is no client secret anywhere.

## 4. `spotify/`

The API client (`createClient`, `client.ts`): bearer token, 401 refresh-once, 429 backoff, quota lock-out, one request in flight. It has
`get`, `post` and `put`.

- `post<T>(path, body, query?)` reuses the enqueue / 401-refresh-once / short-429 machinery but is **never retried on a 5xx or a network
  error**: a `POST` is not idempotent, so a resend could create a duplicate playlist or duplicate tracks. It throws immediately instead.
- `get` and `put` keep the `MAX_5XX_RETRIES` backoff. `put<T>(path, query?)` sends no body and is retried: `PUT /me/library` saves a
  set, so saving it twice changes nothing.
- A `put` answered with an empty body (the save endpoint's 200) resolves `undefined`; an empty GET or POST success still throws, as
  `res.json()` did, so a caller reading `.id` off it fails inside its own try/catch.
- `types.ts` holds the API types; `errors.ts` the `QuotaError` and friends.
- `quotaLock.ts` (spec 003 S08d, pure): **one quota lock-out for the whole app**. A `QuotaError` met by any reader (sync, Check on
  Spotify, Create playlist, Like all songs, the account read on the Connect tap) is kept as `spotifyQuotaLock` in `model/state.ts` (`noteQuotaLock`: the later end wins) and in localStorage
  (`spotifyQuotaLock`), so it survives a reload and **Disconnect** (the quota belongs to the app's client id, not to the session).
  While it holds, Sync now, Sync this playlist, Check on Spotify, Create playlist, Like all songs and the Connect tap's `/me`
  refuse to read Spotify, each with its line naming the held end (`quotaRefusal`: "Spotify quota reached. Sync again / Check again / Try again after …"), and their buttons rest
  disabled. A timer to the lock's end clears it (`lapseDelay`, cleaned up by the signal's `effect`), so the buttons and the warnings
  come back on time without another render. **One reader at a time** (S13): sync, Check on Spotify, Create playlist and Like all
  songs each refuse to start while another of them runs (`busyRefusal`, read through `spotifyBusyMessage` in `state.ts`: "Check on
  Spotify is reading Spotify: sync once it ends."), so two never double the request rate toward the lock-out; their buttons rest
  disabled with that line inline (a sync started some other way says it in a banner, as its lock-out does).

## 5. `util/`

`MAX_5XX_RETRIES`, `backoffMs` and `parseRetryAfter`, shared by the Spotify and ReccoBeats clients, plus `REACH_REQUEST_TIMEOUT_MS`, the
15 s `AbortSignal.timeout` every artist-reach `fetch` carries. That constant lives here rather than in `reachRun.ts` on purpose: the
runner imports all four `fetch`-based clients, so declaring it in the runner would make each of them import its own runner, a module
cycle whose `const` can read `undefined` at init.

## 6. `db/`

Row types and `DB_VERSION` in `schema.ts`; the `upgrade` callback and every read and write in `repo.ts`. The rules for changing them
are in `src/db/CLAUDE.md` ([ADR-05](700-adr/ADR-05-additive-indexeddb.md)).

| Store            | keyPath                                                     | Holds                                                                            |
| ---------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `playlists`      | `id`                                                        | the owner's playlists, with `snapshot_id`                                        |
| `tracks`         | `key` (Spotify track id, or the `spotify:local:` URI)       | track metadata                                                                   |
| `entries`        | `['playlistId', 'position']`                                | playlist membership, in order                                                    |
| `topItems`       | `key`                                                       | Spotify top tracks and artists per period                                        |
| `plays`          | `trackId`                                                   | play counts and month buckets from the history import (`PlayRow`)                |
| `features`       | `trackId`                                                   | BPM and key per source                                                           |
| `artistIdentity` | `artistId`                                                  | MBID, QID, sitelinks, article titles, step state                                 |
| `artistReach`    | `key` = `${artistId}\|${source}` (build it with `reachKey`) | one reach number per source, with its URL                                        |
| `mixes`          | `url` (normalised SoundCloud URL)                           | saved Mix working lists (`MixRow`)                                               |
| `meta`           | `name`                                                      | summaries and job state (`historySummary`, `syncState`, `artistReachSummary`, …) |

- `DB_VERSION` is 4 (`src/db/schema.ts:4`). The `upgrade` callback (`src/db/repo.ts:75-95`) creates only the stores that are missing (the same guarded
  `db.objectStoreNames.contains` shape throughout), so a version 1 database keeps everything and gains `features`, version 2 gains the
  two reach stores, version 3 gains `mixes`.
- `mixes` is deliberately **not** in `AllRows`, `getAllRows` or `buildModel`: nothing but the Mix workspace (`ui/mix/`) reads a mix, so it is reached
  through `getMixes`, `putMix`, `deleteMix`, never through the model rebuild.
- Optional fields added with **no** version bump read back `undefined` on old rows: `MixRow.playlistUrl?`/`playlistId?`,
  `PlayRow.months`/`attempts`/`finished`/`skipped`, `TracklistRow.confidence?`/`isrc?`/`shazamUrl?`; round 005's years:
  `TrackRow.albumYear?`, `TopTrackItem.albumYear?`, `FeatureRow.releaseYear?` (`{year | null, checkedAt}`), `FeatureValue.rid?`,
  `TracklistRow.year?`/`yearFrom?`.
- One connection per tab, and it hands over: `openDb` closes its connection when a newer version opens in another tab (`blocking`) and
  reports a blocked upgrade (`blocked`) through `setDbEvents`; `state.ts` turns both into banners. Without this a version bump hangs on
  "Loading your library…" while an old tab lives. A database that has not opened after eight seconds says so.

## 7. `sync/`

Planner (a pure diff on `snapshot_id`), item mapper, and runner (`runSync`, `src/sync/runner.ts:181`). The runner commits one playlist
per transaction, persists `locked`/`error` state in meta (`syncState`, `lastSyncAt`, `accountId`), and on a different Spotify account asks
before wiping (`ACCOUNT_SWITCH_CONFIRM`). Sync never runs on load ([ADR-02](700-adr/ADR-02-no-spotify-reads-on-load.md)) except from the automatic chain (§14,
[ADR-12](700-adr/ADR-12-automatic-updates.md)), when `lastSyncAt` is older than 12 hours; otherwise only from the Settings button or a
playlist's own button. A sync is refused inside the app's one quota lock-out (§4 `quotaLock.ts`), including one
Check on Spotify or Create playlist met; a lock the sync meets (its `locked` state, read back on load) joins that lock. The
playlist item field filter asks `album(name,release_date)` and the Top tracks answer full tracks, so both keep the album's year
(`albumYearField`, `src/sync/items.ts`, round 005); a playlist synced before that round gets it when it changes or is synced again.

## 8. `history/`

The import of Spotify's _Extended streaming history_ zip (`runImport`, `src/history/importer.ts:108`):

- export file matching (`files.ts`), the 30-second play rule, outcome classification (`trackdone` is finished;
  `fwdbtn`/`backbtn`/`endplay`/`unknown` or the `skipped` flag is skipped; everything else is neutral) (`records.ts`);
- per-month buckets in the device's zone (local-zone `YYYY-MM`, and `sum(months) === plays`);
- zip processing (`process.ts`, one file in memory at a time) in a worker (`import.worker.ts`), driven by the main-thread importer.

An import replaces the whole history; one that covers less than what is stored asks first (`replaceQuestion`). It writes the
`historySummary` meta record; version 2 carries `zone` and `outcomes` (`attempts`, `finished`, `skipped`), and the Crate is gated on it.

## 9. `features/`: Audio data and Artist reach

The acquisition layer behind two Settings cards. Both run only from Settings, write as they go and skip what is already there, so a run
that stopped resumes ([ADR-04](700-adr/ADR-04-keyless-sources-by-id.md)). Local rules: `src/features/CLAUDE.md`.

**Audio data** (BPM and key):

- ReccoBeats lookup: `reccobeats.ts` maps the API, `lookup.ts` drives it (`runLookup`, `src/features/lookup.ts:155`): batches of 40 ids,
  one request per second, an ISRC second pass, `notFound` markers with a 90-day TTL. Round 005 adds a third pass, "release
  years" (`PASS_YEARS`): every track with a ReccoBeats value and no fresh `releaseYear` gets its ReccoBeats id (`rid`, kept from
  pass 1's answer, else `fetchTrackRids`, `GET /v1/track?ids=` per 40), then one `fetchAlbumYear` (`GET /v1/track/{rid}/album?size=50`),
  whose earliest valid year is the original release ([research](../research/2026-11-07-reccobeats-release-years.md)). Same
  one request per second across the three passes (about 45 minutes the first time for the ~2,500 tracks ReccoBeats knows of a
  5,000-track library), rows written every 10 tracks and on an error, a "none" asked again after 90 days. The done state counts
  `years`; the Audio data card shows "Release years: N of M tracks".
- Rekordbox Collection XML import: `rekordbox.ts` scanner, `rekordbox-match.ts` title/artist/duration matching, `rekordbox.worker.ts`,
  `rekordboxImport.ts` (`runRekordboxImport`). A rekordbox value wins wherever it has one.

**Artist reach** — one client per source, each returning a discriminated result and never throwing:

- `musicbrainz.ts`: Spotify artist id → MBID by reverse URL lookup.
- `wikidata.ts`: a SPARQL POST over batches of 150 ids, P1902 then P434, giving the QID, the sitelink count and the article titles.
- `jsonp.ts`: a dependency-free `<script>` transport, because Deezer sends no CORS header at all.
- `deezer.ts`: single-artist ISRC → artist id → `nb_fan`.
- `listenbrainz.ts`: `total_user_count`.
- `wikipedia.ts`: 12 complete UTC months of pageviews.
- `reachRun.ts` (`runReach`, `src/features/reachRun.ts:132`): the resumable five-phase job (MusicBrainz → ListenBrainz → Deezer →
  Wikidata → Wikipedia) that drives them and writes the `artistReachSummary` meta record on every exit path. Three consecutive failures
  pause one source for the rest of the run while the others carry on. 45 to 50 minutes for 1,000 artists.
- The pacing split is deliberate and pinned by a test: MusicBrainz and Deezer sleep their own interval inside their clients, while
  ListenBrainz and Wikipedia are paced between artists by the runner. Adding a sleep around the first two would halve those rates.
- Everything is keyed on the Spotify artist id; an artist known only by name is out of the feature, and name search is forbidden.

## 10. `features/mix/`: Mix tracklist and Create playlist from mix

`#/mix` drafts a SoundCloud mix's tracklist from two free keyless public lookups plus a paste-your-own box. Local rules:
`src/features/mix/CLAUDE.md`.

**Lookup** (runs only from the screen's `Look up` button):

- `url.ts` (`normalizeMixUrl`): the one canonical string sent to both providers, compared by the guard and used as the `mixes` key;
  `on.soundcloud.com` short links are resolved by trying several safe slug spellings.
- `oembed.ts` (`fetchOembed`): SoundCloud oEmbed → title, author, description and the validated player iframe src.
- `trackid.ts` (`fetchTrackId`): TrackId.net's two-call list-then-detail flow behind the mandatory `result.rowCount === 1` **and**
  URL-equality guard, mapping the identified spans to rows with `ID · unidentified` gaps.
- `parse.ts`: the shared line grammar (`parseLines`, `parseClock`): six row shapes, the ≥5-line run guard, link-out detection.
- `tracklistify.ts` (`parseTracklistifyJson`): imports a Tracklistify `tracklist.json` (confidence, ISRC, Shazam URL per row).
- `match.ts` (`libraryTitleIndex`/`matchMixRow`): each row joined to the library live at render time, memoised on `Model` identity.
  Library matches are never stored, because a resync would make a stored match stale.
- `lookup.ts` (`lookupMix`): runs both fetches in parallel so one layer's failure never hides the other's rows.

**Create playlist from mix** (only on a deliberate tap):

- `spotifySearch.ts`: `canCreatePlaylists` (the pure scope check), `isIdentified`, `searchTrack` (per-row `GET /search`: an ISRC-exact
  query first, then a field query, then a plain fallback) and `pickMatch`, the strict accept rule that never returns a wrong track:
  - a credited artist must equal a leading run of the row's credit (`artistRuns`: "Chase" or "Chase & Status", since an act's own name
    may hold the "&") once a trailing "(OZ)"-style tag and leading "The"/"DJ"/"Dr"/"Mr"/"MC"/"Lil" words are dropped (`artistCore`);
    equality, never containment, so "Four" is not "Four Tet" and "Mr. G" is not "G";
  - a title must be equal (ignoring spaces between letters, so "Freakout" is "Freak-Out") or the row's title plus a bracketed or " - "
    version tail (so "Losing It" takes "Losing It (Ted Remix)" but "One" never takes "One More Time", "One (Part 2)" or "One (Reprise)");
  - a title that cleans to empty matches nothing; an equal title anywhere in the up-to-10 results beats an earlier version; an original
    beats a "(Mixed)" compilation copy (`isMixedCopy`).
- `createPlaylist.ts` (`runCreatePlaylist`): resolve every identified row it is given, `POST /me/playlists` (private), then
  `POST /playlists/{id}/items` with the matched URIs in batches of ≤100, driving an `onState` callback and never throwing. A
  `QuotaError` (a search or a POST) comes back as `quotaUntil` before it becomes text, so the wrapper remembers the app's lock-out
  (§4) and says "Try again after …" inline; the POST is still never retried.
- **Validated only / All tracks** (spec 003 T119, T126, owner's D6): `tracksToAdd(rows, choice)` is what is given to the runner.
  **Validated only** keeps validated tracks, a candidate (`origin: 'clue'`, "not heard", which starts To review) once validated;
  **All tracks** keeps every track still in the list, candidates included. Gap and "ID" rows never. The filter chips and the Sort are
  view state and never change it. `defaultChoice`: Validated only once any track is validated, else All tracks; the owner's pick is
  kept per mix (`createChoice`). The card shows "N tracks will be added, in set order." and rests disabled at zero. The mix is still
  saved whole with the playlist's link. This amends ADR-10 ("candidates go into the playlist unless deleted").
- Round 005: `searchTrack` also returns the matched album's year (same answer, no extra call); `runCreatePlaylist` returns the
  years on every exit path and `applyYears` writes them, `yearFrom: 'spotify'`, on the undated rows only (a row edited meanwhile
  is left alone). The search runs on `tracksToAdd`'s rows; `startCreatePlaylist` puts the years on the whole working list of the
  tap (same row objects) and saves them even when the playlist creation then fails (with the tap's `extras` and the stored
  check answers). A copy saved during the run (S13 N1) and the open rows get them by track (`applyYearsByTrack`, `sameTrack` on
  artist and title, never the ISRC). Check on Spotify keeps the same year with its answer (`CheckAnswer.year`), and
  `applyAnswers` dates an undated row from it.
- `worker.ts` (pure, worker round): `resultToRows` (the worker's result through `parseTracklistifyJson`, re-checked), `mergeWorkerRows`
  (a new result replaces untouched scan rows only), `jobView` and `requestStatusText` (the one wording of the Identify button and the
  request's state line for every server and request state). `url.ts` gains `requestKey`, the canonical link of a request.
  Round 003: `resultToRows` also maps a track's `origin` (`replay` with `speedPercent`, `clue` with its `clue`), builds gap
  rows (with `clues`) from `mix_info.gaps` and returns the set-wide `clues` (stored on `MixRow.clues`); `toClue` keeps only
  plain strings within their caps. The Mix screen shows "second listen · ±4 %", "from a comment · not heard" with the clue's
  text, a folded "N clues around here" on a gap row and a folded set-wide tracklist; clue text is always rendered as text.
  `match.cases.json` and `parse.cases.json` are shared with the worker's tests so its Python ports read the same way.
  Round 005: a heard track's `metadata.release_date` becomes `year` (`yearFrom` `shazam`, or `catalogue` when
  `release_date_from` names Deezer or MusicBrainz); `viewRows` gains the year sort (oldest first, undated last) and a decade
  filter combined with "heard once", both in the view only, so hidden rows still go to Create playlist.
- `digLinks.ts` (`digRows`): a track Search did not find is listed under the result, repeats grouped by name with every time in the mix,
  five store/preview search links (Beatport, Bandcamp, Discogs, SoundCloud, YouTube) plus Tracklistify's Shazam page (kept by the parser
  only when it is an https `shazam.com` URL, dropped once the row is edited), drawn as Simple Icons (CC0) by `ui/components/DigLinks.tsx`.
  Spec 003 (T118): every track's **Listen** menu holds the same links (plain search pages, no request until opened).

**The Mixes list and the queue** (spec 003 §12, T116, T121–T123):

- `mixList.ts` (`mixListItems`, pure): saved mixes and worker requests in one list, one row per link, from data the app already
  holds (the last pull's `mixJobs`, the saved mixes); no request, no poll of its own. Each row has one chip (Queued, Identifying,
  Paused, Stopping…, Found tracks, Failed, Rejected, Saved · N tracks, Playlist made), its state line, the progress bar while it
  runs, and its actions. Order (`queueOrder` in `worker.ts`): running first, then waiting in the order the worker takes them
  (highest `priority` first, then the oldest, so **Move to top** shows first), then the rest newest first.
- Actions on a row: **Move to top** and **Cancel** on a waiting request, **Stop** on a running one (disabled while Stopping…),
  **Ask again** on a failed, rejected or stopped-early one, **Remove** in a saved mix's row menu. Cancel, Stop and Remove ask their
  `confirm()` (§14). A request already taken or finished when the tap reaches the server says "Already taken by your computer"
  or "Already finished" inline (`queue.ts` `goneNote`, `mixQueueNote`, ruling D4); a server without migration 0003 is named in
  the inline error (ruling D5). The list's head counts what waits or runs, with **Check now** (`startServerSync`); the 60 s
  auto-pull of §16 refreshes it.

**The review** (spec 003 §12, S08c):

- `spotifyCheck.ts` (**Check on Spotify**, T117): a read on the open mix header's tap only, never on load or open (ADR-02). Gated like
  Create playlist in `startSpotifyCheck` (`model/state.ts`): a Spotify session, no other Spotify reader running (§4), no quota
  lock-out, and no check of another mix. `runSpotifyCheck`
  runs `searchTrack`/`pickMatch` unchanged on each named track not checked yet (`rowsToCheck`: candidates and second-listen rows
  included, gaps and "ID" rows never), one at a time, with "Checked 12 of 40" and Stop; it never throws. Each answer is kept on the row
  as optional fields (`spotify: {id, url} | 'not-found'`, `checkedAt`; no `DB_VERSION` bump) and the mix is saved at the end (its saved
  copy when it was closed meanwhile). An edit of the artist or title drops the answer (`editTracklistRow`). Create playlist adds a found
  id without searching again (`storedUri`). No write; not in `jobsBusy()`; failures (quota, network) inline, never a banner.
  The check saves the mix when it ends, edits and deletions included, and an unsaved lookup becomes a saved mix (ruling R1, S08c fix
  round 1; Save mix's "Saved ✓" shows it). Answers are put back by the row's place and unchanged artist and title, never object
  identity, so a row validated or a list reopened during the run keeps them; an edited or deleted row's answer is dropped. A quota
  answer joins the app's one lock-out (§4 `quotaLock.ts`), which disables the button with its message until it lapses.
- `review.ts` (T118, T127): the filter chips All, To review, Validated, Not on Spotify and Heard once (N) (only when a row has `hits`),
  one at a time, gaps under All only; the header line "N tracks · K validated · M on Spotify · L not found". **Validate** is the
  optional `TracklistRow.validated`, saved with Save mix like an edit; **Remove** is `deleteMixRow`.
- `keepReview.ts` (T125, owner's D1): `mergeKeepingReview` replaces `mergeWorkerRows` when a result lands on a saved mix
  (`mixWithResult`, `server/sync.ts`). An untouched scan row matched by an incoming row (same ISRC, else `artistCore` and `sameTitle`)
  hands it `validated`, `spotify` and `checkedAt`; a validated scan row the result misses stays; edited, typed, pasted, TrackId and
  description rows stay, and an incoming row matching them (their text or what was detected) is dropped; so is one matching
  `MixRow.removed`, which `deleteMixRow` fills with a deleted row's detected artist, title and ISRC whenever something was detected
  (a scan or TrackId row, corrected or not; 500 at most). One existing row's review goes to one incoming row.
- `worker.ts` `toRun`/`runLine` (T124, owner's D3): `mix_info.second_pass` (`places` or round 003's `replays`), `resumed`,
  `stopped_early` and `warnings` kept as the optional `MixRow.run`, replaced wholesale by each result, shown under the open mix's header
  ("Second pass: 41 places · 3 found", "Resumed (120 clips kept)", "Stopped early at 01:12:00 (rate limited)" with Ask again, the
  warnings collapsed). The header also shows the open mix's running request (progress line, bar, Stop) from the last pull.
- `validateMix` checks every new optional field (`validated`, `spotify`, `checkedAt`, `removed`, `run`); Save mix keeps a saved mix's
  `clues`, `run`, `identifyJobId` and `identifiedAt`.

## 11. `features/like/`: Like all songs

`likePlaylist.ts`: `canLikeTracks` (both library scopes), `likeCandidates` (the synced entries' distinct `spotify:track:` URIs in playlist
order, plus a skipped count), `runLikePlaylist` (`src/features/like/likePlaylist.ts:86`: `GET /me/library/contains` then `confirm` then
`PUT /me/library`, 40 URIs per request, never throwing) and the copy helpers (`likeQuestion`, `likeSummary`, `likeErrorText`,
`likeButtonLabel`). Candidates are the **synced** entries, never a playlist read; only `spotify:track:` URIs are sent, since `/me/library`
also saves episodes, albums and playlists; a song already liked is never re-saved.

## 12. `model/`

- `aggregate.ts`: in-memory aggregation (`buildModel`, `src/model/aggregate.ts:62`), `playsFor`, `playlistRanking`, `topTracks`,
  `topArtists`, `artistTracks`; play counts fall back to a normalised name when ids differ (`normalize.ts`).
- `banner.ts`: the banner's severity and suppression rule. `banner` is a `BannerMessage`, never a string: build it with
  `errorBanner(text, inlineOn?)` or `warnBanner(text)`, compare with `banner.value?.text`; `inlineOn` lists the screens whose own card
  prints the same message, and `visibleBanner` suppresses it there.
- `crate.ts`: the pure Crate computations `heavyRotation`, `forgottenGems`, `classics`, `byYear`, `finishRate`, each one pass over
  `PlayRow[]`, and their thresholds (`src/model/crate.ts:3-10`).
- `year.ts` (round 005): `parseYear` (the whole year of a date or number in 1900..next year, else null: every source goes
  through it, so a year is never shown as 0), `yearOf` (a library track's year: ReccoBeats' earliest, else the playlist album
  year, else a Top item's), `decadeOf`, `decadeLabel`; `yearView.ts`: `applyYearView` (stable year sort, undated last, decade
  filter), `decadesPresent`, `effectiveYearView` (a decade absent from the list is dropped, never empties it).
- `keys.ts` (Camelot, Open Key and classic names, `parseKeyText`, `keyRelation`, `bpmDeltaPct`), `features.ts` (`resolveFeature`,
  `featureFor`), `match.ts` (`rankMatches`: ±6% BPM first, then key relation, then BPM distance).
- `reach.ts`: `reachFor`, `isWellKnown`, `hasHistory`, `rankUnderTheRadar` and `reachCoverage` (the last two memoised on `Model` identity).
- `state.ts`: the signals and the `start*` jobs (§14).

## 13. `ui/` and routing

The web-first redesign ([ADR-11](700-adr/ADR-11-web-first-material-3.md), [spec](../specs/2026-11-06-web-first-redesign-design.md),
full round under `specs/003-web-first-redesign/`): Material Design 3, dark only, built by hand on tokens. One Preact component per
screen, grouped by role under `src/ui/`.

- **Look**: `ui/theme/tokens.css` holds every colour, type, shape and motion token (`--md-sys-*`, `--app-*`): Material's dark
  scheme from the seed `#7FFF00`, chartreuse kept as the accent. Components read tokens only. `theme/contrast.ts` and its test
  check every text and control pair (WCAG 2.2 AA). Roboto is served from `public/fonts/`; `ui/icons.tsx` holds the inline
  Material Symbols. Shared components live in `ui/components/` (`Button`, `IconButton`, `SegmentedButtons`, `Card`,
  `StatusLine`, `EmptyState`, `Flag`, `KeyPill`/`BpmText`, `NoData` (a dash announced "no data", never 0), `ProgressBar`,
  `TextField`, `FileDrop`, `Banner`).
- **Size classes**: `ui/layout/windowClass.ts` (`windowClassOf`, the `windowClass` signal): compact < 600 px, medium 600–839,
  expanded 840–1199, large ≥ 1200. CSS does the layout at the same breakpoints; the signal decides behaviour only (pane or full
  screen, rail or bar).
- **Frame**: `layout/AppFrame.tsx` draws `Nav.tsx` (a rail with labels from 600 px, Settings at its foot; a five-item bottom bar
  on compact), `TopBar.tsx` (the title from `titles.ts`, back on a detail, the screen's actions, the search field, the Activity
  button) and `ScreenTabs.tsx` (Top · Crate, Playlists · Artists). The frame paints before anything is awaited: `main.tsx` calls
  `render` before `completeLogin` and `loadFromDb`, and drives `bootPhase` (`'signin' | 'loading' | 'ready'`, in `app.tsx`).
  `src/ui/ActivityButton.tsx` reads `activeJobs` (`ui/jobs.ts`, over the job signals of §14, read only, Check on Spotify included)
  and links to the place that owns each job (a Mix job to its own mix); it never starts, stops or retries one, and its panel closes
  with the last job. `ScreenTabs` are navigation links (`nav` named Listening or Library, the current one `aria-current="page"`).
  A `StatusLine` is a live region (an error `alert`, the rest `status`). Banners sit under the top bar.
- **Destinations and addresses** (`src/router.ts`): Overview (`#/`, also an empty or unknown address), Listening (`#/top`,
  `#/crate`, `#/crate/<view>`, `#/crate/year/<YYYY-MM>`), Library (`#/playlists`, `#/playlist/<id>`, `#/artists`,
  `#/artist/<key>`), Mix (`#/mix`; `#/mix/<key>` opens a saved mix from this browser, never a network call, and an unknown key
  says so inline) and Settings (`#/settings`, `#/import`). `destinationOf(route)` gives the destination and tab; each destination
  reopens the route last used in it this session. Any route may end with `?d=<id>`, the track details sheet over that screen: a
  Spotify track id, a playlist entry's position on a playlist, a search result over any other screen. `routeHref` is the only
  builder of addresses; `parseRoute` stays total.
- **History**: a new navigation scrolls to the top; back and forward do not (`installRouter` stamps `history.state` with
  `djVisited`, `visitEntry`). Opening the sheet pushes an entry; moving to another row with it open, Escape and ✕ replace it
  (`details/navigate.ts`), so Back returns to the list.
- **Tables** (`ui/table/`): `DataTable.tsx` (ARIA table roles on a CSS grid) with the `Column<Row>` builders of `columns.tsx`;
  pure `sort.ts` (`sortRows`, `nextSort`: any column, both directions, missing values last, ranks from the full list),
  `paging.ts` ("Showing 100 of 2,431", page by page) and `keyboard.ts` (arrows, Home and End, Enter opens). Columns hide by
  priority as the table narrows. Compact windows, and a table beside a list pane on expanded windows, show two-line items
  without sort headers (spec FR-015/016 as amended). A title is never drawn under 160 px (SC-001, S13c): `titleColumn` is
  `minmax(176px, 2fr)`, so the other flexible columns give way first; a table too narrow for that hides columns by priority
  (`fitLevel`, `data-level` on the grid over the container queries) and draws two-line items only when its priority-1 columns
  alone leave too little (`titleRoom`/`widthLevel` in `table/layout.ts`); Top and the Crate views do so beside the docked sheet too (`besideSheet`,
  below 960 px). `DataTable` keeps only that level, not the pixel width, so a resize re-renders a table only when it changes.
  The visual loop checks every table at 1440, 1024 and 768 for a title cut under 160 px (`checks.ts` "title-cut"). Sort state is a signal per screen, for the session.
- **Details and list–detail**: `layout/SideSheet.tsx` docks the sheet at 400 px on large windows, a modal on medium and
  expanded, full screen on compact; `details/TrackDetails.tsx` with the pure `trackFacts.ts` shows everything the app holds for a
  track. `layout/ListDetail.tsx` puts Playlists, Artists and the Mixes list beside the open item from 840 px; on compact the item
  opens full screen with back; its list pane shows 100 items at a time, the open one always among them. A modal sheet and the
  search view hold the page still through one counted `layout/scrollLock.ts`. Screens hand `DataTable` stable columns, rows and
  `rankOf` (`table/lastCall.ts` or `useMemo`), so it sorts only when they change. `layout/escape.ts` closes one layer per Escape by rank (search, Activity, the sheet, a folded
  pane, the detail pane), and the focus goes back to the row (`data-row-id`, `layout/focus.ts`).
- **Charts** (`ui/charts/`): inline SVG, no library. `series.ts` (pure: a month outside the history is a gap, zero is drawn as
  zero), `MonthBars.tsx`, `Meter.tsx` (the finish rate in its band), `YearMonthGrid.tsx` (By year's period picker). Every chart
  gives its values on hover, on focus and as text.
- **Screens**: `overview/` (`blocks.ts`, pure, from stored data only, never Spotify, each block behind its screen's gate),
  `Top.tsx` with `top/ComparePeriods.tsx` (the three periods side by side on large windows), `crate/` (`CrateHub` cards,
  `CrateView` dispatching to the five view tables, `shared.tsx`, `labels.ts`, `selections.ts`; gated on
  `historySummary.version === 2`, never on rows), `Playlists.tsx`, `Playlist.tsx` (one strip above the table: meta, Sync and
  Like states, the order control; Match cells in `playlist/matchCells.ts`), `Artists.tsx` with `UnderRadar.tsx` (gated on
  `artistReachSummary.version === 1`; **Well known** is a heading at the bottom, never a filter; listeners and fans in two
  columns), `Artist.tsx`, `settings/` (`SettingsPage.tsx`, the seven sections of `sections.ts` with an index on large windows;
  long jobs start only here; Disconnect alone in `DangerZone.tsx`), `Import.tsx` (a `FileDrop`) and `Connect.tsx`.
- **Mix** (`ui/mix/`, §10): `Workspace.tsx` lays out `MixListPane.tsx` (the link field, Identify on my computer, the JSON import,
  the Mixes list with the queue) beside `MixDetail.tsx` (the header with `RunLine.tsx`, the review line, `TracklistTable.tsx` on
  `DataTable`, `CreatePlaylistCard.tsx`, `Clues.tsx`); from 840 to 1599 px the Mixes pane folds while a mix is open, behind a
  "Mixes" button. No banner: every failure inline. `mixError` shows under the Mixes list's header, or under the open mix's
  header when the Mixes pane is folded or the window has one column (one copy), and the "Mixes" button then carries an error
  indicator (ruling S08b, constitution VII).
- **Search and filters**: `search/searchIndex.ts` (pure `buildSearchIndex` over the model and the saved mixes, which are read
  again on each opening; `searchAll` with the existing `normalize`), `SearchView.tsx` (`/`, Ctrl+K or ⌘K, or the top bar field;
  results grouped, five a group with Show all), `choose.ts` (what a result opens; Escape clears the text, then closes).
  `filters/trackFilter.ts` (pure: text, BPM range, one key with its compatible keys as Match's relations), `FilterBar.tsx` and
  `KeyPicker.tsx` on every track table, with "Showing N of M" and Clear filters.
- **Demo and the visual loop** (dev only; [Contributing](../dev-guide/000-contributing.md) "The visual loop"): `yarn dev` opened
  with `?demo` or `?demo=<variant>` (`full`, `empty`, `old-import`, `no-reach`, `locked`, `signed-out`; `src/dev/flag.ts`) swaps
  in the demo library of `src/dev/demo.ts`, kept in its own database (`spotify-dj-demo`), with an in-memory Spotify session and no
  server, so the owner's data and logins are never touched; `window.__demo` sets job states for the shots. A production build
  drops it (`import.meta.env.DEV`). `tools/shots/` (Playwright with axe-core, outside `yarn test` and CI): `pages.ts` lists every
  page and state; `all.shots.ts` opens each at 1440, 1024, 768 and 390 px with the network blocked outside 127.0.0.1 and the
  clock frozen, runs `checks.ts` (page scroll, clipped text, overlap, column alignment, target size, frame in viewport), the focus
  check and axe, and saves screenshots; `keyboard.shots.ts` walks every screen with the keyboard; both open pages through
  `open.ts`, so a `console.error` fails either. The runner always starts this worktree's own server (never reuses one on 5173),
  and a full run first empties `findings/` and `pages/` (`global-setup.ts`); `summary.ts` and `contact-sheet.ts` read the results.
- **Release year** (round 005, F20; built in S13c from `specs/003-web-first-redesign/contracts/screens.md` "From main after
  the redesign started"). Data: `yearOf`/`datedYear` (`model/year.ts`: ReccoBeats' earliest album, then a sync's album year,
  then a Top list's), cached per model by `trackYear`; a Mix row's own `year`/`yearFrom`. Display, sort and filter only
  (FR-049): no ranking, Crate, Match or gate reads it.
  - **Released column**: `yearColumn` (`ui/table/columns.tsx`), priority 2, 88 px, oldest first, undated last; `NoData` in a
    cell, nothing in the two-line meta line (`Column.compactCell`). On Top (Tracks), Playlist, Artist, the five Crate views
    (`crateColumns`) and the Mix tracklist (the row's own year, its source in the tooltip, no header sort).
  - **Decade**: `TrackFilter.decade` (`ui/filters/trackFilter.ts`); chips in `FilterBar` for the decades present; an undated
    row fails it; it counts in Clear filters and "Showing N of M"; a decade absent from the rows is ignored (`forDecades`).
  - **Sort by year**: `DataTable` always measures its width and reports `onLayout({ twoLine, widestPriority })`
    (`ui/table/layout.ts`); each screen keeps the last layout in local state, and `trackFilterView` draws "Sort by year, oldest
    first" (a toggle chip, `role=switch`) only when `yearSortOffered`: two-line items or a table under 720 px. On, the table's
    sort is `{ columnId: 'released', direction: 'asc' }`; off, the screen's default.
  - **Details**: `yearFact` (`ui/details/trackFacts.ts`) gives the sheet's "Released 1993 · ReccoBeats (earliest album)" or
    "· album", `NoData` when undated.
  - **Mix**: the Sort select gains "Year, oldest first" and shows when a row is counted or dated; a Decade select ("All
    decades", each decade present) combines with the review chips; the edited row stays visible (`TracklistTable.tsx`). A
    rename drops the year unless the row is renamed back to the identified track and the year is not Spotify's
    (`editTracklistRow`, S13b N1).
  - **Activity**: the look-up entry reads "Looking up release years" during `PASS_YEARS` (`ui/jobs.ts`).

## 14. Jobs and state (`model/state.ts`)

| Job               | Wrapper                                                       | Started from                                                   | In `jobsBusy()`                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sync              | `startSync` (`src/model/state.ts:957`)                        | Settings, a playlist's button, the automatic chain | yes                                                                                                                                                                   |
| History import    | `startImport` (`:1037`)                                        | `#/import`                                                     | yes                                                                                                                                                                   |
| ReccoBeats lookup | `startLookup` (`:1095`)                                        | Settings · Audio data, the automatic chain | yes                                                                                                                                                                   |
| Rekordbox import  | `startRekordboxImport` (`:1137`)                               | Settings · Audio data                                          | yes                                                                                                                                                                   |
| Artist reach      | `startReach` (`:1166`)                                         | Settings · Artist reach, the automatic chain | yes                                                                                                                                                                   |
| Mix lookup        | `startMixLookup` (`:1228`), `startTracklistifyImport` (`:1317`) | `#/mix`                                                        | no                                                                                                                                                                    |
| Create playlist   | `startCreatePlaylist` (`:1606`)                                | `#/mix`                                                        | no                                                                                                                                                                    |
| Check on Spotify  | `startSpotifyCheck` (`:1877`), `stopSpotifyCheck` (`:1861`)       | `#/mix`, the open mix's header                                 | no (Spotify reads only, one track at a time; refused while another Spotify reader runs or inside the quota lock-out; no `confirm()`; reset by `disconnect`, which keeps the lock-out) |
| Like all songs    | `startLikePlaylist` (`:2030`)                                 | Playlist screen                                                | no                                                                                                                                                                    |
| Server pull       | `startServerPull` (`:359`)                                    | the open (after the first paint), Settings · Server · Sync now | yes                                                                                                                                                                   |
| Server push       | `queueServerPush` (`:315`)                                    | the tail of the five library jobs, every mix save or delete    | no                                                                                                                                                                    |
| Identify request  | `startIdentifyRequest` (`:1515`)                         | `#/mix`, the Identify on my computer button                    | no (one insert, under a second; no `confirm()`; Disconnect keeps it)                                                                                                  |

**The automatic chain** (round 006, [ADR-12](700-adr/ADR-12-automatic-updates.md)). `createChain` (`src/model/autoChain.ts`, pure)
is wired in `state.ts` (`runAutoChain`, `requestJob`, `autoUpdates`, `setAutoUpdates`, `chainView`) and run by `main.tsx` after the
open's server sync and by `autoSync.ts`'s return and `online` triggers (a second install covers a device without the server). Steps,
one at a time after `waitIdle()` (no `jobsBusy()` job running): `spotify` when `isSpotifyDue` (`lastSyncAt` null or older than
`AUTO_SYNC_AGE_MS` = 12 h, the shared quota lock `spotifyLockedUntil()` lapsed) and not yet run this page session; `features`; `reach`. A step that ends `error` is kept
in `failed` and skipped by later triggers of the session. The three wrappers take `{ auto: true }`: no wake lock, no `clearBanner()`,
no banner but the lock-out and the expired-login logout. The Settings buttons (Sync now, Look up BPM and key, Look up artists) and the Updates section's Retry call `requestJob`, which
puts the job first (even with the switch off). `disconnect` calls `autoChain.stop()` first. The automatic Spotify step is held
(`spotifyHeld`) while the account-mismatch notice is up, and an automatic sync answers the account-switch question "no" without
asking: that `confirm()` follows a tap only. The BPM and reach runs push only when they looked something up (`featuresChanged`,
`reachChanged`, `src/model/pushAfter.ts`), so a resume with nothing new sends nothing. "Sync this playlist" is disabled while
`jobsBusy()`. The Settings Updates section's six lines (`src/ui/settings/UpdatesSection.tsx`) come from
`updateLines` (`src/model/updateLines.ts`, pure). The switch is `localStorage` `autoUpdates` (`'off'` = off).

The five library jobs are mutually exclusive through `jobsBusy()` and rebuild the `Model` with `loadFromDb()` (`:888`). The mix and like
jobs write no library store and rebuild no `Model`, so they need no exclusion; each guards its own re-entry on its state's `status`, shows
every failure inline (never a banner) and is reset by `disconnect` (`:2091`). Every Spotify reader shares one quota lock-out
(`spotifyQuotaLock`, §4): a quota answer to any of them is remembered for all, across reloads, and `disconnect` keeps it. The four
readers (sync, Check on Spotify, Create playlist, Like all songs) also run one at a time (§4). Create playlist's state names its mix
(`mixUrl`), shows only on that mix and survives Close while it runs. When it ends it reads the stored mix again (`rowAfterCreate`):
a copy the owner saved during the run wins (validates, edits, removed tracks) and Create adds only its playlist; otherwise it saves the
rows of the tap with the check answers already stored (`keepStoredAnswers`). Like a check that ends in the background, it refreshes the
saved mixes without clearing the open mix's error.

Every `confirm()` the app makes, so the list is in one place. Destructive, in `state.ts`: an account switch during a tapped sync, never an automatic one
(`ACCOUNT_SWITCH_CONFIRM`, `:996`), an import that covers less than the stored history (`replaceQuestion`, `:1048`), Remove server data
(`REMOVE_SERVER_DATA_CONFIRM`, `:442`), Cancel a waiting identify request (`CANCEL_REQUEST_CONFIRM`, `:2187`, asked from the request's row in the Mixes list,
`ui/mix/MixListPane.tsx`) and Stop a running scan (`STOP_REQUEST_CONFIRM`, `:2204`, round 004, asked from the Mixes list row or
the open mix's header, `ui/mix/RunLine.tsx`; the scan keeps its tracks); Disconnect, asked by its button in
`ui/settings/DangerZone.tsx` (`:26`); and Remove a saved mix ("Remove this saved mix?"), asked by its row menu in
`ui/mix/MixListPane.tsx` (`:173`). Non-destructive, in
`state.ts`: Like all songs' count (`:2053`) and the four "replace the working list" questions of the Mix screen (`:1301`, `:1331`,
`:1363`, `:1385`). All are plain `confirm()` calls, so the pure cores stay testable and the unit tests, which pass no confirm, keep the
old behaviour.

Their texts, word for word (`<…>` is filled in when asked); `yarn regression` holds every `confirm()` it meets to this list, and
`yarn invariants` fails if any text differs from `main`:

- Account switch: "This is a different Spotify account. Delete all local data for the previous account?"
- Narrower import: "This import covers <span>; your current history covers <span>. Replace it?", or, when the files hold no
  play: "This import covers no plays at all; your current history covers <span>. Replace it?"
- Remove server data: "Remove all your data from the server? Local data on this browser is kept."
- Cancel a request: "Cancel this request? It leaves the queue; you can ask again later."
- Stop a scan: "Stop this scan? The computer ends it within about a minute and keeps the tracks found so far."
- Disconnect: "Disconnect and delete all local data? Server data is kept."
- Remove a saved mix: "Remove this saved mix?"
- Like all songs: "<n> of <songs> from your last sync <isn't or aren't> in your Liked Songs yet. Like <it or them>?"
- Look up again: "Looking up again replaces the current tracklist, including your edits. Continue?"
- A Tracklistify file: "Importing this file replaces the current tracklist, including your edits. Continue?"
- The description: "Replace your edited tracklist with the one from the description?"
- Pasted tracks: "Replace your edited tracklist with the pasted tracks?"

## 15. Build, CI and deploy

`.github/workflows/ci.yml` runs `yarn install --frozen-lockfile`, `typecheck`, `lint`, `test` on every push to `main` and every PR, then a
`deploy` job builds with the `VITE_SPOTIFY_CLIENT_ID` secret and the two `VITE_SUPABASE_*` repository variables, and publishes `dist/`
to GitHub Pages on pushes to `main`. Commands: [Contributing](../dev-guide/000-contributing.md).

## 16. `server/`: the owner's server

One Supabase Free project, for the owner alone, that stores every dataset the app builds and never computes
([ADR-08](700-adr/ADR-08-owner-server-free-tier.md); the round's full record is under `specs/001-backend-data-sync/`). Local rules:
`src/server/CLAUDE.md`. Without `VITE_SUPABASE_URL`/`VITE_SUPABASE_KEY` the module is inert and the app is the browser-only app.

- `client.ts` (`createServerClient`): plain `fetch` against PostgREST (`/rest/v1/<table>`, filters in the query, `Range` paging,
  `Prefer: resolution=merge-duplicates` upserts) and GoTrue (`/auth/v1/otp`, `/auth/v1/token`, `/auth/v1/logout`); every call returns a
  `ServerResult` (`offline`, `paused`, `unauthorized`, `tooLarge`, `error`), never throws, never retries.
- `session.ts` (`createServerSessionStore`): the magic link in the PKCE flow. `requestLink` stores a verifier under `server-pkce` and
  asks for a link whose `redirect_to` is the app plus `?link=server`; `main.tsx` branches on that marker (Spotify's callback is a bare
  `?code=`), `completeLink` exchanges the code with the verifier and stores `server-session`. A refresh re-reads storage first and retries
  once on "already used"; a 401 signs out.
- `datasets.ts` (pure): the four datasets and their stores, each with its stamp (`library` = `lastSyncAt`; `history` =
  `historySummary.importedAt`, version 2 only; `features` = newest `updatedAt`; `reach` = `artistReachSummary.ranAt`), `compareStamps`
  (newer wins, never by push time), `batches` (500), `rowKey`, and `planMixes` (per row by `savedAt`, with tombstones).
- `validate.ts` (pure): every pulled row and summary checked before it is written or rendered (keys, finite numbers, `https:` links,
  `open.spotify.com` links, `SC_PLAYER_PREFIX`, the gate versions); a failing row is dropped and counted (security review S3).
  The one exception (round 005): an invalid optional year field (`albumYear`, `releaseYear`, `reccobeats.rid`, a mix row's
  `year`/`yearFrom`) is removed from a copy of the row and the row is kept: a year is display data and must not cost its BPM,
  plays or tracklist.
- `sync.ts`: `runPush` (rows in batches under a new generation, then the `datasets` stamp, then the generation before the previous
  one is dropped, so one bad push stays recoverable), `runPull` (stamps, pages of `dataset_rows`, validation, `replaceDataset` with the
  summary in one transaction, `serverStamps` recorded), the mixes branch (`select=*` once, filtered in the client), `runRemoveAll` (the
  four tables, children first, then the server metas) and `readUsage` (`storage_used()`).
- Server side: `supabase/migrations/0001_init.sql` creates `datasets`, `dataset_rows`, `mixes`, `jobs` and `storage_used()`, enables
  Row Level Security on `owner_id = auth.uid()` and revokes every default privilege from `anon`; `0002_jobs.sql` (worker round) adds
  `jobs.applied_at`, an index and `claim_job(p_worker, p_stale_seconds)` (security invoker: the oldest queued request, or one left
  running past the stale limit, marked claimed under `for update skip locked`); `0003_job_control.sql` (round 004) adds
  `progress`, `priority`, `stop_requested_at` and makes `claim_job` take the highest priority first, then the oldest.
- Identify requests (worker round, §17): `requestIdentify` (one open request per link, else one insert of `{kind: 'identify-mix',
payload: {url}}`) and `pullJobs`, run by `runPull` after the mixes: the history per link validated (`validateJobRow`) into the
  `mixJobs` meta (newest first, 20 per link), then every done, unapplied result applied oldest first: `resultToRows`, the saved mix
  merged or created, `serverPending.mixes` set, `applied_at` marked with an `is.null` guard so another device skips it; a refused
  result is counted and flagged `rejected` locally.
- Round 004 (`specs/004-worker-progress-control/`, migration 0003): `pullJobs` also reads `progress`, `priority`,
  `stop_requested_at` (and falls back to the old fields when the server answers "column does not exist"); `validateJobRow`
  keeps a well-formed progress or drops it; `progressLine` words it on the request's row of the Mixes list (§10) ("First pass · 47 % · about 25 min
  left", "Paused by Shazam until 20:35", the VPN warning, "the computer stopped sending news" after 10 minutes).
  `cancelRequest` (deletes a queued row), `moveRequestToTop` (priority above the highest queued), `stopRequest`
  (`stop_requested_at` on a claimed row), behind `startCancelRequest`, `startMoveToTop`, `startStopRequest`. Heard rows carry
  `hits` (clips matched) beside `confidence` (best score); `viewRows` sorts by time, clips or score and filters "heard once"
  in the view only.
- Wiring in `model/state.ts`: `serverState` (rendered by the Settings server card), `recordConnectedAccount` (one `/me` on the Connect
  tap, `:450`), `queueServerPush` (flags `serverPending` first, one push at a time), `startServerPull` (joins `jobsBusy()`, ends in
  `loadFromDb()` and `loadSavedMixes()`), `startServerSync` (pending pushes, then the pull: the open, the card's button and `autoSync.ts`),
  `startServerSignOut`, `removeServerData` (the one new `confirm()`). `offline` and `paused` set no banner and keep the pending flags.
- Four new `meta` names and no `DB_VERSION` bump: `serverStamps`, `serverPending`, `serverLastSync`, `mixDeleted` (written by
  `deleteMix`, cleared after the tombstones are pushed).
- `index.html` carries a Content Security Policy listing every host the app calls; `vite.config.ts` fills the server URL into it at
  build time and the HMR websocket on the dev server.
- `autoSync.ts` (`installAutoSync`, installed by `main.tsx` after the open's sync; its `sync` also runs the automatic chain, §14): `startServerSync` on return to the app (tab
  visible, `RESUME_GAP_MS` = 60 s since the last), on `online`, and `startServerPull` every `ACTIVE_POLL_MS` (60 s) while visible
  and a request waits or runs (`hasActiveRequest`); only when signed in to both (`serverAutoSyncEnabled`). Never reads Spotify.

## 17. `worker/`: the owner's-computer worker

A Python `uv` project (3.11–3.13; `yt-dlp`, `shazamio`, `imageio-ffmpeg`; tests with the standard library's `unittest`, run by CI)
and one PyInstaller executable per system built by `.github/workflows/worker-release.yml` and released as `worker-v<version>` on the first push to `main` carrying a new
version in `worker/pyproject.toml`
([ADR-09](700-adr/ADR-09-mix-identification-on-the-owners-computer.md); the round's record under `specs/002-mix-analysis-worker/`;
the owner's manual `worker/README.md`; local rules `worker/CLAUDE.md`). It never calls a Spotify host.

- `cli.py`: `check`, `login` (the app's magic link in the PKCE flow, caught on `127.0.0.1:5173/myOwnSpotifyData/` → `session.json`
  at mode 600; `--code` for a typed six-digit code), `logout`, `run --once|--watch`, `--config`, `--version`;
  no command = the double-click: login if needed, then watch; a packaged start without a settings file writes `mix-worker.env`
  and exits 6. Exit codes 0/2/3/4/5/6/130 (`contracts/worker.md`). Every dependency (environment, terminal, clock, client, the
  queue loop) is a `CliDeps` field, so `tests/test_cli.py` runs every command offline.
- `config.py`: the one reader of the settings file and the environment (`Settings`, defaults per OS, `SettingsError` naming
  the setting). `server.py`: `ServerClient` over `urllib` (`send_otp`, `verify`, `refresh`, `logout`, `claim` → `rpc/claim_job`,
  `finish` → `PATCH jobs?id=eq.&status=eq.claimed&claimed_by=eq.` with `return=representation` ("taken" when it answers no
  row), `release`), every call a `Result`, the error mapping of `client.ts`. `session.py`: load/save/refresh with a 60 s margin.
- `download.py`: `yt_dlp.YoutubeDL` in-process, `bestaudio/best`, no playlist, no live, no post-processing; the error text
  mapped to one-line reasons. `scan.py`: `probe_times` (one 12 s probe every 15 s), `cut_probe` (ffmpeg → mono 16 kHz WAV through a
  scratch file), `recognize(bytes, max_skew)` one at a time behind a cooldown (a `RateLimited` pauses once, then `ScanRefused`),
  `confidence_of` (the skew formula), `track_entry` (the F15 entry with ISRC, label, Shazam link), `merge` (one row per run of
  hits within the gap), `write_result` (the JSON, saved before it is sent). `pipeline.py`: `run_one` (validate → download → scan →
  write → send → clean, every path logged and the folder removed) and `log.py` (one line per step; tracebacks to the file only).
- Round 003 (`specs/003-fill-scan-gaps/`): `scan.scan` runs a **second pass** (`gap_positions`: 7 s after the misses, one
  place every 30 s, heard at ×1, ×0.96, ×1.04 through `cut_probe(speed=…)`'s `asetrate`), marks its hits `origin: "replay"`,
  keeps them when refused, and reports the still-empty `gaps`; `run_scan` returns `ScanOutput`. `clues.py` reads the
  description, chapters and comments (`read`: one yt-dlp call without download, in a thread, 90 s at most), parses them
  (`split_tracklist` tries every separator and item start, keeps the cleanest split), places them on gaps (`attach`) and
  turns a clue naming one track into a candidate (`Lookups`: Deezer, then MusicBrainz, Discogs/Deezer links by id; equality
  by `match.py`, ADR-10). `pipeline.run_one` adds `mix_info.second_pass`, `gaps`, `clues` and the candidates, and `trim`s
  clues to fit the size limit.
- Round 004: `merge` counts `hits` per row; the scan reports progress through `pipeline._Progress` (`ServerClient.progress`,
  at most once a minute and at each step; a failed write turns it off for the run), sees a Stop in the answer
  (`StopRequested`, also within 30 s during a refusal pause), warns once when two refusals come closer than
  `WORKER_REFUSAL_WARN_CALLS`, runs the second pass speed by speed, and saves what it heard after every probe
  (`runstate.Recorder`, `<work_dir>/runs/<sha1(link)>.json`) so Ask again on a stopped set resumes it
  (`WORKER_RESUME_DAYS`, same probe settings); a complete run deletes it.
- Round 005 (worker 0.5.0, `specs/005-track-release-year/`): after the clues, `clues.fill_years` dates every heard track with
  an ISRC and no valid `release_date` through `Lookups.release_year` (Deezer `GET /track/isrc:{ISRC}`, then MusicBrainz
  `GET /ws/2/isrc/{ISRC}?inc=releases&fmt=json`; earliest valid year, `release_date_from` naming the catalogue), on the same
  per-set `WORKER_LOOKUPS` budget as the clues (clues first). An invalid year ("0000") is removed; a catalogue failure stops
  the step with one log line and never fails the set.
- The result lands in `jobs.result`; the app's pull (§16) turns it into rows of the saved mix.

## Links

- [Feature inventory](100-features.md)
- [Limits and roadmap](800-limits-roadmap.md)
- [ADR index](700-adr/README.md)
- [Contributing](../dev-guide/000-contributing.md)
- [Specs](../specs/) · [Research](../research/)
- [Documentation map](../README.md)
