# Feature Specification: A simpler Settings page, grouped, with details behind expandable blocks

**Feature Branch**: `feat/settings-simpler`

**Created**: 2026-11-10

**Status**: Approved (owner 2026-11-10: "Yes go ! I still want information and status line available to see if everything is synced btw db and api and app")

**Input**: Owner (2026-11-10): "there is to many information on the settings page, I would like you to make it simplier and easy to watch. The information about each items can be grouped and information ça be hide behind expendable block or ?"

## Today (as found, 2026-11-10)

- Settings stacks 8 cards (`src/ui/settings/SettingsPage.tsx`): Updates, Spotify account, Spotify sync, Listening history, Audio data, Artist reach, Server, Danger zone, then the version line.
- Every card shows everything at once: a description of one to three lines, all its status lines, progress, errors, every action. Server also shows its table of five data sets.
- The Updates card repeats one status line per job (Spotify, BPM and key, artist reach, server…), and each job's own card says it again.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the state of everything at a glance (Priority: P1)

The owner opens Settings on the computer or the phone. Without scrolling far, they see one short line per item: its name, its state in a few words (up to date, running 40 %, failed, not set up…), and its main button. The descriptions, the extra lines and the tables are hidden until the owner opens the item.

**Independent Test**: open Settings on the demo data at phone and computer widths; each item fits on one or two lines while closed; no description is visible.

**Acceptance Scenarios**:

1. **Given** Settings with nothing running and no problem, **When** the owner opens it, **Then** each item shows its name, a one-line state and its main button, and every item is closed.
2. **Given** a closed item, **When** the owner taps its header, **Then** it opens and shows everything the card shows today (description, all lines, progress, every action, the Server table); a second tap closes it.
3. **Given** a job running or a failure, **Then** the item's one-line state says so (running with its progress, or failed, in the warning or error colour), so it is seen with the item closed.

### User Story 2 - Items grouped by what they are about (Priority: P1)

The items are grouped under a few headings, so the owner finds what they look for without reading every card (Q1 option A, owner 2026-11-10): **Spotify** (Spotify account, Spotify sync) · **Your data** (Listening history, Audio data, Artist reach) · **Between devices** (Server) · then the Danger zone apart.

**Acceptance Scenarios**:

1. **Given** Settings open, **Then** the items sit under their group headings in a fixed order, the same on the phone and the computer.

### User Story 3 - Sync state always in view (Priority: P1)

Owner (2026-11-10): "I still want information and status line available to see if everything is synced btw db and api and app". At the top of Settings, always visible and never folded, a **Sync status** block shows the Automatic updates switch and two lines: **Spotify → this device** (last sync, running with progress, quota lock with retry time, failed) and **This device ↔ server** (up to date with the last sync time, changes waiting with their data sets, running, offline, paused, failed, not set up, not signed in). Each line carries its Retry when today's Updates card does.

**Independent Test**: open Settings on the demo data; the two lines and the switch are visible with every item closed.

**Acceptance Scenarios**:

1. **Given** Settings open, **Then** the Sync status block is visible with every item closed, and it cannot be folded.
2. **Given** changes waiting to send, **Then** the server line names them (as "Changes waiting to send: …" does today).
3. **Given** the server line, **When** the owner taps the Server item, **Then** the Here / Server / Rows table of today is shown.

### User Story 4 - Nothing important is hidden (Priority: P1)

Hiding details must never hide a problem or a question.

**Acceptance Scenarios**:

1. **Given** an error, a quota lock or a missing Spotify permission, **Then** its item's one-line state shows it in its colour, even closed.
2. **Given** a `confirm()` question (Remove server data, Disconnect), **Then** it asks exactly as today.
3. **Given** a running job, **When** the owner reloads or leaves and comes back, **Then** its line still shows the progress.

### Edge Cases

- Server not set up: its item says "Not set up" closed, and opens to today's sign-in form.
- Several problems in one item (sync error and quota lock): the closed line shows the worst one (error over warning over running over ok).
- The Danger zone's closed line is its Disconnect button's consequence in a few words; Disconnect itself stays inside the opened item.
- A link elsewhere in the app that points to a Settings section (for example Overview's Coverage "Look up in Settings"): it lands on that item, opened.
- The Danger zone (Disconnect) stays apart at the bottom, never grouped with the data.
- The app version line stays the last line.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each Settings item MUST have a closed form: name, one-line state, main button. The description and every other line MUST be inside the opened form.
- **FR-002**: Opening an item MUST show all the content its card shows today; no line, button, switch or table is removed by this round.
- **FR-003**: The one-line state MUST show the worst current condition of the item (error, warning, running with progress, ok, off) in that condition's colour.
- **FR-004**: The items MUST be grouped under the headings of US2, in that order, below the Sync status block.
- **FR-005**: When Settings opens, every item MUST be closed except an item with a failure or a job running, which opens (Q2 option A). The owner's opening and closing is not stored.
- **FR-006**: The section index on large windows MUST be removed (Q3 option A).
- **FR-007**: The Updates card MUST be replaced by the Sync status block (US3); the BPM and key, artist reach, listening history and Rekordbox lines of today's Updates card become the closed lines of their items. Each job's state is said once on the closed page.
- **FR-007a**: The Sync status block MUST stay visible and unfoldable; the server line MUST say "up to date" only when connected with nothing waiting to send.
- **FR-008**: Every failure stays shown (the project rule: a state Settings renders, an inline line or a banner); every `confirm()` stays as it is.
- **FR-009**: No Spotify read or write, no server call and no stored data changes; this round changes how Settings looks only.

### Key Entities

- **Sync status**: the always-visible block (Automatic updates switch, Spotify line, server line).
- **Settings item**: one data source or function (Spotify account, Spotify sync, Listening history, Audio data, Artist reach, Server, Danger zone); has a closed one-line state and an opened content.
- **Group**: a heading over several items.

## Success Criteria *(mandatory)*

- **SC-001**: With every item closed and nothing running, the whole of Settings fits in one computer screen (about 900 px high) without scrolling.
- **SC-002**: The text visible on first open is at most a third of today's.
- **SC-003**: The owner can say whether everything is up to date, from the closed page, in under 5 seconds.
- **SC-004**: Every status line, button and question of today is still reachable in at most one tap.

## Assumptions

- Applies to the computer and the phone alike (same items, same groups).
- The descriptions keep their wording; they move inside the opened form.
- The Import page (`#/import`) is unchanged.
- No new data and no new setting other than what the open/closed rule needs.
