# Implementation Plan: The worker takes phone share links and trims SoundCloud links

**Branch**: `feat/worker-short-links` | **Date**: 2026-11-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/028-worker-short-links/spec.md`

## Summary

The app stops refusing an `on.soundcloud.com/<token>` link for **Identify on my computer**: `requestKey` returns the short link in
the form Look up saves a mix under, so the request, its history and the saved mix share one key. The worker gets one new pure module,
`worker/mix_worker/links.py`: `trim_soundcloud` (the app's `normalizeMixUrl`, pinned by a case file both test suites read),
`resolve_short_link` (asks `on.soundcloud.com` where the link leads, at most 3 requests, SoundCloud hosts only) and
`working_address` (the address a request is worked on). `pipeline.run_one` computes the working address once, under the `download`
step, and uses it for the download, TrackId.net, the clues and the saved run; the request itself is finished by its id, and the
automatic Ask again keeps the request's own link. A shared worker accepts `on.soundcloud.com` as a request host. No server change,
no new library, no new progress step. Worker 0.7.4.

## Technical Context

**Language/Version**: TypeScript ~6.0.3 (app: Preact, Vite); Python 3.11–3.13 (worker)

**Primary Dependencies**: none added. The resolution uses the standard library (`urllib`), like `cli.http_get`. yt-dlp stays at the
locked 2026.10.26.

**Storage**: none added. No IndexedDB change, no migration: a request row already holds any `https` link
(`src/server/validate.ts:539`) and the result is applied to the mix of the request's link (`src/server/sync.ts:761`).

**Testing**: `yarn typecheck && yarn lint && yarn test` (Vitest); `cd worker && uv run python -m unittest discover -s tests`.
Every network call is injected and faked.

**Target Platform**: the browser (phone and computer); the worker on the owner's computer (source form and the four executables).

**Project Type**: static web app + command-line worker.

**Performance Goals**: at most 3 small requests (10 s each at most) before the download of a short-link request; nothing added to
any other request.

**Constraints**: the only new outbound host is `on.soundcloud.com`, from the worker; a short link is never followed outside
SoundCloud's hosts; one try, no retry loop; the resolver never raises; no Spotify host; one probe at a time unchanged.

**Scale/Scope**: 3 app files, 1 new worker module, 2 worker files edited, 1 shared case file, tests, and the documents listed below.

## Constitution Check

*GATE: passed before Phase 0; checked again after Phase 1 (no change).*

| Principle | Check | Result |
|---|---|---|
| I. Browser-first, no secret, one owner's server | No secret, no proxy. The server stores the same row as today and computes nothing. The worker runs on the owner's computer. | Pass |
| II. No Spotify reads on load | No Spotify call anywhere in this round. | Pass |
| III. Library writes only on a tap | No write. | Pass |
| IV. External sources keyless, by id; clients never throw | `on.soundcloud.com` is asked by the exact link, keyless, never by name; the resolver returns a failure value and never raises; TrackId.net is still asked by the exact link only (now the real one). | Pass |
| V. IndexedDB upgrades only add | No store, no field, no `DB_VERSION` change. | Pass |
| VI. Play counts from the export | Not touched. | Pass |
| VII. Every failure is shown | The three short-link reasons are the request's `error`, shown inline on the Mixes list like any failed request. The refusal of a non-link stays inline (`mixError`). | Pass |
| Tooling (ADR-06) | No dependency, no CI change. Worker version bump as the rule asks. | Pass |
| Workflow | Options were put to the owner (2026-11-12), who picked on 2026-11-13. Test-first. Docs in the same commits (see Documentation). ADR-16 amended (shared-mode hosts). | Pass |

No violation: the Complexity Tracking table is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/028-worker-short-links/
├── spec.md
├── plan.md              # this file
├── research.md          # R1–R8: the facts and choices behind the plan
├── data-model.md        # request link, working address, which step uses which
├── quickstart.md        # release order and the owner's checks
├── contracts/
│   ├── app.md           # requestKey, the two texts
│   ├── worker.md        # links.py, the Deps seam, statuses and reasons, log lines
│   └── url-cases.md     # the shared case file
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks, not written by this plan
```

### Source Code (repository root)

