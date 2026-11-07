---
description: 'Task list for the web-first redesign'
---

# Tasks: A web-first redesign of every screen, following Google's design guidance

**Input**: Design documents from `specs/003-web-first-redesign/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md),
[contracts/](contracts/) ([tokens](contracts/design-tokens.md), [routes](contracts/routes.md),
[components](contracts/components.md), [screens](contracts/screens.md)), [quickstart.md](quickstart.md)

**Tests**: test-first is a constitution rule. Every new pure module gets its Vitest file, written first and failing, then the module.
There are no DOM tests in `yarn test`. Screens are checked by the **visual loop** (research D19), which ends every phase from Phase 2
on:

1. Run `yarn typecheck && yarn lint && yarn test`, then `yarn shots`. Judge by exit codes.
2. Read `shots-output/report.json`.
3. Open every screenshot of the touched screens at 1440, 1024, 768 and 390 px.
4. Fix and run again, until there is no failure and nothing looks wrong.
5. Run `yarn shots:sheet` and send the contact sheet to the owner. The screens the owner approves become baselines with
   `yarn shots --update-snapshots`.
6. Commit as `type(scope): summary`.

**Execution** (from 2026-11-06, T046 on): one subagent per step, as [execution.md](execution.md) describes; the main
conversation only dispatches, reviews and keeps the ledger.

**Organization**: grouped by user story (spec US1–US8). Setup is the plan's step 0; Foundational is steps 1 and 3; the stories
follow the plan's steps 2 and 4–10; Polish is step 11.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (a different file, no dependency on an unfinished task)
- **[Story]**: the user story the task serves (US1–US8)
- Paths are from the repository root. Relative imports carry no extension (`moduleResolution: bundler`).

---

## Phase 1: Setup — the visual loop first (plan step 0)

**Purpose**: be able to open every page at every width, on demo data, before any screen changes; record today's state.

- [x] T001 Add the owner-approved dev dependencies with `yarn add -D @playwright/test @axe-core/playwright`. Add the scripts `"shots": "playwright test -c tools/shots/playwright.config.ts"` and `"shots:sheet": "node tools/shots/contact-sheet.ts"` to `package.json`. Run `yarn playwright install chromium` once on this computer. Check that `typescript` stays `~6.0.3` and `vite` stays an explicit devDependency in `package.json`.
- [x] T002 [P] Keep the outputs out of the repo and the linter: add `shots-output/`, `playwright-report/` and `test-results/` to `.gitignore` and to `globalIgnores` in `eslint.config.js`. Add `"tools"` to `include` in `tsconfig.json`. In tools files that need Node types, write `/// <reference types="node" />` rather than widening `types`.
- [x] T003 [P] Write the failing test `src/dev/demo.test.ts` for `buildDemo(variant, seed)` (data-model §10). It pins:
  - the counts: about 40 playlists, 3,000 tracks, 1,200 artists, 2,000 history rows with `months` over six years, BPM and key on 70% of tracks, reach on 80% of artists, two saved mixes, and one worker request per status (`queued`, `claimed`, `done`, `failed`, rejected);
  - the edge cases: a 120-character track name, a local file (`isLocal`, `id: null`), a track with a BPM and no key, an artist with no reach, and a 500-track playlist;
  - the variants `full`, `empty`, `old-import` (`historySummary` version 1), `no-reach` (no `artistReachSummary`) and `locked`;
  - determinism: "the same seed gives the same rows".
- [x] T004 Implement `buildDemo(variant, seed)` in `src/dev/demo.ts` with a seeded PRNG. It returns `AllRows` (`src/db/schema.ts`) plus `MixRow[]`, `MixJobs` and the summaries (`historySummary` version 2, `artistReachSummary` version 1, a Rekordbox summary). It imports nothing from `src/ui/`. Make T003 pass.
- [x] T005 Add the dev-only demo boot. Read `src/db/CLAUDE.md` first.
  - **The flag**: `src/dev/flag.ts` exports `demoVariant(): string | null`, which returns null unless `import.meta.env.DEV` and `?demo` is in `location.search`. The production build eliminates it.
  - **Database**: in `src/db/repo.ts`, open `spotify-dj-demo` instead of `DB_NAME` when `demoVariant()` is set. No store change and no `DB_VERSION` change.
  - **Session**: in `src/auth/browser.ts`, use an in-memory storage with a fake session holding every scope and a far-future expiry when `demoVariant()` is set. It never reaches localStorage.
  - **Server**: treat the server configuration as unset when `demoVariant()` is set. Find where `src/server/` reads the URL and key.
  - **Boot**: in `src/main.tsx`, when `demoVariant()` is set, `await import('./dev/demo')`, write its rows through the existing repo writers before `loadFromDb()`, and apply the `locked` variant to `syncState`. Expose `window.__demo.set(name, value)` for the job signals (`syncState`, `likeState`, `createPlaylistState`, `lookupState`, `reachState`, `serverState`, `mixState`), so shots can show running and failed states.
  - **Check**: run `yarn build`, then `grep -r buildDemo dist/`. It must find nothing.
- [x] T006 Write `tools/shots/playwright.config.ts`:
  - `testDir: 'tools/shots'`, `testMatch: '*.shots.ts'`;
  - `webServer: { command: 'yarn dev --host 127.0.0.1 --port 5173', url: 'http://127.0.0.1:5173/myOwnSpotifyData/', reuseExistingServer: true }` and that URL as `baseURL`;
  - four Chromium projects named `1440`, `1024`, `768` and `390` with viewports 1440×900, 1024×768, 768×1024 and 390×844;
  - `outputDir: 'shots-output/results'`, reporters `html` and `json` (`shots-output/report.json`);
  - `snapshotPathTemplate: 'shots-output/baselines/{projectName}/{arg}{ext}'`;
  - `expect.toHaveScreenshot: { maxDiffPixelRatio: 0.001, animations: 'disabled' }`;
  - extra `firefox` and `webkit` projects only when `SHOTS_BROWSERS=all`.
- [x] T007 [P] List the pages in `tools/shots/pages.ts`. Each entry is `{ id, path, variant, setup?, since? }` and covers every part of `contracts/screens.md` in each of its states: empty, gated (`old-import`, `no-reach`), Match with a seed, details open (`?d=`), search open with a query, filters set, and jobs running (through `window.__demo.set`). Entries for screens not built yet carry `since: 'US8'` and so on, and the runner skips them.
- [x] T008 [P] Write the in-page checks in `tools/shots/checks.ts`, each returning findings `{ check, selector, detail }`:
  1. page scroll: `scrollWidth` ≤ `clientWidth`;
  2. clipped text: content overflowing without `text-overflow: ellipsis`;
  3. overlap between non-nested interactive elements;
  4. per `[role=table]` column, cells share the right edge (`end` columns) or the left edge (`start` columns) within 1 px;
  5. the hit area of every interactive element is at least 48 × 48;
  6. the navigation and the top bar sit inside the viewport;
  7. tabbing to the first three controls shows a 3 px focus outline.
- [x] T009 Write the runner `tools/shots/all.shots.ts`. For each page in `pages.ts`:
  - abort every request whose host is not `127.0.0.1` and record it as a finding;
  - collect `console` errors and `pageerror`s as findings;
  - `goto`, then wait for `document.fonts.ready` and network idle, then run `setup`;
  - run `checks.ts`;
  - run `AxeBuilder` with the tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` and `wcag22aa`;
  - save a full-page PNG as `shots-output/pages/{project}/{id}.png`;
  - call `toHaveScreenshot` only if the baseline file already exists (`fs.existsSync(testInfo.snapshotPath(...))`);
  - attach the findings and fail the test when there is any.
- [x] T010 [P] Write `tools/shots/contact-sheet.ts`, runnable with `node` (Node 24 strips types). It builds `shots-output/contact-sheet.html`: for the pages given in `--pages id,id` (all by default), the 1440 and 390 screenshots side by side, each with its findings.
- [x] T011 Run `yarn shots` on today's app (variants `full`, `empty`, `old-import`, `no-reach`, `locked`). It is expected to exit non-zero.
  - Record every finding in `specs/003-web-first-redesign/visual-backlog.md` as a table of page, width, check and element, grouped by screen. This is the starting backlog.
  - Look at every screenshot, and add to the same file what the checks cannot see.
  - Send the contact sheet to the owner.
  - Commit as `chore(shots): visual loop with demo data and layout checks`.

**Checkpoint**: `yarn shots` opens every current page at four widths without any request leaving `127.0.0.1`, and today's issues are
listed.

---

## Phase 2: Foundational — tokens, typeface, icons, shared components (plan steps 1 and 3)

**Purpose**: the look and the building blocks every story uses. **⚠️ No story starts before this phase is done.**

- [x] T012 [P] Write the failing test `src/ui/theme/contrast.test.ts`.
  - `contrastRatio('#7FFF00', '#0e1509')` is about 14.3, and `contrastRatio('#FFFFFF', '#7FFF00')` is about 1.3.
  - It reads `src/ui/theme/tokens.css` with `node:fs`, parses `--name: #hex;` declarations, and asserts every pair in the table "Contrast pairs the test enforces" of `contracts/design-tokens.md`: 4.5 for text, 3.0 for `outline`.
