# Implementation Plan: Simpler mix tracklist table

**Branch**: `worktree-sortable-table` | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/010-mix-table-simplify/spec.md`

## Summary

Take columns and controls out of the Mix table (`TracklistTable.tsx`), merge Clips into Confidence, and give each row direct
links. "Validated" stops being a state: every track counts as kept, so the Validate button, the Review sort, the To review and
Validated chips, the "K validated" counts and the Create playlist "Validated only / All tracks" choice all go; the optional
`validated` field stays in the schema and in sync validation, unread. The Spotify cell's link becomes the app link
(`spotify:track:<id>`) on every device; the Listen menu's duplicate "Open in Spotify app" goes. Two new inline icon links, Shazam
and SoundCloud, sit in the Listen cell beside the menu: Shazam from `row.shazamUrl`, SoundCloud from the existing search link
(`digLinks`), since no scan carries a per-track SoundCloud page.

## Technical Context

**Language/Version**: TypeScript ~6.0.3, Preact + `@preact/signals`

**Primary Dependencies**: none new (two brand glyphs are inline SVG paths in `src/ui/icons.tsx`)

**Storage**: none; no schema change (`validated` stays optional and ignored)

**Testing**: Vitest, pure functions only; Playwright regression updated (rows touching Validate, chips, the Create playlist choice)

**Target Platform**: browser on a computer, Android phone

**Project Type**: single-page web app

**Performance Goals**: unchanged

**Constraints**: tokens only; no Spotify read; row actions keep acting on `l.index`; no name lookup (ADR-04): the SoundCloud icon
is a plain search link; app links open in place, not in a new tab

**Scale/Scope**: `src/ui/mix/*`, `src/features/mix/{review,createPlaylist,mixList}.ts`, `src/model/state.ts`, demo, regression, docs

## Constitution Check

| Principle | Verdict |
|---|---|
| I Browser-first, no secret | Pass: UI only |
| II No Spotify reads on load | Pass: none added |
| III Library writes on a tap | Pass: Create playlist stays a tap; it now adds every identified row (the owner's rule that all tracks are kept) |
| IV External sources keyless | Pass: icons are links, no lookup |
| V IndexedDB only adds | Pass: no store or field change |
| VI Play counts from export | Pass: not touched |
| VII Every failure shown; missing number never zero | Pass: missing confidence or hits print nothing and sort last |

Post-design re-check: same. Complexity Tracking empty.

Note: the worktree carries uncommitted edits to `createPlaylist.ts`, `mixList.ts`, `review.ts` that start the same direction
(`validated !== false`). This round replaces them; implementation starts from them or from a clean tree, the owner's call.

## Project Structure

### Documentation (this feature)

```text
specs/010-mix-table-simplify/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── row-links.md
└── tasks.md             # /speckit-tasks, not created here
```

### Source Code

```text
src/
├── features/mix/
│   ├── review.ts            # drop toReview/validated filters and the "validated" count in reviewLine
│   ├── createPlaylist.ts    # tracksToAdd = identified rows; CreateChoice and defaultChoice removed
│   └── mixList.ts           # saved chip without "· N validated"
├── model/state.ts           # drop toggleValidated and the Create-playlist choice state
└── ui/
    ├── icons.tsx            # shazam and soundcloud glyphs
    └── mix/
        ├── TracklistTable.tsx   # no Source, In your library, Clips columns; Review = Delete; merged Confidence; Listen cell icons
        ├── tracklistSort.ts     # drop review, clips, library, source ids; confidence stays
        ├── rowText.ts           # playLinks: one Spotify app link; Shazam and SoundCloud link helper
        ├── CreatePlaylistCard.tsx # no Validated-only segmented choice
        └── ReviewHead.tsx       # line without validated
```

**Structure Decision**: reuse the round-009 sort module and `playLinks`; remove, do not add layers.

## Complexity Tracking

None.
