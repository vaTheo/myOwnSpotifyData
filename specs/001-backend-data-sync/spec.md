# Feature Specification: A server and database holding the app's data

**Feature Branch**: `001-backend-data-sync`

**Created**: 2026-11-05

**Status**: Draft

**Input**: User description: "I would like to have more features and I thin it coule be great to have this app with a backend, this way i could add third party app like downloading mixes from a platform and then analyse song to get all the song from that mix and then create a plylist from that. For exemple would like to add YT-dlp to the repon that's why I wnat to achieve this, and also it will be great to share datas fetch through account and other navigotor session". Clarified on 2026-11-05: the server is for the owner alone; the task for now is the server and a database where the data of every current feature lives; mix downloading and analysis come later, on top of it; hosting on a free tier the owner would top up if needed; the future worker (audio fetch and track identification) will run on the owner's own computer, some of the time, polling the server for queued work.

## Constitution notice

The "no server" rule of ADR-01 was superseded on 2026-11-05 by
[ADR-08](../../docs/architecture/700-adr/ADR-08-owner-server-free-tier.md), and the
constitution's Principle I was amended to match (v2.0.0). Two things remain for the round:

- **ADR-08 is the frame**: the server stores and never computes, never holds a Spotify
  token nor calls Spotify, is optional, and leaves room for a job queue; the plan must
  stay inside it.
- **"What leaves the browser"** (feature inventory §2, README "Nothing is uploaded"):
  today only a mix URL and Spotify ids leave the browser. With this feature the owner's
  library snapshot, playlists, listening history summary, artist reach and mixes leave the
  phone for the owner's server. The owner's manual must say where they go.

Principle II (no Spotify reads on load), III (writes only on a tap), IV (keyless sources,
browser side), V (additive local database) and VII (every failure shown) stay as they are.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - My data outlives the browser (Priority: P1)

The owner does their usual work on the phone: connect, sync playlists, import the history
export, run the artist reach job, look up and save mixes. Everything the app built from that
is kept on the owner's server. Later, in a fresh browser session (a new browser, cleared
site data, a reinstalled phone, a laptop), the owner connects once and finds every screen
as it was: most played tracks, playlists ranked, artists ranked, Crate, BPM and key, Under
the radar, saved mixes, with no sync and no import to redo.

**Why this priority**: this is the reason for the server. Every long job today lives in one
browser's storage and dies with it; the server is where the data of every current feature
lives from now on.

**Independent Test**: do a history import on one browser, open the app in a second browser
with empty storage, connect, and see the Crate and play counts without an import.

**Acceptance Scenarios**:

1. **Given** the owner has synced, imported and run reach on browser A, **When** they
   connect on browser B with empty storage, **Then** within one minute every screen shows
   the same data as on A, and no Spotify read was made on load.
2. **Given** browser B restored data from the server, **When** the owner opens Settings,
   **Then** it shows, per dataset, when it was fetched or imported and when it reached the
   server, so the owner can tell what is fresh.
3. **Given** a dataset is restored from the server, **When** the owner uses a screen that
   gates on a summary version (Crate, Under the radar), **Then** the gate behaves exactly
   as if the data had been built locally: the screen opens when the version matches and
   says what to do when it does not.

---

### User Story 2 - Two devices stay in agreement (Priority: P2)

The owner syncs playlists on the laptop on Monday and on the phone on Friday, imports a new
history export on the laptop, edits a saved mix's tracklist on the phone. Each device ends
up with the newest version of each dataset, and an older copy never overwrites a newer one.

**Why this priority**: once two devices both write to the server, the rule for which copy
wins is what keeps the data trustworthy. Without it the feature is worse than no server.

**Independent Test**: sync playlists on A, then later on B; reopen A and see B's newer
playlists, not A's older ones.

**Acceptance Scenarios**:

1. **Given** A synced playlists at 10:00 and B at 11:00, **When** A reopens, **Then** A
   shows the 11:00 snapshot and the server keeps it.
2. **Given** A holds a snapshot newer than the server's, **When** A reconnects, **Then**
   the server takes A's snapshot; the comparison uses the time the data was fetched or
   imported, never the time the device last spoke to the server.
3. **Given** the owner edits a saved mix on the phone, **When** the laptop refreshes,
   **Then** the laptop shows the edit; **Given** both edit the same mix before either
   refreshes, **Then** the later edit wins whole, and the earlier device sees it; rows are
   never merged half from each.
4. **Given** a dataset was removed on one device by a feature's own action (a narrower
   import, a cleared mix), **When** another device refreshes, **Then** it reflects the
   removal, not a resurrection from its older local copy.

---

### User Story 3 - The server is optional and its state is visible (Priority: P3)

The server is sometimes asleep (free tiers pause), unreachable (no network on the phone),
or not set up at all (a visitor of the public page). In each case the app works from local
data as it does today. Settings shows whether the server is connected, when it last
synced, and what to do if it is not.

