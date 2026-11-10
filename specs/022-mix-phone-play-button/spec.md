# Feature Specification: Play button on the phone Mix row

**Feature Branch**: `feat/mix-phone-play-button`

**Created**: 2026-11-10

**Status**: Draft

**Input**: User description: "On mobile I can not open a track directly on Spotify, the play button does not show up." Then: the ⋮ menu with "Listen…" is great, keep it; just add the play button.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Play a found track from the phone tracklist (Priority: P1)

On a phone, the owner opens a mix whose tracks were checked on Spotify. Each track found on Spotify shows the ▶ play button on its
meta line, before the Shazam and SoundCloud icons. One tap opens the track in the Spotify app, as on a computer. "On Spotify" and
the ⋮ menu (with **Listen…**) stay as they are.

**Why this priority**: It is the whole request: on a phone the only way to play a found track was two menu levels deep.

**Independent Test**: Open the demo mix "Sunrise" at 390 px wide; a found row's meta line has a 48 px link "Play {artist} – {title}
on Spotify" whose address starts `spotify:track:`, before its Shazam and SoundCloud icons.

**Acceptance Scenarios**:

1. **Given** a phone-width tracklist and a row found on Spotify, **When** it is shown, **Then** its meta line has ▶ (`spotify:track:<id>`, opened in place, named "Play {artist} – {title} on Spotify"), then the Shazam and SoundCloud icons.
2. **Given** the same row, **When** the meta line and the ⋮ menu are read, **Then** "On Spotify" and More › Listen… › Play on Spotify are still there.
3. **Given** a row not found, not checked yet, or a gap, **When** it is shown on a phone, **Then** it has no ▶.
4. **Given** a computer-width tracklist, **When** it is shown, **Then** nothing changes: ▶ stays in the Spotify column.

### Edge Cases

- A row matched only through the library (no Check answer yet) gets no ▶ on the row, as on a computer; its More › Listen… still has Play on Spotify.
- A hand-linked row (round 012) is found: it gets ▶.
- An unnamed row ("ID – ID") never shows a Spotify mark, so no ▶.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: On a phone-width Mix row whose `spotify` is a Check answer with an id, the meta line shows the same `PlayOnSpotify` button as the computer's Spotify column (48 px ▶, "Play {artist} – {title} on Spotify", `spotify:track:{id}`, opened in place), before the Shazam and SoundCloud icons.
- **FR-002**: "On Spotify" on the meta line and the ⋮ menu (Listen… included) are unchanged.
- **FR-003**: Not found, not checked, unnamed and gap rows get no ▶; the computer layout is unchanged.
- **FR-004**: One pure rule decides the found id for both layouts.

### Key Entities

- **Tracklist row**: unchanged; only how a found row is drawn on a phone changes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On the demo "Sunrise" at 390 px, every row whose meta line says "On Spotify" has one ▶ link to `spotify:track:`.
- **SC-002**: No row without "On Spotify" has a ▶ link.
- **SC-003**: The computer layout's tests (M02, M04) still pass unchanged.

## Assumptions

- "The play button" is the ▶ of the computer's Spotify column (round 010, the same `PlayOnSpotify` as round 017).
- Its place is the meta line, beside the other one-tap icons, so the item's lead keeps the time (owner: keep the menu, add the button).
