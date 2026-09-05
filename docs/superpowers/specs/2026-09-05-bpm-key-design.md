# BPM and key: design

Date: 2026-09-05. Status: owner authorised a first version on branch
`feat/bpm-key`, to be tried before any merge. Builds on
`2026-09-04-spotify-dj-webapp-design.md` and `2026-09-04-crate-history-views-design.md`.
Research: `../research/2026-09-05-bpm-key-sources.md`.

## 1. Goal

Show BPM and musical key for the owner's tracks everywhere a track appears,
and let the owner find what mixes with a given track. Two free sources in
this version:

1. **ReccoBeats** (`api.reccobeats.com`): serves Spotify's audio features
   (tempo, key, mode, energy) for Spotify track ids and ISRCs, 40 per
   request, no key, cross-origin allowed. Covers roughly half to two thirds
   of house and techno tracks.
2. **Rekordbox Collection XML**: the owner's own analysed library (BPM and
   key per track), matched to Spotify tracks by title, artist and duration.

Out of scope for this version: preview-based audio analysis, AcousticBrainz,
other DJ software formats, manual editing, a standalone set-builder screen,
energy display.

## 2. Data

### Feature rows (new IndexedDB store `features`, keyed by Spotify track id)

```ts
export interface FeatureValue {
  bpm: number | null;      // beats per minute, as reported
  key: number | null;      // pitch class 0..11, C = 0
  major: boolean | null;   // true = major, false = minor
  energy: number | null;   // 0..1 when the source has it, else null
  fetchedAt: number;       // epoch ms
}
export interface RekordboxValue extends FeatureValue {
  matchedBy: 'title-artist-duration' | 'title-artist';
  rbTitle: string;
  rbArtist: string;
}
export interface FeatureRow {
  trackId: string;
  isrc: string | null;
  reccobeats?: FeatureValue | { notFound: true; checkedAt: number };
  rekordbox?: RekordboxValue;
  updatedAt: number;
}
```

`DB_VERSION` becomes 2. The `upgrade` callback creates only the stores that
do not exist yet (`db.objectStoreNames.contains`), so an existing version 1
database keeps its data and gains `features`. A test opens a version 1
database with rows, reopens at version 2 and asserts nothing was lost.

### Resolution (pure, `src/model/features.ts`)

`resolveFeature(row): ResolvedFeature | null` where
`ResolvedFeature = { bpm: number | null; key: number | null; major: boolean | null; source: 'rekordbox' | 'reccobeats' }`.
Rekordbox wins when it has a value for a field; ReccoBeats fills the rest;
a row with only a `notFound` marker resolves to `null`. Fields resolve
independently (Rekordbox may have BPM but no key).

`Model` gains `features: Map<string, FeatureRow>` (from a new
`AllRows.features`). `featureFor(model, trackId)` returns the resolved
feature or `null`.

### Keys (pure, `src/model/keys.ts`)

Internal form: pitch class 0..11 plus `major`. Exports:

- `camelot(key, major): string` — `((7*key + (major ? 7 : 4)) % 12) + 1` then
  `B` for major, `A` for minor. Examples: A minor → `8A`, C major → `8B`,
  F minor → `4A`, D major → `10B`.
- `openKey(key, major): string` — number `((camelotNumber + 6) % 12) + 1`
  (with 12 for 0), `d` for major, `m` for minor.
- `classicName(key, major): string` — `C, Db, D, Eb, E, F, F#, G, Ab, A, Bb, B`
  plus ` minor` for minor (major has no suffix).
- `formatKey(key, major, notation: 'camelot' | 'open' | 'classic')`.
- `parseKeyText(text): { key, major } | null` — accepts Camelot (`4A`, `09B`,
  case-insensitive), Open Key (`10m`, `3d`), classic (`Fm`, `F#m`, `Abm`,
  `Bb`, `C major`, `Dbmin`, `Am`), enharmonics (`Db`=`C#`, `Eb`=`D#`,
  `Gb`=`F#`, `Ab`=`G#`, `Bb`=`A#`), empty → `null`.
- `keyRelation(a, b): 'same' | 'relative' | 'adjacent' | 'boost' | 'none'` on
  Camelot: same code → `same`; same number other letter → `relative`;
  same letter and number ±1 (wrapping 12↔1) → `adjacent`; same letter and
  number +2 → `boost`; else `none`.
