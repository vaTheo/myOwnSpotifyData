# Implementation Plan: Rarely played tracks in my playlists

**Branch**: `007-rarely-played-tracks` (work on `task/general-dev`) | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

## Summary

A sixth Crate view, "Rarely played" (`#/crate/rarely-played`), lists the songs of the owner's playlists whose all-time play count is
0, 1, 2 or 3 (any combination), once per song, with the playlists they are in and an optional playlist filter. The list starts from
the **playlist entries**, not from the history rows: a never-played song has no history row, so a view built on `model.plays`
(like the other Crate views) would miss exactly the songs asked for. Play counts come from the existing `playsFor` (by id, then by
artist and title), the same number the Playlist screen shows. Everything is a pure function over the in-memory `Model`; no Spotify
read, no store change, no job.

## Technical Context

**Language/Version**: TypeScript ~6.0.3, Preact + `@preact/signals`
**Primary Dependencies**: none new
**Storage**: none; reads `Model` (`entriesByPlaylist`, `tracksByKey`, `playsFor`, `playlistsOfTrack`)
**Testing**: Vitest, pure functions next to source; no DOM tests
**Target Platform**: browser, desktop first, Android phone
**Project Type**: single static web app
**Performance Goals**: list of a 20,000-song library recomputed in under 1 s when a chip or the playlist changes (SC-002)
**Constraints**: no Spotify read; gate on `crateStatus === 'ready'` (`historySummary.version === 2`); relative imports without extension
**Scale/Scope**: about 22,500 tracks, hundreds of playlists, one view, one pure module

## Constitution Check

| Principle | Status |
|---|---|
| I. Browser-first, no secret | Pass: nothing leaves the browser. |
| II. No Spotify reads on load | Pass: reads the model only. |
| III. Writes on a tap | Pass: no write. |
| IV. External sources keyless | Pass: no external source. |
| V. IndexedDB additive | Pass: no store or field change, no `DB_VERSION` bump. |
| VI. Play counts from the history export | Pass: counts come from `playsFor`; gate is `crateStatus` (summary version 2), never row presence. |
| VII. Every failure shown | Pass: the only non-happy states are the Crate's no-history and old-import notices (`CrateEmpty`) and an inline empty message. |

No violation; Complexity Tracking is empty. Re-checked after design: unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/007-rarely-played-tracks/
├── plan.md  research.md  data-model.md  quickstart.md
├── contracts/ui.md
└── spec.md, checklists/requirements.md
```

### Source Code

```text
src/model/rarelyPlayed.ts        NEW  pure: rarelyPlayed(model, counts, playlistId) -> RareItem[]
src/model/rarelyPlayed.test.ts   NEW
src/router.ts                    add 'rarely-played' to CRATE_VIEWS (+ router.test.ts row)
src/ui/layout/titles.ts          title "Rarely played"
src/ui/crate/selections.ts       signals: rareCounts (Set<0|1|2|3>), rarePlaylist (string | null)
src/ui/crate/Rarely.tsx          NEW  the view: caption, chips, playlist menu, CrateTable
src/ui/crate/CrateView.tsx       one case in `Body`
src/ui/crate/CrateHub.tsx        a sixth card (icon, description, top track, count, setting)
docs/                            how-it-works §12–§13, inventory row F23, README, CHANGELOG, Limits
```

**Structure Decision**: keep the Crate pattern (pure model function, one view component, signals in `selections.ts`) so the table,
filters, details sheet and empty states are reused as they are.

## Design notes

1. **Source of the list.** Walk `model.entriesByPlaylist` (or one playlist's entries), look each track up in `tracksByKey`, call
   `playsFor`; `null` means 0. Keep the track when its count is in the chosen set. Group by `track.key` so a song in three playlists
   is one item holding all three playlist ids. Order: plays ascending, then first playlist's order.
2. **A synthetic play row.** `CrateItem` needs a `PlayRow`. A never-played song has none, so the item carries a built one
   (`trackId` = the track's id, or its `spotify:local:` key; `plays` = the count; name and artist from the track) which feeds
   `trackLabel`, the BPM, key and year columns and the details sheet (`CrateSheet` already falls back to the track's own sheet when
   `playsById` has no row). It is never stored.
3. **Columns.** The Crate columns plus a Plays column (`countColumn`) and a Playlists column (first name, "+2" for the rest; hidden
   on compact like Last played). No chart column (a zero has no months). Flag: none.
4. **Chips.** Four toggle chips (Never, 1, 2, 3), at least one on (turning the last one off keeps it on). Default: Never. The
   playlist menu defaults to "All playlists". Both are per-visit signals like the other views' settings.
5. **Caption.** `{n} tracks · counts as of {last import date}` from `historySummary`; empty state names the chosen counts and offers
   "Try 0 to 3 plays" when fewer than all four are on.
6. **Cost.** One pass over entries (about 22,500) with Map lookups; memoised on `Model` identity, the chosen counts and the playlist.
7. **Local files / unavailable tracks.** `TrackRow.isLocal` rows have a `spotify:local:` key and no id; `playsFor` falls to the name
   path, so a local file with a name match is counted, otherwise it is 0 and shown (spec edge case: only with a count of its own, else
   left out: the plan keeps them out unless `playsFor` found a count).

## Complexity Tracking

None.
