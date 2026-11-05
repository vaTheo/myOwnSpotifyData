# Create a Spotify playlist from a mix: design

Date: 2026-09-06. Status: draft for the owner to review before any code.
Builds on `2026-09-06-mix-tracklist-design.md` (the Mix screen, the `mixes`
store, `MixRow`/`TracklistRow`, `startMixLookup`/`saveMix`/`openMix`) and the
platform research `../research/2026-09-04-spotify-platform-research.md`
(Search survives the February 2026 changes; line ~58).

Owner decisions folded in (2026-09-06, binding):

1. **Write access, yes.** The app may create and modify the owner's own
   playlists; the owner will log in once more to grant it.
2. **Private** playlist.
3. **A new playlist per mix.** "Add to an existing playlist" is out of scope
   and is not built.
4. **Creation is always a deliberate tap.** A playlist is created **only** when
   the owner taps **"Create playlist from mix"** — never automatically, never on
   a lookup, never on reopen. After a mix has a playlist, the screen shows a
   **"Playlist created · Open in Spotify ›"** link (from the stored
   `playlistUrl`); the button is **not** relabelled and nothing auto-recreates.
   Tapping **"Create playlist from mix"** again simply makes **another** new
   playlist. This ruling **supersedes** the earlier brief's "the button becomes
   Update / recreate".

## 1. Goal

From a mix's **identified** rows (the ones with a real artist and title — not a
gap, not an `ID`/`unknown` placeholder), one tap creates a **private** Spotify
playlist containing the tracks Spotify could match by search, and **honestly
reports** the ones it could not. The mix rows are text only — `TracklistRow`
carries `artist`/`title`/`label` and **no Spotify id** (they come from
TrackId.net and mix descriptions) — so each identified row is resolved to a real
Spotify track through Search, a new private playlist is created, and the matched
tracks are added in mix order. A row Spotify cannot match confidently is left
**unmatched** and named in the result; **a wrong track is never added**.

**In scope:** one new action on the existing Mix screen (`#/mix`,
`src/ui/Mix.tsx`); adding `playlist-modify-private` to the requested scopes and a
one-time re-login to grant it; a pure match rule plus a per-row Search fetch
(`src/features/mix/spotifySearch.ts`); a create+add runner
(`src/features/mix/createPlaylist.ts`); a thin `startCreatePlaylist` wrapper and
a `CreatePlaylistState` signal in `src/model/state.ts`; a `post` method on the
Spotify client; two optional fields on `MixRow`.

**Out of scope, stated so it is not re-litigated:** adding to an existing
playlist; editing/reordering/removing tracks after creation; public playlists;
cover images; any audio (the app never fetches or analyses mix audio — that line
holds here too); a second app setting; a new dependency; a new route or tab.

## 2. Scope and the one-time re-login

### The scope

`src/auth/session.ts:12` requests `SCOPES = 'user-top-read
playlist-read-private'`. Creating a **private** playlist needs
**`playlist-modify-private`** added:

```ts
// session.ts
export const SCOPES =
  'user-top-read playlist-read-private playlist-modify-private';
```

The scope Spotify actually granted is stored on `Session.scope`
(`session.ts:22`), a space-separated string set from the token response
(`completeLogin`/`doRefresh`). **Existing logged-in sessions do not carry the new
scope** — a refresh returns the scope the *original* grant had — so the owner
must authorise once more. Everyone stays logged in until they do; only playlist
creation is gated.

### The pure check

```ts
// spotifySearch.ts (pure, unit-tested)
export function canCreatePlaylists(session: Session | null): boolean {
  return (
    session !== null &&
    session.scope.split(' ').includes('playlist-modify-private')
  );
}
```

`.split(' ').includes(...)` and not `String.includes`, so a hypothetical scope
that merely *contains* the substring can never satisfy it.

### The re-login flow and its copy

The **"Create playlist from mix"** button is shown whenever the open mix has at
least one identified row (see §5; note there is *always* a session inside
`Mix.tsx` — `app.tsx` renders `<Connect/>` when `!auth.session.value` — so
"a session" is not part of the button condition; the real gate is
`canCreatePlaylists`).

When the owner taps it **without** the scope, `startCreatePlaylist`:

