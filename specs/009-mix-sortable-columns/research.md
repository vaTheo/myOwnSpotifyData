# Research: Mix tracklist sortable columns

No `NEEDS CLARIFICATION` remained; these are the decisions the code reading settled.

## 1. Who sorts: `DataTable` or the screen

- **Decision**: `DataTable` sorts, through each column's `sortValue`.
- **Rationale**: it already does it for every other table: stable, missing values last in both directions, case and accent
  insensitive text, header arrow, `aria-sort`, a screen-reader announcement, and a "Sorted by X, ascending" strip with a clear button
  on phones (`src/ui/table/DataTable.tsx`, `sort.ts`). The tests in `sort.test.ts` already pin the rules FR-004 and FR-005 ask for.
- **Alternatives**: `presorted` mode (the screen sorts and the table only reports the click). Rejected: that mode does not flip the
  direction on a second click, so the screen would re-implement what the table has.

## 2. What happens to the Sort select and `RowSort`

- **Decision**: keep a select (phones draw no header buttons) but build it from the sortable columns and drive the same `SortState`;
  delete `RowSort` and the clips, score and year branches of `viewRows`.
- **Rationale**: two sort states would show two orders at once (FR-008). "Best score" is `confidence` already (`viewRows` keys on
  `r.confidence`), "Year, oldest first" is the Released column, "Clips heard" is `hits`.
- **Alternatives**: keep `RowSort` and add Confidence to it, header sort on top. Rejected: two sources of truth.

## 3. Confidence direction on first click

- **Decision**: highest first (`firstDirection: 'desc'`), like the old Best score.
- **Rationale**: one click matches the old behaviour. The owner wanting the weakest first clicks again, or uses the direction button.
- **Alternatives**: lowest first. Rejected: it would reverse what Best score did and the doubtful rows are one flip away either way.

## 4. Clips column

- **Decision**: add a narrow Clips column, shown only when a row has clip counts, so "Clips heard" stays a sort and is visible.
- **Rationale**: the table sorts by columns only; a hidden sort key would need a special case. The count is already on the row (`hits`).
- **Alternatives**: drop the Clips sort. Rejected: removes a round 004 feature.

## 5. Review, Spotify and library values

- **Decision**: Review sorts to review first, Spotify sorts not found, unchecked, found, library sorts matched first on its first click.
- **Rationale**: the owner manages the table to find what needs attention; the first click should bring those rows up.
- **Alternatives**: alphabetical on status text. Rejected: not useful for review work.

## 6. Time versus the set's order

- **Decision**: the Time column sorts by start second like the rest (so it can be reversed); the way back to the set's order is the
  select's "Set order" and the phone strip's clear button.
- **Rationale**: the set's order is the one the row was identified in and can differ from time for edited rows; FR-006 asks for one
  action back.
- **Alternatives**: make Time the rank column. Rejected: Time could never sort descending.
