# Tasks: Play button on the phone Mix row

**Input**: [plan.md](plan.md), [spec.md](spec.md)

**Tests**: test-first on the pure rule (no DOM tests). UI checked by `yarn regression` row M06.

**Every commit**: `yarn typecheck && yarn lint && yarn test` green, exit code checked; message `type(scope): summary`; docs of what
the commit touches in the same commit. Commit as `vaTheo <98275045+vaTheo@users.noreply.github.com>`. No push.

## Phase 1: User Story 1 – Play a found track from the phone tracklist (P1) 🎯 MVP

**Goal**: a found row's phone meta line has ▶ before Shazam and SoundCloud; "On Spotify" and ⋮ stay.
**Independent test**: demo "Sunrise" at 390 px, a found row's ▶ links to `spotify:track:`.

- [ ] T001 [US1] In `src/ui/mix/rowText.test.ts` add `foundSpotifyId`: the id of a Check answer (hand-linked too); null for
  not found, not checked, a library match alone, a gap, an unnamed row. Run it and watch it fail
- [ ] T002 [US1] `src/ui/mix/rowText.ts`: `foundSpotifyId`; T001 green
- [ ] T003 [US1] `src/ui/mix/TracklistTable.tsx`: the Listen column's `compactCell` draws `PlayOnSpotify` from `foundSpotifyId`
  before `ListenIcons`; `SpotifyCell` reads the same rule; doc comments updated
- [ ] T004 [US1] Regression M06 in `tools/shots/regression.spec.ts` and `specs/003-web-first-redesign/regression.md`; run
  `yarn regression -g "M06"`
- [ ] T005 Docs: how-it-works §10, inventory F38, README, CHANGELOG, `docs/README.md`, `specs/017-track-play-button/spec.md`,
  `specs/003-web-first-redesign/contracts/screens.md`; commit T001–T005 `feat(mix): play button on the phone Mix row`

## Dependencies

T001 → T002 → T003 → T004 → T005.
