# Implementation Plan: Mark the last row touched in the Mix tracklist

**Branch**: `worktree-sortable-table` | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md) · **Colour work**: [colour-analysis.md](colour-analysis.md)

**Input**: Feature specification from `/specs/013-mix-row-last-clicked/spec.md`

## Summary

`DataTable` already draws a selected row (`class="… selected"`, `aria-selected`, `primary-container` + `on-primary-container`) for
list–detail tables, driven by `selectedKey` and `onOpen`. The Mix table passes neither. The plan adds a second, plainer pair of props,
`markedKey` and `onMark(row)`: the table calls `onMark` from a **capture-phase click handler on every row**, so a click on a link,
icon button or menu button marks the row first and then does its own action (new tab, Spotify app, menu), which is what lets the owner
come back and see where they were. The row's selected styling is reused, with four CSS corrections from the colour analysis: selected
beats hover, hover over a selected row is a layer over the selected fill, a 4 px chartreuse edge bar as the second cue, a glowing chartreuse top and bottom line (2 px `primary` line plus a soft `primary` halo, as shadows with the row lifted above its neighbours; see colour-analysis §5b), and the Edit/Link
form row keeps its neutral fill (outline contrast) and shows the bar only. `TracklistTable` keeps the mark as view state (row index
under the same keys it already uses), cleared on delete and on opening another mix.

## Technical Context

**Language/Version**: TypeScript ~6.0.3, Preact + `@preact/signals`

**Primary Dependencies**: none new

**Storage**: none (view state only; never saved, synced or exported)

**Testing**: Vitest, pure functions only (the pair table in `contrast.test.ts`, a small pure `nextMark` rule); Playwright regression row for the clicks, `aria-selected` and hover; no DOM unit tests

**Target Platform**: browser on a computer, Android phone

**Project Type**: single-page web app

**Performance Goals**: none; a click sets one state value

**Constraints**: tokens only; no behaviour change for tables that do not pass the new props; controls keep their own actions (the capture handler never stops propagation or default)

**Scale/Scope**: `src/ui/table/DataTable.tsx`, `src/styles.css`, `src/ui/mix/TracklistTable.tsx`, `src/ui/theme/contrast.test.ts`, regression, docs

## Constitution Check

| Principle | Verdict |
|---|---|
| I Browser-first, no secret | Pass: UI only |
| II No Spotify reads on load | Pass: none |
| III Library writes on a tap | Pass: none |
| IV External sources keyless | Pass: none |
| V IndexedDB only adds | Pass: nothing stored |
| VI Play counts from export | Pass |
| VII Every failure shown | Pass: nothing can fail |

Design guide: tokens only (no new colour), contrast pairs added to `contrast.test.ts` (design guide rule), 48 px targets unchanged.
Post-design re-check: same. Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/013-mix-row-last-clicked/
├── plan.md
├── colour-analysis.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── row-mark.md
└── tasks.md             # /speckit-tasks, not created here
```

### Source Code

```text
src/
├── ui/
│   ├── table/DataTable.tsx          # props markedKey?, onMark?; onClickCapture on each row; class selected + aria-selected from markedKey
│   ├── mix/
│   │   ├── rowMark.ts               # NEW: pure markAfterEvent rules (delete, new mix, add)
│   │   ├── rowMark.test.ts          # NEW
│   │   └── TracklistTable.tsx       # marked state, pass markedKey/onMark, clear on delete and mix change, mark an added row
│   └── theme/contrast.test.ts       # the section-2 pairs on primary-container
└── styles.css                       # selected beats hover; hover layer over selected; edge bar and glowing lines (row lifted above its neighbours, no z-index so no stacking context); form row neutral + bar; forced-colors outline
tools/shots/regression.spec.ts       # row M04
```

**Structure Decision**: the rule is in `DataTable` (one place for every row layout: table row, phone item, form row) behind two optional props, so no other table changes behaviour except for the hover fix.

## Complexity Tracking

None.
