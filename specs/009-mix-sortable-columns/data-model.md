# Data Model: Mix tracklist sortable columns

Nothing is stored. No store, field or `DB_VERSION` changes (Principle V); `mixes` is untouched.

## Sort choice (screen state)

| Field | Type | Rule |
|---|---|---|
| `columnId` | `string \| null` | `null` is the set's own order; otherwise the id of a sortable column that applies to the open rows |
| `direction` | `'asc' \| 'desc'` | the column's first direction until the owner flips it |

Lives in `TracklistTable`'s state. Reset when another mix opens (the component remounts). Not saved with the mix, not read from
Spotify, not synced.

## Sort value per column

`SortValue = number | string | null`; `null` always sorts last in both directions (`src/ui/table/sort.ts`).

| Column | Value | Null when |
|---|---|---|
| time | `startSec` | no time |
| title | artist – title | gap |
| label | `label` | empty |
| source | source label | gap |
| confidence | `hits × 1000 + confidence` (times found, then %) | source is not Tracklistify, or gap |
| clips | `hits` | candidate, gap, older row |
| library | 1 matched, 0 not | gap |
| released | `rowYear` | gap, undated |
| spotify | 0 not found, 1 unchecked, 2 found | gap |
| review | 0 to review, 1 validated | gap |

## Applies

A column is offered in the select, and a stored choice stays in force, only while it applies: confidence needs a row with a
confidence, clips needs a row with `hits`, released needs a dated row. Otherwise the order falls back to the set's order.

## View pipeline

rows → chip filter (`inFilter`) and decade (`viewRows`) → table sort by `SortState`. Filters hide, the sort only reorders; the
editing row is kept visible as today. Row actions use `Line.index`, the row's place in `mixRows`, so they act on the right row in any
order (FR-010).
