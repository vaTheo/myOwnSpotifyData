# 000 — Contributing

> **Status**: Living
> **Last updated**: 2026-11-07

How to work on this repository: the commands, the files that change together, the documentation conventions (borrowed from the Armtek
repos, adapted to one small app), what a feature round looks like, and how a release happens. The product itself is described in
[How the app works](../architecture/000-how-it-works.md).

## Commands

Node 24 (`.nvmrc`), yarn classic 1.22. Install with `yarn` (CI: `yarn install --frozen-lockfile`).

| Command | What it does | When |
|---|---|---|
| `yarn dev` | Vite dev server; open `http://127.0.0.1:5173/myOwnSpotifyData/`, never `localhost` | manual checks |
| `yarn test` | the whole Vitest suite (Node environment) | after any change |
| `yarn test src/router.test.ts` | one test file | while working |
| `yarn test -t "throws when"` | tests matching a name | while working |
| `yarn vitest` | watch mode | while working |
| `yarn typecheck` | `tsc --noEmit`, test files included | after any change |
| `yarn lint` | ESLint flat config | after any change |
| `yarn format` | Prettier (not enforced in CI) | optional |
| `yarn build` | production build to `dist/` | before a release check |
| `yarn shots` | the visual loop: every page at four widths on the demo data, layout and accessibility checks, screenshots | after any UI change |
| `yarn shots:summary [checks]` | findings per check and page of the last run, with examples of the checks named | after `yarn shots` |
| `yarn shots:sheet` | `shots-output/contact-sheet.html`: the 1440 and 390 px screenshots of every page with their findings | after `yarn shots` |

Run `yarn typecheck && yarn lint && yarn test` before every commit; CI runs the same three.

## The visual loop

Every UI change ends with it ([ADR-11](../architecture/700-adr/ADR-11-web-first-material-3.md)). It is dev only: Playwright and
axe-core are dev dependencies, the run is not part of `yarn test` and not run in CI.

1. **Demo data.** `yarn dev`, then open `http://127.0.0.1:5173/myOwnSpotifyData/?demo`. Variants: `?demo=full` (the default),
   `empty`, `old-import`, `no-reach`, `locked`, `signed-out`. The demo lives in its own database with an in-memory session and no
   server, so the real data in the same browser is never touched; a production build has no demo.
2. **Pages.** Add or update the pages of the change in `tools/shots/pages.ts` (role and text selectors, `window.__demo.set` for a
   job state).
3. **Run.** `yarn shots` (the full default run takes about fifteen to twenty minutes). It always starts this worktree's own
   `yarn dev` on port 5173 and never reuses a running one: when the port is taken (a `yarn dev` left open here or in another
   worktree), the run fails at once; stop that server and run again. While working, use the quick per-page form:
   `yarn shots --project=1440 -g "<page ids>"` (about a minute). A full run first empties `shots-output/findings/` and
   `shots-output/pages/`, so the summary and the sheet read that run alone; any narrowed run (a file or name
   filter, `-g`, `--project`, `--last-failed`, `--shard`, `--list`) keeps them and refreshes only its own pages. `--reporter=dot` replaces the configured reporters, so it does
   not rewrite `shots-output/report.json` or `playwright-report/`: judge such a run by its exit code and `yarn shots:summary`
   (which reads `findings/`), not by those reports. Judge it by its exit code, never by grepping the output. Other engines on demand:
   `SHOTS_BROWSERS=firefox|webkit|all yarn shots` (WebKit needs libicu74 and libjpeg-turbo8 on Debian). Playwright runs with
   `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64`, set by the script, because LMDE 7 is not recognised.
4. **Read.** `yarn shots:summary` (add check names, such as `overlap,clipped-text`, for examples). The checks: page scroll,
   clipped text, overlap, column alignment, target size, frame in viewport, focus ring, axe WCAG 2.2 AA, console errors, any
   request outside 127.0.0.1. Findings on the pages you touched must reach 0.
5. **Look.** Open the screen-sized screenshots of the pages you touched, `shots-output/pages/<1440|390>/<id>.png`, fix what is
   misaligned and run again.
6. **Show.** `yarn shots:sheet` builds `shots-output/contact-sheet.html` for the owner. Approved screens can become **baselines**
   with `yarn shots --update-snapshots` (kept in `shots-output/baselines/`, compared on every later run). `shots-output/` and
   `playwright-report/` are gitignored.

## Code conventions

- `tsconfig.json` uses `moduleResolution: bundler`: relative imports carry **no** extension. Vite compiles JSX (`jsx: react-jsx`,
  `jsxImportSource: preact`); there is no framework plugin.
- Tests sit next to source as `src/**/*.test.ts`. IndexedDB tests import `fake-indexeddb/auto`. No DOM or component tests: keep logic in
  pure functions so it can be tested.
- ESLint: `@eslint/js` recommended + `typescript-eslint` recommended + `eslint-config-prettier`. Prettier: single quotes, semicolons, ES5
  trailing commas, 80 columns.
- Pinned: `typescript` `~6.0.3`, `vite` as an explicit devDependency ([ADR-06](../architecture/700-adr/ADR-06-lean-tooling.md)). A new
  dependency is the owner's decision.
- Commits: `type(scope): summary` (`feat(mix): …`, `fix(db): …`, `docs(adr): …`), each one compiling and green.

## One change, several files

- A **feature** ends with: its dated spec under `docs/specs/`, a row in the [feature inventory](../architecture/100-features.md), the
  section of [How the app works](../architecture/000-how-it-works.md) for the folders it touched, the owner's manual in `README.md`
  ("Using it", and the "Nothing is uploaded" paragraph if data leaves the browser), a `CHANGELOG.md` entry, and an ADR when the decision
  outlives the round.
