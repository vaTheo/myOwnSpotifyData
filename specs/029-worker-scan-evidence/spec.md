# Feature Specification: Scan evidence, a level on every row the worker hears

**Feature Branch**: `feat/worker-scan-evidence`

**Created**: 2026-11-13

**Status**: Approved (owner 2026-11-13: "Ok you can plan for everrything you have said"); the plan and the tasks wait for the owner's OK before any code

**Input**: Owner (2026-11-12): "With the current setup I found a lot of sound but there are mostly trash and not at all in the mix i put in. […] The issue is i got a lot of falsepositive but some times I manage to get some positive findings with lo % and 1 time found. I would love not miss that one". After the research and its measured options ([Shazam on DJ mixes](../../docs/research/2026-11-13-shazam-mix-accuracy.md), §6), the report recommended option A with two extra labels plus the TrackId.net check asked at the second-pass speeds; owner (2026-11-13): "OK you can proceed opening a branch and worktree for that".

## Today (as found, 2026-11-13, origin/main 9aaf88b, worker 0.7.4)

- Shazam's answer holds, for the matched track, its position in the track (`offset`), a tempo and a pitch difference (`timeskew`, `frequencyskew`) and one or more entries in `matches[]`. `track_entry` (`worker/mix_worker/scan.py`) keeps the track and one `confidence` built from the two skews; the position, the skews and the number of entries are dropped.
- Every answer becomes a hit, hits of one track within 180 s merge into a row (`merge`), a hit between two hits of another track is dropped (`drop_sandwiched`). A row carries `hits` (the count) and `confidence` (the best). Nothing says whether a row is trustworthy.
- The app shows them in the **Confidence** column: "×3 · 92%" ("heard 3× · best 92 %"), sorts on them, and has a **Heard once** chip (`src/ui/mix/rowText.ts`, `tracklistSort.ts`, `src/features/mix/review.ts`). A second-pass row also says "second listen · −9 %": that is the speed the probe was re-cut at, not the speed the track plays at.
- The % measures speed, not certainty: a real track played 4.8 % fast reads 52 %, a wrong answer at original speed reads 100 % (research §4).
- The TrackId.net check (`confirm_due` in `scan.py`, `check_of` in `trackid.py`) asks one probe per span, at normal speed only. On a set played 6 to 8 % slow it answered "differs" or "no match" for real tracks (research §5.6).
- A probe shorter than 12 s finds nothing, and none is padded (`cut_probe`): the last probe of a set, and every probe when `WORKER_PROBE_SECONDS` is under 12 (research §5.1).

Measured on three saved results (research §6.1 and §6.3), with the rules of this spec and no extra Shazam call: 39 rows come out Solid, 35 of them right, none wrong and 4 that could not be judged; on the hardest set, 40 of the 80 rows the owner removed carry a specific warning, with 4 of the 47 kept rows among them; 72 rows of that set stay plain "heard once" and nothing tells the kept from the removed. The owner (2026-11-13): "most of the 32 kept are wrong but good tracks to hear", so on that set nearly every row that is not Solid is wrong, and the rows stay visible because they are worth hearing.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A level on every row Shazam heard (Priority: P1)

The owner opens a scanned mix. Each row Shazam heard says how much evidence stands behind it, so the certain rows stand out and the likely wrong ones are marked. No row disappears because of its level.

| Level | Rule (in this order; the first that fits wins) |
|---|---|
| **Solid** | two hits of the track, on windows that share no audio and are at most 60 s apart, whose position in the track advanced in step: by the time between the windows × the playing speed, within 0.5 s |
| **Inside another track** | not Solid, and the row starts inside the stretch of a Solid row of another track (from its first hit to its last), more than 30 s from both of its ends |
| **Many candidates** | not Solid, not inside, and Shazam's answer for the row's first hit lists 10 entries or more |
| **Out of step** | two hits or more, none in step |
| **Heard once** | one hit |

**Why this priority**: it is the whole measured gain of the research, and it costs no call.

**Independent Test**: a scan with faked Shazam answers that carry positions, one sequence per level; then the app shows the label of each row.

**Acceptance Scenarios**:

1. **Given** a track heard at 0:15 and 0:30 with positions 60.0 s and 75.0 s at original speed, **When** the scan ends, **Then** its row is Solid.
2. **Given** a track played 6 % slow, heard on the second pass at ×1.09 at 1:07 and 1:37 with positions 40.0 s and 68.2 s, **When** the scan ends, **Then** its row is Solid (the speed in the mix is used, not the re-cut speed).
3. **Given** two hits of one track 30 s apart whose positions are 30.0 s and 30.4 s, **When** the scan ends, **Then** the row is Out of step.
4. **Given** one hit of track X at 2:00 while track A is Solid from 1:00 to 4:00, **When** the scan ends, **Then** X's row is Inside another track; the same hit at 1:10 is not (within 30 s of A's start).
5. **Given** one hit whose answer lists 12 entries and that is not inside a Solid row, **When** the scan ends, **Then** its row is Many candidates.
6. **Given** one hit with one entry, outside every Solid row, **When** the scan ends, **Then** its row is Heard once.
7. **Given** any scan, **When** levels are computed, **Then** the rows, their order, `hits` and `confidence` are what they are today: a level never removes or merges a row.
8. **Given** a TrackId.net row or a row from the description, **Then** it carries no level.

