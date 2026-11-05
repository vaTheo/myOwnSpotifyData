# Like all songs of a playlist — design

Round 7, 2026-09-25. Owner request: "on each playlist I could click on a
button that adds every song from this playlist to Liked Songs, this way I will
have a like for each sound in the playlist."

## 1. Owner decisions

1. **Check first, skip what is already liked.** The app asks Spotify which
   songs are already in Liked Songs and likes only the rest. The docs do not
   say whether re-saving a liked song moves it to the top of Liked Songs, so
   the app never re-saves one on purpose.
2. **Check, then confirm with the exact count.** The read-only check runs
   first; a `confirm()` then names the real number. Nothing is written before
   OK. When everything is already liked, it says so and asks nothing.
3. **The playlist as of the last sync.** The candidates come from the local
   `entries` of that playlist, never from a fresh Spotify read: playlist reads
   are the quota that locks accounts out for hours (the "never sync on load"
   rule). The owner syncs the playlist first if it changed.
4. **One more re-login.** The new scopes are not in any existing grant, and a
   token refresh never widens a grant (see the mix-playlist spec), so the
   owner taps Connect again once. Spotify's redirect lands on the default
   route (`#/top`); the owner taps back into the playlist. `auth.logout()`
   clears only the session, so the library and saved mixes stay.

## 2. Spotify facts (verified 2026-09-25 against the live docs)

| What             | Endpoint                                | Limit        | Scope                 |
| ---------------- | --------------------------------------- | ------------ | --------------------- |
| Check saved      | `GET /me/library/contains?uris=a,b,…`   | 40 URIs      | `user-library-read`   |
| Save to library  | `PUT /me/library?uris=a,b,…`            | 40 URIs      | `user-library-modify` |

- Sources: <https://developer.spotify.com/documentation/web-api/reference/check-library-contains>,
  <https://developer.spotify.com/documentation/web-api/reference/save-library-items>,
  <https://developer.spotify.com/documentation/web-api/references/changes/february-2026>
  (`PUT /me/tracks` and `GET /me/tracks/contains` are removed; the unified
  `/me/library` endpoints replace them).
- `contains` answers a JSON array of booleans in the order of the URIs sent.
- `PUT /me/library` answers **200 with an empty body**.
- Both endpoints take URIs of many item types (tracks, albums, episodes,
  shows, audiobooks, playlists, users). The docs list `user-follow-*` and
  `playlist-*` scopes for the other types; for tracks only the two
  `user-library-*` scopes apply, and only those two are added.

## 3. What the owner sees (Playlist screen)

A **Like all songs** button sits beside **Sync this playlist**.

