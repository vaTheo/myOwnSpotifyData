# Data model: spec 031

Nothing is added to IndexedDB or to the server. No `DB_VERSION` bump.

## Language

| Field | Value |
|---|---|
| id | `'en'` or `'fr'` |
| locale | `en-GB` for English, `fr-FR` for French: used for dates, times and numbers |
| own name | "English", "Français": shown the same in both languages |

## Language choice (per device)

| Field | Value |
|---|---|
| where | `localStorage`, key `lang` |
| values | `'en'`, `'fr'`, or absent |
| written | only when the user picks a language in the switch |
| read | once at start; any other value, or storage that cannot be read, counts as absent |
| absent | the first-visit rule decides, at every start, and saves nothing |

Rules:

- A saved choice always wins over the first-visit rule (US3 scenario 3).
- First-visit rule: French when the browser's first preferred language starts with `fr`, English otherwise (research R6).
- Not synced to the server, not part of any dataset, not removed by Disconnect or by Remove server data: it is a device preference like `keyNotation` and `autoUpdates`.

State: `absent → 'fr' | 'en'` on a pick; `'fr' ↔ 'en'` on a pick. Nothing returns to absent except clearing the browser's storage.

## Catalogue

One per language, same shape.

| Entry kind | Form | Example |
|---|---|---|
| fixed text | string | `settings.title` |
| text with values | function of its values, returns a string | `table.showing(shown, total)` |
| counted noun | function of a count, returns the count and the agreed noun | `n.track(count)` |

Rules:

- English is the source; French must have every entry (type check) and no empty one (test).
- An entry never contains user content of its own; names and titles are passed in as values and printed as given (FR-010).
- An entry's English text is today's text, unchanged (FR-003).
- Count entries are right for 0, 1 and 2 or more in both languages; French treats 0 and 1 as singular.

## Not stored anywhere new

- A failure message stays a string in its job's state, as today, written in the language shown when it was built (research R4).