- `bpmDeltaPct(from, to): number` — `(to - from) / from * 100`.

### Match ranking (pure, `src/model/match.ts`)

`rankMatches(seed: ResolvedFeature, candidates: { id: string; feature: ResolvedFeature | null }[], tolerancePct = 6)`
returns candidates sorted: first those with a feature within
`±tolerancePct` BPM (half and double time are not considered) ordered by
key relation rank (`same` 0, `relative` 1, `adjacent` 2, `boost` 3, `none`
4) then by `|ΔBPM%|`; then the rest with a feature (out of tolerance) by
`|ΔBPM%|`; then candidates without a feature, in their original order. Each
result carries `relation` and `deltaPct` (null when unknown).

## 3. ReccoBeats lookup (`src/features/reccobeats.ts`, `src/features/lookup.ts`)

- `GET https://api.reccobeats.com/v1/audio-features?ids=<up to 40 comma-separated Spotify ids>`.
  Response `{ content: [{ href: 'https://open.spotify.com/track/<id>', isrc, tempo, key, mode, energy, ... }] }`.
  The Spotify id is the last path segment of `href`. `key` is −1 when
  unknown → `null`; `mode` 1 → major, 0 → minor; `tempo` → `bpm`.
- Candidate ids: every synced track with a Spotify id, plus every play row
  with `plays > 0` (imported history), minus ids that already have a
  `reccobeats` value, minus `notFound` markers younger than 90 days.
- Pass 1 by Spotify id in batches of 40. Ids missing from the response and
  that have an ISRC (synced tracks) go to pass 2 by ISRC (batches of 40);
  a result whose `isrc` matches is stored under the original track id. Ids
  still missing get `{ notFound: true, checkedAt }`.
- One request per second (a `sleep` dependency). On HTTP 429 wait
  `Retry-After` seconds (default 10) and retry the same batch, at most 5
  times. On a network failure or 5xx after 3 retries, stop with an error
  state; rows already written stay, so the next run resumes.
- Rows are written per batch (`putFeatures`). State
  `LookupState = { status: 'idle' } | { status: 'running'; done; total } | { status: 'done'; found; notFound; total } | { status: 'error'; message }`.
- The lookup starts only from the Settings button, never on load.

## 4. Rekordbox import (`src/features/rekordbox.ts`, `rekordbox-match.ts`, `rekordbox.worker.ts`, `rekordboxImport.ts`)

- Input: one `.xml` file (Rekordbox `File > Export Collection in xml format`).
  Parsed in a Worker with a tolerant scanner over `<TRACK …>` start tags
  (attributes only; child `<TEMPO>` and `<POSITION_MARK>` elements are
  ignored). Attributes used: `Name`, `Artist`, `AverageBpm`, `Tonality`,
  `TotalTime`. XML entities `&amp; &lt; &gt; &quot; &apos; &#NNN; &#xHH;` are
  decoded. A file without `<DJ_PLAYLISTS` or with zero `TRACK` elements is
  reported as "not a Rekordbox collection".
- `parseRekordbox(text): RbTrack[]` with
  `RbTrack = { title, artist, bpm: number | null, key: { key, major } | null, seconds: number | null }`
  (`AverageBpm` "0.00" → null; `Tonality` via `parseKeyText`).
- Matching (`matchRekordbox(tracks: RbTrack[], library: LibraryTrack[])`,
  `LibraryTrack = { id, name, artists: string[], durationMs }`):
  - `cleanTitle(s)`: `normalize(s)` after removing `feat./ft. …` tails,
    `(original mix)`, `- original mix`, `(extended mix)`, `- extended mix`,
    `(radio edit)`, `- radio edit`; a `(… remix)` / `- … remix` tail is kept as
    the `mix` part.
  - Keys: `${cleanTitle}|${normalize(primaryArtist)}` where the primary
    artist is the first token when splitting on `,`, `&`, ` x `, `feat`.
  - A Rekordbox track matches when exactly one library track shares the key,
    or several do and exactly one has `|seconds*1000 - durationMs| <= 2000`
    (`matchedBy: 'title-artist-duration'`); otherwise `matchedBy: 'title-artist'`
    for a unique key match; ambiguous or absent → unmatched.
- Result: per matched track a `RekordboxValue` stored on its `FeatureRow`
  (creating the row if needed, keeping any ReccoBeats value). Summary
  `{ parsed, withBpm, withKey, matched, unmatched, importedAt }` stored in meta
  `rekordboxSummary`. State `RekordboxState` mirrors `ImportState`.
