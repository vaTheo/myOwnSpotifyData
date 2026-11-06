# Feature Specification: A worker on the owner's computer that identifies a mix's tracks from a link

**Feature Branch**: `002-mix-analysis-worker`

**Created**: 2026-11-06

**Status**: Draft

**Input**: User description: "I would like now to create the local worker that run through my computer to analyse sets. The goal is the follwing, with a link, downlad the song with yt-dlp and then pass it through tracklistify so it give me a JSON of all the song and then I would create playlists from those songs". Clarified on 2026-11-06: any link the download tool supports is accepted (its own list is the rule); the downloaded audio is deleted once the result is sent, the scan's JSON is kept. Added the same day: the worker runs two ways, as a command line program and as one packaged executable per system (Windows, Linux, macOS) with a configuration file beside it, the audio tool packed inside. The email code could not be set up (Supabase locks the email templates of new Free projects on its default mailer), so the worker signs in with the app's magic link, caught on the local address the project already allows; the typed code stays as an option. Decided the same day, after the plan's research: the Tracklistify the owner used (betmoar's) is no longer public and its surviving copy emits no ISRC, so the worker carries its own scan built on the ShazamIO library, writing the same JSON the hand import reads (F15).

## Constitution notice

This is the worker round that [ADR-08](../../docs/architecture/700-adr/ADR-08-owner-server-free-tier.md)
reserved: "Any worker runs outside [the server], on the owner's own computer, some of the time,
polling outbound; the server has no open port of the owner's and runs nothing. The first worker
(mix fetch and identification) is its own later round." The server round left an empty job queue
for it (spec 001, FR-017). Three principles bound the round:

- **Principle I**: the worker is a program on the owner's computer. It signs in to the owner's
  server with a credential that lives only on that computer; nothing of it is in the repo, the
  browser or the server. Any key a recognition service needs stays on that computer (ADR-08).
- **Principle III**: the worker never touches Spotify. It identifies tracks; the playlist is still
  created by the owner's tap in the app, through the existing "Create playlist from mix" job, so
  the count of Spotify write sites stays at two and no Spotify token leaves the browser.
- **Principle IV and the Limits page**: "Any audio fetch, fingerprinting or recognition API" is on
  the app's excluded list. It stays excluded **from the app**: the browser never fetches or
  analyses audio. The worker does, on the owner's computer, which is what ADR-08 allows. The
  Limits page must be reworded to say where the line now runs.

Principles II, V, VI and VII stay as they are. The app side of this round is a new job kind in
the queue, a request button on the Mix screen, and the pull of the result; it builds on the
Tracklistify import that already exists (F15) rather than inventing a second tracklist shape.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - From a link to a reviewed tracklist, without touching my computer (Priority: P1)

The owner finds a DJ set on a platform while on the phone. In the app's Mix screen they paste
the link and tap "Identify on my computer". The request is recorded on the owner's server. Some
time later, while the owner's computer is on and the worker is running, the worker picks the
request up, fetches the set's audio, runs the identification scan the owner used to run by hand
(F15), and sends the resulting tracklist back to the server. The next time the app opens or syncs,
the Mix screen shows that tracklist for that link: the same reviewable, editable rows a hand-run
scan produces today, with each track's time in the mix, its confidence and, where known, its
ISRC. The owner reviews the rows and taps the existing "Create playlist from mix".

**Why this priority**: this is the whole point of the round. Today the owner must be at the
computer to download the set, run the scan, find the JSON and import it from the phone. With this
story the phone only asks and later reads; the computer does the work whenever it is on.

**Independent Test**: on the phone, request the identification of a public set the owner has
not scanned before; on the computer, run the worker once; reopen the app. The Mix screen shows
the set's tracklist with at least one identified track, and "Create playlist from mix" is
offered for it. Nothing else on the phone was needed.

**Acceptance Scenarios**:

1. **Given** the app is signed in to the server and the Mix screen has a valid link, **When** the
   owner taps "Identify on my computer", **Then** the screen shows the request as "Waiting for
   your computer" within two seconds, the button is disabled for that link, and no Spotify call
   is made.
