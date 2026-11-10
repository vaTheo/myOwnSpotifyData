# Feature Specification: The worker asks again by itself after a rate-limit stop

**Feature Branch**: `feat/worker-auto-resume`

**Created**: 2026-11-10

**Status**: Built (worker 0.7.3)

**Input**: Owner decision D17 (2026-11-10): "YES it should wait 30min and retry"; then, correcting the first design: "No it send partial result, wait, and then resume. 6 cycle is fine".

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A set stopped by Shazam finishes without a tap (Priority: P1)

Shazam refuses past the pauses allowed (`WORKER_RATE_LIMIT_PAUSES`) and the scan stops at 47:00. As today the worker sends the tracks found as **done** with "Stopped early at 47:00 (rate limited); ask again later for the rest". New: 30 minutes later the worker asks again by itself, as if the owner had pressed **Ask again**; the new request resumes the saved run at 47:00 and its result merges into the saved mix like any Ask again.

**Independent Test**: a fake scan stopped by a rate limit, a fake clock: the partial result is sent at 0, one request for the same link is inserted at the first look after 30:00, and it runs.

**Acceptance Scenarios**:

1. **Given** a request whose scan stopped early because of refusals, **When** its partial result has been sent, **Then** the worker plans one automatic ask for that link 30 minutes later (log: `auto ask again · <link> in 30 min (1/6)`).
2. **Given** a planned ask whose time has come, **When** the worker is between two requests, **Then** it inserts one request `{kind: 'identify-mix', payload: {url}}` (unless one is already queued or running for that link) and logs `auto ask again · queued <link> (1/6)`; the normal claim then resumes the saved run.
3. **Given** a set refused again on each of 6 automatic asks, **When** the 6th partial result is sent, **Then** nothing more is planned (`auto ask again · 6 of 6 done for this set; press Ask again in the app for the rest`).
4. **Given** other requests in the queue, **When** an ask is planned, **Then** they run during the wait; the wait never blocks the loop.

### User Story 2 - Nothing else changes (Priority: P1)

**Acceptance Scenarios**:

1. **Given** a Stop from the phone, a refusal before any track, a Shazam that does not answer, a failure, **When** the request ends, **Then** nothing is planned.
2. **Given** a shared worker or `run --once`, **When** a set stops on refusals, **Then** nothing is planned (one log line says so).
3. **Given** `WORKER_AUTO_RESUME_MINUTES=0`, **Then** the worker behaves as 0.7.2, without a line.

### Edge Cases

- The owner presses **Ask again** during the wait: their request runs first; its outcome replaces the planned ask (planned again if it stops on refusals). A manual Ask again does not reset the count.
- A run of the link that completes (not stopped early) resets the count to 0.
- The insert fails (offline, paused, refused): one log line, not counted, never tried again; the owner's Ask again still works.
- The worker is restarted during the wait: the plan is in memory only and is lost; the owner presses Ask again.
- A second pass stopped by refusals is not a stop: the first pass completed, the result is not "stopped early", nothing is planned.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: After sending `done` with `STOPPED_EARLY` whose reason is `rate limited` (scan.py's `stopped["reason"]`), the worker plans in memory, keyed by link, an automatic ask `WORKER_AUTO_RESUME_MINUTES` (30) later.
- **FR-002**: When due, at the top of the run loop (between requests, after the session refresh, before the claim), the worker checks for an open request for the link and, if none, inserts `{kind: 'identify-mix', payload: {url}}`: exactly the app's Ask again (`requestIdentify`, `src/server/sync.ts`). One try per planned ask.
- **FR-003**: At most `WORKER_AUTO_RESUMES` (6) automatic inserts per link; the count resets when a run of that link completes; a manual Ask again does not reset it.
- **FR-004**: Only a rate-limit stop plans; personal mode with `run --watch` only (a shared worker has no table privilege, ADR-16; `--once` exits when the queue is empty).
- **FR-005**: The insert uses the owner's session (`ServerClient.enqueue`); its failure is one log line and never fails the run; never a retry loop against a paused or unreachable server.
- **FR-006**: Settings `WORKER_AUTO_RESUME_MINUTES` (30, 0 = off) and `WORKER_AUTO_RESUMES` (6) in `config.py` and `.env.example`; `check` and the run's start lines name them.
- **FR-007**: The app needs no change: its pull merges the new result like any Ask again.

## Decisions (ruled by the round's lead, recorded here)

- The follow-up is a **new** request: a finished job cannot be finished again (`finish` needs `status = claimed`).
- The plan lives in memory (no new file, no new table); a restart loses it (R7).
- The count is per link and in memory; a manual Ask again does not reset it; a complete run does.
- The insert first checks for an open request for the link, as the app does, so a manual Ask again already queued is not doubled.

## Success Criteria *(mandatory)*

- **SC-001**: A set stopped by refusals gets its rest without a tap, within 6 automatic asks 30 minutes apart.
- **SC-002**: 0 automatic inserts from a shared worker, from `--once`, with 0 minutes, or after a stop that is not a rate limit.
