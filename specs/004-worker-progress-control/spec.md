# Feature Specification: See, steer and trust the worker's scans

**Feature Branch**: `004-worker-progress-control`

**Created**: 2026-11-06

**Status**: Draft

**Input**: Owner, 2026-11-06, after the six-set test day (report "Worker 0.3 test day"): "1. I agree, but I would like to keep all
songs, maybe you can send to DB what is the best % of this song and how many times it appears for a 12 s try, so I have data
that I can manage myself. 2. yes very good idea [progress on the phone]. 3. Yes nice! [manage the queue from the phone]. 4. Ok go!
[Ask again continues instead of starting over]. 5. Yes let's go [warn when the network is the problem]. 6. ok let's go [the VPN
note, BRUM's description rows by Ask again, the second pass's places in order of yield]."

The test day measured: about 40 % of the tracks heard in a single 12 s clip score under 70 %, and on BRUM 9 of the 22 heard
tracks are not in the DJ's own tracklist; a 2 h 10 set takes 54 minutes and the phone showed only "Identifying since…"; requests
had to be deleted and reordered in the database by hand; LYL Radio was restarted from zero three times (about 40 minutes lost);
on a VPN Shazam refused every 24 to 380 calls, without it once in 282 calls.

## Constitution notice

- **Principle I / ADR-08**: the server stores and never computes. Progress is written by the worker into the request it already
  owns; cancelling and reordering are changes the owner's app makes to its own rows. One small server migration adds the fields
  (applied by the owner, as before).
- **Principle III**: nothing here touches Spotify; Create playlist is unchanged (no row is removed or skipped automatically).
- **Principle VII**: every new state (paused by Shazam, frequent refusals, cancelled, resumed) is shown on the Requests card.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Know how sure each track is, and keep them all (Priority: P1)

Every identified track carries two numbers: **how many 12-second clips matched it** and **its best match score**. They are kept
with the saved mix (and on the server with it), shown on each row ("heard 3× · best 91 %"), and the owner can sort the
tracklist by them or show only the tracks heard once, to decide which to keep. Nothing is removed or skipped on its own.

**Why this priority**: the playlist is the product; the test day showed most doubtful matches are single-clip ones, and the
owner wants the data to judge them, not an automatic filter.

**Independent Test**: scan a set; every row from the audio shows its clip count and best score; a row heard once at 63 % shows
"heard 1× · 63 %"; sorting by clip count puts it last; Create playlist still includes it.

**Acceptance Scenarios**:

1. **Given** a track matched by 5 clips with scores 81, 91, 88, 90, 79 %, **When** the result arrives, **Then** its row shows
   "heard 5× · best 91 %".
2. **Given** a track found only on the second pass, **When** shown, **Then** the count includes that clip and the row still
   says it was a second listen.
3. **Given** a candidate from a comment or a tracklist, **When** shown, **Then** it has no clip count or score (not heard) and
   keeps its "from a comment / from the description" mark.
4. **Given** the owner chooses "show only tracks heard once", **When** the list filters, **Then** the others are hidden, not
   deleted, and the filter can be turned off; Create playlist uses the full list unless rows were deleted.
5. **Given** a saved mix from before this round, **When** opened, **Then** it shows as before, without the numbers.

---

### User Story 2 - See progress on the phone (Priority: P1)

While a request runs, the Requests card shows where it is: the step (download, first pass, second pass, comments), how far
(probe 211 of 519, 47 %), an estimate of the time left, and when Shazam paused it, until when. It refreshes on its own every
minute while the app is open (the automatic sync already does this).

**Why this priority**: a set takes 25–100 minutes; today the card only says "Identifying since 21:22".

**Independent Test**: start a 1-hour set; within two minutes the card reads e.g. "First pass · 23 % · about 18 min left";
during a refusal it reads "Paused by Shazam until 20:35".

**Acceptance Scenarios**:

1. **Given** a running request, **When** the worker has made progress, **Then** the card shows the step and the percentage within
   about a minute of it happening.
2. **Given** Shazam refused, **When** the worker pauses, **Then** the card shows "Paused by Shazam until HH:MM".
3. **Given** the worker stops (closed, crashed), **When** no progress arrives for 10 minutes, **Then** the card says the last
   progress time and "the computer stopped sending news".

---

### User Story 3 - Manage the queue from the phone (Priority: P2)

On the Requests card, a waiting request has **Cancel** and **Move to top**; a running one has **Stop**. Cancel removes it from
the queue; Move to top makes it the next one taken; Stop asks the worker to end it at once, keeping what it found
("stopped early") so the set can be resumed later.

**Why this priority**: today requests were deleted and reordered in the database by hand.

**Independent Test**: queue three sets; Move to top on the third; the worker takes it next; Cancel the second; it disappears;
Stop the running one; within a minute it ends as "stopped early" with its tracks.

**Acceptance Scenarios**:

1. **Given** three waiting requests, **When** the owner taps Move to top on the last, **Then** the worker takes it next.
2. **Given** a waiting request, **When** Cancel is tapped and confirmed, **Then** it is no longer in the queue nor on the card.
3. **Given** a running request, **When** Stop is tapped and confirmed, **Then** the worker ends it within about a minute, sends
   what it found marked "stopped early (by you)", and the card shows Ask again.

---

### User Story 4 - Ask again continues where it stopped (Priority: P2)

