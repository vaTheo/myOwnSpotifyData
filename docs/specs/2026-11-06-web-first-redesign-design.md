# A web-first redesign of every screen (Material Design 3, dark, chartreuse): design

> **Status**: Implemented on `worktree-task-design` (2026-11-07, inventory F21); the merge to `main`, the owner's speed run
> (quickstart §12) and WebKit pending
> **Last updated**: 2026-11-07

Date: 2026-11-06 to 2026-11-07. Driven with the Spec Kit skills; the specification, research (D1–D19), data model, contracts
(routes, design tokens, components, screen by screen), quickstart, task list and the step-by-step execution ledger live under
[`specs/003-web-first-redesign/`](../../specs/003-web-first-redesign/spec.md). This page is the short record the documentation
map expects. The lasting decision is [ADR-11](../architecture/700-adr/ADR-11-web-first-material-3.md).

## What it is

The owner now uses the app mainly in a computer's browser. Every screen is rebuilt for that first, on Material Design 3, and the
phone keeps every feature:

- **Frame**: five destinations, Overview, Listening (Top, Crate), Library (Playlists, Artists), Mix and Settings, in a side rail
  (a bottom bar on phones); a top bar with the title, back, the screen's actions, search and an activity button that shows any
  running job and leads to its place (it never starts one).
- **Look**: Material's dark scheme generated from chartreuse `#7FFF00`, chartreuse itself as the accent; Roboto served by the app;
  inline Material Symbols; tokens in `src/ui/theme/tokens.css`, a contrast test on every pair.
- **Tables**: every track list is a sortable table (any column, both directions, ranks from the full list, missing values last),
  columns hidden by priority as the window narrows, two-line items on phones, "Showing 100 of 2,431" paging, arrow keys and Enter.
- **Details**: a side sheet with everything the app holds for a track (album, duration, added date, energy, audio source,
  listening time, first and last play, plays per month, outcomes, playlists), `?d=` in the address. Playlists, Artists and Mix
  are list–detail from 840 px.
- **Charts**: month bars, finish-rate meters, plays per year, and By year's year × month grid; exact values on hover, focus and
  for screen readers.
- **New**: the Overview home (stored data only), Compare periods on Top (the three periods side by side), one search (`/`,
  Ctrl+K) over tracks, artists, playlists and saved mixes, a BPM range and key filter (with compatible keys) on every track table,
  Settings as one page of seven sections with an index, and the Mix workspace (one Mixes list with the worker queue, the run
  line, Check on Spotify, a per-track review, Validated only / All tracks).

## Decisions (owner's picks)

1. **Material Design 3, faithful**, dark only, chartreuse as seed and accent (2026-11-06, clarifications).
2. **Everything new at once**: charts, search, BPM and key filters, Overview (2026-11-06).
3. **Five destinations** (2026-11-06).
4. **Hand-built on tokens, no runtime package**; Roboto (43 KB, SIL OFL) approved; Playwright and axe-core as dev dependencies
   for the visual loop (2026-11-06, research D4, D19).
5. **Every implementer and reviewer on Opus**; a non-regression phase added at the end (2026-11-06).
6. **Contact sheets approved**: the look and the frame; the Playlist header strip and 48 px Playlist rows on large windows (S02);
   two-line items beside a list pane on expanded windows and Album, Length and Added hidden beside the pane at 1440 (S04); row
   charts hidden with the sheet open or on medium windows (S06); Settings and Import (S07); the Mix design (2026-11-06).
7. **Polished Mix** (2026-11-06): Check on Spotify is a button per mix, read on tap, answers stored as optional row fields;
   Validate marks a row; Create playlist offers Validated only or All tracks.
8. **Main's Mix work folded in** (2026-11-06, D1, D3, D6): a later worker result keeps the review (validated rows, Spotify
   answers, removed tracks stay removed); a run line under the mix header with Ask again on a stopped-early scan; a candidate
   from a comment starts To review and joins Validated only once validated, All tracks includes it (amends
   [ADR-10](../architecture/700-adr/ADR-10-name-lookup-for-clues.md)).
9. **Delegation** (2026-11-07): from S08d on, the controller rules and approves in the owner's place, except the push and merge to
   `main`.

## Rulings that change behaviour (controller, recorded in the ledger)

- Tab roots titled after their destination ("Listening", "Library"). No sort headers on phones; Playlist order, Under the radar
  sorts and Mix's Sort select stay usable there.
- Spotify link column first in priority; the "not in a playlist" flag kept in the phone item. Match drops Album and Added at 1440.
- Moving between rows with the sheet open replaces the history entry, so Back returns to the list.
- Playlists split from expanded windows; the list pane folds while Match is on below large.
- Classics draws a no-play year inside the import as a zero tick (FR-026).
- Mix: Edit and Delete in a row "More" menu; the Mixes pane folds while a mix is open from 840 to 1599 px, behind a "Mixes" button;
  "Heard once" is a filter chip (D2); a Cancel, Move to top or Stop on a request already gone says "Already taken by your
  computer" or "Already finished" inline (D4); a server without migration 0003 is named in the error (D5); waiting requests
  show in priority order; the Spotify column is 64 px; phones get one "Listen…" menu item.
- Check on Spotify saves the working list when it ends, so an unsaved lookup becomes a saved mix (R1).
- One Spotify quota lock-out shared by sync, Check on Spotify, Create playlist and Like all songs, kept across reloads in
  `localStorage`; Disconnect keeps it; Connect's `/me` inside it is a warning banner.
- Escape in the search field clears it first, closes on the next press. Overview: two columns from 840 px, three from 1200 px.
- The "Found tracks" chip has no count. The CC BY-SA credit sits in the "Well known" heading row.

## Out of scope (stated so it is not re-litigated)

A light theme or theme switch; in-app confirmation dialogs (the browser's `confirm()` stays, word for word); any change to
rankings, Crate rules, Match, reach groups or gates (FR-049); a new Spotify read, write, scope or host (FR-046); stored data; a
native app; translations; screen tests in `yarn test` or CI.

## Compatibility

No `DB_VERSION` bump: the Mix review adds optional row fields (`validated`, `spotify`, `checkedAt`) and mix fields (`run`,
`removed`); the Validated only / All tracks pick is session state; the lock-out is one `localStorage` key. Every old address opens the same content in its destination;
`#/` now lands on the Overview, `#/mix/<key>` opens a saved mix, and any route takes `?d=<id>`. `?demo` exists only on
`yarn dev`. The spec folder shares its number with `specs/003-fill-scan-gaps/` (round 003 on `main`, written in parallel): both
stay, told apart by their names, because the redesign's controller, briefs and ledger point at this path until the round ends.

## Links

- [ADR-11 — Web-first, Material Design 3](../architecture/700-adr/ADR-11-web-first-material-3.md) ·
  [ADR-10 (amended)](../architecture/700-adr/ADR-10-name-lookup-for-clues.md)
- [How the app works](../architecture/000-how-it-works.md) §10, §13, §14 · [Feature inventory](../architecture/100-features.md)
  F21 · [Limits and roadmap](../architecture/800-limits-roadmap.md)
- [Contributing](../dev-guide/000-contributing.md) "The visual loop" · [Documentation map](../README.md)
