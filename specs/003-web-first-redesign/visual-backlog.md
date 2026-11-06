# Visual backlog: the "before" state

The first `yarn shots` run on today's app (2026-11-06, before any redesign change). It covers 31 pages × 4 widths (1440, 1024, 768
and 390 px) on the demo data in the variants `full`, `empty`, `old-import`, `no-reach`, `locked` and `signed-out`.

- **No page failed to run.** There was no request outside `127.0.0.1` and no console error.
- **Every page has layout or accessibility findings.**
- Each item below is closed by the phase named in its last column. Whatever is still open at T102 is fixed then or listed in Limits
  and roadmap.

## Automated findings

| # | Check | Where | What | Count | Closed by |
|---|---|---|---|---|---|
| B1 | focus-visible | every control, every page | the browser's default 1 px focus ring; FR-042 asks for 3 px in `primary` | 364 | Phase 2 (T018) |
| B2 | target-size | list rows (`a.main`) on Top, Playlists, Playlist, Artists, the Crate views | rows are 41 px tall; Material and FR-045 ask for 48 | ~21,000 (one per row) | US2 (`DataTable` rows 52 px) |
| B3 | target-size | segmented controls (period, order, view) | 40 px tall | 8 kinds | Phase 2 (T022 `SegmentedButtons`) |
| B4 | target-size | the Spotify icon link in every row | 44 × 44 px | one per row | Phase 2 (T021 `IconButton`, 48 × 48) |
| B5 | target-size | "Open in Spotify" text link (Playlist, Artist headers), "‹ Crate" back link, empty-state links | 44 px and 22 px tall | a few per page | US1 (top bar back) and US2 (headers) |
| B6 | clipped-text | Artists, Under the radar: ranks from 1,000 up | a four-digit rank in a 28 px box overflows | 804 | US2 (rank column sized by the table) |
| B7 | axe: color-contrast | Settings: the Disconnect button | white on `#e5484d` is under 4.5:1 | 1 per Settings page | Phase 2 (T021: danger is outlined in `error`) |
| B8 | axe: link-in-text-block | Crate ("Update import", "re-import"), Under the radar ("Look up artists ›") | links inside text told apart by colour only | 3 | Phase 2 (T018: links underlined in text) |

## Seen on the screenshots, not caught by a check

| # | Screen | Width | What | Closed by |
|---|---|---|---|---|
| V1 | every screen | 1440, 1024 | content in a 720 px column, about two thirds of the window empty | US1 |
| V2 | the frame | 1440 | six tabs across the bottom edge, labels at 0.8 rem far apart, the current tab marked by colour only | US1 |
| V3 | the frame | 390 | six tabs: "Settings" touches the screen edge | US1 (five destinations) |
| V4 | Top, Playlist, Crate views | all | plays, BPM and key are wrapping badges under the title: no two rows line up, so nothing can be compared down the page | US2 |
| V5 | Top | 1440 | about eight rows above the fold | US2 (SC-001 asks for ≥ 15) |
| V6 | Mix with a mix open | 1440 | the open mix starts below the link box, the request button, the requests card and the JSON import: one track row above the fold | US6 |
| V7 | Mix | 1440 | Edit and Delete sit under each tracklist row, doubling its height | US6 (row actions in the row) |
| V8 | By year | 390 | two stacked rows of scrolling chips (years, then 17 periods) before the list | US4 (the grid from medium up; chips stay on compact) |
| V9 | full-page screenshots | all | the fixed bottom bar is drawn where the first screen ends | not a bug: the runner also saves a screen-sized capture, which is the one the contact sheet shows |

## Progress

| After | Closed | Still open (and the phase that closes it) |
|---|---|---|
| Phase 2 (2026-11-06) | B1 focus rings (364 → 0), B3 segmented 48 px, B4 Spotify icon 48 × 48, B7 Disconnect contrast, B8 links underlined in text: axe 24 → 0 | B2 rows 41 px (US2), B5 back and empty-state links (US1, US2), B6 four-figure ranks (US2); undersized targets 21,378 → 5,266 |

## How to read a run

- **Run**: `yarn shots`, then `yarn shots:sheet`. Open `shots-output/contact-sheet.html`.
- **Pictures**: each page shows its screen-sized capture at 1440 and 390 px. Its link opens the full page.
- **Findings**: grouped by check, with three examples each.
- **Full detail**: per page and width in `shots-output/findings/<width>/<page>.json`.
