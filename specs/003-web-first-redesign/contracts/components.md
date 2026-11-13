# Contract: components

The shared building blocks every screen is made of. Each follows its Material 3 component page for measurements and states
(enabled, hovered, focused, pressed, disabled, selected) and reads only [design tokens](design-tokens.md). The props are listed to
fix responsibilities; exact TypeScript lives in the code.

## Frame

| Component | Material 3 component | Responsibility | Replaces |
|---|---|---|---|
| `AppFrame` | — | Places navigation, top bar, banner, content and side sheet per size class. Renders the shell before the library loads (FR-028) | `App` body in `app.tsx` |
| `NavRail` | Navigation rail / expanded rail | The five destinations ([routes](routes.md)): icon + label, active indicator (pill in `primary-container`, filled icon), Settings at the foot. Medium and wider | `.tabs` bottom bar |
| `NavBar` | Navigation bar | The same five on compact: 80 px, active indicator, labels always shown | `.tabs` |
| `TopBar` | Small top app bar | Title (and back arrow on a detail), the search field (large) or search icon, the activity button, the screen's actions | `h1` per screen |
| `ScreenTabs` | Primary tabs | Top / Crate inside Listening; Playlists / Artists inside Library | — |
| `ViewSwitch` | Secondary tabs (expanded and wider) / native select (compact, medium) | Spec 030: the six Crate views above the open one, links to their own addresses (`viewSwitchItems`, `ui/crate/labels.ts`), the open one `aria-current="page"`; one "Crate view" picker on compact and medium; drawn only when the Crate gate passes | the hub round trip between views |
| `ActivityButton` | Icon button + menu + progress indicator | Shows `activeJobs()` (research D13); the menu links each job to its owner (a Settings job to its item, `#/settings/<item>`, since spec 030); never starts a job | — |
| `Banner` | Banner | `errorBanner` / `warnBanner` messages: icon, text, dismiss; top of the content area | `Banner` (restyled) |

## Data display

| Component | Material 3 component | Responsibility |
|---|---|---|
| `DataTable<Row>` | Data table (Material guidance) | Columns with priority, alignment, sort accessor and first direction; header with `aria-sort`; roving-tabindex rows; selected row; compact two-line reflow; paging footer (research D7) |
| `ListPane` | List | The narrowed list beside a detail: cover, name, one figure, selected state |
| `SideSheet` | Side sheet | Track details: docked (large), modal (medium, expanded), full screen (compact); close on Escape or ✕ (research D9) |
| `TrackDetails` | — | The facts of one track from `trackFacts()`: identity, audio, plays, history chart, playlists, links (FR-019) |
| `KeyPill` / `BpmText` | Assist chip (small) | Key in the owner's notation with its Camelot hue (outline for minor, fill for major); BPM as tabular text |
| `Flag` | Suggestion chip (small, non-interactive) | "not in a playlist" (warning colour + icon), "New" and "Top 4 weeks" (tertiary), "pending" |
| `NoData` | — | A dash with `aria-label="no data"` (FR-021) |
| `Card` | Filled / outlined card | Crate hub cards, Overview blocks, Settings sections |
| `StatusLine` | — | One line with an icon for status and text: as-of dates, coverage, warnings, errors; the warning and error variants carry an icon (FR-012) |
| `EmptyState` | — | Icon, one-line reason, one action (FR-040) |
| `Paged` | — | "Showing the top 100 of N" + "Show 100 more" (kept from today) |

## Charts (research D10)

| Component | Input | Output |
|---|---|---|
| `MonthBars` | `monthSeries()` result | one bar per month (`primary`), zero as a baseline tick, gaps for months outside the history; `role="img"` with a values label; tooltip on hover and focus |
| `Meter` | a percentage and its band | a bar in the band colour with the percentage written beside it |
| `YearMonthGrid` | per-month totals, the selection | year rows × 12 months + total; five shade levels; cells and season headers are buttons; the selected cell outlined in `primary` |

## Controls

| Component | Material 3 component | Used for |
|---|---|---|
| `SegmentedButtons` | Segmented button | Period (Top), order (Playlist), view (Artists), Crate view settings, Finished/Skipped; replaces `Segmented` |
| `FilterChips` | Filter chip row | By year's season and month choices on compact (the grid takes over from medium) |
| `FilterBar` | Search field + chips | Text filter, BPM range, key picker + compatible switch, "Clear filters" (research D12) |
| `KeyPicker` | Menu | The 24 keys in the owner's notation, laid out by Camelot number |
| `SearchView` | Search view | Global search: full screen on compact, docked panel elsewhere; grouped results; keyboard navigation (research D11) |
| `Button` | Filled / tonal / outlined / text button | One filled button per screen section at most (the main action); destructive actions outlined in `error` |
| `IconButton` | Icon button | Spotify link (`open_in_new`), close, back, row actions; always with an accessible name and a tooltip (FR-014) |
| `FileDrop` | — | The Import screen's file picker that also takes a dropped file (FR-039); the Mix JSON import and the Rekordbox XML picker reuse it |
| `SettingsItem` | Card + accordion header (spec 026) | A Settings item: closed, a header button (`aria-expanded`, the name as an h3) with the one-line state (`StatusLine` in the worst tone) and the main button beside it, never inside; opened, the description and the item's content, rendered only while open. Opens on arrival when failing or running or named by `#/settings/<item>` |
| `ProgressBar` | Linear progress indicator | Job progress in Settings and the Like line; replaces `Progress` |
| `TextField` | Outlined text field | Mix link, tracklist row edits, server e-mail, paste box |

## Retired

`Segmented`, `Progress` and `Badge` are replaced as listed above. `TrackRow` is kept only inside `ListPane` and compact lists that
are not tables: saved mixes, requests, playlists in the details.

## Icons (Material Symbols Rounded, research D5)

`home`, `headphones`, `library_music`, `queue_music`, `settings`, `search`, `arrow_back`, `close`, `open_in_new`, `sync`,
`favorite`, `arrow_upward`, `arrow_downward`, `filter_list`, `tune`, `expand_more`, `more_vert`, `check`, `error`, `warning`,
`info`, `upload_file`, `link`, `delete`, `edit`, `add`, `schedule`, `cloud_sync`, `computer`, `trending_up`, `diamond`, `star`,
`calendar_month`, `skip_next`, `person`, `music_note`, `view_column`, `logout`, `album`.
