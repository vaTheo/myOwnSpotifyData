# Feature Specification: The worker takes phone share links and trims SoundCloud links

**Feature Branch**: `feat/worker-short-links`

**Created**: 2026-11-13

**Status**: Draft

**Input**: Owner, 2026-11-12: "I have try to lookup a mix with the worker with my phone but it seems the worker do not take link from mobile export with on.soundcloud.com it should be". Owner, 2026-11-13, about a SoundCloud link ending in `?in_system_playlist=…`: "those type of links should also be trimed", then "Create a plan do solve this". Option taken: the worker follows the short link. The other option (the app sends its guess of the real address) was set aside: a wrong guess downloads another set.

## Today

- SoundCloud's phone app copies a share link of the form `https://on.soundcloud.com/<token>`.
- The app cannot follow it: the browser may not read another site's redirect. **Look up** reads the title and the player through SoundCloud's oEmbed and guesses the real address; when TrackId.net confirms no guess, the mix stays saved under the short link.
- **Identify on my computer** refuses a short link ("That is not a link the worker can take: … a SoundCloud short link needs Look up first"). So a set copied on the phone that TrackId.net does not know can never be sent to the worker.
- A shared worker would refuse it too: `on.soundcloud.com` is not one of its allowed hosts.
- The app trims a SoundCloud link before it records a request (everything after `?` and `#` is dropped). The worker trims nothing: it uses the link of a request exactly as it arrives.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Identify a set from the phone's share link (Priority: P1)

On the phone the owner copies a set's link in the SoundCloud app, pastes it in Mix and taps **Identify on my computer**. The request is recorded. The worker finds where the short link leads, downloads that set and identifies it. The result lands on the mix saved under the short link: the one Look up saved, or a new one.

**Why this priority**: the phone is where the owner finds sets, and its share link is the only link the SoundCloud app gives. Without this the worker cannot be used from the phone for a set TrackId.net does not know.

**Independent Test**: with a short link in the field, the request recorded carries that short link; a worker given that request and a faked answer of `on.soundcloud.com` downloads the address the answer names and sends a result for the request.

**Acceptance Scenarios**:

1. **Given** `https://on.soundcloud.com/<token>` in the link field and a signed-in server, **When** the owner taps **Identify on my computer**, **Then** one request is recorded for that link and the button shows the usual waiting state, with no "not a link the worker can take" message.
2. **Given** that request, **When** the worker takes it, **Then** it asks `on.soundcloud.com` where the link leads, logs one line with the real address, and downloads that address.
3. **Given** the result is sent, **When** the app pulls, **Then** the tracks land on the mix whose link is the short link, like any result (merged into the saved one, or a new mix).
4. **Given** a mix saved under a short link by an earlier Look up, **When** the owner opens it, **Then** **Identify on my computer** and **Ask again** work for it.
5. **Given** an open request for a short link, **When** the owner taps again with the same link, **Then** "Already requested" as for any link.

---

### User Story 2 - The worker works on the real, trimmed address (Priority: P1)

Whatever SoundCloud link reaches the worker, it works on one clean address: the set's page on `soundcloud.com`, without anything after `?` or `#`. This holds for the address a short link leads to (it comes back with sharing parameters: `?ref=clipboard&p=a&c=0&si=…&utm_source=clipboard&utm_medium=text&utm_campaign=social_sharing`) and for a SoundCloud link that arrives in a request with parameters (`?in_system_playlist=…`, `?in=…`, `?si=…`).

**Why this priority**: TrackId.net answers only for the exact clean address; a saved run is found again only under the same address. An address with parameters loses both.

**Independent Test**: one list of links and their trimmed form, read by the app's tests and the worker's tests; a worker given a request whose link ends in `?in_system_playlist=…` downloads, asks TrackId.net and saves its run under the trimmed address.

**Acceptance Scenarios**:

