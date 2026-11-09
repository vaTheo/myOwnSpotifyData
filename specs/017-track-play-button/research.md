# Research: Play button and Listen menu on every track list

No NEEDS CLARIFICATION was left in the spec; these are the design choices, each read from the code.

## R1. Which Spotify id a row has

- **Decision**: one pure function, `spotifyTrackId(id)`, returns the id when it is a Spotify track id and `null` otherwise. A local file
  is stored as a `spotify:local:…` URI (`src/db/schema.ts:25`), so any id that starts with `spotify:` gives `null`. The Mix already
  applies this rule inline (`src/ui/mix/rowText.ts:38`).
- **Rationale**: one rule for five pages; it sits where it can be tested without a DOM.
- **Alternatives**: read `spotifyUrl` and parse it (rejected: a second source for the same fact); use `isLocal` (rejected: only
  playlist tracks carry it, Crate and Overview rows carry an id only).

## R2. Where each page reads the track

| Page | Row | id | artist · title |
|---|---|---|---|
| Top tracks (`src/ui/Top.tsx:60`) | `r.item` | `item.id` | `item.artists`, `item.name` |
| Playlist (`src/ui/Playlist.tsx:201`) | `r.row.track` | `track.id` | `track.artists`, `track.name` |
| Artist (`src/ui/Artist.tsx:188`) | `r.track` | `track.id` | `track.artists`, `track.name` |
| Crate views (`src/ui/crate/shared.tsx:144`) | `item.row` | `row.trackId` | `trackLabel(row)` |
| Overview (`src/ui/overview/Overview.tsx:65`) | `item` | `item.trackId` | `item.subtitle`, `item.title` |

- **Decision**: every page passes a `trackOf(row) → { id, artist, title } | null` to the two new columns; the artist string is the names
  joined with ", ", the same string the row shows.

## R3. The play button

- **Decision**: extract the Mix found-track button (`src/ui/mix/TracklistTable.tsx:227-233`: `IconButton icon="play_arrow"`,
  label "Play {artist} – {title} on Spotify", `href="spotify:track:{id}"`) into `src/ui/components/PlayOnSpotify.tsx`. The Mix
  `SpotifyCell` renders it for its found case, so both pages draw the same element (FR-003, SC-004).
- **Rationale**: one component is the only way "the same button" stays true after a later change.
- **Alternatives**: copy the markup (rejected: drifts).

## R4. First column, on a wide window and on a phone

- **Decision**: a `playColumn(trackOf)` in `src/ui/table/columns.tsx`, placed first in each column list, `priority: 1` (never hides),
  `width: '56px'`, `headerHidden`, header "Play", `compact: 'lead'`. On a phone the item's lead slot draws its columns in order
  (`src/ui/table/DataTable.tsx:588`), so the button comes before the cover (Top, Playlist, Artist) or the rank (Crate).
- **Row click**: `DataTable` already ignores a click whose target is inside an `a` or `button` (`src/ui/table/DataTable.tsx:337`), so
  the button never opens the details sheet (FR-004) with no table change.
- **Empty cell**: `null` for a row without an id; the grid keeps the 56 px track, so columns stay aligned (FR-005).

## R5. The Listen menu

- **Decision**: a pure `trackListenItems({ id, artist, title })` in `src/ui/listen.ts` returns, in order: "Play on Spotify"
  (`spotify:track:{id}`, `app: true`) and "Open Spotify web page" (`https://open.spotify.com/track/{id}`) when `id` is not null, then
  `digLinks(artist, title)` (Beatport, Bandcamp, Discogs, SoundCloud, YouTube). A `listenColumn(trackOf)` renders it with the Mix
  `RowMenu` (icon `headphones`, label "Listen to {artist} – {title}"), `priority: 1`, `width: '64px'`, `compact: 'trail'`: the place
  of the `spotifyLinkColumn` it replaces.
- **Sharing with the Mix (FR-011)**: both menus build their search items with `digLinks`, so a platform added there appears on every
  page. The Mix keeps its own `listenItems` (it adds Shazam and its Check answer) and its menu is unchanged (FR-008).
- **RowMenu** stays in `src/ui/mix/RowMenu.tsx` and is imported from there: moving it is not needed for the feature.
- **Alternatives**: keep the end-of-row icon and add the menu (rejected by the owner, option A).

## R6. The Overview list

- **Decision**: an Overview item is one `<a>` over the whole row (`src/ui/overview/Overview.tsx:101`); a button inside a link is
  invalid HTML. The item becomes a row of three siblings: the play button, the existing link, then the headphones menu
  (`RowMenu`, the same items as the tables).
- **Rationale**: FR-001 and FR-007 name the Overview; the owner picked both controls (2026-11-09, option B over ▶ only).
- **Alternatives**: ▶ only on the Overview (rejected by the owner: every track row the same).

## R7. Tests and checks

- **Unit**: `src/ui/listen.test.ts`: `spotifyTrackId` (Spotify id, local URI, empty), `trackListenItems` order, labels and URLs, the
  no-id case (searches only), the searches equal `digLinks` for the same name.
- **No DOM tests** (constitution). The columns are checked by `yarn regression` rows and `yarn shots` on the pages touched (Top,
  Playlist, Artist, Crate views, Overview, Mix) when the owner asks for shots.
- **No Spotify read or write**: the button and the menu are plain links; nothing is fetched until the owner opens one.
