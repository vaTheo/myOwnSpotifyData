# Tasks: Play button and Listen menu on every track list

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md),
[contracts/track-listen.md](contracts/track-listen.md), [quickstart.md](quickstart.md)

**Tests**: test-first on the pure functions (constitution: implementation is test-first; no DOM tests). UI behaviour is checked by
`yarn regression` rows L01–L04.

**Every commit**: `yarn typecheck && yarn lint && yarn test` green, exit code checked (not grep output); message `type(scope): summary`;
docs of what the commit touches in the same commit. Commit as `vaTheo <98275045+vaTheo@users.noreply.github.com>`. No push.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

None: no dependency, no config, no store.

## Phase 2: Foundational (blocks every story)

- [ ] T001 Write failing tests in `src/ui/listen.test.ts` for `spotifyTrackId(id: string | null | undefined): string | null`: a Spotify id returns itself; `"spotify:local:Unknown+Bootleg+Artist:Bootlegs:Untitled+Bootleg:412"` returns `null`; any id starting with `spotify:` returns `null`; `""`, `null`, `undefined` return `null` (data-model: "the Spotify track id, `null` for a local file (`spotify:local:…`), a missing or empty id")
- [ ] T002 Write failing tests in `src/ui/listen.test.ts` for `trackListenItems({ id, artist, title }): RowMenuItem[]`: with an id, items are exactly "Play on Spotify" (`href` `spotify:track:{id}`, `app: true`), "Open Spotify web page" (`https://open.spotify.com/track/{id}`, no `app`), then the five items of `digLinks(artist, title)` (Beatport, Bandcamp, Discogs, SoundCloud, YouTube) with the same labels and hrefs, in that order; with `id: null`, only the five search items
- [ ] T003 Implement `src/ui/listen.ts`: export `ListenTrack` (`{ id: string | null; artist: string; title: string }`), `spotifyTrackId`, `trackListenItems` (import `digLinks` from `../features/mix/digLinks`, `RowMenuItem` type from `./mix/RowMenu`); T001–T002 green; commit `feat(ui): listen links for a track row`
- [ ] T004 Extract the Mix found-track button into `src/ui/components/PlayOnSpotify.tsx`: props `{ id: string; artist: string; title: string; class?: string }`, renders `IconButton icon="play_arrow"`, label `Play {artist} – {title} on Spotify`, `href="spotify:track:{id}"` exactly as `src/ui/mix/TracklistTable.tsx:227-233` does today; make `SpotifyCell` (`src/ui/mix/TracklistTable.tsx:188`) render it for the found case with class `mix-spotify found` so the Mix markup is unchanged; commit `refactor(mix): PlayOnSpotify shared button`
- [ ] T005 Add `playColumn(trackOf, over?)` and `listenColumn(trackOf, over?)` to `src/ui/table/columns.tsx` per [contracts/track-listen.md](contracts/track-listen.md): play = id `play`, header "Play" hidden, priority 1, width `56px`, compact `lead`, cell `<PlayOnSpotify>` when `trackOf(row)?.id` is set else `null`; listen = id `listen`, header "Listen" hidden, priority 1, width `64px`, compact `trail`, cell `<RowMenu icon="headphones" label="Listen to {artist} – {title}" items={trackListenItems(track)} />`, `null` when `trackOf(row)` is `null`. Commit with T006–T008 below (a column with no user does not need its own commit)

**Checkpoint**: shared pieces exist; Mix looks the same.

## Phase 3: User Story 1 – Play a track from any list (P1) 🎯 MVP

**Goal**: ▶ first on every track table; the row click still opens details.
**Independent test**: demo Top tracks, ▶ on row 3 links to `spotify:track:…`; pressing it opens no details sheet.

- [ ] T006 [US1] `src/ui/Top.tsx` `trackColumns`: `playColumn` first (before `rankColumn`), `trackOf = (r) => ({ id: spotifyTrackId(r.item.id), artist: r.item.artists joined with ", " as the row shows them, title: r.item.name })`; top artists table unchanged
- [ ] T007 [P] [US1] `src/ui/Playlist.tsx` track columns (`:180-201`): `playColumn` first, `trackOf` from `r.row.track` (`id`, `artists`, `name`)
- [ ] T008 [P] [US1] `src/ui/Artist.tsx` `artistTracks` (`:188`): `playColumn` first, `trackOf` from `r.track`; commit T005–T008 `feat(ui): play button first on Top, Playlist and Artist tracks`
- [ ] T009 [US1] `src/ui/crate/shared.tsx` columns (`:144`): `playColumn` first (before `rankColumn({ compact: 'lead' })`), `trackOf` from `item.row.trackId` and `trackLabel(item.row)` (title, subtitle as artist); commit `feat(crate): play button first on every Crate view`
- [ ] T010 [US1] Regression row L01 in `specs/003-web-first-redesign/regression.md` and `tools/shots/regression.spec.ts`: on `?demo`, Top tracks, Playlist, Artist and one Crate view each have a first-cell link `spotify:track:…` named "Play … on Spotify"; clicking it leaves the URL without `?d=`; clicking the title opens `?d=`

## Phase 4: User Story 2 – Computer and phone (P1)