2. **Given** a request is waiting and the worker starts on the owner's computer, **When** the
   worker polls the server, **Then** it takes the oldest waiting request, marks it as running
   with the time it started and the name of the computer, and no second worker could take the
   same request.
3. **Given** the worker took a request, **When** the fetch and the scan succeed, **Then** the
   server holds the tracklist and the request is marked done with the time it finished.
4. **Given** the request is done, **When** the app next opens or the owner taps "Sync now with
   server", **Then** the Mix screen shows the link's tracklist with every identified row, its
   time in the mix, its confidence and its ISRC when the scan reported one, and the rows are
   editable and deletable exactly as an imported scan's rows are today.
5. **Given** the link's tracklist came from the worker, **When** the owner taps "Create playlist
   from mix", **Then** the existing job runs unchanged: ISRC-first search, the strict match rule,
   one private playlist named with the `tracklistify/` prefix, on this tap only.

---

### User Story 2 - I see what happened to each request, including failures (Priority: P2)

Requests can fail: the link is private or gone, the platform refuses the download, the scan
finds nothing, the recognition service is unavailable, the computer was off for a week. The owner
must see, on the phone, the state of every request they made and the reason a request failed,
and must be able to ask again.

**Why this priority**: a request that silently never returns is worse than the manual flow it
replaces. Principle VII: every failure is shown.

**Independent Test**: request the identification of a link that does not exist; run the worker;
sync the app. The Mix screen shows that request as failed with a one-line reason and offers
"Ask again".

**Acceptance Scenarios**:

1. **Given** the worker cannot fetch the audio (private, removed, unsupported platform,
   network), **When** it gives up on that request, **Then** the request is marked failed with a
   short reason in plain words, the worker moves on to the next request, and the app shows the
   reason on the Mix screen after its next sync.
2. **Given** the scan ran and identified no track at all, **When** the worker reports, **Then**
   the request is marked failed with the reason "No track identified", not done with an empty
   list.
3. **Given** a request failed, **When** the owner taps "Ask again", **Then** a new request is
   recorded for the same link and the failed one is kept in the history of that link.
4. **Given** the worker was closed, crashed or lost power in the middle of a request, **When**
   a worker next starts, **Then** a request marked running for longer than a set limit is taken
   again rather than left running forever, and the owner sees it as waiting again, not as lost.
5. **Given** the app is not signed in to the server, or the server is paused or unreachable,
   **When** the owner looks at the Mix screen, **Then** the "Identify on my computer" button
   explains why it is unavailable instead of failing silently, in the same wording the Settings
   server card uses.

---

### User Story 3 - The worker is one command I understand (Priority: P3)

On the computer, the owner starts the worker with one command and reads what it does: the
request it took, the fetch, the scan, the number of tracks found, the time each step took, and
whether the result was sent. They can run it until the queue is empty and have it exit, or leave
it running to keep polling. They can stop it at any time with the usual key, and nothing on the
server is left half-written. The credential and keys it needs are set up once, outside the repo.

**Why this priority**: the owner is the only operator; a worker that is hard to start or silent
will not be run, and the phone side becomes useless.

**Independent Test**: on a computer with the worker set up, run the command with an empty queue:
it says the queue is empty and exits. Add two requests from the phone and run it again: it
processes both in order, prints each step, and exits. Run it in the stay-on mode: it keeps
polling at a visible interval until stopped.

**Acceptance Scenarios**:

1. **Given** the worker is installed and its settings are present, **When** the owner runs the
   command, **Then** it prints which server it talks to as whom, then either "queue empty" or
   the request it took, and it never asks for input while running.
2. **Given** a required setting or tool is missing (no credential, no download tool, no
   recognition tool), **When** the command starts, **Then** it stops before touching the server
   and says exactly what is missing and where to set it.
3. **Given** the worker is stopped by the owner during a request, **When** a worker next
   starts, **Then** the interrupted request is taken again (US2 scenario 4), and no partial
   tracklist was ever sent.
4. **Given** the worker finished a request, **When** the owner looks at the computer, **Then**
   the audio file is gone from the computer and the scan's JSON is kept, so the owner can also
   import it by hand as before.
