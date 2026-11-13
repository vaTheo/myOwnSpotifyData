# Contract: addresses and destinations

The hash router stays (`src/router.ts`). It gains Overview, an open mix and a detail parameter (research D8), and a pure
`destinationOf(route)` that places every route in one of the five destinations.

## Destinations

| Destination | Icon | Tabs | Opens on first visit | Rail position |
|---|---|---|---|---|
| Overview | `home` | — | `#/` | 1 |
| Listening | `headphones` | Top · Crate | `#/top` | 2 |
| Library | `library_music` | Playlists · Artists | `#/playlists` | 3 |
| Mix | `queue_music` | — | `#/mix` | 4 |
| Settings | `settings` | — | `#/settings` | foot of the rail; 5th item of the bottom bar |

After the first visit, each destination's link opens the last route used inside it during this session.

## Addresses

| Address | Route | Destination · tab | Change |
|---|---|---|---|
| `#/`, empty, unknown | `overview` | Overview | **new**; was `top` |
| `#/top` | `top` | Listening · Top | unchanged |
| `#/crate` | `crate` | Listening · Crate | unchanged |
| `#/crate/<view>` | `crateView` | Listening · Crate | unchanged; since spec 030 the view switch links to each view's address, without a period or `?d=` |
| `#/crate/year/<YYYY-MM>` | `crateView` + period | Listening · Crate | unchanged |
| `#/playlists` | `playlists` | Library · Playlists | unchanged |
| `#/playlist/<id>` | `playlist` | Library · Playlists | on expanded and large it renders as list + detail |
| `#/artists` | `artists` | Library · Artists | unchanged |
| `#/artist/<key>` | `artist` | Library · Artists | on expanded and large it renders as list + detail |
| `#/mix` | `mix` | Mix | unchanged |
| `#/mix/<key>` | `mix` + key | Mix | **new**: opens that saved mix; an unknown key shows the workspace with an inline "This saved mix is not in this browser" (above the open mix when one is open; it stays) |
| `#/settings` | `settings` | Settings | unchanged |
| `#/settings/<item>` | `settings` + item | Settings | spec 026: lands on that item (`account`, `sync`, `history`, `audio`, `reach`, `server`, `danger`), opened and scrolled to; an unknown item is ignored; the nav's Settings returns to `#/settings` |
| `#/import` | `import` | Settings | unchanged (reached from Settings · Listening history) |

## The detail parameter

Any route may end with `?d=<id>`. The track details sheet opens over that screen. A list route names one of its rows; any
other screen (Settings, Mix, the Playlists and Artists lists, the Crate hub, Import) carries a track opened from search, whose
sheet the frame draws (S09). On a playlist that holds the searched track, `<id>` is that entry's position, so its row is selected.

| Screen | `<id>` is | Why |
|---|---|---|
| Top (tracks), Crate views, Artist | the Spotify track id | one row per track |
| Playlist | the entry position | a playlist may hold the same track twice |
| Search result over any screen | the Spotify track id, or the play row's track id for history-only tracks | — |

Unknown or stale ids are ignored, and the screen renders without a sheet. Opening a sheet pushes a history entry, so back closes
it. Closing it with Escape or ✕ replaces the entry rather than adding a new one.

## Rules carried over

- `routeHref` stays the only builder of addresses. `parseRoute` stays total: every string parses to some route.
- `visitEntry` and scroll restoration are unchanged. A new screen starts at the top, and back and forward keep their position.
- Arriving at `#/crate/year/<YYYY-MM>` still selects that year and month once per mount (today's `applyPeriod`).

## Tests

`router.test.ts` gains these cases:

- `#/` and an unknown address give `overview`;
- `#/mix/<key>` round-trips through `routeHref` with encoding;
- `?d=` parses on every route (S09: a search result over a screen without a list) and round-trips through `routeHref`;
- `destinationOf` returns the right destination and tab for every route.
