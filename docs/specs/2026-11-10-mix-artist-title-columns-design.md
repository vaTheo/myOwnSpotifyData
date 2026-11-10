# Artist and Title columns in the Mix tracklist: design

> **Status**: Implemented on `feat/mix-artist-title-columns` (2026-11-10, inventory F36)
> **Last updated**: 2026-11-10

Date: 2026-11-10. Driven with the Spec Kit skills; the specification, plan and task list live under
[`specs/020-mix-artist-title-columns/`](../../specs/020-mix-artist-title-columns/spec.md). This page is the short record the
documentation map expects. No new ADR: no Spotify read, write or scope, and no stored data changes.

## What it is

The owner asked to "separate the column ARTIST and track name in the mix section":

- **Two columns**: the Mix tracklist's "Artist – Title" column becomes **Artist** then **Title**, both priority 1 (never hidden
  while the table is drawn as a table). The second line of the old cell (the not heard badge, where the row was found, the clue in
  quotes, the references, the Spotify check line) stays under the title, word for word.
- **Two sorts**: a click on Artist orders by the artist, a click on Title by the track name alone; A to Z first, a second click
  reverses; text compared without case or accents; an empty value and a gap last in both directions; ties keep the set's order.
  The Sort select offers "Artist" and "Title" in column order. The sort stays view state: an old choice falls back to the set's
  order (`effectiveSort`).
- **Phone**: the item reads the title, the artist under it, the second line, then the label and the meta line.
- **Unchanged**: every aria name and tooltip that says "Artist – Title" (Listen, More, Remove, Link a Spotify track, the title's
  tooltip), the Edit and Link forms, Delete, Review, Spotify, Listen, More and Create playlist.

## Where it lives

`src/ui/mix/tracklistSort.ts` (`SortId` `artist`, `sortValue`, `CHOICES`), `src/ui/mix/TracklistTable.tsx` (the `artist` and
`title` columns, `TitleCell` with its phone-only `.mix-artist` line), `src/styles.css` (`.mix-artist`), `tools/shots/checks.ts`
(the title header names) and regression row M05.

Widths: Artist `minmax(112px, 1fr)`, Title `minmax(176px, 1.5fr)`, Label `minmax(0, 0.6fr)`. The title keeps its 160 px
(`MIN_TITLE_PX`) down to a 584 px table, which a 712 px window gives; below it the table draws its two-line items (it did below
472 px before), so a 600 to 711 px window now shows items, the artist under the title.

## Links

- [How the app works](../architecture/000-how-it-works.md) §10, §13 · [Feature inventory](../architecture/100-features.md) F36
- [Documentation map](../README.md)
