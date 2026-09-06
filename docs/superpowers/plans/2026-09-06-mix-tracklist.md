# Mix Tracklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the **Mix tracklist** screen at `#/mix`: the owner (a DJ) pastes a SoundCloud DJ-mix link on their phone and gets a draft tracklist — artist, title and, where a source knew it, a start time — that they can correct by hand and match against their own library. The honest deliverable is a *draft with holes*: everything comes from public, keyless endpoints (SoundCloud oEmbed, TrackId.net) in the browser, with a first-class paste-your-own box and the embedded player, and every gap and every failure is shown plainly.

**Architecture:** `DB_VERSION` becomes 4 and the guarded `upgrade` callback adds one store, `mixes` (keyPath `url`), reached through three dedicated repo helpers (`getMixes`/`putMix`/`deleteMix`) and deliberately kept **out** of `AllRows`/`getAllRows`/`buildModel` — nothing but `Mix.tsx` reads a mix. A new `src/features/mix/` folder holds the pure cores: `url.ts` (`normalizeMixUrl`, the one canonical string), `parse.ts` (the six-shape line grammar, `parseClock`, the run guard, link-out detection), `match.ts` (the live library join, memoised on `Model` identity), `oembed.ts` and `trackid.ts` (the two keyless network reads, each a pure function behind an injected `fetchFn`, returning a discriminated `ok`/`notFound`/`error` union and never throwing — TrackId behind its mandatory two-call guard, its spans mapped to rows with `ID · unidentified` gaps), and `lookup.ts` (`lookupMix` runs both fetches in parallel). `src/model/state.ts` gains the `mixState`/`mixRows`/`savedMixes`/`mixError` signals and the ten Mix actions; the lookup is manual, never on load, and deliberately **not** in `jobsBusy()` (it rebuilds no model). `src/ui/Mix.tsx` is the screen, reached from a Settings card and a new `#/mix` route that highlights the Settings tab; it reuses `TrackRow`, `FeaturePills` and `SpotifyLink` and raises no `BannerMessage`.

**Tech Stack:** Unchanged. TypeScript 6.0.x, Vite 8, Preact 10 + @preact/signals, idb 8, fflate 0.8, Vitest 5, fake-indexeddb 6, ESLint 10 flat config, yarn classic, Node 24, GitHub Pages via Actions. **No new dependency:** the two network reads are plain `fetch`, everything else is pure string and DOM work.

**Spec:** `docs/superpowers/specs/2026-09-06-mix-tracklist-design.md` (authority). §2 Data, §3 Sources/parsers, §4 Flow, §5 Screens, §6 Components/styles, §7 Tests and §8's rulings are this plan's requirements. Research: `docs/superpowers/research/2026-09-06-mix-tracklist-sources.md` (the TrackId guard, the confirmed spans endpoint under `result.detectionProcesses[].detectionProcessMusicTracks[]`, the oEmbed shape, the six-shape grammar). It builds on the shipped `DB_VERSION` 3 (the two artist-reach stores). The plan was assembled from six task drafts and **proved green end to end** against a fresh copy of `feat/mix-tracklist` `23efb62`: every task was applied in order and `yarn typecheck && yarn lint && yarn test && yarn build` run after each; the measured cumulative counts are pinned in each task's Expected lines. Where the drafts disagreed the spec won; where the spec was silent, the choice is recorded in Decisions below and, for the deviations, in the spec's new §8 "Rulings made while implementing." block (Task 6).

## Global Constraints

- Node 24 (`.nvmrc`), yarn classic 1.22. Install with `yarn`. Never `npm install`.
- `typescript` pinned `~6.0.3`. Do not upgrade: `typescript-eslint` 8 supports `<6.1` only.
- `vite` stays an explicit devDependency (Vitest peer, and used directly by the build).
- **No new dependency.** Nothing in this plan adds one, and nothing in it may.
- ESM everywhere. With `moduleResolution: bundler`, relative imports carry **no** `.js`/`.ts` extension. Vite compiles JSX itself (`jsx: react-jsx`, `jsxImportSource: preact`); there is no framework plugin. Preact uses `class=`, never `className`.
- Prettier: single quotes, semicolons, ES5 trailing commas, 80 columns. **Every code block in this plan is already Prettier output** (verified with `prettier --check` on the applied files), so `yarn format` rewrites nothing.
- ESLint 10's `preserve-caught-error` is on: a `throw` inside a `catch` must pass `{ cause: err }`. No module in this plan rethrows — every client returns a result, and `state.ts` maps each caught error to a signal string — so the rule never fires here.
- Tests sit next to their source as `src/**/*.test.ts` and run in Vitest's **Node** environment. IndexedDB tests import `fake-indexeddb/auto`; nothing here needs a DOM. **Screens have no unit tests** (spec §7); `src/model/state.ts` cannot be unit-tested in this project (importing it under Vitest pulls in `src/auth/browser.ts`, which touches `localStorage` at module scope), so its additions are proven by the gate plus the Task 5 browser walkthrough.
- **Mocked `fetch` only.** No test in this plan may reach a real network endpoint: oEmbed and TrackId are injected through `fetchFn`, and `lookupMix`'s test mocks the two source modules.
- Before every commit: `yarn typecheck && yarn lint && yarn test` must pass. `yarn build` is run at the end of every task (with `VITE_SPOTIFY_CLIENT_ID` set) and passes.
- Only the Client ID is configuration: `VITE_SPOTIFY_CLIENT_ID`. Never reference a client secret anywhere.
- Dev is opened at `http://127.0.0.1:5173/myOwnSpotifyData/`, never `localhost`; Spotify refuses `localhost` as a redirect URI.
- **Nothing here ever runs on page load.** The mix lookup runs only from the Mix screen's `Look up` button; `openMix` and `loadSavedMixes` make no network call. These endpoints touch no Spotify quota, but the never-on-load discipline is kept uniformly.
- **The mix lookup is NOT in `jobsBusy()` and never calls `loadFromDb()`** (spec §4, §8): it writes no library store and rebuilds no `Model`, so it clobbers nothing and needs no mutual exclusion with the five existing jobs. `disconnect`'s guard message is unchanged; only its reset list gains the four mix signals.
- **`mixes` is out of the aggregation `Model`** (spec §2, §8): declared in `DjDb` for the typed transaction and the guarded create, reached through `getMixes`/`putMix`/`deleteMix`, never folded into `AllRows`/`getAllRows`/`buildModel`.
- **The guarded `upgrade` shape is preserved** (`db.objectStoreNames.contains(...)`): `DB_VERSION` 3 → 4 adds only `mixes`; every existing playlist/track/play/feature/identity/reach row survives.
- **`banner` is a `BannerMessage`, never a string** — and the Mix screen raises **no** `BannerMessage`. Every failure is shown inline: the two network layers through `view.oembedError`/`view.trackidError`, a bad URL through `mixState`'s error arm, a storage failure through the `mixError` signal, and a paste that held only a link through the screen's own local note. Nothing is swallowed.
- **Only public, keyless endpoints** are called: SoundCloud oEmbed (`https://soundcloud.com/oembed`) and TrackId.net (`https://trackid.net/api/public/audiostreams`), plus the embedded player from `w.soundcloud.com`. Default `fetch` credentials only — never `credentials: 'include'`.
- **THE TrackId GUARD is non-negotiable** (research §3): accept the list result only when `result.rowCount === 1` AND `result.audiostreams[0].url === normUrl`; read the `slug` from that validated record; accept the by-slug detail only when its `url` and `slug` both match. Anything else is `notFound`. `trackCount` is never the identified count.
- **Invented constants, labelled as such:** `MIX_MERGE_TOLERANCE_SEC = 5`, `MIX_GAP_MIN_SEC = 60`, `MIX_DESCRIPTION_MIN_RUN = 5`, `MIX_PASTE_MIN_RUN = 1`. Each is declared exactly once (see Decisions 5).
- **Touch targets are at least 44 px** and the app is designed at 390 px wide. Reuse what exists: `TrackRow`, `FeaturePills`, `SpotifyLink`, `.filter`, `.card`, `.list`, `.caption`, `.muted`, `.error`, `.actions`. No new component and no new badge kind — row provenance is a line of text (`.src`).
- Commit messages: conventional prefix (`feat:`, `test:`, `docs:`), ending with
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu`.
- Do not push. The owner pushes.

## Decisions

Where two drafts disagreed the spec won; where the spec is silent, the decision
is recorded here. **The task that creates a module owns its signature.** Every
deviation from the spec text is also written into the spec's §8 "Rulings" block
by Task 6.

1. **Task order is `data → parse → clients → state → ui → docs`** (Tasks 1–6). This makes every cumulative test/build total deterministic, so each task's Expected lines carry an **absolute** count, not a hedge. `src/features/mix/match.ts` is created in **Task 2** (the parse task), alongside `parse.ts`; Tasks 4–6 that consume `libraryTitleIndex`/`matchMixRow` import it as Task 2's, not "Task 3's" as two drafts' prose said.
2. **`applyPastedTracklist` returns `'added' | 'linkOnly' | 'empty'`, not `void`** (reconciliation between Task 4 and Task 5). Spec §4 calls the link-only case "a no-op with a gentle inline note" (informational, belongs beside the paste box) while §6 forbids a `BannerMessage` on this screen. The screen (`PasteBox`) holds the outcome in local state and renders a muted note for `linkOnly`/`empty`; a cancelled replace reports `'added'` (tracks were found, no note shown — a cancelled replace also clears the textarea, and no component test covers that edge). Recorded in spec §8.
3. **A `mixError` signal carries storage failures, and Task 5 renders it inline at screen level** (reconciliation, spec §6 addition). §6 enumerated only the two layer errors and the URL error; a rejected `putMix`/`deleteMix` or an unreadable `getMixes` had nowhere to land under the no-swallow rule. `mixError` is a plain `string | null` signal (never a `BannerMessage`, so §6 holds; never on `mixState`, so §4's error-arm wording holds), rendered as one `<p class="error">` in `Mix()` — at screen level, not "near the Save button", because `removeMix`/`loadSavedMixes` fire in the idle state where the tracklist is not mounted. Recorded in spec §8.
4. **The per-row edit takes `label: string`** (empty string = no label), not `string | null`. `editTracklistRow` does `edit.label.trim()`, which does not compile on `string | null`; the edit input's value is always a string, so the screen passes it raw and `editTracklistRow` trims and nulls it. `editMixRow(index, { artist, title, label })` matches.
5. **The four invented constants are split by owner, one declaration each:** Task 2's `parse.ts` owns `MIX_DESCRIPTION_MIN_RUN = 5` and `MIX_PASTE_MIN_RUN = 1`; Task 3's `trackid.ts` owns `MIX_MERGE_TOLERANCE_SEC = 5` and `MIX_GAP_MIN_SEC = 60`. `parseClock` is Task 2's; `trackid.ts` imports it (never a second clock parser — the two would diverge on the fractional duration).
6. **`parseLines` gains a third `source: MixRowSource = 'description'` argument** beyond §3.5's quoted two-arg signature. It is call-compatible and internal: only `parseDescription` (default) and `parsePasted` (`'pasted'`) call it across a module boundary. Recorded in spec_conflicts.
7. **`fetchTrackId` gains an optional third `sleep?: (ms) => Promise<void>` argument** beyond §3.3's quoted two-arg signature. §3.3 requires "two politely-spaced requests" and §4 says `sleep` spaces them, while §3 requires injected (testable) deps; the optional trailing arg honours all three and every two-arg call still compiles. `lookupMix` passes `deps.sleep`. Recorded in spec_conflicts.
8. **oEmbed non-2xx → `notFound`; TrackId non-2xx → `error`.** §3.2's union marks "404 or any non-2xx" as `notFound` (not a public track); §3.3's `notFound` enumerates only body-shape failures and §5.2 renders a TrackId `notFound` as a factual claim about the corpus, so a 5xx there is `error` ("could not be reached"). The clients return a **bare** `message`; the screen adds the `TrackId.net could not be reached: …` / `The mix page could not be read: …` prefixes.
9. **`fetchOembed` returns the raw validated `playerSrc`; `show_comments=true` is appended by the screen** when it builds the iframe (spec §2 stores the raw src; §5.2 appends). Appending in the client would double-append and persist a wrong value.
10. **The `raw/architecture/tid-shonky.json` fixture named in §7 is not in the repo** and its "18 identified rows" does not close arithmetically. `trackid.test.ts` uses a controlled inline fixture with §3.3's exact timestamps for the two named pairs (Apollonia merges to one row; Pierre Codarin stays two), asserting **4 identified + 5 gaps = 9 rows**, with `trackCount` 16/0 present to prove neither is the count. Recorded in spec_conflicts.
11. **`normalizeMixUrl` rejects `on.soundcloud.com` short links to `null` with no owner note**, and also rejects a non-`http(s)` scheme and a scheme-less paste (which throws in `new URL`). This resolves §3.1's one `(to confirm at implementation)` point (Task 6, spec §8).
12. **The three row actions are named `editMixRow`/`addMixRow`/`deleteMixRow`** (spec §4 names none), not bare `editRow`/`addRow`/`deleteRow`, because `state.ts` is the app's single signal module.
13. **`formatClock` lives in `src/ui/format.ts` and is written test-first (Task 5)**, the same placement the artist-reach plan used for `reachLine`/`profileLine`. It is the display inverse of Task 2's `parseClock` but a UI helper, so it sits with the other `format.ts` helpers.
14. **Gap rows are a hand-written `<li class="gap">`, not a `TrackRow`** — `TrackRow` sets no class on its `<li>` and spec §6's `.list li.gap .title` rule needs `gap` there. The `<li>` mirrors `TrackRow`'s inner `row → main → title/sub` markup; a comment says so.
15. **The router wiring spans `router.ts` AND `app.tsx`.** `Screen` is a switch with no default and an inferred `Element | undefined` return, so adding the `Route` arm without the `Screen` case compiles and renders nothing on `#/mix`, and a missing `parseRoute` case silently routes `#/mix` to Top. All three (the `Route` arm, `parseRoute` case, `Screen` case) plus `tabOf` land in one step (Task 5 Step 7).

## Spec coverage

Every requirement of §2 to §8 maps to a step below. §1 is the goal.

| Spec | Requirement | Task · Step |
| --- | --- | --- |
| §2 | `DB_VERSION` 4, guarded `upgrade`, one new store `mixes` | 1 · 3 |
| §2 | `MixRowSource`, `TracklistRow`, `MixRow` in `schema.ts`; `DjDb.mixes`; `AllRows` unchanged | 1 · 3 |
| §2 | `getMixes`, `putMix`, `deleteMix`; `mixes` out of the model | 1 · 3 |
| §2 | `MixView`, `MixState`, the four signals in `state.ts` | 4 · 7 |
| §3.1 | `normalizeMixUrl`: host allowlist/rewrite, drop query+fragment, one trailing slash, ≥2 segments, `on.soundcloud.com` → null | 1 · 8 |
| §3.2 | oEmbed GET, narrow every field, raw description, `playerSrc` prefix check, 404/non-2xx → notFound | 3 · 3 |
| §3.3 | TrackId two-call flow, THE GUARD, `slug` from the record, by-slug detail guard, `timeHitRate`, empty-ok | 3 · 8 |
| §3.3 | `tidSpansToRows`: flatten → merge (`MIX_MERGE_TOLERANCE_SEC`) → sort → gaps (`MIX_GAP_MIN_SEC`, head/between/tail) | 3 · 8 |
| §3.4 | `parseDescription`, `parsePasted`, `ParsedTracklist`, entity/tag/`<br>` cleaning | 2 · 3 |
| §3.5 | `parseLines`, `parseClock`, six shapes, three dashes, prefix order, ≥`minRun` run guard, link-out | 2 · 3 |
| §3.6 | `libraryTitleIndex` (memoised), `matchMixRow` (unique-id, inert tokens, gap), `MixMatch` | 2 · 9 |
| §4 | `MixDeps`, `MixLookup`, `lookupMix` (parallel, never throws) | 4 · 3 |
| §4 | `startMixLookup` (never on load, folds both layers, seeds richest, not in `jobsBusy`, no `loadFromDb`) | 4 · 8 |
| §4 | `applyDescriptionTracklist`, `applyPastedTracklist` (confirm-guarded); row edits; `saveMix`/`loadSavedMixes`/`openMix`/`removeMix` | 4 · 8 |
| §4 | `disconnect` resets the four mix signals; guard message unchanged | 4 · 9 |
| §5.1 | Settings "Mix tracklist" link card after Artist reach | 5 · 8 |
| §5.2 | The `#/mix` screen: states, provenance line, player (`show_comments=true`), paste box, saved-mixes list; router + `tabOf` | 5 · 6, 5 · 7 |
| §5.3 | Tracklist rows: title, subtitle (`formatClock`), Spotify search, `FeaturePills` + `in N playlists`, provenance span, edit/delete | 5 · 6 |
| §5.4 | The two info cards (Tracklistify/SongRec; Auto Shazam) | 5 · 6 |
| §6 | `.mix-player`, `.list li.gap .title`, `.mix .src`; no new component, no banner; `formatClock` | 5 · 3, 5 · 9 |
| §7 | `url.test.ts` | 1 · 6 |
| §7 | `parse.test.ts`, `match.test.ts` | 2 · 1, 2 · 7 |
| §7 | `oembed.test.ts`, `trackid.test.ts` | 3 · 1, 3 · 6 |
| §7 | `lookup.test.ts` | 4 · 1 |
| §7 | `repo.test.ts` mixes round-trip + v3→v4 migration | 1 · 1 |
| §7 | `ui/format.test.ts` (`formatClock`) | 5 · 1 |
| §7 | Screens: no unit tests — browser walkthrough | 5 · 11 |
| §8 | The spec records the rulings; the owner's manual and the conventions map | 6 · 1, 6 · 2, 6 · 3 |

## File Structure

New files:

- `src/features/mix/url.ts` + `url.test.ts` — `normalizeMixUrl` (Task 1)
- `src/features/mix/parse.ts` + `parse.test.ts` — the line grammar (Task 2)
- `src/features/mix/match.ts` + `match.test.ts` — the live library join (Task 2)
- `src/features/mix/oembed.ts` + `oembed.test.ts` — the SoundCloud oEmbed client (Task 3)
- `src/features/mix/trackid.ts` + `trackid.test.ts` — the TrackId.net client (Task 3)
- `src/features/mix/lookup.ts` + `lookup.test.ts` — `lookupMix` + the pure working-list rules (Task 4)
- `src/ui/Mix.tsx` — the `#/mix` screen (Task 5)

Modified files:

- `src/db/schema.ts` — `DB_VERSION` 4, the three store types, `DjDb.mixes` (Task 1)
- `src/db/repo.ts` — the guarded `mixes` create, `getMixes`/`putMix`/`deleteMix` (Task 1)
- `src/db/repo.test.ts` — the `mix()` fixture, `V3_STORES`, the `mixes` block, the v3→v4 migration (Task 1)
- `src/model/state.ts` — the mix signals, types and ten actions; `disconnect` resets (Task 4)
- `src/ui/format.ts` + `format.test.ts` — `formatClock` (Task 5)
- `src/router.ts` — the `mix` `Route` arm and `parseRoute` case (Task 5)
- `src/app.tsx` — import `Mix`, the `Screen` case, `tabOf` mapping (Task 5)
- `src/ui/Settings.tsx` — the `MixCard` link card (Task 5)
- `src/styles.css` — the three §6 rules (Task 5)
- `README.md`, `CLAUDE.md`, the spec (Task 6, docs only)

**Proof baseline (measured):** HEAD `23efb62` is 36 test files / 392 tests / 81 build modules. Cumulative after each task: **Task 1** 37/410, **Task 2** 39/437, **Task 3** 41/472, **Task 4** 42/479, **Task 5** 42/480 (88 build modules), **Task 6** 42/480 (docs only, unchanged). These are the numbers the Expected lines below assert.

---

### Task 1: `DB_VERSION` 4, the `mixes` store, the repo helpers, and URL normalization

**Files:**

- Create:
  - `src/features/mix/url.ts`
  - `src/features/mix/url.test.ts` (new, 15 tests)
- Modify:
  - `src/db/schema.ts` (`DB_VERSION` `3` → `4`; the new store types
    `MixRowSource`, `TracklistRow`, `MixRow` inserted just after `reachKey`
    and before `MetaRow`; **one** line added to the `DjDb` interface). **`AllRows`
    is not touched** — `mixes` is deliberately out of the aggregation model
    (spec §2, §8).
  - `src/db/repo.ts` (the type-import list gains `type MixRow`; the `upgrade`
    callback inside `openDb` gains the guarded `mixes` create after the
    `artistReach` guard, and its comment is extended to v3 → v4; three new
    functions `getMixes`/`putMix`/`deleteMix` inserted just above `getMeta`)
  - `src/db/repo.test.ts` (18 → 21 tests: a `mix()` fixture, a `V3_STORES`
    array, a new `describe('mixes')` block, and the v3 → v4 migration test)
- Unchanged, do not touch: `getAllRows` still reads the same eight stores in
  its one transaction (`mixes` is not in it); `wipeDb`, `replacePlaylist`,
  `deletePlaylists`, `putTopItems`, `replacePlays`, `putFeatures`,
  `getFeatures`, `putIdentities`, `putReach`, `getMeta`, `putMeta`,
  `getPlaylists` keep their current bodies; `src/model/aggregate.ts`,
  `src/model/state.ts` and every existing `AllRows` literal (in
  `src/model/aggregate.test.ts`, `src/model/features.test.ts`,
  `src/features/lookup.test.ts`) compile untouched because `AllRows` keeps its
  eight keys — the "update the `AllRows` literals only if `DjDb` typing forces
  it" clause resolves to **no**.

**Interfaces:**

- Consumes (existing code, exactly as it stands at `feat/mix-tracklist`
  `23efb62`):
  - `src/db/schema.ts`: `DB_NAME = 'spotify-dj'`, `DB_VERSION = 3`,
    `interface DjDb extends DBSchema { playlists; tracks; entries; topItems;
    plays; features; artistIdentity; artistReach; meta }`, `interface AllRows`
    (eight keys, no `mixes`), `ArtistReachRow`, `ReachSource`, `reachKey`,
    `PlaylistRow`, `TrackRow`, `EntryRow`, `FeatureRow`, `ArtistIdentityRow`,
    `MetaRow`
  - `src/db/repo.ts`: `openDb(): Promise<IDBPDatabase<DjDb>>`, `closeDb()`,
    `wipeDb(timeoutMs?)`, `getAllRows(): Promise<AllRows>`, the `upgrade(db)`
    callback with its guarded `db.objectStoreNames.contains(...)` shape,
    `putFeatures`/`getFeatures` (the helper shape `getMixes`/`putMix` mirror),
    `getMeta<T>`, `putMeta`
  - `idb` 8: `openDB`, `deleteDB`, `type IDBPDatabase`, `type DBSchema`
  - Global `URL` (WHATWG, available in Node 24 and every target browser)
  - The fixtures already in `src/db/repo.test.ts`: `playlist(id, snapshotId?)`,
    `track(key)`, `entries(playlistId, keys)`, `feature(trackId, over?)`,
    `identity(artistId, over?)`, `reachRow(artistId, source, over?)`,
    `openAt(version, stores)`, `putLegacyRow(db, store, row)`, `V1_STORES`,
    `V2_STORES`
- Produces — **Tasks 2–5 import every one of these by these exact names**:
  - `src/db/schema.ts`:
    - `export const DB_VERSION = 4`
    - `export type MixRowSource = 'trackid' | 'description' | 'pasted' | 'manual'`
    - `export interface TracklistRow { startSec: number | null; endSec: number
      | null; artist: string; title: string; label: string | null; source:
      MixRowSource; gap: boolean; detected: { artist: string; title: string } |
      null; referenceCount: number | null }`
    - `export interface MixRow { url: string; title: string | null; author:
      string | null; playerSrc: string | null; slug: string | null; sources: {
      trackid: boolean; description: boolean; pasted: boolean; linkOut: string |
      null }; rows: TracklistRow[]; savedAt: number }`
    - `DjDb.mixes: { key: string; value: MixRow }` (the typed store, for the
      guarded create and `putMix`/`getMixes`/`deleteMix`)
    - `AllRows` **unchanged** — still eight keys; `mixes` is not one of them
  - `src/db/repo.ts`:
    - `export function getMixes(): Promise<MixRow[]>` — a plain `db.getAll('mixes')`,
      **no sort** (newest-first ordering is applied in `state.ts`)
    - `export function putMix(row: MixRow): Promise<void>`
    - `export function deleteMix(url: string): Promise<void>`
  - `src/features/mix/url.ts`:
    - `export function normalizeMixUrl(input: string): string | null` — the
      canonical SoundCloud permalink, or `null` when the input is not one. This
      is the module's **only** export.