---

### User Story 2 - The speed the track plays at, instead of the % (Priority: P1)

Where a row has its evidence, the owner reads the speed the DJ plays the track at ("−5.8 %"), not a % that looks like a certainty. A second-pass row no longer shows the re-cut speed.

**Why this priority**: the % misleads on every pitched track; the speed is true and useful to a DJ.

**Independent Test**: rows with and without evidence render their cell text.

**Acceptance Scenarios**:

1. **Given** a Solid row heard 11 times, played 5.8 % slow, **Then** its cell reads "Solid ×11 · −5.8 %", and its full text says so in words.
2. **Given** a row found on the second pass at ×1.09 whose track plays 7.7 % slow, **Then** the row says "second listen" and "−7.7 %", not "−9 %" or "+9 %".
3. **Given** a row of an older result with no evidence, **Then** it reads as today ("×3 · 92%").

---

### User Story 3 - The TrackId.net check hears a pitched track (Priority: P2)

When the check probe at normal speed does not name the span's track, the worker asks the same place again at the second-pass speeds. A real track played fast or slow then reads "Shazam agrees".

**Why this priority**: measured on one set, 4 of 8 failed checks were real tracks played slow; a few calls fix them.

**Independent Test**: a guided scan with a fake that names the span's track only at ×1.09.

**Acceptance Scenarios**:

1. **Given** a span whose check at normal speed names another track and at ×1.09 names the span's track, **Then** the row's check is "agrees".
2. **Given** a span whose check agrees at normal speed, **Then** no further probe is asked for it.
3. **Given** a span whose check agrees at no speed, **Then** the outcome is what it is today ("differs" with what was heard at normal speed, or "no match"), after at most one extra probe per second-pass speed other than ×1.
4. **Given** a run stopped and resumed, **Then** a check already asked at a speed is not asked again.

---

### User Story 4 - No probe is lost to its length (Priority: P3)

A probe that holds audio but less than 12 s is filled with silence to 12 s before it is sent.

**Acceptance Scenarios**:

1. **Given** a set whose last probe holds 7 s of audio, **Then** the probe sent is 12 s long.
2. **Given** `WORKER_PROBE_SECONDS=8`, **Then** every probe sent holds 8 s of audio and 4 s of silence.
3. **Given** a set of unknown length, **When** a probe holds no audio, **Then** the scan ends as it does today.

---

### User Story 5 - Older results and older apps keep working (Priority: P1)

**Acceptance Scenarios**:

1. **Given** an app from before this round and a result from the new worker, **Then** the rows apply and show as before (the new fields are ignored, nothing is refused).
2. **Given** the new app and a result from an older worker, or a mix saved before, **Then** the rows show as today, with no level.
3. **Given** a run resumed from a state file written by an older worker, **Then** the hits heard before the stop carry no evidence; a row whose first hit has none gets no level.
4. **Given** a saved mix pulled from the server by an older app, **Then** the mix is accepted and the new fields are kept untouched.

### Edge Cases

- Two windows share no audio when the later one starts after the audio of the earlier one ends (12 s × the speed it was cut at). Windows 6 s apart share audio: they never count as a pair (they also "confirm" wrong answers, research §5.4).
- A track the DJ loops, or a repeated intro, reads Out of step although it is real (research §5.5): it is a warning, the row stays.
- A track played twice in one set: pairs are only looked for within 60 s.
- A row made of hits from both passes: each hit's own re-cut speed is used.
- "One row per song": the line of a song takes the best level of its rows (Solid, then Heard once, then Out of step, then Many candidates, then Inside another track).
- A level the app does not know (a later worker): the row is kept and shown with no level.
- The result's size bound: the new fields add a few dozen bytes a row; tracks are never dropped today and stay so.

## Requirements *(mandatory)*

### Functional Requirements

The worker:

