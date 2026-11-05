# 000 — How the app works

> **Status**: Living
> **Last updated**: 2026-11-05

The reference for every "how does X work?" question. The [README](../../README.md) is the owner's manual (setup and daily use), the
[feature inventory](100-features.md) lists what is built and where, the [changelog](../../CHANGELOG.md) says what changed when, the
dated [specs](../specs/) hold the reasoning of each round, and the [research notes](../research/) the verified external facts. The
decisions that still hold are in the [ADR index](700-adr/README.md); the rules for working on the repo are in
[Contributing](../dev-guide/000-contributing.md); the [documentation map](../README.md) lists every page.

## 1. The app in one paragraph

A browser-only Preact web app the owner (a DJ) uses on an Android phone, added to the home screen from Chrome. It shows their most
played Spotify tracks, ranks their own playlists by play count, ranks artists by saved tracks, and helps prepare sets (BPM and key,
match mode, under-the-radar artists, SoundCloud mix tracklists). Public repo `vaTheo/myOwnSpotifyData`, single `main` branch, deployed
to GitHub Pages at `https://vatheo.github.io/myOwnSpotifyData/` by CI. No server: login is PKCE with a Client ID only
([ADR-01](700-adr/ADR-01-browser-only-pkce.md)), data lives in IndexedDB, play counts come from Spotify's history export
([ADR-07](700-adr/ADR-07-play-counts-from-export.md)).

Stack: Node 24 (`.nvmrc`), yarn classic 1.22, Vite 8 (JSX compiled by Vite itself, no framework plugin), Preact 10 + `@preact/signals`,
`idb`, `fflate`, TypeScript `~6.0.3`, Vitest in the Node environment.

## 2. Shape: pure cores behind thin I/O edges

`src/` is one Vite app. Every computation is a pure, unit-tested function; the I/O (fetch, IndexedDB, workers, `confirm()`, the DOM) sits
in thin edges around it. Every fetch-based client takes an injected `fetchFn` and returns a discriminated result instead of throwing.
`model/state.ts` holds the signals and the thin `start*` wrappers that wire the cores to the browser singletons; those wrappers are not
unit-tested. Tests sit next to the source as `src/**/*.test.ts`; there are no DOM or component tests.

| Folder | Role |
|---|---|
| `auth/` | PKCE, the session store, scopes (§3) |
| `spotify/` | the API client and types (§4) |
| `util/` | shared retry helpers and the reach timeout (§5) |
| `db/` | IndexedDB schema and repository (§6) |
| `sync/` | playlist sync planner and runner (§7) |
| `history/` | streaming-history export import (§8) |
| `features/` | Audio data (BPM and key) and Artist reach acquisition (§9) |
| `features/mix/` | Mix tracklist and Create playlist from mix (§10) |
| `features/like/` | Like all songs (§11) |
| `model/` | aggregation, Crate, keys, match, reach, banner, signals (§12) |
| `ui/` | one component per screen, routes (§13) |

## 3. `auth/`

- PKCE helpers (`pkce.ts`) and the session store (`createSessionStore`, `session.ts`), with `browser.ts` holding the app instance.
- `SCOPES` (`src/auth/session.ts:12`): `user-top-read playlist-read-private playlist-modify-private user-library-read user-library-modify`.
- `hasScope` splits `session.scope` on spaces, never `String.includes`, so a substring cannot satisfy it.
- A token refresh returns the scope the **original** grant had, so it can never widen an old session: a feature that needs a new scope
  shows **Connect again → Connect Spotify** ([ADR-03](700-adr/ADR-03-library-writes-on-tap.md)).
- The redirect URI is computed at runtime (`env.ts`). The only setting is `VITE_SPOTIFY_CLIENT_ID`; there is no client secret anywhere.

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

## 5. `util/`

`MAX_5XX_RETRIES`, `backoffMs` and `parseRetryAfter`, shared by the Spotify and ReccoBeats clients, plus `REACH_REQUEST_TIMEOUT_MS`, the
15 s `AbortSignal.timeout` every artist-reach `fetch` carries. That constant lives here rather than in `reachRun.ts` on purpose: the
runner imports all four `fetch`-based clients, so declaring it in the runner would make each of them import its own runner, a module
cycle whose `const` can read `undefined` at init.

