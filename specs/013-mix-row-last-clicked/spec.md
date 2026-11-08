# Feature Specification: Mark the last row touched in the Mix tracklist

**Feature Branch**: `worktree-sortable-table`

**Created**: 2026-11-08

**Status**: Implemented

**Input**: User description: "When I click anything on a row, put it in chartreuse colour mode until I click on another, like it is selected, so I can see which row I last clicked. Make a deep analysis of how the colours must be handled for this row."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the last row I touched (Priority: P1)

The owner works down a long tracklist, playing tracks, opening links, checking Spotify, editing. Whatever they click on a row (a cell, a link, an icon, a menu button), that row takes the chartreuse selected look and keeps it until they click on another row. Scrolling away and back, the last row they worked on is easy to find.

**Why this priority**: It is the whole request.

**Independent Test**: Open a mix, click the title of one row, then the Spotify icon of another; the first row is chartreuse after the first click, the second row is chartreuse after the second and the first is back to normal.

**Acceptance Scenarios**:

1. **Given** no row is marked, **When** the owner clicks a cell of a row, **Then** that row takes the selected look.
2. **Given** a row is marked, **When** the owner clicks a link, icon or menu button inside another row, **Then** the mark moves to that row even though the link or button also does its own action (opens the app, a new tab, the menu).
3. **Given** a row is marked, **When** the owner clicks outside the tracklist (header, filters, another part of the page), **Then** the mark stays.
4. **Given** a row is marked, **When** the owner clicks the same row again, **Then** it stays marked (a click never un-marks).
5. **Given** the owner clicks a link on a row that opens another tab or the Spotify app, **When** they come back to the Mix, **Then** that row is marked (it was marked by the click itself, before the link did its action), so they see where they were.

---

### User Story 2 - The marked row stays readable (Priority: P1)

Everything inside a marked row remains legible and keeps its meaning: text, muted text, the red not-found mark, found marks, icons, borders, the keyboard focus ring and the hover. The marked row must not hide status colours or become harder to read.

**Why this priority**: A mark that makes a row hard to read defeats the purpose.

**Independent Test**: Mark a row of each kind (found, not found, identified by scan, manual, hand-linked, gap) and check, against the colour analysis, that every text and icon in it reaches its required contrast on the selected background.

**Acceptance Scenarios**:

1. **Given** a marked row, **When** it is shown, **Then** all text reaches contrast 4.5:1 and all icons, status marks and control outlines 3:1 on the selected background (see colour-analysis.md for each pair).
2. **Given** a marked row with a not-found mark, **When** shown, **Then** the mark is still red and still distinguishable from a found mark.
3. **Given** the pointer over a marked row, **When** hovering, **Then** the row stays in the selected colour (hover adds its light layer, it never removes the mark).
4. **Given** keyboard focus on a marked row, **When** shown, **Then** the focus ring stays visible on the selected background.
5. **Given** a marked row, **When** it is shown, **Then** its top line and bottom line glow chartreuse, so the row reads as framed even between two rows of the same shade.
6. **Given** a marked row, **When** the colour cannot be told apart (high-contrast or forced-colours display, colour-blind owner), **Then** the row is still told apart by a second cue that is not a colour fill.

---

### User Story 3 - Marks follow the row, on every layout (Priority: P2)

On a phone the rows are compact items; with the Edit or Link form open the row is drawn as a form. The mark behaves the same: it follows the row through sort, filter and edits and looks right in each layout.

**Why this priority**: The owner uses a phone too, and sorting and filtering are the main ways rows move.

**Independent Test**: Mark a row, sort by another column, filter by chip, resize to phone width; the same track stays marked; open its Edit form and the form is readable.

**Acceptance Scenarios**:

