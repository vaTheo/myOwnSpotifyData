# Research: web-first redesign

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Date**: 2026-11-06

Each decision below resolves an unknown of the Technical Context. Format: Decision, Rationale, Alternatives considered.

## D1. How Material Design 3 is built: hand-written components on Material's tokens

**Decision**: no component library. The Material 3 system tokens are written as CSS custom properties named after Google's own
token names (`--md-sys-color-primary`, `--md-sys-typescale-body-medium-size`, `--md-sys-shape-corner-medium`, …) in one file,
`src/ui/theme/tokens.css`. Every component (navigation rail and bar, top app bar, tabs, segmented buttons, chips, cards, lists, data
table, side sheet, search, menus, tooltips, progress indicators) is a small Preact component styled from those tokens, following
the measurements on m3.material.io.

**Rationale**: the app has no dependency for its UI today and ADR-06 asks for the minimum. Material's guidance is a specification,
so following it does not require Google's code. The components the app needs most, a data table, a navigation rail and a side
sheet, are missing from Google's web library anyway.

**Alternatives considered**:
- **Material Web (`@material/web`)**: Google's Lit web components. Rejected. It has been in maintenance mode since 2024, it has no
  navigation rail, top app bar or data table, it adds Lit, and its styles live in shadow DOM, which is awkward to theme from Preact.
- **MUI (Material UI)**: React-first, follows Material 2 with partial Material 3. It is heavy, needs `preact/compat`, and brings
  its own styling engine. Rejected.
- **Beer CSS** or another Material 3 CSS kit: small, but a new dependency with its own class names. Its look would still need
  overriding for the chartreuse mapping (D2). Rejected.

## D2. The colour scheme: Material's dark scheme from chartreuse, with chartreuse kept as the accent

**Decision**: the scheme was generated once with Google's `material-color-utilities` 0.3.0 (run outside the repo, nothing added
to `package.json`) from the seed `#7FFF00`, dark, in the "fidelity" variant. Its neutral and surface tones are used as generated.
The primary roles are then mapped by hand so chartreuse itself is the accent:

| Role | Value | Source tone | Contrast |
|---|---|---|---|
| primary | `#7FFF00` | the seed (palette tone 90 is `#82ff14`) | 14.3:1 on surface, 11.2:1 on surface-container-high |
| on-primary | `#173800` | primary tone 20 | 10.1:1 on `#7FFF00` |
| primary-container | `#245100` | primary tone 30 | — |
| on-primary-container | `#7FFF00` | the seed | 7.2:1 on `#245100` |

The full table, with every role, is in [contracts/design-tokens.md](contracts/design-tokens.md).

**Rationale**: with a seed as light as chartreuse (tone 90), the generated dark scheme puts the seed in *primary-container* and
makes *primary* almost white (`#fffeff`). Chartreuse would then appear only inside filled containers, which is not what the owner
asked for. Material allows custom colour mapping. Moving the seed to the primary role keeps every contrast above 7:1 and leaves
the generated, slightly green-tinted dark neutrals (surface `#0e1509`) untouched. White on chartreuse is 1.3:1, so every text or
icon on a chartreuse fill uses on-primary (dark green).

**Alternatives considered**:
- **The fidelity scheme as generated**: chartreuse appears only on containers and the accent is near-white. Rejected.
- **The default "tonal spot" scheme**: primary `#acd28e`, a pale sage. It loses chartreuse entirely. Rejected.
- **Generating at runtime from the seed**: needs the library in the app bundle for a value that never changes. Rejected.

## D3. Data colours beside the scheme

**Decision**:

- The twelve Camelot key hues stay as they are today. Measured on surface-container-high (`#242c1e`), they range from 4.67:1 (key
  9) to 11.0:1 (key 3), so all pass AA for text. The same holds on every lighter surface they sit on.
- Finish-rate bands: high is `#7ee2a3` (mint, 9.1:1), middle is on-surface-variant, low is the error colour `#ffb4ab` (8.5:1).
- Warning, a custom role (Material has none): `#ffb95c` (8.5:1).
- Top-list flags use tertiary (`#dcbce3`, mauve), so they never read as chartreuse.

**Rationale**: these colours carry meaning the owner has learned (key colours) or that the spec fixes (bands). Each also carries
text (FR-012). Keys 4 and 5 are green, but they are pills with text and are never the accent.

**Alternatives considered**: re-deriving the key hues from the scheme. Rejected, because it would break what the owner already
recognises.

## D4. Typeface: Roboto, self-hosted