```text
src/features/mix/
├── url.ts               # requestKey: a short link is a request link
├── url.test.ts          # the shared cases against normalizeMixUrl; requestKey cases
└── url.cases.json       # NEW: links and their trimmed form, read by both suites
src/model/state.ts       # NOT_A_REQUEST_LINK: the short-link clause removed
src/ui/mix/MixDetail.tsx # the share-link note names Identify on my computer
src/features/mix/worker.ts  # one comment (the request key is no longer always the download link)

worker/mix_worker/
├── links.py             # NEW: trim_soundcloud, resolve_short_link, working_address, the three reasons
├── pipeline.py          # Deps.address; run_one works on the working address
├── cli.py               # http_location (the real seam); SHARED_HOSTS + on.soundcloud.com; build_deps wires address
├── __init__.py          # 0.7.4
worker/pyproject.toml, worker/uv.lock   # 0.7.4
worker/tests/
├── test_links.py        # NEW: shared cases, the resolver table, working_address
├── test_pipeline.py     # added cases only
├── test_cli.py          # http_location; one edited case (on.soundcloud.com allowed in shared mode)
└── test_shared_queue.py # a short-link request is taken in shared mode
```

**Structure Decision**: the app change stays in the mix feature's link module (`url.ts`), where the rule already lives. The worker
change is one new module with no I/O of its own (the request is injected), wired through one optional `Deps` field so every
existing pipeline test runs unchanged.

## Design

### App

- `requestKey(input)` (`src/features/mix/url.ts:255`): starts with `classifyMixInput(input)`; a permalink gives its canonical form
  (as today), a short link gives `https://on.soundcloud.com<path><query><fragment>` (the string `startMixLookup` saves the mix
  under, `src/model/state.ts:1609`). A SoundCloud address that is neither (a profile, the bare short host) stays `null`. Other
  hosts: unchanged.
- `NOT_A_REQUEST_LINK` (`src/model/state.ts:1904`): "That is not a link the worker can take: paste an https link to the set."
- The share-link note (`src/ui/mix/MixDetail.tsx:59`): one sentence added, "Identify on my computer works with this link."
- Nothing else moves: `IdentifyRequest`, `OpenMixRequest`, `RunLine`, `mixListItems`, `requestIdentify` and the pull already key
  on whatever `requestKey` returns.

### Worker

- `links.py` (contracts/worker.md): `PAGE_HOSTS`, `SHORT_HOST`, `trim_soundcloud(url) -> str | None`,
  `resolve_short_link(url, locate) -> str | LinkFailure`, `working_address(url, locate) -> str | LinkFailure`,
  `LinkFailure(reason, detail)`, the three reason strings of FR-010. `locate(url, timeout) -> (status, Location)` is injected.
- `cli.http_location(url, timeout)`: the real `locate`. One GET with `User-Agent: mix-worker/<version>`, no redirect followed
  (the `NoRedirect` opener `http_get` already uses), the body not read; returns the status and the `Location` header; a network
  error raises and the resolver turns it into a failure.
- `pipeline.Deps.address: Callable[[str], str | LinkFailure] | None = None`. In `run_one`, after the `https` check and
  `news.step("download")`: a failure logs `  link · <detail>` and finishes the request failed with the reason, before any
  download; otherwise `work` replaces `url` in `deps.download`, `deps.trackid`, `runstate.load`, `runstate.Recorder`,
  `deps.clues` and `write_result(source_url=)`. When `work != url`, one line `  link · <work>`. With `address=None` the function
  is byte-identical to today.
- `cli.build_deps`: `address=lambda url: working_address(url, http_location)`. Always on: no setting.
- `cli.SHARED_HOSTS` gains `on.soundcloud.com`; `shared_link_allowed` is otherwise unchanged and still checked before `run_one`.
- `cli.run_queue`: untouched. `claimed … · <request link>`, `auto.after(url, outcome)` and `enqueue` keep the request's link.

### What uses which link

See data-model.md. In short: the server, the app and the automatic Ask again know only the request link; everything the worker
fetches or saves on disk uses the working address.

## Tests (written first)

- `src/features/mix/url.test.ts`: every case of `url.cases.json` through `normalizeMixUrl`; `requestKey` of a short link is the
  `https` short link and equals `classifyMixInput(...).url`; bare `on.soundcloud.com` and a profile stay `null`; the existing
  permalink and other-host cases unchanged.
- `worker/tests/test_links.py`: the same case file through `trim_soundcloud`; the resolver table of contracts/worker.md row by
  row (one hop, a chain, a 4th hop refused, another site, `http:`, user info, no `Location`, 400, 404, 410, 200, 403, 500, a raise);
  `working_address` for a short link, a page link with parameters, an already trimmed link, a profile, another platform.
