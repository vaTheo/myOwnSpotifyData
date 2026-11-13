# Contract: the result's new row fields (F15 additions, worker 0.7.5)

Additive. A result without them stays valid and shows as before. They sit on a row made of Shazam hits (no `origin`, or
`origin: "replay"`), never on a `trackid` or a `clue` row.

```json
{ "song_name": "Track", "artist": "Artist", "time_in_mix": "00:51:52",
  "confidence": 73.4, "duration": null, "hits": 14,
  "origin": "replay", "speed_percent": 9,
  "evidence": "solid", "mix_speed_percent": -7.7, "candidates": 1,
  "metadata": { "isrc": "XX0000000000" } }
```

| Field | Type | Rule |
|---|---|---|
| `evidence` | string | one of `solid`, `candidates`, `out_of_step`, `once` (data-model.md) |
| `mix_speed_percent` | number | one decimal; the speed the track plays at in the mix, in percent of its original speed (−7.7 is 7.7 % slower) |
| `candidates` | integer ≥ 1 | the number of entries Shazam's answer listed for the row's first hit |

Rules:

- The three are present together, or absent together (a row whose first hit has no evidence).
- `confidence`, `hits`, `origin`, `speed_percent`, `metadata` and the order of the rows are exactly what 0.7.4 writes.
  `speed_percent` stays the speed the probe was re-cut at.
- No row is added, removed or merged because of a level.
- `shazam_check` on a `trackid` row keeps its shape and its four outcomes.

What reads it:

- An app before this round ignores the three fields (`toRow`, `trackExtras` copy named fields only).
- The app of this round bounds them (contracts/app.md) and drops a field out of bounds, keeping the row.

Pin: `worker/tests/test_scan.py` pins one full row with the three fields, beside the existing F15 pin.
