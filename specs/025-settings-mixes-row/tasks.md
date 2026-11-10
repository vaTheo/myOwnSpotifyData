# Tasks: Mixes in the Settings server table

- [x] T001 [US1] Tests first in src/server/sync.test.ts: a pull and a push record the server's newest mix time and live row count from the stamps they read (tombstone counts in time, not in rows); a failed read leaves the old value; request count unchanged
- [x] T002 [US1] Record the value in src/server/sync.ts (pullMixes, pushMixes) and its type in src/db/schema.ts
- [x] T003 [US1] Tests + code: connectedView in src/model/state.ts adds the mixes row (localAt from saved and deleted mixes, empty when none); cleared on disconnect / Remove server data
- [x] T004 [US1] Render the row in src/ui/settings (lines.ts and the server section); pure tests for any line text
- [x] T005 Docs: inventory F41, how-it-works §16, README, CHANGELOG, folder CLAUDE.md / screens contract lines; spec Status → Built
- [x] T006 `yarn typecheck && yarn lint && yarn test` exit 0; `yarn regression` rows that cover Settings › Server, if any
