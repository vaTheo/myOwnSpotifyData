# Implementation Plan: Mixes in the Settings server table

**Branch**: `feat/settings-mixes-row` | **Date**: 2026-11-10 | **Spec**: [spec.md](spec.md)

## Design

- `pullMixes` and `pushMixes` (`src/server/sync.ts:137`, `:186`) already call `readMixStamps` (url, savedAt, deletedAt per
  server row). After a successful read, store `{ newestAt, rows }` for mixes: extend `ServerStamps` (`src/db/schema.ts:401`)
  with a `mixes` entry or add one meta key; after a push, reflect what was just written (max of the read stamps and the pushed
  savedAt/deletedAt; rows adjusted). Optional fields need no `DB_VERSION` bump (ADR-05).
- `connectedView` (`src/model/state.ts:310`) adds the mixes row after `DATASETS`: localAt from `getMixes()` and
  `getMixDeleted()` (newest savedAt / deletedAt), serverAt and rows from the stored value.
- Settings rendering: `src/ui/settings/lines.ts` and the server section component; the row's label is `mixes`.
- Disconnect / Remove server data: clear the mixes value where `SERVER_STAMPS_META` is cleared today.

## Constitution Check

No new request, no Spotify call, no store added, failures unchanged (inline in the card). PASS.

## Docs (same commit)

Inventory row F41, how-it-works §16 (Settings server card), README owner's manual (Settings › Server), CHANGELOG,
`src/server/CLAUDE.md` if it lists the table rows, screens contract if it lists the rows.
