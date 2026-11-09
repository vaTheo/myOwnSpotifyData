# Implementation Plan: Play button and Listen menu on every track list

**Branch**: `task/dev-session` | **Date**: 2026-11-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/017-track-play-button/spec.md`

## Summary

The Mix tracklist already has a ▶ button that opens the Spotify app on the track (`spotify:track:{id}`) and a headphones menu that
lists every way to open it. This round puts the same two controls on every other track list. The ▶ button is extracted into
`PlayOnSpotify` and used by both the Mix and two new table columns. `playColumn` comes first on each row (lead slot on a phone).
`listenColumn` replaces `spotifyLinkColumn` at the end of track rows. The menu items come from one pure `trackListenItems` function,
whose searches are the Mix's `digLinks`. Row clicks keep opening details, because `DataTable` already skips clicks on links and buttons.
Lists of artists and playlists keep their "Open in Spotify" icon.

## Technical Context

**Language/Version**: TypeScript ~6.0.3, Preact + `@preact/signals`

**Primary Dependencies**: none new

**Storage**: none (links built per row while drawing)

**Testing**: Vitest on pure functions (`src/ui/listen.test.ts`); `yarn regression` rows for the columns; no DOM unit tests

**Target Platform**: browser on a computer, Android phone

**Project Type**: single-page web app

**Performance Goals**: none new; the menu items are built when the menu opens, the button is one link per row

**Constraints**: tokens only, 48 px targets, no Spotify read or write, the Mix tracklist unchanged on screen

**Scale/Scope**: `src/ui/listen.ts` (new), `src/ui/components/PlayOnSpotify.tsx` (new), `src/ui/table/columns.tsx`, `src/ui/Top.tsx`,
`src/ui/Playlist.tsx`, `src/ui/Artist.tsx`, `src/ui/crate/shared.tsx`, `src/ui/overview/Overview.tsx`, `src/ui/mix/TracklistTable.tsx`,
`src/styles.css` (Overview item row), regression, docs

## Constitution Check

| Principle | Verdict |
|---|---|
| I Browser-first, no secret | Pass: UI only |
| II No Spotify reads on load | Pass: links only, nothing is fetched |
| III Library writes on a tap | Pass: no write |
| IV External sources keyless, by id | Pass: Spotify links are by id; the platform searches are links the owner opens by hand, as on the Mix today; the app makes no request |
| V IndexedDB only adds | Pass: nothing stored |
| VI Play counts from export | Pass: untouched |
| VII Every failure shown | Pass: nothing can fail (a link) |

Design guide: tokens only, 48 px targets, the existing `IconButton` and `RowMenu`. Post-design re-check: same. Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/017-track-play-button/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── track-listen.md
└── tasks.md             # /speckit-tasks, not created here
```

### Source Code

```text
src/
├── ui/
│   ├── listen.ts                      # NEW: spotifyTrackId, trackListenItems (pure)
│   ├── listen.test.ts                 # NEW
│   ├── components/PlayOnSpotify.tsx   # NEW: the Mix ▶ button, extracted
│   ├── table/columns.tsx              # playColumn, listenColumn
│   ├── Top.tsx                        # track columns: play first, listen in place of spotifyLinkColumn
│   ├── Playlist.tsx                   # same
│   ├── Artist.tsx                     # same (its track table)
│   ├── crate/shared.tsx               # play first, listen last (every Crate view)
│   ├── overview/Overview.tsx          # ▶, the item link, then the Listen menu (R6)
│   └── mix/TracklistTable.tsx         # SpotifyCell found case renders PlayOnSpotify
└── styles.css                         # Overview item as button + link + menu row
tools/shots/regression.spec.ts         # new rows
specs/003-web-first-redesign/regression.md
```

**Structure Decision**: the two controls are table columns, like every other per-row control, so `DataTable` needs no change: its
compact layout places `lead` first and `trail` last, and its row click already ignores links and buttons.

## Documentation (same batch as the code)

`docs/architecture/000-how-it-works.md` §13 (track rows, the two columns), §10 (Mix ▶ shared), `docs/architecture/100-features.md`
(row), `README.md` (owner's manual: ▶ and the Listen menu), `CHANGELOG.md`, `docs/specs/2026-11-09-track-play-button-design.md`
(listed in `docs/README.md`), `specs/003-web-first-redesign/contracts/` where they list a track table's columns. No ADR: no lasting
decision beyond the existing ones.

## Complexity Tracking

None.
