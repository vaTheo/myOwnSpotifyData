# Data model: Rarely played tracks

No stored data is added or changed (ADR-05: no `DB_VERSION` bump).

## RareItem (in memory, `src/model/rarelyPlayed.ts`)

| Field | Meaning |
|---|---|
| `row` | `PlayRow`; the history row when there is one, else built in memory (`plays: 0`, track name and artist, never stored) so `CrateItem` holds |
| `track` | the `TrackRow` of the playlist song |
| `plays` | 0..3, from `playsFor` (`null` becomes 0) |
| `playlistIds` | ids of the playlists that hold the song, in playlist order |

## Selection (signals in `src/ui/crate/selections.ts`)

| Signal | Type | Default |
|---|---|---|
| `rareCounts` | `ReadonlySet<0 \| 1 \| 2 \| 3>`, never empty | `{0}` |
| `rarePlaylist` | playlist id or `null` | `null` (all) |

## Rules
- A song is listed when `plays` is in `rareCounts` and (`rarePlaylist` is null or the song is in it).
- Listed once per `track.key`; `playlistIds` holds every playlist (or only the chosen one when filtered? No: all of them, so the
  Playlists column stays true).
- No history (`crateStatus !== 'ready'`): no computation; the Crate's empty notice shows.
