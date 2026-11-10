# Feature Specification: Comments without their commenter's name

**Feature Branch**: `feat/mix-hide-commenter-names`

**Created**: 2026-11-10

**Status**: Draft

**Input**: User description: "In the comment you fetch from SoundCloud, can you remove the pseudo of the people that comment, it confuses me." Owner's pick among the options: **display only** (the worker and the saved data keep the name).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read a comment without its commenter (Priority: P1)

The owner opens a mix the worker identified. Where a track was found in a SoundCloud comment, the row says "from a comment", not "from a comment by night_owl". Where the clues around a gap or the set-wide tracklist list a comment, the line reads "1:15 · ID? sounds like Moreau Unit", without the commenter's nickname. A chapter or a description line still names its author: that is the uploader, not a commenter.

**Why this priority**: It is the whole request: a stranger's nickname next to a track name reads like an artist and confuses the owner.

**Independent Test**: Open the demo mix "Sunrise"; the candidate row reads "from a comment · not heard" and "night_owl" appears nowhere on the tracklist or in "2 clues around here".

**Acceptance Scenarios**:

1. **Given** a candidate found in a comment with an author, **When** the tracklist is shown, **Then** its origin reads "from a comment", with no name.
2. **Given** a comment clue with a time and an author, **When** its clue list is opened, **Then** the line reads "mm:ss · text".
3. **Given** a comment clue without a time, **When** its clue list is opened, **Then** the line reads only its text.
4. **Given** a chapter or description clue with an author, **When** its clue list is opened, **Then** the line keeps "author · " after the time, as before.
5. **Given** a mix saved before this change, **When** it is opened, **Then** it shows the same way, with no migration.

### Edge Cases

- A comment whose author is empty: same line as before ("mm:ss · text").
- The commenter's name inside the comment's own text (a reply "@night_owl ...") is the comment's text and stays: only the author field is hidden.
- Description and chapter "from the description", "from a chapter" origins never named an author and are unchanged.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The origin of a row found in a comment reads "from a comment", never "from a comment by <author>".
- **FR-002**: A comment clue line reads "mm:ss · text" (the time only when known), never the author.
- **FR-003**: A chapter or description clue line keeps its author: "mm:ss · author · text".
- **FR-004**: Display only. The worker, its JSON, the `Clue` type, saved mixes and the server rows keep `author`; no `DB_VERSION` bump, no migration, no worker version.
- **FR-005**: Clue text stays plain text (never a link), as before.

### Key Entities

- **Clue**: a description line, chapter or comment the worker read: time, author, text, kind. Unchanged; only how a `comment` is written on screen changes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On the demo data, 0 commenter names are shown on the Mix screen.
- **SC-002**: Chapter and description lines with an author show it as before.
- **SC-003**: Nothing stored changes: a saved mix read before and after the change has the same `author` fields.

## Assumptions

- "The pseudo of the people that comment" means the `author` of a `kind: 'comment'` clue; the uploader's name on a chapter or description is not a commenter.
- Hiding it on screen is enough (owner's pick); dropping it from the worker or the stored data was offered and not picked.
