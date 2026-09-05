# Artist Reach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship "Under the radar" — the second view on the Artists tab, which separates the artists in the owner's playlists that nobody has heard of from the ones everybody plays. Spotify no longer answers that question for a Development Mode app, so the numbers come from **ListenBrainz** `total_user_count` (listeners) and **Deezer** `nb_fan` (fans), shown side by side and never summed, while **Wikidata** (P1902, CC0) and **Wikipedia pageviews** subtract the demonstrably famous. The plan covers everything: the two new stores, the five keyless source clients, the resumable lookup job, the Settings card that starts it, the two screens that read it, and the documents that describe it.

**Architecture:** `DB_VERSION` becomes 3 and the guarded `upgrade` callback adds two stores, `artistIdentity` (one row per Spotify artist, carrying the MBID, the QID, the sitelink count, the two article titles and the Deezer artist id) and `artistReach` (one row per artist per source, keyed `${artistId}|${source}`). `buildModel` folds both into `Model.identities` and `Model.reach`, and a new pure core `src/model/reach.ts` holds `reachFor`, `isWellKnown`, `rankUnderTheRadar` and `reachCoverage`. Six new modules under `src/features/` are the acquisition layer: a dependency-free `jsonp` transport (Deezer sends no CORS header at all), one client per source — each returning a discriminated result and never throwing — and `reachRun.ts`, a manual, resumable, checkpointed job shaped like the existing ReccoBeats lookup: five phases in a fixed order, every row written to IndexedDB as it resolves, progress through an injected `onState`, and a summary meta row written on every exit path including the error one. On top of that, `src/model/state.ts` gains `reachState`, `artistReachSummary`, `jobsBusy` and `startReach`; `src/ui/Settings.tsx` gains the "Artist reach" card that is the run's only trigger; and `src/ui/Artists.tsx` becomes a dispatcher over today's Saved-tracks screen and a new `UnderRadar.tsx`, with the same two lines repeated on the Artist screen.

**Tech Stack:** Unchanged. TypeScript 6.0.x, Vite 8, Preact 10 + @preact/signals, idb 8, fflate 0.8, Vitest 5, fake-indexeddb 6, ESLint 10 flat config, yarn classic, Node 24, GitHub Pages via Actions. **No new dependency:** four sources are plain `fetch`, Deezer is a twenty-line `<script>` injection, and the SPARQL query is a template string.

**Spec:** `docs/superpowers/specs/2026-09-05-artist-reach-design.md` (authority). §2 Data, §3 Identity resolution, §4 Reach lookup job, §5 Screens, §6 Components and styles, §7 Tests and §8's rulings are this plan's requirements. Research: `docs/superpowers/research/2026-09-05-artist-reach-sources.md`. It builds on `docs/superpowers/specs/2026-09-05-bpm-key-design.md` (whose `DB_VERSION` 2 has landed) and the two 2026-09-04 specs; the shipped app's plans are `docs/superpowers/plans/2026-09-04-spotify-dj-webapp.md`, `2026-09-04-crate-history-views.md`, `2026-09-05-bpm-key.md` and `2026-09-05-ux-polish.md`. The ledger of pre-execution rulings is `.superpowers/sdd/2026-09-05-artist-reach/progress.md`; **Task 7 amends the spec so it says what was actually built**, and until that task lands the spec and this plan disagree in the eight places the Decisions below name.

## Global Constraints

- Node 24 (`.nvmrc`), yarn classic 1.22. Install with `yarn`. Never `npm install`.
- `typescript` pinned `~6.0.3`. Do not upgrade: `typescript-eslint` 8 supports `<6.1` only.
- `vite` stays an explicit devDependency (Vitest peer, and used directly by the build).
- **No new dependency.** Nothing in this plan adds one, and nothing in it may.
- ESM everywhere (`"type": "module"`). With `moduleResolution: bundler`, relative imports carry **no** `.js` extension.
- Prettier: single quotes, semicolons, ES5 trailing commas, 80 columns. Every code block in this plan is already Prettier output, so `yarn format` rewrites nothing.
- ESLint 10's `preserve-caught-error` is on: a `throw` inside a `catch` must pass `{ cause: err }`. No module in this plan rethrows — every client returns a result instead — so the rule never fires here.
- Tests sit next to their source as `src/**/*.test.ts` and run in Vitest's **Node** environment. IndexedDB tests import `fake-indexeddb/auto`; nothing in this plan needs a DOM, and `jsonp.test.ts` installs a fake `document` on `globalThis` rather than asking for one.
- **Mocked `fetch` and mocked JSONP only.** No test in this plan may reach a real network endpoint: MusicBrainz, ListenBrainz, Wikidata, Wikimedia and Deezer are all injected through `deps`.
- **Screens have no unit tests** (spec §7, in as many words). `src/model/state.ts` cannot be unit tested in this project at all: importing it under Vitest pulls in `src/auth/browser.ts`, which touches `localStorage` at module scope. Pure helpers are still written test-first — Tasks 1 and 6 both do — and the screens are verified by the gate plus the browser walkthroughs in Tasks 5 and 6.
- Before every commit: `yarn typecheck && yarn lint && yarn test` must pass. `yarn build` is run at the end of every task and passes.
- Only the Client ID is configuration: `VITE_SPOTIFY_CLIENT_ID`. Never reference a client secret anywhere.
- Dev is opened at `http://127.0.0.1:5173/myOwnSpotifyData/`, never `localhost`; Spotify refuses `localhost` as a redirect URI.
- **Nothing here ever runs on page load.** `runReach` is started by hand from the Settings card Task 5 adds; it is a 45-to-50-minute job for 1,000 artists.
- **Pacing constants, exactly as spec §3 and §4 give them, and never faster:** MusicBrainz `MB_INTERVAL_MS = 1000` (1 req/s), ListenBrainz `LB_INTERVAL_MS = 1000` (1 req/s), Deezer `DEEZER_INTERVAL_MS = 250` (4 req/s) with `JSONP_TIMEOUT_MS = 10_000`, Wikipedia `WIKIPEDIA_INTERVAL_MS = 250` (4 req/s), Wikidata `WIKIDATA_BATCH_SIZE = 150` ids per sequential POST. Every `fetch` carries `AbortSignal.timeout(REACH_REQUEST_TIMEOUT_MS)`, 15 s.
- **TTLs exactly as spec §4.5's table:** `REACH_TTL_MS` 90 days for an `ok`, `REACH_NOT_FOUND_TTL_MS` 30 days for a `notFound`, `REACH_RETRY_LATER_TTL_MS` 1 day as the floor for a `retryLater` — or the longer wait the source named, whichever is later. `retryAfter` is written on **every** `retryLater` and is the only thing that gates a `retryLater` retry.
- **Name search is forbidden at every step.** Every lookup starts from the Spotify artist id; Deezer is reached only through a **single-artist ISRC** followed by the normalised name check, and a mismatch stores no number.
- **MusicBrainz 503 is `retryLater`, never `notFound`** (rate-limited or globally busy — three documented triggers). **ListenBrainz 204 is `notFound`.** **A Deezer quota refusal is HTTP 200 with `error.code === 4`,** so the body is inspected and the status is not.
- **Wikipedia pageviews cover the last 12 complete UTC months**, never the month in progress.
- **Three consecutive failures pause one source for the rest of the run** (`MAX_SOURCE_FAILURES = 3`); every other phase carries on, and an artist the paused source never reached is left exactly as it was.
- **`runReach` never throws.** Every failure ends in a state a screen can render; nothing is swallowed. The summary meta row is written on every exit path, the error path included, because `artistReachSummary.version === 1` is the gate every reach screen reads.
- **The model reloads once, at the end of a run** — `startReach` in `src/model/state.ts` does it, after an error too, so a partial run still shows its coverage.
- **`banner` is a `BannerMessage`, never a string** (`src/model/banner.ts`): build it with `errorBanner(text, inlineOn?)` or `warnBanner(text)`. `inlineOn: ['settings']` is what keeps a reach error off the top of the screen whose own card already prints it.
- **Three things ask before they destroy data** and all three are plain `confirm()` calls made in `src/model/state.ts`, so the pure cores stay testable: Disconnect, an account switch during a sync, and an import that covers less than the stored history. This plan adds no fourth.
- **A new navigation scrolls to the top; back and forward do not** (`installRouter` stamps `history.state` with `djVisited`). Nothing in this plan touches `src/router.ts`.
- **Touch targets are at least 44 px** and the app is designed at 390 px wide. Reuse what exists: `Segmented` (with its `scroll` variant for a three-chip row), `Filter`, `Empty`, `Progress`, `TrackRow` (whose `href` draws the `›` chevron on a navigating row and whose `spotifyUrl` draws `SpotifyLink`'s icon; the icon is for a row, the labelled variant for a screen header). **No new component and no third badge kind**: the reach numbers are a line of text, not a pill.
- Commit messages: conventional prefix (`feat:`, `test:`, `chore:`, `docs:`), ending with
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu`.
- Do not push. The owner pushes.

## Decisions

Where two task drafts disagreed the spec won; where the spec is silent, the
decision is recorded here. **The task that creates a module owns its
signature** — that is the same rule the BPM plan used, and it settled most of
the list below.

1. **`ArtistReachSummary` and `ReachStep` live in `src/features/reachRun.ts`** (spec §2, on the `ImportSummary` precedent), not in `db/schema.ts`. What made a draft want to move them was a pair of invented accessors, `getArtistReachSummary` / `putArtistReachSummary` — and spec §2 forbids exactly that ("No getter is added"). So the accessors are dropped, `repo.ts` gains only `putIdentities` and `putReach`, and Task 5 reads the record with `getMeta<ArtistReachSummary>(ARTIST_REACH_SUMMARY_META)`, the way `state.ts` already reads `RekordboxSummary`.
2. **`ReachCoverage` is declared in `src/model/reach.ts` and `ArtistReachSummary extends` it**, which inverts spec §2's `Omit<ArtistReachSummary, 'version' | 'ranAt' | 'paused'>`. The dependency has to run `features/ → model/` (it already does, for `isWellKnown`); the `Omit` spelling would make `model/` import `features/` and cost Task 1 its ability to type-check on its own. One declaration of the seven-field list either way, which is what §2 is actually asking for.
3. **`reachCoverage` is implemented in `src/model/reach.ts`, not `src/model/state.ts`** — spec §5.5 chooses `state.ts` for readability and then concedes the function "is a pure function of the model and would sit equally well in `model/reach.ts`". Two things settle it: `state.ts` has no unit test in this project at all (importing it under Vitest pulls in `src/auth/browser.ts`, which touches `localStorage` at module scope), and Task 5 rewrites that same file. **Task 5 must add `export { reachCoverage, type ReachCoverage } from './reach';` to `state.ts`** (decision 27), so §5.5's and §5.3's import path is exactly what the spec says.
4. **`REACH_REQUEST_TIMEOUT_MS` lives in `src/util/retry.ts`**, splitting spec §4.5's constant block. Four client modules need it and the runner imports all four, so declaring it in `reachRun.ts` would make every client import its own runner — a module cycle whose `const` can read `undefined` at init, and a client unit test would drag the whole run into the module graph. `retry.ts` already holds `MAX_5XX_RETRIES`, `backoffMs` and `parseRetryAfter`, which every one of these clients imports. **It is declared exactly once, in Task 2 Step 3.** The other four constants of §4.5 stay in `reachRun.ts`.
5. **`ArtistIdentityRow` gains a ninth field, `qidCheckedAt: number | null`, and the Wikidata refresh reads it instead of `resolvedAt`.** Spec §2 declares one timestamp per identity row and calls the coupling benign; §3.2 calls the ninety-day sitelink refresh "load-bearing, not bookkeeping". Both cannot hold. One row carries three steps; a `notFound` MBID or Deezer id is rewritten every thirty days, and every write bumps `resolvedAt` — so `resolvedAt` older than ninety days is unreachable for those artists and the sitelink refresh never fires. And `deezerStatus: 'notFound'` is *common*: the run writes it with no request at all for every artist with no single-artist ISRC. The consequence is precisely the path §3.2 exists to keep open — an artist who gains their first Wikipedia article moving to Well known. One extra field, written only by the Wikidata phase, closes it; `needsWikidata` reads `qidCheckedAt ?? 0`, so `null` means "never checked" and enters pass 1.
6. **`retryAfter` is deliberately *not* split per step.** That coupling costs a one-day delay, not a starved refresh, and the run's own `startRows` snapshot (decision 7) covers the within-a-run half.
7. **`runReach` judges the MBID and Deezer freshness gates against `startRows`, an immutable snapshot of the identity array it was handed**, while every *value* — the MBID, the Deezer id, the QID, the titles — comes from the live map the phases update. Spec §4.2 says freshness is judged "against the maps"; without the snapshot a MusicBrainz write in phase 1 bumps `resolvedAt` and suppresses the Deezer step for that artist in phase 3 of the same run. §4.2's cross-phase threading is intact, which is what that sentence is there to guarantee.
8. **Pacing is split, and the split is deliberate.** MusicBrainz and Deezer sleep their own interval before every request they issue (Deezer has to: one artist costs up to four requests inside one call). Wikipedia paces its own two language requests. **ListenBrainz and Wikipedia are paced between artists by the runner**, because their clients sleep only for their own retries. A reader coming from `src/features/lookup.ts` must not add `if (requests > 0) await sleep(…)` around the MusicBrainz or Deezer calls — that would halve those rates and double the run's wall clock.
9. **The runner chunks for Wikidata and the client does one POST per call** (`wikidataBatches(ids)` at `WIKIDATA_BATCH_SIZE`), the same split as `fetchAudioFeatures` / `runLookup`. It is what lets `running.total` count batches for spec §5.5's `unit="batches"`, and what lets `total` grow when pass 2 starts.
10. **`MAX_RETRY_AFTER_MS` is not declared.** Spec §4.3's "a `Retry-After` above 60 s pauses the source" is enforced inside `listenbrainz.ts`, which sets `pauseForMs` only in that case; the runner pauses on `pauseForMs !== undefined` and stamps the artists still owed a request. Spec §4.5's constant list stays exactly five constants.
11. **`candidateIsrcs` lives in `deezer.ts` and `reachCandidates` calls it**, so spec §3.3's single-artist rule is written once. §7 tests the rule in `deezer.test.ts` and again through `reachCandidates` in `reachRun.test.ts`; both exercise the same function.
12. **The 3-candidate ISRC cap lives inside `resolveDeezerArtist`** (`MAX_ISRC_CANDIDATES`), not in the runner: §7 puts the cap's test in `deezer.test.ts`, and the client owns the loop.
13. **§7's "a known `deezerArtistId` skipping the ISRC request" is tested in `reachRun.test.ts`, not `deezer.test.ts`.** The skip is the runner's decision — the client is never called at all — so it cannot be tested in the client's file. Everything else in §7's Deezer bullet stays where §7 puts it.
14. **An id Wikidata bound to two distinct items is absent from `hits`**, so the runner reads it as an ordinary miss: with an MBID it gets pass 2's more precise `P434` key, and otherwise it is written `qidStatus: 'notFound'`. Either way ambiguity never promotes an artist out of the under-the-radar list, which is what spec §3.2 asks for.
15. **A bound article implies at least one sitelink.** `sitelinks` and the two article URLs are three separate SPARQL `OPTIONAL`s, so nothing in the query stops an item binding an article and no count — and spec §2's invariant `wellKnown >= wikipedia` would break. `wikidata.ts` therefore reports `max(bound count, number of bound articles)`, and `null` only when neither is present. The same amendment fixes the title: `wikiTitles.en` / `.fr` are **everything after the first `/wiki/`** in the sitelink URL, kept verbatim — not merely the last segment, because a title may contain a slash. Both halves are pinned by a test.
16. **`reachCoverage` scopes its seven counts to the candidates** (artists in `model.artists` with `id !== null`), where spec §2 words the three source counts store-wide. §5.5's "the source counts overlap on purpose" is about the sources overlapping each other, not the universe; scoping them makes `covered <= artists` and `wellKnown >= wikipedia` hold by construction, and both are asserted. The stored `ArtistReachSummary` keeps §2's store-wide reading for `resolved`, `wikipedia` and `wellKnown`, which is what "describes the whole store at `ranAt`" means.
17. **`reachKey(artistId, source)` is a helper in `db/schema.ts`**, on the `topKey(type, period)` precedent in the same file. Spec §2 names the key path and no helper, and four modules would otherwise hand-build the same template string.
18. **`compactCount` is Task 1's**, not Task 6's. It is spec §6, which is otherwise out of this plan, but §7 — which is in — requires its test in `ui/format.test.ts`. **Task 6 must not re-add it.**
19. **`getIdentities` / `getReach` do not ship.** Spec §2: "No getter is added." Tests read rows back through `getAllRows()`, which already reads both stores.
20. **There is no single-row `putIdentity`.** Tasks 2–4 write through `putIdentities([row])` and `putReach([row])`, which matches `putFeatures` and costs one transaction either way; §4.2's "checkpointed per artist" makes a one-element batch the normal call.
21. **`listenersUrl(mbid)` is exported from `listenbrainz.ts`.** The run stamps `sourceUrl` on rows for artists it never asked about — the ones still owed a request when ListenBrainz names a long wait — and `ArtistReachRow.sourceUrl` is not optional.
22. **A Deezer `sourceUrl` keeps its `?output=jsonp`**: it is the exact URL the number came from, which is what the field documents. The human-facing `deezer.com/artist/{id}` link is Task 6's, rebuilt from `deezerArtistId`.
23. **The existing v1 migration test now exercises v1 → v3 and passes unchanged.** Its `expect(db.version).toBe(DB_VERSION)` simply reads 3. Its title still says "adding features"; it is left as it is, and a **new** v2 → v3 test is added beside it, which is what spec §7 actually asks for.
24. **The documentation is Task 7, not a tail of Task 6.** The spec amendments correct §2, §3.2, §4.2, §4.5 and §7 — the sections **Tasks 1–4** implement — so folding them into Task 6 would mislabel their ownership, and a reviewer can plainly reject the spec amendments while approving the screens. That is `writing-plans`' own split test. Task 7 touches no source file.
25. **`jobsBusy()` is one predicate over all five jobs, and `working = jobsBusy()` gates "Connect again" as well as Disconnect.** Spec §5.5 names only the Disconnect button. The two share the flag in `Settings.tsx`, and `auth.logout()` mid-run would strand `reachState` on `running` with nothing on screen to clear it; widening both is the safe reading, and it cannot trap an owner whose login expires mid-run, because nothing expires a session on a timer and the Sync button that would surface an auth error is disabled for the duration. **Task 7 writes this into spec §8.**
26. **The Sync button keeps its own literal gate**, `isSyncBusy(state) || reachState.value.status === 'running'`, rather than `jobsBusy()`. §5.5 words it exactly that way, and `jobsBusy()` there would newly disable Sync during a history import — a behaviour change this spec does not ask for. The pre-existing overlap between a sync and a ReccoBeats lookup stays out of scope.
27. **`state.ts` re-exports the `ReachCoverage` *type* alongside the function**: `export { reachCoverage, type ReachCoverage } from './reach';`. Decision 3 pins only the value, but `Settings.tsx` needs the type for `reachLine(c: ReachCoverage)`, and splitting one concept across two import paths would be worse. This mirrors `coverage` / `type Coverage`. `verbatimModuleSyntax` is on, hence the inline `type` modifier.
28. **Only the three shared selections move to `src/ui/artistSelections.ts`** — `artistView`, `radarSort`, `radarFilter` — because `Artists.tsx` renders the view switcher and `UnderRadar.tsx` reads the view and the sort, so keeping them in either component would make the two import each other. The existing Saved-tracks `filter` signal stays module-private in `Artists.tsx`. The visible consequence is deliberate: **each view has its own filter box, each remembering its own text.**
29. **`UnderRadar` filters first, then groups.** That one ordering satisfies four separate §5.3 bullets at once: a heading whose rows were all filtered out is not rendered, the retry line goes with its heading, the CC BY-SA footer appears only when a Well known row is actually on screen, and the ranks — assigned over the unfiltered list by `rankUnderTheRadar` — never renumber.
30. **`No under-the-radar artists yet.` is suppressed while the filter is narrowing**, and a filter that matches nothing shows the Artists tab's existing `No artists match "…"` block rather than three empty headings. §5.3 rules on neither. **Task 7 writes both into spec §8.**
31. **With no artists at all, only the view switcher renders — not the sort control.** §5.3 asks that "both Segmented controls still render" on an empty library; `UnderRadar` instead returns `<Empty what="artists" />` before the gate, so an unsynced library reads `No artists yet. Sync in Settings` rather than showing the reach card's `Look up artists` button, which would be the wrong instruction. The bullet's stated purpose — that the view switcher survives an empty library, unlike today's `Artists.tsx` — is satisfied, because the `h1` and the view `Segmented` live in `Artists.tsx` and always render. **Task 7 writes this into spec §8.**
32. **`reachLine` and `profileLine` live in `src/ui/format.ts` and are written test-first.** Spec §5.4 requires the Artist screen and the list rows to print *the same strings*, and a shared pure function is the only way to guarantee that. They are the sole test-bearing code in Tasks 5–7; everything else there is a screen or `state.ts`.
33. **`SOURCE_LABEL` stays private to `Settings.tsx`**, typed `Record<ReachStep, string>` so a sixth step would not compile without a label. It is the *step* vocabulary of a run; Task 6's Artist-screen links (`ListenBrainz ›`, `Deezer ›`, `Wikipedia ›`) are site names in a different sentence and stay literals there.

## Spec coverage

Every requirement of §2 to §8 maps to a step below. §1 is the goal.

| Spec | Requirement | Task · Step |
| --- | --- | --- |
| §2 | `DB_VERSION` 3, guarded `upgrade`, two stores | 1 · 3 |
| §2 | `ResolveStatus`, `ReachSource`, `ReachStatus` | 1 · 3 |
| §2 | `ArtistIdentityRow`, `ArtistReachRow`, `reachKey` | 1 · 3 |
| §2 | `AllRows` / `DjDb` gain both stores; `getAllRows` reads eight | 1 · 3 |
| §2 | `putIdentities`, `putReach` | 1 · 3 |
| §2 | `ARTIST_REACH_SUMMARY_META`, `ArtistReachSummary`, written on every exit path | 4 · 3, 4 · 7 |
| §2 | `ReachCoverage` and its two invariants | 1 · 8 (decisions 2, 16) |
| §2 | `Model.identities`, `Model.reach` | 1 · 8 |
| §2 | `reachFor`, `isWellKnown`, `hasHistory`, `WELL_KNOWN_MIN_SITELINKS` | 1 · 8 |
| §2 | `rankUnderTheRadar`: groups, three sorts, tie-breaks, running rank, memo | 1 · 8 |
| §3.1 | MusicBrainz reverse URL lookup, `free streaming` + `artist` guard | 2 · 3 |
| §3.1 | 404 / no relation → `notFound`; 503 → `retryLater` after `MAX_5XX_RETRIES`; no custom header; 1 req/s | 2 · 3 |
| §3.2 | Wikidata POST, `VALUES`, no `SAMPLE`, batches of 150, both passes | 2 · 8 |
| §3.2 | QID / sitelinks / verbatim titles parsed; two items → not a hit; failure leaves the batch unchecked | 2 · 8 |
| §3.2 | Pass-1 input: `unchecked`, `notFound` past 30 d, `ok` past 90 d, `retryLater` gated | 2 · 8 (`needsWikidata`), 4 · 7 |
| §3.3 | Single-artist ISRC rule, dedup + sort | 2 · 8 (`candidateIsrcs`) |
| §3.3 | Normalised name check, next candidate on a mismatch, 3-candidate cap, `notFound` otherwise | 2 · 8 |
| §3.3 | `error.code 4` retried then `retryLater`; non-finite `artist.id` a miss; `deezerArtistId` permanent | 2 · 8, 4 · 7 |
| §3.4 | `jsonp(url, timeoutMs): Promise<unknown>`, unique callback, full cleanup, 10 s timeout | 2 · 3 |
| §4 | Every `fetch` carries `AbortSignal.timeout(REACH_REQUEST_TIMEOUT_MS)` | 2 · 3, 3 · 3, 3 · 8 |
| §4.1 | `ReachCandidate`, `reachCandidates(model)` | 4 · 3 |
| §4.2 | Five phases in order, `ReachStep`, `ReachState`, `ReachRunCounts`, `ReachDeps` | 4 · 3, 4 · 7 |
| §4.2 | The run threads its own writes; `done`/`total` reset per phase; never throws; wake lock | 4 · 7 |
| §4.3 | ListenBrainz `/listeners`, three `payload` fields, 204 → `notFound`, name check | 3 · 3 |
| §4.3 | 429 with `Retry-After`, five retries, a long wait pausing the source | 3 · 3, 4 · 7 |
| §4.4 | Pageviews URL, last 12 complete UTC months, en + fr sum, 404 rules | 3 · 8 |
| §4.5 | The three TTLs and `MAX_SOURCE_FAILURES` | 4 · 3 |
| §4.5 | The refresh table; `retryAfter` written on every `retryLater` | 4 · 7 |
| §4.5 | Permanence of MBID / QID / Deezer id; three failures pause a source; an unreached artist untouched | 4 · 7 |
| §6 | `compactCount` (decision 18) | 1 · 13 |
| §7 | `db/repo.test.ts` round trips + the v2 → v3 migration | 1 · 1 |
| §7 | `model/reach.test.ts` | 1 · 6 |
| §7 | `features/musicbrainz.test.ts`, `features/jsonp.test.ts` | 2 · 1 |
| §7 | `features/wikidata.test.ts`, `features/deezer.test.ts` | 2 · 6 |
| §7 | `features/listenbrainz.test.ts` | 3 · 1 |
| §7 | `features/wikipedia.test.ts` | 3 · 6 |
| §7 | `features/reachRun.test.ts` | 4 · 1, 4 · 5 |
| §7 | `ui/format.test.ts` | 1 · 11 |
| §5.1 | Artists tab: `h1`, the two-option view `Segmented`, `artistSelections.ts`, per-view state kept across a tab switch and reset by a reload | 6 · 5, 6 · 7 |
| §5.2 | Under the radar before a run: the `No reach data yet` card and its `Look up artists` button | 6 · 6 |
| §5.3 | The caption, the sort `Segmented` (`scroll`), the filter, the three groups and their headings, the retry line, the rows, the CC BY-SA footer | 6 · 6 (decisions 29, 30, 31) |
| §5.4 | Artist screen: the reach line, the public-profile line, the `as of` credit and the three source links | 6 · 8 |
| §5.5 | Settings "Artist reach" card: coverage line, `Progress`, result line, paused lines, error line, button, `as of`, attribution; the mutual exclusion of the five jobs | 5 · 9, 5 · 10, 5 · 11 |
| §5.6 | `reachState`, `artistReachSummary`, `jobsBusy`, `startReach`, the summary read in `loadFromDb`, `disconnect`'s guard and resets | 5 · 1 to 5 · 7 |
| §6 | `reachLine`, `profileLine`, `compactCount`; `.reach` and `.list li.group`; every other component reused unchanged | 6 · 1, 6 · 3, 1 · 13, 6 · 9 |
| §7 | Screens: no unit tests | — (Tasks 5 and 6 verify in the browser) |
| §8 | The spec says what was built: the eight amendments and the implementation rulings | 7 · 1, 7 · 2 |
| §8 | The owner's manual and the repository conventions | 7 · 3, 7 · 4 |

## File Structure

New files:

| File | Task | Responsibility |
| --- | --- | --- |
| `src/model/reach.ts` | 1 | `WELL_KNOWN_MIN_SITELINKS`, `Reach`, `ReachCoverage`, `reachFor`, `isWellKnown`, `hasHistory`, `ReachSort`, `ReachGroup`, `UnderRadarRow`, `rankUnderTheRadar`, `reachCoverage` |
| `src/model/reach.test.ts` | 1 | 16 tests: the three map reads, the well-known truth table, groups, three sorts with their tie-break chains, the memo, coverage and its two invariants |
| `src/features/jsonp.ts` | 2 | `JSONP_TIMEOUT_MS`, `jsonp` — one `<script>`, one callback, cleanup in every outcome |
| `src/features/jsonp.test.ts` | 2 | 6 tests against a fake `document` |
| `src/features/musicbrainz.ts` | 2 | `MUSICBRAINZ_URL`, `MB_INTERVAL_MS`, `MbDeps`, `MbResult`, `mbUrl`, `fetchMbid` |
| `src/features/musicbrainz.test.ts` | 2 | 10 tests, mocked `fetch` |
| `src/features/wikidata.ts` | 2 | `WIKIDATA_URL`, `WIKIDATA_BATCH_SIZE`, `WikidataDeps`, `WikidataHit`, `WikidataBatch`, `WikidataFreshness`, `wikidataBatches`, `spotifyIdQuery`, `mbidQuery`, `resolveBySpotifyId`, `resolveByMbid`, `needsWikidata` |
| `src/features/wikidata.test.ts` | 2 | 16 tests |
| `src/features/deezer.ts` | 2 | `DEEZER_API`, `DEEZER_INTERVAL_MS`, `MAX_ISRC_CANDIDATES`, `DEEZER_QUOTA_CODE`, `MAX_QUOTA_RETRIES`, `DeezerDeps`, `DeezerIdentity`, `DeezerFans`, `deezerTrackUrl`, `deezerArtistUrl`, `candidateIsrcs`, `resolveDeezerArtist`, `fetchDeezerFans` |
| `src/features/deezer.test.ts` | 2 | 14 tests, injected `jsonpFn` |
| `src/features/listenbrainz.ts` | 3 | `LISTENBRAINZ_STATS_URL`, `LB_INTERVAL_MS`, `ListenBrainzDeps`, `ListenersResult`, `listenersUrl`, `fetchListeners` |
| `src/features/listenbrainz.test.ts` | 3 | 16 tests |
| `src/features/wikipedia.ts` | 3 | `PAGEVIEWS_URL`, `WIKIPEDIA_PROJECTS`, `WIKIPEDIA_INTERVAL_MS`, `PAGEVIEW_MONTHS`, `WikiLang`, `WikiTitles`, `PageviewWindow`, `WikipediaDeps`, `PageviewsResult`, `pageviewWindow`, `fetchPageviews` |
| `src/features/wikipedia.test.ts` | 3 | 15 tests |
| `src/features/reachRun.ts` | 4 | The four §4.5 constants, `ReachStep`, `ArtistReachSummary`, `ReachRunCounts`, `ReachState`, `ReachDeps`, `ReachCandidate`, `reachCandidates`, `runReach` |
| `src/features/reachRun.test.ts` | 4 | 15 tests against `fake-indexeddb` with all five sources mocked |
| `src/ui/artistSelections.ts` | 6 | `ArtistView`, `artistView`, `radarSort`, `radarFilter` |
| `src/ui/UnderRadar.tsx` | 6 | The Under the radar view: gate, caption, sort, filter, the three groups |

Modified files:

| File | Task | Change |
| --- | --- | --- |
| `src/db/schema.ts` | 1 | `DB_VERSION` 3; three unions; `ArtistIdentityRow`; `ArtistReachRow`; `reachKey`; `AllRows`; `DjDb` |
| `src/db/repo.ts` | 1 | Two stores in `upgrade`; `getAllRows` reads eight; `putIdentities`; `putReach` |
| `src/db/repo.test.ts` | 1 | 12 → 16 tests: two fixtures, a generalised `openAt`/`putLegacyRow`, `V2_STORES`, a new `describe`, the v2 → v3 migration |
| `src/model/aggregate.ts` | 1 | `Model.identities`, `Model.reach`, both built in `buildModel` |
| `src/model/aggregate.test.ts` | 1 | 16 → 17 tests; the `AllRows` fixture and **both** inline `buildModel({ … })` literals gain both keys |
| `src/model/features.test.ts` | 1 | Its `AllRows` literal only, no new test |
| `src/features/lookup.test.ts` | 1 | Its `AllRows` literal only, no new test |
| `src/ui/format.ts` | 1 | `compactCount` |
| `src/ui/format.test.ts` | 1 | 6 → 7 tests |
| `src/util/retry.ts` | 2 | `REACH_REQUEST_TIMEOUT_MS`, appended; nothing already in the file changes |
| `src/model/state.ts` | 5 | The two feature imports; `reachState`; `artistReachSummary`; the summary read in `loadFromDb`; `jobsBusy`; the `reachCoverage` re-export; `startReach`; `disconnect`'s guard and resets |
| `src/ui/Settings.tsx` | 5 | The import block; `SOURCE_LABEL`, `reachLine`, `reachRunLine`, `pausedLine`, `ReachCard`; `AudioCard`'s `busy`; `working`; the Sync button's `disabled`; one line rendering `<ReachCard />` |
| `src/ui/format.ts` | 6 | `reachLine`, `profileLine` (Task 1 already added `compactCount`) |
| `src/ui/format.test.ts` | 6 | 7 → 9 tests |
| `src/ui/Artists.tsx` | 6 | The whole file: a dispatcher, with today's screen kept intact as a module-private `SavedTracks` |
| `src/ui/Artist.tsx` | 6 | The import block; `wikipediaUrl` and `ArtistReach`; two lines in the body |
| `src/styles.css` | 6 | Spec §6's `.reach` and `.list li.group`, appended |
| `docs/superpowers/specs/2026-09-05-artist-reach-design.md` | 7 | The eight amendments and the §8 rulings block |
| `README.md` | 7 | The privacy sentence and one bullet in "Using it" |
| `CLAUDE.md` | 7 | The spec/research pointers, five Architecture bullets (`util/`, `db/`, `features/`, `model/`, `ui/`), two Conventions bullets |

Untouched by the whole plan: `src/router.ts` (both routes already exist, and
§5.1 wants a signal rather than a route, so a reload resets the view),
`src/spotify/`, `src/sync/`, `src/history/`, `src/auth/`, `src/model/crate.ts`,
`src/model/keys.ts`, `src/model/match.ts`, and every shared component —
`TrackRow`, `Segmented`, `Filter`, `Empty`, `Progress`, `Badge`,
`SpotifyLink`, `FeaturePills` — which spec §6 reuses exactly as they stand.
Tasks 1–4 additionally must not touch `src/model/state.ts`, `src/styles.css`
or any file under `src/ui/` except `format.ts`: those are Tasks 5 and 6's,
and the documents are Task 7's.

## Verification of this plan

Every task below was applied in order, **exactly as its text says**, to a fresh
scratch copy of `feat/bpm-key` `4d7c981` (`git archive`, so nothing uncommitted
was in it). After every task `yarn typecheck`, `yarn lint`, `yarn test`,
`yarn build` and `npx prettier --check "src/**/*.{ts,tsx,css}"` were run, and
all five passed every time. The application was mechanical: every BEFORE block
had to appear **exactly once** in exactly one file, which is what proves the
anchors still fit HEAD, and `prettier --check` — never `yarn format`, which
would silently rewrite a block that was wrong — is what proves every code block
here is already Prettier output.

Each "run it to verify it fails" state was reproduced separately by applying
that cycle's test files without their implementation, so **every quoted failure,
every count and every `file(line, col)` coordinate below is captured output**,
not an estimate.

The suite, measured at each gate (bold at a task boundary):

**271 (28 files)** → 275 (28) → 292 (29) → **293 (29)** → 309 (31) → **339
(33)** → 355 (34) → **370 (35)** → 371 (36) → **385 (36)** → **385 (36)** →
**387 (36)** → **387 (36)**

Tasks 1 to 4 add **114 tests in 8 new files**; Task 5 adds **none** (screens and
`state.ts` have no unit tests in this project, spec §7); Task 6 adds **2**, both
in `src/ui/format.test.ts`; Task 7 adds none. The per-file counts — 16 in
`reach.test.ts`, 6 in `jsonp.test.ts`, 10 in `musicbrainz.test.ts`, 16 in
`wikidata.test.ts`, 14 in `deezer.test.ts`, 16 in `listenbrainz.test.ts`, 15 in
`wikipedia.test.ts`, 15 in `reachRun.test.ts`, plus 4 in `repo.test.ts`
(12 → 16), 1 in `aggregate.test.ts` (16 → 17) and 3 in `format.test.ts`
(6 → 7 → 9) — do not age, and neither do the deltas. **The absolute totals are
the one thing here that ages**: this branch is under active work, and a commit
landing elsewhere in the suite shifts every one of them by whatever it adds. It
happened twice while this plan was being assembled — `6fafc1c` and then
`4d7c981` moved the whole chain, the second by exactly 1. If a total is off by a
constant, check `git log` before touching a test.

`yarn build` was measured too. No task before Task 5 adds a bundled entry point,
so the module count stays at **70** all the way through Task 4 and the only
growth is `compactCount`, which `format.ts` already exports into the bundle:
`index-*.js` goes from **98.23 kB (32.69 kB gzipped)** at HEAD to **98.69 kB
(32.78 kB gzipped)**, with `index-*.css` at 7.31 kB and both worker chunks
untouched. **Task 5 is the first import of `reachRun.ts` from the app**, and the
five clients plus the JSONP transport enter the bundle there: **78 modules** and
**117.33 kB (38.01 kB gzipped)**. Task 6 adds the new view and §6's two rules:
**80 modules**, **123.22 kB (39.87 kB gzipped)** and a 7.52 kB stylesheet
(2.09 kB gzipped). No new worker chunk appears at any point — nothing in this
feature runs in a worker.

---
### Task 1: `DB_VERSION` 3, the two reach stores, and the pure reach helpers

**Files:**

- Create:
  - `src/model/reach.ts`
- Modify:
  - `src/db/schema.ts` (`DB_VERSION`; the three unions `ResolveStatus`,
    `ReachSource`, `ReachStatus`; `ArtistIdentityRow`; `ArtistReachRow`;
    `reachKey`; the `AllRows` interface; the `DjDb` interface)
  - `src/db/repo.ts` (the type import list; the `upgrade` callback inside
    `openDb`; `getAllRows`; two new functions inserted just above `getMeta`)
  - `src/model/aggregate.ts` (the type import list; the `Model` interface; the
    object literal `buildModel` returns)
  - `src/ui/format.ts` (`compactCount`, inserted just above `formatBpm`)
- Test:
  - `src/model/reach.test.ts` (new, 16 tests)
  - `src/db/repo.test.ts` (12 -> 16 tests: two fixtures, a generalised
    `openAt`/`putLegacyRow`, `V2_STORES`, a new `describe` block and the
    v2 -> v3 migration test)
  - `src/model/aggregate.test.ts` (16 -> 17 tests; its `AllRows` fixture and
    **both** of its inline `buildModel({ … })` literals gain the two new keys)
  - `src/ui/format.test.ts` (6 -> 7 tests)
  - `src/model/features.test.ts` and `src/features/lookup.test.ts` — their
    `AllRows` literals only, no new test
- Unchanged, do not touch: `wipeDb`, `replacePlaylist`, `deletePlaylists`,
  `putTopItems`, `replacePlays`, `putFeatures`, `getFeatures`, `getMeta`,
  `putMeta`, `getPlaylists` keep their current bodies; `src/model/state.ts`
  needs no edit, because `loadFromDb` already calls
  `buildModel(await getAllRows())`; `src/sync/runner.test.ts` and
  `src/history/importer.test.ts` reach rows through `getAllRows()` and compile
  untouched.

**Interfaces:**

- Consumes (existing code, exactly as it stands at `feat/bpm-key` `4d7c981`):
  - `src/db/schema.ts`: `DB_NAME = 'spotify-dj'`, `DB_VERSION = 2`,
    `interface AllRows { playlists; tracks; entries; topItems; plays; features }`,
    `interface DjDb extends DBSchema`, `PlaylistRow`, `TrackRow`, `ArtistRef`,
    `EntryRow`, `TopItemsRow`, `PlayRow`, `FeatureRow`, `MetaRow`,
    `topKey(type, period)`
  - `src/db/repo.ts`: `openDb(): Promise<IDBPDatabase<DjDb>>`, `closeDb()`,
    `wipeDb(timeoutMs?)`, `getAllRows(): Promise<AllRows>`,
    `putFeatures(rows: FeatureRow[]): Promise<void>`,
    `getFeatures(): Promise<FeatureRow[]>`,
    `getMeta<T>(name): Promise<T | undefined>`, `putMeta(name, value)`
  - `src/model/aggregate.ts`: `interface Model`, `interface ArtistAgg { key;
    id: string | null; name; trackKeys: Set<string>; playlistIds: Set<string> }`,
    `buildModel(rows: AllRows): Model`,
    `playsFor(model, track): PlaysInfo | null`, `artistKey(a: ArtistRef)`
  - `src/ui/format.ts`: `plural`, `formatDate`, `formatBpm`, `artistUrl`
  - `idb` 8: `openDB`, `deleteDB`, `type IDBPDatabase`, `type DBSchema`
  - The fixtures already in the touched test files: `playlist(id, snapshotId?)`,
    `track(key)`, `entries(playlistId, keys)`, `feature(trackId, over?)`,
    `V1_STORES` in `src/db/repo.test.ts`; `track(key, artists?, over?)`,
    `playlist(id, name?)`, `const rows: AllRows`, `const model` in
    `src/model/aggregate.test.ts`
- Produces — **Tasks 2, 3 and 4 import every one of these by these exact
  names**:
  - `src/db/schema.ts`:
    - `export const DB_VERSION = 3`
    - `export type ResolveStatus = 'unchecked' | 'ok' | 'notFound' | 'retryLater'`
    - `export type ReachSource = 'listenbrainz' | 'deezer' | 'wikipedia'`
    - `export type ReachStatus = 'ok' | 'notFound' | 'retryLater'`
    - `export interface ArtistIdentityRow { artistId: string; name: string;
      mbid: string | null; mbidStatus: ResolveStatus; qid: string | null;
      qidStatus: ResolveStatus; qidCheckedAt: number | null; sitelinks: number
      | null; wikiTitles: { en: string | null; fr: string | null };
      deezerArtistId: number | null; deezerName: string | null; deezerStatus:
      ResolveStatus; resolvedAt: number; retryAfter: number | null }`
    - `export interface ArtistReachRow { key: string; artistId: string; source:
      ReachSource; status: ReachStatus; value: number | null; extra?: {
      listens?: number; en?: number; fr?: number; months?: number }; fetchedAt:
      number; retryAfter: number | null; sourceUrl: string }`
    - `export function reachKey(artistId: string, source: ReachSource): string`
      — the `artistReach` key path, `` `${artistId}|${source}` ``
    - `AllRows.artistIdentity: ArtistIdentityRow[]` and
      `AllRows.artistReach: ArtistReachRow[]` — **note the store-shaped names**;
      the `Model` maps below are called `identities` and `reach` instead
    - `DjDb.artistIdentity: { key: string; value: ArtistIdentityRow }` and
      `DjDb.artistReach: { key: string; value: ArtistReachRow }`
  - `src/db/repo.ts`:
    - `export function putIdentities(rows: ArtistIdentityRow[]): Promise<void>`
      (one transaction, one `put` per row, a no-op on an empty array)
    - `export function putReach(rows: ArtistReachRow[]): Promise<void>`
    - `getAllRows()` now reads eight stores in its one transaction
  - `src/model/aggregate.ts`:
    - `Model.identities: Map<string, ArtistIdentityRow>` (keyed by `artistId`)
    - `Model.reach: Map<string, ArtistReachRow>` (keyed by the row's own
      composite `key`)
  - `src/model/reach.ts`:
    - `export const WELL_KNOWN_MIN_SITELINKS = 1`
    - `export interface Reach { listenbrainz: ArtistReachRow | undefined;
      deezer: ArtistReachRow | undefined; wikipedia: ArtistReachRow | undefined }`
    - `export interface ReachCoverage { artists: number; covered: number;
      resolved: number; listenbrainz: number; deezer: number; wikipedia: number;
      wellKnown: number }` — **Task 4's `ArtistReachSummary` extends it**
    - `export function reachFor(model: Model, artistId: string): Reach`
    - `export function isWellKnown(identity: ArtistIdentityRow | undefined): boolean`
    - `export function hasHistory(m: Model): boolean`
    - `export type ReachSort = 'plays' | 'listeners' | 'fans'`
    - `export type ReachGroup = 'radar' | 'unknown' | 'known'`
    - `export interface UnderRadarRow { agg: ArtistAgg; artistId: string;
      group: ReachGroup; rank: number; tracks: number; playlists: number;
      plays: number; listeners: number | null; fans: number | null; views:
      number | null; sitelinks: number | null }`
    - `export function rankUnderTheRadar(model: Model, sort: ReachSort): UnderRadarRow[]`
    - `export function reachCoverage(m: Model): ReachCoverage`
  - `src/ui/format.ts`:
    - `export function compactCount(n: number): string`
- Obligations this task puts on later tasks, so nothing is defined twice:
  - **Task 4 declares `ARTIST_REACH_SUMMARY_META`, `ArtistReachSummary` and
    `ReachStep` in `src/features/reachRun.ts`** (spec §2), and
    `ArtistReachSummary extends ReachCoverage` from here. `src/db/` must not
    import `src/features/`, which is why the shared field list lives in
    `model/reach.ts` (decisions 1 and 2).
  - **Task 5 adds `export { reachCoverage, type ReachCoverage } from './reach';`
    to `src/model/state.ts`**, so §5.5's and §5.3's import path is exactly what
    the spec says (decisions 3 and 27).
  - **Task 4 owns `ReachCandidate` and `reachCandidates`** (spec §4.1). They
    need `candidateIsrcs` from `src/features/deezer.ts`, and no pure core under
    `src/model/` imports `src/features/` today. This is a decision, not an
    omission.
  - **Task 6 must not re-add `compactCount`** (decision 18).
  - **There is no single-row `putIdentity`, and no `getIdentities`/`getReach`**
    (decisions 19 and 20). Tests read rows back through `getAllRows()`.
  - The reach constants of spec §4.5 belong to Task 4 and are **not** declared
    here; `REACH_REQUEST_TIMEOUT_MS` is Task 2's, in `src/util/retry.ts`.

**Notes:**

- **`ArtistIdentityRow` carries a ninth field the spec does not list,
  `qidCheckedAt`** (decision 5). It is written only by Task 4's Wikidata phase,
  and it is what keeps §3.2's ninety-day sitelink refresh reachable for an
  artist whose MBID or Deezer id sits at `notFound`. Do not "simplify" it back
  onto `resolvedAt`.
- **One definition of "this source gave us a number".** Spec §2 calls
  `reachFor` "three map reads", but §7 requires it to ignore a
  `notFound`/`retryLater` row, and §7 wins. The private `withNumber` helper is
  that single predicate — `status === 'ok' && value !== null` — and `reachFor`,
  the group test inside `rankUnderTheRadar` and `reachCoverage` all go through
  it, so a row line, a group heading and the Settings coverage line can never
  disagree.
- **`reachCoverage` scopes every count to the candidates** (decision 16), which
  makes §2's two invariants — `covered <= artists` and `wellKnown >= wikipedia`
  — hold by construction. Both are asserted in the tests.
- **`compareAscNullLast` is a comparison, never a subtraction.**
  `(a ?? Infinity) - (b ?? Infinity)` is `NaN` when both are null, which
  `Array.prototype.sort` treats as "equal" only by accident;
  `src/model/aggregate.ts` already documents the same trap on `compareRank`.
- **The `artistId` tie-break compares code units, not locale.** `compareName`
  ends with `a.artistId < b.artistId ? -1 : …` rather than `localeCompare`,
  even though the line above it uses `localeCompare` on the artist's name: spec
  §2 asks for "`artistId` ascending", and a Spotify id is an opaque base-62
  token, not text a locale has an opinion about. What the chain needs from this
  last step is only that it be total, so the list never reshuffles between
  renders.
- **The "plays" fallback is per model, not per artist** (spec §2): when
  `hasHistory(model)` is false the sort key is `tracks` and the tie-break chain
  loses its first step. Because `hasHistory` false implies every `plays` is 0,
  the two branches agree on the resulting order; the branch exists so the code
  says which quantity it is sorting on, which is what §2 argues about.
- **`hasHistory(m)` reads `m.plays.length`, the raw array** — not `playsById`
  or `playsByName`. `buildModel` deliberately keeps rows with no credited play,
  so a library of nothing but sub-30-second plays still counts as "history has
  been imported". The test pins exactly that case.
- **`rankUnderTheRadar`'s memo holds one entry**, keyed on the `Model` object
  identity *and* the `ReachSort`, per spec §2. A test that asked for `plays`,
  then `listeners`, then `plays` again and expected the first array back would
  fail by design; the memo test asks for the same pair twice, then changes the
  sort, then changes the model.
- **`reachKey(artistId, source)` is new**, on the `topKey(type, period)`
  precedent in the same file (decision 17).
- **`putIdentities([])` and `putReach([])` resolve without opening a
  transaction**, like `putFeatures([])`: the run writes per phase and a phase
  can end with nothing to write.
- **The existing v1 migration test now covers v1 -> v3 and still passes
  unchanged** (decision 23). Its helpers are generalised — `openV1()`/
  `putV1Playlist()` become `openAt(version, stores)`/`putLegacyRow(db, store,
  row)` — so the new v2 -> v3 test can seed three stores without a second copy
  of the raw-IndexedDB boilerplate.
- **The guarded `upgrade` is what the migration test proves.** Reverting one
  `if (!db.objectStoreNames.contains(...))` makes the version 3 upgrade
  re-create a store that already exists, and the test fails with an
  `AbortError`.
- **`compactCount`'s two locale-dependent cases are compared against
  `toLocaleString()`**, not against the literal `'9,999'`, the discipline the
  existing `plural` test already uses.

- [ ] **Step 1: Write the failing DB-layer test**

Five files. `src/db/repo.test.ts` takes five edits, and the **five** `AllRows`
literals in the suite gain the two new keys so the whole project still
type-checks at the end of this cycle. Three of those five are in
`src/model/aggregate.test.ts` and two of them end in byte-identical text, so
1f names the enclosing test for each.

**1a.** In `src/db/repo.test.ts`, the three import statements that follow
`import { beforeEach, describe, expect, it } from 'vitest';`. Replace:

```ts
import {
  deletePlaylists,
  getAllRows,
  getFeatures,
  getMeta,
  getPlaylists,
  openDb,
  putFeatures,
  putMeta,
  putTopItems,
  replacePlays,
  replacePlaylist,
  wipeDb,
} from './repo';
import { DB_NAME, DB_VERSION } from './schema';
import type { EntryRow, FeatureRow, PlaylistRow, TrackRow } from './schema';
```

with:

```ts
import {
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
  replacePlays,
  replacePlaylist,
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

**1b.** Insert these two fixtures immediately above this exact line, the
comment that introduces `V1_STORES` (they land just after `feature()`):

```ts
/** The six stores of version 1, with the key paths that shipped. */
```

Insert:

```ts
function identity(
  artistId: string,
  over: Partial<ArtistIdentityRow> = {}
): ArtistIdentityRow {
  return {
    artistId,
    name: `Artist ${artistId}`,
    mbid: `mbid-${artistId}`,
    mbidStatus: 'ok',
    qid: 'Q1',
    qidStatus: 'ok',
    qidCheckedAt: 1000,
    sitelinks: 3,
    wikiTitles: { en: 'Some_Artist', fr: null },
    deezerArtistId: 42,
    deezerName: `Artist ${artistId}`,
    deezerStatus: 'ok',
    resolvedAt: 1000,
    retryAfter: null,
    ...over,
  };
}

function reachRow(
  artistId: string,
  source: ReachSource,
  over: Partial<ArtistReachRow> = {}
): ArtistReachRow {
  return {
    key: reachKey(artistId, source),
    artistId,
    source,
    status: 'ok',
    value: 5051,
    extra: { listens: 69448 },
    fetchedAt: 2000,
    retryAfter: null,
    sourceUrl: `https://example.test/${source}/${artistId}`,
    ...over,
  };
}
```

**1c.** `openV1()` and `putV1Playlist()` — everything between the `V1_STORES`
array and the `beforeEach` — become one pair that can open any version.
Replace:

```ts
function openV1(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      for (const [name, keyPath] of V1_STORES) {
        req.result.createObjectStore(name, { keyPath });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function putV1Playlist(db: IDBDatabase, row: PlaylistRow): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('playlists', 'readwrite');
    tx.objectStore('playlists').put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
```

with:

```ts
/** The seven stores of version 2: version 1 plus `features`. */
const V2_STORES: [string, string | string[]][] = [
  ...V1_STORES,
  ['features', 'trackId'],
];

/** Opens the database at an old version with exactly the stores it had. */
function openAt(
  version: number,
  stores: [string, string | string[]][]
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, version);
    req.onupgradeneeded = () => {
      for (const [name, keyPath] of stores) {
        req.result.createObjectStore(name, { keyPath });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function putLegacyRow(
  db: IDBDatabase,
  store: string,
  row: object
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
```

**1d.** Insert this whole `describe` block immediately above this exact line,
which puts it between the existing `describe('features', …)` block and
`describe('migration', …)`:

```ts
describe('migration', () => {
```

Insert:

```ts
describe('artist identity and reach', () => {
  it('round-trips identity rows and replaces them by artist id', async () => {
    await putIdentities([identity('a1'), identity('a2')]);
    await putIdentities([
      identity('a2', {
        mbid: null,
        mbidStatus: 'retryLater',
        retryAfter: 5000,
        resolvedAt: 3000,
      }),
    ]);
    const stored = (await getAllRows()).artistIdentity.sort((a, b) =>
      a.artistId.localeCompare(b.artistId)
    );
    expect(stored.map((r) => r.artistId)).toEqual(['a1', 'a2']);
    expect(stored[0]).toEqual(identity('a1'));
    expect(stored[1].mbidStatus).toBe('retryLater');
    expect(stored[1].retryAfter).toBe(5000);
    expect(stored[1].qidCheckedAt).toBe(1000);
  });

  it('round-trips reach rows keyed by artist and source', async () => {
    await putReach([
      reachRow('a1', 'listenbrainz'),
      reachRow('a1', 'deezer', { value: 13984, extra: undefined }),
    ]);
    await putReach([
      reachRow('a1', 'listenbrainz', { value: 5100, fetchedAt: 2500 }),
    ]);
    const stored = (await getAllRows()).artistReach.sort((a, b) =>
      a.key.localeCompare(b.key)
    );
    expect(stored.map((r) => r.key)).toEqual(['a1|deezer', 'a1|listenbrainz']);
    expect(stored[0].value).toBe(13984);
    expect(stored[1].value).toBe(5100);
    expect(stored[1].extra).toEqual({ listens: 69448 });
  });

  it('accepts empty batches', async () => {
    await expect(putIdentities([])).resolves.toBeUndefined();
    await expect(putReach([])).resolves.toBeUndefined();
    const rows = await getAllRows();
    expect(rows.artistIdentity).toEqual([]);
    expect(rows.artistReach).toEqual([]);
  });
});
```

**1e.** Inside `describe('migration', …)`, the existing v1 test switches to
the generalised helpers and a second test is appended beside it. Replace:

```ts
    const v1 = await openV1();
    await putV1Playlist(v1, playlist('p1'));
```

with:

```ts
    const v1 = await openAt(1, V1_STORES);
    await putLegacyRow(v1, 'playlists', playlist('p1'));
```

Then append the second test inside the same `describe`. Replace:

```ts
    await putFeatures([feature('t1')]);
    await expect(getFeatures()).resolves.toEqual([feature('t1')]);
  });
});
```

with:

```ts
    await putFeatures([feature('t1')]);
    await expect(getFeatures()).resolves.toEqual([feature('t1')]);
  });

  it('upgrades a version 2 database, keeping its rows and adding the two reach stores', async () => {
    const v2 = await openAt(2, V2_STORES);
    await putLegacyRow(v2, 'playlists', playlist('p1'));
    await putLegacyRow(v2, 'tracks', track('t1'));
    await putLegacyRow(v2, 'features', feature('t1'));
    v2.close();
    const rows = await getAllRows();
    expect(rows.playlists).toEqual([playlist('p1')]);
    expect(rows.tracks).toEqual([track('t1')]);
    expect(rows.features).toEqual([feature('t1')]);
    expect(rows.artistIdentity).toEqual([]);
    expect(rows.artistReach).toEqual([]);
    const db = await openDb();
    expect(db.version).toBe(DB_VERSION);
    expect(db.objectStoreNames.contains('artistIdentity')).toBe(true);
    expect(db.objectStoreNames.contains('artistReach')).toBe(true);
    await putIdentities([identity('a1')]);
    await putReach([reachRow('a1', 'listenbrainz')]);
    const after = await getAllRows();
    expect(after.artistIdentity).toEqual([identity('a1')]);
    expect(after.artistReach).toEqual([reachRow('a1', 'listenbrainz')]);
  });
});
```

**1f.** Add the two new keys to every `AllRows` literal in the suite, so the
project type-checks once `AllRows` gains its required fields. There are five,
and the two inline ones in `src/model/aggregate.test.ts` end in byte-identical
text, so each is anchored on the line that makes it unique.

**In `src/model/aggregate.test.ts`, the shared `const rows: AllRows` fixture.**
Replace its last four lines:

```ts
      updatedAt: 1,
    },
  ],
};
```

with:

```ts
      updatedAt: 1,
    },
  ],
  artistIdentity: [],
  artistReach: [],
};
```

**In the same file, the inline literal of the
`falls back to playlist position when no track is in a top list` test.**
Replace:

```ts
      topItems: [],
      plays: [],
      features: [],
    });
    expect(playlistRanking(untopped, 'p9').map((r) => r.track.key)).toEqual([
```

with:

```ts
      topItems: [],
      plays: [],
      features: [],
      artistIdentity: [],
      artistReach: [],
    });
    expect(playlistRanking(untopped, 'p9').map((r) => r.track.key)).toEqual([
```

**In the same file again, the inline literal of the
`keeps the tapped copy when the same track sits at two positions` test.**
Replace:

```ts
      topItems: [],
      plays: [],
      features: [],
    });
    const rows = playlistRanking(twice, 'p9');
```

with:

```ts
      topItems: [],
      plays: [],
      features: [],
      artistIdentity: [],
      artistReach: [],
    });
    const rows = playlistRanking(twice, 'p9');
```

**In `src/model/features.test.ts`, the `const rows: AllRows` of the `featureFor`
test.** Replace:

```ts
      features: [row({ reccobeats: recco() })],
    };
```

with:

```ts
      features: [row({ reccobeats: recco() })],
      artistIdentity: [],
      artistReach: [],
    };
```

**In `src/features/lookup.test.ts`, inside `modelOf`.** Replace:

```ts
    plays,
    features: [],
  });
```

with:

```ts
    plays,
    features: [],
    artistIdentity: [],
    artistReach: [],
  });
```

- [ ] **Step 2: Run the DB-layer test to verify it fails**

Run: `yarn test src/db/repo.test.ts`

Expected: FAIL, 4 of 16 tests, with three distinct errors —

```
 ❯ src/db/repo.test.ts (16 tests | 4 failed) 79ms
   ❯ artist identity and reach (3)
     × round-trips identity rows and replaces them by artist id 2ms
     × round-trips reach rows keyed by artist and source 0ms
     × accepts empty batches 0ms
   ❯ migration (2)
     × upgrades a version 2 database, keeping its rows and adding the two reach stores 2ms

 FAIL  src/db/repo.test.ts > artist identity and reach > round-trips identity rows and replaces them by artist id
TypeError: putIdentities is not a function
 ❯ src/db/repo.test.ts:307:11

 FAIL  src/db/repo.test.ts > artist identity and reach > round-trips reach rows keyed by artist and source
TypeError: reachKey is not a function
 ❯ reachRow src/db/repo.test.ts:105:10
 ❯ src/db/repo.test.ts:328:7

 FAIL  src/db/repo.test.ts > artist identity and reach > accepts empty batches
TypeError: putIdentities is not a function
 ❯ src/db/repo.test.ts:344:18

 FAIL  src/db/repo.test.ts > migration > upgrades a version 2 database, keeping its rows and adding the two reach stores
AssertionError: expected undefined to deeply equal []

- Expected:
[]

+ Received:
undefined

 ❯ src/db/repo.test.ts:377:33

 Test Files  1 failed (1)
      Tests  4 failed | 12 passed (16)
```

Run: `yarn typecheck`

Expected: `error Command failed with exit code 2`, 27 errors naming the missing
pieces — the five `AllRows` literals now carry keys `AllRows` does not declare,
which Step 3 fixes. Do **not** "fix" it by deleting those keys:

```
src/db/repo.test.ts(11,3): error TS2305: Module '"./repo"' has no exported member 'putIdentities'.
src/db/repo.test.ts(13,3): error TS2305: Module '"./repo"' has no exported member 'putReach'.
src/db/repo.test.ts(19,31): error TS2305: Module '"./schema"' has no exported member 'reachKey'.
src/db/repo.test.ts(21,3): error TS2305: Module '"./schema"' has no exported member 'ArtistIdentityRow'.
src/db/repo.test.ts(22,3): error TS2305: Module '"./schema"' has no exported member 'ArtistReachRow'.
src/db/repo.test.ts(26,3): error TS2305: Module '"./schema"' has no exported member 'ReachSource'.
src/db/repo.test.ts(316,41): error TS2339: Property 'artistIdentity' does not exist on type 'AllRows'.
```

- [ ] **Step 3: Implement the schema and the repository**

**3a.** In `src/db/schema.ts`, the version constant. Replace:

```ts
export const DB_VERSION = 2;
```

with:

```ts
export const DB_VERSION = 3;
```

**3b.** Insert the whole reach block immediately above this exact line, which
puts it after `FeatureRow`:

```ts
export interface MetaRow {
```

Insert:

```ts
/** How far a per-artist identity step has got. 'unchecked' is the initial state. */
export type ResolveStatus = 'unchecked' | 'ok' | 'notFound' | 'retryLater';

/** The three sources that produce a stored number, i.e. `ArtistReachRow.source`. */
export type ReachSource = 'listenbrainz' | 'deezer' | 'wikipedia';

export type ReachStatus = 'ok' | 'notFound' | 'retryLater';

/** Store `artistIdentity`, keyPath 'artistId'. */
export interface ArtistIdentityRow {
  /** Spotify artist id; the only key any lookup starts from. */
  artistId: string;
  /** Spotify's name, kept so a run can verify what a source echoes back. */
  name: string;
  mbid: string | null;
  mbidStatus: ResolveStatus;
  qid: string | null;
  qidStatus: ResolveStatus;
  /**
   * When Wikidata last answered about this artist, or null if it never has.
   * The QID refresh reads this clock and not `resolvedAt`: one row carries
   * three steps, a `notFound` MBID or Deezer id is rewritten every thirty
   * days, and every write bumps `resolvedAt` — so the ninety-day sitelink
   * refresh would never come due.
   */
  qidCheckedAt: number | null;
  /** Wikidata `wikibase:sitelinks`, all languages; null until Wikidata answered. */
  sitelinks: number | null;
  /** Article path segments exactly as the sitelink spells them, or null. */
  wikiTitles: { en: string | null; fr: string | null };
  deezerArtistId: number | null;
  /** The name Deezer echoed, kept as the record of what the check accepted. */
  deezerName: string | null;
  deezerStatus: ResolveStatus;
  /** When the row was last written; the clock the MBID and Deezer steps read. */
  resolvedAt: number;
  /** Epoch ms before which a 'retryLater' step must not be asked again. */
  retryAfter: number | null;
}

/** Store `artistReach`, keyPath 'key' = `${artistId}|${source}`. */
export interface ArtistReachRow {
  key: string;
  artistId: string;
  source: ReachSource;
  status: ReachStatus;
  /**
   * listenbrainz: total_user_count. deezer: nb_fan.
   * wikipedia: en + fr views over the last 12 complete months.
   * null unless status is 'ok'.
   */
  value: number | null;
  /**
   * listenbrainz fills `listens` (total_listen_count), kept so a later version
   * can show listens per listener without re-fetching a source paced at one
   * request per second; wikipedia fills `en`, `fr` and `months`; deezer fills
   * nothing. All optional so a source can gain a field without a version bump.
   */
  extra?: { listens?: number; en?: number; fr?: number; months?: number };
  fetchedAt: number;
  /** Epoch ms before which a 'retryLater' row must not be asked again. */
  retryAfter: number | null;
  /** The exact URL the number came from, kept as provenance. */
  sourceUrl: string;
}

/** The `artistReach` key path: one row per artist per source. */
export function reachKey(artistId: string, source: ReachSource): string {
  return `${artistId}|${source}`;
}
```

**3c.** The `AllRows` interface. Replace:

```ts
export interface AllRows {
  playlists: PlaylistRow[];
  tracks: TrackRow[];
  entries: EntryRow[];
  topItems: TopItemsRow[];
  plays: PlayRow[];
  features: FeatureRow[];
}
```

with:

```ts
export interface AllRows {
  playlists: PlaylistRow[];
  tracks: TrackRow[];
  entries: EntryRow[];
  topItems: TopItemsRow[];
  plays: PlayRow[];
  features: FeatureRow[];
  artistIdentity: ArtistIdentityRow[];
  artistReach: ArtistReachRow[];
}
```

**3d.** The `DjDb` interface, the last declaration in the file. Replace:

```ts
export interface DjDb extends DBSchema {
  playlists: { key: string; value: PlaylistRow };
  tracks: { key: string; value: TrackRow };
  entries: { key: [string, number]; value: EntryRow };
  topItems: { key: string; value: TopItemsRow };
  plays: { key: string; value: PlayRow };
  features: { key: string; value: FeatureRow };
  meta: { key: string; value: MetaRow };
}
```

with:

```ts
export interface DjDb extends DBSchema {
  playlists: { key: string; value: PlaylistRow };
  tracks: { key: string; value: TrackRow };
  entries: { key: [string, number]; value: EntryRow };
  topItems: { key: string; value: TopItemsRow };
  plays: { key: string; value: PlayRow };
  features: { key: string; value: FeatureRow };
  artistIdentity: { key: string; value: ArtistIdentityRow };
  artistReach: { key: string; value: ArtistReachRow };
  meta: { key: string; value: MetaRow };
}
```

**3e.** In `src/db/repo.ts`, two type imports join the existing
`from './schema'` list, right after `type AllRows,`. Replace:

```ts
  type AllRows,
  type DjDb,
```

with:

```ts
  type AllRows,
  type ArtistIdentityRow,
  type ArtistReachRow,
  type DjDb,
```

**3f.** The `upgrade` callback inside `openDb`. Replace:

```ts
    upgrade(db) {
      // Only what is missing: a version 1 database keeps every row it holds
      // and gains `features`.
      if (!db.objectStoreNames.contains('playlists'))
        db.createObjectStore('playlists', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('tracks'))
        db.createObjectStore('tracks', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('entries'))
        db.createObjectStore('entries', {
          keyPath: ['playlistId', 'position'],
        });
      if (!db.objectStoreNames.contains('topItems'))
        db.createObjectStore('topItems', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('plays'))
        db.createObjectStore('plays', { keyPath: 'trackId' });
      if (!db.objectStoreNames.contains('features'))
        db.createObjectStore('features', { keyPath: 'trackId' });
      if (!db.objectStoreNames.contains('meta'))
        db.createObjectStore('meta', { keyPath: 'name' });
    },
```

with:

```ts
    upgrade(db) {
      // Only what is missing: a version 1 database keeps every row it holds
      // and gains `features`; a version 2 database keeps every playlist,
      // track, play and feature row and gains the two reach stores.
      if (!db.objectStoreNames.contains('playlists'))
        db.createObjectStore('playlists', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('tracks'))
        db.createObjectStore('tracks', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('entries'))
        db.createObjectStore('entries', {
          keyPath: ['playlistId', 'position'],
        });
      if (!db.objectStoreNames.contains('topItems'))
        db.createObjectStore('topItems', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('plays'))
        db.createObjectStore('plays', { keyPath: 'trackId' });
      if (!db.objectStoreNames.contains('features'))
        db.createObjectStore('features', { keyPath: 'trackId' });
      if (!db.objectStoreNames.contains('artistIdentity'))
        db.createObjectStore('artistIdentity', { keyPath: 'artistId' });
      if (!db.objectStoreNames.contains('artistReach'))
        db.createObjectStore('artistReach', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('meta'))
        db.createObjectStore('meta', { keyPath: 'name' });
    },
```

**3g.** `getAllRows` reads eight stores in its one transaction. Replace:

```ts
export async function getAllRows(): Promise<AllRows> {
  const db = await openDb();
  const tx = db.transaction([
    'playlists',
    'tracks',
    'entries',
    'topItems',
    'plays',
    'features',
  ]);
  const [playlists, tracks, entries, topItems, plays, features] =
    await Promise.all([
      tx.objectStore('playlists').getAll(),
      tx.objectStore('tracks').getAll(),
      tx.objectStore('entries').getAll(),
      tx.objectStore('topItems').getAll(),
      tx.objectStore('plays').getAll(),
      tx.objectStore('features').getAll(),
    ]);
  await tx.done;
  return { playlists, tracks, entries, topItems, plays, features };
}
```

with:

```ts
export async function getAllRows(): Promise<AllRows> {
  const db = await openDb();
  const tx = db.transaction([
    'playlists',
    'tracks',
    'entries',
    'topItems',
    'plays',
    'features',
    'artistIdentity',
    'artistReach',
  ]);
  const [
    playlists,
    tracks,
    entries,
    topItems,
    plays,
    features,
    artistIdentity,
    artistReach,
  ] = await Promise.all([
    tx.objectStore('playlists').getAll(),
    tx.objectStore('tracks').getAll(),
    tx.objectStore('entries').getAll(),
    tx.objectStore('topItems').getAll(),
    tx.objectStore('plays').getAll(),
    tx.objectStore('features').getAll(),
    tx.objectStore('artistIdentity').getAll(),
    tx.objectStore('artistReach').getAll(),
  ]);
  await tx.done;
  return {
    playlists,
    tracks,
    entries,
    topItems,
    plays,
    features,
    artistIdentity,
    artistReach,
  };
}
```

**3h.** Insert the two new functions immediately above this exact line, which
puts them between `getFeatures` and `getMeta`:

```ts
export async function getMeta<T>(name: string): Promise<T | undefined> {
```

Insert:

```ts
/**
 * Upserts a batch of identity rows; the reach run writes each row as it
 * resolves, so a one-element batch is the normal call.
 */
export async function putIdentities(rows: ArtistIdentityRow[]): Promise<void> {
  if (rows.length === 0) return;
  const db = await openDb();
  const tx = db.transaction('artistIdentity', 'readwrite');
  const store = tx.objectStore('artistIdentity');
  await Promise.all([...rows.map((row) => store.put(row)), tx.done]);
}

/** Upserts a batch of reach rows, keyed `${artistId}|${source}`. */
export async function putReach(rows: ArtistReachRow[]): Promise<void> {
  if (rows.length === 0) return;
  const db = await openDb();
  const tx = db.transaction('artistReach', 'readwrite');
  const store = tx.objectStore('artistReach');
  await Promise.all([...rows.map((row) => store.put(row)), tx.done]);
}
```

- [ ] **Step 4: Run the DB-layer test to verify it passes**

Run: `yarn test src/db/repo.test.ts`
Expected: PASS, `Test Files  1 passed (1)`, `Tests  16 passed (16)`.

Run: `yarn typecheck && yarn lint && yarn test`
Expected: all three pass; the suite is `Test Files  28 passed (28)`,
`Tests  275 passed (275)` — 271 in 28 files before this task, plus the four new
repository tests.

- [ ] **Step 5: Commit**

```bash
yarn format
git add src/db/schema.ts src/db/repo.ts src/db/repo.test.ts \
  src/model/aggregate.test.ts src/model/features.test.ts \
  src/features/lookup.test.ts
git commit -m "feat(db): DB_VERSION 3 with the artist identity and reach stores

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

- [ ] **Step 6: Write the failing model test**

Two files: one new suite, and one test appended to the existing one.

**6a.** `src/model/reach.test.ts` (new, complete):

```ts
import { describe, expect, it } from 'vitest';
import { reachKey } from '../db/schema';
import type {
  AllRows,
  ArtistIdentityRow,
  ArtistReachRow,
  ArtistRef,
  PlayRow,
  PlaylistRow,
  ReachSource,
  TrackRow,
} from '../db/schema';
import { buildModel, type Model } from './aggregate';
import {
  hasHistory,
  isWellKnown,
  rankUnderTheRadar,
  reachCoverage,
  reachFor,
} from './reach';

function playlist(id: string): PlaylistRow {
  return {
    id,
    name: id,
    snapshotId: 's',
    itemCount: 0,
    imageUrl: null,
    spotifyUrl: null,
    syncedAt: 1,
  };
}

function track(key: string, artists: ArtistRef[]): TrackRow {
  return {
    key,
    id: key,
    uri: `spotify:track:${key}`,
    name: `Song ${key}`,
    artists,
    album: 'Album',
    durationMs: 1000,
    isrc: null,
    spotifyUrl: null,
    isLocal: false,
  };
}

/** trackName and artistName stay null so only the id path credits plays. */
function play(trackId: string, plays: number): PlayRow {
  return {
    trackId,
    plays,
    msPlayed: plays * 200_000,
    firstTs: '2026-01-01T12:00:00Z',
    lastTs: '2026-08-01T12:00:00Z',
    trackName: null,
    artistName: null,
  };
}

/** An untouched identity row: every step 'unchecked', nothing resolved. */
function identity(
  artistId: string,
  over: Partial<ArtistIdentityRow> = {}
): ArtistIdentityRow {
  return {
    artistId,
    name: `Artist ${artistId}`,
    mbid: null,
    mbidStatus: 'unchecked',
    qid: null,
    qidStatus: 'unchecked',
    qidCheckedAt: null,
    sitelinks: null,
    wikiTitles: { en: null, fr: null },
    deezerArtistId: null,
    deezerName: null,
    deezerStatus: 'unchecked',
    resolvedAt: 0,
    retryAfter: null,
    ...over,
  };
}

function reachRow(
  artistId: string,
  source: ReachSource,
  value: number | null,
  over: Partial<ArtistReachRow> = {}
): ArtistReachRow {
  return {
    key: reachKey(artistId, source),
    artistId,
    source,
    status: 'ok',
    value,
    fetchedAt: 2000,
    retryAfter: null,
    sourceUrl: `https://example.test/${source}/${artistId}`,
    ...over,
  };
}

function modelOf(over: Partial<AllRows>): Model {
  return buildModel({
    playlists: [],
    tracks: [],
    entries: [],
    topItems: [],
    plays: [],
    features: [],
    artistIdentity: [],
    artistReach: [],
    ...over,
  });
}

interface ArtistSpec {
  id: string | null;
  name: string;
  /** Tracks credited to this artist; must be >= `playlists`. */
  tracks?: number;
  playlists?: number;
  /** Credited to the artist's first track only, so the sum is this number. */
  plays?: number;
  listeners?: number;
  fans?: number;
  views?: number;
  identity?: Partial<ArtistIdentityRow>;
}

/** Builds a library where each artist has exactly the shape the spec asks. */
function library(specs: ArtistSpec[]): Partial<AllRows> {
  const playlistIds = new Set<string>();
  const tracks: TrackRow[] = [];
  const entries: AllRows['entries'] = [];
  const plays: PlayRow[] = [];
  const artistIdentity: ArtistIdentityRow[] = [];
  const artistReach: ArtistReachRow[] = [];
  specs.forEach((spec, index) => {
    const ref: ArtistRef = { id: spec.id, name: spec.name };
    const trackCount = spec.tracks ?? 1;
    const playlistCount = spec.playlists ?? 1;
    for (let t = 0; t < trackCount; t += 1) {
      const key = `t${index}-${t}`;
      const playlistId = `p${t % playlistCount}`;
      playlistIds.add(playlistId);
      tracks.push(track(key, [ref]));
      entries.push({
        playlistId,
        position: entries.length,
        trackKey: key,
        addedAt: null,
      });
    }
    if (spec.plays !== undefined) plays.push(play(`t${index}-0`, spec.plays));
    if (spec.id === null) return;
    if (spec.identity) artistIdentity.push(identity(spec.id, spec.identity));
    if (spec.listeners !== undefined)
      artistReach.push(reachRow(spec.id, 'listenbrainz', spec.listeners));
    if (spec.fans !== undefined)
      artistReach.push(reachRow(spec.id, 'deezer', spec.fans));
    if (spec.views !== undefined)
      artistReach.push(reachRow(spec.id, 'wikipedia', spec.views));
  });
  return {
    playlists: [...playlistIds].map(playlist),
    tracks,
    entries,
    plays,
    artistIdentity,
    artistReach,
  };
}

describe('reachFor', () => {
  it('returns the three sources and ignores a row that carries no number', () => {
    const model = modelOf({
      artistReach: [
        reachRow('a1', 'listenbrainz', 5051),
        reachRow('a1', 'deezer', null, { status: 'notFound' }),
        reachRow('a1', 'wikipedia', null, {
          status: 'retryLater',
          retryAfter: 9000,
        }),
        reachRow('a2', 'deezer', 703),
      ],
    });
    const one = reachFor(model, 'a1');
    expect(one.listenbrainz?.value).toBe(5051);
    expect(one.deezer).toBeUndefined();
    expect(one.wikipedia).toBeUndefined();
    expect(reachFor(model, 'a2').deezer?.value).toBe(703);
    const none = reachFor(model, 'nobody');
    expect([none.listenbrainz, none.deezer, none.wikipedia]).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('ignores an ok row whose value is null', () => {
    const model = modelOf({
      artistReach: [reachRow('a1', 'listenbrainz', null)],
    });
    expect(reachFor(model, 'a1').listenbrainz).toBeUndefined();
  });
});

describe('hasHistory', () => {
  it('is false with no imported rows and true with a zero-play row', () => {
    expect(hasHistory(modelOf({}))).toBe(false);
    expect(hasHistory(modelOf({ plays: [play('t1', 0)] }))).toBe(true);
  });
});

describe('isWellKnown', () => {
  it('is true only for an identity with at least one sitelink', () => {
    expect(isWellKnown(undefined)).toBe(false);
    expect(isWellKnown(identity('a1'))).toBe(false);
    expect(isWellKnown(identity('a1', { sitelinks: 0 }))).toBe(false);
    expect(isWellKnown(identity('a1', { sitelinks: 1 }))).toBe(true);
    expect(isWellKnown(identity('a1', { sitelinks: 19 }))).toBe(true);
  });

  it('reads the sitelink count alone, never the Wikipedia row', () => {
    const model = modelOf({
      artistIdentity: [identity('a1', { sitelinks: 1 })],
      artistReach: [reachRow('a1', 'wikipedia', null, { status: 'notFound' })],
    });
    expect(reachFor(model, 'a1').wikipedia).toBeUndefined();
    expect(isWellKnown(model.identities.get('a1'))).toBe(true);
  });
});

describe('rankUnderTheRadar groups', () => {
  const model = modelOf(
    library([
      { id: 'radar', name: 'Radar', listeners: 54 },
      { id: 'famous', name: 'Famous', identity: { sitelinks: 19 } },
      {
        id: 'views',
        name: 'Views Only',
        views: 4000,
        identity: { sitelinks: 0 },
      },
      { id: 'blank', name: 'Blank' },
      { id: null, name: 'Local Hero' },
    ])
  );

  it('groups radar, then unknown, then known, and numbers straight through', () => {
    const list = rankUnderTheRadar(model, 'plays');
    expect(list.map((r) => [r.artistId, r.group, r.rank])).toEqual([
      ['radar', 'radar', 1],
      ['blank', 'unknown', 2],
      ['views', 'unknown', 3],
      ['famous', 'known', 4],
    ]);
  });

  it('excludes an artist with no Spotify id', () => {
    expect(
      rankUnderTheRadar(model, 'plays').some((r) => r.agg.name === 'Local Hero')
    ).toBe(false);
  });

  it('carries the owner counts and the three numbers on every row', () => {
    const row = rankUnderTheRadar(model, 'plays')[0];
    expect(row).toMatchObject({
      artistId: 'radar',
      tracks: 1,
      playlists: 1,
      plays: 0,
      listeners: 54,
      fans: null,
      views: null,
      sitelinks: null,
    });
    const views = rankUnderTheRadar(model, 'plays')[2];
    expect(views.views).toBe(4000);
    expect(views.sitelinks).toBe(0);
  });
});

const TIES: ArtistSpec[] = [
  {
    id: 'a1',
    name: 'Same Name',
    tracks: 2,
    playlists: 1,
    plays: 5,
    listeners: 1,
  },
  {
    id: 'a2',
    name: 'Same Name',
    tracks: 2,
    playlists: 1,
    plays: 5,
    listeners: 2,
  },
  { id: 'b1', name: 'Beta', tracks: 2, playlists: 2, plays: 5, listeners: 3 },
  { id: 'c1', name: 'Gamma', tracks: 3, playlists: 1, plays: 5, listeners: 4 },
  { id: 'd1', name: 'Delta', tracks: 1, playlists: 1, plays: 9, listeners: 5 },
];

describe('rankUnderTheRadar sorts', () => {
  it('sorts by plays descending, then tracks, playlists, name and id', () => {
    const list = rankUnderTheRadar(modelOf(library(TIES)), 'plays');
    expect(list.map((r) => r.artistId)).toEqual(['d1', 'c1', 'b1', 'a1', 'a2']);
    expect(list.map((r) => r.plays)).toEqual([9, 5, 5, 5, 5]);
  });

  it('falls back to saved tracks for the whole model when no history is loaded', () => {
    const withoutPlays = TIES.map((spec) => {
      const copy = { ...spec };
      delete copy.plays;
      return copy;
    });
    const model = modelOf(library(withoutPlays));
    expect(hasHistory(model)).toBe(false);
    expect(rankUnderTheRadar(model, 'plays').map((r) => r.artistId)).toEqual([
      'c1',
      'b1',
      'a1',
      'a2',
      'd1',
    ]);
  });

  const NULLS: ArtistSpec[] = [
    { id: 'x1', name: 'X One', plays: 1, listeners: 500, fans: 10 },
    { id: 'x2', name: 'X Two', plays: 1, listeners: 50, fans: 20 },
    { id: 'x3', name: 'X Three', plays: 1, fans: 30 },
    { id: 'x4', name: 'X Four', plays: 1, listeners: 50, fans: 5 },
    { id: 'x5', name: 'X Five', plays: 1, listeners: 5 },
  ];

  it('sorts by listeners ascending with nulls last, breaking ties on fans', () => {
    const list = rankUnderTheRadar(modelOf(library(NULLS)), 'listeners');
    expect(list.map((r) => r.artistId)).toEqual(['x5', 'x4', 'x2', 'x1', 'x3']);
    expect(list.map((r) => r.listeners)).toEqual([5, 50, 50, 500, null]);
  });

  it('sorts by fans ascending with nulls last, breaking ties on listeners', () => {
    const list = rankUnderTheRadar(modelOf(library(NULLS)), 'fans');
    expect(list.map((r) => r.artistId)).toEqual(['x4', 'x1', 'x2', 'x3', 'x5']);
    expect(list.map((r) => r.fans)).toEqual([5, 10, 20, 30, null]);
  });
});

describe('rankUnderTheRadar memo', () => {
  it('returns the same array for the same model and sort, and a new one otherwise', () => {
    const model = modelOf(library(TIES));
    const plays = rankUnderTheRadar(model, 'plays');
    expect(rankUnderTheRadar(model, 'plays')).toBe(plays);
    const listeners = rankUnderTheRadar(model, 'listeners');
    expect(listeners).not.toBe(plays);
    expect(rankUnderTheRadar(model, 'listeners')).toBe(listeners);
    const rebuilt = modelOf(library(TIES));
    expect(rankUnderTheRadar(rebuilt, 'listeners')).not.toBe(listeners);
  });
});

describe('reachCoverage', () => {
  const model = modelOf(
    library([
      {
        id: 'a',
        name: 'A',
        listeners: 100,
        identity: {
          mbid: 'm-a',
          sitelinks: 4,
          wikiTitles: { en: 'A', fr: null },
        },
      },
      { id: 'b', name: 'B', fans: 200, identity: { mbid: 'm-b' } },
      {
        id: 'c',
        name: 'C',
        views: 300,
        identity: {
          mbidStatus: 'notFound',
          sitelinks: 1,
          wikiTitles: { en: null, fr: 'C_fr' },
        },
      },
      { id: 'd', name: 'D' },
      { id: null, name: 'Local Hero' },
    ])
  );

  it('counts the store over the candidates, with §2 definitions', () => {
    expect(reachCoverage(model)).toEqual({
      artists: 4,
      covered: 3,
      resolved: 2,
      listenbrainz: 1,
      deezer: 1,
      wikipedia: 2,
      wellKnown: 2,
    });
  });

  it('keeps the two invariants covered <= artists and wellKnown >= wikipedia', () => {
    const c = reachCoverage(model);
    expect(c.covered).toBeLessThanOrEqual(c.artists);
    expect(c.wellKnown).toBeGreaterThanOrEqual(c.wikipedia);
  });

  it('memoises on the model identity', () => {
    const first = reachCoverage(model);
    expect(reachCoverage(model)).toBe(first);
    expect(reachCoverage(modelOf({}))).not.toBe(first);
  });
});
```

**6b.** In `src/model/aggregate.test.ts`, insert this test immediately above
this exact line, which puts it inside `describe('buildModel', …)` after
`indexes the feature rows by track id`:

```ts
  it('keeps the raw play rows and maps track names to playlists', () => {
```

Insert:

```ts
  it('indexes identity rows by artist id and reach rows by their own key', () => {
    const built = buildModel({
      ...rows,
      artistIdentity: [
        {
          artistId: 'daft',
          name: 'Daft Punk',
          mbid: 'mb-daft',
          mbidStatus: 'ok',
          qid: null,
          qidStatus: 'unchecked',
          qidCheckedAt: null,
          sitelinks: null,
          wikiTitles: { en: null, fr: null },
          deezerArtistId: null,
          deezerName: null,
          deezerStatus: 'unchecked',
          resolvedAt: 5,
          retryAfter: null,
        },
      ],
      artistReach: [
        {
          key: 'daft|listenbrainz',
          artistId: 'daft',
          source: 'listenbrainz',
          status: 'ok',
          value: 5051,
          fetchedAt: 6,
          retryAfter: null,
          sourceUrl:
            'https://api.listenbrainz.org/1/stats/artist/mb-daft/listeners',
        },
        {
          key: 'daft|deezer',
          artistId: 'daft',
          source: 'deezer',
          status: 'notFound',
          value: null,
          fetchedAt: 6,
          retryAfter: null,
          sourceUrl: 'https://api.deezer.com/artist/1?output=jsonp',
        },
      ],
    });
    expect(built.identities.get('daft')?.mbid).toBe('mb-daft');
    expect(built.identities.size).toBe(1);
    expect(built.reach.get('daft|listenbrainz')?.value).toBe(5051);
    expect(built.reach.get('daft|deezer')?.status).toBe('notFound');
    expect(built.reach.size).toBe(2);
    // The shared fixture holds neither, so every other test sees empty maps.
    expect(model.identities.size + model.reach.size).toBe(0);
  });
```

- [ ] **Step 7: Run the model tests to verify they fail**

Run: `yarn test src/model/reach.test.ts`

Expected: `Test Files  1 failed (1)`, `Tests  no tests` — the module does not
exist, so nothing is collected:

```
 ❯ src/model/reach.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/model/reach.test.ts [ src/model/reach.test.ts ]
Error: Cannot find module './reach' imported from /…/src/model/reach.test.ts
 ❯ src/model/reach.test.ts:14:1
     12| } from '../db/schema';
     13| import { buildModel, type Model } from './aggregate';
     14| import {
       | ^
     15|   hasHistory,
     16|   isWellKnown,
```

Run: `yarn test src/model/aggregate.test.ts`

Expected: FAIL, 1 of 17 —

```
 ❯ src/model/aggregate.test.ts (17 tests | 1 failed) 9ms
   ❯ buildModel (6)
     × indexes identity rows by artist id and reach rows by their own key 2ms

 FAIL  src/model/aggregate.test.ts > buildModel > indexes identity rows by artist id and reach rows by their own key
TypeError: Cannot read properties of undefined (reading 'get')
 ❯ src/model/aggregate.test.ts:311:29
    309|       ],
    310|     });
    311|     expect(built.identities.get('daft')?.mbid).toBe('mb-daft');
       |                             ^
    312|     expect(built.identities.size).toBe(1);

 Test Files  1 failed (1)
      Tests  1 failed | 16 passed (17)
```

- [ ] **Step 8: Implement the model additions**

**8a.** In `src/model/aggregate.ts`, two type imports join the existing
`from '../db/schema'` list, right after `type AllRows,`. Replace:

```ts
  type AllRows,
  type ArtistRef,
```

with:

```ts
  type AllRows,
  type ArtistIdentityRow,
  type ArtistReachRow,
  type ArtistRef,
```

**8b.** In the same file, the two maps join the end of the `Model` interface.
Replace:

```ts
  /** BPM and key rows by Spotify track id; resolve them with featureFor. */
  features: Map<string, FeatureRow>;
}
```

with:

```ts
  /** BPM and key rows by Spotify track id; resolve them with featureFor. */
  features: Map<string, FeatureRow>;
  /** Artist reach identities by Spotify artist id. */
  identities: Map<string, ArtistIdentityRow>;
  /** Reach rows by their own composite key, `${artistId}|${source}`. */
  reach: Map<string, ArtistReachRow>;
}
```

**8c.** The object literal `buildModel` returns, at its end. Replace:

```ts
    features: new Map(rows.features.map((f) => [f.trackId, f])),
  };
```

with:

```ts
    features: new Map(rows.features.map((f) => [f.trackId, f])),
    identities: new Map(rows.artistIdentity.map((r) => [r.artistId, r])),
    reach: new Map(rows.artistReach.map((r) => [r.key, r])),
  };
```

**8d.** Create `src/model/reach.ts`:

```ts
import { reachKey } from '../db/schema';
import type { ArtistIdentityRow, ArtistReachRow } from '../db/schema';
import { playsFor, type ArtistAgg, type Model } from './aggregate';

/** One sitelink in any language is enough; `null` fails. */
export const WELL_KNOWN_MIN_SITELINKS = 1;

export interface Reach {
  listenbrainz: ArtistReachRow | undefined;
  deezer: ArtistReachRow | undefined;
  wikipedia: ArtistReachRow | undefined;
}

/**
 * What the store holds, over the candidates. `ArtistReachSummary` in
 * `src/features/reachRun.ts` extends this interface, so the stored record and
 * the live Settings line hold one identical field list.
 */
export interface ReachCoverage {
  /** Candidates: artists with a Spotify id in the owner's playlists. */
  artists: number;
  /** Candidates with at least one `ok` reach row in any source. */
  covered: number;
  /** Identities with an MBID (`mbid !== null`). */
  resolved: number;
  /** `artistReach` rows with status 'ok' for that source. */
  listenbrainz: number;
  deezer: number;
  /** Identities with at least one Wikipedia sitelink title. */
  wikipedia: number;
  /** Identities for which `isWellKnown` is true (`sitelinks >= 1`). */
  wellKnown: number;
}

/**
 * The one definition of "this source gave us a number", shared by the row
 * lines, the grouping and the coverage counts so they cannot disagree. A
 * `notFound` or `retryLater` row reads as unknown, never as a zero.
 */
function withNumber(
  row: ArtistReachRow | undefined
): ArtistReachRow | undefined {
  return row && row.status === 'ok' && row.value !== null ? row : undefined;
}

export function reachFor(model: Model, artistId: string): Reach {
  return {
    listenbrainz: withNumber(
      model.reach.get(reachKey(artistId, 'listenbrainz'))
    ),
    deezer: withNumber(model.reach.get(reachKey(artistId, 'deezer'))),
    wikipedia: withNumber(model.reach.get(reachKey(artistId, 'wikipedia'))),
  };
}

/**
 * The whole "well known" rule: the artist's Wikidata item carries at least
 * one Wikipedia article, in any language. `null` sitelinks fail and so does
 * 0; the view count and the number of languages never enter the test.
 */
export function isWellKnown(identity: ArtistIdentityRow | undefined): boolean {
  // `?? 0` collapses "no identity row" and "Wikidata has not answered" onto
  // the same answer as a real 0, which is what the rule says: no article.
  return (identity?.sitelinks ?? 0) >= WELL_KNOWN_MIN_SITELINKS;
}

/**
 * True once any history has been imported. `model.plays` is the raw array,
 * which keeps rows with no credited play, so a library of nothing but short
 * plays still counts as history.
 */
export function hasHistory(m: Model): boolean {
  return m.plays.length > 0;
}

export type ReachSort = 'plays' | 'listeners' | 'fans';
export type ReachGroup = 'radar' | 'unknown' | 'known';

export interface UnderRadarRow {
  agg: ArtistAgg;
  artistId: string;
  group: ReachGroup;
  rank: number;
  tracks: number;
  playlists: number;
  /** Sum of playsFor over the artist's tracks; 0 when no history is loaded. */
  plays: number;
  /** null means unknown, never zero. */
  listeners: number | null;
  fans: number | null;
  views: number | null;
  sitelinks: number | null;
}

const GROUP_ORDER: Record<ReachGroup, number> = {
  radar: 0,
  unknown: 1,
  known: 2,
};

/**
 * Ascending with `null` last: a missing number is not a small one. Written
 * as a comparison rather than `(a ?? Infinity) - (b ?? Infinity)`, which
 * gives NaN when both are null — the same trap compareRank documents in
 * aggregate.ts.
 */
function compareAscNullLast(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

/**
 * The tail every sort ends with, so the order is total and never reshuffles.
 * The id is compared by code unit rather than with `localeCompare`, because
 * spec §2 asks for `artistId` ascending and a Spotify id is an opaque base-62
 * token, not text a locale has an opinion about.
 */
function compareName(a: UnderRadarRow, b: UnderRadarRow): number {
  return (
    a.agg.name.localeCompare(b.agg.name) ||
    (a.artistId < b.artistId ? -1 : a.artistId > b.artistId ? 1 : 0)
  );
}

function comparePlays(
  a: UnderRadarRow,
  b: UnderRadarRow,
  history: boolean
): number {
  // The fallback is per model, not per artist: switching units row by row
  // would compare 12 plays against 12 tracks in one column.
  if (!history) {
    return (
      b.tracks - a.tracks || b.playlists - a.playlists || compareName(a, b)
    );
  }
  return (
    b.plays - a.plays ||
    b.tracks - a.tracks ||
    b.playlists - a.playlists ||
    compareName(a, b)
  );
}

function compareBySort(
  a: UnderRadarRow,
  b: UnderRadarRow,
  sort: ReachSort,
  history: boolean
): number {
  if (sort === 'listeners') {
    return (
      compareAscNullLast(a.listeners, b.listeners) ||
      compareAscNullLast(a.fans, b.fans) ||
      b.plays - a.plays ||
      compareName(a, b)
    );
  }
  if (sort === 'fans') {
    return (
      compareAscNullLast(a.fans, b.fans) ||
      compareAscNullLast(a.listeners, b.listeners) ||
      b.plays - a.plays ||
      compareName(a, b)
    );
  }
  return comparePlays(a, b, history);
}

function playsOf(model: Model, agg: ArtistAgg): number {
  let total = 0;
  for (const trackKey of agg.trackKeys) {
    const track = model.tracksByKey.get(trackKey);
    if (!track) continue;
    total += playsFor(model, track)?.plays ?? 0;
  }
  return total;
}

let rankedModel: Model | null = null;
let rankedSort: ReachSort | null = null;
let rankedRows: UnderRadarRow[] = [];

/**
 * One pass over `model.artists`, keeping only those with a Spotify id.
 * Memoised on the `Model` object identity and the sort, one entry: the model
 * changes only when loadFromDb rebuilds it, which is exactly when the ranking
 * must be recomputed, so a keystroke in the filter costs no re-sort.
 */
export function rankUnderTheRadar(
  model: Model,
  sort: ReachSort
): UnderRadarRow[] {
  if (rankedModel === model && rankedSort === sort) return rankedRows;
  const history = hasHistory(model);
  const rows: UnderRadarRow[] = [];
  for (const agg of model.artists) {
    if (agg.id === null) continue;
    const identity = model.identities.get(agg.id);
    const reach = reachFor(model, agg.id);
    const listeners = reach.listenbrainz?.value ?? null;
    const fans = reach.deezer?.value ?? null;
    // Checked first, so a famous artist lands in `known` whether or not a
    // reach number was ever fetched.
    const group: ReachGroup = isWellKnown(identity)
      ? 'known'
      : listeners !== null || fans !== null
        ? 'radar'
        : 'unknown';
    rows.push({
      agg,
      artistId: agg.id,
      group,
      rank: 0,
      tracks: agg.trackKeys.size,
      playlists: agg.playlistIds.size,
      plays: playsOf(model, agg),
      listeners,
      fans,
      views: reach.wikipedia?.value ?? null,
      sitelinks: identity?.sitelinks ?? null,
    });
  }
  rows.sort(
    (a, b) =>
      GROUP_ORDER[a.group] - GROUP_ORDER[b.group] ||
      compareBySort(a, b, sort, history)
  );
  // One numbering, running on across the group headings, so the text filter
  // never renumbers anything.
  rows.forEach((row, index) => {
    row.rank = index + 1;
  });
  rankedModel = model;
  rankedSort = sort;
  rankedRows = rows;
  return rows;
}

let coverageModel: Model | null = null;
let coverageValue: ReachCoverage | null = null;

/**
 * What the store holds, over the candidates only — artists with a Spotify id
 * in the owner's playlists. The source counts overlap on purpose, so they can
 * add up to more than `covered`. Memoised on the model identity: Settings and
 * the Under the radar caption both read it on every render.
 */
export function reachCoverage(m: Model): ReachCoverage {
  if (coverageModel === m && coverageValue) return coverageValue;
  let artists = 0;
  let covered = 0;
  let resolved = 0;
  let listenbrainz = 0;
  let deezer = 0;
  let wikipedia = 0;
  let wellKnown = 0;
  for (const agg of m.artists) {
    if (agg.id === null) continue;
    artists += 1;
    const identity = m.identities.get(agg.id);
    if (identity && identity.mbid !== null) resolved += 1;
    if (
      identity &&
      (identity.wikiTitles.en !== null || identity.wikiTitles.fr !== null)
    )
      wikipedia += 1;
    if (isWellKnown(identity)) wellKnown += 1;
    const reach = reachFor(m, agg.id);
    if (reach.listenbrainz) listenbrainz += 1;
    if (reach.deezer) deezer += 1;
    if (reach.listenbrainz || reach.deezer || reach.wikipedia) covered += 1;
  }
  coverageModel = m;
  coverageValue = {
    artists,
    covered,
    resolved,
    listenbrainz,
    deezer,
    wikipedia,
    wellKnown,
  };
  return coverageValue;
}
```

- [ ] **Step 9: Run the model tests to verify they pass**

Run: `yarn test src/model`
Expected: PASS, `Test Files  8 passed (8)`, `Tests  99 passed (99)`.

Run: `yarn typecheck && yarn lint && yarn test`
Expected: all three pass; `Test Files  29 passed (29)`,
`Tests  292 passed (292)`.

- [ ] **Step 10: Commit**

```bash
yarn format
git add src/model/aggregate.ts src/model/aggregate.test.ts \
  src/model/reach.ts src/model/reach.test.ts
git commit -m "feat(model): fold reach rows into the model and add the pure reach helpers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

- [ ] **Step 11: Write the failing `compactCount` test**

In `src/ui/format.test.ts`, first the import list — `compactCount` goes
alphabetically between `artistUrl` and `formatBpm`. Replace:

```ts
  artistUrl,
  formatBpm,
```

with:

```ts
  artistUrl,
  compactCount,
  formatBpm,
```

Then insert the new test immediately above this exact line, which puts it
after the not-counted test and before the BPM one:

```ts
  it('prints a BPM with one decimal and drops a trailing .0', () => {
```

Insert:

```ts
  it('compacts a yearly view count at every boundary', () => {
    // Under 10,000 the exact figure is printed, in the device's own locale.
    expect(compactCount(999)).toBe((999).toLocaleString());
    expect(compactCount(9999)).toBe((9999).toLocaleString());
    expect(compactCount(10_000)).toBe('10k');
    expect(compactCount(288_783)).toBe('289k');
    // The k branch stops just short of printing "1000k".
    expect(compactCount(999_499)).toBe('999k');
    expect(compactCount(999_999)).toBe('1m');
    expect(compactCount(1_240_000)).toBe('1.2m');
  });
```

- [ ] **Step 12: Run it to verify it fails**

Run: `yarn test src/ui/format.test.ts`

Expected: FAIL, 1 of 7 —

```
 ❯ src/ui/format.test.ts (7 tests | 1 failed) 15ms
   ❯ format helpers (7)
     × compacts a yearly view count at every boundary 2ms

 FAIL  src/ui/format.test.ts > format helpers > compacts a yearly view count at every boundary
TypeError: compactCount is not a function
 ❯ src/ui/format.test.ts:68:12
     66|   it('compacts a yearly view count at every boundary', () => {
     67|     // Under 10,000 the exact figure is printed, in the device's own l…
     68|     expect(compactCount(999)).toBe((999).toLocaleString());
       |            ^
     69|     expect(compactCount(9999)).toBe((9999).toLocaleString());

 Test Files  1 failed (1)
      Tests  1 failed | 6 passed (7)
```

- [ ] **Step 13: Implement `compactCount`**

In `src/ui/format.ts`, insert immediately above this exact line, which puts
`compactCount` between `notCountedLine` and `formatBpm`:

```ts
/** One decimal, a trailing `.0` dropped: `124`, `127.5` (spec §5). */
```

Insert:

```ts
/**
 * A yearly Wikipedia view count, where the exact figure carries no meaning:
 * `1,352` -> '1,352'; `288,783` -> '289k'; `999,999` -> '1m';
 * `1,240,000` -> '1.2m'. The 999,500 boundary exists so the `k` branch can
 * never print `1000k`. Listeners and fans are always printed in full.
 */
export function compactCount(n: number): string {
  if (n < 10_000) return n.toLocaleString();
  if (n < 999_500) return `${Math.round(n / 1000)}k`;
  return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}m`;
}
```

- [ ] **Step 14: Run the full gate**

Run: `yarn test src/ui/format.test.ts`
Expected: PASS, `Tests  7 passed (7)`.

Run: `yarn typecheck && yarn lint && yarn test && yarn build`
Expected: all four pass. The suite is `Test Files  29 passed (29)`,
`Tests  293 passed (293)` — 271 at the start of this task, plus 4 repository,
16 reach, 1 `buildModel` and 1 `compactCount`. `yarn build` emits
`dist/assets/index-*.js`, `dist/assets/index-*.css` and
`dist/assets/import.worker-*.js` as before: this task adds no bundled entry
point.

Run: `npx prettier --check "src/**/*.ts"`
Expected: `All matched files use Prettier code style!`

- [ ] **Step 15: Commit**

```bash
git add src/ui/format.ts src/ui/format.test.ts
git commit -m "feat(ui): add compactCount for the yearly Wikipedia view count

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

---
### Task 2: MusicBrainz, Wikidata, the JSONP transport and Deezer

**Files:**

- Create:
  - `src/features/jsonp.ts`
  - `src/features/musicbrainz.ts`
  - `src/features/wikidata.ts`
  - `src/features/deezer.ts`
- Modify:
  - `src/util/retry.ts` — one exported constant appended at the end of the
    file. Nothing already in it changes, and `src/util/retry.test.ts` is not
    touched: the constant's value is asserted from
    `src/features/musicbrainz.test.ts`, where it is used.
- Test:
  - `src/features/jsonp.test.ts` (new, 6 tests)
  - `src/features/musicbrainz.test.ts` (new, 10 tests)
  - `src/features/wikidata.test.ts` (new, 16 tests)
  - `src/features/deezer.test.ts` (new, 14 tests)
- Unchanged, do not touch: `src/db/schema.ts` and `src/db/repo.ts` are Task 1's
  — this task imports one type from the first and nothing at all from the
  second, because these four modules do no IndexedDB I/O and hold no state;
  every row is written by Task 4's runner. `src/features/reccobeats.ts`,
  `src/features/lookup.ts`, `src/model/*`, `src/ui/*` and `src/styles.css` are
  untouched as well, and `src/features/reachRun.ts` does not exist yet.

**Interfaces:**

- Consumes, from Task 1 (only the identity row, and only as a type —
  `wikidata.ts` is the sole importer):
  - `src/db/schema.ts`: `ResolveStatus`, `ArtistIdentityRow` (including
    `qidCheckedAt: number | null`, which `needsWikidata` reads), and `TrackRow`
    / `ArtistRef`, which shipped long ago.
- Consumes, from the shipped app, unchanged:
  - `src/model/normalize.ts`: `normalize(s: string): string` — NFD, marks
    stripped, lower-cased, non-alphanumerics collapsed to single spaces,
    trimmed.
  - `src/features/reccobeats.ts`: `normalizeIsrc(value: unknown): string | null`
    — uppercase, dash-free, `null` for a non-string or an empty string.
  - `src/util/retry.ts`: `MAX_5XX_RETRIES = 3`, `backoffMs(attempt: number):
    number` (2 s, 4 s, 8 s, … capped at 60 s). `parseRetryAfter` is **not** used
    here: no source in this task ever names a wait.
  - No new dependency, and nothing from `src/spotify/client.ts`.
- Produces — Tasks 3 and 4 are written against exactly these:

  ```ts
  // src/util/retry.ts (appended)
  export const REACH_REQUEST_TIMEOUT_MS = 15_000;

  // src/features/jsonp.ts
  export const JSONP_TIMEOUT_MS = 10_000;
  export function jsonp(url: string, timeoutMs: number): Promise<unknown>;

  // src/features/musicbrainz.ts
  export const MUSICBRAINZ_URL = 'https://musicbrainz.org/ws/2/url';
  export const MB_INTERVAL_MS = 1000;
  export interface MbDeps {
    fetchFn: typeof fetch;
    sleep: (ms: number) => Promise<void>;
  }
  export type MbResult =
    | { status: 'ok'; mbid: string }
    | { status: 'notFound' }
    | { status: 'retryLater'; message: string };
  export function mbUrl(artistId: string): string;
  export function fetchMbid(artistId: string, deps: MbDeps): Promise<MbResult>;

  // src/features/wikidata.ts
  export const WIKIDATA_URL = 'https://query.wikidata.org/sparql';
  export const WIKIDATA_BATCH_SIZE = 150;
  export interface WikidataDeps { fetchFn: typeof fetch }
  export interface WikidataHit {
    qid: string;
    sitelinks: number | null;
    wikiTitles: { en: string | null; fr: string | null };
  }
  export type WikidataBatch =
    | { status: 'ok'; hits: Map<string, WikidataHit>; ambiguous: Set<string> }
    | { status: 'failed'; message: string };
  export interface WikidataFreshness { okMs: number; notFoundMs: number }
  export function wikidataBatches(ids: string[], size?: number): string[][];
  export function spotifyIdQuery(ids: string[]): string;
  export function mbidQuery(mbids: string[]): string;
  export function resolveBySpotifyId(
    ids: string[],
    deps: WikidataDeps
  ): Promise<WikidataBatch>;
  export function resolveByMbid(
    mbids: string[],
    deps: WikidataDeps
  ): Promise<WikidataBatch>;
  export function needsWikidata(
    row: ArtistIdentityRow | undefined,
    now: number,
    ttl: WikidataFreshness
  ): boolean;

  // src/features/deezer.ts
  export const DEEZER_API = 'https://api.deezer.com';
  export const DEEZER_INTERVAL_MS = 250;
  export const MAX_ISRC_CANDIDATES = 3;
  export const DEEZER_QUOTA_CODE = 4;
  export const MAX_QUOTA_RETRIES = 5;
  export interface DeezerDeps {
    jsonpFn: (url: string, timeoutMs: number) => Promise<unknown>;
    sleep: (ms: number) => Promise<void>;
  }
  export type DeezerIdentity =
    | { status: 'ok'; artistId: number; name: string }
    | { status: 'notFound' }
    | { status: 'retryLater'; message: string };
  export type DeezerFans =
    | { status: 'ok'; fans: number; sourceUrl: string }
    | { status: 'notFound'; sourceUrl: string }
    | { status: 'retryLater'; message: string; sourceUrl: string };
  export function deezerTrackUrl(isrc: string): string;
  export function deezerArtistUrl(artistId: number): string;
  export function candidateIsrcs(
    artistId: string,
    tracks: Iterable<TrackRow>
  ): string[];
  export function resolveDeezerArtist(
    name: string,
    isrcs: string[],
    deps: DeezerDeps
  ): Promise<DeezerIdentity>;
  export function fetchDeezerFans(
    artistId: number,
    deps: DeezerDeps
  ): Promise<DeezerFans>;
  ```

- Produces, four contracts that are not signatures and that Tasks 3 and 4 must
  honour:
  1. **MusicBrainz and Deezer pace themselves.** `fetchMbid` sleeps
     `MB_INTERVAL_MS` before every attempt (retries included) and the Deezer
     helpers sleep `DEEZER_INTERVAL_MS` before every request, the first one
     included. Task 4 must add **no** sleep of its own for these two sources —
     the `if (requests > 0) await sleep(…)` shape of
     `src/features/lookup.ts:runLookup` would halve the pace here. (Task 3's
     two clients are the other way round; decision 8 has the whole split.)
  2. **Task 4's `reachCandidates` builds `ReachCandidate.isrcs` by calling
     `candidateIsrcs(artistId, tracks)`** over the artist's own tracks
     (`agg.trackKeys` -> `model.tracksByKey`), rather than re-implementing spec
     §3.3's single-artist rule. The list is uncapped; the three-candidate cap
     is applied inside `resolveDeezerArtist`.
  3. **`REACH_REQUEST_TIMEOUT_MS` is declared here, once** (decision 4). Task 3
     imports it from `src/util/retry`; Task 4 declares the other four constants
     of spec §4.5 in `reachRun.ts` and passes the first two to `needsWikidata`
     as `{ okMs: REACH_TTL_MS, notFoundMs: REACH_NOT_FOUND_TTL_MS }`.
  4. **Every client result reads the same way**: `status` is `'ok'`,
     `'notFound'` or `'retryLater'`, a `retryLater` carries a human `message`
     for the Settings error line, and nothing throws. Wikidata is the one
     documented exception: its failure arm is `'failed'`, because spec §3.2
     leaves the whole batch `unchecked` rather than writing `retryLater` rows,
     and Task 4 must not turn a `failed` batch into `retryLater` identity rows.
     None of these clients can learn a wait, so none carries a pause field;
     Task 3's ListenBrainz 429 path is where that is added.

**Notes — twelve points the spec left open, settled here:**

1. **The clients return a result; they never throw.** `runReach` must never
   throw (spec §4.2) and a source that pauses must not abort the run, so unlike
   `fetchAudioFeatures` — which throws and ends the whole ReccoBeats lookup —
   these report `retryLater` and let Task 4 count failures against
   `MAX_SOURCE_FAILURES`.
2. **MusicBrainz: only a 404, or a 200 with no usable artist relation, is
   `notFound`.** Every other non-2xx (a 400, a 429) is `retryLater` with the
   status in the message: spec §3.1 makes absence provable by exactly two
   answers, and a ninety-day-sticky `notFound` written over a transient status
   would be the expensive mistake. A 5xx, an abort, a transport failure and a
   truncated body all take the same `backoffMs` path, at most
   `MAX_5XX_RETRIES` times.
3. **The echoed `resource` is checked for `/artist/`** — cheap insurance,
   exactly as spec §3.1 frames it, tested with Cinthie's
   `open.spotify.com/user/…` hazard from research §4.2. The load-bearing guard
   is still the `artist` object on a `free streaming` relation.
4. **`jsonp` appends `callback=<name>` only.** `output=jsonp` belongs to the
   Deezer URL builders, so the helper stays generic, as spec §3.4 asks. It
   picks the separator (`?` or `&`) from the url it is given, assigns the
   callback on `globalThis` — the same object as `window` in a browser, and the
   one a Node test can reach — and names it `__djReach<counter>`.
5. **`jsonp`'s cleanup clears the timer** as well as deleting the global and
   removing the element. Without that a resolved request leaves a live 10 s
   timer behind; the sixth test asserts `vi.getTimerCount()` is 0.
6. **Wikidata never retries.** Spec §3.2 leaves a failed batch `unchecked` and
   counts one failure against the source, so a retry loop here would only
   multiply the damage of a genuinely broken endpoint. A non-2xx, a transport
   failure and a malformed body are all `failed`.
7. **Ids that are not `[A-Za-z0-9-]+` are dropped from the `VALUES` block.**
   Every Spotify artist id and every MBID matches; nothing else can break out
   of a SPARQL literal.
8. **A sitelink title is everything after the first `/wiki/`**, kept verbatim
   (percent-encoded, underscores intact). Spec §3.2 says "the last path
   segment"; the two agree on every real sitelink except a subpage title,
   which the last segment would truncate.
9. **A bound article implies at least one sitelink** (decision 15), so
   `sitelinks` is `max(bound count, articles bound)` and `null` only when
   neither is present. Without it spec §2's `wellKnown >= wikipedia` can break,
   since the count and the two titles are three separate `OPTIONAL`s.
10. **An id bound to two distinct items is removed from `hits` and reported in
    `ambiguous`**, so spec §3.2's "record `notFound`" is what Task 4 ends up
    writing; the same item bound twice stays a hit, which is why the comparison
    is on the QID and not on the row count.
11. **`needsWikidata` takes its TTLs as an argument and reads `qidCheckedAt`**
    (decisions 4 and 5). Spec §7 puts pass 1's input rule in this test file,
    but the rule reads the two TTLs that live beside the run, and a client must
    not import its runner. A `>=` comparison makes a row exactly at its TTL
    stale, matching `LOOKUP_NOT_FOUND_TTL_MS`'s existing `isFresh` in
    `src/features/lookup.ts`. The rest of §7's Wikidata bullet — pass 2 running
    only over pass 1's misses, and an `ok` id keeping its QID while its
    sitelinks are rewritten — is orchestration and is tested in Task 4.
12. **`jsonp` needs a real `document`**, and Vitest's Node environment has
    none, so `jsonp.test.ts` installs a fake one on `globalThis` and the helper
    assigns its callback there too. Anyone moving these tests to a DOM
    environment must revisit that.

- [ ] **Step 1: Write the failing tests for the transport and MusicBrainz**

Create `src/features/jsonp.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSONP_TIMEOUT_MS, jsonp } from './jsonp';

interface FakeScript {
  src: string;
  onerror: ((event: Event | string) => void) | null;
  removed: boolean;
  remove: () => void;
}

const globals = globalThis as unknown as Record<string, unknown>;
const DEEZER = 'https://api.deezer.com/artist/27?output=jsonp';

let scripts: FakeScript[] = [];

/** Vitest runs in Node, so the helper's `document` is supplied here. */
function installDocument(respond?: (script: FakeScript) => unknown): void {
  scripts = [];
  globals.document = {
    createElement: (): FakeScript => ({
      src: '',
      onerror: null,
      removed: false,
      remove(): void {
        this.removed = true;
      },
    }),
    head: {
      appendChild: (script: FakeScript): FakeScript => {
        scripts.push(script);
        if (respond) {
          const name = callbackName(script);
          const fn = globals[name] as (value: unknown) => void;
          fn(respond(script));
        }
        return script;
      },
    },
  };
}

function callbackName(script: FakeScript): string {
  return script.src.split('callback=')[1];
}

afterEach(() => {
  vi.useRealTimers();
  delete globals.document;
});

describe('jsonp', () => {
  it('names a fresh callback per request and hands the value back untouched', async () => {
    installDocument((script) => ({ artist: { name: script.src } }));
    const first = await jsonp(DEEZER, JSONP_TIMEOUT_MS);
    const second = await jsonp(DEEZER, JSONP_TIMEOUT_MS);
    const names = scripts.map(callbackName);
    expect(names[0]).not.toBe(names[1]);
    expect(names.every((name) => name.startsWith('__djReach'))).toBe(true);
    expect(scripts[0].src).toBe(`${DEEZER}&callback=${names[0]}`);
    // The helper declares `unknown`, so the test narrows it itself.
    const body = first as { artist: { name: string } };
    expect(body.artist.name).toBe(`${DEEZER}&callback=${names[0]}`);
    expect(second).not.toEqual(first);
  });

  it('starts the query string when the url has none', async () => {
    installDocument(() => 1);
    await jsonp('https://api.deezer.com/artist/27', JSONP_TIMEOUT_MS);
    expect(scripts[0].src).toBe(
      `https://api.deezer.com/artist/27?callback=${callbackName(scripts[0])}`
    );
  });

  it('deletes the global and removes the script on success', async () => {
    installDocument(() => ({ nb_fan: 585 }));
    await jsonp(DEEZER, JSONP_TIMEOUT_MS);
    expect(globals[callbackName(scripts[0])]).toBeUndefined();
    expect(scripts[0].removed).toBe(true);
  });

  it('rejects and cleans up when the script fails to load', async () => {
    installDocument();
    const pending = jsonp(DEEZER, JSONP_TIMEOUT_MS);
    scripts[0].onerror?.('error');
    await expect(pending).rejects.toThrow(`JSONP request failed: ${DEEZER}`);
    expect(globals[callbackName(scripts[0])]).toBeUndefined();
    expect(scripts[0].removed).toBe(true);
  });

  it('rejects after ten seconds of silence and cleans up', async () => {
    vi.useFakeTimers();
    installDocument();
    expect(JSONP_TIMEOUT_MS).toBe(10_000);
    let settled = false;
    const pending = jsonp(DEEZER, JSONP_TIMEOUT_MS);
    void pending.catch(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(JSONP_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).rejects.toThrow(
      `JSONP request timed out after 10000 ms: ${DEEZER}`
    );
    expect(globals[callbackName(scripts[0])]).toBeUndefined();
    expect(scripts[0].removed).toBe(true);
  });

  it('leaves no timer behind once the callback has answered', async () => {
    vi.useFakeTimers();
    installDocument(() => 'done');
    await jsonp(DEEZER, JSONP_TIMEOUT_MS);
    expect(vi.getTimerCount()).toBe(0);
  });
});
```

Create `src/features/musicbrainz.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { REACH_REQUEST_TIMEOUT_MS } from '../util/retry';
import {
  MB_INTERVAL_MS,
  MUSICBRAINZ_URL,
  fetchMbid,
  mbUrl,
} from './musicbrainz';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const ARTIST = '2CIMQHirSU0MQqyYHq0eOx';
const MBID = '9dcd5e77-3915-4d4d-a80c-1c0b0d18f4de';
const RESOURCE = `https://open.spotify.com/artist/${ARTIST}`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function urlEntity(relations: unknown[], resource = RESOURCE): unknown {
  return { id: 'c0e0a1e2-0000-4000-8000-000000000001', resource, relations };
}

const FREE_STREAMING = {
  type: 'free streaming',
  'type-id': '769085a1-c2f7-4c24-a532-2375a77693bd',
  direction: 'backward',
  artist: { id: MBID, name: 'deadmau5' },
};

function setup(responses: Array<() => Response | Promise<Response>>) {
  const fetchFn = vi.fn<FetchLike>(async () => {
    const next = responses.shift();
    if (!next) throw new Error('unexpected extra request');
    return next();
  });
  const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
  const deps = { fetchFn: fetchFn as unknown as typeof fetch, sleep };
  return { deps, fetchFn, sleep };
}

describe('fetchMbid', () => {
  it('asks the reverse url lookup and reads the free streaming relation', async () => {
    const { deps, fetchFn } = setup([() => json(urlEntity([FREE_STREAMING]))]);
    const result = await fetchMbid(ARTIST, deps);
    expect(fetchFn.mock.calls[0][0]).toBe(
      `${MUSICBRAINZ_URL}?resource=https%3A%2F%2Fopen.spotify.com%2Fartist%2F` +
        `${ARTIST}&inc=artist-rels&fmt=json`
    );
    expect(mbUrl(ARTIST)).toBe(fetchFn.mock.calls[0][0]);
    expect(result).toEqual({ status: 'ok', mbid: MBID });
  });

  it('sends no custom header, a 15 s abort signal and one request per second', async () => {
    const { deps, fetchFn, sleep } = setup([
      () => json(urlEntity([FREE_STREAMING])),
    ]);
    await fetchMbid(ARTIST, deps);
    const init = fetchFn.mock.calls[0][1];
    expect(init?.headers).toBeUndefined();
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.signal?.aborted).toBe(false);
    expect(REACH_REQUEST_TIMEOUT_MS).toBe(15_000);
    expect(MB_INTERVAL_MS).toBe(1000);
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([1000]);
  });

  it('skips a relation with no artist object and one of another type', async () => {
    const { deps } = setup([
      () =>
        json(
          urlEntity([
            { type: 'free streaming', direction: 'backward' },
            { type: 'social network', artist: { id: 'wrong-one' } },
            FREE_STREAMING,
          ])
        ),
    ]);
    expect(await fetchMbid(ARTIST, deps)).toEqual({
      status: 'ok',
      mbid: MBID,
    });
  });

  it('reads 404 and an answer with no artist relation as notFound', async () => {
    const missing = setup([() => json({ error: 'Not Found' }, 404)]);
    expect(await fetchMbid(ARTIST, missing.deps)).toEqual({
      status: 'notFound',
    });
    const empty = setup([() => json(urlEntity([]))]);
    expect(await fetchMbid(ARTIST, empty.deps)).toEqual({ status: 'notFound' });
  });

  it('refuses a resource that is not an artist url', async () => {
    const { deps } = setup([
      () =>
        json(
          urlEntity(
            [FREE_STREAMING],
            'https://open.spotify.com/user/cinthie-berlin'
          )
        ),
    ]);
    expect(await fetchMbid(ARTIST, deps)).toEqual({ status: 'notFound' });
  });

  it('never reads 503 as notFound: three backoffs, then retryLater', async () => {
    const { deps, fetchFn, sleep } = setup(
      Array.from({ length: 4 }, () => () => json({}, 503))
    );
    expect(await fetchMbid(ARTIST, deps)).toEqual({
      status: 'retryLater',
      message: 'MusicBrainz server error 503',
    });
    expect(fetchFn).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([
      1000, 2000, 1000, 4000, 1000, 8000, 1000,
    ]);
  });

  it('retries an aborted request and succeeds on the next attempt', async () => {
    const { deps, sleep } = setup([
      () =>
        Promise.reject(
          new DOMException('The operation was aborted', 'TimeoutError')
        ),
      () => json(urlEntity([FREE_STREAMING])),
    ]);
    expect(await fetchMbid(ARTIST, deps)).toEqual({ status: 'ok', mbid: MBID });
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([1000, 2000, 1000]);
  });

  it('gives up on a transport failure after the same three retries', async () => {
    const { deps, fetchFn } = setup(
      Array.from(
        { length: 4 },
        () => () => Promise.reject(new TypeError('Failed to fetch'))
      )
    );
    expect(await fetchMbid(ARTIST, deps)).toEqual({
      status: 'retryLater',
      message: 'MusicBrainz is unreachable: Failed to fetch',
    });
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it('retries a truncated body instead of reporting the artist absent', async () => {
    const { deps, fetchFn } = setup([
      () =>
        new Response('{"relations":[', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      () => json(urlEntity([FREE_STREAMING])),
    ]);
    expect(await fetchMbid(ARTIST, deps)).toEqual({ status: 'ok', mbid: MBID });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('reports any other status as retryLater, never as notFound', async () => {
    const { deps, fetchFn } = setup([() => json({}, 400)]);
    expect(await fetchMbid(ARTIST, deps)).toEqual({
      status: 'retryLater',
      message: 'MusicBrainz error 400',
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn test src/features/jsonp.test.ts src/features/musicbrainz.test.ts`

Expected: `Test Files  2 failed (2)`, `Tests  no tests` — both files fail to
collect rather than on an assertion:

```
 ❯ src/features/jsonp.test.ts (0 test)
 ❯ src/features/musicbrainz.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/features/jsonp.test.ts [ src/features/jsonp.test.ts ]
Error: Cannot find module './jsonp' imported from /…/src/features/jsonp.test.ts
 ❯ src/features/jsonp.test.ts:2:1
      1| import { afterEach, describe, expect, it, vi } from 'vitest';
      2| import { JSONP_TIMEOUT_MS, jsonp } from './jsonp';
       | ^

 FAIL  src/features/musicbrainz.test.ts [ src/features/musicbrainz.test.ts ]
Error: Cannot find module './musicbrainz' imported from /…/src/features/musicbrainz.test.ts
 ❯ src/features/musicbrainz.test.ts:3:1
      1| import { describe, expect, it, vi } from 'vitest';
      2| import { REACH_REQUEST_TIMEOUT_MS } from '../util/retry';
      3| import {
       | ^
```

`musicbrainz.test.ts` names `./musicbrainz` at line 3 rather than
`../util/retry` at line 2: that module resolves, and its missing
`REACH_REQUEST_TIMEOUT_MS` export would only surface once the module on line 3
exists — which is the same step that adds the constant.

- [ ] **Step 3: Implement the transport, the constant and the MusicBrainz client**

Append to the end of `src/util/retry.ts` (leave `MAX_5XX_RETRIES`, `backoffMs`
and `parseRetryAfter` exactly as they are):

```ts
/**
 * Every reach lookup `fetch` carries
 * `AbortSignal.timeout(REACH_REQUEST_TIMEOUT_MS)` (artist-reach spec §4.5).
 * Without it a hung request on a flaky mobile connection strands the run on
 * `running` with no way back; an abort is a transport failure and takes the
 * source's backoff path.
 */
export const REACH_REQUEST_TIMEOUT_MS = 15_000;
```

Create `src/features/jsonp.ts`:

```ts
/**
 * Script-injection transport. Deezer sends no `access-control-allow-origin`
 * header at all, so it can only be read this way (spec §3.4, research §2).
 */

/**
 * JSONP has no status codes, so a silent timeout is a retry, never a miss.
 * This is a separate budget from `REACH_REQUEST_TIMEOUT_MS`.
 */
export const JSONP_TIMEOUT_MS = 10_000;

let counter = 0;

/**
 * Appends `&callback=<a name used once>` to `url`, loads it as a script and
 * resolves with whatever the remote script passed to that callback. The
 * global and the element go away in every outcome.
 *
 * It resolves with `unknown` on purpose: a remote script runs in the page's
 * own context, so a caller-chosen generic would be an assertion rather than a
 * check. Narrowing is the caller's job (spec §3.3). The callback is assigned
 * on `globalThis`, which is `window` in a browser and is also what a Node
 * test can reach.
 */
export function jsonp(url: string, timeoutMs: number): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    counter += 1;
    const name = `__djReach${counter}`;
    const globals = globalThis as unknown as Record<string, unknown>;
    const script = document.createElement('script');

    function cleanUp(): void {
      clearTimeout(timer);
      delete globals[name];
      script.onerror = null;
      script.remove();
    }

    globals[name] = (value: unknown): void => {
      cleanUp();
      resolve(value);
    };
    script.onerror = (): void => {
      cleanUp();
      reject(new Error(`JSONP request failed: ${url}`));
    };
    const timer = setTimeout(() => {
      cleanUp();
      reject(
        new Error(`JSONP request timed out after ${timeoutMs} ms: ${url}`)
      );
    }, timeoutMs);

    // Nothing between the two handlers above and `timer` can invoke either
    // of them, so `cleanUp` never reads `timer` before it is initialised; the
    // script is appended last, so nothing can answer into a half-built
    // request. Keep this order: `timer` must stay a `const` for ESLint's
    // prefer-const, and it must stay below the handlers that clear it.
    script.src = `${url}${url.includes('?') ? '&' : '?'}callback=${name}`;
    document.head.appendChild(script);
  });
}
```

Create `src/features/musicbrainz.ts`:

```ts
import {
  MAX_5XX_RETRIES,
  REACH_REQUEST_TIMEOUT_MS,
  backoffMs,
} from '../util/retry';

/** Reverse lookup: a Spotify artist URL in, the MusicBrainz artist out. */
export const MUSICBRAINZ_URL = 'https://musicbrainz.org/ws/2/url';

/** The documented rate, and the whole of this app's etiquette (spec §3.1). */
export const MB_INTERVAL_MS = 1000;

const SPOTIFY_ARTIST_URL = 'https://open.spotify.com/artist/';

export interface MbDeps {
  fetchFn: typeof fetch;
  sleep: (ms: number) => Promise<void>;
}

/**
 * `retryLater` is never "artist absent": a 503 means rate-limited or globally
 * busy, and a transport failure means nothing at all (spec §3.1).
 */
export type MbResult =
  | { status: 'ok'; mbid: string }
  | { status: 'notFound' }
  | { status: 'retryLater'; message: string };

export function mbUrl(artistId: string): string {
  const resource = encodeURIComponent(`${SPOTIFY_ARTIST_URL}${artistId}`);
  return `${MUSICBRAINZ_URL}?resource=${resource}&inc=artist-rels&fmt=json`;
}

function field(raw: unknown, name: string): unknown {
  if (typeof raw !== 'object' || raw === null) return undefined;
  return (raw as Record<string, unknown>)[name];
}

/**
 * The relation whose type is `free streaming` and which carries an `artist`
 * object; the `artist` guard is the load-bearing one. The echoed `resource`
 * is checked too, as cheap insurance against a future response shape.
 */
function mbidFrom(body: unknown): string | null {
  const resource = field(body, 'resource');
  if (typeof resource === 'string' && !resource.includes('/artist/')) {
    return null;
  }
  const relations = field(body, 'relations');
  if (!Array.isArray(relations)) return null;
  for (const relation of relations) {
    if (field(relation, 'type') !== 'free streaming') continue;
    const id = field(field(relation, 'artist'), 'id');
    if (typeof id === 'string' && id !== '') return id;
  }
  return null;
}

/**
 * One artist, at one request per second: the client owns its own pace, so the
 * runner adds no sleep of its own. A 5xx, an abort, a transport failure or a
 * truncated body back off up to `MAX_5XX_RETRIES` times and then answer
 * `retryLater`; only a 404 or an answer with no artist relation is a
 * `notFound`.
 */
export async function fetchMbid(
  artistId: string,
  deps: MbDeps
): Promise<MbResult> {
  const url = mbUrl(artistId);
  let failures = 0;

  /** Counts, backs off and reports whether the caller should try again. */
  async function retry(): Promise<boolean> {
    failures += 1;
    if (failures > MAX_5XX_RETRIES) return false;
    await deps.sleep(backoffMs(failures));
    return true;
  }

  for (;;) {
    await deps.sleep(MB_INTERVAL_MS);
    let res: Response;
    try {
      res = await deps.fetchFn(url, {
        signal: AbortSignal.timeout(REACH_REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      if (await retry()) continue;
      const reason = err instanceof Error ? err.message : String(err);
      return {
        status: 'retryLater',
        message: `MusicBrainz is unreachable: ${reason}`,
      };
    }
    if (res.status === 404) return { status: 'notFound' };
    if (res.status >= 500) {
      if (await retry()) continue;
      return {
        status: 'retryLater',
        message: `MusicBrainz server error ${res.status}`,
      };
    }
    if (!res.ok) {
      return {
        status: 'retryLater',
        message: `MusicBrainz error ${res.status}`,
      };
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      if (await retry()) continue;
      return {
        status: 'retryLater',
        message: 'MusicBrainz returned a malformed response',
      };
    }
    const mbid = mbidFrom(body);
    return mbid === null ? { status: 'notFound' } : { status: 'ok', mbid };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn test src/features/jsonp.test.ts src/features/musicbrainz.test.ts`
Expected: PASS, `Test Files  2 passed (2)`, `Tests  16 passed (16)` (6 in
`jsonp.test.ts`, 10 in `musicbrainz.test.ts`).

Run: `yarn typecheck && yarn lint && yarn test`
Expected: all three pass; `Test Files  31 passed (31)`,
`Tests  309 passed (309)` — 293 in 29 files at the end of Task 1, plus these 16
in 2 files.

- [ ] **Step 5: Commit**

```bash
yarn format
git add src/util/retry.ts src/features/jsonp.ts src/features/jsonp.test.ts \
  src/features/musicbrainz.ts src/features/musicbrainz.test.ts
git commit -m "feat(features): JSONP transport and MusicBrainz reverse lookup

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

- [ ] **Step 6: Write the failing tests for Wikidata and Deezer**

Create `src/features/wikidata.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { ArtistIdentityRow } from '../db/schema';
import { REACH_REQUEST_TIMEOUT_MS } from '../util/retry';
import {
  WIKIDATA_BATCH_SIZE,
  WIKIDATA_URL,
  mbidQuery,
  needsWikidata,
  resolveByMbid,
  resolveBySpotifyId,
  spotifyIdQuery,
  wikidataBatches,
} from './wikidata';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const PEGGY = '2ye2Wgw4gimLv2eAKyk1NB';
const ANETHA = '4rIvIrjfR0PSPNPVOWl0Bc';
const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;
const TTL = { okMs: 90 * DAY, notFoundMs: 30 * DAY };

function cell(value: string): unknown {
  return { type: 'literal', value };
}

function results(bindings: Record<string, unknown>[]): unknown {
  return {
    head: { vars: ['sid', 'item', 'sitelinks', 'en', 'fr'] },
    results: { bindings },
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/sparql-results+json' },
  });
}

function setup(responses: Array<() => Response | Promise<Response>>) {
  const fetchFn = vi.fn<FetchLike>(async () => {
    const next = responses.shift();
    if (!next) throw new Error('unexpected extra request');
    return next();
  });
  const deps = { fetchFn: fetchFn as unknown as typeof fetch };
  return { deps, fetchFn };
}

function identity(over: Partial<ArtistIdentityRow>): ArtistIdentityRow {
  return {
    artistId: PEGGY,
    name: 'Peggy Gou',
    mbid: null,
    mbidStatus: 'unchecked',
    qid: null,
    qidStatus: 'unchecked',
    qidCheckedAt: null,
    sitelinks: null,
    wikiTitles: { en: null, fr: null },
    deezerArtistId: null,
    deezerName: null,
    deezerStatus: 'unchecked',
    resolvedAt: NOW,
    retryAfter: null,
    ...over,
  };
}

describe('wikidataBatches', () => {
  it('cuts the ids into batches of a hundred and fifty', () => {
    const ids = Array.from({ length: 301 }, (_, i) => `id${i}`);
    const batches = wikidataBatches(ids);
    expect(WIKIDATA_BATCH_SIZE).toBe(150);
    expect(batches.map((batch) => batch.length)).toEqual([150, 150, 1]);
    expect(batches[2]).toEqual(['id300']);
    expect(wikidataBatches([])).toEqual([]);
  });
});

describe('the SPARQL builders', () => {
  it('joins pass 1 on P1902 through VALUES and never samples', () => {
    const query = spotifyIdQuery([PEGGY, ANETHA]);
    expect(query).toContain(`VALUES ?sid { "${PEGGY}" "${ANETHA}" }`);
    expect(query).toContain('?item wdt:P1902 ?sid .');
    expect(query).toContain('SELECT ?sid ?item ?sitelinks ?en ?fr WHERE {');
    expect(query).toContain('OPTIONAL { ?item wikibase:sitelinks ?sitelinks }');
    expect(query).toContain('schema:isPartOf <https://en.wikipedia.org/>');
    expect(query).toContain('schema:isPartOf <https://fr.wikipedia.org/>');
    expect(query).not.toMatch(/SAMPLE/i);
  });

  it('joins pass 2 on P434 and asks for the mbid back', () => {
    const query = mbidQuery(['9dcd5e77-3915-4d4d-a80c-1c0b0d18f4de']);
    expect(query).toContain(
      'VALUES ?mbid { "9dcd5e77-3915-4d4d-a80c-1c0b0d18f4de" }'
    );
    expect(query).toContain('?item wdt:P434 ?mbid .');
    expect(query).toContain('SELECT ?mbid ?item ?sitelinks ?en ?fr WHERE {');
    expect(query).not.toMatch(/SAMPLE/i);
    expect(query).not.toContain('P1902');
  });

  it('drops an id that could break out of the literal', () => {
    const query = spotifyIdQuery([`" } UNION { ?item wdt:P31 ?x`, PEGGY]);
    expect(query).toContain(`VALUES ?sid { "${PEGGY}" }`);
    expect(query).not.toContain('UNION');
  });
});

describe('resolveBySpotifyId', () => {
  it('posts the form-encoded query and reads the JSON results', async () => {
    const { deps, fetchFn } = setup([() => json(results([]))]);
    await resolveBySpotifyId([PEGGY], deps);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(WIKIDATA_URL);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({
      Accept: 'application/sparql-results+json',
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    const body = new URLSearchParams(String(init?.body));
    expect(body.get('query')).toBe(spotifyIdQuery([PEGGY]));
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(REACH_REQUEST_TIMEOUT_MS).toBe(15_000);
  });

  it('parses the QID, the sitelink count and both segments verbatim', async () => {
    const { deps } = setup([
      () =>
        json(
          results([
            {
              sid: cell(PEGGY),
              item: cell('http://www.wikidata.org/entity/Q22344118'),
              sitelinks: cell('19'),
              en: cell('https://en.wikipedia.org/wiki/Peggy_Gou'),
              fr: cell('https://fr.wikipedia.org/wiki/Ann%C3%A9e_z%C3%A9ro'),
            },
          ])
        ),
    ]);
    const batch = await resolveBySpotifyId([PEGGY], deps);
    expect(batch).toEqual({
      status: 'ok',
      hits: new Map([
        [
          PEGGY,
          {
            qid: 'Q22344118',
            sitelinks: 19,
            wikiTitles: {
              en: 'Peggy_Gou',
              fr: 'Ann%C3%A9e_z%C3%A9ro',
            },
          },
        ],
      ]),
      ambiguous: new Set(),
    });
  });

  it('reads an absent sitelink count and an absent language as null', async () => {
    const { deps } = setup([
      () =>
        json(
          results([
            {
              sid: cell(ANETHA),
              item: cell('http://www.wikidata.org/entity/Q60771091'),
            },
          ])
        ),
    ]);
    const batch = await resolveBySpotifyId([ANETHA], deps);
    if (batch.status !== 'ok') throw new Error('expected an answer');
    expect(batch.hits.get(ANETHA)).toEqual({
      qid: 'Q60771091',
      sitelinks: null,
      wikiTitles: { en: null, fr: null },
    });
  });

  it('counts a bound article as a sitelink when the count is missing', async () => {
    // `sitelinks` and the two articles are separate OPTIONALs, so an item can
    // bind an article and no count. Spec §2's invariant `wellKnown >=
    // wikipedia` needs an article to imply at least one sitelink.
    const one = setup([
      () =>
        json(
          results([
            {
              sid: cell(ANETHA),
              item: cell('http://www.wikidata.org/entity/Q60771091'),
              fr: cell('https://fr.wikipedia.org/wiki/Anetha'),
            },
          ])
        ),
    ]);
    const first = await resolveBySpotifyId([ANETHA], one.deps);
    if (first.status !== 'ok') throw new Error('expected an answer');
    expect(first.hits.get(ANETHA)).toEqual({
      qid: 'Q60771091',
      sitelinks: 1,
      wikiTitles: { en: null, fr: 'Anetha' },
    });
    const both = setup([
      () =>
        json(
          results([
            {
              sid: cell(PEGGY),
              item: cell('http://www.wikidata.org/entity/Q22344118'),
              sitelinks: cell('19'),
              en: cell('https://en.wikipedia.org/wiki/Peggy_Gou'),
              fr: cell('https://fr.wikipedia.org/wiki/Peggy_Gou'),
            },
          ])
        ),
    ]);
    const second = await resolveBySpotifyId([PEGGY], both.deps);
    if (second.status !== 'ok') throw new Error('expected an answer');
    // A real count is never lowered by the rule.
    expect(second.hits.get(PEGGY)?.sitelinks).toBe(19);
  });

  it('keeps an id whose item repeats and drops one bound to two items', async () => {
    const { deps } = setup([
      () =>
        json(
          results([
            {
              sid: cell(PEGGY),
              item: cell('http://www.wikidata.org/entity/Q22344118'),
              sitelinks: cell('19'),
            },
            {
              sid: cell(PEGGY),
              item: cell('http://www.wikidata.org/entity/Q22344118'),
              sitelinks: cell('19'),
            },
            {
              sid: cell(ANETHA),
              item: cell('http://www.wikidata.org/entity/Q60771091'),
            },
            {
              sid: cell(ANETHA),
              item: cell('http://www.wikidata.org/entity/Q1234567'),
            },
          ])
        ),
    ]);
    const batch = await resolveBySpotifyId([PEGGY, ANETHA], deps);
    if (batch.status !== 'ok') throw new Error('expected an answer');
    expect(batch.hits.get(PEGGY)?.qid).toBe('Q22344118');
    expect(batch.hits.has(ANETHA)).toBe(false);
    expect([...batch.ambiguous]).toEqual([ANETHA]);
  });

  it('leaves an id the query never bound out of the map', async () => {
    const { deps } = setup([() => json(results([]))]);
    const batch = await resolveBySpotifyId([PEGGY], deps);
    if (batch.status !== 'ok') throw new Error('expected an answer');
    expect(batch.hits.size).toBe(0);
    expect(batch.ambiguous.size).toBe(0);
  });

  it('reports a non-2xx, a transport failure and a bad body as failures', async () => {
    const server = setup([() => json({}, 500)]);
    expect(await resolveBySpotifyId([PEGGY], server.deps)).toEqual({
      status: 'failed',
      message: 'Wikidata error 500',
    });
    const offline = setup([
      () => Promise.reject(new TypeError('Failed to fetch')),
    ]);
    expect(await resolveBySpotifyId([PEGGY], offline.deps)).toEqual({
      status: 'failed',
      message: 'Wikidata is unreachable: Failed to fetch',
    });
    const truncated = setup([
      () => new Response('{"results":', { status: 200 }),
    ]);
    expect(await resolveBySpotifyId([PEGGY], truncated.deps)).toEqual({
      status: 'failed',
      message: 'Wikidata returned a malformed response',
    });
  });
});

describe('resolveByMbid', () => {
  it('keys the answer on the mbid it asked for', async () => {
    const mbid = '9dcd5e77-3915-4d4d-a80c-1c0b0d18f4de';
    const { deps, fetchFn } = setup([
      () =>
        json(
          results([
            {
              mbid: cell(mbid),
              item: cell('http://www.wikidata.org/entity/Q317521'),
              sitelinks: cell('4'),
              en: cell('https://en.wikipedia.org/wiki/Overmono'),
            },
          ])
        ),
    ]);
    const batch = await resolveByMbid([mbid], deps);
    const body = new URLSearchParams(String(fetchFn.mock.calls[0][1]?.body));
    expect(body.get('query')).toBe(mbidQuery([mbid]));
    if (batch.status !== 'ok') throw new Error('expected an answer');
    expect(batch.hits.get(mbid)).toEqual({
      qid: 'Q317521',
      sitelinks: 4,
      wikiTitles: { en: 'Overmono', fr: null },
    });
  });
});

describe('needsWikidata', () => {
  it('takes an artist with no row and an unchecked QID', () => {
    expect(needsWikidata(undefined, NOW, TTL)).toBe(true);
    expect(needsWikidata(identity({}), NOW, TTL)).toBe(true);
  });

  it('re-asks a notFound after thirty days and an ok after ninety', () => {
    const missing = { qidStatus: 'notFound' as const, qid: null };
    expect(
      needsWikidata(
        identity({ ...missing, qidCheckedAt: NOW - 30 * DAY }),
        NOW,
        TTL
      )
    ).toBe(true);
    expect(
      needsWikidata(
        identity({ ...missing, qidCheckedAt: NOW - 30 * DAY + 1 }),
        NOW,
        TTL
      )
    ).toBe(false);
    const found = { qidStatus: 'ok' as const, qid: 'Q22344118' };
    expect(
      needsWikidata(
        identity({ ...found, qidCheckedAt: NOW - 90 * DAY }),
        NOW,
        TTL
      )
    ).toBe(true);
    expect(
      needsWikidata(
        identity({ ...found, qidCheckedAt: NOW - 89 * DAY }),
        NOW,
        TTL
      )
    ).toBe(false);
  });

  it('reads its own clock, not the one the other two steps bump', () => {
    // The MusicBrainz and Deezer steps rewrite `resolvedAt` every thirty days
    // for a `notFound`; the ninety-day sitelink refresh must still come due.
    const stale = identity({
      qidStatus: 'ok',
      qid: 'Q22344118',
      qidCheckedAt: NOW - 90 * DAY,
      resolvedAt: NOW,
    });
    expect(needsWikidata(stale, NOW, TTL)).toBe(true);
    // A row Wikidata has never answered about enters pass 1 whatever the
    // status field says.
    expect(
      needsWikidata(
        identity({ qidStatus: 'ok', qid: 'Q1', qidCheckedAt: null }),
        NOW,
        TTL
      )
    ).toBe(true);
  });

  it('holds a retryLater back until its own retryAfter has passed', () => {
    const waiting = identity({
      qidStatus: 'retryLater',
      qidCheckedAt: NOW - 200 * DAY,
      retryAfter: NOW + 1,
    });
    expect(needsWikidata(waiting, NOW, TTL)).toBe(false);
    expect(needsWikidata({ ...waiting, retryAfter: NOW }, NOW, TTL)).toBe(true);
    expect(needsWikidata({ ...waiting, retryAfter: null }, NOW, TTL)).toBe(
      true
    );
  });
});
```

Create `src/features/deezer.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { TrackRow } from '../db/schema';
import { JSONP_TIMEOUT_MS } from './jsonp';
import {
  DEEZER_INTERVAL_MS,
  MAX_ISRC_CANDIDATES,
  candidateIsrcs,
  deezerArtistUrl,
  deezerTrackUrl,
  fetchDeezerFans,
  resolveDeezerArtist,
} from './deezer';

type JsonpLike = (url: string, timeoutMs: number) => Promise<unknown>;

const BAMBOUNOU = '4bqQAsBrjEqz1jSVFdcXJx';
const BRUCE = '5v1Ivi6ImXWyMHTZBFHvzB';

function setup(answers: Array<() => unknown>) {
  const jsonpFn = vi.fn<JsonpLike>(async () => {
    const next = answers.shift();
    if (!next) throw new Error('unexpected extra request');
    return next();
  });
  const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
  return { deps: { jsonpFn, sleep }, jsonpFn, sleep };
}

function track(key: string, over: Partial<TrackRow> = {}): TrackRow {
  return {
    key,
    id: key,
    uri: `spotify:track:${key}`,
    name: `Track ${key}`,
    artists: [{ id: BAMBOUNOU, name: 'Bambounou' }],
    album: 'Album',
    durationMs: 300_000,
    isrc: null,
    spotifyUrl: null,
    isLocal: false,
    ...over,
  };
}

describe('candidateIsrcs', () => {
  it('takes only tracks credited to exactly this artist, normalised and sorted', () => {
    const tracks = [
      track('t1', { isrc: 'FR-9W1-15-00002' }),
      track('t2', { isrc: 'fr9w11500001' }),
      // The same ISRC on a second pressing must not be asked twice.
      track('t3', { isrc: 'FR9W11500001' }),
      // "Bambounou x Bruce": two credits, so it never contributes.
      track('t4', {
        isrc: 'GB9W11500003',
        artists: [
          { id: BAMBOUNOU, name: 'Bambounou' },
          { id: BRUCE, name: 'Bruce' },
        ],
      }),
      // Another artist's track, a local file and a track with no ISRC.
      track('t5', {
        isrc: 'US9W11500004',
        artists: [{ id: BRUCE, name: 'Bruce' }],
      }),
      track('t6', { isrc: 'AA9W11500005', isLocal: true }),
      track('t7'),
    ];
    expect(candidateIsrcs(BAMBOUNOU, tracks)).toEqual([
      'FR9W11500001',
      'FR9W11500002',
    ]);
    expect(candidateIsrcs('unknown-artist', tracks)).toEqual([]);
  });

  it('ignores a name-only credit, which carries no id at all', () => {
    const tracks = [
      track('t1', {
        isrc: 'FR9W11500001',
        artists: [{ id: null, name: 'Bambounou' }],
      }),
    ];
    expect(candidateIsrcs(BAMBOUNOU, tracks)).toEqual([]);
  });
});

describe('resolveDeezerArtist', () => {
  it('asks the ISRC endpoint only, never a name search, and keeps the id', async () => {
    const { deps, jsonpFn, sleep } = setup([
      () => ({
        id: 3135556,
        title: 'Cirrus',
        artist: { id: 4666432, name: 'Hugo LX' },
      }),
    ]);
    const result = await resolveDeezerArtist('Hugo LX', ['FR9W11500001'], deps);
    expect(result).toEqual({
      status: 'ok',
      artistId: 4666432,
      name: 'Hugo LX',
    });
    expect(jsonpFn.mock.calls[0]).toEqual([
      'https://api.deezer.com/track/isrc:FR9W11500001?output=jsonp',
      JSONP_TIMEOUT_MS,
    ]);
    expect(deezerTrackUrl('FR9W11500001')).toBe(jsonpFn.mock.calls[0][0]);
    expect(
      jsonpFn.mock.calls.every(
        (call) =>
          call[0].startsWith('https://api.deezer.com/track/isrc:') ||
          call[0].startsWith('https://api.deezer.com/artist/')
      )
    ).toBe(true);
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([
      DEEZER_INTERVAL_MS,
    ]);
    expect(DEEZER_INTERVAL_MS).toBe(250);
  });

  it('accepts a name that matches only after normalisation', async () => {
    const { deps } = setup([
      () => ({ artist: { id: 260, name: 'ETIENNE DE CRECY' } }),
    ]);
    expect(
      await resolveDeezerArtist('Étienne de Crécy', ['FR9W11500001'], deps)
    ).toEqual({ status: 'ok', artistId: 260, name: 'ETIENNE DE CRECY' });
  });

  it('rejects "Bambounou x Bruce" and takes the next candidate', async () => {
    const { deps, jsonpFn } = setup([
      () => ({ artist: { id: 7, name: 'Bambounou x Bruce' } }),
      () => ({ artist: { id: 4508817, name: 'Bambounou' } }),
    ]);
    const result = await resolveDeezerArtist(
      'Bambounou',
      ['FR9W11500001', 'FR9W11500002'],
      deps
    );
    expect(result).toEqual({
      status: 'ok',
      artistId: 4508817,
      name: 'Bambounou',
    });
    expect(jsonpFn).toHaveBeenCalledTimes(2);
  });

  it('rejects a homonym and a shortened credit rather than guess', async () => {
    const fisher = setup([
      () => ({ artist: { id: 13, name: 'India Fisher' } }),
    ]);
    expect(
      await resolveDeezerArtist('FISHER', ['AU9W11500001'], fisher.deps)
    ).toEqual({ status: 'notFound' });
    const byron = setup([
      () => ({ artist: { id: 5, name: 'Byron Aquarius' } }),
    ]);
    expect(
      await resolveDeezerArtist(
        'Byron the Aquarius',
        ['US9W11500001'],
        byron.deps
      )
    ).toEqual({ status: 'notFound' });
  });

  it('tries at most three candidates and asks for none without an ISRC', async () => {
    const { deps, jsonpFn } = setup(
      Array.from({ length: 3 }, () => () => ({
        artist: { id: 7, name: 'Someone Else' },
      }))
    );
    const isrcs = ['A1', 'A2', 'A3', 'A4', 'A5'];
    expect(await resolveDeezerArtist('Bambounou', isrcs, deps)).toEqual({
      status: 'notFound',
    });
    expect(jsonpFn).toHaveBeenCalledTimes(MAX_ISRC_CANDIDATES);
    expect(MAX_ISRC_CANDIDATES).toBe(3);
    const none = setup([]);
    expect(await resolveDeezerArtist('Bambounou', [], none.deps)).toEqual({
      status: 'notFound',
    });
    expect(none.jsonpFn).not.toHaveBeenCalled();
  });

  it('treats an id that is not a finite number and an odd error as misses', async () => {
    const { deps } = setup([
      () => ({ artist: { id: '4508817', name: 'Bambounou' } }),
      () => ({
        error: { type: 'DataException', message: 'no data', code: 800 },
      }),
    ]);
    expect(await resolveDeezerArtist('Bambounou', ['A1', 'A2'], deps)).toEqual({
      status: 'notFound',
    });
  });

  it('retries the quota error five times and then asks to come back later', async () => {
    const { deps, jsonpFn, sleep } = setup(
      Array.from({ length: 6 }, () => () => ({
        error: { type: 'Exception', message: 'Quota limit exceeded', code: 4 },
      }))
    );
    expect(await resolveDeezerArtist('Bambounou', ['A1'], deps)).toEqual({
      status: 'retryLater',
      message: 'Deezer is over quota: it refused 6 attempts (error 4)',
    });
    expect(jsonpFn).toHaveBeenCalledTimes(6);
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([
      250, 2000, 250, 4000, 250, 8000, 250, 16_000, 250, 32_000, 250,
    ]);
  });

  it('answers the quota once it clears and carries on with the candidate', async () => {
    const { deps, jsonpFn } = setup([
      () => ({ error: { code: 4 } }),
      () => ({ artist: { id: 4508817, name: 'Bambounou' } }),
    ]);
    expect(await resolveDeezerArtist('Bambounou', ['A1'], deps)).toEqual({
      status: 'ok',
      artistId: 4508817,
      name: 'Bambounou',
    });
    expect(jsonpFn.mock.calls[0][0]).toBe(jsonpFn.mock.calls[1][0]);
  });

  it('reads a JSONP timeout as retryLater, never as a miss', async () => {
    const { deps, jsonpFn } = setup([
      () => {
        throw new Error('JSONP request timed out after 10000 ms: url');
      },
    ]);
    expect(await resolveDeezerArtist('Bambounou', ['A1', 'A2'], deps)).toEqual({
      status: 'retryLater',
      message:
        'Deezer is unreachable: JSONP request timed out after 10000 ms: url',
    });
    expect(jsonpFn).toHaveBeenCalledTimes(1);
  });
});

describe('fetchDeezerFans', () => {
  it('costs one request when the artist id is already known', async () => {
    const { deps, jsonpFn, sleep } = setup([
      () => ({ id: 4666432, name: 'Hugo LX', nb_fan: 585 }),
    ]);
    expect(await fetchDeezerFans(4666432, deps)).toEqual({
      status: 'ok',
      fans: 585,
      sourceUrl: 'https://api.deezer.com/artist/4666432?output=jsonp',
    });
    expect(jsonpFn).toHaveBeenCalledTimes(1);
    expect(jsonpFn.mock.calls[0][0]).toBe(deezerArtistUrl(4666432));
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([250]);
  });

  it('reads an answer with no nb_fan as notFound, keeping the url', async () => {
    const { deps } = setup([() => ({ error: { code: 800 } })]);
    expect(await fetchDeezerFans(4666432, deps)).toEqual({
      status: 'notFound',
      sourceUrl: deezerArtistUrl(4666432),
    });
  });

  it('reads a transport failure as retryLater, keeping the url', async () => {
    const { deps } = setup([
      () => {
        throw new Error('JSONP request failed: url');
      },
    ]);
    expect(await fetchDeezerFans(4666432, deps)).toEqual({
      status: 'retryLater',
      message: 'Deezer is unreachable: JSONP request failed: url',
      sourceUrl: deezerArtistUrl(4666432),
    });
  });
});
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `yarn test src/features/wikidata.test.ts src/features/deezer.test.ts`

Expected: `Test Files  2 failed (2)`, `Tests  no tests`:

```
 ❯ src/features/deezer.test.ts (0 test)
 ❯ src/features/wikidata.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/features/deezer.test.ts [ src/features/deezer.test.ts ]
Error: Cannot find module './deezer' imported from /…/src/features/deezer.test.ts
 ❯ src/features/deezer.test.ts:4:1
      2| import type { TrackRow } from '../db/schema';
      3| import { JSONP_TIMEOUT_MS } from './jsonp';
      4| import {
       | ^

 FAIL  src/features/wikidata.test.ts [ src/features/wikidata.test.ts ]
Error: Cannot find module './wikidata' imported from /…/src/features/wikidata.test.ts
 ❯ src/features/wikidata.test.ts:4:1
      2| import type { ArtistIdentityRow } from '../db/schema';
      3| import { REACH_REQUEST_TIMEOUT_MS } from '../util/retry';
      4| import {
       | ^
```

- [ ] **Step 8: Implement the Wikidata and Deezer clients**

Create `src/features/wikidata.ts`:

```ts
import type { ArtistIdentityRow } from '../db/schema';
import { REACH_REQUEST_TIMEOUT_MS } from '../util/retry';

export const WIKIDATA_URL = 'https://query.wikidata.org/sparql';

/**
 * Research §4.3 sizes a batch at ~200 and warns to chunk inside the 60 s
 * query timeout; 150 keeps headroom, and 1,000 artists is seven POSTs.
 */
export const WIKIDATA_BATCH_SIZE = 150;

export interface WikidataDeps {
  fetchFn: typeof fetch;
}

export interface WikidataHit {
  qid: string;
  /** `wikibase:sitelinks`, all languages; null when the item bound none. */
  sitelinks: number | null;
  /** Article path segments exactly as the sitelink spells them. */
  wikiTitles: { en: string | null; fr: string | null };
}

/**
 * `failed` is not `retryLater`: spec §3.2 leaves the whole batch `unchecked`
 * so the next run simply asks again, and counts one failure against the
 * Wikidata source.
 */
export type WikidataBatch =
  | { status: 'ok'; hits: Map<string, WikidataHit>; ambiguous: Set<string> }
  | { status: 'failed'; message: string };

/** TTLs are arguments because they are declared beside the run (spec §4.5). */
export interface WikidataFreshness {
  /** `REACH_TTL_MS`: an `ok` row's sitelinks and titles go stale at 90 days. */
  okMs: number;
  /** `REACH_NOT_FOUND_TTL_MS`: 30 days. */
  notFoundMs: number;
}

export function wikidataBatches(
  ids: string[],
  size = WIKIDATA_BATCH_SIZE
): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/** Every Spotify artist id and every MBID matches; nothing else may. */
const SAFE_ID = /^[A-Za-z0-9-]+$/;

function valuesBlock(ids: string[], name: string): string {
  const safe = ids.filter((id) => SAFE_ID.test(id)).map((id) => `"${id}"`);
  return `VALUES ?${name} { ${safe.join(' ')} }`;
}

const OPTIONALS = [
  '  OPTIONAL { ?item wikibase:sitelinks ?sitelinks }',
  '  OPTIONAL { ?en schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }',
  '  OPTIONAL { ?fr schema:about ?item ; schema:isPartOf <https://fr.wikipedia.org/> }',
].join('\n');

/**
 * Never `SAMPLE`: P1902 and P434 are both multi-valued, and sampling is what
 * produced a wrong "not recoverable" verdict during the research. The
 * `VALUES` join handles the multi-valued side correctly.
 */
function query(ids: string[], key: string, property: string): string {
  return [
    `SELECT ?${key} ?item ?sitelinks ?en ?fr WHERE {`,
    `  ${valuesBlock(ids, key)}`,
    `  ?item ${property} ?${key} .`,
    OPTIONALS,
    '}',
  ].join('\n');
}

export function spotifyIdQuery(ids: string[]): string {
  return query(ids, 'sid', 'wdt:P1902');
}

export function mbidQuery(mbids: string[]): string {
  return query(mbids, 'mbid', 'wdt:P434');
}

function field(raw: unknown, name: string): unknown {
  if (typeof raw !== 'object' || raw === null) return undefined;
  return (raw as Record<string, unknown>)[name];
}

/** A SPARQL JSON binding cell is `{ type, value }`. */
function bound(row: unknown, name: string): string | null {
  const value = field(field(row, name), 'value');
  return typeof value === 'string' && value !== '' ? value : null;
}

function qidFrom(item: string): string | null {
  const last = item.split('/').pop();
  return last === undefined || last === '' ? null : last;
}

function integer(raw: string | null): number | null {
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : null;
}

/**
 * Everything after `/wiki/`, kept verbatim — percent-encoded, underscores
 * intact — so the value drops straight into the pageviews path with no
 * decode/re-encode round trip. Taking the tail rather than the last segment
 * keeps a subpage title whole.
 */
function articleTitle(url: string | null): string | null {
  if (url === null) return null;
  const at = url.indexOf('/wiki/');
  if (at < 0) return null;
  const title = url.slice(at + '/wiki/'.length);
  return title === '' ? null : title;
}

function parse(body: unknown, key: string): WikidataBatch {
  const bindings = field(field(body, 'results'), 'bindings');
  if (!Array.isArray(bindings)) {
    return { status: 'failed', message: 'Wikidata returned no results' };
  }
  const hits = new Map<string, WikidataHit>();
  const ambiguous = new Set<string>();
  for (const row of bindings) {
    const id = bound(row, key);
    const item = bound(row, 'item');
    if (id === null || item === null || ambiguous.has(id)) continue;
    const qid = qidFrom(item);
    if (qid === null) continue;
    const seen = hits.get(id);
    if (seen !== undefined) {
      // Ambiguity the app cannot resolve must not promote an artist out of
      // the under-the-radar list (spec §3.2).
      if (seen.qid !== qid) {
        hits.delete(id);
        ambiguous.add(id);
      }
      continue;
    }
    const wikiTitles = {
      en: articleTitle(bound(row, 'en')),
      fr: articleTitle(bound(row, 'fr')),
    };
    // `sitelinks` and the two article URLs are three separate OPTIONALs, so
    // nothing in the query stops an item binding an article and no count. A
    // bound article *is* a sitelink, so the articles seen here are the floor:
    // without this, spec §2's invariant `wellKnown >= wikipedia` can break.
    const bound_ = integer(bound(row, 'sitelinks'));
    const articles = (wikiTitles.en ? 1 : 0) + (wikiTitles.fr ? 1 : 0);
    hits.set(id, {
      qid,
      sitelinks:
        bound_ === null && articles === 0
          ? null
          : Math.max(bound_ ?? 0, articles),
      wikiTitles,
    });
  }
  return { status: 'ok', hits, ambiguous };
}

/**
 * One POST for one batch. There is no retry: a failure leaves the batch
 * `unchecked` and the next run asks again (spec §3.2).
 */
async function ask(
  sparql: string,
  key: string,
  deps: WikidataDeps
): Promise<WikidataBatch> {
  let res: Response;
  try {
    res = await deps.fetchFn(WIKIDATA_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/sparql-results+json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ query: sparql }).toString(),
      signal: AbortSignal.timeout(REACH_REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { status: 'failed', message: `Wikidata is unreachable: ${reason}` };
  }
  if (!res.ok) {
    return { status: 'failed', message: `Wikidata error ${res.status}` };
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return {
      status: 'failed',
      message: 'Wikidata returned a malformed response',
    };
  }
  return parse(body, key);
}

/** Pass 1: the Spotify artist id itself, through P1902. */
export function resolveBySpotifyId(
  ids: string[],
  deps: WikidataDeps
): Promise<WikidataBatch> {
  return ask(spotifyIdQuery(ids), 'sid', deps);
}

/** Pass 2: the MBID MusicBrainz produced, through P434. */
export function resolveByMbid(
  mbids: string[],
  deps: WikidataDeps
): Promise<WikidataBatch> {
  return ask(mbidQuery(mbids), 'mbid', deps);
}

/**
 * Spec §3.2's pass-1 input: an unchecked id (an artist with no row included),
 * a `notFound` past its 30 days, an `ok` past its 90 days — that last one is
 * load-bearing, since an artist who gains their first article only leaves the
 * list when the sitelink count is refreshed. A `retryLater` waits for its own
 * `retryAfter`.
 *
 * The clock is `qidCheckedAt`, not `resolvedAt`: one identity row carries
 * three steps, a `notFound` MBID or Deezer id is rewritten every thirty days
 * and every write bumps `resolvedAt`, so a `resolvedAt` older than ninety days
 * is unreachable for those artists and the sitelink refresh would never fire.
 */
export function needsWikidata(
  row: ArtistIdentityRow | undefined,
  now: number,
  ttl: WikidataFreshness
): boolean {
  if (row === undefined) return true;
  // null means Wikidata has never answered about this artist.
  const checkedAt = row.qidCheckedAt ?? 0;
  switch (row.qidStatus) {
    case 'unchecked':
      return true;
    case 'notFound':
      return now - checkedAt >= ttl.notFoundMs;
    case 'ok':
      return now - checkedAt >= ttl.okMs;
    case 'retryLater':
      return row.retryAfter === null || now >= row.retryAfter;
  }
}
```

Create `src/features/deezer.ts`:

```ts
import type { TrackRow } from '../db/schema';
import { normalize } from '../model/normalize';
import { backoffMs } from '../util/retry';
import { JSONP_TIMEOUT_MS } from './jsonp';
import { normalizeIsrc } from './reccobeats';

export const DEEZER_API = 'https://api.deezer.com';

/**
 * Four requests per second: the research measured the quota at ~50 per 5 s
 * per IP and sized the job at <=8 req/s, and the owner chose half of that
 * envelope because a breach is invisible in the status line. The client owns
 * this pace, so the runner adds no sleep of its own.
 */
export const DEEZER_INTERVAL_MS = 250;

/** Ruling (spec §3.3): one artist costs at most four requests per run. */
export const MAX_ISRC_CANDIDATES = 3;

/** A quota refusal arrives as HTTP 200 with this code in the body. */
export const DEEZER_QUOTA_CODE = 4;

export const MAX_QUOTA_RETRIES = 5;

export interface DeezerDeps {
  jsonpFn: (url: string, timeoutMs: number) => Promise<unknown>;
  sleep: (ms: number) => Promise<void>;
}

export type DeezerIdentity =
  | { status: 'ok'; artistId: number; name: string }
  | { status: 'notFound' }
  | { status: 'retryLater'; message: string };

export type DeezerFans =
  | { status: 'ok'; fans: number; sourceUrl: string }
  | { status: 'notFound'; sourceUrl: string }
  | { status: 'retryLater'; message: string; sourceUrl: string };

export function deezerTrackUrl(isrc: string): string {
  return `${DEEZER_API}/track/isrc:${encodeURIComponent(isrc)}?output=jsonp`;
}

export function deezerArtistUrl(artistId: number): string {
  return `${DEEZER_API}/artist/${artistId}?output=jsonp`;
}

/**
 * `track.artist` is the release's main artist, so a candidate ISRC may only
 * come from a track credited to exactly this artist (spec §3.3): six of the
 * research's 61 resolved ISRCs otherwise landed on another entity and
 * returned a silently wrong number. Deduped and sorted, so a run is
 * deterministic, and normalised so Deezer's `/track/isrc:` path accepts them.
 */
export function candidateIsrcs(
  artistId: string,
  tracks: Iterable<TrackRow>
): string[] {
  const out = new Set<string>();
  for (const track of tracks) {
    if (track.isLocal) continue;
    if (track.artists.length !== 1) continue;
    if (track.artists[0].id !== artistId) continue;
    const isrc = normalizeIsrc(track.isrc);
    if (isrc !== null) out.add(isrc);
  }
  return [...out].sort();
}

function field(raw: unknown, name: string): unknown {
  if (typeof raw !== 'object' || raw === null) return undefined;
  return (raw as Record<string, unknown>)[name];
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

type Answer =
  { kind: 'body'; body: unknown } | { kind: 'retryLater'; message: string };

/**
 * One JSONP request, paced and quota-aware. The body is inspected and the
 * status is not, because a quota refusal is an HTTP 200; a rejection from the
 * transport (a timeout, a script error) is never a miss, since the body that
 * would have said "no such track" never arrived.
 */
async function ask(url: string, deps: DeezerDeps): Promise<Answer> {
  let refusals = 0;
  for (;;) {
    await deps.sleep(DEEZER_INTERVAL_MS);
    let body: unknown;
    try {
      body = await deps.jsonpFn(url, JSONP_TIMEOUT_MS);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return {
        kind: 'retryLater',
        message: `Deezer is unreachable: ${reason}`,
      };
    }
    if (num(field(field(body, 'error'), 'code')) !== DEEZER_QUOTA_CODE) {
      return { kind: 'body', body };
    }
    refusals += 1;
    if (refusals > MAX_QUOTA_RETRIES) {
      return {
        kind: 'retryLater',
        message:
          `Deezer is over quota: it refused ${MAX_QUOTA_RETRIES + 1} ` +
          `attempts (error ${DEEZER_QUOTA_CODE})`,
      };
    }
    await deps.sleep(backoffMs(refusals));
  }
}

/**
 * At most `MAX_ISRC_CANDIDATES` single-artist ISRCs, each accepted only when
 * the echoed Deezer name equals the Spotify name after `normalize()`. Every
 * other outcome is `notFound`: never a number from a collaboration or a remix
 * credit, and never a name search, which returned a 13-fan homonym for FISHER
 * during the research.
 */
export async function resolveDeezerArtist(
  name: string,
  isrcs: string[],
  deps: DeezerDeps
): Promise<DeezerIdentity> {
  const wanted = normalize(name);
  for (const isrc of isrcs.slice(0, MAX_ISRC_CANDIDATES)) {
    const answer = await ask(deezerTrackUrl(isrc), deps);
    if (answer.kind === 'retryLater') {
      return { status: 'retryLater', message: answer.message };
    }
    const artist = field(answer.body, 'artist');
    const artistId = num(field(artist, 'id'));
    const echoed = str(field(artist, 'name'));
    if (artistId === null || echoed === null) continue;
    if (normalize(echoed) !== wanted) continue;
    return { status: 'ok', artistId, name: echoed };
  }
  return { status: 'notFound' };
}

/** `nb_fan`: how many Deezer users pressed follow. One request. */
export async function fetchDeezerFans(
  artistId: number,
  deps: DeezerDeps
): Promise<DeezerFans> {
  const sourceUrl = deezerArtistUrl(artistId);
  const answer = await ask(sourceUrl, deps);
  if (answer.kind === 'retryLater') {
    return { status: 'retryLater', message: answer.message, sourceUrl };
  }
  const fans = num(field(answer.body, 'nb_fan'));
  return fans === null
    ? { status: 'notFound', sourceUrl }
    : { status: 'ok', fans, sourceUrl };
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `yarn test src/features/wikidata.test.ts src/features/deezer.test.ts`
Expected: PASS, `Test Files  2 passed (2)`, `Tests  30 passed (30)` (16 in
`wikidata.test.ts`, 14 in `deezer.test.ts`).

Run: `yarn test src/features`
Expected: PASS, `Test Files  9 passed (9)`, `Tests  86 passed (86)` — this
task's four files and the five the BPM work left.

Run: `yarn typecheck && yarn lint && yarn test && yarn build`
Expected: all four pass; `Test Files  33 passed (33)`,
`Tests  339 passed (339)`. Nothing in `src/ui/` imports these modules yet, so
the bundle is unchanged.

- [ ] **Step 10: Commit**

```bash
yarn format
git add src/features/wikidata.ts src/features/wikidata.test.ts \
  src/features/deezer.ts src/features/deezer.test.ts
git commit -m "feat(features): Wikidata SPARQL passes and the Deezer ISRC identity

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

---
### Task 3: Reach clients — ListenBrainz and Wikipedia pageviews

**Files:**

- Create: `src/features/listenbrainz.ts`, `src/features/wikipedia.ts`
- Modify: none. `src/util/retry.ts` already carries `REACH_REQUEST_TIMEOUT_MS`
  — Task 2 Step 3 added it, and it is declared exactly once (decision 4). Task
  1 owns `src/db/schema.ts`, `src/db/repo.ts` and `src/model/*`; Task 2 owns
  the other four `src/features/` modules; Task 4 owns `reachRun.ts`. None of
  them is touched here.
- Test: `src/features/listenbrainz.test.ts`, `src/features/wikipedia.test.ts`

**Interfaces:**

- Consumes, exactly as Tasks 1 and 2 leave it:
  - `src/db/schema.ts`: the type
    `ReachStatus = 'ok' | 'notFound' | 'retryLater'`. That single import is the
    whole dependency on Task 1 — no store, no repo function, no row type.
  - `src/util/retry.ts`: `MAX_5XX_RETRIES = 3`, `backoffMs(attempt: number):
    number` (2 s, 4 s, 8 s … capped at 60 s), `parseRetryAfter(header: string |
    null): number | null` (seconds, or `null` when the header is absent or
    unreadable), and `REACH_REQUEST_TIMEOUT_MS = 15_000`.
  - `src/model/normalize.ts`: `normalize(s: string): string`. It is what makes
    `ANETHA`, `Anetha` and `Étienne de Crécy` / `Etienne de Crecy` compare
    equal.
- Produces — the two functions Task 4's `runReach` calls:

  ```ts
  // src/features/listenbrainz.ts
  export const LISTENBRAINZ_STATS_URL =
    'https://api.listenbrainz.org/1/stats/artist';
  export const LB_INTERVAL_MS = 1000;

  export interface ListenBrainzDeps {
    fetchFn: typeof fetch;
    sleep: (ms: number) => Promise<void>;
  }

  export interface ListenersResult {
    status: ReachStatus;
    value: number | null;
    listens: number | null;
    sourceUrl: string;
    pauseForMs?: number;
  }

  export function listenersUrl(mbid: string): string;
  export function fetchListeners(
    mbid: string,
    name: string,
    deps: ListenBrainzDeps
  ): Promise<ListenersResult>;

  // src/features/wikipedia.ts
  export const PAGEVIEWS_URL =
    'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article';
  export const WIKIPEDIA_PROJECTS = {
    en: 'en.wikipedia.org',
    fr: 'fr.wikipedia.org',
  } as const;
  export const WIKIPEDIA_INTERVAL_MS = 250;
  export const PAGEVIEW_MONTHS = 12;

  export type WikiLang = keyof typeof WIKIPEDIA_PROJECTS;
  export interface WikiTitles {
    en: string | null;
    fr: string | null;
  }
  export interface PageviewWindow {
    start: string;
    end: string;
  }
  export interface WikipediaDeps {
    fetchFn: typeof fetch;
    sleep: (ms: number) => Promise<void>;
    now: () => number;
  }
  export interface PageviewsResult {
    status: ReachStatus;
    value: number | null;
    en: number | null;
    fr: number | null;
    months: number;
    sourceUrl: string;
  }

  export function pageviewWindow(now: number): PageviewWindow;
  export function fetchPageviews(
    titles: WikiTitles,
    deps: WikipediaDeps
  ): Promise<PageviewsResult>;
  ```

- Produces, three contracts Task 4 must honour:
  1. **These two clients do *not* pace themselves between artists** — they
     sleep only for their own retries, and `fetchPageviews` sleeps
     `WIKIPEDIA_INTERVAL_MS` between its two language requests. `runReach`
     therefore sleeps `LB_INTERVAL_MS` before every ListenBrainz request and
     `WIKIPEDIA_INTERVAL_MS` before every artist's pageviews call (decision 8).
     Both constants are exported for exactly that.
  2. **`pauseForMs` is the only channel by which a client asks for a pause.**
     ListenBrainz sets it when `Retry-After` exceeds 60 s and never sleeps that
     long itself; Wikipedia has no such field, because no rate limit is
     documented there at all, and pauses the ordinary way, on three consecutive
     `retryLater` results.
  3. **`status === 'retryLater'` is the `MAX_SOURCE_FAILURES` signal**; `ok`
     and `notFound` both reset the counter, so Task 4 needs no extra flag.
- Consumed back by Task 4, which builds the rows: `key` is
  `` `${artistId}|listenbrainz` `` / `` `${artistId}|wikipedia` ``,
  `extra.listens` / `extra.en` / `extra.fr` / `extra.months` carry the
  secondary numbers, `fetchedAt` is the run's clock, and a `retryLater` row's
  `retryAfter` is `now + max(REACH_RETRY_LATER_TTL_MS, pauseForMs ?? 0)`.
  `ReachDeps` (`fetchFn`, `jsonpFn`, `sleep`, `now`, `onState`,
  `acquireWakeLock?`) is structurally assignable to both `ListenBrainzDeps` and
  `WikipediaDeps`, so the runner passes its own `deps` object unchanged.

**Notes — eight points the spec left open, settled here:**

1. **`fetchListeners` takes the Spotify name and does the verification
   itself**, returning `notFound` on a mismatch, rather than handing the echoed
   name back for the runner to check. §4.3 makes the check part of the answer
   ("On a mismatch store `notFound` and no number"), and doing it in one place
   stops two callers disagreeing about what `normalize` means. **An absent or
   non-string `artist_name` is a mismatch, not a skip.**
2. **`notFound` is reserved for four answers, and every other non-2xx is
   `retryLater`**: 204, 404, a payload without a finite `total_user_count`, and
   a name the artist does not answer to. A 401 or 403 — the shape spec §8 warns
   about, "its documented *popularity* endpoints moved behind auth during the
   research, so this endpoint could close the same way" — must not write a
   thirty-day `notFound` over the whole library; three of them in a row pause
   the source instead, which is the behaviour §8 asks for. The cost is that a
   genuinely malformed MBID takes three backoffs and counts as a source
   failure.
3. **Five 429 retries, then `retryLater`, not a pause.** §4.3 says "at most 5
   retries" and names the pause only for the over-a-minute case; an exhausted
   retry budget is an ordinary failure and is counted as one. A 429 with no
   readable `Retry-After` waits ten seconds, the same default
   `src/features/reccobeats.ts` already uses.
4. **A truncated 200 is a transport failure, not "no listeners".** Marking an
   artist `notFound` for thirty days over a dropped connection would be wrong.
5. **`fetchPageviews` takes the whole `wikiTitles` object** — the identity
   row's field, passed straight through — and asks English first, French
   second. A `null` title is not asked for and its per-language field stays
   `null`. **Titles go into the path verbatim**: spec §3.2 stores the sitelink
   segment "kept verbatim (percent-encoded, underscores intact) … so the value
   drops straight into the pageviews path", and an `encodeURIComponent` here
   would double-encode `%C3%89tienne_de_Cr%C3%A9cy` and 404 every accented
   article. The MBID in `listenersUrl` is the opposite case and *is* encoded:
   it comes from MusicBrainz's own `relation.artist.id`, so the call is the
   identity function on it — defence against a future response shape, not a
   rule to copy onto the Wikipedia title.
6. **`sourceUrl` is one field over two requests**: the URL of the first
   language that answered 200, else the first URL asked, else `''`. `''` can
   only happen when both titles are `null`, which the runner never does — the
   phase only visits identities with an en or fr title — but the guard and its
   test are kept so no request-less row can look like an answer. §5.4's
   Wikipedia link is rebuilt from `wikiTitles`, not from this field.
7. **A 404 on one language contributes 0 and the other language's number is
   still stored (§4.4), but a transport failure or a 5xx past its retries on
   *either* language makes the whole result `retryLater` and stores no number
   at all.** A partial sum written as `ok` would sit behind the ninety-day TTL
   and understate the artist for three months; a 404 is an answer, a dropped
   connection is not. Task 4 must not soften this into a partial write.
8. **`listenersUrl` is exported** (decision 21) because the run stamps
   `sourceUrl` on rows for artists it never asked about, and
   `ArtistReachRow.sourceUrl` is not optional.

Two halves of spec §7's ListenBrainz bullet belong to Task 4's
`reachRun.test.ts` instead, because they are about rows and about the run, not
about a request: writing `retryLater` rows with `retryAfter` for the artists
still owed a request after a long `Retry-After` (the client half, `pauseForMs`,
is tested here), and the one-request-per-second pacing, which is the runner's.

- [ ] **Step 1: Write the failing ListenBrainz test**

Create `src/features/listenbrainz.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  LISTENBRAINZ_STATS_URL,
  fetchListeners,
  listenersUrl,
} from './listenbrainz';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** FISHER, the MBID the research probed live on 2026-09-05. */
const MBID = '886dc0c9-3351-4d2d-b762-060cf1e66929';
const LISTENERS_URL = `${LISTENBRAINZ_STATS_URL}/${MBID}/listeners`;

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function setup(responses: Array<() => Response | Promise<Response>>) {
  const fetchFn = vi.fn<FetchLike>(async () => {
    const next = responses.shift();
    if (!next) throw new Error('unexpected extra request');
    return next();
  });
  const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
  const deps = { fetchFn: fetchFn as unknown as typeof fetch, sleep };
  return { deps, fetchFn, sleep };
}

const FISHER = {
  payload: {
    artist_mbid: MBID,
    artist_name: 'FISHER',
    from_ts: 1104537600,
    last_updated: 1757030400,
    range: 'all_time',
    total_listen_count: 69448,
    total_user_count: 5051,
  },
};

describe('fetchListeners', () => {
  it('asks the listeners endpoint and reads the three payload fields', async () => {
    const { deps, fetchFn } = setup([() => json(FISHER)]);
    const result = await fetchListeners(MBID, 'FISHER', deps);
    expect(fetchFn.mock.calls[0][0]).toBe(
      'https://api.listenbrainz.org/1/stats/artist/' +
        '886dc0c9-3351-4d2d-b762-060cf1e66929/listeners'
    );
    // The run stamps rows for artists it never asked about with this url.
    expect(listenersUrl(MBID)).toBe(fetchFn.mock.calls[0][0]);
    expect(result).toEqual({
      status: 'ok',
      value: 5051,
      listens: 69448,
      sourceUrl: LISTENERS_URL,
    });
  });

  it('reads the counts under payload only, never from the top level', async () => {
    const { deps } = setup([
      () => json({ artist_name: 'FISHER', total_user_count: 5051 }),
    ]);
    const result = await fetchListeners(MBID, 'FISHER', deps);
    expect(result.status).toBe('notFound');
    expect(result.value).toBeNull();
  });

  it('reads a 204 with an empty body as notFound', async () => {
    const { deps, fetchFn, sleep } = setup([
      () => new Response(null, { status: 204 }),
    ]);
    const result = await fetchListeners(MBID, 'Hugo LX', deps);
    expect(result).toEqual({
      status: 'notFound',
      value: null,
      listens: null,
      sourceUrl: LISTENERS_URL,
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('reads a payload without total_user_count as notFound', async () => {
    const { deps } = setup([
      () => json({ payload: { artist_name: 'FISHER', listeners: [] } }),
    ]);
    const result = await fetchListeners(MBID, 'FISHER', deps);
    expect(result.status).toBe('notFound');
    expect(result.listens).toBeNull();
  });

  it('stores no number when the echoed name is another artist', async () => {
    const { deps } = setup([
      () =>
        json({ payload: { ...FISHER.payload, artist_name: 'India Fisher' } }),
    ]);
    const result = await fetchListeners(MBID, 'FISHER', deps);
    expect(result.status).toBe('notFound');
    expect(result.value).toBeNull();
  });

  it('stores no number when the payload echoes no name at all', async () => {
    const { deps } = setup([
      () => json({ payload: { total_user_count: 5051 } }),
    ]);
    const result = await fetchListeners(MBID, 'FISHER', deps);
    expect(result.status).toBe('notFound');
  });

  it('accepts a name differing only by case, accents or punctuation', async () => {
    const shouty = setup([
      () => json({ payload: { artist_name: 'ANETHA', total_user_count: 705 } }),
    ]);
    expect((await fetchListeners(MBID, 'Anetha', shouty.deps)).value).toBe(705);
    const accented = setup([
      () =>
        json({
          payload: { artist_name: 'Étienne de Crécy', total_user_count: 12 },
        }),
    ]);
    expect(
      (await fetchListeners(MBID, 'Etienne de Crecy', accented.deps)).value
    ).toBe(12);
  });

  it('reads a 404 as notFound', async () => {
    const { deps, fetchFn } = setup([() => json({ error: 'not found' }, 404)]);
    const result = await fetchListeners(MBID, 'FISHER', deps);
    expect(result.status).toBe('notFound');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('waits Retry-After seconds on 429 and repeats the same request', async () => {
    const { deps, fetchFn, sleep } = setup([
      () => json({}, 429, { 'Retry-After': '3' }),
      () => json(FISHER),
    ]);
    const result = await fetchListeners(MBID, 'FISHER', deps);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([3000]);
    expect(fetchFn.mock.calls[1][0]).toBe(fetchFn.mock.calls[0][0]);
    expect(result.value).toBe(5051);
  });

  it('waits ten seconds without a header and gives up after five 429s', async () => {
    const { deps, fetchFn, sleep } = setup(
      Array.from({ length: 6 }, () => () => json({}, 429))
    );
    const result = await fetchListeners(MBID, 'FISHER', deps);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([
      10_000, 10_000, 10_000, 10_000, 10_000,
    ]);
    expect(fetchFn).toHaveBeenCalledTimes(6);
    expect(result).toEqual({
      status: 'retryLater',
      value: null,
      listens: null,
      sourceUrl: LISTENERS_URL,
    });
    expect(result.pauseForMs).toBeUndefined();
  });

  it('pauses the source when Retry-After asks for more than a minute', async () => {
    const { deps, fetchFn, sleep } = setup([
      () => json({}, 429, { 'Retry-After': '7200' }),
    ]);
    const result = await fetchListeners(MBID, 'FISHER', deps);
    expect(result.status).toBe('retryLater');
    expect(result.pauseForMs).toBe(7_200_000);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('backs off three times on 503 and then asks for a retry later', async () => {
    const { deps, fetchFn, sleep } = setup(
      Array.from({ length: 4 }, () => () => json({}, 503))
    );
    const result = await fetchListeners(MBID, 'FISHER', deps);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([2000, 4000, 8000]);
    expect(fetchFn).toHaveBeenCalledTimes(4);
    expect(result.status).toBe('retryLater');
    expect(result.pauseForMs).toBeUndefined();
  });

  it('treats an aborted request as a transport failure, then retries later', async () => {
    const abort = () =>
      Promise.reject(
        new DOMException('The operation was aborted.', 'TimeoutError')
      );
    const { deps, sleep } = setup([abort, abort, abort, abort]);
    const result = await fetchListeners(MBID, 'FISHER', deps);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([2000, 4000, 8000]);
    expect(result.status).toBe('retryLater');
    const recovered = setup([abort, () => json(FISHER)]);
    expect((await fetchListeners(MBID, 'FISHER', recovered.deps)).value).toBe(
      5051
    );
  });

  it('retries a truncated body instead of reporting no listeners', async () => {
    const { deps, fetchFn } = setup([
      () =>
        new Response('{"payload":{', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      () => json(FISHER),
    ]);
    const result = await fetchListeners(MBID, 'FISHER', deps);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(result.value).toBe(5051);
  });

  it('treats an authentication wall as retryLater, never notFound', async () => {
    const { deps, fetchFn } = setup(
      Array.from({ length: 4 }, () => () => json({ code: 401 }, 401))
    );
    const result = await fetchListeners(MBID, 'FISHER', deps);
    expect(result.status).toBe('retryLater');
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it('aborts a hung request after fifteen seconds', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const { deps, fetchFn } = setup([() => json(FISHER)]);
    await fetchListeners(MBID, 'FISHER', deps);
    expect(timeout).toHaveBeenCalledWith(15_000);
    expect(fetchFn.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    timeout.mockRestore();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/features/listenbrainz.test.ts`

Expected: `Test Files  1 failed (1)`, `Tests  no tests` — the file cannot be
imported at all, because the module it tests does not exist yet:

```
 ❯ src/features/listenbrainz.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/features/listenbrainz.test.ts [ src/features/listenbrainz.test.ts ]
Error: Cannot find module './listenbrainz' imported from /…/src/features/listenbrainz.test.ts
 ❯ src/features/listenbrainz.test.ts:2:1
      1| import { describe, expect, it, vi } from 'vitest';
      2| import {
       | ^
      3|   LISTENBRAINZ_STATS_URL,
      4|   fetchListeners,
```

- [ ] **Step 3: Implement `src/features/listenbrainz.ts`**

Create `src/features/listenbrainz.ts`:

```ts
import type { ReachStatus } from '../db/schema';
import { normalize } from '../model/normalize';
import {
  MAX_5XX_RETRIES,
  REACH_REQUEST_TIMEOUT_MS,
  backoffMs,
  parseRetryAfter,
} from '../util/retry';

/** The MBID and `/listeners` complete the URL. */
export const LISTENBRAINZ_STATS_URL =
  'https://api.listenbrainz.org/1/stats/artist';

/** "never more than ONE call per second" — the documented limit. */
export const LB_INTERVAL_MS = 1000;

const MAX_429_RETRIES = 5;
const DEFAULT_RETRY_AFTER_S = 10;
/** Above this the source pauses for the run instead of hanging the card. */
const MAX_RETRY_AFTER_S = 60;

export interface ListenBrainzDeps {
  fetchFn: typeof fetch;
  sleep: (ms: number) => Promise<void>;
}

export interface ListenersResult {
  status: ReachStatus;
  /** `payload.total_user_count`; null unless `status` is 'ok'. */
  value: number | null;
  /** `payload.total_listen_count`; null unless `status` is 'ok'. */
  listens: number | null;
  /** The request URL, kept as the row's provenance. */
  sourceUrl: string;
  /**
   * Set only when ListenBrainz asked for a wait longer than a minute: the
   * caller pauses the source for the rest of the run and stamps the later of
   * `now + pauseForMs` and the one-day floor on the `retryLater` rows it
   * writes for the artists still owed a request.
   */
  pauseForMs?: number;
}

/**
 * The request URL, exported because the run stamps `sourceUrl` on rows for
 * artists it never asked about — the ones still owed a request when
 * ListenBrainz names a wait longer than a minute (spec §4.3).
 *
 * The MBID is MusicBrainz's own `relation.artist.id`, so it is UUID-shaped
 * and encoding it changes nothing; it is defence against a future shape.
 * Wikipedia titles are the opposite case and must not be encoded (§3.2).
 */
export function listenersUrl(mbid: string): string {
  return `${LISTENBRAINZ_STATS_URL}/${encodeURIComponent(mbid)}/listeners`;
}

function field(raw: unknown, name: string): unknown {
  if (typeof raw !== 'object' || raw === null) return undefined;
  return (raw as Record<string, unknown>)[name];
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * One artist's `total_user_count`, with its own 429 and 5xx retries.
 *
 * `notFound` is reserved for the four answers that really mean "no number for
 * this artist": a 204, a 404, a payload without a finite `total_user_count`,
 * and a name the artist does not answer to. Every other non-2xx — a 401 the
 * day the endpoint moves behind auth included — is `retryLater`, so the run
 * pauses the source instead of writing a thirty-day `notFound` over the whole
 * library. Pacing (`LB_INTERVAL_MS`) belongs to the caller.
 */
export async function fetchListeners(
  mbid: string,
  name: string,
  deps: ListenBrainzDeps
): Promise<ListenersResult> {
  const sourceUrl = listenersUrl(mbid);
  const miss = (): ListenersResult => ({
    status: 'notFound',
    value: null,
    listens: null,
    sourceUrl,
  });
  const later = (pauseForMs?: number): ListenersResult => ({
    status: 'retryLater',
    value: null,
    listens: null,
    sourceUrl,
    pauseForMs,
  });
  let attempts429 = 0;
  let attempts5xx = 0;

  /** Counts, backs off and reports whether the caller should retry. */
  async function retryTransport(): Promise<boolean> {
    attempts5xx += 1;
    if (attempts5xx > MAX_5XX_RETRIES) return false;
    await deps.sleep(backoffMs(attempts5xx));
    return true;
  }

  for (;;) {
    let res: Response;
    try {
      res = await deps.fetchFn(sourceUrl, {
        signal: AbortSignal.timeout(REACH_REQUEST_TIMEOUT_MS),
      });
    } catch {
      // An abort and a dropped connection are the same thing here: no answer.
      if (await retryTransport()) continue;
      return later();
    }
    if (res.status === 429) {
      const seconds = parseRetryAfter(res.headers.get('Retry-After'));
      if (seconds !== null && seconds > MAX_RETRY_AFTER_S) {
        return later(seconds * 1000);
      }
      attempts429 += 1;
      if (attempts429 > MAX_429_RETRIES) return later();
      await deps.sleep((seconds ?? DEFAULT_RETRY_AFTER_S) * 1000);
      continue;
    }
    // 204 is `ok` as far as `Response` is concerned, and carries no body.
    if (res.status === 204 || res.status === 404) return miss();
    if (!res.ok) {
      if (await retryTransport()) continue;
      return later();
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      // A truncated 200 is a transport failure, not "no listeners".
      if (await retryTransport()) continue;
      return later();
    }
    const payload = field(body, 'payload');
    const value = num(field(payload, 'total_user_count'));
    if (value === null) return miss();
    const echoed = field(payload, 'artist_name');
    if (typeof echoed !== 'string' || normalize(echoed) !== normalize(name)) {
      return miss();
    }
    return {
      status: 'ok',
      value,
      listens: num(field(payload, 'total_listen_count')),
      sourceUrl,
    };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/features/listenbrainz.test.ts`
Expected: PASS, `Test Files  1 passed (1)`, `Tests  16 passed (16)`.

Run: `yarn typecheck && yarn lint && yarn test`
Expected: all three pass; `Test Files  34 passed (34)`,
`Tests  355 passed (355)` — 339 in 33 files at the end of Task 2, plus these
16.

- [ ] **Step 5: Commit**

```bash
yarn format
git add src/features/listenbrainz.ts src/features/listenbrainz.test.ts
git commit -m "feat(features): ListenBrainz listeners client

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

- [ ] **Step 6: Write the failing Wikipedia pageviews test**

Create `src/features/wikipedia.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  PAGEVIEWS_URL,
  WIKIPEDIA_INTERVAL_MS,
  fetchPageviews,
  pageviewWindow,
} from './wikipedia';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** 5 Sep 2026, the day the spec computes its worked example for. */
const NOW = Date.UTC(2026, 8, 5, 11, 30);

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/** One `items[]` entry per month, so a body is one call away from a sum. */
function views(...monthly: number[]): Response {
  return json({
    items: monthly.map((v, i) => ({
      project: 'en.wikipedia',
      article: 'Anetha',
      granularity: 'monthly',
      timestamp: `2025${String(9 + i).padStart(2, '0')}0100`,
      access: 'all-access',
      agent: 'user',
      views: v,
    })),
  });
}

function setup(responses: Array<() => Response | Promise<Response>>) {
  const fetchFn = vi.fn<FetchLike>(async () => {
    const next = responses.shift();
    if (!next) throw new Error('unexpected extra request');
    return next();
  });
  const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
  const deps = {
    fetchFn: fetchFn as unknown as typeof fetch,
    sleep,
    now: () => NOW,
  };
  return { deps, fetchFn, sleep };
}

function urlFor(project: string, title: string): string {
  return (
    `${PAGEVIEWS_URL}/${project}/all-access/user/${title}` +
    '/monthly/2025090100/2026083100'
  );
}

describe('pageviewWindow', () => {
  it('spans the twelve complete months before the current one', () => {
    expect(pageviewWindow(NOW)).toEqual({
      start: '2025090100',
      end: '2026083100',
    });
  });

  it('gives the same window on the first and the last day of a month', () => {
    const first = pageviewWindow(Date.UTC(2026, 8, 1, 0, 0));
    const last = pageviewWindow(Date.UTC(2026, 8, 30, 23, 59));
    expect(first).toEqual({ start: '2025090100', end: '2026083100' });
    expect(last).toEqual(first);
    // The day before is one month earlier on both ends, never a partial month.
    expect(pageviewWindow(Date.UTC(2026, 7, 31, 23, 59))).toEqual({
      start: '2025080100',
      end: '2026073100',
    });
  });

  it('crosses a year boundary and lands on short months', () => {
    expect(pageviewWindow(Date.UTC(2026, 0, 15))).toEqual({
      start: '2025010100',
      end: '2025123100',
    });
    // March: the window ends on 28 or 29 February, not on the 30th.
    expect(pageviewWindow(Date.UTC(2027, 2, 10))).toEqual({
      start: '2026030100',
      end: '2027022800',
    });
    expect(pageviewWindow(Date.UTC(2028, 2, 10))).toEqual({
      start: '2027030100',
      end: '2028022900',
    });
  });

  it('reads the clock in UTC, not in the device zone', () => {
    // Half an hour after midnight UTC on 1 September is still 31 August in
    // every western zone; half an hour before it is already 1 September in
    // every eastern one. Both must answer with the September window.
    expect(pageviewWindow(Date.UTC(2026, 8, 1, 0, 30))).toEqual({
      start: '2025090100',
      end: '2026083100',
    });
    expect(pageviewWindow(Date.UTC(2026, 7, 31, 23, 30))).toEqual({
      start: '2025080100',
      end: '2026073100',
    });
  });
});

describe('fetchPageviews', () => {
  it('asks both projects with the stored title verbatim, paced apart', async () => {
    const { deps, fetchFn, sleep } = setup([() => views(1), () => views(2)]);
    await fetchPageviews(
      { en: '%C3%89tienne_de_Cr%C3%A9cy', fr: 'Anetha' },
      deps
    );
    expect(fetchFn.mock.calls.map((c) => c[0])).toEqual([
      'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article' +
        '/en.wikipedia.org/all-access/user/%C3%89tienne_de_Cr%C3%A9cy' +
        '/monthly/2025090100/2026083100',
      urlFor('fr.wikipedia.org', 'Anetha'),
    ]);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([WIKIPEDIA_INTERVAL_MS]);
    expect(WIKIPEDIA_INTERVAL_MS).toBe(250);
  });

  it('sums English and French views and keeps both parts', async () => {
    const { deps } = setup([() => views(3227), () => views(4000, 300, 31)]);
    const result = await fetchPageviews({ en: 'Anetha', fr: 'Anetha' }, deps);
    expect(result).toEqual({
      status: 'ok',
      value: 7558,
      en: 3227,
      fr: 4331,
      months: 12,
      sourceUrl: urlFor('en.wikipedia.org', 'Anetha'),
    });
  });

  it('counts a 404 on one language as zero and cites the one that answered', async () => {
    const { deps } = setup([
      () => json({ title: 'Not found.' }, 404),
      () => views(2791),
    ]);
    const result = await fetchPageviews(
      { en: 'Roza_Terenzi', fr: 'Roza_Terenzi' },
      deps
    );
    expect(result).toEqual({
      status: 'ok',
      value: 2791,
      en: 0,
      fr: 2791,
      months: 12,
      sourceUrl: urlFor('fr.wikipedia.org', 'Roza_Terenzi'),
    });
  });

  it('reads a 404 on both languages as notFound with no number', async () => {
    const { deps, fetchFn } = setup([
      () => json({ title: 'Not found.' }, 404),
      () => json({ title: 'Not found.' }, 404),
    ]);
    const result = await fetchPageviews({ en: 'Nobody', fr: 'Nobody' }, deps);
    expect(result).toEqual({
      status: 'notFound',
      value: null,
      en: null,
      fr: null,
      months: 12,
      sourceUrl: urlFor('en.wikipedia.org', 'Nobody'),
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('keeps an all-zero answer as ok with zero, not as notFound', async () => {
    const { deps } = setup([() => views(0, 0, 0)]);
    const result = await fetchPageviews({ en: 'Quiet_Artist', fr: null }, deps);
    expect(result.status).toBe('ok');
    expect(result.value).toBe(0);
    expect(result.en).toBe(0);
    expect(result.fr).toBeNull();
  });

  it('asks only for the language it holds a title for', async () => {
    const { deps, fetchFn, sleep } = setup([() => views(6464)]);
    const result = await fetchPageviews(
      { en: null, fr: 'Shanti_Celeste' },
      deps
    );
    expect(fetchFn.mock.calls.map((c) => c[0])).toEqual([
      urlFor('fr.wikipedia.org', 'Shanti_Celeste'),
    ]);
    expect(sleep).not.toHaveBeenCalled();
    expect(result.value).toBe(6464);
    expect(result.en).toBeNull();
  });

  it('ignores an item whose views field is not a number', async () => {
    const { deps } = setup([
      () =>
        json({
          items: [
            { timestamp: '2025090100', views: 100 },
            { timestamp: '2025100100', views: null },
            { timestamp: '2025110100' },
          ],
        }),
    ]);
    const result = await fetchPageviews({ en: 'Anz', fr: null }, deps);
    expect(result.value).toBe(100);
  });

  it('reports retryLater and no partial sum when a language keeps failing', async () => {
    const { deps, fetchFn, sleep } = setup([
      () => views(3227),
      () => json({}, 503),
      () => json({}, 503),
      () => json({}, 503),
      () => json({}, 503),
    ]);
    const result = await fetchPageviews({ en: 'Anetha', fr: 'Anetha' }, deps);
    expect(result).toEqual({
      status: 'retryLater',
      value: null,
      en: null,
      fr: null,
      months: 12,
      sourceUrl: urlFor('en.wikipedia.org', 'Anetha'),
    });
    expect(fetchFn).toHaveBeenCalledTimes(5);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([250, 2000, 4000, 8000]);
  });

  it('treats an aborted request as a transport failure', async () => {
    const abort = () =>
      Promise.reject(
        new DOMException('The operation was aborted.', 'TimeoutError')
      );
    const { deps } = setup([abort, abort, abort, abort]);
    const result = await fetchPageviews({ en: 'Anetha', fr: null }, deps);
    expect(result.status).toBe('retryLater');
    const recovered = setup([abort, () => views(42)]);
    const second = await fetchPageviews(
      { en: 'Anetha', fr: null },
      recovered.deps
    );
    expect(second.value).toBe(42);
  });

  it('makes no request at all when neither language has a title', async () => {
    const { deps, fetchFn } = setup([]);
    const result = await fetchPageviews({ en: null, fr: null }, deps);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'notFound',
      value: null,
      en: null,
      fr: null,
      months: 12,
      sourceUrl: '',
    });
  });

  it('aborts each hung request after fifteen seconds', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const { deps, fetchFn } = setup([() => views(1), () => views(1)]);
    await fetchPageviews({ en: 'Anz', fr: 'Anz' }, deps);
    expect(timeout.mock.calls).toEqual([[15_000], [15_000]]);
    expect(fetchFn.mock.calls[1][1]?.signal).toBeInstanceOf(AbortSignal);
    timeout.mockRestore();
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `yarn test src/features/wikipedia.test.ts`

Expected: `Test Files  1 failed (1)`, `Tests  no tests`:

```
 ❯ src/features/wikipedia.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/features/wikipedia.test.ts [ src/features/wikipedia.test.ts ]
Error: Cannot find module './wikipedia' imported from /…/src/features/wikipedia.test.ts
 ❯ src/features/wikipedia.test.ts:2:1
      1| import { describe, expect, it, vi } from 'vitest';
      2| import {
       | ^
      3|   PAGEVIEWS_URL,
      4|   WIKIPEDIA_INTERVAL_MS,
```

- [ ] **Step 8: Implement `src/features/wikipedia.ts`**

Create `src/features/wikipedia.ts`:

```ts
import type { ReachStatus } from '../db/schema';
import {
  MAX_5XX_RETRIES,
  REACH_REQUEST_TIMEOUT_MS,
  backoffMs,
  parseRetryAfter,
} from '../util/retry';

/** Project, title and the window complete the URL. */
export const PAGEVIEWS_URL =
  'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article';

/** The two languages this app asks for, in the order it asks them. */
export const WIKIPEDIA_PROJECTS = {
  en: 'en.wikipedia.org',
  fr: 'fr.wikipedia.org',
} as const;

/** No rate limit is documented; four requests per second is the ruling. */
export const WIKIPEDIA_INTERVAL_MS = 250;

/** The window is the last twelve *complete* months, in UTC. */
export const PAGEVIEW_MONTHS = 12;

const MAX_429_RETRIES = 5;
const DEFAULT_RETRY_AFTER_S = 10;
const MAX_RETRY_AFTER_S = 60;

export type WikiLang = keyof typeof WIKIPEDIA_PROJECTS;

/** `ArtistIdentityRow.wikiTitles`: sitelink segments, or null. */
export interface WikiTitles {
  en: string | null;
  fr: string | null;
}

export interface PageviewWindow {
  /** `YYYYMMDD00`, the first day of the oldest month in the window. */
  start: string;
  /** `YYYYMMDD00`, the last day of the newest complete month. */
  end: string;
}

export interface WikipediaDeps {
  fetchFn: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

export interface PageviewsResult {
  status: ReachStatus;
  /** en + fr views over the window; null unless `status` is 'ok'. */
  value: number | null;
  /** Per-language sums: null when unasked or unusable, 0 on a 404. */
  en: number | null;
  fr: number | null;
  /** The window length, always `PAGEVIEW_MONTHS`. */
  months: number;
  /**
   * The URL of the first language that answered 200, else the first URL
   * asked, else '' when neither language had a title.
   */
  sourceUrl: string;
}

/** `YYYYMMDD00` in UTC. */
function stamp(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}00`;
}

/**
 * The last `PAGEVIEW_MONTHS` complete months before `now`. The month in
 * progress is excluded: a partial bucket reads as a collapse (Kettama's
 * August-2026 bucket is 402 against a 12,791 monthly average). UTC, because
 * the API is UTC-dated — unlike the Crate's deliberately local month buckets.
 */
export function pageviewWindow(now: number): PageviewWindow {
  const asked = new Date(now);
  const year = asked.getUTCFullYear();
  const month = asked.getUTCMonth();
  // Day 0 of the current month is the last day of the previous one, and
  // Date.UTC rolls a negative month back into the previous year on its own.
  return {
    start: stamp(new Date(Date.UTC(year, month - PAGEVIEW_MONTHS, 1))),
    end: stamp(new Date(Date.UTC(year, month, 0))),
  };
}

function field(raw: unknown, name: string): unknown {
  if (typeof raw !== 'object' || raw === null) return undefined;
  return (raw as Record<string, unknown>)[name];
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** One language: the summed views, `'notFound'` on a 404, or `'retryLater'`. */
async function fetchOne(
  url: string,
  deps: WikipediaDeps
): Promise<number | 'notFound' | 'retryLater'> {
  let attempts429 = 0;
  let attempts5xx = 0;

  async function retryTransport(): Promise<boolean> {
    attempts5xx += 1;
    if (attempts5xx > MAX_5XX_RETRIES) return false;
    await deps.sleep(backoffMs(attempts5xx));
    return true;
  }

  for (;;) {
    let res: Response;
    try {
      res = await deps.fetchFn(url, {
        signal: AbortSignal.timeout(REACH_REQUEST_TIMEOUT_MS),
      });
    } catch {
      if (await retryTransport()) continue;
      return 'retryLater';
    }
    // The one status that means "this article has no data", never a failure.
    if (res.status === 404) return 'notFound';
    if (res.status === 429) {
      const seconds = parseRetryAfter(res.headers.get('Retry-After'));
      if (seconds !== null && seconds > MAX_RETRY_AFTER_S) return 'retryLater';
      attempts429 += 1;
      if (attempts429 > MAX_429_RETRIES) return 'retryLater';
      await deps.sleep((seconds ?? DEFAULT_RETRY_AFTER_S) * 1000);
      continue;
    }
    if (!res.ok) {
      if (await retryTransport()) continue;
      return 'retryLater';
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      if (await retryTransport()) continue;
      return 'retryLater';
    }
    const items = field(body, 'items');
    let total = 0;
    for (const item of Array.isArray(items) ? items : []) {
      total += num(field(item, 'views')) ?? 0;
    }
    return total;
  }
}

/**
 * The en + fr view total over the last twelve complete months. Titles are the
 * stored sitelink segments and go into the path **verbatim**: they are already
 * percent-encoded, and a decode/re-encode round trip would break them.
 *
 * A 404 for one language contributes 0; a 404 for both is `notFound`. A
 * transport failure or a 5xx past its retries on either language makes the
 * whole result `retryLater` and stores no number at all — a partial sum kept
 * as `ok` would sit behind the ninety-day TTL and understate the artist.
 */
export async function fetchPageviews(
  titles: WikiTitles,
  deps: WikipediaDeps
): Promise<PageviewsResult> {
  const span = pageviewWindow(deps.now());
  const sums: Record<WikiLang, number | null> = { en: null, fr: null };
  let firstUrl = '';
  let okUrl = '';
  let answered = false;

  for (const lang of ['en', 'fr'] as WikiLang[]) {
    const title = titles[lang];
    if (title === null) continue;
    const project = WIKIPEDIA_PROJECTS[lang];
    const url =
      `${PAGEVIEWS_URL}/${project}/all-access/user/${title}` +
      `/monthly/${span.start}/${span.end}`;
    if (firstUrl === '') firstUrl = url;
    else await deps.sleep(WIKIPEDIA_INTERVAL_MS);
    const one = await fetchOne(url, deps);
    if (one === 'retryLater') {
      return {
        status: 'retryLater',
        value: null,
        en: null,
        fr: null,
        months: PAGEVIEW_MONTHS,
        sourceUrl: okUrl === '' ? firstUrl : okUrl,
      };
    }
    if (one === 'notFound') {
      sums[lang] = 0;
      continue;
    }
    sums[lang] = one;
    if (!answered) {
      okUrl = url;
      answered = true;
    }
  }

  if (!answered) {
    return {
      status: 'notFound',
      value: null,
      en: null,
      fr: null,
      months: PAGEVIEW_MONTHS,
      sourceUrl: firstUrl,
    };
  }
  return {
    status: 'ok',
    value: (sums.en ?? 0) + (sums.fr ?? 0),
    en: sums.en,
    fr: sums.fr,
    months: PAGEVIEW_MONTHS,
    sourceUrl: okUrl,
  };
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `yarn test src/features/wikipedia.test.ts`
Expected: PASS, `Test Files  1 passed (1)`, `Tests  15 passed (15)` — four for
`pageviewWindow`, eleven for `fetchPageviews`.

Run: `yarn typecheck && yarn lint && yarn test && yarn build`
Expected: all four pass; `Test Files  35 passed (35)`,
`Tests  370 passed (370)`. This task adds **31 tests in 2 files**.

Run: `npx prettier --check "src/**/*.ts"`
Expected: `All matched files use Prettier code style!`

- [ ] **Step 10: Commit**

```bash
yarn format
git add src/features/wikipedia.ts src/features/wikipedia.test.ts
git commit -m "feat(features): Wikipedia pageviews client, twelve complete UTC months

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

---
### Task 4: The resumable reach run

**Files:**

- Create: `src/features/reachRun.ts`
- Modify: none. Task 1 owns `src/db/schema.ts`, `src/db/repo.ts`,
  `src/model/aggregate.ts` and `src/model/reach.ts`; Tasks 2 and 3 own the five
  clients and `src/features/jsonp.ts`. This task only imports from them and must
  not edit them. `src/model/state.ts` and `src/ui/Settings.tsx` stay untouched
  too: the card that starts the run is a later task, and nothing here is
  reachable from a screen yet.
- Test: `src/features/reachRun.test.ts`

**Interfaces:**

- Consumes, from Task 1:
  - `src/db/schema.ts`: `ResolveStatus`, `ReachSource`, `ReachStatus`,
    `ArtistIdentityRow` (with `qidCheckedAt`), `ArtistReachRow`, `TrackRow`,
    `reachKey(artistId, source)`, and `AllRows.artistIdentity` /
    `.artistReach`, so every `buildModel` fixture in this task's test passes
    both as `[]`.
  - `src/db/repo.ts`: `putIdentities(rows)` and `putReach(rows)` — batch
    upserts shaped like `putFeatures`, one transaction, a no-op on an empty
    array — plus the existing `putMeta`, `getMeta<T>`, `getAllRows` and
    `wipeDb`. The `artistIdentity` store is keyed on `artistId`, `artistReach`
    on `key`.
  - `src/model/reach.ts`: `isWellKnown(identity)` — the summary's `wellKnown`
    count calls it, so the list screen and the stored record cannot disagree
    about what "well known" means — and the `ReachCoverage` interface, which
    `ArtistReachSummary` extends. **`model/reach.ts` must not import
    `features/reachRun.ts`**, or the two form a module cycle.
  - `src/model/aggregate.ts`: `Model` with `artists: ArtistAgg[]` and
    `tracksByKey: Map<string, TrackRow>`.
- Consumes, from Tasks 2 and 3 — the exact names and shapes those tasks ship:
  - `src/features/musicbrainz.ts`: `MUSICBRAINZ_URL`, `fetchMbid(artistId,
    deps): Promise<MbResult>` where `MbResult` is the `ok` / `notFound` /
    `retryLater` union. The client sleeps `MB_INTERVAL_MS` itself.
  - `src/features/listenbrainz.ts`: `LISTENBRAINZ_STATS_URL`, `LB_INTERVAL_MS`,
    `listenersUrl(mbid)`, `fetchListeners(mbid, name, deps):
    Promise<ListenersResult>` with `status`, `value`, `listens`, `sourceUrl`
    and the optional `pauseForMs`.
  - `src/features/deezer.ts`: `DEEZER_API`, `candidateIsrcs(artistId, tracks)`,
    `resolveDeezerArtist(name, isrcs, deps): Promise<DeezerIdentity>` (which
    owns the 3-candidate cap and the name check), `fetchDeezerFans(artistId,
    deps): Promise<DeezerFans>` — each arm carrying its own `sourceUrl`. The
    client sleeps `DEEZER_INTERVAL_MS` itself, and its URLs already carry
    `?output=jsonp`.
  - `src/features/wikidata.ts`: `WIKIDATA_URL`, `wikidataBatches(ids)`,
    `resolveBySpotifyId(ids, deps)`, `resolveByMbid(mbids, deps)` — one POST
    per call, the runner chunks — `WikidataHit`, and `needsWikidata(row, now,
    ttl)`.
  - `src/features/wikipedia.ts`: `PAGEVIEWS_URL`, `WIKIPEDIA_INTERVAL_MS`,
    `fetchPageviews(titles, deps): Promise<PageviewsResult>`. `deps.now()` is
    where the client reads the clock.
  - Every client deps interface is a structural subset of `ReachDeps`, so
    `runReach` passes its own `deps` straight through, exactly as `runLookup`
    passes `LookupDeps` to `fetchAudioFeatures(ids, deps)`.
- Consumes, existing: `storageMessage(err: unknown): string` from
  `src/util/errors.ts`, which turns a `QuotaExceededError` into
  `Local storage is full. Free space on the phone and try again.`
- Produces, for Task 5 (`src/model/state.ts` and the Settings card):

  ```ts
  export const ARTIST_REACH_SUMMARY_META = 'artistReachSummary';
  export const REACH_TTL_MS = 90 * 24 * 60 * 60 * 1000;
  export const REACH_NOT_FOUND_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  export const REACH_RETRY_LATER_TTL_MS = 24 * 60 * 60 * 1000;
  export const MAX_SOURCE_FAILURES = 3;

  export type ReachStep = ReachSource | 'musicbrainz' | 'wikidata';

  export interface ArtistReachSummary extends ReachCoverage {
    version: 1;
    ranAt: number;
    paused: ReachStep[];
  }

  export interface ReachRunCounts {
    lookedUp: number;
    written: number;
    unresolved: number;
  }

  export type ReachState =
    | { status: 'idle' }
    | {
        status: 'running';
        step: ReachStep;
        done: number;
        total: number;
        paused: ReachStep[];
      }
    | {
        status: 'done';
        summary: ArtistReachSummary;
        run: ReachRunCounts;
        paused: ReachStep[];
      }
    | { status: 'error'; message: string; paused: ReachStep[] };

  export interface ReachDeps {
    fetchFn: typeof fetch;
    jsonpFn: (url: string, timeoutMs: number) => Promise<unknown>;
    sleep: (ms: number) => Promise<void>;
    now: () => number;
    onState: (state: ReachState) => void;
    acquireWakeLock?: () => Promise<() => Promise<void>>;
  }

  export interface ReachCandidate {
    artistId: string;
    name: string;
    isrcs: string[];
  }

  export function reachCandidates(model: Model): ReachCandidate[];
  export function runReach(
    deps: ReachDeps,
    candidates: ReachCandidate[],
    identities: ArtistIdentityRow[],
    reach: ArtistReachRow[]
  ): Promise<void>;
  ```

  `ReachCoverage` is **not** declared here (decision 2): it is
  `src/model/reach.ts`'s, and this file extends it. `MAX_RETRY_AFTER_MS` is not
  declared either (decision 10): the >60 s rule lives inside `listenbrainz.ts`,
  which is what sets `pauseForMs`.

**Notes — twelve points the spec left open, settled here:**

1. **Pacing is split** (decision 8). MusicBrainz and Deezer sleep their own
   interval; `runReach` sleeps `LB_INTERVAL_MS` before every ListenBrainz
   request and `WIKIPEDIA_INTERVAL_MS` before every artist's pageviews call,
   because those two clients sleep only for their own retries. The first test
   asserts the whole sequence `[1000, 1000, 1000, 1000, 250, 250, 250, 250,
   250, 250]` for a two-artist library, so a change on either side of the split
   fails loudly.
2. **The runner chunks for Wikidata; the client does one POST per call**
   (decision 9). It is what lets `running.total` count batches for spec §5.5's
   `unit="batches"`, and what lets `total` grow when pass 2 starts — exactly as
   `runLookup`'s does when its ISRC pass starts.
3. **`retryAfter` on an identity row is written only by a `retryLater` step.**
   §4.5: "that is the field's only writer and the only thing that gates a
   `retryLater` retry." One row carries three steps, so an `ok` or `notFound`
   write leaves the field exactly as it found it; nulling it would clear
   another step's gate.
4. **Every write persists before the in-memory map is updated.** A
   `putIdentities` or `putReach` that rejects must not leave the run's own view
   of the store ahead of IndexedDB — otherwise the summary written on the error
   path counts a row that was never stored. The storage-failure test asserts
   `covered: 0` and pins this.
5. **Freshness for the MBID and Deezer steps is judged on the row as the run
   found it** (decision 7): `startRows` is an immutable snapshot, while every
   *value* comes from the live map the phases update. The Wikidata gate needs
   no snapshot at all now that it reads `qidCheckedAt`, but it is passed the
   snapshot for consistency and because a same-run `retryAfter` write must not
   gate it either.
6. **`lookedUp` counts artists this run issued at least one request for.** A
   Wikidata batch counts every id it carried, because the POST did ask about
   them; the Deezer "no single-artist ISRC" path counts none, because it asks
   nothing. `written` counts `ok` **reach** rows only — identity rows are not
   numbers, and §5.5 reads the line as "158 new numbers". `unresolved` is
   `summary.artists - summary.covered`, the whole-store figure §5.5 asks for.
7. **The two pause flavours differ, and both are tested.** §4.3's `Retry-After`
   above 60 s pauses ListenBrainz *and* writes a `retryLater` row for every
   artist still owed a request in that phase; §4.5's three consecutive failures
   pause the source and leave every artist it never reached exactly as it was.
8. **MBID, QID and Deezer artist id are permanent once `ok`.** The MusicBrainz
   and Deezer phases exclude an `ok` step whatever the clock says; the Wikidata
   phase deliberately re-includes an `ok` row past ninety days, because §2's
   well-known rule is the sitelink count and an artist who gains their first
   article must be able to move. A refresh that then finds nothing keeps the
   QID and only restarts the clock.
9. **Which store each phase writes.** MusicBrainz and Wikidata write
   `artistIdentity` only; ListenBrainz and Wikipedia write `artistReach` only;
   Deezer writes both, an identity row for the id and a reach row for `nb_fan`.
   That is why `ReachSource` (three) is narrower than `ReachStep` (five). Each
   write is one `putIdentities([row])` or `putReach([row])` — one transaction
   per artist, which is what §4.2's "checkpointed per artist" asks for.
10. **The error path writes the summary and swallows a second failure.** §2
    makes the meta row the gate, so a run that wrote three hundred rows and
    then failed must not leave the pre-run card on screen. If that write fails
    too, the first message is already on its way to the screen and must not be
    replaced.
11. **An id Wikidata bound to two items is an ordinary miss here** (decision
    14): absent from `hits`, so with an MBID it gets pass 2's `P434` key and
    otherwise it is written `qidStatus: 'notFound'`.
12. **`reachCandidates` writes no row**, but the Deezer phase writes
    `deezerStatus: 'notFound'` for an artist with no single-artist ISRC without
    issuing a request, which locks that artist out of Deezer for thirty days
    even if the library gains a qualifying track the next day. Spec §3.3 says
    `notFound`, so this follows it; a re-check on a library change is out of
    scope here.

`runReach` never throws, `reachState` is never persisted, and the model is
reloaded once by the caller after the run (Task 5) — this file
touches neither signal nor screen.

- [ ] **Step 1: Write the failing `reachCandidates` test**

Create `src/features/reachRun.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ArtistRef, TrackRow } from '../db/schema';
import { buildModel } from '../model/aggregate';
import { reachCandidates } from './reachRun';

describe('reachCandidates', () => {
  it('collects single-artist ISRCs, sorted and deduped, and skips id-less artists', () => {
    const hugo: ArtistRef = { id: 'a1', name: 'Hugo LX' };
    const peggy: ArtistRef = { id: 'a2', name: 'Peggy Gou' };
    const nameOnly: ArtistRef = { id: null, name: 'Nameless' };
    const track = (
      key: string,
      artists: ArtistRef[],
      isrc: string | null,
      isLocal = false
    ): TrackRow => ({
      key,
      id: isLocal ? null : key,
      uri: `spotify:track:${key}`,
      name: `Track ${key}`,
      artists,
      album: 'Album',
      durationMs: 300_000,
      isrc,
      spotifyUrl: null,
      isLocal,
    });
    const tracks = [
      track('t1', [hugo], 'fr-x01-00-00001'),
      track('t2', [hugo], 'FRX010000001'),
      track('t3', [hugo], 'aaa010000000'),
      track('t4', [hugo, peggy], 'GBX999999999'),
      track('t5', [hugo], null),
      track('t6', [hugo], 'ZZZ010000000', true),
      track('t7', [peggy], 'KRA000000002'),
      track('t8', [nameOnly], 'US0000000001'),
    ];
    const model = buildModel({
      playlists: [
        {
          id: 'p1',
          name: 'Crate',
          snapshotId: 's',
          itemCount: tracks.length,
          imageUrl: null,
          spotifyUrl: null,
          syncedAt: 1,
        },
      ],
      tracks,
      entries: tracks.map((t, position) => ({
        playlistId: 'p1',
        position,
        trackKey: t.key,
        addedAt: null,
      })),
      topItems: [],
      plays: [],
      features: [],
      artistIdentity: [],
      artistReach: [],
    });
    expect(reachCandidates(model)).toEqual([
      {
        artistId: 'a1',
        name: 'Hugo LX',
        isrcs: ['AAA010000000', 'FRX010000001'],
      },
      { artistId: 'a2', name: 'Peggy Gou', isrcs: ['KRA000000002'] },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/features/reachRun.test.ts`

Expected: `Test Files  1 failed (1)`, `Tests  no tests` — the file fails to
collect, not on an assertion, because `src/features/reachRun.ts` does not exist
yet:

```
 ❯ src/features/reachRun.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/features/reachRun.test.ts [ src/features/reachRun.test.ts ]
Error: Cannot find module './reachRun' imported from /…/src/features/reachRun.test.ts
 ❯ src/features/reachRun.test.ts:4:1
      2| import type { ArtistRef, TrackRow } from '../db/schema';
      3| import { buildModel } from '../model/aggregate';
      4| import { reachCandidates } from './reachRun';
       | ^
      5|
      6| describe('reachCandidates', () => {
```

- [ ] **Step 3: Write the constants, the state types and `reachCandidates`**

Create `src/features/reachRun.ts`. The client imports come in Step 7 — an
unused import fails `yarn lint`, so this file imports only what it uses:

```ts
import type { ReachSource, TrackRow } from '../db/schema';
import type { Model } from '../model/aggregate';
import type { ReachCoverage } from '../model/reach';
import { candidateIsrcs } from './deezer';

export const ARTIST_REACH_SUMMARY_META = 'artistReachSummary';

/** Numbers, sitelink counts and titles come back after ninety days. */
export const REACH_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const REACH_NOT_FOUND_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const REACH_RETRY_LATER_TTL_MS = 24 * 60 * 60 * 1000;

/** Three consecutive failures pause one source for the rest of the run. */
export const MAX_SOURCE_FAILURES = 3;

/**
 * The five phases. `ReachSource` is the subset that produces a stored number
 * and is what `ArtistReachRow.source` holds; MusicBrainz and Wikidata resolve
 * identities, and both can pause, which is why `paused` carries this union
 * and not the narrower one.
 */
export type ReachStep = ReachSource | 'musicbrainz' | 'wikidata';

/**
 * Written at the end of every run, including one that failed or paused every
 * source: `version === 1` is the gate every reach screen reads, so a first run
 * that wrote rows and then failed must still open it. Every count describes
 * the whole store at `ranAt`, not the run's own work — which is why it extends
 * `ReachCoverage`, the same field list the live Settings line computes.
 */
export interface ArtistReachSummary extends ReachCoverage {
  version: 1;
  ranAt: number;
  /** Sources that gave up mid-run. */
  paused: ReachStep[];
}

/** What this run did, as opposed to what the store holds. */
export interface ReachRunCounts {
  /** Artists this run issued at least one request for, in any phase. */
  lookedUp: number;
  /** `ok` reach rows written this run. */
  written: number;
  /** Artists that ended the run with no `ok` row in any source. */
  unresolved: number;
}

export type ReachState =
  | { status: 'idle' }
  | {
      status: 'running';
      step: ReachStep;
      done: number;
      total: number;
      /** Sources that gave up; the card names them while the run continues. */
      paused: ReachStep[];
    }
  | {
      status: 'done';
      summary: ArtistReachSummary;
      run: ReachRunCounts;
      paused: ReachStep[];
    }
  | { status: 'error'; message: string; paused: ReachStep[] };

export interface ReachDeps {
  fetchFn: typeof fetch;
  /** Injected so the JSONP path is testable without a DOM. */
  jsonpFn: (url: string, timeoutMs: number) => Promise<unknown>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  onState: (state: ReachState) => void;
  /** Optional: the run is long enough that the screen must stay awake. */
  acquireWakeLock?: () => Promise<() => Promise<void>>;
}

export interface ReachCandidate {
  artistId: string;
  name: string;
  /** ISRCs of tracks credited to this artist alone, sorted, deduped. */
  isrcs: string[];
}

/**
 * Every artist in `model.artists` with a Spotify id. The ISRCs come from
 * `candidateIsrcs`, so spec §3.3's single-artist rule is written once: a
 * collaboration can never lend Deezer the wrong entity.
 */
export function reachCandidates(model: Model): ReachCandidate[] {
  const out: ReachCandidate[] = [];
  for (const agg of model.artists) {
    const artistId = agg.id;
    if (artistId === null) continue;
    const tracks: TrackRow[] = [];
    for (const trackKey of agg.trackKeys) {
      const track = model.tracksByKey.get(trackKey);
      if (track) tracks.push(track);
    }
    out.push({
      artistId,
      name: agg.name,
      isrcs: candidateIsrcs(artistId, tracks),
    });
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/features/reachRun.test.ts`
Expected: PASS, `Test Files  1 passed (1)`, `Tests  1 passed (1)`.

Run: `yarn typecheck && yarn lint && yarn test`
Expected: all three pass; `Test Files  36 passed (36)`,
`Tests  371 passed (371)`.

- [ ] **Step 5: Write the failing `runReach` tests**

Three edits to `src/features/reachRun.test.ts`, in order.

**(a)** The four import lines at the top of the file — the ones Step 1 wrote —
become the harness's own: it needs the clients' URL constants, the repository
and the run's exports. Replace:

```ts
import { describe, expect, it } from 'vitest';
import type { ArtistRef, TrackRow } from '../db/schema';
import { buildModel } from '../model/aggregate';
import { reachCandidates } from './reachRun';
```

with:

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAllRows,
  getMeta,
  putIdentities,
  putReach,
  wipeDb,
} from '../db/repo';
import type {
  ArtistIdentityRow,
  ArtistReachRow,
  ArtistRef,
  TrackRow,
} from '../db/schema';
import { buildModel } from '../model/aggregate';
import { DEEZER_API } from './deezer';
import { LISTENBRAINZ_STATS_URL } from './listenbrainz';
import { MUSICBRAINZ_URL } from './musicbrainz';
import { WIKIDATA_URL } from './wikidata';
import { PAGEVIEWS_URL } from './wikipedia';
import {
  ARTIST_REACH_SUMMARY_META,
  REACH_NOT_FOUND_TTL_MS,
  REACH_RETRY_LATER_TTL_MS,
  REACH_TTL_MS,
  reachCandidates,
  runReach,
  type ArtistReachSummary,
  type ReachCandidate,
  type ReachState,
} from './reachRun';
```

**(b)** Insert this fixture harness immediately above this exact line, which
puts it directly after the import block:

```ts
describe('reachCandidates', () => {
```

`vi.hoisted` is what lets the `vi.mock` factory — itself hoisted above every
import — reach the flag the storage test flips; the rest of `../db/repo` is the
real module, so the assertions read real rows out of `fake-indexeddb`. Insert:

```ts
/** Flipped on inside a test to make the next reach write fail. */
const storage = vi.hoisted(() => ({ full: false }));

vi.mock('../db/repo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/repo')>();
  return {
    ...actual,
    putReach: async (rows: ArtistReachRow[]) => {
      if (storage.full) {
        throw new DOMException('over quota', 'QuotaExceededError');
      }
      await actual.putReach(rows);
    },
  };
});

const NOW = Date.UTC(2026, 8, 5, 12, 0, 0);

function json(
  body: unknown,
  status = 200,
  headers: HeadersInit = {}
): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

interface Handlers {
  mb?: (artistId: string) => Response;
  lb?: (mbid: string) => Response;
  wd?: (query: string) => Response;
  views?: (project: string, title: string) => Response;
  deezer?: (url: string) => unknown;
}

function setup(handlers: Handlers, wakeLock = true) {
  const requests: string[] = [];
  const sleeps: number[] = [];
  const states: ReachState[] = [];
  const release = vi.fn(async () => {});
  const fetchFn = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push(url);
    if (url.startsWith(MUSICBRAINZ_URL)) {
      const resource = new URL(url).searchParams.get('resource') ?? '';
      const id = resource.split('/').pop() ?? '';
      return handlers.mb ? handlers.mb(id) : json({}, 404);
    }
    if (url.startsWith(LISTENBRAINZ_STATS_URL)) {
      const mbid =
        url.slice(LISTENBRAINZ_STATS_URL.length + 1).split('/')[0] ?? '';
      return handlers.lb ? handlers.lb(mbid) : json(null, 204);
    }
    if (url === WIKIDATA_URL) {
      const body = String(init?.body ?? '');
      const query = decodeURIComponent(body.slice('query='.length));
      return handlers.wd ? handlers.wd(query) : json({ results: {} });
    }
    if (url.startsWith(PAGEVIEWS_URL)) {
      const rest = url.slice(PAGEVIEWS_URL.length + 1).split('/');
      return handlers.views
        ? handlers.views(rest[0] ?? '', rest[3] ?? '')
        : json({}, 404);
    }
    throw new Error(`unexpected request ${url}`);
  });
  const jsonpFn = vi.fn(async (url: string) => {
    requests.push(url);
    if (!handlers.deezer) throw new Error(`unexpected jsonp ${url}`);
    return handlers.deezer(url);
  });
  const deps = {
    fetchFn: fetchFn as unknown as typeof fetch,
    jsonpFn,
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
    now: () => NOW,
    onState: (state: ReachState) => {
      states.push(state);
    },
    ...(wakeLock ? { acquireWakeLock: async () => release } : {}),
  };
  return { deps, fetchFn, jsonpFn, requests, sleeps, states, release };
}

function candidate(over: Partial<ReachCandidate> = {}): ReachCandidate {
  return { artistId: 'a1', name: 'Hugo LX', isrcs: ['FRX010000001'], ...over };
}

function identity(over: Partial<ArtistIdentityRow> = {}): ArtistIdentityRow {
  return {
    artistId: 'a1',
    name: 'Hugo LX',
    mbid: null,
    mbidStatus: 'unchecked',
    qid: null,
    qidStatus: 'unchecked',
    qidCheckedAt: null,
    sitelinks: null,
    wikiTitles: { en: null, fr: null },
    deezerArtistId: null,
    deezerName: null,
    deezerStatus: 'unchecked',
    resolvedAt: 0,
    retryAfter: null,
    ...over,
  };
}

function reachRow(over: Partial<ArtistReachRow> = {}): ArtistReachRow {
  const artistId = over.artistId ?? 'a1';
  const source = over.source ?? 'listenbrainz';
  return {
    key: `${artistId}|${source}`,
    artistId,
    source,
    status: 'ok',
    value: 1,
    fetchedAt: NOW,
    retryAfter: null,
    sourceUrl: 'https://example.test/',
    ...over,
  };
}

function progressOf(states: ReachState[]): string[] {
  return states.flatMap((s) =>
    s.status === 'running' ? [`${s.step} ${s.done}/${s.total}`] : []
  );
}

/** The two-artist library every phase answers for. */
const HUGO = candidate();
const PEGGY = candidate({
  artistId: 'a2',
  name: 'Peggy Gou',
  isrcs: ['KRA000000002'],
});

const MBIDS: Record<string, string> = { a1: 'mb-1', a2: 'mb-2' };

const happy: Handlers = {
  mb: (artistId) =>
    json({
      resource: `https://open.spotify.com/artist/${artistId}`,
      relations: [
        { type: 'social network', artist: { id: 'wrong' } },
        { type: 'free streaming' },
        { type: 'free streaming', artist: { id: MBIDS[artistId] } },
      ],
    }),
  lb: (mbid) =>
    mbid === 'mb-1'
      ? json({
          payload: {
            artist_name: 'Hugo LX',
            total_user_count: 54,
            total_listen_count: 900,
          },
        })
      : json({
          payload: {
            artist_name: 'Peggy Gou',
            total_user_count: 5896,
            total_listen_count: 70_000,
          },
        }),
  deezer: (url) => {
    if (url === `${DEEZER_API}/track/isrc:FRX010000001?output=jsonp`) {
      return { artist: { id: 11, name: 'Hugo  LX' } };
    }
    if (url === `${DEEZER_API}/track/isrc:KRA000000002?output=jsonp`) {
      return { artist: { id: 22, name: 'Peggy Gou' } };
    }
    if (url === `${DEEZER_API}/artist/11?output=jsonp`) return { nb_fan: 585 };
    return { nb_fan: 202_216 };
  },
  // Pass 1 binds Peggy only; pass 2 (by MBID) finds nothing for Hugo.
  wd: (query) =>
    query.includes('wdt:P1902')
      ? json({
          results: {
            bindings: [
              {
                sid: { value: 'a2' },
                item: { value: 'http://www.wikidata.org/entity/Q1' },
                sitelinks: { value: '19' },
                en: { value: 'https://en.wikipedia.org/wiki/Peggy_Gou' },
                fr: { value: 'https://fr.wikipedia.org/wiki/Peggy_Gou' },
              },
            ],
          },
        })
      : json({ results: { bindings: [] } }),
  views: (project) =>
    json({
      items:
        project === 'en.wikipedia.org'
          ? [{ views: 200_000 }, { views: 89_000 }]
          : [{ views: 1000 }],
    }),
};

beforeEach(async () => {
  storage.full = false;
  await wipeDb();
});
```

**(c)** Append to the end of `src/features/reachRun.test.ts`, after the
`describe('reachCandidates', …)` block:

```ts
describe('runReach', () => {
  it('runs the five phases in order and paces every source', async () => {
    const { deps, requests, sleeps, states } = setup(happy);
    await runReach(deps, [HUGO, PEGGY], [], []);
    expect(requests).toEqual([
      `${MUSICBRAINZ_URL}?resource=https%3A%2F%2Fopen.spotify.com%2Fartist%2Fa1&inc=artist-rels&fmt=json`,
      `${MUSICBRAINZ_URL}?resource=https%3A%2F%2Fopen.spotify.com%2Fartist%2Fa2&inc=artist-rels&fmt=json`,
      `${LISTENBRAINZ_STATS_URL}/mb-1/listeners`,
      `${LISTENBRAINZ_STATS_URL}/mb-2/listeners`,
      `${DEEZER_API}/track/isrc:FRX010000001?output=jsonp`,
      `${DEEZER_API}/artist/11?output=jsonp`,
      `${DEEZER_API}/track/isrc:KRA000000002?output=jsonp`,
      `${DEEZER_API}/artist/22?output=jsonp`,
      WIKIDATA_URL,
      WIKIDATA_URL,
      `${PAGEVIEWS_URL}/en.wikipedia.org/all-access/user/Peggy_Gou/monthly/2025090100/2026083100`,
      `${PAGEVIEWS_URL}/fr.wikipedia.org/all-access/user/Peggy_Gou/monthly/2025090100/2026083100`,
    ]);
    expect(sleeps).toEqual([
      1000, 1000, 1000, 1000, 250, 250, 250, 250, 250, 250,
    ]);
    expect(progressOf(states)).toEqual([
      'musicbrainz 0/2',
      'musicbrainz 1/2',
      'musicbrainz 2/2',
      'listenbrainz 0/2',
      'listenbrainz 1/2',
      'listenbrainz 2/2',
      'deezer 0/2',
      'deezer 1/2',
      'deezer 2/2',
      'wikidata 0/1',
      'wikidata 1/1',
      'wikidata 1/2',
      'wikidata 2/2',
      'wikipedia 0/1',
      'wikipedia 1/1',
    ]);
  });

  it('threads each phase writes into the next one from empty arrays', async () => {
    const { deps, release } = setup(happy);
    await runReach(deps, [HUGO, PEGGY], [], []);
    const rows = await getAllRows();
    expect(rows.artistIdentity).toEqual([
      identity({
        artistId: 'a1',
        name: 'Hugo LX',
        mbid: 'mb-1',
        mbidStatus: 'ok',
        qidStatus: 'notFound',
        qidCheckedAt: NOW,
        deezerArtistId: 11,
        deezerName: 'Hugo  LX',
        deezerStatus: 'ok',
        resolvedAt: NOW,
      }),
      identity({
        artistId: 'a2',
        name: 'Peggy Gou',
        mbid: 'mb-2',
        mbidStatus: 'ok',
        qid: 'Q1',
        qidStatus: 'ok',
        qidCheckedAt: NOW,
        sitelinks: 19,
        wikiTitles: { en: 'Peggy_Gou', fr: 'Peggy_Gou' },
        deezerArtistId: 22,
        deezerName: 'Peggy Gou',
        deezerStatus: 'ok',
        resolvedAt: NOW,
      }),
    ]);
    expect(rows.artistReach).toEqual([
      reachRow({
        artistId: 'a1',
        source: 'deezer',
        value: 585,
        sourceUrl: `${DEEZER_API}/artist/11?output=jsonp`,
      }),
      reachRow({
        artistId: 'a1',
        source: 'listenbrainz',
        value: 54,
        extra: { listens: 900 },
        sourceUrl: `${LISTENBRAINZ_STATS_URL}/mb-1/listeners`,
      }),
      reachRow({
        artistId: 'a2',
        source: 'deezer',
        value: 202_216,
        sourceUrl: `${DEEZER_API}/artist/22?output=jsonp`,
      }),
      reachRow({
        artistId: 'a2',
        source: 'listenbrainz',
        value: 5896,
        extra: { listens: 70_000 },
        sourceUrl: `${LISTENBRAINZ_STATS_URL}/mb-2/listeners`,
      }),
      reachRow({
        artistId: 'a2',
        source: 'wikipedia',
        value: 290_000,
        extra: { months: 12, en: 289_000, fr: 1000 },
        sourceUrl: `${PAGEVIEWS_URL}/en.wikipedia.org/all-access/user/Peggy_Gou/monthly/2025090100/2026083100`,
      }),
    ]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('reports the store summary and this run own counts', async () => {
    const { deps, states } = setup(happy);
    await runReach(deps, [HUGO, PEGGY], [], []);
    const summary: ArtistReachSummary = {
      version: 1,
      ranAt: NOW,
      artists: 2,
      covered: 2,
      resolved: 2,
      listenbrainz: 2,
      deezer: 2,
      wikipedia: 1,
      wellKnown: 1,
      paused: [],
    };
    expect(states.at(-1)).toEqual({
      status: 'done',
      summary,
      run: { lookedUp: 2, written: 5, unresolved: 0 },
      paused: [],
    });
    expect(await getMeta(ARTIST_REACH_SUMMARY_META)).toEqual(summary);
  });

  it('asks nothing at all when every row still answers', async () => {
    const rows = [
      identity({
        mbid: 'mb-1',
        mbidStatus: 'ok',
        qid: 'Q9',
        qidStatus: 'ok',
        qidCheckedAt: NOW - 1000,
        deezerArtistId: 11,
        deezerName: 'Hugo LX',
        deezerStatus: 'ok',
        resolvedAt: NOW - 1000,
      }),
    ];
    const reach = [
      reachRow({ source: 'listenbrainz', value: 54, fetchedAt: NOW - 1000 }),
      reachRow({ source: 'deezer', value: 585, fetchedAt: NOW - 1000 }),
    ];
    const { deps, fetchFn, jsonpFn, states } = setup({}, false);
    await runReach(deps, [HUGO], rows, reach);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(jsonpFn).not.toHaveBeenCalled();
    const last = states.at(-1);
    expect(last?.status).toBe('done');
    if (last?.status !== 'done') throw new Error('not done');
    expect(last.run).toEqual({ lookedUp: 0, written: 0, unresolved: 0 });
    expect(last.summary.covered).toBe(1);
  });

  it('re-asks at the thirty- and ninety-day marks and once retryAfter passes', async () => {
    const rows = [
      identity({
        // Permanent ids: never asked again, whatever the clock says.
        mbid: 'mb-1',
        mbidStatus: 'ok',
        qid: 'Q9',
        qidStatus: 'ok',
        qidCheckedAt: NOW - 1000,
        deezerArtistId: 11,
        deezerName: 'Hugo LX',
        deezerStatus: 'ok',
        resolvedAt: NOW - 1000,
      }),
      identity({
        artistId: 'a2',
        name: 'Peggy Gou',
        mbidStatus: 'notFound',
        qidStatus: 'notFound',
        qidCheckedAt: NOW - REACH_NOT_FOUND_TTL_MS,
        deezerStatus: 'notFound',
        resolvedAt: NOW - REACH_NOT_FOUND_TTL_MS,
      }),
      identity({
        artistId: 'a3',
        name: 'Anz',
        mbidStatus: 'retryLater',
        deezerStatus: 'notFound',
        resolvedAt: NOW - 1000,
        retryAfter: NOW,
      }),
      identity({
        artistId: 'a4',
        name: 'Anetha',
        mbidStatus: 'retryLater',
        deezerStatus: 'notFound',
        resolvedAt: NOW - 1000,
        retryAfter: NOW + 1,
      }),
    ];
    const reach = [
      // Exactly ninety days old: due.
      reachRow({
        source: 'listenbrainz',
        value: 54,
        fetchedAt: NOW - REACH_TTL_MS,
      }),
      reachRow({
        source: 'deezer',
        value: 585,
        fetchedAt: NOW - REACH_TTL_MS + 1,
      }),
    ];
    const queries: string[] = [];
    const { deps, requests } = setup({
      mb: () => json({}, 404),
      lb: () =>
        json({
          payload: {
            artist_name: 'Hugo LX',
            total_user_count: 61,
            total_listen_count: 1000,
          },
        }),
      wd: (query) => {
        queries.push(query);
        return json({ results: { bindings: [] } });
      },
    });
    const candidates = [
      HUGO,
      candidate({ artistId: 'a2', name: 'Peggy Gou', isrcs: [] }),
      candidate({ artistId: 'a3', name: 'Anz', isrcs: [] }),
      candidate({ artistId: 'a4', name: 'Anetha', isrcs: [] }),
    ];
    await putIdentities(rows);
    await putReach(reach);
    await runReach(deps, candidates, rows, reach);
    expect(
      requests
        .filter((url) => url.startsWith(MUSICBRAINZ_URL))
        .map((url) => new URL(url).searchParams.get('resource'))
    ).toEqual([
      'https://open.spotify.com/artist/a2',
      'https://open.spotify.com/artist/a3',
    ]);
    expect(
      requests.filter((url) => url.startsWith(LISTENBRAINZ_STATS_URL))
    ).toEqual([`${LISTENBRAINZ_STATS_URL}/mb-1/listeners`]);
    // Deezer's fresh number is left alone; a1 keeps its permanent id.
    expect(requests.filter((url) => url.startsWith(DEEZER_API))).toEqual([]);
    const stored = await getAllRows();
    expect(requests.filter((url) => url === WIKIDATA_URL)).toHaveLength(1);
    // Freshness is judged on the row as the run found it: a2's thirty-day-old
    // `notFound` QID is still refreshed although MusicBrainz rewrote a2's row
    // — and its `resolvedAt` — earlier in this same run.
    expect(queries[0]).toContain('"a2"');
    // A fresh `ok` QID is left alone; only a ninety-day-old one comes back.
    expect(queries[0]).not.toContain('"a1"');
    expect(stored.artistIdentity.find((r) => r.artistId === 'a1')?.mbid).toBe(
      'mb-1'
    );
    expect(
      stored.artistReach.find((r) => r.key === 'a1|listenbrainz')?.value
    ).toBe(61);
  });

  it('refreshes a ninety-day-old sitelink count and never drops a QID', async () => {
    const existing = [
      identity({
        mbidStatus: 'notFound',
        qid: 'Q9',
        qidStatus: 'ok',
        // Ninety days since Wikidata answered, but the MusicBrainz and Deezer
        // steps rewrote the row a day ago: the QID clock is its own field.
        qidCheckedAt: NOW - REACH_TTL_MS,
        sitelinks: 3,
        wikiTitles: { en: 'Hugo_LX', fr: null },
        deezerStatus: 'notFound',
        resolvedAt: NOW - REACH_NOT_FOUND_TTL_MS,
      }),
      identity({
        artistId: 'a2',
        name: 'Peggy Gou',
        mbidStatus: 'notFound',
        qid: 'Q8',
        qidStatus: 'ok',
        qidCheckedAt: NOW - REACH_TTL_MS,
        sitelinks: 2,
        wikiTitles: { en: null, fr: 'Peggy_Gou' },
        deezerStatus: 'notFound',
        resolvedAt: NOW - REACH_NOT_FOUND_TTL_MS,
      }),
    ];
    const { deps } = setup({
      // a1 comes back with a new count and a new title; a2 comes back empty.
      wd: () =>
        json({
          results: {
            bindings: [
              {
                sid: { value: 'a1' },
                item: { value: 'http://www.wikidata.org/entity/Q9' },
                sitelinks: { value: '7' },
                fr: { value: 'https://fr.wikipedia.org/wiki/Hugo_LX' },
              },
            ],
          },
        }),
      views: () => json({ items: [{ views: 12 }] }),
    });
    await runReach(
      deps,
      [
        candidate({ isrcs: [] }),
        candidate({ artistId: 'a2', name: 'Peggy Gou', isrcs: [] }),
      ],
      existing,
      []
    );
    const rows = await getAllRows();
    const byId = new Map(rows.artistIdentity.map((r) => [r.artistId, r]));
    expect(byId.get('a1')).toEqual(
      identity({
        mbidStatus: 'notFound',
        qid: 'Q9',
        qidStatus: 'ok',
        qidCheckedAt: NOW,
        sitelinks: 7,
        wikiTitles: { en: null, fr: 'Hugo_LX' },
        deezerStatus: 'notFound',
        resolvedAt: NOW,
      })
    );
    // A QID is permanent: a refresh that finds nothing only restarts the clock.
    expect(byId.get('a2')).toEqual(
      identity({
        artistId: 'a2',
        name: 'Peggy Gou',
        mbidStatus: 'notFound',
        qid: 'Q8',
        qidStatus: 'ok',
        qidCheckedAt: NOW,
        sitelinks: 2,
        wikiTitles: { en: null, fr: 'Peggy_Gou' },
        deezerStatus: 'notFound',
        resolvedAt: NOW,
      })
    );
  });

  it('leaves the whole Wikidata batch unchecked when a POST fails', async () => {
    const { deps, states } = setup({
      mb: () => json({}, 404),
      wd: () => json({}, 500),
    });
    await runReach(deps, [candidate({ isrcs: [] })], [], []);
    const rows = await getAllRows();
    expect(rows.artistIdentity[0]?.qidStatus).toBe('unchecked');
    expect(states.at(-1)?.status).toBe('done');
  });

  it('pauses a source after three failures and lets the others finish', async () => {
    const candidates = [
      candidate({ isrcs: [] }),
      candidate({ artistId: 'a2', name: 'Peggy Gou', isrcs: [] }),
      candidate({ artistId: 'a3', name: 'Anz', isrcs: [] }),
      candidate({ artistId: 'a4', name: 'Anetha', isrcs: [] }),
      candidate({ artistId: 'a5', name: 'Skee Mask', isrcs: [] }),
    ];
    const existing = [
      identity({
        artistId: 'a5',
        name: 'Skee Mask',
        mbid: 'mb-5',
        mbidStatus: 'ok',
      }),
    ];
    const { deps, states, requests, release } = setup({
      mb: () => json({ error: 'busy' }, 503),
      lb: () =>
        json({
          payload: {
            artist_name: 'Skee Mask',
            total_user_count: 3000,
            total_listen_count: 40_000,
          },
        }),
      wd: () => json({ results: { bindings: [] } }),
    });
    await runReach(deps, candidates, existing, []);
    // Four artists were due; the fourth is never reached.
    expect(
      requests
        .filter((url) => url.startsWith(MUSICBRAINZ_URL))
        .map((url) => new URL(url).searchParams.get('resource'))
    ).toEqual([
      ...Array.from({ length: 4 }, () => 'https://open.spotify.com/artist/a1'),
      ...Array.from({ length: 4 }, () => 'https://open.spotify.com/artist/a2'),
      ...Array.from({ length: 4 }, () => 'https://open.spotify.com/artist/a3'),
    ]);
    const rows = await getAllRows();
    const byId = new Map(rows.artistIdentity.map((r) => [r.artistId, r]));
    expect(byId.get('a1')?.mbidStatus).toBe('retryLater');
    expect(byId.get('a1')?.retryAfter).toBe(NOW + REACH_RETRY_LATER_TTL_MS);
    expect(byId.get('a3')?.mbidStatus).toBe('retryLater');
    // An artist the paused source never reached keeps its unchecked state:
    // a later phase may still create its row, but never a MusicBrainz field.
    expect(byId.get('a4')?.mbidStatus).toBe('unchecked');
    expect(byId.get('a4')?.mbid).toBeNull();
    // ListenBrainz still worked through the artist that already had an MBID.
    expect(rows.artistReach).toEqual([
      reachRow({
        artistId: 'a5',
        source: 'listenbrainz',
        value: 3000,
        extra: { listens: 40_000 },
        sourceUrl: `${LISTENBRAINZ_STATS_URL}/mb-5/listeners`,
      }),
    ]);
    expect(
      states.flatMap((s) =>
        s.status === 'running' && s.step === 'listenbrainz' ? [s.paused] : []
      )[0]
    ).toEqual(['musicbrainz']);
    const last = states.at(-1);
    if (last?.status !== 'done') throw new Error('not done');
    expect(last.paused).toEqual(['musicbrainz']);
    expect(last.summary.paused).toEqual(['musicbrainz']);
    expect(last.run).toEqual({ lookedUp: 5, written: 1, unresolved: 4 });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('stamps the artists ListenBrainz still owed when it asks for a long wait', async () => {
    const candidates = [HUGO, PEGGY];
    const existing = [
      identity({ mbid: 'mb-1', mbidStatus: 'ok', deezerStatus: 'notFound' }),
      identity({
        artistId: 'a2',
        name: 'Peggy Gou',
        mbid: 'mb-2',
        mbidStatus: 'ok',
        deezerStatus: 'notFound',
      }),
    ];
    const { deps, requests, states } = setup({
      lb: () => json({}, 429, { 'Retry-After': '172800' }),
      wd: () => json({ results: { bindings: [] } }),
    });
    await runReach(deps, candidates, existing, []);
    expect(
      requests.filter((url) => url.startsWith(LISTENBRAINZ_STATS_URL))
    ).toEqual([`${LISTENBRAINZ_STATS_URL}/mb-1/listeners`]);
    const rows = await getAllRows();
    expect(rows.artistReach).toEqual([
      reachRow({
        artistId: 'a1',
        source: 'listenbrainz',
        status: 'retryLater',
        value: null,
        retryAfter: NOW + 172_800_000,
        sourceUrl: `${LISTENBRAINZ_STATS_URL}/mb-1/listeners`,
      }),
      reachRow({
        artistId: 'a2',
        source: 'listenbrainz',
        status: 'retryLater',
        value: null,
        retryAfter: NOW + 172_800_000,
        sourceUrl: `${LISTENBRAINZ_STATS_URL}/mb-2/listeners`,
      }),
    ]);
    const last = states.at(-1);
    if (last?.status !== 'done') throw new Error('not done');
    expect(last.paused).toEqual(['listenbrainz']);
    expect(last.run.written).toBe(0);
  });

  it('writes the summary and keeps its rows when storage fails', async () => {
    const { deps, states, release } = setup(happy);
    const candidates = [HUGO];
    const onState = deps.onState;
    deps.onState = (state: ReachState) => {
      // The identities are written; the first reach row is not.
      if (state.status === 'running' && state.step === 'listenbrainz') {
        storage.full = true;
      }
      onState(state);
    };
    await runReach(deps, candidates, [], []);
    expect(states.at(-1)).toEqual({
      status: 'error',
      message: 'Local storage is full. Free space on the phone and try again.',
      paused: [],
    });
    const rows = await getAllRows();
    expect(rows.artistIdentity[0]?.mbid).toBe('mb-1');
    expect(rows.artistReach).toEqual([]);
    const summary = await getMeta<ArtistReachSummary>(
      ARTIST_REACH_SUMMARY_META
    );
    expect(summary?.version).toBe(1);
    expect(summary?.resolved).toBe(1);
    expect(summary?.covered).toBe(0);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('re-fetches only the fan count when the Deezer id is known', async () => {
    const existing = [
      identity({
        mbidStatus: 'notFound',
        qidStatus: 'notFound',
        qidCheckedAt: NOW - 1000,
        deezerArtistId: 11,
        deezerName: 'Hugo LX',
        deezerStatus: 'ok',
        resolvedAt: NOW - 1000,
      }),
    ];
    const stale = [
      reachRow({
        source: 'deezer',
        value: 500,
        fetchedAt: NOW - REACH_TTL_MS,
        sourceUrl: `${DEEZER_API}/artist/11?output=jsonp`,
      }),
    ];
    const { deps, requests } = setup({ deezer: () => ({ nb_fan: 585 }) });
    await runReach(deps, [HUGO], existing, stale);
    // The ISRC step is skipped: a Deezer artist id is permanent once found.
    expect(requests).toEqual([`${DEEZER_API}/artist/11?output=jsonp`]);
    const rows = await getAllRows();
    expect(rows.artistReach).toEqual([
      reachRow({
        source: 'deezer',
        value: 585,
        sourceUrl: `${DEEZER_API}/artist/11?output=jsonp`,
      }),
    ]);
  });

  it('names a paused source on the error state too', async () => {
    const candidates = [
      candidate({ isrcs: [] }),
      candidate({ artistId: 'a2', name: 'Peggy Gou', isrcs: [] }),
      candidate({ artistId: 'a3', name: 'Anz', isrcs: [] }),
      candidate({ artistId: 'a5', name: 'Skee Mask', isrcs: [] }),
    ];
    const existing = [
      identity({
        artistId: 'a5',
        name: 'Skee Mask',
        mbid: 'mb-5',
        mbidStatus: 'ok',
      }),
    ];
    const { deps, states } = setup({
      mb: () => json({ error: 'busy' }, 503),
      lb: () =>
        json({
          payload: {
            artist_name: 'Skee Mask',
            total_user_count: 3000,
            total_listen_count: 40_000,
          },
        }),
    });
    const onState = deps.onState;
    deps.onState = (state: ReachState) => {
      if (state.status === 'running' && state.step === 'listenbrainz') {
        storage.full = true;
      }
      onState(state);
    };
    await runReach(deps, candidates, existing, []);
    expect(states.at(-1)).toEqual({
      status: 'error',
      message: 'Local storage is full. Free space on the phone and try again.',
      paused: ['musicbrainz'],
    });
    const summary = await getMeta<ArtistReachSummary>(
      ARTIST_REACH_SUMMARY_META
    );
    expect(summary?.paused).toEqual(['musicbrainz']);
  });

  it('never throws when a source is unreachable', async () => {
    const { deps, states } = setup({
      mb: () => {
        throw new Error('Failed to fetch');
      },
      wd: () => json({ results: { bindings: [] } }),
    });
    await expect(runReach(deps, [HUGO], [], [])).resolves.toBeUndefined();
    const last = states.at(-1);
    if (last?.status !== 'done') throw new Error('not done');
    expect(last.paused).toEqual([]);
    const rows = await getAllRows();
    expect(rows.artistIdentity[0]?.mbidStatus).toBe('retryLater');
  });

  it('keeps rows written before an earlier stop, so a later run resumes', async () => {
    await putIdentities([identity({ mbid: 'mb-1', mbidStatus: 'ok' })]);
    await putReach([
      reachRow({ source: 'listenbrainz', value: 54, fetchedAt: NOW - 1000 }),
    ]);
    const before = await getAllRows();
    const { deps } = setup({
      wd: () => json({ results: { bindings: [] } }),
      deezer: (url) =>
        url.includes('/artist/11')
          ? { nb_fan: 585 }
          : { artist: { id: 11, name: 'Hugo LX' } },
    });
    await runReach(deps, [HUGO], before.artistIdentity, before.artistReach);
    const rows = await getAllRows();
    expect(rows.artistReach.map((r) => r.key)).toEqual([
      'a1|deezer',
      'a1|listenbrainz',
    ]);
    expect(
      rows.artistReach.find((r) => r.key === 'a1|listenbrainz')?.fetchedAt
    ).toBe(NOW - 1000);
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `yarn test src/features/reachRun.test.ts`

Expected: `Tests  14 failed | 1 passed (15)` — every new test fails on the same
missing export, and the `reachCandidates` test from Step 1 still passes:

```
 ❯ src/features/reachRun.test.ts (15 tests | 14 failed) 16ms
   ❯ runReach (14)
     × runs the five phases in order and paces every source 3ms
     × threads each phase writes into the next one from empty arrays 1ms
     × reports the store summary and this run own counts 0ms
     × asks nothing at all when every row still answers 1ms
     × re-asks at the thirty- and ninety-day marks and once retryAfter passes 3ms
     × refreshes a ninety-day-old sitelink count and never drops a QID 1ms
     × leaves the whole Wikidata batch unchecked when a POST fails 0ms
     × pauses a source after three failures and lets the others finish 1ms
     × stamps the artists ListenBrainz still owed when it asks for a long wait 0ms
     × writes the summary and keeps its rows when storage fails 0ms
     × re-fetches only the fan count when the Deezer id is known 0ms
     × names a paused source on the error state too 0ms
     × never throws when a source is unreachable 0ms
     × keeps rows written before an earlier stop, so a later run resumes 1ms

⎯⎯⎯⎯⎯⎯ Failed Tests 14 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/features/reachRun.test.ts > runReach > runs the five phases in order and paces every source
TypeError: runReach is not a function
 ❯ src/features/reachRun.test.ts:316:11
    314|   it('runs the five phases in order and paces every source', async () …
    315|     const { deps, requests, sleeps, states } = setup(happy);
    316|     await runReach(deps, [HUGO, PEGGY], [], []);
       |           ^
    317|     expect(requests).toEqual([
```

Run: `yarn typecheck`

Expected: `error Command failed with exit code 2`, one error:

```
src/features/reachRun.test.ts(28,3): error TS2305: Module '"./reachRun"' has no exported member 'runReach'.
```

- [ ] **Step 7: Write `runReach`**

Two edits to `src/features/reachRun.ts`.

**(a)** The four import lines at the top of the file — the ones Step 3 wrote —
gain the repository and the five clients. Replace:

```ts
import type { ReachSource, TrackRow } from '../db/schema';
import type { Model } from '../model/aggregate';
import type { ReachCoverage } from '../model/reach';
import { candidateIsrcs } from './deezer';
```

with:

```ts
import { putIdentities, putMeta, putReach } from '../db/repo';
import { reachKey } from '../db/schema';
import type {
  ArtistIdentityRow,
  ArtistReachRow,
  ReachSource,
  ResolveStatus,
  TrackRow,
} from '../db/schema';
import type { Model } from '../model/aggregate';
import { isWellKnown, type ReachCoverage } from '../model/reach';
import { storageMessage } from '../util/errors';
import { candidateIsrcs, fetchDeezerFans, resolveDeezerArtist } from './deezer';
import { LB_INTERVAL_MS, fetchListeners, listenersUrl } from './listenbrainz';
import { fetchMbid } from './musicbrainz';
import {
  needsWikidata,
  resolveByMbid,
  resolveBySpotifyId,
  wikidataBatches,
  type WikidataHit,
} from './wikidata';
import { WIKIPEDIA_INTERVAL_MS, fetchPageviews } from './wikipedia';
```

**(b)** Append to the end of `src/features/reachRun.ts`, below
`reachCandidates`:

```ts
/**
 * Manual, resumable and checkpointed: every row is written as it resolves, so
 * a run that stops loses nothing. Never throws — a failure ends in the error
 * state, and the summary is written on that path too.
 */
export async function runReach(
  deps: ReachDeps,
  candidates: ReachCandidate[],
  identities: ArtistIdentityRow[],
  reach: ArtistReachRow[]
): Promise<void> {
  // The run threads its own writes: later phases read what earlier phases
  // wrote without a model reload. The arrays are the starting point only.
  const idRows = new Map(identities.map((row) => [row.artistId, row]));
  // Freshness for the MBID and Deezer steps is judged against the row as the
  // run found it. One row carries three steps and a single `resolvedAt`, so a
  // MusicBrainz write earlier in the same run must not make a later step's
  // clock — or another step's `retryAfter` gate — look fresh.
  const startRows = new Map(identities.map((row) => [row.artistId, row]));
  const reachRows = new Map(reach.map((row) => [row.key, row]));
  const startedAt = deps.now();
  const paused: ReachStep[] = [];
  const lookedUp = new Set<string>();
  let written = 0;
  let step: ReachStep = 'musicbrainz';
  let done = 0;
  let total = 0;
  let failures = 0;

  function running(): void {
    deps.onState({ status: 'running', step, done, total, paused: [...paused] });
  }

  function begin(next: ReachStep, count: number): void {
    step = next;
    done = 0;
    total = count;
    failures = 0;
    running();
  }

  function advance(): void {
    done += 1;
    running();
  }

  /** Counts a source's answer and reports whether the phase must stop. */
  function record(ok: boolean): boolean {
    if (ok) {
      failures = 0;
      return false;
    }
    failures += 1;
    if (failures < MAX_SOURCE_FAILURES) return false;
    paused.push(step);
    return true;
  }

  /** The 1-day floor, or the longer wait the source named. */
  function retryAt(namedMs: number | null): number {
    return startedAt + Math.max(REACH_RETRY_LATER_TTL_MS, namedMs ?? 0);
  }

  /** The refresh table: `ok` 90 days, `notFound` 30, `retryLater` its gate. */
  function isDue(
    status: ResolveStatus | undefined,
    clock: number,
    retryAfter: number | null
  ): boolean {
    if (status === 'ok') return startedAt - clock >= REACH_TTL_MS;
    if (status === 'notFound') {
      return startedAt - clock >= REACH_NOT_FOUND_TTL_MS;
    }
    if (status === 'retryLater') {
      return retryAfter === null || startedAt >= retryAfter;
    }
    return true;
  }

  function identityOf(candidate: ReachCandidate): ArtistIdentityRow {
    const row = idRows.get(candidate.artistId);
    // The Spotify name is refreshed on every write: it is what the sources
    // are checked against.
    if (row) return { ...row, name: candidate.name };
    return {
      artistId: candidate.artistId,
      name: candidate.name,
      mbid: null,
      mbidStatus: 'unchecked',
      qid: null,
      qidStatus: 'unchecked',
      qidCheckedAt: null,
      sitelinks: null,
      wikiTitles: { en: null, fr: null },
      deezerArtistId: null,
      deezerName: null,
      deezerStatus: 'unchecked',
      resolvedAt: 0,
      retryAfter: null,
    };
  }

  async function writeIdentity(
    row: ArtistIdentityRow,
    patch: Partial<ArtistIdentityRow>,
    retryAfter?: number
  ): Promise<void> {
    const next: ArtistIdentityRow = {
      ...row,
      ...patch,
      resolvedAt: startedAt,
      // A `retryLater` step is the field's only writer, so an `ok` or
      // `notFound` step leaves another step's gate exactly as it was.
      retryAfter: retryAfter ?? row.retryAfter,
    };
    // Persisted before the map is updated, so the run's own view of the
    // store can never be ahead of what IndexedDB actually holds.
    await putIdentities([next]);
    idRows.set(next.artistId, next);
  }

  async function writeReach(row: ArtistReachRow): Promise<void> {
    await putReach([row]);
    reachRows.set(row.key, row);
    if (row.status === 'ok') written += 1;
  }

  function reachDue(artistId: string, source: ReachSource): boolean {
    const row = reachRows.get(reachKey(artistId, source));
    return isDue(row?.status, row?.fetchedAt ?? 0, row?.retryAfter ?? null);
  }

  async function musicbrainzPhase(): Promise<void> {
    const todo = candidates.filter((candidate) => {
      const row = startRows.get(candidate.artistId);
      if (row === undefined) return true;
      // An MBID never changes, so an `ok` row is never asked again.
      if (row.mbidStatus === 'ok') return false;
      return isDue(row.mbidStatus, row.resolvedAt, row.retryAfter);
    });
    begin('musicbrainz', todo.length);
    for (const candidate of todo) {
      const row = identityOf(candidate);
      // The client sleeps MB_INTERVAL_MS before every attempt of its own.
      const result = await fetchMbid(candidate.artistId, deps);
      lookedUp.add(candidate.artistId);
      if (result.status === 'ok') {
        await writeIdentity(row, { mbid: result.mbid, mbidStatus: 'ok' });
      } else if (result.status === 'notFound') {
        await writeIdentity(row, { mbidStatus: 'notFound' });
      } else {
        await writeIdentity(row, { mbidStatus: 'retryLater' }, retryAt(null));
      }
      advance();
      if (record(result.status !== 'retryLater')) return;
    }
  }

  async function listenbrainzPhase(): Promise<void> {
    const todo = candidates.filter((candidate) => {
      const mbid = idRows.get(candidate.artistId)?.mbid ?? null;
      return mbid !== null && reachDue(candidate.artistId, 'listenbrainz');
    });
    begin('listenbrainz', todo.length);
    for (const [index, candidate] of todo.entries()) {
      const mbid = idRows.get(candidate.artistId)?.mbid;
      if (mbid == null) continue;
      // One request per second: this client sleeps only for its own retries,
      // so the pace between artists is the run's to keep (spec §4.3).
      await deps.sleep(LB_INTERVAL_MS);
      const result = await fetchListeners(mbid, candidate.name, deps);
      lookedUp.add(candidate.artistId);
      const base = {
        key: reachKey(candidate.artistId, 'listenbrainz'),
        artistId: candidate.artistId,
        source: 'listenbrainz' as const,
        fetchedAt: startedAt,
        sourceUrl: listenersUrl(mbid),
      };
      if (result.status === 'retryLater') {
        const after = retryAt(result.pauseForMs ?? null);
        await writeReach({
          ...base,
          status: 'retryLater',
          value: null,
          retryAfter: after,
        });
        advance();
        if (result.pauseForMs !== undefined) {
          // The source named a wait longer than a minute. Pause it, and stamp
          // every artist still owed a request so the next run does not ask
          // before ListenBrainz said it would answer.
          paused.push('listenbrainz');
          for (const rest of todo.slice(index + 1)) {
            const restMbid = idRows.get(rest.artistId)?.mbid;
            if (restMbid == null) continue;
            await writeReach({
              key: reachKey(rest.artistId, 'listenbrainz'),
              artistId: rest.artistId,
              source: 'listenbrainz',
              status: 'retryLater',
              value: null,
              fetchedAt: startedAt,
              retryAfter: after,
              sourceUrl: listenersUrl(restMbid),
            });
          }
          return;
        }
        if (record(false)) return;
        continue;
      }
      await writeReach({
        ...base,
        status: result.status,
        value: result.value,
        ...(result.listens === null
          ? {}
          : { extra: { listens: result.listens } }),
        retryAfter: null,
      });
      advance();
      record(true);
    }
  }

  async function deezerPhase(): Promise<void> {
    function needsId(row: ArtistIdentityRow | undefined): boolean {
      if (row === undefined) return true;
      // A Deezer artist id is permanent once found.
      if (row.deezerStatus === 'ok') return false;
      return isDue(row.deezerStatus, row.resolvedAt, row.retryAfter);
    }
    const todo = candidates.filter((candidate) => {
      const hasId =
        (idRows.get(candidate.artistId)?.deezerArtistId ?? null) !== null;
      return (
        needsId(startRows.get(candidate.artistId)) ||
        (hasId && reachDue(candidate.artistId, 'deezer'))
      );
    });
    begin('deezer', todo.length);
    for (const candidate of todo) {
      const row = identityOf(candidate);
      let artistId = row.deezerArtistId;
      if (artistId === null && needsId(startRows.get(candidate.artistId))) {
        if (candidate.isrcs.length === 0) {
          // No single-artist ISRC: there is nothing to ask, and a number from
          // a collaboration would be worse than none.
          await writeIdentity(row, { deezerStatus: 'notFound' });
          advance();
          continue;
        }
        // The client sleeps DEEZER_INTERVAL_MS before each of its requests
        // and caps the candidate list at MAX_ISRC_CANDIDATES.
        const match = await resolveDeezerArtist(
          candidate.name,
          candidate.isrcs,
          deps
        );
        lookedUp.add(candidate.artistId);
        if (match.status === 'retryLater') {
          await writeIdentity(
            row,
            { deezerStatus: 'retryLater' },
            retryAt(null)
          );
          advance();
          if (record(false)) return;
          continue;
        }
        if (match.status === 'ok') {
          await writeIdentity(row, {
            deezerArtistId: match.artistId,
            deezerName: match.name,
            deezerStatus: 'ok',
          });
          artistId = match.artistId;
        } else {
          await writeIdentity(row, { deezerStatus: 'notFound' });
        }
        record(true);
      }
      if (artistId === null || !reachDue(candidate.artistId, 'deezer')) {
        advance();
        continue;
      }
      const fans = await fetchDeezerFans(artistId, deps);
      lookedUp.add(candidate.artistId);
      await writeReach({
        key: reachKey(candidate.artistId, 'deezer'),
        artistId: candidate.artistId,
        source: 'deezer',
        status: fans.status,
        value: fans.status === 'ok' ? fans.fans : null,
        fetchedAt: startedAt,
        retryAfter: fans.status === 'retryLater' ? retryAt(null) : null,
        sourceUrl: fans.sourceUrl,
      });
      advance();
      if (record(fans.status !== 'retryLater')) return;
    }
  }

  async function wikidataPhase(): Promise<void> {
    async function keep(
      candidate: ReachCandidate,
      hit: WikidataHit
    ): Promise<void> {
      await writeIdentity(identityOf(candidate), {
        qid: hit.qid,
        qidStatus: 'ok',
        qidCheckedAt: startedAt,
        sitelinks: hit.sitelinks,
        wikiTitles: hit.wikiTitles,
      });
    }
    async function miss(candidate: ReachCandidate): Promise<void> {
      const row = identityOf(candidate);
      // A QID is permanent: a miss on a refresh only restarts the clock.
      if (row.qid !== null) {
        return writeIdentity(row, { qidCheckedAt: startedAt });
      }
      return writeIdentity(row, {
        qidStatus: 'notFound',
        qidCheckedAt: startedAt,
      });
    }

    const byId = new Map(candidates.map((c) => [c.artistId, c]));
    // `ok` is included past ninety days: the sitelink count is the whole
    // well-known rule, so a new article must be able to move an artist.
    const pass1 = candidates.filter((candidate) =>
      needsWikidata(startRows.get(candidate.artistId), startedAt, {
        okMs: REACH_TTL_MS,
        notFoundMs: REACH_NOT_FOUND_TTL_MS,
      })
    );
    const batches = wikidataBatches(pass1.map((c) => c.artistId));
    begin('wikidata', batches.length);
    const missed: ReachCandidate[] = [];
    for (const ids of batches) {
      const batch = await resolveBySpotifyId(ids, deps);
      for (const id of ids) lookedUp.add(id);
      if (batch.status !== 'ok') {
        // The whole batch stays `unchecked`, so the next run asks again.
        advance();
        if (record(false)) return;
        continue;
      }
      for (const id of ids) {
        const candidate = byId.get(id);
        if (!candidate) continue;
        // An id bound to two items is absent from `hits`, so it reads as a
        // miss here and is never promoted on evidence the app cannot resolve.
        const hit = batch.hits.get(id);
        if (hit) {
          await keep(candidate, hit);
        } else if ((idRows.get(id)?.mbid ?? null) !== null) {
          missed.push(candidate);
        } else {
          await miss(candidate);
        }
      }
      advance();
      record(true);
    }

    const byMbid = new Map<string, ReachCandidate[]>();
    for (const candidate of missed) {
      const mbid = idRows.get(candidate.artistId)?.mbid;
      if (mbid == null) continue;
      byMbid.set(mbid, [...(byMbid.get(mbid) ?? []), candidate]);
    }
    const pass2 = wikidataBatches([...byMbid.keys()]);
    if (pass2.length === 0) return;
    // The second pass's batch count is unknown until the first has missed.
    total += pass2.length;
    running();
    for (const mbids of pass2) {
      const batch = await resolveByMbid(mbids, deps);
      if (batch.status !== 'ok') {
        advance();
        if (record(false)) return;
        continue;
      }
      for (const mbid of mbids) {
        const hit = batch.hits.get(mbid);
        for (const candidate of byMbid.get(mbid) ?? []) {
          if (hit) await keep(candidate, hit);
          else await miss(candidate);
        }
      }
      advance();
      record(true);
    }
  }

  async function wikipediaPhase(): Promise<void> {
    function titlesOf(artistId: string): {
      en: string | null;
      fr: string | null;
    } {
      return idRows.get(artistId)?.wikiTitles ?? { en: null, fr: null };
    }
    const todo = candidates.filter((candidate) => {
      const titles = titlesOf(candidate.artistId);
      if (titles.en === null && titles.fr === null) return false;
      return reachDue(candidate.artistId, 'wikipedia');
    });
    begin('wikipedia', todo.length);
    for (const candidate of todo) {
      // The client paces its own two language requests; between artists the
      // pace is the run's (spec §4.4).
      await deps.sleep(WIKIPEDIA_INTERVAL_MS);
      const views = await fetchPageviews(titlesOf(candidate.artistId), deps);
      lookedUp.add(candidate.artistId);
      const extra: ArtistReachRow['extra'] = { months: views.months };
      if (views.en !== null) extra.en = views.en;
      if (views.fr !== null) extra.fr = views.fr;
      await writeReach({
        key: reachKey(candidate.artistId, 'wikipedia'),
        artistId: candidate.artistId,
        source: 'wikipedia',
        status: views.status,
        value: views.value,
        ...(views.status === 'ok' ? { extra } : {}),
        fetchedAt: startedAt,
        retryAfter: views.status === 'retryLater' ? retryAt(null) : null,
        sourceUrl: views.sourceUrl,
      });
      advance();
      if (record(views.status !== 'retryLater')) return;
    }
  }

  /** Every count describes the whole store at `ranAt`, not the run's work. */
  function summarise(): ArtistReachSummary {
    let covered = 0;
    for (const candidate of candidates) {
      const sources: ReachSource[] = ['listenbrainz', 'deezer', 'wikipedia'];
      const any = sources.some(
        (source) =>
          reachRows.get(reachKey(candidate.artistId, source))?.status === 'ok'
      );
      if (any) covered += 1;
    }
    let resolved = 0;
    let wikipedia = 0;
    let wellKnown = 0;
    for (const row of idRows.values()) {
      if (row.mbid !== null) resolved += 1;
      if (row.wikiTitles.en !== null || row.wikiTitles.fr !== null) {
        wikipedia += 1;
      }
      if (isWellKnown(row)) wellKnown += 1;
    }
    let listenbrainz = 0;
    let deezer = 0;
    for (const row of reachRows.values()) {
      if (row.status !== 'ok') continue;
      if (row.source === 'listenbrainz') listenbrainz += 1;
      if (row.source === 'deezer') deezer += 1;
    }
    return {
      version: 1,
      ranAt: startedAt,
      artists: candidates.length,
      covered,
      resolved,
      listenbrainz,
      deezer,
      wikipedia,
      wellKnown,
      paused: [...paused],
    };
  }

  async function finish(): Promise<ArtistReachSummary> {
    const summary = summarise();
    await putMeta(ARTIST_REACH_SUMMARY_META, summary);
    return summary;
  }

  const release = deps.acquireWakeLock
    ? await deps.acquireWakeLock().catch(() => null)
    : null;
  try {
    await musicbrainzPhase();
    await listenbrainzPhase();
    await deezerPhase();
    await wikidataPhase();
    await wikipediaPhase();
    const summary = await finish();
    deps.onState({
      status: 'done',
      summary,
      run: {
        lookedUp: lookedUp.size,
        written,
        unresolved: summary.artists - summary.covered,
      },
      paused: [...paused],
    });
  } catch (err) {
    const message = storageMessage(err);
    try {
      // The gate is this record: a first run that wrote a few hundred rows
      // and then failed must not leave the pre-run card on screen.
      await finish();
    } catch {
      // The run's own message is already on its way to the screen.
    }
    deps.onState({ status: 'error', message, paused: [...paused] });
  } finally {
    if (release) await release().catch(() => undefined);
  }
}
```

- [ ] **Step 8: Run the tests and the full gate**

Run: `yarn test src/features/reachRun.test.ts`
Expected: PASS, `Test Files  1 passed (1)`, `Tests  15 passed (15)`.

Run: `yarn typecheck && yarn lint && yarn test && yarn build`
Expected: all four pass; `Test Files  36 passed (36)`,
`Tests  385 passed (385)`. `yarn build` emits `dist/assets/index-*.js`,
`dist/assets/index-*.css` and `dist/assets/import.worker-*.js` and the bundle
does not grow: nothing imports `reachRun.ts` until Task 5 wires the
Settings card, so it is not in the graph yet.

Run: `npx prettier --check "src/**/*.ts"`
Expected: `All matched files use Prettier code style!`

- [ ] **Step 9: Commit**

```bash
yarn format
git add src/features/reachRun.ts src/features/reachRun.test.ts
git commit -m "feat(features): resumable five-phase artist reach run

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

---
### Task 5: State wiring and the Settings "Artist reach" card

**Files:**

- Create: none
- Modify: `src/model/state.ts` (the import block, the signal block,
  `loadFromDb`, a new `jobsBusy` beside `isSyncBusy`, the `reachCoverage`
  re-export beside `coverage`, a new `startReach` above `disconnect`, and
  `disconnect`'s guard and resets), `src/ui/Settings.tsx` (the import block,
  `AudioCard`'s `busy`, a new `SOURCE_LABEL` / `reachLine` / `reachRunLine` /
  `pausedLine` / `ReachCard` block, and in `Settings` the `working` flag, the
  Sync button's `disabled` and the one line that renders `<ReachCard />`)
- Test: none. Nothing pure is added: `state.ts` cannot be unit tested in this
  project at all (importing it under Vitest pulls in `src/auth/browser.ts`,
  which touches `localStorage` at module scope), screens have no component
  tests, and spec §7 says so in as many words — "Screens: no unit tests". The
  three private string helpers in `Settings.tsx` follow `historyLine`,
  `coverageLine` and `rekordboxLine`, which are private and untested for the
  same reason. Verification is the gate (Step 12) plus the browser
  walkthrough (Step 13).
- Unchanged, do not touch: `src/styles.css` — §6's `.reach` and
  `.list li.group` rules belong to Task 6, and this card needs no new rule:
  it is built from `.card`, `.muted`, `.warn`, `.error` and `Progress`, all of
  which already exist. `src/ui/components/Progress.tsx`, `src/ui/Artists.tsx`,
  `src/ui/Artist.tsx`, `src/model/reach.ts`, `src/features/reachRun.ts` and
  the five clients are read but not edited. **`compactCount` already exists in
  `src/ui/format.ts`, tested — do not re-add it** (core plan decision 18), and
  this card does not use it: listeners, fans and every coverage number are
  printed in full.

**Interfaces:**

- Consumes, from existing code exactly as it stands at `feat/bpm-key` `4d7c981`:
  - `src/model/state.ts`: `model`, `banner`, `syncState`, `importState`,
    `lookupState`, `rekordboxState`, `rekordboxSummary`, `historySummary`,
    `lastSyncAt`, `loadFromDb()`, `isSyncBusy(state, now?)`, `clearBanner()`
    (private), `acquireWakeLock()` (private), `coverage(m)`, `disconnect()`.
  - `src/model/banner.ts`: `errorBanner(text, inlineOn?)`,
    `warnBanner(text)`, `type BannerMessage`. The banner is a `BannerMessage`,
    never a string; `inlineOn: ['settings']` is what keeps the reach error off
    the top of the screen that already prints it.
  - `src/ui/format.ts`: `plural(n, word)`, `formatDate(value)`.
  - `src/ui/components/Progress.tsx`:
    `Progress({ label, done, total, unit? })` — `unit` defaults to
    `'playlists'`, and the bar plus the `done / total unit` line are hidden
    while `total` is 0, which is why this card never prints a counter twice.
  - `src/db/repo.ts`: `getMeta<T>(name)`.
- Consumes, from Tasks 1 to 4, exactly as those tasks leave them:

  ```ts
  // Task 1 — src/model/reach.ts
  export interface ReachCoverage {
    artists: number;
    covered: number;
    resolved: number;
    listenbrainz: number;
    deezer: number;
    wikipedia: number;
    wellKnown: number;
  }
  /** Scoped to the candidates (artists with a Spotify id) and memoised on
   *  the Model object identity, so a Settings render costs one map read. */
  export function reachCoverage(m: Model): ReachCoverage;

  // Task 1 — src/model/aggregate.ts
  // Model gains: identities: Map<string, ArtistIdentityRow>
  //              reach: Map<string, ArtistReachRow>

  // Task 2 — src/features/jsonp.ts
  export const JSONP_TIMEOUT_MS = 10_000;
  export function jsonp(url: string, timeoutMs: number): Promise<unknown>;

  // Task 4 — src/features/reachRun.ts
  export const ARTIST_REACH_SUMMARY_META = 'artistReachSummary';
  export type ReachStep = ReachSource | 'musicbrainz' | 'wikidata';
  export interface ArtistReachSummary extends ReachCoverage {
    version: 1;
    ranAt: number;
    paused: ReachStep[];
  }
  export interface ReachRunCounts {
    lookedUp: number;
    written: number;
    unresolved: number;
  }
  export type ReachState =
    | { status: 'idle' }
    | {
        status: 'running';
        step: ReachStep;
        done: number;
        total: number;
        paused: ReachStep[];
      }
    | {
        status: 'done';
        summary: ArtistReachSummary;
        run: ReachRunCounts;
        paused: ReachStep[];
      }
    | { status: 'error'; message: string; paused: ReachStep[] };
  export interface ReachDeps {
    fetchFn: typeof fetch;
    jsonpFn: (url: string, timeoutMs: number) => Promise<unknown>;
    sleep: (ms: number) => Promise<void>;
    now: () => number;
    onState: (state: ReachState) => void;
    acquireWakeLock?: () => Promise<() => Promise<void>>;
  }
  export interface ReachCandidate {
    artistId: string;
    name: string;
    isrcs: string[];
  }
  export function reachCandidates(model: Model): ReachCandidate[];
  /** Never throws: every failure arrives through deps.onState, as in
   *  runSync, runImport and runLookup. Rows are written per artist, so a
   *  run that ends in `error` still leaves what it fetched, and the summary
   *  meta row is written on every exit path including that one. */
  export function runReach(
    deps: ReachDeps,
    candidates: ReachCandidate[],
    identities: ArtistIdentityRow[],
    reach: ArtistReachRow[]
  ): Promise<void>;
  ```

  `deps.jsonpFn` is called by `deezer.ts` as `deps.jsonpFn(url,
  JSONP_TIMEOUT_MS)` — the client passes the timeout, so `state.ts` hands over
  the bare `jsonp` function and adds nothing.

- Produces, for Task 6 and for the Settings card:

  ```ts
  // src/model/state.ts
  export const reachState: Signal<ReachState>;
  export const artistReachSummary: Signal<ArtistReachSummary | null>;
  /** True while any of the five jobs is running (spec §5.5). */
  export function jobsBusy(): boolean;
  /** Never on load: started only by the Settings card's button. */
  export function startReach(): Promise<void>;
  export { reachCoverage, type ReachCoverage } from './reach';
  ```

  Task 6 reads `artistReachSummary.value?.version === 1` for its gate
  (§5.2, §5.4), `reachCoverage(model)` from `'../model/state'` for §5.3's
  caption, and nothing else from here. `SOURCE_LABEL`, `reachLine`,
  `reachRunLine`, `pausedLine` and `ReachCard` stay private to
  `Settings.tsx`: no screen outside this card names a source as a *step*.

- [ ] **Step 1: Add the two feature imports to `src/model/state.ts`**

The `../features/*` lines are sorted by path, so `jsonp` goes above `lookup`
and `reachRun` between `lookup` and `rekordbox-match`. The `../db/repo` line
and the `rekordbox-match` line are quoted only as anchors and come back
unchanged. Replace:

```ts
import { getAllRows, getMeta, putMeta, wipeDb } from '../db/repo';
import {
  PASS_BY_ID,
  candidateIds,
  runLookup,
  type LookupState,
} from '../features/lookup';
import type { LibraryTrack } from '../features/rekordbox-match';
```

with:

```ts
import { getAllRows, getMeta, putMeta, wipeDb } from '../db/repo';
import { jsonp } from '../features/jsonp';
import {
  PASS_BY_ID,
  candidateIds,
  runLookup,
  type LookupState,
} from '../features/lookup';
import {
  ARTIST_REACH_SUMMARY_META,
  reachCandidates,
  runReach,
  type ArtistReachSummary,
  type ReachState,
} from '../features/reachRun';
import type { LibraryTrack } from '../features/rekordbox-match';
```

- [ ] **Step 2: Add the two signals**

Spec §5.6. `reachState` is deliberately **not** persisted — the run result
line is gone after a reload while the coverage line and the `as of` date
survive, because those come from the model and from meta. Replace:

```ts
export const rekordboxSummary = signal<RekordboxSummary | null>(null);
export const banner = signal<BannerMessage | null>(null);
```

with:

```ts
export const rekordboxSummary = signal<RekordboxSummary | null>(null);
export const reachState = signal<ReachState>({ status: 'idle' });
export const artistReachSummary = signal<ArtistReachSummary | null>(null);
export const banner = signal<BannerMessage | null>(null);
```

- [ ] **Step 3: Read the summary in `loadFromDb`**

Core plan decision 1: no repository accessor was added, so the record is read
with `getMeta`, exactly as `RekordboxSummary` is on the line above. Replace:

```ts
    rekordboxSummary.value =
      (await getMeta<RekordboxSummary>(REKORDBOX_SUMMARY_META)) ?? null;
    if (crateStatus.value === 'reimport') await showCrateNotice();
```

with:

```ts
    rekordboxSummary.value =
      (await getMeta<RekordboxSummary>(REKORDBOX_SUMMARY_META)) ?? null;
    artistReachSummary.value =
      (await getMeta<ArtistReachSummary>(ARTIST_REACH_SUMMARY_META)) ?? null;
    if (crateStatus.value === 'reimport') await showCrateNotice();
```

- [ ] **Step 4: Add `jobsBusy` beside `isSyncBusy`**

One predicate replaces three hand-written busy rules (spec §5.5). Replace:

```ts
/** True while a sync is running or the quota lock-out has not lapsed. */
export function isSyncBusy(state: SyncState, now = Date.now()): boolean {
  return (
    state.status === 'running' ||
    (state.status === 'locked' && state.retryAt > now)
  );
}

export async function startSync(priorityId?: string): Promise<void> {
```

with:

```ts
/** True while a sync is running or the quota lock-out has not lapsed. */
export function isSyncBusy(state: SyncState, now = Date.now()): boolean {
  return (
    state.status === 'running' ||
    (state.status === 'locked' && state.retryAt > now)
  );
}

/**
 * True while any of the five jobs is running (spec §5.5). Every one of them
 * ends in `loadFromDb()`, so a second job started mid-run would clobber the
 * first one's model rebuild. It reads `syncState.status === 'running'` and
 * deliberately not `isSyncBusy`: a Spotify quota lock-out lasting hours must
 * not block a reach run, which touches no Spotify endpoint.
 */
export function jobsBusy(): boolean {
  return (
    syncState.value.status === 'running' ||
    importState.value.status === 'running' ||
    lookupState.value.status === 'running' ||
    rekordboxState.value.status === 'running' ||
    reachState.value.status === 'running'
  );
}

export async function startSync(priorityId?: string): Promise<void> {
```

- [ ] **Step 5: Re-export `reachCoverage` beside `coverage`**

Core plan decision 3 and spec §5.5: the function is implemented in
`model/reach.ts`, where it has unit tests, and the screens import it from
`model/state.ts`, where `coverage` already lives. Replace:

```ts
  return { total: candidates.length, covered, reccobeats, rekordbox };
}

/**
 * The Rekordbox matcher works on Spotify tracks only: a local file has no
```

with:

```ts
  return { total: candidates.length, covered, reccobeats, rekordbox };
}

/**
 * Spec §5.5 and §5.3 import the reach coverage line from here, beside
 * `coverage`. It is implemented in `model/reach.ts`, where it can be unit
 * tested: importing `state.ts` under Vitest pulls in `auth/browser.ts`, which
 * touches `localStorage` at module scope.
 */
export { reachCoverage, type ReachCoverage } from './reach';

/**
 * The Rekordbox matcher works on Spotify tracks only: a local file has no
```

- [ ] **Step 6: Add `startReach` above `disconnect`**

It mirrors `startLookup` line for line: the `running` state is claimed
synchronously so a second tap cannot start a second run, the rows come from
the model rather than from a fresh IndexedDB read, `loadFromDb()` runs even
after an error so a partial run still shows its coverage, and the error goes
to the banner with `inlineOn: ['settings']` because the card prints it too.
Replace:

```ts
  await loadFromDb();
  const state = rekordboxState.value;
  if (state.status === 'error') {
    banner.value = errorBanner(state.message, ['settings']);
  }
}

export async function disconnect(): Promise<void> {
```

with:

```ts
  await loadFromDb();
  const state = rekordboxState.value;
  if (state.status === 'error') {
    banner.value = errorBanner(state.message, ['settings']);
  }
}

/** Never on load: the artist reach run starts only from this button. */
export async function startReach(): Promise<void> {
  if (reachState.value.status === 'running') return;
  const m = model.value;
  if (!m) return;
  clearBanner();
  // Claimed synchronously so a second tap cannot start a second run.
  // `as ReachState` keeps the signal at its declared union type, as in
  // startSync and startLookup.
  reachState.value = {
    status: 'running',
    step: 'musicbrainz',
    done: 0,
    total: 0,
    paused: [],
  } as ReachState;
  // Identities and reach rows come from the model, not from a fresh
  // IndexedDB read: a rejected read would strand the state on `running`
  // forever, because runReach itself never throws.
  await runReach(
    {
      // Bare `fetch` throws "Illegal invocation" once unbound from window.
      fetchFn: (input, init) => fetch(input, init),
      // Deezer sends no CORS header at all, so its four calls go through
      // the <script> transport; the client passes its own timeout.
      jsonpFn: jsonp,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now: () => Date.now(),
      onState: (state) => {
        reachState.value = state;
      },
      acquireWakeLock: 'wakeLock' in navigator ? acquireWakeLock : undefined,
    },
    reachCandidates(m),
    [...m.identities.values()],
    [...m.reach.values()]
  );
  // Rows written per artist: reload even after an error, so a partial run
  // still shows its coverage.
  await loadFromDb();
  const state = reachState.value;
  if (state.status === 'error') {
    banner.value = errorBanner(state.message, ['settings']);
  }
}

export async function disconnect(): Promise<void> {
```

- [ ] **Step 7: Widen `disconnect`'s guard and its resets**

Two edits, spec §5.6. **7a — the guard and its copy.** Replace:

```ts
  if (
    syncState.value.status === 'running' ||
    importState.value.status === 'running' ||
    lookupState.value.status === 'running' ||
    rekordboxState.value.status === 'running'
  ) {
    banner.value = warnBanner(
      'Wait for the current sync, history import, lookup or Rekordbox import to finish before disconnecting.'
    );
    return;
  }
```

with:

```ts
  if (jobsBusy()) {
    banner.value = warnBanner(
      'Wait for the current sync, history import, lookup, Rekordbox import or artist lookup to finish before disconnecting.'
    );
    return;
  }
```

**7b — the resets.** `wipeDb` already deletes the whole database, so both new
stores go with it; these two lines are the in-memory half. Replace:

```ts
  rekordboxState.value = { status: 'idle' };
  lastSyncAt.value = null;
  historySummary.value = null;
  rekordboxSummary.value = null;
```

with:

```ts
  rekordboxState.value = { status: 'idle' };
  reachState.value = { status: 'idle' };
  lastSyncAt.value = null;
  historySummary.value = null;
  rekordboxSummary.value = null;
  artistReachSummary.value = null;
```

- [ ] **Step 8: Rework the `src/ui/Settings.tsx` import block**

`importState` leaves the list: Step 11 replaces the only expression that read
it with `jobsBusy()`, which reads it inside `state.ts` instead.

> **If you gate every step, expect one failure here.** Between this step and
> Step 11 the file does not pass `yarn lint`: `'importState' is defined but
> never used`. **Do not re-add the import to clear it** — Step 11 removes its
> last reader, and putting it back leaves a second unused import for the
> executor after you. `yarn typecheck` stays clean throughout, because
> `noUnusedLocals` is off.

Replace:

```tsx
import { auth } from '../auth/browser';
import type { RekordboxSummary } from '../features/rekordboxImport';
import type { ImportSummary } from '../history/importer';
import {
  coverage,
  disconnect,
  historySummary,
  importState,
  isSyncBusy,
  keyNotation,
  lastSyncAt,
  lookupState,
  model,
  rekordboxState,
  rekordboxSummary,
  setKeyNotation,
  startLookup,
  startRekordboxImport,
  startSync,
  syncState,
  type Coverage,
  type KeyNotation,
} from '../model/state';
```

with:

```tsx
import { auth } from '../auth/browser';
import type { ReachRunCounts, ReachStep } from '../features/reachRun';
import type { RekordboxSummary } from '../features/rekordboxImport';
import type { ImportSummary } from '../history/importer';
import {
  artistReachSummary,
  coverage,
  disconnect,
  historySummary,
  isSyncBusy,
  jobsBusy,
  keyNotation,
  lastSyncAt,
  lookupState,
  model,
  reachCoverage,
  reachState,
  rekordboxState,
  rekordboxSummary,
  setKeyNotation,
  startLookup,
  startReach,
  startRekordboxImport,
  startSync,
  syncState,
  type Coverage,
  type KeyNotation,
  type ReachCoverage,
} from '../model/state';
```

- [ ] **Step 9: Add `SOURCE_LABEL`, the three copy helpers and `ReachCard`**

Spec §5.5, in the order the spec draws the card: coverage line, progress,
result line, paused lines, error line, button, `as of`, attribution. The
progress component prints its own `done / total unit` counter, so the numbers
are never said twice; `Wikidata` is the one step whose unit is `batches`,
because the runner chunks 150 ids per POST and `total` counts batches.

In `src/ui/Settings.tsx`, replace:

```tsx
export function Settings() {
```

with:

```tsx
const SOURCE_LABEL: Record<ReachStep, string> = {
  musicbrainz: 'MusicBrainz',
  listenbrainz: 'ListenBrainz',
  deezer: 'Deezer',
  wikidata: 'Wikidata',
  wikipedia: 'Wikipedia',
};

/**
 * Spec §5.5: "Reach data for 806 of 1,204 artists · MusicBrainz 1,151 · …".
 * The source counts overlap on purpose, exactly as the Audio data card's do,
 * so they can add up to more than `covered`.
 */
function reachLine(c: ReachCoverage): string {
  const artists = plural(c.artists, 'artist');
  return [
    `Reach data for ${c.covered.toLocaleString()} of ${artists}`,
    `MusicBrainz ${c.resolved.toLocaleString()}`,
    `ListenBrainz ${c.listenbrainz.toLocaleString()}`,
    `Deezer ${c.deezer.toLocaleString()}`,
    `Wikipedia ${c.wikipedia.toLocaleString()}`,
    `well known ${c.wellKnown.toLocaleString()}`,
  ].join(' · ');
}

/**
 * What this run did, never what the store holds: `lookedUp` and `written`
 * are run-scoped, and `unresolved` is the whole-store figure the owner asks
 * for once a run has stopped (spec §5.5).
 */
function reachRunLine(run: ReachRunCounts): string {
  return [
    `Looked up ${plural(run.lookedUp, 'artist')}`,
    plural(run.written, 'new number'),
    `${run.unresolved.toLocaleString()} unresolved`,
  ].join(' · ');
}

function pausedLine(step: ReachStep): string {
  return (
    `${SOURCE_LABEL[step]} stopped answering after three tries; ` +
    'the rest of this run skipped it.'
  );
}

function ReachCard() {
  const m = model.value;
  const state = reachState.value;
  const summary = artistReachSummary.value;
  const busy = jobsBusy();
  const cov = m ? reachCoverage(m) : null;
  return (
    <div class="card">
      <h2>Artist reach</h2>
      {cov && cov.artists > 0 ? (
        <p>{reachLine(cov)}</p>
      ) : (
        <p class="muted">Sync your playlists first.</p>
      )}
      {state.status === 'running' && (
        <Progress
          label={`Resolving artists · ${SOURCE_LABEL[state.step]}`}
          done={state.done}
          total={state.total}
          unit={state.step === 'wikidata' ? 'batches' : 'artists'}
        />
      )}
      {state.status === 'done' && state.run.lookedUp === 0 && (
        <p class="muted">Nothing new to look up.</p>
      )}
      {state.status === 'done' && state.run.lookedUp > 0 && (
        <p class="muted">{reachRunLine(state.run)}</p>
      )}
      {state.status !== 'idle' &&
        state.paused.map((step) => (
          <p key={step} class="warn">
            {pausedLine(step)}
          </p>
        ))}
      {state.status === 'error' && (
        <p class="error">Last error: {state.message}</p>
      )}
      <button
        type="button"
        disabled={busy || !m}
        onClick={() => void startReach()}
      >
        {state.status === 'running' ? 'Looking up…' : 'Look up artists'}
      </button>
      {summary && <p class="muted">as of {formatDate(summary.ranAt)}</p>}
      <p class="muted">
        Artist data via MusicBrainz and ListenBrainz · Deezer · Wikidata (CC0) ·
        Wikipedia (CC BY-SA)
      </p>
    </div>
  );
}

export function Settings() {
```

- [ ] **Step 10: Switch `AudioCard`'s busy rule to `jobsBusy`**

Spec §5.5: the ReccoBeats button and the Rekordbox XML input must not start
mid-run, because both they and the reach run call `loadFromDb()` on
completion. `lookup` and `rekordbox` are still read by the card's own progress
and error lines, so neither `const` is removed. Replace:

```tsx
  // Both write the same store, so neither starts while the other runs.
  const busy = lookup.status === 'running' || rekordbox.status === 'running';
```

with:

```tsx
  // Every job ends in loadFromDb(), so no two of the five ever overlap
  // (spec §5.5): jobsBusy() gates this card as well as Disconnect.
  const busy = jobsBusy();
```

- [ ] **Step 11: Wire `Settings` — `working`, the Sync gate and the card**

Three edits. **11a — `working`.** It gates both the Disconnect button and
"Connect again", and both must now stop for a reach run: `auth.logout()`
mid-run would strand `reachState` on `running` with nothing on screen to
clear it. Replace:

```tsx
  const working =
    running ||
    importState.value.status === 'running' ||
    lookupState.value.status === 'running' ||
    rekordboxState.value.status === 'running';
```

with:

```tsx
  // One predicate for all five jobs: the wipe below and the reach run must
  // never overlap either (spec §5.5).
  const working = jobsBusy();
```

**11b — the Sync button.** It keeps `isSyncBusy(state)` for its own quota
lock-out and gains the run, exactly as spec §5.5 words it — not `jobsBusy()`,
which would newly block a sync during a history import, a behaviour change
this spec does not ask for. Replace:

```tsx
            disabled={isSyncBusy(state)}
```

with:

```tsx
            disabled={
              isSyncBusy(state) || reachState.value.status === 'running'
            }
```

**11c — render the card.** Spec §5.5: after "Audio data", so the destructive
Disconnect card stays last. Replace:

```tsx
      <AudioCard />
```

with:

```tsx
      <AudioCard />
      <ReachCard />
```

- [ ] **Step 12: Run the full gate**

Run: `npx prettier --check "src/**/*.{ts,tsx}"`
Expected: `All matched files use Prettier code style!` — every block above is
already Prettier output.

Run: `yarn typecheck && yarn lint && yarn test && yarn build`
Expected: all four pass. **The suite is exactly the one Task 4 left behind:
this task adds, removes and renames no test.** `yarn build` gains eight
modules and grows the main chunk by roughly 19 kB (measured: 70 modules and
98.69 kB / 32.78 kB gzipped, to 78 and 117.33 kB / 38.01 kB) — this is the
first import of `reachRun.ts` from the app, so the five clients and the JSONP
transport enter the bundle here. No new worker chunk appears: nothing in this
feature runs in a worker.

The gate is what proves the wiring compiles. `startReach`, `jobsBusy` and the
`reachCoverage` re-export have no other caller, and `ReachCard` is reached
only through the one line added in Step 11c.

- [ ] **Step 13: Browser walkthrough**

> **NOTE — this step makes real network requests.** Tapping **Look up
> artists** starts the actual job against MusicBrainz, ListenBrainz, Deezer,
> Wikidata and Wikipedia — the five phases in their run order. The fixture
> below holds **43 artists with a Spotify id**, and the run's length is the
> sum of its paces: ~43 s of MusicBrainz at 1 req/s, ~35 s of ListenBrainz at
> 1 req/s, two Wikidata POSTs, a few seconds of Deezer (only three of those
> tracks have a single-artist ISRC, so most artists are written `notFound`
> with no request at all) and ~15 s of Wikipedia pageviews — **under two
> minutes, three if a source backs off**, ending with real numbers. That is the point of the step — nothing else in this task
> exercises `runReach` — but do not start it twice, and do not run it on a
> metered connection.

`yarn dev`, then open `http://127.0.0.1:5173/myOwnSpotifyData/#/settings`
(never `localhost` — Spotify refuses it as a redirect URI). In DevTools, put
the device toolbar at **390 × 844**. Fixture files live in
`scratchpad/bpm-final-review/`.

1. **Seed.** In the console paste `stub-session.js` (one line; it writes a
   stub `session` into `localStorage`), reload so the app opens the database
   once — it is created at `DB_VERSION` 3 by Task 1 — then paste `seed-db.js`
   **with its version guard changed from `if (db.version !== 2)` to
   `if (db.version !== 3)`**; the file was written when the schema was at
   version 2 and throws `expected DB version 2, got 3` otherwise. Reload
   again. Settings now shows two playlists' worth of data.
2. **Zero state.** The **Artist reach** card sits between **Audio data** and
   **Disconnect** and reads `Reach data for 0 of 43 artists · MusicBrainz 0 ·
   ListenBrainz 0 · Deezer 0 · Wikipedia 0 · well known 0`, with no progress
   bar, no result line and no `as of` line. The permanent attribution line
   `Artist data via MusicBrainz and ListenBrainz · Deezer · Wikidata (CC0) ·
   Wikipedia (CC BY-SA)` is under the button, wrapping to two or three lines
   at 390 px. The button reads **Look up artists** and is enabled. Check its
   box is at least 44 px tall (it inherits the same `.card button` rule as
   "Look up (ReccoBeats)" directly above).
3. **Run it.** Tap **Look up artists**. The button reads `Looking up…` and is
   disabled; the progress line reads `Resolving artists · MusicBrainz` with a
   bar and `N / 43 artists` counting up. Watch the label walk the five phases
   in their fixed order — `· MusicBrainz`, `· ListenBrainz`, `· Deezer`,
   `· Wikidata` (whose counter reads `batches`, not `artists`, and is one or
   two of them for a library this size) and `· Wikipedia`, each starting its
   own `done / total` over. **While it runs**, confirm the mutual
   exclusion this task exists for: **Sync now**, **Connect again**, **Look up
   (ReccoBeats)**, the Rekordbox XML input and **Disconnect** are all
   disabled. Nothing else on the screen moves.
4. **Result.** When it stops, a muted line reads
   `Looked up 43 artists · N new numbers · M unresolved`, the coverage line
   has moved off zero (these are mainstream artists, so expect most of them
   resolved and many `well known`), and `as of <today>` sits under the button.
   Every disabled control is enabled again.
5. **Reload.** The coverage line and the `as of` date survive; the result
   line does not, because `reachState` lives in a signal and never in meta
   (spec §5.5).
6. **Nothing new.** Tap **Look up artists** again straight away: everything
   is fresh, so the run has nothing to ask and the card reads
   `Nothing new to look up.`
7. **Disconnect.** With no job running, **Disconnect** is enabled and its
   `confirm()` still asks before wiping; answer **Cancel**. Its `jobsBusy()`
   guard and the warning copy — `Wait for the current sync, history import,
   lookup, Rekordbox import or artist lookup to finish before disconnecting.`
   — are defence in depth behind the disabled button checked in item 3: with
   the button disabled during every job, that banner is unreachable by tap,
   and that is deliberate (spec §5.5: "the owner is stopped before the
   destructive `confirm()` rather than after it"). Read the copy in the diff;
   do not go hunting for a click that reaches it.
8. **Paused notice — optional, and it costs a re-seed.** The amber pause
   line only appears when a source stops answering, so it needs a store with
   work still pending: everything is fresh after item 4. Tap **Disconnect**
   and accept, re-seed with item 1's two scripts, then in DevTools > Network
   switch to **Offline** and tap **Look up artists**. Within a few seconds
   MusicBrainz gives up and an amber line reads `MusicBrainz stopped
   answering after three tries; the rest of this run skipped it.`, and a
   second one says the same for Deezer once its phase has also tried three
   artists. Expect exactly those two: ListenBrainz and Wikipedia have nothing
   to ask without an MBID or an article title, and Wikidata's single failed
   batch is one failure, not three. The run still ends with a result line —
   `Looked up 43 artists · 0 new numbers · 43 unresolved`, because the
   Wikidata batch counts every id it carried even though the POST never
   landed — and with an `as of` date, since the summary is written on every
   exit path. Then go back online and tap **Look up artists** once more to
   fill the store for real: the handful of artists the offline run stamped
   `retryLater` sit behind a one-day gate, so this run asks about the rest
   and the coverage line stops a little short of the full 43. The red
   `Last error:` line is a different path — `runReach` reaches `error` only
   when IndexedDB itself fails, which Task 4's tests cover and a browser
   cannot easily provoke.

Stop the server. **Note for Task 6:** the artists now carry reach rows, so
`#/artists` has real data to show once its Under the radar view lands; do not
wipe this database again.

- [ ] **Step 14: Commit**

```bash
git add src
git commit -m "feat(reach): wire the reach run into state and add the Settings card

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

**Decisions this task makes that the spec left open:**

- **`jobsBusy()` reads signals inside a plain function, not a `computed`.**
  Preact tracks every signal read during a component's render, so a component
  calling `jobsBusy()` subscribes to whichever signals the `||` chain actually
  read; the one that made it true was read, so its flip re-renders. A
  `computed` would buy nothing and would be a second thing to keep in sync
  with `disconnect`, which calls the same function outside a render.
- **`working` now gates "Connect again" as well as **Disconnect**.** Spec
  §5.5 names only the Disconnect button, but the two share the flag and
  `auth.logout()` mid-run would strand `reachState` on `running`. Widening
  both is the safe reading; narrowing it would need a second flag. Checked
  before deciding: this cannot trap an owner whose login expires mid-run.
  `src/model/state.ts` is the only module that imports `spotify/api`, the
  Sync button that reaches it is disabled for the duration, and nothing
  expires a session on a timer — tokens refresh lazily on an API call. So no
  auth error can surface while a run is on, and the recovery
  ("Connect again") is not needed until it ends. `auth.logout()` has exactly
  two call sites: this button and `startSync`'s auth-error path. The
  walkthrough's item 3 checks the button is disabled, so the browser step
  covers this decision rather than leaving it on paper.
- **The Sync button keeps its own literal gate** —
  `isSyncBusy(state) || reachState.value.status === 'running'` — rather than
  `jobsBusy()`. Spec §5.5 words it exactly that way, and `jobsBusy()` there
  would newly disable Sync during a history import: a behaviour change this
  spec does not ask for. The pre-existing overlap between a sync and a
  ReccoBeats lookup stays out of scope, as §5.5 says.
- **`state.ts` re-exports the `ReachCoverage` *type* alongside the
  function**, `export { reachCoverage, type ReachCoverage } from './reach';`.
  The obligation from Task 1 pins only the value, but `Settings.tsx` needs the
  type for `reachLine(c: ReachCoverage)`, and importing the value from
  `state.ts` and the type from `model/reach.ts` would split one concept across
  two paths. This mirrors how the card already imports `coverage` and
  `type Coverage` together. `verbatimModuleSyntax` is on, hence the inline
  `type` modifier.
- **`SOURCE_LABEL` lives in `Settings.tsx`**, typed `Record<ReachStep,
  string>` so a sixth step would not compile without a label. It is the *step*
  vocabulary of a run; Task 6's Artist-screen links (`ListenBrainz ›`,
  `Deezer ›`, `Wikipedia ›`) are site names in a different sentence and stay
  literals there. Nothing outside this card imports it.
- **The card's button is disabled on `jobsBusy() || !m`**, spec §5.5's words,
  which is deliberately unlike `AudioCard`'s `!cov || cov.total === 0`. A
  library with no candidate artist therefore shows an enabled button above
  `Sync your playlists first.`; tapping it is a no-op run that reports
  `Nothing new to look up.`, which is a truthful answer and cheaper than a
  fourth disabled state.
- **"Nothing new to look up." is chosen on `run.lookedUp === 0`**, not on
  `written === 0`: `lookedUp` counts the artists this run issued at least one
  request for, so zero means the job asked nothing at all. `written === 0`
  after real requests is a different fact and belongs in the result line,
  where it reads `0 new numbers`.
- **The paused lines render for `running`, `done` and `error` alike** —
  `state.status !== 'idle' && state.paused.map(…)` — so a pause followed by an
  error is still on screen, which §5.5 asks for in as many words. TypeScript
  narrows the union to the three variants that carry `paused`, so no cast is
  needed. Each line is keyed on the step, which is unique within `paused`.
- **`pausedLine` splits its sentence across two string literals** rather than
  running a template literal past 80 columns. Prettier cannot break a template
  literal, so the concatenation is what keeps the file at the project's width;
  the rendered copy is unchanged.
- **The result line uses `plural` for its first two parts** (`Looked up 43
  artists`, `12 new numbers`) and prints `unresolved` as a bare number plus
  the adjective, which is what §5.5's example line reads. A run that looked up
  one artist therefore says `Looked up 1 artist · 1 new number · 3
  unresolved`.
- **No style rule is added.** The card is built from `.card`, `.muted`,
  `.warn`, `.error` and `Progress`, all of which exist; §6's `.reach` and
  `.list li.group` are Task 6's, and adding them here would leave two dead
  selectors in `dist/` until that task lands.

---
### Task 6: Artists tab "Under the radar", the Artist screen's reach lines and the styles

This task turns the Artists tab into a dispatcher over two views, writes the
new one, puts the same two lines on the Artist screen, and adds spec §6's two
CSS rules. It is the last task that touches source; Task 7 then brings the
three documents up to date.

Screens have no unit tests in this project, so almost everything here is
verified by the browser walkthrough in Step 11. Two things are not screens and
are therefore written test-first: `reachLine` and `profileLine`, the two pure
string builders in `src/ui/format.ts`. They exist as functions rather than as
JSX inside `UnderRadar.tsx` for a reason spec §5.4 states directly — "the reach
and public-profile lines use the same strings as the list rows" — and a shared
function is the only way to guarantee that. Every number they print comes from
`rankUnderTheRadar`, `reachFor` and `reachCoverage`, all covered by Task 1's
`src/model/reach.test.ts`.

**Files:**

- Create:
  - `src/ui/artistSelections.ts` (the three module-level selection signals)
  - `src/ui/UnderRadar.tsx` (the new view)
- Modify:
  - `src/ui/format.ts` (one import line; `reachLine` and `profileLine`
    appended after `artistUrl`)
  - `src/ui/format.test.ts` (the import list and two new tests: 7 -> 9)
  - `src/ui/Artists.tsx` (the whole file: it becomes the dispatcher, with
    today's screen kept intact as a module-private `SavedTracks`)
  - `src/ui/Artist.tsx` (the import block, two new module-private functions,
    two lines in the body)
  - `src/styles.css` (spec §6's `.reach` and `.list li.group`, appended)
- Not this task's, and not to be edited here:
  `docs/superpowers/specs/2026-09-05-artist-reach-design.md`, `README.md` and
  `CLAUDE.md` are Task 7's (decision 24)
- Test: `src/ui/format.test.ts` only. No component test — the project has
  none, and `vitest.config` runs in Node with no DOM.
- Not touched, deliberately:
  - `src/ui/format.ts`'s `compactCount`. Task 1 already added it and
    `format.test.ts` already covers its seven boundaries (core plan decision
    18). **Do not re-add it**; `profileLine` calls it.
  - `src/model/reach.ts`. Task 1 owns it and this task only reads from it.
  - `src/model/state.ts`. Task 5 owns every line this task consumes from it,
    including `export { reachCoverage } from './reach';` (core plan decision
    3). Adding that line here would collide with Task 5's own edit.
  - `src/ui/Settings.tsx`. §5.5's card is Task 5's.
  - `src/ui/components/TrackRow.tsx`, `Segmented.tsx`, `Filter.tsx`,
    `Empty.tsx`. Spec §6 reuses all four exactly as they stand: the reach
    lines ride in `TrackRow`'s existing `badges` slot, and `Segmented` already
    has the `scroll` variant the sort control needs.
  - `src/router.ts`. `#/artists` and `#/artist/<key>` already exist and the
    view switch is a signal, not a route: spec §5.1 keeps each setting across
    a tab switch and drops it on a reload, which a route would not do.

**Interfaces:**

- Consumes, from existing code (unchanged by this task):
  - `src/model/aggregate.ts`:
    `interface ArtistAgg { key: string; id: string | null; name: string; trackKeys: Set<string>; playlistIds: Set<string> }`,
    `interface Model` (this task reads `artists`, `artistsByKey`,
    `identities`), `artistTracks(model, key)`, `topArtistById(model, id)`.
  - `src/model/normalize.ts`: `normalize(value: string): string` — the same
    function today's filter uses.
  - `src/ui/components/TrackRow.tsx`:
    `TrackRow({ rank?, imageUrl?, title, subtitle?, href?, onClick?, spotifyUrl?, badges?, children? })`.
    `badges` is rendered inside `<div class="badges">`, the wrapping flex row
    spec §6 relies on; passing `href` is what draws the `›` chevron.
  - `src/ui/components/Segmented.tsx`:
    `Segmented<T extends string>({ options: { value: T; label: string }[], value: T, onChange: (value: T) => void, scroll? })`.
  - `src/ui/components/Filter.tsx`:
    `Filter({ value, onInput, placeholder })`.
  - `src/ui/components/Empty.tsx`: `Empty({ what: string })` — renders
    "No artists yet." and a Sync link.
  - `src/ui/format.ts`: `plural(n, word)`, `formatDate(value)`,
    `artistUrl(id)`, and `compactCount(n)` as Task 1 left it.
  - `src/router.ts`: `routeHref({ name: 'artist', key })`,
    `routeHref({ name: 'settings' })`.
- Consumes, from Task 1 (`src/model/reach.ts`):
  - `WELL_KNOWN_MIN_SITELINKS` (1) — `profileLine` imports the constant rather
    than repeating `>= 1`, so the line and `isWellKnown` cannot drift apart.
  - `reachFor(model, artistId): Reach` with
    `{ listenbrainz, deezer, wikipedia }: ArtistReachRow | undefined`. A row is
    present only when `status === 'ok' && value !== null`, so anything the
    Artist screen reads off it is a real number.
  - `hasHistory(m: Model): boolean`.
  - `type ReachSort = 'plays' | 'listeners' | 'fans'`,
    `type ReachGroup = 'radar' | 'unknown' | 'known'`.
  - `interface UnderRadarRow { agg: ArtistAgg; artistId: string; group: ReachGroup; rank: number; tracks: number; playlists: number; plays: number; listeners: number | null; fans: number | null; views: number | null; sitelinks: number | null }`.
  - `rankUnderTheRadar(model: Model, sort: ReachSort): UnderRadarRow[]` —
    already grouped `radar`, `unknown`, `known`, already sorted inside each
    group, `rank` running on across the headings, and **memoised on the
    `Model` identity and the sort**. That memo is what makes the filter cheap,
    and it is also why the returned array must never be sorted or mutated in
    place: it is the memo's own array and its rows carry a mutable `rank`.
    `filter()` copies, so filtering it is safe.
  - `interface ReachCoverage { artists; covered; resolved; listenbrainz; deezer; wikipedia; wellKnown }`
    (all `number`).
- Consumes, from Task 5 (`src/model/state.ts`) — exactly two symbols, and this
  task defines neither:
  - `artistReachSummary: Signal<ArtistReachSummary | null>`, read only as
    `artistReachSummary.value?.version !== 1` (the gate, spec §2) and
    `summary.ranAt` (the caption's date). The `ArtistReachSummary` **type** is
    never named here, so nothing in this task imports `src/features/`.
  - `reachCoverage(m: Model): ReachCoverage`, re-exported by Task 5 from
    `model/reach.ts` so §5.3's and §5.5's import path is the one the spec
    gives.
- Produces:
  - `src/ui/format.ts`:
    `export function reachLine(listeners: number | null, fans: number | null): string`
    and
    `export function profileLine(sitelinks: number | null, views: number | null): string | null`.
  - `src/ui/artistSelections.ts`: `export type ArtistView = 'saved' | 'radar'`,
    `artistView: Signal<ArtistView>` (default `'saved'`),
    `radarSort: Signal<ReachSort>` (default `'plays'`),
    `radarFilter: Signal<string>` (default `''`).
  - `src/ui/UnderRadar.tsx`: `export function UnderRadar()`.
  - `src/ui/Artists.tsx` keeps its single export, `Artists()`.
  - Task 7 documents what this task and Tasks 1 to 5 built. It imports no
    symbol from here and touches no source file, so nothing in this task's
    Produces list is load-bearing for it.

**Notes — the decisions this task makes, so a reviewer sees them as choices:**

- **Three signals in `src/ui/artistSelections.ts`, and the Saved tracks filter
  stays where it is.** Spec §5.1 is explicit: `artistView`, `radarSort` and
  `radarFilter` move to the new file because `Artists.tsx` renders the switcher
  and `UnderRadar.tsx` reads the view and the sort, so keeping them in either
  component would make the two import each other; the existing `filter` signal
  stays module-private in `Artists.tsx`, since only Saved tracks reads it. The
  visible consequence is deliberate: **each view has its own filter box, each
  remembering its own text.**
- **Filter first, then group.** `UnderRadar` filters the ranked array, then
  buckets the *filtered* rows into the three groups. That one ordering
  satisfies four separate §5.3 bullets at once — a heading whose rows have all
  been filtered out is not rendered, the retry line goes with its heading, the
  CC BY-SA footer appears only when a Well known row is actually on screen, and
  the ranks (assigned over the unfiltered list) never renumber.
- **`No under-the-radar artists yet.` is suppressed while the filter is
  narrowing.** Spec §5.3 asks for the line when the `radar` group is empty, so
  the missing first block is stated rather than inferred. A filter that simply
  matched no under-the-radar artist is not that situation — the line would read
  as a fact about the library — so it is rendered only when the box is empty.
  This is a ruling; the spec does not say.
- **A filter that matches nothing reuses today's block**, the
  `No artists match "…"` card with its `Clear filter` button, rather than
  showing three empty headings. Also a ruling; it keeps the two views
  behaving identically on the one interaction they share.
- **The Artist screen decides each line on its own.** Spec §5.4 gives an
  "unresolved artist" branch (`No reach data.` and a `Look up artists ›` link),
  but an artist can be well known and still have neither audience number — both
  sources can fail. So `unresolved` governs the first line only; the
  public-profile line, the `as of` line and the source links are each decided
  by their own data. The alternative, branching the whole block, would hide a
  language count the app has.
- **`profileLine` is the group rule.** It returns `null` below
  `WELL_KNOWN_MIN_SITELINKS`, which is exactly `isWellKnown`'s test, so the
  public-profile line appears on Well known rows and nowhere else without
  `UnderRadar` testing the group a second time.
- **`sitelinks` is a floor** (core plan decision 15): when Wikidata binds an
  article but no `wikibase:sitelinks` value, the stored count is the number of
  articles seen. `Wikipedia · 19 languages` therefore under-reports in that
  rare case rather than over-reporting. Spec §5.3's copy is kept literally —
  inventing an "at least" on screen would be worse — and the caveat is written
  into `profileLine`'s doc comment, the README and `CLAUDE.md` instead.
- **The Wikipedia URL is interpolated, never encoded.** `wikiTitles.en` holds
  the sitelink path exactly as Wikidata spelled it, percent-encoded and with
  underscores intact (spec §3.2 as amended), so a second `encodeURIComponent`
  would double-escape every `%` and break the link.
- **`<span class="reach">` inside `badges`, `<li class="group">` inside
  `ul.list`.** Both are spec §6 verbatim. Everything inside `ul.list` has to be
  an `<li>`, which is why the retry affordance is its own
  `<li class="provenance">` under the heading rather than a paragraph; and
  because `.provenance` is a **column** flex container, its text is wrapped in
  one `<span>` so "Not resolved yet · Look up artists ›" stays one line
  instead of stacking into two.
- **With no artists at all, the sort control does not render** — and that is
  a reading of §5.3's last bullet, not an oversight. `UnderRadar` returns
  `<Empty what="artists" />` before the gate, so an unsynced library shows
  "No artists yet. Sync in Settings" rather than the reach card's
  `Look up artists` button, which would be the wrong instruction. The bullet's
  stated purpose — that the view switcher survives an empty library, "unlike
  today's `Artists.tsx:14`", which returns `Empty` instead of the whole
  `<section>` — is satisfied: the h1 and the view `Segmented` are in
  `Artists.tsx` and always render. The sort `Segmented` has nothing to sort.
  **Task 7 writes this reading into spec §8** (decision 31).
- **No new component, no new dependency, no `Badge`.** Spec §6: the reach
  numbers are a line of text, not a pill, so the Crate's "never a third badge"
  discipline is untouched.

- [ ] **Step 1: Write the failing tests for the two line builders**

In `src/ui/format.test.ts`, first the import list. Replace:

```ts
  notCountedLine,
  plural,
} from './format';
```

with:

```ts
  notCountedLine,
  plural,
  profileLine,
  reachLine,
} from './format';
```

Then add the two tests immediately before Task 1's
`it('compacts a yearly view count at every boundary', …)`. Replace this exact
line:

```ts
  it('compacts a yearly view count at every boundary', () => {
```

with:

```ts
  it('builds a reach line from the parts that are known', () => {
    expect(reachLine(5896, 202216)).toBe(
      `${(5896).toLocaleString()} ListenBrainz listeners · ${(202216).toLocaleString()} Deezer fans`
    );
    expect(reachLine(54, null)).toBe('54 ListenBrainz listeners');
    expect(reachLine(null, 585)).toBe('585 Deezer fans');
    // A single listener is still one listener, and zero is a number.
    expect(reachLine(1, 0)).toBe('1 ListenBrainz listener · 0 Deezer fans');
    expect(reachLine(null, null)).toBe('no reach data');
  });

  it('builds a public-profile line and drops a missing view count', () => {
    expect(profileLine(19, 288783)).toBe(
      'Wikipedia · 19 languages · 289k views/yr'
    );
    // No pageviews row, or a zero one: the line keeps its language count.
    expect(profileLine(1, null)).toBe('Wikipedia · 1 language');
    expect(profileLine(3, 0)).toBe('Wikipedia · 3 languages');
    // No article at all: no line, the same threshold isWellKnown applies.
    expect(profileLine(0, 1200)).toBeNull();
    expect(profileLine(null, null)).toBeNull();
  });

  it('compacts a yearly view count at every boundary', () => {
```

The two locale-dependent figures are compared against `toLocaleString()`
rather than against the literal `'5,896'`, the discipline the `plural` and
`compactCount` tests in this file already use.

- [ ] **Step 2: Run them to verify they fail**

Run: `yarn test src/ui/format.test.ts`

Expected: FAIL, 2 of 9 —

```
 ❯ src/ui/format.test.ts (9 tests | 2 failed) 16ms
   ❯ format helpers (9)
     × builds a reach line from the parts that are known 2ms
     × builds a public-profile line and drops a missing view count 0ms

 FAIL  src/ui/format.test.ts > format helpers > builds a reach line from the parts that are known
TypeError: reachLine is not a function
 ❯ src/ui/format.test.ts:69:12
     67|
     68|   it('builds a reach line from the parts that are known', () => {
     69|     expect(reachLine(5896, 202216)).toBe(
       |            ^
     70|       `${(5896).toLocaleString()} ListenBrainz listeners · ${(202216).…
     71|     );

 FAIL  src/ui/format.test.ts > format helpers > builds a public-profile line and drops a missing view count
TypeError: profileLine is not a function
 ❯ src/ui/format.test.ts:80:12
     78|
     79|   it('builds a public-profile line and drops a missing view count', ()…
     80|     expect(profileLine(19, 288783)).toBe(
       |            ^
     81|       'Wikipedia · 19 languages · 289k views/yr'
     82|     );

 Test Files  1 failed (1)
      Tests  2 failed | 7 passed (9)
```

- [ ] **Step 3: Implement `reachLine` and `profileLine`**

In `src/ui/format.ts`, first the import block. Replace these two lines — the
first two lines of the file:

```ts
import type { ArtistRef, Period } from '../db/schema';
import type { ImportCounts } from '../history/records';
```

with:

```ts
import type { ArtistRef, Period } from '../db/schema';
import type { ImportCounts } from '../history/records';
import { WELL_KNOWN_MIN_SITELINKS } from '../model/reach';
```

Then append the two functions at the end of the file, after `artistUrl`.
Replace:

```ts
/** Playlist items only carry artist ids and names; the link is derived. */
export function artistUrl(id: string | null): string | null {
  return id ? `https://open.spotify.com/artist/${id}` : null;
}
```

with:

```ts
/** Playlist items only carry artist ids and names; the link is derived. */
export function artistUrl(id: string | null): string | null {
  return id ? `https://open.spotify.com/artist/${id}` : null;
}

/**
 * Spec §5.3's reach line: `5,896 ListenBrainz listeners · 202,216 Deezer
 * fans`, carrying only the parts that are known and the literal
 * `no reach data` when neither is. A missing number is never printed as a
 * zero, and the two are never summed: they count different audiences.
 */
export function reachLine(
  listeners: number | null,
  fans: number | null
): string {
  const parts: string[] = [];
  if (listeners !== null) {
    parts.push(plural(listeners, 'ListenBrainz listener'));
  }
  if (fans !== null) parts.push(plural(fans, 'Deezer fan'));
  return parts.length > 0 ? parts.join(' · ') : 'no reach data';
}

/**
 * Spec §5.3's public-profile line: `Wikipedia · 19 languages · 289k
 * views/yr`. The language count is Wikidata's sitelink count, which is a
 * floor rather than an exact total, so the line claims no more than
 * "Wikipedia". The views part is dropped when there is no view count or it is
 * 0, leaving `Wikipedia · 1 language`. Null when the artist has no article at
 * all, which is the same threshold `isWellKnown` applies.
 */
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

- [ ] **Step 4: Run them to verify they pass**

Run: `yarn test src/ui/format.test.ts`
Expected: PASS, `Test Files  1 passed (1)`, `Tests  9 passed (9)`.

- [ ] **Step 5: Create the three selection signals**

Create `src/ui/artistSelections.ts`:

```ts
import { signal } from '@preact/signals';
import type { ReachSort } from '../model/reach';

export type ArtistView = 'saved' | 'radar';

// Module level, so a tab switch keeps each setting and a reload resets it
// (spec §5.1), on the precedent of `ui/crate/selections.ts`. They earn their
// own file here beyond that convention: `Artists.tsx` renders the view
// switcher and `UnderRadar.tsx` reads the view and the sort, so putting them
// in either component would make the dispatcher and the view import each
// other. The Saved tracks filter stays in `Artists.tsx`, since only that
// screen reads it.
export const artistView = signal<ArtistView>('saved');
export const radarSort = signal<ReachSort>('plays');
export const radarFilter = signal('');
```

- [ ] **Step 6: Create the Under the radar view**

Create `src/ui/UnderRadar.tsx`:

```tsx
import { Fragment } from 'preact';
import { normalize } from '../model/normalize';
import {
  hasHistory,
  rankUnderTheRadar,
  type ReachGroup,
  type UnderRadarRow,
} from '../model/reach';
import { artistReachSummary, model, reachCoverage } from '../model/state';
import { routeHref } from '../router';
import { radarFilter, radarSort } from './artistSelections';
import { Empty } from './components/Empty';
import { Filter } from './components/Filter';
import { Segmented } from './components/Segmented';
import { TrackRow } from './components/TrackRow';
import {
  artistUrl,
  formatDate,
  plural,
  profileLine,
  reachLine,
} from './format';

/** Output order, and the order the headings are rendered in (spec §2). */
const GROUPS: ReachGroup[] = ['radar', 'unknown', 'known'];

/**
 * `radar` never carries a heading: it is the view. The other two always carry
 * theirs when they hold a row, so a list of nothing but unresolved artists
 * cannot read as if absence were the answer (spec §5.3).
 */
const HEADING: Record<ReachGroup, string | null> = {
  radar: null,
  unknown: 'No reach data',
  known: 'Well known',
};

/** Parts only when they are known: the plays part needs an import (§5.3). */
function subtitle(row: UnderRadarRow, history: boolean): string {
  const parts = [
    plural(row.tracks, 'track'),
    plural(row.playlists, 'playlist'),
  ];
  if (history && row.plays > 0) parts.push(plural(row.plays, 'play'));
  return parts.join(' · ');
}

/**
 * The reach and public-profile lines ride in `TrackRow`'s existing `badges`
 * slot as `.reach` spans, which spec §6 gives `flex-basis: 100%` so they
 * stack under the subtitle without `TrackRow` changing at all.
 */
function RadarRow(p: { row: UnderRadarRow; history: boolean }) {
  const { row } = p;
  // profileLine is null below one sitelink, which is exactly the `known`
  // group's own rule, so the line appears on Well known rows and nowhere else.
  const profile = profileLine(row.sitelinks, row.views);
  return (
    <TrackRow
      rank={row.rank}
      title={row.agg.name}
      subtitle={subtitle(row, p.history)}
      href={routeHref({ name: 'artist', key: row.agg.key })}
      spotifyUrl={artistUrl(row.artistId)}
      badges={
        <>
          <span class="reach">{reachLine(row.listeners, row.fans)}</span>
          {profile && <span class="reach">{profile}</span>}
        </>
      }
    />
  );
}

/**
 * Spec §5.2: a card, not the `Empty` component, because the copy needs a
 * heading and a button — the same shape as `CrateEmpty`.
 */
function NoRun() {
  return (
    <div class="card">
      <h2>No reach data yet</h2>
      <p>
        Under the radar shows the artists in your playlists with the smallest
        audiences on ListenBrainz and Deezer, and moves the ones with a
        Wikipedia article to the bottom. It needs one lookup first: roughly 45
        to 50 minutes for 1,000 artists, and you can stop it and come back.
      </p>
      <button
        type="button"
        class="primary"
        onClick={() => {
          location.hash = routeHref({ name: 'settings' });
        }}
      >
        Look up artists
      </button>
    </div>
  );
}

export function UnderRadar() {
  const m = model.value;
  if (!m || m.artists.length === 0) return <Empty what="artists" />;
  const summary = artistReachSummary.value;
  // The one gate, per spec §2: the summary record, never sniffing rows.
  if (summary?.version !== 1) return <NoRun />;
  // Memoised on the model identity and the sort, so a keystroke in the filter
  // below costs one `includes` per row and no re-sort. The array it returns
  // is the memo's own and is never sorted or mutated here; `filter` copies.
  const rows = rankUnderTheRadar(m, radarSort.value);
  const query = normalize(radarFilter.value);
  const shown = query
    ? rows.filter((r) => normalize(r.agg.name).includes(query))
    : rows;
  // Grouped after filtering, so a heading whose rows have all been filtered
  // out is not rendered, and so are the retry line and the CC BY-SA footer.
  // Ranks were assigned over the unfiltered list, so nothing renumbers.
  const grouped = new Map<ReachGroup, UnderRadarRow[]>(
    GROUPS.map((group) => [group, []])
  );
  for (const row of shown) grouped.get(row.group)?.push(row);
  const cov = reachCoverage(m);
  const history = hasHistory(m);
  const hasKnown = (grouped.get('known') ?? []).length > 0;
  return (
    <>
      <p class="caption">
        {cov.covered.toLocaleString()} of {plural(cov.artists, 'artist')} have
        reach data · as of {formatDate(summary.ranAt)}
      </p>
      <Segmented
        scroll
        options={[
          { value: 'plays', label: 'Most played' },
          { value: 'listeners', label: 'Fewest listeners' },
          { value: 'fans', label: 'Fewest fans' },
        ]}
        value={radarSort.value}
        onChange={(v) => {
          radarSort.value = v;
        }}
      />
      <Filter
        value={radarFilter.value}
        onInput={(v) => {
          radarFilter.value = v;
        }}
        placeholder="Filter artists"
      />
      {shown.length === 0 ? (
        query ? (
          <div class="empty">
            <p>No artists match "{radarFilter.value}".</p>
            <button
              type="button"
              onClick={() => {
                radarFilter.value = '';
              }}
            >
              Clear filter
            </button>
          </div>
        ) : (
          // Every artist in the library is known by name only: none of them
          // has the Spotify id every source here is keyed on.
          <Empty what="artists" />
        )
      ) : (
        <>
          {(grouped.get('radar') ?? []).length === 0 && !query && (
            <p class="muted">No under-the-radar artists yet.</p>
          )}
          <ul class="list">
            {GROUPS.map((group) => {
              const list = grouped.get(group) ?? [];
              if (list.length === 0) return null;
              return (
                <Fragment key={group}>
                  {HEADING[group] && <li class="group">{HEADING[group]}</li>}
                  {group === 'unknown' && (
                    <li class="provenance">
                      <span>
                        Not resolved yet ·{' '}
                        <a href={routeHref({ name: 'settings' })}>
                          Look up artists ›
                        </a>
                      </span>
                    </li>
                  )}
                  {list.map((row) => (
                    <RadarRow key={row.agg.key} row={row} history={history} />
                  ))}
                </Fragment>
              );
            })}
          </ul>
          {hasKnown && <p class="provenance">Wikipedia figures CC BY-SA 4.0</p>}
        </>
      )}
    </>
  );
}
```

- [ ] **Step 7: Turn `Artists.tsx` into the dispatcher**

The whole file is replaced. Today's screen is kept, unchanged line for line,
as the module-private `SavedTracks`; the only edits inside it are that the h1
moves out to the dispatcher and the wrapping `<section>` becomes a fragment.
The `Empty` early return moves inside `SavedTracks`, so an empty library no
longer takes the view switcher down with it (spec §5.3's last bullet).

Replace the entire contents of `src/ui/Artists.tsx` with:

```tsx
import { signal } from '@preact/signals';
import { normalize } from '../model/normalize';
import { model } from '../model/state';
import { routeHref } from '../router';
import { UnderRadar } from './UnderRadar';
import { artistView } from './artistSelections';
import { Empty } from './components/Empty';
import { Filter } from './components/Filter';
import { Segmented } from './components/Segmented';
import { TrackRow } from './components/TrackRow';
import { artistUrl, plural } from './format';

const filter = signal('');

/** Exactly today's screen: the same ranking, the same filter, the same rows. */
function SavedTracks() {
  const m = model.value;
  if (!m || m.artists.length === 0) return <Empty what="artists" />;
  const query = normalize(filter.value);
  const list = query
    ? m.artists.filter((a) => normalize(a.name).includes(query))
    : m.artists;
  // Rank comes from the full list, so filtering never renumbers the rows.
  const ranks = new Map(
    m.artists.map((a, i): [string, number] => [a.key, i + 1])
  );
  return (
    <>
      <Filter
        value={filter.value}
        onInput={(v) => {
          filter.value = v;
        }}
        placeholder="Filter artists"
      />
      {list.length === 0 ? (
        <div class="empty">
          <p>No artists match "{filter.value}".</p>
          <button
            type="button"
            onClick={() => {
              filter.value = '';
            }}
          >
            Clear filter
          </button>
        </div>
      ) : (
        <ul class="list">
          {list.map((a) => (
            <TrackRow
              key={a.key}
              rank={ranks.get(a.key) ?? 0}
              title={a.name}
              subtitle={`${plural(a.trackKeys.size, 'track')} · ${plural(a.playlistIds.size, 'playlist')}`}
              href={routeHref({ name: 'artist', key: a.key })}
              spotifyUrl={artistUrl(a.id)}
            />
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * The dispatcher (spec §5.1). The h1 and the view switcher render whatever
 * the library holds, so an empty one keeps the switcher instead of taking it
 * down with the list.
 */
export function Artists() {
  return (
    <section>
      <h1>Artists</h1>
      <Segmented
        options={[
          { value: 'saved', label: 'Saved tracks' },
          { value: 'radar', label: 'Under the radar' },
        ]}
        value={artistView.value}
        onChange={(v) => {
          artistView.value = v;
        }}
      />
      {artistView.value === 'saved' ? <SavedTracks /> : <UnderRadar />}
    </section>
  );
}
```

The h1 becomes `Artists`: "Artists by saved tracks" would lie on one of the
two options. The view `Segmented` is **not** passed `scroll` — two short
labels fit a 390 px phone; only §5.3's three-option sort control scrolls.

- [ ] **Step 8: Put the reach lines on the Artist screen**

Three edits to `src/ui/Artist.tsx`.

**8a.** The import block. Replace these exact lines — the whole head of the
file:

```tsx
import { signal } from '@preact/signals';
import { artistTracks, topArtistById } from '../model/aggregate';
import { model } from '../model/state';
import { routeHref } from '../router';
import { FeaturePills } from './components/FeaturePills';
import { PlaysBadge } from './components/PlaysBadge';
import { SpotifyLink } from './components/SpotifyLink';
import { TrackRow } from './components/TrackRow';
import { artistUrl, plural } from './format';
```

with:

```tsx
import { Fragment } from 'preact';
import { signal } from '@preact/signals';
import type { ArtistIdentityRow } from '../db/schema';
import { artistTracks, topArtistById, type Model } from '../model/aggregate';
import { reachFor } from '../model/reach';
import { artistReachSummary, model } from '../model/state';
import { routeHref } from '../router';
import { FeaturePills } from './components/FeaturePills';
import { PlaysBadge } from './components/PlaysBadge';
import { SpotifyLink } from './components/SpotifyLink';
import { TrackRow } from './components/TrackRow';
import {
  artistUrl,
  formatDate,
  plural,
  profileLine,
  reachLine,
} from './format';
```

**8b.** The two new module-private functions, between the `OPEN_BY_DEFAULT`
constant and the `Artist` component. Replace this exact line:

```tsx
export function Artist({ artistKey }: { artistKey: string }) {
```

with:

```tsx
/**
 * Rebuilt from the stored sitelink segment, so it is exact: `wikiTitles`
 * keeps the path exactly as Wikidata spelled it (percent-encoded, underscores
 * intact), which is why it is interpolated and never encoded again. English
 * first, French when that is the only article.
 */
function wikipediaUrl(identity: ArtistIdentityRow | undefined): string | null {
  const titles = identity?.wikiTitles;
  if (titles?.en) return `https://en.wikipedia.org/wiki/${titles.en}`;
  if (titles?.fr) return `https://fr.wikipedia.org/wiki/${titles.fr}`;
  return null;
}

/**
 * Spec §5.4. Nothing at all before the first run — the gate is the summary
 * record, never sniffing rows — and nothing for an artist with no Spotify id,
 * which is the key every source in this feature starts from. Each line is
 * decided on its own, so an artist Wikidata knows but neither audience source
 * answered for still gets a language count.
 */
function ArtistReach(p: { m: Model; id: string | null }) {
  const summary = artistReachSummary.value;
  if (p.id === null || summary?.version !== 1) return null;
  const identity = p.m.identities.get(p.id);
  const reach = reachFor(p.m, p.id);
  const listeners = reach.listenbrainz?.value ?? null;
  const fans = reach.deezer?.value ?? null;
  const profile = profileLine(
    identity?.sitelinks ?? null,
    reach.wikipedia?.value ?? null
  );
  const unresolved = listeners === null && fans === null;
  const fetched = [reach.listenbrainz, reach.deezer, reach.wikipedia]
    .filter((row) => row !== undefined)
    .map((row) => row.fetchedAt);
  // The newest stamp among the rows that actually carry a number.
  const credit = [
    fetched.length > 0 ? `as of ${formatDate(Math.max(...fetched))}` : null,
    // Wherever a language count or a view count is on screen (spec §8).
    profile === null ? null : 'Wikipedia figures CC BY-SA 4.0',
  ].filter((part) => part !== null);
  // A link only where the id behind it is known (spec §5.4).
  const links: { label: string; href: string }[] = [];
  const mbid = identity?.mbid ?? null;
  if (mbid !== null) {
    links.push({
      label: 'ListenBrainz ›',
      href: `https://listenbrainz.org/artist/${mbid}/`,
    });
  }
  const deezerId = identity?.deezerArtistId ?? null;
  if (deezerId !== null) {
    links.push({
      label: 'Deezer ›',
      href: `https://www.deezer.com/artist/${deezerId}`,
    });
  }
  const wiki = wikipediaUrl(identity);
  if (wiki !== null) links.push({ label: 'Wikipedia ›', href: wiki });
  return (
    <>
      <p class="reach">
        {unresolved ? 'No reach data.' : reachLine(listeners, fans)}
      </p>
      {profile && <p class="reach">{profile}</p>}
      {credit.length > 0 && <p class="reach">{credit.join(' · ')}</p>}
      {(unresolved || links.length > 0) && (
        <div class="provenance">
          {unresolved && (
            <span>
              <a href={routeHref({ name: 'settings' })}>Look up artists ›</a>
            </span>
          )}
          {links.length > 0 && (
            <span>
              {links.map((link, i) => (
                <Fragment key={link.href}>
                  {i > 0 && ' · '}
                  <a href={link.href} target="_blank" rel="noopener">
                    {link.label}
                  </a>
                </Fragment>
              ))}
            </span>
          )}
        </div>
      )}
    </>
  );
}

export function Artist({ artistKey }: { artistKey: string }) {
```

**8c.** Two lines in the body. The id the block needs is the one `url` is
already derived from, so it is named once; `artistId` rather than `id`,
because the playlist sublist further down binds an `id` of its own. Replace:

```tsx
  const url = artistUrl(agg?.id ?? top?.id ?? null);
```

with:

```tsx
  // Named apart from the `id` the playlist sublist binds below.
  const artistId = agg?.id ?? top?.id ?? null;
  const url = artistUrl(artistId);
```

and then place the block right under the existing muted line, above the
"no saved tracks" note. Replace:

```tsx
      </p>
      {tracks.length === 0 && (
```

with:

```tsx
      </p>
      <ArtistReach m={m} id={artistId} />
      {tracks.length === 0 && (
```

- [ ] **Step 9: Add spec §6's two style rules**

Append to `src/styles.css`. Replace these exact lines — the last rule in the
file:

```css
details.card > summary {
  font-size: 1.05rem;
  font-weight: 600;
  min-height: 44px;
  padding: 10px 0;
  cursor: pointer;
}
```

with:

```css
details.card > summary {
  font-size: 1.05rem;
  font-weight: 600;
  min-height: 44px;
  padding: 10px 0;
  cursor: pointer;
}

/*
 * Spec §6: the reach and public-profile lines ride in TrackRow's existing
 * `badges` slot, a wrapping flex row, so each takes a full basis and the two
 * stack under the subtitle without TrackRow changing at all. On the Artist
 * screen the same class is a plain block; only the type rules apply there.
 */
.reach {
  flex-basis: 100%;
  font-size: 0.8rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

/* Group headings sit inside `ul.list`, so they scroll with their rows. */
.list li.group {
  padding: 14px 4px 6px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--muted);
  border-bottom: 1px solid #2a2a2a;
}
```

Spec §6 lists nothing else: `.provenance`, `.caption`, `.card`, `.empty`,
`.muted` and the `›` chevron are all reused exactly as they stand.

- [ ] **Step 10: Run the full gate**

Run: `yarn typecheck && yarn lint && yarn test && yarn build`

Expected: all four pass. The suite grows by the two tests of Step 1 —
`Test Files  36 passed (36)`, `Tests  387 passed (387)` — and `yarn build`
emits `dist/assets/index-*.js`, `dist/assets/index-*.css` and both worker
chunks as before. This task adds no bundled entry point of its own; it grows
the main chunk by the new view.

Run: `npx prettier --check "src/**/*.ts" "src/**/*.tsx" "src/**/*.css"`
Expected: `All matched files use Prettier code style!`

- [ ] **Step 11: Walk the screens in the browser**

Screens have no unit tests, so this is the verification. Use the seeded
fixture in
`scratchpad/bpm-final-review/` (`seed-db.js`, `stub-session.js`,
`my_spotify_data.zip`).

> **NOTE — this step makes real network requests.** The lookup is the actual
> job, not a mock: MusicBrainz, ListenBrainz, Deezer, Wikidata and Wikimedia
> are all called live at the paces spec §4 fixes. The fixture holds 35 tracks
> but only 24 playlist entries, and `buildModel` builds `model.artists` inside
> the loop over the entries — so the candidates are the artists credited on
> the **23 distinct tracks that are actually in a playlist**: **43 distinct
> Spotify artist ids**, plus four name-only aggregates (Calvin Harris from the
> id-less `fakeSummerEdit` row, FISHER, Nobody Known, Unknown) that §2's
> universe excludes. Budget **under two minutes, three if a source backs
> off**: ~43 s of MusicBrainz at 1 req/s, ~35 s of ListenBrainz at 1 req/s,
> two Wikidata POSTs, a few seconds of Deezer — only three of those tracks
> have a single-artist ISRC (`The Business`, `Summer`, `2002`), so the other
> forty artists are written `notFound` with no request at all — and ~15 s of
> Wikipedia pageviews. Leave the tab focused; the run holds a wake lock but a
> backgrounded tab is throttled.

> **NOTE — the fixture's own guard.** `seed-db.js` ends with
> `if (db.version !== 2) throw new Error('expected DB version 2, got ' + db.version);`.
> Task 1 made `DB_VERSION` 3, so **edit your local copy of `seed-db.js` to
> read `!== 3`** before pasting it, or it throws instead of seeding. Change
> the copy you paste, not the fixture in `scratchpad/`: the guard is what
> makes the next `DB_VERSION` bump announce itself here.

Run `yarn dev` (a sibling session may already have one on 5173 — check before
starting a second) and open
`http://127.0.0.1:5173/myOwnSpotifyData/` — never `localhost` — with the
device toolbar at **390 px** wide. In the console, paste `stub-session.js`,
reload, then paste the edited `seed-db.js` and reload again. Optionally import
`my_spotify_data.zip` from `#/import` first: it is what makes the subtitle's
plays part appear, and Step 4 below checks both halves of that rule.

1. **Before any run.** `#/artists`: the h1 reads `Artists` and the switcher
   reads `Saved tracks · Under the radar`. Saved tracks is exactly today's
   screen. Tap `Under the radar`: the `No reach data yet` card, its paragraph,
   and a `Look up artists` button that lands on `#/settings`. Open an artist
   (`#/artist/<id>`): nothing new under the `… saved tracks in … playlists`
   line. Tap `Crate`, come back to `Artists`: still on Under the radar. Reload:
   back to Saved tracks.
2. **Run it.** Settings → Artist reach → `Look up artists` (Task 5's card).
   Watch the step label walk MusicBrainz → ListenBrainz → Deezer → Wikidata →
   Wikipedia. When it finishes, go to `#/artists` → `Under the radar`.
3. **The caption and the groups.** The caption reads
   `N of M artists have reach data · as of <today>`, where M is the candidate
   count — 43 for this fixture. **M must equal the `Y` in Settings' own
   `Reach data for X of Y artists` line**; if the two disagree,
   `reachCoverage` and `rankUnderTheRadar` are scoping their universes
   differently and that is a bug. The list runs
   `radar` rows first with no heading, then `No reach data` with
   `Not resolved yet · Look up artists ›` directly under it, then `Well known`.
   Ranks run 1..N straight through the headings without restarting.
   `Wikipedia figures CC BY-SA 4.0` sits under the list. The fixture is
   famous-weighted, so expect a large `Well known` block (Calvin Harris,
   Coldplay, Daft Punk, Rihanna…) and a small `radar` one (BYOR, Never Dull,
   Miggy Dela Rosa, Dopamine, Hypeman…).
4. **The rows.** Each row shows the rank, the name, `N tracks · N playlists`
   (plus `· N plays` only if you imported the history and that artist has
   any), then a reach line. A row with both numbers reads
   `1,234 ListenBrainz listeners · 5,678 Deezer fans`; one with a single
   number shows only that half; one with neither reads `no reach data` — never
   a `0` standing in for a missing number. Well known rows carry a second line,
   `Wikipedia · N languages` with `· Nk views/yr` when there is a view count.
   The Spotify icon and the `›` chevron are on every row; there is no cover
   art.
5. **The sorts.** `Fewest listeners`: ascending, and every row whose
   ListenBrainz number is missing sits at the **bottom of its own group**, not
   at the top. `Fewest fans`: the same on the Deezer column. Back to
   `Most played`: the original order, and the ranks match what they were.
   Confirm the three-chip row scrolls horizontally at 390 px and centres the
   selected chip.
6. **The filter.** Type `ha`: the list narrows and **the ranks keep the
   numbers they had** — no renumbering. Type something that matches only Well
   known artists: the `Well known` heading is still there, the `No reach data`
   heading and its retry line are gone, and so is the
   `No under-the-radar artists yet.` line if it was showing. Type `zzz`:
   `No artists match "zzz"` with a `Clear filter` button; tap it. Switch to
   Saved tracks and back: each view remembers its own filter text.
7. **The two universes differ.** FISHER and Nobody Known are in the fixture
   with no Spotify id: they appear on Saved tracks and are **absent** from
   Under the radar. Calvin Harris appears **twice** on Saved tracks — once
   keyed by his Spotify id, once as `name:calvin harris` from the id-less
   `fakeSummerEdit` row — and only the id-keyed one is under the radar. Both
   are pre-existing fixture behaviour, correct per §2, and neither is a
   duplicate-row bug. Tap a Well known row: it opens that artist's screen.
8. **The Artist screen.** Under the `… saved tracks in … playlists · Open in
   Spotify` line: the same reach line, then the public-profile line if the
   artist has an article, then `as of <date> · Wikipedia figures CC BY-SA 4.0`
   (the credit half only when a language or view count is on screen), then
   `ListenBrainz › · Deezer › · Wikipedia ›` with only the links whose id is
   known. Open each of the three in a new tab and confirm all three land on
   the right artist — the Wikipedia one especially, since its path is
   reconstructed from the stored sitelink segment. Then open an artist the run
   could not resolve: `No reach data.` followed by `Look up artists ›`, which
   goes to `#/settings`.
9. **Nothing is clipped at 390 px.** A long artist name ellipsises; the reach
   line wraps onto its own line rather than pushing the Spotify icon off the
   row; no horizontal scrollbar on the page.

Stop the dev server if you started it.

- [ ] **Step 12: Commit the screens**

```bash
git add src/ui/format.ts src/ui/format.test.ts src/ui/artistSelections.ts \
  src/ui/UnderRadar.tsx src/ui/Artists.tsx src/ui/Artist.tsx src/styles.css
git commit -m "feat(reach): Under the radar on the Artists tab and the Artist screen's reach lines

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

---
### Task 7: The spec amendments, the owner's manual and the conventions

The spec is the binding document, so it has to say what was actually built.
This task applies the eight ruled amendments and records the implementation
rulings in §8, then brings `README.md` and `CLAUDE.md` up to date. It touches
no source file and adds no test, which is exactly why it is its own task
(decision 24): a reviewer can reject an amendment while approving the screens,
and the amendments correct §2, §3.2, §4.2, §4.5 and §7 — sections **Tasks 1 to
4** implement, not Task 6's.

**Files:**

- Create: none
- Modify:
  - `docs/superpowers/specs/2026-09-05-artist-reach-design.md` (eleven
    replacements in nine places for the eight amendments, plus one new block
    in §8)
  - `README.md` (the privacy sentence in the opening paragraph, and one bullet
    in "Using it")
  - `CLAUDE.md` (the spec and research pointers, the `util/`, `db/`,
    `features/`, `model/` and `ui/` Architecture bullets, and two new
    Conventions bullets)
- Test: none. Nothing executable changes, so the gate in Step 5 must report
  exactly the numbers Task 6 left behind.
- Unchanged, do not touch: every file under `src/`. If this task needs a source
  edit, the amendment is wrong — fix the amendment.

**Interfaces:**

- Consumes: nothing at compile time. It describes, in prose, what Tasks 1 to 6
  built: `DB_VERSION` 3 and the two stores (Task 1), the six `src/features/`
  modules and `reachRun.ts` (Tasks 2 to 4), `src/model/reach.ts`'s five
  exports (Task 1), the Settings card and `startReach` (Task 5), and the
  Artists tab's two views (Task 6). Every name it prints is spelled exactly as
  those tasks ship it.
- Produces: no code. The amendments it applies are the eight in
  `scratchpad/reach-plan/spec-amendments.md`, and the §8 block records the
  rulings from `.superpowers/sdd/2026-09-05-artist-reach/progress.md` plus
  decisions 25, 30 and 31 of this plan — the three places where a screen reads
  the spec rather than following it literally.
- The plan ends here; nothing depends on this task.

**Notes:**

- **`.prettierignore` lists `docs/`**, so `yarn format` reflows `README.md` and
  `CLAUDE.md` but never the spec. Run it before reading the diff, and check
  that no code block inside the spec was reflowed — if one was, something other
  than this task edited it.
- **Every BEFORE block below appears exactly once** in its file at
  `feat/bpm-key` `4d7c981`, and none of them is touched by Tasks 1 to 6. The
  amendments can therefore be applied at any point after Task 4; they are last
  only so the documents describe finished work.
- **Amendments 1, 2 and 7 each touch more than one passage**, and amendments 2
  and 3 both land in the paragraph 1d rewrites, which is why eight amendments
  become eleven replacements.

- [ ] **Step 1: Apply the eight spec amendments**

The eight rulings in `scratchpad/reach-plan/spec-amendments.md`, applied to
`docs/superpowers/specs/2026-09-05-artist-reach-design.md` as eleven
replacements in nine places: amendments 1, 2 and 7 each touch more than one
passage, and amendments 2 and 3 both land in the paragraph 1d rewrites.
The spec is the binding document, so it has to say what was actually built.
Every BEFORE block below was checked to appear exactly once in the file at
`4d7c981`; `.prettierignore` lists `docs/`, so `yarn format` will not reflow
any of it.

**1a — amendment 1, `qidCheckedAt` (§2).** In the `ArtistIdentityRow` block,
replace:

```ts
  qid: string | null;
  qidStatus: ResolveStatus;
  /** Wikidata `wikibase:sitelinks`, all languages; null until Wikidata answered. */
```

with:

```ts
  qid: string | null;
  qidStatus: ResolveStatus;
  /**
   * When Wikidata last answered about this artist, or null if it never has.
   * The QID refresh reads this clock and not `resolvedAt`; see below.
   */
  qidCheckedAt: number | null;
  /** Wikidata `wikibase:sitelinks`, all languages; null until Wikidata answered. */
```

Then the paragraph that argued for one timestamp. Replace:

```markdown
otherwise cannot be told apart from "not asked yet". There is a single
timestamp per identity row, `resolvedAt`, rather than one per step. The
coupling is benign in practice: MusicBrainz is phase 1, so it always reads
`resolvedAt` before any later phase can rewrite the row; Deezer never rewrites
an identity row once `deezerArtistId` is `ok`, because a refreshed `nb_fan`
goes into an `artistReach` row with its own `fetchedAt`; and an `unchecked`
QID enters Wikidata's pass 1 whatever the stamp says. The only combination
that loses a cycle is a stale `notFound` QID on a row MusicBrainz rewrote
earlier in the same run, and the next run picks it up.
```

with:

```markdown
otherwise cannot be told apart from "not asked yet". There are two timestamps
on the row and no more: `resolvedAt`, which every write bumps and which the
MBID and Deezer steps read, and `qidCheckedAt`, which only the Wikidata phase
writes. The second one is not bookkeeping. One row carries three steps, a
`notFound` MBID or Deezer id is rewritten every thirty days — and
`deezerStatus: 'notFound'` is *common*, because the run writes it with no
request at all for every artist with no single-artist ISRC — so a ninety-day
sitelink refresh keyed on `resolvedAt` would never come due for exactly the
artists §3.2 exists to keep reachable. `needsWikidata` reads
`qidCheckedAt ?? 0`, so `null` means "never checked" and enters pass 1.
`retryAfter` is deliberately *not* split per step: that coupling costs a
one-day delay rather than a starved refresh, and the run's own `startRows`
snapshot (§4.2) covers the within-a-run half.
```

**1b — amendment 1 continued, §3.2's pass 1 input.** Replace:

```markdown
**Pass 1 input** is every candidate whose identity row is in one of three
states, measured on `resolvedAt`:

- `qidStatus: 'unchecked'` (including an identity row that does not exist yet);
- `qidStatus: 'notFound'` and `resolvedAt` older than `REACH_NOT_FOUND_TTL_MS`
  (30 days);
- `qidStatus: 'ok'` and `resolvedAt` older than `REACH_TTL_MS` (90 days) — the
  QID is kept, only `sitelinks` and `wikiTitles` are rewritten.
```

with:

```markdown
**Pass 1 input** is every candidate whose identity row is in one of three
states, measured on `qidCheckedAt` (§2) and never on `resolvedAt`:

- `qidStatus: 'unchecked'` (including an identity row that does not exist yet,
  and any row whose `qidCheckedAt` is still `null`);
- `qidStatus: 'notFound'` and `qidCheckedAt` older than
  `REACH_NOT_FOUND_TTL_MS` (30 days);
- `qidStatus: 'ok'` and `qidCheckedAt` older than `REACH_TTL_MS` (90 days) —
  the QID is kept, only `sitelinks` and `wikiTitles` are rewritten.
```

**1c — amendment 2, where the seven fields are declared (§2).** Two edits,
because the record and the interface it extends have to agree. First the
summary block itself — the fence it sits in also declares
`ARTIST_REACH_SUMMARY_META`, which does not change, so only the interface is
quoted. Replace:

```ts
export interface ArtistReachSummary {
  version: 1;
  ranAt: number;
  /** Candidates: artists with a Spotify id in the owner's playlists at run end. */
  artists: number;
  /** Candidates with at least one `ok` reach row in any source. */
  covered: number;
  /** Identities with an MBID (`mbid !== null`). */
  resolved: number;
  /** `artistReach` rows with status 'ok' for that source. */
  listenbrainz: number;
  deezer: number;
  /** Identities with at least one Wikipedia sitelink title (`wikiTitles.en` or `.fr`). */
  wikipedia: number;
  /** Identities for which `isWellKnown` is true (`sitelinks >= 1`). */
  wellKnown: number;
  /** Sources that gave up mid-run; `ReachStep` and the rule are in §4. */
  paused: ReachStep[];
}
```

with:

```ts
export interface ArtistReachSummary extends ReachCoverage {
  version: 1;
  ranAt: number;
  /** Sources that gave up mid-run; `ReachStep` and the rule are in §4. */
  paused: ReachStep[];
}
```

**1d — amendments 2 and 3 together, the paragraph and the `ReachCoverage`
block that follow it (§2).** The seven documented fields move here, which is
where they now live in code. Replace:

````markdown
**Every count in that record describes the whole store at `ranAt`, not the
run's own work.** The Settings coverage line (§5.5) shows the same seven
counts computed live from the model, using these exact definitions, through
one type that shares the record's field list — the same relationship the
existing `Coverage` interface has with the Audio data card:

```ts
/** `reachCoverage(m)`'s result; every field is defined exactly as above. */
export type ReachCoverage = Omit<
  ArtistReachSummary,
  'version' | 'ranAt' | 'paused'
>;
```
````

with:

````markdown
**Every count in that record describes the whole store at `ranAt`, not the
run's own work.** The seven counts are defined once, in the interface the
record extends, and the Settings coverage line (§5.5) computes the very same
seven live from the model — the same relationship the existing `Coverage`
interface has with the Audio data card. One difference is deliberate:
**`reachCoverage` scopes all seven to the candidates** — the artists in
`model.artists` with a Spotify id — where the stored record keeps its
store-wide reading for `resolved`, `wikipedia` and `wellKnown`. Scoping the
live figure makes `covered <= artists` and `wellKnown >= wikipedia` hold by
construction; "the source counts overlap on purpose" (§5.5) is about the
sources overlapping each other, not about the universe.

```ts
/**
 * The seven counts, declared once in `src/model/reach.ts`, extended by
 * `ArtistReachSummary` above and returned by `reachCoverage(m)`.
 */
export interface ReachCoverage {
  /** Candidates: artists with a Spotify id in the owner's playlists. */
  artists: number;
  /** Candidates with at least one `ok` reach row in any source. */
  covered: number;
  /** Identities with an MBID (`mbid !== null`). */
  resolved: number;
  /** `artistReach` rows with status 'ok' for that source. */
  listenbrainz: number;
  deezer: number;
  /** Identities with at least one Wikipedia sitelink title (`wikiTitles.en` or `.fr`). */
  wikipedia: number;
  /** Identities for which `isWellKnown` is true (`sitelinks >= 1`). */
  wellKnown: number;
}
```

The direction matters: `ArtistReachSummary extends ReachCoverage`, never the
`Omit<ArtistReachSummary, …>` of an earlier draft. The dependency has to run
`features/ → model/`, which it already does for `isWellKnown`; the `Omit`
spelling would make `model/` import `features/` and cost the pure core its
ability to type-check on its own. `reachCoverage` is implemented in
`src/model/reach.ts` beside `isWellKnown` and **re-exported from
`src/model/state.ts`**, so §5.3's and §5.5's import path is the one they
give.
````

**1e — amendment 4, where the request timeout lives (§4.5).** Replace:

````markdown
```ts
export const REACH_TTL_MS = 90 * 24 * 60 * 60 * 1000;      // numbers
export const REACH_NOT_FOUND_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const REACH_RETRY_LATER_TTL_MS = 24 * 60 * 60 * 1000;
export const REACH_REQUEST_TIMEOUT_MS = 15_000;
export const MAX_SOURCE_FAILURES = 3;
```
````

with:

````markdown
```ts
// src/features/reachRun.ts
export const REACH_TTL_MS = 90 * 24 * 60 * 60 * 1000;      // numbers
export const REACH_NOT_FOUND_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const REACH_RETRY_LATER_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_SOURCE_FAILURES = 3;

// src/util/retry.ts, beside MAX_5XX_RETRIES, backoffMs and parseRetryAfter
export const REACH_REQUEST_TIMEOUT_MS = 15_000;
```

The timeout is split off deliberately: four client modules need it and the
runner imports all four, so declaring it in `reachRun.ts` would make every
client import its own runner — a module cycle whose `const` can read
`undefined` at init, and a client unit test that drags the whole run into the
module graph. `retry.ts` already holds every other helper those clients share.
````

**1f — amendment 5, the sitelink floor and the article title (§3.2).**
Replace:

```markdown
- QID from the last path segment of `item.value`
  (`http://www.wikidata.org/entity/Q…`). `sitelinks` parsed as an integer,
  absent → `null`. `wikiTitles.en` / `.fr` are the **last path segment of the
  sitelink URL, kept verbatim** (percent-encoded, underscores intact) — never
  a guessed title, and no decode/re-encode round trip, so the value drops
  straight into the pageviews path.
```

with:

```markdown
- QID from the last path segment of `item.value`
  (`http://www.wikidata.org/entity/Q…`). `wikiTitles.en` / `.fr` are
  **everything after the first `/wiki/` in the sitelink URL, kept verbatim**
  (percent-encoded, underscores intact) — never a guessed title, no
  decode/re-encode round trip, and not merely the last segment, because a
  title may contain a slash. The value drops straight into the pageviews path
  and into the Artist screen's link.
- `sitelinks` is `max(the bound count, the number of bound articles)`, and
  `null` only when neither is present. The count and the two articles are
  three separate `OPTIONAL`s, so nothing in the query stops an item binding an
  article and no count — and §2's invariant `wellKnown >= wikipedia` would
  break. **The stored number is therefore a floor**, and §5.3's
  `N languages` under-reports in that rare case rather than over-reporting,
  which is the only safe direction.
```

**1g — amendment 6, what freshness is judged against (§4.2).** Replace:

```markdown
The passed arrays are the run's starting point and are never re-read mid-run;
IndexedDB is written through on every row so a stop loses nothing, and the
model reloads exactly once, at the end (and after an error — §5.6). Freshness
in §4.5 is judged against the maps, so a row this run already wrote is not
asked again later in the same run.
```

with:

```markdown
The passed arrays are the run's starting point and are never re-read mid-run;
IndexedDB is written through on every row so a stop loses nothing, and the
model reloads exactly once, at the end (and after an error — §5.6).
**Freshness in §4.5 is judged against `startRows`, an immutable snapshot of
the identity array the run was handed, while every *value* — the MBID, the
Deezer id, the QID, the titles — comes from the live map the phases update.**
Without the snapshot a MusicBrainz write in phase 1 bumps `resolvedAt` and
suppresses the Deezer step for that artist in phase 3 of the same run; with
it, the cross-phase threading above is intact and a row this run already wrote
is still not asked again for the same step.
```

**1h — amendment 7, where the Deezer skip is tested (§7).** Replace:

```markdown
  miss; `error.code 4` retried five times then counted as one source failure;
  another `error` code treated as a miss; a known `deezerArtistId` skipping the
  ISRC request.
```

with:

```markdown
  miss; `error.code 4` retried five times then counted as one source failure;
  another `error` code treated as a miss. *(The "known `deezerArtistId` skips
  the ISRC request" case is the runner's decision — the client is never called
  at all — so it is tested in `reachRun.test.ts`, below.)*
```

and in the `features/reachRun.test.ts` bullet, replace:

```markdown
  as empty; a second run skipping fresh rows and re-asking at the 90/30-day
  boundaries and once `retryAfter` has passed; permanence of MBID, QID and
  Deezer id; three consecutive failures pausing one source while the others
```

with:

```markdown
  as empty; a second run skipping fresh rows and re-asking at the 90/30-day
  boundaries and once `retryAfter` has passed; a known `deezerArtistId`
  skipping the ISRC request entirely; permanence of MBID, QID and
  Deezer id; three consecutive failures pausing one source while the others
```

**1i — amendment 8, no accessors beyond the meta helpers (§2).** Replace:

```markdown
`putFeatures` (`src/db/repo.ts:141-147`). No getter is added: `getAllRows`
already reads both stores, and §5.6 hands the run the model's own arrays
rather than re-reading IndexedDB.
```

with:

```markdown
`putFeatures` (`src/db/repo.ts:141-147`). No getter is added: `getAllRows`
already reads both stores, and §5.6 hands the run the model's own arrays
rather than re-reading IndexedDB. That rule covers the summary too — there is
no `getArtistReachSummary` / `putArtistReachSummary` pair. The record is read
with `getMeta<ArtistReachSummary>(ARTIST_REACH_SUMMARY_META)` and written with
`putMeta`, exactly as `state.ts` already reads `RekordboxSummary`.
```

- [ ] **Step 2: Add the pre-execution rulings to spec §8**

The existing "**Rulings made while planning.**" block records what the design
settled. These are a different set — what the *implementation* settled, from
`.superpowers/sdd/2026-09-05-artist-reach/progress.md` — so they go in their
own labelled block rather than interleaved. In §8, replace this exact line:

```markdown
**Privacy.** What leaves the browser is Spotify artist ids, ISRCs from the
```

with:

```markdown
**Rulings made while planning the implementation.** Recorded here because each
one differs from, or fills a gap in, the sections above; the amendments they
motivated are already applied.

- *`ArtistIdentityRow` gains `qidCheckedAt`* and the Wikidata refresh reads it
  rather than `resolvedAt`, which every phase bumps (§2, §3.2). Cost if wrong:
  one extra field.
- *`ReachCoverage` is declared in `src/model/reach.ts` and
  `ArtistReachSummary extends` it*, because `features/` may import `model/`
  and never the reverse; `state.ts` re-exports `reachCoverage` so the spec's
  import path holds (§2, §5.5). Cost if wrong: none.
- *`reachCoverage` scopes its counts to the candidates*; the stored summary
  keeps the store-wide reading (§2). Cost if wrong: a coverage line off by the
  rows of artists no longer in any playlist.
- *`REACH_REQUEST_TIMEOUT_MS` lives in `src/util/retry.ts`* — four clients need
  it, and declaring it in the runner would create a module cycle (§4.5). Cost
  if wrong: none.
- *`sitelinks` is `max(bound count, articles bound)`*, so a bound article
  always implies at least one sitelink and `wellKnown >= wikipedia` holds; the
  screens treat the number as a floor (§3.2, §5.3). Cost if wrong: an
  under-reported language count in a rare case.
- *The MBID and Deezer freshness gates are judged against the snapshot of
  identity rows the run started with*, while the values come from the live
  maps (§4.2). Cost if wrong: none — it is tested.
- *The "known `deezerArtistId` skips the ISRC request" case is tested in
  `reachRun.test.ts`*, not `deezer.test.ts` (§7). Cost if wrong: none.
- *The pacing split is deliberate*: MusicBrainz and Deezer sleep their own
  interval, ListenBrainz and Wikipedia are paced between artists by the
  runner. It is pinned by a sleep-sequence test so nobody "tidies" it. Cost if
  wrong: doubled sleeps and a run twice as long.
- *A Deezer `notFound` written without a request* — the common case, an artist
  with no single-artist ISRC — is re-checked only after 30 days, per §3.3.
  Cost if wrong: a slow pick-up of a newly saved single-artist track; revisit
  if the owner notices.
- *`No under-the-radar artists yet.` is suppressed while the filter is
  narrowing the list*, and a filter that matches nothing shows the Artists
  tab's existing `No artists match "…"` block rather than three empty
  headings (§5.3, which rules on neither). Cost if wrong: one line of copy.
- *With no artists at all, only the view switcher renders, not the sort
  control* — §5.3's last bullet asks for both, but an unsynced library must
  read `No artists yet. Sync in Settings` rather than showing a
  `Look up artists` button that would be the wrong instruction. The bullet's
  stated purpose is met: the `h1` and the view `Segmented` live in
  `Artists.tsx` and render whatever the library holds. Cost if wrong: one
  control missing from a screen that has nothing to sort.
- *Settings' `working` flag gates "Connect again" as well as Disconnect* —
  §5.5 names only Disconnect, but the two share the flag and `auth.logout()`
  mid-run would strand `reachState` on `running`. Nothing expires a session
  on a timer and the Sync button that would surface an auth error is disabled
  for the duration, so the recovery is not needed until the run ends. Cost if
  wrong: one button disabled for the length of a run.

**Privacy.** What leaves the browser is Spotify artist ids, ISRCs from the
```

- [ ] **Step 3: Update README.md**

One bullet in "Using it", after **Match** and before **Re-import once for the
Crate**. Replace these exact lines:

```markdown
- **Re-import once for the Crate.** An import made before the Crate shipped
```

with:

```markdown
- **Under the radar** is the second view on the Artists tab: the artists in
  your playlists with the smallest audiences, so you can tell one nobody has
  heard of from one everybody plays. Fill it in from the **Artist reach** card
  in Settings — `Look up artists` is one long job, roughly 45 to 50 minutes
  for 1,000 artists, it never starts by itself, and it picks up where it
  stopped, so you can stop it and come back. Then sort by `Most played`,
  `Fewest listeners` or `Fewest fans`; the filter box narrows by name and the
  ranks never renumber.
  The two numbers are **ListenBrainz listeners** (how many ListenBrainz users
  have ever played that artist) and **Deezer fans** (how many Deezer users
  pressed follow). They are small platform-specific audiences, **not** Spotify
  monthly listeners, and they disagree often enough that the app shows them
  side by side and never sums them. A number the app does not have is shown as
  missing, never as a zero.
  Artists with a Wikipedia article are moved to the bottom under **Well
  known** rather than hidden: the app subtracts the demonstrably famous, it
  does not claim to rank the rest. `N languages` there is Wikidata's article
  count, which is a floor rather than an exact total. Two things the view is
  not: artists Spotify gives no id for are absent from it entirely, and the
  plays are plays of the tracks you saved, not of everything the artist made.
  Artist data via MusicBrainz and ListenBrainz · Deezer · Wikidata (CC0) ·
  Wikipedia (CC BY-SA).
- **Re-import once for the Crate.** An import made before the Crate shipped
```

While in the file, the opening paragraph's "Nothing is uploaded anywhere"
sentence now has a second exception. Replace:

```markdown
It runs entirely in the browser: login with PKCE, playlists cached in
IndexedDB, and Spotify's _Extended streaming history_ export imported locally
for play counts. Nothing is uploaded anywhere except the track ids the BPM and
key lookup sends to ReccoBeats, and only when you start it.
```

with:

```markdown
It runs entirely in the browser: login with PKCE, playlists cached in
IndexedDB, and Spotify's _Extended streaming history_ export imported locally
for play counts. Nothing is uploaded anywhere except the track ids the BPM and
key lookup sends to ReccoBeats and the artist ids, ISRCs and article titles
the artist-reach lookup sends to MusicBrainz, ListenBrainz, Deezer, Wikidata
and Wikimedia — and only when you start one of them. No token, no playlist and
no listening history ever leaves the browser.
```

- [ ] **Step 4: Update CLAUDE.md**

Six edits.

**4a.** The spec and research pointers. Replace these exact lines:

```markdown
Design specs: `docs/superpowers/specs/2026-09-04-spotify-dj-webapp-design.md`
(the app), `docs/superpowers/specs/2026-09-04-crate-history-views-design.md`
(the five Crate views) and
`docs/superpowers/specs/2026-09-05-bpm-key-design.md` (BPM and key).
Verified facts: `docs/superpowers/research/2026-09-04-spotify-platform-research.md`
(the Spotify platform),
`docs/superpowers/research/2026-09-04-history-export-semantics.md`
(`reason_end`, month bucketing, thresholds) and
`docs/superpowers/research/2026-09-05-bpm-key-sources.md` (ReccoBeats,
rekordbox XML, the Camelot mapping).
```

with:

```markdown
Design specs: `docs/superpowers/specs/2026-09-04-spotify-dj-webapp-design.md`
(the app), `docs/superpowers/specs/2026-09-04-crate-history-views-design.md`
(the five Crate views), `docs/superpowers/specs/2026-09-05-bpm-key-design.md`
(BPM and key) and `docs/superpowers/specs/2026-09-05-artist-reach-design.md`
(artist reach, the Artists tab's "Under the radar" view).
Verified facts: `docs/superpowers/research/2026-09-04-spotify-platform-research.md`
(the Spotify platform),
`docs/superpowers/research/2026-09-04-history-export-semantics.md`
(`reason_end`, month bucketing, thresholds),
`docs/superpowers/research/2026-09-05-bpm-key-sources.md` (ReccoBeats,
rekordbox XML, the Camelot mapping) and
`docs/superpowers/research/2026-09-05-artist-reach-sources.md` (what Spotify
stopped answering, and the five keyless sources that replace it).
```

**4b.** The `db/` bullet. Replace this exact line:

```markdown
- `db/` `idb` schema and repository. Stores: `playlists`, `tracks`, `entries` (keyed `[playlistId, position]`), `topItems`, `plays`, `features` (keyed by Spotify track id), `meta`. `DB_VERSION` is 2; the `upgrade` callback creates only the stores that are missing, so a version 1 database keeps everything it holds and simply gains `features`.
```

with:

```markdown
- `db/` `idb` schema and repository. Stores: `playlists`, `tracks`, `entries` (keyed `[playlistId, position]`), `topItems`, `plays`, `features` (keyed by Spotify track id), `artistIdentity` (keyed by Spotify artist id), `artistReach` (keyed `${artistId}|${source}` — build it with `reachKey`), `meta`. `DB_VERSION` is 3; the `upgrade` callback creates only the stores that are missing, so a version 1 database keeps everything it holds and gains `features`, and a version 2 database gains the two reach stores.
```

**4c.** The `features/` bullet. Replace this exact line:

```markdown
- `features/` the two BPM and key sources behind the Settings "Audio data" card: the ReccoBeats lookup (`reccobeats.ts` maps the API, `lookup.ts` drives it — batches of 40 ids, one request per second, an ISRC second pass, `notFound` markers) and the Rekordbox Collection XML import (`rekordbox.ts` scanner, `rekordbox-match.ts` title/artist/duration matching, `rekordbox.worker.ts`, `rekordboxImport.ts`).
```

with:

```markdown
- `features/` the acquisition layer for the two Settings cards. "Audio data": the ReccoBeats lookup (`reccobeats.ts` maps the API, `lookup.ts` drives it — batches of 40 ids, one request per second, an ISRC second pass, `notFound` markers) and the Rekordbox Collection XML import (`rekordbox.ts` scanner, `rekordbox-match.ts` title/artist/duration matching, `rekordbox.worker.ts`, `rekordboxImport.ts`). "Artist reach": one client per source, each returning a discriminated result and never throwing — `musicbrainz.ts` (Spotify artist id → MBID by reverse URL lookup), `wikidata.ts` (a SPARQL POST over batches of 150 ids, P1902 then P434, giving the QID, the sitelink count and the article titles), `jsonp.ts` (a dependency-free `<script>` transport, because Deezer sends no CORS header at all), `deezer.ts` (single-artist ISRC → artist id → `nb_fan`), `listenbrainz.ts` (`total_user_count`) and `wikipedia.ts` (12 complete UTC months of pageviews) — plus `reachRun.ts`, the resumable five-phase job that drives them and writes the `artistReachSummary` meta record on every exit path.
```

**4d.** The `model/` bullet. Replace this exact line:

```markdown
- `model/` in-memory aggregation (`buildModel`), the banner's severity and suppression rule (`banner.ts`), the pure Crate computations (`crate.ts`: `heavyRotation`, `forgottenGems`, `classics`, `byYear`, `finishRate`, each one pass over `PlayRow[]`), the pure BPM and key cores (`keys.ts`: Camelot, Open Key and classic names, `parseKeyText`, `keyRelation`, `bpmDeltaPct`; `features.ts`: `resolveFeature`, `featureFor`; `match.ts`: `rankMatches`) and signals (`state.ts`).
```

with:

```markdown
- `model/` in-memory aggregation (`buildModel`), the banner's severity and suppression rule (`banner.ts`), the pure Crate computations (`crate.ts`: `heavyRotation`, `forgottenGems`, `classics`, `byYear`, `finishRate`, each one pass over `PlayRow[]`), the pure BPM and key cores (`keys.ts`: Camelot, Open Key and classic names, `parseKeyText`, `keyRelation`, `bpmDeltaPct`; `features.ts`: `resolveFeature`, `featureFor`; `match.ts`: `rankMatches`), the pure artist-reach core (`reach.ts`: `reachFor`, `isWellKnown`, `hasHistory`, `rankUnderTheRadar` and `reachCoverage`, the last two memoised on the `Model` object identity) and signals (`state.ts`).
```

**4e.** The `ui/` bullet. Replace this exact line:

```markdown
- `ui/` one Preact component per screen plus small shared components; the five Crate views live in `ui/crate/` (`CrateView` dispatches, `shared.tsx` holds the row helpers and `Strip`, `labels.ts` holds the pure history-copy helpers, `selections.ts` holds the module-level selection signals); hash routes from `router.ts`.
```

with:

```markdown
- `ui/` one Preact component per screen plus small shared components; the five Crate views live in `ui/crate/` (`CrateView` dispatches, `shared.tsx` holds the row helpers and `Strip`, `labels.ts` holds the pure history-copy helpers, `selections.ts` holds the module-level selection signals); `Artists.tsx` dispatches over two views the same way, with `UnderRadar.tsx` beside it and `artistSelections.ts` holding its signals (`artistView`, `radarSort`, `radarFilter` — the Saved tracks filter stays inside `Artists.tsx`, since only that view reads it); hash routes from `router.ts`.
```

**4f.** One new Conventions bullet, after the ReccoBeats one it echoes.
Replace this exact line:

```markdown
- **ReccoBeats lookup and Rekordbox import start only from Settings.** Neither ever runs on load: the lookup is hundreds of cross-origin requests paced at one per second, and the import reads a file the owner picks. Both write the `features` store as they go and skip what is already there, so a run that stopped resumes instead of starting over.
```

with:

```markdown
- **ReccoBeats lookup and Rekordbox import start only from Settings.** Neither ever runs on load: the lookup is hundreds of cross-origin requests paced at one per second, and the import reads a file the owner picks. Both write the `features` store as they go and skip what is already there, so a run that stopped resumes instead of starting over.
- **The artist-reach run starts only from Settings too, and it is long** — 45 to 50 minutes for 1,000 artists. Five phases in a fixed order (MusicBrainz → ListenBrainz → Deezer → Wikidata → Wikipedia), every row written as it resolves, three consecutive failures pausing one source for the rest of the run while the others carry on. **The pacing split is deliberate and is pinned by a test**: MusicBrainz and Deezer sleep their own interval inside their clients, while ListenBrainz and Wikipedia are paced between artists by the runner — adding a sleep around the first two would halve those rates. Everything is keyed on the Spotify artist id, so an artist known only by name is out of the feature entirely; **name search is forbidden at every step**.
- **"Under the radar" is gated on `artistReachSummary.version === 1`**, the same discipline the Crate uses, and `Well known` is a heading at the bottom of the list, never a filter that removes rows. The rule is one clause — Wikidata says the artist has at least one Wikipedia article — and `sitelinks` is a **floor**, not always the true count, so the `N languages` line under-reports rather than over-reports. ListenBrainz listeners and Deezer fans are small platform audiences, never Spotify monthly listeners: show them side by side, never summed, and never print a missing number as a zero.
```

**4g.** The `util/` bullet. It sits above the `db/` one in the file, and Task 2
appends a second constant to the module it describes. Replace this exact line:

```markdown
- `util/` holds the retry helpers (`backoffMs`, `parseRetryAfter`) shared by the Spotify and ReccoBeats clients (an execution ruling added `src/util/retry.ts` in Task 2).
```

with:

```markdown
- `util/` holds `MAX_5XX_RETRIES`, `backoffMs` and `parseRetryAfter`, shared by the Spotify and ReccoBeats clients, plus `REACH_REQUEST_TIMEOUT_MS` — the 15 s `AbortSignal.timeout` every artist-reach `fetch` carries. **That one constant lives here rather than beside the other reach constants in `reachRun.ts` on purpose**: the runner imports all four `fetch`-based clients, so declaring it in the runner would make each of them import its own runner — a module cycle whose `const` can read `undefined` at init.
```

- [ ] **Step 5: Check the documents and commit them**

Run: `yarn format && yarn typecheck && yarn lint && yarn test`

Expected: all four pass, unchanged from Step 10 — this step edits only
Markdown, and `yarn format` covers `.md` too, so run it before reading the
diff. Skim `git diff` on the three documents: the spec's amendments should be
the only changes to it, and no code block inside the spec should have been
reflowed by Prettier.

```bash
git add docs/superpowers/specs/2026-09-05-artist-reach-design.md README.md CLAUDE.md
git commit -m "docs(reach): the spec amendments, the owner's manual and the conventions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

Do not push. The owner pushes.
