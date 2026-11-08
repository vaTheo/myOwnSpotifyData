---

description: "Task list for marking the last row touched in the Mix tracklist"
---

# Tasks: Mark the last row touched in the Mix tracklist

**Input**: Design documents from `/specs/013-mix-row-last-clicked/`

**Prerequisites**: plan.md, spec.md, colour-analysis.md, research.md, data-model.md, contracts/row-mark.md, quickstart.md

**Tests**: Vitest, pure functions only, tests next to source (no DOM tests); one Playwright regression row. Do not run `yarn shots` unless the owner asks.

**Format**: `- [ ] T### [P?] [US?] Description with file path` · `[P]` = different files, no dependency on an unfinished task.

## Phase 1: Foundational (blocks the stories)

- [x] T001 [P] Create `src/ui/mix/rowMark.ts` and `rowMark.test.ts`: pure `markAfter(marked: number | null, event)` where event is `{type:'click', index}` (sets index; same index stays), `{type:'delete', index}` (any mark clears), `{type:'add', index}` (marks the new row), `{type:'open-mix'}` (clears); tests for each row of contracts/row-mark.md, including "clicking the marked row again keeps it" and "delete clears even when another row was marked"
- [x] T002 [P] Add the colour pairs of colour-analysis.md §2 to `src/ui/theme/contrast.test.ts` on `--md-sys-color-primary-container`: `on-surface` 4.5, `on-surface-variant` 4.5, `error` 3 (mark) , `app-color-warning` 4.5, `secondary` 4.5; and `primary` against `primary-container` 3 (found mark, edge bar and glow line); do not assert `outline` on it (note why in a comment)
- [x] T003 In `src/ui/table/DataTable.tsx` add optional props `markedKey?: string | null` and `onMark?: (row: Row) => void`; put `onClickCapture` on every row element (table row, compact item, full/form row) that calls `p.onMark?.(row)` without stopping propagation or default; when `markedKey !== undefined` set `aria-selected` (`markedKey === key`) and the `selected` class on a marked row; leave `selectedKey`/`onOpen` behaviour untouched for other tables; update `DataTable`'s doc comment

## Phase 2: User Story 1 - See the last row I touched (P1) 🎯 MVP

**Goal**: any click on a row marks it, links and buttons included, so returning from a new tab shows the row.

**Independent Test**: quickstart step 2 first two bullets.

