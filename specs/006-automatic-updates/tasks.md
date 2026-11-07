# Tasks: Automatic updates

**Input**: `specs/006-automatic-updates/` (spec, plan). Tests first.

- [X] T001 The chain: `createChain`, `isSpotifyDue`, `AUTO_SYNC_AGE_MS` (`src/model/autoChain.ts`, tests)
- [X] T002 The Updates lines: `updateLines` (`src/model/updateLines.ts`, tests)
- [X] T003 Wiring: `{ auto }` on `startSync`/`startLookup`/`startReach`, `runAutoChain`, `requestJob`, `autoUpdates`, Disconnect stops the chain, `main.tsx` triggers (`src/model/state.ts`, `src/main.tsx`)
- [X] T004 Settings Updates card, switch, buttons through `requestJob` (`src/ui/Settings.tsx`)
- [X] T005 Docs: ADR-12, ADR-02/04 amended, constitution 2.2.0, `CLAUDE.md`, `src/features/CLAUDE.md`, how-it-works §7 §14 §16, inventory F22, limits, README, CHANGELOG, docs map
