# Contract: pasting a Spotify link

| Input | Result |
|---|---|
| `https://open.spotify.com/track/1qGibBSuprByJCYMC4zRUG?si=f4ed2a88f4744bea` | id `1qGibBSuprByJCYMC4zRUG` |
| `https://open.spotify.com/intl-fr/track/1qGibBSuprByJCYMC4zRUG` | same id |
| `spotify:track:1qGibBSuprByJCYMC4zRUG` | same id |
| surrounding spaces or a trailing newline | trimmed, accepted |
| album, artist, playlist, episode link | refused: "That is not a Spotify track link." |
| `spotify.link/…`, other hosts, free text, empty, id not 22 characters | refused, same message (empty: "Paste a Spotify track link.") |

Entry points: the red mark of a not-found row (computer: Spotify column button; phone: the "Not found" text becomes a 48 px button). Replace and Remove link: row's More menu, only on hand-linked rows.
Result on success: `spotify = { id, url: https://open.spotify.com/track/<id> }`, `spotifyBy = 'owner'`, `checkedAt = now`; the form closes; the row shows found.
Accessible names: "Link a Spotify track to <track>" (the phone text button: "Not found on Spotify: link a Spotify track to <track>", its visible words first), "Spotify track link" (field), "Link", "Cancel", "Remove link".
