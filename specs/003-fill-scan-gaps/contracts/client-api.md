# Contract: app additions (round 003)

- `resultToRows(result)` (`src/features/mix/worker.ts`): also maps `origin`, `speed_percent`, `clue` onto rows, builds gap
  rows from `mix_info.gaps` (with `clues`), and returns `clues` (set-wide). Every clue text is kept as plain text, cut to
  1 000 characters; a clue failing the checks is dropped, not fatal.
- `validateMix` (`src/server/validate.ts`): the new optional fields checked on pull (strings, finite `atSec` or null, kind in
  the three values, the size caps of data-model.md); a mix failing them is dropped and counted as today.
- Mix screen (`src/ui/Mix.tsx`): a row with `origin: 'replay'` shows "second listen · +4 %"; a candidate shows "from a
  comment" (or "from the description") with the clue's author and text; a gap row shows its clues folded ("3 comments around
  here"); set-wide clues sit in one folded block above the tracklist. Text is rendered as text, never HTML; links in it are
  not made clickable.
- `pickMatch`, `searchTrack`, Create playlist: unchanged. A candidate is an identified row; its `isrc` from Deezer is tried
  first (it is `source: 'tracklistify'`, still as detected).
