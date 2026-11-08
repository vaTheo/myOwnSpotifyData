# Feature Specification: Multi-user data

**Feature Branch**: `009-multi-user-data` | **Created**: 2026-11-08 | **Status**: Implemented

**Input**: "Could you imagine a multiuser setup. All data present now must be to the only registered user, and then if another user logs in it will have its own data."

Owner's picks: the server account (email) defines a user; the owner adds users himself in the Supabase dashboard and each new user
connects their own Spotify account; on a shared browser every user keeps their own local data and switching is free (no wipe, no question).

Decided with the owner on 2026-11-08: the first sign-in on a device claims its existing data; with the server set up and nobody signed in the app shows only a sign-in screen; deleting another person's copy from a shared device is out of scope for now (Limits and roadmap).

## User Scenarios & Testing

### User Story 1 - My current data stays mine (P1)

As the owner, after the update I sign in as usual and see exactly what I had: library, playlists, history, BPM and key, artist reach,
saved mixes. Nothing is lost, re-fetched or asked again.

**Independent Test**: with a populated library on this device and on the server, update, sign in; every screen shows the same numbers.

**Acceptance Scenarios**:
1. **Given** a device with the owner's data from before the update, **When** the owner signs in for the first time after it, **Then** that data becomes the owner's, with no re-sync and no question.
2. **Given** the owner's data on the server, **When** the owner signs in on a fresh browser, **Then** it pulls as before.

### User Story 2 - A second person starts empty (P1)

I add a friend's email in the Supabase dashboard. They open the app, sign in with that email, connect their own Spotify account, and
see only their own library, which starts empty and fills from their own sync.

**Acceptance Scenarios**:
1. **Given** a user added by the owner who never used the app, **When** they sign in, **Then** every screen is empty until they connect Spotify and sync.
2. **Given** that user connected a Spotify account, **When** they sync, **Then** their playlists and counts are theirs alone and the owner's are unchanged.
3. **Given** an email the owner did not add, **When** someone tries to sign in, **Then** no account is created and no data appears.

### User Story 3 - Two people, one browser (P2)

On a shared computer or phone, I sign out and my friend signs in; the app shows their data. When I sign back in, mine is there at once.

**Acceptance Scenarios**:
1. **Given** two users have used this device, **When** the second signs in, **Then** they see their own data and the first user's stays stored untouched.
2. **Given** the first user signs back in, **Then** their data returns with no wipe, no confirm question and no full re-sync.
3. **Given** a user signs out, **Then** nothing of theirs is shown to the next person at the sign-in screen.
4. **Given** the server is unreachable, **When** a user signs in on this device, **Then** they see only their own local data.

### User Story 4 - Without the server, nothing changes (P3)

If the server settings are absent, the app is the single-user browser-only app as today.

## Edge Cases

- A user connects a Spotify account that another user already uses: each user's data stays separate; the app says so, it never merges.
- A user connects a different Spotify account than the one they synced before: the existing account-switch question still applies, inside that user's data only.
- The owner removes a user in the dashboard: that user's server data goes with the account; copies on devices stay until removed there.
- Storage on a shared device: every user's copy counts; Settings shows what this device holds for the signed-in user.
- Spotify's daily read quota belongs to the app, not to a user: automatic updates of several users share it, and the lock-out applies to all.
- Remove server data and Disconnect act on the signed-in user's data only.

## Requirements

- **FR-001**: Every dataset the app keeps (library, playlists and tracks, history and play counts, BPM and key, artist reach, saved mixes, job state, settings that hold results) MUST belong to exactly one user, on the device and on the server.
- **FR-002**: A user MUST never see, change, push or pull another user's data, on a shared device or on the server.
- **FR-003**: The user is the server account (email sign-in). The app MUST NOT offer sign-up; only accounts the owner created can sign in.
- **FR-004**: Data that exists before this change MUST be assigned to the owner, losslessly, with no re-sync, no question and no extra step; the owner's server data is unchanged.
- **FR-005**: A new user MUST start with empty data and connect their own Spotify account; their syncs, jobs and counts MUST affect only their data.
- **FR-006**: Several users MUST be able to keep their data on one device side by side; signing in as another user MUST switch to that user's data without wiping any and without a confirm question; sign-out MUST only sign out.
- **FR-007**: The Spotify login, the two Spotify writes and the "no Spotify read on load" gate MUST apply per user and stay unchanged in behaviour.
- **FR-008**: With no server settings, the app MUST behave as the single-user browser-only app of today.
- **FR-009**: Settings MUST show which user is signed in and what this device holds for them.
- **FR-010**: The owner's computer worker MUST only act on and return results to the requesting user's data.
- **FR-011**: A damaged or unreadable copy of one user's data MUST NOT affect another user's.

## Key Entities

- **User**: a server account (email) created by the owner; owns one set of data, optionally linked to one Spotify account at a time.
- **User data set**: everything the app builds for a user, kept per user on the device and on the server.
- **Device**: a browser holding the data sets of every user who signed in on it.

## Success Criteria

- **SC-001**: After the update the owner sees identical content on every screen, with zero re-syncs and zero questions.
- **SC-002**: A new user's first sign-in shows an empty library and no trace of another user's titles, counts or mixes.
- **SC-003**: Switching users on one device takes under 5 seconds and loses no data of either.
- **SC-004**: In a test with two users, no screen, pull or job result ever shows a row of the other user.
- **SC-005**: Removing the server settings gives the same app as before this change.

## Assumptions

- The existing data on a device is claimed by the first user who signs in on it after the update; the owner signs in first on his own devices. A device where someone else signs in first would give them that data, so the update note says so.
- Users are few (the owner's friends): the Spotify developer-mode allowlist and the free server tier bound the number, and the owner adds both.
- One Spotify account per user at a time; the same Spotify account under two users is allowed and kept separate.
- The server already separates users by account; this round must prove it for every table, not assume it.
- A user with no network on a new device cannot sign in for the first time (the server confirms the email), as today.
