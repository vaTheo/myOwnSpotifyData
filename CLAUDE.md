# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Browser-only Preact web app the owner (a DJ) uses on an Android phone to see
their most played Spotify tracks, rank their own playlists by play count, and
rank artists by saved tracks. Public repo `vaTheo/myOwnSpotifyData`, single
`main` branch, deployed to GitHub Pages at
`https://vatheo.github.io/myOwnSpotifyData/`. Keep it lean: the owner has
explicitly declined extra tooling (commit hooks, Dependabot, branch
protection, PR templates) and wants the minimum that solves the request.

Design spec: `docs/superpowers/specs/2026-09-04-spotify-dj-webapp-design.md`.
Verified Spotify platform facts: `docs/superpowers/research/2026-09-04-spotify-platform-research.md`.

## Commands

Node 24 (`.nvmrc`), yarn classic 1.22. Install with `yarn`.

| Task                             | Command                        |
| -------------------------------- | ------------------------------ |
| Dev server (open via 127.0.0.1)  | `yarn dev`                     |
| All tests                        | `yarn test`                    |
| One test file                    | `yarn test src/router.test.ts` |
| Tests matching a name            | `yarn test -t "throws when"`   |
| Watch mode                       | `yarn vitest`                  |
| Type-check (includes test files) | `yarn typecheck`               |
| Lint                             | `yarn lint`                    |
| Format (not enforced in CI)      | `yarn format`                  |
| Production build to `dist/`      | `yarn build`                   |

CI (`.github/workflows/ci.yml`) runs `yarn install --frozen-lockfile`, `typecheck`, `lint`, `test` on every push to `main` and every PR, then a `deploy` job builds with the `VITE_SPOTIFY_CLIENT_ID` secret and publishes `dist/` to GitHub Pages on pushes to `main`. Run the three checks locally before pushing.

## Architecture

`src/` is one Vite app. Pure, unit-tested cores sit behind thin I/O edges:

- `auth/` PKCE helpers and the session store (`createSessionStore`), with `browser.ts` holding the app instance.
- `spotify/` the API client (`createClient`: bearer, 401 refresh-once, 429 backoff, quota lock-out, one request in flight) and the API types.
- `db/` `idb` schema and repository. Stores: `playlists`, `tracks`, `entries` (keyed `[playlistId, position]`), `topItems`, `plays`, `meta`.
- `sync/` planner (pure diff on `snapshot_id`), item mapper, runner (commits one playlist per transaction, persists `locked`/`error` state in meta).
- `history/` export file matching, the 30-second play rule, zip processing (`process.ts`, one file in memory at a time), the worker and the main-thread importer.
- `model/` in-memory aggregation (`buildModel`) and signals (`state.ts`).
- `ui/` one Preact component per screen plus small shared components; hash routes from `router.ts`.

## Conventions that are easy to get wrong

- **Bundler resolution.** `tsconfig.json` uses `moduleResolution: bundler`; relative imports carry **no** extension. Vite compiles JSX itself (`jsx: react-jsx`, `jsxImportSource: preact`); there is no framework plugin.
- **Tests sit next to source** as `src/**/*.test.ts`, run in Vitest's Node environment. IndexedDB tests import `fake-indexeddb/auto`. No DOM or component tests.
- **Only one setting exists**: `VITE_SPOTIFY_CLIENT_ID`, from `.env` locally and a repository secret in CI. The redirect URI is computed at runtime (`env.ts`). There is no client secret anywhere and must never be.
- **Never open `localhost`.** Spotify rejects it as a redirect URI; use `http://127.0.0.1:5173/myOwnSpotifyData/`.
- **Never sync on page load.** Spotify's unpublished daily quota on playlist reads locks accounts out for hours. Sync only from the Settings button or a playlist's own button.
- **Every failure is shown.** Errors end in a state signal that Settings or a banner renders; nothing is swallowed.

## Pinned dependencies (do not bump blindly)

- `typescript` is pinned `~6.0.3`. `typescript-eslint` 8.x supports TS `<6.1` only; TS 7 (npm `latest`) crashes `yarn lint`.
- `vite` is an explicit devDependency: Vitest declares it as a peer and yarn classic does not install peers, and the app build uses it directly.

## Style

ESLint flat config (`eslint.config.js`): `@eslint/js` recommended + `typescript-eslint` recommended + `eslint-config-prettier`. Prettier: single quotes, semicolons, ES5 trailing commas, 80 columns.
