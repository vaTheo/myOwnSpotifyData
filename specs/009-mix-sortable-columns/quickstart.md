# Quickstart: validate Mix sortable columns

## Prerequisites

Node 24, `yarn`, then `yarn dev` and open `http://127.0.0.1:5173/myOwnSpotifyData/?demo` (the demo data, never the owner's;
never `localhost`).

## Logic

```sh
yarn typecheck && yarn lint && yarn test
yarn test src/ui/mix/tracklistSort.test.ts
```

Judge by exit code. The new test covers each column's value and first direction, nulls last both ways, ties in set order, and the
fallback when a column no longer applies.

## By hand on the demo

1. Open Mix, then a mix with confidences. Click **Confidence**: highest first, arrow down. Click again: lowest first, arrow up.
   Rows with no confidence (other sources, gaps) stay at the bottom both times and show no number. (US1)
2. Click each other sortable header and its second click: order reverses, ties keep set order. (US2)
3. Pick **Set order** in the Sort select: the arrow goes and the rows return to the set's order. (FR-006)
4. Pick **Confidence** in the select: the header arrow follows. Click the header: the select follows. (FR-008)
5. Turn on a chip (To review) and a decade: the sort applies inside them, nothing is deleted, the caption still shows. (FR-009)
6. Sort by Confidence, then Edit, Delete and ✓ a row: each acts on the row clicked. (FR-010)
7. Add track while sorted: the new row is last, scrolled into view and open for editing. (Edge case)
8. Width 390: no header buttons; the select offers the same choices and the "Sorted by" strip clears it. (US3)

## Visual loop

```sh
yarn shots   # 0 findings on the Mix pages at the four widths
yarn regression
```

Add or update the Mix row of `specs/003-web-first-redesign/regression.md` for the header sort.