## 6. `db/`

Row types and `DB_VERSION` in `schema.ts`; the `upgrade` callback and every read and write in `repo.ts`. The rules for changing them
are in `src/db/CLAUDE.md` ([ADR-05](700-adr/ADR-05-additive-indexeddb.md)).

| Store | keyPath | Holds |
|---|---|---|
| `playlists` | `id` | the owner's playlists, with `snapshot_id` |
| `tracks` | `key` (Spotify track id, or the `spotify:local:` URI) | track metadata |
| `entries` | `['playlistId', 'position']` | playlist membership, in order |
| `topItems` | `key` | Spotify top tracks and artists per period |
| `plays` | `trackId` | play counts and month buckets from the history import (`PlayRow`) |
| `features` | `trackId` | BPM and key per source |
| `artistIdentity` | `artistId` | MBID, QID, sitelinks, article titles, step state |
| `artistReach` | `key` = `${artistId}\|${source}` (build it with `reachKey`) | one reach number per source, with its URL |
| `mixes` | `url` (normalised SoundCloud URL) | saved Mix working lists (`MixRow`) |
| `meta` | `name` | summaries and job state (`historySummary`, `syncState`, `artistReachSummary`, …) |

- `DB_VERSION` is 4 (`src/db/schema.ts:4`). The `upgrade` callback (`src/db/repo.ts:75-95`) creates only the stores that are missing (the same guarded
  `db.objectStoreNames.contains` shape throughout), so a version 1 database keeps everything and gains `features`, version 2 gains the
  two reach stores, version 3 gains `mixes`.
- `mixes` is deliberately **not** in `AllRows`, `getAllRows` or `buildModel`: nothing but `Mix.tsx` reads a mix, so it is reached
  through `getMixes`, `putMix`, `deleteMix`, never through the model rebuild.
- Optional fields added with **no** version bump read back `undefined` on old rows: `MixRow.playlistUrl?`/`playlistId?`,
  `PlayRow.months`/`attempts`/`finished`/`skipped`, `TracklistRow.confidence?`/`isrc?`/`shazamUrl?`.
- One connection per tab, and it hands over: `openDb` closes its connection when a newer version opens in another tab (`blocking`) and
  reports a blocked upgrade (`blocked`) through `setDbEvents`; `state.ts` turns both into banners. Without this a version bump hangs on
  "Loading your library…" while an old tab lives. A database that has not opened after eight seconds says so.

## 7. `sync/`

Planner (a pure diff on `snapshot_id`), item mapper, and runner (`runSync`, `src/sync/runner.ts:181`). The runner commits one playlist
per transaction, persists `locked`/`error` state in meta (`syncState`, `lastSyncAt`, `accountId`), and on a different Spotify account asks
before wiping (`ACCOUNT_SWITCH_CONFIRM`). Sync never runs on load ([ADR-02](700-adr/ADR-02-no-spotify-reads-on-load.md)): only from the
Settings button or a playlist's own button.

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
- ReccoBeats lookup: `reccobeats.ts` maps the API, `lookup.ts` drives it (`runLookup`, `src/features/lookup.ts:121`): batches of 40 ids,
  one request per second, an ISRC second pass, `notFound` markers with a 90-day TTL.
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
- `createPlaylist.ts` (`runCreatePlaylist`, `src/features/mix/createPlaylist.ts:39`): resolve every identified row,
  `POST /me/playlists` (private), then `POST /playlists/{id}/items` with the matched URIs in batches of ≤100, driving an `onState`
  callback and never throwing.
- `digLinks.ts` (`digRows`): a track Search did not find is listed under the result, repeats grouped by name with every time in the mix,
  five store/preview search links (Beatport, Bandcamp, Discogs, SoundCloud, YouTube) plus Tracklistify's Shazam page (kept by the parser
  only when it is an https `shazam.com` URL, dropped once the row is edited), drawn as Simple Icons (CC0) by `ui/components/DigLinks.tsx`.

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
- `keys.ts` (Camelot, Open Key and classic names, `parseKeyText`, `keyRelation`, `bpmDeltaPct`), `features.ts` (`resolveFeature`,
  `featureFor`), `match.ts` (`rankMatches`: ±6% BPM first, then key relation, then BPM distance).
