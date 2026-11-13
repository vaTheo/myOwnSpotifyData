# Research: spec 030

Sources: two read-only studies of every page (2026-11-13), then the files named below.

## R1. Where the switch lives

- **Decision**: one component drawn by `src/ui/crate/CrateView.tsx` above the open view, only when the gate passes.
- **Rationale**: `CrateView.tsx` is already the one dispatcher for the six views (one route `crateView`). The views are detail screens: `titles.ts:36-40` gives each its title and an up arrow to the hub, and `ScreenTabs.tsx:35` draws no tabs on a detail. Keeping the hub keeps all of that, so the switch adds one row and moves nothing.
- **Alternatives**: making the view screen a tab root (loses the per-view title and the up arrow, breaks spec 003 FR-004); one component holding the six views as presets (rewrites the six files against FR-005).

## R2. The switch is navigation, not state

- **Decision**: links to the six existing addresses.
- **Rationale**: each view stays bookmarkable (FR-002a of spec 003), Back works, `lastRouteInTab` keeps reopening the last view, and a view change remounts By year so an address period is applied (`ByYear.tsx:120-122`). `ScreenTabs` is the precedent for links drawn as tabs.
- **Alternatives**: a signal holding the open view (breaks addresses and Back); `SegmentedButtons` (buttons with `role="tab"`, no address).

## R3. The phone form (Q1 B)

- **Decision**: a native `<select>` whose change sets the address.
- **Rationale**: one row of height, the system picker on Android, keyboard and screen reader support without code. Rarely played already uses a native select (`Rarely.tsx:107`). On a view the phone shows: top bar, picker, the view's control, the list; By year: top bar, picker, years, periods, the list.
- **Medium too**: the visual loop found that six names do not fit in a medium window's row (cut at 768 px), so the picker is drawn on compact and medium, the row from expanded (840 px) up. On medium the picker keeps its own width.
- **Alternatives**: a scrolling chip row (owner declined, Q1 A); a custom menu (more code, focus and escape handling to write).

## R4. Sort, filter and settings per view

- **Decision**: unchanged.
- **Rationale**: each view file owns `sort` and `filter` signals at module level and the settings live in `selections.ts`; all survive a remount. The hub cards (`CrateHub.tsx:118`) and the Overview read the same settings.

## R5. Top caption

- **Decision**: one `<p class="caption">` under Top's toolbar; the plays sentence only when plays are shown.
- **Rationale**: the Crate views already explain themselves with a caption; Top gates on `m.topItems.size === 0` (`Top.tsx:141`) and reads Spotify's ranking, which nothing on screen says.

## R6. One Artists filter

- **Decision**: one `artistFilter` in `artistSelections.ts`.
- **Rationale**: two signals feed one box: `filter` (`Artists.tsx:33`) and `radarFilter` (`artistSelections.ts:15`); `ArtistPane` picks between them (`Artists.tsx:213`).

## R7. Activity links

- **Decision**: `routeHref({ name: 'settings', item })` per job.
- **Rationale**: `#/settings/<item>` exists since spec 026 (`sections.ts:38`), and five jobs link to bare `#/settings` (`jobs.ts:48,65,88,…`). An item with a running job is already open (spec 026 FR-005), so the gain is landing on it.

## R8. What a merge must not break (checked)

- In-app links into views: `details/parts.tsx:33` (Open month), `overview/blocks.ts:220,258`, hub cards.
- `search/choose.ts:44-49` `OWN_SHEET` lists `crateView`: unchanged because the route is unchanged.
- No header sort on compact (`DataTable.tsx:496`): the per-view order controls stay.
