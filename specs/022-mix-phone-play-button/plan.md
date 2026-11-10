# Implementation Plan: Play button on the phone Mix row

**Branch**: `feat/mix-phone-play-button` | **Date**: 2026-11-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/022-mix-phone-play-button/spec.md`

## Summary

`SpotifyCell` in `src/ui/mix/TracklistTable.tsx` draws ▶ (`PlayOnSpotify`) only on a computer; its phone branch prints "On
Spotify". A pure `foundSpotifyId(row)` in `src/ui/mix/rowText.ts` (the Check answer's id of a named row, else null) becomes the one
rule; the Listen column's phone cell (`compactCell`) draws ▶ from it before `ListenIcons`, and the computer's Spotify cell reads the
same rule. "On Spotify" and the ⋮ menu stay.

## Technical Context

**Language/Version**: TypeScript ~6.0.3, Preact

**Primary Dependencies**: none new

**Storage**: none (display only; no `DB_VERSION` bump)

**Testing**: Vitest on `foundSpotifyId` (`src/ui/mix/rowText.test.ts`), test-first; `yarn regression` row M06

**Target Platform**: browser on a computer, Android phone

**Project Type**: single-page web app

**Constraints**: no Spotify read or write added; the ▶ is the existing app link opened on a tap

**Scale/Scope**: `src/ui/mix/rowText.ts`, its test, `src/ui/mix/TracklistTable.tsx`, `tools/shots/regression.spec.ts` (M06), docs

## Constitution Check

| Principle | Verdict |
|---|---|
| I Browser-first, no secret | Pass: a link only |
| II No Spotify reads on load | Pass: nothing is fetched |
| III Library writes on a tap | Pass: no write |
| IV External sources keyless, by id | Pass: the link is the Spotify id |
| V IndexedDB only adds | Pass: nothing stored changes |
| VI Play counts from export | Pass: untouched |
| VII Every failure shown | Pass: nothing can fail |

Complexity Tracking empty.

## Documentation (same batch as the code)

`docs/architecture/000-how-it-works.md` §10 (the phone meta line), `docs/architecture/100-features.md` (row F38), `README.md`
(owner's manual, the Spotify paragraph), `CHANGELOG.md`, `docs/README.md` (this folder in the specs list),
`specs/017-track-play-button/spec.md` (a note on the Mix phone row), `specs/003-web-first-redesign/contracts/screens.md` (the phone
item) and `regression.md` (M06). No ADR: no lasting decision.