**Why this priority**: the public deployment keeps working for anyone without a server;
the owner must never lose the app because the server is down.

**Independent Test**: block the server, open every screen, see today's app plus one
offline notice in Settings.

**Acceptance Scenarios**:

1. **Given** the server is unreachable, **When** the owner opens the app, **Then** every
   screen works from local data and Settings shows "server offline" with the last
   successful sync time; nothing else changes.
2. **Given** no server is configured, **When** a visitor opens the public page, **Then**
   the app is exactly today's app and Settings says no server is set up.
3. **Given** the server was unreachable while the owner synced or imported, **When** it
   is reachable again, **Then** the pending local changes reach the server without any
   action beyond opening the app, and Settings shows the new sync time.
4. **Given** a server request fails, **When** it fails, **Then** the failure is shown in
   Settings with its reason, never swallowed, and never as a bare string.

---

### User Story 4 - Signing in once, removing everything (Priority: P4)

The owner signs in to their server once per browser and is remembered. The Spotify
connection stays what it is today: a token in the browser, never sent to the server.
From Settings the owner can remove all their data from the server, and Disconnect says
clearly whether it touches server data.

**Why this priority**: a server with the owner's listening history needs a lock and a
delete; both are small but non-negotiable.

**Independent Test**: sign in on a browser, close and reopen it, still signed in; remove
server data, see every other device fall back to local-only.

**Acceptance Scenarios**:

1. **Given** a fresh browser, **When** the owner opens Settings, **Then** they can sign
   in to their server in one step, and the sign-in is remembered on that browser.
2. **Given** the owner is signed in, **When** they connect to Spotify, **Then** the
   Spotify token stays in the browser; the server receives data, never the token.
3. **Given** the owner taps Disconnect, **When** the confirmation shows, **Then** it says
   whether server data is kept (default: kept) and does what it says.
4. **Given** the owner taps Remove server data, **When** confirmed, **Then** the server
   holds nothing for that account and every device reports local-only data at next open.

---

### Edge Cases

- The server is paused after a week without traffic (a free tier pauses, and only the
  owner can resume it from the hosting dashboard): the app shows "server paused, resume
  it from the dashboard" with the link, never spins forever.
- The largest dataset (a multi-year history export) is bigger than what a single request
  accepts: it still reaches the server, in parts if needed, with progress shown.
- The server's free storage is full: the push fails with that reason in Settings; local
  data is untouched.
- The owner connects a second Spotify account on one device: the server keeps the two
  accounts' data apart, as the local database does today.
- The sign-in to the server expires: Settings says so and offers to sign in again; local
  data keeps working meanwhile.
- The same browser has two tabs open: they do not race each other into writing an older
  copy over a newer one.
- Local data and server data disagree on a dataset's schema version (a local database
  upgrade happened on one device only): the newer schema wins and the other device is
  told to reload.

## Requirements *(mandatory)*

### Functional Requirements

**What the server holds**

- **FR-001**: The server MUST hold, per Spotify account, every dataset the app builds
  today: the library snapshot and saved tracks, the playlists ranked, the history summary
  with its play counts, the artist reach summary, the saved mixes with their tracklists,
  and the audio features and rekordbox data the set-preparation screens use.
- **FR-002**: Each dataset MUST be stored with the time it was fetched or imported, its
  schema version, and the account it belongs to; the server MUST NOT hold a Spotify token
  and MUST NOT call Spotify.
- **FR-003**: The datasets MUST fit within a free hosting tier for the owner's current
  data, with room for one more year of history.

**Sync**

- **FR-004**: After any job that builds a dataset (sync, import, reach, mix lookup, mix
  edit) finishes, the app MUST push that dataset to the server without a further tap.
- **FR-005**: On open and on connect, the app MUST pull the datasets whose server copy is
  newer than the local one, and MUST NOT make any Spotify read to do so.
- **FR-006**: Newer wins per dataset, by the time it was fetched or imported; a removal
  done by a feature's own action propagates like an update; nothing is merged within a
  dataset.
- **FR-007**: A pull MUST restore the summary versions the screens gate on, so that Crate
  and Under the radar open after a restore exactly as after a local build.
- **FR-008**: Changes made while the server was unreachable MUST be pushed when it is
  back, on the next open at the latest.

**Optional server, visible state**

- **FR-009**: With no server configured, the app MUST be today's app; the public page
  keeps working for anyone.
- **FR-010**: With the server unreachable, every screen MUST work from local data;
  Settings MUST show the server state (not set up, offline, paused, signed out,
  connected) and the last successful sync time.
- **FR-011**: Every server failure MUST be shown in Settings with its reason, through the
  app's existing banner or state-signal mechanism, never as a bare string.