- Obligations this task puts on later tasks, so nothing is declared twice
  (spec §2: `MixRow`/`TracklistRow` live in `schema.ts`; "every result union in
  §3 and every signal in §4 lives in `src/features/mix/` or `state.ts`, never in
  `schema.ts`"):
  - **Task 2 owns `src/features/mix/oembed.ts`** and declares `OembedResult`
    and `fetchOembed(fetchFn, normUrl)` (spec §3.2). It imports nothing from
    Task 1 except the canonical string convention.
  - **Task 3 owns `src/features/mix/trackid.ts`** and declares `TrackIdResult`,
    `fetchTrackId(fetchFn, normUrl)`, the pure `tidSpansToRows`, and the two
    invented constants **`MIX_MERGE_TOLERANCE_SEC = 5`** and
    **`MIX_GAP_MIN_SEC = 60`** (spec §3.3, §8). Its rows are `TracklistRow`
    from **this** task's `schema.ts` — it must not redeclare that shape.
  - **The parser task owns `src/features/mix/parse.ts`** and declares
    `ParsedTracklist`, `parseDescription`, `parsePasted`, `parseLines(text,
    minRun)`, `parseClock(s)`, and the **`MIN_RUN`** convention (5 for a
    description, 1 for a paste) (spec §3.4, §3.5, §8). Its rows are also this
    task's `TracklistRow`.
  - **The match task owns `src/features/mix/match.ts`** and declares
    `MixMatch`, `libraryTitleIndex(model)`, `matchMixRow(model, index, row)`
    (spec §3.6).
  - **The lookup task owns `src/features/mix/lookup.ts`** and declares
    `MixDeps`, `MixLookup`, `lookupMix(deps, normUrl)` (spec §4).
  - **The state task owns `src/model/state.ts`** and declares `MixView`,
    `MixState`, the `mixState`/`mixRows`/`savedMixes` signals and the
    `startMixLookup`/`openMix`/`saveMix`/`removeMix`/`loadSavedMixes` actions
    (spec §4). `openMix` reads a saved row from the in-memory `savedMixes`
    signal — **there is deliberately no single-row `getMix(url)` repo helper**,
    so do not add one here.
  - **The screen/format task adds `formatClock(totalSeconds)` to
    `src/ui/format.ts`** (spec §6). It is not declared here.
  - Every one of those tasks **imports `MixRow`, `TracklistRow` and
    `MixRowSource` from `src/db/schema` and `normalizeMixUrl` from
    `src/features/mix/url`** — the names above are the contract.

**Notes:**

- **`normalizeMixUrl`'s return type stays `string | null`.** Spec §3.1 leaves
  one open point — whether an `on.soundcloud.com` short link earns a
  best-effort note to the owner. The ruling: `normalizeMixUrl` **rejects it to
  `null`** (the short link needs a redirect the app cannot follow
  cross-origin). Any owner-facing "open it once to get the full link" note is
  the **screen task's** to add (the screen can test the host itself), and the
  return type is **not** widened to a discriminated result to carry it —
  Tasks 2–5 consume the `string | null` signature above.
- **Two schemes the spec's rule-list left implicit, decided by test.** A
  scheme-less paste (`soundcloud.com/user/slug`) throws in `new URL`, so it is
  `null`. A non-`http(s)` scheme (`ftp://soundcloud.com/user/slug`) parses, so
  it is rejected explicitly (`parsed.protocol !== 'http:' && !== 'https:'` →
  `null`): a permalink is a web link. Both have a test so the behaviour is
  decided rather than incidental.
- **The load-bearing half of the "host lowercased, path preserved" rule is the
  path.** For an `http(s)` URL the WHATWG parser already lower-cases
  `URL.hostname`, so the explicit `.toLowerCase()` is belt-and-braces (kept for
  clarity); the case that actually protects the TrackId exact-match `?url=`
  filter is **the path preserved verbatim** — `SoundCloud.com/User/Some-Mix` →
  `https://soundcloud.com/User/Some-Mix`, and that assertion is the one that
  matters (research §3: an upper-cased path returned `rowCount: 0`).
- **`getMixes` must not sort.** It is a bare `db.getAll('mixes')`; the
  `// newest-first ordering is applied in state.ts` comment is load-bearing —
  it is why no later task adds an index or a sort here. The round-trip test
  sorts its own result by `url` for a deterministic assertion, and says so.
- **`mixes` is out of `AllRows`, `getAllRows` and `buildModel`** (spec §2, §8):
  nothing but the Mix screen reads a mix, and folding it in would rebuild the
  whole `Model` on every mix save. The store is declared in `DjDb` (for the
  typed transaction and the guarded create) and reached through the three
  dedicated functions; the migration test reads it back through **`getMixes()`**,
  not `getAllRows()`.
- **The guarded `upgrade` is what the migration test proves.** The one line
  added is `if (!db.objectStoreNames.contains('mixes')) db.createObjectStore(
  'mixes', { keyPath: 'url' });`. Reverting the `if` makes the version 4 upgrade
  re-create a store that already exists and the test fails with an `AbortError`.
- **The existing migration and events tests silently become v1 → v4 / v2 → v4
  and must pass unchanged.** `migration`'s v1 and v2 tests and the two
  `database events` tests all assert `expect(db.version).toBe(DB_VERSION)`, so
  bumping `DB_VERSION` to `4` re-targets them for free — do **not** edit them.
  The full-suite run at the end of each cycle is what confirms it, not
  reasoning.
- **`getMixes`/`putMix`/`deleteMix` mirror `putFeatures`** (`repo.ts` ~216–222):
  one `await openDb()`, one `idb` call, `Promise<void>`. There is no batch
  variant and no empty-array guard — a mix is saved one at a time.
- Task 1 owns no screen, so it has no browser walkthrough. The one thing the
  Node tests cannot exercise is a **real** IndexedDB upgrade (`fake-indexeddb`
  is not Chrome); the final step is a cheap real-IDB check in DevTools, framed
  as a migration check, not a screen check.

- [ ] **Step 1: Write the failing DB-layer test**

Three edits to `src/db/repo.test.ts`.

**1a.** Replace the two import statements at the top of the file:

```ts
import {
  closeDb,
  deletePlaylists,
  getAllRows,
  getFeatures,
  getMeta,
  getPlaylists,
  openDb,
  putFeatures,
  putIdentities,
  putMeta,
  putReach,
  putTopItems,
  replacePlaylist,
  replacePlays,
  setDbEvents,
  wipeDb,
} from './repo';
import { DB_NAME, DB_VERSION, reachKey } from './schema';
import type {
  ArtistIdentityRow,
  ArtistReachRow,
  EntryRow,
  FeatureRow,
  PlaylistRow,
  ReachSource,
  TrackRow,
} from './schema';
```

with (adds `deleteMix`, `getMixes`, `putMix` to the value import and `MixRow`
to the type import):

```ts
import {
  closeDb,
  deleteMix,
  deletePlaylists,
  getAllRows,
  getFeatures,
  getMeta,
  getMixes,
  getPlaylists,
  openDb,
  putFeatures,
  putIdentities,
  putMeta,
  putMix,
  putReach,
  putTopItems,
  replacePlaylist,
  replacePlays,
  setDbEvents,
  wipeDb,
} from './repo';
import { DB_NAME, DB_VERSION, reachKey } from './schema';
import type {
  ArtistIdentityRow,
  ArtistReachRow,
  EntryRow,
  FeatureRow,
  MixRow,
  PlaylistRow,
  ReachSource,
  TrackRow,
} from './schema';
```

**1b.** Insert the `mix()` fixture immediately above the comment that
introduces `V1_STORES` (it lands just after `reachRow()`), and add `V3_STORES`
immediately after the `V2_STORES` array.

Above `/** The six stores of version 1, with the key paths that shipped. */`,
insert:

```ts
function mix(url: string, over: Partial<MixRow> = {}): MixRow {
  return {
    url,
    title: 'Some Mix by DJ',
    author: 'DJ',
    playerSrc: 'https://w.soundcloud.com/player/?url=x',
    slug: 'some-mix',
    sources: {
      trackid: true,
      description: false,
      pasted: false,
      linkOut: null,
    },
    rows: [
      {
        startSec: 0,
        endSec: 120,
        artist: 'A',
        title: 'B',
        label: null,
        source: 'trackid',
        gap: false,
        detected: { artist: 'A', title: 'B' },
        referenceCount: 3,
      },
    ],
    savedAt: 1000,
    ...over,
  };
}
```

Immediately after this existing block:

```ts
/** The seven stores of version 2: version 1 plus `features`. */
const V2_STORES: [string, string | string[]][] = [
  ...V1_STORES,
  ['features', 'trackId'],
];
```

insert:

```ts
/** The nine stores of version 3: version 2 plus the two reach stores. */
const V3_STORES: [string, string | string[]][] = [
  ...V2_STORES,
  ['artistIdentity', 'artistId'],
  ['artistReach', 'key'],
];
```

**1c.** Insert a new `describe('mixes')` block immediately above the existing
`describe('database events', () => {` line:

```ts
describe('mixes', () => {
  it('round-trips mix rows and replaces them by url', async () => {
    await putMix(mix('https://soundcloud.com/u/one'));
    await putMix(mix('https://soundcloud.com/u/two', { title: 'Two' }));
    const stored = (await getMixes()).sort((a, b) =>
      a.url.localeCompare(b.url)
    );
    expect(stored.map((m) => m.url)).toEqual([
      'https://soundcloud.com/u/one',
      'https://soundcloud.com/u/two',
    ]);
    expect(stored[0]).toEqual(mix('https://soundcloud.com/u/one'));
    // A second put under the same url replaces rather than duplicates.
    await putMix(mix('https://soundcloud.com/u/one', { title: 'One again' }));
    const afterReplace = await getMixes();
    expect(afterReplace).toHaveLength(2);
    expect(
      afterReplace.find((m) => m.url === 'https://soundcloud.com/u/one')?.title
    ).toBe('One again');
    // deleteMix removes only the named row.
    await deleteMix('https://soundcloud.com/u/one');
    const afterDelete = await getMixes();
    expect(afterDelete.map((m) => m.url)).toEqual([
      'https://soundcloud.com/u/two',
    ]);
  });

  it('getMixes returns an empty array when the store is empty', async () => {
    await expect(getMixes()).resolves.toEqual([]);
  });
});
```

**1d.** Append the v3 → v4 migration test inside the existing
`describe('migration', ...)` block, immediately after the v2 → v3 test — i.e.
replace the closing of that test and the block:

```ts
    const after = await getAllRows();
    expect(after.artistIdentity).toEqual([identity('a1')]);
    expect(after.artistReach).toEqual([reachRow('a1', 'listenbrainz')]);
  });
});
```

with:

```ts
    const after = await getAllRows();
    expect(after.artistIdentity).toEqual([identity('a1')]);
    expect(after.artistReach).toEqual([reachRow('a1', 'listenbrainz')]);
  });

  it('upgrades a version 3 database, keeping its rows and adding the mixes store', async () => {
    const v3 = await openAt(3, V3_STORES);
    await putLegacyRow(v3, 'playlists', playlist('p1'));
    await putLegacyRow(v3, 'tracks', track('t1'));
    await putLegacyRow(v3, 'features', feature('t1'));
    await putLegacyRow(v3, 'artistIdentity', identity('a1'));
    await putLegacyRow(v3, 'artistReach', reachRow('a1', 'listenbrainz'));
    v3.close();
    const rows = await getAllRows();
    expect(rows.playlists).toEqual([playlist('p1')]);
    expect(rows.tracks).toEqual([track('t1')]);
    expect(rows.features).toEqual([feature('t1')]);
    expect(rows.artistIdentity).toEqual([identity('a1')]);
    expect(rows.artistReach).toEqual([reachRow('a1', 'listenbrainz')]);
    const db = await openDb();
    expect(db.version).toBe(DB_VERSION);
    expect(db.objectStoreNames.contains('mixes')).toBe(true);
    // The new store is reached through getMixes(), not getAllRows().
    await expect(getMixes()).resolves.toEqual([]);
    await putMix(mix('https://soundcloud.com/u/m'));
    await expect(getMixes()).resolves.toEqual([
      mix('https://soundcloud.com/u/m'),
    ]);
  });
});
```

- [ ] **Step 2: Run the DB-layer test to verify it fails**

Run: `yarn test src/db/repo.test.ts`
Expected: FAIL, 3 of 21 — the three new tests. `getMixes`/`putMix` are
`undefined` at runtime (not yet exported), and the migration test's
`objectStoreNames.contains('mixes')` is `false` while `DB_VERSION` is still 3:

```
 Test Files  1 failed (1)
      Tests  3 failed | 18 passed (21)
```

Run: `yarn typecheck`
Expected: `error Command failed with exit code 2`, ten errors naming the
missing exports and the untyped store:

```
src/db/repo.test.ts(5,3): error TS2305: Module '"./repo"' has no exported member 'deleteMix'.
src/db/repo.test.ts(10,3): error TS2305: Module '"./repo"' has no exported member 'getMixes'.
src/db/repo.test.ts(16,3): error TS2305: Module '"./repo"' has no exported member 'putMix'.
src/db/repo.test.ts(30,3): error TS2305: Module '"./schema"' has no exported member 'MixRow'.
src/db/repo.test.ts(400,45): error TS7006: Parameter 'a' implicitly has an 'any' type.
src/db/repo.test.ts(400,48): error TS7006: Parameter 'b' implicitly has an 'any' type.
src/db/repo.test.ts(403,24): error TS7006: Parameter 'm' implicitly has an 'any' type.
src/db/repo.test.ts(413,26): error TS7006: Parameter 'm' implicitly has an 'any' type.
src/db/repo.test.ts(418,29): error TS7006: Parameter 'm' implicitly has an 'any' type.
src/db/repo.test.ts(516,41): error TS2345: Argument of type '"mixes"' is not assignable to parameter of type '"playlists" | "tracks" | "entries" | "topItems" | "plays" | "features" | "artistIdentity" | "artistReach" | "meta"'.
```

(The line numbers depend on where the blocks land; the error kinds and the
missing names are the contract. The five `TS7006` errors are a **consequence**
of `getMixes` being absent — its `MixRow[]` return type is what types the
`.sort()` and `.find()` callbacks in the new `describe('mixes')` block — and
they disappear in Step 3 once `getMixes` is implemented. Do **not** annotate
them away, or you leave dead annotations after Step 3.)

- [ ] **Step 3: Implement the schema and the repository**

**3a.** In `src/db/schema.ts`, bump the version:

```ts
export const DB_VERSION = 4; // was 3
```

**3b.** In `src/db/schema.ts`, insert the three store types immediately after
the `reachKey` function and before `export interface MetaRow {`:

```ts
/** Where a tracklist row came from. 'manual' = the owner typed or edited it. */
export type MixRowSource = 'trackid' | 'description' | 'pasted' | 'manual';

export interface TracklistRow {
  /** Seconds from the start of the mix, or null when the source had no time. */
  startSec: number | null;
  /** Seconds; TrackId is the only source with an end, else null. */
  endSec: number | null;
  /** Shown and edited. Seeded from `detected`; the owner may overwrite it. */
  artist: string;
  title: string;
  /** MixesDB / TrackId label, or null. */
  label: string | null;
  source: MixRowSource;
  /**
   * true for an "ID · unidentified · mm:ss – mm:ss" stretch. `artist`/`title`
   * are ignored for a gap row: it links to nothing and matches nothing.
   */
  gap: boolean;
  /**
   * The values the source produced, kept beside the edited ones so an edit is
   * reversible and provenance survives. null for a row the owner added from
   * scratch (source 'manual').
   */
  detected: { artist: string; title: string } | null;
  /** TrackId `referenceCount` (how many corpus mixes hold the track), else null. */
  referenceCount: number | null;
}

/** New store `mixes`, keyPath 'url'. One row per saved mix. */
export interface MixRow {
  /** normalizeMixUrl(pasted) — the store key, and the guard's comparand. */
  url: string;
  /** oEmbed `title` verbatim (it already ends "… by <author>"), or null. */
  title: string | null;
  /** oEmbed `author_name` verbatim, kept for provenance; not rendered beside the title. */
  author: string | null;
  /**
   * The validated player iframe src, or null. Stored so reopening a saved mix
   * restores the player with no network call — it is a derived public URL, not
   * audio, and never carries a token.
   */
  playerSrc: string | null;
  /**
   * TrackId slug when that layer answered, so the provenance link survives a
   * reopen; null when TrackId did not answer. Never derived from the permalink.
   */
  slug: string | null;
  /** Which layers answered, for the provenance line and the saved-mixes list. */
  sources: {
    trackid: boolean;
    description: boolean;
    pasted: boolean;
    /** A "full tracklist at <url>" link found in the description, or null. */
    linkOut: string | null;
  };
  /** The one working list the owner curated, in play order. */
  rows: TracklistRow[];
  savedAt: number;
}
```

**3c.** In `src/db/schema.ts`, add one line to the `DjDb` interface, after
`artistReach` and before `meta`:

```ts
  artistIdentity: { key: string; value: ArtistIdentityRow };
  artistReach: { key: string; value: ArtistReachRow };
  mixes: { key: string; value: MixRow };
  meta: { key: string; value: MetaRow };
}
```

(`AllRows` is **not** edited — it keeps its eight keys.)

**3d.** In `src/db/repo.ts`, add `type MixRow` to the import from `./schema`,
between `type FeatureRow` and `type PlayRow`:

```ts
  type EntryRow,
  type FeatureRow,
  type MixRow,
  type PlayRow,
```

**3e.** In `src/db/repo.ts`, extend the `upgrade` comment and add the guarded
`mixes` create after the `artistReach` guard and before the `meta` guard:

```ts
      // Only what is missing: a version 1 database keeps every row it holds
      // and gains `features`; a version 2 database keeps every playlist,
      // track, play and feature row and gains the two reach stores; a version
      // 3 database keeps every row and gains `mixes`.
```

```ts
      if (!db.objectStoreNames.contains('artistReach'))
        db.createObjectStore('artistReach', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('mixes'))
        db.createObjectStore('mixes', { keyPath: 'url' });
      if (!db.objectStoreNames.contains('meta'))
        db.createObjectStore('meta', { keyPath: 'name' });
```

**3f.** In `src/db/repo.ts`, insert the three functions immediately above
`export async function getMeta<T>(name: string): Promise<T | undefined> {`:

```ts
export async function getMixes(): Promise<MixRow[]> {
  const db = await openDb();
  return db.getAll('mixes'); // newest-first ordering is applied in state.ts
}

export async function putMix(row: MixRow): Promise<void> {
  const db = await openDb();
  await db.put('mixes', row);
}

export async function deleteMix(url: string): Promise<void> {
  const db = await openDb();
  await db.delete('mixes', url);
}
```

- [ ] **Step 4: Run the DB-layer test to verify it passes**

Run: `yarn test src/db/repo.test.ts`
Expected: PASS, `Test Files  1 passed (1)`, `Tests  21 passed (21)`.

Run: `yarn typecheck && yarn lint && yarn test`
Expected: all three pass. The suite is `Test Files  36 passed (36)`,
`Tests  395 passed (395)` — the three new `repo.test.ts` tests on top of the
392 at `23efb62` (`url.test.ts` does not exist yet; it is written in Step 6 and
takes the count to 410 in Step 9). The existing v1 → v4 and v2 → v4 migration
tests and both `database events` tests pass unchanged.

- [ ] **Step 5: Commit**

```bash
yarn format
git add src/db/schema.ts src/db/repo.ts src/db/repo.test.ts
git commit -m "feat(db): DB_VERSION 4 with the mixes store and its repo helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

- [ ] **Step 6: Write the failing URL-normalization test**

Create `src/features/mix/url.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizeMixUrl } from './url';

describe('normalizeMixUrl', () => {
  it('returns a plain permalink unchanged', () => {
    expect(normalizeMixUrl('https://soundcloud.com/user/some-mix')).toBe(
      'https://soundcloud.com/user/some-mix'
    );
  });

  it('drops ?si= and ?utm_source= tracking params', () => {
    expect(
      normalizeMixUrl(
        'https://soundcloud.com/user/some-mix?si=abc123&utm_source=clipboard'
      )
    ).toBe('https://soundcloud.com/user/some-mix');
  });

  it('drops an ?in=user/sets/... param without touching the path', () => {
    expect(
      normalizeMixUrl(
        'https://soundcloud.com/user/some-mix?in=someone/sets/favourites'
      )
    ).toBe('https://soundcloud.com/user/some-mix');
  });

  it('drops a #fragment', () => {
    expect(normalizeMixUrl('https://soundcloud.com/user/some-mix#t=10')).toBe(
      'https://soundcloud.com/user/some-mix'
    );
  });

  it('rewrites m.soundcloud.com to soundcloud.com', () => {
    expect(normalizeMixUrl('https://m.soundcloud.com/user/some-mix')).toBe(
      'https://soundcloud.com/user/some-mix'
    );
  });

  it('rewrites www.soundcloud.com to soundcloud.com', () => {
    expect(normalizeMixUrl('https://www.soundcloud.com/user/some-mix')).toBe(
      'https://soundcloud.com/user/some-mix'
    );
  });

  it('strips exactly one trailing slash', () => {
    expect(normalizeMixUrl('https://soundcloud.com/user/some-mix/')).toBe(
      'https://soundcloud.com/user/some-mix'
    );
  });

  it('lowercases the host but preserves the path case', () => {
    expect(normalizeMixUrl('https://SoundCloud.com/User/Some-Mix')).toBe(
      'https://soundcloud.com/User/Some-Mix'
    );
  });

  it('rejects a non-SoundCloud host', () => {
    expect(normalizeMixUrl('https://example.com/user/some-mix')).toBeNull();
  });

  it('rejects an on.soundcloud.com short link', () => {
    expect(normalizeMixUrl('https://on.soundcloud.com/abc123XYZ')).toBeNull();
  });

  it('rejects a bare /user profile link, with or without a trailing slash', () => {
    expect(normalizeMixUrl('https://soundcloud.com/user')).toBeNull();
    expect(normalizeMixUrl('https://soundcloud.com/user/')).toBeNull();
  });

  it('rejects input that does not parse as a URL', () => {
    expect(normalizeMixUrl('not a url')).toBeNull();
    expect(normalizeMixUrl('')).toBeNull();
  });

  it('rejects a scheme-less paste', () => {
    expect(normalizeMixUrl('soundcloud.com/user/some-mix')).toBeNull();
  });

  it('rejects a non-http(s) scheme', () => {
    expect(normalizeMixUrl('ftp://soundcloud.com/user/some-mix')).toBeNull();
  });

  it('is idempotent: f(f(x)) === f(x)', () => {
    const inputs = [
      'https://soundcloud.com/user/some-mix',
      'https://m.soundcloud.com/user/some-mix?si=abc123',
      'https://SoundCloud.com/User/Some-Mix/',
    ];
    for (const input of inputs) {
      const once = normalizeMixUrl(input);
      expect(once).not.toBeNull();
      expect(normalizeMixUrl(once as string)).toBe(once);
    }
  });
});
```

- [ ] **Step 7: Run the URL test to verify it fails**

Run: `yarn test src/features/mix/url.test.ts`
Expected: the file cannot be collected because `./url` does not exist yet:

```
 FAIL  src/features/mix/url.test.ts [ src/features/mix/url.test.ts ]
Error: Cannot find module './url' imported from …/src/features/mix/url.test.ts

 Test Files  1 failed (1)
      Tests  no tests
```

Run: `yarn typecheck`
Expected: `error Command failed with exit code 2`, one error:

```
src/features/mix/url.test.ts(2,33): error TS2307: Cannot find module './url' or its corresponding type declarations.
```

- [ ] **Step 8: Implement `normalizeMixUrl`**

Create `src/features/mix/url.ts`:

```ts
/** The three SoundCloud hosts a real permalink can arrive on. */
const ALLOWED_HOSTS = new Set([
  'soundcloud.com',
  'www.soundcloud.com',
  'm.soundcloud.com',
]);

/**
 * Canonical SoundCloud permalink, or null when the input is not one.
 *
 * The output is the single string used three ways — sent to both providers,
 * compared by the TrackId guard, and used as the `mixes` store key — so one
 * mix cannot save twice under two tracking params. TrackId's `?url=` filter is
 * an exact string match, so the path is preserved verbatim: only the host is
 * lowercased and rewritten, the query and fragment are dropped, and exactly one
 * trailing slash is stripped.
 */
export function normalizeMixUrl(input: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    return null; // free text, or a scheme-less paste like "soundcloud.com/…"
  }
  // A permalink is a web link; reject ftp:, blob:, mailto: and the like.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const host = parsed.hostname.toLowerCase();
  // on.soundcloud.com short links need a redirect the app cannot follow
  // cross-origin, so they are not accepted here.
  if (!ALLOWED_HOSTS.has(host)) return null;
  // Drop the query and fragment (parsed.pathname already excludes both); strip
  // exactly one trailing slash. The path case is kept — an upper-cased path
  // returned rowCount 0 from TrackId in the research.
  let path = parsed.pathname;
  if (path.endsWith('/')) path = path.slice(0, -1);
  // Require /user/slug: a bare /user profile link is not a track.
  if (path.split('/').filter((segment) => segment.length > 0).length < 2) {
    return null;
  }
  return `https://soundcloud.com${path}`;
}
```

- [ ] **Step 9: Run the URL test and the full gate**

Run: `yarn test src/features/mix/url.test.ts`
Expected: PASS, `Test Files  1 passed (1)`, `Tests  15 passed (15)`.

Run: `yarn typecheck && yarn lint && yarn test && yarn build`
Expected: all four pass. The suite is `Test Files  37 passed (37)`,
`Tests  410 passed (410)`.

Run: `npx prettier --check "src/**/*.ts"`
Expected: `All matched files use Prettier code style!`

- [ ] **Step 10: Commit**

```bash
yarn format
git add src/features/mix/url.ts src/features/mix/url.test.ts
git commit -m "feat(mix): normalizeMixUrl for the canonical SoundCloud permalink

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

- [ ] **Step 11: Verify the real IndexedDB upgrade in Chrome (no screen yet)**

There is no Mix screen in this task, so this is a **migration** check, not a
screen walkthrough — the Node tests run on `fake-indexeddb`, which is not
Chrome's IndexedDB.

1. Run `yarn dev` and open `http://127.0.0.1:5173/myOwnSpotifyData/` at a
   390 px viewport (DevTools device toolbar).
2. Open DevTools → **Application** → **IndexedDB** → **`spotify-dj`**.
3. Confirm the database **version is 4** and its object stores are exactly
   `playlists`, `tracks`, `entries`, `topItems`, `plays`, `features`,
   `artistIdentity`, `artistReach`, **`mixes`**, `meta`.
4. If this browser had already run the app before this change (a real version 3
   database), confirm its existing playlist/track/play/feature/reach rows are
   still present under the same stores after the reload — the guarded upgrade
   adds `mixes` without dropping anything. (A fresh profile simply opens at
   version 4 directly, which also confirms the store is created.)

Nothing writes a `mixes` row yet — `putMix` is exercised only by the tests and,
from Task 4 onward, by the screen's Save button.

---

### Task 2: The line grammar, the description/paste parser, and the library match (all pure)

**Spec:** `docs/superpowers/specs/2026-09-06-mix-tracklist-design.md` §3.4, §3.5, §3.6
(and §8 for the invented constants and the `ID`/`?`/`unknown` ruling).
**Research it argues from:** `docs/superpowers/research/2026-09-06-mix-tracklist-sources.md`
§4.4 (the six shapes, the three dashes, `.`/`:` separators, `ID`/`?`/`unknown`
values, the ≥5-line run guard, and the "detect the link, show it" rule) and
§4.3 (MixesDB's `[123] = 2h03m` minutes convention).

Two new pure modules under `src/features/mix/`, each with a Vitest file beside
it in the Node environment (CLAUDE.md; no DOM, no component test). No network,
no IndexedDB, no signals — every function here is a pure transform. There is
**no browser step in this task**: `#/mix` does not exist until Task 5, which
owns the screen and its 390 px walkthrough. This task ends on the gate.

**Files:**

- Create:
  - `src/features/mix/parse.ts` (the grammar: `parseClock`, `parseLines`,
    `parseDescription`, `parsePasted`, `ParsedTracklist`, and the two
    `MIN_RUN` constants)
  - `src/features/mix/match.ts` (the live library join: `libraryTitleIndex`,
    `matchMixRow`, `MixMatch`)
- Test:
  - `src/features/mix/parse.test.ts` (new, 21 tests)
  - `src/features/mix/match.test.ts` (new, 6 tests)
- Modify: **none.** This task adds only new files. `src/db/schema.ts` already
  carries `MixRowSource` and `TracklistRow` from **Task 1**; do not add or edit
  them here (see the Notes on the scratch stub).
- Unchanged, do not touch: `src/features/rekordbox-match.ts`,
  `src/model/normalize.ts` and `src/model/aggregate.ts` are consumed exactly as
  they stand; nothing in them changes.

**Interfaces:**

- Consumes:
  - From **Task 1**, `src/db/schema.ts` (import these by these exact names):
    - `export type MixRowSource = 'trackid' | 'description' | 'pasted' | 'manual'`
    - `export interface TracklistRow { startSec: number | null; endSec: number
      | null; artist: string; title: string; label: string | null; source:
      MixRowSource; gap: boolean; detected: { artist: string; title: string } |
      null; referenceCount: number | null }`
  - From existing code, exactly as it stands at `feat/mix-tracklist` `23efb62`:
    - `src/features/rekordbox-match.ts`: `export function cleanTitle(s: string):
      string` (normalises and strips feat/generic noise, **keeps a remix
      tail**), `export function primaryArtist(s: string): string` (the first
      credited artist of a joined string, unnormalised)
    - `src/model/normalize.ts`: `export function normalize(s: string): string`
      (NFD-fold, lowercase, non-alphanumerics → single spaces, trim)
    - `src/model/aggregate.ts`: `export interface Model` — the two fields this
      task reads are `tracksByKey: Map<string, TrackRow>` and
      `playlistsOfTrack: Map<string, Set<string>>` (keyed by the track's own id
      for a non-local track) — and `export function buildModel(rows: AllRows):
      Model` (the `match.test.ts` fixture builds a `Model` through it)
    - `src/db/schema.ts` (for the `match.test.ts` fixture only):
      `interface AllRows`, `interface ArtistRef { id: string | null; name:
      string }`, `interface TrackRow { key; id: string | null; uri; name;
      artists: ArtistRef[]; album; durationMs; isrc; spotifyUrl; isLocal:
      boolean }`
- Produces — **later tasks import these by these exact names**:
  - `src/features/mix/parse.ts`:
    - `export function parseClock(s: string): number | null` — **Task 3**'s
      `tidSpansToRows` imports this to parse TrackId's `"HH:MM:SS"`
      `startTime`/`endTime`; the load-bearing contract is that a **bare integer
      returns `null`** (`parseClock('42') === null`), so a `trackCount` can
      never be mistaken for a clock.
    - `export interface ParsedTracklist { rows: TracklistRow[]; linkOut: string
      | null }` — **Tasks 4/5** consume it (`view.descriptionRows`,
      `sources.linkOut`).
    - `export function parseDescription(rawDescription: string): ParsedTracklist`
      (source `'description'`) and `export function parsePasted(text: string):
      ParsedTracklist` (source `'pasted'`) — **Task 5** (`state.ts`) calls the
      first inside `startMixLookup` and the second inside
      `applyPastedTracklist`.
    - `export const MIX_DESCRIPTION_MIN_RUN = 5` and
      `export const MIX_PASTE_MIN_RUN = 1`.
    - `export function parseLines(text: string, minRun: number, source?:
      MixRowSource): ParsedTracklist` — exported so `parse.test.ts` can drive
      the grammar directly; **no other task imports it** (only the two wrappers
      above call it across a module boundary). See the Notes on its third
      parameter.
  - `src/features/mix/match.ts`:
    - `export interface MixMatch { trackId: string; playlistCount: number }`
    - `export function libraryTitleIndex(model: Model): Map<string, string[]>`
    - `export function matchMixRow(model: Model, index: Map<string, string[]>,
      row: TracklistRow): MixMatch | null` — **Task 6** (`ui/crate`/`Mix.tsx`)
      calls both to draw the "in N playlists" line and the `FeaturePills`
      against a live match.
- Obligations this task puts on later tasks, so nothing is defined twice:
  - **Task 1 owns `MixRowSource` and `TracklistRow`** in `src/db/schema.ts`, and
    **owns `DB_VERSION = 4`**. Task 2 declares none of them and does not touch
    `DB_VERSION`.
  - **Task 3 owns `MIX_MERGE_TOLERANCE_SEC = 5` and `MIX_GAP_MIN_SEC = 60`** (in
    `src/features/mix/trackid.ts`, spec §3.3/§8). Task 2 owns **only** the two
    `MIN_RUN` constants. The four §8 constants are declared once each, split
    across the two tasks.
  - **Task 3 imports `parseClock` from `./parse`** — it is created here, not
    duplicated there.

**Notes:**

- **`parseLines`'s third parameter is a defaulted internal extension of the
  spec's quoted two-arg signature.** §3.5 quotes `parseLines(text: string,
  minRun: number): ParsedTracklist`. The produced signature adds
  `source: MixRowSource = 'description'` as a third argument. It is
  call-compatible with the quoted form, and — the discriminating fact — **no
  task boundary sees it**: only `parseDescription` (default `'description'`) and
  `parsePasted` (`'pasted'`) call `parseLines`. Do **not** infer the source from
  `minRun` (a run-length threshold and a provenance label are unrelated
  quantities; `parseLines(text, 1)` on a description would then mislabel every
  row). The assembler reconciles the quoted §3.5 signature with this one by
  reading "third arg, defaulted, internal".
- **`startSec: 0` is a real value, never falsy-coerced.** Shape 4's `[0:00]:`
  and shape 5's `00:00` both yield `0`, and §7 tests both. Every place that may
  produce a zero start uses `?? null` (never `|| null`), and the tests assert
  `toBe(0)`, not truthiness. A parser that dropped a `0:00` would silently lose
  the first track of every timed tracklist.
- **`parseClock` returns `null` for a bare integer.** `parseClock('42')` is
  `null`, which is exactly what keeps MixesDB's shape 6 (`[42]` → minutes) out
  of the clock path and what stops Task 3 feeding a bare `trackCount` through
  `parseClock`. Garbage (`'abc'`, `''`) is `null` too. This null arm is tested.
- **Prefix order is load-bearing and the reason `.` is safe.** The clock
  prefixes (shapes 4 and 5) are tried **before** the index prefixes (1, 3, 6),
  and an index prefix requires whitespace after its separator (`\s+`, not
  `\s*`). So `1.30 Artist - Title` matches shape 5 first → `startSec` 90, while
  `1. Artist - Title` falls through to shape 1 → an index, no time. Both are in
  the shape tests. Shape 4's bracket must contain a **clock** (a `:`/`.`
  group), so `[42]` is not swallowed by shape 4 and reaches shape 6, where the
  bracketed integer is **minutes** (`42 * 60 = 2520`).
- **The dash must be spaced.** The split is on the first ` [-–—] ` (a dash of
  any of the three characters surrounded by whitespace), so `Sun-El Musician -
  Akanamali` splits only at the spaced dash, not the hyphen in the name.
- **The trailing `[...]` is peeled into `label`, and that is a decision, not an
  oversight.** §3.5 says "peel an optional trailing `[Label]`". The parser
  cannot tell a record-label bracket (`[T4T LUV NRG]`) from a remix bracket
  (`[Ted Remix]`), so `Artist - Losing It [Ted Remix]` becomes `title 'Losing
  It'`, `label 'Ted Remix'`, and — because `cleanTitle` deliberately keeps remix
  tails but a peeled bracket is gone before the key is built — that row keys as
  `losing it|artist` and can hit the library's **un-remixed** original. A
  `match.test.ts` case documents this so the next reader knows it was chosen.
