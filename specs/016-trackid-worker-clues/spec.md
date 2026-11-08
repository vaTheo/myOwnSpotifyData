# Feature Specification: TrackId.net with the Shazam probes

**Feature Branch**: `016-trackid-worker-clues` | **Created**: 2026-11-08 | **Status**: Draft

**Owner's second message (2026-11-08)**: "When TrackId.net has a match we should not search a probe at this place." Superseded in part by the third message below: one confirming probe per span is allowed.

**Owner's final rule (2026-11-08, third message)**: "You can probe one confirming so the app will see both confirmations, but TrackId.net should be the source of truth." So each guided span gets exactly one confirming probe, every trusted span becomes a row from TrackId.net whatever Shazam says, and Shazam's answer is attached to the row as a check (agrees, differs, no match) for the app to show. This replaces the "no probe at all inside a span" and the "heard track wins" rules above.

**Input**: Owner: "Could you also add to the worker a way to mix data from https://trackid.net/api, I know sometimes they have good data and it's worth to try, it's already used in the web app: look how it works there, then find a way to use it smartly with the data fetched with the Shazam API." Pick (2026-11-08): both ways: guide the probes, then fill the gaps. Placed as round 016, after round 015 (shared worker), in the same plan.

Today the worker scans a mix with Shazam only (one probe at a time, about one call every 1.9 s) and reads the set's description and comments for clues. The app already asks TrackId.net for a mix when the owner presses Look up (`src/features/mix/trackid.ts`: list by the exact link, accept only a single record whose link is equal, then the spans by slug). TrackId.net has analysed only some mixes (the owner's example `soundcloud.com/sound-metaphors/temple-rat-live` returned no record on 2026-11-08), so every part of this must change nothing when it knows nothing.

## User Scenarios & Testing

### User Story 1 - A known mix is identified faster and with far fewer Shazam calls (P1)

As the owner, when I ask the worker to identify a mix that TrackId.net has already analysed, the scan makes one confirming probe inside each stretch TrackId.net names, instead of a probe every 15 seconds, and spends its rate-limited Shazam calls on the stretches TrackId.net does not cover.

**Why this priority**: Shazam's pace is the scan's bottleneck (a 2-hour set is about 480 probes); skipping the stretches already known is the whole gain.

**Independent Test**: a mix whose TrackId.net record has spans covering most of it: the scan makes one probe inside each span and normal probes elsewhere; compare the probe count with the same mix scanned without TrackId.net.

**Acceptance Scenarios**:
1. **Given** TrackId.net has a span for a stretch, **When** the scan reaches it, **Then** it makes one confirming probe inside the span (its window centered on the middle of the span) and no other probe whose window lies inside it.
2. **Given** the confirming probe names the same track as the span, **Then** the span's row shows that Shazam agrees.
3. **Given** the confirming probe names another track, or finds nothing, **Then** the span's row is still TrackId.net's track and shows that Shazam heard something else, or nothing.
4. **Given** TrackId.net does not know the mix, **Then** the scan makes exactly the probes it makes today.

---

### User Story 2 - TrackId.net is the source of truth for the stretches it names (P1)

As the owner, every stretch TrackId.net names appears in my tracklist with TrackId.net's track and times, marked as coming from TrackId.net, with Shazam's answer shown beside it, so a disagreement is visible and nothing TrackId.net knows is lost to a Shazam miss.

**Why this priority**: it adds tracks Shazam cannot give (unreleased, ID-only, vinyl-only) and keeps the community's identification as the reference.

**Independent Test**: a result for a known mix has one row per trusted span, each with its Shazam check; heard rows exist only outside the spans.

**Acceptance Scenarios**:
1. **Given** a trusted span, **Then** the result has one row for it: origin TrackId.net, the span's artist, title, label and own start and end, no confidence, not heard, unvalidated.
2. **Given** Shazam heard the same track at or inside the span, **Then** the row's check says it agrees; a different track, **Then** it says what Shazam heard instead; nothing, **Then** it says no match.
3. **Given** a Shazam hit inside a span's times, **Then** it is not a separate row: it is absorbed into the span's check. Hits outside every span stay rows as today.
4. **Given** a span too short to skip probes in, **Then** it is probed normally and its row's check comes from those probes.

---

### User Story 3 - TrackId.net never costs a request (P1)

As the owner, I want a TrackId.net that is down, slow, blocked or answering something odd to leave the scan exactly as if it did not exist.

**Why this priority**: it is an optional extra source on a long job; it must not fail or delay it.

**Independent Test**: fake TrackId.net answers: timeout, error status, malformed body, a record whose link differs, more than one record: each leaves the scan identical to today with one log line.

**Acceptance Scenarios**:
1. **Given** a timeout or error, **Then** the scan starts at once with no TrackId.net data and logs one line.
2. **Given** a list answer with `rowCount` other than 1, or a record whose link is not equal to the mix link, **Then** the mix is treated as unknown.
3. **Given** a span with an unparseable time, an end before its start, or no artist and title, **Then** that span is dropped; the others are kept.

---

### User Story 4 - The owner can see where each row came from (P2)

As the owner, on the Mix screen I can tell a heard track from a track TrackId.net gave, and for the latter what Shazam said about the same place, so I can decide what to trust before Create playlist.

**Acceptance Scenarios**:
1. **Given** a row from TrackId.net, **Then** it reads "from TrackId.net · not heard" and starts unvalidated, like a clue (ADR-10), with a second line for the Shazam check: "Shazam agrees", "Shazam heard <artist> - <title> instead", "Shazam: no match" or nothing when not asked.
2. **Given** a result from before this round, **Then** it displays as it does today.

---

### User Story 5 - A way to switch it off (P3)

As the owner, I can turn TrackId.net off in the worker settings and get today's scan.

