# Data model: Mark the last row touched in the Mix tracklist

No stored change.

- **Marked row** (component state in `TracklistTable`): `number | null`, an index into `mixRows`. Cleared when that row is deleted, when another mix opens, and on reload; set to the new row's index by Add track; moved by any click inside a row. Never written to IndexedDB, never in `buildModel`, never synced.
- **DataTable props** (optional): `markedKey: string | null` (compared with `rowKey(row)`) and `onMark(row)`. When `markedKey !== undefined` the row gets `aria-selected` and the `selected` class. Tables that pass neither are unchanged.