**Sign-in and removal**

- **FR-012**: The owner MUST be able to sign in to their server from Settings in one step
  and stay signed in on that browser until they sign out or the sign-in expires.
- **FR-013**: Disconnect MUST state whether server data is kept; by default it is kept.
- **FR-014**: The owner MUST be able to remove all their data from the server from
  Settings, behind a confirmation, and see it gone from every device.

**Safety of the data**

- **FR-018**: Anything that comes back from the server MUST be checked before it is stored or
  shown, so that a tampered or mistaken server row can never make the app open an arbitrary
  page, run a link, or break a screen; rejected rows are counted and shown in Settings.
- **FR-019**: The page MUST declare the hosts it talks to, so that a script injected into the
  app cannot send the owner's sessions or data anywhere else; the list is checked feature by
  feature on the phone.
- **FR-020**: Nobody but the owner can get a session: sign-ups are off, the sign-in link only
  works in the browser that asked for it, and the public key alone sees no row of any table.

**Repository and deployment**

- **FR-015**: Everything needed to create the server side (its schema, its access rules,
  its configuration) MUST live in this repository, be reproducible from one documented
  command, and be checked by the same three checks where code is involved.
- **FR-016**: The owner's manual MUST say what leaves the browser and where it is stored;
  the feature inventory's "What leaves the browser" table and the limits page MUST be
  updated, both pointing at ADR-08.
- **FR-017**: The server's data model MUST leave room for a queue of work items that a
  worker outside the server picks up and completes later (submitted by the app, claimed
  by a worker, finished with a result or a failure), so that the next round adds the mix
  worker without changing what this round stores. This round creates no work item and no
  worker.

### Key Entities

- **Account**: the Spotify account identity the data is keyed on, as the local database
  is keyed today; owns every dataset snapshot; never includes a token.
- **Dataset snapshot**: one of the app's datasets (library, playlists, history summary,
  reach summary, mixes, audio features, rekordbox) for one account, with the time it was
  fetched or imported and its schema version; the unit the newer-wins rule compares.
- **Server state**: what Settings shows: not set up, offline, paused, signed out,
  connected; the last successful sync time; the last failure and its reason.
- **Owner sign-in**: the one identity allowed on the server, remembered per browser,
  separate from the Spotify connection.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A browser with empty storage shows every screen's data within one minute of
  connecting, with zero Spotify requests made on load.
- **SC-002**: After a sync or import on one device, another device shows it on its next
  open; in a test with two devices and ten alternating updates, the newer copy wins every
  time and no older copy is ever restored.
- **SC-003**: With the server unreachable or not configured, every screen the app has
  today works unchanged; the only visible difference is the server state in Settings.
- **SC-004**: The owner's full current data plus one more year of history fits within the
  free tier with margin; Settings shows the used share.
- **SC-005**: Every server failure in a week of use appears in Settings with a reason;
  none is found only in the browser console.
- **SC-006**: Removing server data from Settings leaves the server holding nothing for the
  account, and every device reports local-only data at next open.
- **SC-007**: With the public key alone, and with a second temporary user, every table
  answers zero rows; a sign-in link opened in another browser does not sign in.

## Out of scope (future work on top of this server)

- Fetching a mix's audio from a platform and identifying its tracks (the owner's stated
  next goal, with yt-dlp); it will be its own spec once the server exists. Decided on
  2026-11-05: that worker runs on the owner's own computer, some of the time, and polls
  the server for queued work, so jobs wait while the computer is off and nothing on the
  server computes. FR-017 keeps the door open.
- Any job that runs on the server; in this round the server stores, it never computes.
- Any Spotify call from the server; the two writes and every read stay in the browser.
- More than one person; the server has one owner.

## Assumptions

- The owner is the only person and the only operator; they create the hosted project,
  keep its configuration, and accept to pay if the free tier is outgrown.
- The owner suggested a hosted database-with-sign-in service on a free tier (Supabase);
  the spec is tool-agnostic and the plan evaluates it against the requirements, in
  particular the free tier's pause after inactivity, which FR-010 and the edge cases
  already account for.
- Sign-in to the server is separate from the Spotify connection and done once per browser
  by a magic link sent to the owner's email (the owner's pick); this keeps the rule that no
  Spotify token ever leaves the browser.
- The local database stays the working copy; the server is the shared, durable copy.
  Local-first means every screen reads local data, and the server fills or refreshes it.
- Sync is per dataset, not per row; a dataset is pushed whole when its job ends.
- The browser-only deployment on GitHub Pages stays; the server is configured by a
  public URL and key beside the Spotify Client ID, and absent for anyone without them.
- Future jobs (mix fetching and analysis) are a separate round, run by a worker on the
  owner's computer that polls the server; the server is never asked to run them, so a
  database-with-sign-in service is enough for both rounds.
