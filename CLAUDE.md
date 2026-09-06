# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Browser-only Preact web app the owner (a DJ) uses on an Android phone to see
their most played Spotify tracks, rank their own playlists by play count, and
rank artists by saved tracks. Public repo `vaTheo/myOwnSpotifyData`, single
`main` branch, deployed to GitHub Pages at
`https://vatheo.github.io/myOwnSpotifyData/`. Keep it lean: the owner has
explicitly declined extra tooling (commit hooks, Dependabot, branch
protection, PR templates) and wants the minimum that solves the request.

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

## Commands

Node 24 (`.nvmrc`), yarn classic 1.22. Install with `yarn`.

| Task                             | Command                        |
| -------------------------------- | ------------------------------ |
| Dev server (open via 127.0.0.1)  | `yarn dev`                     |
| All tests                        | `yarn test`                    |
| One test file                    | `yarn test src/router.test.ts` |
| Tests matching a name            | `yarn test -t "throws when"`   |
| Watch mode                       | `yarn vitest`                  |
| Type-check (includes test files) | `yarn typecheck`               |
| Lint                             | `yarn lint`                    |
| Format (not enforced in CI)      | `yarn format`                  |
| Production build to `dist/`      | `yarn build`                   |

CI (`.github/workflows/ci.yml`) runs `yarn install --frozen-lockfile`, `typecheck`, `lint`, `test` on every push to `main` and every PR, then a `deploy` job builds with the `VITE_SPOTIFY_CLIENT_ID` secret and publishes `dist/` to GitHub Pages on pushes to `main`. Run the three checks locally before pushing.

## Architecture

`src/` is one Vite app. Pure, unit-tested cores sit behind thin I/O edges:

- `auth/` PKCE helpers and the session store (`createSessionStore`), with `browser.ts` holding the app instance.
- `spotify/` the API client (`createClient`: bearer, 401 refresh-once, 429 backoff, quota lock-out, one request in flight) and the API types.
- `util/` holds `MAX_5XX_RETRIES`, `backoffMs` and `parseRetryAfter`, shared by the Spotify and ReccoBeats clients, plus `REACH_REQUEST_TIMEOUT_MS` — the 15 s `AbortSignal.timeout` every artist-reach `fetch` carries. **That one constant lives here rather than beside the other reach constants in `reachRun.ts` on purpose**: the runner imports all four `fetch`-based clients, so declaring it in the runner would make each of them import its own runner — a module cycle whose `const` can read `undefined` at init.
- `db/` `idb` schema and repository. Stores: `playlists`, `tracks`, `entries` (keyed `[playlistId, position]`), `topItems`, `plays`, `features` (keyed by Spotify track id), `artistIdentity` (keyed by Spotify artist id), `artistReach` (keyed `${artistId}|${source}` — build it with `reachKey`), `meta`. `DB_VERSION` is 3; the `upgrade` callback creates only the stores that are missing, so a version 1 database keeps everything it holds and gains `features`, and a version 2 database gains the two reach stores.
- `sync/` planner (pure diff on `snapshot_id`), item mapper, runner (commits one playlist per transaction, persists `locked`/`error` state in meta).
- `history/` export file matching, the 30-second play rule, outcome classification (`trackdone` is finished; `fwdbtn`/`backbtn`/`endplay`/`unknown` or the `skipped` flag is skipped; everything else is neutral), per-month buckets in the device's zone, zip processing (`process.ts`, one file in memory at a time), the worker and the main-thread importer.
- `features/` the acquisition layer for the two Settings cards. "Audio data": the ReccoBeats lookup (`reccobeats.ts` maps the API, `lookup.ts` drives it — batches of 40 ids, one request per second, an ISRC second pass, `notFound` markers) and the Rekordbox Collection XML import (`rekordbox.ts` scanner, `rekordbox-match.ts` title/artist/duration matching, `rekordbox.worker.ts`, `rekordboxImport.ts`). "Artist reach": one client per source, each returning a discriminated result and never throwing — `musicbrainz.ts` (Spotify artist id → MBID by reverse URL lookup), `wikidata.ts` (a SPARQL POST over batches of 150 ids, P1902 then P434, giving the QID, the sitelink count and the article titles), `jsonp.ts` (a dependency-free `<script>` transport, because Deezer sends no CORS header at all), `deezer.ts` (single-artist ISRC → artist id → `nb_fan`), `listenbrainz.ts` (`total_user_count`) and `wikipedia.ts` (12 complete UTC months of pageviews) — plus `reachRun.ts`, the resumable five-phase job that drives them and writes the `artistReachSummary` meta record on every exit path.
- `model/` in-memory aggregation (`buildModel`), the banner's severity and suppression rule (`banner.ts`), the pure Crate computations (`crate.ts`: `heavyRotation`, `forgottenGems`, `classics`, `byYear`, `finishRate`, each one pass over `PlayRow[]`), the pure BPM and key cores (`keys.ts`: Camelot, Open Key and classic names, `parseKeyText`, `keyRelation`, `bpmDeltaPct`; `features.ts`: `resolveFeature`, `featureFor`; `match.ts`: `rankMatches`), the pure artist-reach core (`reach.ts`: `reachFor`, `isWellKnown`, `hasHistory`, `rankUnderTheRadar` and `reachCoverage`, the last two memoised on the `Model` object identity) and signals (`state.ts`).
- `ui/` one Preact component per screen plus small shared components; the five Crate views live in `ui/crate/` (`CrateView` dispatches, `shared.tsx` holds the row helpers and `Strip`, `labels.ts` holds the pure history-copy helpers, `selections.ts` holds the module-level selection signals); `Artists.tsx` dispatches over two views the same way, with `UnderRadar.tsx` beside it and `artistSelections.ts` holding its signals (`artistView`, `radarSort`, `radarFilter` — the Saved tracks filter stays inside `Artists.tsx`, since only that view reads it); hash routes from `router.ts`.

