# Feature Specification: The worker signs in by itself with a password

**Feature Branch**: `feat/worker-password-sign-in`

**Created**: 2026-11-19

**Status**: Implemented, worker 0.7.8 (owner 2026-11-19: option A, "You can create the supabase user, name it driverAlex and execut steps")

**Input**: Owner (2026-11-19): "I will run the worker on a server, on a debian lxc. How could I make the worker connect? Through an
env in the worker?", then "Is there any other setup that we could make to simplify this. Like with a new special user on supabase
and env set in the worker in the lxc?"

## Today (as found, 2026-11-19)

- `mix-worker login` signs in only by an email: a magic link that must be clicked **on the computer running the worker** (the
  link returns to a local address the worker listens on), or a 6-digit code that a Free project's default mailer cannot send.
- A server with no screen (the owner's Debian LXC) can only sign in through an SSH tunnel from another computer, or by copying a
  session from another computer (which then signs that computer out at the next refresh).
- When the saved session cannot be refreshed, the worker stops with exit code 4 and waits for a person to run `login` again.
- An account listed as a shared worker (ADR-16) reaches every user's queue through five functions only, and no table.

## What changes (option A)

The owner creates one dedicated account, **driverAlex**, with a password, and lists it as a shared worker. The worker gets two new
settings, the account's email and password. With them set, the worker signs in by itself, keeps the session as today, and signs in
again by itself whenever the session is gone or refused. No browser, no mail, no tunnel.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A server worker starts signed in with no person present (Priority: P1)

The owner puts the worker on the LXC, writes the account's email and password into the worker's settings, and starts it as a
service. It signs in by itself and takes requests.

**Why this priority**: this is the whole request: run the worker on a headless server without a browser step.

**Independent Test**: with no saved session and the two settings set, start the worker against a fake server; it signs in with the
password once, keeps the session, and claims a request.

**Acceptance Scenarios**:

1. **Given** no saved session and both settings set, **When** the worker starts, **Then** it signs in with the password, saves the
   session (owner-only file, as today) and goes on, with one log line naming the account and never the password.
2. **Given** a saved session for that account that is still valid, **When** the worker starts, **Then** it uses it and does not
   sign in again.
3. **Given** both settings set, **When** the owner runs `login`, **Then** it signs in with the password without asking anything.
4. **Given** both settings set, **When** the owner runs `check`, **Then** it reports that sign-in is by password for that account,
   and never prints the password.

---

### User Story 2 - The worker recovers from a lost session by itself (Priority: P2)

Weeks later the saved session is refused (expired, revoked, the account signed out elsewhere). The worker signs in again with the
password and continues, instead of stopping with "not signed in".

**Why this priority**: a service that stops until a person types a command defeats the server setup.

**Independent Test**: a fake server refuses the refresh once; the worker signs in with the password, saves the new session and
continues the run.

**Acceptance Scenarios**:

1. **Given** a refresh that the server refuses, **When** the worker needs a token (at start, between requests, or during a long
   scan), **Then** it signs in with the password once and continues with the new session.
2. **Given** the password itself is refused, **When** the worker signs in, **Then** it stops with exit code 4 and one line saying
   the email or password is wrong; it never retries that sign-in in a loop.
3. **Given** the server is unreachable or paused, **When** the worker tries to sign in, **Then** it ends with the same exit code as
   today for that case (2 or 3), and never counts it as a wrong password.

---

### User Story 3 - The owner follows one README section to set up the LXC (Priority: P3)

The worker README has a section for a headless Linux server: create the dedicated account in the dashboard, list it as a shared
worker, put the settings in an environment file, run it as a service, read its log.

**Why this priority**: the code alone is useless without the account and service steps; they are short but easy to get wrong.

**Independent Test**: the README section, followed on a fresh Debian LXC with the released Linux executable, ends with `check`
reporting the shared mode and the worker waiting on the queue.

**Acceptance Scenarios**:

1. **Given** the README section, **When** the owner follows it, **Then** every command and file it names exists and works as
   written, and the section says where the password lives and who can read it.

### Edge Cases

- Only one of the two settings set: the worker refuses to start with the "missing setting" exit code (5) and a line naming the
  missing one; it never falls back to a magic link silently.
- A saved session for **another** account than the configured email: the configured account wins; the worker signs in with the
  password and replaces the saved session (one log line).
- The settings are not set: everything behaves exactly as today (magic link, `--code`, exit 4 on a lost session).
- The password contains spaces, `#`, `=` or quotes: it is read whole from the environment and from the settings file.
- The account is not (or no longer) listed as a shared worker: the existing mode check applies as today (in `auto` it runs in
  personal mode and sees only its own, empty, queue; a forced `shared` ends with exit 7). The password sign-in changes nothing there.
- `logout` with the settings set: removes the saved session as today; the next start signs in again with the password.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The worker MUST accept two optional settings, the account email and the account password, from the settings file
  or the environment (the environment wins, as for every setting), both empty by default.
- **FR-002**: The two settings MUST be set together; one alone MUST end the run with the missing-setting exit code (5) and name the
  missing setting.
- **FR-003**: With both set and no usable session, the worker MUST sign in with the password, save the session as today (owner-only
  file), and continue.
- **FR-004**: With both set, a session refresh the server refuses MUST lead to one password sign-in; only if that is also refused
  does the worker end with exit code 4.
- **FR-005**: A refused password MUST end the run with exit code 4 and a message saying the email or password is wrong; the worker
  MUST NOT retry it in a loop.
- **FR-006**: An unreachable or paused server during a password sign-in MUST map to the same exit codes as today (2, 3).
- **FR-007**: The password MUST never be printed, logged, written to the session file, the result, the saved run, or any file the
  worker writes; `check` MUST show only that sign-in is by password and the account email.
- **FR-008**: A saved session for another account than the configured email MUST be replaced by a password sign-in for the
  configured account.
- **FR-009**: `login` with both settings set MUST sign in with the password without prompting; without them it MUST behave as today.
- **FR-010**: Without the two settings, every behaviour MUST be byte-identical to today (sign-in, refresh, exit codes, messages).
- **FR-011**: The worker MUST contact no new host: the password sign-in goes to the same server as today's sign-in.
- **FR-012**: The settings template MUST list the two settings with a note that the password is the one secret in the file and
  belongs to a dedicated shared-worker account, never the owner's own.
- **FR-013**: The worker README MUST have a headless-Linux-server section: create the account (dashboard, confirmed, password),
  list it as a shared worker, the environment file and its permissions, the service unit, `check`, reading the log, and the limits
  of shared mode (SoundCloud links only, no automatic Ask again).
- **FR-014**: The worker version MUST be bumped so the release builds the change (0.7.8).

### Key Entities

- **Worker account**: a dedicated account (driverAlex) with an email and a password, listed as a shared worker; owns no data.
- **Account settings**: the email and password the worker reads; the password is the only secret among the worker's settings.
- **Saved session**: unchanged: the account email, access and refresh tokens, expiry; never the password.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Setting up the worker on a headless server takes no browser, no mail and no second computer: zero manual sign-in steps
  after the settings are written.
- **SC-002**: After a lost session the worker resumes taking requests by itself in 100 % of cases where the password is still
  valid, with no person involved.
- **SC-003**: The password appears in 0 lines of the worker's output, log, session file and result files across the test suite.
- **SC-004**: A wrong password stops the worker after exactly 1 refused sign-in, never more.
- **SC-005**: With the two settings unset, every existing worker test passes unchanged.

## Assumptions

- The project's email sign-in accepts passwords (the server's default); no server migration, no new function, no app change.
- The owner creates the account and lists it as a shared worker, in the dashboard and the SQL editor (or the controller does it on
  the owner's explicit OK); that step is outside the code and documented in the README.
- The account is a shared worker (ADR-16), so a leaked password reaches only the shared queue functions, never anyone's tables.
  Using the owner's own account with a password is possible technically but not recommended, and the README says so.
- The LXC is the owner's own machine: the settings file there is readable by the service user only (mode 600).
- Shared mode's existing limits stay: SoundCloud links only, no automatic Ask again (spec 023).
