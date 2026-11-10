# Feature Specification: The worker drops a finding found between two hits of one song

**Feature Branch**: `feat/worker-drop-sandwiched-hits` (stacked on `feat/mix-one-row-per-song`, spec 018)

**Created**: 2026-11-09

**Status**: Draft

**Input**: User description: "I want you to remove findings when something is found in between two songs." Refined by the owner (2026-11-09): the case is **a different song found between two copies of one song** (A, X, A); it is better **in the worker**; the two copies of A must be **at most 180 s apart**.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A wrong match inside a song disappears (Priority: P1)

The scan hears song A at 12:00, a different song X at 13:00, and A again at 14:00. X is almost certainly a false match inside A (a sample, a vocal, a quiet bar). After this change the tracklist has one row, A, at 12:00 with its clips added up, and no X.

**Why this priority**: it is the whole request: fewer wrong rows in a scanned tracklist and in the playlist made from it.

**Independent Test**: hits A@720 s, X@780 s, A@840 s (gap 180 s) give one row A at 12:00 with 2 clips, and no X.

**Acceptance Scenarios**:

1. **Given** hits of song A at t1 and t2 with t2 − t1 ≤ 180 s and one or more hits of other songs strictly between them, **When** the scan result is built, **Then** those other hits are dropped and the two A hits merge into one row (earliest time, clips added, best confidence).
2. **Given** A at t1 and t2 with t2 − t1 > 180 s, **When** the result is built, **Then** the hits between them stay (no distant sandwich is removed).
3. **Given** A, X, B (two different songs around X), **When** the result is built, **Then** X stays.
4. **Given** A, X, Y, A within 180 s, **When** the result is built, **Then** both X and Y are dropped.
5. **Given** A, X, A, Z, A within 180 s of each other pairwise-neighbours, **When** built, **Then** X and Z are dropped and A is one row.

### User Story 2 - Nothing else changes (Priority: P1)

Rows from TrackId.net, clues, gaps and owner rows are not touched; only the Shazam hits of the scan are filtered.

**Acceptance Scenarios**:

1. **Given** a TrackId.net span or a clue candidate between two hits of A, **When** the result is built, **Then** it stays (the rule applies to scan hits only).
2. **Given** a dropped hit's time, **When** the second pass looks for gaps, **Then** the stretch counts as known (inside A), so it does not start a gap or a second-pass probe.

### Edge Cases

- A song is the same when the worker already treats it as the same: the same Shazam id, else the same artist and title (lower-cased, trimmed), the key the worker's merge uses.
- Hits at the same second: ties keep the input order; a hit exactly at t1 or t2 is one of the two A hits, not "between".
- A song found only once between two hits of A far apart stays; nothing is removed on a long gap.
- The app's one-row-per-song rule (spec 018) still runs on every result; it handles copies further apart and hand-imported JSON.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Before the worker merges hits into rows, any hit whose song differs from song A and whose time lies strictly between two hits of A at most the merge gap (`WORKER_MERGE_GAP_SECONDS`, 180 s by default) apart is dropped.
- **FR-002**: "Between two hits of A" means the nearest hit of A before it and the nearest hit of A after it; if both exist and their distance is at most the merge gap, the hit is dropped; with several songs between the same two A hits all are dropped.
- **FR-003**: The rule reads the merge gap setting; there is no new setting.
- **FR-004**: After the drop, the existing merge turns the A hits into one row (earliest time, best confidence, clips counted).
- **FR-005**: Only first-pass and second-pass Shazam hits are filtered; TrackId.net rows, clue rows and gap rows are never dropped by it.
- **FR-006**: The run's report counts the dropped hits (a line in the progress or report, "N findings between two hits of the same song dropped") so the owner can see it happened.
- **FR-007**: The result keeps the F15 shape; no field is added; `tracks` is never empty because of the rule (A stays).
- **FR-008**: A worker change for the owner's computer bumps the version (0.7.2) and the release notes name the rule.

### Key Entities

- **Hit**: one 12 s listen's answer: a time and the song (Shazam id or artist and title).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a scan, no row of a different song sits between two hits of A that are within 180 s of each other.
- **SC-002**: 0 hits are dropped when the two surrounding A hits are more than 180 s apart or when the surrounding songs differ.
- **SC-003**: The number of dropped hits is shown for every run that dropped any.

## Assumptions

- A DJ who really plays A, X, A inside three minutes loses X; the owner accepted that.
- The 180 s limit is the merge gap already in settings; raising `WORKER_MERGE_GAP_SECONDS` raises both.
- The app needs no change: it receives fewer rows.
