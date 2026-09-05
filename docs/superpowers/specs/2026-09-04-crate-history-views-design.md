# The Crate: five history views. Design

Date: 2026-09-04. Status: approved by the owner on the mockup
(https://claude.ai/code/artifact/fc923187-a063-4686-90fe-adb3a6c3f069).
Builds on the shipped app described in `2026-09-04-spotify-dj-webapp-design.md`.
Research: `../research/2026-09-04-history-export-semantics.md`.

## 1. Goal

Five new views over the imported Extended Streaming History, organised so a
DJ can answer "what should I play tonight" from a phone in a few taps:

1. **Heavy rotation**: tracks with the most plays in the last 1, 3 or 6 months.
2. **Forgotten gems**: tracks with many lifetime plays and none in the last
   6 months, 1 year or 2 years.
3. **All-time classics**: tracks played in the most distinct years.
4. **By year**: top tracks of a year, with a season or month drill-down.
5. **Finish rate**: tracks usually played to the end versus usually skipped.

Everything comes from the export. Spotify's API has no play counts.

### Out of scope

Charts, adjustable thresholds, a filter box in the Crate, multi-select
months, cross-year ranges other than Winter, cover art on Crate rows,
artist-level history, per-month listening time, BPM or key, playlist
creation in Spotify.

## 2. Information architecture

Tab bar becomes: **Crate · Top · Playlists · Artists · Settings**. Import
leaves the bar; its screen is unchanged and reachable from the Settings card,
the Crate provenance line and every Crate empty state. While `#/import` is
open, the Settings tab is highlighted (like `playlist` highlights
Playlists).

| Route | Screen |
| --- | --- |
| `#/crate` | Hub |
| `#/crate/rotation` | Heavy rotation |
| `#/crate/gems` | Forgotten gems |
| `#/crate/classics` | All-time classics |
| `#/crate/year` | By year, latest year with plays, period All |
| `#/crate/year/2022-06` | By year with 2022 and June preselected |
| `#/crate/finish` | Finish rate |

`Route` gains `{ name: 'crate' }` and
`{ name: 'crateView'; view: CrateView; period?: string }` with
`CrateView = 'rotation' | 'gems' | 'classics' | 'year' | 'finish'`. An unknown
view maps to the hub. The default route stays `top`.

## 3. Screens

Every Crate sub-screen renders, in this order and before any data check:
a `‹ Crate` link to `#/crate`, the title, its one control, a caption. The
list or the empty state comes after, so an empty result always leaves the
control reachable.

### Hub

```
Crate
2016 – 2026 · 251,433 plays
Imported 2 Sep 2026 · Update import      (link to #/import)
------------------------------------------
Heavy rotation                         ›
Top: Kerri Chandler — Rain
[18 tracks] [last 3 months]
------------------------------------------
Forgotten gems                         ›
Top: Daft Punk — Veridis Quo
[34 tracks] [unplayed 1 year+]
------------------------------------------
All-time classics                      ›
Top: Moodymann — Shades of Jae
[62 tracks] [3+ years]
------------------------------------------
By year                                ›
Top in 2026: Peggy Gou — It Makes You Forget
[1,148 tracks] [2026]
------------------------------------------
Finish rate                            ›
Top: Nils Frahm — Says
[1,204 tracks] [10+ outcomes]
```

Badge 1 is the row count the view would show with its current setting;
badge 2 is that setting. Order is workflow order (now, bring back, safe bets,
era digging, quality lens). "Top:" shows the first row of the view. A view
with no rows reads `Nothing yet`, except the two whose setting is a time
window: Heavy rotation reads `Nothing in the last 3 months` and By year
`Nothing in Dec 2025`, naming the window that emptied it.

**Stale export** (`range.last` older than 35 days): the provenance line
becomes `History ends Aug 2025 · re-import` in the warn colour. Windows are
anchored to today, not to the export, so staleness is shown rather than
hidden. The month, and both years of the span on the non-stale line, are read
in the device zone — the zone the month keys were bucketed in — so the line
can never name a different month or year from the data below it.

**No import yet**: the five rows are replaced by a card, "Your crate is
empty. These five views are built from your Spotify Extended streaming
history, the zip you request from Spotify. The Web API has no play counts,
so nothing here can be filled in by syncing." with an `Import history`
button (`#/import`) and a `Spotify's own top lists ›` link (`#/top`).

**Old import without month data**: same card with "Your history needs
importing again. The year, month and skip views need data the old import
didn't keep. Your play counts still work everywhere else." Detected from the
import summary's `version`, never by sniffing rows.

### Heavy rotation

Control: `1 month · 3 months · 6 months` (default 3). Caption:
`Jul – Sep 2026 · 3+ plays · 18 tracks`; while today is before the 8th of
the month the caption adds `· Sep is 4 days in`. Rows sorted by plays in
the window. Badge 1 `27 plays` (green). Badge 2 `41 lifetime` (grey), or
`New` (blue) when every play is inside the window, or `not in a playlist`
(amber). Expansion: `27 of 41 plays`, the window's months as a strip
(`Jul 9 · Aug 12 · Sep 6`), playlists, `Open Aug 2026 ›`.
Empty: `Nothing with 3+ plays since Jul 2026.` and `Try 6 months`. Empty
and stale: `Your history ends Aug 2025, so nothing falls in the last 3
months.` and `Import a fresh export`.

### Forgotten gems

Control: `6 months · 1 year · 2 years` (default 1 year). Caption:
`Played 10+ times, nothing since Sep 2025 · 34 tracks`. Rows sorted by
lifetime plays. Badge 1 `214 plays`. Badge 2 `last Feb 2023` or amber.
Expansion: `214 plays · 2016 – 2023`, `8 of 11 years · last 19 Feb 2023`,
playlists, `Open Feb 2023 ›`. Empty: `Nothing forgotten. Everything you have
played 10+ times has come round in the last year.` and `Try 6 months`.

### All-time classics

Control: `Most years · Most plays` (default Most years). Caption:
`Played 3+ times in 3+ of your 11 years · 62 tracks`. Badge 1
`10 of 11 years` (blue). Badge 2 `96 plays` (green) or amber. Expansion:
`96 plays · last 30 Aug 2026`, one number per year of the span with `—` for
gaps (`'16 8 · '17 11 · … · '23 — · …`), playlists, `Open Aug 2026 ›`.
Empty: `No track reaches 3 years yet. Your history covers 2 years.`

### By year

Two scrollable chip rows: years with plays (default: latest), then
`All · Winter · Spring · Summer · Autumn · Jan … Dec` (default All).
Single selection in each row, centred in view on arrival and whenever it
changes. Winter is December of the previous year plus
January and February; Spring Mar–May; Summer Jun–Aug; Autumn Sep–Nov.
Caption: `2022 · 4,812 plays · 936 tracks`, `Dec 2021 – Feb 2022 · 806
plays · 241 tracks`, `Mar 2022 · 402 plays · 180 tracks`. Rows sorted by
plays in the selection. Badge 1 `41 plays`. Badge 2 `of 148 in 2022` when a
season or month is selected (the year's twelve months, plus the previous
December when Winter is selected, so the number is never below the
selection), else `of 358 all-time`; amber replaces it when
the track is in no playlist. Expansion: `358 plays lifetime · last 14 Aug
2026`, the year's twelve months as a strip (preceded by the previous December
when Winter is selected, so the strip never contradicts the badge),
playlists. Empty: `No
plays in Feb 2022.` Lists show 100 rows with `Showing the top 100 of 918`
and a `Show 100 more` button.

