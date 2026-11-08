# Feature Specification: TrackId.net with the Shazam probes

**Feature Branch**: `016-trackid-worker-clues` | **Created**: 2026-11-08 | **Status**: Draft

**Owner's change (2026-11-08, after the first draft)**: "When TrackId.net has a match we should not search a probe at this place." So no probe at all, not even a confirming one, inside a TrackId.net span: the span is taken as given. Agreement with Shazam can only come free from the probes at the span's edges.

**Input**: Owner: "Could you also add to the worker a way to mix data from https://trackid.net/api, I know sometimes they have good data and it's worth to try, it's already used in the web app: look how it works there, then find a way to use it smartly with the data fetched with the Shazam API." Pick (2026-11-08): both ways: guide the probes, then fill the gaps. Placed as round 016, after round 015 (shared worker), in the same plan.

Today the worker scans a mix with Shazam only (one probe at a time, about one call every 1.9 s) and reads the set's description and comments for clues. The app already asks TrackId.net for a mix when the owner presses Look up (`src/features/mix/trackid.ts`: list by the exact link, accept only a single record whose link is equal, then the spans by slug). TrackId.net has analysed only some mixes (the owner's example `soundcloud.com/sound-metaphors/temple-rat-live` returned no record on 2026-11-08), so every part of this must change nothing when it knows nothing.

## User Scenarios & Testing

### User Story 1 - A known mix is identified faster and with far fewer Shazam calls (P1)

As the owner, when I ask the worker to identify a mix that TrackId.net has already analysed, the scan makes no probe inside a stretch TrackId.net already names, and spends its rate-limited Shazam calls only on the stretches TrackId.net does not cover.

**Why this priority**: Shazam's pace is the scan's bottleneck (a 2-hour set is about 480 probes); skipping the stretches already known is the whole gain.

**Independent Test**: a mix whose TrackId.net record has spans covering most of it: the scan makes no probe inside the spans and normal probes elsewhere; compare the probe count with the same mix scanned without TrackId.net.

**Acceptance Scenarios**:
1. **Given** TrackId.net knows the mix and has a span for a stretch, **When** the scan reaches that stretch, **Then** it makes no probe inside the span (the span shrunk by 10 s at each edge), and the span's track appears in the result as a TrackId.net row, not heard.
2. **Given** a probe at a span's edge (outside the skipped core) names the same track as the span, **Then** that row is a heard row flagged as confirmed by TrackId.net, and it starts at the span's start.
3. **Given** the probe at a span's **start** edge names a different track, **Then** the span is not trusted: its stretch is probed normally and no TrackId.net row is made for it; a different track at the **end** edge clips the span's row where that heard track starts.
4. **Given** TrackId.net does not know the mix, **Then** the scan makes exactly the probes it makes today.

---

### User Story 2 - Stretches nobody heard are filled from TrackId.net (P1)

As the owner, after the scan (and the second pass), a stretch still unidentified that a TrackId.net span covers shows that track, marked as coming from TrackId.net and not heard, so my tracklist has fewer holes.

**Why this priority**: it adds tracks Shazam cannot give (unreleased, ID-only, vinyl-only) when the community identified them.

**Independent Test**: a scan with an empty gap that a span covers: the result holds a row for it with origin TrackId.net and no confidence; a gap no span covers stays a gap.

**Acceptance Scenarios**:
1. **Given** a gap left after all passes and a span overlapping it, **Then** the result gets a row for that span's track, `origin` TrackId.net, no confidence, the span's own start and end clipped to the gap.
2. **Given** a heard row and a span for the same track at the same place, **Then** the heard row is kept and flagged as confirmed; no second row is added.
3. **Given** a span for a track the scan already placed elsewhere in the mix, **Then** it is still added where it was not heard (a track can be played twice).

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

As the owner, on the Mix screen I can tell a heard track, a track confirmed by TrackId.net, and a track that only TrackId.net gave, so I can decide what to trust before Create playlist.

**Acceptance Scenarios**:
1. **Given** a row from TrackId.net only, **Then** it reads "from TrackId.net · not heard" and starts unvalidated, like a clue (ADR-10).
2. **Given** a heard row confirmed by TrackId.net, **Then** it shows a "confirmed by TrackId.net" mark.
3. **Given** a result from before this round, **Then** it displays as it does today.

---

### User Story 5 - A way to switch it off (P3)

As the owner, I can turn TrackId.net off in the worker settings and get today's scan.

**Acceptance Scenarios**:
1. **Given** the setting off, **Then** no request goes to TrackId.net and the scan is today's.

## Edge Cases

