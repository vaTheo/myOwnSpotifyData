# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Small personal TypeScript project to fetch and explore the owner's Spotify data. Private repo `vaTheo/myOwnSpotifyData`, single `main` branch. Keep it lean: the owner has explicitly declined extra tooling (commit hooks, Dependabot, branch protection, PR templates) and wants the minimum that solves the request.

## Commands

Node 24 (`.nvmrc`), yarn classic 1.22. Install with `yarn`.

| Task                                     | Command                        |
| ---------------------------------------- | ------------------------------ |
| Run the app with `.env` loaded           | `yarn dev`                     |
| All tests                                | `yarn test`                    |
| One test file                            | `yarn test src/config.test.ts` |
| Tests matching a name                    | `yarn test -t "throws when"`   |
| Watch mode                               | `yarn vitest`                  |
| Type-check (includes test files)         | `yarn typecheck`               |
| Lint                                     | `yarn lint`                    |
| Format (not enforced in CI)              | `yarn format`                  |
| Compile to `dist/` (test files excluded) | `yarn build`                   |

CI (`.github/workflows/ci.yml`) runs `yarn install --frozen-lockfile`, `typecheck`, `lint`, `test` on every push to `main` and every PR. Run those three locally before pushing.

## Conventions that are easy to get wrong

- **ESM + NodeNext resolution.** `package.json` has `"type": "module"` and tsconfig uses `module: NodeNext`. Relative imports must carry a `.js` extension even when the target is a `.ts` file (`import { loadConfig } from './config.js'`). Omitting it passes in Vitest but fails `tsc` and the built output.
- **Tests sit next to source** as `src/**/*.test.ts`. `tsconfig.json` includes them so `yarn typecheck` covers tests; `tsconfig.build.json` excludes them so they never land in `dist/`.
- **Environment loading is native Node**, not dotenv. `dev` and `start` pass `--env-file-if-exists=.env` to Node. Code reads credentials only through `loadConfig()` in `src/config.ts`, which throws naming the first missing variable. Add new settings there and mirror them in `.env.example`.
- **Spotify variables**: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI`.

## Pinned dependencies (do not bump blindly)

- `typescript` is held at 6.x. `typescript-eslint` 8.x supports TS `<6.1` only; with TS 7 `yarn lint` crashes at startup. Check typescript-eslint's peer range before upgrading.
- `vite` is an explicit devDependency because Vitest 5 declares it as a peer and yarn classic does not install peers. Removing it breaks `yarn test` with `Cannot find package 'vite'`.

## Style

ESLint flat config (`eslint.config.js`): `@eslint/js` recommended + `typescript-eslint` recommended + `eslint-config-prettier`. Prettier: single quotes, semicolons, ES5 trailing commas, 80 columns.
