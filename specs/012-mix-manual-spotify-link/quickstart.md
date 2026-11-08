# Quickstart: validating the round

1. `yarn typecheck && yarn lint && yarn test` green. New tests: `parseSpotifyTrackLink` accepted and refused forms; `linkedRow`/`unlinkedRow`; a rename drops `spotifyBy`; `mergeKeepingReview` and `keepStoredAnswers` keep a hand link; `rowsToCheck` skips it; Create playlist adds a hand-linked track once and dedupes duplicates; `validate.ts` accepts and rejects `spotifyBy`.
2. `yarn dev`, `http://127.0.0.1:5173/myOwnSpotifyData/?demo`, open a mix with a not-found row:
   - tap the red mark; the field opens; paste the example link; Link; the row is found, its Spotify link is `spotify:track:1qGibBSuprByJCYMC4zRUG`, the counts move.
   - paste an album link: message, row unchanged.
   - More › Replace link / Remove link on that row; Remove returns it to not found.
   - Create playlist (demo) counts the linked track.
   - save, reopen: still linked.
3. `yarn regression` with a new row for the flow; A05 is a known stale failure. Shots only when the owner asks.
