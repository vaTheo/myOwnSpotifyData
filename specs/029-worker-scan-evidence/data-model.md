# Data model (spec 029)

## Hit evidence (worker only, key `heard` on a hit's entry)

| Field | Type | From |
|---|---|---|
| `offset` | number, seconds | `matches[0].offset`: the position in the catalogue track where the probe starts |
| `timeskew` | number | `matches[0].timeskew` |
| `frequencyskew` | number or `null` | `matches[0].frequencyskew` |
| `matches` | whole number ≥ 1 | `len(matches)` |
| `speed` | number | the speed the probe was cut at: 1 on the first pass and the normal check, else the second-pass speed |

- Absent when `offset` or `timeskew` is not a number, and on every entry stored by a worker before 0.7.5.
- Stored in the run state with the entry; never written to the result.
- The time of the hit in the mix is `Hit.time`, as today.

Derived, never stored: `mix_speed = (1 + timeskew) / speed`.

## In step

Two hits a and b of one merge key, a before b, both with evidence, are in step when:

1. `probe_seconds × a.speed ≤ b.time − a.time ≤ 60` (the windows share no audio and are at most 60 s apart);
2. `|b.offset − (a.offset + (b.time − a.time) × mix_speed(a))| ≤ 0.5`.

## Row evidence (result and saved mix, on a row made of Shazam hits)

| Result field | App field | Type | Meaning |
|---|---|---|---|
| `evidence` | `evidence` | string | `solid`, `inside`, `candidates`, `out_of_step` or `once` |
| `mix_speed_percent` | `mixSpeed` | number, one decimal | `(mix_speed − 1) × 100`: the middle value over the row's hits that are in step, else the first hit's |
| `candidates` | `candidates` | whole number ≥ 1 | the number of entries of the first hit's answer |

All three are absent together when the row's first hit has no evidence. TrackId.net rows and rows from the description never
carry them.

## Levels, first that fits

| Level | Rule |
|---|---|
| `solid` | one of the row's hits is in step with another hit of the same key (kept after the sandwich rule), of this row or another |
| `inside` | the time of the row's first hit `t` satisfies `first + 30 < t < last − 30` for a `solid` row of another key, `first` and `last` being that row's first and last hit times |
| `candidates` | the first hit's `matches` is 10 or more |
| `out_of_step` | the row has two hits or more |
| `once` | the row has one hit |

## App bounds (a result's row and a pulled mix's row)

| Field | Accepted | Otherwise |
|---|---|---|
| `evidence` | a non-empty string of at most 32 characters | result: the field is dropped; pulled mix: the mix is refused |
| `mixSpeed` | a finite number from −50 to 50 | the same |
| `candidates` | a whole number from 1 to 1000 | the same |

A level word the app does not know is kept and shown as no level.

## Order of the levels (sort, and the line of one song)

`solid` (5), `once` (4), `out_of_step` (3), `candidates` (2), `inside` (1). **Flagged** is `out_of_step`, `candidates`, `inside`.

## Run state

`confirm` gains keys `"<span index>@<speed:g>"` for the check's retries beside the existing `"<span index>"`. No other change;
the state has no version and its settings key is unchanged.
