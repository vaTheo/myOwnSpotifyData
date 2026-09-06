# Create a Spotify Playlist from a Mix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one action to the existing Mix screen (`#/mix`): from a mix's **identified** rows, one deliberate tap creates a **private** Spotify playlist of the tracks Spotify's Search can match with confidence, and honestly reports the ones it could not — a wrong track is never added.

**Architecture:** Four foundations first — the widened OAuth scope (`playlist-modify-private`), a pure `canCreatePlaylists` gate, two optional `MixRow` fields (no `DB_VERSION` bump), and a non-idempotent `post` on the Spotify client that is **never** retried on a 5xx or a network error. On top of them, a pure match layer plus a per-row Search fetch (`spotifySearch.ts`), a create+add runner (`createPlaylist.ts`) driving a `CreatePlaylistState` signal, a thin `startCreatePlaylist` wrapper in `state.ts`, and the screen additions in `Mix.tsx`. The create job is **not** part of `jobsBusy()`; it writes one mix row and rebuilds no model, so it clobbers nothing and guards its own re-entry.

**Tech Stack:** Unchanged. TypeScript `~6.0.3` (`moduleResolution: bundler`, `verbatimModuleSyntax`), Vite 8, Preact 10 + @preact/signals, idb 8, Vitest 5 + fake-indexeddb 6, ESLint 10 flat config, yarn classic 1.22, Node 24, GitHub Pages via Actions. **No new dependency:** the Search read and the two writes are plain `fetch` through the existing client.

**Spec:** `docs/superpowers/specs/2026-09-06-mix-playlist-design.md` (authority). §2 scope + one-time re-login, §3 track resolution, §4 the runner + state + client `post`, §5 screens with exact copy, §6 components/styles, §7 tests, §8 policy. It builds on the shipped Mix tracklist feature (`docs/superpowers/specs/2026-09-06-mix-tracklist-design.md`) and the platform research `docs/superpowers/research/2026-09-04-spotify-platform-research.md` (Search survives the Feb-2026 changes). This plan was assembled from five task drafts and **proved green end to end** against a fresh copy of `feat/mix-playlist` `4e8d649`: every task was applied in order and `yarn typecheck && yarn lint && yarn test && yarn build` run after each; the measured cumulative counts are pinned in each task's Expected lines. Where drafts disagreed the spec won; where the spec was silent, the choice is recorded in **Decisions** below and, for deviations, in **spec_conflicts**.

## Global Constraints

- Node 24 (`.nvmrc`), yarn classic 1.22. Install with `yarn`. Never `npm install`.
- `typescript` pinned `~6.0.3`. Do not upgrade: `typescript-eslint` 8 supports TS `<6.1` only.
- `vite` stays an explicit devDependency (Vitest peer, and used directly by the build).
- **No new dependency.** Nothing in this plan adds one, and nothing in it may.
- ESM everywhere. With `moduleResolution: bundler`, relative imports carry **no** `.js`/`.ts` extension. Vite compiles JSX itself (`jsx: react-jsx`, `jsxImportSource: preact`); there is no framework plugin. Preact uses `class=`, never `className`.
- `verbatimModuleSyntax` is on: a type-only import must use `import type`; it is erased from the emitted module. `createPlaylist.ts` imports the state union `import type` so it never evaluates `state.ts` (and its `auth/browser` `localStorage` touch) under Vitest.
- Prettier: single quotes, semicolons, ES5 trailing commas, 80 columns. **Every code block in this plan is already Prettier output** (verified with `prettier --check` on the applied `.ts`/`.tsx`/`.md` files). `prettier --check` is **not** part of the gate (`yarn format` is not CI-enforced — CLAUDE.md). Note: `src/styles.css` carries a **pre-existing** non-conformance on its font-stack line (`'Segoe UI'`) that predates this feature — the CSS block this plan appends is clean, but a bare `prettier --check src/styles.css` fails on that old line, so it is not asserted.
- ESLint 10's `preserve-caught-error` is on: a `throw` inside a `catch` must pass `{ cause: err }`. No module here rethrows — the client returns/throws its own `ApiError`/`QuotaError` (as it already does, uncaught-cause, at `client.ts:97`), and `createPlaylist.ts`/`state.ts` map each caught error to a state string via `describeError`. The POST network branch throws `new ApiError(0, …)` with no `cause`, identical in shape to the committed GET branch — it lints clean.
- `@typescript-eslint/no-unused-vars` runs with the default `args: 'after-used'` and **no** `argsIgnorePattern`: an unused parameter that precedes a used one is fine (`_path` before a used `query`), but a trailing unused parameter is flagged even when `_`-prefixed. This dictates the two mock shapes below (the runner-test `post` stub takes zero args; the createPlaylist-test `get` mock names `_path` before the used `query`).
- Tests sit next to their source as `src/**/*.test.ts` and run in Vitest's **Node** environment. **Screens have no unit tests** (spec §7); `src/model/state.ts` cannot be unit-tested (importing it under Vitest pulls in `src/auth/browser.ts`, which touches `localStorage` at module scope), so its additions are proven by the gate plus the browser walkthrough.
- **Mocked `fetch` / mocked client only.** No test in this plan may reach real Spotify.
- Before every commit: `yarn typecheck && yarn lint && yarn test` must pass. `yarn build` is run at the end of every task (with `VITE_SPOTIFY_CLIENT_ID` set) and passes.
- Only the Client ID is configuration: `VITE_SPOTIFY_CLIENT_ID`. Never reference a client secret anywhere.
- Dev is opened at `http://127.0.0.1:5173/myOwnSpotifyData/`, never `localhost`; Spotify refuses `localhost` as a redirect URI. The app is designed at **390 px** wide; every tap target is ≥44 px.
- **Nothing here ever runs on page load.** The scope check, the save, the `needScope` prompt and the create all hang off the button tap, matching the app-wide rule (`startMixLookup`/`startSync` never run on load).
- **The button `Create playlist from mix` fires only on a deliberate tap and is never relabelled.** A second tap makes **another** new playlist (owner ruling §decision 4); it never becomes "Update/recreate".
- **A wrong track is NEVER added.** A row Spotify cannot match confidently is left **unmatched** and named in the result; the accept rule is artist across all credited names + title equality-or-prefix + a real `spotify:track:` URI.
- **POST is not retried on a 5xx or a network error** (non-idempotent): a retried create could make a second undetectable playlist and a retried add would duplicate tracks. Only 401-refresh-once and a short 429 are retried. `get` keeps its `MAX_5XX_RETRIES` backoff.
- **The create-playlist job stays OUT of `jobsBusy()`** and never calls `loadFromDb()`: it writes only the one mix row (`putMix` + `loadSavedMixes`) and rebuilds no `Model`. Re-entry is guarded on `createPlaylistState.status` (ignored while `resolving`/`creating`/`adding`).
- **`MixRow` gains two optional fields with NO `DB_VERSION` bump** — `DB_VERSION` stays `4`. Old rows read the fields back `undefined`, the `PlayRow.months`/`attempts` precedent.
- **Every failure is shown inline on the Mix screen** through `createPlaylistState`'s `error`/`needScope` arms; the Mix screen raises **no** banner (`mixError` remains only for `putMix`/`getMixes` storage failures). A create-time `QuotaError` does not write `SYNC_STATE_META`, so it never parks the Settings sync card in `locked`.
- **No audio anywhere.** This feature reads and writes only text and track URIs.
- Commit messages: conventional prefix (`feat:`, `docs:`), ending with
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu`.
- Do not push. The owner pushes.

## Decisions

Where two drafts disagreed the spec won; where the spec is silent, the decision is recorded here. **The task that creates a module owns its signature.**

1. **Task order is `scope-client → search → runner-state → ui → docs`** (Tasks 1–5). This makes every cumulative test/build total deterministic, so each task's Expected lines carry an **absolute** measured count.
2. **`canCreatePlaylists` lives in `src/features/mix/spotifySearch.ts`**, created by **Task 1** with that one export; Task 2 appends `INERT`/`isIdentified`/`pickMatch`/`RowMatch`/`searchTrack` to the same file. Spec §2's code block heads it `// spotifySearch.ts`, §4's file split lists it there, §7 tests it in `spotifySearch.test.ts`. `state.ts` and `Mix.tsx` import it from `../features/mix/spotifySearch`. There is exactly one exporter.
3. **The one full `SpotifyClient` object literal (`src/sync/runner.test.ts:46`) gets a zero-arg rejecting `post` stub** — `post: () => Promise.reject(new Error('post is unused in these sync tests'))`. Task 1 owns `client.ts` and this edit. A zero-arg arrow (not `_path`, …) because a trailing unused param would fail `no-unused-vars`; the generic member type accepts a zero-arg arrow. This is the complete blast radius of making `post` a required member (verified: `runner.ts` takes a `SpotifyClient` param only; `reachRun.ts` does not reference the type).
4. **`spotify/types.ts` is edited by two tasks:** Task 2 appends `ApiSearchTracks` after `ApiPage<T>`; Task 3 appends `ApiPlaylist` at the end after `ApiProfile`. Independent, non-overlapping.
5. **`CreatePlaylistState`/`UnmatchedRow`/`createPlaylistState` live in `state.ts`** (spec §4 prints them under `// state.ts`), the reverse of the five existing job states. `createPlaylist.ts` imports the union `import type` so it is erased under `verbatimModuleSyntax` and never pulls `auth/browser` into Vitest. The import comment says it MUST stay `import type`.
6. **The add-items path segment is `POST /playlists/{playlist_id}/items`** (`/tracks` is the deprecated spelling). Confirmed against the Web API "Add Items to Playlist" reference and corroborated internally: `spotify/types.ts` already documents the Feb-2026 `track`(legacy)→`item`(current) field rename on `ApiPlaylistItem`, and `ApiPlaylistSummary` carries both `items` and `tracks` totals. A wrong guess would 404 **after** the playlist exists (step 3), surfacing inline with the link and count; the fix is a one-line path swap, not a redesign.
7. **The `error` arm carries no `total`; the screen supplies it** from the render-time `mixRows.value.filter(isIdentified).length`. An add-batch failure happens only after every identified row resolved, so the attempted N equals that count (exact except if the owner edits rows mid-run). No state-task change is required; see spec_conflicts.
8. **The result/durable links use `SpotifyLink label`**, which renders the spelled-out `Open in Spotify` with **no** trailing `›` glyph — §6 mandates reusing `SpotifyLink`, and the `›` in §5's copy is decorative. See spec_conflicts.
9. **The button visibility is `mixRows.value.some(isIdentified)` only — no session check.** Spec §2: `app.tsx` renders `<Connect/>` when `!auth.session.value`, so a session is always present inside `Mix.tsx`; the real gate is the scope, checked on tap inside `startCreatePlaylist`.
10. **Progress copy is split deliberately:** the running **button** reads `Creating playlist…` (no "the"); the **creating-state paragraph** reads `Creating the playlist…` (with "the"), exactly as spec §5 writes them.

## Spec coverage

| Spec section | Task / Step |
| --- | --- |
| §2 scope `playlist-modify-private` | Task 1 Steps 1–5 |
| §2 `canCreatePlaylists` pure check | Task 1 Steps 6–10 |
| §2 re-login flow (`needScope`, save-first, `auth.logout()`) | Task 3 Step 10 (wrapper), Task 4 Step 3 (prompt UI) |
| §3 `isIdentified`/`INERT` | Task 2 Cycle A |
| §3 the query (raw text, quote-strip, field then plain) | Task 2 Cycle B |
| §3 `pickMatch` accept rule (never a wrong track) | Task 2 Cycle A |
| §3 `searchTrack` + `ApiSearchTracks` + `RowMatch` | Task 2 Cycle B |
| §3 test cases 1–8 | Task 2 (pure) + Task 3 (runner zero-fetch) |
| §4 client `post` + non-idempotent retry split | Task 1 Steps 14–19 |
| §4 `jobsBusy()` NOT joined | Task 3 (state surface); Task 4 Note |
| §4 `runCreatePlaylist` resolve→create→add, batching, `onState` | Task 3 Steps 4–9 |
| §4 `ApiPlaylist` | Task 3 Step 3 |
| §4 `CreatePlaylistState` union / `UnmatchedRow` / signal | Task 3 Step 1 |
| §4 `startCreatePlaylist` wrapper + naming/description caps | Task 3 Step 10 |
| §4 `MixRow`/`MixView` two optional fields, no `DB_VERSION` bump; open/save/close/disconnect threading | Task 1 Step 11 (schema) + Task 3 Steps 1b–1f/10 |
| §5 button, `needScope` prompt, progress, result, error, durable link | Task 4 Steps 1–4 |
| §6 reuse `Progress`/`SpotifyLink`, one small disclosure style | Task 4 Steps 3, 5 |
| §7 `spotifySearch.test.ts` | Tasks 1, 2 |
| §7 `createPlaylist.test.ts` | Task 3 |
| §7 `client.test.ts` post cases | Task 1 Step 14 |
| §7 `state.ts` no unit test; walkthrough | Task 4 Step 7 |
| §8 policy notes + items-vs-tracks ruling | Task 5 |

## File Structure

- **Create** `src/features/mix/spotifySearch.ts` (Task 1 seeds `canCreatePlaylists`; Task 2 appends the match+fetch layer) and `src/features/mix/spotifySearch.test.ts`.
- **Create** `src/features/mix/createPlaylist.ts` + `src/features/mix/createPlaylist.test.ts` (Task 3).
- **Modify** `src/auth/session.ts` + `src/auth/session.test.ts` (scope), `src/db/schema.ts` (two optional `MixRow` fields), `src/spotify/client.ts` + `src/spotify/client.test.ts` (`post`), `src/sync/runner.test.ts` (one stub) — Task 1.
- **Modify** `src/spotify/types.ts` — `ApiSearchTracks` (Task 2), `ApiPlaylist` (Task 3).
- **Modify** `src/model/state.ts` — the state surface, the wrapper, the open/save/close/disconnect threading (Task 3).
- **Modify** `src/ui/Mix.tsx` + `src/styles.css` — the screen and one style block (Task 4).
- **Modify** `docs/.../2026-09-06-mix-playlist-design.md`, `README.md`, `CLAUDE.md` — docs (Task 5).

---

## Task 1: Scope, the `canCreatePlaylists` check, `MixRow` fields, and the client `POST`

Lay the four foundations the feature stands on, each independently testable, with no consumer wired yet: the widened OAuth scope (§2), the pure `canCreatePlaylists` gate (§2), the two optional `MixRow` fields (§4, no `DB_VERSION` bump), and a `post` method on the Spotify client whose non-idempotent retry policy is the safety spine of the whole feature (§4).

