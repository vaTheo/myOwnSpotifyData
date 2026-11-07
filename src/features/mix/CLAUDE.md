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
| Spec | `../../../specs/003-web-first-redesign/spec.md` (clarifications), `../../../specs/003-web-first-redesign/contracts/screens.md` §12 | the review (Check on Spotify, Validate, Remove), the owner's D1 and D6 rulings, the Mixes list and queue |
| Reference | `../../../docs/architecture/000-how-it-works.md` §4, §10, §14 | the shared quota lock-out, one Spotify reader at a time, the review files |

## Expected outputs

- `pickMatch` never returns a wrong track: a "not found" is always better. Artist identity is equality on a leading run, never containment;
  a title is equal or the row's title plus a version tail. A new rule comes with accepted **and** refused test cases.
- The TrackId guard stays: `result.rowCount === 1` **and** URL equality with `normalizeMixUrl`'s output.
- Fetches stay behind an injected `fetchFn`, return a discriminated result, never throw; `lookupMix` keeps one layer's failure from hiding
  the other's rows.
- Library matches are computed at render time, never stored.
- The mix and create jobs are not in `jobsBusy()` and never call `loadFromDb()`; failures show inline on the Mix screen, never as a banner.
- The app never fetches or analyses mix audio; the worker on the owner's computer does (ADR-08, `specs/002-mix-analysis-worker/`).
- D1 (`keepReview.ts`, `mergeKeepingReview`): a later worker result keeps the owner's review: validated rows, Spotify answers and
  removed tracks stay; a removed scan track never comes back. `removed` is capped at the last 500 (`REMOVED_MAX`).
- D6 (`createPlaylist.ts`, `tracksToAdd`): Create playlist adds **Validated only** (the default once a track is validated) or **All
  tracks**; filter chips and the Sort never change what is added.
- Check on Spotify (`spotifyCheck.ts`) reads Spotify on a tap, or by itself when a saved mix opens (`autoCheckDue`, ADR-13: switch on, no lock-out, no other reader, once per mix per session; never in the demo), never on load; it is not in `jobsBusy()`. Its answers are
  saved with the mix (the saved copy when the mix was closed), and Create playlist reuses a found track instead of searching again and
  keeps answers already stored when it saves (`keepStoredAnswers`).
- One quota lock-out for every Spotify reader (`src/spotify/quotaLock.ts`), and one reader at a time: sync, Check on Spotify, Create
  playlist and Like all songs refuse to start while another runs (`busyRefusal`), said inline on the refused button.
