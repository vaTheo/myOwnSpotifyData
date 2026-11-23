# Feature Specification: A short, good-looking README; the manual moves to docs/manual

**Feature Branch**: `docs/readme-short-guide`

**Created**: 2026-11-23

**Status**: Approved, to implement

**Input**: Owner (2026-11-23): "make the project description easier to read, is too verbose, I would prefer a simpler step by step
guide with compatc informations"; readers: "someone who only uses the app; someone who identifies a DJ mix with the worker";
option "A. Make it beauifull"; style "1" (text and layout only, no screenshots); "go ahead".

## Today (as found, 2026-11-23)

- `README.md` is 673 lines, ~7,400 words: a 20-line privacy intro, a Quick start for three readers (lines 24–65), then Documentation,
  Run locally, Scripts, One-time setup, Using it (screens), Identify a mix from your computer, Server, Several people, Shared BPM.
- The rules call `README.md` the owner's manual: `CLAUDE.md` reading protocol 5, `docs/dev-guide/000-contributing.md` lines 93, 98
  (a new external source goes in "README.md's first paragraph") and 129; `docs/architecture/000-how-it-works.md:6`;
  `docs/architecture/800-limits-roadmap.md:16` links a README section.

## What changes

- **FR-001** `README.md` becomes a short guide (target ≤ 100 lines) for two readers: someone who only uses the app, someone who
  identifies a DJ mix. Order:
  1. Centered header (HTML `<p align="center">`): `public/icon-192.png` (width ~96), the name, a one-line tagline, three shields.io
     badges — Open the app (→ `https://vatheo.github.io/myOwnSpotifyData/`), latest worker release (GitHub release badge filtered on
     `worker-v*` if shields supports it, else plain link badge), Docker image (→ `https://github.com/vaTheo/myOwnSpotifyData/pkgs/container/mix-worker`).
  2. One line of 4–5 features, each with one emoji.
  3. **🎧 Use the app**: 4 numbered steps, one line each (open; sign in by email link; Connect Spotify; Settings → Sync now, and the
     Extended streaming history import for play counts).
  4. **🔎 Identify a DJ mix**: *On your computer* 5 one-line steps; *On a server (Docker)* 3 steps linking to
     `worker/README.md` section D; **Good to know** 3 bullets (VPN off; the request waits while the computer is off; hard-reload the
     app before a new worker).
  5. **🔒 What leaves your browser**: 3 short bullets carrying the facts of today's intro (Spotify token never leaves; lookups send
     only ids/ISRCs to the named sources, only when started; the optional server is your own Supabase; the two Spotify writes on a tap).
  6. **📚 More**: a table linking the manual pages, the worker README, the docs map, CHANGELOG.
- **FR-002** Every other section of today's README moves **word for word** (headings shifted as needed, relative links fixed) into
  `docs/manual/`: `000-using-the-app.md` (Using it), `100-identify-a-mix.md` (Identify a mix from your computer),
  `200-owner-setup.md` (owner Quick start, One-time setup, Server, Several people, Shared BPM and key, Documentation pointer),
  `300-developers.md` (Run locally, Scripts). Each page gets the docs header/footer style of the other `docs/` pages and stays within the
  page budgets of `docs/dev-guide/000-contributing.md` "Documentation" (if a page goes over, say so; no rewrite).
- **FR-003** Rules and links: `CLAUDE.md`, `docs/dev-guide/000-contributing.md`, `docs/architecture/000-how-it-works.md:6`,
  `docs/architecture/800-limits-roadmap.md` and any other link to a moved README section point at `docs/manual/`; the owner's manual
  is `docs/manual/`, the README is the short guide; a new external source goes in `docs/manual/000-using-the-app.md`'s privacy part
  and in the README's "What leaves your browser". `docs/README.md` lists the four pages. CHANGELOG entry.
- **FR-004** Every button and screen name in the README matches the English catalogue (`src/i18n/`).

## Not changed

`worker/README.md` (full worker manual), the app, the worker. No screenshots, no image files added.

## Success criteria

- `wc -l README.md` ≤ 100; every link and anchor in the README and the four new pages resolves; no README text lost (each moved
  section found verbatim in `docs/manual/`); `yarn typecheck && yarn lint && yarn test` exit 0; public-safe check prints nothing.
