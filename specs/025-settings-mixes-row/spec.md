# Feature Specification: Mixes in the Settings server table

**Feature Branch**: `feat/settings-mixes-row`

**Created**: 2026-11-10

**Status**: Draft

**Input**: Owner (2026-11-10): "In the settings i do not see the mix section of server updates", then "YES it should be right ? has it is something that is sync from the server ?", then "ok go, merge to main when it passes".

## Context

The Settings › Server table lists library, history, features and reach (Data, Here, Server, Rows). Saved mixes sync too
(per link, last write wins, deleted mixes as tombstones) but have no row, so the owner cannot see whether they are in step.
Worker requests (pull only, shown in the Mix list) and the shared facts (looked up by id, never copied) stay out of the
table on purpose.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See whether the mixes are in step (Priority: P1)

The owner opens Settings › Server and sees a **mixes** row under reach: when the newest mix changed on this device, the
newest change the server holds, and how many saved mixes the server holds.

**Independent Test**: after a sync with 3 saved mixes and 1 deleted mix on the server, the row reads Here = the newest local
saved or deleted time, Server = the newest saved or deleted time on the server, Rows = 3.

**Acceptance Scenarios**:

1. **Given** a signed-in device after a pull or a push, **Then** the table shows a `mixes` row after `reach`, same columns and
   date format as the others.
2. **Given** both devices in step, **Then** Here and Server show the same time.
3. **Given** a mix changed here and not yet sent, **Then** Here is newer than Server, and "Changes waiting to send" counts it
   (as today).
4. **Given** no saved mix here, **Then** Here shows the same empty mark the other rows use; **given** the server was never
   read for mixes on this device, Server and Rows show the empty mark.
5. **Given** a deleted mix (tombstone) on the server, **Then** it counts in Server's time but not in Rows.

### Edge Cases

- A pull or push that fails leaves the last values as they were.
- Disconnect / Remove server data clears the mixes values like the other rows' server values.
- Values come from the mix stamps each pull and push already read: no extra request (free tier, ADR-08).

## Requirements *(mandatory)*

- **FR-001**: The Settings server table MUST show a `mixes` row after the four data sets.
- **FR-002**: Here MUST be the newest `savedAt` of the saved mixes and the newest `deletedAt` of the local deleted-mix records on this device; empty mark when none.
- **FR-003**: Server MUST be the newest saved or deleted time among the server's mix rows as last read by this device; Rows MUST be the count of those rows that are not deleted.
- **FR-004**: Server and Rows MUST be recorded during the pull and the push that already read the server's mix stamps; no new request.
- **FR-005**: No change to what syncs or how; no Spotify call; no IndexedDB store added (a meta value is fine, ADR-05).

## Success Criteria *(mandatory)*

- **SC-001**: The owner can tell in one look whether the mixes on this device match the server.
- **SC-002**: The number of server requests per sync is unchanged.

## Assumptions

- "Server" means the server's newest change, as it does for the four data sets (their server copy's time), not the time of the
  last sync (that is "Last sync with the server", already shown).
