# Implementation Plan: Comments without their commenter's name

**Branch**: `feat/mix-hide-commenter-names` | **Date**: 2026-11-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/021-mix-hide-commenter-names/spec.md`

## Summary

Two pure functions of `src/ui/mix/rowText.ts` write a clue on the Mix screen: `originText` (the "from a comment by <author>" origin
of a candidate row) and `clueLine` (one line in a folded clue list, used by `Clues.tsx`). `originText` drops the author;
`clueLine` drops it for `kind: 'comment'` only. Nothing else changes: the worker, `toClue`, the `Clue` type and saved mixes keep
`author`.

## Technical Context

**Language/Version**: TypeScript ~6.0.3, Preact

**Primary Dependencies**: none new

**Storage**: none (display only; no `DB_VERSION` bump)

**Testing**: Vitest on the two pure functions (`src/ui/mix/rowText.test.ts`), test-first; `yarn regression` rows R02 and R03

**Target Platform**: browser on a computer, Android phone

**Project Type**: single-page web app

**Constraints**: no worker change, no schema change, clue text stays plain text

**Scale/Scope**: `src/ui/mix/rowText.ts`, its test, `tools/shots/regression.spec.ts` (R02, R03), docs

## Constitution Check

| Principle | Verdict |
|---|---|
| I Browser-first, no secret | Pass: UI text only |
| II No Spotify reads on load | Pass: nothing is fetched |
| III Library writes on a tap | Pass: no write |
| IV External sources keyless, by id | Pass: untouched |
| V IndexedDB only adds | Pass: nothing stored changes |
| VI Play counts from export | Pass: untouched |
| VII Every failure shown | Pass: nothing can fail |

Complexity Tracking empty.

## Documentation (same batch as the code)

`docs/architecture/000-how-it-works.md` §10 (the clue text), `docs/architecture/100-features.md` (row F37, "the quiet-comments
round"), `README.md` (owner's manual, the clues sentence), `CHANGELOG.md`, `docs/README.md` (this folder in the specs list),
`specs/003-web-first-redesign/contracts/screens.md` and `regression.md` (R02, R03 named the author). No ADR: no lasting decision.
