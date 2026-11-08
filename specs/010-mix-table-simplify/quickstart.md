# Quickstart: validating the round

1. `yarn typecheck && yarn lint && yarn test` green. New or changed tests: confidence cell text, sort ids, `tracksToAdd` ignores `validated`, `reviewChips` and `reviewLine` without validation, `playLinks` with one app link.
2. `yarn dev`, open `http://127.0.0.1:5173/myOwnSpotifyData/?demo`, open a mix:
   - no Source, In your library or Clips column; Review shows only Delete; no To review or Validated chips.
   - the Confidence header sorts times heard then percent; a second click reverses; rows without a value stay last.
   - a found row's Spotify link has a `spotify:track:` href; the Listen menu has no "Open in Spotify app".
   - the Shazam and SoundCloud icons open in a new tab; a manual row shows no Shazam icon.
   - a saved mix with `validated: false` rows shows them all, and Create playlist counts them.
3. `yarn regression`: update the rows covering Validate, the chips and the Create playlist choice; A05 is a known stale failure. Shots only when the owner asks.
