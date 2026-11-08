# Contract: the result's new fields (F15 additions)

Additive. A result without them stays valid and shows as before.

```json
{ "song_name": "Yuco", "artist": "Kyntral", "time_in_mix": "00:10:16",
  "origin": "trackid",
  "trackid": { "slug": "temple-rat-yaga25-off-the-map", "span_start": 616, "span_end": 857, "references": 31 },
  "metadata": { "label": "Kyntral" }, "hits": 0 }
```

A confirmed heard row keeps every Shazam field (`confidence`, `hits`, `metadata`) and adds `"confirmed_by": "trackid"`, with `time_in_mix` set to the span's start.

Rules: a `trackid` row has no `confidence`; `span_start`, `span_end` are integer seconds, `0 ≤ span_start ≤ span_end ≤ 100000`; `slug` is a string of at most 200 characters; `references` is an integer ≥ 0 or absent. The app validator (`src/server/validate.ts`) refuses a `trackid` object outside these bounds (the row is dropped, as for any invalid row today) and an `origin` other than `replay`, `clue` or `trackid`.

`worker/tests/test_scan.py` pins the shape against the app's fixture keys as today; a new pin covers the three fields.
