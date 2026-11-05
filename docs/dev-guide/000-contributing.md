# 000 — Contributing

> **Status**: Living
> **Last updated**: 2026-11-05

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

Run `yarn typecheck && yarn lint && yarn test` before every commit; CI runs the same three.

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
3. Implement test-first; keep `yarn typecheck`, `yarn lint` and `yarn test` green.
4. Documentation pass: the list in "One change, several files".
5. Commit `type(scope): summary`; the owner pushes or approves the push to `main`.
6. Check on the phone after the deploy when the change touches a screen.

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
