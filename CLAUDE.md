# myOwnSpotifyData

Browser-only Preact web app the owner (a DJ) uses mainly in a web browser on a computer, and on an Android phone: most played
Spotify tracks, their playlists ranked by play count, artists ranked by saved tracks, and set preparation (Crate, BPM and key, Match,
Under the radar, Mix tracklist). Public repo
`vaTheo/myOwnSpotifyData`, single `main` branch, deployed to GitHub Pages at `https://vatheo.github.io/myOwnSpotifyData/`. Keep it lean:
the owner declined commit hooks, Dependabot, branch protection, PR templates and a docs checker, and wants the minimum that solves the
request ([ADR-06](docs/architecture/700-adr/ADR-06-lean-tooling.md)).

Every page of the docs: [docs/README.md](docs/README.md). What is built and the project state: [feature inventory](docs/architecture/100-features.md).

## Routing

| If the task touches… | Read first | Then |
|---|---|---|
| "what exists / what state is the project in" | [Feature inventory](docs/architecture/100-features.md), [Limits and roadmap](docs/architecture/800-limits-roadmap.md) | — |
| any `src/` folder | [How the app works](docs/architecture/000-how-it-works.md), the section for that folder; the spec of the last round that touched it | `yarn typecheck && yarn lint && yarn test` |
| `src/db/` (stores, `DB_VERSION`, upgrade) | `src/db/CLAUDE.md`, [ADR-05](docs/architecture/700-adr/ADR-05-additive-indexeddb.md) | a test that upgrades from the previous version |
| `src/features/` (ReccoBeats, rekordbox, artist reach) | `src/features/CLAUDE.md`, [ADR-04](docs/architecture/700-adr/ADR-04-keyless-sources-by-id.md), the matching `docs/research/` note | the pacing test stays green |
| `src/features/mix/` (tracklist, Search matching, create playlist) | `src/features/mix/CLAUDE.md`, how-it-works §10 | accepted **and** refused cases in `spotifySearch.test.ts` |
| `src/server/`, sync between devices, the job queue | `src/server/CLAUDE.md`, [ADR-08](docs/architecture/700-adr/ADR-08-owner-server-free-tier.md), how-it-works §16 | no Spotify read from a pull; pending flags survive a failure; every pulled row validated |
| `worker/` (the owner's-computer worker), an `identify-mix` request | `worker/CLAUDE.md`, [ADR-08](docs/architecture/700-adr/ADR-08-owner-server-free-tier.md), how-it-works §17 | never a Spotify host; one probe at a time; the F15 JSON shape; `python -m unittest discover -s worker/tests` green |
| a screen, `src/ui/`, `tools/shots/` | [Design guide](docs/dev-guide/100-design-guide.md), [ADR-11](docs/architecture/700-adr/ADR-11-web-first-material-3.md), how-it-works §13, `specs/003-web-first-redesign/contracts/` | tokens only; `yarn shots` 0 findings on the pages touched |
| a Spotify scope, a write, `src/spotify/client.ts` | [ADR-03](docs/architecture/700-adr/ADR-03-library-writes-on-tap.md), how-it-works §3–§4 | inventory §3 "The two Spotify writes" |
| sync, quota, anything that reads Spotify | [ADR-02](docs/architecture/700-adr/ADR-02-no-spotify-reads-on-load.md), how-it-works §7 | no read on load |
| history import, Crate, play counts | [ADR-07](docs/architecture/700-adr/ADR-07-play-counts-from-export.md), how-it-works §8, §12–§13 | the summary-version gate |
| a new job or `model/state.ts` | how-it-works §14 (jobs table) | decide `jobsBusy()` and `disconnect` |
| a new feature | [Contributing](docs/dev-guide/000-contributing.md) "A feature round" and "One change, several files" | spec, inventory row, CHANGELOG |
| a decision that outlives the round | [ADR index](docs/architecture/700-adr/README.md) | a new ADR, linked both ways |
| any page under `docs/`, a `CLAUDE.md` | [Contributing](docs/dev-guide/000-contributing.md) "Documentation" | `docs/README.md` lists it; links answered; budgets |
| dependencies, CI, deploy | [ADR-06](docs/architecture/700-adr/ADR-06-lean-tooling.md), how-it-works §15 | ask the owner before adding a dependency |

## Reading protocol

1. Read the routed page before editing. The inventory names the spec and entry file of every feature; specs are under `docs/specs/`
   (newest first in the map), plans under `docs/plans/` are history.
2. A feature starts with options put to the owner, who picks; the pick is then implemented in full, docs included.
3. Replies short and direct: the answer or the action first, then the evidence (command, output, `file:line`).
4. After any change: `yarn typecheck`, `yarn lint`, `yarn test` (CI runs the same three).
5. A round ends with its docs: spec, inventory row, how-it-works section, README (owner's manual), CHANGELOG, an ADR when a decision lasts,
   Limits and roadmap when a limit is found or lifted.

## Commands

Node 24 (`.nvmrc`), yarn classic 1.22, install with `yarn`. `yarn dev` (open `http://127.0.0.1:5173/myOwnSpotifyData/`), `yarn test`,
`yarn test src/router.test.ts`, `yarn test -t "name"`, `yarn vitest` (watch), `yarn typecheck`, `yarn lint`, `yarn format` (not
enforced), `yarn build`. A UI change ends with the visual loop: `yarn shots` (Playwright, dev only, every page at four widths on
the demo data), `yarn shots:summary`, `yarn shots:sheet`; the demo is `yarn dev` opened with `?demo` (or `?demo=<variant>`), never
the owner's data ([ADR-11](docs/architecture/700-adr/ADR-11-web-first-material-3.md)). Before a merge: `yarn regression` (the UI driven
on the demo, one test per row of `specs/003-web-first-redesign/regression.md`) and `yarn invariants` (the branch against `main`).
Details: [Contributing](docs/dev-guide/000-contributing.md).

## Non-negotiable rules

- No client secret, no proxy, no token off the browser (ADR-01). The one server is the owner's free-tier database with sign-in (accounts the owner creates, one data set each: ADR-14),
  declared by a public URL and key beside `VITE_SPOTIFY_CLIENT_ID`; it stores, never computes, never calls Spotify; the app works without it;
  workers run on the owner's computer (ADR-08).
- Never open `localhost`: Spotify rejects it as a redirect URI; use `http://127.0.0.1:5173/myOwnSpotifyData/` (ADR-01).
- Never read Spotify on load outside the automatic chain: it syncs only when the library is older than 12 hours, not while locked, at
  most once a session; a new Spotify read joins that gate (ADR-02, ADR-11). The one other automatic read: opening a saved mix checks its
  unchecked named tracks on Spotify, once per mix, under the same switch and lock-out (ADR-13).
- Spotify writes exist in exactly two places (Create playlist from mix, Like all songs), on a tap, gated by `hasScope`; `post` is never
  retried; a refresh never widens a scope, so a new scope means **Connect again** (ADR-03).
- External sources: keyless, keyed on Spotify ids or ISRCs, never name search; clients never throw; long jobs start from Settings or the
  automatic chain (ADR-12) and resume; the reach pacing split is pinned by a test (ADR-04). The one exception: the worker may look up by name a clue that carries no
  identifier, exact equality only, the row marked "not heard" (ADR-10); the app's external sources never search by name.
- IndexedDB upgrades only add stores; optional fields need no bump; `mixes` stays out of `buildModel` (ADR-05).
- Play counts come only from the history export; the Crate gates on `historySummary.version === 2`, Under the radar on
  `artistReachSummary.version === 1`, never on rows (ADR-07).
- Every failure is shown: a state signal Settings renders, an inline message, or a `BannerMessage` built with `errorBanner`/`warnBanner`
  (never a string). Mix and Like failures are inline, never a banner.
- Every `confirm()` is listed in how-it-works §14; the destructive ones (account switch, narrower import, Remove server data) live in
  `model/state.ts`, Disconnect's in its Settings button. A new question joins that list.
- `moduleResolution: bundler`: relative imports carry **no** extension. Tests sit next to source; no DOM tests.
- `typescript` stays `~6.0.3` (typescript-eslint 8.x needs TS `<6.1`); `vite` stays an explicit devDependency. No blind bumps (ADR-06).
- Under the radar: Well known is a heading at the bottom, never a filter; listeners and fans are shown side by side, never summed, and a
  missing number is never printed as zero.
- Commits `type(scope): summary`, each compiling and green; push only with the owner's OK.

## References

- [Documentation map](docs/README.md) · [Feature inventory](docs/architecture/100-features.md) · [Limits and roadmap](docs/architecture/800-limits-roadmap.md)
- [How the app works](docs/architecture/000-how-it-works.md) · [Contributing](docs/dev-guide/000-contributing.md)
- [ADR index](docs/architecture/700-adr/README.md) · [CHANGELOG](CHANGELOG.md) · [README](README.md) (owner's manual)
- Local rules: `src/db/CLAUDE.md`, `src/features/CLAUDE.md`, `src/features/mix/CLAUDE.md`
