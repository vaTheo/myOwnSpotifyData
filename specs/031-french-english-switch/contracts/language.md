# Contract: language (spec 031)

What the user sees, and what the code offers the rest of the app.

## 1. The switch on screen

**Settings.** A new group "This device" (French: « Cet appareil »), placed after "Between devices" and before the Danger zone, holds one item "Language" (« Langue »), address `#/settings/language`.

- The item shows two choices, "Français" and "English", always written this way.
- The current one is marked; picking the other changes the whole app at once and keeps the user on the item.
- One line under the choice: "Kept on this device." (« Conservé sur cet appareil. »)
- With no saved choice, the marked one is the one the first-visit rule gave.

**Sign-in and Connect screens.** The same two choices as a small control at the top right of the card. Picking one changes the screen at once and saves the choice.

**Everywhere.** `<html lang>` is `en` or `fr` and follows the switch.

## 2. What changes with the language, what does not

| Follows the language | Never changes |
|---|---|
| every text the app writes: navigation, titles, buttons, labels, table headings, captions, hints, empty messages, status and progress lines, errors, warnings, banners, confirm questions, screen-reader texts | track, artist, album, playlist and mix names; imported history; mix tracklists |
| dates, times, month and day names, numbers, percentages, durations | the name and description of a playlist the app creates on Spotify |
| the demo's own app texts | a Spotify error body, a reason written by the worker: shown as received |
| | addresses (`#/crate/gems` stays), ids, the order of a sorted column |
| | a failure message built before the switch, until its job runs again (research R4, owner 2026-11-16) |

## 3. What the code offers

In `src/i18n/`:

| Name | Role |
|---|---|
| `Lang` | `'en' \| 'fr'` |
| `lang` | the signal holding the language shown |
| `setLang(l)` | shows `l`, saves it on the device, sets `<html lang>`; touches nothing else |
| `initialLang(saved, preferred)` | pure: the saved choice if valid, else French when the first preferred language starts with `fr`, else English |
| `msg()` | the catalogue of the language shown; reading it while drawing subscribes to the switch |
| `fmt.int(n)`, `fmt.date(ms)`, `fmt.time(ms)`, `fmt.dateTime(ms)`, `fmt.shortDateTime(ms)` | numbers and dates in the language shown |
| `isSingular(n)` | whether a count takes the singular in the language shown: English only 1, French 0 and 1 |
| `Messages` | the catalogue's shape, taken from `en.ts`; `fr.ts` must satisfy it; both assemble one file per area under `en/` and `fr/` |

Rules for callers:

- A text shown to the user comes from `msg()`; never a literal in JSX or in `aria-label`, `title`, `placeholder`, `alt`, `label` (lint).
- A text is read when drawn, never kept in a module constant.
- Logic never compares a sentence; it compares a code.
- `setLang` makes no Spotify request and writes nothing to IndexedDB or to the server (FR-011).
- Tests run in English.

## 4. Checks that hold the contract

| Rule | Check |
|---|---|
| every text exists in both languages | `yarn typecheck` (shape), `catalogue.test.ts` (non-empty, counts 0, 1, 2) |
| no English left in French | `catalogue.test.ts` (same-text allow-list), the French visual pass read screen by screen |
| no literal typed into a screen | `yarn lint` (local rule) |
| English unchanged | the existing 115 test files and `yarn regression`, untouched assertions |
| first visit, saved choice | `lang.test.ts`; regression rows G01 to G05 |
| layout holds in French | `yarn shots` French pass, `yarn shots:summary` 0 findings |
