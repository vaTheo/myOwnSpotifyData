# Implementation Plan: Add a Spotify link to a track that was not found

**Branch**: `worktree-sortable-table` | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/011-mix-manual-spotify-link/spec.md`

## Summary

A row's Spotify answer is already `row.spotify: { id, url } | 'not-found'` (set by Check on Spotify, cleared by a rename, kept
across saves and syncs by `keepStoredAnswers`). A pasted link sets the same field, so counts, the Spotify cell link, Play on
Spotify and Create playlist (`storedUri`) work with no change. New pieces: a pure parser that turns pasted text into a track id
(`parseSpotifyTrackLink`), a pure row update (`linkedRow`), a state action `linkMixRowSpotify(index, text)` / `unlinkMixRowSpotify(index)`,
and a small inline form on the row (opened from the red mark, and from the found mark of a hand-linked row to replace or remove).
Create playlist also dedupes URIs so one track is added once. A hand-linked row is told apart from a checked one by a
`manual: true` flag on the answer's row (`spotifyBy?: 'owner'`), so Remove link returns it to **not found** and replace/remove is
offered only on hand-linked rows.

## Technical Context

**Language/Version**: TypeScript ~6.0.3, Preact + `@preact/signals`

**Primary Dependencies**: none new

**Storage**: one optional field on `TracklistRow`: `spotifyBy?: 'owner'` (no `DB_VERSION` bump, ADR-05); synced rows validated in `src/server/validate.ts` (accept the field)

**Testing**: Vitest, pure functions only (parser, linkedRow, dedupe, rename clears it); Playwright regression row on the demo

**Target Platform**: browser on a computer, Android phone

**Project Type**: single-page web app

**Performance Goals**: none

**Constraints**: no Spotify read (ADR-02), no lookup by name or by id to verify (ADR-04), no write (ADR-03: Create playlist is still the one write, on a tap); 48 px controls; tokens only

**Scale/Scope**: `src/features/mix/{spotifyCheck,lookup,createPlaylist,keepReview}.ts`, `src/model/state.ts`, `src/ui/mix/TracklistTable.tsx`, `src/server/validate.ts`, `src/db/schema.ts`, regression and docs

## Constitution Check

| Principle | Verdict |
|---|---|
| I Browser-first, no secret | Pass |
| II No Spotify reads on load | Pass: no read at all |
| III Library writes on a tap | Pass: Create playlist unchanged, still a tap and gated by scope |
| IV External sources keyless, by id | Pass: the pasted id is stored, never verified or looked up by name |
| V IndexedDB only adds | Pass: one optional field, no store, no bump |
| VI Play counts from export | Pass |
| VII Every failure shown | Pass: a refused paste shows an inline message under the field |

Post-design re-check: same. Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/011-mix-manual-spotify-link/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── link-paste.md
└── tasks.md             # /speckit-tasks, not created here
```

### Source Code

```text
src/
├── db/schema.ts                     # TracklistRow.spotifyBy?: 'owner'
├── server/validate.ts               # accept spotifyBy ('owner') on pulled rows
├── features/mix/
│   ├── spotifyLink.ts               # NEW: parseSpotifyTrackLink(text) -> id | null; linkedRow(row, id, now); unlinkedRow(row)
│   ├── spotifyLink.test.ts          # NEW
│   ├── lookup.ts                    # editTracklistRow: a rename also drops spotifyBy
│   ├── keepReview.ts                # keep spotifyBy with spotify (mergeKeepingReview); spotifyCheck answers never overwrite a defined spotify (already: rowsToCheck/answers apply to undefined only)
│   ├── createPlaylist.ts            # dedupe uris (Set) so a track is added once
│   └── CLAUDE.md                    # local rule: a pasted link is stored by id, never verified
├── model/state.ts                   # linkMixRowSpotify, unlinkMixRowSpotify
└── ui/mix/
    ├── TracklistTable.tsx           # red mark -> button opening the inline form; hand-linked found mark offers Replace / Remove
    ├── LinkForm.tsx                 # NEW: field, Link / Cancel (/ Remove link), inline message
    └── rowText.ts                   # nothing: playLinks/Spotify cell already read row.spotify
```

**Structure Decision**: parse and row rules are pure and tested in one new module; the UI form is its own small component so `TracklistTable.tsx` only decides when to open it.

## Complexity Tracking

None.
