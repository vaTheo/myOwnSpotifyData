# Feature Specification: Separate Artist and Title columns in the Mix tracklist

**Feature Branch**: `feat/mix-artist-title-columns`

**Created**: 2026-11-10

**Status**: Implemented (2026-11-10)

**Input**: User description: "Can you separate the column ARTIST and track name in the mix section."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read and sort by artist and by title (Priority: P1)

The Mix tracklist shows one column "Artist – Title" today. The owner wants two: **Artist** and **Title**. Each has its own header, and each sorts on its own: a click on Artist orders the tracklist by artist, a click on Title by track name.

**Why this priority**: it is the whole request, and sorting by artist is what a DJ preparing a set needs most.

**Independent Test**: open a mix on the demo data; the table has an Artist column and a Title column; clicking Artist orders rows A→Z by artist; clicking Title orders them A→Z by track name.

**Acceptance Scenarios**:

1. **Given** a mix with identified rows, **When** the table is shown at a wide window, **Then** it has an "Artist" column and a "Title" column, in that order, after Time.
2. **Given** the table, **When** the owner clicks the Artist header, **Then** rows are ordered by artist (A→Z first; a second click reverses), and ties keep the set's order.
3. **Given** the table, **When** the owner clicks the Title header, **Then** rows are ordered by track name only (not by "artist – title"), and ties keep the set's order.
4. **Given** the Sort select (phone and narrow windows), **When** it is opened, **Then** it offers "Artist" and "Title" in place of "Artist – Title".
5. **Given** an unidentified stretch ("ID · unidentified"), **When** the table is sorted by Artist or Title, **Then** it goes last in both directions, as before.

---

### User Story 2 - Everything under the title stays (Priority: P1)

The second line of the old cell (the "not heard" badge, where a row was found, the clue in quotes, the references, the Spotify check words) stays, now under the Title cell.

**Independent Test**: a candidate row found by a clue still shows "not heard", its origin and its quote under its title.

**Acceptance Scenarios**:

1. **Given** a row with a badge, an origin, a clue quote, references or a check line, **When** it is shown, **Then** those lines appear under the Title cell, unchanged in wording.
2. **Given** the Edit or Link form of a row, **When** it opens, **Then** it is unchanged.
3. **Given** a row's Spotify, Listen and More controls, **When** the table is shown, **Then** they are unchanged and name the track as "Artist – Title" for screen readers.

---

### User Story 3 - Phone and narrow windows (Priority: P2)

On a phone the row is a compact item: the title on the first line and the artist under it, as on the other track lists, then the label and meta line as today.

**Acceptance Scenarios**:

1. **Given** a phone-width window, **When** the tracklist is shown, **Then** each item shows the track name, then the artist, then the existing meta line; nothing is cut to unreadable width.
2. **Given** a narrow desktop window, **When** the table is shown, **Then** both Artist and Title stay visible (neither is the first column to hide).

### Edge Cases

- A row with an empty artist or empty title shows an empty cell, never "–" or "undefined".
- A very long artist or title is cut with an ellipsis and said in full on hover.
- Gap rows keep their own layout across the table.
- The saved sort of a mix is view state only: an old choice "Artist – Title" does not break the page; it falls back to the set's own order.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Mix tracklist table has an Artist column and a Title column, replacing the single "Artist – Title" column, both always visible on a non-phone window.
- **FR-002**: Artist sorts by artist (case- and accent-insensitive, as the other text sorts), Title by track name; a missing value goes last in both directions; ties keep the set's order; the first click is A→Z.
- **FR-003**: The Sort select offers "Artist" and "Title" instead of "Artist – Title", in column order.
- **FR-004**: The lines under the title (badge, origin, quote, references, check) move to the Title cell with the same wording.
- **FR-005**: On a phone the title is the item's first line and the artist its second; Label, Confidence, Released, Spotify and Listen keep their places.
- **FR-006**: Screen-reader names and tooltips that say "Artist – Title" stay as they are.
- **FR-007**: No stored data changes (rows keep `artist` and `title`); nothing is read from any source.
- **FR-008**: Edit and Link forms, Delete, Review, Create playlist and every other Mix control are unchanged.

### Key Entities

- **Tracklist row**: a song with its artist and title, shown on one line of the table.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The owner can order a mix by artist in one click.
- **SC-002**: 0 rows lose a line of the information they showed before (badge, origin, quote, references, check).
- **SC-003**: No horizontal scrolling and no unreadable column at the four widths of the screenshot loop.
- **SC-004**: Sorting by Title no longer groups by artist.

## Assumptions

- Artist comes before Title, left to right, as in "Artist – Title".
- Both columns have priority 1 (never hide); widths are set so the table fits the narrowest non-phone window.
- The Label column keeps its place and visibility rules.
- The phone item copies the other track lists (title, artist underneath).
