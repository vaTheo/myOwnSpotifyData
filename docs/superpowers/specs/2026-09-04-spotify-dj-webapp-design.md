# Spotify DJ web app: design

Date: 2026-09-04. Status: approved in conversation, pending written review.
Research behind every constraint below: `../research/2026-09-04-spotify-platform-research.md`.

## 1. Goal

A small browser-only web app the owner opens on an Android phone (Chrome) while
preparing DJ sets. It answers three questions from their own Spotify data:

1. Which tracks and artists do I play most, per period, and are they already in
   a playlist?
2. Which tracks in a given playlist do I actually play most?
3. Which artists have the most tracks saved across my playlists, and where?

Play counts come from two sources: Spotify's live top lists (ranked, capped at
50 per period) and an import of Spotify's *Extended Streaming History* export
(every play since the account was created).

### In scope (version 1)

- Login with Authorization Code + PKCE, no backend, no client secret.
- Sync of playlists the owner **owns** (50 to 200 of them) into IndexedDB, with
  incremental refresh and quota-aware resumption.
- Import of the Extended Streaming History zip on the phone.
- Screens: Connect, Top, Playlists, Playlist, Artists, Artist, Import, Settings.
- Deploy to GitHub Pages from this repository, which becomes public.

### Out of scope (version 1)

Search by name, Liked Songs, collaborative and followed playlists, ISRC-based
merging through per-track lookups, BPM or key from any source, recently-played
polling, a server-side crawler, iOS-specific work, service worker / offline
shell, component tests.

## 2. Decisions and verified constraints

| Decision | Why |
| --- | --- |
| Browser-only static site | Zero infrastructure, nothing secret to leak in a public repo. Tokens and data never leave the phone. |
| PKCE, Client ID only | Spotify's flow for public clients. The client secret is never used; the existing `SPOTIFY_CLIENT_SECRET` config is removed. |
| GitHub Pages, public repo | Owner's choice. Pages on a private repo needs a paid plan. Site lives under `https://vatheo.github.io/myOwnSpotifyData/`. |
| Preact + signals, no Vite plugin | ~8 kB, two packages. Vite 8 compiles JSX natively via tsconfig `jsx: react-jsx`, `jsxImportSource: preact`. |
| `idb`, `fflate` | 1.4 kB typed IndexedDB wrapper; 3 kB unzip usable in a worker. |
| Hash routing | GitHub Pages serves no SPA fallback; `#/playlist/<id>` needs none. |
| Manual sync only | Spotify enforces an unpublished **daily quota** on playlist reads (community: lock-outs of 6-24 h). Never spend it on page load. |
| 30-second play rule | Spotify's own stream-counting rule and Wrapped's. |
| Owned playlists only | Owner's choice. Followed playlists' items return 403 to a Development Mode app anyway. |

Platform facts the design depends on (all verified 2026-09-04, sources in the
research file):

- **Development Mode** is the only mode for a personal app: owner must keep
  Spotify Premium; up to 5 allow-listed users; the owner adds themself under
  the app's User Management.
- **Redirect URIs**: exact string match; HTTPS required except loopback
  `http://127.0.0.1:<port>/...`; `localhost` rejected.
- **Tokens**: access token 1 h. Refresh token expires **6 months after the
  original authorization**; refreshing does not extend it; expiry answers
  `400 invalid_grant`. A refresh response may or may not carry a new refresh
  token.
- **Endpoints** (all pages max 50): `GET /me`, `GET /me/top/{tracks|artists}`
  (`time_range` short_term / medium_term / long_term, offset ≥ 50 returns
  nothing), `GET /me/playlists`, `GET /playlists/{id}/items` (the old
  `/tracks` path is gone; read `items[].item`, which may be null, may be an
  episode, may be a local file with `id: null`). Batch `GET /tracks?ids=` is
  gone. Track objects still carry `external_ids.isrc`. No audio features, no
  popularity, no play counts anywhere in the API.
