# Contract: the Mix screen

| Row | Shows |
|---|---|
| `origin: "trackid"` | the "not heard" flag, the origin text "from TrackId.net · <span times> · <n> references" (references omitted when absent), starts unvalidated like a clue (ADR-10 amendment: Create playlist per the owner's "Validated only / All tracks" choice) |
| a heard row with `confirmedBy: "trackid"` | its usual heard look and a small mark "confirmed by TrackId.net" |
| any older row | unchanged |

`originText` in `src/ui/mix/rowText.ts` gains the `trackid` text; `TracklistTable.tsx` shows the flag for `clue` and `trackid`; the quote line stays for `clue` only. No new screen, no new setting, no new colour (tokens only). Accepted and refused cases in `rowText.test.ts` and `validate.test.ts`; no DOM tests. No `yarn shots` unless the owner asks.
