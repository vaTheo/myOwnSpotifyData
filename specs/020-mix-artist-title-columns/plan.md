# Implementation Plan: Separate Artist and Title columns in the Mix tracklist

**Branch**: `feat/mix-artist-title-columns` | **Date**: 2026-11-10 | **Spec**: [spec.md](spec.md)

## Summary

In `src/ui/mix/TracklistTable.tsx` the `title` column (`TitleCell`: `nameOf(row)` plus the second line) becomes two columns:
`artist` (priority 1, the artist text, compact `subtitle`) and `title` (priority 1, the track name and the unchanged second line,
compact `title`). `SortId` in `src/ui/mix/tracklistSort.ts` gains `'artist'`; `'title'` sorts by `row.title` only; both first
direction `asc`; `CHOICES` offers "Artist" and "Title". Gap rows (`row.gap`) keep returning `null` from `sortValue`. A saved choice the rows no
longer allow already falls back through `effectiveSort`. The tooltip (`title:`) and every aria name keep `nameOf(row)`.

## Technical Context

TypeScript ~6.0.3, Preact; no dependency, no storage change, no `DB_VERSION` bump; Vitest on `tracklistSort.test.ts`; Playwright regression
rows for the table; `yarn shots` only when the owner asks (memory: no automatic shots). Scope: `src/ui/mix/TracklistTable.tsx`,
`src/ui/mix/tracklistSort.ts` (+ test), `src/styles.css` (widths, the phone item lines), `tools/shots/checks.ts` (header names),
regression rows, docs.

## Constitution Check

I–VII: pass (UI only; nothing read, written or stored). Design guide: tokens only, 48 px targets unchanged. Complexity Tracking: none.

## Documentation (same commit)

how-it-works §10 and §13 (the Mix table's columns), `specs/003-web-first-redesign/contracts/screens.md` (the Mix table, sort choices),
`docs/architecture/100-features.md` (inventory row), `README.md` (owner's manual), `CHANGELOG.md`, the regression row text, and
`docs/specs/2026-11-10-mix-artist-title-columns-design.md` listed in `docs/README.md`. Older dated specs and plans under `docs/specs/`
and `docs/plans/` are history: not edited.
