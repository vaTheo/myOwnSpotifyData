# Quickstart: validating Rarely played

1. `yarn typecheck && yarn lint && yarn test` (exit 0). New tests: `src/model/rarelyPlayed.test.ts`, the router row.
2. `yarn dev`, open `http://127.0.0.1:5173/myOwnSpotifyData/?demo` (the demo data, never the owner's).
3. Listening → Crate → "Rarely played": the default is Never; each row has Plays 0.
4. Turn on `1 play`: rows with 0 or 1 appear; turn Never off: only 1. Turning off the last chip is refused.
5. Pick a playlist: every row names it. Pick one with no match: the inline message.
6. A song in two playlists is one row listing both.
7. Open a row: the details sheet; reload on `?d=`: it stays.
8. Demo without history: the Crate notice, no "never played" rows.
9. `yarn shots` 0 findings on the Crate pages; then `yarn regression` for the Crate rows.
