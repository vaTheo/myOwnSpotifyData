# Contract: the play column and the Listen column

Both live in `src/ui/table/columns.tsx` beside `spotifyLinkColumn`; pages pass `trackOf(row): ListenTrack | null`.

## `playColumn(trackOf, over?)`

| Property | Value |
|---|---|
| `id` | `play` |
| `header` | "Play" (hidden) |
| `priority` | 1 (never hides) |
| `width` | `56px` |
| `compact` | `lead` (first in the phone item's lead slot) |
| cell | `<PlayOnSpotify>` when `trackOf(row)?.id` is set, else `null` |
| position | first entry of the page's column list |

`PlayOnSpotify` (`src/ui/components/PlayOnSpotify.tsx`): `IconButton icon="play_arrow"`, label
"Play {artist} – {title} on Spotify", `href="spotify:track:{id}"`, class `mix-spotify found` kept for the Mix. The Mix found case
renders this component.

## `listenColumn(trackOf, over?)`

| Property | Value |
|---|---|
| `id` | `listen` |
| `header` | "Listen" (hidden) |
| `priority` | 1 |
| `width` | `64px` |
| `compact` | `trail` |
| cell | `<RowMenu icon="headphones" label="Listen to {artist} – {title}" items={() => trackListenItems(track)} />`: the items are built when the menu opens |
| position | last entry, in place of `spotifyLinkColumn` |

## Pages

| Page | play | listen | removed |
|---|---|---|---|
| Top tracks | first | last | `spotifyLinkColumn` |
| Playlist | first | last | `spotifyLinkColumn` |
| Artist (tracks) | first | last | `spotifyLinkColumn` |
| Crate views (one column list, `shared.tsx`) | first | last | none (had none) |
| Overview track items | first, before the link | last, after the link (R6) | none |
| Mix tracklist | unchanged (renders `PlayOnSpotify`) | unchanged | none |
| Top artists, Artists, Under the radar, Playlists | unchanged | unchanged | keep `spotifyLinkColumn` |

## Behaviour

- A click on the button or the menu never runs the row's `onOpen` (`DataTable` skips clicks inside `a, button`).
- No request is made by drawing either; a link is followed only when the owner opens it.