- **The run guard, precisely.** Split on `\r?\n`. A **run** is a maximal
  sequence of matching lines in which **blank lines are transparent** (skipped —
  they neither match nor break) and a **non-blank non-matching line breaks** the
  run. Rows are every matching line in a run of length `≥ minRun`; below that,
  nothing. A four-row block inside prose is rejected (`minRun` 5); a paste of
  three lines is kept (`minRun` 1).
- **Link-out is scanned independently of the run guard.** A line that mentions
  `tracklist`/`track list` **and** carries a URL-ish token (`https?://…`, or a
  `word.tld/…` such as `dkmn.tl/270-ErisDrew` or `thelotradio.com`) sets
  `linkOut` to the first such token found. A listing and a link can both be
  present; both are returned.
- **`ID` / `?` / `unknown` are kept verbatim by the parser** (they are
  legitimate track values) but are **inert in the matcher**: `matchMixRow`
  returns `null` for them and for a gap row **before** consulting the index. The
  `match.test.ts` fixture deliberately seeds a library track keyed `id|id`, so
  the "no lookup" test proves the early return rather than an incidental miss.
  The check is on the trimmed, lower-cased raw value (`'id' | '?' | 'unknown'`),
  not on `normalize`, because `normalize('?')` is `''`.
- **`libraryTitleIndex` is memoised on `Model` identity, one entry**, exactly as
  `rankUnderTheRadar` is (`src/model/reach.ts`): the model object changes only
  when `loadFromDb` rebuilds it, so a re-render costs no re-index. The key is
  `` `${cleanTitle(name)}|${normalize(primaryArtist(artist))}` `` — byte-for-byte
  the key `rekordbox-match.ts` builds — so a mix row and a Rekordbox row hit the
  library the same way. Locals (`isLocal`) and id-less tracks are skipped.
- **`matchMixRow` matches only a unique id.** An ambiguous key (two ids) returns
  `null` — the safe direction, as in artist-reach §3.3. `playlistCount` is
  `model.playlistsOfTrack.get(trackId)?.size ?? 0`.
- **The scratch-proof stub.** This task was proved against a pristine checkout
  of `23efb62` with a **minimal stub** of `MixRowSource` + `TracklistRow`
  appended to `src/db/schema.ts` (Task 1 declares them for real). In real
  execution Task 1 has already landed, so the two modules compile against the
  real schema and no stub is needed. The stub is a proof artifact only; it is
  **not** part of this task's changes.

- [ ] **Step 1: Write the failing test for the grammar (`parse.test.ts`)**

Create `src/features/mix/parse.test.ts` with exactly this content:

```ts
import { describe, expect, it } from 'vitest';
import { parseClock, parseDescription, parseLines, parsePasted } from './parse';

/** A single-line parse: minRun 1 accepts one matching line. */
function one(line: string) {
  const { rows } = parseLines(line, 1, 'pasted');
  expect(rows).toHaveLength(1);
  return rows[0];
}

describe('parseClock', () => {
  it('reads mm:ss, hh:mm:ss, the . separator and a fractional tail', () => {
    expect(parseClock('0:00')).toBe(0);
    expect(parseClock('11:44')).toBe(704);
    expect(parseClock('1:00:30')).toBe(3630);
    expect(parseClock('1.02.30')).toBe(3750);
    expect(parseClock('03:10:37.1910000')).toBe(11437);
  });

  it('returns null for a bare integer and for garbage', () => {
    expect(parseClock('42')).toBeNull();
    expect(parseClock('abc')).toBeNull();
    expect(parseClock('')).toBeNull();
  });
});

describe('parseLines shapes', () => {
  it('shape 1: numbered index, no time', () => {
    const r = one('1. Daft Punk - Da Funk');
    expect(r.startSec).toBeNull();
    expect(r.artist).toBe('Daft Punk');
    expect(r.title).toBe('Da Funk');
    expect(r.label).toBeNull();
  });

  it('shape 2: bare dash', () => {
    const r = one('Daft Punk - Da Funk');
    expect(r.startSec).toBeNull();
    expect(r.artist).toBe('Daft Punk');
    expect(r.title).toBe('Da Funk');
  });

  it('shape 3: side-position index, no time', () => {
    const r = one('a1. Daft Punk - Da Funk');
    expect(r.startSec).toBeNull();
    expect(r.artist).toBe('Daft Punk');
    expect(r.title).toBe('Da Funk');
  });

  it('shape 4: bracketed clock, one and two H: groups (startSec 0 kept)', () => {
    expect(one('[0:00]: Daft Punk - Da Funk').startSec).toBe(0);
    expect(one('[1:00:30] Daft Punk - Da Funk').startSec).toBe(3630);
    // two-digit hour (TrackId's HH:MM:SS form, the Four Tet comment style)
    expect(one('[01:00:30] Daft Punk - Da Funk').startSec).toBe(3630);
  });

  it('shape 5: bare offset with : and the . separator (startSec 0 kept)', () => {
    expect(one('00:00 Daft Punk - Da Funk').startSec).toBe(0);
    expect(one('1:00:30 Daft Punk - Da Funk').startSec).toBe(3630);
  });

  it('shape 6: MixesDB [minutes] and a trailing [Label]', () => {
    const r = one('[42] Eris Drew - Trance Emoji [T4T LUV NRG]');
    expect(r.startSec).toBe(2520);
    expect(r.artist).toBe('Eris Drew');
    expect(r.title).toBe('Trance Emoji');
    expect(r.label).toBe('T4T LUV NRG');
  });

  it('accepts all three dash characters', () => {
    expect(one('A - B').title).toBe('B');
    expect(one('A – B').title).toBe('B'); // en dash
    expect(one('A — B').title).toBe('B'); // em dash
  });

  it('does not split a hyphenated name lacking spaces around the dash', () => {
    const r = one('Sun-El Musician - Akanamali');
    expect(r.artist).toBe('Sun-El Musician');
    expect(r.title).toBe('Akanamali');
  });

  it('the prefix-order pair: 1.30 is a clock, 1. is an index', () => {
    expect(one('1.30 Artist - Title').startSec).toBe(90);
    expect(one('1. Artist - Title').startSec).toBeNull();
  });

  it('keeps ID / ? / unknown as verbatim values', () => {
    const r = one('[12:00] ID - ID');
    expect(r.startSec).toBe(720);
    expect(r.artist).toBe('ID');
    expect(r.title).toBe('ID');
    const q = one('? - unknown');
    expect(q.artist).toBe('?');
    expect(q.title).toBe('unknown');
  });
});

describe('parseLines run guard', () => {
  const block = (n: number) =>
    Array.from({ length: n }, (_, i) => `Artist${i} - Title${i}`).join('\n');

  it('accepts a run of 5 with minRun 5', () => {
    expect(parseLines(block(5), 5).rows).toHaveLength(5);
  });

  it('rejects a block of 4 with minRun 5 (keeps prose out)', () => {
    const text = `Some prose introducing the mix.\n${block(4)}\nThanks for listening!`;
    expect(parseLines(text, 5).rows).toHaveLength(0);
  });

  it('treats blank lines inside a run as transparent', () => {
    const text = `A0 - T0\nA1 - T1\n\nA2 - T2\nA3 - T3\nA4 - T4`;
    expect(parseLines(text, 5).rows).toHaveLength(5);
  });

  it('lets a prose line break a run', () => {
    const text = `${block(3)}\nJust some words here\nA - B\nC - D\nE - F`;
    // two runs of 3, neither reaches 5
    expect(parseLines(text, 5).rows).toHaveLength(0);
  });

  it('sets source from parseLines default and parsePasted', () => {
    expect(parseLines(block(5), 5).rows[0].source).toBe('description');
    expect(parsePasted('A - B\nC - D\nE - F').rows).toHaveLength(3);
    expect(parsePasted('A - B\nC - D\nE - F').rows[0].source).toBe('pasted');
  });
});

describe('parseLines link-out detection', () => {
  it('captures a URL token beside a tracklist mention (path form)', () => {
    const { rows, linkOut } = parseLines(
      'Full tracklist here: dkmn.tl/270-ErisDrew',
      5
    );
    expect(rows).toHaveLength(0);
    expect(linkOut).toBe('dkmn.tl/270-ErisDrew');
  });

  it('captures a bare domain after "track list"', () => {
    expect(
      parseLines('find the track list on thelotradio.com', 5).linkOut
    ).toBe('thelotradio.com');
  });

  it('keeps both a listing and a link when both are present', () => {
    const block = Array.from(
      { length: 5 },
      (_, i) => `Artist${i} - Title${i}`
    ).join('\n');
    const { rows, linkOut } = parseLines(
      `${block}\nFull tracklist here: https://example.com/mix`,
      5
    );
    expect(rows).toHaveLength(5);
    expect(linkOut).toBe('https://example.com/mix');
  });
});

describe('parseDescription', () => {
  it('decodes entities and <br> before applying the grammar', () => {
    const raw =
      '1. Foo &amp; Bar - Track One<br>2. Baz - Qux<br>3. A - B<br>4. C - D<br>5. E - F';
    const { rows } = parseDescription(raw);
    expect(rows).toHaveLength(5);
    expect(rows[0].artist).toBe('Foo & Bar');
    expect(rows[0].title).toBe('Track One');
    expect(rows[0].source).toBe('description');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/features/mix/parse.test.ts`

Expected: `Test Files 1 failed (1)`, `Tests no tests` — the module does not
exist yet:

```
 ❯ src/features/mix/parse.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/features/mix/parse.test.ts [ src/features/mix/parse.test.ts ]
Error: Cannot find module './parse' imported from .../src/features/mix/parse.test.ts
 ❯ src/features/mix/parse.test.ts:2:1
      1| import { describe, expect, it } from 'vitest';
      2| import { parseClock, parseDescription, parseLines, parsePasted } from …
       | ^

 Test Files  1 failed (1)
      Tests  no tests
```

- [ ] **Step 3: Write the grammar (`parse.ts`)**

Create `src/features/mix/parse.ts` with exactly this content:

```ts
import type { MixRowSource, TracklistRow } from '../../db/schema';

/** ≥ this many matching lines in a run before a description block is accepted. */
export const MIX_DESCRIPTION_MIN_RUN = 5;
/** A deliberate paste accepts a single matching line. */
export const MIX_PASTE_MIN_RUN = 1;

export interface ParsedTracklist {
  rows: TracklistRow[];
  /** A "full tracklist at <url>" link found instead of a listing, or null. */
  linkOut: string | null;
}

/** A clock: 2 or 3 `:`/`.`-separated groups, optional fractional seconds. */
const CLOCK = String.raw`\d{1,3}[:.]\d{1,2}(?:[:.]\d{1,2})?(?:\.\d+)?`;
const PARSE_CLOCK = /^(\d{1,3})[:.](\d{1,2})(?:([:.])(\d{1,2}))?(?:\.\d+)?$/;

/**
 * "H:MM:SS" / "M:SS" / "M.SS", one or two H: groups, '.' or ':' as separator,
 * fractional trailing seconds tolerated; seconds from zero, or null. A bare
 * integer such as "42" has no separator and is null (so MixesDB's `[42]`
 * minutes shape never travels the clock path).
 */
export function parseClock(s: string): number | null {
  const m = PARSE_CLOCK.exec(s.trim());
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (m[3] !== undefined && m[4] !== undefined) {
    return a * 3600 + b * 60 + Number(m[4]);
  }
  return a * 60 + b;
}

// Prefixes, tried in this order. Clock shapes (4, 5) win over index shapes
// (1, 3, 6) because '.' is both a time and an index separator.
const PREFIX_BRACKET_CLOCK = new RegExp(
  `^[\\[(]\\s*(${CLOCK})\\s*[\\])]\\s*:?\\s*`
); // shape 4
const PREFIX_BARE_CLOCK = new RegExp(`^(${CLOCK})\\s+`); // shape 5
const PREFIX_INDEX = /^\d{1,3}[.)]\s+/; // shape 1
const PREFIX_SIDE = /^[a-dA-D]\d{1,2}[.)]\s+/; // shape 3
const PREFIX_BRACKET_MIN = /^\[(\d{1,3})\]\s*/; // shape 6 (minutes)

const DASH_SPLIT = /^(.*?)\s+[-–—]\s+(.*)$/;
const TRAILING_LABEL = /\s*\[([^\]]+)\]\s*$/;

const TRACKLIST_WORD = /track\s?list/i;
const URL_TOKEN = /https?:\/\/\S+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?/i;

/** Strip at most one leading prefix; return the remainder and any startSec. */
function stripPrefix(line: string): { rest: string; startSec: number | null } {
  let m = PREFIX_BRACKET_CLOCK.exec(line);
  if (m) return { rest: line.slice(m[0].length), startSec: parseClock(m[1]) };
  m = PREFIX_BARE_CLOCK.exec(line);
  if (m) return { rest: line.slice(m[0].length), startSec: parseClock(m[1]) };
  m = PREFIX_INDEX.exec(line);
  if (m) return { rest: line.slice(m[0].length), startSec: null };
  m = PREFIX_SIDE.exec(line);
  if (m) return { rest: line.slice(m[0].length), startSec: null };
  m = PREFIX_BRACKET_MIN.exec(line);
  if (m) return { rest: line.slice(m[0].length), startSec: Number(m[1]) * 60 };
  return { rest: line, startSec: null };
}

/** Parse one non-blank line to a row, or null when it is not a track line. */
function parseTrackLine(
  line: string,
  source: MixRowSource
): TracklistRow | null {
  const { rest, startSec } = stripPrefix(line);
  const split = DASH_SPLIT.exec(rest);
  if (!split) return null;
  const artist = split[1].trim();
  let title = split[2].trim();
  let label: string | null = null;
  const labelMatch = TRAILING_LABEL.exec(title);
  if (labelMatch) {
    label = labelMatch[1].trim();
    title = title.slice(0, labelMatch.index).trim();
  }
  if (artist === '' || title === '') return null;
  return {
    startSec: startSec ?? null,
    endSec: null,
    artist,
    title,
    label,
    source,
    gap: false,
    detected: { artist, title },
    referenceCount: null,
  };
}

/**
 * A run is a maximal sequence of matching lines in which blank lines are
 * transparent (skipped, they neither match nor break) and a non-blank
 * non-matching line breaks the run. Rows come from every run of length
 * `≥ minRun`. `parseLines` also scans, independently of the run guard, for a
 * "full tracklist at <url>" link and returns it as `linkOut`.
 *
 * `source` is a defaulted internal extension of the spec's quoted two-arg
 * signature: only `parseDescription` / `parsePasted` call `parseLines`, so no
 * task boundary sees the third argument.
 */
export function parseLines(
  text: string,
  minRun: number,
  source: MixRowSource = 'description'
): ParsedTracklist {
  const lines = text.split(/\r?\n/);
  const rows: TracklistRow[] = [];
  let run: TracklistRow[] = [];
  const flush = () => {
    if (run.length >= minRun) rows.push(...run);
    run = [];
  };
  let linkOut: string | null = null;
  for (const raw of lines) {
    if (linkOut === null && TRACKLIST_WORD.test(raw)) {
      const url = URL_TOKEN.exec(raw);
      if (url) linkOut = url[0];
    }
    const line = raw.trim();
    if (line === '') continue; // blank: transparent
    const row = parseTrackLine(line, source);
    if (row) run.push(row);
    else flush(); // non-blank, non-matching: breaks the run
  }
  flush();
  return { rows, linkOut };
}

const ENTITIES: Array<[RegExp, string]> = [
  [/&amp;/gi, '&'],
  [/&lt;/gi, '<'],
  [/&gt;/gi, '>'],
  [/&quot;/gi, '"'],
  [/&#0*39;/g, "'"],
  [/&apos;/gi, "'"],
];

function htmlToLines(raw: string): string {
  const withBreaks = raw.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n');
  let text = withBreaks.replace(/<[^>]+>/g, '');
  for (const [re, to] of ENTITIES) text = text.replace(re, to);
  return text;
}

/** oEmbed description: unescape entities, strip tags, then the ≥5 run guard. */
export function parseDescription(rawDescription: string): ParsedTracklist {
  return parseLines(htmlToLines(rawDescription), MIX_DESCRIPTION_MIN_RUN);
}

/** Pasted text: the owner deliberately pasted a list, so a single line counts. */
export function parsePasted(text: string): ParsedTracklist {
  return parseLines(text, MIX_PASTE_MIN_RUN, 'pasted');
}
```

- [ ] **Step 4: Run the grammar test to verify it passes**

Run: `yarn test src/features/mix/parse.test.ts`

Expected: PASS, `Test Files 1 passed (1)`, `Tests 21 passed (21)`.

- [ ] **Step 5: Run the full gate**

Run: `yarn test src/features/mix/parse.test.ts`

Expected: `Test Files 1 passed (1)`, `Tests 21 passed (21)` — this file-scoped
count is deterministic.

Run: `yarn typecheck && yarn lint && yarn test`

Expected: all three pass. `parse.test.ts` adds one file and **+21** tests over
Task 1's 410, so the suite is `Test Files  38 passed (38)`,
`Tests  431 passed (431)` (measured on the assembled branch).

- [ ] **Step 6: Commit the grammar**

```bash
git add src/features/mix/parse.ts src/features/mix/parse.test.ts
git commit -m "feat(mix): parse SoundCloud descriptions and pastes into tracklist rows

The six line shapes, three dash characters, . and : clock separators, the
≥minRun run guard (5 for a description, 1 for a paste), clock prefixes before
index prefixes, and link-out detection, all pure and unit-tested.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

- [ ] **Step 7: Write the failing test for the library match (`match.test.ts`)**

Create `src/features/mix/match.test.ts` with exactly this content:

```ts
import { describe, expect, it } from 'vitest';
import type {
  AllRows,
  ArtistRef,
  TracklistRow,
  TrackRow,
} from '../../db/schema';
import { buildModel } from '../../model/aggregate';
import { libraryTitleIndex, matchMixRow } from './match';

function track(
  key: string,
  name: string,
  artists: ArtistRef[],
  over: Partial<TrackRow> = {}
): TrackRow {
  return {
    key,
    id: key.startsWith('spotify:local:') ? null : key,
    uri: key.startsWith('spotify:') ? key : `spotify:track:${key}`,
    name,
    artists,
    album: 'Album',
    durationMs: 1000,
    isrc: null,
    spotifyUrl: null,
    isLocal: key.startsWith('spotify:local:'),
    ...over,
  };
}

function row(over: Partial<TracklistRow>): TracklistRow {
  return {
    startSec: null,
    endSec: null,
    artist: '',
    title: '',
    label: null,
    source: 'pasted',
    gap: false,
    detected: null,
    referenceCount: null,
    ...over,
  };
}

const rows: AllRows = {
  playlists: [
    {
      id: 'p1',
      name: 'One',
      snapshotId: 's',
      itemCount: 0,
      imageUrl: null,
      spotifyUrl: null,
      syncedAt: 1,
    },
    {
      id: 'p2',
      name: 'Two',
      snapshotId: 's',
      itemCount: 0,
      imageUrl: null,
      spotifyUrl: null,
      syncedAt: 1,
    },
  ],
  tracks: [
    track('fish1', 'Losing It', [{ id: 'a-fisher', name: 'Fisher' }]),
    track('amb1', 'Track A', [{ id: 'a-djx', name: 'DJ X' }]),
    track('amb2', 'Track A', [{ id: 'a-djx', name: 'DJ X' }]),
    track('idtrk', 'ID', [{ id: 'a-id', name: 'ID' }]),
    track('lt1', 'Losing It', [{ id: 'a-someone', name: 'Someone' }]),
    track('spotify:local:z', 'Local Cut', [{ id: null, name: 'Local' }]),
  ],
  entries: [
    { playlistId: 'p1', position: 0, trackKey: 'fish1', addedAt: null },
    { playlistId: 'p2', position: 0, trackKey: 'fish1', addedAt: null },
    { playlistId: 'p1', position: 1, trackKey: 'amb1', addedAt: null },
  ],
  topItems: [],
  plays: [],
  features: [],
  artistIdentity: [],
  artistReach: [],
};

const model = buildModel(rows);

describe('libraryTitleIndex', () => {
  it('keys by cleanTitle/primaryArtist/normalize and skips locals and id-less', () => {
    const index = libraryTitleIndex(model);
    expect(index.get('losing it|fisher')).toEqual(['fish1']);
    expect(index.get('track a|dj x')).toEqual(['amb1', 'amb2']);
    // The local track is not indexed under any key.
    expect(index.get('local cut|local')).toBeUndefined();
  });

  it('memoises one entry on Model identity', () => {
    expect(libraryTitleIndex(model)).toBe(libraryTitleIndex(model));
    const other = buildModel(rows);
    expect(libraryTitleIndex(other)).not.toBe(libraryTitleIndex(model));
  });
});

describe('matchMixRow', () => {
  // Fetched inside each test, not at describe scope: the index is module-level
  // memoised state, and computing it per test keeps the tests order-independent.
  it('hits a unique library track and returns its playlist count', () => {
    const index = libraryTitleIndex(model);
    const m = matchMixRow(
      model,
      index,
      row({ artist: 'FISHER', title: 'Losing It' })
    );
    expect(m).toEqual({ trackId: 'fish1', playlistCount: 2 });
  });

  it('returns null for an ambiguous key (two ids)', () => {
    const index = libraryTitleIndex(model);
    expect(
      matchMixRow(model, index, row({ artist: 'DJ X', title: 'Track A' }))
    ).toBeNull();
  });

  it('returns null for a gap row and for ID / ? / unknown, with no lookup', () => {
    const index = libraryTitleIndex(model);
    expect(matchMixRow(model, index, row({ gap: true }))).toBeNull();
    // idtrk keys as `id|id`, so a lookup WOULD hit — the inert guard wins.
    expect(
      matchMixRow(model, index, row({ artist: 'ID', title: 'ID' }))
    ).toBeNull();
    expect(
      matchMixRow(model, index, row({ artist: '?', title: '?' }))
    ).toBeNull();
    expect(
      matchMixRow(model, index, row({ artist: 'Unknown', title: 'unknown' }))
    ).toBeNull();
  });

  it('peels a trailing [bracket] into the label, so a remix tag keys on the original title', () => {
    // 'Losing It [Ted Remix]' -> label 'Ted Remix', title 'Losing It'; the
    // peeled row keys `losing it|someone` and hits the un-remixed library track.
    const index = libraryTitleIndex(model);
    const m = matchMixRow(
      model,
      index,
      row({ artist: 'Someone', title: 'Losing It', label: 'Ted Remix' })
    );
    expect(m).toEqual({ trackId: 'lt1', playlistCount: 0 });
  });
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `yarn test src/features/mix/match.test.ts`

Expected: `Test Files 1 failed (1)`, `Tests no tests` — the module does not
exist yet:

```
 ❯ src/features/mix/match.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/features/mix/match.test.ts [ src/features/mix/match.test.ts ]
Error: Cannot find module './match' imported from .../src/features/mix/match.test.ts
 ❯ src/features/mix/match.test.ts:9:1
      7| } from '../../db/schema';
      8| import { buildModel } from '../../model/aggregate';
      9| import { libraryTitleIndex, matchMixRow } from './match';
       | ^
```

- [ ] **Step 9: Write the library match (`match.ts`)**

Create `src/features/mix/match.ts` with exactly this content:

```ts
import type { TracklistRow } from '../../db/schema';
import { cleanTitle, primaryArtist } from '../rekordbox-match';
import type { Model } from '../../model/aggregate';
import { normalize } from '../../model/normalize';

export interface MixMatch {
  trackId: string;
  playlistCount: number;
}

/** The join key both a mix row and a library track are reduced to. */
function titleArtistKey(title: string, artist: string): string {
  return `${cleanTitle(title)}|${normalize(primaryArtist(artist))}`;
}

/** `ID` / `?` / `unknown` are legitimate values, but they link and match nothing. */
function isInertToken(s: string): boolean {
  const t = s.trim().toLowerCase();
  return t === 'id' || t === '?' || t === 'unknown';
}

let indexedModel: Model | null = null;
let indexedResult = new Map<string, string[]>();

/**
 * `titleArtistKey` -> the Spotify ids that share it. Locals and id-less tracks
 * are skipped. Memoised on `Model` identity, one entry, as `rankUnderTheRadar`
 * is: the model changes only when `loadFromDb` rebuilds it.
 */
export function libraryTitleIndex(model: Model): Map<string, string[]> {
  if (indexedModel === model) return indexedResult;
  const index = new Map<string, string[]>();
  for (const track of model.tracksByKey.values()) {
    if (track.isLocal || track.id === null) continue;
    const key = titleArtistKey(track.name, track.artists[0]?.name ?? '');
    const bucket = index.get(key);
    if (bucket) bucket.push(track.id);
    else index.set(key, [track.id]);
  }
  indexedModel = model;
  indexedResult = index;
  return index;
}

/**
 * A match only when the row's key hits exactly one library id — an ambiguous
 * key is no match, the safe direction. A gap row or an `ID`/`?`/`unknown` row
 * returns null with no lookup. `playlistCount` is how many owned playlists hold
 * the matched track.
 */
export function matchMixRow(
  model: Model,
  index: Map<string, string[]>,
  row: TracklistRow
): MixMatch | null {
  if (row.gap || isInertToken(row.artist) || isInertToken(row.title)) {
    return null;
  }
  const ids = index.get(titleArtistKey(row.title, row.artist));
  if (!ids || ids.length !== 1) return null;
  const trackId = ids[0];
  return {
    trackId,
    playlistCount: model.playlistsOfTrack.get(trackId)?.size ?? 0,
  };
}
```

- [ ] **Step 10: Run the match test to verify it passes**

Run: `yarn test src/features/mix/match.test.ts`

Expected: PASS, `Test Files 1 passed (1)`, `Tests 6 passed (6)`.

- [ ] **Step 11: Run the full gate, the build, and the Prettier check**

Run: `yarn test src/features/mix/parse.test.ts src/features/mix/match.test.ts`

Expected: PASS, `Test Files 2 passed (2)`, `Tests 27 passed (27)` — the two
files this task adds (`src/features/mix` also holds Task 1's `url.test.ts`, so
name the two files explicitly rather than the folder).

Run: `yarn typecheck && yarn lint && yarn test && yarn build`

Expected: all four pass; `yarn build` ends with `✓ built` and no error. The two
new files add +21 then +6 over Task 1's 410, so the suite is
`Test Files  39 passed (39)`, `Tests  437 passed (437)` (measured).

Run: `npx prettier --check "src/features/mix/*.ts"`

Expected: `All matched files use Prettier code style!`

- [ ] **Step 12: Commit the library match**

```bash
git add src/features/mix/match.ts src/features/mix/match.test.ts
git commit -m "feat(mix): match tracklist rows to the owner's library

libraryTitleIndex reuses cleanTitle/primaryArtist/normalize so a mix row and a
Rekordbox row hit the library by the same key; matchMixRow returns a unique-id
match with its playlist count, and nothing for a gap or an ID/?/unknown row.
Memoised on Model identity, computed live, never stored.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

---

### Task 3: oEmbed and TrackId.net clients

The two keyless network reads of the Mix feature (spec §3.2, §3.3), each a pure
function behind an injected `fetchFn: typeof fetch` returning a typed
`ok` / `notFound` / `error` union — nothing swallowed, no real endpoint ever
touched by a test. `oembed.ts` reads the SoundCloud oEmbed metadata and the
player iframe src; `trackid.ts` runs the mandatory two-call TrackId flow behind
THE GUARD and maps the identified spans (with `ID · unidentified` gap rows) to
`TracklistRow[]`.

**Files:**

- Create:
  - `src/features/mix/oembed.ts`
  - `src/features/mix/trackid.ts`
- Modify: **none.** Task 1 owns `src/db/schema.ts` (`TracklistRow`,
  `MixRowSource`, `MixRow`, the `mixes` store, `DB_VERSION` 4 and the repo
  helpers) and `src/features/mix/url.ts` (`normalizeMixUrl`); Task 2 owns
  `src/features/mix/parse.ts` (`parseDescription`, `parsePasted`, `parseLines`,
  `parseClock`). This task imports from both and edits neither.
- Test:
  - `src/features/mix/oembed.test.ts` (new, 12 tests)
  - `src/features/mix/trackid.test.ts` (new, 23 tests)

**Interfaces:**

- Consumes — **must already exist when this task runs** (see the ordering note
  below):
  - `src/db/schema.ts` (Task 1): `export interface TracklistRow { startSec:
    number | null; endSec: number | null; artist: string; title: string;
    label: string | null; source: MixRowSource; gap: boolean; detected: {
    artist: string; title: string } | null; referenceCount: number | null }`
    and `export type MixRowSource = 'trackid' | 'description' | 'pasted' |
    'manual'`. `trackid.ts` imports the type only (`import type`), the sole
    dependency on Task 1 — no store, no repo function, no `MixRow`.
  - `src/features/mix/parse.ts` (Task 2): `export function parseClock(s:
    string): number | null` — "H:MM:SS" / "M:SS" / "M.SS", one or two leading
    groups, `.` or `:` as the group separator, a fractional trailing seconds
    tolerated (the `"03:10:37.1910000"` duration), seconds from zero or `null`.
    `trackid.ts` uses the **shared** `parseClock` (spec §3.3 step 1, §3.5), never
    a second clock parser — the two would diverge on exactly the fractional
    duration.
- Produces — Tasks 4 and 5 import these by these exact names:
  - `src/features/mix/oembed.ts`:
    - `export const OEMBED_URL = 'https://soundcloud.com/oembed'`
    - `export const SC_PLAYER_PREFIX = 'https://w.soundcloud.com/player/'`
    - `export type OembedResult = { status: 'ok'; title: string; author:
      string; description: string; playerSrc: string | null } | { status:
      'notFound' } | { status: 'error'; message: string }`
    - `export function oembedUrl(normUrl: string): string`
    - `export function extractPlayerSrc(html: unknown): string | null`
    - `export function fetchOembed(fetchFn: typeof fetch, normUrl: string):
      Promise<OembedResult>`
  - `src/features/mix/trackid.ts`:
    - `export const TRACKID_LIST_URL =
      'https://trackid.net/api/public/audiostreams'`
    - `export const MIX_MERGE_TOLERANCE_SEC = 5`
    - `export const MIX_GAP_MIN_SEC = 60`
    - `export const TRACKID_INTERVAL_MS = 250`
    - `export type TrackIdResult = { status: 'ok'; slug: string; title: string;
      channel: string; durationSec: number | null; timeHitRate: number | null;
      rows: TracklistRow[] } | { status: 'notFound' } | { status: 'error';
      message: string }`
    - `export function trackidListUrl(normUrl: string): string`
    - `export function trackidDetailUrl(slug: string): string`
    - `export function tidSpansToRows(record: unknown, durationSec: number |
      null): TracklistRow[]`
    - `export function fetchTrackId(fetchFn: typeof fetch, normUrl: string,
      sleep?: (ms: number) => Promise<void>): Promise<TrackIdResult>`
- Obligations this task puts on later tasks:
  - **Task 4 (`lookup.ts`) passes its `MixDeps.sleep` as `fetchTrackId`'s third
    argument** so the list and detail calls are politely spaced (spec §4).
    `lookupMix` runs oEmbed and TrackId in parallel, so `MixDeps.sleep` has no
    other consumer; without this it is dead. See the sleep note below.
  - **Task 5 (`state.ts` / `Mix.tsx`) owns every user-facing string.** These
    clients return only a bare `message` on the `error` arm; the screen wraps it
    (`The mix page could not be read: {message}` / `TrackId.net could not be
    reached: {message}`, §5.2). Do not self-prefix the message here.
  - `MixRow.playerSrc` (Task 1) stores the raw `OembedResult.playerSrc` and the
    screen appends `&show_comments=true` when it builds the iframe (§5.2) — see
    the show_comments note. This client must not append it.

**Ordering:** this task consumes `TracklistRow`/`MixRowSource` from Task 1 and
`parseClock` from Task 2, so it must be executed **after Tasks 1 and 2**. If the
assembler reorders, either hoist `parseClock` (and `TracklistRow`) ahead of this
task or move this task later — do not inline a second clock parser.

**Notes — tensions settled here (read before writing):**

- **`fetchOembed` returns the raw player src; it does NOT append
  `show_comments=true`.** Spec §2 stores `MixRow.playerSrc` as "the validated
  player iframe src" and §5.2 has the screen append `&show_comments=true` when it
  builds the `<iframe>`. Appending it in the client would persist a wrong value
  to IndexedDB and double-append at render. (The Task-3 scope summary's "with
  show_comments=true added" is superseded by §3.2/§5.2, which are the binding
  contract; a test pins the src carries no `show_comments`.)
- **oEmbed non-2xx → `notFound`; TrackId non-2xx → `error`. This asymmetry is
  deliberate and follows each section's union comment.** §3.2's union marks "404
  or any non-2xx" as `notFound` ("the URL is not a public track" — a private,
  deleted or mistyped mix), reserving `error` for a transport failure or a
  non-JSON body. §3.3's `notFound` comment enumerates only body-shape failures
  (`rowCount ≠ 1`, url mismatch, detail mismatch); a 500 there must **not** claim
  the corpus lacks the mix, because §5.2 renders TrackId `notFound` as a factual
  claim about the corpus and `error` as "could not be reached". So any non-2xx on
  either TrackId call is `error` with `HTTP <status>` in the message.
