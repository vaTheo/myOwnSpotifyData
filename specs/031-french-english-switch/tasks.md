# Tasks: The web app in French, with a French / English switch (spec 031)

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/language.md](contracts/language.md), [contracts/glossary.md](contracts/glossary.md), [quickstart.md](quickstart.md)

Tests: unit tests beside the source and regression rows are part of the plan, so each story carries them, written first. After every task: `yarn typecheck && yarn lint && yarn test`, read by exit code. One commit per task unless said otherwise, docs in the same commit.

Rules that hold for every task that moves texts (T010 to T026):

- An English text goes to `src/i18n/en.ts` word for word (FR-003); its French text goes to `src/i18n/fr.ts` in the same commit, with the names of [contracts/glossary.md](contracts/glossary.md) and the typography of research R10.
- A text is read from `msg()` when drawn; a module constant holding text becomes a function (research R3).
- A text with a value is a function entry; a counted noun uses its `n.*` entry (research R2).
- A number or a date goes through `fmt` (research R5).
- Track, artist, album, playlist and mix names are passed in as values, never changed (FR-010).
- Existing tests keep their assertions. A task that needs to edit one stops and says why.
- Not moved: log and console text, text sent to Spotify, the server or the worker, error bodies received (research R9).

## Phase 1: Setup

- [x] T001 Confirm the baseline is green before any change: `yarn typecheck && yarn lint && yarn test` exit 0 on `feat/french-english-switch`

## Phase 2: Foundational

**Blocks every story.**

