# Data model: Play button and Listen menu on every track list

Nothing is stored, synced or exported. No IndexedDB change, no `DB_VERSION` bump, no server table.

## ListenTrack (view value, built per row)

| Field | Type | Rule |
|---|---|---|
| `id` | `string \| null` | `spotifyTrackId(row id)`: the Spotify track id, `null` for a local file (`spotify:local:…`), a missing or empty id |
| `artist` | `string` | the row's artist names joined with ", ", as the row shows them |
| `title` | `string` | the row's track name |

Built by each page's `trackOf(row)`; `trackOf` returns `null` for a row that is not a track (none today).

## ListenItem (menu item, reuses `RowMenuItem`)

| Field | Value |
|---|---|
| `label` | "Play on Spotify", "Open Spotify web page", then the `digLinks` labels |
| `href` | `spotify:track:{id}`, `https://open.spotify.com/track/{id}`, then the `digLinks` search URLs |
| `app` | `true` for "Play on Spotify" only (opened in place, not in a new tab) |

Order is fixed: Spotify items (only when `id` is not null), then Beatport, Bandcamp, Discogs, SoundCloud, YouTube.
