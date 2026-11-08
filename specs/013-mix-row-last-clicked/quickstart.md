# Quickstart: validating the round

1. `yarn typecheck && yarn lint && yarn test` green (new: `rowMark.test.ts`, the colour pairs in `contrast.test.ts`).
2. `yarn dev`, `http://127.0.0.1:5173/myOwnSpotifyData/?demo`, open a mix:
   - click a title; the row turns chartreuse (dark green fill, chartreuse text, bright left bar). Click the Spotify icon of another row: the mark moves, and the click still opens the app link.
   - click Shazam (new tab), come back: that row is still marked.
   - hover the marked row: it stays green, a little lighter.
   - tab to a control: the focus ring shows on the marked row.
   - sort and filter: the same track stays marked. Resize to phone width: still marked.
   - open Edit on the marked row: neutral form with the bar. Delete it: nothing marked.
3. `yarn regression` with row M04; A05 is a known stale failure. Shots only when the owner asks.