**Goal**: ▶ first at every width, reachable by keyboard.
**Independent test**: phone width, ▶ is the first control of each item.

- [ ] T011 [US2] Check the phone item lead slot in `src/ui/table/DataTable.tsx` `CompactItem` (`:588`) draws `play` before `cover`/`rank` and keeps a 48 px target; fix CSS in `src/styles.css` (`.dt-item-lead`) only if the lead slot does not fit two cells; tokens only
- [ ] T012 [US2] Regression row L02: at a phone width (`windowClass` compact) Top tracks and a Crate view show ▶ as the first link of each item; Tab reaches it and its accessible name is "Play {artist} – {title} on Spotify"

## Phase 5: User Story 3 – Rows Spotify cannot open (P2)

**Goal**: no ▶ on local files; columns stay aligned.
**Independent test**: the demo local track "Untitled Bootleg" (`src/dev/demo.ts:240`) has an empty first cell.

- [ ] T013 [US3] Regression row L03: on the demo playlist holding "Untitled Bootleg", that row has no `spotify:track:` link and its first cell is empty; its Listen menu (after Phase 6) lists the five searches only

## Phase 6: User Story 4 – Every way to open a track, in one menu (P2)

**Goal**: headphones menu at the end of every track row, in place of "Open in Spotify".
**Independent test**: demo Playlist, a row's menu lists Play on Spotify, Open Spotify web page, Beatport, Bandcamp, Discogs, SoundCloud, YouTube.

- [ ] T014 [US4] `src/ui/Top.tsx`, `src/ui/Playlist.tsx`, `src/ui/Artist.tsx` track columns: replace `spotifyLinkColumn(...)` with `listenColumn(trackOf)` (same `trackOf` as T006–T008); keep `spotifyLinkColumn` on Top artists, `src/ui/Artists.tsx`, `src/ui/UnderRadar.tsx` (FR-012)
- [ ] T015 [US4] `src/ui/crate/shared.tsx`: add `listenColumn(trackOf)` last; commit T014–T015 `feat(ui): Listen menu on every track table`
- [ ] T016 [US4] `src/ui/overview/Overview.tsx` `Item` (`:65-104`): when `item.trackId` gives a Spotify id or the item is a track (has `trackId`), draw three siblings in the `<li>`: `<PlayOnSpotify>` (if id), the existing `<a class="ov-item">` unchanged, then `<RowMenu icon="headphones" …>` with `trackListenItems({ id, artist: item.subtitle, title: item.title })`; items without `trackId` unchanged; add the row layout to `src/styles.css` (flex row, link takes the rest, 48 px targets, tokens only); commit `feat(overview): play button and Listen menu on track items`
- [ ] T017 [US4] Regression row L04: Playlist row menu lists the seven items in order; Top artists still has "Open in Spotify"; an Overview track item has ▶ and the menu, and clicking its text still opens details

## Phase 7: Polish & documentation (same batch rule: each commit above already carries its docs; this is the final sweep)

- [ ] T018 [P] `docs/architecture/000-how-it-works.md` §13 (track rows: `playColumn` first, `listenColumn` last, `listen.ts`) and §10 (Mix ▶ is `PlayOnSpotify`)
- [ ] T019 [P] `docs/architecture/100-features.md`: inventory row for round 017 (spec `specs/017-track-play-button`, entry `src/ui/listen.ts`)
- [ ] T020 [P] `README.md` (owner's manual): ▶ on every track list opens the Spotify app; the headphones menu lists every way to open a track
- [ ] T021 [P] `CHANGELOG.md`: Added entry for round 017
- [ ] T022 [P] `docs/specs/2026-11-09-track-play-button-design.md` (short design note linking the speckit folder) and list it in `docs/README.md`
- [ ] T023 [P] `specs/003-web-first-redesign/contracts/screens.md`: the track tables' first and last columns where the screens list them; `src/ui/mix/CLAUDE.md` or `src/features/mix/CLAUDE.md` only if they name the Mix ▶ markup
- [ ] T024 Final sweep: file-to-doc map of every file changed in `git diff main --stat` → its doc; `yarn typecheck && yarn lint && yarn test` (exit 0); `yarn regression` (L01–L04 green); `yarn invariants`; public-safe check from `docs/dev-guide/000-contributing.md#keep-it-public-safe`. `yarn shots` only if the owner asks. Commit `docs: round 017 play button and Listen menu`

## Dependencies

- T001–T003 → T005 → US1 (T006–T010) → US2 (T011–T012) → US3 (T013) → US4 (T014–T017) → Polish (T018–T024).
- T004 before T005 (the column renders `PlayOnSpotify`).
- US2 and US3 only check what US1 built; US4 needs T003 and T005.

## Parallel opportunities

- T007 and T008 (different files) after T006 shows the pattern.
- T018–T023 (different docs).
- Subagent-driven: one implementer per phase is enough; phases share `columns.tsx` and page files, so run them in sequence.

## Implementation strategy

MVP = Phases 2–3 (▶ on every track table). Then US2 checks, US3 check, US4 menu and Overview, then the docs sweep. Stop and report
after T024; push only with the owner's OK.