1. **Saves the mix first** (`putMix` + `loadSavedMixes`). This is essential:
   `auth.beginLogin()` navigates the whole page (`browser.ts:8`,
   `navigate: (url) => location.assign(url)`), so every signal re-initialises on
   return — an **unsaved** looked-up tracklist would be lost. Saving it now means
   one tap reopens it from the saved-mixes list after re-login, and the button
   then works. A rejected save surfaces through the existing `mixError` channel;
   the flow stops.
2. Sets `createPlaylistState.value = { status: 'needScope' }`.

The screen then renders, below the button, a one-line prompt and a
Connect-again control:

- Prompt: **"This app cannot create playlists yet — connect again to allow it.
  Your saved mixes stay on this phone."**
- Button: **"Connect again to allow playlists"** → calls **`auth.logout()`**,
  exactly the existing Settings "Connect again" path (`Settings.tsx`, the
  `onClick={() => auth.logout()}` button). `logout()` clears the session signal,
  so `app.tsx` re-renders `<Connect/>`; the owner taps **"Connect Spotify"**
  (`Connect.tsx`, `auth.beginLogin()`), which now requests the widened `SCOPES`.

After Spotify returns and the app boots, the mix is reopened from the saved list;
`canCreatePlaylists` is now true and the button creates the playlist. The
`needScope` state does **not** need a manual reset — the full-page navigation of
`beginLogin` re-initialises `createPlaylistState` to `{ status: 'idle' }` on its
own; say so, so no reset code is written for it.

**Never on load.** Nothing here runs at boot: the scope check, the save, the
prompt and the creation all hang off the button tap, matching the app-wide rule
(`startMixLookup`/`startSync` never run on load).

## 3. Track resolution — `src/features/mix/spotifySearch.ts` (pure + a fetch)

### Which rows

Only **identified** rows are resolved. A gap row, an empty row, or an `ID` /
`unknown` placeholder is skipped. `Mix.tsx` already encodes this as a private
`isInert` predicate over `INERT = new Set(['', 'id', 'unknown'])` and
`normalize`. Lift the positive form into this module and share it:

```ts
export const INERT = new Set(['', 'id', 'unknown']);
export function isIdentified(row: TracklistRow): boolean {
  return (
    !row.gap &&
    !INERT.has(normalize(row.artist)) &&
    !INERT.has(normalize(row.title))
  );
}
```

`Mix.tsx`'s existing `isInert` becomes `(r) => !isIdentified(r)` (or imports and
negates it); the button visibility (§5) uses `mixRows.value.some(isIdentified)`.
`normalize` narrows `?` to `''`, so a `?` row is inert too — the same behaviour
the Mix screen already relies on.

### The query — built from the RAW text, not the normalised text

The Search query must **not** be built with `cleanTitle`: that function
lowercases and flattens every non-letter/number to a space and strips diacritics
(via `normalize`) — right for *comparing* results, lossy for a quoted
`track:"…"` filter. `primaryArtist` **is** safe — it returns the raw first
credited segment untouched. The strip-only regexes (`FEAT_GROUP`,
`GENERIC_GROUP`, …) are **module-private** in `rekordbox-match.ts` and not
exported, so they are not reused here. Rule, stated once:

- **Primary (field) query:**
  `artist:"<primaryArtist(row.artist)>" track:"<row.title>"`, with any `"`
  stripped from each value first so it cannot break the filter. `primaryArtist`
  is imported from `rekordbox-match.ts`; the title is the row's **raw** title
  (so a remix tail like `(Ted Remix)` is kept — it changes which recording we
  want).
- **Fallback (plain) query:** `<row.artist> <row.title>` — no field filters, for
  the case where Spotify's field parser is too strict for how the row is spelled.

Both are `GET /search?q=<query>&type=track&limit=5` — Search needs only a bearer
token (no extra scope; research line ~58). `limit=5` is within the max of 10.

### The match rule (precise; never adds a wrong track)

`pickMatch(row, items)` returns the **first** item that passes, else `null`. For
a candidate item, compute with the app's existing helpers:

- `rowArtist = normalize(primaryArtist(row.artist))`
- `rowTitle = cleanTitle(row.title)`
- `candTitle = cleanTitle(item.name)`

An item passes when **both** hold:

- **Artist** — checked against **every** `item.artists[].name` (Spotify's
  primary artist on a collab is often not the one a mix credits): some artist `a`
  satisfies `normalize(a) === rowArtist`, or one contains the other
  (`normalize(a).includes(rowArtist)` or `rowArtist.includes(normalize(a))`).
