# Research: The web app in French, with a French / English switch (spec 031)

Findings from the code at main fc086a3 (2026-11-16), then one decision per question.

## Findings

- **Size.** About 1,500 texts in about 135 source files (a rough count of literals and JSX text, tests and `src/dev` left out). The largest holders: `src/ui/mix` (about 240), `src/ui/settings` (205), `src/ui/crate` (195), `src/ui/overview` (65), `src/ui/Playlist.tsx` (62), `src/model/state.ts` (56), `src/features/mix` (43).
- **Where texts live.** Four kinds: JSX text and attributes (`aria-label`, `title`, `placeholder`); pure functions that build lines (`src/ui/settings/lines.ts`, `statusLines.ts`, `itemLines.ts`, `src/ui/overview/blocks.ts`, `src/ui/mix/rowText.ts`, `src/model/updateLines.ts`, `src/ui/format.ts`); module constants (`CRATE_TITLE` in `src/ui/layout/titles.ts`, `SETTINGS_GROUPS` and `SETTINGS_ITEMS` in `src/ui/settings/sections.ts`, column definitions in `src/ui/table/columns.tsx`); and messages built below the UI at the moment of a failure (`describeError` in `src/sync/runner.ts`, the `{ status: 'error'; message }` values of `src/features/*`, `src/model/state.ts`, `src/server/client.ts`, `src/auth/session.ts`, `src/spotify/errors.ts`, `src/spotify/quotaLock.ts`).
- **Messages that are kept.** A failure message is a string held in a signal until its job runs again. One is stored: the sync state, `message` included, in IndexedDB (`src/sync/runner.ts:220`).
- **Text used as logic.** Two places compare a sentence: `src/model/state.ts:408` (`res.message === ACCOUNT_MISMATCH_NOTICE`) and `src/ui/settings/statusLines.ts:192` (`first === 'Up to date'`).
- **Counts.** `plural(n, 'track')` in `src/ui/format.ts:51` adds an "s"; `src/features/like/likePlaylist.ts:178` has its own copy; several sentences choose "was / were", "isn't / aren't" by hand.
- **Dates and numbers.** 60 calls to `toLocaleString` and friends pass no locale or `[]`, so they follow the browser today, not the app. `src/ui/search/searchIndex.ts:37` is fixed to `en-GB`. `src/ui/table/sort.ts:16` sorts names with the browser's collation.
- **Device preferences.** Two exist, both in `localStorage` with a try/catch, both in `src/model/state.ts`: `keyNotation` (line 1026) and `autoUpdates` (line 1055).
- **Search** indexes tracks, artists, playlists and mixes only (`src/ui/search/searchIndex.ts`). It does not index screen or setting names. The app's own words appear only in a result's context line ("12 plays").
- **Page language.** `index.html:2` says `lang="en"`.
- **Tests.** 115 test files beside the source assert the English texts of the pure functions. No DOM tests.
- **Visual loop and regression.** Both Playwright configs run the browser with `locale: 'en-GB'` (`tools/shots/playwright.config.ts:75`, `tools/shots/regression.config.ts:53`). `tools/shots/regression.spec.ts` finds its targets by English text or role name about 440 times.
- **Lint.** `eslint.config.*` uses `@eslint/js`, `typescript-eslint` and `eslint-config-prettier`; no JSX plugin.
- **Reactivity.** The app uses `@preact/signals`; a component that reads a signal while it draws is drawn again when the signal changes.

## Decisions

### R1. No library: a typed catalogue in the repo

- **Decision**: a new folder `src/i18n/` holds one catalogue per language. `en.ts` is the source and gives the shape; `fr.ts` must have the same shape. `msg()` returns the catalogue of the language shown. As built, `en.ts` and `fr.ts` only assemble one file per area under `en/` and `fr/`, each French file typed `Messages['<area>']`.
- **Rationale**: no new dependency (ADR-06); two languages only; a missing French text fails `yarn typecheck`, which CI already runs (FR-017).
- **Alternatives considered**: i18next or Lingui (a dependency, an extraction step, features for many languages that two do not need); the English sentence as the key (`t('Sync now')`: a reworded English text silently loses its French one).

### R2. A text with a value is a function

- **Decision**: a catalogue entry is a string, or a function of its values that returns a string (`showing: (shown, total) => ...`). Count agreement is written inside the entry, per language. Nouns that are counted in many places have one entry each (`n.track(count)`), replacing `plural(n, 'track')`.
- **Rationale**: French and English do not agree the same way (French: 0 and 1 are singular; adjectives and past participles agree). A function per language says it exactly, with no rule engine. Word order can differ freely.
- **Alternatives considered**: `Intl.PluralRules` with a message syntax (a parser to write or a library to add); keeping `plural()` with a French branch (cannot agree the rest of the sentence).

### R3. The language is a signal; module constants become functions

- **Decision**: `lang` is a signal in `src/i18n/lang.ts`. `msg()` reads it, so every component and every pure function called while drawing follows a change at once, without a reload (FR-005). A constant that holds text at module level becomes a function or a table of ids whose label is read when drawn (`CRATE_TITLE[view]` becomes `crateTitle(view)`, the Settings items keep their ids and lose their `label`).
- **Rationale**: a constant is read once at load and would keep the first language.
- **Alternatives considered**: reload the page on a switch (simple, but FR-005 and US2 scenario 2 say no reload, and a running job would stop).

### R4. A message built before the switch keeps its language until its job runs again

