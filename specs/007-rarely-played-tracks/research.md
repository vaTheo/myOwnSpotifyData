# Research: Rarely played tracks

## Decision 1: start from playlist entries, not history rows
- **Decision**: build the list from `entriesByPlaylist` and `playsFor`.
- **Rationale**: the other Crate views run over `model.plays`, which only holds songs the history mentions (rows can even carry
  `plays === 0`). A never-played song has no row, so those views cannot list it. `playsFor` is also what the Playlist screen prints,
  so the numbers agree.
- **Alternatives**: filter `model.plays` and add missing tracks later (two sources, easy to disagree); a filter on the Playlist
  screen only (rejected by the owner, option A chosen).

## Decision 2: one more Crate view, reusing its table
- **Decision**: `CRATE_VIEWS` gets `rarely-played`; the view uses `CrateTable`, `crateColumns`, `CrateSheet`, `CrateEmpty`.
- **Rationale**: same gate (`crateStatus`), filters, sorting, details and pagination for free; the owner already knows the screen.
- **Alternatives**: a new top-level screen (more navigation to build, no gain).

## Decision 3: counts are exact and combinable
- **Decision**: chips for 0, 1, 2, 3; at least one on; default Never.
- **Alternatives**: "up to N" slider (owner's default was chips).

## Decision 4: what a play is
- **Decision**: the history importer's existing rule, through `PlayRow.plays` (credited plays; short plays are not credited). No new
  threshold and skips are not added.
- **Rationale**: the same number everywhere (Crate, Playlist, details).

## Decision 5: dedupe by track key
- **Decision**: one item per `track.key`; a relinked copy with another id is a second item (accepted, matches the playlist screen).

## Open items
None.
