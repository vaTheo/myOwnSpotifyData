# Quickstart: check the play button and the Listen menu

Prerequisites: `yarn` installed, Node 24. Demo data only, never the owner's.

1. `yarn typecheck && yarn lint && yarn test` → all green; `src/ui/listen.test.ts` passes.
2. `yarn dev`, open `http://127.0.0.1:5173/myOwnSpotifyData/?demo`.
3. Top tracks: each row starts with ▶; its title is "Play {artist} – {title} on Spotify"; its link is `spotify:track:…`.
   The end of the row has the headphones menu and no "Open in Spotify" icon.
4. Press ▶: the details sheet does not open. Click the title: the details sheet opens, as before.
5. Open the headphones menu: Play on Spotify, Open Spotify web page, Beatport, Bandcamp, Discogs, SoundCloud, YouTube, in that order.
6. Repeat 3–5 on a Playlist, an Artist, each Crate view; on the Overview check ▶ on the track items only.
7. A local-file track on a demo playlist: empty first cell; its menu lists the five searches only.
8. Narrow the window to a phone width: ▶ is the first control of each item; the menu is at the end.
9. Top artists, Artists, Under the radar, Playlists: the "Open in Spotify" icon is still there.
10. A saved mix: its ▶ looks the same as on Top; its Listen menu is unchanged.
11. Before a merge: `yarn regression` (new rows green) and `yarn invariants`. `yarn shots` only when the owner asks.
