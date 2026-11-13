# Research: The worker takes phone share links and trims SoundCloud links

Every fact below was read in the code or checked on 2026-11-13. No open question remains.

## R1. What `on.soundcloud.com` answers

- **Fact**: one request to the share link already cited in `docs/specs/2026-09-06-mix-tracklist-design.md`, without following it,
  with a plain user agent: `HTTP 302`, `Location: https://soundcloud.com/<user>/<set>?ref=clipboard&p=a&c=0&si=…&utm_source=clipboard&utm_medium=text&utm_campaign=social_sharing`.
  The same for `HEAD` and `GET`. One step, straight to the set's page. A token that does not exist answers `404`; the bare host
  (no token) answers `400`.
- **Decision**: one `GET`, the redirect not followed by the library, the `Location` header read, the body not read. At most 3
  requests in all, 10 s each.
- **Rationale**: `GET` is what a browser sends, so it is the answer least likely to be refused; the body of a redirect is tiny and
  is not read. Three requests leave room if SoundCloud adds a step.
- **Alternatives**: `HEAD` (lighter, but some shorteners refuse it; no gain here); following redirects with the library (no control
  over where it goes).

## R2. Who follows the short link

- **Fact**: the locked yt-dlp (2026.10.26) has no `on.soundcloud.com` pattern in its SoundCloud extractor (0 matches in
  `yt_dlp/extractor/soundcloud.py`). Given such a link it would use its generic extractor, which follows a redirect to any site.
- **Decision**: the worker resolves the link itself, before yt-dlp sees anything.
- **Rationale**: the worker then knows the real address (TrackId.net needs it), and decides which hosts are allowed (ADR-16).
- **Alternatives**: let yt-dlp follow it and read `webpage_url` from its answer: no host control, and in shared mode a friend's
  request could reach any address. The app guessing the address from the title: set aside by the owner (a wrong guess downloads
  another set).

## R3. One trim rule in two languages

- **Fact**: the app's rule is `normalizeMixUrl` (`src/features/mix/url.ts:18`): `http` or `https` only; host lower-cased and one of
  `soundcloud.com`, `www.`, `m.`; query and fragment dropped; exactly one trailing slash dropped; at least two path parts; the path
  kept as it is; the answer always `https://soundcloud.com<path>`. The owner's example
  (`…/<user>/<set>?in_system_playlist=…`) already gives the clean address in the app (run on 2026-11-13).
- **Decision**: `links.trim_soundcloud` ports it with `urllib.parse.urlsplit`. One file, `src/features/mix/url.cases.json`, lists
  links and their expected trimmed form (or `null`); `url.cases.test.ts` and `worker/tests/test_links.py` both read it, as
  `match.cases.json` and `parse.cases.json` already are.
- **Known difference**: the browser's `URL` percent-encodes characters outside ASCII in a path and removes `.` and `..` parts;
  Python's `urlsplit` does neither. It cannot matter here: a redirect's `Location` is ASCII, and a request recorded by the app was
  already trimmed by the browser. The case file holds ASCII paths only. Recorded as a limit.
- **Alternatives**: two rules tested apart (they drift); the worker not trimming and trusting the app (the address a short link
  leads to never passes through the app).

## R4. Where the working address is computed

- **Fact**: `pipeline.run_one` takes `payload.url` (`worker/mix_worker/pipeline.py:155`) and passes it to the download, to
  TrackId.net (`:179`), to the run state (`:212`, `:215`), to the clues (`:261`) and to `write_result` (`:288`). Every step is a
  `Deps` field with a default that changes nothing, so older tests run as before.
- **Decision**: one more optional field, `Deps.address`. `run_one` calls it once, after the `download` step is announced and
  before the download, and uses its answer in those five places.
- **Rationale**: one place, one variable, no new progress step (the app shows `download` while it happens), and `address=None`
  keeps every existing test byte-identical.
- **Alternatives**: resolving in `cli.run_queue` before `run_one` (the failure would need its own finish path, as the shared-mode
  refusal has); a new `link` progress step (the app would need to know its name).

## R5. What keeps the request's own link

- **Fact**: the app keys the request history and the saved mix on `payload.url` (`src/server/sync.ts:735`, `:761`). The worker
  finishes a request by its id. The automatic Ask again plans by link and inserts `{payload: {url}}` after checking for an open
  request with that link (`worker/mix_worker/server.py:235`).
- **Decision**: the request link is never rewritten. `run_queue` keeps passing it to `auto.after` and to the log's `claimed` line.
- **Rationale**: an automatic Ask again recorded under the real address would show in the app as a second mix.

## R6. The request key in the app

- **Fact**: Look up saves a mix under `classifyMixInput(input).url` when TrackId.net confirms nothing
  (`src/model/state.ts:1609`): for a short link, `https://on.soundcloud.com` followed by the path, query and fragment as pasted.
  After a Look up the link field is set to the mix's link (`src/ui/mix/MixListPane.tsx:64`). `validateJobRow` accepts any `https`
  link, so an app that was not updated still applies such a result.
- **Decision**: `requestKey` returns that same string for a short link.
- **Rationale**: the request, its history and the looked-up mix then share one key with no other change.
- **Cost, recorded as a limit**: the mix stays under the short link. If Look up later confirms the real address through
  TrackId.net, or the owner pastes the full link, a second mix is saved.

## R7. Shared mode

- **Fact**: `shared_link_allowed` (`worker/mix_worker/cli.py:69`) accepts `https` on three hosts, without user info, on the default
  port, and is checked before `run_one` (`:402`). One test pins `https://on.soundcloud.com/x` as refused
  (`worker/tests/test_cli.py:665`).
- **Decision**: the request-link list gains `on.soundcloud.com`. The destination is checked by the resolver, in both modes: each
  `Location` must pass the same test (https, no user info, default port) on the three page hosts or the short host.
- **Rationale**: ADR-16's rule is about where the computer goes; with the resolver's check it still goes only to SoundCloud.
- **Alternatives**: a separate shared-mode resolver (two code paths for one rule).

## R8. Mapping an answer to a reason

- **Decision**: redirect statuses (301, 302, 303, 307, 308) are followed under R7's test; 400, 404 and 410 are "not found" (R1: an
  unknown token is 404, a malformed one 400); a 2xx is "does not lead to a SoundCloud set" (a page, not a redirect); any other
  status (401, 403, 429, 5xx) and any network error or timeout is "did not answer; ask again later". The log line carries the
  status or the error type.
- **Rationale**: three reasons the owner can act on (paste the full link, try later, wrong link), and the detail stays in the log.
- **Alternatives**: one reason for everything (the owner cannot tell a dead link from a bad moment); retrying on 5xx (the worker's
  rule is no retry loop against a host that does not answer).