- [x] T002 Create src/i18n/lang.ts with tests first in src/i18n/lang.test.ts: `type Lang = 'en' | 'fr'`; pure `initialLang(saved: string | null, preferred: readonly string[]): Lang` (a saved `'en'` or `'fr'` wins; any other saved value counts as absent; else `'fr'` when `preferred[0]` starts with `fr`, case-insensitive; else `'en'`; an empty list gives `'en'`); `readSavedLang()` and `saveLang(l)` on the `localStorage` key `lang` in a try/catch like `keyNotation` in src/model/state.ts:1026; the signal `lang` set from `initialLang(readSavedLang(), navigator.languages ?? [navigator.language])`, `'en'` when `navigator` is absent (vitest); `setLang(l)` sets the signal, saves, and sets `document.documentElement.lang` when `document` exists; the first-visit rule saves nothing
- [x] T003 Create src/i18n/en.ts (`export const en = { ... }`, starting with the switch's own texts: "Language", "This device", "Kept on this device.", the two fixed names "Français" and "English"), src/i18n/fr.ts (`export const fr: Messages = { ... }`), src/i18n/index.ts (`type Messages = typeof en` widened so string entries are `string` and function entries keep their signature; `msg(): Messages` reading `lang.value`; re-exports of `lang`, `setLang`, `Lang`)
- [x] T004 [P] Create src/i18n/fmt.ts with tests first in src/i18n/fmt.test.ts: `fmt.int(n)`, `fmt.date(ms)` (`dateStyle: 'medium'`), `fmt.time(ms)`, `fmt.dateTime(ms)`, each reading `lang.value` and using `en-GB` or `fr-FR`; tests pin "1,234" and "16 Nov 2026" in English, "1 234" (narrow no-break space) and "16 nov. 2026" in French; the options of each helper match the calls they replace in src/ui/format.ts:21-36 and src/features/mix/worker.ts:461-487
- [x] T005 Create src/i18n/catalogue.test.ts: walks `en` and `fr` together; fails on a key in one only, on an empty string, on a function entry returning empty for 0, 1 or 2 (called with numbers or sample strings by arity), and on a French string equal to its English one unless it is in a same-text allow-list in the test ("Mix", "Top", "Crate", "BPM", "Playlists", "Import", "Spotify", "English", "Français" and the names kept in contracts/glossary.md)
- [x] T006 Set `document.documentElement.lang` from `lang.value` at start in src/main.tsx, before the first draw (FR-016); index.html stays `lang="en"`
- [x] T007 Add counted-noun entries `n.track`, `n.play`, `n.artist`, `n.playlist`, `n.year`, `n.song`, `n.mix` and the others `plural(n, word)` is called with (list them with `grep -rn "plural(" src`) to src/i18n/en.ts and src/i18n/fr.ts: English output identical to `plural()` in src/ui/format.ts:51 (`fmt.int(n)` + the word + "s" unless 1); French singular for 0 and 1; tests in src/i18n/catalogue.test.ts pin « 0 titre », « 1 titre », « 2 titres » — done for track, play, artist, playlist, year, month, day, song, file, row; the other words `plural()` is called with join in T012, with the sentence they belong to

**Checkpoint**: `yarn test src/i18n` green; nothing on screen has changed.

## Phase 3: US2 (P1) Switch between French and English

**Goal**: a Language choice in Settings, on the sign-in screen and on the Connect screen; the pick applies at once and is kept on the device.

**Independent test**: quickstart steps 1 and 3.

- [x] T008 [US2] Add the group `{ id: 'device' }` ("This device") after `devices` and the item `{ id: 'language', group: 'device' }` to src/ui/settings/sections.ts; `SETTINGS_GROUPS` and `SETTINGS_ITEMS` keep ids only and their labels are read through new `groupLabel(id)` and `itemLabel(id)` from `msg()`; update every reader of `.label` (find with `grep -rn "SETTINGS_ITEMS\|SETTINGS_GROUPS" src`) and src/ui/settings/sections.test.ts for the new group and item only
- [x] T009 [US2] Create src/ui/settings/LanguageSection.tsx (two choices "Français" and "English" always written so, the current one marked with `aria-pressed` or the pattern the Key notation choice uses, `onClick` → `setLang`, the line "Kept on this device.") and draw it in src/ui/settings/SettingsPage.tsx at `#/settings/language`; a small `LanguageSwitch` component in the same file reused at the top right of the card in src/ui/signin/SignInGate.tsx and src/ui/Connect.tsx; styles in src/styles.css, tokens only, 48 px targets
- [x] T010 [US2] Regression rows G01 to G05 (G05, the first visit, was written here too, so T027 only re-checks it) in specs/003-web-first-redesign/regression.md and tests in tools/shots/regression.spec.ts: G01 pick Français in Settings on a drawn screen, the item's label and the navigation change with no reload and the address stays; G02 reload keeps French and `document.documentElement.lang` is `fr`; G03 back to English restores the labels; G04 the small switch on the sign-in screen and on Connect changes the screen and survives a reload; a switch makes no request to a Spotify or server host (route listener)
- [x] T011 [US2] Docs with the code: specs/003-web-first-redesign/contracts/screens.md §13 (the group and the item), docs/architecture/000-how-it-works.md §13 (Settings) and a new section "Languages" (the catalogue, `msg()`, the signal, the saved choice, the first-visit rule, what stays out)

**Checkpoint**: the switch works; only its own texts and the Settings labels change.

## Phase 4: US1 (P1) The whole app in French

**Goal**: with French chosen, every text the app writes is French; English is unchanged.

**Independent test**: quickstart steps 4 to 9.

- [x] T012 [US1] Route every direct `toLocaleString`, `toLocaleDateString`, `toLocaleTimeString` and `new Intl.DateTimeFormat` call under src/ (about 60, list with `grep -rnE "toLocale(String|DateString|TimeString)\(|new Intl\.DateTimeFormat" src`) through `fmt`; src/ui/search/searchIndex.ts:37 drops its fixed `en-GB` and builds its date when called; src/ui/table/sort.ts keeps its collator (research R13); replace `plural()` in src/ui/format.ts and `count()` in src/features/like/likePlaylist.ts:178 by the `n.*` entries and delete both helpers when no caller is left
- [x] T013 [US1] Move the texts of the frame and navigation: src/ui/layout (`titles.ts`: `CRATE_TITLE` becomes `crateTitle(view)`, `screenTitle` reads `msg()`; `Nav.tsx`, `ScreenTabs.tsx`, `TopBar.tsx`, `AppFrame.tsx`, `ListDetail.tsx`, `SideSheet.tsx`), src/app.tsx, src/main.tsx, src/ui/components, src/ui/icons.tsx (the accessible names), src/ui/ActivityButton.tsx, src/ui/jobs.ts
- [x] T014 [P] [US1] Move the texts of tables and filters: src/ui/table (`columns.tsx` headings read when drawn, `DataTable.tsx`), src/ui/filters, src/ui/details, src/ui/charts (`series.ts`, `YearMonthGrid.tsx`, `MonthBars.tsx`, `Meter.tsx`; month names from `fmt`), src/ui/format.ts
- [x] T015 [P] [US1] Move the texts of Settings: src/ui/settings (`lines.ts`, `statusLines.ts`, `itemLines.ts`, `chain.ts`, every `*Section.tsx`, `SyncStatus.tsx`, `SettingsItem.tsx`, `DangerZone.tsx`), src/model/updateLines.ts; src/ui/settings/statusLines.ts:192 compares a code, not the sentence "Up to date" (research R4)
- [x] T016 [P] [US1] Move the texts of the Crate: src/ui/crate (the hub, the six views, `ViewSwitch.tsx`, `labels.ts`, `shared.tsx`, `CrateEmpty.tsx`), using « Crate » (the name stays), « Rotation intensive », « Pépites oubliées », « Classiques », « Par année », « Taux d’écoute complète », « Rarement joués »
- [x] T017 [P] [US1] Move the texts of Overview, Top and Search: src/ui/overview (`blocks.ts`, `Overview.tsx`), src/ui/Top.tsx, src/ui/top, src/ui/search (`SearchView.tsx`, the context lines of `searchIndex.ts`)
- [x] T018 [P] [US1] Move the texts of the Library: src/ui/Playlists.tsx, src/ui/Playlist.tsx, src/ui/playlist, src/ui/Artists.tsx, src/ui/Artist.tsx, src/ui/UnderRadar.tsx, src/ui/artistSelections.ts; « Connus » stays a heading at the bottom, listeners and fans stay side by side, a missing number is never printed as zero
- [x] T019 [P] [US1] Move the texts of Mix: src/ui/mix (`TracklistTable.tsx`, `MixListPane.tsx`, `MixDetail.tsx`, `Workspace.tsx`, `rowText.ts`, `CreatePlaylistCard.tsx`, `LinkForm.tsx` and the rest), src/features/mix (`worker.ts`, `queue.ts`, `trackid.ts`, `oembed.ts`, `parse.ts`, `spotifySearch.ts` messages shown on screen); the name and description of the created playlist in src/features/mix/createPlaylist.ts stay as they are (FR-013); a reason written by the worker is shown as received inside a catalogue sentence (FR-014)
- [x] T020 [P] [US1] Move the texts of sign-in, Connect and Import: src/ui/signin (`gate.ts`, `SignInGate.tsx`, `ServerLinkForm.tsx`), src/ui/Connect.tsx, src/ui/Import.tsx, src/history (`importer.ts`, `process.ts`, `files.ts`)
- [x] T021 [US1] Move the texts built below the UI, part 1: src/model/state.ts (the 17 `confirm()` questions, banners, notices; `ACCOUNT_SWITCH_CONFIRM`, `ACCOUNT_SWITCH_NOTICE`, `ACCOUNT_SWITCH_STOPPED`, `ACCOUNT_MISMATCH_NOTICE` of src/sync/runner.ts become catalogue entries read when used; src/model/state.ts:408 compares a code, not `res.message`), src/model/banner.ts callers, src/sync (`runner.ts` `describeError`, `items.ts`, `planner.ts`), src/spotify (`errors.ts`, `quotaLock.ts`, `client.ts`: the app's own sentence around a received Spotify message), src/auth (`session.ts`, `pkce.ts`, `browser.ts`)
- [x] T022 [US1] Move the texts built below the UI, part 2: src/server (`client.ts`, `session.ts`, `sync.ts`, `validate.ts`, `sharedFacts.ts`, `datasets.ts`, `scopeBrowser.ts`: only what reaches the screen), src/features failure values (`lookup.ts`, `reccobeats.ts`, `musicbrainz.ts`, `wikidata.ts`, `deezer.ts`, `jsonp.ts`, `rekordbox.ts`, `rekordboxImport.ts`, `reachRun.ts`, `shared.ts`), src/features/like/likePlaylist.ts (agreement written per language, no "was / were" by hand), src/util/errors.ts, src/db/repo.ts; clients still never throw
- [x] T023 [US1] Move the demo's on-screen app texts in src/dev (FR-018); the demo's music data stays as it is; tools/shots/pages.ts texts injected into states (for example line 418) stay English because the regression runs in English
- [x] T024 [US1] Add the local lint rule to the ESLint config (`eslint.config.*`), with no new package: under src/, outside `*.test.ts`, refuse JSX text holding a letter and string literals in `aria-label`, `title`, `placeholder`, `alt`; allow-list by comment for the fixed names "Français" and "English"; `yarn lint` exit 0 proves T013 to T023 left none
- [x] T025 [US1] Sweep for leftovers in `.ts` files the lint rule does not see: `python3 -I` the scratch counter used for research (literals of two words under src/, tests and src/i18n left out) and read every hit; each is moved, or is one of: a class name, a log line, a key, a text sent outside; report the count before and after
- [x] T026 [US1] Regression rows G06 to G08 and tests in tools/shots/regression.spec.ts, in French: G06 a "0", a "1" and a "2" count on the demo read « 0 titre », « 1 titre », « 2 titres » and a number reads « 1 234 »; G07 a confirm question (Disconnect) is French and names the same consequence; G08 a track, artist, playlist and mix name are identical in both languages

**Checkpoint**: `yarn typecheck && yarn lint && yarn test && yarn regression` exit 0; English screens unchanged.

## Phase 5: US3 (P2) The right language on a first visit

**Independent test**: quickstart step 2.

- [x] T027 [US3] Regression row G05 and test in tools/shots/regression.spec.ts: a context with `locale: 'fr-FR'` and empty storage opens in French and `localStorage.getItem('lang')` is null after a reload; the default `en-GB` context opens in English; a saved `'en'` wins in the `fr-FR` context

## Phase 6: Polish and cross-cutting

- [x] T028 Add a French project to tools/shots/playwright.config.ts (`locale: 'fr-FR'`, the same pages and four widths, its own output folder); tools/shots/summary.ts and tools/shots/contact-sheet.ts report it apart
- [x] T029 Run `yarn shots`, `yarn shots:summary`, `yarn shots:sheet` (owner's OK 2026-11-16): 0 findings in both languages; read the French pictures at the four widths; fix a cut or wrapped label by a shorter French text first, by a style in src/styles.css only when the English screen stays the same (FR-015, SC-005)
- [x] T030 [P] Write docs/architecture/700-adr/ADR-18-two-languages-typed-catalogue.md (decision, why no library, the three nets, the limit of research R4) and link it both ways from docs/architecture/700-adr/README.md, ADR-06 and .specify/memory/constitution.md (tooling section, version bump)
- [x] T031 [P] Docs sweep: docs/dev-guide/000-contributing.md ("One change, several files": a new text is two catalogue entries), docs/dev-guide/100-design-guide.md (French typography, the longer-text rule), docs/architecture/100-features.md (a new row), docs/architecture/800-limits-roadmap.md (a failure message keeps its language until its job runs again; the worker and the sign-in email stay English), CLAUDE.md (one rule line and one routing row for `src/i18n/`, at most 150 lines), a new src/i18n/CLAUDE.md with its AGENTS.md link, README.md (owner's manual: choosing the language), CHANGELOG.md, docs/README.md (the new pages), the spec under docs/specs/ as the earlier rounds did
- [x] T032 Final checks: `yarn typecheck && yarn lint && yarn test`, `yarn regression`, `yarn invariants`, each read by exit code; quickstart by hand on the demo in both languages; a file-to-doc map in the report
- [x] T033 Reviews by separate reviewers: one reads the diff against spec.md and contracts/language.md (FR-001 to FR-018, no English text reworded); one reads src/i18n/fr.ts against src/i18n/en.ts and contracts/glossary.md (meaning, agreement, typography, one name per thing); findings fixed, then T032 again
- [x] T034 Public-safe check of Contributing, then show the owner the push and the PR text and wait for their OK

## Dependencies

- T001 → T002 → T003 → T005, T006, T007; T004 needs T002 only.
- Phase 3 (T008 to T011) needs Phase 2.
- T012 needs T004 and T007. T013 needs T012. T014 to T020 need T013 and are parallel with each other: different folders, but all append to src/i18n/en.ts and src/i18n/fr.ts, so each works in its own top-level key (`table`, `settings`, `crate`, `overview`, `library`, `mix`, `signin`) and they are merged one at a time.
- T021 → T022 (shared helpers), both after T013. T023 after T014 to T022. T024 after T023. T025 after T024. T026 after T025.
- T027 needs Phase 3 only. T028 → T029 need Phase 4. T030 and T031 can start after Phase 4. T032 → T033 → T034 last.

## Parallel example (Phase 4)

After T013 is merged, seven implementers can take one each of T014, T015, T016, T017, T018, T019, T020, each in its own catalogue key; the controller reviews and commits each in turn (subagents do not commit).

## Implementation strategy

- **First slice**: Phases 1 to 3. The switch exists and is kept; nearly all of the app is still English. Not worth releasing alone, but it proves the mechanism and the reactivity on a real screen.
- **Then** Phase 4 folder by folder; the branch is green after each task, and English is unchanged at every step, so the branch could be merged at any point without harm to the English app. The Language item should stay out of `main` until Phase 4 is done, so no user sees a half-French app.
- **Then** Phases 5 and 6. One PR at the end, on the owner's word.

## Counts

34 tasks: Setup 1, Foundational 6, US2 4, US1 15, US3 1, Polish 7.
