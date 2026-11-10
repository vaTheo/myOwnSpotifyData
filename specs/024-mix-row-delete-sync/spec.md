# Feature Specification: A song deleted from a saved mix is deleted on every device

**Feature Branch**: `fix/mix-row-delete-sync`

**Created**: 2026-11-10

**Status**: Draft

**Input**: Owner report (2026-11-10): "If I delete some song on my mobile in a mix, it does not delete it in he web and vis versa, it should be sync."

## Cause (as found, 2026-11-10)

- **Delete is not saved.** Deleting a row changes only the list on screen (`deleteMixRow`, `src/model/state.ts:1789`). The mix is written to the device and sent to the server only when the owner presses **Save mix** (`saveMix`, `state.ts:1908`). A delete on the phone with no Save never leaves the phone.
- **The open mix is not refreshed by a pull.** A pull refreshes the saved mixes (`startServerPull`, `state.ts:410`), but a mix already open on screen keeps its old rows. The next save from that screen stamps a newer time and sends the old rows back. That save can be the automatic Spotify check of a mix just opened (`keepChecks`, `state.ts:2353`), so the deleted song can come back on every device without a tap.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A delete on one device reaches the other (Priority: P1)

The owner opens a saved mix on the phone (or the computer) and deletes a song. They do not press **Save mix**. Later, on the other device, the same mix no longer shows the song. Both directions work the same way: the phone and the web run the same app.

**Independent Test**: delete one row of a saved mix; the stored mix no longer has it, its saved time is newer, and a push of `mixes` is queued, with no Save tap.

**Acceptance Scenarios**:

1. **Given** a saved mix open on the phone, **When** the owner deletes a row, **Then** the mix is saved on the phone at once (as **Save mix** does) and sent to the server.
2. **Given** that delete sent, **When** the web opens or refreshes the Mix screen after its next sync, **Then** the mix shows without the deleted song.
3. **Given** a delete of a scan row, **When** a later worker result arrives for the mix, **Then** the row stays out (the mix's removed tracks are saved with the delete, as today on Save).
4. **Given** the save of a delete fails (storage full, server down), **Then** the failure shows as today's save failure does (`mixError`, inline), and the row stays deleted on screen.

### User Story 2 - A mix open on the web follows the newer copy (Priority: P1)

The mix is already open on the computer when the phone's delete arrives. The open mix updates to the newer copy, and no later save on the computer brings the song back.

**Independent Test**: a mix open with rows A, B, C; a pull brings a newer copy with A, C; the open list shows A, C; a following automatic check saves A, C.

**Acceptance Scenarios**:

1. **Given** a mix open on the web with no change of its own since it was opened or saved, **When** a pull brings a newer copy of it, **Then** the open list shows the newer copy.
2. **Given** that refresh, **When** the automatic Spotify check or **Save mix** saves the mix, **Then** it saves the newer rows, never the old ones.
3. **Given** a mix open on the web that has its own change not yet saved (a row being edited), **When** a pull brings a newer copy, **Then** the screen keeps its change, and whichever device saves last wins, as today (default taken 2026-11-10, owner did not pick; Q2 option A). With FR-002 this only happens while a row is being edited.

### Edge Cases

- A mix never saved (a lookup only): a delete stays on screen only, as today; nothing is written until **Save mix**.
- Several deletes in a row: each one saves; the last one wins; the push is queued once per change and coalesces as pushes do today.
- Deleting on two devices at once: last write wins by saved time, per mix, as the sync works today; one of the two deletes may be lost. Not solved here (see Limits).
- A delete while a check or a playlist creation runs on that mix: the background save starts from the list as it is after the delete.
- Offline: the delete is saved on the device; it goes to the server at the next sync, as other pending changes do.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Deleting a row of a saved mix MUST save the mix on the device and queue it for the server, with no Save tap, exactly as **Save mix** does (same saved time rule, same removed tracks).
- **FR-002**: Every change to a saved mix's rows MUST save the same way with no tap: Delete, Edit's Save, Link and Unlink to Spotify. Add track saves when its new row's Edit is saved, not on the empty row (default taken 2026-11-10, Q1 option B).
- **FR-003**: When a pull brings a newer copy of the mix open on screen, the open list MUST show the newer copy, subject to US2 scenario 3.
- **FR-004**: No save (manual or automatic) MUST send rows older than the copy the device holds for that mix.
- **FR-005**: A failed save MUST show the existing inline save error; it MUST NOT use a banner.
- **FR-006**: A mix never saved MUST stay unsaved after a delete.
- **FR-007**: No Spotify read or write is added; the sync rules (last write wins per mix, deleted mixes as tombstones) stay as they are.

### Key Entities

- **Saved mix**: url, title, rows, removed tracks, saved time; one per url per account; the server keeps the copy with the newest saved time.
- **Open mix**: the mix on screen; its rows may differ from the saved copy until saved.

## Success Criteria *(mandatory)*

- **SC-001**: A song deleted on one device is absent on the other after that device's next sync, in 100% of tries with no Save tap.
- **SC-002**: Opening a mix on the web after a delete on the phone never brings the deleted song back, including after the automatic check of that mix.
- **SC-003**: No new tap, button or question is added to the Mix screen.

## Assumptions

- The **Save mix** button stays as a manual save; it is no longer needed after a row change.
- The web gets the delete at its normal sync (open, return to the tab, back online, or the 60 s poll while a request runs); no faster push channel is added.
- Simultaneous edits of one mix on two devices stay last-write-wins (a known limit, written in Limits and roadmap).
