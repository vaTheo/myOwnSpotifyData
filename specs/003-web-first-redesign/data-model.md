# Data model: web-first redesign

**No stored data changes.** No IndexedDB store, field or `DB_VERSION` bump (Principle V), no server table, no new `localStorage` key.
The theme is fixed (dark), so there is no display preference to store. The key notation preference stays where it is.

What the round adds is presentation state, held in signals for the session, and view models computed by pure functions from the
existing `Model` and job signals. Each pure function below has unit tests next to it (research D17).

## 1. Route (extended)

```text
Route =
  | { name: 'overview' }                                   // new; the default
  | { name: 'top', detail?: string }
  | { name: 'crate' }
  | { name: 'crateView', view, period?, detail?: string }
  | { name: 'playlists' }
  | { name: 'playlist', id, detail?: string }              // detail = entry position
  | { name: 'artists' }
  | { name: 'artist', key, detail?: string }
  | { name: 'mix', key?: string }                          // key = saved mix key; new
  | { name: 'settings' } | { name: 'import' }
```

- `detail` comes from `?d=` and is kept only on list routes ([routes](contracts/routes.md)).
- `destinationOf(route)` → `{ destination: 'overview' | 'listening' | 'library' | 'mix' | 'settings', tab?: 'top' | 'crate' |
  'playlists' | 'artists' }`.
- `lastRouteIn: Record<Destination, Route>`, a session signal, updated on each navigation and read by the rail links.

## 2. Window class

`windowClassOf(width): 'compact' | 'medium' | 'expanded' | 'large'`, with the boundaries 600, 840 and 1200 (lower bound
inclusive). The `windowClass` signal is fed by `matchMedia` listeners. Behaviour reads it as follows:

| Window class | Selecting a list item | Track details |
|---|---|---|
| compact, medium | the item opens full screen | full screen on compact, a modal sheet on medium |
| expanded | list + detail, two panes | modal side sheet |
| large | list + detail, two panes | docked side sheet; the list pane folds away while it is open |

## 3. Table

```text
Column<Row> {
  id: string
  header: string                       // shown, and announced
  align: 'start' | 'end'               // 'end' for numbers
  priority: 1 | 2 | 3 | 4              // 1 never hides (FR-018)
  sortValue?: (row) => number | string | null   // null = missing → always last
  firstDirection?: 'asc' | 'desc'
  cell: (row) => VNode
  compact?: 'title' | 'subtitle' | 'meta' | 'hidden'   // its place in the two-line item
}

SortState  { columnId: string | null, direction: 'asc' | 'desc' }   // null = the screen's own ranking
TableState { sort: SortState, shown: number, selectedIndex: number | null }
```

Rules:

- `sortRows(rows, sortValue, direction)` is stable. Missing values go last in both directions. Text compares with
  `localeCompare(…, { sensitivity: 'base' })`.
- Header click: on another column, sort by it in its `firstDirection`. On the current column, flip the direction. On the rank
  column, set `columnId = null`.
- A row's rank number is computed before sorting and filtering, and travels with the row (FR-016).
- `shown` starts at `PAGE_SIZE` (100) and grows by 100. It resets when the sort, the filter or the view's setting changes, as the
  Crate's `limit` does today.
- `moveIndex(current, key, count, page)`: ArrowUp and ArrowDown move by ±1, PageUp and PageDown by ±page, Home and End jump to the
  first or last row. The result is clamped to the rows on screen.
- One `TableState` per screen in session signals, the way `period`, `order`, `rotationMonths` and the rest are kept today.

## 4. Track filter

```text
TrackFilter {
  text: string                 // existing filters, normalised with `normalize`
  bpmMin: number | null
  bpmMax: number | null
  key: KeySig | null           // { key: 0..11, major: boolean }
  compatible: boolean          // include keyRelation(...) !== 'none'
}
```

- `filterTracks(rows, featureOf, filter)` keeps a row only if every set criterion holds.
- A row without BPM fails a BPM criterion. A row without a key (or without a mode) fails a key criterion.
- `bpmMin > bpmMax` is shown as an error on the fields and filters nothing.
- One `TrackFilter` per track table, in session signals. "Clear filters" resets all but `text`, which keeps its own clear button,
  as today.

## 5. Track facts (details sheet)

`trackFacts(model, ref)` takes `ref` as `{ trackId } | { playlistId, position } | { playRowId }` and returns:

```text
TrackFacts {
  title, artists: { name, artistKey | null }[], album | null, durationMs | null,
  spotifyUrl | null, isLocal,
  audio: { bpm, key, major, energy | null, source: 'rekordbox' | 'reccobeats', fetchedAt } | null,
  plays: { plays, byName: boolean, msPlayed, firstTs, lastTs, attempts | null, finished | null,
           skipped | null, unclear | null } | null,          // null before an import
  months: Record<'YYYY-MM', number> | null, peakMonth | null,
  playlists: { id, name }[]                                     // by id, then by artist and title (playlistsOfRow)
}
```

