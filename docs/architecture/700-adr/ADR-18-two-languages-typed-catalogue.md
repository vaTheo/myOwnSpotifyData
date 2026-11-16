# ADR-18 — Two languages, one typed catalogue, no library

> **Status**: Accepted
> **Date**: 2026-11-16

## Context

Every word of the web app was English. A second person now has an account on the owner's server, and the owner asked for the
whole web app in French, with a switch between French and English (spec 031, owner 2026-11-16). About 1,500 texts sat in about
135 files: in the markup, in pure functions that build lines, in module constants, and in failure messages built below the UI.
The owner declined new tooling and asks before any new dependency ([ADR-06](ADR-06-lean-tooling.md)).

## Options considered

| Option | Description | For | Against |
|---|---|---|---|
| A typed catalogue in the repo *(chosen)* | `src/i18n/`: one English and one French catalogue, one file per area; a text is a string or a function of its values; `msg()` returns the catalogue of the language shown | no dependency; a missing French text fails `yarn typecheck`; each language writes its own agreement and word order | count agreement is written by hand in each entry; a third language would need its own files |
| i18next or Lingui | a library with message syntax and an extraction step | built for many languages, plural rules included | a new dependency and a build step for two languages; the owner declined new tooling |
| The English sentence as the key | `t('Sync now')` with a French table beside it | little to move | a reworded English text silently loses its French one; no type check |
| Reload the page on a switch | read the language once at load, keep module constants | simpler reactivity | a running job stops; the spec asks for a switch with no reload |

## Decision

- **Two languages, one shape.** `src/i18n/en.ts` and `src/i18n/fr.ts` only assemble one file per area under `en/` and `fr/`
  (common, count, frame, table, settings, crate, overview, library, mix, signin, core, sources, demo). English is the source and
  gives the shape (`Messages` in `src/i18n/index.ts`); each French file is typed `Messages['<area>']`. English keeps today's
  words: a translation task never rewords them.
- **A text with a value is a function.** Counted nouns (`n.track(count)`) agree inside their entry; `isSingular(n)` in
  `src/i18n/lang.ts` gives the rule of the language shown (English: only 1; French: 0 and 1).
- **The language is a signal.** `msg()` reads it, so a screen that reads a text while drawing follows a switch at once. A text is
  read when drawn, never kept in a module constant. Logic compares codes, never sentences.
- **Dates and numbers** go through `fmt` (`src/i18n/fmt.ts`): `en-GB` in English, `fr-FR` in French, whatever the browser prefers.
- **The choice** is kept per device in `localStorage` under `lang`, never synced; with none, the browser's first language decides
  and nothing is saved.
- **Three nets for a missing French text**, with no new package:
  1. the type check: a French file without an entry, or with the wrong kind, fails `yarn typecheck`;
  2. `src/i18n/catalogue.test.ts`: same keys, same kinds, no empty text (functions called with 0, 1 and 2), and no English
     sentence left in French outside the allow-list `SAME` ("Mix", "Top", "Crate", "Spotify" and a few more);
  3. a lint rule in `eslint.config.js` (`no-restricted-syntax` on `src/**/*.tsx`): no JSX text and no literal in `aria-label`,
     `title`, `placeholder`, `alt` or `label`, so a text cannot be typed straight into a screen.
- **What stays out.** The name and description of a playlist the app creates on Spotify, text sent to the server or the worker,
  error bodies and worker reasons received (shown as received inside a catalogue sentence), log lines, the user's music.

## Consequences

**Positive:** no dependency and no build step; `yarn typecheck`, `yarn lint` and `yarn test`, which CI already runs, catch a gap;
a switch redraws the open screen with no reload, no request and no change to stored data.

**Negative / watch for:**

- **A kept message keeps its language** (spec 031 research R4). A failure message built below the UI is a string held in its
  job's state, one of them stored in IndexedDB with the sync state. It is written in the language shown when it was built and
  stays so after a switch, until its job runs again. Turning about 40 message fields into codes was judged a second refactor for
  a case that lasts until the next run.
- The lint rule sees only `.tsx` markup: a sentence built in a `.ts` file is caught by review and the French screens, not by a tool.
- Two languages only: a third needs its own files and its own agreement rule.
- The history import's Web Worker does not follow the switch: it writes its two skip reasons and two errors in English, and the
  page swaps the known ones for the language shown.

## Links

- Spec: [`specs/031-french-english-switch/spec.md`](../../../specs/031-french-english-switch/spec.md) · [plan](../../../specs/031-french-english-switch/plan.md) · [research](../../../specs/031-french-english-switch/research.md) · [contract](../../../specs/031-french-english-switch/contracts/language.md)
- Keeps [ADR-06](ADR-06-lean-tooling.md) (no new dependency, the three checks)
- [How the app works](../000-how-it-works.md) §18 · [Feature inventory](../100-features.md) F46
- [Contributing](../../dev-guide/000-contributing.md) "One change, several files" · [Design guide](../../dev-guide/100-design-guide.md) "French"
- Constitution: `.specify/memory/constitution.md` "Technology and tooling constraints"
- [ADR index](README.md)
- [Limits and roadmap](../800-limits-roadmap.md)