- [x] T004 [US1] In `src/ui/mix/TracklistTable.tsx` add `const [marked, setMarked] = useState<number | null>(null)`; pass `markedKey` (the `rowKey` of the marked index, or `null`) and `onMark={(l) => setMarked((m) => markAfter(m, {type:'click', index: l.index}))}` to `DataTable`; keep `keyOf` working so a row in edit/link form is still found by its `l.index`
- [x] T005 [US1] In `src/ui/mix/TracklistTable.tsx` apply the other transitions: after `deleteMixRow(i)` (line ~695) `markAfter(m, {type:'delete', index:i})`; after `addMixRow()` (line ~786) mark the new last index (`rows.length` before the add); clear on opening another mix (a `useEffect` on the open mix key, or the screen's existing mix identity) via `{type:'open-mix'}`
- [x] T006 [US1] Selected styling base in `src/styles.css`: keep `.dt-row/.dt-item[aria-selected='true']` fill (`primary-container`) and text (`on-primary-container`); make the selected rule win over `.dt-body .dt-row:hover` (raise specificity or order) and add a hover rule for selected rows laying `on-primary-container` at `var(--md-sys-state-hover)` over the selected fill; confirm status marks keep their own tokens (`.mix-spotify.notFound`, `.mix-spotify-text.notFound`, warning flags are not forced to the row colour)

**Checkpoint**: typecheck, lint, test green; the mark works on a computer.

## Phase 3: User Story 2 - The marked row stays readable and glows (P1)

**Goal**: contrast targets met, second cues, glowing lines.

**Independent Test**: quickstart bullets 3–4; the contrast tests.

- [ ] T007 [US2] In `src/styles.css` add the second cues to marked rows (`.dt-row.selected`, `.dt-item.selected`, `.dt-full.selected`, plus `[aria-selected='true']` forms): a 4 px `primary` left edge bar and 2 px `primary` top and bottom lines as inset box-shadows, a soft halo `0 0 8px` of `color-mix(in srgb, var(--md-sys-color-primary) 60%, transparent)` outside the lines, `position: relative; z-index: 1` on the marked row so the glow paints over its neighbours; tokens only, no layout shift (row heights unchanged); the focus ring stays drawn above the bar (focus ring uses `outline`, the bar is a shadow)
- [ ] T008 [US2] In `src/styles.css` make the Edit/Link form row (`.dt-full`) keep the neutral surface when marked (no `primary-container` fill; outline contrast is 2.94 on it) but show the bar, lines and halo; add `@media (forced-colors: active)` giving a marked row `outline: 2px solid Highlight` (shadows are dropped there)
- [ ] T009 [US2] Check every layout reads right by reading the rules against colour-analysis.md §2–§6: phone `.dt-item` (text lines, "Not found on Spotify" button on the fill), gap rows (`.mix-gap` inside a marked row), `.mix-rowview` controls (select, segmented) on the selected fill; fix any pair that misses its target by using the neutral surface for that control, and record what was checked in a one-line comment above the new rules

## Phase 4: User Story 3 - The mark follows the row on every layout (P2)

**Goal**: sort, filter, resize and forms keep the mark on the same track.

**Independent Test**: quickstart bullets 5–6.

- [ ] T010 [US3] Verify in `src/ui/mix/TracklistTable.tsx` that sort, filter and decade changes keep `l.index` as the row key so the mark follows the track and a filter that hides it leaves no row marked; add a `rowMark.test.ts` case documenting that the mark is an index into `mixRows`, not a view position; check that opening Edit or Link on the marked row keeps `marked` (the form row key `${index}-edit`/`-link` must still resolve to the marked index through `markedKey`)

## Phase 5: Polish and docs

- [ ] T011 Regression row M04 in `tools/shots/regression.spec.ts` and `specs/003-web-first-redesign/regression.md`: click a title, then the Spotify icon of another row (it still opens the app link) → the second row has `aria-selected="true"`, the first not; click a Shazam icon (new tab) and return → still marked; hover keeps the selected background (computed style); Edit on it shows the form row with `aria-selected`; Delete clears; run `yarn regression` (A05 is a known stale failure; stop and report if port 5173 is held)
- [ ] T012 Docs round: `docs/dev-guide/100-design-guide.md` (the selected-row look: fill, bar, glowing lines, hover rule), `specs/003-web-first-redesign/contracts/design-tokens.md` (selected row row and the new contrast pairs), `docs/architecture/000-how-it-works.md` (§13 DataTable `markedKey`/`onMark`, §10 `rowMark.ts`), `docs/architecture/100-features.md` (new F29 row; confirm F28 is the last), `docs/architecture/800-limits-roadmap.md` (a worker merge can move the mark; the glow may be clipped at the scroll container's side edges), `README.md` (owner's manual: the last clicked row is highlighted), `CHANGELOG.md` (2026-11-08 entry, hover fix for list–detail rows noted), `docs/README.md` (specs map lists 013); no ADR
- [ ] T013 Run `yarn typecheck`, `yarn lint`, `yarn test` (exit codes) and walk quickstart step 2 on `?demo`

## Dependencies

- T001, T002, T003 first (T003 before T004; T001 before T004/T005).
- US1: T004, T005 then T006. US2: T007 after T006; T008 after T007; T009 after T008. US3: T010 after T005.
- Polish after all stories.

## Parallel example

T001 and T002 touch different files and can run together; T003 alongside them.

## Implementation strategy

MVP = Phases 1–2 (mark works, plain selected look). Then US2 (glow, cues, forms), then US3 checks. Commit per phase, each green; push only with the owner's OK.
