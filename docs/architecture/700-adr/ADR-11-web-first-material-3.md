# ADR-11 — Web-first adaptive layout on Material Design 3, dark, chartreuse, five destinations

> **Status**: Accepted
> **Date**: 2026-11-06

## Context

Until 2026-11-06 the app was a 720 px phone column with six tabs at the bottom, built for an Android phone. The owner now uses it
mainly in a web browser on a computer: "I think I will use this app manly on web so I need you to do a complete rework of the
design … Use google best practicies". The phone stays in use. The redesign round (`specs/003-web-first-redesign/`) changes every
screen; how the app looks, where things sit and how a change to a screen is checked outlive that round.

## Options considered

| Option | Description | For | Against |
|---|---|---|---|
| Keep phone-first, widen the column | the same screens, a wider cap | no rework | tables, panes and charts never fit a phone column; the computer gets a stretched phone |
| Material Design 3 with its component library | `@material/web` or a kit | Google's own components | a runtime dependency (ADR-06), web components that fight Preact, a light look the owner did not want |
| *(chosen)* Material Design 3 as guidance, hand-built on its tokens | adaptive layout by window size class, Material's dark scheme from one seed, components written in Preact | no runtime package, faithful look, full control of tables | every component is ours to keep |

## Decision

- **Web-first, adaptive.** Layout follows Material's window size classes: compact under 600 px (a phone), medium 600–839,
  expanded 840–1199, large 1200 and wider, the primary target. CSS does the layout; `ui/layout/windowClass.ts` mirrors the same
  breakpoints for behaviour only (pane or full screen, rail or bar). The phone stays fully usable.
- **Material Design 3, dark only, chartreuse.** Material's dark colour scheme generated once from the seed `#7FFF00` (computed
  outside the repo, kept as tokens in `src/ui/theme/tokens.css`), with chartreuse kept as itself for the accent: the current
  destination, primary buttons, selection, sort direction, focus ring, progress, links and every chart's main series; never large
  areas. No light theme and no switch (the owner: "I want you to keep the darkmode"). Roboto is served by the app; 39
  Material Symbols, 6 with a filled variant, are inline paths (`src/ui/icons.tsx`). Components read tokens only, never raw colours. The twelve Camelot colours stay as data
  colours.
- **Five destinations**: Overview (the home, `#/`), Listening (Top, Crate), Library (Playlists, Artists), Mix and Settings: a
  side rail from 600 px, Settings at its foot; a five-item bottom bar on phones. Every address that existed keeps working, inside
  its destination.
- **Tables, sheets and list–detail** for data: every track list is a sortable table whose columns hide by priority and whose rows
  become two-line items on a phone; a track's details open in a side sheet (`?d=` in the address); playlists, artists and saved
  mixes open beside their list from 840 px.
- **The visual loop is a dev-only check.** `yarn shots` (Playwright with axe-core, dev dependencies the owner picked on
  2026-11-06) opens every page at 1440, 1024, 768 and 390 px on the `?demo` data, checks layout, focus, target size and
  WCAG 2.2 AA, and saves screenshots; `yarn shots:sheet` builds a contact sheet. It ends every UI change. It is not part of
  `yarn test` and not run in CI, so the "no DOM tests" rule of ADR-06 holds for the suite.

## Consequences

**Positive:** tables, panes and charts use a computer's width; the phone gets the same data in two-line items; one token file
carries the whole look; data stored but never shown (album, duration, added date, energy, listening time, first play) has a place;
a screen change is checked on four widths before anyone looks at it.

**Negative / watch for:** every component is hand-built and must keep Material's rules (48 px targets, focus ring, contrast);
the shots need Chromium on the owner's computer, and WebKit needs system libraries Debian lacks; a light theme would be its own
round ([Limits and roadmap](../800-limits-roadmap.md)). The decision adds no Spotify endpoint, scope, write or host, changes
no ranking, Crate rule, Match or gate, and no `confirm()` text (spec FR-046 to FR-049). The round did change behaviour in the
Mix review: Check on Spotify reads `GET /search` on its own tap, Create playlist adds what Validated only or All tracks picks
(D6, amending [ADR-10](ADR-10-name-lookup-for-clues.md)), and one quota lock-out holds for every Spotify read; Mix rows gain
optional fields, with no `DB_VERSION` bump.

## Links

- Spec: [2026-11-06 — A web-first redesign](../../specs/2026-11-06-web-first-redesign-design.md); full round under
  `specs/003-web-first-redesign/` (research D1–D19, `contracts/`)
- [Design guide](../../dev-guide/100-design-guide.md) (the rules this decision implies, for every session)
- [ADR-06](ADR-06-lean-tooling.md) (no runtime dependency; the dev-only loop beside the no-DOM-tests rule)
- [ADR-02](ADR-02-no-spotify-reads-on-load.md) (the Overview reads only stored data)
- [ADR-10](ADR-10-name-lookup-for-clues.md) (amended by the Mix review: a candidate joins Validated only once validated, D6)
- [How the app works](../000-how-it-works.md) §13 · [Contributing](../../dev-guide/000-contributing.md) "The visual loop"
- Constitution: `.specify/memory/constitution.md` 2.1.1 (preamble)
- [ADR index](README.md)