- Local files (no Spotify id) are excluded from matching.

## 5. Screens

### Badges

`FeaturePills({ trackId })` renders, when a resolved feature exists, up to two
compact pills after the row's existing badges: BPM (one decimal, `.0`
dropped: `124`, `127.5`) and key in the selected notation. Key pill classes
`pill key-N` (`N` = Camelot number 1..12, twelve hues) and `minor`/`major`
(minor filled, major outlined). Nothing renders when no feature exists.

Wired into: Top (tracks), Playlist, Artist, and every Crate row. The Crate
row rule "never a third badge" concerns the sort and context badges; the
feature pills are a separate group rendered after them.

### Settings: "Audio data" card

- Coverage line: `BPM and key for 3,120 of 4,980 tracks · ReccoBeats 2,900 ·
  Rekordbox 800` (tracks = candidate ids as defined in §3; a track counts
  when it resolves to at least a BPM or a key).
- `Look up (ReccoBeats)` button with progress `done / total batches` and the
  result `found N · not found M`; disabled while running; last error shown.
- Rekordbox import: file input `.xml`, progress, summary `parsed 1,204 ·
  with BPM 1,190 · with key 1,050 · matched 820 · unmatched 384`, last import
  date.
- Key notation: Segmented `Camelot · Open Key · Classic`, persisted in
  localStorage `keyNotation`, default Camelot.
- Attribution line: `Audio data via ReccoBeats (Spotify audio features).`

### Playlist: Match mode

The Playlist screen's Segmented gains a third option `Match`. Selecting it
shows `Tap a track to match against` until a row is tapped; then a header
line `Matching: <title> · 126 BPM · 8A` with a `Clear` button, and the list
is `rankMatches(seed, rows)`. Each row's badges: relation (`same key`,
`relative`, `+1`, `−1`, `boost`) as a blue badge and `ΔBPM` as a grey badge
(`+1.6%`); rows out of tolerance show `ΔBPM` only; rows without data show
`no data`. Tapping another row makes it the seed. The seed choice is a
module-level signal per playlist id and is cleared when leaving Match mode.
Tracks whose seed has no feature: Match mode shows `No BPM or key for this
track yet` and keeps the plays order.

## 6. Components and styles

- `TrackRow` unchanged (pills go through `badges`).
- CSS: `.pill` (inline-block, 0.72rem, 2px 6px, radius 999px, tabular
  numerals), `.pill.bpm` (grey), `.pill.key-1` … `.pill.key-12` (twelve hues
  from a fixed list, text colour dark on light hue), `.pill.major` (outlined,
  transparent background, hue as border and text), `.badge.relation` (blue).

## 7. Tests

- `keys.test.ts`: the full Camelot table (24 entries), Open Key mapping,
  classic names, `parseKeyText` for every accepted form and enharmonic,
  `keyRelation` cases incl. wrap 12→1, `bpmDeltaPct`.
- `features.test.ts`: resolution precedence per field, `notFound` only →
  null, `featureFor`.
- `match.test.ts`: ordering by relation then |Δ|, tolerance boundary, no-data
  tail, seed without feature.
- `reccobeats.test.ts` (mocked fetch): batching of 40, URL, response
  mapping (href id, key −1, mode), 429 with Retry-After then success, 5xx
  gives up after 3, ISRC pass for misses, notFound markers, skip of fresh
  rows, resume after error (rows already written).
- `rekordbox.test.ts`: parser on a fixture with entities, `TEMPO` children,
  empty Tonality, classic and Camelot keys, zero BPM; rejection of non-
  Rekordbox XML. `rekordbox-match.test.ts`: `cleanTitle` cases, unique match,
  duration tie-break, ambiguity → unmatched, local files excluded.
- `repo.test.ts`: `features` store round trip and the v1→v2 migration.
- Screens: no unit tests; browser walkthrough in the final review with the
  fixture history zip containing real Spotify ids (so the ReccoBeats lookup
  can be exercised live) and a Rekordbox XML fixture.

## 8. Policy notes

ReccoBeats relays Spotify's numbers; the app caches values only for the
owner's own library and shows the ReccoBeats attribution. Rekordbox data is
the owner's own. No data leaves the browser except the lookup requests.