Energy is read from the source row (`FeatureRow.reccobeats` or `.rekordbox`), because `ResolvedFeature` does not carry it. The
source is the one `resolveFeature` picks, so the sheet and the BPM and key columns never disagree.

## 6. Chart series

- `monthSeries(months, keys, range)` returns `{ key, value: number | null }[]`. `value` is null for a month outside the imported
  history's range (drawn as a gap), and 0 for a month inside it with no plays.
- `barHeights(series, maxHeight)` scales to the series' own peak, keeps a minimum of 1 px for any value above 0, and gives 0 for
  0 (drawn as the baseline tick).
- `heatLevel(value, max)` returns 0 for no plays, and 1–4 for quartiles of the owner's busiest month.
- `yearMonthTotals(rows)` returns, per year, twelve monthly totals and the year's total, with the year range taken from
  `spanYears`.

## 7. Active jobs

```text
ActiveJob { id: 'sync' | 'import' | 'lookup' | 'rekordbox' | 'reach' | 'server' | 'like' | 'createPlaylist' | 'mixLookup',
            label: string, done: number | null, total: number | null, href: string }
```

`activeJobs(states)` returns an entry only for a running state:

| State | Running when | Label | Links to |
|---|---|---|---|
| `syncState` | `running` | "Syncing playlists" | `#/settings/sync` (spec 030) |
| `importState` | `running` | "Importing history" | `#/import` |
| `lookupState` | `running` | "Looking up BPM and key" | `#/settings/audio` (spec 030) |
| `rekordboxState` | `running` | "Importing Rekordbox" | `#/settings/audio` (spec 030) |
| `reachState` | `running` | "Looking up artists" | `#/settings/reach` (spec 030) |
| `serverState` | `pushing` or `pulling` | "Saving to server" or "Loading from server" | `#/settings/server` (spec 030) |
| `likeState` | `checking` or `liking` | "Liking songs" | the playlist |
| `createPlaylistState` | `resolving`, `creating` or `adding` | "Creating playlist" | Mix |
| `mixState` | `looking` | "Looking up mix" | Mix |

Labels are written once here. `done` and `total` are copied when the state has them.

## 8. Overview blocks

`overviewBlocks(input)` takes the model, `historySummary`, `crateStatus`, the rotation setting, `syncState`, `lastSyncAt`,
`artistReachSummary`, `serverState` and the newest saved mix. It returns:

```text
OverviewBlock {
  id: 'listening' | 'rotation' | 'top' | 'library' | 'coverage' | 'mix' | 'server'
  state: 'ready' | 'empty' | 'gated' | 'hidden'
  figures: { label, value: string | null }[]
  items?: { title, subtitle, trackId?, months? }[]
  warning?: string
  link: string
}
```

Every figure is computed by the same function its screen uses (`heavyRotation`, `topTracks`, `coverage`, `reachCoverage`,
`historyLine`), so the two never differ (SC-009). `server` is `hidden` when no server is configured.

## 9. Search

```text
SearchEntry  { kind: 'track' | 'artist' | 'playlist' | 'mix', id: string, name: string, normalized: string,
               context: string, weight: number }    // weight = plays, tracks or saved date, for ordering
SearchResult { kind, entries: SearchEntry[], total: number }
```

- `buildSearchIndex(model, mixes)` lists library tracks, history-only tracks (export names), saved and top-list artists,
  playlists and saved mixes, de-duplicated by id. It is memoised on the model's identity and the mixes array.
- `searchAll(index, query, perGroup)` matches `normalize(query)` as a substring, ranks prefix and word-start matches first and
  then by `weight`, and returns the groups in the order Tracks, Artists, Playlists, Mixes.

## 10. Demo data (dev only, research D19)

`buildDemo(variant, seed)` returns `AllRows` plus saved mixes, worker requests and the summaries (`historySummary` version 2,
`artistReachSummary` version 1, a Rekordbox summary). It is deterministic: the same seed gives the same rows, so screenshots compare
run to run.

| Variant | Purpose |
|---|---|
| `full` | the default: everything present, the edge cases included |
| `empty` | nothing synced or imported |
| `old-import` | a history summary of version 1, which shows the Crate's re-import gate |
| `no-reach` | no artist reach summary, which shows Under the radar's gate |
| `locked` | `syncState` in a quota lock with pending playlists and a retry time |

Rules:

- The rows go only into the `spotify-dj-demo` database, through the existing repository writers.
- The session is an in-memory session store.
- The server configuration is treated as unset.
- The module is reachable only behind `import.meta.env.DEV`.
- A unit test pins the counts, the edge cases (a 120-character name, a local file, BPM without key, an artist with no reach, a
  500-track playlist) and the determinism.

## State transitions worth pinning

- **Details sheet**: closed → open (push `?d=`) → closed (Escape or ✕ replaces the entry; back pops it). A model rebuild that
  removes the item closes the sheet silently.
- **List–detail**: on a resize from large to compact with a detail open, the route already names the detail, so the screen
  renders the full-screen detail. Nothing is lost (US3 scenario 4).
- **Match seed**: unchanged (`seeds` per playlist). Choosing "Match from this track" in the details sets the seed and switches
  the order to Match.
