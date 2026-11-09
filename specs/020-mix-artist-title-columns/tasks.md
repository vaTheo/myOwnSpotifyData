# Tasks: Separate Artist and Title columns in the Mix tracklist

Every commit: `yarn typecheck && yarn lint && yarn test` exit 0; `type(scope): summary`; docs in the same commit. No push. No `yarn shots` unless the owner asks.

- [ ] T001 Update `src/ui/mix/tracklistSort.test.ts` first (RED): `sortValue('artist', …)` is the artist text, `sortValue('title', …)` the track name only, both `null` for a gap; `SORT_FIRST.artist === 'asc'`; `sortChoices` lists "Artist" then "Title" (not "Artist – Title"); a mix sorted by title no longer groups by artist; an old chosen id the rows do not allow still falls back to the set's order
- [ ] T002 `src/ui/mix/tracklistSort.ts`: add `'artist'` to `SortId`, `SORT_FIRST`, `sortValue`, `CHOICES`; `'title'` returns `row.title`; T001 green
- [ ] T003 `src/ui/mix/TracklistTable.tsx`: split the `title` column into `artist` (priority 1, compact `subtitle`, `dt-text`, tooltip the artist) and `title` (priority 1, compact `title`, the track name + the unchanged second line, tooltip `nameOf(row)`); an empty artist or title renders an empty cell; widths so both fit the narrowest non-phone window; the phone item shows title then artist then the existing meta line
- [ ] T004 `src/styles.css`: widths and the phone lines (tokens only, 48 px targets unchanged; `.mix-title-cell`, `.mix-name`, `.dt-item .mix-name` adjusted if needed)
- [ ] T005 `tools/shots/checks.ts:211` and any regression/shot test that looks for the header "Artist – Title" or the `title` column: update to "Artist" and "Title"; add one regression row (next free id after the Mix rows, in `specs/003-web-first-redesign/regression.md` and `tools/shots/regression.spec.ts`): the Mix table has Artist and Title headers; clicking Artist then Title reorders rows; a clue row keeps "not heard" under its title
- [ ] T006 Docs per plan; commit `feat(mix): separate Artist and Title columns`
- [ ] T007 Final: `yarn typecheck && yarn lint && yarn test`, `yarn regression`, `yarn invariants`, public-safe check
