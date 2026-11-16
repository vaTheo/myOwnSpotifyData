# Quickstart: checking spec 031

Contract: [contracts/language.md](contracts/language.md). Names: [contracts/glossary.md](contracts/glossary.md). Data: [data-model.md](data-model.md).

## Prerequisites

Node 24, `yarn`. The demo only, never the owner's data: `yarn dev`, then `http://127.0.0.1:5173/myOwnSpotifyData/?demo`.

## Automatic checks

| Command | Expected |
|---|---|
| `yarn typecheck` | exit 0; removing one entry from `src/i18n/fr.ts` makes it fail |
| `yarn lint` | exit 0; a literal text typed into a `.tsx` screen makes it fail |
| `yarn test` | exit 0; the existing test files pass with their English assertions untouched |
| `yarn test src/i18n` | first-visit rule, saved choice, both catalogues complete, counts right for 0, 1 and 2 |
| `yarn regression` | exit 0; the existing rows unchanged, rows G01 to G05 pass |
| `yarn invariants` | exit 0 against `main` |

Read every result by its exit code, not by a filtered output.

## By hand, on the demo

1. **Switch (US2).** Open `#/settings/language`. Pick Français: the screen turns French at once, the address stays. Reload: still French. Pick English: every screen is as on `main`.
2. **First visit (US3).** Clear the site's storage. With the browser's first language French, the app opens in French; with any other, in English. Reload without picking: `localStorage` has no `lang` key.
3. **Before sign-in (US2 scenario 6).** In the demo variant that shows the sign-in screen, and on the Connect screen, the small switch changes the screen and the choice is kept after a reload.
4. **Whole app (US1).** In French, open every screen: Overview, Top, the Crate hub and its six views, Playlists, a playlist, Artists, an artist, Under the radar, Mix (list, a scanned mix, a tracklist), Search, Import, Settings and each item. No English sentence of the app's own.
5. **Counts and dates (US1 scenarios 4 and 6).** Find a "1" and a "0": « 1 titre », « 0 titre », « 2 titres ». A date reads « 16 nov. 2026 », a number « 1 234 ».
6. **User content (FR-010).** Track, artist, playlist and mix names are identical in both languages.
7. **Nothing else moves (FR-011).** With the browser's network panel open, switch language: no request to Spotify or to the server. A running job in the demo keeps running.
8. **Failures (US1 scenarios 2 and 3).** In the demo variants that show an error, a warning, a banner and a confirm question, each is French.
9. **Screen reader (FR-016).** `document.documentElement.lang` is `fr` in French, `en` in English.

## Visual pass in French (owner's OK 2026-11-16)

`yarn shots` with the French pass, then `yarn shots:summary`: 0 findings on every page at the four widths. `yarn shots:sheet`, and the French pictures are read for cut or wrapped labels.
