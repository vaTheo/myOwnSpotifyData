# Quickstart: validate round 003

Prerequisites: worker built from this branch (`cd worker && uv sync`), signed in; the app from this branch on the dev server
or deployed.

1. **Second pass on the LYL Radio set** — Ask again on `https://soundcloud.com/stakhan-607786920/lyl-radio-planete-noire-nefeli`.
   Expect in the log after the first pass: `second pass · N gaps · M replays`, then `replay k/M · HH:MM:SS · +4 % · …` lines
   alternating +4 and −4; at the end `second pass · found X`. Compare with the owner's playlist
   (`open.spotify.com/playlist/0f7zUOcRH0aaOWKoM3n3jK`): SC-001 wants ≥ 2 more of its tracks than the first pass alone.
2. **Rate limit during the second pass** (unit test `test_scan.py`): a fake `RateLimited` beyond the pauses in the second
   pass → result sent with the first pass's rows, `second_pass.stopped = "rate limited"`.
3. **Clues** — a SoundCloud set with timed comments: the gap rows on the Mix screen show "N comments around here"; unfolded,
   each comment shows author, position and text as plain text.
4. **Description tracklist** — a set whose description lists ≥ 5 `Artist – Title` lines: set-wide block above the
   tracklist; lines with times appear on their gaps.
5. **Candidate** — a clue "Artist – Title" whose exact pair Deezer has: a row "from a comment", ISRC filled; Create playlist
   adds it. A clue naming a version Deezer does not hold (Rosie Gaines – Closer Than Close vs the Mentor edit): no row.
6. **Clues unreadable** — `WORKER_CLUE_SECONDS=1`: log `clues · dropped after 1 s`, tracklist sent as usual (SC-005).
7. **Older app** — the result opened by the app from `main` before this round: rows as before, nothing breaks (FR-014).
8. **Timing** — a 2 h set ends in under 75 minutes (SC-003); record the number in the spec page.