### Finish rate

Control: `Finished · Skipped` (default Finished). Caption on Finished:
`Tracks you play to the end · 10+ clear outcomes · 1,204 tracks`; on
Skipped: `You bail out of these · 10+ clear outcomes · 1,204 tracks`. A
legend line `65%+ green · under 35% red`. Badge 1 `96% finished`: green at
65% or more, grey between, red under 35%. Badge 2 `312 of 324` or amber.
Sorted by rate descending (Finished) or ascending (Skipped). Ties on
Finished break by plays; ties on Skipped break by number of outcomes,
because most skipped tracks have no credited play at all.
Expansion: `318 plays · 331 starts`, `312 finished · 12 skipped · 7
unclear`, playlists. Empty: `No track has 10 clear outcomes yet.`

### Row rules (all five views)

- Badge 1 is always the number the list is sorted by.
- Badge 2 is the context number, or amber `not in a playlist` when the track
  is in none of the synced playlists. Never both, never a third badge. Amber
  is suppressed when no playlist has been synced.
- No cover art.
- Title and artist come from the synced track when the id is known,
  otherwise from the export's names. The Spotify link is
  `https://open.spotify.com/track/<id>`.
- Tapping a row expands it, one row open per list: a facts line, a number
  strip, the playlists as links, and `Open <Mon YYYY> ›` to
  `#/crate/year/<YYYY-MM>` where a date is named.
- Rank comes from the unfiltered list.

### Settings and Import

Settings' "Listening history" card: `Imported 2 Sep 2026: 251,433 plays
across 19,842 tracks. 14 Mar 2016 – 1 Sep 2026. Months bucketed in
Europe/Paris.` with an `Update import` button (`#/import`); empty state
`No history imported yet.` with `Import history`. When the device zone
differs from the import zone: `This phone is now on America/New_York.
Re-import to re-bucket months.` in the warn colour.

