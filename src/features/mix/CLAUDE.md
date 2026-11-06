# Rules for the Mix screen's logic

Complements `../CLAUDE.md` for changes under `src/features/mix/`: the tracklist lookup (oEmbed, TrackId.net, paste grammar, Tracklistify
import), library matching, Create playlist from mix, and dig links.

## Required inputs

| Type | File | Why |
|---|---|---|
| Reference | `../../../docs/architecture/000-how-it-works.md` §10 | every file here, and the full `pickMatch` accept rule |
| Decision | `../../../docs/architecture/700-adr/ADR-03-library-writes-on-tap.md` | the playlist write: tap only, scope gate, POST never retried |
| Spec | `../../../docs/specs/2026-09-06-mix-tracklist-design.md`, `../../../docs/specs/2026-09-06-mix-playlist-design.md`, `../../../docs/specs/2026-09-28-tracklistify-import-design.md` | the rulings and the out-of-scope lists |
| Tests | `spotifySearch.test.ts` | every accepted and refused match; add a case for each new rule |
| Contract | `../../../specs/002-mix-analysis-worker/contracts/client-api.md` | the identify request, `worker.ts` (merge rule, result rows, request wording) |

## Expected outputs

- `pickMatch` never returns a wrong track: a "not found" is always better. Artist identity is equality on a leading run, never containment;
  a title is equal or the row's title plus a version tail. A new rule comes with accepted **and** refused test cases.
- The TrackId guard stays: `result.rowCount === 1` **and** URL equality with `normalizeMixUrl`'s output.
- Fetches stay behind an injected `fetchFn`, return a discriminated result, never throw; `lookupMix` keeps one layer's failure from hiding
  the other's rows.
- Library matches are computed at render time, never stored.
- The mix and create jobs are not in `jobsBusy()` and never call `loadFromDb()`; failures show inline on the Mix screen, never as a banner.
- The app never fetches or analyses mix audio; the worker on the owner's computer does (ADR-08, `specs/002-mix-analysis-worker/`).
