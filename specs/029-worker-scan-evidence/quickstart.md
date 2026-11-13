# Quickstart: releasing and checking spec 029

## Order

Any order works. An app of before this round applies a 0.7.5 result like a 0.7.4 one; the new app shows an older result as
before. To see the levels, both must be updated and the set scanned again (a result already saved has no evidence in it).

1. Merge to `main`: the app deploys.
2. Release the worker 0.7.5 (the tag, then the four executables), or run it from source: `cd worker && uv sync && uv run mix-worker --version` prints `0.7.5`.

## Gates (every commit)

```sh
yarn typecheck && yarn lint && yarn test
cd worker && uv run python -m unittest discover -s tests
```

Each judged by its exit code. Before the merge: `yarn regression` and `yarn invariants`. `yarn shots` only if the owner asks.

## The owner's checks

On the demo (`yarn dev`, then `http://127.0.0.1:5173/myOwnSpotifyData/?demo`, the Sunrise mix):

1. The column reads **Evidence**; rows read "Solid ×5 · −5.8 %", "Heard once · +1.2 %", "Out of step ×2", "Many candidates";
   the tooltip says it in words.
2. Sort by Evidence: Solid rows first, then Heard once, Out of step, Many candidates.
3. The chips **Solid (n)** and **Flagged (n)** show beside **Heard once (n)**; each hides the other rows, deletes nothing.
4. A "second listen" row shows the speed of the track in the mix, not the re-cut speed.

On a real set, with the worker 0.7.5:

5. Scan one of the sets of the research again. In the worker's log, hit lines carry "at M:SS in the track" and a speed, and one
   line counts the levels ("evidence · … solid · …").
6. In the app, no row marked Solid is one you would remove (SC-004). Rows marked Many candidates are
   mostly ones you would.
7. On a set TrackId.net knows and the DJ plays far from original speed, rows that said "Shazam heard … instead" for a real
   track now say "Shazam agrees"; the log shows the extra check probes ("trackid confirm · span N · … ×1.09").
8. The number of probes of the scan is the same as before, plus those check probes.

## If something is wrong

- A level looks wrong on a row: the log line of each of its hits holds the position and the speed; two hits are in step when
  the position advanced by the time between them × the speed, within 0.5 s.
- The worker can be put back to 0.7.4 at any time; the app shows its results as before.
