# Feature Specification: A quieter Sync status block, state only

**Feature Branch**: `feat/settings-status-quiet`

**Created**: 2026-11-11

**Status**: Approved (owner 2026-11-11: "Yes go, just up to date is fine"; "but up to date with a ticker is fine")

**Input**: Owner (2026-11-11), on the Sync status block of spec 026: "There is to many information on the sync status card. We must remove most of the things, remove the things about dates, I just need status, and if there is something ongoing an indicator with 22,353 of 33,888 tracks."

## Today (as found, 2026-11-11, origin/main ae6c596)

Every line of the block (`src/ui/settings/statusLines.ts`, `SyncStatus.tsx`) carries counts at rest, dates and, for the server, its rows per data set, and a three-line paragraph explains Automatic updates:

```
Spotify → this device · 141 playlists · 7,168 tracks · Synced Nov 11, 2026, 12:13 PM · next after Nov 12, 2026, 12:13 AM
BPM and key (ReccoBeats) · 22,353 of 33,888 tracks · release years 23,556
Rekordbox · Not imported
Artist reach · 3,089 of 3,755 artists · Checked Nov 11, 2026, 12:34 PM
Listening history · 101,850 plays · imported Nov 8, 2026
This device ↔ server · Up to date · last sync Nov 11, 2026, 12:34 PM · on the server: library 16,887 · history 39,901 · …
```

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The state of each source, nothing else (Priority: P1)

The owner opens Settings and reads, under the Automatic updates switch, one short line per source: its name and its state in one or two words, with the state's icon (a tick for up to date).

```
Spotify              ✓ Up to date
BPM and key          ✓ Up to date
Rekordbox              Not imported
Artist reach         ✓ Up to date
Listening history    ✓ Imported
Server               ✓ Up to date
```

**Acceptance Scenarios**:

1. **Given** nothing running and no problem, **Then** each line is its label and its state only: no date, no time, no count, no server rows.
2. **Given** BPM and key covers 22,353 of 33,888 tracks and nothing runs, **Then** its line says "Up to date" (owner: "just up to date is fine"); the same for Artist reach with part of the artists.
3. **Given** a source never set up or imported, **Then** its line says so in words ("Not imported", "Not connected", "Not set up", "Not signed in").

### User Story 2 - A progress figure only while something runs (Priority: P1)

**Acceptance Scenarios**:

1. **Given** BPM and key running, **Then** its line says "Updating · 22,353 of 33,888 tracks" and the figures follow the run.
2. **Given** Artist reach running, **Then** "Updating · N of M artists".
3. **Given** a history or rekordbox import running, **Then** "Importing · i of n files".
4. **Given** the Spotify sync running, **Then** "Syncing", with "· i of n playlists" when the sync reports that progress.
5. **Given** the server sync running, **Then** "Syncing".

### User Story 3 - Problems still shown (Priority: P1)

**Acceptance Scenarios**:

1. **Given** a failed job, **Then** its line says "Failed" in the error colour with its Retry, as today.
2. **Given** the Spotify lock-out, **Then** the Spotify line says it is paused by Spotify's limit, without the time (the time stays in the Spotify sync item).
3. **Given** changes waiting to send, **Then** the server line says "Changes to send" (no data set list, no date); offline and paused say "Offline" and "Paused".
4. **Given** Automatic updates off, **Then** BPM and key and Artist reach say "Automatic updates off" as today, unless running or failed.

### Edge Cases

- The counts and dates removed here are not lost: each item below (Spotify sync, Listening history, Audio data, Artist reach, Server with its Here / Server / Rows table) still shows them when opened. No item body changes, except Spotify sync gaining the paragraph of FR-004.
- A missing number while running (no total yet) is left out, never printed as 0.
- Role=alert stays once per failure (`quiet` on the block's lines, spec 026).

## Requirements *(mandatory)*

- **FR-001**: Each line of the Sync status block MUST be its label and a state of a few words; it MUST NOT show a date, a time, a count at rest, release years, or the server's rows.
- **FR-002**: Labels: Spotify · BPM and key · Rekordbox · Artist reach · Listening history · Server, in that order.
- **FR-003**: A running source MUST show its progress as "N of M <unit>" (tracks, artists, files, playlists) when known, from the same figures the block uses today; only while running.
- **FR-004**: The paragraph explaining Automatic updates MUST leave the block and appear, unchanged, in the opened Spotify sync item.
- **FR-005**: Failures, the lock-out, Retry and the error colour MUST behave as in spec 026.
- **FR-006**: The ok state MUST show the success icon (a tick) with "Up to date" or "Imported".

## Success Criteria

- **SC-001**: On the demo data at 1440 px, no line of the block wraps, and the block holds no digit while nothing runs.
- **SC-002**: `yarn shots -g settings`: 0 findings at the four widths.

## Plan and tasks

- T001 `src/ui/settings/statusLines.ts` + `statusLines.test.ts`: rows per FR-001..FR-006 (pure, tested: idle, partial-idle "Up to date", running with and without totals, failed, lock-out, waiting, offline, off, not set up). Drop `serverRows` if nothing else uses it.
- T002 `src/ui/settings/SyncStatus.tsx`: remove the paragraph; `SyncSection.tsx` (Spotify sync item): add it; `useSettingsLines.ts`: drop inputs no longer used.
- T003 `tools/shots/regression.spec.ts` U01 and `specs/003-web-first-redesign/regression.md` U01: new expectations.
- T004 Docs: inventory F42 (and F22 wording if needed), how-it-works §13/§14 lines on the block, README "Sync status" paragraph, CHANGELOG, `docs/` screens page for Settings.
- T005 Checks: `yarn typecheck && yarn lint && yarn test`, `yarn regression -g "A14|U01"`, `yarn invariants`, `yarn shots -g settings` + `yarn shots:summary` 0 findings.
