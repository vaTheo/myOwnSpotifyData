<!--
Sync Impact Report
- Version change: 2.0.2 → 2.1.0 (MINOR: Principle IV gains one bounded exception, a name lookup in the worker, per ADR-10)
- Modified principles: IV (one sentence added; title unchanged)
- Added sections: none
- Removed sections: none
- Templates: plan/spec/tasks templates read this file at runtime; no template edited here
- Follow-up TODOs: none
-->

# myOwnSpotifyData Constitution

Browser-first Preact app the owner (a DJ) uses on an Android phone to read their Spotify
listening data and prepare sets. One owner, one `main` branch, deployed to GitHub Pages,
with one optional server of the owner's holding the data.
This constitution restates the decisions that outlive any feature round; the reasoning
behind each lives in its ADR under `docs/architecture/700-adr/`.

## Core Principles

### I. Browser-first, no secret, one owner's server (ADR-01, ADR-08)

The app is a static site. Spotify auth is PKCE with a public Client ID in the browser;
there MUST NOT be a client secret or a proxy, and no Spotify token ever leaves the browser.
The settings are `VITE_SPOTIFY_CLIENT_ID` and the public URL and publishable key of the
owner's server. That server is a hosted database with sign-in on a free tier, for the owner alone:
it stores the app's datasets and a job queue, it never computes, never calls Spotify, and
the app MUST work in full without it. Any worker runs outside it, on the owner's computer.
The working copy stays the browser's IndexedDB. The dev redirect URI is
`http://127.0.0.1:5173/myOwnSpotifyData/`; `localhost` MUST NOT be used because Spotify
rejects it.

Rationale: a secret in a public repo is a leak; a server of the owner's own is upkeep they
declined; a free hosted database gives every device the same data at no cost.

### II. No Spotify reads on load (ADR-02)

The app MUST NOT read Spotify playlists, tracks or profile data when a page loads. Every
Spotify read starts from an explicit button (a sync) and MUST be visible as a job.

Rationale: the daily quota locks the account out for hours; an automatic read on every
open burns it.

### III. Library writes only on a tap, behind a scope gate (ADR-03)

Spotify writes exist in exactly two places: Create playlist from mix and Like all songs.
Each write happens on a tap, is gated by `hasScope`, and a `post` MUST NOT be retried.
A token refresh never widens a scope: a new scope means Connect again. Adding a third
write requires a new ADR.

Rationale: a retried POST duplicates playlists or likes; a silent scope widening is a
surprise the owner never approved.

### IV. External sources are keyless and keyed by id (ADR-04)

External data (ReccoBeats, rekordbox, artist reach) comes from free keyless sources,
looked up by Spotify ids or ISRCs, never by name search. Clients MUST NOT throw: a
failure is a value the caller renders. Long jobs start only from Settings and MUST
resume after a reload. The reach pacing split is pinned by a test that MUST stay green.
Recognition by audio happens only in the worker on the owner's computer, keyless and one
probe at a time; the app and the server never fetch or analyse audio (ADR-09). The one name
search allowed is the worker's, for a clue (a description line, chapter or comment) that carries
no identifier: keyless catalogues only, accepted on exact artist and title equality, and the row
is always marked as coming from the clue, never as heard (ADR-10).

Rationale: name search mismatches tracks; an API key is a secret (Principle I); a job
that cannot resume is lost on the phone.

### V. IndexedDB upgrades only add (ADR-05)

An IndexedDB upgrade MUST only add stores; it MUST NOT remove, rename or rewrite one.
Optional fields need no `DB_VERSION` bump. Every bump ships with a test that upgrades
from the previous version. `mixes` stays out of `buildModel`.

Rationale: the phone holds the only copy of the data; a destructive upgrade loses it.

### VI. Play counts come only from the history export (ADR-07)

Play counts are read from the Spotify history export the owner imports, never inferred
from the API. Views gate on a versioned summary: the Crate on
`historySummary.version === 2`, Under the radar on `artistReachSummary.version === 1`,
never on the presence of rows.

Rationale: the API exposes no play counts; a row-count gate shows a half-built view
after an interrupted import.

### VII. Every failure is shown

A failure MUST reach the screen: a state signal Settings renders, an inline message, or
a `BannerMessage` built with `errorBanner`/`warnBanner` (never a bare string). Mix and
Like failures are inline, never a banner. Under the radar prints listeners and fans side
by side, never summed, and a missing number is never printed as zero.

Rationale: the owner runs the app alone on a phone; a swallowed error is a bug they
cannot report.

## Technology and tooling constraints

- Stack: Preact, TypeScript, Vite, Vitest, ESLint flat config, Node 24, yarn classic.
- Lean tooling (ADR-06): CI runs `yarn install --frozen-lockfile`, `typecheck`, `lint`,
  `test`, then deploys `main`. No commit hooks, Dependabot, branch protection, PR
  templates or docs checker. A new dependency is the owner's decision and MUST be asked
  for before it is added.
- Pins: `typescript` stays `~6.0.3` (typescript-eslint 8.x needs TS `<6.1`); `vite`
  stays an explicit devDependency. No blind bumps.
- `moduleResolution: bundler`: relative imports carry no extension. Tests sit next to
  source as `src/**/*.test.ts`; IndexedDB tests import `fake-indexeddb/auto`; there are
  no DOM or component tests, so logic lives in pure functions.
- Every `confirm()` is listed in How the app works §14; the destructive ones live in
  `model/state.ts`, Disconnect's in its Settings button; a new question joins the list.
  A new job decides `jobsBusy()` and `disconnect` behaviour (How the app works §14).

## Development workflow

- A feature round starts with options put to the owner, who picks; the pick is then
  implemented in full, documentation included. The `/speckit-*` skills write to
  `specs/<nnn-name>/`; the round still ends with the repository documents.
- Implementation is test-first. `yarn typecheck && yarn lint && yarn test` MUST be green
  after every change and before every commit; CI runs the same three.
- A round ends with its documents: the spec under `docs/specs/`, a feature inventory
  row, the How the app works section for each folder touched, `README.md` (owner's
  manual), `CHANGELOG.md`, an ADR when a decision outlives the round, and Limits and
  roadmap when a limit is found or lifted. Every page under `docs/` is listed in
  `docs/README.md`; links between pages are answered both ways.
- The root `CLAUDE.md` is at most 150 lines, a local one at most 80, each with an
  `AGENTS.md` symlink. A rule lives in one page; others link to it.
- Commits are `type(scope): summary`, each compiling and green. Push to `main` only
  with the owner's OK.

## Governance

This constitution restates the standing decisions; the ADRs remain the record of why.
When the two disagree, the ADR index is corrected first and this file follows.

- Amendment: a change to a principle needs a new or superseding ADR, linked both ways,
  then an amendment here with a version bump and a new Last Amended date.
- Versioning: MAJOR for removing or redefining a principle, MINOR for a new principle
  or materially expanded guidance, PATCH for wording and clarifications.
- Compliance: every `/speckit-plan` Constitution Check and every review verifies the
  change against these principles. A violation is either removed or justified in the
  plan's Complexity Tracking table with the simpler alternative that was rejected.
- Runtime guidance for agents stays in `CLAUDE.md` and the local `CLAUDE.md` files;
  this file does not duplicate their routing.

**Version**: 2.1.0 | **Ratified**: 2026-09-04 | **Last Amended**: 2026-11-06
