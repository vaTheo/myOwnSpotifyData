# Feature Specification: One row per song in a scanned mix

**Feature Branch**: `feat/mix-one-row-per-song`

**Created**: 2026-11-09

**Status**: Draft

**Input**: User description: "I see sometimes there is one song that is found on multiple different spans. If it's the case I want only one row to appear; it's not a problem if the span is not correct, keep only the first span in the final result." Owner's picks (2026-11-09): remove the copies **in the app, when a new result arrives**; **scan rows only** count.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A song heard twice shows once (Priority: P1)

The owner scans a mix. The scan hears the same song at 12:30 and again at 41:10 (another track played between, or a long gap). Today the tracklist has two rows for it. After this change it has one row, at 12:30.

**Why this priority**: it is the whole request: a cleaner tracklist and one entry per song in the playlist made from it.

**Independent Test**: a scan result naming "Artist – Song" at 750 s and at 2470 s gives a tracklist with one "Artist – Song" row at 12:30.

**Acceptance Scenarios**:

1. **Given** a scan result with the same artist and title at two or more times, **When** it arrives, **Then** the tracklist has one row for that song, at its earliest time.
2. **Given** the copies differ only in case, accents or a mix marker ("Original Mix", "Extended Mix"), **When** the result arrives, **Then** they count as the same song.
3. **Given** the copies had 3 and 2 matching clips, **When** they are merged, **Then** the kept row counts 5 clips and shows the best confidence of the copies; everything else is the first copy's.
4. **Given** a Tracklistify JSON imported by hand with the same song twice, **When** it is imported, **Then** the same rule applies.

---

### User Story 2 - The owner's rows are never touched (Priority: P1)

Rows the owner added, pasted or edited, and rows already in the mix before the new result, are never removed by this rule.

**Independent Test**: a mix holding a hand-added "Artist – Song" row gets a scan result naming the same song: both rows remain.

**Acceptance Scenarios**:

1. **Given** a saved mix with an edited or manual row, **When** a new scan result names the same song, **Then** the owner's row stays and the result's own copies collapse to one row among themselves.
2. **Given** a mix saved before this change with duplicate scan rows, **When** it opens, **Then** nothing changes until it is scanned again (no rewrite of saved mixes).

### Edge Cases

- Unidentified stretches ("ID · unidentified") are never merged: they name no song.
- A copy with no time comes after the timed ones; when no copy has a time, the first in the result's order is kept.
- Two different songs with the same title by different artists are two songs.
- A song the owner removed from the mix stays removed (the existing "a removed scan track never comes back" rule).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a worker result arrives, its rows hold at most one row per song before they join the mix.
- **FR-002**: The same rule applies to a Tracklistify JSON imported by hand.
- **FR-003**: Two rows are the same song when their artist and title are equal after the app's usual name normalisation (case, accents, punctuation) and with mix markers removed from the title, the rule the Mix's dig links already use to group repeats.
- **FR-004**: The kept row is the copy with the earliest time (rows without a time last; ties keep the result's order). It keeps its own time, span, source and every other field, except: its clip count is the sum of the copies' counts (when any copy has one) and its confidence is the best of the copies' (when any copy has one).
- **FR-005**: Only the incoming result's own rows are merged among themselves. Rows already in the mix (manual, pasted, description, edited, or kept from an earlier result) are never removed or changed by this rule.
- **FR-006**: Unidentified stretches are never merged.
- **FR-007**: Mixes already saved are not rewritten; they lose their copies only when scanned or imported again.
- **FR-008**: Nothing new is read from Spotify or any other source; the rule is applied to rows the app already has.

### Key Entities

- **Tracklist row**: one song (or unidentified stretch) of a mix, with its time, artist, title, clip count and confidence.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a freshly scanned or imported mix, no song appears on two rows that both came from that scan.
- **SC-002**: 0 owner rows (added, pasted, edited) are removed by the rule.
- **SC-003**: The kept row's time is the earliest of its copies in 100 % of merged songs.
- **SC-004**: The playlist made from a scanned mix holds each song once, as before (it already skipped repeated Spotify tracks).

## Assumptions

- "The final result" is the tracklist after a scan or import; the worker keeps sending every span, and the app merges them.
- Summing clips keeps the "Heard once" filter honest: a song heard at two places is not "heard once".
- A DJ who really played a song twice loses the second entry; the owner accepted this ("not a problem if the span is not correct").
- The worker on the owner's computer is unchanged (no new release needed).
