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
| Spec | `../../../specs/003-web-first-redesign/spec.md` (clarifications), `../../../specs/003-web-first-redesign/contracts/screens.md` §12 | the review (Check on Spotify, Remove), the owner's D1 and D6 rulings, the Mixes list and queue; `../../../specs/010-mix-table-simplify/spec.md` removed Validate (every track kept) |
| Reference | `../../../docs/architecture/000-how-it-works.md` §4, §10, §14 | the shared quota lock-out, one Spotify reader at a time, the review files |

## Expected outputs

- `pickMatch` never returns a wrong track: a "not found" is always better. Artist identity is equality on a leading run, never containment;
  a title is equal or the row's title plus a version tail. A new rule comes with accepted **and** refused test cases.
- The TrackId guard stays: `result.rowCount === 1` **and** URL equality with `normalizeMixUrl`'s output.
- Round 016 (`worker.ts`): rows with `origin: 'trackid'` come from the worker, are never edited by the app, and `stepName('trackid')` is "TrackId.net"; the worker's TrackId.net lookup is by the exact mix link (ADR-17), distinct from this folder's `trackid.ts`.
- Fetches stay behind an injected `fetchFn`, return a discriminated result, never throw; `lookupMix` keeps one layer's failure from hiding
  the other's rows.
- Spec 018 (`oneRowPerSong.ts`): a worker result and a hand-imported Tracklistify JSON hold one row per song (earliest time, `hits`
  summed, best `confidence`); it runs on the incoming rows only, never on rows already in a mix, and never inside
  `parseTracklistifyJson` (the worker's extras line up with its rows by index). A heard copy outranks a not-heard one (`origin`
  `clue` or `trackid`): never a clip count on a not-heard row.
- Library matches are computed at render time, never stored.
- The mix and create jobs are not in `jobsBusy()` and never call `loadFromDb()`; failures show inline on the Mix screen, never as a banner.
- The app never fetches or analyses mix audio; the worker on the owner's computer does (ADR-08, `specs/002-mix-analysis-worker/`).
- D1 (`keepReview.ts`, `mergeKeepingReview`): a later worker result keeps the owner's review: Spotify answers and removed tracks
  stay; a removed scan track never comes back. It still reads `validated` for old saved rows only; nothing sets it any more
  (spec 010). `removed` is capped at the last 500 (`REMOVED_MAX`).
- D6 (`createPlaylist.ts`, `tracksToAdd`): Create playlist adds every identified track still in the list (spec 010: no Validated only
  / All tracks choice, `validated` never read); Delete is the only way to leave one out; filter chips and the Sort never change what is
  added.
- Check on Spotify (`spotifyCheck.ts`) reads Spotify on a tap, or by itself when a saved mix opens (`autoCheckDue`, ADR-13: switch on, no lock-out, no other reader, once per mix per session; never in the demo), never on load; it is not in `jobsBusy()`. Its answers are
  saved with the mix (the saved copy when the mix was closed), and Create playlist reuses a found track instead of searching again and
  keeps answers already stored when it saves (`keepStoredAnswers`).
- Round 011 (`spotifyLink.ts`): a Spotify link the owner pastes is stored by its id (`spotify: {id, url}`, `spotifyBy: 'owner'`), never
  verified on Spotify and never looked up by name (ADR-02, ADR-04); only track links parse, refused cases tested beside accepted ones.
  `rowsToCheck` skips a hand-linked row and `applyAnswers` never overwrites it; `keepStoredAnswers` keeps it; `mergeKeepingReview` carries
  `spotifyBy` and keeps an unmatched hand-linked scan row like a validated one; a rename drops `spotifyBy` with `spotify`.
- One quota lock-out for every Spotify reader (`src/spotify/quotaLock.ts`), and one reader at a time: sync, Check on Spotify, Create
  playlist and Like all songs refuse to start while another runs (`busyRefusal`), said inline on the refused button.
- Spec 024 (`model/state.ts`): a row change of a saved mix (Delete, an Edit's Save, Link, Remove link) saves it at once through
  `saveMix` (chained, so the last change is stored last); a new row-changing action joins `saveIfSaved`. A pull switches the open mix
  to a newer stored copy (`followNewerSavedMix`) only when the screen holds no change of its own; a Check answer is not one.
