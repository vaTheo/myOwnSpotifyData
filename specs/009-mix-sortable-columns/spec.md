# Feature Specification: Mix tracklist sortable columns

**Feature Branch**: `worktree-sortable-table`

**Created**: 2026-11-07

**Status**: Draft

**Input**: User description: "I would like that the table on MIX is sortable by each possibility so I can manage everything easy. For example I want to sort the confidence section better."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sort the tracklist by Confidence (Priority: P1)

The owner opens an identified mix and wants to review the weakest matches first (or the strongest first). Today the Confidence column cannot be sorted, and the Sort select offers only Time, Clips heard, Best score and Year. The owner clicks the Confidence header and the rows reorder by their confidence, lowest or highest first.

**Why this priority**: This is the owner's own example and the main pain: finding doubtful matches in a long tracklist.

**Independent Test**: Open a mix with rows of different confidence, click the Confidence header twice, and check the rows run from highest to lowest, then lowest to highest.

**Acceptance Scenarios**:

1. **Given** a tracklist with rows of different confidence, **When** the owner clicks the Confidence header, **Then** the rows are ordered by confidence and the header shows the direction.
2. **Given** the table is sorted by Confidence, **When** the owner clicks the header again, **Then** the direction flips.
3. **Given** some rows carry no confidence (not from Tracklistify, or a gap), **When** sorted in either direction, **Then** those rows stay at the bottom and are never shown as zero.

---

### User Story 2 - Sort by any other column (Priority: P1)

The owner can click the header of every column that holds a comparable value (Time, Artist – Title, Label, Source, In your library, Released, Spotify status, Review state) and the tracklist reorders by it, the same way the app's other tables do.

**Why this priority**: The owner asked for "each possibility" so the whole table is easy to manage.

**Independent Test**: For each sortable column, click its header and check the order matches the column's values, and that a second click reverses it.

**Acceptance Scenarios**:

1. **Given** a tracklist, **When** the owner clicks a sortable header, **Then** the rows are ordered by that column, ties keep the set's own order.
2. **Given** a sorted table, **When** the owner returns to Time (or clears the sort), **Then** the rows go back to the set's order.
3. **Given** a column with no value for a row, **When** sorted either way, **Then** that row is last.

---

### User Story 3 - Sorting on a phone (Priority: P2)

On a narrow screen the table shows compact rows without a header, so the owner picks the sort from the existing Sort control, which offers the same choices as the headers, including Confidence.

**Why this priority**: The owner also uses an Android phone, but sets are mostly prepared on a computer.

**Independent Test**: At phone width, open the Sort control and pick Confidence; the rows reorder.

**Acceptance Scenarios**:

1. **Given** a phone-width screen, **When** the owner opens the Sort control, **Then** every sortable column is a choice, with a direction.
2. **Given** a sort chosen on one width, **When** the window is resized, **Then** the same sort stays in force.

---

### Edge Cases

- A mix with no confidence on any row: the Confidence sort is not offered, or leaves the order unchanged, and nothing breaks.
- The row being edited or just added stays visible and in place while a sort or filter is on.
- Sorting never hides rows; the review chips and the decade filter still apply on top of the sort.
- Edit, Delete, Validate and Spotify actions act on the row clicked, whatever the order shown.
- Rows already sorted by the Sort select (Clips heard, Best score, Year) behave as before, and header sort and select never show two different orders at once.
- A different mix opened later starts in the set's own order.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Mix tracklist MUST let the owner sort by Confidence, highest first or lowest first, from the column header.
- **FR-002**: Every column of the tracklist that holds a comparable value MUST be sortable from its header; action-only columns (Listen, More) are not.
- **FR-003**: A header click MUST sort ascending or descending by that column, a second click MUST flip the direction, and the header MUST show the current column and direction.
- **FR-004**: Rows with no value in the sorted column MUST stay last in both directions, and a missing value MUST never be shown or ranked as zero.
- **FR-005**: Ties MUST keep the set's own order, so the result is stable and repeatable.
- **FR-006**: The owner MUST be able to return to the set's own order (Time) in one action.
- **FR-007**: A narrow screen without headers MUST offer the same sort choices, with direction, in the existing Sort control.
- **FR-008**: The existing sort choices (Time, Clips heard, Best score, Year) MUST keep working, and header sort and Sort control MUST always agree on one current order.
- **FR-009**: Sorting MUST combine with the review chips and the decade filter and MUST NOT hide, add or change any row or the saved mix.
- **FR-010**: Row actions (Edit, Delete, Validate, Spotify, Listen) MUST act on the row the owner clicked, whatever the order.
- **FR-011**: The sort is a view choice only: it is not saved with the mix and applying it never triggers a Spotify read.

### Key Entities

- **Tracklist row**: one line of the identified mix (time, artist, title, label, source, confidence, library match, year, Spotify status, review state).
- **Sort choice**: the column and direction in force on the open mix; not persisted.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The owner can bring the lowest-confidence rows to the top of a 100-row tracklist in one click.
- **SC-002**: 100% of sortable columns reorder the rows correctly in both directions, with rows missing a value last.
- **SC-003**: After any sort, the number of rows and each row's content are identical to before.
- **SC-004**: The same sort choices are reachable on a phone-width screen in two taps or fewer.

## Assumptions

- "Table on MIX" is the open mix's tracklist; other tables already sort by header.
- Confidence sorts by how many times the track was found (clips heard), then by the best match score (0-100) shown in the Confidence column, per the owner's ruling; rows from other sources have none.
- The sort is not remembered between mixes or sessions.
- Review state sorts in the order of the review chips (needs review first); the plan fixes the exact order.