When a set was stopped (Stop, Ctrl-C, a refusal limit, a crash), asking again for the same link continues from where the
previous run stopped instead of starting over, as long as the computer still has what that run did and the probe settings are
the same.

**Why this priority**: LYL Radio was restarted three times on the test day, about 40 minutes lost.

**Independent Test**: stop a 2-hour set at probe 300; Ask again; the log says "resuming at 01:15:00, 300 probes kept"; the
result holds the tracks of both runs.

**Acceptance Scenarios**:

1. **Given** a run stopped at probe 300 of 519, **When** the same link is asked again on the same computer, **Then** the
   first pass starts at probe 301 and the earlier hits are kept.
2. **Given** the probe settings changed since (step, clip length), **When** asked again, **Then** it starts over and says why.
3. **Given** the earlier run is older than 7 days, or ran on another computer, **When** asked again, **Then** it starts over.
4. **Given** a run that finished normally, **When** asked again, **Then** it starts over (a deliberate re-scan).

---

### User Story 5 - Say when the network is the problem (Priority: P3)

When Shazam refuses often (two refusals less than 150 calls apart), the worker says so in its log and on the Requests card:
"Shazam refuses often: a VPN or a shared network? Without one it refused once in 282 calls." The README's troubleshooting says
the same with the test day's numbers.

**Independent Test**: two refusals 80 calls apart; the log and the card show the warning once for that request.

---

### User Story 6 - Smaller fixes (Priority: P3)

- The second pass hears every empty place at ×1 first, then those still empty at ×0.96, then at ×1.04, so a stopped second pass
  has already tried the most productive speed everywhere (×1: 18 new tracks in 292 calls; ×0.96: 8 in 213; ×1.04: 6 in 182).
- The owner asks again on BRUM to get its 31 description rows (no change needed; listed in the quickstart).

### Edge Cases

- A track heard in clips that were merged into two rows (played twice): each row has its own count and best score.
- Progress arrives while the phone is offline: the next sync shows the latest; nothing is queued on the phone.
- Move to top on the only waiting request: nothing changes. Cancel on a request the worker just claimed: it becomes Stop.
- Stop while the worker is in a 6-minute refusal pause: it ends at once, not after the pause.
- Resume after a result was already sent "stopped early": the new run's result replaces the earlier one on the saved mix, with
  the tracks of both runs.
- An older app reading a result with the new numbers ignores them (optional fields).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each track the audio found MUST carry the number of clips that matched it and its best match score; both are
  part of the result, kept with the saved mix and synced with it.
- **FR-002**: The Mix screen MUST show both on each heard row, offer a sort by each, and a filter "heard once" that hides
  without deleting; no row is removed or skipped automatically.
- **FR-003**: While a request runs, the worker MUST publish its progress (step, done and total, percentage, estimated time left,
  paused until, warnings) at most once a minute and at each step change, on the request itself.
- **FR-004**: The Requests card MUST show that progress, and say when none arrived for 10 minutes.
- **FR-005**: The owner MUST be able to cancel a waiting request, move it to the top of the queue, and stop a running one from
  the phone, each with a confirmation for cancel and stop.
- **FR-006**: The worker MUST take the request at the top of the queue next, and end a stopped request within about a minute
  (also during a pause), sending what it found as "stopped early (by you)".
- **FR-007**: The worker MUST keep, on the computer, what a stopped run did (probes heard and their results, by link and
  settings) for 7 days, and a new request for the same link with the same settings MUST continue from there.
- **FR-008**: Two refusals less than 150 calls apart MUST produce one warning per request in the log and on the card.
- **FR-009**: The second pass MUST try ×1 at every place before ×0.96, and ×0.96 before ×1.04.
- **FR-010**: The README MUST say not to run the worker on a VPN, with the test day's numbers.
- **FR-011**: Results and saved mixes from before this round MUST still read as before.

### Key Entities

- **Track confidence**: clips matched (count), best score (percent), per heard row.
- **Progress**: step, done, total, percent, minutes left (estimate), paused until (time), warning (text), updated at.
- **Queue order**: a priority the owner raises with Move to top; ties by request time.
- **Stop request**: a flag on a running request the worker checks between calls.
- **Saved run state**: link, probe settings, probes heard with results, time, on the owner's computer only.

## Success Criteria *(mandatory)*

- **SC-001**: For every heard row of a new result, the owner can read how many clips matched and the best score, and filter to
  the tracks heard once, in under 10 seconds on the phone.
- **SC-002**: During a scan, the card's progress is never more than 2 minutes behind the worker.
- **SC-003**: The owner never needs the database to cancel or reorder a request (zero manual edits in a week of use).
- **SC-004**: A 2-hour set stopped halfway and asked again finishes in about half the time of a full scan.
- **SC-005**: On a VPN, the warning appears on the card within the first two refusals of a request.

## Assumptions

- "How many times it appears for a 12 s try" means how many 12-second clips matched the track (first and second pass); the
  best score is the highest match score among them.
- The filter offered is "heard once"; a score threshold is left to the owner's eye (sorting by score).
- The estimate of time left uses the calls left and the worker's measured pace, plus nothing for future refusals.
- One worker computer is the normal case; resume works on the computer that ran the stopped scan.
- The server migration is applied by the owner in the dashboard, as for 0002.
