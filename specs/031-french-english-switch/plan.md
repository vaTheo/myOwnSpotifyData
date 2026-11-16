# Implementation Plan: The web app in French, with a French / English switch (spec 031)

**Branch**: `feat/french-english-switch` from main fc086a3 | **Date**: 2026-11-16 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/031-french-english-switch/spec.md`

## Summary

Every text the web app writes moves into a typed catalogue, once in English (today's words, unchanged) and once in French. The language shown is a signal, so a pick in the new Settings item "Language", or on the sign-in and Connect screens, redraws the app at once. The pick is kept on the device; with none, the browser's first language decides. Dates and numbers follow the language. No library, no stored data, no Spotify request.

The work is wide, not deep: about 1,500 texts in about 135 files, moved folder by folder, each step compiling and green.

Findings and choices: [research.md](research.md). What the user sees and what the code offers: [contracts/language.md](contracts/language.md). The French names to approve: [contracts/glossary.md](contracts/glossary.md). How to check it: [quickstart.md](quickstart.md).

## Technical Context

**Language/Version**: TypeScript ~6.0.3, Node 24

**Primary Dependencies**: Preact, @preact/signals, Vite (no new dependency: research R1, R8)

**Storage**: one `localStorage` key, `lang`; no IndexedDB change, nothing on the server

**Testing**: vitest beside the source, in English (pure functions, no DOM tests); Playwright regression on the demo (`yarn regression`, `en-GB`); `yarn invariants` against `main`; the visual loop with a French pass

**Target Platform**: desktop browser first, Android phone browser (compact window, 390 px)

**Project Type**: browser-only web app

**Performance Goals**: a switch redraws the open screen in under 1 second (SC-003); both catalogues ship in the app, no fetch on a switch

**Constraints**: tokens only (design guide, ADR-11); 48 px touch targets; no sideways page scroll; English word for word (FR-003); relative imports without extension

**Scale/Scope**: about 1,500 texts, about 135 source files edited, 1 new folder (`src/i18n/`), 1 new Settings item, 1 new ADR

## Constitution Check

| Principle | Result |
|---|---|
| I. Browser-first, no secret | Pass: no server, token or secret touched; the choice stays on the device. |
| II. No Spotify read on load | Pass: a switch reads nothing (FR-011). |
| III. Writes only on a tap | Pass: the two writes keep their text (FR-013); no write added. |
| IV. External sources keyless, by id | Pass: clients still never throw; only the wording of their failure values moves to the catalogue. |
| V. IndexedDB upgrades only add | Pass: no store, no version bump. |
| VI. Play counts only from the history export | Pass: the gates are untouched. |
| VII. Every failure is shown | Pass: every message, banner and inline failure stays, in both languages. |
| Tooling | Pass: no dependency; the lint net is a local rule in the existing config; tests beside source, no DOM test. |
| Workflow | Options were put to the owner (Q1, Q2 answered). Docs in the same commits as the code. A new ADR-18 records the decision. `yarn shots` runs this round, on the owner's OK (2026-11-16). |

Re-checked after the design: no violation, Complexity Tracking is empty.

## Decided by the owner (2026-11-16)

1. **Research R4**: a failure message already on screen keeps its language until its job runs again ("ok for the 3 points"). The spec's edge case is amended.
2. **Research R5**: English dates are fixed to the British form ("16 Nov 2026") on every device. FR-008 says so.
3. **Glossary**: [contracts/glossary.md](contracts/glossary.md) is approved, with Crate = « Bac » and All-time classics = « Classiques ».
4. **Visual loop**: `yarn shots` runs in this round, with a French pass.

## Approach

Each step is one or more commits, compiling and green, with its docs. Tests first.

1. **Foundation (US2, US3; FR-001, FR-005 to FR-007, FR-016).**
   - `src/i18n/lang.ts` with `lang.test.ts`: `Lang`, `initialLang(saved, preferred)`, the `lang` signal, `setLang`, the `lang` storage key in a try/catch, `<html lang>`.
   - `src/i18n/en.ts` (the shape, starting with the switch's own texts), `src/i18n/fr.ts`, `src/i18n/index.ts` (`m()`, `Messages`).
   - `src/i18n/fmt.ts` with `fmt.test.ts`: `fmt.int`, `fmt.date`, `fmt.time`, `fmt.dateTime` on `en-GB` and `fr-FR`.
   - `src/i18n/catalogue.test.ts`: both catalogues complete, non-empty, counts right for 0, 1 and 2, the same-text allow-list.

2. **The switch (US2; FR-004).** The Settings group "This device" and its item "Language" (`sections.ts`, a new `LanguageSection.tsx`, `SettingsPage.tsx`); the small control on `SignInGate.tsx` and `Connect.tsx`. Regression rows L01 to L05 are written here: pick French in Settings, reload keeps it, back to English, the control on the sign-in screen, the first-visit rule with a French browser.

3. **Dates, numbers and counts (FR-008, FR-009).** The 60 direct `toLocaleString` calls go through `fmt`; `plural()` and the copy in `likePlaylist.ts` give way to counted-noun entries; `searchIndex.ts` drops its fixed `en-GB`. English output is unchanged under `en-GB`, held by the existing tests.

4. **Glossary approved**, then the texts move, one folder per commit. For each folder: the English texts go to `en.ts` word for word, the French ones to `fr.ts`, module constants become functions (research R3), the existing tests stay as they are.
   - a. frame and navigation: `src/ui/layout`, `src/app.tsx`, `src/main.tsx`, `src/ui/components`, `src/ui/icons.tsx`, `src/ui/ActivityButton.tsx`, `src/ui/jobs.ts`
   - b. tables and filters: `src/ui/table`, `src/ui/filters`, `src/ui/details`, `src/ui/charts`, `src/ui/format.ts`
   - c. Settings: `src/ui/settings`, `src/model/updateLines.ts`
   - d. Crate: `src/ui/crate`
   - e. Overview, Top, Search: `src/ui/overview`, `src/ui/Top.tsx`, `src/ui/top`, `src/ui/search`
   - f. Library: `src/ui/Playlists.tsx`, `Playlist.tsx`, `src/ui/playlist`, `Artists.tsx`, `Artist.tsx`, `UnderRadar.tsx`
   - g. Mix: `src/ui/mix`, `src/features/mix` (not the playlist name and description: FR-013)
   - h. sign-in, Connect, Import: `src/ui/signin`, `src/ui/Connect.tsx`, `src/ui/Import.tsx`, `src/history`
   - i. below the UI: `src/model/state.ts` (the 17 confirm questions, banners, notices), `src/sync`, `src/spotify`, `src/auth`, `src/server`, `src/features` (failure values), `src/features/like`, `src/util/errors.ts`, `src/db/repo.ts`; the two sentence comparisons become codes (research R4)
   - j. the demo: `src/dev` texts shown on screen (FR-018)

5. **Lint net (FR-017).** The local rule is added to the ESLint config and turned on for `src/` once step 4 is done, so each earlier commit stays green.

6. **French visual pass (FR-015, SC-005; owner's OK 2026-11-16).** `tools/shots/playwright.config.ts` gains a French project (`locale: 'fr-FR'`, same pages, same four widths); `summary.ts` and `contact-sheet.ts` report it apart. Cut or wrapped labels are fixed by a shorter French text first, by a style change only when the English screen is unchanged.

7. **Docs, with each step, then one sweep.**
   - new `docs/architecture/700-adr/ADR-18-two-languages-typed-catalogue.md`, linked from the ADR index, `.specify/memory/constitution.md` (tooling) and ADR-06, answered both ways;
   - `docs/architecture/000-how-it-works.md`: a new section on languages, §13 (the Settings item), §14 (the confirm list is unchanged, their texts are in the catalogue);
   - `docs/dev-guide/000-contributing.md`: "One change, several files" gains "a new text is two catalogue entries"; `docs/dev-guide/100-design-guide.md`: French typography and the longer-text rule;
   - `docs/architecture/100-features.md` (a new row), `docs/architecture/800-limits-roadmap.md` (the limit of research R4; the worker stays English; the sign-in email stays as it is);
   - `CLAUDE.md` (one rule line, one routing row for `src/i18n/`), a short `src/i18n/CLAUDE.md` with its `AGENTS.md` link;
   - `specs/003-web-first-redesign/contracts/screens.md` §13 (the item), `regression.md` (rows L01 to L05);
   - `README.md` (owner's manual: choosing the language), `CHANGELOG.md`, `docs/README.md` (the new pages).
   - Final sweep: a file-to-doc map in the report; the review checks the docs against the code.

8. **Checks.** After every step `yarn typecheck && yarn lint && yarn test`, read by exit code. Before the PR: `yarn regression`, `yarn invariants`, the quickstart by hand on the demo in both languages. A separate reviewer reads the diff against the spec and the contract; a second one reads the French texts against the glossary and the English ones.

9. **Push and PR**: only on the owner's word, after the public-safe check of Contributing; the PR text is shown first.

## Project Structure

### Documentation (this feature)

```text
specs/031-french-english-switch/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/language.md
├── contracts/glossary.md
├── checklists/requirements.md
└── tasks.md            (from /speckit-tasks)
```

### Source Code (repository root)

```text
src/i18n/lang.ts (+ .test)         new: the language, the first-visit rule, the saved choice
src/i18n/en.ts, fr.ts              new: the two catalogues
src/i18n/index.ts                  new: m(), Messages
src/i18n/fmt.ts (+ .test)          new: dates and numbers in the language shown
src/i18n/catalogue.test.ts         new: complete, non-empty, counts
src/ui/settings/LanguageSection.tsx new: the Settings item
src/ui/settings/sections.ts        the group "This device", the item, labels read when drawn
src/ui/signin/SignInGate.tsx, src/ui/Connect.tsx   the small switch
src/**/*.ts(x)                     about 135 files: texts read from m(), numbers and dates from fmt
src/styles.css                     the switch; fixes for longer French labels, tokens only
eslint.config.*                    the local no-literal-text rule
tools/shots/playwright.config.ts   the French project
tools/shots/regression.spec.ts     rows L01 to L05
index.html                         unchanged; <html lang> is set at start
```

**Structure Decision**: the existing single project; one new folder, `src/i18n/`, beside the folders that read it.

## Risks

- **Width.** A miss leaves an English sentence in French. Nets: the lint rule for screens, the catalogue test, the French pass read screen by screen.
- **English drift.** A text reworded while it moves breaks FR-003. Net: the existing tests and regression keep their assertions; a step that needs to edit one stops and says why.
- **Stale constants.** A text read once at load keeps the first language. Net: regression row L01 switches on a screen already drawn and reads the navigation, a table heading and a Settings label.
- **Longer French.** Navigation, table headings, buttons and pills. Net: the French visual pass at four widths.

## Noticed, not done

- The worker's own messages, some shown in the app as a failed scan's reason, stay English (spec assumption).
- The sign-in email comes from the server's template and stays as it is.
- `src/ui/table/sort.ts` sorts with the browser's collation, not the app's language; unchanged.

## Complexity Tracking

No violation.