**Files:**
- Create: `src/features/mix/spotifySearch.ts` — **this task adds only `canCreatePlaylists`.** Task 2 appends `INERT`/`isIdentified`/`pickMatch`/`RowMatch`/`searchTrack` to the same file.
- Create: `src/features/mix/spotifySearch.test.ts` — **this task adds only the `canCreatePlaylists` block** (5 tests). Task 2 appends its describe blocks.
- Modify: `src/auth/session.ts:12` — widen `SCOPES` by one token.
- Modify: `src/auth/session.test.ts` — one added assertion pinning the new exact scope literal. No new test case.
- Modify: `src/db/schema.ts` — add two **optional** fields to `MixRow` between `rows: TracklistRow[];` and `savedAt: number;`. `DB_VERSION` stays `4`; no migration; `AllRows`/`DjDb` untouched.
- Modify: `src/spotify/client.ts` — add `post<T>` to the `SpotifyClient` interface and the `createClient` return; give `request<T>` an `init?: { method?; body? }` param and a POST-vs-GET retry split.
- Modify: `src/spotify/client.test.ts` — a new `describe('post', …)` block (6 tests) plus one assertion in the existing GET test that a GET carries no `Content-Type`. `setup`/`json`/`authHeader` are reused as-is.
- Modify: `src/sync/runner.test.ts:46` — add a zero-arg `post` stub to the one full `SpotifyClient` object literal (Decision 3).
- Do not touch: `src/model/state.ts`, `src/db/repo.ts`, `src/spotify/types.ts`, `src/sync/runner.ts`, `src/features/reachRun.ts`.

**Interfaces:**
- Consumes (existing at `4e8d649`):
  - `src/auth/session.ts`: `export const SCOPES` (space-separated string); `export interface Session { accessToken: string; expiresAt: number; refreshToken: string; scope: string }`. `session.ts` touches no `localStorage` at module scope, so `import type { Session }` is safe and erased.
  - `src/spotify/client.ts`: `createClient(deps: ClientDeps): SpotifyClient`; private `request<T>(url)`/`enqueue`/`buildUrl`; constants `MAX_5XX_RETRIES` (`../util/retry`), `MAX_429_RETRIES = 6`, `QUOTA_LOCK_THRESHOLD_S = 300`, `QUOTA_DEFAULT_WAIT_MS`; `backoffMs`, `parseRetryAfter`, `safeJson`, `errorField`; `ApiError`, `QuotaError` (`./errors`).
  - `src/db/schema.ts`: `interface MixRow { url; title; author; playerSrc; slug; sources; rows: TracklistRow[]; savedAt: number }`, `TracklistRow`, `DB_VERSION = 4`, `AllRows` (no `mixes` key), `DjDb`.
  - `src/spotify/client.test.ts`: the file's own `setup(responses)`, `json(body, status?, headers?)`, `authHeader(fetchFn, i)` helpers (reused, not re-declared), with `now: () => 1_000_000` and `getAccessToken` returning `'fresh'` on force.
  - `src/sync/runner.test.ts`: the `const client: SpotifyClient = { get, pages }` literal at line 46 — the one that gains `post`.
- Produces — Tasks 2–4 import these by these exact names:
  - `src/auth/session.ts`: `export const SCOPES = 'user-top-read playlist-read-private playlist-modify-private'`.
  - `src/features/mix/spotifySearch.ts`: `export function canCreatePlaylists(session: Session | null): boolean` — true **iff** `session !== null && session.scope.split(' ').includes('playlist-modify-private')`. The parameter is `Session | null`, never `undefined`; callers pass `auth.session.value`.
  - `src/db/schema.ts`: `MixRow` gains `playlistUrl?: string` and `playlistId?: string`.
  - `src/spotify/client.ts`: `SpotifyClient.post<T>(path: string, body: unknown, query?: Query): Promise<T>` — sends `method: 'POST'`, `Content-Type: application/json` (only when a body is present), `body: JSON.stringify(body)`, the bearer header; retries only 401-refresh-once and a short 429; **never** retries a 5xx or a network error; serialised through the same `enqueue` chain as `get`; returns the parsed JSON 2xx body.
- Obligations on later tasks: Task 2 extends `spotifySearch.ts`/`.test.ts` and adds `ApiSearchTracks` to `spotify/types.ts`; Task 3 owns `createPlaylist.ts`, adds `ApiPlaylist`, and threads `playlistUrl`/`playlistId` through `MixView`/`openMix`/`saveMix`/`closeMix`/`disconnect`. Task 1's schema footprint is the two optional `MixRow` fields only.

---

- [ ] **Step 1: Write the failing SCOPES assertion**

In `src/auth/session.test.ts`, in the `beginLogin` test "stores the verifier and navigates to Spotify with its challenge", add one assertion **immediately after** the existing `expect(url.searchParams.get('scope')).toBe(SCOPES);` line (leave that line in place):

```ts
    expect(url.searchParams.get('scope')).toBe(SCOPES);
    expect(url.searchParams.get('scope')).toBe(
      'user-top-read playlist-read-private playlist-modify-private'
    );
```

- [ ] **Step 2: Run it to verify it fails**

Run: `yarn test src/auth/session.test.ts -t "stores the verifier"`

Expected: FAIL, an assertion error on the new line:

```
AssertionError: expected 'user-top-read playlist-read-private' to be 'user-top-read playlist-read-private p…'
Expected: "user-top-read playlist-read-private playlist-modify-private"
Received: "user-top-read playlist-read-private"
```

- [ ] **Step 3: Widen the scope**

In `src/auth/session.ts`, replace line 12:

```ts
export const SCOPES = 'user-top-read playlist-read-private';
```

with (Prettier wraps it — this is the formatted result):

```ts
export const SCOPES =
  'user-top-read playlist-read-private playlist-modify-private';
```

- [ ] **Step 4: Run the whole suite to verify green**

Run: `yarn typecheck && yarn lint && yarn test`

Expected: PASS. Test files/tests unchanged at **42 / 523** (an assertion was added to an existing test, not a new test). Every token-response mock in `session.test.ts` uses `scope: SCOPES`, so they track the constant and stay green.

- [ ] **Step 5: Commit**

```bash
git add src/auth/session.ts src/auth/session.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): request playlist-modify-private scope

Creating a private playlist needs playlist-modify-private (spec §2). The
granted scope on an existing session is unchanged until the owner logs in
again; this only widens what the app requests.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu
EOF
)"
```

---

- [ ] **Step 6: Write the failing `canCreatePlaylists` test**

Create `src/features/mix/spotifySearch.test.ts` with the five §7 cases:

```ts
import { describe, expect, it } from 'vitest';
import type { Session } from '../../auth/session';
import { canCreatePlaylists } from './spotifySearch';

function session(scope: string): Session {
  return {
    accessToken: 'at',
    expiresAt: 0,
    refreshToken: 'rt',
    scope,
  };
}

describe('canCreatePlaylists', () => {
  it('is true when the scope carries the exact modify token', () => {
    expect(
      canCreatePlaylists(
        session('user-top-read playlist-read-private playlist-modify-private')
      )
    ).toBe(true);
  });

  it('is false for a session without the modify scope', () => {
    expect(
      canCreatePlaylists(session('user-top-read playlist-read-private'))
    ).toBe(false);
  });

  it('is false for an empty scope', () => {
    expect(canCreatePlaylists(session(''))).toBe(false);
  });

  it('is false for a null session', () => {
    expect(canCreatePlaylists(null)).toBe(false);
  });

  it('rejects a scope that merely contains the substring', () => {
    expect(
      canCreatePlaylists(session('user-top-read playlist-modify-private-xyz'))
    ).toBe(false);
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `yarn test src/features/mix/spotifySearch.test.ts`

Expected: FAIL — the module does not exist yet:

```
Error: Cannot find module './spotifySearch' imported from .../src/features/mix/spotifySearch.test.ts
```

- [ ] **Step 8: Create `spotifySearch.ts` with `canCreatePlaylists`**

Create `src/features/mix/spotifySearch.ts`. **Only this export** — Task 2 appends the rest:

```ts
import type { Session } from '../../auth/session';

/**
 * True only when the granted scope carries `playlist-modify-private`, so the
 * app may create a private playlist. Split on space and match the whole token,
 * not `String.includes`, so a hypothetical scope that merely *contains* the
 * substring (e.g. `playlist-modify-private-xyz`) can never satisfy it.
 */
export function canCreatePlaylists(session: Session | null): boolean {
  return (
    session !== null &&
    session.scope.split(' ').includes('playlist-modify-private')
  );
}
```

- [ ] **Step 9: Run the whole suite to verify green**

Run: `yarn typecheck && yarn lint && yarn test`

Expected: PASS. **43 test files / 528 tests** (the new file, +5 tests).

- [ ] **Step 10: Commit**

```bash
git add src/features/mix/spotifySearch.ts src/features/mix/spotifySearch.test.ts
git commit -m "$(cat <<'EOF'
feat(mix): add canCreatePlaylists scope gate

Pure check (spec §2): the granted scope, split on space, includes
playlist-modify-private. Split-on-space (not String.includes) so a scope
that merely contains the substring cannot satisfy it. The search/match
helpers are added to this module in a later task.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu
EOF
)"
```

---

- [ ] **Step 11: Add the two optional `MixRow` fields**

In `src/db/schema.ts`, in `interface MixRow`, insert two optional fields between `rows: TracklistRow[];` and `savedAt: number;`. **Do not change `DB_VERSION` (stays `4`), `AllRows`, or `DjDb`.** Replace:

```ts
  /** The one working list the owner curated, in play order. */
  rows: TracklistRow[];
  savedAt: number;
```

with:

```ts
  /** The one working list the owner curated, in play order. */
  rows: TracklistRow[];
  /** external_urls.spotify of the playlist last created for this mix, or absent. */
  playlistUrl?: string;
  /** Spotify id of that playlist, or absent. Kept for provenance/debugging. */
  playlistId?: string;
  savedAt: number;
```

- [ ] **Step 12: Verify the type-only change compiles and builds**

Run: `yarn typecheck && yarn lint && yarn test && VITE_SPOTIFY_CLIENT_ID=x yarn build`

Expected: PASS, unchanged at **43 files / 528 tests / 88 build modules**. There is no test for this step: two **optional** fields on an existing store need no migration (old rows read `undefined`), the `PlayRow.months` precedent; the compiler and the existing `repo.test.ts` mixes round-trip are the proof.

- [ ] **Step 13: Commit**

```bash
git add src/db/schema.ts
git commit -m "$(cat <<'EOF'
feat(db): MixRow gains optional playlistUrl and playlistId

Two optional fields record the playlist last created for a mix (spec §4).
No DB_VERSION bump and no migration: optional fields read back undefined on
old rows, the same pattern PlayRow's optional fields use. AllRows unchanged.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu
EOF
)"
```

---

- [ ] **Step 14: Write the failing `post` tests**

Two edits to `src/spotify/client.test.ts`. `setup`, `json` and `authHeader` are already in the file — reuse them, do not re-declare.

**14a.** In the existing `describe('createClient')` test "sends the bearer token and returns parsed JSON", replace it with a version whose body ends with a `Content-Type: undefined` assertion:

```ts
  it('sends the bearer token and returns parsed JSON', async () => {
    const { client, fetchFn } = setup([() => json({ id: 'me' })]);
    await expect(client.get('/me')).resolves.toEqual({ id: 'me' });
    expect(fetchFn.mock.calls[0][0]).toBe('https://api.spotify.com/v1/me');
    expect(authHeader(fetchFn, 0)).toBe('Bearer tok');
    const init = fetchFn.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      undefined
    );
  });