5. **Given** the packaged executable and its configuration file sit in one folder on a computer
   with neither Python nor ffmpeg installed, **When** the owner starts the executable, **Then**
   it signs in (asking once for the email and the code when no session exists) and then keeps
   polling until the window is closed, printing the same lines as the command line form.
6. **Given** the configuration file is missing beside the executable, **When** it starts,
   **Then** it writes a template with every setting and its default, says so, and exits without
   touching the server.

---

### Edge Cases

- The same link is requested twice while the first request is waiting or running: the app
  refuses the second with "Already requested" and shows the existing request. After done or
  failed, a new request is allowed and the newer result replaces the older one on the screen,
  while the older request stays in the link's history.
- The link is one the app already saved (lookup, TrackId or pasted rows): the worker's
  tracklist is attached to that same saved mix as a new source layer, beside the existing rows,
  never replacing the owner's edits or manual rows.
- The link is from a platform the app has no lookup for (any platform the download tool
  supports is accepted): the saved mix has no player and no page title from a lookup; the title
  comes from the fetched audio's metadata and the screen must not assume a page exists (as the
  hand import already does).
- The set is very long (three hours or more): the worker still processes it; the time limit
  for "running too long" is generous enough for that and for a slow download.
- The result is too large for one request to the server, or the free storage is nearly full:
  the result is sent in a way that stays under the server's request limit, and a failure to send
  is reported as a failed request with the reason, never as a silently lost result.
- The server has been paused for inactivity: the worker reports "the server is paused, resume
  it from the dashboard" and exits; it does not spin.
- The worker's credential expired or was revoked: the worker says so and exits before taking a
  request; the owner re-creates the credential once.
- The owner signs out of the server in the app or removes server data: waiting requests are
  removed with the rest; the worker finds an empty queue.
- Two computers run the worker at once: each request is taken by exactly one of them.
- The downloaded audio is a video with an audio track, a playlist link, or a live stream: a
  single audio track is accepted; a playlist link or a live stream is refused with a reason.
- The recognition scan identifies a track several times in a row (a long track): rows are
  kept as reported, as the hand import does; the owner prunes with the existing Delete.
- Windows warns that the executable is unsigned ("Windows protected your PC"): the manual says
  how to run it anyway; the round does not buy a signing certificate.
- The packed audio tool cannot start (a broken download, a system that refuses it): the worker
  stops before touching the server and says so, and the `WORKER_FFMPEG` setting points at any
  other copy (US3 scenario 2 applies to the packaged form too).
- macOS refuses an unsigned program ("cannot be opened because the developer cannot be
  verified"): the manual gives the right-click Open step; Linux needs the file made executable.

## Requirements *(mandatory)*

### Functional Requirements

**App side (phone)**

- **FR-001**: The Mix screen MUST offer "Identify on my computer" for the link in its box when
  the app is signed in to the server and the link is accepted (FR-015). When the server is
  unset, signed out, offline or paused, the button MUST be shown disabled with the same wording
  as the Settings server card.
- **FR-002**: Tapping it MUST record one request on the owner's server for that link, visible to
  the owner alone, and MUST NOT call Spotify or fetch anything from the platform.
- **FR-003**: The Mix screen MUST show the state of the link's latest request: waiting (with the
  time asked), running (since when, on which computer), done (when), failed (when, why). States
  MUST refresh on open and on "Sync now with server", never by polling in the background.
- **FR-004**: A link with a waiting or running request MUST NOT accept a second request; a done
  or failed request MUST allow "Ask again".
- **FR-005**: When a request is done, the pull MUST turn its result into the same tracklist rows
  the hand-run import produces today (F15): time in the mix, artist, title, label, confidence,
  ISRC and recognition page link when present, source marked as the scan. The rows MUST be
  validated before they are stored or shown, exactly as every other pulled row is.
- **FR-006**: The worker's rows MUST attach to the saved mix for that link: as a new source
  layer beside existing rows when the mix already exists, as a new saved mix otherwise. The
  owner's manual rows and edits MUST never be overwritten by a result.
- **FR-007**: "Create playlist from mix" MUST work unchanged on a worker tracklist: ISRC-first
  search, the strict match rule, the `tracklistify/` name prefix, on a tap, gated by scope.