- [x] T013 Implement `contrastRatio(fg, bg)` (WCAG relative luminance) and `parseTokens(css)` in `src/ui/theme/contrast.ts`.
- [x] T014 Write `src/ui/theme/tokens.css`:
  - every token of `contracts/design-tokens.md`: the `--md-sys-color-*` roles with chartreuse `#7FFF00` as `primary` and `#173800` as `on-primary`, the `--app-color-*` custom roles, `--app-key-1` … `--app-key-12` (today's hues from `src/styles.css`), the type scale, shape, motion, the sizes, and `@media (prefers-reduced-motion: reduce)` zeroing the durations;
  - `:root { color-scheme: dark }`;
  - import it before `styles.css` in `src/main.tsx`.

  Make T012 pass.

- [x] T015 [P] Add Roboto:
  - download `https://fonts.gstatic.com/s/roboto/v51/KFO7CnqEu92Fr1ME7kSn66aGLdTylUAMa3yUBA.woff2` (43,136 bytes, latin, weights 400–700) to `public/fonts/roboto-latin-wght.woff2`;
  - put the SIL OFL 1.1 text from `github.com/google/fonts/blob/main/ofl/roboto/OFL.txt` in `public/fonts/OFL.txt`;
  - add an `@font-face` (weights 400 to 700, `font-display: swap`) in `tokens.css`, and `<link rel="preload" as="font" type="font/woff2" crossorigin>` in `index.html`.

  The content security policy stays unchanged: `font-src` falls back to `'self'`.

- [x] T016 [P] Create `src/ui/icons.tsx`:
  - an `Icon({ name, filled?, size? })` drawing an inline SVG with `aria-hidden="true"` and `fill="currentColor"`;
  - the path data for every icon listed in `contracts/components.md`, from Material Symbols Rounded (weight 400, grade 0, 24 px; the `fill1` variant for `filled`; source `github.com/google/material-design-icons`, `symbols/web/<name>/materialsymbolsrounded/`);
  - the Apache 2.0 notice in the file header.
- [x] T017 [P] Set the browser's colours to the dark scheme:
  - `index.html`: `theme-color` `#0e1509` and `<meta name="color-scheme" content="dark">`;
  - `public/manifest.webmanifest`: `background_color` and `theme_color` `#0e1509`.
- [x] T018 Restyle `src/styles.css` onto the tokens **without changing the layout** (the 720 px column and the bottom tabs stay until US1):
  - map `--bg`, `--surface`, `--accent`, `--danger` and `--warn` to `--md-sys-color-*` and `--app-*`;
  - set the body font to Roboto with the fallback `system-ui, -apple-system, 'Segoe UI', sans-serif`;
  - use `font-variant-numeric: tabular-nums` on numbers;
  - draw the focus ring as a 3 px `primary` outline offset 2 px;
  - colour key pills from `--app-key-n`.
- [x] T019 [P] Write the failing test `src/ui/layout/windowClass.test.ts`, with the boundaries "600, 840 and 1200 (lower bound inclusive)": 599 → compact, 600 → medium, 839 → medium, 840 → expanded, 1199 → expanded, 1200 → large.
- [x] T020 [P] Implement `windowClassOf(width)` and the `windowClass` signal, fed by `matchMedia('(min-width: 600px)')`, 840 and 1200 listeners, in `src/ui/layout/windowClass.ts`. Make T019 pass.
- [x] T021 [P] Create `src/ui/components/Button.tsx` (variants `filled`, `tonal`, `outlined`, `text`, plus `danger` outlined in `error`) and `src/ui/components/IconButton.tsx` (`label` is required and used for `aria-label` and the tooltip; the hit area is at least 48 × 48), per `contracts/components.md`.
- [x] T022 [P] Create `src/ui/components/SegmentedButtons.tsx` with the same props as `src/ui/components/Segmented.tsx`. Keep its `scroll` behaviour: centre the selection by adjusting the row's own `scrollLeft`, never with `scrollIntoView`, and fade only the edges that hide chips. Move the long comment along with it.
- [x] T023 [P] Create `src/ui/components/Card.tsx`, `src/ui/components/StatusLine.tsx` (kinds `info`, `warning` and `error`, each with its icon, per FR-012) and `src/ui/components/EmptyState.tsx` (icon, one-line reason, one action).
- [x] T024 [P] Create:
  - `src/ui/components/Flag.tsx` (kinds `todo` in the warning colour with an icon for "not in a playlist", `new`, `top` in tertiary, and `pending`);
  - `src/ui/components/KeyPill.tsx` (Camelot hue from `camelotNumber`, outline for minor and fill for major, text from `formatKey(key, major, keyNotation.value)`);
  - `src/ui/components/BpmText.tsx` (`formatBpm`, tabular);
  - `src/ui/components/NoData.tsx` (renders `—` with `aria-label="no data"`; never 0, per FR-021).
- [x] T025 [P] Create:
  - `src/ui/components/ProgressBar.tsx`, with the same props as `Progress` (`label`, `done`, `total`, `unit`);
  - `src/ui/components/TextField.tsx`, an outlined text field;
  - `src/ui/components/FileDrop.tsx`, a file input that also accepts a dropped file, with `accept`, `onFile` and a drop hint shown only on medium windows and wider.
- [x] T026 Swap the old components for the new ones across `src/ui/**`:
  - `Segmented` → `SegmentedButtons`, `Progress` → `ProgressBar`, `Badge` → `Flag` or plain cells, the pills in `FeaturePills` → `KeyPill` and `BpmText`, `Empty` → `EmptyState` (same wording);
  - restyle `src/ui/components/Banner.tsx` as a Material banner (icon, `error-container` or warning container, dismiss `IconButton`);
  - restyle `src/ui/components/SpotifyLink.tsx` as an `IconButton` with `open_in_new`;
  - delete `src/ui/components/Segmented.tsx`, `Progress.tsx` and `Badge.tsx`.

  Every visible text stays the same.

- [x] T027 Run the visual loop over every page. The owner approves the look (colour, type, components) from the contact sheet. No baselines yet, because the layout changes next. Commit as `feat(ui): Material 3 tokens, Roboto, icons and shared components`.

**Checkpoint**: the whole app is dark Material 3 in chartreuse, every check that does not depend on layout passes, and every
feature works as before.

---

## Phase 3: User Story 1 — an app frame made for a computer browser (Priority: P1) 🎯 MVP

**Goal**: side navigation on wide windows, a bottom bar on the phone, a top bar per screen, the activity button, and content that
uses the width (FR-001–FR-008, FR-027, FR-028, FR-041).

**Independent Test**: every screen at 1440, 1024, 768 and 390 px: navigation visible and usable, no sideways scroll, every
F1–F20 feature still reachable; old addresses open the same screen.

- [x] T028 [P] [US1] Extend `src/router.test.ts` (failing first):
  - `?d=<id>` parses into `detail` on `top`, `crateView`, `playlist` and `artist`, and is dropped on the other routes;
  - `#/mix/<key>` round-trips through `routeHref` with `encodeURIComponent`;
  - `destinationOf(route)` gives the destination and tab of the table in `contracts/routes.md` for every route;
  - the empty and unknown addresses still give `top`. This changes to `overview` in T097.
- [x] T029 [US1] Implement in `src/router.ts`: the `Route` type of data-model §1 (without `overview` yet), parsing `?d=` into `detail`, `{ name: 'mix', key? }`, `routeHref` writing `?d=`, and `destinationOf`. `parseRoute` stays total. Make T028 pass.
- [x] T030 [P] [US1] Write the failing test `src/ui/jobs.test.ts` from the data-model §7 table:
  - each running state yields one `ActiveJob` with that label and `href`;
  - `idle`, `done`, `error` and `cancelled` yield none;
  - `done` and `total` are copied when the state has them.
- [x] T031 [P] [US1] Implement `activeJobs(states)` in `src/ui/jobs.ts`. Make T030 pass.
- [x] T032 [P] [US1] Write the failing test `src/ui/layout/titles.test.ts` for `screenTitle(route, model)`:
  - "Top", "Crate", the Crate view's title (from `TITLE` in `src/ui/crate/CrateView.tsx`), the playlist's name, the artist's name, "Mix", "Settings" and "Import listening history";
  - `hasBack` is true for `playlist`, `artist`, `crateView` and `import`.

  Then implement it in `src/ui/layout/titles.ts`.

- [x] T033 [US1] Create `src/ui/layout/Nav.tsx`, per the Destinations table of `contracts/routes.md`:
  - `NavRail`: medium and expanded, 80 px, icon over label; large, the expanded rail at 220 px, labels beside icons; Settings at the foot;
  - `NavBar`: compact, 80 px, labels always shown;
  - Listening, Library, Mix and Settings for now (Overview joins in T097);
  - the active indicator is a `primary-container` pill with the filled icon;
  - links go to `lastRouteIn[destination]`, a session signal updated on every route change, falling back to `#/top`, `#/playlists`, `#/mix` and `#/settings`;
  - `<nav aria-label="Main">`.
- [x] T034 [P] [US1] Create `src/ui/layout/TopBar.tsx`: 64 px; the title from `screenTitle` (`headline-small` on large, `title-large` elsewhere); a back `IconButton` when `hasBack`; an `actions` slot; a `search` slot (empty until US7); the activity slot.
- [x] T035 [P] [US1] Create `src/ui/layout/ScreenTabs.tsx`: primary tabs Top · Crate for Listening and Playlists · Artists for Library, as links via `routeHref`, with `role="tablist"` and `aria-selected`.
- [x] T036 [P] [US1] Create `src/ui/ActivityButton.tsx`:
  - hidden when `activeJobs()` is empty;
  - otherwise an `IconButton` labelled "Running jobs", with circular progress when a total is known and indeterminate otherwise;
  - its menu lists each job with a `ProgressBar` and a link to `href`;
  - it never starts, stops or retries a job (FR-007).
- [x] T037 [US1] Create `src/ui/layout/AppFrame.tsx` and rewrite `App` in `src/app.tsx` to use it:
  - landmarks: `nav`, `header` (the top bar), `main`, and `aside` for the sheet slot;
  - the navigation component chosen by `windowClass`;
  - the `Banner` under the top bar, with the `visibleBanner` rules unchanged;
  - content margins of 16 px on compact and 24 px otherwise;
  - while `bootPhase === 'loading'`, the frame shows with a `ProgressBar` and "Loading your library…" in `main` (FR-028);
  - `Connect` and "Signing you in…" stay outside the frame;
  - remove each screen's own `h1` in favour of the top bar title, keeping one `h1` per page for the heading structure (FR-044).
- [x] T038 [US1] Rewrite the frame part of `src/styles.css`: the rail, the bar, the top bar, the content grid and the size-class media queries at 600, 840 and 1200; remove `.tabs` and the `.screen` 720 px `max-width`; cap prose blocks at `max-width: 80ch` (FR-005).
- [x] T039 [US1] Redo the Connect screen in `src/ui/Connect.tsx` per `contracts/screens.md` §2:
  - a centred card, 480 px at most, with the name and a one-line purpose;
  - a short list of what the app reads;
  - a `<details>` "What leaves this browser" holding today's paragraph word for word;
  - the error as a `StatusLine`, and one filled "Connect Spotify" button.
- [x] T040 [US1] Run the visual loop on every page: navigation inside the viewport and no sideways scroll at all four widths. Look at every screenshot and fix. The owner approves the frame at 1440 and 390. Commit as `feat(ui): navigation rail and bar, top bar, activity button (web-first frame)`.

**Checkpoint**: the app is web-first; every old address works; MVP can be shown.

---

## Phase 4: User Story 2 — track lists become readable, sortable tables (Priority: P1)

**Goal**: Top, Playlist (with Match) and Artist as tables, and the Artists tables (FR-015–FR-018, FR-021–FR-024, FR-029, FR-031–FR-034,
FR-044).

**Independent Test**: a 100+ track playlist at 1440 × 900 shows ≥ 15 rows with title, artists, plays, BPM and key in aligned columns;
sorting by BPM then plays keeps each rank; compact shows two-line items.

- [x] T041 [P] [US2] Write the failing test `src/ui/table/sort.test.ts` for `sortRows` and `nextSort`:
  - `sortRows` is stable;
  - "Missing values go last in both directions";
  - text compares with `localeCompare(…, { sensitivity: 'base' })`;
  - header clicks: "on another column, sort by it in its `firstDirection`. On the current column, flip the direction. On the rank column, set `columnId = null`".
- [x] T042 [P] [US2] Write the failing test `src/ui/table/keyboard.test.ts` for `moveIndex(current, key, count, page)`: "ArrowUp and ArrowDown move by ±1, PageUp and PageDown by ±page, Home and End jump to the first or last row", with the result clamped to the rows on screen.
- [x] T043 [P] [US2] Implement `sortRows` and `nextSort` in `src/ui/table/sort.ts`. Make T041 pass.
- [x] T044 [P] [US2] Implement `moveIndex` in `src/ui/table/keyboard.ts`. Make T042 pass.
- [x] T045 [US2] Create `src/ui/table/DataTable.tsx`.
  - **Columns**: `Column<Row>` of data-model §3: `id`, `header`, `align`, `priority` ("1 never hides"), `sortValue` (null is missing, always last), `firstDirection`, `cell`, `compact`.
  - **Roles**: `role="table"`, `rowgroup`, `row`, `columnheader` with `aria-sort`, and `cell` on a CSS grid.
  - **Responsive**: priority hiding by container queries; the compact reflow into two lines (title; artists · main metric · BPM · key).
  - **Keyboard**: a roving tabindex driven by `moveIndex`; Enter calls `onOpen(row)`.
  - **Rank**: computed before sorting and filtering, and carried with the row (FR-016).
  - **Paging**: `shown` starts at `PAGE_SIZE` (100) and grows by 100, with the footer "Showing the top 100 of N" and "Show 100 more". It resets on a change of sort, filter or setting.
  - **Interim expansion**: an optional `expanded(row)` slot keeps today's in-place details until US3 replaces them.
  - **Performance and announcements**: `content-visibility: auto` on rows; an `aria-live="polite"` region announcing a sort change.
- [x] T046 [P] [US2] Create the shared column builders in `src/ui/table/columns.tsx`:
  - rank, cover, title, artists, album, duration, added;
  - plays, with the "by artist and title" note as an icon and a tooltip;
  - playlists, a count or the "not in a playlist" flag;
  - Top flags; BPM (`BpmText` or `NoData`); key (`KeyPill` or `NoData`, sorted in Camelot order); Spotify link.
- [x] T047 [US2] Add the table styles to `src/styles.css`: the header in `surface-container-high`, 52 px rows (72 px two-line), a `primary-container` selected row, `outline-variant` separators, and the container-query breakpoints for priorities 2–4.
- [x] T048 [US2] Rewrite `src/ui/Top.tsx` as tables, per `contracts/screens.md` §4.
  - **Toolbar**: `ScreenTabs`, then the period and kind `SegmentedButtons`.
  - **Tables**: the Tracks and Artists columns with the priorities and first sort directions of §4.
  - **Rows**: a track row keeps today's playlists sublist through `expanded` until US3. An artist row opens `#/artist/<key>`.
- [x] T049 [US2] Create `src/ui/top/ComparePeriods.tsx` and add a "Compare periods" toggle (large windows only) to `src/ui/Top.tsx`: three narrow ranked columns (4 weeks, 6 months, all time); hovering or focusing an item outlines the same id in the other columns.
- [x] T050 [US2] Rewrite `src/ui/Playlist.tsx` per §8.
  - **Header**: the cover at 64 px, the name, and "N tracks · Open in Spotify".
  - **Actions**: Sync this playlist and Like all songs as top-bar actions, with today's labels and disabled rules.
  - **Like status**: `LikeStatus` inline under the header, never a banner.
  - **Toolbar**: the order `SegmentedButtons`, and the "No play counts yet — import your history" line.
  - **Table**: the §8 columns and priorities.
  - **Match**: keep `seeds`, `findSeedRow`, `rankMatches`, `TOLERANCE_PCT = 6` and the `MatchBadges` rules (out of tolerance keeps ΔBPM and drops the relation).
    - The seed bar shows "Matching: … · BPM · key" with Clear, and "Select a track to match against" before a seed is set.
    - Relation and ΔBPM columns sit after Plays.
    - The "No BPM or key for this track yet" and "No BPM for this track — matching by key alone" notes stay.
- [x] T051 [US2] Rewrite `src/ui/Artist.tsx` per §10.
  - **Header**: "N saved tracks in N playlists · Open in Spotify".
  - **Reach card**: Listeners and Fans side by side, never summed; `profileLine`, then "as of" and the CC BY-SA credit; the ListenBrainz, Deezer and Wikipedia links as outlined buttons with `open_in_new`; "No reach data" with Look up artists when unresolved; every rule of `ArtistReach` kept.
  - **Table**: Title, Album, Plays, Playlists, BPM, Key. Keep `OPEN_BY_DEFAULT` through `expanded` until US3.
- [x] T052 [US2] Rewrite `src/ui/Artists.tsx` and `src/ui/UnderRadar.tsx` as one artist table per §9.
  - **Toolbar**: `ScreenTabs`, the view `SegmentedButtons`, the filter.
  - **Saved tracks**: Plays shows once a history is imported. Listeners and Fans show only when `artistReachSummary.value?.version === 1`.
  - **Under the radar sorting**: the Plays, Listeners and Fans headers set `radarSort` (`plays`, `listeners`, `fans`); other columns do not sort.
  - **Under the radar groups**: the `radar`, `unknown` and `known` order stays. "No reach data" and "Well known" are heading rows (never filters), with "Not resolved yet · Look up artists ›" under the first.
  - **Under the radar figures**: listeners and fans in two columns, never summed; `NoData` never 0; the coverage line; the CC BY-SA credit when Well known rows show; the `NoRun` gate card.
- [x] T053 [US2] Add to `tools/shots/pages.ts`:
  - pages for the playlist in each order, Match with a seed, Top tracks, artists and compare, the Artist, and Artists in both views;
  - an assertion for SC-001: at 1440 × 900 the 500-track playlist shows at least 15 rows in the viewport.

  Run the visual loop. Column alignment and the compact reflow must pass. The owner approves, and these screens become baselines. Commit.

**Checkpoint**: US1 + US2 are the P1 MVP: a web-first frame with real tables.

---

## Phase 5: User Story 3 — details open beside the list (Priority: P2)

**Goal**: the track details sheet with everything known, and list–detail for Playlists and Artists (FR-019, FR-020, FR-043).

**Independent Test**: on Top at 1440, select a track: the sheet shows album, duration, BPM, key, energy/source, plays, listening time,
first/last play, finished/skipped, playlists, link; the list keeps its scroll; Escape closes and refocuses the row.

- [x] T054 [P] [US3] Write the failing test `src/ui/details/trackFacts.test.ts` for `trackFacts(model, ref)` (data-model §5):
  - every `ref` form: `{ trackId }`, `{ playlistId, position }` and `{ playRowId }`;
  - "Energy is read from the source row (`FeatureRow.reccobeats` or `.rekordbox`)";
  - the source is the one `resolveFeature` picks;
  - `plays` is null before an import;
  - playlists are found by id, then by artist and title (`playlistsOfRow`);
  - a local file gives `isLocal: true` and no `spotifyUrl`.
- [x] T055 [P] [US3] Implement `trackFacts` in `src/ui/details/trackFacts.ts`. Make T054 pass.
- [x] T056 [US3] Create `src/ui/layout/SideSheet.tsx`:
  - docked at 400 px on large, a modal with scrim and focus trap on medium and expanded, a full-screen dialog on compact (research D9);
  - opening pushes `?d=`; Escape or ✕ replaces the history entry without `?d=`, and back pops it;
  - focus returns to the row through a `data-row-id`.
- [x] T057 [US3] Create `src/ui/details/TrackDetails.tsx` with sections 1–5 of `contracts/screens.md` §11.
  - The History section first showed the text `Strip`; T075 replaced it with the chart (the `Strip` is gone).
  - "Match from this track" shows when the sheet was opened from a playlist. It sets the seed and switches the order to Match.
- [x] T058 [US3] Make opening a row set `?d=` and render `TrackDetails` in `SideSheet`, in `src/ui/Top.tsx`, `src/ui/Playlist.tsx` (position), `src/ui/Artist.tsx` and the Crate rows in `src/ui/crate/shared.tsx` (`CrateRow` opens details). Then remove the in-place expansions: Top's `expanded`, Artist's `opened`/`OPEN_BY_DEFAULT`, and `CrateRow`'s `expanded` children. Their content (playlist links, strips, "N of M plays", "Open <month> ›") now lives in the details.
- [x] T059 [US3] Create `src/ui/layout/ListDetail.tsx`:
  - expanded and large with a selection: a 360 px `ListPane` plus the detail;
  - without a selection: the list at full width;
  - compact and medium: the detail full screen with back;
  - on large, the list pane folds away while a docked sheet is open.
- [x] T060 [US3] Rewrite `src/ui/Playlists.tsx` per §7:
  - a table of cover, name, tracks, last synced (`syncedAt`, `formatDate`) and a "pending" flag from `syncState.pending`, with the filter in the toolbar;
  - `#/playlist/<id>` renders `ListDetail` with `Playlist` as the detail;
  - the empty state kept.
- [x] T061 [US3] Render `#/artist/<key>` as `ListDetail` with the artist table on the left and `Artist` on the right, in `src/ui/Artists.tsx` and `src/app.tsx`.
- [x] T062 [US3] Add pages with details open over Top, a playlist, a Crate view and an artist, plus a resize case (open at 1440, set the viewport to 390, the details are still open), to `tools/shots/pages.ts`. Run the visual loop; check by hand that Escape returns focus to the row. The owner approves, and these become baselines. Commit.

**Checkpoint**: one click from any track list answers BPM, key, plays and playlists (SC-002); data stored but never shown is visible
(SC-007).

---

## Phase 6: User Story 4 — listening history made visible (Priority: P2)

**Goal**: Crate hub cards, the five views as tables with charts, and the By year grid (FR-025, FR-026, FR-035, FR-036).

**Independent Test**: with the `full` demo, every month-by-month figure that was text is a chart with exact values on hover, focus and
for screen readers; with `old-import`, the hub shows the re-import card.

- [x] T063 [P] [US4] Write the failing test `src/ui/charts/series.test.ts`:
  - `monthSeries`: "`value` is null for a month outside the imported history's range (drawn as a gap), and 0 for a month inside it with no plays";
  - `barHeights`: "scales to the series' own peak, keeps a minimum of 1 px for any value above 0, and gives 0 for 0";
  - `heatLevel`: "0 for no plays, and 1–4 for quartiles of the owner's busiest month";
  - `yearMonthTotals(rows, range)`: twelve totals and the year's total per year, over the span `spanYears` uses.
- [x] T064 [P] [US4] Implement `monthSeries`, `barHeights`, `heatLevel` and `yearMonthTotals` in `src/ui/charts/series.ts`. Make T063 pass.
- [x] T065 [P] [US4] Create `src/ui/charts/MonthBars.tsx`:
  - an SVG with bars in `primary`, a baseline tick for 0, and a gap for null;
  - `role="img"` and an `aria-label` listing the values ("Plays per month: Jun 4, Jul 0, …");
  - a tooltip on hover and on focus.
- [x] T066 [P] [US4] Create `src/ui/charts/Meter.tsx`: a 0–100% bar in the band colour (`rateBand`: `--app-color-band-high`, `on-surface-variant`, or `error`) with the percentage written beside it.
- [x] T067 [P] [US4] Create `src/ui/charts/YearMonthGrid.tsx`:
  - one row per year with twelve cells and a total, shaded by `heatLevel`;
  - the cells, the year totals and the season headers are buttons labelled "Aug 2026, 143 plays";
  - the selection is outlined in `primary`;
  - selecting calls `onSelect(year, period)`, where `period` is a month 1–12, a season or `all`, following the existing By year rules (Winter includes the previous December).
- [x] T068 [US4] Rework `src/ui/crate/shared.tsx` for tables:
  - `CrateShell`: the back link and title go to the top bar;
  - `CrateRow` becomes a `DataTable` row factory with the common columns (#, Title, Artist, BPM, Key, Flag);
  - `Paged` folds into the `DataTable` footer;
  - keep `trackLabel`, `playlistsOfRow`, `inNoPlaylist` and `spanYears`.
- [x] T069 [US4] Rewrite `src/ui/crate/CrateHub.tsx` per §5:
  - the import status line (range · plays · imported date · Update import, or the stale warning);
  - five `Card`s in a 3/2/1-column grid, each with its icon (`trending_up`, `diamond`, `star`, `calendar_month`, `skip_next`), a one-line description, its count, its setting, its top track and a mini chart. Each whole card is a link;
  - `CrateEmpty` when `crateStatus` is not `ready`.
- [x] T070 [P] [US4] Rewrite `src/ui/crate/Rotation.tsx` as a table per §6: Plays in window, Lifetime, a Flag with today's precedence (New, then not in a playlist), and `MonthBars` over the window. Keep the caption, the day-of-month note, "Try 6 months" and the stale empty text word for word.
- [x] T071 [P] [US4] Rewrite `src/ui/crate/Gems.tsx` as a table per §6: Plays, Last played (month), Flag, and `MonthBars` over the last 24 months. Keep the caption and the empty texts.
- [x] T072 [P] [US4] Rewrite `src/ui/crate/Classics.tsx` as a table per §6: Years played ("6 of 9"), Plays, Flag, and plays per year across the span (a year with no plays inside the import drawn as a zero tick, FR-026; ruling S06). Keep the sort `SegmentedButtons` (Most years · Most plays) and the caption.
- [x] T073 [P] [US4] Rewrite `src/ui/crate/ByYear.tsx` per §6:
  - on medium and wider, `YearMonthGrid` above the table replaces the two chip rows; on compact, the chip rows stay;
  - keep `applyPeriod` once per mount and `selectionLabel`;
  - columns: Plays in selection, Of year or all time, Flag, and `MonthBars` over the selected year (Winter adds the previous December).
- [x] T074 [P] [US4] Rewrite `src/ui/crate/Finish.tsx` per §6: a `Meter` (% finished), Finished of outcomes, Skipped and Unclear. Turn the legend into band swatches with the words "65%+ green · under 35% red". Keep the Finished/Skipped `SegmentedButtons` and the caption.
- [x] T075 [US4] Replace the interim strip in the History section of `src/ui/details/TrackDetails.tsx` with `MonthBars` over the whole history (and a mini `YearMonthGrid` on large windows), plus "Open <month> ›" for the peak month.
- [x] T076 [US4] Add pages to `tools/shots/pages.ts`: the hub (`full` and `old-import`), every view, and By year with a month and Winter selected. Run the visual loop, and check by hand that each hub card's count equals its view. The owner approves, and these become baselines. Commit.

---

## Phase 7: User Story 5 — Settings becomes a clear "Data and sync" page (Priority: P2)

**Goal**: sections with a common shape, an index on large windows, and Import with drag and drop (FR-038, FR-039).

**Independent Test**: Settings in the `empty`, `locked` and `full` demos and with jobs running (`window.__demo.set`): every status and
error text of today appears in its section; Sync now's disabled rule holds; Disconnect asks today's question.

- [x] T077 [US5] Split `src/ui/Settings.tsx` into `src/ui/settings/`: `SettingsPage.tsx`, `AccountSection.tsx`, `SyncSection.tsx`, `HistorySection.tsx`, `AudioSection.tsx`, `ReachSection.tsx`, `ServerSection.tsx` and `DangerZone.tsx`. Each is a `Card` with a title, a one-line description, `StatusLine`s, a `ProgressBar` while running, its last error or warning, and its actions, the main one filled. Follow the table in `contracts/screens.md` §13:
  - Key notation moves to `SegmentedButtons` (Camelot · Open Key · Classic). The Rekordbox XML picker becomes a `FileDrop` with `accept=".xml"`.
  - Every status text, disabled rule and `confirm()` stays word for word.
  - Reword the device-specific "this phone" texts outside `confirm()` (`grep -rn "phone" src/ui`) to "this browser".
  - The app version is the last line.
- [x] T078 [US5] Add the section index to `src/ui/settings/SettingsPage.tsx`: large windows only, sticky, 220 px. A click calls `scrollIntoView` on its section, and an `IntersectionObserver` marks the section in view. The address does not change. Long jobs still start only here (Principle IV).
- [x] T079 [P] [US5] Rewrite `src/ui/Import.tsx` per §14:
  - one card at reading width;
  - Last import;
  - "How to get the file", open until a first import exists;
  - a `FileDrop` reading "Drop my_spotify_data.zip here or choose a file", with the file `i` of `n` progress.

  The narrower-import `confirm()` stays in `src/model/state.ts`, unchanged.

- [x] T080 [US5] Add pages to `tools/shots/pages.ts`: Settings in the `empty`, `locked` and `full` demos, with sync, lookup and reach running and the server connected; and Import. Run the visual loop. The owner approves, and these become baselines. Commit.

---

## Phase 8: User Story 6 — a Mix workspace for the desktop (Priority: P2)

**Goal**: list–detail Mix with an editable tracklist table and `#/mix/<key>` (FR-037).

**Before S08**: the controller merges `origin/main` (rounds 003 "fill scan gaps" and 004 "worker progress and queue
control") into this branch; that merge is not a task here. Phase 8 builds on its code: `TracklistRow.origin/hits/clue/clues`,
`MixRow.clues`, `MixJobView.progress/priority/stopRequestedAt`, `progressLine`, `requestList`, `viewRows` and the three
`start*Request` actions. The Mix contract is `contracts/screens.md` §12, including "From round 004 and the owner's decisions".

**Independent Test**: at 1440 open a saved mix (address becomes `#/mix/<key>`), edit/delete/add a row, save, see Create playlist
outcomes inline (never a banner), pick an earlier request; at 390 the panes stack in the §12 order.

- [x] T081 [US6] Create `src/ui/mix/MixListPane.tsx`:
  - the link form with Look up, which reads Look up again for an open mix and Looking up… while busy;
  - `IdentifyRequest` with its history;
  - the Tracklistify JSON `FileDrop`;
  - Saved mixes, where Remove sits in a row menu and `confirm('Remove this saved mix?')` stays;
  - Requests to your computer, with status chips for queued, claimed, done, failed and rejected, and the earlier requests collapsed;
  - "Run the worker on your computer", collapsed.

  Every message stays: the not-SoundCloud error and `mixError`. The Requests card keeps round 004's Move to top, Cancel, Stop,
  Ask again and Check now (ported by T120).

- [x] T082 [US6] Create `src/ui/mix/TracklistTable.tsx` on `DataTable`:
  - columns Time (`formatClock`), Artist – Title, Label, Source (an icon with a tooltip, plus visible origin text and the **not heard** badge from T120, changed 2026-11-06: an icon alone would hide "not heard"), Confidence · references ("heard N× · best X %" when the row has `hits`, else "X% match"), In your library (`KeyPill` and `BpmText` via `matchMixRow`) and Actions;
  - Edit turns the row into `TextField`s with Save and Cancel (`editMixRow`), and Delete calls `deleteMixRow`;
  - gap rows render as separators with Delete;
  - under the table, Add track and Save mix, with "Saved ✓" for 2 s and nothing shown on failure.
- [x] T083 [US6] Create `src/ui/mix/CreatePlaylistCard.tsx` and `src/ui/mix/MixDetail.tsx`.
  - **The card**: every `createPlaylistState` state, the "not found" disclosure with `DigLinks`, and every failure inline, never a banner.
  - **The detail**: the header and provenance; Look up again; Replace with the description tracklist when `showReplace`; the player at 166 px with a "Larger player" toggle to 400; the `TracklistTable`; the card; and Paste a tracklist, collapsed.
- [x] T084 [US6] Create `src/ui/mix/Workspace.tsx` and route the mix:
  - **Layout**: the workspace uses `ListDetail`. With no mix open, the detail shows an `EmptyState` reading "Paste a link, import a JSON, or pick a saved mix".
  - **Opening by address**: `#/mix/<key>` calls `openMix(key)` when that saved mix exists. Otherwise the workspace shows an inline "This saved mix is not in this browser".
  - **Address updates**: opening a saved mix sets `#/mix/<key>`; `closeMix` returns to `#/mix`; an unsaved lookup stays at `#/mix`.
  - **Compact**: the panes stack in the order of `contracts/screens.md` §12.
  - **Cleanup**: delete `src/ui/Mix.tsx` and point `src/app.tsx` at the workspace, only once T120's checklist is clean (changed 2026-11-06: the file now carries the round-003/004 UI).
- [x] T116 [US6] Owner's request (2026-11-06), the left pane as one list of mixes with their status. Merge Saved mixes and Requests to your computer into one **Mixes** list in `MixListPane.tsx`, in the order of T121 (changed 2026-11-06: running, then waiting by priority, then the rest newest first). Each row: title (or the link while unnamed), one status chip — Queued, Identifying, Paused, Stopping…, Found N tracks (done, not saved yet), Failed (with its reason inline), Rejected, Saved · N tracks · K validated, Playlist made (Paused and Stopping… added 2026-11-06) — and the selected state, all from T121's `mixListItems`. Selecting a row opens it on the right (`#/mix/<key>` for a saved mix). Remove stays in the row menu with its `confirm()`. Earlier finished requests stay collapsed. The status comes from data the app already has (request states, saved mixes, create-playlist results): no new request, no new poll.
- [x] T117 [US6] Owner's ruling (2026-11-06), **Check on Spotify**, a button on the open mix's header. On a tap, gated like Create playlist (signed in, quota guard), it runs the existing `spotifySearch`/`pickMatch` for each track not yet checked, one at a time, with progress ("Checked 12 of 40") and Stop. It is a read on tap, never on load or open (ADR-02); no write; `pickMatch` unchanged (a wrong track is never accepted). Each track keeps its result as optional fields on the saved mix row (`spotify: {id, url} | 'not-found'`, `checkedAt`): no `DB_VERSION` bump (ADR-05). Failures inline on the Mix screen, never a banner; not in `jobsBusy()`. Create playlist reuses a stored found id instead of searching again. Pure helpers test-first; `spotifySearch.test.ts` stays green. Update how-it-works §10 and the inventory's "What leaves the browser" row for Spotify Search.
- [x] T118 [US6] Owner's request (2026-11-06), per-track review in `TracklistTable.tsx`:
  - a **Spotify** column: Not checked, On Spotify (a link to the track), or Not found;
  - a **Listen** cell: the existing dig links (Beatport, Bandcamp, Discogs, SoundCloud, YouTube, plus Shazam when known) as compact icon links with labels for screen readers, built for every track, not only not-found ones (`digLinks.ts`; plain links, no request until clicked);
  - **Validate** (a toggle; the row shows To review or Validated, stored as an optional field on the row) and **Remove** (the existing `deleteMixRow`, for a wrongly found track);
  - filter chips above the table: All, To review, Validated, Not on Spotify, with counts (Heard once joins them in T127);
  - the header line: "N tracks · K validated · M on Spotify · L not found".
- [x] T119 [US6] Owner's ruling (2026-11-06): Create playlist uses validated tracks. `CreatePlaylistCard` offers **Validated only** (the default once any track is validated) or **All tracks**, shows how many will be added, and keeps every existing state, message and failure inline. The write itself is unchanged (ADR-03: tap only, scope gate, POST never retried). Test-first for the pure selection helper; its rule for candidates is T126's (owner's D6).
- [x] T120 [US6] Port the round-003/004 Mix UI out of `src/ui/Mix.tsx` into `src/ui/mix/*` before T084 deletes it. Into `TracklistTable.tsx` (T082): the origin text ("second listen · +4 %", "second listen · −4 %", "second listen", "from a comment by <author>", "from the description", "from a chapter") with the clue's text in quotes, a **not heard** badge on every `origin: 'clue'` row, "heard N× · best X %", the Sort select (`#mix-sort`: Time, Clips heard, Best score, shown only when a row has `hits`, at every width) and the gap rows' collapsed "N clues around here". Into `src/ui/mix/Clues.tsx`: the set-wide clues ("Tracklist from the description (N lines, no times)", "… from the comments") and the gap-clue lines, all plain text, URLs not links. Into `MixListPane.tsx` (T081): the Requests card with its badges, state lines, Move to top, Cancel, Stop, Ask again and Check now / "Checking…". Port the three `.mix` rules (`details.clues`, `.src.clue`, `.rowview`) to tokens. Done when every user-visible string of `src/ui/Mix.tsx` on `origin/main` is found under `src/ui/mix/` (list them in the step report) and a mix from before round 003 renders with no empty Sort or clue control.
- [x] T121 [US6] Test-first, `src/features/mix/mixList.test.ts` then `src/features/mix/mixList.ts`: `mixListItems(jobs, mixes, server, now)` gives one item per link (saved mix, request, or both) with its chip (Queued, Identifying, Paused when step is `paused`, Stopping… when `stopRequestedAt` is set on a running request, Found N tracks, Failed, Rejected, Saved · N tracks · K validated, Playlist made; N never counts gap rows, candidates count), its line (`progressLine`, else the `requestStatusText` line), `percent`, and its actions: `canMoveToTop` (queued and not already first), `canCancel` (queued), `canStop` (running, not stopping), `canAskAgain` (failed, rejected, **or done with a stopped-early note**, only when the server can take a request). Order: running, then queued by `priority` high to low then oldest first, then the rest newest first. Fix the same queued order in `requestList` (`src/features/mix/worker.ts`, test in `worker.test.ts`) so Move to top shows the row first. Pure, no request.
- [x] T122 [US6] Every queue outcome shown (rulings D4, D5). `cancelRequest` in `src/server/sync.ts` returns `'cancelled' | 'gone'` like the other two (test in `src/server/sync.test.ts`). Test-first, `src/features/mix/queue.test.ts` then `src/features/mix/queue.ts`: `goneNote(statusAfterPull)` gives "Already taken by your computer" (claimed) or "Already finished" (done, failed, or no longer listed); `queueFailure(prefix, message)` gives "Apply migration 0003 on the server to use Cancel, Move to top and Stop" when the message says a column does not exist (42703), else today's "<prefix>: <message>". In `src/model/state.ts` `queueAction` pulls after a `'gone'` and sets a new `mixQueueNote` signal, shown as an inline `StatusLine` in the left pane and cleared by the next action; failures stay in `mixError`. `CANCEL_REQUEST_CONFIRM` and `STOP_REQUEST_CONFIRM` stay word for word; Move to top keeps no confirm; never a banner.
- [x] T123 [US6] Progress and status in the Mixes list (`src/ui/mix/MixListPane.tsx`, from T121): under an Identifying, Paused or Stopping… row, the progress line and a `ProgressBar` labelled with the step name when `percent` is known; finished rows with "Done <when>" (plus the stopped-early note), "Failed <when>: <reason>" and "Result rejected — ask again"; the actions Move to top, Cancel, Stop (disabled while Stopping…), Ask again, and Remove in the row menu; the `mixQueueNote` and `mixError` lines; the list header's "N requests waiting or running · checked every minute." / "Nothing waiting." with Check now; and the VPN note from `worker/README.md` in the collapsed "Run the worker on your computer". It refreshes with the existing 60 s auto-pull: no new poll.
- [x] T124 [US6] The run line (owner's D3). Test-first in `src/features/mix/worker.test.ts`: `resultToRows` (`src/features/mix/worker.ts`) keeps `mix_info.second_pass` (`places` or `replays`, `found`, `stopped`), `resumed` (`probes_kept`), `stopped_early` (`at`, `reason`) and `warnings` as an optional `MixRow.run` (`src/db/schema.ts`; no `DB_VERSION` bump), and a pure `runLine(run)` gives "Second pass: 41 places · 3 found", "Resumed (120 clips kept)", "Stopped early at 01:12:00 (rate limited)" and the warnings ("Shazam refuses often: a VPN or a shared network?"). `mixWithResult` (`src/server/sync.ts`) replaces `run` wholesale with each result; `validateMix` (`src/server/validate.ts`) checks it (test in `validate.test.ts`, a malformed `run` refuses the row). `MixDetail.tsx` shows the run line under the header, warnings collapsed, **Ask again** beside a stopped-early note; while the open mix's request runs, the header shows its progress line and **Stop**. A mix without `run` shows no line.
- [x] T125 [US6] A later result keeps the review (owner's D1). Test-first, `src/features/mix/keepReview.test.ts` then `src/features/mix/keepReview.ts`: `mergeKeepingReview(existing, incoming, removed)` replaces `mergeWorkerRows` in `mixWithResult` (`src/server/sync.ts`). An untouched scan row that matches an incoming row (same ISRC, else `artistCore` and `sameTitle` from `spotifySearch.ts`) is replaced by it, carrying `validated`, `spotify` and `checkedAt`; edited, manual, pasted, TrackId and description rows stay, and an incoming row matching one of them is dropped; an incoming row matching `removed` is dropped; every other incoming row arrives To review. Accepted cases: same ISRC with a new title spelling; same artist and title at a new time. Refused cases: same title by another artist; a remix against its original; a candidate against a heard row of another track. `deleteMixRow` (`src/model/state.ts`) records a deleted scan row's `{artist, title, isrc}` in an optional `MixRow.removed` (at most 500, oldest dropped). `validateMix` checks `validated`, `spotify`, `checkedAt` and `removed` (test in `validate.test.ts`). No `DB_VERSION` bump.
- [x] T126 [US6] The Create playlist selection rule (owner's D6), test-first in the T119 helper's test (`src/features/mix/createPlaylist.test.ts`): **Validated only** keeps rows with `validated`, a validated candidate included; **All tracks** keeps every row not removed, candidates (`origin: 'clue'`) included; gap rows never; the Heard once chip and the Sort never change the selection. Cases: an unvalidated candidate out of Validated only and in All tracks; a validated candidate in both; a gap row in neither. A candidate starts To review with its **not heard** badge (T120). `runCreatePlaylist` and the write are unchanged (ADR-03).
- [x] T127 [US6] The **Heard once (N)** filter chip (ruling D2) in `TracklistTable.tsx`, beside All, To review, Validated and Not on Spotify, shown only when a row has `hits`; one chip at a time; gap rows show under All only. Test-first: every chip's predicate and count in `src/features/mix/review.test.ts`, then `src/features/mix/review.ts` (T118's chips use it too). Under any chip but All the caption reads "Hidden, not deleted. Create playlist follows Validated only or All tracks, not this filter." It replaces round 004's "Only tracks heard once (N)" checkbox.
- [x] T128 [US6] Seed the Mix demo in `src/dev/demo.ts` for the shots: requests running with progress (first pass with `minutesLeft`, second pass ×1.04), paused, stale (news older than 10 min), stopping, two queued with priorities that reverse their age, failed with a worker reason, rejected, and done stopped early (`error` and `run`); mixes with second-listen rows (+4 %, −4 %), candidates with clues, `hits` (some heard once), gap rows with clues, set-wide clues, a `run` with warnings and `resumed`, validated and checked rows, and a `removed` entry. `window.__demo.set` covers the 'gone' note and the migration-0003 error. `src/dev/demo.test.ts`: every seeded mix passes `validateMix`, every request passes `jobView`, and no seeded text holds an external URL as a link.
- [x] T129 [US6] For the docs step (S12), not code: ADR-10 (`docs/architecture/700-adr/ADR-10-name-lookup-for-clues.md`, from `origin/main`) says comment candidates go into the playlist unless deleted; owner's D6 amends it (Validated only leaves them out until validated; All tracks includes them): add the amendment, linked both ways. The root `CLAUDE.md` rule "never name search" must name ADR-10's exception (the worker's clue lookup; the app does no name search). The redesign ADR of T104 cannot be ADR-10, now taken: it becomes ADR-11. How-it-works §14 lists the Cancel and Stop `confirm()`s at their new places, and §10 the queue, the run line and the kept review.
- [x] T085 [US6] Add pages to `tools/shots/pages.ts`: Mix with nothing open, a mix open, a row in edit, create playlist results and errors (via `window.__demo.set`), the Mixes list with every status chip, a mix mid-check and fully checked (found, not found, not checked), the review filters, Validated only in the create card, and an unknown key. From T128's demo (added 2026-11-06): the Mixes list with running (progress bar), paused, stale, stopping, queued in priority order, failed, rejected and stopped-early rows; the 'gone' note and the migration-0003 error; an open mix with its run line, warnings open and Ask again; second-listen rows, candidates with **not heard**, heard-once rows, gap clues open and set-wide clues open; the Sort select on Clips heard; the Heard once chip with its caption; and the create card on Validated only with an unvalidated candidate left out. Run the visual loop. The owner approves, and these become baselines. Commit.

---

## Phase 9: User Story 7 — find and filter (Priority: P3)

**Goal**: global search and BPM/key filters on every track table (FR-051, FR-052, FR-043).

**Independent Test**: `/` opens search; part of an artist name lists grouped results; on a playlist, 124–128 BPM and 8A + compatible
leaves only matching rows with "Showing N of M".

- [x] T086 [P] [US7] Write the failing test `src/ui/filters/trackFilter.test.ts` for `filterTracks` (data-model §4):
  - a row is kept only if every set criterion holds;
  - "A row without BPM fails a BPM criterion. A row without a key (or without a mode) fails a key criterion";
  - "`bpmMin > bpmMax` is shown as an error on the fields and filters nothing";
  - compatible means `keyRelation(seed, key) !== 'none'`;
  - text goes through `normalize`.
- [x] T087 [P] [US7] Implement `filterTracks` and `filterError` in `src/ui/filters/trackFilter.ts`. Make T086 pass.
- [x] T088 [P] [US7] Write the failing test `src/ui/search/searchIndex.test.ts`:
  - `buildSearchIndex` lists library tracks, history-only tracks, saved and top-list artists, playlists and mixes, "de-duplicated by id";
  - `searchAll` matches `normalize(query)` as a substring, ranks prefix and word-start matches first and then by `weight`, returns the groups in the order "Tracks, Artists, Playlists, Mixes", and gives `perGroup` entries plus the `total`.
- [x] T089 [P] [US7] Implement `buildSearchIndex` (memoised on the model's identity and the mixes array) and `searchAll` in `src/ui/search/searchIndex.ts`. Make T088 pass.
- [x] T090 [US7] Create `src/ui/filters/KeyPicker.tsx` and `src/ui/filters/FilterBar.tsx`.
  - **KeyPicker**: a menu of the 24 keys laid out by Camelot number, in the owner's notation, with an "Include compatible keys" switch.
  - **FilterBar**: the text filter; BPM min and max fields with the error from `filterError`; the KeyPicker; a "Clear filters" chip that resets everything but the text; and "Showing N of M" when a filter is active.
- [x] T091 [US7] Add the `FilterBar`, with one `TrackFilter` session signal per table, to every track table: `src/ui/Top.tsx` (tracks), `src/ui/Playlist.tsx`, `src/ui/Artist.tsx`, `src/ui/crate/Rotation.tsx`, `Gems.tsx`, `Classics.tsx`, `ByYear.tsx` and `Finish.tsx`.
- [x] T092 [US7] Create `src/ui/search/SearchView.tsx` and wire it into `TopBar` and `AppFrame`.
  - **Opening**: `/`, Ctrl+K or ⌘K when focus is not in a text field, or the top-bar field.
  - **Layout**: a docked 720 px panel, full screen on compact.
  - **Results**: grouped, five per group with "Show all N". Each shows an icon, its name, a context line and the match in bold.
  - **Keyboard**: arrows, Enter and Escape.
  - **Empty and no-match**: an empty query shows the last five items opened this session; no match reads "Nothing matches '…'".
  - **Mixes**: read from this browser when the view first opens.
  - **Choosing**: a track opens its details over the current screen (`?d=`); an artist, playlist or mix opens its route.
- [x] T093 [US7] Add pages to `tools/shots/pages.ts`: search open with "kia", and a playlist with BPM 124–128 and 8A compatible set. Run the visual loop, and time the search by hand (SC-008: under 5 s). The owner approves, and these become baselines. Commit.

---

## Phase 10: User Story 8 — an Overview home (Priority: P3)

**Goal**: the Overview screen, the fifth destination and the default address (FR-002, FR-002a, FR-050).

**Independent Test**: `#/` shows the Overview with figures equal to their screens, and the shots network check records no request
outside `127.0.0.1`; with the `empty` demo each card shows its explanation and one action.

- [x] T094 [P] [US8] Write the failing test `src/ui/overview/blocks.test.ts` for `overviewBlocks(input)` (data-model §8):
  - each figure equals the screen's own function (`heavyRotation`, `topTracks`, `coverage`, `reachCoverage`, `historyLine`) on the same input;
  - the states `ready`, `empty` and `gated` (the Crate gate on `historySummary.version === 2`, Under the radar on `artistReachSummary.version === 1`) and `hidden` ("`server` is `hidden` when no server is configured");
  - the quota-lock warning.
- [x] T095 [P] [US8] Implement `overviewBlocks` in `src/ui/overview/blocks.ts`. If `historyLine` is still local to Settings, move it to `src/ui/format.ts` and import it from both. Make T094 pass.
- [x] T096 [US8] Create `src/ui/overview/Overview.tsx` per `contracts/screens.md` §3:
  - a feed of `Card`s in 1, 2 or 3 columns (compact, medium, expanded and up);
  - each card links to its screen, and a gated or empty card shows its reason and one action;
  - the last-saved-mix card calls `loadSavedMixes()` after the first paint (`requestIdleCallback`, falling back to `setTimeout`).

  Update the comment on `loadSavedMixes` in `src/model/state.ts` to say why a local read after the first paint is acceptable (research D14).

- [x] T097 [US8] Make the Overview the home address:
  - add `{ name: 'overview' }` to `src/router.ts`; the empty address, `#/` and unknown addresses parse to it, and `destinationOf` returns `overview`;
  - update `src/router.test.ts`, replacing the T028 "still `top`" cases;
  - add Overview first in `src/ui/layout/Nav.tsx` (the `home` icon, five items in the bar);
  - render it from `src/app.tsx`.
- [x] T098 [US8] Add pages to `tools/shots/pages.ts`: the Overview in the `full`, `empty`, `old-import` and `locked` demos. Run the visual loop; it fails on any request outside `127.0.0.1`, which checks Principle II. Compare the figures with their screens by hand (SC-009). The owner approves, and these become baselines. Commit.

---

## Phase 11: Polish — audit and documents (plan step 11)

- [x] T099 Run `SHOTS_BROWSERS=all yarn shots`. Install Firefox, and WebKit if this Debian computer supports it, with `yarn playwright install firefox webkit` (system packages via `--with-deps` need the owner). Fix the differences between engines.
- [x] T100 Do the keyboard-only walkthrough of F1–F19 at 1440 and 390 px (quickstart §12): focus always visible, Escape closes panes and the search, arrows move through tables. Fix what fails.
- [ ] T101 (the owner's; steps in quickstart §12 "The owner's speed run") Run Lighthouse and the Performance panel on the owner's real profile (quickstart §12): Overview, a 500-track playlist, Artists with more than 1,000 rows, and Mix. The targets are LCP ≤ 2.5 s, CLS < 0.1 and INP < 200 ms on a sort and on opening details. Fix any regression.
- [x] T102 Run quickstart §13:
  - `grep -rn "confirm(" src` equals the list in How the app works §14, word for word;
  - the Network panel shows no host that is not already in the content security policy;
  - rankings, the Match order and the Crate counts equal the deployed `main` on the same data.
- [x] T103 [P] Write `docs/specs/2026-11-06-web-first-redesign-design.md` from the spec and the plan, in the style of the other files in `docs/specs/`.
- [x] T104 [P] Write `docs/architecture/700-adr/ADR-11-web-first-material-3.md` (ADR-10 is taken on `main`): web-first adaptive layout, Material 3 dark with chartreuse, five destinations, and the Playwright visual loop as a dev-only check. Link it both ways with `docs/architecture/700-adr/README.md`.
- [x] T105 [P] Amend `.specify/memory/constitution.md` to 2.1.1 (PATCH; `main` reached 2.1.0): the preamble becomes "uses mainly in a web browser on a computer, and on an Android phone", with a new Sync Impact Report and Last Amended date. Make the same change to the first line of the root `CLAUDE.md`, and add `yarn shots` and `?demo` to its Commands. Keep the root `CLAUDE.md` at 150 lines or fewer.
- [x] T106 [P] Update `docs/dev-guide/000-contributing.md`: the visual loop ends every UI change, with `yarn shots`, `yarn shots:sheet`, the baselines and the demo variants.
- [x] T107 [P] Update `docs/architecture/000-how-it-works.md` §13: the frame, the destinations, `?d=` and `#/mix/<key>`, the size classes, tables and sheets, the demo mode and `tools/shots/`.
- [x] T108 [P] Update the feature docs:
  - `docs/architecture/100-features.md`: add row F21, the redesign (F20 is round 005 on `main`), linked to the spec; change F4 so it is no longer "Top (default route)";
  - `docs/architecture/800-limits-roadmap.md`: add "Light theme: not built, the owner's choice".
- [x] T109 [P] Update `README.md` (the owner's manual: navigation, Overview, tables and sorting, details, search, filters, Compare periods), `CHANGELOG.md`, and `docs/README.md` (list the new pages).
- [ ] T110 Final gate: run `yarn typecheck && yarn lint && yarn test && yarn build && yarn shots` and check every exit code is 0. The OK to merge is asked after Phase 12.

## Phase 11b: Sync with main — features released on main show correctly here (owner's request, 2026-11-07)

`origin/main` was merged at 72d1e93 (rounds 003–004) before S08. `main` may move on while the redesign runs. This phase brings every
feature released on `main` into the redesign and proves it shows correctly, before the non-regression phase tests everything.

- [x] T130 Fetch `origin/main` and list the commits not yet in this branch (`git log --oneline HEAD..origin/main`). If there are any, merge `origin/main` (no push, local `main` untouched): keep both sides in docs; for UI, carry main's new behaviour into the redesigned components on tokens, never by reviving a deleted screen; `yarn typecheck && yarn lint && yarn test` and the worker tests (`uv run --directory worker python -m unittest discover -s tests`) exit 0. Record the merge, or "nothing new", in `specs/003-web-first-redesign/main-sync.md`.
- [x] T131 Audit every feature released on `main` since the redesign started (from merge base b59ccf7 to the merged `origin/main`: rounds 003, 004 and any later round): list each user-visible feature, string, state, message, `confirm()` and setting from main's specs, CHANGELOG, `docs/architecture/100-features.md` and the UI diff. For each, record in `main-sync.md`: where it lives in the redesign (`file:line`), the shots page that shows it (add a demo state via `src/dev/demo.ts` or `window.__demo.set` when none does), and its status (shown correctly / missing / broken / changed on purpose with the ruling that allows it).
- [x] T131b **Redesign proposal for main's new front-end decisions.** Features built on `main` after the redesign started carry their own UI choices in the old mobile-first style (stacked cards, ad-hoc buttons, raw styles). For each such feature, translate its _intent_ into the redesign, never its old layout: which destination and screen it belongs to (Overview, Listening, Library, Mix, Settings), where on that screen (list pane, detail, details sheet, a table column with its priority, a status chip, a filter chip, a row menu, a Settings section, the activity button), which shared components (`DataTable`, `SideSheet`, `ListDetail`, `Card`, `StatusLine`, `Flag`, charts…) and tokens it uses, how it behaves at compact / medium / expanded / large, and where each of its messages and failures shows. Add the result to `contracts/screens.md` under "From main after the redesign started", one subsection per feature, with an ASCII sketch for each changed screen, and list in `main-sync.md` every place where the proposal departs from main's choice and why. The controller approves the proposal after an opus review (owner's delegation, 2026-11-07), then T132 builds it.
- [x] T132 Build the approved proposal and fix every row of `main-sync.md` that is missing or broken: port into the redesigned screens on tokens, keep each text and `confirm()` word for word, failures in their place; add or extend shots pages for every new state; run the visual loop (0 findings on the pages touched, look at 1440 and 390); add each feature as a row of `regression.md` (T111) so S14 tests it. One `feat(scope)` or `fix(scope)` commit per feature. Acceptance: what is drawn matches exactly what the README's year bullets and inventory F20 describe (Released column, decade in the Filters fold, Sort by year where the header cannot sort, the Mix year); then rewrite F20's "What" column in the redesign's terms (S13b ruling 3). The controller approves the result after the step review (owner's delegation); the owner sees it in the final contact sheet at S15.

## Phase 12: Non-regression — every feature still works (owner's request, 2026-11-06)

The redesign changes how things look, never what they do (FR-049). This phase proves it, feature by feature, before the merge.

- [x] T111 Write `specs/003-web-first-redesign/regression.md`: one row per feature of `docs/architecture/100-features.md` §1 and §3 (the two Spotify writes), plus every old address (`#/top`, `#/playlists`, …) from `contracts/routes.md`. Each row says how to exercise the feature in demo mode, what must happen, and which test covers it (T112, T113, or the owner in T115).
- [x] T112 Add an end-to-end regression suite `tools/shots/regression.spec.ts` (dev-only, demo data, every request outside 127.0.0.1 blocked, as in `all.shots.ts`), run by a new script `yarn regression`. One test per row of `regression.md` that the demo can drive. It drives the real UI and asserts results, not looks: every route and old address opens the right screen; sorting and the default order; the details sheet; Crate views and gates (`historySummary.version === 2`); Match; Under the radar (Well known a heading at the bottom, listeners and fans side by side, a missing number never printed as zero); the Mix tracklist; Settings imports with a fixture history file; search and filters; Overview links. For Like all and Create playlist: the buttons exist, are gated by `hasScope`, and no request leaves 127.0.0.1. Every `confirm()` met is captured, and its text must equal the list in how-it-works §14. Zero blocked external requests and zero console errors per test.
- [x] T113 Add the static invariant check `tools/shots/invariants.ts` (`yarn invariants`), comparing the branch with `main`. It fails if any of these change: `DB_VERSION`; any `confirm()` text; the external hosts named in `src/`; the dependencies (except the approved Playwright and axe dev ones); a unit test name present on `main` that is now missing (a moved test is listed by its new file). It also runs the ranking, Crate, Match and Under the radar functions of `src/model/` on the demo dataset at `main` (a temporary `git worktree` in the scratchpad) and at `HEAD`, and fails if the JSON outputs differ (FR-049).
- [ ] T114 Run everything: `yarn typecheck`, `yarn lint`, `yarn test`, `yarn build`, `yarn shots`, `yarn regression` (Chromium, Firefox and WebKit), `yarn invariants`. Fix each regression found (one `fix(scope)` commit each, with a unit or regression test that fails before the fix) and run again until every exit code is 0. Record the results and any fix in `regression.md`.
- [ ] T115 Write in `regression.md` the short checklist only the owner can run on the real profile: sign-in, a sync, the history import, Like all and Create playlist on the real account, server sync on two devices, Lighthouse (T101). Then ask the owner for the OK to merge and push to `main`. Also show the owner, on the S15 contact sheet, two departures ruled in S13c (spec.md FR-015/FR-016 amendment of 2026-11-07, main-sync rulings 17-18): Top and the Crate views draw two-line items beside the docked details sheet on large windows, and Match folds the playlist pane below 1600 px.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: none. It must finish first, so every later phase can run the visual loop.
- **Foundational (Phase 2)**: needs Setup. It blocks every story.
- **US1 (Phase 3)**: needs Foundational. It provides the frame, `destinationOf`, `?d=` parsing, `TopBar` and the activity button that every later story renders into.
- **US2 (Phase 4)**: needs US1 (`ScreenTabs`, `TopBar` actions).
- **US3 (Phase 5)**: needs US2 (`DataTable`, row open, the `expanded` slot it removes).
- **US4 (Phase 6)**: needs US2 (`DataTable`) and US3 (Crate rows open details; T075 edits `TrackDetails`).
- **US5 (Phase 7)**: needs Foundational and US1 only. It can run in parallel with US2–US4.
- **US6 (Phase 8)**: needs US2 (`DataTable`), US3 (`ListDetail`) and the merge of `origin/main` (rounds 003 and 004). Inside it, T120 comes before T084 deletes `src/ui/Mix.tsx`; T128 before the shots of T121–T127; T125 after T117 and T118 (it carries their fields).
- **US7 (Phase 9)**: needs US2 (the tables), US3 (track results open details) and US4 (the Crate tables get the filter bar).
- **US8 (Phase 10)**: needs US1. Its cards link to screens from US2–US6, so it is done last, and it switches the default address.
- **Polish (Phase 11)**: needs every story.

### Within each phase

- The test task is written first and fails, then the module makes it pass.
- Pure modules, then components, then screens, then the visual loop and the commit.
- A phase is done only when the visual loop is clean and the owner has approved its contact sheet.

### Parallel opportunities

- Setup: T002, T003, T007, T008 and T010 (after T001).
- Foundational: T012, T015, T016, T017, T019 and T020, then T021–T025, all different files.
- US1: T028, T030 and T032 (tests), then T031, T034, T035 and T036.
- US2: T041–T044 together, and T046 alongside T045.
- US3: T054 and T055 alongside T056.
- US4: T063–T067 together, then T070–T074 (one file per view).
- US5 runs as a whole in parallel with US2–US4, and T079 inside it.
- US7: T086–T089 together.
- Polish: T103–T109.

## Parallel Example: User Story 4

```text
Task: "T063 Write the failing test src/ui/charts/series.test.ts"
Task: "T065 Create src/ui/charts/MonthBars.tsx"
Task: "T066 Create src/ui/charts/Meter.tsx"
Task: "T067 Create src/ui/charts/YearMonthGrid.tsx"
# after T068 (shared.tsx) and T069 (hub):
Task: "T070 Rewrite src/ui/crate/Rotation.tsx"
Task: "T071 Rewrite src/ui/crate/Gems.tsx"
Task: "T072 Rewrite src/ui/crate/Classics.tsx"
Task: "T073 Rewrite src/ui/crate/ByYear.tsx"
Task: "T074 Rewrite src/ui/crate/Finish.tsx"
```

## Implementation Strategy

### MVP (the two P1 stories)

1. Phase 1: the visual loop with demo data, and today's backlog recorded.
2. Phase 2: the look, the typeface, the icons and the components. The app is already Material 3 in chartreuse.
3. Phase 3 (US1): the web-first frame. **Stop and validate**: every old address, four widths, the owner's approval.
4. Phase 4 (US2): tables. **Stop and validate**: SC-001 and the alignment checks. This is the MVP worth merging with the owner's OK.

### Incremental delivery

After the MVP, in order: US3 details → US4 history → US5 Settings (can come earlier) → US6 Mix → US7 search and filters → US8
Overview → Polish. Each phase ends green with the visual loop clean and an approved contact sheet, so any stopping point leaves `main`
coherent.

## Notes

- Every commit compiles and passes `yarn typecheck && yarn lint && yarn test`. Push only with the owner's OK.
- Judge `yarn test` and `yarn shots` by their exit codes, never by grepping their output.
- No `DB_VERSION` bump, no new store, no new Spotify call, scope or host. Every `confirm()` stays word for word.
- `visual-backlog.md` (T011) is closed item by item as the phases fix today's issues. Whatever is left at T102 is fixed or listed in
  Limits and roadmap.
