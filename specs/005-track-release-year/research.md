# Research: release years

## R1 Shazam already dates 80 % of heard tracks
- **Decision**: read `metadata.release_date` (always 4 digits on the 2026-11-06 sets: 402 of 505 tracks) through `parseYear`.
- **Rationale**: free, already in every result. **Alternative**: the year of the Shazam album page (extra call): rejected.

## R2 Worker fill by ISRC
- **Decision**: for heard tracks with an ISRC and no year, Deezer `GET /track/isrc:{ISRC}` (`release_date`, `album.release_date`),
  then MusicBrainz `GET /ws/2/isrc/{ISRC}?inc=releases&fmt=json` (each release's `date`); keep the earliest valid year;
  `metadata.release_date` = that year, `metadata.release_date_from` = `"deezer"` or `"musicbrainz"`. Same `Lookups` pace, busy
  retry and cap (shared with clues; clues first). A failure is one log line.
- **Alternatives**: Discogs (needs a release id, not an ISRC): rejected.

## R3 ReccoBeats albums give the original year (probed 2026-11-07)
- `GET https://api.reccobeats.com/v1/audio-features?ids=` items carry `id` (ReccoBeats' uuid) beside `href`.
- `GET /v1/track/{id}/album?size=50` → `{content:[{name, albumType, releaseDate, releaseDateFormat}], totalElements}`:
  *Stairway to Heaven* → 1971 (album), 2007 (compilations). CORS echoes `https://vatheo.github.io`.
- `GET /v1/track?ids=` (≤40 Spotify ids or ISRCs) returns `id` + `href` for rows stored before `rid` existed.
- **Decision**: BPM run pass 3 "release years": for each track with a ReccoBeats value and no fresh `releaseYear`, get its `rid`
  (stored from pass 1, else one `/track?ids=` call per 40), then one album call; earliest valid year; `year: null` when none,
  asked again after the 90-day not-found TTL. One request per second across the run, 429/5xx handling as `fetchAudioFeatures`.

## R4 Spotify album dates at no cost
- Playlist items: add `release_date` to `album(name)` in both field filters; Top: `/me/top/tracks` answers full tracks (has
  `album.release_date`); Search (Create playlist) answers full tracks. Only the year is kept.

## R5 One year per library track
- `yearOf`: ReccoBeats' earliest year, else the playlist album year, else a Top item's. Mix rows keep their own `year`
  (Shazam / catalogue / Spotify on Create playlist, which fills only an undated row).

## R6 The view
- One pure helper `applyYearView(items, yearOf, {sortByYear, decade})` (stable sort, undated last, decade filter) and one
  component `YearView` (Year sort toggle + decade chips listing present decades; hidden when nothing is dated), state in a
  signal per screen key so it survives navigation; the year itself as a small pill beside the BPM/key pills.