- **FR-001**: For every Shazam answer that becomes a hit, the worker MUST keep the position in the track, both skews, the number of entries in `matches[]` and the speed the probe was cut at, in the run state too, so a resumed run has them.
- **FR-002**: After both passes the worker MUST give every row made of Shazam hits one level, by the table of User Story 1, from its own hits and the other hits of the same track. The constants (0.5 s, 60 s, 30 s, 10 entries) are fixed in the code, not settings.
- **FR-003**: The speed in the mix of a hit MUST be (1 + time skew) ÷ the speed its probe was cut at. A row's speed is the middle value over its hits that are in step, else the speed of its first hit.
- **FR-004**: The result MUST carry, on such a row, three new optional fields: the level, the speed in the mix as a percentage with one decimal, and the number of entries of its first hit. The fields `confidence`, `hits`, `origin` and `speed_percent` MUST stay as they are.
- **FR-005**: A level MUST NOT remove, merge, reorder or rewrite any row. The sandwich rule is unchanged.
- **FR-006**: The log line of a hit MUST also say the position in the track and the speed in the mix, and one line at the end MUST count the rows of each level.
- **FR-007**: A probe that holds audio but less than 12 s MUST be filled with silence to 12 s; a probe that holds no audio ends an unknown-length scan as today.
- **FR-008**: When the TrackId.net check at normal speed does not name the span's track, the worker MUST ask the same place at each second-pass speed other than ×1, in the configured order, and stop at the first that names it. The outcome rules are unchanged; a resumed run MUST NOT repeat a check already asked.
- **FR-009**: The scan MUST NOT make any Shazam call beyond today's, except the calls of FR-008.
- **FR-010**: The worker's version MUST move to 0.7.5 with its release note; no new setting, no new dependency, no new host.

The app:

- **FR-011**: A row applied from a result MUST keep the three new fields when present and valid; a saved mix pulled from the server MUST accept them, and MUST refuse a speed that is not a finite number or a count that is not a whole number of 1 or more. An unknown level MUST be kept and shown as no level.
- **FR-012**: The column that shows "×3 · 92%" today MUST show, for a row with a level, the level, the hit count and the speed in the mix; rows without a level MUST read as today.
- **FR-013**: A second-pass row with a speed in the mix MUST say "second listen" without the re-cut speed.
- **FR-014**: The sort on that column MUST put Solid first, then Heard once, Out of step, Many candidates, Inside another track, and the most hits first inside a level; rows without a level keep today's order after them.
- **FR-015**: Two chips MUST be added beside **Heard once** when some row has a level: **Solid** and **Flagged** (Inside another track, Many candidates, Out of step), each with its count.
- **FR-016**: The demo data MUST hold rows of every level, so the mix pages can be checked without the owner's data.
- **FR-017**: No Spotify read or write, no new network call, no `DB_VERSION` bump (optional fields, ADR-05).

Documentation (same batch as the code): this spec's plan and tasks; an addition to the result-shape contract of `specs/016-trackid-worker-clues/`; how-it-works §10, §13, §16, §17; the feature inventory (F44, and the lines of F19, F24, F26 that name the %); Limits and roadmap (the mix-scan accuracy entry); the README's tracklist columns; the CHANGELOG; `worker/README.md` and `worker/RELEASE_NOTES.md`.

### Key Entities

- **Hit evidence** (worker, per hit, not in the result): position in the track, time skew, frequency skew, number of entries, re-cut speed.
- **Row evidence** (result and saved mix, per row, all optional): level, speed in the mix (percent, one decimal), number of entries.

## Decisions (recorded here)

Proposed; each stands unless the owner changes it in the review.

1. **Words.** Solid, Inside another track, Many candidates, Out of step, Heard once: the words of the research note.
2. **The column** is renamed **Evidence**. A row with a level shows no % at all.
3. **Chips.** Solid and Flagged are added; Heard once stays as it is (one hit).
4. **The TrackId.net check** (User Story 3) is part of this round.
5. **Nothing is hidden by default.** Every row stays visible; the level only labels and sorts.
6. **Visual check.** `yarn shots` on the mix pages is run only if the owner asks for it.

## Out of scope

- Confirming rows with extra probes (option B) and a wider second pass (option C): measured, small or no gain (research §6.1, §6.2).
- Removing rows by level, alone or in bulk.
- Any change to where, in which order or at which speeds the second pass asks.
- The hand import of a worker file (it keeps dropping the worker's extra fields).
- Any second recogniser, any new source.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On the same set, the number of Shazam calls of a scan is the same as before, plus at most two per TrackId.net span whose normal-speed check did not agree (with the default speeds).
- **SC-002**: Every level is produced by a test built on invented answers, and no test needs the network or the owner's data.
- **SC-003**: A result of the new worker applies in the app of today's `main` with the same rows as before; a result of worker 0.7.4 shows in the new app exactly as before.
- **SC-004**: The owner scans one of the sets of the research again and finds no row marked Solid that they would remove.
- **SC-005**: `yarn typecheck`, `yarn lint`, `yarn test` and the worker's unit tests exit 0 on every commit.

## Assumptions

- Shazam keeps returning the position and the two skews in its answer; if a field is missing the hit simply has no evidence.
- The thresholds come from four sets (research §9); they are constants so a later round can move them with new measurements.
- "Many candidates" caught rows on one set only, and its cut was chosen there: it labels, it never deletes.
