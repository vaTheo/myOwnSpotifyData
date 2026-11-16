# Rules for the two languages (`src/i18n/`)

Complements the root `CLAUDE.md` for any text the web app shows, and for changes under `src/i18n/`: the English and French
catalogue, the language shown, dates and numbers.

## Required inputs

| Type | File | Why |
|---|---|---|
| Decision | `../../docs/architecture/700-adr/ADR-18-two-languages-typed-catalogue.md` | one typed catalogue, no library, the three nets, a kept message keeps its language |
| Reference | `../../docs/architecture/000-how-it-works.md` §18 | the files, `msg()`, `fmt`, `isSingular`, the choice, the workers |
| Guide | `../../docs/dev-guide/100-design-guide.md` "French" and "Longer French text" | typography, « vous », a label that does not fit |
| Names | `../../specs/031-french-english-switch/contracts/glossary.md` | one French name per thing, « Crate » kept |
| Contract | `../../specs/031-french-english-switch/contracts/language.md` | what follows the language, what never changes |

## Expected outputs

- A new text is two entries, one in `en/<area>.ts` and one in `fr/<area>.ts`, under the same key. `en.ts` and `fr.ts` only
  assemble the areas; a new area joins both. Each French file is typed `Messages['<area>']`.
- English is the source: a translation task never rewords it. A French text says the same thing, nothing more.
- A text with a value is a function; a counted noun uses `count()` of `count.ts` (`n.track(count)`); a sentence that agrees more
  than its noun asks `isSingular(n)`. French takes 0 and 1 as singular.
- Read with `msg()` when drawing, never kept in a module constant. Logic compares codes, never sentences.
- Numbers and dates through `fmt` (`en-GB`, `fr-FR`), never `toLocaleString` with the browser's locale.
- The user's music, the playlist name and description sent to Spotify, a Spotify error body and a worker's reason are never
  translated: a received text is passed into a catalogue sentence as a value.
- French: a no-break space written ` ` before `:` `?` `!` `;` and inside « », never the raw character (lint); `’` for the
  apostrophe; sentence case; « vous ».
- A French text equal to its English one fails `catalogue.test.ts` unless the word is in its `SAME` list; add it there only when
  it is the same word in both languages.
- `yarn typecheck`, `yarn lint` (the `no-restricted-syntax` rule on `src/**/*.tsx`) and `yarn test` stay green; tests run in English.
