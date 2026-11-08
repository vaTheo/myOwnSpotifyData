# Feature Specification: Add a Spotify link to a track that was not found

**Feature Branch**: `worktree-sortable-table`

**Created**: 2026-11-08

**Status**: Draft

**Input**: User description: "In the mix section, a song was not found on Spotify automatically; I want to add it where not found. Clicking the red mark in the Spotify column lets me paste a Spotify link (e.g. https://open.spotify.com/track/1qGibBSuprByJCYMC4zRUG?si=f4ed2a88f4744bea); it is then used to add the song to the playlist later."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Paste a Spotify link on a not-found track (Priority: P1)

The owner opens a mix where Check on Spotify marked a track "not found" (the red mark in the Spotify column). They find the track on Spotify themselves, copy its link, tap the red mark, paste the link and confirm. The row now counts as found on Spotify.

**Why this priority**: It is the whole request: a track Spotify's search missed can still reach the playlist.

**Independent Test**: In a mix with a not-found row, tap the red mark, paste a valid Spotify track link, confirm; the red mark becomes the found state and the row's Spotify link opens that track.

**Acceptance Scenarios**:

1. **Given** a row marked not found, **When** the owner taps the red mark, **Then** a field opens to paste a Spotify track link.
2. **Given** the field is open, **When** the owner pastes `https://open.spotify.com/track/1qGibBSuprByJCYMC4zRUG?si=f4ed2a88f4744bea` and confirms, **Then** the row is marked found, the Spotify link opens that exact track (the `?si=` tracking part is ignored), and the counts (on Spotify, not found) update.
3. **Given** the field is open, **When** the owner cancels, **Then** the row is unchanged.
4. **Given** a pasted text that is not a Spotify track link (an album, artist, playlist, a search page, other site, free text), **When** the owner confirms, **Then** nothing is saved and a short message says a Spotify track link is needed.

---

### User Story 2 - The pasted track goes into the playlist (Priority: P1)

When the owner later runs Create playlist from the mix, the track they linked is added like any track found automatically.

**Why this priority**: The link only matters if it reaches the playlist.

**Independent Test**: Link a not-found row, run Create playlist (demo or test), and check the playlist's track list includes that track.

**Acceptance Scenarios**:

1. **Given** a row with a pasted link, **When** Create playlist runs, **Then** that track is added (once, even if the same track is also found on another row).
2. **Given** a row still not found, **When** Create playlist runs, **Then** it is skipped as before.

---

### User Story 3 - Fix or remove a pasted link (Priority: P2)

The owner pasted the wrong link. They can replace it with another link, or remove it so the row is not found again.

**Why this priority**: A mistake must not be permanent, but it is rarer than the main flow.

**Independent Test**: On a row with a pasted link, replace it with a different valid link (the row opens the new track), then remove it (the row shows not found again).

**Acceptance Scenarios**:

1. **Given** a row with a pasted link, **When** the owner opens its Spotify mark and pastes another valid link, **Then** the new track replaces the old one.
2. **Given** a row with a pasted link, **When** the owner removes it, **Then** the row returns to not found and is skipped by Create playlist.

---

### Edge Cases

- A link without a track id, a shortened `spotify.link` URL, or a `spotify:track:<id>` text: the app link form is accepted; shortened links that need a redirect are refused with the same message.
- The owner edits the row's artist or title afterwards: the linked track is cleared like any Check answer (the row was changed), and the row returns to unchecked.
- Running Check on Spotify again, or the automatic check on opening, never overwrites a pasted link (the row is no longer unchecked).
- The pasted track is never looked up on Spotify to verify it or show its name; the app trusts the id.
- Phone: the red mark is a 48 px control; the field fits the width without horizontal scroll.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Spotify column mark of a not-found row MUST be a control the owner can open to paste a Spotify link.
- **FR-002**: The system MUST accept a Spotify track link in the `open.spotify.com/track/<id>` form (with or without extra query parts, a locale segment, or the `spotify:track:<id>` form) and refuse anything else with a message.
- **FR-003**: A valid pasted link MUST mark the row found on Spotify with that track, exactly as a Check answer would: counts, the Spotify cell link (the app link of the pasted track), the Listen menu's Play on Spotify.
- **FR-004**: Create playlist MUST add the pasted track like any found track, once per track.
- **FR-005**: The owner MUST be able to replace a pasted link and to remove it (back to not found).
- **FR-006**: Check on Spotify, in manual or automatic form, MUST NOT overwrite a pasted link.
- **FR-007**: The link MUST be saved with the mix (it survives closing and reopening, and syncs like the rest of the row).
- **FR-008**: The app MUST NOT look the pasted track up on Spotify or by name; the link is stored by its id.
- **FR-009**: The control MUST be usable on a computer and on a phone (48 px target, no horizontal scroll).

### Key Entities

- **Tracklist row**: gains no new kind of data; its Spotify answer can now come from the owner's pasted link as well as from Check on Spotify.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a not-found row, the owner links a track in under 15 seconds (tap, paste, confirm).
- **SC-002**: 100% of valid Spotify track links in the common copied forms (web link with `?si=`, plain web link, app link text) are accepted; 100% of non-track Spotify links and other text are refused with a message.
- **SC-003**: A track linked by hand is in the created playlist in 100% of runs, and no track is added twice.
- **SC-004**: No automatic or repeated check changes a pasted link.

## Assumptions

- The pasted link is trusted as given: no Spotify read verifies it (consistent with the project rule of keyed-by-id sources and no name search); a wrong link adds the wrong track, which the owner can fix by replacing it.
- "Where not found" means rows marked not found; unchecked rows are not offered the control (they are checked first, automatically or by the button).
- Editing the row's artist or title clears the linked track, as it does for any Check answer, so a renamed row is checked again.
- Create playlist's existing write path and permission are unchanged; this feature adds no new Spotify permission or read.
