# Feature Specification: Fill the gaps of a worker scan

**Feature Branch**: `003-fill-scan-gaps`

**Created**: 2026-11-06

**Status**: Draft

**Input**: User description: "Fill the gaps of a worker scan (the parts of a set where no track was found). Two additions to the
worker on the owner's computer: (1) a second Shazam pass on every gap: probes again at a shifted offset (a few seconds later)
and with the speed corrected by about ±4 % (DJs pitch tracks), keeping the same pacing and rate-limit rules. (2) SoundCloud
comments (and YouTube comments/chapters when the link is YouTube), read with their position in the set: the comments posted
around each gap are attached to the result so the owner can read the clues ("ID?" answers, tracklists posted by the DJ); and
when a comment names an artist and a title that are easy to read, the worker tries to confirm that track in another free
database (owner: "sometimes names and artists are really easy to find") so the gap gets a candidate track, marked as coming
from a comment and not from the audio. No paid service, no key; never a wrong track presented as certain."

Revised 2026-11-06 at implementation (owner's pick): the second pass keeps the owner's first draft found in the worker —
places 7 s after the probes that found nothing, one every 30 s, each heard at normal speed, then ×0.96, then ×1.04, stopping
at the first match; this replaces the one-in-two rule below, kept for the record.

Clarified 2026-11-06 by the owner: (1) the second pass replays **one unmatched probe out of two**, alternating the speed
correction: in a run of unmatched probes, the 1st is replayed at +4 %, the 2nd is not replayed, the 3rd at −4 %, the 4th not,
and so on; (2) besides the comments, the worker reads the **set's description**, where uploaders often post the tracklist;
(3) a candidate found by name goes into Create playlist like an identified row, marked, unless the owner deletes it.

Context: the first comparison on 2026-11-06 (LYL Radio – Planète Noire, 2 h 10) shared 3 tracks between the worker and the
owner's earlier Tracklistify playlist; most of the set had no match at all. The worker now listens to 12 s every 15 s; this
round works on what is still missing.

## Constitution notice

- **Principle IV** says external sources are "looked up by Spotify ids or ISRCs, never by name search". Confirming a track
  named in a comment *is* a search by name. The owner approved it on 2026-11-06: "Find a track by its name is ok if it's
  impossible to do it another way". A comment gives only names, so there is no id to look up; this round records a narrow
  exception, limited to the worker: a name lookup may only **propose** a candidate for a gap, the candidate is
  accepted only when the catalogue's artist and title equal the comment's (the same equality rules the app's Search
  matching already applies, never containment), and it is always shown as "from a comment", never as identified by the
  audio. The amendment (constitution Principle IV, a new ADR, the Limits page) is part of this round.
- **Principle I** holds: every source in this round is free and keyless; nothing is stored on the server but the result.
- **Principle III** holds: the worker still never touches Spotify; the playlist is still made by the owner's tap.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A second listen on the parts where nothing was found (Priority: P1)

After the first pass of a scan, the worker knows which stretches of the set produced no match (the gaps). It listens to each
gap again, replaying one unmatched probe out of two with its speed corrected by 4 %, alternately up and down, because DJs
often play tracks faster or slower: in a run of four unmatched 15-second steps, 0–15 s is replayed at +4 %, 15–30 s is not,
30–45 s is replayed at −4 %, 45–60 s is not. A track found this way joins the tracklist like any other, marked as
found on the second pass.

**Why this priority**: it needs no new source and works on every platform; it is the cheapest way to recover tracks the
first pass missed by a few seconds or because of pitch.

**Independent Test**: scan a set with a known track played pitched by 4 % that the first pass missed; the result contains
that track at the right time, marked "second pass", and the scan's total time stays within the budget below.

**Acceptance Scenarios**:

1. **Given** a scan whose first pass left a run of 12 unmatched probes, **When** the second pass runs, **Then** probes 1, 5
   and 9 are replayed at +4 %, probes 3, 7 and 11 at −4 %, the even ones are not replayed, one call at a time with the usual
   pause between calls.
2. **Given** the second pass finds a track inside a gap, **When** the result is written, **Then** the track appears at its
   time in the set, with its confidence, marked as found on the second pass and at which speed correction.
3. **Given** the recognition service rate limits the computer during the second pass, **When** the usual pauses run out,
   **Then** the tracks of the first pass and those already found on the second pass are still sent; only the rest of the
   second pass is abandoned, and the log and the result say so.
4. **Given** a set with no gap, **When** the scan ends, **Then** no second pass runs.

---

### User Story 2 - Read the description and what listeners wrote around each gap (Priority: P2)

The worker reads the set's **description**, where uploaders often post the tracklist (with or without times), and, when the
page has them, the comments placed at a moment of the set (SoundCloud) or the chapters and timestamped comments (YouTube). On the Mix screen, each gap that still has no track shows the comments posted around
it, with who wrote them and when in the set, so the owner can read the clues ("ID?", "this is X – Y", a tracklist posted by
the DJ) and fill the row by hand.

**Why this priority**: for unreleased tracks and edits no database knows, the comments are often the only source; reading
them on the gap saves opening the platform and scrolling.

**Independent Test**: scan a SoundCloud set whose page has a comment "track ID?" at 34:10 answered "Artist – Title" at
34:20; on the Mix screen the gap around 34:00 shows both comments with their positions.

**Acceptance Scenarios**:

1. **Given** a set whose page has timestamped comments, **When** the result arrives, **Then** each gap shows the comments
   placed inside it or within a short margin around it, oldest position first, with the author's name and the position.
2. **Given** a set whose page has no comments, or a platform without timestamped comments, **When** the result arrives,
   **Then** the gaps show nothing more and the scan is not slowed or failed.
3. **Given** reading the comments fails (network, page private), **When** the scan finishes, **Then** the tracklist is sent
   as usual and the log says comments could not be read.
4. **Given** a YouTube set with chapters, **When** the result arrives, **Then** each chapter title is shown at its position
   like a comment written by the uploader.
5. **Given** a description holding a tracklist with times ("34:10 Artist – Title"), **When** the result arrives, **Then** each
   line is a clue at its time, shown on the gap it falls in; **Given** a tracklist without times, **Then** it is shown once
   for the whole set, and its lines can still propose candidates (User Story 3).

---

### User Story 3 - A candidate track from an easy comment (Priority: P3)

When a comment around a gap reads clearly as "Artist – Title" (or the uploader's tracklist lists one), the worker looks that
pair up in a free public music catalogue. If the catalogue has exactly that artist and title, the gap gets a **candidate**
row: the track, its catalogue identifiers (ISRC when known), the comment it came from, and a clear mark "from a comment, not
heard". The owner keeps or deletes it like any row; it is never shown as identified by the audio.

**Why this priority**: it turns the most useful comments into rows the playlist can use, but it rests on a name lookup, the
riskiest part of the round, so it comes last; a name lookup is used only because a comment carries no identifier.

**Independent Test**: a gap with the comment "Rosie Gaines – Closer Than Close" gets a candidate row for that track with its
ISRC, marked "from a comment"; a gap with the comment "this one is fire 🔥" gets none.

**Acceptance Scenarios**:

1. **Given** a comment "Artist – Title" in a gap and the catalogue has that exact pair, **When** the result is written,
   **Then** the gap holds one candidate row with that artist, title, ISRC when known, the comment's text and position, and
   the mark "from a comment".
2. **Given** the catalogue's best answer differs from the comment (another artist, a different title, a remix not named),
   **When** the lookup ends, **Then** no candidate is made; the comment stays readable on the gap.
3. **Given** two comments in the same gap name two different tracks, **When** both are confirmed, **Then** both candidates
   are listed and neither is chosen for the owner.
4. **Given** a candidate row, **When** the owner taps Create playlist, **Then** the candidate is searched and added
   like any identified row (the owner's pick, 2026-11-06), keeping its "from a comment" mark on the screen; a candidate the
   owner deleted first is not added.

### Edge Cases

- A gap at the very start or end of the set (intro, outro, applause) gets a second pass like any other; silence is skipped
  as today.
- A set with hundreds of comments: only the comments around gaps are kept in the result, and the result stays under the
  server's size limit (a cut is logged, never a failure).
- A description or comment that is a whole tracklist without positions (the DJ's list): it is attached to the set as a whole;
  its lines can propose candidates, each placed on a gap only when the line carries a time; a line without a time whose
  track is confirmed is listed as a set-wide candidate, not placed on a gap.
- A comment naming a track that the first or second pass already found elsewhere in the set: no candidate is made.
- Text in other scripts (Japanese, Cyrillic): shown as written; the lookup runs only when artist and title are separable.
- The catalogue is unreachable or slow: no candidate is made, the scan is not failed, the log says so.
- Comments with links, mentions or emojis only: kept as clues, never looked up.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: After the first pass, the worker MUST determine the gaps: stretches of the set between two found tracks (or the
  set's start or end) where no probe matched.
- **FR-002** (revised at implementation, owner's pick): places 7 s after the unmatched probes, one every 30 s, each heard at
  normal speed, then ×0.96, then ×1.04, stopping at the first match (settings `WORKER_SECOND_PASS_*`). Superseded wording: In each run of unmatched probes, the worker MUST replay the 1st, 3rd, 5th… probe (one out of two, counted from
  the run's start), alternating the speed correction: +4 % for the 1st, −4 % for the 3rd, +4 % for the 5th, and so on; the
  other probes are not replayed. A gap of a single unmatched probe gets one replay at +4 %.
- **FR-003**: The second pass MUST follow the first pass's pacing and rate-limit rules (one call at a time, the pause between
  calls, the pauses after a rate limit) and MUST stay within a budget of extra calls proportional to the gaps' length (see
  SC-003).
- **FR-004**: A refusal or failure during the second pass MUST NOT lose the first pass's tracks or the second pass's tracks
  already found; the result is sent with what was found and says the second pass stopped early.
- **FR-005**: Each track found on the second pass MUST be marked with that fact and the speed correction used.
- **FR-006**: The worker MUST read the set's description, and the comments placed at a position of the set (SoundCloud) and
  the chapters and timestamped comments (YouTube) when the platform offers them, without a key or an account. A description
  line with a time is a clue at that time; a description without times is a set-wide clue.
- **FR-007**: The result MUST carry, for each gap still without a track, the comments whose position falls inside it or
  within a margin around it, with author name, position and text; the result MUST stay within the server's size limit by
  keeping the comments closest to gaps first.
- **FR-008**: Failing to read comments or chapters MUST NOT fail or delay the request beyond a short bound; it is logged.
- **FR-009**: Only when a clue carries no identifier (no ISRC, no catalogue link), the worker MUST look up a comment's "Artist – Title" in a free, keyless public music catalogue only when the
  comment reads as one artist and one title, and MUST accept the answer only when artist and title are equal to the comment's
  under the app's existing equality rules (no containment, no fuzzy guess).
- **FR-010**: An accepted lookup MUST produce a candidate row for that gap with artist, title, catalogue identifiers (ISRC
  when known), the source comment and the mark "from a comment, not heard"; a candidate MUST never be shown or stored as
  identified by the audio.
- **FR-011**: The Mix screen MUST show, on each gap row, its comments (folded when long), and each candidate as a row with
  its "from a comment" mark; the owner can delete a candidate like any row. Create playlist includes the candidates still
  present, like identified rows (owner's pick, 2026-11-06).
- **FR-012**: The worker MUST NOT call any Spotify host, any paid service, or any service needing a key or an account.
- **FR-013**: The worker's log MUST say for each gap what the second pass found, how many comments were attached and which
  lookups made candidates.
- **FR-014**: The result MUST stay readable by the app's existing import (rows the app knows today keep their shape); the
  new parts (second-pass marks, comments, candidates) are additions an older app ignores.

### Key Entities

- **Gap**: a stretch of the set (start, end) with no found track after the first pass; it receives second-pass probes,
  comments and candidates.
- **Second-pass hit**: a track found in a gap, with its time, confidence and the speed correction that found it.
- **Clue**: a description line, a chapter or a comment: author (the uploader for the description), position in the set (or
  none for a set-wide line), text, platform.
- **Candidate**: artist, title, catalogue identifiers, the comment clue it came from, and the mark "from a comment".

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On the LYL Radio set (the 2026-11-06 comparison), the tracks found by the audio after the second pass include
  at least 2 more of the owner's Tracklistify playlist than the first pass alone.
- **SC-002**: No candidate made from a comment names a track different from the comment's artist and title (checked by hand
  on 3 sets: zero wrong candidates).
- **SC-003**: The second pass adds at most one call for every two unmatched probes (half the gaps' probes); a 2 h set is
  still finished in under 75 minutes.
- **SC-004**: The owner can read, on the phone, every comment placed in a gap without opening the platform.
- **SC-005**: A set whose comments cannot be read is processed exactly as today (same tracks, at most 30 s longer).

## Assumptions

- "Around a gap" means inside it or within 30 s before or after; a gap is at least one unmatched probe long.
- Second pass: one unmatched probe out of two, alternating +4 % and −4 %; the correction is a setting of the worker with this
  default. A replay covers the same moment of the set as the probe it replays.
- The free catalogue for lookups is a public, keyless one already allowed by the project's rules for the app's other
  features (artist and recording data); the plan picks it and records its limits.
- Comments come through the download tool the worker already ships; no new account, no scraping of a site whose terms
  forbid it (1001Tracklists stays out).
- Comments are text by third parties: the app shows them as plain text, never as links that run or HTML.
- The JSON kept on the owner's computer carries the same additions as the result.
