# Data model: Fill the gaps of a worker scan

All additions are optional fields: a result from worker 0.2.0 and a saved mix from before this round stay valid; no server
migration, no `DB_VERSION` bump (ADR-05).

## The result (worker → server → app), additions to the F15 shape

```jsonc
{
  "mix_info": {
    "...": "as today",
    "second_pass": { "replays": 41, "found": 3, "stopped": null },      // null | "rate limited" | "no answer"
    "gaps": [                                                            // gaps still empty after the second pass
      { "start": 2040, "end": 2130,                                      // seconds, probe starts
        "clues": [ { "at": 2050.4, "author": "someone", "text": "ID? 🔥", "kind": "comment" } ] }
    ],
    "clues": [ { "at": null, "author": "Stakhan", "text": "Rosie Gaines – Closer Than Close", "kind": "description" } ]
  },
  "tracks": [
    { "...": "as today", "origin": "replay", "speed_percent": 4 },        // found on the second pass
    { "song_name": "Title", "artist": "Artist", "time_in_mix": "00:34:10", "confidence": null,
      "origin": "clue",
      "clue": { "at": 2050.4, "author": "someone", "text": "Artist – Title", "kind": "comment" },
      "metadata": { "isrc": "GB...", "links": { "deezer": "https://www.deezer.com/track/1" } } }
  ]
}
```

- `kind`: `"comment"`, `"chapter"` or `"description"`. `at`: seconds into the set, or `null` for a set-wide line.
- A clue candidate's `time_in_mix` is its clue's `at` (a set-wide candidate: `null` → the row has no time) and its
  `confidence` is `null` (it was not heard).
- Rules: `origin` absent means heard on the first pass. A candidate never carries `confidence`. Text is plain, ≤ 1 000
  characters (longer is cut with `…`); ≤ 30 clues per gap, ≤ 200 set-wide; `gaps` lists only gaps that are still empty.

## App: `TracklistRow` (optional additions)

| Field | Type | Meaning |
|---|---|---|
| `origin` | `'replay' \| 'clue'` | absent: heard on the first pass |
| `speedPercent` | `number` | replays: +4 or −4 |
| `clue` | `Clue` | candidates: what proposed it |
| `clues` | `Clue[]` | gap rows only: the clues around it |

`Clue = { atSec: number | null; author: string; text: string; kind: 'comment' | 'chapter' | 'description' }`.

Gap rows from a worker result: `gap: true`, `startSec`/`endSec` from `gaps[]`, `source: 'tracklistify'`, `clues`. The row
"links to nothing and matches nothing", as every gap row; Create playlist skips it. A candidate row is an ordinary identified
row (`gap: false`, `source: 'tracklistify'`, `isrc` from the catalogue), so Create playlist includes it (owner's pick).

## App: `MixRow` (optional addition)

| Field | Type | Meaning |
|---|---|---|
| `clues` | `Clue[]` | set-wide lines (description tracklist without times), shown once above the tracklist |

## Merge with an existing mix

`mergeWorkerRows` (round 002) replaces the worker's own rows and keeps the owner's edits; gap rows and candidates are worker
rows like the others, so a new result replaces them, and a candidate the owner deleted does not come back unless the new
result proposes it again.