Import's "Last import" card gains `Months use Europe/Paris, this phone's
zone at import` and `214,908 starts, 61% played through`.

### Re-import notice

After this version, while the stored import has no `version`, the existing
banner says: `The new Crate views need your history imported again.` It
appears on each load until the owner dismisses it or runs a sync or import;
the meta flag `crateNoticeShown` then prevents repeats.

## 4. Thresholds and defaults

| View | Control (default in bold) | Fixed rule, stated in the caption |
| --- | --- | --- |
| Heavy rotation | 1 / **3** / 6 months | at least 3 plays in the window |
| Forgotten gems | 6 months / **1 year** / 2 years | at least 10 lifetime plays and last play before the cutoff |
| All-time classics | **Most years** / Most plays | a year counts at 3+ plays; a track needs 3+ such years |
| By year | latest year / **All** | none |
| Finish rate | **Finished** / Skipped | finished + skipped at least 10 |

Windows are calendar months summed from the month buckets, including the
current month. Forgotten gems compares `lastTs` with a to-the-day cutoff.
Selections are module-level signals (survive tab switches, reset on
reload). Lists render 100 rows at a time.

## 5. Data

### `PlayRow` gains four optional fields

```ts
months?: Record<string, number>; // 'YYYY-MM' -> credited plays
attempts?: number;               // every track record, including under 30 s
finished?: number;               // reason_end === 'trackdone'
skipped?: number;                // rule below
```

Optional so rows from older imports still type-check; the Crate is gated
on the summary version, not on these fields.

### Aggregation (`PlayAggregator`)

For every record with a `spotify:track:` URI (classes `credited` and
`short`), evaluated in this order:

1. `reason_end === 'trackdone'` → `finished += 1`
2. else `skipped === true` or `reason_end` in `fwdbtn`, `backbtn`,
   `endplay`, `unknown` → `skipped += 1`
3. else neutral (logout, remote, trackerror, unexpected-exit,
   unexpected-exit-while-paused, switched-to-audio, empty, and the pre-2017
   values appload, clickrow, clickside, playbtn, popup, uriopen).

`attempts += 1` in every case, so `finished + skipped <= attempts`. A track
that only ever has short records gets a row with `plays: 0`. `months`,
`plays`, `msPlayed`, `firstTs`, `lastTs` change only on credited records, so
`sum(months) === plays`. Month keys use the worker's local zone
(`new Date(ts).getFullYear()`, `getMonth()`); the zone name
(`Intl.DateTimeFormat().resolvedOptions().timeZone`) is reported with the
result.

Consequences handled explicitly:

- `playsFor()` returns `null` when the matched row has `plays === 0`, on the
  id path and the name path, so the existing screens never show "0 plays".
- `ImportSummary.tracks` counts rows with `plays > 0`.

### Import result and summary

The worker's `done` message gains `zone: string` and
`outcomes: { attempts, finished, skipped }`. `ImportSummary` gains
`version: 2`, `zone`, `outcomes`. `historySummary.version === 2` enables the
Crate; a summary without `version` shows the re-import state; no summary
shows the empty state.

No `DB_VERSION` bump: records are schemaless, `replacePlays` already clears
the store, and the current `upgrade` would throw on a bump. Old rows keep
feeding the existing play badges until the re-import.

### Model additions (`src/model/aggregate.ts`)

- `playlistsOfNameKey: Map<string, Set<string>>` built from synced tracks
  (`nameKey(artists[0].name, name)`), consulted after `playlistsOfTrack` so a
  relinked id does not show a false amber badge.
- `crateReady: boolean` is not part of the model; the screens read
  `historySummary`.

### Crate computations (`src/model/crate.ts`, pure)

All are one pass over `PlayRow[]` in memory. Signatures:

```ts
export const ROTATION_WINDOWS = [1, 3, 6] as const;   // months
export const GEM_WINDOWS = [6, 12, 24] as const;      // months
export const MIN_GEM_PLAYS = 10;
export const MIN_ROTATION_PLAYS = 3;
export const CLASSIC_MIN_PLAYS_PER_YEAR = 3;
export const CLASSIC_MIN_YEARS = 3;
export const FINISH_MIN_OUTCOMES = 10;
export const PAGE_SIZE = 100;

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';
export type YearPeriod = 'all' | Season | number; // 1..12

export function monthKey(d: Date): string;                       // 'YYYY-MM'
export function lastMonths(now: Date, count: number): string[];  // oldest first, includes now's month
export function periodMonths(year: number, period: YearPeriod): string[];
export function yearsWithPlays(rows: PlayRow[]): number[];       // ascending
export function hasMonthData(row: PlayRow): row is PlayRow & { months: Record<string, number> };