- **Title** — **equality or prefix only**: `candTitle === rowTitle` **or**
  `candTitle.startsWith(rowTitle)`. Free substring is deliberately **not** used
  — a two-word row title would match almost anything, violating "never add a
  wrong track." Prefix still handles the remix case (`losing it` is a prefix of
  `losing it ted remix`). The reverse direction is **not** allowed: a row that
  asks for `losing it ted remix` must not accept a bare `losing it`.

An item is also rejected unless it is a real track — `item.uri` starts with
`spotify:track:` and `item.id !== null` (skips episodes and `spotify:local:`
results, which cannot be added by URI).

### The per-row fetch

```ts
export interface RowMatch {
  row: TracklistRow;
  uri: string | null;        // null = unmatched
  matchedName: string | null;
}

export async function searchTrack(
  client: Pick<SpotifyClient, 'get'>,
  row: TracklistRow
): Promise<RowMatch>;
```

`searchTrack` runs the field query, applies `pickMatch`; on `null` runs the plain
query and applies `pickMatch` again; if still nothing, returns
`{ row, uri: null, matchedName: null }`. It uses the shared `api` client's
`get`, so it is serialised and rate-limited with everything else (§4). It reads
`ApiSearchTracks` — a new type in `spotify/types.ts`:

```ts
export interface ApiSearchTracks {
  tracks: ApiPage<ApiTrack>; // tracks.items[] of ApiTrack (already defined)
}
```

`ApiTrack` already carries `uri`, `id`, `name`, `artists[].name` and
`external_urls.spotify` (`spotify/types.ts`).

### §3 test cases (mocked fetch)

1. **Exact hit** — field query returns the right track first → its `uri`.
2. **Artist mismatch rejected** — same title, wrong artist across all
   `artists[]` → not accepted; falls through to plain; still wrong → `uri: null`.
3. **Remix title** — row `Artist – Losing It (Ted Remix)`; result
   `Losing It (Ted Remix)` accepted by prefix; a bare `Losing It` result is
   **rejected**.
4. **Collab** — mix credits the featured artist; the result lists them in
   `artists[]` but not at `[0]` → accepted (all-artists rule).
5. **ID / gap / empty row** — `isIdentified` is false → not searched at all
   (asserted by zero fetch calls for those rows in §4's runner test).
6. **Zero results** — both queries return `tracks.items: []` → `uri: null`,
   `matchedName: null`.
7. **Fallback used** — field query empty, plain query hits → accepted.
8. **Local/episode result** — a `spotify:local:` or episode top result is
   skipped even if the text matches.

## 4. The job — `createPlaylist.ts` runner + `state.ts` wrapper

### File split (so it is unit-testable)

Follow the codebase's own precedent: `reachCoverage` was moved to
`model/reach.ts` because importing `state.ts` under Vitest pulls in
`auth/browser.ts`, which touches `localStorage` at module scope
(`state.ts:426-431`). So:

- **`spotifySearch.ts`** — `canCreatePlaylists`, `isIdentified`, `pickMatch`
  (pure) and `searchTrack` (per-row fetch). Unit-tested.
- **`createPlaylist.ts`** — `runCreatePlaylist`: resolve every identified row →
  create the playlist → add the matched URIs in batches, driving `onState`.
  Unit-tested with a mocked client.
- **`state.ts`** — `startCreatePlaylist`: the browser wiring only (claim state,
  read the open mix, call the runner, persist, `loadSavedMixes`). Not
  unit-tested (it imports the browser singletons), verified by build + a
  walkthrough (§7), exactly as the other `start*` functions are.

### The state union

```ts
// state.ts
export interface UnmatchedRow {
  artist: string;
  title: string;
}

export type CreatePlaylistState =
  | { status: 'idle' }
  | { status: 'needScope' }                                   // §2
  | { status: 'resolving'; done: number; total: number }      // Search
  | { status: 'creating' }                                    // POST /me/playlists
  | { status: 'adding' }                                      // POST .../items
  | {
      status: 'done';
      name: string;
      url: string | null;          // playlist external_urls.spotify
      added: number;               // matched + added (M)
      total: number;               // identified rows attempted (N)
      unmatched: UnmatchedRow[];
    }
  | {
      status: 'error';
      message: string;
      url?: string | null;         // set when the playlist WAS created before the failure
      added?: number;              // tracks added before the failure
    };

export const createPlaylistState = signal<CreatePlaylistState>({
  status: 'idle',
});
```

`needScope` is an added arm the brief's sketch did not list; it keeps the whole
flow in one signal and matches the brief's plain reading (button visible, tap
reveals the prompt). It does **not** count as "running" anywhere.