- `worker/tests/test_pipeline.py` (added): with `Deps.address`, the fakes for download, TrackId.net, clues and the run state see
  the working address, `finish` goes to the job id and `mix_info.source_url` is the working address; a `LinkFailure` gives
  `failed` with its reason and no download call; without `address` nothing changes.
- `worker/tests/test_cli.py`: `http_location` on a 302 (status and header, never followed), a 404 and a raising opener;
  `shared_link_allowed("https://on.soundcloud.com/x")` is now true (the one edited expectation).
- `worker/tests/test_shared_queue.py`: a shared worker takes a short-link request; a request for another host still fails with
  "link not allowed in shared mode".
- Not added: a DOM test (none in this repo) and a regression row. The gate is `requestKey`, covered by its unit test; the two
  changed texts are read by the review.

## Commits

1. `docs(worker): spec 028, phone share links` (spec, plan, research, data model, contracts, quickstart, tasks).
2. `feat(mix): a SoundCloud share link can be sent to the worker` (app: `url.ts`, `url.cases.json`, tests, the two texts, with
   how-it-works §10, the owner's manual, the client contract).
3. `feat(worker): follow a share link and trim SoundCloud addresses, version 0.7.4` (worker code, tests, `uv lock`, with every
   worker document below).
4. A review round, then a `fix(...)` commit if it finds something.

Each commit green: `yarn typecheck`, `yarn lint`, `yarn test`, and the worker's `unittest`, judged by exit code. Before the merge:
`yarn regression` and `yarn invariants`. `yarn shots` only if the owner asks (two sentences change, no layout). Push and merge
only with the owner's OK.

## Documentation (same commits, swept once more at the end)

| Change | Document |
|---|---|
| `requestKey`, `url.cases.json` | how-it-works §10 (the short-link line and the `requestKey` line); `specs/002-mix-analysis-worker/contracts/client-api.md` (an amendment note: a short link is a request link) |
| `NOT_A_REQUEST_LINK`, the share-link note | `README.md` owner's manual (Mix, Identify on my computer: a share link from the phone works; needs worker 0.7.4) |
| `links.py`, `pipeline.py`, `cli.py` | `worker/CLAUDE.md` (hosts: `on.soundcloud.com`; the working address rule; 54 of 80 lines today); `worker/README.md` (share links; the three reasons under troubleshooting; the host list); `worker/RELEASE_NOTES.md` (0.7.4); `specs/002-mix-analysis-worker/contracts/worker.md` (an amendment note: the address step, the new seam, the host list); how-it-works §17 (a round 028 bullet; the shared-mode sentence) |
| Shared-mode hosts | ADR-16: an amendment (round 028) and its row in the ADR index; no new ADR (the rule "a friend's request never makes the computer fetch an arbitrary address" is kept, one host joins) |
| The round | inventory: row F43 and `on.soundcloud.com` in the "what leaves the device" table (worker row); Limits and roadmap §2 (the shared-mode host line; new limits: one set under two links is two saved mixes, a worker before 0.7.4, paths outside ASCII); `CHANGELOG.md`; `docs/README.md` (the specs list) |
| Not touched, checked | root `CLAUDE.md` (no rule names SoundCloud hosts); `src/features/mix/CLAUDE.md` and `src/server/CLAUDE.md` (neither describes the request link); the constitution (no principle changes); `specs/003-web-first-redesign/contracts/screens.md` and `regression.md` (neither quotes the two texts) |

## Risks

- **SoundCloud changes what the short host answers** (a page instead of a redirect, a bot check): the request fails with a clear
  reason and one log line carrying the status; the owner pastes the full link. Nothing else breaks.
- **One set under two links**: a request by share link lands on a mix saved under the share link; if Look up later confirms the
  real address through TrackId.net, or the owner pastes the full link, the app saves a second mix. Recorded as a limit; moving a
  mix to another link is a round of its own (spec, Decisions).
- **The two trim rules drift**: prevented by the shared case file; a known difference (a path with characters outside ASCII, which
  the browser encodes and Python does not) is recorded in research R3 and cannot arise from a redirect or from an app request.
- **An older worker takes a short-link request**: release order in quickstart.md; a shared one fails it with a clear reason.

## Complexity Tracking

No violation to justify.
