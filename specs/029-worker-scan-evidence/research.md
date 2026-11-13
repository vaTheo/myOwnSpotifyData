# Research: the choices behind the plan (spec 029)

The measurements are in [the research note](../../docs/research/2026-11-13-shazam-mix-accuracy.md); this file holds only the
design choices they lead to and the code facts those choices rest on. Line numbers: `origin/main` at `9aaf88b`.

## R1. Where the evidence of a hit lives

- **Decision**: one key, `heard`, on the entry dict of a hit; removed when a row is built.
- **Rationale**: the run state stores the entry whole (`runstate.py:75-81`, `scan.py:657-658`, `:731-732`) and a resumed run reads
  it back whole (`:620-626`, `:700-706`), so the evidence survives a resume with no change to the state's shape. `track_entry`
  keeps its exact output, which a test pins against the app's fixture (`worker/tests/test_scan.py:84`).
- **Alternatives**: a field on `Hit` (lost on resume unless the run state grows a second structure); new keys at the top of the
  entry (they would leak into the row and the result).

## R2. The level rules and their numbers

- **Decision**: the four levels of spec.md in that order, with 0.5 s, 60 s and 10 entries as constants.
- **Rationale**: measured. In step never confirmed a wrong answer on four sets; true pairs are within 0.11 s, the closest wrong
  pair is 0.95 s off (note §5.4). Tolerances from 0.2 to 1.0 s give the same counts; a 180 s gap instead of 60 s moves one row
  (note §10). "Many candidates" is the label of note §6.3. The note's other label, "inside another track", is not built: the
  sandwich rule (spec 019) already drops a hit lying between two hits of another track, and the saved results the note
  measured it on are older than that rule (spec.md, decision 7).
- **Alternatives**: settings for the four numbers (rejected: nothing to tune yet, and ADR-06 asks for the minimum); using the
  shape of the two skews as a level (rejected: 13 of 18 kept rows fail it on one set, note §5.4).

## R3. Which hits pair

- **Decision**: hits kept after `drop_sandwiched`, of the same merge key, across rows.
- **Rationale**: the measurement paired hits of one track across the rows the merge made of it (three rows of one track were
  Solid only together). A hit the sandwich rule dropped is already judged a false match.
- **Alternatives**: pairing inside one row only (a real track split in two rows by a wrong hit between them would read Heard once).

## R4. The speed shown

- **Decision**: `(1 + timeskew) / cut speed`, as a percentage with one decimal; for a row, the middle value over its hits in step,
  else its first hit.
- **Rationale**: a re-cut probe reports skews relative to the re-cut audio (note §4); `speed_percent` today is the re-cut speed
  (`scan.py:588-591`) and reads the wrong way round for the owner. The existing field is kept for older apps.

## R5. Padding in Python, not in ffmpeg

- **Decision**: `pad_wav` with the standard library `wave`, applied to what ffmpeg wrote.
- **Rationale**: a scan of unknown length ends when a probe comes back with no audio (`scan.py:634-635`, `MIN_PROBE_BYTES`). An
  ffmpeg pad filter could turn "no audio" into 12 s of silence and the scan would never end. Padding after the length is known
  keeps that test as it is. Measured: audio of 8, 10 and 11 s filled to 12 s matched 12 of 12 (note §5.1).
- **Alternatives**: `apad=whole_dur=12` (the risk above); refusing `WORKER_PROBE_SECONDS` under 12 (breaks a setting the owner may
  have set, for no gain once probes are padded).

## R6. The check's retries do not change "differs"

- **Decision**: a retry answer is absorbed only when it names the span's track.
- **Rationale**: `check_of` reports "differs" with the most confident entry (`trackid.py:232-242`). A re-cut probe of a track
  that is not there names look-alikes with a high % (note §5.2); absorbing them would replace what normal speed heard by a worse
  answer. Absorbing only an agreeing answer leaves `check_of` and the app's texts untouched.
- **Alternatives**: a new outcome or a speed field in `shazam_check` (an older app's `validateMix` bounds that object; not needed
  to fix the measured fault).

## R7. No retry when the second pass is off

- **Decision**: the check asks again only when `cut_at` is given and `gap_step > 0`.
- **Rationale**: `WORKER_SECOND_PASS_STEP_SECONDS=0` is the owner's way to say "no re-cut probes"; the check follows it.

## R8. The same words on both sides

- **Decision**: the app stores the worker's level word as it came (`solid`, `candidates`, `out_of_step`, `once`) and
  maps it to text only when shown.
- **Rationale**: `validateMix` refuses a whole pulled mix on an unknown `origin` (`validate.ts:254-260`), which forced "update the
  app first" in round 016. A level that is any short string, shown only when known, lets a later worker add a level without
  breaking an older app.

## R9. What an older app does

- **Decision**: no release order is imposed.
- **Rationale**: `toRow` (`tracklistify.ts:50-80`) and `trackExtras` (`worker.ts:74-110`) copy named fields only, so unknown row
  keys in a result are ignored; `validateMix` keeps unknown row keys of a pulled mix (`validate.ts:11-12`, tested at
  `validate.test.ts:49`). Old fields (`confidence`, `hits`, `origin`, `speed_percent`) are unchanged.

## R10. The sort key and the column

- **Decision**: keep the sort id `confidence` and the cell's functions; change their texts and add the level's rank in front of
  the existing value.
- **Rationale**: the existing value `hits × 1000 + confidence` stays under 1 000 000, so a rank multiplied by 1 000 000 decides
  first and rows without a level keep their order after the others. Keeping the id avoids touching every caller of the sort.
  The regression rows that click the header by its text are updated with it.