- **Rate limiting**: rolling 30 s window, plus the daily quota. `429` may carry
  `Retry-After`, but the browser may not be allowed to read it (not exposed via
  CORS in past reports). Quota exhaustion is `429` with body
  `{"error":{"status":429,"reason":"QUOTA_EXCEEDED"}}`.
- **Policy**: cache is temporary and must be wipeable; provide a disconnect that
  deletes everything; link content back to Spotify. Policy III.13 forbids
  "derived listenership metrics"; the owner has been told and accepts the
  risk for a private single-user tool.
- **History export**: zip `my_spotify_data.zip`, folder name varies, files
  `Streaming_History_Audio_<YYYY|YYYY-YYYY>_<n>.json` and
  `Streaming_History_Video_<YYYY|YYYY-YYYY>.json` without a numeric suffix
  (same schema, music-video plays with track URIs). Each file ≤ ~12 MB, ~16k records, pretty-printed UTF-8. 23 keys, every
  value nullable. Music play = `spotify_track_uri` starting with
  `spotify:track:`. Artist is a **name only**. The "Account data" package has
  a different schema (`endTime`, `msPlayed`, no URI) and must be rejected.
- **Android Chrome**: IndexedDB up to 60 % of disk; background tabs are
  throttled and frozen, so syncs run only in the foreground; Wake Lock API is
  available.

## 3. Architecture and repository layout

Single Vite application. All code under `src/` targets the browser.

```
index.html
vite.config.ts               base '/myOwnSpotifyData/'; also the Vitest config
public/
  manifest.webmanifest       name, short_name, start_url and scope = base, display standalone
  icon-192.png, icon-512.png
src/
  main.tsx                   mounts <App/>
  app.tsx                    shell: auth gate, hash router, bottom tab bar
  router.ts                  parse/format hash routes (pure) + current-route signal
  auth/
    pkce.ts                  verifier, S256 challenge, authorize URL, token exchange, refresh (pure + fetch)
    session.ts               token storage in localStorage, single-flight refresh, login/logout/disconnect
  spotify/
    client.ts                request(): bearer, 401 refresh-once, 429 handling, 5xx retry, paging
    types.ts                 the subset of API objects we read
    errors.ts                ApiError, AuthError, NotAllowlistedError, QuotaError
  sync/
    planner.ts               diff listing vs cache -> {toDelete, toFetch, unchanged} (pure)
    items.ts                 map a raw playlist item to {track, entry} or null (pure)
    runner.ts                executes: profile, top items, listing, queue, per-playlist commits, progress
  db/
    schema.ts                DBSchema for idb, store names, version
    repo.ts                  open/wipe, typed read/write helpers, per-playlist replace transaction
  history/
    records.ts               classify a record, 30 s rule, aggregate into Map (pure)
    files.ts                 file-name matcher, wrong-package detection (pure)
    import.worker.ts         unzip + parse + aggregate, posts progress
    importer.ts              main-thread wrapper: run worker, write plays store, update meta
  model/
    normalize.ts             name normalisation for the fallback join (pure)
    aggregate.ts             build in-memory model from stores (pure)
    state.ts                 signals: model, sync state, import state; reload after sync/import
  ui/
    Connect.tsx  Top.tsx  Playlists.tsx  Playlist.tsx  Artists.tsx  Artist.tsx  Import.tsx  Settings.tsx
    components/              TrackRow, Badge, Filter, Progress, Banner, SpotifyLink
  styles.css                 mobile-first plain CSS
```

Every folder has a pure core (unit-tested) and a thin I/O edge.

### Removed

`src/index.ts`, `src/config.ts`, `src/config.test.ts`, `tsconfig.build.json`,
the `start` script, `SPOTIFY_CLIENT_SECRET` and `SPOTIFY_REDIRECT_URI`.

### Configuration

- `.env` (gitignored): `VITE_SPOTIFY_CLIENT_ID=...`. `.env.example` lists only
  that variable.