### `jobsBusy()` — decision: NOT joined

`startCreatePlaylist` writes **no** library store and rebuilds **no** model — it
`putMix`es one row and calls `loadSavedMixes` (like `startMixLookup`/`saveMix`),
never `loadFromDb`. So it cannot clobber another job's model rebuild, and the
rationale `jobsBusy` records (`state.ts:280-295`) does not apply to it. It stays
**out of `jobsBusy()`**, exactly as `startMixLookup` does and for the same stated
reason. Re-entry is prevented on its own state instead: a second tap is ignored
while `createPlaylistState.status` is `resolving`/`creating`/`adding` (claimed
synchronously — see below). Its Search/create/add calls share the one `api`
client, so if a sync is running they simply queue behind it (one request in
flight, `client.ts:71-78`); no explicit cross-gating is needed or added.

### The client `post` method — and non-idempotent retry safety

`spotify/client.ts` today does GET only. Add `post` that reuses the same
`enqueue`/401-refresh/429 machinery. **But POST is not idempotent**, so the
retry policy must change for it:

```ts
export interface SpotifyClient {
  get<T>(path: string, query?: Query): Promise<T>;
  post<T>(path: string, body: unknown, query?: Query): Promise<T>;
  pages<T>(...): AsyncGenerator<ApiPage<T>, void, undefined>;
}
```

`request<T>(url)` becomes `request<T>(url, init?: { method?: string; body?: string })`:

- `deps.fetchFn(url, { method: init?.method ?? 'GET', headers, body: init?.body })`.
- `headers` always carries `Authorization: Bearer <token>`; add
  `'Content-Type': 'application/json'` **only** when `init?.body` is present.
- `get` → `enqueue(() => request<T>(buildUrl(path, query)))` (unchanged).
- `post` → `enqueue(() => request<T>(buildUrl(path, query), { method: 'POST', body: JSON.stringify(body) }))`.

**Retry rules, POST vs GET:**

- **401 → refresh once and retry** — kept for POST. A 401 rejects the request
  *before* any mutation, so resending the same body with a fresh token is safe.
- **429 with a short `Retry-After` → wait and retry** — kept for POST. A 429 is a
  pre-processing throttle; the write never happened, so retrying is safe.
- **429 with a long `Retry-After`, or `reason: QUOTA_EXCEEDED` → `QuotaError`** —
  kept (see the quota note below).
- **Network error (the `catch` branch) and 5xx → for POST, throw immediately; do
  NOT retry.** This is the one genuinely dangerous interaction: a retried
  `POST /me/playlists` after the server already created the playlist would make a
  **second** private playlist the app cannot detect, and a retried add would
  **duplicate** tracks. GET keeps its existing 5xx/network backoff (`MAX_5XX_RETRIES`).
  Implement by branching on `init?.method === 'POST'` (or an `idempotent` flag) in
  the two retry branches. Record the rationale in a code comment.

Both POST endpoints return a JSON body on success (`res.ok` → `res.json()`), so
the existing success path works unchanged; note that `post` assumes a JSON 2xx
body (a future 204 endpoint would need care — out of scope).

**Quota note.** A `QuotaError` raised by a Search or a write bubbles up through
`startCreatePlaylist` and is shown **inline on the Mix screen** (§5). It does
**not** write `SYNC_STATE_META`, so it can never park the Settings sync card in
its `locked` state — the playlist-read quota lock-out machinery
(`sync/runner.ts`) is untouched by this feature.

### The runner

```ts
export interface CreatePlaylistDeps {
  client: Pick<SpotifyClient, 'get' | 'post'>;
  onState: (s: CreatePlaylistState) => void;
}
export interface CreatePlaylistInput {
  name: string;         // trimmed, non-empty (see naming below)
  description: string;
  rows: TracklistRow[]; // the mix's working list, in play order
}
export interface CreatePlaylistOutcome {
  playlistId: string | null; // for MixRow persistence by the wrapper
  url: string | null;
}

export async function runCreatePlaylist(
  deps: CreatePlaylistDeps,
  input: CreatePlaylistInput
): Promise<CreatePlaylistOutcome>;
```

