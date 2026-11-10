# Tasks: A simpler Settings page (spec 026)

- [ ] T001 [US1] Pure closed-line function(s) with tests in src/ui/settings/ (reuse src/model/updateLines.ts), worst condition first
- [ ] T002 [US1] SettingsItem component (controlled details/summary, name + closed line + main button, body = today's content) in src/ui/settings/SettingsItem.tsx; styles with tokens
- [ ] T003 [US3] Sync status block replacing src/ui/settings/UpdatesSection.tsx (switch, Spotify line, server line with Retry; "Up to date" only with nothing waiting)
- [ ] T004 [US1][US2][US4] Wrap each section (Account, Sync, History, Audio, Reach, Server, Danger zone) in SettingsItem; open on arrival when failing or running; group headings in src/ui/settings/SettingsPage.tsx; remove the section index (and sections.ts helpers no longer used)
- [ ] T005 [US4] Links into a Settings section land on the item, opened
- [ ] T006 Update regression tests and rows touching Settings in tools/shots/regression.spec.ts and specs/003-web-first-redesign/regression.md; run the affected rows
- [ ] T007 Docs in the same commit: screens.md §13, how-it-works Settings section, docs/architecture/100-features.md F42, CHANGELOG, README, design guide if needed
- [ ] T008 yarn typecheck, lint, test, invariants exit 0