**Decision**: Roboto variable (weights 400–700), latin subset, one woff2 file of 43,136 bytes, stored in `public/fonts/` with its
licence (SIL Open Font License 1.1). It loads with `font-display: swap` and is preloaded from `index.html`. The fallback stack is
`system-ui, -apple-system, 'Segoe UI', sans-serif`. Number columns use `font-variant-numeric: tabular-nums`. Approved by the owner
on 2026-11-06.

**Rationale**: Roboto is Material 3's typeface on the web and has tabular figures. Serving it from the app's own origin keeps the
content security rules unchanged (`font-src` falls back to `'self'`) and contacts no font host (FR-046).

**Alternatives considered**: system fonts, the owner's other option, which looks less like Material on Windows and macOS. Roboto
Flex, a much larger file for axes the app does not use. The Google Fonts stylesheet, which is a third-party host and is blocked by
the content security rules.

## D5. Icons: about 35 Material Symbols copied as SVG paths

**Decision**: Material Symbols Rounded (weight 400, grade 0, 24 px, unfilled; filled for the current destination) are copied as
path strings into `src/ui/icons.tsx` with the Apache 2.0 notice, and drawn by one `Icon` component (`aria-hidden`, `currentColor`).
The list of icons is in [contracts/components.md](contracts/components.md).

**Rationale**: the app already draws its Spotify icon this way. No package or icon font is needed, and a few kilobytes of paths
replace a variable font of several hundred kilobytes.

**Alternatives considered**: the Material Symbols variable font, which is large and covers thousands of unused glyphs. An npm icon
package, which is a dependency. Rejected.

## D6. Adaptive layout: Material's size classes, CSS first

**Decision**: four size classes at Material's breakpoints: compact under 600 px, medium 600–839, expanded 840–1199, large 1200 and
up. CSS media queries do the layout. One `windowClass` signal, fed by `matchMedia` and computed by a pure `windowClassOf(width)`,
drives behaviour: whether a selection opens a pane or a full screen, and the navigation component. Tables decide which columns fit
by **container queries** on their own width, because the same table can sit full width or in a narrower pane.

Navigation by size class: compact uses a bottom navigation bar (five items). Medium and expanded use a navigation rail (80 px,
icon over label). Large uses the expanded rail (labels beside icons, about 220 px wide). Settings sits at the foot of the rail.

**Rationale**: these are Material's window size classes and navigation rules. Container queries are supported by every browser
the owner uses (Chrome and Edge 105+, Firefox 110+, Safari 16+).

**Alternatives considered**: JavaScript-only layout, which is slower to paint, shifts the layout and is harder to keep consistent.
One breakpoint, which is not what Material prescribes and leaves tablets awkward.

## D7. Tables: ARIA table roles on a CSS grid, sorting and paging in pure functions

**Decision**: one `DataTable` component renders `div`s with explicit `role="table"`, `row`, `columnheader` (with `aria-sort`) and
`cell`, laid out by CSS grid. Each column declares its header, alignment, a priority (1 = never hidden), a sort accessor, a first
sort direction and a cell renderer.

- **Compact**: the same rows reflow into two-line items through grid areas (title; artists · main metric · BPM · key).
- **Sorting**: a pure `sortRows(rows, accessor, direction)`. It is stable, keeps missing values last in both directions, and
  compares text with `localeCompare` at base sensitivity. A header click sorts by that column in its first direction (numbers of
  plays descending, BPM ascending, text ascending). The next click reverses. Clicking the rank header restores the screen's own
  ranking.
- **Rows**: today's paging (`PAGE_SIZE` = 100, "Showing the top 100 of N", "Show 100 more") extends to every table that can pass
  100 rows (Playlist, Artists, Under the radar, the Crate views, Playlists). Rows use `content-visibility: auto` with an intrinsic
  size, so off-screen rows cost no layout.
- **Keyboard**: rows take a roving tabindex. ArrowUp/Down, Home/End and PageUp/PageDown move through a pure
  `moveIndex(current, key, count, page)`. Enter opens the row, as a click does.

**Rationale**: a real `<table>` whose rows are restyled into cards loses its table semantics in some browsers once its `display`
changes. ARIA roles on a grid keep the semantics and allow the compact reflow. Sorting 2,000 rows is a few milliseconds. Paging
already exists and keeps the first render small, so no virtualisation library is needed.

**Alternatives considered**: `<table>` with a separate list for compact, which means two renderings of every table. A
virtualisation library, which is a dependency and breaks find-in-page and scroll restoration.

## D8. Addresses: same routes, plus Overview, an open mix and a detail parameter

**Decision**:

- The empty address (and an unknown one) opens **Overview**. Every existing address keeps its screen.
- `#/mix/<key>` opens a saved mix. A detail opened over a list adds `?d=<id>`, for example `#/top?d=<trackId>` or
  `#/playlist/<id>?d=<position>` (position, because a playlist may hold a track twice).
- Listening and Library are *destinations*, not routes: a pure `destinationOf(route)` maps each route to its destination and tab.
  Each destination remembers its last route for the session, so the rail link reopens where the owner was.
- Sort and filters stay session signals (as today's selections are), not part of the address.

The full table is in [contracts/routes.md](contracts/routes.md).

**Rationale**: the spec asks for bookmarkable pane selections (FR-006) and unchanged old addresses (FR-002a). A query part inside
the hash leaves `parseRoute`'s path logic as it is.

**Alternatives considered**: new paths per destination (`#/listening/top`), which break every old link. Putting sort state in the
address, which adds noise for little value.

## D9. List–detail and the track details sheet

**Decision**:

- **Expanded and large**: Playlists, Artists and Mix use Material's list–detail layout. With nothing selected, the list takes the
  full width as a table. With a selection, the list narrows to a 360 px list pane (cover, name, one figure) and the detail takes
  the rest.
- **Track details**: a side sheet 400 px wide. On large windows it is *docked*: the content beside it shrinks, and on a list–detail
  screen the list pane folds away while the sheet is open, so there are never three panes. On expanded and medium windows it is a
  *modal* side sheet. On compact windows it is a full-screen dialog.
- Escape or the close button removes `?d=` and returns focus to the row.

**Rationale**: Material's canonical layouts (list–detail, supporting pane) and its rule of at most two panes below the
extra-large size class.

**Alternatives considered**: expanding in place as today, which loses the owner's position. A third pane on large windows, which
is too narrow at 1440 px.

## D10. Charts: inline SVG, no library

**Decision**: three small chart components and pure helpers to scale them:

- **MonthBars**: one bar per month. Each row is scaled to its own peak, because the numbers in the columns give the magnitude. A
  zero is drawn as a short baseline tick. A month outside the imported history is drawn as a gap.
- **Meter**: finish rate, 0–100%, in its band colour, with the percentage written beside it.
- **YearMonthGrid**: one row per year, twelve month cells and a year total. The cell shade is one of five levels relative to the
  owner's busiest month. Cells are buttons with labels such as "Aug 2026, 143 plays". Season headers select a season by the
  existing By year rules (Winter includes the previous December).

Every chart has `role="img"` and an `aria-label` that lists its values. Hover and focus show the exact value in a tooltip.

Helpers: `monthSeries(months, keys, range)` returns `{key, value | null}` (null is a gap), `barHeights(series, height)`,
`heatLevel(value, max)` gives 0–4, and `meterBand(pct)` reuses `rateBand`.

**Rationale**: the charts are tiny and few. A chart library would outweigh the whole UI. The helpers are pure and unit-tested; the
SVG is markup.

**Alternatives considered**: a chart library (Chart.js, uPlot), which is a dependency and needs canvas accessibility work. CSS-only
bars, which are fine for bars but not for the grid's keyboard access.

## D11. Global search

**Decision**: a search dialog (Material's "search view": full screen on compact, a docked panel under the top bar on larger
windows), opened by `/`, by Ctrl+K (⌘K on a Mac) or by the search field in the top bar.

- A pure `buildSearchIndex(model, mixes)` lists library tracks, history-only tracks (by name from the export), artists (saved and
  top-list), playlists and saved mixes. It is memoised on the model's identity.
- A pure `searchAll(index, query, perGroup = 5)` matches with the existing `normalize` (case and accents) and ranks prefix matches
  first, then by plays.
- Saved mixes are read from this browser each time the search opens (S09), so a mix saved since shows.
- Choosing a result:

| Result | Opens |
|---|---|
| a track | its details sheet over the current screen |
| an artist | `#/artist/<key>` |
| a playlist | `#/playlist/<id>` |
| a mix | `#/mix/<key>` |

**Rationale**: a desktop app is expected to answer Ctrl+K (FR-051). An index of a few thousand names answers a keystroke in well
under a frame.

**Alternatives considered**: per-screen filters only. They exist and stay, but they cannot find a track the owner cannot place.

## D12. BPM and key filters

**Decision**: a `FilterBar` above every track table holds the text filter (where one exists today), a BPM range (two number
fields), a key picker (the 24 keys shown in the owner's notation) with an "include compatible keys" switch, and a "Clear filters"
chip when any filter is set. A pure `filterTracks(rows, featureOf, filter)` applies them. "Compatible" means
`keyRelation(seed, key) !== 'none'` from `model/keys.ts`, the same relations Match uses. While a filter is active, rows without the
filtered value are hidden and the count says "Showing 23 of 140".

**Rationale**: reusing `keyRelation` keeps one definition of compatible (FR-049). The filter changes no ranking.

**Alternatives considered**: free-text key entry, which is error-prone. A Camelot wheel picker, which is a nice later addition but
heavier to make accessible.

## D13. The activity indicator

**Decision**: a pure `activeJobs(states)` turns the existing job signals (`syncState`, `importState`, `lookupState`,
`rekordboxState`, `reachState`, `serverState`, `likeState`, `createPlaylistState`, `mixState`) into a list of
`{ id, label, done?, total?, href }`. The frame shows a progress icon button in the top bar while the list is not empty: circular
progress when a total is known, indeterminate otherwise. Its menu lists each job with its progress and a link to the screen or
Settings section that owns it. It starts, stops and retries nothing.

**Rationale**: FR-007. Deriving from the existing signals adds no state and cannot drift from what Settings shows.

## D14. Overview

**Decision**: Material's "feed" layout, with cards in one column on compact, two on medium and three on expanded and large. A pure
`overviewBlocks(input)` computes every figure from the model and the existing summaries (`historySummary`, `coverage`,
`reachCoverage`, `heavyRotation`, the 4-week top list, `syncState`, `serverState`, `artistReachSummary`), so each figure is the one
its screen shows (SC-009). The last-saved-mix card reads the saved mixes from this browser once the Overview has painted: a local
read, never a Spotify one, kept out of `buildModel` (Principle V). The comment on `loadSavedMixes` that says "never on app load"
is updated to say why that is now acceptable.

**Rationale**: the spec's blocks, each linked to its screen, with gated blocks following their screen's gate (FR-050).

## D15. Settings page and section index

**Decision**: one page of Material cards, one per section (Spotify account, Spotify sync, Listening history, Audio data, Artist
reach, Server, danger zone). On large windows a sticky index of the sections sits beside them. An index entry scrolls its section
into view on click. An `IntersectionObserver` marks the section in view. The address does not change: the hash belongs to the
router.

**Rationale**: FR-038. Clicking scrolls only because the owner asked for it, so it never fights back/forward scroll restoration
(the concern the `Segmented` comment records).

## D16. Confirmations, banners and empty states

**Decision**:

- Every `confirm()` stays the browser's own dialog, word for word (spec assumption, How the app works §14).
- Banners become Material banners at the top of the content area, still built only by `errorBanner` and `warnBanner`.
- Empty states become an icon, a one-line reason and one action, in Material's empty-state style, with today's wording kept or
  tightened without changing its meaning.

## D17. How the redesign is verified

**Decision**: logic is tested and the screens are checked by hand, as the constitution asks (no DOM tests).

- **Unit tests** cover every new pure function: `windowClassOf`, `destinationOf`, the route parsing for `?d=` and `#/mix/<key>`,
  `sortRows`, `moveIndex`, `activeJobs`, `overviewBlocks`, `buildSearchIndex` and `searchAll`, `filterTracks`, `monthSeries`,
  `barHeights`, `heatLevel`, and `trackFacts`, which gathers a track's details.
- **A contrast test** reads `tokens.css`, parses the declared colour pairs and fails below 4.5:1 for text, or 3:1 for controls and
  chart marks.
- **The visual loop** (D19): screenshots and layout checks of every page at four widths after every step, looked at by the
  implementer and approved by the owner.
- **By hand**: the walkthrough in [quickstart.md](quickstart.md), and Lighthouse in Chrome DevTools (built in, nothing to install)
  for Core Web Vitals on the owner's real library.

## D18. Delivery order

**Decision**: twelve steps (0 to 11). Each is a commit, or a short series of commits, that compiles and passes `typecheck`, `lint` and `test`,
so `main` is never half broken (spec assumption). The order and the files each step touches are in [plan.md](plan.md), "Delivery
order".

**Rationale**: the tokens and the frame come first, so every later screen lands directly in the new look. Overview becomes the
default route only once it exists.

## D19. The visual verification loop: Playwright screenshots and layout checks after every step

**Decision**: a dev-only loop, added on 2026-11-06 at the owner's request ("open each web page to see if everything is aligned
as a verification step loop"). The owner picked Playwright on 2026-11-06.

- **Tooling**: `@playwright/test` and `@axe-core/playwright` as dev dependencies, with Chromium downloaded once to this computer. Playwright does not
  recognise this computer's system (LMDE 7, a Debian 13 variant), so `yarn shots` sets
  `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64`, and the one-time install uses the same override.
  Run by `yarn shots` (`playwright test -c tools/shots/playwright.config.ts`). The files are named `*.shots.ts`, so Vitest
  (`src/**/*.test.ts`) never picks them up. It is not part of `yarn test` and not run in CI (ADR-06). It is a check the developer
  runs, not a DOM test in the suite, so the constitution's testing rule holds.
- **Demo data, dev only**: `yarn dev` opened with `?demo` loads `src/dev/demo.ts` through
  `if (import.meta.env.DEV && …) await import('./dev/demo')`, so a production build contains none of it.
  - **What it holds**: a deterministic fake library of about 40 playlists, 3,000 tracks, 1,200 artists, 2,000 history rows with
    months over six years, BPM and key for 70% of tracks, reach for 80% of artists, two saved mixes, and one worker request per
    state.
  - **Edge cases it includes**: names of 120 characters, local files, tracks with a BPM but no key, artists with no reach, and a
    500-track playlist.
  - **Isolation**: it writes to a separate database (`spotify-dj-demo`). The session lives in memory only. The server is treated
    as not configured. The owner's real data and login in the same browser are never touched.
  - **Extra states** for the gated and empty screens: `?demo=empty`, `?demo=old-import`, `?demo=no-reach`, `?demo=locked`.
- **What a run does** (`tools/shots/`):
  - **Pages**: every part of [screens](contracts/screens.md) in each of its states: empty, gated, Match mode with a seed, details
    open, search open with a query, filters set, a job running.
  - **Widths**: 1440 × 900, 1024 × 768, 768 × 1024 and 390 × 844.
  - **Network**: every request that is not to `127.0.0.1` is blocked and **fails the run**. This also checks Principle II and
    FR-046 on every page.
  - **Output**: a full-page PNG for each page and width, a JSON report, and Playwright's HTML report, in `shots-output/`
    (gitignored).
- **Automatic checks per page** (`tools/shots/checks.ts`, run in the page):
  1. no sideways page scroll (`scrollWidth` ≤ `clientWidth`);
  2. no clipped text: an element whose content overflows without `text-overflow: ellipsis` fails;
  3. no overlap between interactive elements that are not nested;
  4. the cells of each table column share their edge within 1 px (the right edge for numbers, the left edge for text);
  5. every interactive element's hit area is at least 48 × 48 px;
  6. the navigation and the top bar sit inside the viewport;
  7. focus is visible: tabbing to the first three controls shows the 3 px ring;
  8. an axe-core scan with the WCAG 2.2 AA rules passes;
  9. no console error and no unhandled rejection. The run's exit code decides, never a grep of its output.
- **Baselines**: when the owner approves a screen (SC-010), its screenshots become local baselines (`toHaveScreenshot`,
  gitignored). Later steps fail on any change the step did not mean to make to an approved screen. A deliberate change is accepted
  with `yarn shots --update-snapshots` after a look.
- **Browsers**: Chromium on every run. Firefox, and WebKit (Safari's engine) if this Debian computer can run it, in the audit step.

**The loop, at every delivery step**:

1. Implement the step.
2. Run `yarn typecheck && yarn lint && yarn test`.
3. Run `yarn shots`. Every page runs, not only the ones the step touched, so a shared component cannot break another screen
   unseen.
4. Read the report. Open every screenshot of the touched pages at the four widths and look at them: alignment, spacing on the
   4 px grid, truncation, hierarchy, and chartreuse used only as an accent.
5. Fix, and go back to 2, until the report has no failure and nothing looks wrong.
6. Build a contact sheet of the touched screens at 1440 and 390 px and send it to the owner. The screens they approve become
   baselines.
7. Commit.

**Rationale**: a redesign's main risk is visual, and the manual walkthrough could only be run by the owner. The loop lets the
implementer look at every page at every size after every step. It turns most of SC-003 and SC-004 into checks that fail on their
own. The demo data makes the 2,000-row, empty and gated states reproducible without a Spotify account or quota.

**Alternatives considered**:

- **Puppeteer** with the Chrome already in `~/.cache/puppeteer`: Chrome only. The owner picked Playwright.
- **Seeding IndexedDB from the test**: brittle, because the app opens the database at boot. Kept in the app, behind the dev flag.
- **Committing the baselines**: about 10 MB of PNGs per full set in the repository. Kept local, for one owner on one computer.
- **Running in CI**: a browser download and minutes on every push, which the lean-tooling rule declines.