- A **new Spotify scope or write**: `SCOPES` in `src/auth/session.ts`, a `hasScope` gate, the re-login prompt, [ADR-03](../architecture/700-adr/ADR-03-library-writes-on-tap.md),
  the inventory's "two Spotify writes" table.
- A **new external source**: the inventory's "What leaves the browser" table, `README.md`'s first paragraph, [ADR-04](../architecture/700-adr/ADR-04-keyless-sources-by-id.md)
  if the rule bends, a research note under `docs/research/`.
- A **new IndexedDB store or field**: `src/db/CLAUDE.md` rules, the store table in How the app works §6.
- A **new job**: the jobs table in How the app works §14, and a decision on `jobsBusy()` and `disconnect`.
- A **screen change**: the visual loop above, with its pages in `tools/shots/pages.ts` and the demo data in `src/dev/demo.ts`
  when the screen needs a new state.
- A **known limit found or lifted**: [Limits and roadmap](../architecture/800-limits-roadmap.md).
- Any page added under `docs/`: listed in the [documentation map](../README.md).

## Documentation

The conventions come from the Armtek repos (armtek-packager's harness spec, applied as in ratatouille), without the checker and the
generated index ([ADR-06](../architecture/700-adr/ADR-06-lean-tooling.md)).

**Where things live.**

| Folder | Holds | Named |
|---|---|---|
| `docs/README.md` | the map: every page, by section | — |
| `docs/architecture/` | how the app works, the feature inventory, limits and roadmap | `NNN-slug.md` |
| `docs/architecture/700-adr/` | one decision per file, listed in its `README.md` table | `ADR-NN-slug.md` |
| `docs/dev-guide/` | how to work on the repo (this page) | `NNN-slug.md` |
| `docs/specs/` | one design document per feature round | `YYYY-MM-DD-slug-design.md` |
| `docs/plans/` | the executed implementation plan of a spec; history, never edited after | `YYYY-MM-DD-slug.md` |
| `docs/research/` | verified external facts behind a spec, dated | `YYYY-MM-DD-slug.md` |
| repo root | `README.md` (owner's manual), `CHANGELOG.md`, `CLAUDE.md` (+ `AGENTS.md` symlink) | — |
| `src/db/`, `src/features/`, `src/features/mix/` | a local `CLAUDE.md` each: required inputs, expected outputs | — |

**Numbers.** Three digits with gaps: `000–099` introduction and policies, `100–199` inventories and guides, `700–799` decisions,
`800–899` limits and roadmap, `900–999` annexes. A number is never reused.

**Page header.** Right after the H1: `> **Status**: Living | Implemented | Draft | Reference` and `> **Last updated**: YYYY-MM-DD`
(an ADR has `Accepted | Proposed | Superseded by [ADR-NN](…)` and `> **Date**:`). The date is the last substantive edit.

**Links.** Relative Markdown links only, never an absolute path or a `[[wikilink]]`. Every page under `architecture/`, `dev-guide/`,
`700-adr/`, `specs/` and `research/` ends with `## Links`. A link between two such pages is answered: the target links back, to the page or
to its folder. Plans are history and keep their text.

**CLAUDE.md.** The root one is at most 150 lines with four sections: Routing, Reading protocol, Non-negotiable rules, References. A local
one is at most 80 lines with Required inputs (a table: type, file, why) and Expected outputs. `AGENTS.md` beside each is a relative
symlink to it (`ln -s CLAUDE.md AGENTS.md`), so Codex and Claude read one file. Route, do not copy: a rule lives in one page, others link it.

**Checking by hand** (no checker): `wc -l CLAUDE.md src/**/CLAUDE.md`, `find . -name AGENTS.md -not -path './node_modules/*' -exec ls -l {} +`,
and a look at every relative link of the pages you touched.

## A feature round

1. Discuss with the owner; the choice is theirs (options with a recommendation, then implement what was picked).
2. Write the spec under `docs/specs/` (decisions, out of scope, compatibility), then the plan under `docs/plans/`.
   The `/speckit-*` skills (GitHub Spec Kit, `.claude/skills/`, state under `.specify/`) can drive steps 1–3: `/speckit-specify`,
   `/speckit-plan`, `/speckit-tasks`, `/speckit-implement`. They write to `specs/<nnn-name>/` at the repo root; the round still ends with
   the documents listed in "One change, several files".
3. Implement test-first; keep `yarn typecheck`, `yarn lint` and `yarn test` green; end every UI change with the visual loop.
4. Documentation pass: the list in "One change, several files".
5. Commit `type(scope): summary`; the owner pushes or approves the push to `main`.
6. Check in the browser and on the phone after the deploy when the change touches a screen.

## Release

Every push to `main` runs CI (`.github/workflows/ci.yml`): install, typecheck, lint, test, then `yarn build` with the
`VITE_SPOTIFY_CLIENT_ID` repository secret and a deploy of `dist/` to GitHub Pages. There are no tags or versions; the deployed site is
`main`. The phone picks it up on the next load.

## Links

- [Documentation map](../README.md)
- [How the app works](../architecture/000-how-it-works.md)
- [Feature inventory](../architecture/100-features.md)
- [Limits and roadmap](../architecture/800-limits-roadmap.md)
- [ADR index](../architecture/700-adr/README.md)
- [ADR-06 — Lean tooling](../architecture/700-adr/ADR-06-lean-tooling.md)
- [ADR-11 — Web-first, Material Design 3, the visual loop](../architecture/700-adr/ADR-11-web-first-material-3.md)