- `reach.ts`: `reachFor`, `isWellKnown`, `hasHistory`, `rankUnderTheRadar` and `reachCoverage` (the last two memoised on `Model` identity).
- `state.ts`: the signals and the `start*` jobs (§14).

## 13. `ui/` and routing

One Preact component per screen plus small shared components (`ui/components/`).

- Tab bar: **Crate · Top · Playlists · Artists · Settings**. `#/import` and `#/mix` are routes, not tabs; `tabOf` in `app.tsx` maps both to
  `settings`. The default route stays `top`, even though Crate is the leftmost tab. Routes: `src/router.ts:42-68`.
- The Crate's five views live in `ui/crate/` (`CrateView` dispatches, `shared.tsx` the row helpers and `Strip`, `labels.ts` the pure
  history-copy helpers, `selections.ts` the module-level selection signals). Gated on `historySummary.version === 2`, never on rows.
- `Artists.tsx` dispatches over two views the same way, with `UnderRadar.tsx` beside it and `artistSelections.ts` holding `artistView`,
  `radarSort`, `radarFilter`. Under the radar is gated on `artistReachSummary.version === 1`; **Well known** is a heading at the bottom,
  never a filter that removes rows.
- `Mix.tsx` is the `#/mix` screen, reusing `TrackRow`, `FeaturePills` and `SpotifyLink`, raising no banner (every failure inline).
- A new navigation scrolls to the top; back and forward do not: `installRouter` stamps `history.state` with `djVisited` (`visitEntry`)
  and only calls `scrollTo(0, 0)` on an unstamped entry.
- The shell paints before anything is awaited: `main.tsx` calls `render` before `completeLogin` and `loadFromDb`, and drives
  `bootPhase` (`'signin' | 'loading' | 'ready'`, declared in `app.tsx`); nothing else writes it.

## 14. Jobs and state (`model/state.ts`)

| Job | Wrapper | Started from | In `jobsBusy()` |
|---|---|---|---|
| Sync | `startSync` (`src/model/state.ts:379`) | Settings, a playlist's button | yes |
| History import | `startImport` (`:445`) | `#/import` | yes |
| ReccoBeats lookup | `startLookup` (`:535`) | Settings · Audio data | yes |
| Rekordbox import | `startRekordboxImport` (`:576`) | Settings · Audio data | yes |
| Artist reach | `startReach` (`:604`) | Settings · Artist reach | yes |
| Mix lookup | `startMixLookup` (`:665`), `startTracklistifyImport` (`:753`) | `#/mix` | no |
| Create playlist | `startCreatePlaylist` (`:928`) | `#/mix` | no |
| Like all songs | `startLikePlaylist` (`:1072`) | Playlist screen | no |

The five library jobs are mutually exclusive through `jobsBusy()` and rebuild the `Model` with `loadFromDb()` (`:314`). The mix and like
jobs write no library store and rebuild no `Model`, so they need no exclusion; each guards its own re-entry on its state's `status`, shows
every failure inline (never a banner, never touching the sync lock) and is reset by `disconnect` (`:1115`).

Three things ask before they destroy data: Disconnect, an account switch during a sync (`ACCOUNT_SWITCH_CONFIRM`) and an import that
covers less than the stored history (`replaceQuestion`). Like all songs asks a fourth, non-destructive question naming the exact count.
All are plain `confirm()` calls made in `state.ts`, so the pure cores stay testable and the unit tests, which pass no confirm, keep the
old behaviour.

## 15. Build, CI and deploy

`.github/workflows/ci.yml` runs `yarn install --frozen-lockfile`, `typecheck`, `lint`, `test` on every push to `main` and every PR, then a
`deploy` job builds with the `VITE_SPOTIFY_CLIENT_ID` secret and publishes `dist/` to GitHub Pages on pushes to `main`. Commands:
[Contributing](../dev-guide/000-contributing.md).

## Links

- [Feature inventory](100-features.md)
- [Limits and roadmap](800-limits-roadmap.md)
- [ADR index](700-adr/README.md)
- [Contributing](../dev-guide/000-contributing.md)
- [Specs](../specs/) · [Research](../research/)
- [Documentation map](../README.md)
