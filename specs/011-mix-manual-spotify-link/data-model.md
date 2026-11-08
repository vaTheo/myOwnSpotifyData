# Data model: Add a Spotify link to a track that was not found

One optional field, no store or version change (ADR-05).

- **TracklistRow.spotifyBy** (`'owner'`, optional): set only together with `spotify: { id, url }` when the owner pasted the link. Cleared with `spotify` when the row is renamed, and when the link is removed (`spotify` goes back to `'not-found'`, `checkedAt` kept). Absent for every Check answer. Synced rows: `validate.ts` accepts `spotifyBy` only equal to `'owner'` and only beside an object `spotify`; otherwise the row is rejected like any bad field.
- **Spotify id**: `^[A-Za-z0-9]{22}$`; `url` is rebuilt as `https://open.spotify.com/track/<id>`, so the pasted query (`?si=`) is never stored.
- **Row states**: not found (red) → hand-linked (found, `spotifyBy: 'owner'`) → not found (Remove link); hand-linked → hand-linked (Replace); a rename drops it to unchecked.
