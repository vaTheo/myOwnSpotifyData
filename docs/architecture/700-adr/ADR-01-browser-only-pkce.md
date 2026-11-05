# ADR-01 — A browser-only static app: PKCE with a Client ID, no server, no secret

> **Status**: Accepted
> **Date**: 2026-09-04

## Context

The owner wants their own Spotify data on an Android phone, in a public repository, with zero infrastructure to run. A public repo
cannot hold a secret, and the owner's listening history must not leave the phone.

## Options considered

| Option | Description | For | Against |
|---|---|---|---|
| Server + client secret | A backend does the OAuth code exchange and stores data | any Spotify flow | infrastructure to run and pay; a secret to protect in a public repo; data leaves the phone |
| Serverless functions | A Worker holds the secret and proxies | no server to run | still a secret, a second deploy, a second setting |
| Browser-only, PKCE *(chosen)* | A static Vite build on GitHub Pages; PKCE with the Client ID; IndexedDB for data | zero infrastructure; nothing secret; data stays local | every limit of the public-client flow; no background jobs |

## Decision

The app is a static site on GitHub Pages (`https://vatheo.github.io/myOwnSpotifyData/`), hash-routed because Pages has no SPA fallback.
Login is PKCE with the Client ID only (`VITE_SPOTIFY_CLIENT_ID`, the only setting, from `.env` locally and a repository secret in CI).
The redirect URI is computed at runtime (`src/env.ts`). There is no client secret anywhere, and there must never be. Data lives in
IndexedDB; a token and the listening history never leave the browser.

## Consequences

**Positive:** nothing to host or pay; nothing to leak; the owner's data stays on the phone.

**Negative / watch for:** `localhost` is rejected as a redirect URI, so dev runs on `http://127.0.0.1:5173/myOwnSpotifyData/`; both
redirect URIs must be registered in the Spotify dashboard; the owner must be in User Management with Premium (Development Mode); any
feature needing a secret or a server is out of scope.

## Links

- Spec: [the app](../../specs/2026-09-04-spotify-dj-webapp-design.md) §2
- Research: [Spotify platform](../../research/2026-09-04-spotify-platform-research.md)
- [How the app works](../000-how-it-works.md) §1, §3
- [ADR index](README.md)
- [Limits and roadmap](../800-limits-roadmap.md)
- [Contributing](../../dev-guide/000-contributing.md)