1. **Given** a short link that leads to `https://soundcloud.com/<user>/<set>?ref=clipboard&…&si=…&utm_source=clipboard…`, **When** the worker takes the request, **Then** the download, the TrackId.net question, the reading of the description and comments and the saved run all use `https://soundcloud.com/<user>/<set>`.
2. **Given** a set TrackId.net knows, **When** it is asked once by its share link and once by its full link, **Then** TrackId.net is asked with the same address both times and gives the same rows.
3. **Given** a request whose link is `https://soundcloud.com/<user>/<set>?in_system_playlist=<name>%3A<number>%3A<n>`, **When** the worker takes it, **Then** it works on `https://soundcloud.com/<user>/<set>` and logs one line saying so.
4. **Given** a link on `m.soundcloud.com` or `www.soundcloud.com`, with or without a trailing slash, **Then** the address used is on `soundcloud.com` without the slash, the path kept character for character.
5. **Given** a request stopped early and asked again, once by short link and once by full link, **Then** the second one resumes the saved run of the first.

---

### User Story 3 - A short link never sends the worker elsewhere (Priority: P1)

A short link is followed only inside SoundCloud. If the answer names another site, the request fails and nothing else is fetched. A shared worker, which takes other users' requests, accepts short links under this same rule.

**Why this priority**: a shared worker must never be made to fetch an arbitrary address by someone else's request (ADR-16).

**Independent Test**: faked answers of `on.soundcloud.com` (another site, a chain of redirects, no redirect, an error, no answer): no download starts and the request fails with the stated reason.

**Acceptance Scenarios**:

1. **Given** a short link whose answer names a host that is not SoundCloud's, **When** the worker takes the request, **Then** it fails with "Short link does not lead to a SoundCloud set" and no other request leaves the computer for it.
2. **Given** a short link that no longer exists, **Then** the request fails with "Short link not found; paste the set's full link".
3. **Given** `on.soundcloud.com` does not answer, or answers with a server error, **Then** the request fails with "SoundCloud did not answer for the short link; ask again later", after one try.
4. **Given** a shared worker and a request for `https://on.soundcloud.com/<token>`, **Then** it is taken and resolved like in personal mode; a request for any host that is not SoundCloud's still fails with "link not allowed in shared mode".
5. **Given** a short link that leads to a profile (no set in the address), **Then** "Short link does not lead to a SoundCloud set"; to a playlist, **Then** the download's own refusal as today ("Playlist links are not supported; paste one set").

---

### User Story 4 - Nothing else changes (Priority: P1)

**Acceptance Scenarios**:

1. **Given** a request the app recorded for a full SoundCloud link (already trimmed), **When** the worker takes it, **Then** every call it makes is the same as with worker 0.7.3, and a run saved by 0.7.3 is still resumed.
2. **Given** a request for a link on another platform (YouTube, Mixcloud, …), **Then** the link is used as it arrives, as today.
3. **Given** an app that was not updated, **Then** it behaves as today (it never records a short link) and still applies a result recorded for a short link by another device.
4. **Given** a set stopped by refusals, **Then** the automatic Ask again asks with the request's own link, as today.

### Edge Cases

- A private set: its real address has a secret part in the path (`/<user>/<set>/s-…`). The path is kept as it is, so the download works; TrackId.net does not know it, as today.
- The same set asked by short link and later pasted by its full link: the app keeps two saved mixes (it cannot know they are one set). The worker's saved run is shared between them.
- A short link carrying parameters of its own: the request keeps the link in the form Look up saved it under, so the result and the looked-up mix stay one.
- A bare `https://on.soundcloud.com/` without a token: refused by the app, as today.
- A worker 0.7.3 or older takes a short-link request: not covered. A shared one fails it with "link not allowed in shared mode". The owner updates the worker before asking from the phone.
- A SoundCloud link in a request that is not a set address (a profile): left as it arrives, and the download refuses it as today.
- The owner presses **Ask again** on a mix saved under a short link whose link died since: the request fails with "Short link not found; paste the set's full link".

## Requirements *(mandatory)*

### Functional Requirements

The app:

- **FR-001**: **Identify on my computer** MUST accept an `on.soundcloud.com/<token>` link and record the request under that link in the form Look up saves a mix under, so a result and a looked-up mix are one saved mix.
- **FR-002**: The rule "one open request per link" MUST hold for a short link ("Already requested").
- **FR-003**: The message for a link the worker cannot take MUST no longer say that a short link needs Look up first; it stays for free text, `http:` links, a SoundCloud profile and a short link without a token.
- **FR-004**: The note shown on a mix saved under a short link MUST say that the worker can identify it, besides the advice it gives today.
- **FR-005**: The app MUST NOT follow a short link itself and MUST NOT make any new network call for this feature.

The worker:

