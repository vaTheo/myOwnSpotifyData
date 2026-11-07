# Quickstart: check round 005

1. `yarn typecheck && yarn lint && yarn test`; `cd worker && uv run python -m unittest discover -s tests`.
2. Worker 0.5.0: scan a set; the JSON's heard tracks carry `release_date`; the log has one "years" line (filled N by ISRC).
3. Phone, Mix: rows show their year; Year sort and a decade chip work; undated rows show nothing and sort last.
4. Create playlist on a set with undated clue rows: matched ones gain a year; dated rows keep theirs.
5. Settings → BPM and key run: a third pass "release years"; the line counts years; Top, a playlist, Crate, Artist show years,
   Year sort and decades.
