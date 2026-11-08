# Research: Simpler mix tracklist table

## Validated stops being a state

- **Decision**: stop reading and writing `validated`; delete the Validate button, filters, counts and the Create playlist choice. The field stays optional.
- **Rationale**: every track is kept, so a flag nobody sets cannot filter. Old rows with `validated: false` must not hide or exclude anything, so nothing may read it.
- **Alternatives**: migrate rows to true (rewrites saved and synced mixes for nothing); keep `!== false` reads (dead logic, a "to review" row could reappear).

## Create playlist

- **Decision**: add every identified row; remove the Validated only / All tracks control.
- **Rationale**: with all rows kept the two choices are equal. Delete is how a track is left out.

## Merged Confidence column

- **Decision**: one `confidence` column; the cell reads "×3 · 92%" (times heard, then percent), a part omitted when missing; sort unchanged (hits×1000+percent, missing last). The `clips` sort id and column go.
- **Alternatives**: two lines in one cell (taller rows).

## Spotify app link

- **Decision**: the Spotify cell link and Listen "Play on Spotify" are `spotify:track:<id>` on every device, opened in place; "Open in Spotify app" is removed.
- **Rationale**: the owner asked for the app directly. Without the app the link does nothing (stated in the README).

## Shazam and SoundCloud icons

- **Decision**: icon links in the Listen cell. Shazam only when `row.shazamUrl` is set and the row still reads as the scan heard it (existing rule). SoundCloud: the existing `digLinks` search URL for any named row, labelled "Search SoundCloud".
- **Rationale**: the scan JSON carries only a Shazam link; finding a track page by name is forbidden (ADR-04). The honest label avoids implying a verified page.
- **Alternatives**: store a SoundCloud page per row (no source for it).

## Phone

- Compact rows hide the Listen cell today; the icons join the row's meta line, and the More menu keeps the rest.
