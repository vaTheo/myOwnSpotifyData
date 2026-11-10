# Implementation Plan: A song deleted from a saved mix is deleted on every device

**Branch**: `fix/mix-row-delete-sync` | **Date**: 2026-11-10 | **Spec**: [spec.md](spec.md)

## Summary

Two causes (spec "Cause"): a row change lives in memory until **Save mix**; and a pull refreshes `savedMixes` but not the
open mix, so a later save (the automatic check included) re-sends the old rows with a newer `savedAt`. Fix: every row change
of a **saved** mix saves it (the `saveMix` path: `putMix`, `loadSavedMixes`-equivalent refresh, `queueServerPush(['mixes'])`);
after a pull that brought `mixes`, a newer stored copy of the open mix replaces the open rows unless the screen holds a change
not yet saved (Q2 A: then last write wins, as today).

## Technical Context

Preact + TypeScript ~6.0.3, signals in `src/model/state.ts`, IndexedDB `mixes` store (`putMix`, `getMixes`), server sync
`src/server/sync.ts` (`planMixes`, last write wins by `savedAt` per url). Tests: Vitest next to source, no DOM tests;
Playwright regression rows in `specs/003-web-first-redesign/regression.md`.

## Design

- **Saved mix** = the open url is in `savedMixes`. A lookup never saved stays in memory (FR-006).
- **Auto-save** (FR-001, FR-002): `deleteMixRow`, `editMixRow`, `linkMixRowSpotify` (when it links), `unlinkMixRowSpotify`
  call one helper that runs the `saveMix` path when the mix is saved. Failures go to `mixError` (inline, FR-005).
  Fire-and-forget from the UI is fine; saves of one mix must not interleave out of order (chain them or let the last win
  by `savedAt` order). `addMixRow` does not save the blank row; its Edit's Save does.
- **Open copy stamp**: keep the `savedAt` of the copy the open screen last loaded or saved (`openMix`, `saveMix`, and the
  refresh). Keep a "changed since" flag set by any in-memory change of `mixRows` that is not saved (imports, worker results
  merged, an editor open counts too if the UI can tell the model cheaply; otherwise rely on the auto-save).
- **Refresh after pull** (FR-003): in `startServerPull`, after `loadSavedMixes()` when `pulled` holds `mixes`: if a mix is
  open, its stored copy has `savedAt` > the open stamp, and nothing is changed since, set `mixRows`, `mixRemoved` and the
  playlist fields from the stored copy, bump `mixRowsReplaced`, update the stamp. Do not close the mix, do not clear
  `mixError` beyond what `loadSavedMixes` already does.
- **No stale save** (FR-004): follows from the refresh; `keepChecks(open)` and `saveMix` keep saving the open rows.
  A test pins: pull newer → auto check saves the newer rows.

## Constitution Check

No Spotify read or write added (ADR-02, ADR-03); IndexedDB unchanged (ADR-05, no `DB_VERSION` bump); no new `confirm()`;
failures inline; no dependency. PASS.

## Docs (same commit)

Inventory row F40 (`docs/architecture/100-features.md`), how-it-works §10 (Mix) and §16 (sync), README owner's manual
(Save mix no longer needed after a row change), CHANGELOG, Limits and roadmap (two devices editing one mix at once: last
write wins), regression row M07, `src/features/mix/CLAUDE.md` / `src/server/CLAUDE.md` if they state the Save-only rule,
comments in `state.ts` that say "Saved with Save mix".
