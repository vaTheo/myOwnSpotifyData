# Contract: design tokens

The values `src/ui/theme/tokens.css` declares, as CSS custom properties named after Material 3's system tokens. Components read
only these tokens, never a raw colour or size. The contrast test (research D17) checks the pairs in the last table.

## Colour (dark only)

Generated from seed `#7FFF00` (fidelity, dark), with primary remapped to the seed (research D2).

| Token `--md-sys-color-…` | Value | Used for |
|---|---|---|
| `primary` | `#7FFF00` | the accent: current destination icon, filled buttons, selected segment, sort arrow, focus ring, links, progress, chart bars |
| `on-primary` | `#173800` | text and icons on a chartreuse fill |
| `primary-container` | `#245100` | selected row, active navigation indicator, selected chip |
| `on-primary-container` | `#7FFF00` | text and icons on primary-container |
| `secondary` | `#8eda58` | secondary emphasis (tonal buttons' text) |
| `on-secondary` | `#173800` | — |
| `secondary-container` | `#245100` | tonal buttons, the filter chips' selected state |
| `on-secondary-container` | `#a8f771` | text on secondary-container |
| `tertiary` | `#dcbce3` | top-list flags, the "New" flag |
| `on-tertiary` | `#3f2846` | — |
| `tertiary-container` | `#573e5e` | flag chips' fill |
| `on-tertiary-container` | `#f9d8ff` | text on tertiary-container |
| `error` | `#ffb4ab` | error text and icons, low finish band |
| `on-error` | `#690005` | — |
| `error-container` | `#93000a` | error banner fill |
| `on-error-container` | `#ffdad6` | text on the error banner |
| `surface` / `background` | `#0e1509` | page |
| `surface-container-lowest` | `#091005` | the navigation bar on compact |
| `surface-container-low` | `#161e10` | navigation rail, list pane |
| `surface-container` | `#1a2214` | cards, table body |
| `surface-container-high` | `#242c1e` | table header, side sheet, menus, search view |
| `surface-container-highest` | `#2f3728` | text fields, hovered row |
| `surface-bright` | `#333c2c` | tooltips' container (with inverse colours) |
| `on-surface` | `#dde6d0` | body text |
| `on-surface-variant` | `#bdcbae` | secondary text, captions, column headers, middle finish band |
| `outline` | `#88957b` | text field borders, unselected chip borders |
| `outline-variant` | `#3e4a34` | dividers, row separators |
| `inverse-surface` | `#dde6d0` | tooltip and snackbar fill |
| `inverse-on-surface` | `#2b3324` | tooltip text |
| `scrim` | `#000000` at 32% | behind modal sheets and the search view |

Custom roles, outside Material's set (research D3):

| Token | Value | Used for |
|---|---|---|
| `--app-color-warning` | `#ffb95c` | warning text and icons (stale history, quota lock, pending) |
| `--app-color-warning-container` | `#4a2800` | warning banner fill (with `#ffddb7` text) |
| `--app-color-band-high` | `#7ee2a3` | finish rate 65% and up |
| `--app-key-1` … `--app-key-12` | today's twelve hues, `#e68989` … `#e689b8` | Camelot key pills (outline for minor, fill for major, as today) |

## Type (Roboto, research D4)

| Token `--md-sys-typescale-…` | Size / line height / weight | Used for |
|---|---|---|
| `headline-small` | 24 / 32 / 400 | screen title in the top bar on large windows |
| `title-large` | 22 / 28 / 400 | screen title on compact, detail headers |
| `title-medium` | 16 / 24 / 500 | card titles, section headings |
| `title-small` | 14 / 20 / 500 | table column headers, list pane titles |
| `body-large` | 16 / 24 / 400 | prose (explanations, empty states) |
| `body-medium` | 14 / 20 / 400 | table cells, list items |
| `body-small` | 12 / 16 / 400 | captions, provenance lines, chart tooltips |
| `label-large` | 14 / 20 / 500 | buttons, tabs |
| `label-medium` | 12 / 16 / 500 | navigation labels, chips, flags |
| `label-small` | 11 / 16 / 500 | chart axis labels |

Number cells: `font-variant-numeric: tabular-nums`, right-aligned. Prose blocks: `max-width: 80ch`.

## Shape, elevation, spacing, motion

| Token | Value |
|---|---|
| `--md-sys-shape-corner-extra-small` | 4 px (tooltips, text fields) |
| `--md-sys-shape-corner-small` | 8 px (chips, flags, menus) |
| `--md-sys-shape-corner-medium` | 12 px (cards, table container) |
| `--md-sys-shape-corner-large` | 16 px (side sheet, list pane) |
| `--md-sys-shape-corner-extra-large` | 28 px (search view, dialogs) |
| `--md-sys-shape-corner-full` | 9999 px (buttons, navigation indicator, segmented buttons) |
| Elevation | tonal levels first (surface-container-*). Shadows only on the modal side sheet, menus and the search view (level 2–3) |
| Spacing | multiples of 4 px; screen margins 16 (compact), 24 (medium and wider); gaps between panes 24 |
| `--md-sys-motion-duration-short` | 150 ms (hover, press, chips) |
| `--md-sys-motion-duration-medium` | 250 ms (sheets, panes, search view) |
| `--md-sys-motion-easing-standard` | `cubic-bezier(0.2, 0, 0, 1)` |
| Reduced motion | `@media (prefers-reduced-motion: reduce)` sets every duration to 0 |

## Sizes

| Item | Value |
|---|---|
| Size classes | compact < 600 · medium 600–839 · expanded 840–1199 · large ≥ 1200 (research D6) |
| Navigation bar (compact) | 80 px tall, five items |
| Navigation rail (medium, expanded) | 80 px wide; expanded rail (large) 220 px |
| Top app bar | 64 px |
| Table row | 52 px (one line), 72 px (two lines on compact) |
| List pane (list–detail) | 360 px |
| Side sheet | 400 px |
| Touch target | ≥ 48 × 48 px for every control, whatever its drawn size |
| Focus ring | 3 px `primary`, offset 2 px |
| Selected row (round 013) | `primary-container` fill, `on-primary-container` text; hover is `on-primary-container` at the hover opacity over the fill. The marked Mix row adds `--app-mark-bar` 4 px (edge bar), `--app-mark-line` 2 px (top and bottom lines), `--app-mark-halo` 8 px (glow at 60% `primary`), all `primary` shadows; a form row keeps its neutral surface |

## Contrast pairs the test enforces

| Foreground | Background | Minimum | Measured |
|---|---|---|---|
| `on-surface` | `surface` | 4.5 | 14.4 |
| `on-surface-variant` | `surface-container-high` | 4.5 | 8.5 |
| `primary` | `surface` … `surface-container-highest` | 4.5 | 9.5–14.3 |
| `on-primary` | `primary` | 4.5 | 10.1 |
| `on-primary-container` | `primary-container` | 4.5 | 7.2 |
| `on-secondary-container` | `secondary-container` | 4.5 | 7.2 |
| `error` | `surface-container-high` | 4.5 | 8.5 |
| `--app-color-warning` | `surface-container-high` | 4.5 | 8.5 |
| `--app-color-band-high` | `surface-container-high` | 4.5 | 9.1 |
| `--app-key-1` … `--app-key-12` | `surface-container-high` | 4.5 | 4.67 (key 9) – 11.0 (key 3) |
| `outline` | `surface` | 3.0 | 5.9 |
| `on-surface` | `surface-container-highest` | 4.5 | 9.6 |
| `tertiary` | `surface-container-high` | 4.5 | 8.5 |
| `on-tertiary-container` | `tertiary-container` | 4.5 | 7.2 |
| `on-error-container` | `error-container` | 4.5 | 7.2 |
| `#ffddb7` (warning text) | `--app-color-warning-container` | 4.5 | 10.2 |
| `inverse-on-surface` | `inverse-surface` | 4.5 | 10.2 |
| `on-surface` | `primary-container` (the marked Mix row, round 013) | 4.5 | 7.24 |
| `on-surface-variant` | `primary-container` | 4.5 | 5.47 |
| `error` | `primary-container` (the phone "Not found on Spotify" is text) | 4.5 | 5.49 |
| `--app-color-warning` | `primary-container` | 4.5 | 5.48 |
| `secondary` | `primary-container` | 4.5 | 5.47 |
| `primary` | `primary-container` (found mark, edge bar, lines) | 3.0 | 7.2 |

`outline-variant` on `surface` (1.98) is a divider: decorative, so not in the test. `outline` on `primary-container` (2.94) is not
asserted: a form row never takes the selected fill.
