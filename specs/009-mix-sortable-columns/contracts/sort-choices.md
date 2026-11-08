# Contract: Mix tracklist sort choices

The UI contract between the screen, the Sort select and the table headers.

## Headers (width above phone)

- Every sortable column's header is a button; Listen and More are not.
- First click: the column's first direction (confidence, clips, library: highest or matched first; the others ascending).
- Second click: flips. The header shows an arrow icon for the current column only and `aria-sort` says the direction.
- The change is announced: "Sorted by Confidence, descending".

## Sort select (all widths)

- Label "Sort". First option "Set order" (no sort). Then one option per sortable column that applies, in column order.
- A direction button beside it, labelled with the current direction; disabled on "Set order".
- Choosing a column sets that column's first direction; the button flips it.
- A header click and the select always show the same choice.

## Phone

- No header buttons. The select and the existing "Sorted by X, ascending" strip with its clear button (back to Set order).

## Rules every choice keeps

- Rows without a value are last in both directions and print as no data, never zero.
- Ties keep the set's order.
- The row count and rows are unchanged; chip and decade filters still apply; the editing row stays visible.
- Not saved with the mix, no Spotify read.
