# Feature Specification: Automatic updates

**Feature Branch**: `006-automatic-updates`

**Created**: 2026-11-07

**Status**: Draft

**Input**: Owner, 2026-11-07: "Make every jobs run automatically, but user can see on settings where the update are and if they are
finished or so." Picks: the Spotify sync runs on open **only when the library is older than 12 hours**; the BPM and key run and
Artist reach **follow, one after the other, for what is missing**; a Settings **Updates** card summarises every job.

What is already there: the server sync runs on open, on return to the app and when the network is back (`autoSync.ts`). Every other
job starts from a button: the Spotify sync (Settings, a playlist's button), the BPM and key run and Artist reach (Settings), the
history and rekordbox imports (a file the owner picks). The pull already restores the other device's Spotify sync time into
`lastSyncAt` (`src/server/sync.ts:520`). The BPM run and the reach run skip what is stored (90-day not-found and reach TTLs) and
resume where they stopped.

## Constitution notice

- **Principle II / ADR-02** is amended: the Spotify sync may start without a tap, at most once per 12 hours of library age, never
  while Spotify's lock-out lasts, and never twice in one open. A new ADR-11 supersedes ADR-02's "only from a button" decision and
  keeps its reasoning; the constitution gets a MINOR bump (2.2.0).
- **Principle IV / ADR-04**: "long jobs start only from Settings" becomes "long jobs start from Settings or the automatic chain";
  ids not names, pacing, resume and the pinned pacing test are unchanged.
- **Principle III / ADR-03**: unchanged. Create playlist and Like all songs stay on a tap; nothing automatic writes to Spotify.
- **Principle VII**: an automatic failure is shown on its line of the Updates card and in its own card; it does not raise a banner,
  except the Spotify lock-out and a login that expired, which affect the whole app.
- **ADR-05**: no store, no `DB_VERSION` bump. The on/off switch is a per-device preference in `localStorage`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The library updates itself on open (Priority: P1)

The owner opens the app. After the local library is shown and the server sync ran, the app checks the library's age: older than 12
hours, it syncs Spotify; then it looks up BPM and key for tracks still without, then the reach of artists still without. The owner
does not tap anything.

**Why this priority**: it is the request.

**Independent Test**: with a library synced 13 hours ago, open the app: the Spotify sync starts by itself, then the BPM run, then
Artist reach, one at a time; open again a minute later: no Spotify sync starts, and the BPM and reach runs find nothing to do and
make no network call.

**Acceptance Scenarios**:

1. **Given** a library synced less than 12 hours ago (on this device or another one, through the server), **When** the app opens,
   **Then** no Spotify call is made by the chain.
2. **Given** Spotify locked the account until 18:40, **When** the app opens at 17:00, **Then** the Spotify step is skipped (its line
   says "Paused by Spotify until 18:40") and the BPM and reach steps still run.
3. **Given** the BPM and reach runs have nothing missing, **When** their step comes, **Then** they make no request and their line
   says "Up to date".
4. **Given** a step failed (network, ReccoBeats busy), **When** the owner comes back to the app in the same session, **Then** the
   chain does not retry it; the next open, or its button, does.
5. **Given** the owner leaves the app in the middle of a run, **When** they come back, **Then** the run continues where it stopped
   (as today) and the chain goes on with the next step.
6. **Given** no Spotify session (signed out), **Then** the chain does not run.
7. **Given** the owner taps Disconnect, **Then** the chain stops after the current request and nothing more runs.

---

### User Story 2 - Settings shows where every update is (Priority: P1)

A new **Updates** card at the top of Settings shows one line per job: Server, Spotify, BPM and key, Artist reach, History,
Rekordbox. Each line says its state (Up to date, Running with its progress, Waiting, Paused, Failed with the reason, Off, Needs a
file) and its time (last run, and for Spotify the time after which the next automatic sync may run).

**Why this priority**: the owner asked to see where the updates are and whether they are finished.

**Independent Test**: during a chain on open, Settings shows the running step with its progress and the next steps as "Waiting";
at the end every automatic line shows "Up to date" or its failure; History and Rekordbox show their last import and "needs a file".

**Acceptance Scenarios**:

1. **Given** a step running, **Then** its line shows the same progress its own card shows (e.g. "132 / 410 tracks").
2. **Given** a failed step, **Then** its line shows the reason and a **Retry** button that runs that job now.
3. **Given** the automatic switch is off, **Then** every automatic line says "Off — use its button" and the cards' buttons work as
   today.
4. **Given** a job never ran, **Then** its line says "Never" (never a fake date).

---

### User Story 3 - The owner keeps control (Priority: P2)

The Updates card has an **Automatic updates** switch, on by default, kept per device. Off, the app behaves exactly as before this
round (buttons only, the server sync stays automatic as today). A button tapped while the chain runs another job is not lost: the
job runs next, before the rest of the chain.

**Why this priority**: an automatic Spotify read is the one risk this round takes; the owner must be able to turn it off.

**Independent Test**: switch off, reload: no Spotify sync, BPM or reach run starts by itself. With the switch on, during a chain's BPM step,
tap the Sync now button: the Spotify sync runs as soon as the BPM step ends, then the chain resumes with Artist reach.

**Acceptance Scenarios**:

1. **Given** the switch is turned off during a chain, **Then** the running step finishes and no further step starts.
2. **Given** the switch is turned on, **Then** the chain runs once at that moment.
3. **Given** a button tapped while its own job is already running or waiting in the chain, **Then** nothing is started twice.

### Edge Cases

- First connection (no library): the library is "older than 12 hours", so the first full sync starts by itself; the runner's lock
  handling keeps what was synced if Spotify stops it.
- A different Spotify account during an automatic sync: the existing account-switch question (`ACCOUNT_SWITCH_CONFIRM`) is asked as
  today; refusing cancels the sync and the chain goes on.
- A login that expired during an automatic sync: as today, back to the Connect screen with the reason; the chain stops.
- The phone sleeps during a run: an automatic run takes no screen wake lock (a tapped run still does); the run stalls with the tab
  and continues when the owner returns.
- Two devices running the reach run at the same time: each pushes its dataset and the newer wins (unchanged server rule); the
  chain starts after the server pull, so the second device usually starts from the first's results.
- A server pull arriving while a chain step runs: the pull is skipped as today (`jobsBusy()`) and happens on the next trigger.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: After the open's server sync, and on return to the app after at least 60 seconds away, the app MUST run the chain:
  Spotify sync (if due), BPM and key, Artist reach, one at a time, when the switch is on and a Spotify session exists.
- **FR-002**: The Spotify step is due only when `lastSyncAt` is absent or older than 12 hours, the sync is not locked
  (`retryAt` in the future), and it has not already run in this page session.
- **FR-003**: The BPM and reach steps MUST make no network request when nothing is missing or stale (their existing skip rules).
- **FR-004**: A step that failed MUST NOT be retried by the chain in the same page session.
- **FR-005**: An automatic run MUST NOT raise a banner, except the Spotify lock-out and an expired login; its failure shows on its
  Updates line and in its own card.
- **FR-006**: An automatic run MUST NOT take the screen wake lock.
- **FR-007**: The chain MUST respect `jobsBusy()`: it never starts a step while another library job runs, and Disconnect stops it.
- **FR-008**: A job button tapped while the chain runs another job MUST run that job next, then the chain continues.
- **FR-009**: Settings MUST show an Updates card with one line per job (Server, Spotify, BPM and key, Artist reach, History,
  Rekordbox), its state, progress and time, and a Retry button on a failed automatic line.
- **FR-010**: An **Automatic updates** switch, on by default, per device, MUST turn the chain on and off; off restores the
  previous behaviour.
- **FR-011**: Nothing automatic MUST write to Spotify or start the history or rekordbox import.
- **FR-012**: The server sync keeps its current automatic triggers unchanged.

### Key Entities

- **Chain state** (memory only): the switch, the step running, the steps waiting, each step's outcome in this session (done,
  skipped with a reason, failed), the jobs queued by a tap.
- **Update line** (derived, never stored): one per job, built by a pure function from the job signals, the summaries and the chain
  state.

## Success Criteria *(mandatory)*

- **SC-001**: Opening the app twice within 12 hours makes at most one Spotify sync between the two opens, across all devices
  signed in to the server.
- **SC-002**: With nothing missing, an open makes no request to ReccoBeats or the reach sources.
- **SC-003**: The owner can tell from Settings, without opening any other card, which job runs, what waits and what failed.
- **SC-004**: With the switch off, the app makes exactly the calls it made before this round.
- **SC-005**: No automatic run ever shows a banner other than the Spotify lock-out or an expired login.

## Assumptions

- 12 hours is fixed in code (`AUTO_SYNC_AGE_MS`), not a setting; changing it is a one-line change.
- The resume gap is the server's `RESUME_GAP_MS` (60 s); the chain runs after the server sync of that trigger.
- The chain's state lives in memory; a reload starts a new session (a failed step is tried again on the next open).
- History and Rekordbox stay manual: they need a file. Mix lookup, Create playlist and Like all songs stay on their screens.
- The owner accepts the quota risk of one automatic Spotify sync per 12 hours (ADR-11).
