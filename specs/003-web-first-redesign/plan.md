# Implementation Plan: A web-first redesign of every screen, following Google's design guidance

**Branch**: `003-web-first-redesign` (work happens on `worktree-task-design`, merged to `main` with the owner's OK) | **Date**: 2026-11-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-web-first-redesign/spec.md`

## Summary

The app is rebuilt for a computer browser first, on Material Design 3. Today it is a 720 px phone column with six tabs at the
bottom. After the round:

- **Frame and colour**: five destinations (Overview, Listening, Library, Mix, Settings) in a navigation rail, with a top bar that
  holds search and a job activity button. The look is a dark Material 3 scheme generated from chartreuse `#7FFF00`, with
  chartreuse itself as the accent, and Roboto served from the app.
- **Tables and details**: every track list becomes a sortable table whose columns hide by priority and whose rows reflow into
  two-line items on a phone. A track's details open in a side sheet with everything the app holds, including data stored but
  never shown today (album, duration, added date, energy, listening time, first play). Playlists, Artists and Mix use Material's
  list–detail layout.
- **Charts**: the Crate's text strips become charts (month bars, finish meters, a year × month grid).
- **New screens and tools**: Settings becomes one page of sections with an index, Mix becomes a two-pane workspace, and the round
  adds a global search, BPM and key filters, and an Overview home built only from stored data.

Everything is hand-built on Material's tokens, with no new runtime package. The app gains only a 43 KB font file, which the owner
approved, and about 35 icon paths. Every step ends with a visual loop: Playwright, dev-only and picked by the owner, opens every page
at four widths on demo data, checks the layout automatically and saves screenshots. The implementer reviews them until everything
is aligned, then the owner approves (research D19). No stored data, Spotify call, rule or confirmation changes. The per-screen plan is
[contracts/screens.md](contracts/screens.md).

## Technical Context

**Language/Version**: TypeScript ~6.0.3 on Preact 10 with `@preact/signals`, unchanged. CSS uses custom properties, grid and
container queries.

**Primary Dependencies**: none new in `package.json` (ADR-06). Assets added:

- Roboto variable (weights 400–700), latin subset woff2 of 43,136 bytes, licensed under SIL OFL 1.1, served from `public/fonts/`.
  The owner approved it on 2026-11-06 (research D4).
- About 35 Material Symbols Rounded icon paths, copied into `src/ui/icons.tsx` under Apache 2.0 (D5).

The colour scheme was computed once, outside the repo, with `material-color-utilities` 0.3.0 (D2).

Dev dependencies added, both picked by the owner on 2026-11-06 for the visual loop (research D19): `@playwright/test` and
`@axe-core/playwright`, plus Chromium downloaded once on this computer. They are used only by `yarn shots`, never shipped, and not
run in CI.

**Storage**: none changed. No IndexedDB store, field or `DB_VERSION` bump, no server change, no new `localStorage` key. View state
lives in session signals ([data-model.md](data-model.md)).

**Testing**: Vitest next to source for every new pure function, plus a token contrast test (D17). No DOM tests in `yarn test`,
which is a standing rule. Every step ends with the **visual loop** (D19): `yarn shots` screenshots every page at 1440, 1024, 768
and 390 px on dev-only demo data, and checks overflow, clipping, overlap, column alignment, target size, focus, axe-core
WCAG 2.2 AA, console errors and outbound requests. The implementer reviews the screenshots and fixes until clean, and the owner
approves a contact sheet. Speed is checked with Lighthouse in Chrome DevTools ([quickstart.md](quickstart.md)).

**Target Platform**: GitHub Pages. The primary target is an evergreen desktop browser (Chrome or Edge 105+, Firefox 110+, Safari
16+) at 1200 px or wider. Android Chrome (compact) and tablets stay supported. The app stays installable.

**Project Type**: a static single-page web app (existing).

**Performance Goals**: the "good" Core Web Vitals thresholds on the owner's real library: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS < 0.1
(SC-005). Sorting 2,000 rows in under 50 ms. A first page of 100 rows rendered in under 100 ms. A search keystroke answered within
one frame.

**Constraints**:

- Principles I–VII: no new Spotify read, write or scope, no new external host, failures shown, Under the radar rules.
- The content security policy is unchanged: the font comes from `'self'`.
- Native `confirm()` dialogs, word for word.
- Long jobs start only from Settings.
- Rankings and gates are untouched (FR-046–FR-049).

**Scale/Scope**:

- 16 screens and parts ([screens](contracts/screens.md)): about 30 UI files (≈ 3,800 lines) restructured, `styles.css`
  (772 lines) rewritten on tokens, about 20 new UI files, and about 12 new pure modules with tests.
- Library sizes to stay fast with: hundreds of playlists, thousands of tracks, more than 1,000 artists, and thousands of history
  rows.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| I. Browser-first, no secret, one owner's server | Nothing new leaves the browser; no new host | **Pass**: the font is self-hosted and the icons are inline paths; the content security policy is unchanged; no server change |
| II. No Spotify reads on load | Overview and search read no Spotify | **Pass**: `overviewBlocks` and `buildSearchIndex` use the model and the local mixes store only; quickstart §11 checks the Network panel |
| III. Writes only on a tap, two sites | No third write | **Pass**: Create playlist and Like all songs keep their taps, scopes and inline states; "Match from this track" writes nothing |
| IV. Keyless sources, clients never throw, long jobs from Settings | Long jobs still start only in Settings | **Pass**: the activity button only shows jobs and links to them (D13); the pacing test is untouched |
| V. IndexedDB upgrades only add; `mixes` out of `buildModel` | No storage change | **Pass**: no store, field or bump; the Overview and search read mixes separately (D11, D14) |
| VI. Play counts from the export; versioned gates | Gates unchanged | **Pass**: the Crate gates on `historySummary.version === 2` and Under the radar on `artistReachSummary.version === 1`, in their screens and in the Overview cards |
| VII. Every failure is shown; Under the radar rules | Every surface kept | **Pass**: Settings `StatusLine`s, inline Mix and Like errors, `errorBanner`/`warnBanner` banners; listeners and fans in two columns, never summed; `NoData` never shows 0; Well known stays a heading |
| Tooling: lean, ask before a dependency | No runtime package; the font and the two dev dependencies are approved | **Pass**: the owner approved Roboto and picked Playwright (with axe-core) on 2026-11-06; both are dev-only, outside CI and `yarn test`; icons are copied paths; `material-color-utilities` was run outside the repo |
| Pins: TypeScript ~6.0.3, Vite explicit | Unchanged | **Pass** |
| No DOM tests; logic in pure functions | New logic is pure and tested | **Pass**: D17 lists the functions. The Playwright loop is a developer check run by `yarn shots`, outside the suite and CI (D19), and ADR-10 records it |
| Confirms listed in How it works §14 | None new, none reworded | **Pass** |
| A new job decides `jobsBusy()`/`disconnect` | No new job | **Pass**: the activity button reads existing states |
| Round documents | Spec, inventory, how-it-works, README, CHANGELOG, ADR, Limits | **Planned**: delivery step 11 |

**Post-design re-check** (after Phase 1): unchanged. The constitution's preamble ("uses on an Android phone") is wording, not a
principle. It gets a PATCH amendment (2.0.3) with ADR-10 in step 11, as the spec's Constitution notice says. Complexity Tracking
stays empty.

## Project Structure

### Documentation (this feature)

```text
specs/003-web-first-redesign/
├── spec.md              # the specification (with clarifications)
├── plan.md              # this file
├── research.md          # Phase 0: decisions D1–D18
├── data-model.md        # Phase 1: routes, view state, view models (no stored data)
├── quickstart.md        # Phase 1: the validation walkthrough and the visual loop
├── contracts/
│   ├── design-tokens.md # colour, type, shape, motion, sizes, contrast pairs
│   ├── routes.md        # destinations, addresses, the ?d= parameter
│   ├── components.md    # the shared components and icons
│   └── screens.md       # the screen-by-screen plan (16 parts)
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks), not created here
```

### Source Code (repository root)

```text
package.json                       # changed: devDependencies @playwright/test, @axe-core/playwright; script "shots"
.gitignore, eslint.config.js       # changed: ignore shots-output/, playwright-report/, test-results/
tsconfig.json                      # changed: include tools/
tools/shots/
├── playwright.config.ts           # new: Chromium, four viewports, the dev server, network blocked except 127.0.0.1
├── pages.ts                       # new: every page and state to visit (from contracts/screens.md)
├── checks.ts                      # new: the in-page layout checks (D19, 1–9)
├── all.shots.ts                   # new: visit, check, axe, screenshot, baseline compare
└── contact-sheet.ts               # new: builds shots-output/contact-sheet.html for the owner
index.html                         # changed: theme-color #0e1509, color-scheme dark, font preload
public/
├── manifest.webmanifest           # changed: background and theme colours
└── fonts/
    ├── roboto-latin-wght.woff2    # new (43 KB)
    └── OFL.txt                    # new: the font licence
src/
├── main.tsx                       # changed: loads the demo data when DEV and ?demo
├── dev/demo.ts (+ .test.ts)       # new, dev only: deterministic demo library, separate DB, in-memory session
├── app.tsx                        # changed: AppFrame, destinations, Overview default
├── router.ts (+ .test.ts)         # changed: overview, #/mix/<key>, ?d=, destinationOf
├── styles.css                     # rewritten on tokens (components, screens)
└── ui/
    ├── theme/
    │   ├── tokens.css             # new: --md-sys-* and --app-* tokens
    │   └── contrast.ts (+ .test.ts)  # new: contrast ratio + the token-pair test
    ├── icons.tsx                  # new: Icon + Material Symbols paths
    ├── layout/
    │   ├── windowClass.ts (+ .test.ts)  # new
    │   ├── AppFrame.tsx, Nav.tsx, TopBar.tsx, ScreenTabs.tsx    # new
    │   └── ListDetail.tsx, SideSheet.tsx                         # new
    ├── jobs.ts (+ .test.ts), ActivityButton.tsx                  # new
    ├── table/
    │   ├── DataTable.tsx, columns.tsx                            # new
    │   ├── sort.ts (+ .test.ts), keyboard.ts (+ .test.ts)        # new
    ├── filters/FilterBar.tsx, KeyPicker.tsx, trackFilter.ts (+ .test.ts)   # new
    ├── charts/MonthBars.tsx, Meter.tsx, YearMonthGrid.tsx, series.ts (+ .test.ts)   # new
    ├── details/TrackDetails.tsx, trackFacts.ts (+ .test.ts)      # new
    ├── search/SearchView.tsx, searchIndex.ts (+ .test.ts)        # new
    ├── overview/Overview.tsx, blocks.ts (+ .test.ts)             # new
    ├── components/                # Button, IconButton, SegmentedButtons, Card, StatusLine, EmptyState,
    │                              # Flag, KeyPill, NoData, ProgressBar, TextField, FileDrop (new);
    │                              # Banner, SpotifyLink, DigLinks, Filter, FeaturePills (restyled);
    │                              # Segmented, Progress, Badge (retired)
    ├── Top.tsx, Playlists.tsx, Playlist.tsx, Artists.tsx, UnderRadar.tsx, Artist.tsx,
    │   Connect.tsx, Import.tsx    # changed
    ├── crate/*                    # changed: hub cards, view tables, charts
    ├── mix/                       # new folder: Mix.tsx (921 lines) split into Workspace, MixListPane,
    │                              # MixDetail, TracklistTable, CreatePlaylistCard, WorkerHelp
    └── settings/                  # new folder: Settings.tsx (560 lines) split into one file per section + the index
```

**Structure Decision**: the existing single-project layout, plus `tools/shots/` for the dev-only visual loop. New UI code goes in folders under `src/ui/` grouped by role (`theme`,
`layout`, `table`, `filters`, `charts`, `details`, `search`, `overview`). The two largest screens (Mix, Settings) are split into
folders. Model, features, database and server code are not touched, except for reading existing exports and updating the comment
on `loadSavedMixes` (D14).

## Delivery order

Each step is one or more commits (`type(scope): summary`) that compile and pass `yarn typecheck && yarn lint && yarn test`, so
`main` is never half old and half broken. From step 1 on, every step ends with the **visual loop** of research D19:

1. Run `yarn shots` over every page at four widths.
2. Read the report and look at the screenshots.
3. Fix and run again, until there is no failure and nothing looks wrong.
4. Send the owner a contact sheet of the touched screens. Approved screens become baselines.
5. Commit.

The "Check" column names the quickstart sections run on top of the loop.

| Step | What lands | Main files | Requirements | Check |
|---|---|---|---|---|
| 0 | **Visual loop first**: demo data (dev only, separate database, in-memory session), `tools/shots/`, `yarn shots`; a first run on today's screens records the before state and finds today's misalignments | `src/dev/demo.ts`, `main.tsx`, `tools/shots/*`, `package.json`, configs | supports SC-003, SC-004, SC-010 | `yarn shots` runs green on network and console checks; the layout failures of today's screens are listed as the starting backlog |
| 1 | **Theme foundation**: tokens, Roboto, icons, base styles; today's screens restyled onto the tokens with no layout change, so the app turns dark Material 3 and chartreuse at once | `tokens.css`, `contrast.ts`, `icons.tsx`, `styles.css`, `index.html`, manifest, `public/fonts/` | FR-009, FR-009a, FR-010, FR-011, FR-013, FR-042 (contrast) | contrast test; §12 colours |
| 2 | **Frame and addresses**: rail and bar (Listening, Library, Mix, Settings; Overview joins in step 10), top bar, tabs, activity button, banners under the top bar, loading inside the frame; `?d=` and `#/mix/<key>` parsed | `router.ts`, `app.tsx`, `layout/*`, `jobs.ts`, `ActivityButton.tsx` | FR-001–FR-008, FR-028, FR-041 | §3, §4 |
| 3 | **Shared components**: buttons, segmented buttons, cards, status lines, empty states, flags, key pills, no-data, progress, text fields, file drop; `Segmented`, `Progress` and `Badge` retired | `components/*` | FR-012, FR-014, FR-021, FR-040, FR-045 | §12 keyboard |
| 4 | **Tables and details**: `DataTable`, sorting, keyboard, paging; track details sheet; Top, Playlist (with Match) and Artist migrated | `table/*`, `details/*`, `Top.tsx`, `Playlist.tsx`, `Artist.tsx` | FR-015–FR-019, FR-022, FR-023, FR-029, FR-031, FR-032, FR-034, FR-043, FR-044 | §5, §6 |
| 5 | **List–detail**: Playlists and Artists (Saved tracks, Under the radar) with their panes | `ListDetail.tsx`, `Playlists.tsx`, `Artists.tsx`, `UnderRadar.tsx` | FR-020, FR-024, FR-030, FR-033 | §4, §5 |
| 6 | **Crate**: hub cards, the five view tables, `MonthBars`, `Meter`, `YearMonthGrid` | `crate/*`, `charts/*` | FR-025, FR-026, FR-035, FR-036 | §7 |
| 7 | **Settings and Import**: sections, index, file drop | `settings/*`, `Import.tsx` | FR-038, FR-039 | §8 |
| 8 | **Mix workspace**: the split, list–detail, the tracklist table, `#/mix/<key>` | `mix/*` | FR-037 | §9 |
| 9 | **Search and filters**: the search view, the index, the filter bar, the key picker | `search/*`, `filters/*` | FR-051, FR-052 | §10 |
| 10 | **Overview**: blocks, the Overview item in the rail, the default route switched to `#/` | `overview/*`, `router.ts`, `Nav.tsx` | FR-002, FR-002a, FR-050 | §11 |
| 11 | **Audit and documents**: the full quickstart; Lighthouse; fixes; the round's documents (below) | docs | FR-047–FR-049, SC-001–SC-010 | all |

**Documents in step 11**:

- `docs/specs/2026-11-06-web-first-redesign-design.md`, from the spec and this plan;
- Contributing and the root `CLAUDE.md` commands: `yarn shots`, `?demo`, and the visual loop as the end of every UI change;
- `docs/architecture/700-adr/ADR-10-web-first-material-3.md` (web-first adaptive layout, Material 3 dark with chartreuse, five
  destinations), linked both ways with the ADR index;
- the constitution PATCH 2.0.3 (preamble wording) and the first line of the root `CLAUDE.md`;
- How the app works §13 (`ui/` and routing: frame, destinations, `?d=`, tables, the size-class rules);
- the feature inventory: row F20, and F4 no longer "default route";
- `README.md` (the owner's manual: navigation, search, filters, Overview);
- `CHANGELOG.md`;
- Limits and roadmap ("light theme: not built, owner's choice");
- `docs/README.md`, which lists the new pages.

From T046 on, the steps run one subagent each: [execution.md](execution.md) holds the step table, the rules every subagent
follows and the controller loop.

## Complexity Tracking

No violation to justify.