- CI build reads the same variable from the repository secret
  `VITE_SPOTIFY_CLIENT_ID`. The Client ID is public by design; the secret only
  keeps it out of the source.
- Redirect URI is computed at runtime: `location.origin + import.meta.env.BASE_URL`.
  Dev: `http://127.0.0.1:5173/myOwnSpotifyData/`.
  Prod: `https://vatheo.github.io/myOwnSpotifyData/`. Both are registered in
  the Spotify dashboard. Dev must be opened via `127.0.0.1`, never `localhost`.

### Tooling

- `tsconfig.json` (single, browser): `target ES2022`, `module esnext`,
  `moduleResolution bundler`, `lib ["ES2022","DOM","DOM.Iterable"]`,
  `types ["vite/client"]`, `jsx react-jsx`, `jsxImportSource preact`,
  `strict`, `noEmit`, `isolatedModules`, `verbatimModuleSyntax`,
  `skipLibCheck`, `include ["src", "vite.config.ts"]`. Relative imports no
  longer need `.js` extensions (CLAUDE.md to be updated).
- `import.worker.ts` starts with `/// <reference lib="webworker" />`.
- `typescript` pinned `~6.0.3` (6.1 is outside typescript-eslint's range).
- New dependencies: `preact`, `@preact/signals`, `idb`, `fflate`. New dev
  dependency: `fake-indexeddb`. `vite` stays and is now used directly.
- Scripts: `dev: vite`, `build: vite build`, `preview: vite preview`,
  `typecheck: tsc --noEmit`, `lint`, `format`, `test: vitest run`.
- ESLint config unchanged apart from linting `.tsx`.

## 4. Authentication

1. Connect screen → `login()`: generate a 64-char code verifier from
   `crypto.getRandomValues`, S256 challenge via `crypto.subtle.digest`, a random
   `state`. Store `{verifier, state}` in localStorage under `pkce`. Navigate in
   the same window to `https://accounts.spotify.com/authorize` with
   `client_id`, `response_type=code`, `redirect_uri`, `scope`,
   `code_challenge_method=S256`, `code_challenge`, `state`.
2. Scopes: `user-top-read playlist-read-private`.
3. On app load, if the URL has `?code=` and `?state=`: compare `state`, POST
   `https://accounts.spotify.com/api/token` (`grant_type=authorization_code`,
   `code`, `redirect_uri`, `client_id`, `code_verifier`), store tokens, delete
   `pkce`, `history.replaceState` to the bare app URL. `?error=` shows the
   Spotify error on the Connect screen. A missing verifier shows "Start again".
4. Token record in localStorage under `session`: `{accessToken, expiresAt,
   refreshToken, scope}`.
5. `getAccessToken()`: if `expiresAt - now < 60 s`, refresh
   (`grant_type=refresh_token`, `refresh_token`, `client_id`). One refresh in
   flight at a time; callers await the same promise. If the response carries a
   new `refresh_token`, store it. `400 invalid_grant` → clear `session`, raise
   `AuthError('expired')` → Connect screen explains the 6-month rule. Cached
   data is kept.
6. `logout()` clears `session` only. `disconnect()` clears `session`, `pkce`
   and deletes the IndexedDB database.
7. `403` on `GET /me` → `NotAllowlistedError` → Connect screen says the account
   must be added to the app's user list.

## 5. API client

`request<T>(path, query?)` against `https://api.spotify.com/v1`:

- One request in flight at a time (a simple promise queue). Dev-mode rate
  limits are low and the sync is sequential anyway.
- Adds `Authorization: Bearer`. On `401`: refresh once, retry once.
- On `429`: read `Retry-After` (seconds). If the body has
  `reason: "QUOTA_EXCEEDED"`, or `Retry-After` > 300 s, throw
  `QuotaError({retryAt})` where `retryAt = now + Retry-After`, or `now + 24 h`
  when the header is unreadable and the body says quota. Otherwise wait
  `Retry-After` or an exponential backoff from 2 s (cap 60 s, 6 attempts) and
  retry.
- On `5xx` or network failure: retry up to 3 times with backoff, then throw
  `ApiError`.
- Other statuses: `ApiError({status, message})` with Spotify's message.
- `paginate(path, query)` yields pages by following `next` until null.

## 6. Sync engine

Triggered only by the Sync button in Settings or "Sync this playlist" on a
Playlist screen. Holds a screen Wake Lock while running (released on finish or
error). Progress lives in a signal and is mirrored to the `meta` store so a
closed tab can resume.

Order:

1. `GET /me`. If `meta.accountId` exists and differs → ask for confirmation
   (`ACCOUNT_SWITCH_CONFIRM`, worded like Disconnect's); on yes wipe the
   database, store the new id and leave a persistent banner
   (`ACCOUNT_SWITCH_NOTICE`); on no stop the sync with the error message
   `ACCOUNT_SWITCH_STOPPED` and delete nothing.
2. Top items: `GET /me/top/tracks` and `/me/top/artists` × three
   `time_range`s, `limit=50`. Each list replaces its `topItems` record.
3. Listing: `paginate('/me/playlists', {limit: 50})`. Keep entries where
   `owner.id === me.id`; drop nulls. Record `{id, name, snapshot_id,
   items.total (fall back to tracks.total), images[0]?.url, external_urls.spotify}`.
4. `plan(listing, cached)` → `toDelete` (in cache, not in listing), `toFetch`
   (not in cache, or `snapshot_id` differs), `unchanged`. Deletions are applied
   immediately. `toFetch` keeps listing order; a playlist requested from its
   own screen is moved to the front.
5. For each playlist in `toFetch`: `paginate('/playlists/{id}/items',
   {limit: 50, fields})`. Map items with `items.ts`:
   - `item == null` → skip.
   - `item.type === 'episode'` → skip.
   - `is_local` → track key `item.uri`, `id: null`, artist ids null.
   - else → key `item.id`, artists `[{id, name}]`, album name,
     `duration_ms`, `external_ids.isrc ?? null`, `external_urls.spotify`.
   Then `repo.replacePlaylist(playlist, tracks, entries)` in **one**
   transaction that deletes the old entries, upserts tracks, writes entries with
   positions 0..n-1 and writes the playlist row with the new `snapshot_id`
   last. Progress: `done + 1`.
6. Success → `meta.lastSyncAt = now`, sync state `idle`, model reload.
7. `QuotaError` → sync state `locked` with `retryAt`, the remaining ids stay
   pending, everything already committed is browsable. The Sync button is
   disabled until `retryAt` and shows the time. A later Sync re-runs steps 1-4
   (cheap) and continues.
8. Any other error → sync state `error` with the message; partial progress is
   kept. A playlist interrupted mid-fetch keeps its old `snapshot_id` and is
   fetched again next time.

`fields` probe: on the first items request of a sync, try
`next,total,items(added_at,is_local,item(type,id,uri,name,duration_ms,external_ids,external_urls,artists(id,name),album(name)))`.
If the response is `400` or has no `items`, retry with `track(...)` in place of
`item(...)`; if that also fails, use no `fields`. The working variant is cached
in memory for the rest of the sync.

Request budget: listing ⌈P/50⌉ + Σ⌈tracks/50⌉ + 7. For 200 playlists of 100
tracks: ~411 requests on the first sync; ~11 afterwards plus changed playlists.

## 7. Data model

### IndexedDB (`idb`), database `spotify-dj`, version 1

| Store | keyPath | Value | Indexes |
| --- | --- | --- | --- |
| `playlists` | `id` | `{id, name, snapshotId, itemCount, imageUrl?, spotifyUrl, syncedAt}` | |
| `tracks` | `key` | `{key, id: string\|null, uri, name, artists: {id: string\|null, name}[], album, durationMs, isrc: string\|null, spotifyUrl?, isLocal}` | |
| `entries` | `[playlistId, position]` | `{playlistId, position, trackKey, addedAt: string\|null}` | `byTrack` on `trackKey`, `byPlaylist` on `playlistId` |
| `topItems` | `key` (`tracks:short_term` …) | `{key, fetchedAt, items: TopTrack[] \| TopArtist[]}` | |
| `plays` | `trackId` | `{trackId, plays, msPlayed, firstTs, lastTs, trackName, artistName}` | |
| `meta` | `name` | `{name, value}`: `accountId`, `lastSyncAt`, `syncState`, `historyImportedAt`, `historyRange`, `historyCounts` | |

`repo.ts` exposes: `open()`, `wipe()`, `getAll(store)`, `replacePlaylist(...)`,
`deletePlaylists(ids)`, `putTopItems(record)`, `replacePlays(records)`,
`getMeta/putMeta`.

### In-memory model (`model/aggregate.ts`, pure)

Input: all rows of `playlists`, `tracks`, `entries`, `topItems`, `plays`.
Output:

- `tracksByKey: Map<key, Track>`.
- `playlistsOfTrack: Map<key, Set<playlistId>>`.
- `artists: Artist[]` sorted by `trackKeys.size` desc, then name. Artist key is
  the Spotify artist id, or `name:<normalised name>` when the id is null.
  `{key, id, name, trackKeys: Set, playlistIds: Set}`.
- `playsFor(track): {plays, msPlayed, source: 'id' | 'name'} | null`:
  exact `plays[track.id]`, else the name-index lookup
  `normalize(artists[0].name) + '|' + normalize(name)` over `plays` rows
  (summed when several ids share a name). Name index is built once per model.
- `playlistRanking(playlistId): {entry, track, plays, inTop: Set<period>}[]`
  sorted by plays desc, then top-list rank, then position.
- `topList(type, period)`: items annotated with `playlistCount` and `plays`.

`normalize(s)`: NFD, strip combining marks, lower-case, drop everything but
letters, digits and spaces, collapse spaces, trim. Stripping suffixes such as
" - Remastered" or "(feat. …)" is not attempted in v1.

Cover images are `<img>` tags pointing at Spotify's CDN, loaded lazily, never
stored.

## 8. History import

Import screen accepts `<input type="file" accept=".zip,.json" multiple>`.

Worker (`import.worker.ts`) receives `File[]`:

1. For a `.zip`: read as ArrayBuffer, list entry names with
   `fflate.unzipSync(buf, {filter: () => false})`-style enumeration (the filter
   sees every name, decompresses nothing), keep base names matching
   `/^Streaming_History_(Audio|Video)_\d{4}(?:-\d{4})?(?:_\d+)?\.json$/i` (folder
   ignored), sort by numeric `<n>`, then inflate **one entry at a time** with
   `unzipSync(buf, {filter: f => f.name === name})` so only one ~12 MB file is
   in memory besides the zip itself. Loose `.json` files are matched by the
   same rule and read one at a time.
2. Per file: `TextDecoder('utf-8').decode` → `JSON.parse` → must be an array;
   otherwise the file is reported as unreadable and skipped.
3. Wrong-package check on the first file: if records have `endTime` or
   `msPlayed`, or no file matched but names like `StreamingHistory_music_*.json`
   were present, abort with `ImportError('account-data-package')`.
4. Per record (`records.ts`): `spotify_track_uri` starts with
   `spotify:track:` and `ms_played >= 30000` → credit one play to the id, add
   `ms_played`, update first/last `ts`, keep the latest non-null
   `master_metadata_track_name` / `master_metadata_album_artist_name`.
   Otherwise increment one of the counters: `short` (< 30 s), `podcast`
   (`spotify_episode_uri`), `audiobook` (`audiobook_uri`), `unattributed` (no
   URI at all). Records that are not objects are counted as `malformed`.
5. Post `{type: 'progress', file, index, total}` after each file, then
   `{type: 'done', plays: PlayRecord[], counts, range: {first, last}, files:
   {processed, skipped: string[]}}`.

Main thread (`importer.ts`): `repo.replacePlays(plays)` in one transaction,
then `meta.historyImportedAt`, `historyRange`, `historyCounts`; model reload.
The summary shows plays credited, distinct tracks, how many of those tracks are
in the synced playlists, date range, and the skipped counters with their
meaning, the zero ones dropped. A new import replaces the previous aggregate
entirely. When the incoming range is shorter than the stored one, or when the
import credits no play at all (the video files), one `confirm()` asks first
(`This import covers 8 months; your current history covers 4 years. Replace
it?`); cancelling keeps the stored history and says so. There is no
month-level merge.

## 9. Screens

Bottom tab bar: Top, Playlists, Artists, Import, Settings. Rows ≥ 48 px. Every
track, artist and playlist row carries a link to its Spotify page from
`external_urls.spotify`, drawn as an icon-only 44 px target whose accessible
name is "Open in Spotify"; the Artist and Playlist headers spell the words out
(`SpotifyLink`'s `label` prop). Local files have no Spotify page, so the link
is omitted for them.

- **Connect** (no session): one button, one sentence on what is read, and the
  reason when arriving from an expired or refused session.
- **Top** (`#/top`): segmented control 4 weeks / 6 months / 1 year (maps to
  short/medium/long_term); toggle Tracks / Artists. Track row: rank, title,
  artists, badges "in N playlists" — or the amber "not in a playlist" once any
  playlist is synced — and "N plays" (with "(by artist and title)" when the
  count was matched by name). Tap expands the playlists that contain it, or the
  line "Not in any of your N playlists". Artist row: rank, name, "N saved
  tracks"; tap → Artist. Empty state prompts a sync.
- **Playlists** (`#/playlists`): owned playlists, track count, a "pending"
  marker when the playlist is queued or was left pending by a quota lock-out.
  Filter box (substring, normalised). A filter that matches nothing shows
  `No playlists match "<query>".` with a Clear filter button.
- **Playlist** (`#/playlist/<id>`): header with name, count, "Sync this
  playlist". List sorted by plays desc, toggle to playlist order; before any
  history import a muted caption reads `No play counts yet — import your
history` and links to `#/import`, and the default stays By plays. Row: title,
  artists, plays with the "(by artist and title)" hint, top-list badge, Spotify
  link.
- **Artists** (`#/artists`): ranked list, "N tracks · M playlists". Filter
  box. A filter that matches nothing shows `No artists match "<query>".` with
  a Clear filter button.
- **Artist** (`#/artist/<key>`): the name and the Spotify link even when the
  artist is only in a top list and nothing is saved (the body then reads "No
  saved tracks from <name> in your playlists."), then every saved track with
  plays; tapping a track shows the playlists containing it, and the first three
  rows start open.
- **Import** (`#/import`): the last import's summary first when one exists,
  then the file picker with per-file progress, then the instructions (Account →
  Privacy → Download your data → _Extended streaming history_ → confirm the
  email → zip by email, hours to weeks) folded into a `<details>` disclosure;
  with no import yet the instructions come first and stay open.
- **Settings** (`#/settings`): last sync, Sync button with "12 / 140
  playlists", a non-destructive "Connect again" button (clears the session,
  keeps IndexedDB), quota lock-out message with retry time, last error text
  prefixed "Last error:", Disconnect with confirm, app version (from
  `package.json`).

## 10. Error handling

- Every failure is stored in the relevant state signal and shown: a banner on
  the current screen — red for a failure, amber for a warning or a notice —
  and the full message in Settings or Import, always prefixed "Last error:".
  The banner is suppressed on a screen whose own card already prints that
  exact message, so the text is never on screen twice. Nothing is caught
  without being surfaced. A user cancellation is not a failure: it ends in its
  own state with a muted line.
- Auth: `AuthError` → Connect screen with reason. `NotAllowlistedError` →
  Connect screen with the user-list instruction.
- Sync: `QuotaError` → locked state with retry time. `ApiError` → error state
  with status and message; progress kept.
- Import: per-file problems are listed in the summary; wrong package aborts
  with the explanation; worker crash surfaces as an error with the file name.
- Storage: `QuotaExceededError` from IndexedDB → error with a hint to free
  space; the failed transaction is rolled back by IndexedDB itself.
- Offline: any `fetch` failure, the token endpoint included, becomes
  `ApiError(0, …)` → banner "Offline, showing cached data."; cached screens
  keep working, and the session is kept.

## 11. Testing

Vitest, default Node environment, tests next to source.

- `auth/pkce.test.ts`: challenge for a known verifier matches the RFC 7636
  vector; authorize URL contains every parameter; exchange and refresh bodies.
- `spotify/client.test.ts` (mocked `fetch`): bearer header; 401 → refresh → retry
  once; 429 with `Retry-After` waits then retries; 429 with `QUOTA_EXCEEDED` →
  `QuotaError` with `retryAt`; 5xx retries then `ApiError`; one-at-a-time
  queue.
- `sync/planner.test.ts`: delete / fetch / unchanged partitions; priority id
  moves to the front; non-owned playlists excluded.
- `sync/items.test.ts`: null, episode, local file, normal track mapping.
- `db/repo.test.ts` (`fake-indexeddb`): `replacePlaylist` atomically replaces
  entries and keeps other playlists; `deletePlaylists` removes entries;
  `wipe`.
- `history/records.test.ts`: 30 s rule, classification counters, aggregation
  of first/last/ms, nullable fields, non-object records.
- `history/files.test.ts`: file-name matcher incl. single-year and video
  names, numeric ordering, account-data detection.
- `model/normalize.test.ts`, `model/aggregate.test.ts`: artist ranking, ties,
  local-file artist keys, exact then name fallback, playlist ranking order,
  top-list annotation.
- `router.test.ts`: parse and format of every route.

No DOM or component tests. Manual check on the phone via the deployed URL.

## 12. Deployment

`.github/workflows/ci.yml` keeps the `typecheck`, `lint`, `test` job and adds
`deploy` (needs it, only on `push` to `main`): `actions/checkout`,
`actions/setup-node` with `.nvmrc` and yarn cache, `yarn install
--frozen-lockfile`, `yarn build` with `VITE_SPOTIFY_CLIENT_ID` from secrets,
`actions/upload-pages-artifact` (`dist`), `actions/deploy-pages`. Permissions
`pages: write`, `id-token: write`.

One-time setup by the owner:

1. Repository → Settings → General → change visibility to public.
2. Settings → Pages → Source: GitHub Actions.
3. Settings → Secrets and variables → Actions → new secret
   `VITE_SPOTIFY_CLIENT_ID`.
4. Spotify dashboard → app → Settings: redirect URIs
   `http://127.0.0.1:5173/myOwnSpotifyData/` and
   `https://vatheo.github.io/myOwnSpotifyData/`; User Management: add the
   owner's account.
5. On the phone: open the site in Chrome, "Add to Home Screen".

## 13. To verify during implementation

These are undocumented or inconsistent in Spotify's docs; the code handles
both outcomes but the first live run should confirm:

- Whether `fields` accepts `item(...)`, `track(...)`, or neither (probe).
- Whether `Retry-After` is readable from the browser on 429 (fallback backoff).
- Whether refresh responses rotate the refresh token (both handled).
- Whether `/me/playlists` reports `items.total` or `tracks.total` (read both).
- The real request rate Development Mode tolerates (start sequential, measure
  with the dashboard graph before adding concurrency).