**Acceptance Scenarios**:
1. **Given** the setting off, **Then** no request goes to TrackId.net and the scan is today's.

## Edge Cases

- The mix link is not one TrackId.net can match (not SoundCloud or YouTube, a private link): treated as unknown, no call that could mismatch.
- TrackId.net's own timeline can be a few seconds off the audio: the 10 s edges keep boundary probes ordinary and the confirming probe sits in the middle of the span, so a small offset still lands inside the track.
- The mix's length differs from the record's length by more than the tolerance: the record is distrusted (a different cut of the set) and treated as unknown.
- Overlapping or abutting spans of the same track are merged as the app does (`tidSpansToRows`).
- A span whose track Shazam also names a few minutes earlier or later: not a check of this span (only hits inside the span's times count).
- A TrackId.net timeline offset from the audio: the 10 s edge allowance keeps the probes next to a boundary ordinary, and the confirming probe is the check: a wrong offset shows as `differs` on the row, never as a removed row.
- The owner presses Stop or Ctrl-C during the TrackId.net call: the request is released as today.
- TrackId.net answers a huge number of spans: bounded to a cap (assumed 500); the rest ignored with one log line.
- A mix already holding rows from the app's own TrackId.net Look up: the worker's result still merges as today; worker rows carry their own origin.
- Rate limit: one list call and one detail call per request, spaced, no retry loop.

## Requirements

### Functional Requirements

- **FR-001**: For each identification request the worker MUST ask TrackId.net for the request's link before the first probe, using only the exact link (never a keyword or a name search), and MUST accept a record only when exactly one record answers and its link equals the request's link and its slug matches on the detail call.
- **FR-002**: When TrackId.net knows the mix, the scan MUST make exactly one confirming probe inside each guided span (a span still at least 40 s long once shrunk by 10 s at each edge), with its window centered on the middle of the span, and MUST NOT make any other first-pass probe whose window lies inside the core; every stretch not covered by a core MUST be probed as today.
- **FR-003**: TrackId.net is the source of truth: every trusted span MUST give a row for its track whatever Shazam answers. A Shazam answer inside a span's times MUST NOT replace, shorten, clip or remove the span's row; it is recorded on the row as a check (agrees, differs with the other track, or no match).
- **FR-004**: A trusted span's row MUST carry the origin TrackId.net, the span's artist, title, label and own times, no confidence, the check, and MUST be marked not heard and start unvalidated; a Shazam hit inside the span's times MUST NOT also appear as a separate row; hits outside every span remain rows as today.
- **FR-005**: The check MUST be one of `agrees`, `differs` (with the other track's artist, title and confidence), `no_match`, or `not_asked` (a span whose probe was refused or skipped by a stop), so the app can show both sources.
- **FR-006**: When TrackId.net does not know the mix, or fails, or is switched off, the scan, its probes, its pacing and its result MUST be identical to today's.
- **FR-007**: A TrackId.net failure, timeout, malformed answer or odd record MUST never fail, pause or delay a request beyond one bounded wait; it logs one line.
- **FR-008**: The Shazam rules MUST be unchanged: one probe at a time, the cooldown and its spread, the rate-limit pause, the refusal handling.
- **FR-009**: The result MUST keep the F15 shape, with only additive fields (a new origin value and the Shazam check on a TrackId.net row); a result without them MUST stay valid, and the app MUST show the new rows and the mark without changing how older results show.
- **FR-010**: The worker's outbound hosts MUST gain `trackid.net` only, asserted by the existing host test; no Spotify host.
- **FR-011**: A setting MUST turn the TrackId.net step off; the default is on.
- **FR-012**: TrackId.net data MUST NOT enter a request's result beyond the track's artist, title, label, times and the request's own link; nothing personal goes to TrackId.net but the mix link, which the app already sends it.

### Key Entities

- **TrackId.net record**: the one record for the mix link: slug, title, duration, spans (start, end, artist, title, label, reference count).
- **Span**: one track's stretch in the mix according to TrackId.net.
- **TrackId.net row**: a row from a trusted span: origin TrackId.net, not heard, unvalidated, with the Shazam check.
- **Shazam check**: agrees, differs (with the other track), no match, or not asked.

## Success Criteria

### Measurable Outcomes

- **SC-001**: On a mix TrackId.net covers for at least 80% of its length, the scan makes at least 60% fewer Shazam calls than the same scan without TrackId.net.
- **SC-002**: On a mix TrackId.net does not know, or with the step off, the probe list is identical to today's in 100% of runs of the equivalence test.
- **SC-003**: Every TrackId.net failure case in the test list leaves the request finishing as it would without TrackId.net, in 100% of cases.
- **SC-004**: On a known mix, every trusted span has exactly one row showing its Shazam check, and no place has two rows.
- **SC-005**: Every existing worker and app test passes unchanged.

## Assumptions

- TrackId.net's public API is used keyless as the app uses it (list by link, detail by slug); terms and rate limits are as the app already respects: one list and one detail call per request, spaced.
- A track found only by TrackId.net is a candidate in the ADR-10 sense: not heard, unvalidated, included in Create playlist only per the owner's existing "Validated only / All tracks" choice.
- TrackId.net outranks Shazam inside its spans (owner's rule): a disagreement is shown, not resolved.
- Spans are trusted only when the record's duration is within a tolerance of the audio's (assumed 5%); a span is guided (its probes skipped) only when it is still at least 40 s long after being shrunk by 10 s at each edge; shorter spans are only used to fill gaps.
- This builds on round 015's worker (shared worker mode) but does not depend on it: it works in personal and shared mode alike.
- Decision to record: ADR-17 (a second identification source in the worker, guiding the probes), amending ADR-10 for the new origin.
