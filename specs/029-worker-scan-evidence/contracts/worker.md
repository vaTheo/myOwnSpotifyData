# Contract: the worker (spec 029, 0.7.5)

No new setting, no new dependency, no new host. Every function below is pure unless it says otherwise.

## `worker/mix_worker/evidence.py` (new)

```python
STEP_TOLERANCE_SECONDS = 0.5
STEP_MAX_GAP_SECONDS = 60
MANY_CANDIDATES = 10
LEVELS = ("solid", "candidates", "out_of_step", "once")

def heard_of(response: Any, speed: float = 1.0) -> dict[str, Any] | None
def mix_speed(heard: dict[str, Any]) -> float
def in_step(a_time: float, a: dict[str, Any], b_time: float, b: dict[str, Any], probe_seconds: float) -> bool
def levels(rows: list[tuple[str, list[tuple[float, dict[str, Any] | None]]]], probe_seconds: float) -> list[dict[str, Any]]
```

- `heard_of`: `None` unless `response` is a dict with a non-empty `matches` list whose first entry has a numeric `offset` and
  `timeskew` (booleans are not numbers). `frequencyskew` is kept when numeric, else `None`. `matches` is the list's length.
- `in_step`: the two rules of data-model.md; the caller passes the earlier hit first, a pair in the wrong order is `False`.
- `levels`: one item per row, in order: `(merge key, [(hit time, heard or None), …])` with the hits in time order. It returns one
  dict per row: `{}` when the first hit has no evidence, else `{"evidence", "mix_speed_percent", "candidates"}`.
  `mix_speed_percent` is `round((v − 1) × 100, 1)` with `v` the median of `mix_speed` over the row's hits that take part in an
  in-step pair, else of the first hit.

## `worker/mix_worker/scan.py`

- `track_entry` is unchanged. Where a response becomes an entry (first pass, second pass, the check probe), the entry also gets
  `heard = evidence.heard_of(response, speed)` when it is not `None` (speed 1 on the first pass and the normal-speed check).
- `merge_with_hits(hits, gap) -> list[tuple[dict, list[Hit]]]`: the rows of `merge` with each row's hits. A row never holds the
  key `heard`. `merge(hits, gap)` returns the same rows as before.
- `scan()`: after `drop_sandwiched`, the rows of `merge_with_hits` get the fields of `evidence.levels`. Nothing else about the
  rows changes (count, order, `hits`, `confidence`, `origin`, `speed_percent`).
- `pad_wav(data: bytes, seconds: float = PROBE_SECONDS) -> bytes`: a WAV shorter than `seconds` is returned with zero samples
  added up to `seconds`; data under `MIN_PROBE_BYTES`, already long enough, or not a readable WAV is returned as it is. Never
  raises. `cut_probe` returns `pad_wav` of what ffmpeg wrote.
- `confirm_due`: when the normal-speed entry does not name the span's track, and `cut_at` is given and `gap_step > 0`, the same
  place is asked at each speed of `second_pass_order(speeds)` other than 1, in that order, until an entry names the span's track;
  only that entry is absorbed. Each retry answered by Shazam is remembered as `remember("confirm", f"{span}@{speed:g}", entry)`;
  a resumed run reads those keys and does not ask them again.

## Log lines

```text
  probe 207/729 · 00:51:30 · cut 375 KB 0.21 s · shazam 0.9 s · NEW · Artist — Track · XX0000000000 · Label · at 1:32 in the track · −7.7 % · 73 %
  gap 12/245 · 00:51:52 ×1.09 · shazam 1.0 s · same track · Artist — Track · at 1:53 in the track · −7.7 % · 73 %
  trackid confirm · span 3 · 00:44:41 ×1.09 · shazam 0.8 s · Artist — Track · at 2:10 in the track · −7.7 % · 80 %
  evidence · 11 solid · 27 many candidates · 4 out of step · 72 heard once
```

- The position and the speed appear only when the entry has evidence. The speed is `−7.7 %`, `+3.4 %` or `0.0 %`.
- The `evidence` line comes after the second-pass summary; a level with no row is left out; no line when no row has a level.

## Calls

A scan makes exactly the Shazam calls of 0.7.4, plus the check's retries: at most one per second-pass speed other than ×1 for
each span whose normal-speed check did not name its track.

## Version

`0.7.5` in `worker/mix_worker/__init__.py`, `worker/pyproject.toml` and `worker/uv.lock`; one entry at the top of
`worker/RELEASE_NOTES.md`.

## Amended in 0.7.6 (two fixes, owner 2026-11-13)

Found on the first 0.7.5 scan of a real set compared with its 0.7.2 scan; the rest of this contract stands.

- **A row's level counts the hits a span took.** `levels(rows, probe_seconds, elsewhere=None)`: `elsewhere` maps a merge key to
  `[(hit time, heard or None), …]`, the hits of that track that made no row. A row's hit pairs with them as with any hit of its
  key; they get no item in the result and stay out of `mix_speed_percent`. `scan()` passes every entry `absorb` gave to a
  TrackId.net span (grid hits, second-pass hits, the check probe and its agreeing retry), with its probe time, on a resumed
  run too, whichever track the entry names: a hit of another track heard inside a span is still a hit of that track. A saved
  entry without an artist or a title has no key and pairs with nothing. Before, a row made of a track's lead-in (one hit
  before the span, the in-step hits inside it) read `out_of_step` or `once`.
- **One rule for "names the span's track".** `trackid.names_track(span, entry) -> bool` is used by `absorb`, by `confirm_due`
  (the retry decision and the absorbed retry) and by `check_of`. It is the `match.py` rule, plus two spellings of one record:
  an artist equal to a leading run of the span's credit once every space is removed from both cleaned names ("No:va Kid" /
  "Nova Kid" / "NovaKid"), and a remaster tag removed from both titles before they are compared: a bracketed
  `(Remastered)`, `[2011 Remaster]`, `(Remastered 2011)`, `(Remastered Version)`, or the same after ` - ` at the end. Another
  version ("(Someone Remix)") is still another title, and whatever the `match.py` rule accepts is still accepted. Because
  `absorb` uses it, a hit in the other spelling whose window overlaps the span's edge is now absorbed instead of making a row.
  `match.py` itself, the app's rule and the clue lookup's, is unchanged.
- **Calls.** No call is added. A span whose normal-speed check names its track in another spelling no longer spends retries.
- **Version.** `0.7.6` in the same three files; one entry at the top of `worker/RELEASE_NOTES.md`.
