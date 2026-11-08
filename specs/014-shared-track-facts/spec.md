# Feature Specification: Shared track facts

**Feature Branch**: `014-shared-track-facts` | **Created**: 2026-11-08 | **Status**: Draft

**Input**: "I wonder if some data can be shared between users, like artists and sound data: users could have the same songs and artists in their library." Owner's answer: "Yes go for a spec, it seems a good idea to release that before there are other users."

Owner's picks (2026-11-08): share only facts about a track or artist that are the same for everyone; BPM and key first, artist reach second; the owner's rekordbox values and everything about a person's library stay private.

## User Scenarios & Testing

### User Story 1 - A friend's BPM and key arrive without waiting (P1)

As a user whose library overlaps with another user's, when the BPM and key run starts, tracks that someone already looked up get their BPM and key at once instead of waiting for the 1-request-per-second lookup.

**Independent Test**: user A runs the BPM and key run on a library; user B, with a library sharing some tracks, runs it; the shared tracks get their values before any outside lookup is made for them.

**Acceptance Scenarios**:
1. **Given** a track another user's run already found, **When** my run reaches it, **Then** it gets that BPM and key without an outside lookup for that track.
2. **Given** a track nobody found yet, **When** my run finds it, **Then** the result is kept for every user and my own copy is filled as today.
3. **Given** a track the shared store does not know and the outside source does not know either, **Then** it stays without BPM and key, as today.

### User Story 2 - My own values are never overwritten by anyone (P1)

As a DJ who imports my rekordbox analysis, my rekordbox BPM and key stay mine: they are never sent to the shared store, and a shared value never replaces one I imported.

**Acceptance Scenarios**:
1. **Given** a track with a rekordbox value, **When** the run or an import happens, **Then** the shared store receives nothing from it and my value is kept.
2. **Given** a shared value for a track I imported from rekordbox, **Then** my rekordbox value still shows.

### User Story 3 - One wrong client cannot poison everyone (P1)

As the owner, I want a user's device (a bug, an old version, a bad actor with an account I created) unable to put nonsense BPMs and keys into everyone's library.

**Acceptance Scenarios**:
1. **Given** a submitted value outside the accepted ranges or shape, **Then** the server refuses it and nothing is stored.
2. **Given** a track already in the shared store, **When** any user submits another value for it, **Then** the stored value is unchanged.
3. **Given** any signed-in user, **Then** they can ask for specific tracks by id but cannot list, edit or delete the store.

### User Story 4 - Artist reach follows (P2)

Once the first step works, listeners and fans of an artist, found by one user's reach run, are reused by the others' runs the same way.

**Acceptance Scenarios**:
1. **Given** an artist another user's run already measured recently, **When** my run reaches them, **Then** I get those numbers without an outside lookup.
2. **Given** shared numbers older than the reach run's own freshness rule, **Then** my run measures again and the newer measurement is the one used by every user (the older one may stay stored but is never read once a newer exists).

### User Story 5 - Without the server, nothing changes (P3)

With no server settings, or signed out, or the server unreachable, the BPM and key run and the reach run behave exactly as today.

## Edge Cases

- The server is unreachable or refuses during a run: the run continues with the outside source and the failure is shown on its Settings card; nothing is lost and nothing waits on the store.
- A shared value is wrong (the outside source was wrong): it stays wrong for everyone, the same as it would for each user alone; correcting a shared row is the owner's job in the server dashboard.
- A track found by ISRC rather than Spotify id: the shared store is keyed by Spotify track id; a track without one is looked up outside as today and not shared.
- ReccoBeats returns a track with BPM but no key (or the reverse): the partial result is shared as partial and stays partial for everyone: the store never changes a row, and the user whose run finds the full result still fills their own copy.
- Two users submit the same track at once: one wins, both end with the same value.
- A user removes their server data (Remove server data) or the owner deletes their account: shared facts they contributed stay, because they carry no user and are not personal.
- The store grows: it holds one small row per track ever looked up by anyone; at the free tier's size this is far below its limit for a few users.

