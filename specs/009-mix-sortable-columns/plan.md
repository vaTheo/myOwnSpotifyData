# Implementation Plan: Mix tracklist sortable columns

**Branch**: `worktree-sortable-table` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/009-mix-sortable-columns/spec.md`

## Summary

The Mix tracklist already sits on the shared `DataTable`, which sorts any column that has a `sortValue` (stable, missing values last in
both directions, header arrow, phone "Sorted by" strip). The Mix table switched that off (`NO_SORT`) and orders rows with its own Sort
select (`RowSort`: time, clips, score, year) inside `tracklistView`. The plan makes the table's own `SortState` the single source of
truth: every comparable column gets a `sortValue` and a first direction, the Sort select is rebuilt from those columns (so phones, which
draw no header buttons, pick the same choices and a direction), `RowSort` and the sort branches of `viewRows` are removed, and the chip
and decade filters stay in `tracklistView`. Confidence sorts highest first on the first click.

## Technical Context

**Language/Version**: TypeScript ~6.0.3, Preact + `@preact/signals`

**Primary Dependencies**: none new

**Storage**: none; the sort is component state, not saved with the mix (FR-011)

**Testing**: Vitest, pure functions only, tests next to source (no DOM tests)

**Target Platform**: browser on a computer, Android phone

**Project Type**: single-page web app

**Performance Goals**: a 300-row tracklist re-sorts without a visible pause (sort is O(n log n) on one render)

**Constraints**: tokens only for styling; no Spotify read; row actions keep acting on `l.index`

**Scale/Scope**: one screen (`src/ui/mix/TracklistTable.tsx`), one new pure module, two small removals

## Constitution Check

| Principle | Verdict |
|---|---|
| I Browser-first, no secret | Pass: UI only |
| II No Spotify reads on load | Pass: sorting reads no source |
| III Library writes on a tap | Pass: no write touched |
| IV External sources keyless | Pass: none touched |
| V IndexedDB only adds | Pass: no schema change, sort not stored |
| VI Play counts from export | Pass: not touched |
| VII Every failure shown; missing number never zero | Pass: missing confidence sorts last and prints as no data (FR-004) |

Post-design re-check: same, no violation, Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/009-mix-sortable-columns/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── sort-choices.md
└── tasks.md             # /speckit-tasks, not created here
```

### Source Code (repository root)

```text
src/
├── features/mix/
│   ├── worker.ts            # drop RowSort and the clips/score/year branches of viewRows (filters stay)
│   └── worker.test.ts       # viewRows tests keep heardOnce and decade cases
└── ui/mix/
    ├── tracklistSort.ts     # NEW: sort value per column id, first direction, the select's choices
    ├── tracklistSort.test.ts# NEW
    ├── tracklistView.ts     # sort removed from the view; chip, decade, editing row stay
    ├── tracklistView.test.ts
    └── TracklistTable.tsx   # SortState in the screen, Sort select rebuilt, Clips column, sortValue on columns
```

**Structure Decision**: sort rules live in one pure module next to `rowText.ts` so each is pinned by a test; `DataTable` is not
changed (it already sorts, flips, announces and shows the phone strip).

## Design

1. **State**: `useState<SortState>({ columnId: null, direction: 'asc' })` in `TracklistTable`, passed to `DataTable` as `sort` /
   `onSort`. `columnId: null` is the set's own order. Changing it clears `saveError` like the chip does. `NO_SORT` is deleted.
2. **Columns** (`tracklistSort.ts` owns the values; `columns()` only references them):

   | Column id | Sort value | First click | Missing last |
   |---|---|---|---|
   | time | `startSec` | asc | gap with no time |
   | title | artist – title text | asc | gap |
   | label | `label` | asc | empty |
   | source | source label | asc | gap |
   | confidence | `confidence` when source is Tracklistify | **desc** | other sources, gaps |
   | clips (new, only when a row has clip counts) | `hits` | desc | candidates, gaps |
   | library | matched in library = 1, else 0 | desc | gap |
   | released | `rowYear` (existing `yearColumn`) | asc | undated, gaps |
   | spotify | not found 0, unchecked 1, found 2 | asc (problems first) | gap |
   | review | validated 1, to review 0 | asc (to review first) | gap |
   | listen, more | not sortable | | |

3. **Sort select** (all widths, replaces the old `RowSort` select, shown whenever the table has rows): "Set order" plus one option per
   sortable column that applies (Clips and Confidence only when some row has the value), and a direction button beside it. It reads and
   writes the same `SortState`, so header and select cannot disagree (FR-008). On a phone the existing `dt-sorted` strip shows the
   current sort with its clear button.
4. **Fallback**: a sort whose column no longer applies (the last Confidence row deleted) falls back to the set's order, as the old
   Sort did; computed in `tracklistSort.ts`, never empties the list.
5. **Editing row**: it stays in the list whatever the filter (existing rule). A new row has no values, so it sorts last and
   `revealKey` scrolls to it.
6. **Paging reset**: `resetKey` now includes the sort column and direction (DataTable already resets on those).

## Complexity Tracking

None.