`runCreatePlaylist` never throws; it drives `onState` (including the final
`done`/`error`) and returns `{ playlistId, url }` so the wrapper can persist them
(the state union carries `url` but not the id, and the wrapper needs the id).
Steps:

1. **Resolve.** `total = rows.filter(isIdentified).length`. `onState({ status:
   'resolving', done: 0, total })`. For each identified row **in order** (skip
   inert rows silently), `await searchTrack(client, row)`, then
   `onState({ status: 'resolving', done: ++i, total })`. Collect matched
   `{ uri, name }` (order preserved) and `unmatched: UnmatchedRow[]` (the
   `{ artist, title }` of rows that returned `uri: null`). Any error from Search
   (a `QuotaError`, an `ApiError`, an auth failure) → `onState({ status:
   'error', message })` and return `{ playlistId: null, url: null }` — no
   playlist was created, so there is nothing to link.
2. **Create.** `onState({ status: 'creating' })`.
   `POST /me/playlists` with body `{ name, public: false, description }` →
   `ApiPlaylist` (new type: `{ id: string; name: string; external_urls?: {
   spotify?: string } }`). On failure (403 insufficient-scope, 401 that cannot
   refresh, network, 5xx) → `onState({ status: 'error', message })`, return
   `{ playlistId: null, url: null }`.
3. **Add.** `const uris = matched.map(m => m.uri)`. If `uris.length === 0`, skip
   straight to done (an empty private playlist is still created — the owner asked
   for it; the result says "0 of N"). Otherwise `onState({ status: 'adding' })`
   and `POST /playlists/{id}/items` with `{ uris: batch }` for each batch of
   **≤100**, sequentially, **preserving order**. On a batch failure → `onState({
   status: 'error', message, url, added })` where `url` is the created playlist
   URL and `added` is the count from the batches that **did** succeed — the
   playlist exists, so its link and progress are surfaced, never swallowed —
   and return `{ playlistId, url }` (so the wrapper still persists the link).
4. **Done.** `onState({ status: 'done', name, url, added: uris.length, total,
   unmatched })`; return `{ playlistId, url }`.

**The add endpoint path.** The add call is
**`POST /playlists/{playlist_id}/items`** — the `/items` spelling shipped.
`/tracks` is the deprecated spelling; `/items` is the current one, the same
February-2026 modernisation `spotify/types.ts` already documents on
`ApiPlaylistItem` (the `track` legacy → `item` current field rename). A 404 from
this call would arrive _after_ the playlist exists (step 3), so it surfaces
inline **with** the playlist link and the added count (never swallowed); the
strict match rule and the inline reporting hold either way.

### The wrapper `startCreatePlaylist` (in `state.ts`)

```ts
export async function startCreatePlaylist(): Promise<void>;
```

1. Guard re-entry: if `createPlaylistState.status` is `resolving`/`creating`/
   `adding`, return.
2. Require an open, ready mix: `if (mixState.value.status !== 'ready') return`.
   `const view = mixState.value.view; const rows = mixRows.value;`
3. **Scope gate.** If `!canCreatePlaylists(auth.session.value)`: `await saveMix()`
   (so the mix survives the re-login navigation — §2); if that returned false the
   `mixError` is already shown, so return; else
   `createPlaylistState.value = { status: 'needScope' }`; return.
4. Claim state synchronously (as `startSync`/`startMixLookup` do, with the
   `as CreatePlaylistState` cast the codebase uses to hold the union type):
   `createPlaylistState.value = { status: 'resolving', done: 0, total: 0 } as CreatePlaylistState;`.
5. Build the name and description (below), call `runCreatePlaylist({ client: api,
   onState: (s) => { createPlaylistState.value = s; } }, { name, description, rows })`.
6. **Persist.** If the returned `playlistId !== null` (the playlist was created,
   even on a partial add failure), write the mix as a `MixRow` with
   `playlistUrl`/`playlistId` set (mirroring `saveMix`'s row construction, plus
   the two fields, `savedAt: Date.now()`), `await putMix(row)`, set
   `mixState.view.playlistUrl`/`playlistId` so the open screen holds them, and
   `await loadSavedMixes()`. A rejected `putMix` shows via
   `mixError`; the playlist still exists on Spotify and its link is already on
   screen from `createPlaylistState.done/error`, so nothing is lost.

