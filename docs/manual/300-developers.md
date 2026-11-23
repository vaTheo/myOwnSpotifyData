# 300 — Developers

> **Status**: Living
> **Last updated**: 2026-11-23

Running the app from the repo. The rules of work: [Contributing](../dev-guide/000-contributing.md).

## Run locally

```sh
cp .env.example .env   # set VITE_SPOTIFY_CLIENT_ID
yarn
yarn dev               # open http://127.0.0.1:5173/myOwnSpotifyData/ (not localhost)
```

## Scripts

| Command          | What it does                       |
| ---------------- | ---------------------------------- |
| `yarn dev`       | Vite dev server                    |
| `yarn build`     | Production build to `dist/`        |
| `yarn preview`   | Serve the production build locally |
| `yarn test`      | Run the Vitest suite               |
| `yarn lint`      | Lint with ESLint                   |
| `yarn typecheck` | Type-check without emitting        |
| `yarn format`    | Format with Prettier               |
| `yarn shots`     | Screenshot every page on demo data (dev only; see Contributing) |
## Links

- Owner's manual: [000 — Using the app](000-using-the-app.md) · [100 — Identify a mix](100-identify-a-mix.md) ·
  [200 — Owner setup](200-owner-setup.md) · [300 — Developers](300-developers.md)
- [README](../../README.md) · [Worker manual](../../worker/README.md) · [CHANGELOG](../../CHANGELOG.md)
- [How the app works](../architecture/000-how-it-works.md) · [Feature inventory](../architecture/100-features.md) ·
  [Limits and roadmap](../architecture/800-limits-roadmap.md)
- [Contributing](../dev-guide/000-contributing.md)
- [Documentation map](../README.md)