## Conventions that are easy to get wrong

- **Bundler resolution.** `tsconfig.json` uses `moduleResolution: bundler`; relative imports carry **no** extension. Vite compiles JSX itself (`jsx: react-jsx`, `jsxImportSource: preact`); there is no framework plugin.
- **Tests sit next to source** as `src/**/*.test.ts`, run in Vitest's Node environment. IndexedDB tests import `fake-indexeddb/auto`. No DOM or component tests.
- **Only one setting exists**: `VITE_SPOTIFY_CLIENT_ID`, from `.env` locally and a repository secret in CI. The redirect URI is computed at runtime (`env.ts`). There is no client secret anywhere and must never be.
- **Never open `localhost`.** Spotify rejects it as a redirect URI; use `http://127.0.0.1:5173/myOwnSpotifyData/`.
- **Never sync on page load.** Spotify's unpublished daily quota on playlist reads locks accounts out for hours. Sync only from the Settings button or a playlist's own button.
- **ReccoBeats lookup and Rekordbox import start only from Settings.** Neither ever runs on load: the lookup is hundreds of cross-origin requests paced at one per second, and the import reads a file the owner picks. Both write the `features` store as they go and skip what is already there, so a run that stopped resumes instead of starting over.
- **The artist-reach run starts only from Settings too, and it is long** — 45 to 50 minutes for 1,000 artists. Five phases in a fixed order (MusicBrainz → ListenBrainz → Deezer → Wikidata → Wikipedia), every row written as it resolves, three consecutive failures pausing one source for the rest of the run while the others carry on. **The pacing split is deliberate and is pinned by a test**: MusicBrainz and Deezer sleep their own interval inside their clients, while ListenBrainz and Wikipedia are paced between artists by the runner — adding a sleep around the first two would halve those rates. Everything is keyed on the Spotify artist id, so an artist known only by name is out of the feature entirely; **name search is forbidden at every step**.
- **"Under the radar" is gated on `artistReachSummary.version === 1`**, the same discipline the Crate uses, and `Well known` is a heading at the bottom of the list, never a filter that removes rows. The rule is one clause — Wikidata says the artist has at least one Wikipedia article — and `sitelinks` is a **floor**, not always the true count, so the `N languages` line under-reports rather than over-reports. ListenBrainz listeners and Deezer fans are small platform audiences, never Spotify monthly listeners: show them side by side, never summed, and never print a missing number as a zero.
- **The tab bar is Crate · Top · Playlists · Artists · Settings.** Import is not a tab: `#/import` is still a route, it highlights the Settings tab, and it is reached from the Settings history card, the Crate provenance line, every Crate empty state and the Playlist screen's no-play-counts caption. The default route stays `top`, even though Crate is the leftmost tab.
- **The Crate is gated on `historySummary.version === 2`**, never on sniffing rows. A version 2 summary also carries `zone` (the device zone that bucketed the months) and `outcomes` (`attempts`, `finished`, `skipped`); `PlayRow.months`, `attempts`, `finished` and `skipped` are optional so rows from an older import still type-check. Month keys are local-zone `YYYY-MM`, and `sum(months) === plays`.
- **Every failure is shown.** Errors end in a state signal that Settings or a banner renders; nothing is swallowed. `banner` is a `BannerMessage` (`model/banner.ts`), never a string: build it with `errorBanner(text, inlineOn?)` or `warnBanner(text)`, and compare with `banner.value?.text`. `inlineOn` lists the screens whose own card prints the same message, and `visibleBanner` suppresses it there so nothing is on screen twice.
- **A new navigation scrolls to the top; back and forward do not.** `installRouter` stamps `history.state` with `djVisited` (`visitEntry` in `router.ts`) and only calls `scrollTo(0, 0)` on an unstamped entry, so `history.scrollRestoration` keeps its positions.
- **The shell paints before anything is awaited.** `main.tsx` calls `render` before `completeLogin` and `loadFromDb`, and drives `bootPhase` (`'signin' | 'loading' | 'ready'`, declared in `app.tsx`); nothing else writes it.
- **Three things ask before they destroy data**: Disconnect, an account switch during a sync (`confirmAccountSwitch` → `ACCOUNT_SWITCH_CONFIRM`), and an import that covers less than the stored history (`confirmReplace` → `replaceQuestion`). All three are plain `confirm()` calls made in `model/state.ts`, so the pure cores stay testable and the unit tests, which pass no confirm, keep the old behaviour.

## Pinned dependencies (do not bump blindly)

- `typescript` is pinned `~6.0.3`. `typescript-eslint` 8.x supports TS `<6.1` only; TS 7 (npm `latest`) crashes `yarn lint`.
- `vite` is an explicit devDependency: Vitest declares it as a peer and yarn classic does not install peers, and the app build uses it directly.

## Style

ESLint flat config (`eslint.config.js`): `@eslint/js` recommended + `typescript-eslint` recommended + `eslint-config-prettier`. Prettier: single quotes, semicolons, ES5 trailing commas, 80 columns.
