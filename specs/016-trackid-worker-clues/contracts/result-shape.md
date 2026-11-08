# Contract: the result's new fields (F15 additions)

Additive. A result without them stays valid and shows as before.

```json
{ "song_name": "Yuco", "artist": "Kyntral", "time_in_mix": "00:10:16",
  "origin": "trackid",
  "trackid": { "slug": "temple-rat-yaga25-off-the-map", "span_start": 616, "span_end": 857, "references": 31 },
  "shazam_check": { "outcome": "agrees" },
  "metadata": { "label": "Kyntral" }, "hits": 0 }
```

`shazam_check` for a disagreement: `{"outcome": "differs", "artist": "Other", "song_name": "Track", "confidence": 0.7}`; the other outcomes carry only `outcome`.

Rules: a `trackid` row has no `confidence` of its own; `span_start`, `span_end` are integer seconds, `0 ≤ span_start ≤ span_end ≤ 100000`; `slug` is a string of at most 200 characters; `references` is an integer ≥ 0 or absent; `shazam_check.outcome` is one of `agrees`, `differs`, `no_match`, `not_asked`; `artist`/`song_name` ≤ 200 characters and `confidence` 0..1, only with `differs`. When the worker's result is applied (`src/features/mix/worker.ts`), an object outside these bounds is dropped and the row stays as a TrackId.net row without that object (a good track is not lost to a bad span). The pull validator (`src/server/validate.ts`) is stricter and refuses an object outside these bounds (the row is dropped, as for any invalid row today), a `trackid` or `shazam_check` on a row whose origin is not `trackid`, and an `origin` other than `replay`, `clue` or `trackid`.

`worker/tests/test_scan.py` pins the shape against the app's fixture keys as today; a new pin covers the three fields.
