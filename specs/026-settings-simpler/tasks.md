# Tasks: A simpler Settings page (spec 026)

- [x] T001 [US1] Pure closed-line function(s) with tests in src/ui/settings/ (reuse src/model/updateLines.ts), worst condition first
- [x] T002 [US1] SettingsItem component (controlled details/summary, name + closed line + main button, body = today's content) in src/ui/settings/SettingsItem.tsx; styles with tokens
- [x] T003 [US3] Sync status block replacing src/ui/settings/UpdatesSection.tsx (switch, Spotify line, server line with Retry; "Up to date" only with nothing waiting)
- [x] T004 [US1][US2][US4] Wrap each section (Account, Sync, History, Audio, Reach, Server, Danger zone) in SettingsItem; open on arrival when failing or running; group headings in src/ui/settings/SettingsPage.tsx; remove the section index (and sections.ts helpers no longer used)
- [x] T005 [US4] Links into a Settings section land on the item, opened
- [x] T006 Update regression tests and rows touching Settings in tools/shots/regression.spec.ts and specs/003-web-first-redesign/regression.md; run the affected rows
- [x] T007 Docs in the same commit: screens.md §13, how-it-works Settings section, docs/architecture/100-features.md F42, CHANGELOG, README, design guide if needed
- [x] T008 yarn typecheck, lint, test, invariants exit 0
- [ ] T009 Design review by a separate reviewer per plan step 8 (shots on settings pages, 0 findings, screenshots checked at four widths, light and dark)
- [x] T010 Fix round 1 (reviews 2026-11-10): Automatic updates switch at full target size, closed lines state-only, one alert per failure, Danger zone h2, tonal main buttons at rest, SC-001 measured and revised, no 0 for a missing count, changes waiting named in every server state, items open when a job starts while open, retired tests named as such