- The mix link is not one TrackId.net can match (not SoundCloud or YouTube, a private link): treated as unknown, no call that could mismatch.
- TrackId.net's own timeline can be a few seconds off the audio: spans match a probe within a tolerance, never to the second; a span shorter than one probe is confirmed by the nearest probe or used at the end.
- The mix's length differs from the record's length by more than the tolerance: the record is distrusted (a different cut of the set) and treated as unknown.
- Overlapping or abutting spans of the same track are merged as the app does (`tidSpansToRows`).
- A span whose track Shazam also names a few minutes earlier or later: not a confirmation of this span.
- A TrackId.net timeline offset from the audio by more than the 10 s edge allowance: the edge probes then name a neighbouring track, which withdraws or clips the span (the only guard inside the skipped core is the length check).
- The owner presses Stop or Ctrl-C during the TrackId.net call: the request is released as today.
- TrackId.net answers a huge number of spans: bounded to a cap (assumed 500); the rest ignored with one log line.
- A mix already holding rows from the app's own TrackId.net Look up: the worker's result still merges as today; worker-added rows carry their own origin.
- Rate limit: one list call and one detail call per request, spaced, no retry loop.

## Requirements

### Functional Requirements

- **FR-001**: For each identification request the worker MUST ask TrackId.net for the request's link before the first probe, using only the exact link (never a keyword or a name search), and MUST accept a record only when exactly one record answers and its link equals the request's link and its slug matches on the detail call.
- **FR-002**: When TrackId.net knows the mix, the scan MUST make no probe inside a trusted span (the span shrunk by 10 s at each edge); every stretch not covered by a span, and each span's edge, MUST be probed as today.
- **FR-003**: A probe at a span's start edge that names another track MUST withdraw the span (its stretch is probed normally); one at its end edge MUST clip the span's row where the heard track starts. A heard track is never dropped for a span.
- **FR-004**: Each trusted span MUST give a row for its track (and any other span that overlaps a stretch still unidentified after all passes) with the origin TrackId.net, no confidence, the span's own times (clipped to where a heard row of another track starts) and marked not heard; it MUST NOT be added where a heard row for the same track already stands. A guided span's row is made when the scan ends; a span too short to guide is used the same way only where a stretch stayed unidentified. for the span's track with the origin TrackId.net, no confidence and the clipped times, marked not heard; it MUST NOT be added where a heard row for the same track already stands.
- **FR-005**: A heard row that a span agrees with MUST carry a flag saying TrackId.net confirmed it.
- **FR-006**: When TrackId.net does not know the mix, or fails, or is switched off, the scan, its probes, its pacing and its result MUST be identical to today's.
- **FR-007**: A TrackId.net failure, timeout, malformed answer or odd record MUST never fail, pause or delay a request beyond one bounded wait; it logs one line.
- **FR-008**: The Shazam rules MUST be unchanged: one probe at a time, the cooldown and its spread, the rate-limit pause, the refusal handling.
- **FR-009**: The result MUST keep the F15 shape, with only additive fields (a new origin value and a confirmed flag); a result without them MUST stay valid, and the app MUST show the new rows and the mark without changing how older results show.
- **FR-010**: The worker's outbound hosts MUST gain `trackid.net` only, asserted by the existing host test; no Spotify host.
- **FR-011**: A setting MUST turn the TrackId.net step off; the default is on.
- **FR-012**: TrackId.net data MUST NOT enter a request's result beyond the track's artist, title, label, times and the request's own link; nothing personal goes to TrackId.net but the mix link, which the app already sends it.

### Key Entities

- **TrackId.net record**: the one record for the mix link: slug, title, duration, spans (start, end, artist, title, label, reference count).
- **Span**: one track's stretch in the mix according to TrackId.net.
- **Confirmed row**: a heard row that a span agrees with.
- **TrackId.net row**: a row only TrackId.net gave: origin TrackId.net, not heard, unvalidated.

## Success Criteria

### Measurable Outcomes

- **SC-001**: On a mix TrackId.net covers for at least 80% of its length, the scan makes at least 60% fewer Shazam calls than the same scan without TrackId.net.
- **SC-002**: On a mix TrackId.net does not know, or with the step off, the probe list is identical to today's in 100% of runs of the equivalence test.
- **SC-003**: Every TrackId.net failure case in the test list leaves the request finishing as it would without TrackId.net, in 100% of cases.
- **SC-004**: On a known mix, every track both sources name for the same place shows as confirmed, and no track appears twice for one place.
- **SC-005**: Every existing worker and app test passes unchanged.

## Assumptions

- TrackId.net's public API is used keyless as the app uses it (list by link, detail by slug); terms and rate limits are as the app already respects: one list and one detail call per request, spaced.
- A track found only by TrackId.net is a candidate in the ADR-10 sense: not heard, unvalidated, included in Create playlist only per the owner's existing "Validated only / All tracks" choice.
- Shazam heard evidence outranks TrackId.net evidence when they disagree.
- Spans are trusted only when the record's duration is within a tolerance of the audio's (assumed 5%); a span is guided (its probes skipped) only when it is still at least 40 s long after being shrunk by 10 s at each edge; shorter spans are only used to fill gaps.
- This builds on round 015's worker (shared worker mode) but does not depend on it: it works in personal and shared mode alike.
- Decision to record: ADR-17 (a second identification source in the worker, guiding the probes), amending ADR-10 for the new origin.
