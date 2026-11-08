# 100 — Design guide

> **Status**: Living
> **Last updated**: 2026-11-07

How a screen of this app is designed and built. Read it before you add or change anything under `src/ui/` or `src/styles.css`, in any
session. It states the rules and where each one is pinned; the values live in the contracts, so this page links them and does not copy
them ([ADR-11](../architecture/700-adr/ADR-11-web-first-material-3.md) is the decision).

## The look in one paragraph

Web-first, adaptive, Material Design 3, dark only, chartreuse `#7FFF00` as the accent (never large areas). Five destinations: Overview,
Listening (Top, Crate), Library (Playlists, Artists), Mix, Settings. The owner uses a computer first and an Android phone second; a phone
is fully usable, not a shrunk desktop. Everything is hand-built in Preact on tokens: no component library, no new runtime dependency
([ADR-06](../architecture/700-adr/ADR-06-lean-tooling.md)).

## Before you design: three reads

1. [Design tokens](../../specs/003-web-first-redesign/contracts/design-tokens.md): colours, type, shape, spacing, motion, sizes, contrast pairs.
2. [Components](../../specs/003-web-first-redesign/contracts/components.md): reuse one of these before writing a new one; a new component joins the list.
3. [Screens](../../specs/003-web-first-redesign/contracts/screens.md): the screen you touch (and its sketches); [routes](../../specs/003-web-first-redesign/contracts/routes.md) for addresses.

## Rules

**Tokens only.** A colour, size, radius, spacing or duration comes from `src/ui/theme/tokens.css`. No hex, no `rgb()`, no magic pixel
count in a component. A new colour is a new token with its contrast pair added to `src/ui/theme/contrast.test.ts` (4.5 for text, 3 for UI).
The twelve key colours are data, not theme.

**Size classes, not devices.** Compact < 600, medium 600–839, expanded 840–1199, large ≥ 1200. CSS does the layout; `ui/layout/windowClass.ts`
mirrors the same breakpoints for behaviour only. A table's columns drop by their own priority at the table's width (720 / 960 / 1120), which
is not the window class: say which one you mean.

**Design the large window first, then make the phone good.** A phone gets the same data and actions, in two-line items, a sheet or a
full screen. Header sort does not exist on phones: offer a Sort control where order matters. Never hide a feature on a phone without a ruling.

**Tables for data.** Every track list is a `DataTable`: columns with a priority, right-aligned tabular numbers, `aria-sort` header, roving
rows, paging by 100 with "Show 100 more". When the title column would get too narrow, columns hide by priority first; two-line items are
only the last resort and only where the contracts allow them (beside a list pane, beside the docked details sheet, on phones). A title
is never cut where a column could give way; the shots check it.

**Detail beside the list.** A track opens in the side sheet (`?d=` in the address); a playlist, artist or saved mix opens beside its list
from 840 px and full screen below. Both are navigation: Back works, the address is shareable.