1. **Given** a marked row, **When** the owner sorts or filters, **Then** the same track stays marked wherever it lands (hidden by a filter: no row is marked until it shows again).
2. **Given** a marked row, **When** the window changes between computer and phone width, **Then** the same row stays marked in the compact layout.
3. **Given** a marked row, **When** the owner opens its Edit or Link form, **Then** the form's fields, outlines and buttons stay readable and the row still reads as the marked one.
4. **Given** a marked row, **When** the owner deletes it, **Then** no row is marked until the next click.
5. **Given** the owner opens another mix, **When** the new tracklist shows, **Then** no row is marked.

---

### Edge Cases

- Gap rows (the "no track heard here" separators) can be marked like any row.
- A click that starts a text selection (drag) still marks the row.
- Keyboard users: moving focus to a row does not by itself mark it; pressing Enter or Space on a control in the row counts as a click.
- Adding a row (Add track) marks the new row, since the owner is about to type in it.
- The mark is not saved with the mix and is not synced; reloading clears it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Clicking anything inside a Mix tracklist row, including links, icon buttons and menu buttons, MUST mark that row as the last touched, and at most one row is marked at a time.
- **FR-002**: The mark MUST stay until another row is clicked, the row is deleted, another mix opens, or every row is replaced (a paste, the description, a lookup, the mix reopened); clicks outside the tracklist and re-clicking the same row do not clear it.
- **FR-003**: A marked row MUST use the app's existing chartreuse selected colour pair (the same one list–detail rows use), so the app has one selected look.
- **FR-004**: Every colour used inside a marked row MUST meet the contrast targets in colour-analysis.md: text 4.5:1, icons, marks and control outlines 3:1.
- **FR-005**: Status colours MUST keep their meaning on a marked row (not found stays red, found stays chartreuse with its icon shape).
- **FR-006**: Hover MUST NOT remove the selected colour; focus MUST keep a visible ring on it.
- **FR-007**: A marked row MUST carry a second cue besides its fill (a chartreuse edge bar), and MUST expose its state to assistive technology as selected.
- **FR-007b**: The top and bottom lines of a marked row MUST be a glowing chartreuse (bright chartreuse line with a soft glow), on every layout (table row, phone item, open form row), without moving or resizing any row, and without hiding the neighbouring rows' text.
- **FR-008**: The mark MUST follow the track through sort, filter, edits of the row, window-size changes and layout (computer table, phone compact item, open form).
- **FR-009**: Row actions (opening the app, links, menus, Edit, Delete) MUST keep working exactly as before; marking is added, never replaces an action.
- **FR-010**: The mark MUST NOT be stored, synced or exported.
- **FR-011**: New colours, if any, MUST be design tokens with their contrast pairs added to the token contrast test.

### Key Entities

- **Marked row**: the single tracklist row of the open mix last clicked; view state only, identified by the row, not by its position.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After any click on a row, exactly one row is marked in 100% of the tried cases (cell, link, icon button, menu button, Edit form, phone item).
- **SC-002**: Every text and icon colour in a marked row reaches its contrast target (4.5:1 text, 3:1 icons, marks and outlines) for each row kind, checked from the colour analysis table by an automated test.
- **SC-003**: The owner finds the last row they worked on in a 300-row list in under 3 seconds after scrolling away and back.
- **SC-004**: No existing row action stops working: the regression rows for the Mix table all still pass.

## Assumptions

- Scope is the Mix tracklist; the other tables keep their behaviour (they select a row only when it opens a detail pane). If the owner wants every table to behave this way, it is a follow-up on the shared table.
- "Chartreuse colour mode" means the app's chartreuse selected role (the dark green container with chartreuse text, the same as a selected list–detail row), not the bright chartreuse as a fill: bright chartreuse behind chartreuse links and icons would make them unreadable (contrast 1:1).
- The mark is a view state: not saved, not synced, reset when another mix opens or the page reloads.
- A paste, Replace with description, a lookup or reopening the same mix replaces every row without changing the mix: the mark clears then too, since its place would now hold another track (review of round 013).
- Clicking a button that deletes the row, or opens a menu that is then dismissed, still counts as a click on its row first.
- The Mix table's mixes list (the saved mixes on the left) is not part of this feature.
