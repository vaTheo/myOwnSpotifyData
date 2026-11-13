# Data model: spec 030

Nothing is stored. No IndexedDB store, field or version changes (ADR-05). The state below lives in module-level signals for the session and resets on reload.

| State | Where | Change |
|---|---|---|
| Open Crate view | the address (`#/crate/<view>`) | none; the switch links to it |
| View settings (window, unplayed-for, order, year and period, play counts and playlist) | `src/ui/crate/selections.ts` | none |
| Sort and filter of each view | one pair of signals per view file | none |
| Artists filter text | `artistFilter` in `src/ui/artistSelections.ts` | one signal replaces `filter` (Artists.tsx) and `radarFilter` |
| Running job link | `activeJobs` in `src/ui/jobs.ts` | `href` names the Settings item |

Derived, pure:

- `viewSwitchItems(current: CrateView)` → six `{ view, label, href, current }` in `CRATE_VIEWS` order.
- `topCaption(kind, comparing, hasPlays)` → one line of text.
