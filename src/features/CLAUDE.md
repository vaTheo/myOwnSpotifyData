# Rules for the acquisition layer (external sources)

Complements the root `CLAUDE.md` for changes under `src/features/`: Audio data (ReccoBeats, rekordbox), Artist reach (MusicBrainz,
ListenBrainz, Deezer, Wikidata, Wikipedia), and the `mix/` and `like/` folders (`mix/` has its own `CLAUDE.md`).

## Required inputs

| Type | File | Why |
|---|---|---|
| Decision | `../../docs/architecture/700-adr/ADR-04-keyless-sources-by-id.md` | free keyless sources, ids not names, clients never throw, resumable jobs |
| Decision | `../../docs/architecture/700-adr/ADR-02-no-spotify-reads-on-load.md` | jobs start from Settings only, never on load |
| Reference | `../../docs/architecture/000-how-it-works.md` §9, §14 | each client, the reach phases, `jobsBusy()` |
| Research | `../../docs/research/` | the verified endpoints, limits and shapes of each source |
| Spec | `../../docs/specs/2026-09-05-bpm-key-design.md`, `../../docs/specs/2026-09-05-artist-reach-design.md` | the rulings |

## Expected outputs

- A client is a pure function behind an injected `fetchFn`, returns a discriminated result, never throws, swallows nothing.
- Key on the Spotify id or ISRC. Name search is forbidden at every step.
- Pacing: MusicBrainz and Deezer sleep inside their clients; ListenBrainz and Wikipedia are paced by `reachRun.ts` between artists. The
  split is pinned by a test: never add a sleep around the first two.
- Every reach `fetch` carries `REACH_REQUEST_TIMEOUT_MS` from `../util/` (not from `reachRun.ts`: that would make a module cycle).
- A job writes as it goes, skips what is stored, and writes its meta summary on every exit path.
- A new source: a research note, the inventory's "What leaves the browser" table, `README.md`'s first paragraph.
