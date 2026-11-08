# Data model: Simpler mix tracklist table

No stored change.

- **TracklistRow.validated** (optional boolean): stays in the schema, server validation and `keepReview`; after this round no code reads it for display, filtering, sorting or playlists.
- **Row links** (derived, not stored): Spotify app link from `row.spotify.id` (Check answer) or the library match; Shazam from `row.shazamUrl` while `source === 'tracklistify'`; SoundCloud search from `digLinks(artist, title)`.
- **Confidence cell** (derived): times heard (`row.hits`) and percent (`row.confidence`), each only when present.
