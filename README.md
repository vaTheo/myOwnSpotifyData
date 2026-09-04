# myOwnSpotifyData

Fetch and explore my own Spotify data in TypeScript.

## Setup

```sh
cp .env.example .env   # fill in your Spotify app credentials
yarn
```

## Scripts

| Command          | What it does                          |
| ---------------- | ------------------------------------- |
| `yarn dev`       | Run `src/index.ts` with `.env` loaded |
| `yarn test`      | Run the Vitest suite                  |
| `yarn lint`      | Lint with ESLint                      |
| `yarn typecheck` | Type-check without emitting           |
| `yarn build`     | Compile to `dist/`                    |
| `yarn format`    | Format with Prettier                  |

CI runs typecheck, lint and tests on every push to `main` and every pull request.