```

**14b.** Insert a new `describe('post', …)` block **immediately before** the `describe('paginate', () => {` block:

```ts
describe('post', () => {
  it('sends POST with a JSON body, content-type and bearer, and returns JSON', async () => {
    const { client, fetchFn } = setup([() => json({ id: 'p1' })]);
    await expect(
      client.post('/me/playlists', { name: 'Mix', public: false })
    ).resolves.toEqual({ id: 'p1' });
    expect(fetchFn.mock.calls[0][0]).toBe(
      'https://api.spotify.com/v1/me/playlists'
    );
    const init = fetchFn.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json'
    );
    expect(init.body).toBe(JSON.stringify({ name: 'Mix', public: false }));
    expect(authHeader(fetchFn, 0)).toBe('Bearer tok');
  });

  it('refreshes once on 401 and resends the same body with the fresh token', async () => {
    const { client, fetchFn, getAccessToken } = setup([
      () => json({}, 401),
      () => json({ id: 'p1' }),
    ]);
    await expect(
      client.post('/me/playlists', { name: 'Mix' })
    ).resolves.toEqual({ id: 'p1' });
    expect(getAccessToken).toHaveBeenCalledWith(true);
    expect(authHeader(fetchFn, 1)).toBe('Bearer fresh');
    expect((fetchFn.mock.calls[1][1] as RequestInit).body).toBe(
      JSON.stringify({ name: 'Mix' })
    );
  });

  it('waits a short Retry-After on a 429 and resends the body', async () => {
    const { client, fetchFn, sleep } = setup([
      () => json({}, 429, { 'Retry-After': '2' }),
      () => json({ id: 'p1' }),
    ]);
    await expect(client.post('/x/items', { uris: ['a'] })).resolves.toEqual({
      id: 'p1',
    });
    expect(sleep).toHaveBeenCalledWith(2000);
    expect((fetchFn.mock.calls[1][1] as RequestInit).body).toBe(
      JSON.stringify({ uris: ['a'] })
    );
  });

  it('raises QuotaError when Retry-After exceeds five minutes', async () => {
    const { client } = setup([() => json({}, 429, { 'Retry-After': '61389' })]);
    const err = await client
      .post('/me/playlists', { name: 'Mix' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(QuotaError);
    expect((err as QuotaError).retryAt).toBe(1_000_000 + 61_389_000);
  });

  it('does NOT retry a 5xx and throws immediately (non-idempotent)', async () => {
    const { client, fetchFn, sleep } = setup([() => json({}, 500)]);
    await expect(
      client.post('/me/playlists', { name: 'Mix' })
    ).rejects.toMatchObject({ name: 'ApiError', status: 500 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('does NOT retry a network error and throws immediately (non-idempotent)', async () => {
    const { client, fetchFn, sleep } = setup([
      () => {
        throw new TypeError('Failed to fetch');
      },
    ]);
    const err = await client
      .post('/me/playlists', { name: 'Mix' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(0);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 15: Run it to verify it fails**

Run: `yarn test src/spotify/client.test.ts -t "post"`

(Use `yarn test`, not `yarn typecheck`, for this RED step: `yarn typecheck` also fails here — the `SpotifyClient` interface has no `post` yet — which is expected; Step 16 clears it. Vitest transforms with esbuild and runs regardless of type errors.)

Expected: FAIL — the six post tests fail (the GET `Content-Type: undefined` assertion in 14a passes against the current client):

```
TypeError: client.post is not a function
```

- [ ] **Step 16: Implement `post` and the POST-vs-GET retry split**

Three edits to `src/spotify/client.ts`.

**16a.** Add `post` to the `SpotifyClient` interface (a **required** member, between `get` and `pages`):

```ts
export interface SpotifyClient {
  get<T>(path: string, query?: Query): Promise<T>;
  post<T>(path: string, body: unknown, query?: Query): Promise<T>;
  pages<T>(
    path: string,
    query?: Query,
    limit?: number
  ): AsyncGenerator<ApiPage<T>, void, undefined>;
}
```

**16b.** Replace the whole `request<T>` function (from `async function request<T>(url: string): Promise<T> {` through its closing `}`) with this version — the signature gains `init`, the `headers` object and the `fetchFn` init are built inside the loop, and two `isPost` early-throw branches are added (network + 5xx). Every GET branch is otherwise unchanged, so the existing GET tests stay green:

```ts
  async function request<T>(
    url: string,
    init?: { method?: string; body?: string }
  ): Promise<T> {
    // POST is not idempotent: a retried create could make a second playlist the
    // app cannot detect, and a retried add would duplicate tracks. So on a 5xx
    // or a network error POST throws at once; only 401-refresh-once and a short
    // 429 (both pre-mutation) are retried. GET keeps its 5xx/network backoff.
    const isPost = init?.method === 'POST';
    let token = await deps.getAccessToken();
    let retried401 = false;
    let attempts429 = 0;
    let attempts5xx = 0;
    for (;;) {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };
      if (init?.body !== undefined)
        headers['Content-Type'] = 'application/json';
      let res: Response;
      try {
        res = await deps.fetchFn(url, {
          method: init?.method ?? 'GET',
          headers,
          body: init?.body,
        });
      } catch (err) {
        if (isPost) {
          const reason = err instanceof Error ? err.message : String(err);
          throw new ApiError(0, `Network error: ${reason}`);
        }
        attempts5xx += 1;
        if (attempts5xx <= MAX_5XX_RETRIES) {
          await deps.sleep(backoffMs(attempts5xx));
          continue;
        }
        const reason = err instanceof Error ? err.message : String(err);
        throw new ApiError(0, `Network error: ${reason}`);
      }
      if (res.ok) return (await res.json()) as T;
      if (res.status === 401 && !retried401) {
        retried401 = true;
        token = await deps.getAccessToken(true);
        continue;
      }
      if (res.status === 429) {
        const body = await safeJson(res);
        const retryAfterS = parseRetryAfter(res.headers.get('Retry-After'));
        const quota = errorField(body, 'reason') === 'QUOTA_EXCEEDED';
        if (
          quota ||
          (retryAfterS !== null && retryAfterS > QUOTA_LOCK_THRESHOLD_S)
        ) {
          const waitMs =
            retryAfterS !== null ? retryAfterS * 1000 : QUOTA_DEFAULT_WAIT_MS;
          throw new QuotaError(deps.now() + waitMs);
        }
        attempts429 += 1;
        if (attempts429 > MAX_429_RETRIES) {
          throw new ApiError(429, 'Rate limited too many times in a row', body);
        }
        await deps.sleep(
          retryAfterS !== null ? retryAfterS * 1000 : backoffMs(attempts429)
        );
        continue;
      }
      if (res.status >= 500) {
        if (isPost) {
          throw new ApiError(
            res.status,
            `Spotify server error ${res.status}`,
            await safeJson(res)
          );
        }
        attempts5xx += 1;
        if (attempts5xx <= MAX_5XX_RETRIES) {
          await deps.sleep(backoffMs(attempts5xx));
          continue;
        }
        throw new ApiError(
          res.status,
          `Spotify server error ${res.status}`,
          await safeJson(res)
        );
      }
      const body = await safeJson(res);
      const message = errorField(body, 'message');
      throw new ApiError(
        res.status,
        typeof message === 'string' ? message : `Spotify error ${res.status}`,
        body
      );
    }
  }
```

**16c.** Add the `post` function beside `get`, and add it to the return object. Replace:

```ts
  function get<T>(path: string, query?: Query): Promise<T> {
    return enqueue(() => request<T>(buildUrl(path, query)));
  }
```

with:

```ts
  function get<T>(path: string, query?: Query): Promise<T> {
    return enqueue(() => request<T>(buildUrl(path, query)));
  }

  function post<T>(path: string, body: unknown, query?: Query): Promise<T> {
    return enqueue(() =>
      request<T>(buildUrl(path, query), {
        method: 'POST',
        body: JSON.stringify(body),
      })
    );
  }
```

and change the final `return { get, pages };` to:

```ts
  return { get, post, pages };
}
```

- [ ] **Step 17: Fix the one forced type error — the `SpotifyClient` literal in `runner.test.ts`**

`post` is now a required member, so the object literal at `src/sync/runner.test.ts:46` fails typecheck. Add a rejecting `post` stub (runner tests never call it; a **zero-arg** arrow so no unused-param lint error — Decision 3). Replace:

```ts
  const client: SpotifyClient = {
    get,
    pages: <T>(path: string, query?: Query, limit?: number) =>
      paginate<T>(get, path, query, limit),
  };
```

with:

```ts
  const client: SpotifyClient = {
    get,
    post: () => Promise.reject(new Error('post is unused in these sync tests')),
    pages: <T>(path: string, query?: Query, limit?: number) =>
      paginate<T>(get, path, query, limit),
  };
```

- [ ] **Step 18: Run the whole suite to verify green**

Run: `yarn typecheck && yarn lint && yarn test && VITE_SPOTIFY_CLIENT_ID=x yarn build`

Expected: PASS. **43 test files / 534 tests / 88 build modules** (the 6 new post tests; the GET `Content-Type` assertion and the runner stub add no test). The existing GET tests stay green — their branches were left untouched.

- [ ] **Step 19: Commit**

```bash
git add src/spotify/client.ts src/spotify/client.test.ts src/sync/runner.test.ts
git commit -m "$(cat <<'EOF'
feat(spotify): add non-retrying POST to the API client

post(path, body, query?) reuses the enqueue/401-refresh-once/short-429
machinery but NEVER retries a 5xx or a network error (spec §4): POST is
not idempotent, so a retried create would make a second undetectable
playlist and a retried add would duplicate tracks. Content-Type is set
only when a body is present. runner.test.ts gains a post stub for the one
full SpotifyClient literal in the repo.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu
EOF
)"
```

---

- [ ] **Step 20: Non-destructive browser check of the widened scope**

Task 1 has no screen; this is the one thing Node tests cannot cover — that Spotify's real consent page now requests the new scope.

1. `yarn dev`, open `http://127.0.0.1:5173/myOwnSpotifyData/` (never `localhost`) in a mobile viewport (390px wide).
2. On the Connect screen, tap **Connect Spotify**. The page navigates to Spotify's `accounts.spotify.com/authorize` consent page.
3. In the address bar, read the `scope` query parameter. **Decoded**, it must contain `playlist-modify-private` alongside `user-top-read` and `playlist-read-private`. Do not assert a specific percent-encoding.
4. **Back out without granting** — press Back or close the tab. Do **not** tap Agree: completing the grant would widen the currently-logged-in session, and §2's re-login flow (later tasks) must be verified against a session that still holds the *narrow* grant.

Expected: the authorize URL carries `playlist-modify-private`. No code change; nothing is committed for this step.

---

## Task 2: Track resolution against Spotify Search (`spotifySearch.ts`)

Resolve a single mix row to a real Spotify track through Search, with a precise match rule that **never returns a wrong track**. This task appends the pure `isIdentified`/`pickMatch` layer and the per-row `searchTrack` fetch to `src/features/mix/spotifySearch.ts` (created by Task 1), plus one response type in `spotify/types.ts`. It is spec §3 in full.

**Files:**
- Modify: `src/features/mix/spotifySearch.ts` — **created by Task 1** with `canCreatePlaylists`. This task appends `INERT`, `isIdentified`, `pickMatch` (cycle A) and `stripQuotes`, `RowMatch`, `searchTrack` (cycle B), and extends the import block. **Never re-create the file; never restate `canCreatePlaylists`.**
- Modify: `src/features/mix/spotifySearch.test.ts` — **created by Task 1** with the `canCreatePlaylists` tests. This task extends the import block and appends the `isIdentified`/`pickMatch` describe blocks + fixtures (cycle A) and the `searchTrack` describe + `mockClient` helper (cycle B). **Keep Task 1's `canCreatePlaylists` import and describe block intact.**
- Modify: `src/spotify/types.ts` — add one interface, `ApiSearchTracks`, immediately after `ApiPage<T>`.
- Do not touch: `src/ui/Mix.tsx`, `spotify/client.ts`, `session.ts`, `db/schema.ts`.

**Interfaces:**
- Consumes — existing at `4e8d649`:
  - `src/db/schema.ts`: `interface TracklistRow { startSec; endSec; artist; title; label; source; gap; detected; referenceCount }`.
  - `src/model/normalize.ts`: `normalize(s: string): string` (NFD-strips diacritics, lowercases, flattens every non-letter/number run to a single space, trims — so `'?'` → `''`).
  - `src/features/rekordbox-match.ts`: `cleanTitle(s: string): string` (removes feat/generic noise, **keeps a remix tail**, then `normalize`s) and `primaryArtist(s: string): string` (the raw first credited segment, un-normalised). The strip regexes are module-private — do not reach for them.
  - `src/spotify/client.ts`: `interface SpotifyClient { get<T>(path, query?): Promise<T>; … }`, `type Query`. `searchTrack` takes `Pick<SpotifyClient, 'get'>`.
  - `src/spotify/types.ts`: `interface ApiTrack { id: string | null; uri: string; name: string; duration_ms: number; artists: ApiArtistRef[]; … is_local? }`, `interface ApiArtistRef { id; name }`, `interface ApiPage<T> { items: T[]; … }`.
  - From Task 1 (same file): `canCreatePlaylists(session: Session | null): boolean` (lives above this task's additions).
- Produces — Task 3 imports these by these exact names from `src/features/mix/spotifySearch`:
  - `export const INERT: Set<string>` = `new Set(['', 'id', 'unknown'])`.
  - `export function isIdentified(row: TracklistRow): boolean`.
  - `export function pickMatch(row: TracklistRow, items: ApiTrack[]): ApiTrack | null`.
  - `export interface RowMatch { row: TracklistRow; uri: string | null; matchedName: string | null }`.
  - `export function searchTrack(client: Pick<SpotifyClient, 'get'>, row: TracklistRow): Promise<RowMatch>`.
  - `src/spotify/types.ts`: `export interface ApiSearchTracks { tracks: ApiPage<ApiTrack> }`.
- Obligation on Task 4: delete `Mix.tsx`'s private `INERT`/`isInert` and re-express `isInert` as `!isIdentified(row)` (Task 4 Step 2); button visibility uses `mixRows.value.some(isIdentified)`.

**Notes:**
- The query is built from RAW text, never `cleanTitle` — `searchTrack` uses `primaryArtist(row.artist)` and `row.title` **verbatim** with any embedded `"` stripped from each field value; the plain fallback is the literal `` `${row.artist} ${row.title}` `` (no quote-strip — there is no filter to break).
- `pickMatch` is the "never a wrong track" gate: artist across **every** credited name (equality on `normalize`, or one `includes` the other); title **equality or prefix only**; a real `spotify:track:` URI with `id !== null`.
- `searchTrack` guards on `isIdentified` — it early-returns unmatched with **zero** `get` calls for an inert row, because `pickMatch` is vacuously permissive on an empty/`?` row (`startsWith('')` / `includes('')` always true). This closes the "never a wrong track" hole at this layer; the runner still filters identified rows for its `total`.
- `res.tracks?.items` is read with the `Array.isArray(...)` idiom `paginate` uses; a malformed body yields `[]`.
- `searchTrack` never catches — an error from `client.get` propagates to Task 3's runner.
- The test file imports `{ describe, expect, it }` in cycle A and adds `vi` only in cycle B — an unused `vi` import fails `@typescript-eslint/no-unused-vars` at the cycle-A commit.

---

### Cycle A — the pure layer (`isIdentified`, `pickMatch`)

- [ ] **Step 1: Write the failing pure tests**

In `src/features/mix/spotifySearch.test.ts`, replace Task 1's three-line import block:

```ts
import { describe, expect, it } from 'vitest';
import type { Session } from '../../auth/session';
import { canCreatePlaylists } from './spotifySearch';
```

with the merged block (keeps `Session`/`canCreatePlaylists` for Task 1's tests, adds this cycle's imports — no `vi` yet):

```ts
import { describe, expect, it } from 'vitest';
import type { Session } from '../../auth/session';
import type { TracklistRow } from '../../db/schema';
import type { ApiTrack } from '../../spotify/types';
import { canCreatePlaylists, isIdentified, pickMatch } from './spotifySearch';
```

Then append the two fixtures and the two describe blocks **below** the existing `canCreatePlaylists` describe:

```ts
function row(over: Partial<TracklistRow> = {}): TracklistRow {
  return {
    startSec: null,
    endSec: null,
    artist: 'Fisher',
    title: 'Losing It',
    label: null,
    source: 'trackid',
    gap: false,
    detected: null,
    referenceCount: null,
    ...over,
  };
}

function track(over: Partial<ApiTrack> = {}): ApiTrack {
  return {
    id: 't1',
    uri: 'spotify:track:t1',
    name: 'Losing It',
    duration_ms: 1000,
    artists: [{ id: 'a1', name: 'Fisher' }],
    ...over,
  };
}

describe('isIdentified', () => {
  it('is true for a real artist and title', () => {
    expect(isIdentified(row())).toBe(true);
  });

  it('is false for a gap row', () => {
    expect(isIdentified(row({ gap: true }))).toBe(false);
  });

  it('is false for ID / unknown / empty / ? placeholders', () => {
    expect(isIdentified(row({ artist: 'ID', title: 'ID' }))).toBe(false);
    expect(isIdentified(row({ artist: 'Fisher', title: 'unknown' }))).toBe(
      false
    );
    expect(isIdentified(row({ artist: '', title: 'Losing It' }))).toBe(false);
    // normalize narrows '?' to '', so a '?' row is inert too.
    expect(isIdentified(row({ artist: '?', title: '?' }))).toBe(false);
  });
});

describe('pickMatch', () => {
  it('returns the first item that passes artist and title (exact hit)', () => {
    const hit = track();
    expect(pickMatch(row(), [hit])).toBe(hit);
  });

  it('rejects when no artist across all artists[] matches', () => {
    const wrong = track({ artists: [{ id: 'a2', name: 'Someone Else' }] });
    expect(pickMatch(row(), [wrong])).toBeNull();
  });

  it('accepts a collab where the credited artist is not at [0]', () => {
    const credited = row({ artist: 'Salomo', title: 'Voltage' });
    const collab = track({
      name: 'Voltage',
      artists: [
        { id: 'a1', name: 'Adriatique' },
        { id: 'a2', name: 'Salomo' },
      ],
    });
    expect(pickMatch(credited, [collab])).toBe(collab);
  });

  it('accepts a remix result by prefix and rejects a bare-title result for a remix row', () => {
    const remixRow = row({ title: 'Losing It (Ted Remix)' });
    const remix = track({ name: 'Losing It (Ted Remix)' });
    const bare = track({
      id: 't2',
      uri: 'spotify:track:t2',
      name: 'Losing It',
    });
    expect(pickMatch(remixRow, [remix])).toBe(remix);
    // A row asking for the remix must NOT accept the bare original.
    expect(pickMatch(remixRow, [bare])).toBeNull();
  });

  it('accepts a remix result for a bare row (prefix in the other direction)', () => {
    const remix = track({ name: 'Losing It (Ted Remix)' });
    expect(pickMatch(row(), [remix])).toBe(remix);
  });

  it('returns null for zero items', () => {
    expect(pickMatch(row(), [])).toBeNull();
  });

  it('skips a local or episode result even when the text matches', () => {
    const local = track({ id: null, uri: 'spotify:local:x', is_local: true });
    const episode = track({ uri: 'spotify:episode:e1' });
    expect(pickMatch(row(), [local])).toBeNull();
    expect(pickMatch(row(), [episode])).toBeNull();
  });

  it('returns the first passing item when several pass', () => {
    const first = track({ id: 'f1', uri: 'spotify:track:f1' });
    const second = track({ id: 'f2', uri: 'spotify:track:f2' });
    expect(pickMatch(row(), [first, second])).toBe(first);
  });
});
```

- [ ] **Step 2: Run the pure tests to verify they fail**

Run: `yarn test src/features/mix/spotifySearch.test.ts`

Expected: the 11 new tests fail because the functions are not exported yet (Task 1's `canCreatePlaylists` tests stay green):

```
TypeError: isIdentified is not a function
TypeError: pickMatch is not a function
      Tests  11 failed | 5 passed (16)
```

- [ ] **Step 3: Implement `INERT`, `isIdentified`, `pickMatch`**

In `src/features/mix/spotifySearch.ts`, replace Task 1's single import line (`import type { Session } from '../../auth/session';`) with the full block below, then append the three exports beneath `canCreatePlaylists`:

```ts
import type { Session } from '../../auth/session';
import type { TracklistRow } from '../../db/schema';
import { normalize } from '../../model/normalize';
import type { ApiTrack } from '../../spotify/types';
import { cleanTitle, primaryArtist } from '../rekordbox-match';
```

```ts
/**
 * The positive form of Mix.tsx's private `isInert`. `normalize` narrows `?` to
 * '', so a `?` row is inert too — the same behaviour the Mix screen relies on.
 */
export const INERT = new Set(['', 'id', 'unknown']);

export function isIdentified(row: TracklistRow): boolean {
  return (
    !row.gap &&
    !INERT.has(normalize(row.artist)) &&
    !INERT.has(normalize(row.title))
  );
}

/**
 * The first search result that is confidently the row's track, else null. A
 * wrong track is never returned: the artist must match across ALL credited
 * names, the title must be equal or a prefix (never a free substring), and the
 * result must be a real `spotify:track:` recording.
 */
export function pickMatch(
  row: TracklistRow,
  items: ApiTrack[]
): ApiTrack | null {
  const rowArtist = normalize(primaryArtist(row.artist));
  const rowTitle = cleanTitle(row.title);
  for (const item of items) {
    // Real track only: skips episodes and `spotify:local:` results, which
    // cannot be added by URI.
    if (!item.uri.startsWith('spotify:track:') || item.id === null) continue;
    const candTitle = cleanTitle(item.name);
    // Equality or prefix only. Prefix handles the remix case ('losing it' is a
    // prefix of 'losing it ted remix'); the reverse is NOT allowed, so a row
    // that asks for the remix cannot accept a bare original.
    if (candTitle !== rowTitle && !candTitle.startsWith(rowTitle)) continue;
    // Artist across EVERY credited name: a collab's primary artist is often
    // not the one a mix credits.
    const artistOk = item.artists.some((a) => {
      const n = normalize(a.name);
      return n === rowArtist || n.includes(rowArtist) || rowArtist.includes(n);
    });
    if (artistOk) return item;
  }
  return null;
}
```

- [ ] **Step 4: Run the pure tests to verify they pass**

Run: `yarn test src/features/mix/spotifySearch.test.ts`
Expected: PASS — 11 new tests plus Task 1's 5 `canCreatePlaylists` tests, all green (16 in the file).

- [ ] **Step 5: Gate and commit cycle A**

Run:

```bash
yarn typecheck && yarn lint && yarn test
npx prettier --check src/features/mix/spotifySearch.ts src/features/mix/spotifySearch.test.ts
```

Expected: typecheck OK, lint OK, **43 files / 545 tests** (534 after Task 1 + 11), Prettier clean.

```bash
git add src/features/mix/spotifySearch.ts src/features/mix/spotifySearch.test.ts
git commit -m "$(cat <<'EOF'
feat(mix): resolve rows to tracks with isIdentified and pickMatch

The pure layer of spotifySearch.ts (spec §3): isIdentified is the positive
form of Mix.tsx's isInert; pickMatch returns the first result that is
confidently the row's track — artist across all credited names, title equal
or a prefix (never a free substring), a real spotify:track: uri — else null.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu
EOF
)"
```

---

### Cycle B — the per-row fetch (`searchTrack`) and `ApiSearchTracks`

- [ ] **Step 6: Write the failing `searchTrack` tests**

In `src/features/mix/spotifySearch.test.ts`, replace the cycle-A import block:

```ts
import { describe, expect, it } from 'vitest';
import type { Session } from '../../auth/session';
import type { TracklistRow } from '../../db/schema';
import type { ApiTrack } from '../../spotify/types';
import { canCreatePlaylists, isIdentified, pickMatch } from './spotifySearch';
```

with (adds `vi`, the client types, and `searchTrack`):

```ts
import { describe, expect, it, vi } from 'vitest';
import type { Session } from '../../auth/session';
import type { TracklistRow } from '../../db/schema';
import type { Query, SpotifyClient } from '../../spotify/client';
import type { ApiTrack } from '../../spotify/types';
import {
  canCreatePlaylists,
  isIdentified,
  pickMatch,
  searchTrack,
} from './spotifySearch';
```

Then append the `mockClient` helper and the `searchTrack` describe block at the end of the file:

```ts
function mockClient(...batches: ApiTrack[][]) {
  const queue = [...batches];
  const get = vi.fn<(path: string, query?: Query) => Promise<unknown>>(
    async () => ({ tracks: { items: queue.shift() ?? [] } })
  );
  return { client: { get } as unknown as Pick<SpotifyClient, 'get'>, get };
}

describe('searchTrack', () => {
  it('returns the field-query hit and does not run the plain fallback', async () => {
    const hit = track();
    const { client, get } = mockClient([hit]);
    const m = await searchTrack(client, row());
    expect(m).toEqual({
      row: row(),
      uri: 'spotify:track:t1',
      matchedName: 'Losing It',
    });
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][0]).toBe('/search');
    expect(get.mock.calls[0][1]).toEqual({
      q: 'artist:"Fisher" track:"Losing It"',
      type: 'track',
      limit: 5,
    });
  });

  it('falls back to the plain query when the field query is empty', async () => {
    const hit = track();
    const { client, get } = mockClient([], [hit]);
    const m = await searchTrack(client, row());
    expect(m.uri).toBe('spotify:track:t1');
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls[1][1]).toEqual({
      q: 'Fisher Losing It',
      type: 'track',
      limit: 5,
    });
  });

  it('is unmatched when both queries return zero results', async () => {
    const { client, get } = mockClient([], []);
    const m = await searchTrack(client, row());
    expect(m).toEqual({ row: row(), uri: null, matchedName: null });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('is unmatched when the artist is wrong across both queries', async () => {
    const wrong = track({ artists: [{ id: 'a2', name: 'Someone Else' }] });
    const { client, get } = mockClient([wrong], [wrong]);
    const m = await searchTrack(client, row());
    expect(m.uri).toBeNull();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('strips embedded quotes from the field-query values', async () => {
    const { client, get } = mockClient([]);
    await searchTrack(client, row({ artist: 'A"B', title: 'C"D' }));
    expect(get.mock.calls[0][1]).toMatchObject({
      q: 'artist:"AB" track:"CD"',
    });
  });

  it('does not search a gap or inert row (zero fetches)', async () => {
    const { client: gapClient, get: gapGet } = mockClient([track()]);
    expect(await searchTrack(gapClient, row({ gap: true }))).toEqual({
      row: row({ gap: true }),
      uri: null,
      matchedName: null,
    });
    expect(gapGet).not.toHaveBeenCalled();

    const { client: idClient, get: idGet } = mockClient([track()]);
    expect(
      (await searchTrack(idClient, row({ artist: 'ID', title: 'ID' }))).uri
    ).toBeNull();
    expect(idGet).not.toHaveBeenCalled();
  });

  it('skips a local top result and takes a real track lower down', async () => {
    const local = track({ id: null, uri: 'spotify:local:x', is_local: true });
    const real = track({ id: 't9', uri: 'spotify:track:t9' });
    const { client, get } = mockClient([local, real]);
    const m = await searchTrack(client, row());
    expect(m.uri).toBe('spotify:track:t9');
    expect(get).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 7: Run the `searchTrack` tests to verify they fail**

Run: `yarn test src/features/mix/spotifySearch.test.ts`

Expected: the 7 new tests fail (cycle A's 11 plus Task 1's 5 stay green):

```
TypeError: searchTrack is not a function
      Tests  7 failed | 16 passed (23)
```

- [ ] **Step 8: Add the `ApiSearchTracks` response type**

In `src/spotify/types.ts`, immediately after the `ApiPage<T>` interface, add:

```ts

/** `GET /search?type=track` response: `tracks.items[]` are `ApiTrack`. */
export interface ApiSearchTracks {
  tracks: ApiPage<ApiTrack>;
}
```

- [ ] **Step 9: Implement `searchTrack`, `RowMatch`, `stripQuotes`**

In `src/features/mix/spotifySearch.ts`, replace the cycle-A import block:

```ts
import type { Session } from '../../auth/session';
import type { TracklistRow } from '../../db/schema';
import { normalize } from '../../model/normalize';
import type { ApiTrack } from '../../spotify/types';
import { cleanTitle, primaryArtist } from '../rekordbox-match';
```

with (adds the client type and `ApiSearchTracks`):

```ts
import type { Session } from '../../auth/session';
import type { TracklistRow } from '../../db/schema';
import { normalize } from '../../model/normalize';
import type { SpotifyClient } from '../../spotify/client';
import type { ApiSearchTracks, ApiTrack } from '../../spotify/types';
import { cleanTitle, primaryArtist } from '../rekordbox-match';
```

Then append, at the end of the file (below `pickMatch`):

```ts
/** Any embedded `"` would close a `track:"…"` filter early; drop it. */
function stripQuotes(s: string): string {
  return s.replace(/"/g, '');
}

/** The result of resolving one mix row against Search. */
export interface RowMatch {
  row: TracklistRow;
  /** null = unmatched (nothing confident, or an inert row). */
  uri: string | null;
  matchedName: string | null;
}

/**
 * Resolve one row to a real Spotify track. Runs the RAW-text field query first
 * (`artist:"…" track:"…"`), then a plain `<artist> <title>` fallback, applying
 * `pickMatch` to each; returns the first confident hit or an unmatched result.
 * An inert row is never searched. Errors from `client.get` propagate.
 */
export async function searchTrack(
  client: Pick<SpotifyClient, 'get'>,
  row: TracklistRow
): Promise<RowMatch> {
  if (!isIdentified(row)) return { row, uri: null, matchedName: null };
  const artist = stripQuotes(primaryArtist(row.artist));
  const title = stripQuotes(row.title);
  const queries = [
    `artist:"${artist}" track:"${title}"`,
    `${row.artist} ${row.title}`,
  ];
  for (const q of queries) {
    const res = await client.get<ApiSearchTracks>('/search', {
      q,
      type: 'track',
      limit: 5,
    });
    const items = Array.isArray(res.tracks?.items) ? res.tracks.items : [];
    const hit = pickMatch(row, items);
    if (hit) return { row, uri: hit.uri, matchedName: hit.name };
  }
  return { row, uri: null, matchedName: null };
}
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `yarn test src/features/mix/spotifySearch.test.ts`
Expected: PASS — 23 tests in the file (5 + 11 + 7), all green.

- [ ] **Step 11: Full gate and build**

Run:

```bash
yarn typecheck && yarn lint && yarn test
npx prettier --check src/features/mix/spotifySearch.ts src/features/mix/spotifySearch.test.ts src/spotify/types.ts
VITE_SPOTIFY_CLIENT_ID=x yarn build
```

Expected: typecheck OK, lint OK, **43 files / 552 tests** (545 after cycle A + 7), Prettier clean, build succeeds at **88 modules** (`spotifySearch.ts` has no app importer yet — the state task wires it in).

- [ ] **Step 12: Commit cycle B**

```bash
git add src/features/mix/spotifySearch.ts src/features/mix/spotifySearch.test.ts src/spotify/types.ts
git commit -m "$(cat <<'EOF'
feat(mix): add searchTrack per-row Spotify Search fetch

Field query (artist:"…" track:"…") then a plain fallback, pickMatch on
each; an inert row is never searched and a wrong track is never returned.
Adds ApiSearchTracks to spotify/types.ts.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu
EOF
)"
```

---

## Task 3: The create-playlist runner and state wiring

The pure/tested job (`runCreatePlaylist`) that resolves a mix's identified rows to Spotify tracks, creates a private playlist and adds them in ≤100 batches; plus the thin browser wiring in `state.ts` (`startCreatePlaylist`, the `CreatePlaylistState` signal, and the two new `MixView`/`MixRow` fields threaded through open/save). Spec §4 is the contract.

**Files:**
- Create: `src/features/mix/createPlaylist.ts` — `runCreatePlaylist` and its three interfaces. Imports `isIdentified`/`searchTrack` from Task 2's `spotifySearch.ts`, posts through the client, drives `onState`. Imports `CreatePlaylistState`/`UnmatchedRow` from `state.ts` **as types only** (Decision 5). Unit-tested.
- Create: `src/features/mix/createPlaylist.test.ts` — 9 tests, a mocked client (`get`/`post` spies).
- Modify: `src/spotify/types.ts` — add `ApiPlaylist` at the end (after `ApiProfile`). Independent of Task 2's `ApiSearchTracks` (Decision 4).
- Modify: `src/model/state.ts` — (1) `UnmatchedRow` + `CreatePlaylistState` + `createPlaylistState`, right after the `mixError` signal; (2) two optional `MixView` fields; (3) `openMix` copies them, `saveMix` carries them back; (4) `startCreatePlaylist` above `openMix`'s doc comment; (5) a `createPlaylistState` reset in `closeMix` and `disconnect`.
- Test: `createPlaylist.test.ts` only. `state.ts` has **no** unit test (importing it under Vitest pulls in `auth/browser.ts`, which touches `localStorage` at module scope); its additions are proven by the gate.

**Unchanged, do not touch:** `jobsBusy()` (the create job is deliberately out of it — Global Constraints); `disconnect()`'s guard message (only its reset list gains one line); the client's GET retry policy; `loadFromDb()`; Task 1's `MixRow` fields and `post`; Task 2's `spotifySearch.ts`; `src/ui/Mix.tsx` (Task 4).

**Interfaces:**
- Consumes, from Task 1: `SpotifyClient.post<T>(path, body, query?)`; `MixRow.playlistUrl?`/`playlistId?` (no `DB_VERSION` bump); the `runner.test.ts` `post` stub (Task 1 already landed it — Decision 3).
- Consumes, from Task 2: `isIdentified(row)`, `searchTrack(client, row)`, `interface RowMatch`, and `canCreatePlaylists(session: Session | null)` — all from `../features/mix/spotifySearch`; `interface ApiSearchTracks` (Task 2's edit).
- Consumes, existing: `describeError` (`../../util/errors`); `signal` (`@preact/signals`); the `api` singleton (`../spotify/api`), `auth` (`../auth/browser`), `putMix` (`../db/repo`), and `saveMix`/`loadSavedMixes`/`mixState`/`mixRows`/`mixError`/`MixView` in `state.ts`.
- Produces, for Task 4:

  ```ts
  // src/spotify/types.ts (this task)
  export interface ApiPlaylist {
    id: string;
    name: string;
    external_urls?: { spotify?: string };
  }

  // src/features/mix/createPlaylist.ts
  export interface CreatePlaylistDeps {
    client: Pick<SpotifyClient, 'get' | 'post'>;
    onState: (s: CreatePlaylistState) => void;
  }
  export interface CreatePlaylistInput {
    name: string; // trimmed, non-empty (the wrapper builds it)
    description: string;
    rows: TracklistRow[]; // the mix's working list, in play order
  }
  export interface CreatePlaylistOutcome {
    playlistId: string | null; // non-null once the playlist exists
    url: string | null;
  }
  export function runCreatePlaylist(
    deps: CreatePlaylistDeps,
    input: CreatePlaylistInput
  ): Promise<CreatePlaylistOutcome>;

  // src/model/state.ts
  export interface UnmatchedRow {
    artist: string;
    title: string;
  }
  export type CreatePlaylistState =
    | { status: 'idle' }
    | { status: 'needScope' }
    | { status: 'resolving'; done: number; total: number }
    | { status: 'creating' }
    | { status: 'adding' }
    | {
        status: 'done';
        name: string;
        url: string | null;
        added: number;
        total: number;
        unmatched: UnmatchedRow[];
      }
    | { status: 'error'; message: string; url?: string | null; added?: number };
  export const createPlaylistState: Signal<CreatePlaylistState>;
  export function startCreatePlaylist(): Promise<void>;
  // MixView gains: playlistUrl?: string; playlistId?: string;
  ```

The add-items path is `POST /playlists/{playlist_id}/items` (Decision 6). One-line fallback if a 404 ever arrives after create: change the single path literal to `.../tracks`.

---

- [ ] **Step 1: Add the state surface to `state.ts`**

Adds the type/signal surface plus the `MixView`/open/save/reset plumbing. It adds **no** import and does **not** yet reference `runCreatePlaylist`/`canCreatePlaylists` (those arrive in Step 10), so `state.ts` still compiles after this step.

**1a.** Right after the `mixError` signal (`export const mixError = signal<string | null>(null);`), insert:

```ts

export interface UnmatchedRow {
  artist: string;
  title: string;
}

/**
 * The Mix screen's create-playlist job state (spec §4). `needScope` is the
 * one-time re-login prompt arm; it does not count as "running" and joins no
 * jobsBusy(). Owned here (not in the runner) so the screen imports one signal
 * and createPlaylist.ts imports the type only (erased under
 * verbatimModuleSyntax, so the runner never pulls in auth/browser).
 */
export type CreatePlaylistState =
  | { status: 'idle' }
  | { status: 'needScope' }
  | { status: 'resolving'; done: number; total: number }
  | { status: 'creating' }
  | { status: 'adding' }
  | {
      status: 'done';
      name: string;
      url: string | null;
      added: number;
      total: number;
      unmatched: UnmatchedRow[];
    }
  | {
      status: 'error';
      message: string;
      url?: string | null;
      added?: number;
    };

export const createPlaylistState = signal<CreatePlaylistState>({
  status: 'idle',
});
```

**1b.** In the `MixView` interface, add the two optional fields just before its closing brace. Replace:

```ts
  shortLink: boolean;
}

export type MixState =
```

with:

```ts
  shortLink: boolean;
  /** external_urls.spotify of the playlist last created for this mix. */
  playlistUrl?: string;
  /** Spotify id of that playlist; the only durable handle on it. */
  playlistId?: string;
}

export type MixState =
```

**1c.** In `openMix`, copy the two fields off the stored row. Replace:

```ts
    shortLink: isShortLink(row.url),
  };
  mixState.value = { status: 'ready', view };
}
```

with:

```ts
    shortLink: isShortLink(row.url),
    playlistUrl: row.playlistUrl,
    playlistId: row.playlistId,
  };
  mixState.value = { status: 'ready', view };
}
```

**1d.** In `saveMix`, carry the two fields through into the row it writes. Replace:

```ts
    rows: mixRows.value,
    savedAt: Date.now(),
  };
```

with:

```ts
    rows: mixRows.value,
    savedAt: Date.now(),
    playlistUrl: view.playlistUrl,
    playlistId: view.playlistId,
  };
```

**1e.** In `closeMix`, reset the new signal. Replace:

```ts
export function closeMix(): void {
  mixState.value = { status: 'idle' };
  mixRows.value = [];
  mixError.value = null;
}
```

with:

```ts
export function closeMix(): void {
  mixState.value = { status: 'idle' };
  mixRows.value = [];
  mixError.value = null;
  createPlaylistState.value = { status: 'idle' };
}
```

**1f.** In `disconnect`, reset the new signal alongside the other job signals. Replace:

```ts
  savedMixes.value = [];
  mixError.value = null;
  lastSyncAt.value = null;
```

with:

```ts
  savedMixes.value = [];
  mixError.value = null;
  createPlaylistState.value = { status: 'idle' };
  lastSyncAt.value = null;
```

- [ ] **Step 2: Run typecheck + lint to confirm the state surface compiles**

Run: `yarn typecheck && yarn lint`
Expected: both clean. (`state.ts` now references `row.playlistUrl` / `view.playlistUrl` — those resolve against Task 1's `MixRow` fields and the `MixView` fields added in 1b. If typecheck reports "playlistUrl does not exist on type MixRow", Task 1's schema fields have not landed — stop and reconcile.)

- [ ] **Step 3: Add `ApiPlaylist` to `spotify/types.ts`**

Append after the last interface (pristine end of the file, after `ApiProfile`):

```ts

/** POST /me/playlists response (only the fields this feature reads). */
export interface ApiPlaylist {
  id: string;
  name: string;
  external_urls?: { spotify?: string };
}
```

- [ ] **Step 4: Write the failing test `src/features/mix/createPlaylist.test.ts`**

Nine tests, all against a mocked client (`get`/`post` spies) — no real Spotify. `get` matches any query **containing** a matchable title (format-agnostic, so it covers both `searchTrack`'s field query and its plain fallback) unless the title is in `misses`; titles are zero-padded (`T000`…`T249`) so no title is a substring of another. The `get` mock names `_path` before the used `query` (Global Constraints, `no-unused-vars` `args: after-used`).

```ts
import { describe, expect, it, vi } from 'vitest';
import { runCreatePlaylist } from './createPlaylist';
import type { CreatePlaylistState } from '../../model/state';
import type { Query, SpotifyClient } from '../../spotify/client';
import type { ApiPlaylist } from '../../spotify/types';
import type { TracklistRow } from '../../db/schema';
import { ApiError } from '../../spotify/errors';

const ARTIST = 'Artist';
const PLAYLIST: ApiPlaylist = {
  id: 'PL',
  name: 'n',
  external_urls: { spotify: 'https://open.spotify.com/playlist/PL' },
};

function id(title: string): TracklistRow {
  return {
    startSec: null,
    endSec: null,
    artist: ARTIST,
    title,
    label: null,
    source: 'manual',
    gap: false,
    detected: null,
    referenceCount: null,
  };
}
const gap: TracklistRow = { ...id(''), gap: true };
const idRow: TracklistRow = { ...id('unknown'), artist: 'ID' };
const empty: TracklistRow = { ...id(''), artist: '' };

/** Padded so no title is a substring of another (T005 vs T050). */
function t(n: number): string {
  return `T${String(n).padStart(3, '0')}`;
}
function ids(n: number): TracklistRow[] {
  return Array.from({ length: n }, (_, i) => id(t(i)));
}

/**
 * A mocked client. `get` matches any query CONTAINING a matchable title —
 * format-agnostic, so it covers both searchTrack's field and plain queries —
 * unless the title is in `misses`. `post` returns the created playlist for
 * /me/playlists and {} for each items batch, optionally rejecting the create
 * or one items batch (1-based). Returned spies are asserted on directly; the
 * cast client is what the runner receives.
 */
function makeClient(opts: {
  matchable: string[];
  misses?: Set<string>;
  getReject?: unknown;
  createReject?: unknown;
  itemsRejectOnCall?: number;
}) {
  const misses = opts.misses ?? new Set<string>();
  const get = vi.fn(async (_path: string, query?: Query) => {
    if (opts.getReject) throw opts.getReject;
    const q = String(query?.q ?? '');
    const hit = opts.matchable.find((title) => q.includes(title));
    if (!hit || misses.has(hit)) return { tracks: { items: [] } };
    return {
      tracks: {
        items: [
          {
            uri: `spotify:track:${hit}`,
            id: hit,
            name: hit,
            artists: [{ id: null, name: ARTIST }],
          },
        ],
      },
    };
  });
  let itemsCalls = 0;
  const post = vi.fn(async (path: string) => {
    if (path === '/me/playlists') {
      if (opts.createReject) throw opts.createReject;
      return PLAYLIST;
    }
    itemsCalls += 1;
    if (opts.itemsRejectOnCall === itemsCalls)
      throw new ApiError(500, 'add failed');
    return {};
  });
  const client = { get, post } as unknown as Pick<
    SpotifyClient,
    'get' | 'post'
  >;
  return { client, get, post };
}

function record() {
  const states: CreatePlaylistState[] = [];
  return { states, onState: (s: CreatePlaylistState) => void states.push(s) };
}
const input = (rows: TracklistRow[]) => ({
  name: 'My Mix',
  description: 'From https://example/mix · via DJ Data',
  rows,
});
const itemsBatches = (post: ReturnType<typeof makeClient>['post']) =>
  (post.mock.calls as unknown as Array<[string, { uris: string[] }]>)
    .filter((c) => c[0] !== '/me/playlists')
    .map((c) => c[1].uris);

describe('runCreatePlaylist', () => {
  it('resolves identified rows in order and never searches inert rows', async () => {
    const rows = [id(t(0)), gap, id(t(1)), idRow, id(t(2)), empty];
    const { client, get, post } = makeClient({ matchable: [t(0), t(1), t(2)] });
    const { states, onState } = record();

    await runCreatePlaylist({ client, onState }, input(rows));

    expect(get).toHaveBeenCalledTimes(3); // only the 3 identified rows
    const resolving = states.filter((s) => s.status === 'resolving');
    expect(
      resolving.map((s) => (s.status === 'resolving' ? s.done : -1))
    ).toEqual([0, 1, 2, 3]);
    expect(
      resolving.every((s) => s.status === 'resolving' && s.total === 3)
    ).toBe(true);
    expect(itemsBatches(post)[0]).toEqual([
      'spotify:track:T000',
      'spotify:track:T001',
      'spotify:track:T002',
    ]);
  });

  it('collects unmatched rows in mix order and omits them from the batch', async () => {
    const rows = [id(t(0)), id(t(1)), id(t(2))];
    const { client, post } = makeClient({
      matchable: [t(0), t(1), t(2)],
      misses: new Set([t(1)]),
    });
    const { states, onState } = record();

    await runCreatePlaylist({ client, onState }, input(rows));

    const done = states.at(-1);
    if (done?.status !== 'done') throw new Error('expected done');
    expect(done.unmatched).toEqual([{ artist: ARTIST, title: t(1) }]);
    expect(done.added).toBe(2);
    expect(done.total).toBe(3);
    expect(itemsBatches(post)[0]).toEqual([
      'spotify:track:T000',
      'spotify:track:T002',
    ]);
  });

  it('batches 250 URIs into 100/100/50 add calls, order preserved', async () => {
    const rows = ids(250);
    const { client, post } = makeClient({
      matchable: rows.map((r) => r.title),
    });
    const { onState } = record();

    const outcome = await runCreatePlaylist({ client, onState }, input(rows));

    const batches = itemsBatches(post);
    expect(batches.map((b) => b.length)).toEqual([100, 100, 50]);
    expect(batches.flat()).toEqual(rows.map((r) => `spotify:track:${r.title}`));
    expect(outcome).toEqual({
      playlistId: 'PL',
      url: 'https://open.spotify.com/playlist/PL',
    });
  });

  it('creates the playlist but adds nothing when no row matched', async () => {
    const rows = ids(2);
    const matchable = rows.map((r) => r.title);
    const { client, post } = makeClient({
      matchable,
      misses: new Set(matchable),
    });
    const { states, onState } = record();

    await runCreatePlaylist({ client, onState }, input(rows));

    expect(post).toHaveBeenCalledTimes(1); // create only, no items call
    expect(post.mock.calls[0][0]).toBe('/me/playlists');
    expect(states.map((s) => s.status)).not.toContain('adding');
    const done = states.at(-1);
    expect(
      done?.status === 'done' && done.added === 0 && done.total === 2
    ).toBe(true);
  });

  it('sends {name, public:false, description} to POST /me/playlists', async () => {
    const rows = ids(1);
    const { client, post } = makeClient({
      matchable: rows.map((r) => r.title),
    });
    const { onState } = record();

    await runCreatePlaylist({ client, onState }, input(rows));

    expect(post.mock.calls[0]).toEqual([
      '/me/playlists',
      {
        name: 'My Mix',
        public: false,
        description: 'From https://example/mix · via DJ Data',
      },
    ]);
  });

  it('surfaces the url and partial added count when an add batch fails', async () => {
    const rows = ids(150); // -> batches of 100 and 50
    const { client } = makeClient({
      matchable: rows.map((r) => r.title),
      itemsRejectOnCall: 2,
    });
    const { states, onState } = record();

    const outcome = await runCreatePlaylist({ client, onState }, input(rows));

    const err = states.at(-1);
    if (err?.status !== 'error') throw new Error('expected error');
    expect(err.url).toBe('https://open.spotify.com/playlist/PL');
    expect(err.added).toBe(100); // batch 1 landed, batch 2 rejected
    expect(outcome).toEqual({
      playlistId: 'PL',
      url: 'https://open.spotify.com/playlist/PL',
    });
  });

  it('errors when the create fails; no items call and no id comes back', async () => {
    const rows = ids(2);
    const { client, post } = makeClient({
      matchable: rows.map((r) => r.title),
      createReject: new ApiError(403, 'Insufficient client scope'),
    });
    const { states, onState } = record();

    const outcome = await runCreatePlaylist({ client, onState }, input(rows));

    expect(post).toHaveBeenCalledTimes(1); // create attempted, no items call
    expect(itemsBatches(post)).toEqual([]);
    expect(states.at(-1)?.status).toBe('error');
    expect(outcome).toEqual({ playlistId: null, url: null });
  });

  it('errors before creating when a search fails; no POST is sent', async () => {
    const rows = ids(3);
    const { client, post } = makeClient({
      matchable: rows.map((r) => r.title),
      getReject: new ApiError(0, 'offline'),
    });
    const { states, onState } = record();

    const outcome = await runCreatePlaylist({ client, onState }, input(rows));

    expect(post).not.toHaveBeenCalled();
    expect(states.at(-1)?.status).toBe('error');
    expect(outcome).toEqual({ playlistId: null, url: null });
  });

  it('drives the state sequence resolving*->creating->adding->done', async () => {
    const rows = ids(2);
    const { client } = makeClient({ matchable: rows.map((r) => r.title) });
    const { states, onState } = record();

    await runCreatePlaylist({ client, onState }, input(rows));

    expect(states.map((s) => s.status)).toEqual([
      'resolving',
      'resolving',
      'resolving',
      'creating',
      'adding',
      'done',
    ]);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `yarn test src/features/mix/createPlaylist.test.ts`
Expected: FAIL — the runner does not exist yet:

```
Error: Cannot find module './createPlaylist' imported from …/src/features/mix/createPlaylist.test.ts
```

- [ ] **Step 6: Implement `src/features/mix/createPlaylist.ts`**

```ts
import type { TracklistRow } from '../../db/schema';
// Type-only import: erased under verbatimModuleSyntax, so this file never
// evaluates state.ts (and its auth/browser localStorage) under Vitest. It
// MUST stay `import type`.
import type { CreatePlaylistState, UnmatchedRow } from '../../model/state';
import type { SpotifyClient } from '../../spotify/client';
import type { ApiPlaylist } from '../../spotify/types';
import { describeError } from '../../util/errors';
import { isIdentified, searchTrack, type RowMatch } from './spotifySearch';

export interface CreatePlaylistDeps {
  client: Pick<SpotifyClient, 'get' | 'post'>;
  onState: (s: CreatePlaylistState) => void;
}

export interface CreatePlaylistInput {
  /** Trimmed, non-empty playlist name (the wrapper builds it). */
  name: string;
  description: string;
  /** The mix's working list, in play order. */
  rows: TracklistRow[];
}

export interface CreatePlaylistOutcome {
  /** Non-null once the playlist exists, so the wrapper can persist it. */
  playlistId: string | null;
  url: string | null;
}

const ADD_BATCH = 100;

/**
 * Resolves every identified row via Search, creates a private playlist, then
 * adds the matched URIs in <=100 batches preserving order. Never throws: every
 * failure ends in an `error` onState (a partial add failure still surfaces the
 * created playlist's url and the count added so far). Returns the id/url so the
 * wrapper can persist them onto the mix.
 */
export async function runCreatePlaylist(
  deps: CreatePlaylistDeps,
  input: CreatePlaylistInput
): Promise<CreatePlaylistOutcome> {
  const { client, onState } = deps;
  const { name, description, rows } = input;

  // 1. Resolve identified rows in order; inert rows are skipped silently.
  const identified = rows.filter(isIdentified);
  const total = identified.length;
  const uris: string[] = [];
  const unmatched: UnmatchedRow[] = [];
  onState({ status: 'resolving', done: 0, total });
  let done = 0;
  for (const row of identified) {
    let match: RowMatch;
    try {
      match = await searchTrack(client, row);
    } catch (err) {
      onState({ status: 'error', message: describeError(err) });
      return { playlistId: null, url: null };
    }
    if (match.uri !== null) uris.push(match.uri);
    else unmatched.push({ artist: row.artist, title: row.title });
    onState({ status: 'resolving', done: ++done, total });
  }

  // 2. Create the private playlist.
  onState({ status: 'creating' });
  let playlist: ApiPlaylist;
  try {
    playlist = await client.post<ApiPlaylist>('/me/playlists', {
      name,
      public: false,
      description,
    });
  } catch (err) {
    onState({ status: 'error', message: describeError(err) });
    return { playlistId: null, url: null };
  }
  const playlistId = playlist.id;
  const url = playlist.external_urls?.spotify ?? null;

  // 3. Add the matched URIs in <=100 batches, in order. An empty match set
  // still leaves the private playlist created (the owner asked for it).
  let added = 0;
  if (uris.length > 0) {
    onState({ status: 'adding' });
    for (let i = 0; i < uris.length; i += ADD_BATCH) {
      const batch = uris.slice(i, i + ADD_BATCH);
      try {
        await client.post(`/playlists/${playlistId}/items`, { uris: batch });
      } catch (err) {
        // The playlist exists: surface its link and the count added so far,
        // never swallowed. The wrapper still persists the link (returns url).
        onState({ status: 'error', message: describeError(err), url, added });
        return { playlistId, url };
      }
      added += batch.length;
    }
  }

  // 4. Done.
  onState({ status: 'done', name, url, added: uris.length, total, unmatched });
  return { playlistId, url };
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `yarn test src/features/mix/createPlaylist.test.ts`
Expected: PASS — `Test Files  1 passed (1)`, `Tests  9 passed (9)`.

- [ ] **Step 8: Run the full gate**

Run: `yarn typecheck && yarn lint && yarn test && VITE_SPOTIFY_CLIENT_ID=x yarn build`
Expected: all four green. **44 test files / 561 tests** (552 after Task 2 + 9). `yarn build` succeeds at **88 modules**: `state.ts` does not import `createPlaylist.ts` yet (that wiring is Step 10, and its type-only import of the state union is erased), so the app graph is unchanged from Task 2. The rise to **90** lands at Step 11 once `startCreatePlaylist` imports the runner.

- [ ] **Step 9: Commit the runner and its state surface**

This commits `state.ts` in a **half-wired but compiling** state — the `createPlaylistState` signal and the two `MixView` fields exist and pass the gate, but `startCreatePlaylist` (and its two imports) arrive in Step 10. **Do not reorder Steps 9 and 10.**

```bash
git add src/features/mix/createPlaylist.ts src/features/mix/createPlaylist.test.ts src/spotify/types.ts src/model/state.ts
git commit -m "$(cat <<'EOF'
feat(mix): add the create-playlist runner and its state surface

runCreatePlaylist resolves every identified mix row via searchTrack (in
order, inert rows skipped), creates a private playlist (POST /me/playlists,
public:false), then adds the matched URIs to POST /playlists/{id}/items in
<=100 batches preserving order — driving a CreatePlaylistState onState. It
never throws: a Search failure errors before any write, and a batch failure
after create still surfaces the playlist url and the count added so far, so
a non-idempotent POST is never retried into a duplicate. Adds ApiPlaylist,
the CreatePlaylistState/UnmatchedRow union and its createPlaylistState
signal, and threads two optional playlistUrl/playlistId fields through
MixView / openMix / saveMix. createPlaylist.ts imports the state union as a
type only, so it never pulls auth/browser into Vitest.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu
EOF
)"
```

- [ ] **Step 10: Add the `startCreatePlaylist` wrapper and its two imports to `state.ts`**

**10a.** Add the two feature imports right after the mix-url import. Replace:

```ts
import { classifyMixInput, isShortLink } from '../features/mix/url';
```

with:

```ts
import { classifyMixInput, isShortLink } from '../features/mix/url';
import { runCreatePlaylist } from '../features/mix/createPlaylist';
import { canCreatePlaylists } from '../features/mix/spotifySearch';
```

**10b.** Insert `startCreatePlaylist` immediately **before** `openMix`'s doc comment (`/**\n * Reopens a saved mix from memory with no network call`):

```ts
/**
 * Creates a private Spotify playlist from the open mix (spec §4). Never on
 * load: only from the Mix screen's "Create playlist from mix" tap. Not a
 * jobsBusy() job — it writes only the one mix row and rebuilds no model, so it
 * clobbers nothing; re-entry is guarded on its own state. Without the granted
 * playlist-modify-private scope it saves the mix (so beginLogin's full-page
 * navigation cannot lose it) and reveals the needScope prompt instead.
 */
export async function startCreatePlaylist(): Promise<void> {
  const status = createPlaylistState.value.status;
  if (status === 'resolving' || status === 'creating' || status === 'adding') {
    return;
  }
  const state = mixState.value;
  if (state.status !== 'ready') return;
  const view = state.view;
  const rows = mixRows.value;

  if (!canCreatePlaylists(auth.session.value)) {
    if (!(await saveMix())) return;
    createPlaylistState.value = { status: 'needScope' };
    return;
  }

  // Claim the running state synchronously so a second tap cannot double-run,
  // with the `as CreatePlaylistState` cast the codebase uses (startSync /
  // startMixLookup) to hold the signal at its declared union type.
  createPlaylistState.value = {
    status: 'resolving',
    done: 0,
    total: 0,
  } as CreatePlaylistState;

  const name = (
    (view.title ?? 'Mix tracklist').trim() || 'Mix tracklist'
  ).slice(0, 100);
  const description = `From ${view.url} · via DJ Data`.slice(0, 300);

  const outcome = await runCreatePlaylist(
    {
      client: api,
      onState: (s) => {
        createPlaylistState.value = s;
      },
    },
    { name, description, rows }
  );

  // Persist whenever the playlist was created (even on a partial add failure):
  // put the link/id on the open view, then Save carries them into the mix row
  // (a rejected putMix shows via mixError; the link is already on screen).
  if (outcome.playlistId !== null) {
    mixState.value = {
      status: 'ready',
      view: {
        ...view,
        playlistUrl: outcome.url ?? undefined,
        playlistId: outcome.playlistId,
      },
    };
    await saveMix();
  }
}

```

- [ ] **Step 11: Run the full gate again**

`state.ts` has no unit test, so `startCreatePlaylist` is proven by the gate.

Run: `yarn typecheck && yarn lint && yarn test && VITE_SPOTIFY_CLIENT_ID=x yarn build`
Expected: all four green, **44 files / 561 tests** (`startCreatePlaylist` adds no test). `yarn build` now pulls `createPlaylist.ts` → `spotifySearch.ts` into the app graph via `state.ts`, so the module count rises to **90**. If typecheck reports `canCreatePlaylists` or `runCreatePlaylist` as not found, Task 2 / Step 6 have not landed — reconcile before committing.

- [ ] **Step 12: Verification — this task ships no screen**

`createPlaylist.ts` and `state.ts` render nothing on their own, so there is no 390-px browser walkthrough in this task. The button, the prompt, the progress, the result, the not-found list, the error and the durable link are Task 4 (`src/ui/Mix.tsx`, spec §5). Confirm only that the Step 11 gate is fully green before committing.

- [ ] **Step 13: Commit the wrapper**

```bash
git add src/model/state.ts
git commit -m "$(cat <<'EOF'
feat(mix): wire startCreatePlaylist into state

Adds the create-playlist button action: guards re-entry on its own state,
requires an open ready mix, gates on canCreatePlaylists (saving the mix and
revealing the needScope prompt when the scope is missing, so beginLogin's
full-page navigation cannot lose it), claims the resolving state
synchronously, builds the verbatim-title name and the source-url description
(defensive <=100 / <=300 caps), runs runCreatePlaylist against the shared api
client, and on a created playlist threads playlistUrl/playlistId onto the view
and Saves. Not a jobsBusy() job and never reloads the model; closeMix and
disconnect reset createPlaylistState.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu
EOF
)"
```

---

## Task 4: The Mix screen — create-playlist button, states, and styles

Add the whole create-playlist UI to the existing Mix screen (spec §5): the **"Create playlist from mix"** button (shown only when the open mix has ≥1 identified row); the `needScope` prompt and its **"Connect again to allow playlists"** control; the progress line; the `done` result with the collapsible "K not found" list; the inline `error` line (with the playlist link and partial count when the playlist was already created); and the durable "Playlist created · Open in Spotify" link on reopen. It also refactors `Mix.tsx`'s private `isInert` to reuse the shared `isIdentified` (spec §3), and adds spec §6's one small disclosure style. Everything lives inside the existing `Ready` view, between `<Tracklist />` and `<PasteBox />`.

**Screens have no unit tests in this project** (spec §7), and `state.ts` cannot be unit-tested, so this task carries **no RED/GREEN test cycle**: it is verified by the full gate (with the suite count **unchanged** — no test is added) plus the browser walkthrough in Step 7.

**This task consumes symbols Tasks 1–3 create, so its gate (Step 6) is only runnable once Tasks 1–3 have landed.**

**Files:**
- Modify: `src/ui/Mix.tsx` — the import block, the `isInert` helper, a new module-private `CreatePlaylistPanel`, and one line in `Ready`.
- Modify: `src/styles.css` — one appended block.
- Test: none.

**Interfaces:**
- Consumes, from `src/features/mix/spotifySearch.ts`: `isIdentified(row: TracklistRow): boolean` (Task 4 imports **only** this symbol).
- Consumes, from `src/model/state.ts`: `interface UnmatchedRow`; the `CreatePlaylistState` union (all arms read); `const createPlaylistState: Signal<CreatePlaylistState>`; `function startCreatePlaylist(): Promise<void>`; `MixView.playlistUrl?` (reads only this field). Plus existing/unchanged signals and actions already imported by `Mix.tsx`.
- Consumes, existing: `src/auth/browser.ts` `export const auth` — Task 4 calls `auth.logout(): void` (the Settings "Connect again" path); it does **not** read `auth.session` (Decision 9). `Progress({label,done,total,unit?})`; `SpotifyLink({href,label?})` (the `label` form renders `Open in Spotify` with no arrow — Decision 8).
- Produces: nothing (leaf). `CreatePlaylistPanel` is module-private; `Mix()`'s signature is unchanged.

**Notes:**
- **A.** Button visibility is `identified` only — no session check (Decision 9).
- **B.** `isInert` becomes `(r) => !isIdentified(r)`; the local `INERT` constant and the now-unused `normalize` import are removed (verified: `normalize` is used only inside `isInert` in `Mix.tsx`).
- **C.** Progress copy per Decision 10: the running button reads `Creating playlist…`; the creating-state paragraph reads `Creating the playlist…`. At the synchronous claim the runner starts at `{ resolving, done: 0, total: 0 }`, so `Progress` shows only its label until the runner sets the real `total` (correct — `Progress` hides the bar/count when `total === 0`).
- **D.** The `error` arm carries no `total`; `CreatePlaylistPanel` supplies it from the render-time `identifiedCount` (Decision 7).
- **E.** `cs.added !== undefined`, never truthiness — a batch-1 failure reports `added: 0` and "Added 0 of N before the error." must still render.
- **F.** The durable link renders only when `view.playlistUrl` is set **and** `cs.status` is `idle` or `needScope` (during `done`/`error` the result already carries the same link).
- **G.** The literal curly quotes/em-dash in the `done` copy lint clean (no `eslint-plugin-react` in this config).
- **H.** The button is a bare `<button class="primary">` (matches the shipped top `Look up` button, `min-height: 48px`); no button-width CSS is added (spec §6).

---

- [ ] **Step 1: Rewrite the import block of `src/ui/Mix.tsx`**

Replace this exact block (the top of the file):

```tsx
import { useEffect, useState } from 'preact/hooks';
import type { TracklistRow } from '../db/schema';
import { parseClock } from '../features/mix/parse';
import {
  libraryTitleIndex,
  matchMixRow,
  type MixMatch,
} from '../features/mix/match';
import { normalize } from '../model/normalize';
import {
  addMixRow,
  applyDescriptionTracklist,
  applyPastedTracklist,
  closeMix,
  deleteMixRow,
  editMixRow,
  loadSavedMixes,
  mixError,
  mixRows,
  mixState,
  model,
  openMix,
  removeMix,
  saveMix,
  savedMixes,
  startMixLookup,
  type MixView,
} from '../model/state';
import { FeaturePills } from './components/FeaturePills';
import { TrackRow } from './components/TrackRow';
import { formatClock, formatDate, plural } from './format';
```

with:

```tsx
import { useEffect, useState } from 'preact/hooks';
import { auth } from '../auth/browser';
import type { TracklistRow } from '../db/schema';
import { parseClock } from '../features/mix/parse';
import {
  libraryTitleIndex,
  matchMixRow,
  type MixMatch,
} from '../features/mix/match';
import { isIdentified } from '../features/mix/spotifySearch';
import {
  addMixRow,
  applyDescriptionTracklist,
  applyPastedTracklist,
  closeMix,
  createPlaylistState,
  deleteMixRow,
  editMixRow,
  loadSavedMixes,
  mixError,
  mixRows,
  mixState,
  model,
  openMix,
  removeMix,
  saveMix,
  savedMixes,
  startCreatePlaylist,
  startMixLookup,
  type MixView,
} from '../model/state';
import { FeaturePills } from './components/FeaturePills';
import { Progress } from './components/Progress';
import { SpotifyLink } from './components/SpotifyLink';
import { TrackRow } from './components/TrackRow';
import { formatClock, formatDate, plural } from './format';
```

- [ ] **Step 2: Refactor `isInert` to reuse `isIdentified`**

Replace this exact block:

```tsx
/**
 * A gap row and a `?`/`ID`/`unknown` row get no Spotify search and no match.
 * `normalize` narrows `?` to '', so the empty string is inert too.
 */
const INERT = new Set(['', 'id', 'unknown']);

function isInert(row: TracklistRow): boolean {
  return (
    row.gap ||
    INERT.has(normalize(row.artist)) ||
    INERT.has(normalize(row.title))
  );
}
```

with:

```tsx
/**
 * A gap row and a `?`/`ID`/`unknown` row get no Spotify search and no match.
 * The positive predicate `isIdentified` now lives in `spotifySearch.ts` (the
 * create-playlist feature searches exactly those rows); the screen keeps one
 * negation so the two never diverge. `normalize` there narrows `?` to '', so
 * the empty string is inert too.
 */
function isInert(row: TracklistRow): boolean {
  return !isIdentified(row);
}
```

- [ ] **Step 3: Add the `CreatePlaylistPanel` component**

Insert this component immediately **before** `function PasteBox() {`. Replace this exact line:

```tsx
function PasteBox() {
```

with (the whole component, then the original `PasteBox` line):

```tsx
/**
 * Spec §5: create a private Spotify playlist from the open mix's identified
 * rows. The button shows whenever at least one identified row exists — there is
 * always a session inside `Mix.tsx` (app.tsx renders `<Connect/>` when
 * `!auth.session.value`), so a session is not part of the visibility condition;
 * the real gate is the scope, checked on tap inside `startCreatePlaylist`
 * (which reveals the `needScope` prompt). Every failure is rendered inline
 * through `createPlaylistState`; the screen raises no banner.
 */
function CreatePlaylistPanel(p: { view: MixView }) {
  const { view } = p;
  const cs = createPlaylistState.value;
  // The count of rows the create job will attempt (N). Also stands in for the
  // `total` §5's error line references, which the `error` arm does not carry:
  // an add-batch failure happens only after every identified row resolved, so
  // the attempted N equals this render-time count.
  const identifiedCount = mixRows.value.filter(isIdentified).length;
  const identified = identifiedCount > 0;
  const running =
    cs.status === 'resolving' ||
    cs.status === 'creating' ||
    cs.status === 'adding';
  return (
    <>
      {identified && (
        <button
          type="button"
          class="primary"
          disabled={running}
          onClick={() => void startCreatePlaylist()}
        >
          {running ? 'Creating playlist…' : 'Create playlist from mix'}
        </button>
      )}
      {cs.status === 'needScope' && (
        <>
          <p class="muted">
            This app cannot create playlists yet — connect again to allow it.
            Your saved mixes stay on this phone.
          </p>
          <button type="button" onClick={() => auth.logout()}>
            Connect again to allow playlists
          </button>
        </>
      )}
      {cs.status === 'resolving' && (
        <Progress
          label="Matching tracks"
          done={cs.done}
          total={cs.total}
          unit="tracks"
        />
      )}
      {cs.status === 'creating' && <p class="muted">Creating the playlist…</p>}
      {cs.status === 'adding' && <p class="muted">Adding tracks…</p>}
      {cs.status === 'done' && (
        <>
          <p>
            Created ‘{cs.name}’ — {cs.added} of {cs.total} tracks
            {cs.url !== null && (
              <>
                {' · '}
                <SpotifyLink href={cs.url} label />
              </>
            )}
          </p>
          {cs.unmatched.length > 0 && (
            <details>
              <summary>{cs.unmatched.length} not found</summary>
              <ul class="list">
                {cs.unmatched.map((u, i) => (
                  <li key={i}>
                    {u.artist} – {u.title}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      {cs.status === 'error' && (
        <>
          <p class="error">Could not create the playlist: {cs.message}</p>
          {cs.url != null && (
            <p>
              Playlist created · <SpotifyLink href={cs.url} label />
            </p>
          )}
          {/* `!== undefined`, not truthiness: a batch-1 failure reports
              `added: 0`, and "Added 0 of N before the error." must still show —
              the no-swallow rule protects exactly that case. */}
          {cs.added !== undefined && (
            <p class="muted">
              Added {cs.added} of {identifiedCount} before the error.
            </p>
          )}
        </>
      )}
      {view.playlistUrl != null &&
        (cs.status === 'idle' || cs.status === 'needScope') && (
          <p>
            Playlist created · <SpotifyLink href={view.playlistUrl} label />
          </p>
        )}
    </>
  );
}

function PasteBox() {
```

- [ ] **Step 4: Render the panel inside `Ready`, between the tracklist and the paste box**

Replace this exact block (the tail of the `Ready` component's JSX):

```tsx
      <Tracklist />
      <PasteBox />
    </>
  );
}
```

with:

```tsx
      <Tracklist />
      <CreatePlaylistPanel view={view} />
      <PasteBox />
    </>
  );
}
```

- [ ] **Step 5: Append spec §6's disclosure style to `src/styles.css`**

Append this block to the **end** of the file (after the last existing rule, `.mix .src { … }`):

```css

/* Spec §5/§6: the create-playlist "not found" disclosure on the Mix screen.
   The base `details.card > summary` rule only styles card summaries; this
   mirrors it for the inline disclosure — a pointer cursor and a ≥44px tap
   target — while keeping the default `list-item` display so the triangle
   marker stays. The list reuses `.list`; its rows get a readable line-height.
   No other new CSS: the button reuses `.primary`, and the
   prompt/progress/error lines reuse `.muted`/`.error`. */
.mix details > summary {
  cursor: pointer;
  min-height: 44px;
  padding: 10px 0;
  color: var(--muted);
}

.mix details .list li {
  padding: 4px 0;
  font-size: 0.9rem;
}
```

- [ ] **Step 6: Run the full gate**

This step needs Tasks 1–3 merged. On the assembled branch:

Run: `yarn typecheck && yarn lint && yarn test && VITE_SPOTIFY_CLIENT_ID=x yarn build`

Expected: all four pass. **The test suite count is unchanged from Task 3 — 44 files / 561 tests** — this task adds no test, and `Mix.tsx` adds no new module to the build graph (`Progress` and `SpotifyLink` are already in the graph). Build modules stay at **90**.

Run: `npx prettier --check src/ui/Mix.tsx`
Expected: `All matched files use Prettier code style!` Check `Mix.tsx` only — `src/styles.css` carries a pre-existing prettier non-conformance on its font-stack line (`'Segoe UI'`) that predates this feature and is not a gate; the CSS block this task appends is itself prettier-clean (confirmed by appending it to the pristine file and diffing: prettier's only change is the pre-existing font line).

- [ ] **Step 7: Walk the screen in the browser at 390 px**

Screens have no unit tests, so this is the verification.

> **What makes this runnable without a real Spotify login:** the mix **lookup** is keyless (SoundCloud oEmbed + TrackId.net), so a **stubbed** session lets the whole app render and a real SoundCloud link resolves. But **creating** a playlist needs the widened scope, which only a **real** re-login can grant — so this walkthrough exercises the button gating, the `needScope` prompt and (optionally) the inline error, but **cannot** produce a real `done` result. State that limit honestly when reporting.

Run `yarn dev` and open `http://127.0.0.1:5173/myOwnSpotifyData/` — never `localhost` — at **390 px** wide.

1. **Stub a session (no create scope).** In the devtools console:
   ```js
   localStorage.setItem(
     'session',
     JSON.stringify({
       accessToken: 'stub',
       expiresAt: Date.now() + 3600e3,
       refreshToken: 'stub',
       scope: 'user-top-read playlist-read-private',
     })
   );
   location.reload();
   ```
   The app renders (not the Connect screen), confirming a session is present — the reason the button omits a session check.
2. **Open a mix with identified rows.** Settings → `Open mix tracklist ›` (`#/mix`). Paste a real SoundCloud DJ-mix link that has identified tracks, `Look up`. Identified `Artist – Title` rows appear.
3. **Button gating.** With ≥1 identified row, the primary **`Create playlist from mix`** button shows below the tracklist, above the paste box. `Delete` the identified rows until only gap rows (or none) remain — the button **disappears** — then `Add track`, give the blank row an artist and title, `Save` — the button **reappears**. (`Add track` needs no network.)
4. **`needScope` prompt.** Tap `Create playlist from mix`. Because the stub lacks the scope, `startCreatePlaylist` saves the mix, then sets `needScope`. Under the button: `This app cannot create playlists yet — connect again to allow it. Your saved mixes stay on this phone.` and a `Connect again to allow playlists` button. The `Create playlist from mix` button is **still shown and still reads that label**.
5. **§2's save-first.** Tap `‹ Mixes` (or reload): the mix is now in the saved list. This proves `saveMix` ran **before** the prompt.
6. **The re-login control.** Reopen the mix, tap `Create playlist from mix`, then `Connect again to allow playlists`: the app re-renders **Connect** (`auth.logout()` cleared the session). The walkthrough stops here — a real re-login needs real Spotify credentials.
7. **Optional — the inline error path.** Re-run step 1 with `scope: 'user-top-read playlist-read-private playlist-modify-private'`, reload, open a mix, tap `Create playlist from mix`. `canCreatePlaylists` is now true, so `searchTrack` runs with the bogus bearer → a 401 that cannot refresh → `error`: `Could not create the playlist: <message>` renders (no banner).
8. **What is NOT verifiable here (say so honestly):** the `done` result and the durable link — both need a real create (real login + widened scope). Covered by Tasks 1–3's unit tests plus this task's compile-verified rendering.
9. **390 px layout.** No horizontal scrollbar. The buttons are ≥44 px tap targets; the prompt wraps cleanly.

Clear the stub afterwards (`localStorage.removeItem('session'); location.reload();`).

- [ ] **Step 8: Commit the screen**

```bash
git add src/ui/Mix.tsx src/styles.css
git commit -m "$(cat <<'EOF'
feat(mix): create-playlist button, states and styles on the Mix screen

Adds CreatePlaylistPanel inside Ready (spec §5): the "Create playlist from
mix" button (shown when >=1 identified row, never relabelled), the needScope
prompt with "Connect again to allow playlists", the Matching-tracks progress,
the "Created '…' — M of N tracks · Open in Spotify" result with a collapsible
"N not found" list, the inline error (with the link and partial count when the
playlist already exists), and the durable "Playlist created" link on reopen.
Refactors isInert to !isIdentified and adds one small disclosure style.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu
EOF
)"
```

---

## Task 5: README, CLAUDE.md, and the spec's items-vs-tracks ruling

The spec is the binding document, so it must say what was actually built. This task settles the spec's one open implementation point — the `items` vs `tracks` add-endpoint path segment (§4, §8, Open point 1) — then brings `README.md` (owner's manual) and `CLAUDE.md` (architecture map) up to date. It touches **no source file and adds no test**: a reviewer can reject a doc line while approving the runner and the screen. Docs-only — the gate must report the same numbers Task 4 left behind.

**Files:**
- Modify: `docs/superpowers/specs/2026-09-06-mix-playlist-design.md` (three replacements: §4's "The add endpoint path." paragraph, §8's "Endpoints used." bullet, and Open point 1).
- Modify: `README.md` (two replacements: the privacy clause, and a new "Create playlist from mix" paragraph appended to the **Mix tracklist** bullet).
- Modify: `CLAUDE.md` (five replacements: the `spotify/`, `db/` and `features/` Architecture bullets, the "Mix screen is not one of the five jobs" Conventions bullet, and one new Conventions bullet for the scope + re-login).
- Test: none. Nothing executable changes.
- Do not touch: every file under `src/`. If this task needs a source edit, a doc line is wrong — fix the line, not the code.

**Notes:**
- **`.prettierignore` lists `docs/`** (verified), so the spec is never reflowed by Prettier. Both root-doc (`README.md`/`CLAUDE.md`) AFTER blocks below are already Prettier output (`prettier --check README.md CLAUDE.md` passes — do **not** run `yarn format`, which would also touch the pre-existing `'Segoe UI'` line in `src/styles.css`); do not hand-wrap CLAUDE's long single-line bullets (`proseWrap: preserve`). Prettier normalises single-asterisk emphasis `*word*` to `_word_`, so bullet 4e uses `_original_`.
- **Every BEFORE block was checked to appear exactly once** in its file at `4e8d649`, and none is touched by Tasks 1–4.
- **The items-vs-tracks path is verified from the shipped code, not assumed** (Step 1's first action greps the runner). Decision 6 shipped `/items`; the AFTER blocks are written for `/items`.

---

- [ ] **Step 1: Settle the spec's `items` vs `tracks` open point (§4, §8, Open point 1)**

First, confirm which path segment shipped:

Run: `grep -rn "playlists/.*items\|playlists/.*tracks\|/items\|/tracks" src/features/mix/createPlaylist.ts src/features/mix/createPlaylist.test.ts`

Expected: the runner builds `POST /playlists/${playlistId}/items`. (If instead `/tracks` shipped, swap every `/items` → `/tracks` in the three AFTER blocks below before applying.)

**1a — §4 "The add endpoint path." paragraph.** Replace:

````markdown
**The add endpoint path.** Specify **`POST /playlists/{playlist_id}/items`**
`(confirm the path segment at implementation)`. The `/tracks` path is the
deprecated spelling; the current one is `/items`. **Confirm** by reading the Web
API reference page "Add Items to Playlist" and checking the request line for
`items` vs `tracks` — one doc read, not a re-research task. There is internal
corroboration to weigh: `spotify/types.ts` already documents the February-2026
rename of the playlist-item field from `track` (legacy) to `item` (current) on
`ApiPlaylistItem`, the same modernisation. **If it is wrong**, a 404 arrives
*after* the playlist exists (step 3), so it surfaces inline **with** the playlist
link and the added count (never swallowed), and switching the path to `/tracks`
is a one-line change, not a redesign.
````

with:

````markdown
**The add endpoint path.** The add call is
**`POST /playlists/{playlist_id}/items`** — the `/items` spelling shipped.
`/tracks` is the deprecated spelling; `/items` is the current one, the same
February-2026 modernisation `spotify/types.ts` already documents on
`ApiPlaylistItem` (the `track` legacy → `item` current field rename). A 404 from
this call would arrive *after* the playlist exists (step 3), so it surfaces
inline **with** the playlist link and the added count (never swallowed); the
strict match rule and the inline reporting hold either way.
````

**1b — §8 "Endpoints used." bullet.** Replace:

````markdown
- **Endpoints used.** `GET /search?q=&type=track&limit=5` (bearer only, survives
  the Feb-2026 changes); `POST /me/playlists { name, public:false, description }`
  (`playlist-modify-private`); `POST /playlists/{id}/items { uris }` batches of
  ≤100 `(confirm the `items` vs deprecated `tracks` path segment at
  implementation — read the "Add Items to Playlist" reference)`.
````

with:

````markdown
- **Endpoints used.** `GET /search?q=&type=track&limit=5` (bearer only, survives
  the Feb-2026 changes); `POST /me/playlists { name, public:false, description }`
  (`playlist-modify-private`); `POST /playlists/{id}/items { uris }` batches of
  ≤100. The `/items` spelling shipped (`/tracks` is the deprecated one), the
  same Feb-2026 modernisation `spotify/types.ts` documents on `ApiPlaylistItem`.
````

**1c — Open point 1 becomes a resolved ruling.** Replace:

````markdown
1. **Add-tracks path (`items` vs `tracks`).** Specified as
   `POST /playlists/{playlist_id}/items` with an explicit
   `(confirm at implementation)` and a named confirmation step (read the "Add
   Items to Playlist" reference). **Assumption:** `items` is current and `tracks`
   deprecated, corroborated by the Feb-2026 `item`/`track` field rename already
   documented in `spotify/types.ts`. A wrong guess is a one-line, safe fix after
   the playlist already exists.
````

with:

````markdown
1. **Add-tracks path (`items` vs `tracks`) — resolved.** The add call shipped as
   `POST /playlists/{playlist_id}/items`. `/items` is current and `/tracks` the
   deprecated spelling, corroborated by the Feb-2026 `item`/`track` field rename
   `spotify/types.ts` documents on `ApiPlaylistItem` (and by `ApiPlaylistSummary`
   carrying both `items` and `tracks` totals). §4 and §8 above are settled to
   `/items`; nothing here is left to confirm.
````

- [ ] **Step 2: Update the README privacy clause**

Replace (the sentence wraps across two lines — match both):

````markdown
`w.soundcloud.com`) — and only when you start one of them. No token, no
playlist and no listening history ever leaves the browser.
````

with:

````markdown
`w.soundcloud.com`) — and only when you start one of them. The only thing the
app ever writes back to Spotify is a playlist you explicitly ask for: **Create
playlist from mix** sends a name and the matched track ids to your own Spotify
account, on that tap alone. No token and no listening history ever leaves the
browser.
````

- [ ] **Step 3: Add the "Create playlist from mix" paragraph to the README owner's manual**

Replace this exact two-line anchor:

````markdown
  like any other playlist.
- **Re-import once for the Crate.** An import made before the Crate shipped
````

with:

````markdown
  like any other playlist.
  Once the list is right, **Create playlist from mix** turns it into a private
  Spotify playlist: it searches Spotify for each identified row, adds the tracks
  it can match with confidence, and lists the ones it could not under a
  "N not found" line so you can add them by hand — it never guesses a wrong
  track onto the playlist. The first time, Spotify needs one more permission:
  tap the button, then **Connect again → Connect Spotify** to grant it (your
  saved mixes stay on this phone), reopen the mix and tap the button again. It
  **never** creates a playlist on its own — only on that tap — and tapping it
  again makes **another** new playlist rather than editing the last one. A mix
  that has a playlist shows a **Playlist created · Open in Spotify ›** link when
  you reopen it.
- **Re-import once for the Crate.** An import made before the Crate shipped
````

- [ ] **Step 4: Update CLAUDE.md**

Five replacements. Each BEFORE line is a single long line; keep the AFTER lines single and long too (`proseWrap: preserve`).

**4a — the `spotify/` Architecture bullet.** Replace:

````markdown
- `spotify/` the API client (`createClient`: bearer, 401 refresh-once, 429 backoff, quota lock-out, one request in flight) and the API types.
````

with:

````markdown
- `spotify/` the API client (`createClient`: bearer, 401 refresh-once, 429 backoff, quota lock-out, one request in flight) and the API types. The client has both `get` and `post`; `post<T>(path, body, query?)` reuses the same enqueue / 401-refresh-once / short-429 machinery but is **never retried on a 5xx or a network error** — a `POST` is not idempotent, so a resend could create a duplicate playlist or duplicate tracks, and it throws immediately instead (only `get` keeps the `MAX_5XX_RETRIES` backoff).
````

**4b — the `db/` Architecture bullet's tail.** Replace:

````markdown
reached through three dedicated repo functions (`getMixes`, `putMix`, `deleteMix`), never through the model rebuild.
````

with:

````markdown
reached through three dedicated repo functions (`getMixes`, `putMix`, `deleteMix`), never through the model rebuild. `MixRow` also carries two optional fields, `playlistUrl?` and `playlistId?` (the external URL and id of the last playlist created from that mix), added with **no `DB_VERSION` bump** — an optional field on the `keyPath: 'url'` store reads back `undefined` on old rows, the same pattern `PlayRow`'s optional `months`/`attempts` fields use.
````

**4c — the `features/` Architecture bullet's tail.** Replace:

````markdown
Every fetch is a pure function behind an injected `fetchFn` and returns a discriminated result — it never throws, and nothing is swallowed.
````

with:

````markdown
Every fetch is a pure function behind an injected `fetchFn` and returns a discriminated result — it never throws, and nothing is swallowed. Creating a Spotify playlist from a mix adds two more files to `features/mix/`: `spotifySearch.ts` (`canCreatePlaylists`, the pure scope check; `isIdentified`; `pickMatch`, the strict artist-and-title accept rule that never returns a wrong track; and `searchTrack`, the per-row `GET /search` that runs a field query then a plain fallback) and `createPlaylist.ts` (`runCreatePlaylist`: resolve every identified row, `POST /me/playlists`, then add the matched track URIs in batches of ≤100, driving an `onState` callback and never throwing). `state.ts`'s thin `startCreatePlaylist` wires them to the Mix screen; the runner and the search are unit-tested with a mocked client, the wrapper is not (it imports the browser singletons, like the other `start*` functions).
````

**4d — the "Mix screen is not one of the five jobs" Conventions bullet.** Replace:

````markdown
- **The Mix screen is not one of the five jobs.** `#/mix` drafts a SoundCloud mix's tracklist from two free keyless public lookups (SoundCloud oEmbed and TrackId.net) plus a paste-your-own box; it touches no Spotify quota and never runs on load — the lookup runs only from the screen's `Look up` button. **The mix lookup is deliberately NOT part of `jobsBusy()`** and does not call `loadFromDb()`: it writes no library store and rebuilds no `Model`, so it needs no mutual exclusion with sync, history import, the ReccoBeats lookup, the Rekordbox import or the artist-reach run — and `disconnect`'s "wait for the current …" guard therefore does not mention it, though `mixState`, `mixRows` and `savedMixes` are still reset alongside the other signals. Library matches are never stored: a row is matched live at render time, because a resync would make a stored match stale.
````

with:

````markdown
- **The Mix screen is not one of the five jobs.** `#/mix` drafts a SoundCloud mix's tracklist from two free keyless public lookups (SoundCloud oEmbed and TrackId.net) plus a paste-your-own box; it touches no Spotify quota and never runs on load — the lookup runs only from the screen's `Look up` button. **Neither the mix lookup nor the "Create playlist from mix" job is part of `jobsBusy()`**, and neither calls `loadFromDb()`: they write no library store and rebuild no `Model`, so they need no mutual exclusion with sync, history import, the ReccoBeats lookup, the Rekordbox import or the artist-reach run — and `disconnect`'s "wait for the current …" guard therefore mentions neither, though `mixState`, `mixRows`, `savedMixes` and `createPlaylistState` are all reset alongside the other signals (`closeMix` resets `createPlaylistState` too). The create job guards its own re-entry on `createPlaylistState.status` instead — a second tap is ignored while it is `resolving`/`creating`/`adding`. Library matches are never stored: a row is matched live at render time, because a resync would make a stored match stale.
````

**4e — a new Conventions bullet: the scope and the one-time re-login.** Replace this exact line (the tab-bar bullet's opening):

````markdown
- **The tab bar is Crate · Top · Playlists · Artists · Settings.** Import and Mix are not tabs:
````

with (note `_original_`, not `*original*`):

````markdown
- **Creating a playlist is the app's only write to the owner's Spotify library, and it is gated on a one-time re-login.** `SCOPES` (`auth/session.ts`) requests `playlist-modify-private` so the "Create playlist from mix" button can `POST /me/playlists`. **A token refresh returns the scope the _original_ grant had, so it can never widen an old session** — an owner logged in before this shipped must authorise once more: the button reveals a prompt, then **Connect again → Connect Spotify** re-grants the widened scopes (the mix is saved first, so the full-page login navigation cannot lose it). `canCreatePlaylists(session)` gates the button by splitting `session.scope` on spaces (never `String.includes`, so a substring cannot satisfy it). Creation fires **only** on a deliberate tap — never on load, never on a lookup, never on reopen — makes a **private** playlist of only the tracks Search matched confidently, and is **never** relabelled: tapping again makes another new playlist. Every failure (a 403 insufficient-scope, a 401 that cannot refresh, a network error, a partial add, a `QuotaError`) is shown inline on the Mix screen, never a banner, and a create-time `QuotaError` does not touch the Settings sync card's lock state.
- **The tab bar is Crate · Top · Playlists · Artists · Settings.** Import and Mix are not tabs:
````

- [ ] **Step 5: Check the documents and confirm the gate is unchanged**

Run: `npx prettier --check README.md CLAUDE.md && yarn typecheck && yarn lint && yarn test && VITE_SPOTIFY_CLIENT_ID=x yarn build`

Expected: all pass, **identical to Task 4's gate** — this step edits only Markdown:

```
Test Files  44 passed (44)
Tests       561 passed (561)
✓ 90 modules transformed.
```

Both root-doc AFTER blocks are already Prettier output, so `prettier --check README.md CLAUDE.md` reports "All matched files use Prettier code style!" and nothing needs reflowing. (Do **not** run `yarn format` here: `prettier --write .` would also rewrite the pre-existing `'Segoe UI'` font line in `src/styles.css`, an unrelated change this docs task must not make.) If the test/module totals differ from Task 4's, a code file was touched — fix the doc, not the code.

Then skim `git diff` on the three documents:
- the spec should show exactly three hunks (§4 paragraph, §8 bullet, Open point 1) and no fenced code block inside it reflowed by Prettier;
- `README.md` and `CLAUDE.md` should show only the prose edits above.

- [ ] **Step 6: Browser verification — README claims against the running screen**

This task owns no screen; verify the owner-manual prose against the real UI (needs Tasks 1–5 landed, and ideally a mix that already has a created playlist). Start `yarn dev`, open `http://127.0.0.1:5173/myOwnSpotifyData/#/mix` at **390 px**, and confirm:
- the button label reads exactly **Create playlist from mix** (never relabelled), a full-width ≥44 px tap target;
- a finished create shows the **"‘\<name\>’ — M of N tracks · Open in Spotify ›"** result line;
- when some rows did not match, an **"N not found"** collapsible lists them in mix order;
- a reopened saved mix that has a playlist shows the durable **"Playlist created · Open in Spotify ›"** link, and tapping the button again starts *another* new playlist.

If any label differs from the README paragraph, the README is what changes (or, if the screen contradicts spec §5, that is a Task-4 defect).

- [ ] **Step 7: Commit the documents**

```bash
git add docs/superpowers/specs/2026-09-06-mix-playlist-design.md README.md CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(mix): create-playlist owner manual, architecture map, items path ruling

README gains the "Create playlist from mix" walkthrough and a corrected
privacy clause (a playlist now goes outbound). CLAUDE.md documents the client
post, MixRow's two optional fields (no DB_VERSION bump), the two features/mix
files, the create job staying out of jobsBusy(), and the scope + re-login
gotcha. The spec's items-vs-tracks open point is settled to /items.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu
EOF
)"
```

Do not push. The owner pushes.

## Self-Review

**Spec coverage:** §2 (scope Task 1; check Task 1; re-login flow Tasks 3/4), §3 (all of Task 2 + runner zero-fetch Task 3), §4 (client post Task 1; runner + state Task 3), §5 (screen Task 4), §6 (reuse + one style Task 4), §7 (tests Tasks 1–3; walkthrough Task 4), §8 (docs Task 5) — see the coverage table above.

**Placeholder scan:** every code step carries full code; the only measured numbers are pinned from the end-to-end proof.

**Type consistency:** `canCreatePlaylists(session: Session | null)`, `searchTrack(client: Pick<SpotifyClient,'get'>, row)`, `RowMatch`, `runCreatePlaylist(deps, input): Promise<CreatePlaylistOutcome>`, `CreatePlaylistState`/`UnmatchedRow`, `createPlaylistState`, `startCreatePlaylist(): Promise<void>`, `ApiSearchTracks`, `ApiPlaylist`, `MixRow`/`MixView` `playlistUrl?`/`playlistId?` — all defined once and consumed under the same names across tasks.