**One selected look.** A selected row (the row open beside a list, the Mix tracklist's last row clicked) has the `primary-container`
fill, `on-primary-container` text and `aria-selected="true"`. Selected beats hover: hovering a selected row lays `on-primary-container`
at the hover opacity over the fill, never the grey hover. Status marks (not found, warnings) keep their own tokens on it. The marked Mix
row adds second cues, as shadows so no row moves: a `--app-mark-bar` (4 px) `primary` edge bar, `--app-mark-line` (2 px) `primary`
top and bottom lines and a soft `--app-mark-halo` (8 px) `primary` glow, the row raised over its neighbours; a form row (Edit, Link)
keeps the neutral surface (field outlines are 2.94:1 on the fill) with the same cues; forced colours get a `Highlight` outline.

**A missing number is a dash, never zero.** Use `NoData` (a dash with `aria-label="no data"`). A year, a BPM, a play count, a figure with
no source: never `0`, never blank. Listeners and fans are never summed. A zero that is real is printed as zero.

**Every failure has a visible place.** Inline next to the thing that failed, in the screen's `StatusLine`, or a `Banner` built with
`errorBanner`/`warnBanner`. Mix and Like failures are inline, never a banner. Errors are `role="alert"`; progress and warnings are
`role="status"`. Never `console.error` alone, never a silent catch.

**One owner for each global behaviour.** Escape closes one layer at a time, in this order: Activity, search, sheet, pane
(`ui/layout/escape.ts`); a text field clears first. Page scrolling is locked through the one counter in `ui/layout/scrollLock.ts`. Focus
returns to the control that opened a sheet. A layer registers in a layout effect, so an Escape pressed the moment it appears is not lost.
Do not add a second Escape listener or touch `document.body.style` directly.

**Buttons.** At most one filled button per section (the main action). A button that spends Spotify quota or writes is only ever on a tap,
shows what it will do, and refuses with an inline line while another Spotify reader runs. Destructive: outlined in `error`, with a
`confirm()` that is listed word for word in [how-it-works](../architecture/000-how-it-works.md) §14. A new question joins that list.

**Touch and keyboard.** Every control is at least 48 × 48 px (drawn smaller is fine, the target is not), has an accessible name and a
visible 3 px `primary` focus ring, and works with the keyboard alone. Icon buttons carry a tooltip. Colour is never the only signal:
a warning or error also has an icon and words.

**Motion.** 150 ms for hover and press, 250 ms for sheets and panes, the standard easing; `prefers-reduced-motion` sets every duration to 0.
Nothing animates on its own once the page is idle.

**Performance at the owner's scale** (about 78,000 plays, thousands of tracks). Pass `DataTable` stable `columns` and `rankOf` (module
constants or `useMemo`); memoise scans of the whole library on their inputs; page lists by 100; never recompute a ranking in render.

**Language.** Short, plain, present tense; the owner reads on a phone. Sentence case. Say what happened and what to do. Keep `confirm()`
and existing UI strings word for word unless the owner rules otherwise.

## What a screen never does

Read Spotify on load or without a tap; call a host that is not already named; show raw colours; ship demo or dev code to the build
(`dist/` is checked); sort or filter by a figure it cannot show; use `innerHTML` with data; build an external link without
`rel="noopener"` and an encoded query.

## Definition of done for a UI change

1. Built from existing components and tokens; new component or token documented in the contracts.
2. States drawn: loading, empty (with its one action), error, partial data, long text, 78,000-play scale.
3. `yarn typecheck`, `yarn lint`, `yarn test` exit 0; logic that is not a component sits in a pure helper with a `*.test.ts` (no DOM tests).
4. The visual loop on the pages touched: `yarn shots` 0 findings, then open the 1440 and 390 images and look. Add a shots page for each new
   state in `tools/shots/pages.ts`, with demo data (`src/dev/demo.ts`).
5. Features carry a row in `specs/003-web-first-redesign/regression.md` and, where the demo can drive it, a test in
   `tools/shots/regression.spec.ts`; `yarn regression` and `yarn invariants` exit 0 before a merge
   ([Contributing](000-contributing.md) "Before a merge").
6. Docs follow the change: how-it-works §13, README (owner's manual) if the owner sees it, CHANGELOG.

## Links

- [Documentation map](../README.md)
- [Contributing](000-contributing.md) "The visual loop" and "Before a merge: regression and invariants"
- [How the app works](../architecture/000-how-it-works.md) §13 (the UI), §14 (jobs and `confirm()` texts)
- [ADR-11 — Web-first, Material Design 3, the visual loop](../architecture/700-adr/ADR-11-web-first-material-3.md)
- [ADR-06 — Lean tooling](../architecture/700-adr/ADR-06-lean-tooling.md)
- [Design tokens](../../specs/003-web-first-redesign/contracts/design-tokens.md) · [Components](../../specs/003-web-first-redesign/contracts/components.md) · [Screens](../../specs/003-web-first-redesign/contracts/screens.md) · [Routes](../../specs/003-web-first-redesign/contracts/routes.md)
