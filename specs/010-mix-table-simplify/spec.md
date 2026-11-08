# Feature Specification: Simpler mix tracklist table

**Feature Branch**: `worktree-sortable-table`

**Created**: 2026-11-08

**Status**: Implemented

**Input**: User description: "In the mix section, in the table remove the source column. In the review column remove the validate, keep the delete. Every track on the list are validated by default, remove the In your library. Merge confidence and clip, keep the sortable logic. On the spotify column, the link must be the link that opens in app directly. Add a shazam icon and a soundcloud icon where I can click directly on it."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A leaner table (Priority: P1)

The owner opens a mix and sees only the columns that help prepare a set: the Source column, the In your library column and the Validate button are gone. Every track is treated as kept; the only review action left is Delete. Confidence and Clips are one column, so one cell tells how sure the scan is and how many times the track was heard.

**Why this priority**: It is most of the request and reduces noise on every row, on a computer and a phone.

**Independent Test**: Open a mix with identified, manual and gap rows; check the three columns are gone, Delete still removes a row, and Confidence and Clips appear as one column.

**Acceptance Scenarios**:

1. **Given** an opened mix, **When** the table shows, **Then** there is no Source column, no In your library column and no Validate button; each row still offers Delete.
2. **Given** a mix saved earlier with rows marked "to review", **When** it is opened, **Then** every row counts as kept, with no "to review" mark.
3. **Given** the merged Confidence column, **When** the owner clicks its header, **Then** rows sort by times heard first, then by percentage (the existing rule), and a second click reverses it.
4. **Given** a row with no confidence (manual row, gap), **When** sorted either way, **Then** it stays last and no zero is shown.
5. **Given** the To review and Validated filter chips, **When** the mix opens, **Then** they are gone, since every track is kept; the other filters remain.

---

### User Story 2 - Play on Spotify opens the app directly (Priority: P1)

The Spotify column's link opens the track in the Spotify app straight away, on a phone and on a computer, not the web page.

**Why this priority**: The owner plays tracks to check them; the web page is an extra step.

**Independent Test**: Tap the Spotify link of a found row on a phone and on a computer with the app installed; the app opens on the track.

**Acceptance Scenarios**:

1. **Given** a row found on Spotify, **When** the owner clicks its Spotify link, **Then** the Spotify app opens on that track.
2. **Given** a row not found or not checked, **When** the table shows, **Then** no direct link is offered, as today.

---

### User Story 3 - Shazam and SoundCloud icons on the row (Priority: P2)

Each row shows a Shazam icon and a SoundCloud icon that open the track's page in one click, without opening a menu.

**Why this priority**: These are the owner's other listening sources; one click saves a menu step.

**Independent Test**: A row with a known Shazam page shows a clickable Shazam icon that opens it; a row with a SoundCloud page shows the SoundCloud icon likewise.

**Acceptance Scenarios**:

1. **Given** a row with a known Shazam page, **When** the owner clicks the Shazam icon, **Then** that page opens in a new tab.
2. **Given** a row with a known SoundCloud page, **When** the owner clicks the SoundCloud icon, **Then** that page opens in a new tab.
3. **Given** a row with no known page for a source, **When** the table shows, **Then** that source's icon is absent or shown disabled, never pointing at a wrong track.

---

### Edge Cases

- Create playlist from mix followed "Validated only or All tracks"; with every track kept it covers all remaining rows.
- A deleted row is gone from the table and from playlist creation, as today.
- Phone rows: the merged confidence and the icons fit the compact row without horizontal scroll.
- A row with a Shazam page but no SoundCloud page (or the reverse) shows only the icon that applies.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The mix table MUST NOT show a Source column.
- **FR-002**: The mix table MUST NOT show an In your library column.
- **FR-003**: The Review column MUST offer Delete only; the Validate button MUST be removed.
- **FR-004**: Every track of a mix, new or saved before this change, MUST be treated as validated; nothing is shown as "to review".
- **FR-005**: Confidence and Clips MUST be one column showing both values for the rows that have them.
- **FR-006**: The merged column MUST stay sortable by header and by the phone Sort control, ordering by times heard, then percentage, with rows lacking a value last in both directions.
- **FR-007**: The Spotify link of a found row MUST open the Spotify app on the track directly.
- **FR-008**: Each row MUST show a clickable Shazam icon and a clickable SoundCloud icon when the track's page for that source is known, each opening that page.
- **FR-009**: Every other column keeps its current sort behavior.
- **FR-010**: The To review and Validated filter chips MUST be removed.

### Key Entities

- **Tracklist row**: a track of a mix with its times heard, confidence, Spotify result and the Shazam and SoundCloud pages when known; its "validated" mark no longer varies (always kept).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The table has three fewer controls per row (Source, In your library, Validate) and one fewer column pair (Confidence and Clips merged).
- **SC-002**: From a found row, the owner reaches the track in the Spotify app in one tap (on a computer). On a phone the cell shows
  plain "On Spotify" (the 48 px target rule) and Play on Spotify opens the app from More › Listen… (three taps).
- **SC-003**: From a row with a known page, the owner reaches Shazam or SoundCloud in one click, without a menu.
- **SC-004**: Sorting by the merged column gives the same order as the Confidence sort does today.

## Assumptions

- "Remove the In your library" means the whole column (not only a badge).
- Because all tracks are kept, the validation filters (To review, Validated) have no purpose and go; old saved flags are ignored, not migrated.
- "Link that opens in app directly" follows the Spotify app link already used on a phone; on a computer without the app it may do nothing, as today's "Open in Spotify app".
- The SoundCloud icon opens the track's SoundCloud page when the row has one; otherwise the SoundCloud search page for the artist and title (a plain link, no lookup by the app). This default is open to the owner's correction.
- The Listen menu keeps the other platforms' search pages.
- On a phone the Spotify cell is plain "On Spotify", not a link (a link there could not meet the 48 px target); Play on Spotify opens
  the app from More › Listen….