**Naming.** `name = (view.title ?? 'Mix tracklist')`, trimmed. `view.title` is
the oEmbed title **verbatim**, which already ends "… by \<author\>" (the
mix-tracklist spec measured `"Naone @ The Lot Radio 01-11-2025 by The Lot
Radio"`). **Keep it verbatim** — it is the mix's own public title and reads well
as a playlist name; do not strip the tail. Defensive trim only: slice `name` to
**≤ 100** characters and `description` to **≤ 300** (these are *defensive* caps,
not documented limits — this spec did not probe Spotify's exact maxima; they are
generous and avoid a rejected write). `description = 'From ' + view.url + ' ·
via DJ Data'`, then trimmed to the cap. "DJ Data" matches the app's own name
(`Settings.tsx` footer `DJ Data v…`).

### `MixRow` / `MixView` — two optional fields, no `DB_VERSION` bump

The `mixes` store holds `MixRow` values by `keyPath: 'url'`; adding an
**optional** field needs **no schema migration and no `DB_VERSION` bump** — old
rows simply lack it and read back `undefined` (the same pattern `PlayRow`'s
optional `months`/`attempts`/… fields use, `schema.ts`). Add:

```ts
// schema.ts, on MixRow:
  /** external_urls.spotify of the playlist last created for this mix, or absent. */
  playlistUrl?: string;
  /** Spotify id of that playlist, or absent. Kept for provenance/debugging. */
  playlistId?: string;
```

Thread it through **every** touch point (enumerated so none is missed):

- **`MixView`** (`state.ts`) gains optional `playlistUrl?: string` **and**
  `playlistId?: string` — both, so that `playlistId` (the only durable handle on
  the created playlist) is never dropped by a later plain Save. They travel
  together everywhere the view does.
- **`openMix`** copies `row.playlistUrl` **and** `row.playlistId` into the
  rebuilt view (so a reopened mix shows the "Playlist created ›" link and still
  holds the id).
- **`saveMix`** **carries both `view.playlistUrl` and `view.playlistId`
  through** into the row it writes — otherwise an ordinary Save after a create
  would wipe the link and the id. This is a one-line change (the two fields are
  already on the view), so there is no "may drop `playlistId`" case: a plain Save
  round-trips both.
- **`startCreatePlaylist`** sets both on the view and writes both.
- **`closeMix`** already resets `mixState`/`mixRows`/`mixError`; add
  `createPlaylistState.value = { status: 'idle' }`.
- **`disconnect`** resets the other job signals; add
  `createPlaylistState.value = { status: 'idle' }`.

**`savedAt`.** Creating a playlist persists the mix with `savedAt: Date.now()`
(same as `saveMix`), so it sorts to the top of the saved-mixes list — a create is
a deliberate, recent action, so surfacing it first is the expected behaviour and
keeps the code identical to the existing save path.

## 5. Screens — `src/ui/Mix.tsx`

