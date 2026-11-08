# Research: Add a Spotify link to a track that was not found

## Where the link is stored

- **Decision**: in the existing `row.spotify = { id, url }`, plus `spotifyBy?: 'owner'` to mark it as the owner's.
- **Rationale**: everything downstream (counts, cell link, `playLinks`, `storedUri` in Create playlist, save, sync, `keepStoredAnswers`) already reads that field. The marker lets Remove link return to `'not-found'` and keeps Replace/Remove off Check's own answers.
- **Alternatives**: a separate `manualSpotifyId` field (every reader would need to learn it, two sources of truth); reusing `shazamUrl` (wrong meaning).

## Accepted input

- **Decision**: `https://open.spotify.com/track/<id>` with any query or fragment, an optional locale segment (`/intl-fr/track/<id>`), `http`, `open.spotify.com` or `play.spotify.com`, and `spotify:track:<id>`; id must match `^[A-Za-z0-9]{22}$`. Anything else (album, artist, playlist, `spotify.link` short links, other hosts, free text) is refused.
- **Rationale**: the example link has `?si=`; copies from the app and web use these forms. Spotify ids are 22 base-62 characters; the check stops garbage. A short link needs a redirect the app cannot follow (same rule as SoundCloud short links).
- **Alternatives**: accept any alphanumeric id (typos pass silently).

## Verification

- **Decision**: none. No read, no name or id lookup (ADR-02, ADR-04).
- **Rationale**: the owner pasted it on purpose; a read would add a gated call and a failure mode for no gain. A wrong link is fixed with Replace.

## Interaction with Check on Spotify

- **Decision**: no change needed for the check itself: it only asks about rows with `spotify === undefined`, and `keepStoredAnswers` applies answers only where the live row has none. A rename clears both `spotify` and `spotifyBy` (existing rule in `editTracklistRow`).
- **Rationale**: the spec's FR-006 follows from the existing design; a test pins it.

## Create playlist

- **Decision**: dedupe `uris` before posting (a Set kept in order).
- **Rationale**: SC-003 "no track added twice"; two rows linked to the same track, or a hand link equal to another row's found track, would otherwise add it twice.

## UI

- **Decision**: the red mark becomes a 48 px button that opens an inline form under the row (text field with paste, Link, Cancel; message line); on a phone the same form opens full-width under the compact row. A hand-linked row's found mark keeps opening the app; Replace and Remove link live in the row's More menu (and the form opened from it).
- **Alternatives**: a modal dialog (heavier on phone); editing inside the existing Edit form (hidden behind More › Edit; the owner asked for the red mark).