export interface RotationItem { row: PlayRow; windowPlays: number; isNew: boolean }
export function heavyRotation(rows: PlayRow[], now: Date, months: number): RotationItem[];

export interface GemItem { row: PlayRow; lastPlayed: Date }
export function forgottenGems(rows: PlayRow[], now: Date, months: number): GemItem[];

export interface ClassicItem { row: PlayRow; yearsActive: number; perYear: Map<number, number> }
export function classics(rows: PlayRow[], sortBy: 'years' | 'plays'): ClassicItem[];

export interface YearItem { row: PlayRow; selectionPlays: number; yearPlays: number }
export interface YearResult { items: YearItem[]; plays: number; tracks: number }
export function byYear(rows: PlayRow[], year: number, period: YearPeriod): YearResult;

export interface FinishItem { row: PlayRow; rate: number; outcomes: number; unclear: number }
export function finishRate(rows: PlayRow[], tab: 'finished' | 'skipped'): FinishItem[];
```

Rows without `months` are ignored by every function.

## 6. Components and styling

- `Segmented` gains `scroll?: boolean`: chips that do not shrink and scroll
  horizontally (`.segmented.scroll`). A scrolling row centres its selected
  chip on mount and on every change, and fades its right edge while chips
  remain to the right of the viewport (`.segmented.scroll.faded`). Rows
  without `scroll` are untouched.
- `Badge` gains kinds `'todo'` (amber, the banner palette) and `'skip'` (red).
- `Empty` is unchanged: Crate empty states are inline blocks with their own
  copy and links (an earlier draft added `href`/`cta` props; they were removed
  as unused).
- CSS: `.segmented.scroll`, `.segmented.scroll.faded` (a right-edge mask),
  `.badge.todo`, `.badge.skip`, `.strip` (small, muted, tabular numerals) with
  `.strip span { white-space: nowrap }`, `.hub-row`, `.provenance`,
  `.caption`, `.legend`, `.footer-note`, and
  `.sublist li { min-height: 44px }`.

## 7. Tests

Pure logic only, as before:

- `records.test.ts`: outcome classification order (trackdone beats
  skipped flag), the four skip values, neutral values, short-only row with
  `plays: 0`, `sum(months) === plays`, months bucket a mid-month timestamp.
- `crate.test.ts`: `lastMonths` across a year boundary, `periodMonths` for
  Winter crossing the year, each view's threshold, sort order and tie-break,
  `isNew`, `yearsWithPlays`, rows without months ignored, finish rate bands.
- `aggregate.test.ts`: `playsFor` returns null for `plays: 0`;
  `playlistsOfNameKey`.
- `router.test.ts`: the crate routes, period segment, unknown view → hub.
- `process.test.ts` / `importer.test.ts`: `zone` and `outcomes` in the done
  message and the summary; `version: 2`; `tracks` counts `plays > 0`.
- `labels.test.ts`: the stale month and the year span read in a pinned
  non-UTC zone (`Pacific/Kiritimati`), the fresh case, the no-range and
  unreadable-timestamp cases, `windowLabel`.

## 8. Deviations noted for the record

Rulings made during execution: the Skipped tab ties on outcomes, not plays
(§3 amended); `yearPlays` includes the previous December under Winter (§3
amended); `ImportSummary.version` is optional so old summaries type-check;
`playsFor` falls through a zero-play id row to the name path; `gemCutoff`
and `rateBand` are exported beyond §5's list; lists page at 100 rows on
Classics and Finish too; the Winter month strip includes the previous
December (§3 amended); `Empty` keeps only its original props, the `href`/`cta` additions were dropped (§6 amended); the
Heavy-rotation `Open <month>` link names the window month with the most
plays.

Rulings made while fixing the UX audit (2026-09-05): the hub's stale month and
year span are read with `new Date(...)` in the device zone, not by slicing the
UTC string, and both live in the new pure module `src/ui/crate/labels.ts`
together with `STALE_MS`, which `shared.tsx` no longer exports (§3, §7
amended); the hub's empty top line names the window on the two window-shaped
rows only — Forgotten gems, All-time classics and Finish rate are scoped by a
threshold, not a window, so an empty one is a fact about the library (§3
amended); the Crate strips wrap each pair in a nowrap span that carries its own
trailing " ·", so a line ends with the separator rather than starting with it,
and `Strip` in `shared.tsx` is the one producer of that markup (§6 amended);
the right-edge fade on a scrolling `Segmented` is a mask on the scroller
itself, painted only while chips remain to its right (§6 amended).

The research recommended a `DB_VERSION` bump; the design keeps version 1
(reasons in §5). The research suggested optional per-year storage; years
are folded from months at read time.