All new UI lives inside the `Ready` view (a mix is open) — the create action has
no meaning on the idle saved-mixes list. It sits after the `<Tracklist />`,
before `<PasteBox />` (a natural "now that the list is right, make the
playlist" position). Phone-first: every control is a full-width, ≥44px tap
target, reusing the existing `.actions`/`.primary`/`.muted`/`.error` styles and
the `Progress` and `SpotifyLink` components.

Read `const cs = createPlaylistState.value;` and
`const identified = mixRows.value.some(isIdentified);`.

**The button** (shown only when `identified` is true):

```
[ Create playlist from mix ]        ← class "primary"; label exactly this
```

- Disabled while `cs.status` is `resolving` / `creating` / `adding`; label then
  reads **"Creating playlist…"**. (`needScope`, `done`, `error`, `idle` leave it
  enabled — a second tap makes another new playlist, per the owner ruling.)
- `onClick={() => void startCreatePlaylist()}`.

**Not-authorised prompt** — rendered when `cs.status === 'needScope'`, directly
under the button:

```
This app cannot create playlists yet — connect again to allow it.
Your saved mixes stay on this phone.
[ Connect again to allow playlists ]     ← onClick={() => auth.logout()}
```

**Progress** — while resolving/creating/adding, one `Progress`:

- `resolving`: `<Progress label="Matching tracks" done={cs.done} total={cs.total} unit="tracks" />` (renders "Matching tracks" + "N / M tracks", i.e. the brief's "Matching N of M…").
- `creating`: `<p class="muted">Creating the playlist…</p>`.
- `adding`: `<p class="muted">Adding tracks…</p>`.

**Result** — when `cs.status === 'done'`:

```
Created ‘<name>’ — 17 of 20 tracks · Open in Spotify ›
```

`‘<name>’` is `cs.name`; "17 of 20" is `cs.added` of `cs.total`; the link is a
`SpotifyLink` (icon) or the spelled-out `Open in Spotify` to `cs.url` (when
`cs.url` is non-null). When `cs.unmatched.length > 0`, a collapsible
`<details>`:

```
<details>
  <summary>{cs.unmatched.length} not found</summary>
  <ul class="list">
    <li> <Artist> – <Title> </li>   // one per unmatched row, in mix order
  </ul>
</details>
```

The summary is literally `<summary>{cs.unmatched.length} not found</summary>`
(e.g. "3 not found") — no `plural` call, so the wording is fixed here; each item
is `${row.artist} – ${row.title}`.

**Error** — when `cs.status === 'error'`:

```
<p class="error">Could not create the playlist: {cs.message}</p>
```

and, when `cs.url` is set (the playlist was created before an add batch failed),
also show the "Playlist created · Open in Spotify ›" link and, if `cs.added` is
set, `Added {cs.added} of {total} before the error.` — the link and partial
progress are never swallowed.

**Post-creation link (durable)** — the reopen/idle affordance. Shown when the
open mix has a stored URL (`view.playlistUrl` set, e.g. after reopen) **and**
there is no fresh result on screen — i.e. only when `cs.status` is `idle` or
`needScope`. While `cs.status` is `done` or `error`, that result already carries
the same link, so the durable line is suppressed to avoid two identical Spotify
links stacked on the phone.

```
Playlist created · Open in Spotify ›     ← SpotifyLink to view.playlistUrl
```

So a reopened mix that already has a playlist shows the link, the button still
reads **"Create playlist from mix"** (never relabelled), and tapping it makes
another new playlist. This is the owner ruling (§ decision 4), and it
**supersedes** the earlier brief's "the button becomes Update / recreate".

## 6. Components and styles

- **Reuse** `Progress` (resolving), `SpotifyLink` (the result and durable
  links — icon in a row, or `label` for the spelled-out header form), and the
  inline `.error` / `.muted` patterns. No banner: the Mix screen has none, and
  every create failure is shown inline through `createPlaylistState`
  (`mixError` remains only for `putMix`/`getMixes` storage failures).
- **New CSS:** essentially none. `<details>/<summary>` for the "not found" list
  needs only a small `summary { cursor: pointer }` and list reset if the app's
  base styles do not already cover it; reuse `.list` for the unmatched rows. No
  new component file is required — the additions are a handful of elements inside
  `Ready`.

## 7. Tests

Every test **mocks fetch or the client**; none ever calls real Spotify.

- **`spotifySearch.test.ts`**
  - `canCreatePlaylists`: true only when `scope` contains the exact token; false
    for `null`, for a session without it, and for a scope that merely contains
    the substring (e.g. `playlist-modify-private-xyz` is rejected by the
    split-on-space check).
  - `pickMatch` (pure, with `ApiTrack[]` fixtures): the §3 cases — exact hit;
    artist mismatch across all `artists[]` rejected; remix prefix accepted and
    the bare-title result rejected; collab where the credited artist is not at
    `[0]`; zero items → null; local/episode result skipped.
  - `searchTrack` (mocked `get`): field-query hit; field empty → plain fallback
    hit; both empty → `uri: null`; asserts the query strings are built from raw
    `primaryArtist`/title (quotes stripped), and that `limit=5&type=track` is
    sent.
- **`createPlaylist.test.ts`** (mocked `client` with `get`/`post` spies):
  - Resolution progress: `onState` fires `resolving` with rising `done`, `total`
    equal to the identified-row count; inert rows (gap/`ID`/empty) are **not**
    searched (zero `get` calls for them) and preserve order.
  - Unmatched collection: rows that resolve to `null` appear in `unmatched` in
    mix order and are absent from the add batches.
  - **Batching + order**: 250 matched URIs → three `POST .../items` calls of
    100 / 100 / 50, URIs in mix order across the batches; 0 matched → no add
    call, playlist still created, `done` says "0 of N".
  - Create body: `POST /me/playlists` sends `{ name, public: false, description }`.
  - Partial failure: add batch 2 rejects → `error` state carries `url` and the
    `added` count from batch 1; the outcome still returns `playlistId`/`url`.
  - Search failure before create → `error`, no `post` calls.
- **`client.test.ts`** (extend the existing file's `setup`):
  - `post` sends `method: 'POST'`, `Content-Type: application/json`,
    `body: JSON.stringify(body)`, the bearer header, and the built URL; returns
    parsed JSON.
  - POST refreshes once on 401 and **resends the body** with the fresh token.
  - POST retries a 429 with a short `Retry-After` (asserts a second call with the
    same body), and raises `QuotaError` on a long `Retry-After`.
  - **POST does not retry** a 5xx or a network error (asserts exactly one call
    and an immediate throw) — the non-idempotency guard; contrast with GET, whose
    existing 5xx/network retry tests stay green.
- **`state.ts`** has **no** unit tests (it imports the browser singletons, the
  same reason the other `start*` functions are untested). Verified by
  `yarn typecheck` + `yarn build` + a manual walkthrough: connect without the
  scope → tap Create → prompt → Connect again → grant → reopen mix → Create →
  progress → result with the Spotify link and the "not found" list; reopen the
  saved mix → the durable "Playlist created ›" link shows and the button still
  reads "Create playlist from mix".

## 8. Policy notes

- **Scope and the one-time re-login.** The app adds `playlist-modify-private` to
  its requested scopes. Existing sessions keep working for everything else; a
  refresh cannot widen an old grant, so the owner authorises **once more**
  (Connect again → Connect Spotify) before the first playlist can be created.
  The mix is saved before that navigation so it is not lost.
- **Only the owner's own library is touched.** Every write is to the owner's own
  account under a bearer token they granted: `POST /me/playlists` creates a
  playlist they own; `POST /playlists/{id}/items` adds to that same new playlist.
  Nothing touches anyone else's data, and the playlist is **private**.
- **Best-effort match; a wrong track is never added.** Resolution is by Search
  with a strict accept rule (artist across all credited names; title equality or
  prefix; real `spotify:track:` URIs only). A row that does not pass is left
  **unmatched** and named in the result — the app never guesses a track onto the
  playlist.
- **Endpoints used.** `GET /search?q=&type=track&limit=5` (bearer only, survives
  the Feb-2026 changes); `POST /me/playlists { name, public:false, description }`
  (`playlist-modify-private`); `POST /playlists/{id}/items { uris }` batches of
  ≤100. The `/items` spelling shipped (`/tracks` is the deprecated one), the
  same Feb-2026 modernisation `spotify/types.ts` documents on `ApiPlaylistItem`.
- **Non-idempotent writes are protected.** POST is never retried on a network
  error or 5xx, so a mid-flight failure can never silently create a duplicate
  playlist or duplicate tracks; it surfaces inline instead (with the playlist
  link if the playlist already exists).
- **Every failure is shown.** A 403 insufficient-scope, a 401 that cannot
  refresh, a network error, a create failure, an add-batch failure and a
  `QuotaError` all land in `createPlaylistState`'s `error`/`needScope` arms and
  are rendered inline on the Mix screen. A `QuotaError` here does not affect the
  Settings sync card's lock state.
- **No audio anywhere.** This feature reads and writes only text and track URIs;
  it never fetches or analyses mix audio — the app's standing line holds.

---

### Open points and the assumptions taken

1. **Add-tracks path (`items` vs `tracks`) — resolved.** The add call shipped as
   `POST /playlists/{playlist_id}/items`. `/items` is current and `/tracks` the
   deprecated spelling, corroborated by the Feb-2026 `item`/`track` field rename
   `spotify/types.ts` documents on `ApiPlaylistItem` (and by `ApiPlaylistSummary`
   carrying both `items` and `tracks` totals). §4 and §8 above are settled to
   `/items`; nothing here is left to confirm.
2. **Playlist name/description caps (100 / 300).** Spotify's exact maxima were
   **not** probed. **Assumption:** these generous defensive trims avoid a
   rejected write without truncating real titles; adjust at implementation only
   if a write is rejected for length.
