# Research: Mark the last row touched in the Mix tracklist

## When to mark: capture-phase click on the row

- **Decision**: `onClickCapture` on the row element. It runs before the target's own handler and before a link's default (new tab, `spotify:` app link) and never stops either.
- **Rationale**: the owner clicks a link, another tab or the Spotify app takes over, and on return the row is already marked. The existing `onRowClick` ignores `a, button` (`DataTable.tsx` ~line 316) on purpose for opening a detail pane; marking is a separate path. Keyboard Enter/Space on a button fires `click`, so it is covered.
- **Alternatives**: `pointerdown` (also fires for scroll drags on a phone, marks rows that were only swiped); bubbling `click` (a control that stops propagation would skip it; menu items in a popup outside the row are not inside the row anyway, the menu's own button already marked it).

## Which colour

- Decision and numbers: [colour-analysis.md](colour-analysis.md): `primary-container` fill, existing `on-primary-container` text, 4 px `primary` edge bar, `aria-selected`.

## Where the mark lives

- **Decision**: `useState<number | null>` in `TracklistTable` keyed on the row's `index` in `mixRows` (the key the table already uses via `keyOf`), plus a pure `rowMark.ts` for the transitions (delete clears; a row added becomes marked; another mix clears).
- **Rationale**: view state only (FR-010). Sorting and filtering keep `l.index`, so the mark follows the track. Edits keep the index. A delete shifts later indexes, so it clears rather than guessing.
- **Known limit**: a worker result merged into an open mix can reorder rows and move the mark to the track now at that index. Rare, not worth an id on every row; stated in Limits.
- **Alternatives**: a stable id on each row (schema change, sync validation); mark by artist+title (an edit changes it).

## Hover and selected

- **Decision**: raise the selected rule above `.dt-body .dt-row:hover`, and add a hover rule for selected rows that lays `on-primary-container` at the hover opacity over the selected fill.
- **Note**: this also fixes list–detail rows, where a hovered selected row currently falls back to the hover grey.

## Edit and Link forms

- **Decision**: the `.dt-full` form row keeps the neutral surface and shows the bar plus `aria-selected` (outline on the selected fill is 2.94:1, under 3).
