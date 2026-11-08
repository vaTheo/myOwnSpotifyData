# Colour analysis: the marked row

Ratios are WCAG 2.x, computed with the project's formula (`src/ui/theme/contrast.ts`) from `src/ui/theme/tokens.css`. Targets: 4.5:1 text, 3:1 icons, status marks and control outlines (design guide, `contrast.test.ts`).

## 1. Candidate backgrounds

| Background | Value | Vs the row today (`surface-container` #1a2214) | Verdict |
|---|---|---|---|
| Row today | #1a2214 | n/a | — |
| Hover (`on-surface` 8%) | #2a3223 | 1.3 | the hover layer |
| **`primary-container`** (the app's selected role) | **#245100** | **1.76** | **chosen** |
| `primary` 12% over surface | #263d12 | 1.4 | too faint to find a row |
| `primary` 16% over surface | #2a4511 | 1.53 | too faint, and a new token |
| `primary` 100% (#7fff00) | #7fff00 | 12.6 | rejected: chartreuse text and icons on it are 1:1 |

`primary-container` already means "selected row" for list–detail tables (`.dt-row[aria-selected='true']`), so the app keeps one selected look and no new token is needed. Its fill difference from the row is only 1.76:1, so the fill alone is not enough to spot a row from a distance: hence the second cue (section 5).

## 2. Every colour inside a Mix row, on `primary-container` #245100

| Colour in the row | Token | Used for | Ratio on #245100 | Target | Result |
|---|---|---|---|---|---|
| Body text | `on-surface` #dde6d0 | title, label, time | 7.24 | 4.5 | pass |
| Selected text role | `on-primary-container` #7fff00 | what `.dt-row[aria-selected]` sets today | 7.20 | 4.5 | pass |
| Muted text | `on-surface-variant` #bdcbae | confidence, second lines, meta | 5.47 | 4.5 | pass |
| Found mark and icons | `primary` #7fff00 | Spotify play icon, found text | 7.20 | 3 | pass |
| Not-found mark and text | `error` #ffb4ab | red mark, and the phone "Not found on Spotify" text button | 5.49 | 4.5 (it is text) | pass |
| Warning | `app-color-warning` #ffb95c | not-heard flags | 5.48 | 4.5 | pass |
| Secondary | `secondary` #8eda58 | secondary text | 5.47 | 4.5 | pass |
| Row separator | `outline-variant` #3e4a34 | decorative line | n/a | none (decorative) | ok |
| Control outline | `outline` #88957b | text fields, selects in the Edit/Link form | **2.94** | 3 | **fails by 0.06** |

On bright rows today: on-surface 12.71, muted 9.60, found 12.63, error 9.64 — every pair gets about 40% less margin on the marked row but stays above target. Only the control outline fails.

## 3. Findings that change the build

1. **Outline on the selected fill is 2.94:1** (needs 3). Fields and selects drawn inside a marked row (the Edit and Link forms) would be just under target. Fix: the form row does not take the selected fill; it keeps the neutral surface and shows the mark by its edge bar only (section 6).
2. **Hover currently beats selected.** `.dt-body .dt-row:hover` (specificity 0,3,0) is declared above and outranks `.dt-row[aria-selected='true']` (0,2,0), so a hovered selected row falls back to the hover grey. The selected rule must win (raise its specificity or order it after) and hover over a selected row must be a layer over the selected fill (`on-primary-container` at the hover opacity), never a replacement.
3. **Clicks on links and buttons are ignored by the table's row click** (`onRowClick` returns early for `a, button`). Most Mix interactions are icon buttons and links, so marking must listen to the row regardless of what was clicked (capture on the row, without cancelling the control's own action).
4. **Selected text role turns the whole row chartreuse** (`color: on-primary-container`). Text and links become one colour: a link is no longer told from text by colour. In the Mix row links are 48 px icon buttons with their own shape, so meaning survives; the plain "On Spotify" phone label is not a link. No change needed, but keep status marks (red, warning) on their own tokens, never forced to the row colour.
5. **Focus ring is `primary` #7fff00**: 7.20:1 on the selected fill, 12.6:1 on the normal row; it stays visible. The ring sits inside the row (offset negative), so it must not be hidden by the edge bar (draw the bar as an inset shadow on the left edge, under the ring).
6. **Icon buttons' own state layers** (hover/pressed on `on-surface`) are 8–12% of a light colour on #245100: still above 3:1 for the icon glyph; verified for `primary` and `error` glyphs.

## 4. Phone compact rows (`.dt-item`)

Same selected rule applies (`.dt-item[aria-selected='true']`). The compact item's text lines are `on-surface` and muted; all pass on #245100 (7.24, 5.47). The "Not found on Spotify" text button uses `error` (5.49 on the fill). Targets stay 48 px; the edge bar is 4 px inside the item's padding so no layout shift.

## 5. Second cue (not colour alone)

- A 4 px left edge bar in `primary` #7fff00 (12.6:1 against the normal row, 7.20 against the fill), drawn with an inset box-shadow (no layout shift).
- `aria-selected="true"` on the row so screen readers say "selected".
- In forced-colours mode the system highlight replaces the fills: the bar and `aria-selected` stay, and a `forced-colors` rule gives the row a visible outline.

## 5b. Glowing top and bottom lines (owner request)

- **Line**: 2 px `primary` #7fff00 on the row's top and bottom edges: 12.6:1 against the normal row, 7.20:1 against the selected fill, so it passes the 3:1 UI target on both sides and is the strongest cue of the row.
- **Glow**: a soft `primary` halo, `0 0 8px` at about 60% `primary` (colour-mix, no new token), drawn outward from each line. It is decorative (the line carries the information); against the neighbouring rows' fill the halo lowers the contrast of nothing, because it is a background-side light over `surface-container` (#1a2214) and never behind text of a marked row; the 4 px edge-to-edge halo can reach the first 4 px of the next row's border area only, so the row above/below keeps text contrast above 9:1 (their text sits at least 8 px inside).
- **Painting**: lines and glow are inset/outset box-shadows on the row (no border-width change, no layout shift); the row gets `position: relative; z-index: 1` so its glow paints over the neighbours' backgrounds instead of under them; the table wrapper does not clip (`.dt-wrap` has no `overflow`), so top glow on the first row and bottom glow on the last row show; the scroll container's own overflow may clip the halo at the far left and right edges, which is accepted (lines and bar stay).
- **Motion**: static, no animation (nothing to reduce); no pulse.
- **Adjacent marked rows**: only one row is marked, so lines never double.
- **Form row**: lines and halo apply to the neutral form row too (they do not touch field contrast), with the edge bar.
- **Phone item**: same rule; item height unchanged.
- **Forced colours**: shadows are removed by the system, so a real `outline: 2px solid Highlight` replaces them (section 5).
- **Cost**: box-shadow on one row at a time, negligible.

## 6. Open Edit and Link forms

The form replaces the row (`.dt-full`). It keeps the neutral surface (field outlines need 3:1, the selected fill gives 2.94) and shows the mark by the same edge bar plus `aria-selected`. So the mark survives while the form is open and the owner sees which row is being edited.

## 7. Tests the colour work needs

- Add the pairs of section 2 (`on-surface`, `on-surface-variant`, `error`, `app-color-warning`, `secondary` on `primary-container`) to `src/ui/theme/contrast.test.ts` (text 4.5, marks 3; `error` is held to 4.5 because the phone "Not found on Spotify" button is text). `outline` on `primary-container` is deliberately not asserted: the form does not use that fill.
- A pure test of the selector rule: the mark is a single key and survives sort and filter.
- Regression: a row is marked after a click on a cell, on the Spotify icon and on a menu button; the row has `aria-selected="true"`; hover keeps the selected background.