- **Decision**: a failure message built below the UI is written in the language shown at that moment and is not rewritten on a switch. Everything drawn from data (titles, labels, captions, counts, dates, status lines built from numbers) follows the switch at once. The two comparisons of sentences become comparisons of codes.
- **Rationale**: about 40 places hold `message: string`, one of them stored in IndexedDB. Turning each into a code with its values is a second refactor on top of the translation, for a case that lasts until the next sync or retry.
- **Alternatives considered**: codes everywhere (complete, large, touches every job state and its tests); a message as a function (cannot be stored, breaks equality in tests).
- **Spec**: this narrows the edge case "a message already on screen when the language changes". The owner agreed on 2026-11-16 and the spec line is amended.

### R5. English keeps today's words; its dates and numbers become fixed

- **Decision**: English texts are moved, not reworded (FR-003). Dates and numbers follow the language shown: English uses `en-GB`, French uses `fr-FR`. One helper per kind (`fmt.int`, `fmt.date`, `fmt.time`, `fmt.dateTime`) replaces the 60 direct calls.
- **Rationale**: FR-008. `en-GB` is what the visual loop and the regression already run with, and what Search already uses, so every checked screen stays the same.
- **Effect to know**: a browser set to US English shows "16 Nov 2026" where it showed "Nov 16, 2026". A browser set to French that picks English gets English dates, where today it gets French dates under English words.
- **Alternatives considered**: English keeps following the browser (French dates under English words stay possible, and the result differs per device).

### R6. First visit: the browser's first preferred language, nothing saved

- **Decision**: with no saved choice, French when `navigator.languages[0]` (or `navigator.language`) starts with `fr`, English otherwise. The rule saves nothing; only a pick in the switch is saved, under the `localStorage` key `lang`, read and written in a try/catch like the two existing preferences.
- **Rationale**: owner's answer Q1 A; spec US3 scenarios 1 to 4.
- **Alternatives considered**: looking for French anywhere in the list (a person with English first and French second would get French).

### R7. Where the switch is

- **Decision**: a new Settings item "Language" (`#/settings/language`), first in a new group "This device", with two choices written "Français" and "English" in both languages. The same two-choice control, small, sits on the sign-in screen and on the Connect screen (FR-004).
- **Rationale**: Settings items are addressable and already listed by `SETTINGS_ITEMS`; the control is the one used for other two-way choices.
- **Alternatives considered**: a control in the top bar on every screen (permanent room for a choice made once).

### R8. Catching a text with no French version

- **Decision**: three nets. (1) Type: `fr` must satisfy the shape of `en`. (2) Test: `src/i18n/catalogue.test.ts` walks both catalogues, calls every function with 0, 1 and 2, and fails on an empty result or on an English sentence left as is in French outside an allow-list of words that are the same ("Mix", "Top", "BPM", "Spotify", "rekordbox", "Playlists"). (3) Lint: a small local rule in the ESLint config, with no new package, refuses literal text in JSX and in `aria-label`, `title`, `placeholder`, `alt` and `label` in `src/**/*.tsx` (`no-restricted-syntax`), so a new English text cannot be typed straight into a screen.
- **Rationale**: FR-017. The lint rule does not see a sentence built in a `.ts` file; the review and the French visual pass cover those.
- **Alternatives considered**: `eslint-plugin-react`'s `jsx-no-literals` (a new dependency).

### R9. What stays out of the catalogue

- **Decision**: the name and description of a playlist created from a mix (FR-013), any text sent to the server or to the worker, error bodies received from Spotify and reasons written by the worker (FR-014), log and console text, the demo's music data. `src/dev` texts shown on screen in the demo are in scope (FR-018).
- **Rationale**: what is written outside the app must not depend on the language shown; what comes from outside is shown as received.

### R10. French typography

- **Decision**: French entries use a no-break space before `:`, `?`, `!`, `;` and inside « », the apostrophe `’`, "vous", and sentence case for titles and buttons ("Synchroniser maintenant", not "Synchroniser Maintenant").
- **Rationale**: a line must not break before a colon; this is how French interfaces are written.

### R11. Names in French

- **Decision**: the section and view names are translated (owner's answer Q2 A). The list in [contracts/glossary.md](contracts/glossary.md) is approved by the owner (2026-11-16), and one name is used everywhere.
- **Rationale**: FR-012.

### R12. Checks in French

- **Decision**: vitest runs in English (no browser, so the first-visit rule gives English): the 115 test files keep their assertions. The regression stays `en-GB` and gains rows for the switch. The visual loop gains a French pass: the same pages at the same four widths with the browser set to `fr-FR`, and its summary must report 0 findings (SC-005).
- **Rationale**: French words are longer; only the pictures show a cut label.
- **Note**: the owner's standing instruction is not to run `yarn shots` unless asked. They agreed to run it in this round (2026-11-16).

### R13. Sorting

- **Decision**: unchanged. `src/ui/table/sort.ts` keeps the browser's collation; the order of a name column does not depend on the language shown (spec edge case).

### R14. Search

- **Decision**: no index change. Search holds only the user's content; its context lines ("12 plays", the saved date) come from the catalogue and the date helpers.
- **Spec**: the edge case first said Search finds screen and setting names, which Search does not do. It now reads "its own labels and context lines follow the language shown".

### R15. A decision that lasts

- **Decision**: a new ADR-18, "Two languages, one typed catalogue, no library", linked from the ADR index, the constitution's tooling section and Contributing ("a new text is two catalogue entries").