- **FR-006**: For a request whose link is on `on.soundcloud.com`, the worker MUST ask that host where the link leads before any download, and MUST follow at most 3 redirects, each an `https` address on `on.soundcloud.com`, `soundcloud.com`, `www.soundcloud.com` or `m.soundcloud.com`. One try, never a retry loop.
- **FR-007**: The worker MUST trim every SoundCloud address before using it, the one a short link leads to and one that arrives in a request: everything after `?` and `#` dropped, the host written `soundcloud.com`, one trailing slash dropped, the path kept character for character. The rule MUST be the app's, pinned by one list of cases that both test suites read. The list MUST hold a link ending in `?in_system_playlist=…`, one in `?in=…` and one with the sharing parameters of a short link.
- **FR-008**: The download, the TrackId.net question, the reading of the description and comments, and the saved run MUST use the trimmed address. The result file MUST name that address as its source.
- **FR-009**: The result MUST be sent for the request as it was recorded. The automatic Ask again and its "one open request per link" check MUST keep using the request's own link.
- **FR-010**: A short link that cannot be resolved MUST fail the request with one of three reasons, shown in the app like any failure: "Short link not found; paste the set's full link" (the link does not exist), "SoundCloud did not answer for the short link; ask again later" (no answer, a server error), "Short link does not lead to a SoundCloud set" (another site, more than 3 redirects, no redirect, an address that is not a set).
- **FR-011**: A shared worker MUST accept a request for `on.soundcloud.com` under FR-006; a request for any other host that is not SoundCloud's MUST still fail with "link not allowed in shared mode".
- **FR-012**: The worker MUST log one line with the address it works on whenever that address differs from the request's link.
- **FR-013**: A request whose link is not on SoundCloud MUST be handled as today, and a request for an already trimmed SoundCloud link MUST produce the same calls as worker 0.7.3.
- **FR-014**: The worker's version MUST change (0.7.4) with a release note; the worker's manual and the owner's manual MUST say that a share link from the phone works and needs this version.

### Key Entities

- **Request link**: the link recorded in an identification request. The app's key for the saved mix and for the request history. Unchanged by the worker.
- **Working address**: the address the worker uses for a request: the request link itself, its trimmed form when it is a SoundCloud address, or the trimmed address a short link leads to. Never stored on the server.

## Decisions (recorded here)

- The worker resolves the short link; the app does not guess (owner, 2026-11-13).
- The real address is not sent back to the app and a mix is never moved from its short link to its full link in this round. Moving a saved mix to another link touches the saved mixes on every device and on the server; it is a round of its own if the owner wants it.
- The short link itself is not trimmed: its token is the link, and the request must carry the same link as the saved mix.
- Links on other platforms keep today's rule (the app drops `utm_*`, `si`, `feature` only). YouTube's `list`, `index` and `t` are not part of this round.
- No new library: the resolution is one plain request.
- Fixtures are made up: the account, set and playlist number of the owner's example link are not committed (the number may name the owner's SoundCloud account, and the repository is public).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A set copied in the SoundCloud phone app is sent to the worker with one paste and one tap, with no step on a computer: 0 "not a link the worker can take" messages for a share link.
- **SC-002**: For a set TrackId.net knows, a request by share link and a request by full link ask TrackId.net with 1 same address and get the same rows.
- **SC-003**: A SoundCloud link with parameters and its trimmed form give 1 download address, 1 TrackId.net question and 1 saved run; the case is in the shared list.
- **SC-004**: 0 requests leave the worker for a host outside SoundCloud because of a short link, in personal and in shared mode.
- **SC-005**: Every test of worker 0.7.3 passes without edit, except the one that pins `on.soundcloud.com` as refused in shared mode.

## Assumptions

- `https://on.soundcloud.com/<token>` answers `302` with the set's page on `soundcloud.com` and sharing parameters in one step. Checked once on 2026-11-13 with the share link already cited in `docs/specs/2026-09-06-mix-tracklist-design.md`. The limit of 3 redirects leaves room if SoundCloud adds a step.
- The computer that runs the worker reaches `on.soundcloud.com` as it reaches `soundcloud.com`.
- The app is deployed before the worker release is built, as in earlier rounds; until the worker is updated, a short-link request waits or fails as described in Edge Cases.
- The server needs no change: a request already holds any `https` link, and the app already applies a result to the mix of the request's link.