- **THE GUARD is `rowCount === 1` AND `records.length === 1` AND `record.url ===
  normUrl`** (spec §3.3). An unrecognised query param returns the whole corpus
  with a huge `rowCount`, so trusting a 200 shows a random mix; a `rowCount > 1`
  must never fall back to the first record. The `slug` is read from that
  validated record (never derived from the permalink — its last segment 404s and
  TrackId's slug is title-derived). The **by-slug detail guard** is load-bearing
  too: accept only when `detail.url === normUrl` AND `detail.slug === slug`.
- **`trackCount` is never the count.** The probe returned `trackCount: 16` in the
  list, `0` in the detail; the shown count is `rows.filter((r) => !r.gap).length`.
  A test asserts exactly this against a fixture carrying both misleading values.
- **Span mapping order is flatten → merge → sort → gaps** (`tidSpansToRows`).
  Merge groups by `musicTrackId` and sorts within the group so "earliest start,
  latest end" is well defined; two spans of the same track merge only when the
  later start is within `MIX_MERGE_TOLERANCE_SEC` of the earlier end (a reprocess
  continuation), and stay two rows otherwise (a genuine replay). A span whose
  `startTime` or `endTime` does not parse is **dropped, not placed at zero**.
- **A known-but-empty mix yields `rows: []`, never one giant gap row.** The gap
  emitter runs only after an early return when no identified span survived, so
  Task 5's `MixView.trackid.empty` reads true. A test pins this.
- **Gap rows only where the timeline is known.** The head (0 → first start), each
  between-span stretch, and the tail (last end → `durationSec`, only when
  `durationSec` is known from the list `duration`) each earn a gap row only when
  the stretch is at least `MIX_GAP_MIN_SEC`.
- **Default fetch credentials only.** Neither call sets `credentials: 'include'`
  (spec §3); both TrackId endpoints reply `access-control-allow-credentials:
  true`, which the app neither needs nor wants to trigger. Tests assert the init
  carries no `credentials`.
- **`fetchTrackId`'s `sleep` is an optional trailing argument.** §3.3 quotes the
  signature as `(fetchFn, normUrl)`; §4 says `sleep` spaces the two calls. An
  optional trailing param honours both — every `fetchTrackId(fetchFn, normUrl)`
  call site compiles unchanged, and Task 4 passes its `sleep` to get the spacing.
  Tested behaviourally: `sleep` called once between the two requests on the happy
  path, never called when the list is `notFound` (which also proves the detail
  call is not issued).

**Proof of this task:** executed for real after Tasks 1 and 2 (which supply
`TracklistRow`/`MixRowSource` and `parseClock`) on a fresh copy of `23efb62`;
`yarn typecheck && yarn lint && yarn test && yarn build` all pass. The two new
files add 12 + 23 = 35 tests over Task 2's 437, taking the suite to
**41 files / 472 tests**.

- [ ] **Step 1: Write the failing oEmbed test**

Create `src/features/mix/oembed.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { OEMBED_URL, extractPlayerSrc, fetchOembed, oembedUrl } from './oembed';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** The mix the spec probed on 2026-09-06. */
const URL = 'https://soundcloud.com/xlr8r/exclusive-shonky-may-mix';

/** The player src the probe returned, verbatim (spec §3.2). */
const PLAYER_SRC =
  'https://w.soundcloud.com/player/?visual=true&url=https%3A%2F%2Fapi.soundcloud.com%2Ftracks%2F268511571&show_artwork=true';

const HTML = `<iframe width="100%" height="400" scrolling="no" frameborder="no" src="${PLAYER_SRC}"></iframe>`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function once(response: () => Response | Promise<Response>) {
  const fetchFn = vi.fn<FetchLike>(async () => response());
  return { fetchFn, fetchArg: fetchFn as unknown as typeof fetch };
}

const BODY = {
  version: 1,
  type: 'rich',
  provider_name: 'SoundCloud',
  title: 'Exclusive: Shonky - May Mix by XLR8R',
  description: 'A mix.\r\nMore &amp; more <b>house</b>.',
  author_name: 'XLR8R',
  author_url: 'https://soundcloud.com/xlr8r',
  html: HTML,
};

describe('oembedUrl', () => {
  it('builds the format=json GET and percent-encodes the mix url', () => {
    expect(oembedUrl(URL)).toBe(
      `${OEMBED_URL}?format=json&url=${encodeURIComponent(URL)}`
    );
    expect(oembedUrl(URL)).toContain('url=https%3A%2F%2Fsoundcloud.com%2F');
  });
});

describe('extractPlayerSrc', () => {
  it('reads the iframe src and keeps a w.soundcloud.com/player/ one', () => {
    expect(extractPlayerSrc(HTML)).toBe(PLAYER_SRC);
  });

  it('rejects a src from a foreign host to null', () => {
    const foreign =
      '<iframe src="https://evil.example/player/?url=x"></iframe>';
    expect(extractPlayerSrc(foreign)).toBeNull();
  });

  it('is null when the html has no src, or is not a string', () => {
    expect(extractPlayerSrc('<iframe></iframe>')).toBeNull();
    expect(extractPlayerSrc(undefined)).toBeNull();
    expect(extractPlayerSrc(42)).toBeNull();
  });
});

describe('fetchOembed', () => {
  it('requests the encoded oembed url with default credentials', async () => {
    const { fetchFn, fetchArg } = once(() => json(BODY));
    await fetchOembed(fetchArg, URL);
    expect(fetchFn.mock.calls[0][0]).toBe(oembedUrl(URL));
    // Never credentials: 'include' — both TrackId endpoints allow credentials
    // and the app wants none of it (spec §3).
    expect(fetchFn.mock.calls[0][1]?.credentials).toBeUndefined();
  });

  it('maps a 200 to title, author and the raw description', async () => {
    const { fetchArg } = once(() => json(BODY));
    const result = await fetchOembed(fetchArg, URL);
    expect(result).toEqual({
      status: 'ok',
      title: 'Exclusive: Shonky - May Mix by XLR8R',
      author: 'XLR8R',
      // Passed on raw: entities and \r\n intact for the parser to clean.
      description: 'A mix.\r\nMore &amp; more <b>house</b>.',
      playerSrc: PLAYER_SRC,
    });
  });

  it('keeps the player src without appending show_comments', async () => {
    const { fetchArg } = once(() => json(BODY));
    const result = await fetchOembed(fetchArg, URL);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    // The screen (§5.2) appends &show_comments=true when it builds the iframe;
    // the stored playerSrc must not carry it.
    expect(result.playerSrc).toBe(PLAYER_SRC);
    expect(result.playerSrc).not.toContain('show_comments');
  });

  it('sets playerSrc null when the html carries a foreign src', async () => {
    const { fetchArg } = once(() =>
      json({ ...BODY, html: '<iframe src="https://evil.example/x"></iframe>' })
    );
    const result = await fetchOembed(fetchArg, URL);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.playerSrc).toBeNull();
  });

  it('reads a 404 as notFound, not error', async () => {
    const { fetchArg } = once(() => json({ error: 'not found' }, 404));
    expect(await fetchOembed(fetchArg, URL)).toEqual({ status: 'notFound' });
  });

  it('reads any other non-2xx as notFound', async () => {
    const { fetchArg } = once(() => json({}, 403));
    expect(await fetchOembed(fetchArg, URL)).toEqual({ status: 'notFound' });
  });

  it('reads a transport failure as error with a bare reason', async () => {
    const { fetchArg } = once(() =>
      Promise.reject(new TypeError('Failed to fetch'))
    );
    const result = await fetchOembed(fetchArg, URL);
    expect(result.status).toBe('error');
    if (result.status !== 'error') return;
    // Bare reason: the screen wraps it as "The mix page could not be read: …".
    expect(result.message).toBe('Failed to fetch');
  });

  it('reads a non-JSON body as error', async () => {
    const { fetchArg } = once(
      () =>
        new Response('<html>nope</html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        })
    );
    const result = await fetchOembed(fetchArg, URL);
    expect(result.status).toBe('error');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/features/mix/oembed.test.ts`

Expected: the file cannot be imported, because the module it tests does not
exist yet:

```
 ❯ src/features/mix/oembed.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/features/mix/oembed.test.ts [ src/features/mix/oembed.test.ts ]
Error: Cannot find module './oembed' imported from /…/src/features/mix/oembed.test.ts
 ❯ src/features/mix/oembed.test.ts:2:1
      1| import { describe, expect, it, vi } from 'vitest';
      2| import { OEMBED_URL, extractPlayerSrc, fetchOembed, oembedUrl } from './oembed';
       | ^

 Test Files  1 failed (1)
```

- [ ] **Step 3: Implement `src/features/mix/oembed.ts`**

Create `src/features/mix/oembed.ts`:

```ts
/** SoundCloud oEmbed, a keyless public GET (spec §3.2). */
export const OEMBED_URL = 'https://soundcloud.com/oembed';

/** The only iframe src prefix the app will build a player from (spec §5.3). */
export const SC_PLAYER_PREFIX = 'https://w.soundcloud.com/player/';

export type OembedResult =
  | {
      status: 'ok';
      title: string;
      author: string;
      /** Passed on RAW (HTML entities and \r\n intact); the parser cleans it. */
      description: string;
      /**
       * The player iframe src, validated against SC_PLAYER_PREFIX, or null when
       * absent or from a foreign host. show_comments=true is NOT appended here:
       * MixRow.playerSrc stores this raw src and the screen (§5.2) appends it
       * when it builds the iframe.
       */
      playerSrc: string | null;
    }
  | { status: 'notFound' }
  | { status: 'error'; message: string };

/** `GET https://soundcloud.com/oembed?format=json&url=<encoded normUrl>`. */
export function oembedUrl(normUrl: string): string {
  return `${OEMBED_URL}?format=json&url=${encodeURIComponent(normUrl)}`;
}

function field(raw: unknown, name: string): unknown {
  if (typeof raw !== 'object' || raw === null) return undefined;
  return (raw as Record<string, unknown>)[name];
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * The iframe src out of the oEmbed `html`, kept only when it starts with the
 * literal SC_PLAYER_PREFIX (§5.3) — the check that makes "rebuild, don't
 * inject" safe. null when `html` is not a string, has no `src`, or the src is
 * from a foreign host.
 */
export function extractPlayerSrc(html: unknown): string | null {
  if (typeof html !== 'string') return null;
  const match = html.match(/\bsrc\s*=\s*"([^"]*)"/i);
  if (!match) return null;
  const src = match[1];
  return src.startsWith(SC_PLAYER_PREFIX) ? src : null;
}

/**
 * One keyless GET. A 404 — or any non-2xx — is `notFound` (a private, deleted
 * or mistyped mix is not a public track), never `error`; a transport failure
 * or a non-JSON body is `error`, whose `message` is a bare reason the screen
 * wraps as "The mix page could not be read: {message}" (§5.2). Default fetch
 * credentials only — never `credentials: 'include'` (spec §3).
 */
export async function fetchOembed(
  fetchFn: typeof fetch,
  normUrl: string
): Promise<OembedResult> {
  let res: Response;
  try {
    res = await fetchFn(oembedUrl(normUrl));
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
  if (!res.ok) return { status: 'notFound' };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { status: 'error', message: 'the mix page was not readable JSON' };
  }
  return {
    status: 'ok',
    title: str(field(body, 'title')),
    author: str(field(body, 'author_name')),
    description: str(field(body, 'description')),
    playerSrc: extractPlayerSrc(field(body, 'html')),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/features/mix/oembed.test.ts`
Expected: PASS, `Test Files  1 passed (1)`, `Tests  12 passed (12)`.

Run: `yarn typecheck && yarn lint && yarn test`
Expected: all three pass; the suite is `Test Files  40 passed (40)`,
`Tests  449 passed (449)` — Task 2's 437 plus these 12.

- [ ] **Step 5: Commit**

```bash
yarn format
git add src/features/mix/oembed.ts src/features/mix/oembed.test.ts
git commit -m "feat(mix): SoundCloud oEmbed client

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

- [ ] **Step 6: Write the failing TrackId test**

Create `src/features/mix/trackid.test.ts`. The fixture is inline — the probe's
`raw/architecture/tid-shonky.json` is a research artifact not committed to the
repo, and the arithmetic in §7 ("18 identified rows") does not close against
§3.3 step 2 (15 + 3 raw spans − the Apollonia merge = 17), so this controlled
fixture uses §3.3's exact timestamps for the two named pairs and asserts the
counts it computes itself:

```ts
import { describe, expect, it, vi } from 'vitest';
import { parseClock } from './parse';
import {
  MIX_GAP_MIN_SEC,
  MIX_MERGE_TOLERANCE_SEC,
  TRACKID_INTERVAL_MS,
  fetchTrackId,
  tidSpansToRows,
  trackidDetailUrl,
  trackidListUrl,
} from './trackid';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const URL = 'https://soundcloud.com/xlr8r/exclusive-shonky-may-mix';
const SLUG = 'exclusive-shonky-may-mix-by-xlr8r';
/** The probe's mix duration, fractional seconds and all (spec §3.3). */
const DURATION = '03:10:37.1910000';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function span(
  musicTrackId: string,
  startTime: string,
  endTime: string,
  over: Record<string, unknown> = {}
) {
  return {
    id: `s-${startTime}`,
    musicTrackId,
    startTime,
    endTime,
    artist: 'Artist',
    title: 'Title',
    label: null,
    referenceCount: 1,
    ...over,
  };
}

/**
 * The detail record, built from the two discriminating pairs of §3.3 step 2:
 * process 1 holds the identifiable tracks and a reprocess holds the Apollonia
 * continuation; the Pierre Codarin track is played twice, two hours apart.
 */
function detailRecord() {
  return {
    url: URL,
    slug: SLUG,
    duration: DURATION,
    trackCount: 0, // the detail says 0; it must never be the count.
    detectionProcesses: [
      {
        detectionProcessMusicTracks: [
          span('m-shonky', '00:11:44', '00:16:16', {
            artist: 'Shonky',
            title: 'Track A',
            label: 'Label A',
            referenceCount: 42,
          }),
          span('m-pc', '00:39:40', '00:43:20', {
            artist: 'Pierre Codarin',
            title: 'Jazzed My Table',
            referenceCount: 3,
          }),
          span('m-ap', '02:37:32', '02:39:40', {
            artist: 'Apollonia',
            title: 'Chez Michel',
            referenceCount: 7,
          }),
          span('m-pc', '02:55:19', '02:57:00', {
            artist: 'Pierre Codarin',
            title: 'Jazzed My Table',
            referenceCount: 3,
          }),
          // startTime is not a clock: dropped, never placed at zero.
          span('m-bad', 'soon', 'later', { artist: 'X', title: 'Y' }),
        ],
      },
      {
        detectionProcessMusicTracks: [
          span('m-ap', '02:39:41', '02:42:00', {
            artist: 'Apollonia',
            title: 'Chez Michel',
            referenceCount: 7,
          }),
        ],
      },
    ],
  };
}

function listBody(over: Record<string, unknown> = {}, rowCount = 1) {
  return {
    result: {
      rowCount,
      audiostreams: [
        {
          id: 'a1',
          url: URL,
          slug: SLUG,
          title: 'Exclusive: Shonky - May Mix by XLR8R',
          channel: 'XLR8R',
          duration: DURATION,
          trackCount: 16, // the list says 16; it must never be the count.
          timeHitRate: 0.3263038975216904,
          detectionProcesses: [], // spans are empty in the list response.
          ...over,
        },
      ],
    },
  };
}

function setup(responses: Array<() => Response | Promise<Response>>) {
  const fetchFn = vi.fn<FetchLike>(async () => {
    const next = responses.shift();
    if (!next) throw new Error('unexpected extra request');
    return next();
  });
  const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
  return { fetchFn, fetchArg: fetchFn as unknown as typeof fetch, sleep };
}

describe('tidSpansToRows', () => {
  const rows = tidSpansToRows(detailRecord(), parseClock(DURATION));
  const identified = rows.filter((r) => !r.gap);

  it('identifies four tracks, not the list 16 or the detail 0', () => {
    expect(identified).toHaveLength(4);
  });

  it('holds more rows than tracks, because gap rows share the array', () => {
    // head + 3 between + tail = 5 gaps, plus the 4 identified.
    expect(rows.length).toBeGreaterThan(identified.length);
    expect(rows).toHaveLength(9);
  });

  it('drops the span whose startTime is not a clock', () => {
    expect(identified.some((r) => r.title === 'Y')).toBe(false);
  });

  it('merges the Apollonia reprocess continuation into one row', () => {
    const ap = identified.filter((r) => r.title === 'Chez Michel');
    expect(ap).toHaveLength(1);
    // 02:37:32 in process 1, 02:42:00 in the reprocess (a 1 s gap abuts).
    expect(ap[0].startSec).toBe(9452);
    expect(ap[0].endSec).toBe(9720);
  });

  it('keeps the Pierre Codarin replay as two rows, two hours apart', () => {
    const pc = identified.filter((r) => r.title === 'Jazzed My Table');
    expect(pc.map((r) => r.startSec)).toEqual([2380, 10519]);
  });

  it('sorts rows ascending by start and stamps identified rows', () => {
    const starts = rows.map((r) => r.startSec ?? -1);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    const shonky = identified[0];
    expect(shonky).toMatchObject({
      startSec: 704,
      endSec: 976,
      artist: 'Shonky',
      title: 'Track A',
      label: 'Label A',
      source: 'trackid',
      gap: false,
      detected: { artist: 'Shonky', title: 'Track A' },
      referenceCount: 42,
    });
  });

  it('emits a head gap and a tail gap keyed to the known duration', () => {
    const head = rows[0];
    expect(head).toMatchObject({ gap: true, startSec: 0, endSec: 704 });
    const tail = rows[rows.length - 1];
    expect(tail.gap).toBe(true);
    expect(tail.startSec).toBe(10620);
    expect(tail.endSec).toBe(parseClock(DURATION));
  });

  it('returns [] for a known mix with no identified span, not one giant gap', () => {
    const empty = {
      duration: DURATION,
      detectionProcesses: [{ detectionProcessMusicTracks: [] }],
    };
    expect(tidSpansToRows(empty, parseClock(DURATION))).toEqual([]);
  });

  it('emits no tail gap when the duration is unknown', () => {
    const rec = {
      detectionProcesses: [
        { detectionProcessMusicTracks: [span('x', '0:10', '1:40')] },
      ],
    };
    const out = tidSpansToRows(rec, null);
    expect(out.filter((r) => r.gap)).toHaveLength(0);
  });

  it('gaps on a stretch of MIX_GAP_MIN_SEC but not one second under', () => {
    const under = tidSpansToRows(
      {
        detectionProcesses: [
          { detectionProcessMusicTracks: [span('x', '0:59', '2:00')] },
        ],
      },
      null
    );
    expect(under[0].gap).toBe(false); // starts at 59 s: no head gap.
    const at = tidSpansToRows(
      {
        detectionProcesses: [
          { detectionProcessMusicTracks: [span('x', '1:00', '2:00')] },
        ],
      },
      null
    );
    expect(at[0]).toMatchObject({
      gap: true,
      startSec: 0,
      endSec: MIX_GAP_MIN_SEC,
    });
  });

  it('merges within MIX_MERGE_TOLERANCE_SEC and splits one second beyond', () => {
    const abut = tidSpansToRows(
      {
        detectionProcesses: [
          {
            detectionProcessMusicTracks: [
              span('x', '0:10', '1:40'),
              span('x', '1:45', '2:00'), // start 105 = end 100 + tolerance
            ],
          },
        ],
      },
      null
    );
    expect(abut.filter((r) => !r.gap)).toHaveLength(1);
    expect(abut[0].endSec).toBe(120);
    const apart = tidSpansToRows(
      {
        detectionProcesses: [
          {
            detectionProcessMusicTracks: [
              span('x', '0:10', '1:40'),
              span('x', '1:46', '2:00'), // start 106 = end 100 + tolerance + 1
            ],
          },
        ],
      },
      null
    );
    expect(apart.filter((r) => !r.gap)).toHaveLength(2);
    expect(MIX_MERGE_TOLERANCE_SEC).toBe(5);
  });
});

describe('fetchTrackId — the guard', () => {
  it('rejects rowCount 0 as notFound and never issues the detail call', async () => {
    const { fetchArg, fetchFn, sleep } = setup([
      () => json({ result: { rowCount: 0, audiostreams: [] } }),
    ]);
    expect(await fetchTrackId(fetchArg, URL, sleep)).toEqual({
      status: 'notFound',
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('rejects rowCount > 1 as notFound, never falling back to the first record', async () => {
    const many = {
      result: {
        rowCount: 2,
        audiostreams: [
          { url: URL, slug: SLUG },
          { url: 'https://soundcloud.com/other/mix', slug: 'other' },
        ],
      },
    };
    const { fetchArg, fetchFn } = setup([() => json(many)]);
    expect(await fetchTrackId(fetchArg, URL)).toEqual({ status: 'notFound' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('rejects a rowCount 1 record whose url does not match', async () => {
    const { fetchArg } = setup([
      () => json(listBody({ url: 'https://soundcloud.com/xlr8r/other-mix' })),
    ]);
    expect(await fetchTrackId(fetchArg, URL)).toEqual({ status: 'notFound' });
  });
});

describe('fetchTrackId — the two-step flow', () => {
  it('reads the slug from the validated record and fetches the spans by slug', async () => {
    const { fetchArg, fetchFn, sleep } = setup([
      () => json(listBody()),
      () => json({ result: detailRecord() }),
    ]);
    const result = await fetchTrackId(fetchArg, URL, sleep);
    // The detail call uses the record's slug, not the permalink's last segment.
    expect(fetchFn.mock.calls[0][0]).toBe(trackidListUrl(URL));
    expect(fetchFn.mock.calls[1][0]).toBe(trackidDetailUrl(SLUG));
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([TRACKID_INTERVAL_MS]);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.slug).toBe(SLUG);
    expect(result.title).toBe('Exclusive: Shonky - May Mix by XLR8R');
    expect(result.channel).toBe('XLR8R');
    expect(result.durationSec).toBe(parseClock(DURATION));
    expect(result.timeHitRate).toBe(0.3263038975216904);
    // The identified count is the non-gap rows, never trackCount 16 or 0.
    expect(result.rows.filter((r) => !r.gap)).toHaveLength(4);
    expect(result.rows.length).toBeGreaterThan(4);
  });

  it('does not set credentials on either request', async () => {
    const { fetchArg, fetchFn } = setup([
      () => json(listBody()),
      () => json({ result: detailRecord() }),
    ]);
    await fetchTrackId(fetchArg, URL);
    expect(fetchFn.mock.calls[0][1]?.credentials).toBeUndefined();
    expect(fetchFn.mock.calls[1][1]?.credentials).toBeUndefined();
  });

  it('is notFound when the detail record url mismatches', async () => {
    const { fetchArg } = setup([
      () => json(listBody()),
      () =>
        json({
          result: { ...detailRecord(), url: 'https://soundcloud.com/x/y' },
        }),
    ]);
    expect(await fetchTrackId(fetchArg, URL)).toEqual({ status: 'notFound' });
  });

  it('is notFound when the detail record slug mismatches', async () => {
    const { fetchArg } = setup([
      () => json(listBody()),
      () => json({ result: { ...detailRecord(), slug: 'a-different-slug' } }),
    ]);
    expect(await fetchTrackId(fetchArg, URL)).toEqual({ status: 'notFound' });
  });

  it('returns ok with rows [] for a known mix that identified nothing', async () => {
    const emptyDetail = {
      result: {
        url: URL,
        slug: SLUG,
        duration: DURATION,
        detectionProcesses: [{ detectionProcessMusicTracks: [] }],
      },
    };
    const { fetchArg } = setup([
      () => json(listBody()),
      () => json(emptyDetail),
    ]);
    const result = await fetchTrackId(fetchArg, URL);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.rows).toEqual([]);
  });
});

describe('fetchTrackId — error arms', () => {
  it('is error, not notFound, when the list call is a non-2xx', async () => {
    const { fetchArg } = setup([() => json({}, 500)]);
    expect(await fetchTrackId(fetchArg, URL)).toEqual({
      status: 'error',
      message: 'HTTP 500',
    });
  });

  it('is error when the list transport throws', async () => {
    const { fetchArg } = setup([
      () => Promise.reject(new TypeError('Failed to fetch')),
    ]);
    const result = await fetchTrackId(fetchArg, URL);
    expect(result.status).toBe('error');
    if (result.status !== 'error') return;
    expect(result.message).toBe('Failed to fetch');
  });

  it('is error when the list body is not JSON', async () => {
    const { fetchArg } = setup([
      () =>
        new Response('<html/>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
    ]);
    expect((await fetchTrackId(fetchArg, URL)).status).toBe('error');
  });

  it('is error when the detail call is a non-2xx', async () => {
    const { fetchArg } = setup([() => json(listBody()), () => json({}, 500)]);
    expect(await fetchTrackId(fetchArg, URL)).toEqual({
      status: 'error',
      message: 'HTTP 500',
    });
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `yarn test src/features/mix/trackid.test.ts`

Expected: the file cannot be imported, because the module it tests does not
exist yet (the `./parse` import already resolves — Task 2 built it):

```
 ❯ src/features/mix/trackid.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/features/mix/trackid.test.ts [ src/features/mix/trackid.test.ts ]
Error: Cannot find module './trackid' imported from /…/src/features/mix/trackid.test.ts
 ❯ src/features/mix/trackid.test.ts:3:1
      1| import { describe, expect, it, vi } from 'vitest';
      2| import { parseClock } from './parse';
      3| import {
       | ^
      4|   MIX_GAP_MIN_SEC,
      5|   MIX_MERGE_TOLERANCE_SEC,

 Test Files  1 failed (1)
```

- [ ] **Step 8: Implement `src/features/mix/trackid.ts`**

Create `src/features/mix/trackid.ts`:

```ts
import type { TracklistRow } from '../../db/schema';
import { parseClock } from './parse';

/** List endpoint; `?url=` is an exact string filter (spec §3.3). */
export const TRACKID_LIST_URL = 'https://trackid.net/api/public/audiostreams';

/** Two spans of the same track merge only if the later start is within this
 *  many seconds of the earlier end — a reprocess continuation, not a replay. */
export const MIX_MERGE_TOLERANCE_SEC = 5;

/** Only a silent stretch at least this long earns an `ID · unidentified` row
 *  (research §5.5's "every span >=60 s with no accepted run"). */
export const MIX_GAP_MIN_SEC = 60;

/** Polite spacing between the list and detail calls, when a sleep is supplied. */
export const TRACKID_INTERVAL_MS = 250;

export type TrackIdResult =
  | {
      status: 'ok';
      slug: string;
      title: string;
      channel: string;
      durationSec: number | null;
      /** 0..1 coverage, rendered as a percentage; never a track count. */
      timeHitRate: number | null;
      /** Identified spans plus `ID · unidentified` gap rows, in play order.
       *  May be [] when the mix is known but nothing was identified. */
      rows: TracklistRow[];
    }
  | { status: 'notFound' }
  | { status: 'error'; message: string };

/** `GET .../audiostreams?url=<encoded normUrl>` — call 1, the list. */
export function trackidListUrl(normUrl: string): string {
  return `${TRACKID_LIST_URL}?url=${encodeURIComponent(normUrl)}`;
}

/** `GET .../audiostreams/<slug>` — call 2, the spans. The slug is the value
 *  from the validated list record, never derived from the permalink (§3.3). */
export function trackidDetailUrl(slug: string): string {
  return `${TRACKID_LIST_URL}/${encodeURIComponent(slug)}`;
}

function field(raw: unknown, name: string): unknown {
  if (typeof raw !== 'object' || raw === null) return undefined;
  return (raw as Record<string, unknown>)[name];
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

interface Span {
  musicTrackId: string;
  startSec: number;
  endSec: number;
  artist: string;
  title: string;
  label: string | null;
  referenceCount: number | null;
}

function identifiedRow(span: Span): TracklistRow {
  return {
    startSec: span.startSec,
    endSec: span.endSec,
    artist: span.artist,
    title: span.title,
    label: span.label,
    source: 'trackid',
    gap: false,
    detected: { artist: span.artist, title: span.title },
    referenceCount: span.referenceCount,
  };
}

function gapRow(startSec: number, endSec: number): TracklistRow {
  return {
    startSec,
    endSec,
    artist: '',
    title: '',
    label: null,
    source: 'trackid',
    gap: true,
    detected: null,
    referenceCount: null,
  };
}

/**
 * The detail record's spans to rows: flatten every `detectionProcess`, merge a
 * reprocess continuation of the same track, sort, then emit `ID · unidentified`
 * gap rows for the head, each between-span stretch, and the tail (only when
 * `durationSec` is known), each at least MIX_GAP_MIN_SEC long. Order is
 * flatten -> merge -> sort -> gaps. A span whose startTime or endTime does not
 * parse as a clock is dropped, not placed at zero. When nothing was identified
 * the result is [] — never one gap row spanning the whole mix — so the screen
 * can tell "known but empty" from "one gap".
 */
export function tidSpansToRows(
  record: unknown,
  durationSec: number | null
): TracklistRow[] {
  // 1. Flatten across all detection processes, keeping only parseable spans.
  const spans: Span[] = [];
  for (const process of arr(field(record, 'detectionProcesses'))) {
    for (const t of arr(field(process, 'detectionProcessMusicTracks'))) {
      const startSec = parseClock(str(field(t, 'startTime')));
      const endSec = parseClock(str(field(t, 'endTime')));
      if (startSec === null || endSec === null) continue;
      spans.push({
        musicTrackId: str(field(t, 'musicTrackId')),
        startSec,
        endSec,
        artist: str(field(t, 'artist')),
        title: str(field(t, 'title')),
        label:
          typeof field(t, 'label') === 'string'
            ? String(field(t, 'label'))
            : null,
        referenceCount: num(field(t, 'referenceCount')),
      });
    }
  }

  // 2. Merge same-musicTrackId spans that overlap or abut (reprocess
  //    continuation), but not a genuine replay two hours later.
  const byTrack = new Map<string, Span[]>();
  for (const span of spans) {
    const group = byTrack.get(span.musicTrackId);
    if (group) group.push(span);
    else byTrack.set(span.musicTrackId, [span]);
  }
  const merged: Span[] = [];
  for (const group of byTrack.values()) {
    group.sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec);
    let current = group[0];
    for (let i = 1; i < group.length; i += 1) {
      const next = group[i];
      if (next.startSec <= current.endSec + MIX_MERGE_TOLERANCE_SEC) {
        current = { ...current, endSec: Math.max(current.endSec, next.endSec) };
      } else {
        merged.push(current);
        current = next;
      }
    }
    merged.push(current);
  }

  // 3. Sort ascending by start, then end.
  merged.sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec);

  // A mix known to TrackId but with no identified track is [] (not one gap).
  if (merged.length === 0) return [];

  // 4 + 5. Interleave identified rows with the gap rows around them.
  const rows: TracklistRow[] = [];
  if (merged[0].startSec >= MIX_GAP_MIN_SEC) {
    rows.push(gapRow(0, merged[0].startSec));
  }
  for (let i = 0; i < merged.length; i += 1) {
    rows.push(identifiedRow(merged[i]));
    const next = merged[i + 1];
    if (next && next.startSec - merged[i].endSec >= MIX_GAP_MIN_SEC) {
      rows.push(gapRow(merged[i].endSec, next.startSec));
    }
  }
  const lastEnd = merged[merged.length - 1].endSec;
  if (durationSec !== null && durationSec - lastEnd >= MIX_GAP_MIN_SEC) {
    rows.push(gapRow(lastEnd, durationSec));
  }
  return rows;
}

/**
 * The two-call TrackId flow (spec §3.3). Call 1 lists by `?url=`; THE GUARD
 * accepts it only when `rowCount === 1` AND the record's `url` equals `normUrl`
 * — anything else (rowCount 0, rowCount > 1, or a url mismatch) is `notFound`,
 * never a fallback to the first record. The slug is read from that validated
 * record. Call 2 fetches the spans by slug and is accepted only when the detail
 * record's `url` and `slug` both match. Guard failures are `notFound` (a
 * factual claim the screen makes about the corpus); any non-2xx or non-JSON is
 * `error` (a "could not be reached" the screen shows instead). `trackCount` is
 * never trusted as the identified count. Default fetch credentials only (§3).
 *
 * `sleep` is optional: when supplied it spaces the list and detail calls
 * politely (§4). fetchTrackId(fetchFn, normUrl) is the §3.3 signature; the
 * trailing sleep is additive so a two-argument call site still compiles.
 */
export async function fetchTrackId(
  fetchFn: typeof fetch,
  normUrl: string,
  sleep?: (ms: number) => Promise<void>
): Promise<TrackIdResult> {
  // Call 1: the list.
  let listBody: unknown;
  try {
    const res = await fetchFn(trackidListUrl(normUrl));
    if (!res.ok) return { status: 'error', message: `HTTP ${res.status}` };
    listBody = await res.json();
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
  const result = field(listBody, 'result');
  const records = arr(field(result, 'audiostreams'));
  const rowCount = num(field(result, 'rowCount'));
  const record = records[0];
  // THE GUARD.
  if (rowCount !== 1 || records.length !== 1) return { status: 'notFound' };
  if (str(field(record, 'url')) !== normUrl) return { status: 'notFound' };
  const slug = str(field(record, 'slug'));
  if (slug === '') return { status: 'notFound' };
  const durationSec = parseClock(str(field(record, 'duration')));
  const title = str(field(record, 'title'));
  const channel = str(field(record, 'channel'));
  const timeHitRate = num(field(record, 'timeHitRate'));

  if (sleep) await sleep(TRACKID_INTERVAL_MS);

  // Call 2: the spans, by slug.
  let detailBody: unknown;
  try {
    const res = await fetchFn(trackidDetailUrl(slug));
    if (!res.ok) return { status: 'error', message: `HTTP ${res.status}` };
    detailBody = await res.json();
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
  const detail = field(detailBody, 'result');
  if (
    str(field(detail, 'url')) !== normUrl ||
    str(field(detail, 'slug')) !== slug
  ) {
    return { status: 'notFound' };
  }
  return {
    status: 'ok',
    slug,
    title,
    channel,
    durationSec,
    timeHitRate,
    rows: tidSpansToRows(detail, durationSec),
  };
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `yarn test src/features/mix/trackid.test.ts`
Expected: PASS, `Test Files  1 passed (1)`, `Tests  23 passed (23)`.

Run: `yarn typecheck && yarn lint && yarn test && yarn build`
Expected: all four pass; the suite is `Test Files  41 passed (41)`,
`Tests  472 passed (472)` — Task 2's 437 plus 12 (oEmbed) plus 23 (TrackId) —
and the production build to `dist/` succeeds.

- [ ] **Step 10: Commit**

```bash
yarn format
git add src/features/mix/trackid.ts src/features/mix/trackid.test.ts
git commit -m "feat(mix): TrackId.net client with the guard and span mapping

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

**Verification (no browser step).** This task ships two pure network-read
functions and no UI — the Mix screen (`#/mix`) is Task 5's — so the review
gate is the automated one above (`typecheck`, `lint`, `test`, `build`), matching
the artist-reach plan's client task (Task 3), which likewise carried no browser
walkthrough. The concrete 390px browser walkthrough of the Mix screen at
`http://127.0.0.1:5173/myOwnSpotifyData/` (paste a known-in-corpus mix, a
known-absent mix, and a mix whose description carries a tracklist; confirm the
guard, the gaps and the player comments) belongs to Task 5, per spec §7's
"Screens — no unit tests … A browser walkthrough at review".

---

### Task 4: State wiring — the lookup flow, the working list, persistence

**Files:**

- Create: `src/features/mix/lookup.ts` — the pure mix flow: `lookupMix`
  (orchestrates the two fetches, spec §4) plus the two pure working-list rules
  `hasManualRows` and `editTracklistRow` that `state.ts` wires.
- Create: `src/features/mix/lookup.test.ts` — the only test in this task
  (mocked collaborators, no network).
- Modify: `src/model/state.ts` — the import block; a `MixView` / `MixState`
  type block and four signals (`mixState`, `mixRows`, `savedMixes`,
  `mixError`) beside `banner` (pristine `state.ts:66`); a block of ten actions
  above `disconnect` (pristine `state.ts:500`); and four resets inside
  `disconnect` after the `reachState` reset (pristine `state.ts:521`).
- Test: `src/features/mix/lookup.test.ts` only. `state.ts` has **no** unit
  test in this project — importing it under Vitest pulls in
  `src/auth/browser.ts`, which touches `localStorage` at module scope (the
  same reason spec §7 gives "Screens: no unit tests" and the artist-reach plan
  gives for its own state task). Its additions are proven by the gate
  (typecheck + lint + build) in Step 10; the pure `lookup.ts` is TDD.

**Unchanged, do not touch (called out so the assembler and a fresh reviewer do
not "fix" them):**

- **`loadFromDb()` must NOT gain `getMixes()`.** Spec §2 keeps `mixes` out of
  `AllRows`, `getAllRows` and `buildModel` on purpose: every library job ends
  in `loadFromDb()`, which rebuilds the whole `Model`, and nothing but the Mix
  screen reads a mix. `savedMixes` is filled by `loadSavedMixes()` on screen
  mount (Task 5), never by `loadFromDb`.
- **`disconnect()`'s guard message is verbatim as it stands.** The mix lookup
  is deliberately **not** in `jobsBusy()` (spec §8: it writes no library store
  and rebuilds no model), so the "Wait for the current sync, history import,
  lookup, Rekordbox import or artist lookup to finish…" line does **not** gain
  a sixth job. Only `disconnect`'s *reset list* changes.
- **`jobsBusy()` is unchanged** — the mix lookup never joins it (spec §4, §8).
- `src/db/schema.ts`, `src/db/repo.ts` and `src/features/mix/url.ts` are
  **Task 1's** deliverables; this task only *consumes* them (see Interfaces).
  `src/features/mix/oembed.ts`, `trackid.ts` and `parse.ts` are the sources
  task's; consumed, not edited. `src/ui/*` (the Mix screen, the Settings card,
  `router.ts`, `app.tsx`, `format.ts`'s `formatClock`, `styles.css`) are
  **Task 5's** — this task ships no screen.

**A boundary this task deliberately declines:** an earlier draft of the task
brief floated a pure `src/features/mix/timeline.ts` gap/timeline builder here.
It is **not** built in this task, for two reasons that agree. (1) The spec
places the whole span→rows mapping — flatten, reprocess-merge
(`MIX_MERGE_TOLERANCE_SEC = 5`), sort, and the `ID · unidentified` gap rows
(`MIX_GAP_MIN_SEC = 60`, head/between/tail, tail only when `durationSec` is
known) — under the TrackId heading (`tidSpansToRows`, spec §3.3, "pure,
tested") and puts **every** gap assertion in `features/mix/trackid.test.ts`
(spec §7: "gap rows appear for head/between/tail stretches ≥ 60 s and
`durationSec` sets the tail"). `fetchTrackId` therefore returns
`TrackIdResult.rows` **with the gap rows already in it**, and spec §4 seeds
`mixRows` from "the TrackId `ok` rows" with no gap step. (2) Structurally, the
sources task (which owns `trackid.ts`) runs *before* this one, so it could not
import a builder created here. The gap builder is the sources task's; this
task consumes finished rows. The `raw/architecture/tid-shonky.json` fixture
that the span tests need is the sources task's to create — not this task's.

**Interfaces:**

- Consumes, from **Task 1** exactly as it leaves them:

  ```ts
  // src/db/schema.ts
  export const DB_VERSION = 4; // was 3
  export type MixRowSource = 'trackid' | 'description' | 'pasted' | 'manual';
  export interface TracklistRow {
    startSec: number | null;
    endSec: number | null;
    artist: string;
    title: string;
    label: string | null;
    source: MixRowSource;
    gap: boolean;
    detected: { artist: string; title: string } | null;
    referenceCount: number | null;
  }
  export interface MixRow {
    url: string;
    title: string | null;
    author: string | null;
    playerSrc: string | null;
    slug: string | null;
    sources: {
      trackid: boolean;
      description: boolean;
      pasted: boolean;
      linkOut: string | null;
    };
    rows: TracklistRow[];
    savedAt: number;
  }
  // DjDb gains: mixes: { key: string; value: MixRow };

  // src/db/repo.ts — three dedicated functions shaped like putFeatures
  export function getMixes(): Promise<MixRow[]>;
  export function putMix(row: MixRow): Promise<void>;
  export function deleteMix(url: string): Promise<void>;

  // src/features/mix/url.ts
  export function normalizeMixUrl(input: string): string | null;
  ```

- Consumes, from the **sources task** exactly as it leaves them:

  ```ts
  // src/features/mix/oembed.ts
  export type OembedResult =
    | { status: 'ok'; title: string; author: string; description: string; playerSrc: string | null }
    | { status: 'notFound' }
    | { status: 'error'; message: string };
  export function fetchOembed(fetchFn: typeof fetch, normUrl: string): Promise<OembedResult>;

  // src/features/mix/trackid.ts
  export type TrackIdResult =
    | { status: 'ok'; slug: string; title: string; channel: string; durationSec: number | null; timeHitRate: number | null; rows: TracklistRow[] }
    | { status: 'notFound' }
    | { status: 'error'; message: string };
  // NOTE the third parameter — see the reconciliation note below.
  export function fetchTrackId(fetchFn: typeof fetch, normUrl: string, sleep: (ms: number) => Promise<void>): Promise<TrackIdResult>;

  // src/features/mix/parse.ts
  export interface ParsedTracklist { rows: TracklistRow[]; linkOut: string | null }
  export function parseDescription(rawDescription: string): ParsedTracklist;
  export function parsePasted(text: string): ParsedTracklist;
  ```

  > **Reconciliation note for the assembler — `fetchTrackId` takes a third
  > `sleep` argument.** Spec §3.3 prints the signature as
  > `fetchTrackId(fetchFn, normUrl)`, but §3.3 also requires "two
  > politely-spaced requests, list then detail" and §4 states plainly "`sleep`
  > spaces the TrackId list and detail calls politely" while §3 requires every
  > network call to be a pure function behind **injected** dependencies (so the
  > wait is testable with no real timer). The only coherent reading is that
  > `sleep` is injected into `fetchTrackId`. `lookupMix` passes
  > `deps.sleep` as the third argument. If the sources task instead keeps the
  > two-argument signature and spaces the calls with its own bare `setTimeout`,
  > drop the third argument from `lookupMix`'s call and delete `sleep` from
  > `MixDeps` — otherwise `MixDeps.sleep` becomes a **dead field** that
  > typechecks and lints silently and will confuse a later reviewer. That
  > untestable-wait cost is why the three-argument form is preferred, and it is
  > what this task's scratch proof used.

- Consumes, from existing `src/model/state.ts` and its neighbours, unchanged:
  `signal` and `computed` from `@preact/signals`; `describeError` and
  `storageMessage` from `../util/errors` (`storageMessage` maps a
  `QuotaExceededError` to an actionable line — right for an IndexedDB write);
  the private `clearBanner`/`loadFromDb`/`jobsBusy`/`disconnect` bodies as they
  are.

- Produces, for **Task 5** (the Mix screen and the Settings card):

  ```ts
  // src/features/mix/lookup.ts
  export interface MixDeps { fetchFn: typeof fetch; sleep: (ms: number) => Promise<void> }
  export interface MixLookup { oembed: OembedResult; trackid: TrackIdResult }
  /** Runs oEmbed and TrackId in parallel; never throws (each arm carries its
   *  own error status). */
  export function lookupMix(deps: MixDeps, normUrl: string): Promise<MixLookup>;
  /** True when the working list holds an edited or added (source 'manual') row. */
  export function hasManualRows(rows: TracklistRow[]): boolean;
  /** The per-row edit rule: keeps `detected`, flips `source` to 'manual' only
   *  when artist/title now differ from `detected`. */
  export function editTracklistRow(
    row: TracklistRow,
    edit: { artist: string; title: string; label: string }
  ): TracklistRow;

  // src/model/state.ts
  export interface MixView {
    url: string;
    title: string | null;
    author: string | null;
    playerSrc: string | null;
    sources: MixRow['sources'];
    descriptionRows: TracklistRow[];
    trackid: { slug: string; count: number; timeHitRate: number | null; empty: boolean } | null;
    oembedError: string | null;
    trackidError: string | null;
  }
  export type MixState =
    | { status: 'idle' }
    | { status: 'looking'; url: string }
    | { status: 'ready'; view: MixView }
    | { status: 'error'; message: string };
  export const mixState: Signal<MixState>;
  export const mixRows: Signal<TracklistRow[]>;
  export const savedMixes: Signal<MixRow[]>;
  export const mixError: Signal<string | null>; // inline message channel, §6 note below
  export function startMixLookup(pastedUrl: string): Promise<void>;
  export function applyDescriptionTracklist(): void;
  export function applyPastedTracklist(text: string): 'added' | 'linkOnly' | 'empty';
  export function editMixRow(index: number, fields: { artist: string; title: string; label: string }): void;
  export function addMixRow(): void;
  export function deleteMixRow(index: number): void;
  export function loadSavedMixes(): Promise<void>;
  export function saveMix(): Promise<void>;
  export function openMix(url: string): void;
  export function removeMix(url: string): Promise<void>;
  ```

  The three row actions are named `editMixRow`/`addMixRow`/`deleteMixRow`
  (not bare `editRow`/`addRow`/`deleteRow`): `state.ts` is the app's single
  signal module and a bare name would collide with whatever the Crate or
  Playlists screens might later want. Spec §4 names no function ("add-row
  appends", "delete-row splices"), so this is free latitude.

  Task 5 renders `mixState`/`mixRows`/`savedMixes` and calls the ten actions;
  it calls `loadSavedMixes()` on mount and reads `MixView` to build the
  provenance line and the player. **`MixDeps`/`MixLookup` stay internal to
  this task.**

  > **Interface requirement for Task 5 (not a suggestion).** Task 5 **MUST**
  > render `mixError.value` **inline** near the Save button (a
  > `<p class="muted">` for the paste note, `<p class="error">` for a save/
  > delete failure — never a `BannerMessage`). If it does not, a rejected
  > `putMix`/`deleteMix` is swallowed and the global "every failure ends in a
  > state the screen renders" constraint is violated. The assembler reconciles
  > this against §6, which enumerated only the two layer errors and the URL
  > error (see the `mixError` reconciliation note above).

  > **Reconciliation note for the assembler — the `mixError` signal is a
  > deliberate addition to §6's error surfaces.** Spec §6 says the Mix screen
  > raises no `BannerMessage`, and §4 fixes `mixState`'s error arm to "only
  > 'that is not a SoundCloud link'". Those cover the two network layers (via
  > `view.oembedError` / `view.trackidError`) and a bad URL — but a rejected
  > `putMix` / `deleteMix`, or a paste that held only a link, has nowhere to
  > land, and the global rule is that nothing is swallowed. `mixError` is that
  > one missing inline surface. It is not a banner (so §6's "no `BannerMessage`
  > on the Mix screen" holds) and it is not on `mixState` (so §4's error-arm
  > wording holds). If Task 5's author prefers a different inline channel, this
  > is the single line to reconcile.

**Global constraints (from the plan header, restated for this task):** no new
dependency; every failure ends in a state the screen renders (nothing
swallowed); never on load — the lookup runs only from the screen's button; the
mix lookup is **not** in `jobsBusy()` and never calls `loadFromDb()`; only the
public oEmbed and TrackId.net endpoints are touched; TypeScript ~6.0.3,
`moduleResolution: bundler` (relative imports carry **no** extension); Prettier
single quotes, semicolons, ES5 trailing commas, 80 columns; ESLint
`preserve-caught-error` (a rethrow carries `{ cause }` — this task rethrows
nothing, it maps every caught error to a signal string).

---

- [ ] **Step 1: Write the failing test `src/features/mix/lookup.test.ts`**

`lookupMix` orchestrates two collaborators, so the test **mocks the two source
modules** (`vi.mock`) rather than the network — it asserts orchestration
(both arms run, results returned verbatim, one failure never hides the other,
never throws) independent of the sources' internals. The two pure rules
(`editTracklistRow`, `hasManualRows`) are asserted directly. No network, no
timers.

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TracklistRow } from '../../db/schema';
import { fetchOembed, type OembedResult } from './oembed';
import { fetchTrackId, type TrackIdResult } from './trackid';
import {
  editTracklistRow,
  hasManualRows,
  lookupMix,
  type MixDeps,
} from './lookup';

vi.mock('./oembed', () => ({ fetchOembed: vi.fn() }));
vi.mock('./trackid', () => ({ fetchTrackId: vi.fn() }));

const oembedMock = vi.mocked(fetchOembed);
const trackidMock = vi.mocked(fetchTrackId);

const deps: MixDeps = {
  fetchFn: vi.fn() as unknown as typeof fetch,
  sleep: () => Promise.resolve(),
};

const NORM = 'https://soundcloud.com/xlr8r/shonky-may-mix';

const okOembed: OembedResult = {
  status: 'ok',
  title: 'Exclusive: Shonky - May Mix by XLR8R',
  author: 'XLR8R',
  description: '1. A - B\n2. C - D',
  playerSrc: 'https://w.soundcloud.com/player/?url=x',
};
const idRow: TracklistRow = {
  startSec: 0,
  endSec: 60,
  artist: 'Apollonia',
  title: 'Chez Michel',
  label: null,
  source: 'trackid',
  gap: false,
  detected: { artist: 'Apollonia', title: 'Chez Michel' },
  referenceCount: 5,
};
const okTrackid: TrackIdResult = {
  status: 'ok',
  slug: 'shonky-may-mix',
  title: 'Shonky May Mix',
  channel: 'XLR8R',
  durationSec: 3600,
  timeHitRate: 0.3263,
  rows: [idRow],
};

beforeEach(() => {
  oembedMock.mockReset();
  trackidMock.mockReset();
});

describe('lookupMix', () => {
  it('runs both arms and returns each result verbatim', async () => {
    oembedMock.mockResolvedValue(okOembed);
    trackidMock.mockResolvedValue(okTrackid);
    const result = await lookupMix(deps, NORM);
    expect(oembedMock).toHaveBeenCalledWith(deps.fetchFn, NORM);
    expect(trackidMock).toHaveBeenCalledWith(deps.fetchFn, NORM, deps.sleep);
    expect(result).toEqual({ oembed: okOembed, trackid: okTrackid });
  });

  it('keeps the TrackId rows when oEmbed errors — one failure cannot hide the other', async () => {
    oembedMock.mockResolvedValue({ status: 'error', message: 'network down' });
    trackidMock.mockResolvedValue(okTrackid);
    const result = await lookupMix(deps, NORM);
    expect(result.oembed).toEqual({ status: 'error', message: 'network down' });
    expect(result.trackid).toEqual(okTrackid);
  });

  it('returns two error arms when both layers fail, and does not throw', async () => {
    oembedMock.mockResolvedValue({ status: 'error', message: 'oembed boom' });
    trackidMock.mockResolvedValue({ status: 'error', message: 'trackid boom' });
    await expect(lookupMix(deps, NORM)).resolves.toEqual({
      oembed: { status: 'error', message: 'oembed boom' },
      trackid: { status: 'error', message: 'trackid boom' },
    });
  });
});

describe('editTracklistRow', () => {
  const base: TracklistRow = {
    startSec: 0,
    endSec: 60,
    artist: 'Apollonia',
    title: 'Chez Michel',
    label: null,
    source: 'trackid',
    gap: false,
    detected: { artist: 'Apollonia', title: 'Chez Michel' },
    referenceCount: 5,
  };

  it('keeps the source when the values still equal detected (a label-only edit)', () => {
    const out = editTracklistRow(base, {
      artist: 'Apollonia',
      title: 'Chez Michel',
      label: 'Ovum',
    });
    expect(out.source).toBe('trackid');
    expect(out.label).toBe('Ovum');
    expect(out.detected).toEqual({ artist: 'Apollonia', title: 'Chez Michel' });
  });

  it('flips the source to manual when a value now differs, keeping detected', () => {
    const out = editTracklistRow(base, {
      artist: 'Apollonia',
      title: 'Chez Michelle',
      label: '',
    });
    expect(out.source).toBe('manual');
    expect(out.title).toBe('Chez Michelle');
    expect(out.detected).toEqual({ artist: 'Apollonia', title: 'Chez Michel' });
    expect(out.label).toBeNull();
  });

  it('leaves an added row (detected null) manual', () => {
    const added: TracklistRow = { ...base, source: 'manual', detected: null };
    const out = editTracklistRow(added, { artist: 'X', title: 'Y', label: '' });
    expect(out.source).toBe('manual');
  });
});

describe('hasManualRows', () => {
  it('is true when any row is manual, false otherwise', () => {
    const clean: TracklistRow = {
      startSec: null,
      endSec: null,
      artist: 'A',
      title: 'B',
      label: null,
      source: 'trackid',
      gap: false,
      detected: { artist: 'A', title: 'B' },
      referenceCount: null,
    };
    expect(hasManualRows([clean])).toBe(false);
    expect(hasManualRows([clean, { ...clean, source: 'manual' }])).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/features/mix/lookup.test.ts`

Expected: the suite fails to collect (not on an assertion) because
`src/features/mix/lookup.ts` does not exist yet. Verbatim from the scratch
proof:

```
 ❯ src/features/mix/lookup.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/features/mix/lookup.test.ts [ src/features/mix/lookup.test.ts ]
Error: Cannot find module '/src/features/mix/lookup' imported from /…/src/features/mix/lookup.test.ts
 ❯ src/features/mix/lookup.test.ts:5:1
      3| import { fetchOembed, type OembedResult } from './oembed';
      4| import { fetchTrackId, type TrackIdResult } from './trackid';
      5| import {
       | ^

 Test Files  1 failed (1)
      Tests  no tests
```

- [ ] **Step 3: Implement `src/features/mix/lookup.ts`**

```ts
import type { TracklistRow } from '../../db/schema';
import { fetchOembed, type OembedResult } from './oembed';
import { fetchTrackId, type TrackIdResult } from './trackid';

export interface MixDeps {
  fetchFn: typeof fetch;
  /** Spaces TrackId's two calls politely (spec §4); passed on to fetchTrackId. */
  sleep: (ms: number) => Promise<void>;
}

export interface MixLookup {
  oembed: OembedResult;
  trackid: TrackIdResult;
}

/**
 * Runs oEmbed and TrackId in parallel and folds the two into one result.
 * Never throws: both fetch functions return a typed error arm rather than
 * rejecting (spec §3), so `Promise.all` cannot reject and one layer's failure
 * cannot hide the other's rows (spec §4). This is the same discipline
 * `startLookup` leans on with `runLookup`.
 */
export async function lookupMix(
  deps: MixDeps,
  normUrl: string
): Promise<MixLookup> {
  const [oembed, trackid] = await Promise.all([
    fetchOembed(deps.fetchFn, normUrl),
    fetchTrackId(deps.fetchFn, normUrl, deps.sleep),
  ]);
  return { oembed, trackid };
}

/**
 * True when the working list holds anything the owner curated — a row typed
 * from scratch or an edit that moved a value off `detected` (both carry
 * `source: 'manual'`, §5.3). It is the guard the replace actions check before
 * a `confirm()`, kept pure here so it can be tested; the `confirm()` itself
 * stays in `state.ts`, as `startSync`'s does.
 */
export function hasManualRows(rows: TracklistRow[]): boolean {
  return rows.some((row) => row.source === 'manual');
}

/**
 * The per-row edit rule (spec §4). `detected` is preserved so the edit is
 * reversible and provenance survives; the `source` flips to `'manual'` only
 * when the artist or title now differs from `detected` — a label-only edit,
 * or an edit that restores the detected values, leaves the source alone. A
 * row with no `detected` (one the owner added) is already `'manual'` and
 * stays so. The label is trimmed and empties to `null`.
 */
export function editTracklistRow(
  row: TracklistRow,
  edit: { artist: string; title: string; label: string }
): TracklistRow {
  const label = edit.label.trim();
  const differsFromDetected =
    row.detected !== null &&
    (edit.artist !== row.detected.artist || edit.title !== row.detected.title);
  return {
    ...row,
    artist: edit.artist,
    title: edit.title,
    label: label.length > 0 ? label : null,
    source: differsFromDetected ? 'manual' : row.source,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/features/mix/lookup.test.ts`

Expected: `Test Files  1 passed (1)`, `Tests  7 passed (7)` (verified in the
scratch proof).

- [ ] **Step 5: Commit**

```bash
git add src/features/mix/lookup.ts src/features/mix/lookup.test.ts
git commit -m "$(cat <<'EOF'
feat: add the mix lookup orchestrator and working-list edit rules

lookupMix runs oEmbed and TrackId in parallel and folds both into one
result, never throwing so one layer's failure cannot hide the other's
rows. hasManualRows and editTracklistRow are the pure working-list rules
state.ts wires; editTracklistRow keeps `detected` and flips source to
'manual' only when a value moves off it.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu
EOF
)"
```

- [ ] **Step 6: Add the imports to `src/model/state.ts`**

Three edits to the import block. First, extend the `../db/repo` import
(pristine `state.ts:3-13`) with `deleteMix`, `getMixes`, `putMix`, and add a
type import for the two schema rows right after it. Replace:

```ts
import {
  DB_BLOCKED_MESSAGE,
  DB_SLOW_MESSAGE,
  DB_SLOW_MS,
  DB_SUPERSEDED_MESSAGE,
  getAllRows,
  getMeta,
  putMeta,
  setDbEvents,
  wipeDb,
} from '../db/repo';
```

with:

```ts
import {
  DB_BLOCKED_MESSAGE,
  DB_SLOW_MESSAGE,
  DB_SLOW_MS,
  DB_SUPERSEDED_MESSAGE,
  deleteMix,
  getAllRows,
  getMeta,
  getMixes,
  putMeta,
  putMix,
  setDbEvents,
  wipeDb,
} from '../db/repo';
import type { MixRow, TracklistRow } from '../db/schema';
```

Second, add the three mix-feature imports after the `jsonp` import (pristine
`state.ts:14`). Replace:

```ts
import { jsonp } from '../features/jsonp';
```

with:

```ts
import { jsonp } from '../features/jsonp';
import {
  editTracklistRow,
  hasManualRows,
  lookupMix,
} from '../features/mix/lookup';
import { parseDescription, parsePasted } from '../features/mix/parse';
import { normalizeMixUrl } from '../features/mix/url';
```

Third, add `storageMessage` to the errors import (pristine `state.ts:51`).
Replace:

```ts
import { describeError } from '../util/errors';
```

with:

```ts
import { describeError, storageMessage } from '../util/errors';
```

- [ ] **Step 7: Add the `MixView` / `MixState` types and the four signals**

Immediately after `export const banner = signal<BannerMessage | null>(null);`
(pristine `state.ts:66`), add:

```ts

export interface MixView {
  url: string;
  title: string | null;
  author: string | null;
  playerSrc: string | null;
  sources: MixRow['sources'];
  /**
   * The description's parsed rows, kept so the "Replace with the description
   * tracklist" button has something to apply. Empty when the description held
   * no listing, and empty on reopen (the raw description is not stored).
   */
  descriptionRows: TracklistRow[];
  /** TrackId provenance summary, or null when TrackId did not answer. */
  trackid: {
    slug: string;
    count: number;
    timeHitRate: number | null;
    empty: boolean;
  } | null;
  /** Layer error messages to show inline; null when the layer was fine. */
  oembedError: string | null;
  trackidError: string | null;
}

export type MixState =
  | { status: 'idle' }
  | { status: 'looking'; url: string }
  | { status: 'ready'; view: MixView }
  | { status: 'error'; message: string }; // only "that is not a SoundCloud link"

/** The Mix screen's lookup/open state (spec §4). Never touched on load. */
export const mixState = signal<MixState>({ status: 'idle' });
/** The one working, editable tracklist; its own signal so an edit re-renders. */
export const mixRows = signal<TracklistRow[]>([]);
/** Saved mixes, newest first; loaded when the Mix screen mounts. */
export const savedMixes = signal<MixRow[]>([]);
/**
 * The Mix screen's inline channel for a storage failure §6 did not enumerate:
 * a rejected `putMix`/`deleteMix`, or a `getMixes` that could not be read. §6
 * keeps the Mix screen off `BannerMessage`; the two network layers speak
 * through `view.oembedError`/`view.trackidError` and a bad URL through
 * `mixState`'s error arm, but an IndexedDB read or write has nowhere else to
 * land and the global rule is that nothing is swallowed. Rendered inline
 * (Task 5), never a banner. (The paste-box "gentle inline note" of §4 is a
 * separate concern and lives in the screen's local state — see Task 5.)
 */
export const mixError = signal<string | null>(null);
```

- [ ] **Step 8: Add the ten actions above `disconnect`**

Immediately before `export async function disconnect(): Promise<void> {`
(pristine `state.ts:500`), add the whole block:

```ts
const MIX_NOT_A_LINK =
  "That is not a SoundCloud track link. Paste the link to the mix's page.";
const REPLACE_WITH_DESCRIPTION =
  'Replace your edited tracklist with the one from the description?';
const REPLACE_WITH_PASTED =
  'Replace your edited tracklist with the pasted tracks?';

/**
 * Never on load: the mix lookup runs only from the Mix screen's button. It
 * does NOT join jobsBusy() and does NOT call loadFromDb() — it writes no
 * library store and rebuilds no model, so it clobbers nothing (spec §8).
 */
export async function startMixLookup(pastedUrl: string): Promise<void> {
  if (mixState.value.status === 'looking') return;
  mixError.value = null;
  const normUrl = normalizeMixUrl(pastedUrl);
  if (normUrl === null) {
    mixState.value = { status: 'error', message: MIX_NOT_A_LINK };
    return;
  }
  // Claim the looking state synchronously so a second tap cannot double-run.
  // `as MixState` keeps the signal at its declared union type, as startSync,
  // startLookup and startReach each do.
  mixState.value = { status: 'looking', url: normUrl } as MixState;
  // lookupMix never throws, so the state can never strand on `looking`.
  const { oembed, trackid } = await lookupMix(
    {
      // Bare `fetch` throws "Illegal invocation" once unbound from window.
      fetchFn: (input, init) => fetch(input, init),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    },
    normUrl
  );
  const parsed =
    oembed.status === 'ok'
      ? parseDescription(oembed.description)
      : { rows: [], linkOut: null };
  const descriptionRows = parsed.rows;
  const identified =
    trackid.status === 'ok' ? trackid.rows.filter((row) => !row.gap).length : 0;
  const view: MixView = {
    url: normUrl,
    title: oembed.status === 'ok' ? oembed.title : null,
    author: oembed.status === 'ok' ? oembed.author : null,
    playerSrc: oembed.status === 'ok' ? oembed.playerSrc : null,
    sources: {
      trackid: trackid.status === 'ok',
      description: descriptionRows.length > 0,
      pasted: false,
      linkOut: parsed.linkOut,
    },
    descriptionRows,
    trackid:
      trackid.status === 'ok'
        ? {
            slug: trackid.slug,
            count: identified,
            timeHitRate: trackid.timeHitRate,
            empty: identified === 0,
          }
        : null,
    oembedError: oembed.status === 'error' ? oembed.message : null,
    trackidError: trackid.status === 'error' ? trackid.message : null,
  };
  mixState.value = { status: 'ready', view };
  // Seed the working list from the richest layer that answered: TrackId's rows
  // (which already carry their gap rows) when it identified anything, else the
  // description's rows, else nothing.
  mixRows.value =
    trackid.status === 'ok' && trackid.rows.length > 0
      ? trackid.rows
      : descriptionRows;
}

/** Replaces the working list with the description's rows (spec §4/§5.2). */
export function applyDescriptionTracklist(): void {
  const state = mixState.value;
  if (state.status !== 'ready') return;
  mixError.value = null;
  if (state.view.descriptionRows.length === 0) return;
  if (hasManualRows(mixRows.value) && !confirm(REPLACE_WITH_DESCRIPTION))
    return;
  mixRows.value = state.view.descriptionRows;
}

/**
 * Parses pasted text and, when it holds a listing, replaces the working list.
 * Returns which of the three outcomes happened so the screen can render the
 * "gentle inline note" of §4 next to the paste box (a link-only paste or an
 * empty parse); a banner is forbidden on this screen (§6). A cancelled replace
 * reports `'added'` — tracks were found, so no note is shown.
 */
export function applyPastedTracklist(
  text: string
): 'added' | 'linkOnly' | 'empty' {
  const state = mixState.value;
  if (state.status !== 'ready') return 'empty';
  mixError.value = null;
  const parsed = parsePasted(text);
  if (parsed.rows.length === 0) {
    return parsed.linkOut !== null ? 'linkOnly' : 'empty';
  }
  if (hasManualRows(mixRows.value) && !confirm(REPLACE_WITH_PASTED)) {
    return 'added';
  }
  mixRows.value = parsed.rows;
  mixState.value = {
    status: 'ready',
    view: { ...state.view, sources: { ...state.view.sources, pasted: true } },
  };
  return 'added';
}

/** Commits an edit to one row through the pure `editTracklistRow` rule. */
export function editMixRow(
  index: number,
  fields: { artist: string; title: string; label: string }
): void {
  const rows = mixRows.value.slice();
  const row = rows[index];
  if (!row) return;
  rows[index] = editTracklistRow(row, fields);
  mixRows.value = rows;
}

/** Appends a blank manual row for the owner to fill in (spec §4). */
export function addMixRow(): void {
  mixRows.value = [
    ...mixRows.value,
    {
      startSec: null,
      endSec: null,
      artist: '',
      title: '',
      label: null,
      source: 'manual',
      gap: false,
      detected: null,
      referenceCount: null,
    },
  ];
}

/** Removes one row (spec §4). */
export function deleteMixRow(index: number): void {
  mixRows.value = mixRows.value.filter((_, i) => i !== index);
}

/** Reads the saved mixes newest-first; called when the Mix screen mounts. */
export async function loadSavedMixes(): Promise<void> {
  try {
    const rows = await getMixes();
    savedMixes.value = rows.sort((a, b) => b.savedAt - a.savedAt);
  } catch (err) {
    mixError.value = `Could not read your saved mixes: ${describeError(err)}`;
  }
}

/** Saves the current mix and its working list, then refreshes the list. */
export async function saveMix(): Promise<void> {
  const state = mixState.value;
  if (state.status !== 'ready') return;
  mixError.value = null;
  const view = state.view;
  const row: MixRow = {
    url: view.url,
    title: view.title,
    author: view.author,
    playerSrc: view.playerSrc,
    slug: view.trackid?.slug ?? null,
    sources: view.sources,
    rows: mixRows.value,
    savedAt: Date.now(),
  };
  try {
    await putMix(row);
  } catch (err) {
    mixError.value = `Could not save the mix: ${storageMessage(err)}`;
    return;
  }
  await loadSavedMixes();
}

/**
 * Reopens a saved mix from memory with no network call — reopening must not
 * re-fetch, or never-on-load is broken (spec §4). The MixView is rebuilt from
 * the stored row: the two layer errors are null, the description rows empty
 * (the raw description is not stored), and the TrackId summary reconstructed
 * from the saved slug with its hit rate dropped.
 */
export function openMix(url: string): void {
  const row = savedMixes.value.find((mix) => mix.url === url);
  if (!row) return;
  mixError.value = null;
  mixRows.value = row.rows;
  const count = row.rows.filter((r) => !r.gap).length;
  const view: MixView = {
    url: row.url,
    title: row.title,
    author: row.author,
    playerSrc: row.playerSrc,
    sources: row.sources,
    descriptionRows: [],
    trackid:
      row.sources.trackid && row.slug !== null
        ? { slug: row.slug, count, timeHitRate: null, empty: count === 0 }
        : null,
    oembedError: null,
    trackidError: null,
  };
  mixState.value = { status: 'ready', view };
}

/**
 * Deletes a saved mix, then refreshes the list. Precondition: reached from the
 * idle saved-mixes list (spec §5.2 renders Remove there only), so no mix is
 * open and `mixState` needs no reset.
 */
export async function removeMix(url: string): Promise<void> {
  mixError.value = null;
  try {
    await deleteMix(url);
  } catch (err) {
    mixError.value = `Could not remove the mix: ${describeError(err)}`;
    return;
  }
  await loadSavedMixes();
}

```

- [ ] **Step 9: Add the four resets to `disconnect`**

Inside `disconnect`, right after `reachState.value = { status: 'idle' };`
(pristine `state.ts:521`), add the four mix resets. The disconnect guard
message above it is **unchanged** (the mix lookup is not a `jobsBusy()` job).
Replace:

```ts
  reachState.value = { status: 'idle' };
  lastSyncAt.value = null;
```

with:

```ts
  reachState.value = { status: 'idle' };
  mixState.value = { status: 'idle' };
  mixRows.value = [];
  savedMixes.value = [];
  mixError.value = null;
  lastSyncAt.value = null;
```

- [ ] **Step 10: Run the full gate**

`state.ts` has no unit test (it imports `auth/browser.ts`, which touches
`localStorage` at module scope), so its additions are proven by the gate.

Run all four, from the repo root:

```bash
yarn typecheck && yarn lint && yarn test && VITE_SPOTIFY_CLIENT_ID=dummy yarn build
```

Expected (measured on the assembled branch after Tasks 1–3 land):
- `yarn typecheck` — `tsc --noEmit`, clean.
- `yarn lint` — `eslint .`, clean.
- `yarn test` — the whole suite green, `Test Files  42 passed (42)`,
  `Tests  479 passed (479)` — Task 3's 472 plus this task's 7 (`lookup.test.ts`
  is the only new test file; `state.ts` has none).
- `yarn build` — `✓ built`, no worker added.

- [ ] **Step 11: Verification — no screen in this task**

This task ships **no UI**: `state.ts` and `lookup.ts` render nothing on their
own, so there is no 390-px browser walkthrough here. The Mix screen, the
Settings "Mix tracklist" card and the router/`tabOf` wiring are **Task 5**, and
spec §7's browser walkthrough (paste a known-in-corpus mix, a known-absent mix
and a description-carrying mix on the owner's real library; confirm the guard,
the gaps, the library matches and the player comments) is performed at the end
of Task 5, when the actions this task exports are reachable from a button.
Confirm here only that the gate in Step 10 is fully green before committing.

- [ ] **Step 12: Commit**

```bash
git add src/model/state.ts
git commit -m "$(cat <<'EOF'
feat: wire the mix lookup, working list and persistence into state

Adds mixState/mixRows/savedMixes/mixError and the ten Mix-screen actions:
startMixLookup (never on load, folds both layers into one MixView, seeds
the working list from the richest layer, never joins jobsBusy and never
reloads the model), the confirm-guarded description/paste replaces, the
row edits, and saveMix/loadSavedMixes/openMix/removeMix through the repo
helpers. openMix rebuilds the view from the stored row with no re-fetch.
disconnect now resets the four mix signals; its guard message is unchanged
because the mix lookup is deliberately not a jobsBusy() job.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu
EOF
)"
```

---

### Task 5: The Mix screen, the Settings card, the route and the styles

This task builds the whole `#/mix` screen (spec §5.2–§5.4): the URL-input +
`Look up` form, the four `mixState` states (idle / looking / ready / error),
the editable tracklist rows with Spotify search links, `FeaturePills` and the
`in N playlists` count, the first-class paste-your-own textarea, the embedded
SoundCloud player with `show_comments=true`, the saved-mixes list with
open/delete, and the two info cards with §5.4's exact copy. It adds the
`Mix tracklist` card to `Settings.tsx`, the `#/mix` route (`router.ts` +
`app.tsx`, highlighting the Settings tab), spec §6's three CSS rules, and the
one pure helper the screen needs — `formatClock` in `src/ui/format.ts`.

Screens have no unit tests in this project (spec §7, CLAUDE.md), so the screen
is verified by the build gate plus the browser walkthrough in Step 11. The one
test-bearing piece is `formatClock`, written test-first, exactly as the
artist-reach plan's Task 6 wrote `reachLine`/`profileLine` in the same file.

**This task consumes symbols that Tasks 1–4 create, so it can only be
gate-verified once Tasks 1–4 have landed.** `Mix.tsx` imports the store types
from `src/db/schema` (Task 1), `libraryTitleIndex`/`matchMixRow` from
`src/features/mix/match.ts` (Task 3), and the mix signals, `MixView`/`MixState`
and the mix actions from `src/model/state.ts` (Task 4). The Interfaces block
below is the contract; where the spec names a symbol it is quoted, and the two
places the spec leaves a name or a return type unstated are flagged for the
assembler to reconcile against Tasks 3–4.

**Files:**

- Create:
  - `src/ui/Mix.tsx` (the `#/mix` screen; `export function Mix()`)
- Modify:
  - `src/ui/format.ts` (append `formatClock` after `profileLine`)
  - `src/ui/format.test.ts` (one import + one test: 9 → 10 tests in the file)
  - `src/router.ts` (`Route` gains `| { name: 'mix' }`; `parseRoute` gains
    `case 'mix'`)
  - `src/app.tsx` (import `Mix`; `Screen` gains `case 'mix'`; `tabOf` maps
    `mix → settings`)
  - `src/ui/Settings.tsx` (a `MixCard` link card, placed after `<ReachCard />`)
  - `src/styles.css` (spec §6's `.mix-player`, `.list li.gap .title`,
    `.mix .src`, appended after the last rule)
- Test: `src/ui/format.test.ts` only. No component test — the project has none,
  and Vitest runs in Node with no DOM.
- **Not this task's, and not to be edited here:**
  - `src/db/schema.ts` — `MixRow`, `TracklistRow`, `MixRowSource`, `DB_VERSION`
    4 and the `mixes` line in `DjDb` are Task 1's. `Mix.tsx` only imports the
    types.
  - `src/db/repo.ts` — the guarded `mixes` `createObjectStore` and
    `getMixes`/`putMix`/`deleteMix` are Task 1's.
  - `src/features/mix/match.ts`, `oembed.ts`, `trackid.ts`, `parse.ts`,
    `url.ts`, `lookup.ts` — Tasks 2–4. `Mix.tsx` only imports `libraryTitleIndex`
    and `matchMixRow`.
  - `src/model/state.ts` — every mix signal, `MixView`, `MixState` and every
    mix action is Task 4's, including `disconnect()`'s three-signal reset
    (`mixState`/`mixRows`/`savedMixes`, spec §4 last bullet) and the newest-first
    `savedMixes` sort inside `saveMix`/`loadSavedMixes` (spec §2/§4). This task
    adds no line to `state.ts`.
  - `src/ui/components/TrackRow.tsx`, `FeaturePills.tsx`, `SpotifyLink.tsx` —
    reused exactly as they stand (spec §6). The tracklist rides in `TrackRow`'s
    existing `badges` and `children` slots; `TrackRow` renders `SpotifyLink`
    itself from `spotifyUrl`.
  - The banner: the Mix screen raises **no `BannerMessage`** (spec §6). Every
    failure is shown inline through `view.oembedError` / `view.trackidError`
    (the ready state) and the `mixState.error` line. `visibleBanner`'s
    route-scope list in `app.tsx` is untouched.

**Interfaces:**

- Consumes, from Task 1 (`src/db/schema.ts`) — **types only**, no runtime import:
  - `type MixRowSource = 'trackid' | 'description' | 'pasted' | 'manual'`
  - `interface TracklistRow { startSec: number | null; endSec: number | null; artist: string; title: string; label: string | null; source: MixRowSource; gap: boolean; detected: { artist: string; title: string } | null; referenceCount: number | null }`
  - `interface MixRow { url: string; title: string | null; author: string | null; playerSrc: string | null; slug: string | null; sources: { trackid: boolean; description: boolean; pasted: boolean; linkOut: string | null }; rows: TracklistRow[]; savedAt: number }`
    (`Mix.tsx` reads `MixRow` only through `savedMixes`: `mix.title`, `mix.url`,
    `mix.rows`, `mix.savedAt`. It imports `TracklistRow` by name.)
- Consumes, from Task 2 (`src/features/mix/match.ts`):
  - `interface MixMatch { trackId: string; playlistCount: number }`
  - `function libraryTitleIndex(model: Model): Map<string, string[]>` — memoised
    on `Model` identity (spec §3.6); called once per render.
  - `function matchMixRow(model: Model, index: Map<string, string[]>, row: TracklistRow): MixMatch | null`
    — returns `null` for a gap row and for a row whose artist/title is
    `ID`/`?`/`unknown` (spec §3.6), so the badge shows a match only on a real,
    unique library hit.
- Consumes, from Task 4 (`src/model/state.ts`):
  - Signals: `mixState: Signal<MixState>`, `mixRows: Signal<TracklistRow[]>`,
    `savedMixes: Signal<MixRow[]>`, and the existing `model: Signal<Model | null>`.
  - Types, exactly as spec §4 gives them:
    - `interface MixView { url: string; title: string | null; author: string | null; playerSrc: string | null; sources: MixRow['sources']; descriptionRows: TracklistRow[]; trackid: { slug: string; count: number; timeHitRate: number | null; empty: boolean } | null; oembedError: string | null; trackidError: string | null }`
    - `type MixState = { status: 'idle' } | { status: 'looking'; url: string } | { status: 'ready'; view: MixView } | { status: 'error'; message: string }`
  - Actions the spec §4 names, used verbatim:
    - `startMixLookup(pastedUrl: string): Promise<void>`
    - `applyDescriptionTracklist(): void`
    - `saveMix(): Promise<void>`
    - `loadSavedMixes(): Promise<void>`
    - `openMix(url: string): void`
    - `removeMix(url: string): Promise<void>`
  - **Two shapes reconciled with Task 4** (spec §4 describes the behaviour but
    not the shape; Decisions 2, 4 and 12 settle them, and Task 4 ships exactly
    these):
    - `applyPastedTracklist(text: string): 'added' | 'linkOnly' | 'empty'` — the
      three-value return (Decision 2) so §4's "gentle inline note" for a
      link-only or empty paste is rendered inline in `PasteBox`'s own local
      state (spec §6 raises no banner; nothing is swallowed). See Note E.
    - The three edit actions (spec §4 describes the behaviour, names nothing —
      Decision 12), **with `label: string`** (empty string = no label, Decision
      4; `editTracklistRow` does `edit.label.trim()`):
      - `editMixRow(index: number, patch: { artist: string; title: string; label: string }): void`
      - `addMixRow(): void`
      - `deleteMixRow(index: number): void`
- Consumes, from existing code (unchanged by this task):
  - `src/model/normalize.ts`: `normalize(s: string): string`.
  - `src/ui/components/TrackRow.tsx`:
    `TrackRow({ rank?, imageUrl?, title, subtitle?, href?, onClick?, spotifyUrl?, badges?, children? })`
    — this task passes `title`, `subtitle`, `spotifyUrl`, `badges`, `onClick`
    and `children`. `badges` renders inside `<div class="badges">` (the wrapping
    flex row `.mix .src` relies on); `children` renders after `<div class="row">`
    inside the `<li>`.
  - `src/ui/components/FeaturePills.tsx`: `FeaturePills({ trackId: string })`.
  - `src/ui/format.ts`: `plural(n, word)`, `formatDate(value)` (existing), and
    `formatClock` (this task adds it).
  - `src/router.ts`: `routeHref(route: Route)` — used in `Settings.tsx`.
- Produces (Task 5 is the last task; nothing consumes from it):
  - `src/ui/format.ts`: `export function formatClock(totalSeconds: number): string`.
  - `src/ui/Mix.tsx`: `export function Mix()`.
  - `src/router.ts`: `Route` gains `| { name: 'mix' }`; `#/mix` parses to it.
  - `src/app.tsx`: `#/mix` renders `<Mix />` and highlights the Settings tab.

**Notes — the decisions this task makes, so a reviewer sees them as choices:**

- **A. `formatClock` is this task's, test-first.** Spec §7 gives it its own test
  bullet (`0, 44, 704, 3599, 3600, 11437`); no earlier task touches it, and it
  lives in `src/ui/format.ts`, not `src/features/mix/`. It is the inverse of
  Task 2's `parseClock` but a display helper, so it sits with the other
  `format.ts` helpers — the same placement the artist-reach plan used for
  `reachLine`/`profileLine`.
- **B. The router wiring spans two files, and typecheck will not catch a miss.**
  Spec §5.2: `router.ts` gets the `Route` arm and the `parseRoute` case;
  `app.tsx` gets the `Screen` case and the `tabOf` mapping. `Screen` is a switch
  with no `default` and no explicit return type, so its inferred return becomes
  `Element | undefined` — **adding the `Route` arm without the `Screen` case
  compiles and renders nothing on `#/mix`** (verified in a scratch copy:
  `yarn typecheck` passes with the arm present and both cases absent). And
  `parseRoute`'s `default` returns `top`, so a missing `case 'mix'` silently
  routes `#/mix` to the Top screen. Both cases are load-bearing; they land in one
  step (Step 7).
- **C. Gap rows are a hand-written `<li class="gap">`, not a `TrackRow`.**
  `TrackRow` sets no class on its `<li>`, and spec §6's `.list li.gap .title`
  rule needs `gap` there. The `<li>` mirrors `TrackRow`'s inner
  `row → main → title/sub` markup so the shared list styles apply; a code
  comment says so, so a later `TrackRow` change is caught. Identified rows stay
  `TrackRow`, exactly as §5.3 says.
- **D. One `.src` provenance line, `FeaturePills` inline above it.** `.mix .src`
  is `flex-basis: 100%`, so each `.src` span takes a full row inside `badges`.
  Spec §5.3 singles out one such span ("a muted provenance span naming
  `row.source`"), so the source label, the `in N playlists` count and the
  `N other mixes` count are joined with ` · ` into **one** `.src` line
  (`TrackId · in 3 playlists · 12 other mixes`) that wraps under the pills —
  never three stacked lines on a 390 px phone. `FeaturePills` renders its pills
  inline before it.
- **E. `applyPastedTracklist` returns a three-value result.** Spec §4 says a
  link-only paste is "a no-op with a gentle inline note", and §6 forbids a
  banner from this screen while the global constraint forbids swallowing a
  failure. So the action reports `'added' | 'linkOnly' | 'empty'`, the screen
  holds it in local state and renders a muted line for `linkOnly`/`empty`. This
  is one reconciliation point with Task 4 rather than a new cross-task signal.
- **F. `openMix` seeds the URL input, so the top button is §4's "Look up
  again".** Spec §4 ends `openMix` with "A 'Look up again' button is the only way
  to re-fetch", but §5.2 never places a second control. A `useEffect` on
  `view.url` seeds the always-present top input from the opened mix's url, and
  the button reads `Look up again` while `mixState` is `ready` — so the one
  top button *is* the re-fetch path, and no second control is added. `openMix`
  itself performs no network call (spec §4, never-on-load).
- **G. `INERT` is checked with `normalize`.** `normalize('?')` is `''`, so the
  set is `{ '', 'id', 'unknown' }`: a gap row, and a `?`/`ID`/`unknown` (or
  empty) artist or title, gets no Spotify search link. The library-match badge
  needs no second check — `matchMixRow` already returns `null` for the same
  rows (spec §3.6).
- **H. `in N playlists` is dropped at zero.** `libraryTitleIndex` walks
  `tracksByKey`, which includes top-item tracks, so `playlistCount: 0` is
  reachable; the part is omitted rather than shipping `in 0 playlists`, the same
  house style `reachLine`/`notCountedLine` use for missing parts.
  `N other mixes` is written literally, because `plural` appends a bare `s` and
  would spell `mixs`.
- **I. The info cards are always present (spec §5.4), in every state**, at the
  foot of the screen; the saved-mixes list shows in the idle state only.
- **J. The Settings `MixCard` reads no `jobsBusy()`.** Spec §5.1 makes it a plain
  link with no run and no state, exactly like the history card, and `#/mix` is
  always reachable (spec §2). The mix lookup is deliberately **not** in
  `jobsBusy()` either (Task 4's concern; it rebuilds no model — spec §8) — a
  reviewer will ask, and this is the answer.
- **K. Rows are keyed by array index.** A `TracklistRow` carries no id and v1 has
  no reorder (spec §5.3), so the index is the key; the edit state is reset on
  every add and delete, so a shifted index never edits the wrong row.
- **L. The `error` state's `message` is deliberately not rendered.** `MixState`'s
  `error` arm carries a `message`, but §4 makes it only ever the one
  normalization failure, and §5.2 fixes a fuller on-screen copy for it (`That is
  not a SoundCloud track link. Paste the link to the mix's page.`) than §4's
  state string. The screen prints §5.2's copy; `state.message` is not shown.
  Nothing is swallowed — the one error this arm can hold is exactly the one the
  screen names.
- **M. `Provenance` reserves "Nothing found automatically" for a clean empty.**
  It shows only when both layers answered (`trackidError` and `oembedError` both
  null) and none of TrackId / description / link-out produced anything. A layer
  that *errored* prints its own line and must not also read as "nothing found",
  which is why the predicate checks the two error fields, not just the three
  positive sources — the two are distinct arms in §5.2.

- [ ] **Step 1: Write the failing test for `formatClock`**

In `src/ui/format.test.ts`, first the import list. Replace:

```ts
import {
  artistNames,
  artistUrl,
  compactCount,
  formatBpm,
  formatDate,
  notCountedLine,
  plural,
  profileLine,
  reachLine,
} from './format';
```

with:

```ts
import {
  artistNames,
  artistUrl,
  compactCount,
  formatBpm,
  formatClock,
  formatDate,
  notCountedLine,
  plural,
  profileLine,
  reachLine,
} from './format';
```

Then add the test immediately before the existing
`it('prints a BPM with one decimal and drops a trailing .0', …)`. Replace this
exact line:

```ts
  it('prints a BPM with one decimal and drops a trailing .0', () => {
```

with:

```ts
  it('formats a clock as m:ss under an hour and h:mm:ss at or above', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(44)).toBe('0:44');
    expect(formatClock(704)).toBe('11:44');
    expect(formatClock(3599)).toBe('59:59');
    // The hour boundary switches to h:mm:ss and zero-pads both tail groups.
    expect(formatClock(3600)).toBe('1:00:00');
    expect(formatClock(11437)).toBe('3:10:37');
  });

  it('prints a BPM with one decimal and drops a trailing .0', () => {
```

- [ ] **Step 2: Run it to verify it fails**

Run: `yarn test src/ui/format.test.ts`

Expected: FAIL, 1 of 10 —

```
 ❯ src/ui/format.test.ts (10 tests | 1 failed) 16ms
   ❯ format helpers (10)
     × formats a clock as m:ss under an hour and h:mm:ss at or above 2ms

 FAIL  src/ui/format.test.ts > format helpers > formats a clock as m:ss under an hour and h:mm:ss at or above
TypeError: formatClock is not a function
 ❯ src/ui/format.test.ts:105:12
    103|
    104|   it('formats a clock as m:ss under an hour and h:mm:ss at or above', …
    105|     expect(formatClock(0)).toBe('0:00');
       |            ^

 Test Files  1 failed (1)
      Tests  1 failed | 9 passed (10)
```

- [ ] **Step 3: Implement `formatClock`**

In `src/ui/format.ts`, append the function after `profileLine` — the current
last function in the file. Replace:

```ts
export function profileLine(
  sitelinks: number | null,
  views: number | null
): string | null {
  if (sitelinks === null || sitelinks < WELL_KNOWN_MIN_SITELINKS) return null;
  const line = `Wikipedia · ${plural(sitelinks, 'language')}`;
  return views !== null && views > 0
    ? `${line} · ${compactCount(views)} views/yr`
    : line;
}
```

with:

```ts
export function profileLine(
  sitelinks: number | null,
  views: number | null
): string | null {
  if (sitelinks === null || sitelinks < WELL_KNOWN_MIN_SITELINKS) return null;
  const line = `Wikipedia · ${plural(sitelinks, 'language')}`;
  return views !== null && views > 0
    ? `${line} · ${compactCount(views)} views/yr`
    : line;
}

/**
 * Spec §6's mix-timestamp helper: `44 -> '0:44'`, `704 -> '11:44'`,
 * `11437 -> '3:10:37'`. Under an hour it is `m:ss`; at or above it is
 * `h:mm:ss` with both tail groups zero-padded. A negative or fractional input
 * is floored to whole seconds from zero, so a stray value never prints a sign
 * or a decimal.
 */
export function formatClock(totalSeconds: number): string {
  const whole = Math.max(0, Math.floor(totalSeconds));
  const seconds = whole % 60;
  const minutes = Math.floor(whole / 60) % 60;
  const hours = Math.floor(whole / 3600);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `yarn test src/ui/format.test.ts`
Expected: PASS, `Test Files  1 passed (1)`, `Tests  10 passed (10)`.

- [ ] **Step 5: Commit `formatClock`**

```bash
git add src/ui/format.ts src/ui/format.test.ts
git commit -m "feat(mix): formatClock helper for tracklist timestamps

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

- [ ] **Step 6: Create the Mix screen**

Create `src/ui/Mix.tsx`:

```tsx
import { useEffect, useState } from 'preact/hooks';
import type { TracklistRow } from '../db/schema';
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

/** Spotify search, never a track page: the app holds no id for the mix track. */
function searchUrl(row: TracklistRow): string {
  const query = `${row.artist} ${row.title}`;
  return `https://open.spotify.com/search/${encodeURIComponent(query)}`;
}

/** The time-and-label subtitle; a gap row shows only its span. */
function rowSubtitle(row: TracklistRow): string {
  const parts: string[] = [];
  if (row.startSec !== null) {
    parts.push(
      row.endSec !== null
        ? `${formatClock(row.startSec)} – ${formatClock(row.endSec)}`
        : formatClock(row.startSec)
    );
  }
  if (!row.gap && row.label !== null && row.label !== '') parts.push(row.label);
  return parts.join(' · ');
}

/** Which layer produced the row, or how the owner changed it (spec §5.3). */
function sourceLabel(row: TracklistRow): string {
  if (row.source === 'trackid') return 'TrackId';
  if (row.source === 'description') return 'description';
  if (row.source === 'pasted') return 'pasted';
  return row.detected === null ? 'added' : 'edited';
}

/**
 * One `.src` line built from a parts array, so a matched row reads
 * `TrackId · in 3 playlists · 12 other mixes` on a single wrapped line rather
 * than three stacked ones. "in N playlists" is dropped at zero, as the other
 * format.ts lines drop their missing parts; `plural` cannot spell "mixes", so
 * that part is written out.
 */
function provenanceLine(row: TracklistRow, match: MixMatch | null): string {
  const parts = [sourceLabel(row)];
  if (match && match.playlistCount > 0) {
    parts.push(`in ${plural(match.playlistCount, 'playlist')}`);
  }
  if (row.referenceCount !== null) {
    const n = row.referenceCount;
    parts.push(`${n.toLocaleString()} other ${n === 1 ? 'mix' : 'mixes'}`);
  }
  return parts.join(' · ');
}

function DisplayRow(p: {
  row: TracklistRow;
  match: MixMatch | null;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { row, match } = p;
  return (
    <TrackRow
      title={`${row.artist} – ${row.title}`}
      subtitle={rowSubtitle(row)}
      spotifyUrl={isInert(row) ? null : searchUrl(row)}
      badges={
        <>
          {match && <FeaturePills trackId={match.trackId} />}
          <span class="src">{provenanceLine(row, match)}</span>
        </>
      }
    >
      <div class="actions">
        <button type="button" onClick={p.onEdit}>
          Edit
        </button>
        <button type="button" onClick={p.onDelete}>
          Delete
        </button>
      </div>
    </TrackRow>
  );
}

function GapRow(p: { row: TracklistRow; onDelete: () => void }) {
  // Mirrors TrackRow's inner markup on purpose: TrackRow sets no class on its
  // <li>, and spec §6's `.list li.gap .title` rule needs `gap` there. Keep this
  // in sync if TrackRow's row/main/title/sub structure ever changes.
  return (
    <li class="gap">
      <div class="row">
        <div class="main">
          <span class="title">ID · unidentified</span>
          {rowSubtitle(p.row) !== '' && (
            <span class="sub">{rowSubtitle(p.row)}</span>
          )}
        </div>
      </div>
      <div class="actions">
        <button type="button" onClick={p.onDelete}>
          Delete
        </button>
      </div>
    </li>
  );
}

function EditRow(p: {
  row: TracklistRow;
  onSave: (patch: { artist: string; title: string; label: string }) => void;
  onCancel: () => void;
}) {
  const [artist, setArtist] = useState(p.row.artist);
  const [title, setTitle] = useState(p.row.title);
  const [label, setLabel] = useState(p.row.label ?? '');
  return (
    <li>
      <input
        class="filter"
        type="text"
        placeholder="Artist"
        value={artist}
        onInput={(e) => setArtist((e.currentTarget as HTMLInputElement).value)}
      />
      <input
        class="filter"
        type="text"
        placeholder="Title"
        value={title}
        onInput={(e) => setTitle((e.currentTarget as HTMLInputElement).value)}
      />
      <input
        class="filter"
        type="text"
        placeholder="Label (optional)"
        value={label}
        onInput={(e) => setLabel((e.currentTarget as HTMLInputElement).value)}
      />
      <div class="actions">
        <button
          type="button"
          class="primary"
          onClick={() => p.onSave({ artist, title, label })}
        >
          Save
        </button>
        <button type="button" onClick={p.onCancel}>
          Cancel
        </button>
      </div>
    </li>
  );
}

function Tracklist() {
  const rows = mixRows.value;
  const m = model.value;
  const index = m ? libraryTitleIndex(m) : null;
  const [editing, setEditing] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const onSaveMix = (): void => {
    void saveMix();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  return (
    <>
      <ul class="list">
        {rows.map((row, i) => {
          if (editing === i) {
            return (
              <EditRow
                key={i}
                row={row}
                onSave={(patch) => {
                  editMixRow(i, patch);
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            );
          }
          if (row.gap) {
            return (
              <GapRow
                key={i}
                row={row}
                onDelete={() => {
                  deleteMixRow(i);
                  setEditing(null);
                }}
              />
            );
          }
          const match = m && index ? matchMixRow(m, index, row) : null;
          return (
            <DisplayRow
              key={i}
              row={row}
              match={match}
              onEdit={() => setEditing(i)}
              onDelete={() => {
                deleteMixRow(i);
                setEditing(null);
              }}
            />
          );
        })}
      </ul>
      <div class="actions">
        <button
          type="button"
          onClick={() => {
            addMixRow();
            setEditing(mixRows.value.length - 1);
          }}
        >
          Add track
        </button>
        <button type="button" class="primary" onClick={onSaveMix}>
          {saved ? 'Saved ✓' : 'Save mix'}
        </button>
      </div>
    </>
  );
}

function PasteBox() {
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const onAdd = (): void => {
    const result = applyPastedTracklist(text);
    if (result === 'added') {
      setText('');
      setNote(null);
    } else if (result === 'linkOnly') {
      setNote(
        'That looks like a link to a tracklist, not a tracklist. Open it, copy the tracks, and paste them here.'
      );
    } else {
      setNote('No tracks found in that text.');
    }
  };
  return (
    <>
      <p class="muted">Paste a tracklist</p>
      <textarea
        class="filter"
        rows={4}
        aria-label="Paste a tracklist"
        placeholder="e.g. from MixesDB or a player comment"
        value={text}
        onInput={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)}
      />
      <button type="button" onClick={onAdd} disabled={text.trim() === ''}>
        Add these tracks
      </button>
      {note !== null && <p class="muted">{note}</p>}
    </>
  );
}

function Provenance(p: { view: MixView }) {
  const { view } = p;
  const tid = view.trackid;
  // "Nothing found automatically" is reserved for the case where both layers
  // answered and neither had anything (spec §5.2). A layer that errored prints
  // its own line below, so it must not also trip the "nothing found" line; a
  // pasted list also counts as something found.
  const foundSomething =
    tid !== null ||
    view.sources.description ||
    view.sources.linkOut !== null ||
    view.sources.pasted;
  const nothingFound =
    !foundSomething && view.trackidError === null && view.oembedError === null;
  return (
    <>
      {tid && tid.count > 0 && (
        <p class="caption">
          From TrackId.net · {plural(tid.count, 'track')}
          {tid.timeHitRate !== null &&
            ` · ${Math.round(tid.timeHitRate * 100)}% of the mix identified`}{' '}
          ·{' '}
          <a
            href={`https://trackid.net/audiostream/${tid.slug}`}
            target="_blank"
            rel="noopener"
          >
            Open on TrackId.net ›
          </a>
        </p>
      )}
      {tid && tid.empty && (
        <p class="caption">
          TrackId.net has this mix but identified no tracks yet ·{' '}
          <a
            href={`https://trackid.net/audiostream/${tid.slug}`}
            target="_blank"
            rel="noopener"
          >
            Open on TrackId.net ›
          </a>
        </p>
      )}
      {view.sources.description && (
        <p class="caption">From the mix description</p>
      )}
      {view.sources.linkOut !== null && (
        <p class="caption">
          The description links a full tracklist ·{' '}
          <a href={view.sources.linkOut} target="_blank" rel="noopener">
            {view.sources.linkOut} ›
          </a>
        </p>
      )}
      {nothingFound && (
        <p class="caption">
          Nothing found automatically — paste a tracklist below, or read the
          player's comments.
        </p>
      )}
      {view.trackidError !== null && (
        <p class="error">
          TrackId.net could not be reached: {view.trackidError}
        </p>
      )}
      {view.oembedError !== null && (
        <p class="error">The mix page could not be read: {view.oembedError}</p>
      )}
    </>
  );
}

/** Cheap content compare, so the Replace button hides once the description
 *  rows are the ones on screen and reappears after a TrackId seed or an edit. */
function sameRows(a: TracklistRow[], b: TracklistRow[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((r, i) => {
    const o = b[i];
    return (
      o !== undefined &&
      r.source === o.source &&
      r.artist === o.artist &&
      r.title === o.title &&
      r.startSec === o.startSec &&
      r.gap === o.gap
    );
  });
}

function Ready(p: { view: MixView }) {
  const { view } = p;
  const showReplace =
    view.descriptionRows.length > 0 &&
    !sameRows(mixRows.value, view.descriptionRows);
  return (
    <>
      <Provenance view={view} />
      {view.playerSrc !== null && (
        <iframe
          class="mix-player"
          title="SoundCloud player"
          src={`${view.playerSrc}&show_comments=true`}
          width="100%"
          height="400"
          loading="lazy"
          allow="autoplay; encrypted-media"
        />
      )}
      {showReplace && (
        <button type="button" onClick={() => applyDescriptionTracklist()}>
          Replace with the description tracklist
        </button>
      )}
      <Tracklist />
      <PasteBox />
    </>
  );
}

function SavedMixes() {
  const mixes = savedMixes.value;
  if (mixes.length === 0) return <p class="muted">No saved mixes yet.</p>;
  return (
    <ul class="list">
      {mixes.map((mix) => {
        const n = mix.rows.filter((r) => !r.gap).length;
        return (
          <TrackRow
            key={mix.url}
            title={mix.title ?? mix.url}
            subtitle={`${plural(n, 'track')} · saved ${formatDate(mix.savedAt)}`}
            onClick={() => openMix(mix.url)}
          >
            <div class="actions">
              <button
                type="button"
                onClick={() => {
                  if (confirm('Remove this saved mix?'))
                    void removeMix(mix.url);
                }}
              >
                Remove
              </button>
            </div>
          </TrackRow>
        );
      })}
    </ul>
  );
}

function InfoCards() {
  return (
    <>
      <div class="card">
        <h2>Automatic full scan (on your computer)</h2>
        <p>
          This app only shows what public sources already know about a mix — it
          never listens to the audio. To identify every track yourself, run a
          full scan on your computer with an open-source tool:
        </p>
        <p>
          <a
            href="https://github.com/betmoar/tracklistify"
            target="_blank"
            rel="noopener"
          >
            Tracklistify ›
          </a>
        </p>
        <p>
          <a
            href="https://github.com/marin-m/SongRec"
            target="_blank"
            rel="noopener"
          >
            SongRec ›
          </a>
        </p>
        <p class="muted">
          They run off your phone and use Shazam to recognise the audio.
        </p>
      </div>
      <div class="card">
        <h2>Auto Shazam</h2>
        <p>
          In Shazam on your phone, turn on "Sync to Spotify". A "My Shazam
          Tracks" playlist then appears in Spotify — it shows up under Playlists
          here and syncs like any other playlist.
        </p>
      </div>
    </>
  );
}

export function Mix() {
  const [url, setUrl] = useState('');
  const state = mixState.value;
  const viewUrl = state.status === 'ready' ? state.view.url : null;
  // Load the saved mixes once, on mount (never on app load).
  useEffect(() => {
    void loadSavedMixes();
  }, []);
  // Reopening a saved mix seeds the input from its url, so the always-present
  // top button is the "Look up again" re-fetch path (spec §4, no second control).
  useEffect(() => {
    if (viewUrl !== null) setUrl(viewUrl);
  }, [viewUrl]);
  return (
    <section class="mix">
      <h1>Mix tracklist</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim() !== '' && state.status !== 'looking') {
            void startMixLookup(url);
          }
        }}
      >
        <input
          class="filter"
          type="url"
          placeholder="Paste a SoundCloud mix link"
          value={url}
          onInput={(e) => setUrl((e.currentTarget as HTMLInputElement).value)}
        />
        <button
          type="submit"
          class="primary"
          disabled={state.status === 'looking' || url.trim() === ''}
        >
          {state.status === 'looking'
            ? 'Looking up…'
            : state.status === 'ready'
              ? 'Look up again'
              : 'Look up'}
        </button>
      </form>
      {state.status === 'looking' && <p class="muted">Looking up the mix…</p>}
      {state.status === 'error' && (
        <p class="error">
          That is not a SoundCloud track link. Paste the link to the mix's page.
        </p>
      )}
      {mixError.value !== null && <p class="error">{mixError.value}</p>}
      {state.status === 'idle' && <SavedMixes />}
      {state.status === 'ready' && <Ready view={state.view} />}
      <InfoCards />
    </section>
  );
}
```

- [ ] **Step 7: Wire the `#/mix` route into `router.ts` and `app.tsx`**

Both halves land together (Note B): `router.ts` alone compiles but renders
nothing on `#/mix`, and a missing `parseRoute` case silently routes `#/mix` to
Top.

**7a. `src/router.ts` — the `Route` arm.** Replace:

```ts
  | { name: 'import' }
  | { name: 'settings' }
  | { name: 'crate' }
```

with:

```ts
  | { name: 'import' }
  | { name: 'settings' }
  | { name: 'mix' }
  | { name: 'crate' }
```

**7b. `src/router.ts` — the `parseRoute` case.** Replace:

```ts
    case 'import':
      return { name: 'import' };
    case 'settings':
      return { name: 'settings' };
```

with:

```ts
    case 'import':
      return { name: 'import' };
    case 'settings':
      return { name: 'settings' };
    case 'mix':
      return { name: 'mix' };
```

(`routeHref`'s `default` already yields `#/${route.name}` = `#/mix`; no change
there.)

**7c. `src/app.tsx` — import `Mix`.** Replace:

```tsx
import { Import } from './ui/Import';
import { Playlist } from './ui/Playlist';
```

with:

```tsx
import { Import } from './ui/Import';
import { Mix } from './ui/Mix';
import { Playlist } from './ui/Playlist';
```

**7d. `src/app.tsx` — `tabOf` maps `mix → settings`.** Replace:

```tsx
  if (r.name === 'crateView') return 'crate';
  if (r.name === 'import') return 'settings';
  return r.name;
```

with:

```tsx
  if (r.name === 'crateView') return 'crate';
  if (r.name === 'import') return 'settings';
  if (r.name === 'mix') return 'settings';
  return r.name;
```

**7e. `src/app.tsx` — the `Screen` case.** Replace:

```tsx
    case 'import':
      return <Import />;
    case 'settings':
      return <Settings />;
  }
```

with:

```tsx
    case 'import':
      return <Import />;
    case 'settings':
      return <Settings />;
    case 'mix':
      return <Mix />;
  }
```

- [ ] **Step 8: Add the `Mix tracklist` card to Settings**

Two edits to `src/ui/Settings.tsx` (`routeHref` is already imported there).

**8a. The card function, placed just before `Settings`.** Replace this exact
line — keep the `export` on `Settings`:

```tsx
export function Settings() {
  const state = syncState.value;
```

with:

```tsx
/**
 * Spec §5.1: a plain link card, like the history card — no run, no state, so
 * it reads no `jobsBusy()`. `#/mix` is always reachable (spec §2): the screen
 * needs no import and no sync first.
 */
function MixCard() {
  return (
    <div class="card">
      <h2>Mix tracklist</h2>
      <p>
        Paste a SoundCloud DJ-mix link to draft its tracklist from public
        sources — or type your own.
      </p>
      <p>
        <a href={routeHref({ name: 'mix' })}>Open mix tracklist ›</a>
      </p>
    </div>
  );
}

export function Settings() {
  const state = syncState.value;
```

**8b. Render it after `<ReachCard />`.** Replace:

```tsx
      <HistoryCard />
      <AudioCard />
      <ReachCard />
      <div class="card">
        <h2>Disconnect</h2>
```

with:

```tsx
      <HistoryCard />
      <AudioCard />
      <ReachCard />
      <MixCard />
      <div class="card">
        <h2>Disconnect</h2>
```

- [ ] **Step 9: Add spec §6's three style rules**

Append to `src/styles.css` after the last rule. Replace:

```css
/* Group headings sit inside `ul.list`, so they scroll with their rows. */
.list li.group {
  padding: 14px 4px 6px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--muted);
  border-bottom: 1px solid #2a2a2a;
}
```

with:

```css
/* Group headings sit inside `ul.list`, so they scroll with their rows. */
.list li.group {
  padding: 14px 4px 6px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--muted);
  border-bottom: 1px solid #2a2a2a;
}

/* Spec §6: the three Mix-screen additions. The player is built by the app
   from the validated oEmbed src; a gap row's title reads muted-italic; the
   `.src` provenance span rides in TrackRow's `badges` flex row and takes a
   full basis, so it drops below the pills the way `.reach` does. */
.mix-player {
  width: 100%;
  border: 0;
  border-radius: 8px;
}

.list li.gap .title {
  color: var(--muted);
  font-style: italic;
}

.mix .src {
  flex-basis: 100%;
  font-size: 0.8rem;
  color: var(--muted);
}
```

Spec §6 lists nothing else: the URL input and the textarea reuse `.filter`, the
edit inputs reuse `.filter`, the buttons and `.actions`, `.card`, `.list`,
`.caption`, `.muted`, `.error`, `.row/.main/.title/.sub` are all reused as they
stand.

- [ ] **Step 10: Run the full gate**

This is the first step that needs Tasks 1–4 merged: `Mix.tsx` imports the
schema types (Task 1), `libraryTitleIndex`/`matchMixRow` (Task 2), and the mix
signals/actions/`MixView`/`MixState` (Task 4). On the assembled branch:

Run: `yarn typecheck && yarn lint && yarn test && yarn build`

Expected: all four pass (measured). `src/ui/format.test.ts` gains **+1 test,
9 → 10**, taking the whole suite to `Test Files  42 passed (42)`,
`Tests  480 passed (480)` (Task 4's 479 plus this one; `Mix.tsx` has no unit
test). `yarn build` reports **88 modules transformed** (81 at HEAD, +7 for the
Mix screen and its imports) and emits `dist/assets/index-*.js`,
`dist/assets/index-*.css` and the two worker chunks; no new bundled entry
point.

Run: `npx prettier --check "src/**/*.ts" "src/**/*.tsx" "src/**/*.css"`
Expected: `All matched files use Prettier code style!`

- [ ] **Step 11: Walk the screen in the browser at 390 px**

Screens have no unit tests, so this is the verification.

> **NOTE — this step makes real network requests and is not runnable until
> Tasks 1–4 have landed.** With Tasks 1–4 stubbed the lookup does nothing and the
> screen looks broken — do not conclude that from stubs. On the assembled
> branch, pasting a link calls `https://soundcloud.com/oembed` (public metadata)
> and `https://trackid.net/api/public/audiostreams` (the corpus), live, at the
> app's own origin. Nothing but the normalised SoundCloud URL leaves the
> browser (spec §8).

> **The checkable TrackId hit** is the mix the spec probed on 2026-09-06,
> `Exclusive: Shonky - May Mix by XLR8R` (spec §3.2/§3.3). Assert the **shape**
> of the provenance line, not a literal count — the corpus can change: it reads
> `From TrackId.net · N tracks · NN% of the mix identified · Open on
> TrackId.net ›` with N and NN both non-zero (the spec's 2026-09-06 probe
> returned 18 tracks and `timeHitRate` 0.3263 → 33%, and `Task 3`'s
> `trackid.test.ts` pins the mapping arithmetic against a controlled fixture).
> Paste the real XLR8R "Shonky - May Mix" SoundCloud permalink for this case;
> any other real SoundCloud DJ-mix link exercises the general flow.

Run `yarn dev` (a sibling session may already have one on 5173 — check first)
and open `http://127.0.0.1:5173/myOwnSpotifyData/` — never `localhost` — with
the device toolbar at **390 px** wide.

1. **Idle.** `Settings` → the `Mix tracklist` card (after `Artist reach`);
   `Open mix tracklist ›` lands on `#/mix` with the **Settings tab
   highlighted**. The screen shows the h1 `Mix tracklist`, the URL input
   (placeholder `Paste a SoundCloud mix link`), a `Look up` button **disabled
   until the input is non-empty**, then `No saved mixes yet.`, then both info
   cards. Open the four links (`Tracklistify`, `SongRec`) — they go to the two
   GitHub repos.
2. **A known-in-corpus mix.** Paste the XLR8R Shonky link, `Look up`: the button
   reads `Looking up…`, a `Looking up the mix…` line shows, then the provenance
   line reads the shape `From TrackId.net · N tracks · NN% of the mix identified
   · Open on TrackId.net ›` (the spec probed 18 tracks / 33%). The player iframe
   loads and its **comments** are
   visible. The tracklist shows `Artist – Title` rows with `m:ss – m:ss` times,
   a muted `TrackId` provenance line, gap rows rendered `ID · unidentified`
   muted-italic with their span, and — for any row that matches the owner's
   library — BPM/key pills and `in N playlists`. The top button now reads
   `Look up again`.
3. **A description tracklist.** Paste a mix that is **not** in the corpus but
   whose description carries a tracklist: the provenance reads `From the mix
   description`, rows are sourced `description`, and no `%` line shows.
4. **Nothing found.** Paste a real mix with neither a corpus entry nor a
   description listing: `Nothing found automatically — paste a tracklist below,
   or read the player's comments.` The player still shows if oEmbed answered.
5. **A bad link.** Paste a non-SoundCloud URL: `That is not a SoundCloud track
   link. Paste the link to the mix's page.`, and the input keeps its text.
6. **Edit / add / delete.** Tap `Edit` on a row, change the artist/title/label,
   `Save`: the row updates and its provenance flips to `edited`. `Add track`
   opens a blank row in edit mode; give it a title and time. `Delete` removes a
   row; deleting the row being edited closes the editor.
7. **Paste your own.** Paste a several-line tracklist into the textarea, `Add
   these tracks`: rows are added (a `confirm()` appears first if you had edited
   rows). Paste a bare `Full tracklist at …` link: the muted note appears and
   no rows are added.
8. **Save, reopen, remove.** `Save mix` → the button flashes `Saved ✓`.
   Navigate away and back (or reload): the mix is in the saved list as
   `N tracks · saved <date>` (gap rows not counted). Tap it → it reopens with no
   network call, the top button reads `Look up again`, and the input holds its
   url. `Remove` → `confirm()` → it is gone.
9. **390 px.** No horizontal scrollbar on the page; a long `Artist – Title`
   ellipsises; the `.src` provenance line wraps onto its own line under the
   pills; the player iframe fits the width.

Stop the dev server if you started it.

- [ ] **Step 12: Commit the screen**

```bash
git add src/ui/Mix.tsx src/router.ts src/app.tsx src/ui/Settings.tsx \
  src/styles.css
git commit -m "feat(mix): the Mix screen, the Settings card, the route and styles

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

---

---

### Task 6: README, CLAUDE.md, and the spec's implementation ruling

The spec is the binding document, so it has to say what was actually built.
This task resolves the spec's one open point in §3.1/§8, then brings
`README.md` and `CLAUDE.md` up to date for the Mix tracklist feature. It
touches **no source file and adds no test**, which is exactly why it is its own
task: a reviewer can reject a doc line while approving the screens, and the
edits describe work Tasks 1 to 5 finished. Docs-only — the gate must report the
same numbers Task 5 left behind.

**Files:**

- Create: none
- Modify:
  - `docs/superpowers/specs/2026-09-06-mix-tracklist-design.md` (§3.1's host
    bullet and §8's `(to confirm at implementation)` line — two replacements)
  - `README.md` (the privacy sentence in the opening paragraph, and one new
    bullet in "Using it")
  - `CLAUDE.md` (the spec/research pointers, the `db/`, `features/` and `ui/`
    Architecture bullets, one new Conventions bullet, and the tab-bar
    Conventions bullet — seven replacements)
- Test: none. Nothing executable changes, so the gate in Step 4 must report
  exactly the numbers Task 5 left behind (the scratch measurement below is
  392 tests in 36 files, 81 build modules — see Notes).
- Unchanged, do not touch: every file under `src/`. If this task needs a source
  edit, a doc line is wrong — fix the line, not the code.

**Interfaces:**

- Consumes: nothing at compile time. It describes, in prose, what Tasks 1 to 5
  built, and every name it prints is spelled exactly as those tasks ship it —
  this list is the reconciliation surface the assembler diffs against Tasks
  1–5:
  - Task 1 (`src/db/schema.ts`, `src/db/repo.ts`, `src/features/mix/url.ts`):
    `DB_VERSION` is `4`; the new store `mixes` (`keyPath: 'url'`); the repo
    helpers `getMixes(): Promise<MixRow[]>`, `putMix(row: MixRow):
    Promise<void>`, `deleteMix(url: string): Promise<void>`; and
    `normalizeMixUrl(input: string): string | null`.
  - Tasks 2–3 (`src/features/mix/oembed.ts`, `src/features/mix/trackid.ts`,
    `src/features/mix/parse.ts`): `fetchOembed(fetchFn, normUrl)`,
    `fetchTrackId(fetchFn, normUrl)`, `parseDescription`, `parsePasted`,
    `parseLines(text, minRun)`, `parseClock(s)`.
  - Task 2 (`src/features/mix/match.ts`) and Task 4 (`src/features/mix/lookup.ts`):
    `libraryTitleIndex(model)`, `matchMixRow(model, index, row)`,
    `lookupMix(deps, normUrl)`.
  - Task 5 (`src/model/state.ts`, `src/router.ts`, `src/app.tsx`,
    `src/ui/Mix.tsx`): the signals `mixState`, `mixRows`, `savedMixes`; the
    `#/mix` route mapped to `settings` by `tabOf`; the screen `Mix.tsx`.
  - `formatClock(totalSeconds: number): string` in `src/ui/format.ts`, tested
    in `ui/format.test.ts` (spec §6/§7) — owned by **Task 5** (Decision 13);
    this doc prints only the name.
  - Existing, reused as-is (verified present at HEAD `23efb62`): `Model`
    carries `tracksByKey`, `playlistsOfTrack` and `features`; `cleanTitle` and
    `primaryArtist` are exported from `src/features/rekordbox-match.ts`,
    `normalize` from `src/model/normalize.ts`; `TrackRow` takes
    `{ title, subtitle?, spotifyUrl?, badges? }`; `FeaturePills` takes
    `{ trackId }`; `SpotifyLink` takes `{ href }`; `jobsBusy()` folds five
    running states (sync, import, ReccoBeats lookup, Rekordbox, reach) and the
    mix lookup is **not** among them; `tabOf` in `app.tsx` maps `import →
    settings`.
- Produces: no code. The one spec ruling it records is the `on.soundcloud.com`
  resolution below; the plan ends here and nothing depends on this task.

**Notes:**

- **`.prettierignore` lists `docs/`**, so `yarn format` reflows `README.md` and
  `CLAUDE.md` but never the spec. Both root-doc AFTER blocks below are already
  Prettier output (`prettier --check README.md CLAUDE.md` passes on them);
  CLAUDE.md's Architecture bullets are deliberately single long lines and
  Prettier's default `proseWrap: preserve` keeps them, so do not hand-wrap
  them. Run `yarn format` before reading the diff and confirm no code block
  inside the spec was reflowed — if one was, something other than this task
  edited it.
- **Every BEFORE block below was checked to appear exactly once** in its file
  at `feat/mix-tracklist` `23efb62`, and none of them is touched by Tasks 1 to
  5, so these edits can be applied any time after Task 1 (which sets
  `DB_VERSION` 4 and adds the store this task describes). They are last only so
  the documents describe finished work.
- **This is the only §8 amendment this plan can settle on its own.** The
  spec's code-fact claims were all verified accurate at HEAD (the `Model`
  accessors, the matcher exports, `TrackRow`/`FeaturePills`/`SpotifyLink`
  props, `repo.ts:216-222` as the `putFeatures` shape), so there is no
  stale-anchor deviation to record. The `on.soundcloud.com` point is the one
  `(to confirm at implementation)` marker the design left open. **Assembler:**
  if any of Tasks 1–5 recorded a further deviation in its own Decisions block
  or the execution ledger, add it to the `Rulings made while implementing.`
  block as one more bullet in the same *`ruling`* (§ref) — *… Cost if wrong: …*
  form; if Task 1's shipped `normalizeMixUrl` treats `on.soundcloud.com`
  differently from "returns `null`, no note", the seeded bullet below is the
  one entry that must be rewritten to match it.

- [ ] **Step 1: Resolve the spec's `on.soundcloud.com` open point (§3.1 and §8)**

Two replacements in
`docs/superpowers/specs/2026-09-06-mix-tracklist-design.md`. The spec is
`docs/`-ignored, so `yarn format` will not reflow either block.

**1a — §3.1 host bullet.** Drop the `(to confirm at implementation)` marker and
state the resolution. Replace:

````markdown
- Host must be `soundcloud.com`, `www.soundcloud.com` or `m.soundcloud.com`;
  anything else (including `on.soundcloud.com` short links, which need a
  redirect the app cannot follow cross-origin) → `null`. **`(to confirm at
  implementation)`**: whether `on.soundcloud.com` short links are worth a
  best-effort note to the owner ("open it once to get the full link"); the
  research did not test them.
````

with:

````markdown
- Host must be `soundcloud.com`, `www.soundcloud.com` or `m.soundcloud.com`;
  anything else (including `on.soundcloud.com` short links, which need a
  redirect the app cannot follow cross-origin) → `null`. No best-effort note is
  shown for a short link: expanding it would need a network call `normalizeMixUrl`
  must not make, and the `error` state already tells the owner to paste the
  mix's page link (resolved at implementation — §8).
````

**1b — §8 open-point line becomes the implementation-rulings block.** Replace:

````markdown
**`(to confirm at implementation)`** — the only unresolved point: whether
`on.soundcloud.com` short links are worth a best-effort note (§3.1); everything
else is verified or ruled.
````

with:

````markdown
**Rulings made while implementing.** Recorded here because each differs from,
or resolves a gap left open by, the sections above.

- *`on.soundcloud.com` short links resolve to `null`, with no owner note*
  (§3.1). This was the design's one `(to confirm at implementation)` point. The
  host allowlist already excludes the short-link host, and expanding it would
  need a redirect `normalizeMixUrl` cannot follow cross-origin, so the lean
  rule takes the smallest thing that works: the `error` state
  (`That is not a SoundCloud track link.`) already tells the owner to paste the
  mix's page link. Cost if wrong: an owner who pastes a short link is told it is
  not a track link rather than being helped to expand it; revisit only if it
  recurs.
- *The paste box reports its outcome so the screen can render §4's "gentle
  inline note"* (§4, §5.2). `applyPastedTracklist` returns
  `'added' | 'linkOnly' | 'empty'` rather than `void`, and the Mix screen holds
  that in local state to show a muted note beside the paste box for a link-only
  or empty paste. A new `mixError` signal (never a `BannerMessage`, so §6 holds)
  carries a rejected `putMix`/`deleteMix`/`getMixes`, rendered inline — the two
  surfaces §6 did not enumerate, added so nothing is swallowed. Cost if wrong: a
  second inline channel on one screen.
````

- [ ] **Step 2: Update README.md**

Two replacements. First, the opening paragraph's "Nothing is uploaded anywhere"
sentence gains the Mix tracklist exception while keeping its closing promise
intact. Replace:

````markdown
for play counts. Nothing is uploaded anywhere except the track ids the BPM and
key lookup sends to ReccoBeats and the artist ids, ISRCs and article titles
the artist-reach lookup sends to MusicBrainz, ListenBrainz, Deezer, Wikidata
and Wikimedia — and only when you start one of them. No token, no playlist and
no listening history ever leaves the browser.
````

with:

````markdown
for play counts. Nothing is uploaded anywhere except the track ids the BPM and
key lookup sends to ReccoBeats, the artist ids, ISRCs and article titles the
artist-reach lookup sends to MusicBrainz, ListenBrainz, Deezer, Wikidata and
Wikimedia, and the SoundCloud link you paste into the Mix tracklist screen,
which goes to SoundCloud and TrackId.net (and loads the player from
`w.soundcloud.com`) — and only when you start one of them. No token, no
playlist and no listening history ever leaves the browser.
````

Then a new bullet in "Using it", after **Under the radar** and before
**Re-import once for the Crate** — the order §5.1 gives the Settings cards
(Audio data → Artist reach → Mix tracklist). Replace this exact line:

````markdown
- **Re-import once for the Crate.** An import made before the Crate shipped
````

with:

````markdown
- **Mix tracklist** drafts the tracklist of a SoundCloud DJ mix from a link.
  Open the **Mix tracklist** card in Settings, paste a mix's link and tap
  `Look up`. It reads two free public sources — TrackId.net (a corpus of
  already-analysed mixes) and the mix's own SoundCloud description — matches
  each row against your synced library, shows the BPM and key pills and how
  many of your playlists hold it, and lets you correct any row or add your own.
  There is also a box to paste a tracklist you found elsewhere (MixesDB, a
  player comment) and the embedded player with its timed comments. Save a mix
  to keep the working list; saved mixes live only in this browser.
  It is a **draft with holes, not the full tracklist.** TrackId identified
  32.6% of the one real 190-minute mix measured, and a fresh upload is often
  not in its corpus at all (a three-day-old set came back with nothing); a
  SoundCloud description carries a tracklist only when the uploader wrote one,
  which is often not at all. Every stretch nothing
  was identified shows as an `ID · unidentified` row, and unreleased promos and
  dubplates are in no database, so expect to fill gaps by hand. The app never
  listens to the audio — it only shows what public sources already know, so it
  cannot identify a track no source has named.
  **To identify every track yourself, scan the audio on your computer** with an
  open-source tool such as Tracklistify or SongRec: they run off the phone and
  use Shazam to recognise the audio. Or, on the phone, open Shazam and turn on
  **Sync Shazam Library to Spotify** (Auto Shazam): a "My Shazam Tracks"
  playlist then appears in Spotify, shows up under Playlists here, and syncs
  like any other playlist.
- **Re-import once for the Crate.** An import made before the Crate shipped
````

- [ ] **Step 3: Update CLAUDE.md**

Seven replacements.

**3a.** The spec pointers. Replace this exact block:

````markdown
(BPM and key) and `docs/superpowers/specs/2026-09-05-artist-reach-design.md`
(artist reach, the Artists tab's "Under the radar" view).
````

with:

````markdown
(BPM and key), `docs/superpowers/specs/2026-09-05-artist-reach-design.md`
(artist reach, the Artists tab's "Under the radar" view) and
`docs/superpowers/specs/2026-09-06-mix-tracklist-design.md` (Mix tracklist —
paste a SoundCloud link, draft a tracklist from free public sources).
````

**3b.** The research pointers. Replace this exact block:

````markdown
`docs/superpowers/research/2026-09-05-artist-reach-sources.md` (what Spotify
stopped answering, and the five keyless sources that replace it).
````

with:

````markdown
`docs/superpowers/research/2026-09-05-artist-reach-sources.md` (what Spotify
stopped answering, and the five keyless sources that replace it) and
`docs/superpowers/research/2026-09-06-mix-tracklist-sources.md` (the TrackId.net
guard, the oEmbed shape, the six-shape tracklist grammar, and why no
browser-only path returns a full tracklist).
````

**3c.** The `db/` bullet: `DB_VERSION` 4, the `mixes` store, and why it is out
of the model. Replace this exact line:

````markdown
- `db/` `idb` schema and repository. Stores: `playlists`, `tracks`, `entries` (keyed `[playlistId, position]`), `topItems`, `plays`, `features` (keyed by Spotify track id), `artistIdentity` (keyed by Spotify artist id), `artistReach` (keyed `${artistId}|${source}` — build it with `reachKey`), `meta`. `DB_VERSION` is 3; the `upgrade` callback creates only the stores that are missing, so a version 1 database keeps everything it holds and gains `features`, and a version 2 database gains the two reach stores.
````

with:

````markdown
- `db/` `idb` schema and repository. Stores: `playlists`, `tracks`, `entries` (keyed `[playlistId, position]`), `topItems`, `plays`, `features` (keyed by Spotify track id), `artistIdentity` (keyed by Spotify artist id), `artistReach` (keyed `${artistId}|${source}` — build it with `reachKey`), `mixes` (keyed by the normalised SoundCloud `url`), `meta`. `DB_VERSION` is 4; the `upgrade` callback creates only the stores that are missing (the same guarded `db.objectStoreNames.contains` shape throughout), so a version 1 database keeps everything it holds and gains `features`, a version 2 database gains the two reach stores, and a version 3 database gains `mixes`. `mixes` is deliberately **not** in `AllRows`, `getAllRows` or `buildModel` — nothing but `Mix.tsx` reads a mix — so it is reached through three dedicated repo functions (`getMixes`, `putMix`, `deleteMix`), never through the model rebuild.
````

**3d.** The `features/` bullet: append the Mix acquisition layer. Replace this
exact line-ending:

````markdown
`listenbrainz.ts` (`total_user_count`) and `wikipedia.ts` (12 complete UTC months of pageviews) — plus `reachRun.ts`, the resumable five-phase job that drives them and writes the `artistReachSummary` meta record on every exit path.
````

with:

````markdown
`listenbrainz.ts` (`total_user_count`) and `wikipedia.ts` (12 complete UTC months of pageviews) — plus `reachRun.ts`, the resumable five-phase job that drives them and writes the `artistReachSummary` meta record on every exit path. "Mix tracklist" lives in its own `features/mix/` folder: the two keyless public lookups behind the Mix screen — `oembed.ts` (`fetchOembed`: SoundCloud oEmbed → title, author, description and the validated player iframe src) and `trackid.ts` (`fetchTrackId`: TrackId.net's two-call list-then-detail flow behind the mandatory `result.rowCount === 1` **and** URL-equality guard, mapping the identified spans to rows with `ID · unidentified` gaps) — plus `url.ts` (`normalizeMixUrl`, the one canonical string sent to both providers, compared by the guard and used as the `mixes` key), `parse.ts` and the shared line grammar (`parseLines`, `parseClock` — six row shapes, the ≥5-line run guard, link-out detection), `match.ts` (`libraryTitleIndex`/`matchMixRow`: each row joined to the library live at render time, memoised on `Model` identity) and `lookup.ts` (`lookupMix`: runs both fetches in parallel so one layer's failure never hides the other's rows). Every fetch is a pure function behind an injected `fetchFn` and returns a discriminated result — it never throws, and nothing is swallowed.
````

**3e.** The `ui/` bullet: add `Mix.tsx`. Replace this exact line-ending:

````markdown
`artistSelections.ts` holding its signals (`artistView`, `radarSort`, `radarFilter` — the Saved tracks filter stays inside `Artists.tsx`, since only that view reads it); hash routes from `router.ts`.
````

with:

````markdown
`artistSelections.ts` holding its signals (`artistView`, `radarSort`, `radarFilter` — the Saved tracks filter stays inside `Artists.tsx`, since only that view reads it); `Mix.tsx` is the `#/mix` screen (paste a link, the lookup, the editable tracklist, the paste-your-own box, the embedded SoundCloud player and the two off-phone info cards), reusing `TrackRow`, `FeaturePills` and `SpotifyLink` and raising no banner — every layer failure is shown inline; hash routes from `router.ts`.
````

**3f.** A new Conventions bullet — the mix lookup is not a job — appended after
the "Under the radar" convention. Its anchor is the last sentence of that
bullet **only** (it does not touch the tab-bar bullet 3g rewrites, so 3f and 3g
are independent in any order). Replace this exact line-ending:

````markdown
never print a missing number as a zero.
````

with:

````markdown
never print a missing number as a zero.
- **The Mix screen is not one of the five jobs.** `#/mix` drafts a SoundCloud mix's tracklist from two free keyless public lookups (SoundCloud oEmbed and TrackId.net) plus a paste-your-own box; it touches no Spotify quota and never runs on load — the lookup runs only from the screen's `Look up` button. **The mix lookup is deliberately NOT part of `jobsBusy()`** and does not call `loadFromDb()`: it writes no library store and rebuilds no `Model`, so it needs no mutual exclusion with sync, history import, the ReccoBeats lookup, the Rekordbox import or the artist-reach run — and `disconnect`'s "wait for the current …" guard therefore does not mention it, though `mixState`, `mixRows` and `savedMixes` are still reset alongside the other signals. Library matches are never stored: a row is matched live at render time, because a resync would make a stored match stale.
````

**3g.** The tab-bar bullet itself: `#/mix` also highlights Settings. Replace
this exact line:

````markdown
- **The tab bar is Crate · Top · Playlists · Artists · Settings.** Import is not a tab: `#/import` is still a route, it highlights the Settings tab, and it is reached from the Settings history card, the Crate provenance line, every Crate empty state and the Playlist screen's no-play-counts caption. The default route stays `top`, even though Crate is the leftmost tab.
````

with:

````markdown
- **The tab bar is Crate · Top · Playlists · Artists · Settings.** Import and Mix are not tabs: `#/import` and `#/mix` are routes that highlight the Settings tab (`tabOf` in `app.tsx` maps both to `settings`). `#/import` is reached from the Settings history card, the Crate provenance line, every Crate empty state and the Playlist screen's no-play-counts caption; `#/mix` from the Settings "Mix tracklist" card. The default route stays `top`, even though Crate is the leftmost tab.
````

- [ ] **Step 4: Check the documents and commit them**

Run: `yarn format && yarn typecheck && yarn lint && yarn test && yarn build`

Expected: all pass, **identical to Task 5's gate** — this step edits only
Markdown: `Test Files  42 passed (42)`, `Tests  480 passed (480)`, `yarn build`
**88 modules transformed**. `yarn format` covers `README.md` and `CLAUDE.md`
(never `docs/`, which `.prettierignore` excludes), and both AFTER blocks below
are already Prettier output, so nothing reflows. The count and module totals are
unchanged from Task 5 because no executable file changed; if they differ from
42/480/88, a code file was touched — fix the doc, not the code.
Skim `git diff` on the three documents: the spec's two amendments should be the
only changes to it, and no code block inside the spec should have been reflowed
by Prettier.

```bash
git add docs/superpowers/specs/2026-09-06-mix-tracklist-design.md README.md CLAUDE.md
git commit -m "docs(mix): the owner's manual, the architecture map and the spec ruling

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

Do not push. The owner pushes.
