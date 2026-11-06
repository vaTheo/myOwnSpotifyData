# Contract: worker additions (round 003)

Extends `specs/002-mix-analysis-worker/contracts/worker.md`. Unchanged: commands, exit codes, the server calls.

## Settings (new; every one in `.env.example` and `mix_worker/env.example`, byte-identical)

| Name | Default | Meaning |
|---|---|---|
| `WORKER_REPLAY_SPEED_PERCENT` | 4 | speed correction of the second pass, ± this percent alternately; 0 = no second pass |
| `WORKER_CLUES` | 1 | read the description, chapters and comments; 0 = never |
| `WORKER_CLUE_SECONDS` | 90 | how long reading clues may take before it is dropped |
| `WORKER_LOOKUPS` | 100 | name lookups per set at most; 0 = none (clues are still attached) |

## Pipeline (after the download, before the write)

1. **First pass**: as in 0.2.0 (12 s every 15 s). Its hits and its per-probe outcome (hit / no match / skipped) are kept.
2. **Second pass** (`scan.replay`): for each run of unmatched probes, replay probes 1, 3, 5… at +p %, −p %, +p %… (R1, R2);
   same cooldown, jitter and pauses; one log line per replay; a refusal stops it and keeps what it found (R6).
3. **Clues** (`clues.read`): one `extract_info(download=False, getcomments=True)` in a thread, joined after
   `WORKER_CLUE_SECONDS`; parse description, chapters, comments into clues with positions (R3, R4). A failure is one log
   line.
4. **Candidates** (`clues.lookup`): for each clue in a still-empty gap (or set-wide) that reads as one `Artist – Title`,
   not already a track of the set: Deezer search, then MusicBrainz if Deezer accepts nothing; a Discogs or Deezer link is read
   by its id (R8); accepted by the ported equality rules only (R5). Paced (Deezer 0.2 s, MusicBrainz 1.1 s, Discogs 2.5 s),
   `WORKER_LOOKUPS` clues at most. Hosts `api.deezer.com`, `musicbrainz.org`, `api.discogs.com` join the outbound list
   (`worker/CLAUDE.md`).
5. **Write**: tracks sorted by time (set-wide candidates last), `mix_info.second_pass`, `gaps` with their clues, set-wide
   `clues`; cut clues nearest-gap first under `WORKER_RESULT_MAX_BYTES`.

## Seams for tests

`scan.replay(outcomes, cut, recognise, sleep, classify, line, speed)`; `clues.read(url, ydl_factory, timeout)`;
`clues.parse_*` pure; `clues.lookup(clue, fetch_json, sleep)` with a fake `fetch_json`; no test touches the network.
Shared cases with the app: `src/features/mix/parse.cases.json`, `src/features/mix/match.cases.json`.
