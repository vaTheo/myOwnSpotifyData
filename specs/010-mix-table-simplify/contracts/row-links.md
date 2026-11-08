# Contract: row links and columns

Columns, in order: Time, Artist – Title, Label, Confidence (merged), Released (when applicable), Spotify, Listen, Review (Delete only).
Phone: compact row, the meta line carries Confidence and Spotify ("On Spotify" as plain text, no link: 48 px target rule) and the
Shazam and SoundCloud icons; Play on Spotify is in More › Listen….

| Link | Shown when | href | Opens |
|---|---|---|---|
| Spotify (cell) | Check on Spotify found it | `spotify:track:<id>` | the app, in place |
| Spotify (Listen menu, More › Listen… on a phone) | Check found it, or a library match with a real id | `spotify:track:<id>` | the app, in place |
| Shazam icon | `row.shazamUrl` and source `tracklistify` | the stored Shazam URL | new tab |
| SoundCloud icon | named row | `https://soundcloud.com/search/sounds?q=<artist title>` | new tab |

Sort ids left: time, title, label, confidence, released, spotify. Removed: source, clips, library, review.
Accessible names: "Play <track> on Spotify", "Shazam <track>", "Search SoundCloud for <track>".