- **FR-008**: Every failure on the app side (cannot record the request, cannot read results, a
  rejected result) MUST be shown inline on the Mix screen, never as a banner.
- **FR-009**: Signing out of the server, "Remove server data" and the account-mismatch rule MUST
  cover requests and results like every other server data.

**Worker side (the owner's computer)**

- **FR-010**: The worker MUST be one command the owner runs on their computer, with a mode that
  processes the queue until it is empty and exits, and a mode that keeps polling until stopped.
- **FR-011**: The worker MUST sign in to the owner's server as the owner with a credential that
  lives only on that computer, never in the repo, the browser or the server; the repo MUST
  document how the owner creates and stores it, and MUST NOT contain the server's privileged
  key.
- **FR-012**: The worker MUST take requests oldest first, one at a time, and MUST mark a request
  as running with the start time and the computer's name so that no other worker takes it.
- **FR-013**: A request marked running for longer than a set limit (long enough for a slow
  download and a three-hour set) MUST be taken again by the next worker; a result MUST only be
  sent whole, so a stopped worker never leaves a partial tracklist.
- **FR-014**: For each request the worker MUST fetch the audio from the link, run its own
  identification scan on that audio (segments recognised one by one by the same free
  recognition service the hand-run tool used, merged into one row per track with its time in
  the mix, ISRC and label when the service reports them), and send the scan's full output, in
  the JSON shape the hand import reads today, as the request's result; the audio itself MUST
  NOT be sent to the server.
- **FR-015**: The worker MUST accept any link the download tool supports, as that tool's own
  list defines it, with no platform treated specially; a link the tool cannot fetch MUST fail
  the request with the reason "Unsupported or unreachable link".
  The app MUST accept any https link for a request and MUST NOT guess support itself.
- **FR-016**: Once a request's result has been sent, the worker MUST delete the downloaded
  audio file from the computer (the owner's pick); the scan's JSON MUST be kept on the computer
  so the owner can hand-import it as before. When a request fails, the audio MUST also be
  deleted; nothing of a request outlives it on disk but the JSON and the log.
- **FR-017**: The worker MUST print, for each request, each step with its duration and outcome,
  and MUST exit with a clear message when a setting or a tool is missing, when the credential is
  refused, or when the server is paused; it MUST NOT retry in a loop against a paused or
  unreachable server.
- **FR-018**: A fetch or scan failure MUST mark the request failed with a one-line reason in
  plain words (private or removed link, unsupported link, download refused, no track
  identified, recognition service unavailable, result too large) and the worker MUST continue
  with the next request.
- **FR-019**: The worker MUST NOT hold or use a Spotify token and MUST NOT call Spotify.
- **FR-020**: Every setting the worker reads (server URL, credential location, download tool,
  recognition tool and its keys, folders, time limit, polling interval) MUST be documented in the
  repo with its default; the keys themselves MUST be set only on the owner's computer.
- **FR-021**: The worker MUST also ship as one packaged executable per system, Windows
  (64-bit), Linux (64-bit) and macOS (Apple silicon, and Intel while the automation offers such a
  machine), that needs no Python on the computer, reads the same settings from a configuration
  file beside it, offers the same commands, and when started with no command signs in if needed
  and then keeps polling (the double-click case).
- **FR-022**: The executables MUST be built by the repository's automation, each on a machine of
  its system, from a tagged version and attached to one release, never built by hand; the command
  line form and the executables MUST come from the same code, with the tests run once per
  release on that code.
- **FR-023**: The executables MUST carry the download tool and the audio tool (`ffmpeg`) inside;
  the command line form MUST install both with its one install command. The only outside
  requirement is a JavaScript runtime for links to platforms that need one (YouTube), reported
  by the check command, never required for other platforms.

### Key Entities

- **Identification request**: one ask, by the owner, to identify the tracks of one link. Has the
  link, the time asked, a state (waiting, running, done, failed), the computer and the time when
  taken, the time finished, a result or a failure reason. Belongs to the owner; the app writes
  and reads it, the worker takes and finishes it.
- **Scan result**: the identification scan's full output for one request: the set's title and
  audio file name, and the list of identified tracks (time in the mix, artist, title, confidence,
  and when known ISRC, label, recognition page link). The same shape the hand import reads today.
- **Saved mix**: the existing entity on the Mix screen, keyed by the link; gains the worker's rows
  as a source layer and a reference to its latest request.
- **Worker**: the program on the owner's computer; identified in requests by the computer's
  name; holds the server credential and the recognition keys locally.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From the phone, requesting a set's identification takes one paste and one tap, and
  the request is visible on the screen within two seconds.
- **SC-002**: A set requested from the phone is identified and its tracklist readable on the
  phone with no action on the computer other than the worker running; for a two-hour set the
  worker's own time, after the download, is under twice the time the hand-run scan takes today.
- **SC-003**: Every request ever made for a link can be seen on the Mix screen with its state;
  100% of failed requests show a reason in one line.
- **SC-004**: An interrupted request (worker stopped, power lost) is picked up again by the next
  worker run without the owner re-asking, in 100% of cases.
- **SC-005**: The Spotify write count stays at two: creating a playlist from a worker tracklist
  goes through the existing tap and nothing else; the worker makes zero Spotify calls (checked
  by review of the worker's outbound hosts).
- **SC-006**: The app without a server, and the app signed out of the server, behave exactly as
  before this round: the Mix screen's lookup, paste, hand import and playlist creation are
  unchanged (the existing test suite stays green, the hand-import path still works).
- **SC-007**: A fresh computer can be set up for the worker by following the repo's manual
  alone, with no value copied from the repo other than the public server URL.
- **SC-008**: On a computer without Python and without ffmpeg, of each of the three systems,
  the packaged executable plus its configuration file process a request end to end, with the
  same output lines as the command line form.

## Out of scope

- Creating the playlist from the worker, or any Spotify call from the worker or the server
  (Principle III, ADR-08).
- Any audio fetch, fingerprinting or recognition in the browser; the phone never downloads a
  set.
- Running the worker on the server, on a paid box or a cloud function; it runs on the owner's
  computer, some of the time, and queued requests wait while it is off.
- A notification to the phone when a request finishes; the app learns it on its next open or
  sync.
- Storing the audio on the server; only the scan's output travels.
- A confidence threshold, deduplication or automatic pruning of the identified rows (decided for
  F15, unchanged).
- Any job kind other than mix identification; the queue shape allows more, this round adds one.
- More than one person; one owner, one or more of their computers.

## Assumptions

- The hand-run tool of F15 (Tracklistify) is no longer available: its repository is gone and
  its surviving copy drops the per-track ISRC. The worker therefore ships its own scan on the
  ShazamIO library (keyless, as the tool was), paced to stay within what that service tolerates,
  and takes the surviving copy as the reference for segment sizes, pacing and merging rules.
- The scan's output keeps the shape the hand import reads today (title, audio file name, one
  entry per track with time in the mix, artist, title, confidence, ISRC, label, Shazam link), so
  the app's parser is reused unchanged and a hand import of the kept JSON still works.
- The worker signs in as the owner through the server's own sign-in, with a long-lived
  credential created once on the computer; the plan picks the mechanism and documents it. The
  server's privileged key is never used by the worker and never leaves the dashboard.
- Requests and results are the owner's data on the owner's server, governed by the same access
  rule as every other table; the queue the server round created is the place for them.
- The app reads request states only on open and on the sync button; there is no background
  polling from the phone, keeping the server round's rule that the app does nothing on its own.
- "Oldest first, one at a time" is enough for one owner; there is no priority or cancel beyond
  "Ask again" after a failure.
- The worker's running-too-long limit defaults to a few hours and is a documented setting.
- The packaged form targets Windows, Linux and macOS 64-bit (the owner's pick, 2026-11-06); the
  command line form runs wherever Python 3.11–3.13 and uv are. The executables are unsigned; the
  audio tool inside them is a static build distributed by a library whose licence terms the
  plan records.
- Request history per link is kept on the server until the owner removes server data; results
  are small (a scan of a three-hour set is tens of kilobytes) and do not threaten the free
  storage.