## Requirements

- **FR-001**: The server MUST keep one shared store of public facts about tracks, keyed by Spotify track id, holding only BPM and key (and the source label). It MUST hold no user identifier and no data that says whose library a track is in.
- **FR-002**: Any signed-in user MUST be able to read the facts of the track ids they ask for, and to add facts for a track that has none. No user MUST be able to list the store, change a stored row or delete one.
- **FR-003**: The server MUST validate every submitted row (BPM in a plausible range, key in the known set, id in Spotify's id shape, no other fields) and MUST refuse a row that fails, storing nothing.
- **FR-004**: The BPM and key run MUST ask the shared store for the tracks still missing BPM and key in batches before any outside lookup, use what it returns, look up outside only what remains, and send the new outside results back.
- **FR-005**: Values from the owner's rekordbox import MUST never be sent to the shared store and MUST never be replaced by a shared value.
- **FR-006**: Nothing else MUST be shared: library, playlists, play counts, history, saved mixes, job state, release years (until a later round decides) stay per user under ADR-14.
- **FR-007**: A failure of the shared store (offline, refused, not signed in, no server settings) MUST NOT stop, slow or change the result of a run beyond the loss of the shortcut, and MUST be shown on the run's Settings card.
- **FR-008**: With no server settings the app MUST behave as today (ADR-14, ADR-01).
- **FR-009**: Reading the store MUST NOT read Spotify and MUST NOT happen outside a BPM and key run (ADR-02 unchanged); the store receives only what an outside source returned during a run.
- **FR-010**: Artist reach (listeners and fans, keyed by artist id, with the date measured) MUST follow the same rules in a second step; a shared number MUST be used only while it is younger than the reach run's own freshness rule.
- **FR-011**: Settings MUST say that BPM and key results are shared with the other users of this server, in one plain sentence, and MUST say what is never shared.
- **FR-012**: ADR-14 MUST be amended: "a user never sees or changes another user's data" stays true for every personal table; the shared store is the one named exception, with the reasons and the rules above recorded.

## Key Entities

- **Shared track fact**: Spotify track id, BPM, key, source label, date added. No user.
- **Shared artist reach** (second step): artist id, listeners, fans, date measured. No user.
- **Run**: the BPM and key run or the reach run, which uses the store as a shortcut before the outside source.

## Success Criteria

- **SC-001**: With two users whose libraries share 1,000 tracks, the second user's BPM and key lookups (the by-id and by-ISRC passes) make at most as many outside requests as the tracks the first user's run did not find, and finish the shared tracks in under 1 minute instead of about 17 minutes at 1 request per second. The release-year pass is outside this measure: years are not shared this round and it still costs one request per track.
- **SC-002**: In a test with two users, no request by one ever returns a list of the store, a user identifier, or a row the user did not ask for by id.
- **SC-003**: Every row outside the accepted ranges or shape, sent by any client, is refused: 0 invalid rows stored in the test set.
- **SC-004**: After the round, a run with the server switched off or unreachable gives the same results as before it.
- **SC-005**: No rekordbox-imported value appears in the store after a run on a library with an import.

## Assumptions

- Users are few (the owner's friends); the free server tier bounds the store, and one small row per track is far below its limit.
- A shared value is trusted like the outside source it came from: the store makes the same lookup one person's work for everyone, it does not check the value against ReccoBeats.
- The owner can correct or remove a shared row in the server dashboard; there is no screen for it.
- A shared row carries no user, so removing a user's data does not remove it.
- The store fills only from lookups a run makes. There is no one-time "send what I already have": the owner clears the BPM and key results already held (on the device and on the server) and runs the lookup again normally, which contributes every track found (owner, 2026-11-08).
- Release years join the store only in a later round, if the owner asks; this round shares BPM and key, then artist reach.
- Spotify track ids are public identifiers, not personal data; asking for a set of ids reveals to the server which tracks a user has, as the existing sync already does.