1. **Scope.** Without both library scopes, the tap reveals a note ("This app
   cannot like songs yet — connect again to allow it. Your library stays on
   this phone.") and a **Connect again to allow likes** button calling
   `auth.logout()`. Nothing is sent.
2. **Checking** — `Checking your Liked Songs… 40 / 120`. Only
   `spotify:track:` URIs are sent (local files, and any non-track item, are
   skipped); duplicates in the playlist are sent once.
3. **Confirm.** Everything liked already → the result line
   `All 120 songs are already in your Liked Songs`, no dialog, no write.
   Otherwise `confirm("88 of 120 songs from your last sync aren't in your
   Liked Songs yet. Like them?")`. Cancel returns to idle, nothing written.
4. **Liking** — `Liking… 40 / 88`, 40 per request, in playlist order.
5. **Done** — `Liked 88 songs · 32 were already liked · 1 local file skipped`;
   each part only when non-zero.
6. **Error** — under the button: during the check `Could not check your Liked
   Songs: <message>` (nothing written); during the write `Liked 40 of 88, then:
   <message>`. A second tap resumes naturally: the check skips what is now
   liked.

Other rules: a tap while a like runs is ignored (the button is disabled and
reads `Liking…`); the lines belong to their playlist and are not shown on
another one; `disconnect` resets them; nothing runs on load; no undo in-app.
A playlist with no Spotify song at all shows `No Spotify songs to like` plus
the skipped count.

## 4. Architecture

### `src/features/like/likePlaylist.ts` (new, unit-tested)

- `likeCandidates(model: Model, playlistId: string): { uris: string[];
  skipped: number }` — pure. Walks `entriesByPlaylist` in position order,
  looks each `trackKey` up in `tracksByKey`, keeps `uri`s that start with
  `spotify:track:`, dedupes by URI keeping the first, counts every entry left
  out (local file, missing track, non-track URI) as `skipped`. A duplicate is
  not counted as skipped.
- `runLikePlaylist(deps, input): Promise<void>` — never throws.
  - `deps: { client: Pick<SpotifyClient, 'get' | 'put'>; confirm: (toLike:
    number, total: number) => boolean; onState: (s: LikeState) => void }`
  - `input: { playlistId, uris, skipped }`
  - Check: batches of 40, `client.get<unknown>('/me/library/contains',
    { uris: batch.join(',') })`. The answer must be an array of booleans of the
    batch's length; anything else is an error ("Spotify returned an unexpected
    answer"), never a guess — a wrong zip could skip or re-save the wrong songs.
    Zip by index into `toLike` (the `false` ones, playlist order).
  - `toLike.length === 0` → `done` with `liked: 0`. Otherwise `confirm`; false
    → `idle`.
  - Write: batches of 40, `client.put('/me/library', { uris: batch.join(',') })`.
    A failing batch → `error` with `liked` so far and `toLike` count.
- `buildUrl` already encodes the query (`URLSearchParams`), so `:` and `,` are
  percent-encoded as the docs' example shows.

### `LikeState` (declared in `model/state.ts`, imported as a type by the runner)

```ts
export type LikeState =
  | { status: 'idle' }
  | { status: 'needScope'; playlistId: string }
  | { status: 'checking'; playlistId: string; done: number; total: number }
  | { status: 'liking'; playlistId: string; done: number; total: number }
  | { status: 'done'; playlistId: string; liked: number; already: number; skipped: number }
  | { status: 'error'; playlistId: string; message: string; liked?: number; toLike?: number };
```

`liked`/`toLike` on `error` are present only when the write phase failed.
The runner's `import type` must stay type-only (as `createPlaylist.ts` does),
so Vitest never evaluates `state.ts` and its browser singletons.

### `src/spotify/client.ts`

- `put<T = void>(path: string, query?: Query): Promise<T>` on
  `SpotifyClient`, through the same `enqueue` + `request`. No body (the save
  endpoint takes its URIs in the query), so no `Content-Type`.
- `request` reads a successful body with `res.text()` and parses JSON only
  when it is non-empty; an empty 200/204 resolves `undefined`. Today
  `res.json()` would throw on the save endpoint's empty 200.
- **PUT keeps GET's retry rules** (5xx and network backoff): saving the same
  URIs twice leaves the same library, so it is idempotent. Only POST keeps the
  no-retry rule. The comment above `isPost` is updated to say so.

### `src/auth/session.ts`

- `SCOPES` gains `user-library-read user-library-modify`.
- New `hasScope(session: Session | null, scope: string): boolean` — split on
  spaces, whole-token match. `canCreatePlaylists` (in
  `features/mix/spotifySearch.ts`) delegates to it; new `canLikeTracks(session)`
  (in `likePlaylist.ts`) requires both library scopes.

### `src/model/state.ts`

- `likeState = signal<LikeState>({ status: 'idle' })`.
- `startLikePlaylist(playlistId)`: ignore when `checking`/`liking`; no model
  → return; `!canLikeTracks(session)` → `needScope`; claim `checking`
  synchronously; `likeCandidates(model, playlistId)`; run with the real `api`
  client and `confirm` building the §3 question text.
- Not in `jobsBusy()` and never calls `loadFromDb()` — it writes no local
  store. A `QuotaError` stays inline on the Playlist screen and does not touch
  the Settings sync lock. `disconnect` resets `likeState` with the others.

### `src/ui/Playlist.tsx`

The button, and one `LikeStatus` block rendering the §3 lines, shown only
when `likeState.value.playlistId === id`.

### `CLAUDE.md`

- The client bullet: `get`, `post` and `put`; PUT is idempotent and retried.
- The create-playlist bullet's "the app's only write to the owner's Spotify
  library" becomes two writes (create a playlist, like a playlist's songs),
  both gated on a re-login.
- The "three things ask before they destroy data" list is unchanged; a new
  line records the like confirm as a non-destructive bulk-write confirm.
- Architecture map: `features/like/`.

## 5. Errors

Every failure ends in `likeState.error` and is printed under the button;
nothing is swallowed and no banner is raised. Covered: a network error or 5xx
after retries, a 401 that cannot refresh, a 403 (e.g. a scope Spotify still
refuses), a short 429 retried then failing, a `QuotaError`, a malformed
`contains` answer. A disconnect mid-run lets the next request fail with the
cleared session; the error lands on a screen that no longer renders.

## 6. Testing

- `client.test.ts`: `put` sends `PUT` with the query and no body; an empty
  200 resolves `undefined`; a 5xx is retried for PUT (unlike POST); 401
  refreshes once.
- `session.test.ts`: `SCOPES` carries both library scopes; `hasScope` matches
  whole tokens only.
- `likePlaylist.test.ts`: `likeCandidates` (order, local and non-track
  skipped, duplicates once, missing track skipped); `canLikeTracks` needs both
  scopes; the runner — 85 URIs make three `contains` calls of 40/40/5; the
  booleans zip by index; `confirm` gets `(toLike, total)`; cancel writes
  nothing; all-liked writes nothing and does not confirm; writes are 40 per
  PUT in playlist order; a write failure reports `liked` so far; a check
  failure or a malformed answer writes nothing.
- No component tests (project rule). Live verification: the button appears,
  the needScope prompt shows on the current grant, and the Connect again path
  requests both scopes. A real like needs the owner's login.
