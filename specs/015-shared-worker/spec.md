# Feature Specification: One worker for every user

**Feature Branch**: `015-shared-worker` | **Created**: 2026-11-08 | **Status**: Draft

**Owner's pick (2026-11-08)**: across users the worker takes one request per user in turn, oldest first within each user.

**Input**: Owner: "Do the worker work with any email that is registered on Supabase? Any worker should be able to take any job, but data should go on the right person after." Then: "go work on that: a new function that hands out jobs across users, with a separate worker role. It is safer but is a real piece of work. It would need a decision recorded in a new ADR."

Today a worker signs in as one user and sees only that user's identification requests (ADR-14: "the worker reads its signed-in user's queue"). With friends on the app, each would have to run a worker of their own. The owner wants **one worker, run by the owner, that serves every user's requests and returns each result to the person who asked**, without opening anyone's data to anyone else.

## User Scenarios & Testing

### User Story 1 - A friend asks for a mix and the owner's worker answers (P1)

As a user without a worker of my own, when I request a mix identification in the app, the owner's running worker takes it and the tracklist comes back to my account, with the same progress, stop and result as if my own worker had done it.

**Why this priority**: it is the whole point: friends get mix identification without installing anything.

**Independent Test**: two users each request a mix; one shared worker, signed in as neither, serves both; each user sees only their own request, progress and result.

**Acceptance Scenarios**:
1. **Given** user A and user B each have a queued request and one shared worker is running, **When** the worker polls, **Then** it takes one at a time, and each result appears only in the requesting user's saved mixes.
2. **Given** a request is running, **When** its owner presses Stop, Cancel or Move to top, **Then** it behaves as today for that request; no other user's request is touched.
3. **Given** the worker stops mid-request, **When** the stale limit passes, **Then** the request becomes available again, for the same user, and any worker can take it.

---

### User Story 2 - The worker sees only what it needs (P1)

As a user, I want the shared worker to be unable to read my library, playlists, plays, saved mixes, BPM and key results, or other users' requests beyond the one it is working on, so a worker is no way into my data.

**Why this priority**: the rule that a user never sees another user's data (ADR-14) must survive; the worker is a new kind of reader.

**Independent Test**: sign a shared-worker identity in and try to read every personal table and every request it has not claimed: all refuse.

**Acceptance Scenarios**:
1. **Given** a shared worker identity, **When** it asks for any personal table (library, history, features, reach, mixes), **Then** the server refuses.
2. **Given** a request it has not claimed, **When** it asks for its result, payload or owner, **Then** it gets nothing beyond what the claiming step returns.
3. **Given** a claimed request, **When** the worker writes progress, a result or a failure, **Then** it lands on that request only, and the worker cannot change the request's owner.

---

### User Story 3 - Only the owner can run a shared worker (P1)

As the owner, I decide who may serve other people's requests; a friend cannot turn their own account into one, and I can switch a worker off.

**Why this priority**: a shared worker reaches into every user's queue; an ordinary account must never become one.

**Independent Test**: sign in as an ordinary user and call the shared-worker functions: refused. Disable a shared worker: its next call is refused, its running request returns to the queue after the stale limit.

**Acceptance Scenarios**:
1. **Given** an ordinary user account, **When** it calls the function that hands out other users' requests, **Then** it is refused.
2. **Given** a shared-worker identity the owner created in the dashboard, **When** the owner disables it, **Then** it can no longer claim or write.
3. **Given** sign-ups are off, **When** anyone tries to create a worker identity, **Then** only the dashboard (the owner) can.

---

### User Story 4 - A personal worker keeps working (P2)

As a user who runs a worker of my own (as the owner does today), signed in with my own email, it keeps taking only my requests, exactly as now.

**Acceptance Scenarios**:
1. **Given** a worker signed in as an ordinary user, **When** it polls, **Then** it takes that user's requests only, as today.
2. **Given** a personal and a shared worker both running, **When** requests arrive, **Then** no request is taken twice.

---

### User Story 5 - Fair turns between users (P2)

As a user, when several people have queued requests, mine is not starved by someone with a long queue.

