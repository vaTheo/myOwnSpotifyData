# Implementation Plan: One Crate view screen with a view switch, and four small fixes (spec 029)

**Branch**: `task/dev-session-2` from main 9aaf88b | **Date**: 2026-11-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/029-crate-view-switch/spec.md`

## Summary

UI only. The hub stays, so the route family, the top bar title and up arrow of a view, the Listening tabs, the gate, the selectors and the per-view signals do not change. The six views become one screen by drawing one **view switch** at the top of the Crate view screen, above the open view. The switch is made of links to the six existing addresses: a row of six names on medium and wider windows, one compact picker on compact windows (Q1 B). Four small fixes ride along: a source caption on Top, one filter text for the two Artists views, Activity links to the Settings item, and the "five views" wording.

Findings and choices: [research.md](research.md). What the owner sees: [contracts/screens.md](contracts/screens.md). How to check it: [quickstart.md](quickstart.md).

## Technical Context

**Language/Version**: TypeScript ~6.0.3, Node 24

**Primary Dependencies**: Preact, @preact/signals, Vite (no new dependency, FR-019)

**Storage**: none touched (no IndexedDB change, no stored field)

**Testing**: vitest beside the source (pure functions, no DOM tests); Playwright regression rows on the demo data (`yarn regression`); `yarn invariants` against `main`

**Target Platform**: desktop browser first, Android phone browser (compact window, 390 px)

**Project Type**: browser-only web app

**Performance Goals**: switching view draws the first page of 100 rows as opening a view does today

**Constraints**: tokens only (design guide, ADR-11); 48 px touch targets; a title never under 160 px; no sideways page scroll; relative imports without extension

**Scale/Scope**: about 1 new component and its pure helper, 8 source files edited, 4 doc sets

## Constitution Check

| Principle | Result |
|---|---|
| I. Browser-first, no secret | Pass: no server, token or secret touched. |
| II. No Spotify read on load | Pass: no read added. |
| III. Writes only on a tap | Pass: no write touched. |
| IV. External sources keyless, by id | Pass: untouched. |
| V. IndexedDB upgrades only add | Pass: no store, no version bump. |
| VI. Play counts only from the history export | Pass: the Crate gate (`crateStatus`) is untouched; the switch is drawn only when the gate passes. The Top caption states this rule to the owner. |
| VII. Every failure is shown | Pass: every empty message and gate card stays. |
| Tooling | Pass: no dependency, no blind bump, tests beside source, no DOM test. |
| Workflow | Docs in the same commits as the code; `yarn shots` runs this round, on the owner's request. |

Re-checked after the design: no violation, Complexity Tracking is empty.

## Approach

Each step is one commit, compiling and green, with its docs.

1. **View switch (US1, US3, US4; FR-001–FR-003, FR-009–FR-014).**
   - New `src/ui/crate/ViewSwitch.tsx` and a pure `viewSwitchItems(current)` in `src/ui/crate/labels.ts` (tested in `labels.test.ts`): the six views in `CRATE_VIEWS` order, each with its `CRATE_TITLE` label, its `routeHref({ name: 'crateView', view })` address and whether it is the open one. No period and no `?d=` in the addresses, so a switch closes the sheet and opens By year on the owner's current year and period.
   - Medium and wider: `<nav aria-label="Crate views">` holding six links, the open one `aria-current="page"`, on the pattern of `ScreenTabs` (navigation drawn as tabs, built as links). Arrow keys are not needed: links take Tab and Enter.
   - Compact: a labelled native `<select>` (label "Crate view", visually hidden) listing the six names, the open one selected; `onChange` sets `location.hash` to the view's address. Native select = system picker on Android, keyboard and screen reader for free, least height. Same styling as the Rarely played playlist select.
   - `CrateView.tsx` draws `<ViewSwitch current={view} />` above `<Body>` when `crateStatus` is `ready` only. The gate card is drawn alone, as today (FR-008).
   - Nothing else moves: `titles.ts`, `ScreenTabs.tsx`, `Nav.tsx` (`lastRouteInTab`), `router.ts`, `search/choose.ts` (`OWN_SHEET`), `selections.ts`, the six view files. Browser Back steps through the views because each pick is a normal address change (spec assumption).
   - FR-010 holds by construction: a view change swaps the component in `Body`, so By year mounts again and applies the address period. Checked by a regression row, not assumed.
   - Styles in `src/styles.css`, tokens only: the row scrolls inside itself if a medium window beside the docked sheet is too narrow, and never pushes the table.

2. **Top caption (US5; FR-015).** In `src/ui/Top.tsx`, one `<p class="caption">` under the toolbar. Tracks: "Spotify's own ranking for this period. Plays come from your history import." The second sentence only when the table shows a Plays figure (a history import exists). Artists and Compare periods: "Spotify's own ranking for this period." / "Spotify's own ranking, period by period." A pure `topCaption(kind, comparing, hasPlays)` in `src/ui/format.ts`, tested in `format.test.ts`.

3. **One Artists filter (US6; FR-016).** `artistSelections.ts` exports one `artistFilter` signal; `Artists.tsx` drops its local `filter`, `UnderRadar.tsx` and `ArtistPane` read `artistFilter`; `radarFilter` goes. The comment in `artistSelections.ts` is corrected. Under the radar's rows, groups, sorts and gate are not touched.

4. **Activity links (US7; FR-017).** In `src/ui/jobs.ts`: sync → `settings/sync`; lookup and rekordbox → `settings/audio`; reach → `settings/reach`; server → `settings/server`, each built by `routeHref({ name: 'settings', item })`. Import, Like and Create playlist links unchanged. `jobs.test.ts` updated (five expected addresses).

5. **Wording (US8; FR-018).** `CrateEmpty.tsx`: "These six views are built from…"; the import-again text becomes "The Crate's views need data the old import didn't keep. Your play counts still work everywhere else." (owner 2026-11-13: accepted). Spec 003 `spec.md` FR-015 and FR-035: five → six, with Rarely played named.

6. **Regression rows** (`specs/003-web-first-redesign/regression.md` and `tools/shots/regression.spec.ts`), written with the step they check:
   - new: switch shows six names with the open one current, at 1440; picking Forgotten gems changes the address and the title; Back returns; the hub is unchanged.
   - new: at 390, the picker shows the open view and switches.
   - new: from Heavy rotation's sheet, "Open <month>" lands on By year with that month pressed; a setting survives a switch and back; a filter set in one view is absent in the next and back again on return; a switch closes the sheet.
   - new: Top caption; Artists filter survives the switch both ways; a running job's link opens its item (demo variant with jobs).
   - edited: A06, F07, Y01 ("five Crate views" → six where Rarely played has the column; otherwise the row names the five).
   - `tools/shots/pages.ts`: the Crate pages keep their ids; one page added for Rarely played, so the six views are all shot with the switch.

7. **Docs, with each step, then one sweep (FR-020).**
   - `specs/003-web-first-redesign/contracts/screens.md` §1 (Activity links), §4 (Top caption), §6 (view switch), §9 (one filter); `components.md` (the view switch); `routes.md` (a line: addresses unchanged, the switch links to them).
   - `docs/architecture/000-how-it-works.md` §13 (Crate views, Top, Artists, Activity); `docs/architecture/100-features.md` (F7 and F23 rows, a new row for round 029); `docs/architecture/800-limits-roadmap.md` if a limit is found.
   - `README.md` (owner's manual: moving between Crate views), `CHANGELOG.md`, `docs/README.md` if a page is added.
   - Final sweep: a file-to-doc map in the report, and the review checks the docs against the code.

8. **Checks.** After every step `yarn typecheck && yarn lint && yarn test`, read by exit code. Before the PR: `yarn regression` and `yarn invariants`. A separate reviewer reads the diff against the spec, the design guide and `contracts/screens.md`. The visual loop runs this round (owner 2026-11-13: "you can use the package to take screenshot and make sure the design is still ok And without bugs"): `yarn shots` on the pages touched (Crate hub and views, Top, Artists, Settings), `yarn shots:summary` with 0 findings on them, `yarn shots:sheet`, and the screenshots read at the four widths; findings fixed before the PR.

9. **PR (owner 2026-11-13).** After the public-safe check of Contributing, push `task/dev-session-2` and open one PR to `main`; the text is shown in the final report.

## Project Structure

### Documentation (this feature)

```text
specs/029-crate-view-switch/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/screens.md
├── checklists/requirements.md
└── tasks.md            (from /speckit-tasks)
```

### Source Code (repository root)

```text
src/ui/crate/ViewSwitch.tsx        new: the switch (links row, compact picker)
src/ui/crate/labels.ts (+ .test)   viewSwitchItems
src/ui/crate/CrateView.tsx         draws the switch above the open view
src/ui/crate/CrateEmpty.tsx        wording
src/ui/Top.tsx                     caption
src/ui/format.ts (+ .test)         topCaption
src/ui/artistSelections.ts         one artistFilter
src/ui/Artists.tsx, UnderRadar.tsx read artistFilter
src/ui/jobs.ts (+ .test)           links to Settings items
src/styles.css                     the switch, tokens only
tools/shots/regression.spec.ts     new and edited rows
```

**Structure Decision**: the existing single project; one new file beside the Crate views it serves.

## Noticed, not done

- The six view files repeat about 150 to 250 lines of the same scaffolding (toolbar, caption, empty, table, sheet). Factoring it is possible but touches every caption and empty message that FR-005 keeps word for word; it is left out of this round.
- `CLAUDE.md` line 4 says "their playlists ranked by play count"; the Playlists list is sorted by name and the ranking is inside a playlist.

## Complexity Tracking

No violation.