**Acceptance Scenarios**:
1. **Given** user A queued ten requests and user B queued one later, **When** the worker takes the next, **Then** it takes B's request next, then A's oldest, and so on: one request per user in turn, oldest first within a user.
2. **Given** a user presses Move to top, **Then** it changes the order among that user's own requests only; it never lets them jump ahead of another user's older request.

## Edge Cases

- The same link requested by two users: two separate requests, two separate results; nothing is shared between them in this round.
- A request whose owner is deleted: removed with the account, as today (cascade); a worker mid-run finds its write refused and discards.
- A claimed request whose worker is disabled or lost: becomes claimable again after the stale limit, for any worker allowed to serve it.
- The server settings missing, or the migration not applied: the app and a personal worker behave as today; a shared worker reports "not allowed" and takes nothing.
- A user with no worker anywhere: the request waits in the queue, as today; the app's existing "waiting" state shows.
- Many requests from one user: no new cap in this round; limit noted.
- Two shared workers at once: never the same request (as today).

## Requirements

### Functional Requirements

- **FR-001**: The server MUST offer a way for an authorised shared-worker identity to take the next queued identification request of **any** user, one request per call, never the same request twice. The order is one request per user in turn, oldest first within a user (US5); a user with many requests never delays another user's first one by more than one request.
- **FR-002**: A shared-worker identity MUST be created and removed only by the owner in the server's dashboard; no app screen, no sign-up and no ordinary account can create or become one.
- **FR-003**: A shared-worker identity MUST be able to read nothing but the request it has just taken (what the worker needs to do the job), and MUST NOT read any personal table or any other request.
- **FR-004**: A shared-worker identity MUST be able to write progress, a result, a failure or a release only on a request it has taken and still holds, and MUST NOT be able to change who owns a request.
- **FR-005**: A result written by a shared worker MUST appear only in the requesting user's data; every user keeps seeing only their own requests and results.
- **FR-006**: The owner MUST be able to switch a shared-worker identity off; after that it is refused on every call, and what it held returns to the queue after the stale limit.
- **FR-007**: A worker signed in as an ordinary user MUST keep taking only that user's requests, with no change of behaviour (the personal worker).
- **FR-008**: The worker program MUST be able to run in either mode from the same code and settings, and say which mode it runs in at start.
- **FR-009**: The app MUST keep working unchanged for requesting, progress, Stop, Cancel and Move to top; Move to top MUST NOT reorder across users.
- **FR-010**: With the migration not applied or the server missing, the app and the personal worker MUST behave as they do today.
- **FR-011**: No Spotify read, no client secret in the app, and the one-probe-at-a-time rule are unchanged; the shared worker holds a server credential but no Spotify token.

### Key Entities

- **Identification request** (exists: `jobs` row): owner, link, status, progress, result. Gains no new personal data.
- **Shared-worker identity**: a named server account the owner creates, marked as allowed to serve everyone's requests; not a user of the app.
- **Mode** (worker setting): personal (signed in as a user) or shared (signed in as a shared-worker identity).

## Success Criteria

### Measurable Outcomes

- **SC-001**: With two users and one shared worker, each user's request is answered and each result is visible to its requester only, in 100% of runs of the two-user check.
- **SC-002**: A shared-worker identity is refused on every personal table and on every request it has not taken, in 100% of the audit's cases.
- **SC-003**: An ordinary account is refused every shared-worker call, in 100% of cases.
- **SC-004**: A friend gets a tracklist for a mix without installing anything, in the same time as a request on the owner's own account.
- **SC-005**: With the shared mode off, every existing worker and app test passes unchanged.

## Assumptions

- The owner runs the shared worker on their own computer; friends run none. A friend may still run a personal worker.
- The owner can read all rows in their own server project anyway; the shared worker adds no visibility the owner lacks.
- Identification requests carry a link and a result only; the shared worker does not see library, plays or anything else personal.
- This is an access change on the server plus a worker mode; it is a new ADR amending ADR-14 ("the worker reads its signed-in user's queue") and ADR-08 for one named role.
- No cap on the number of requests per user in this round (a limit, to be listed in Limits and roadmap).
- The shared store of public facts (ADR-15) is separate and unchanged.
