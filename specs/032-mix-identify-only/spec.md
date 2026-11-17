# Feature Specification: Mix keeps only Identify on my computer

**Feature Branch**: `feat/mix-identify-only`

**Created**: 2026-11-16

**Status**: Approved (owner 2026-11-16: "yes full removal")

**Input**: Owner (2026-11-16): on the Mix page, remove the Look up feature and leave only Identify on my computer.

## Today (as found, 2026-11-16)

- The link field of the Mix screen had two actions: **Look up** (the browser reads SoundCloud oEmbed and TrackId.net) and
  **Identify on my computer** (the worker, F15).
- Look up gave a draft with holes (F12). The worker gives the full scan, and since worker 0.7.0 it asks TrackId.net itself by
  the exact mix link (ADR-17) and reads the description and comments as clues (round 003).

## What changes

- **Removed from the screen**: Look up, Looking up…, Look up again (link field and open mix's header), Replace with the
  description tracklist, the phone-share-link note, the "TrackId.net could not be reached" and "The mix page could not be
  read" lines, the not-a-SoundCloud-link error, the "Looking up mix" entry of the Activity button.
- **Removed from the code**: `startMixLookup`, `applyDescriptionTracklist`, `lookupMix`, the app's TrackId.net reader
  (`trackid.ts`), the oEmbed read, the short-link reconstruction (`permalinkCandidates`), `parseDescription`, the `looking`
  and `error` arms of `MixState`, and their English and French texts. `lookup.ts` is now `rowEdit.ts` (the row edit rule),
  `oembed.ts` is now `player.ts` (the player address built from the link).
- **Removed hosts**: `https://soundcloud.com` and `https://trackid.net` leave `connect-src` in `index.html`. The player's
  `frame-src https://w.soundcloud.com` stays.
- **Two `confirm()` questions removed**: "Looking up again replaces the current tracklist, including your edits. Continue?"
  and "Replace your edited tracklist with the one from the description?".
- **Enter** in the link field asks the computer, as the button does.
- **Phone order**: link field, Identify on my computer, the open mix, JSON import, Mixes list, worker help (Identify moved
  up beside its field).

## What stays

- The link field, Identify on my computer and its request states, the Mixes list, the Tracklistify JSON import, the worker
  help, Paste a tracklist on an open mix, Check on Spotify, Create playlist, every row action.
- A mix saved by the old Look up still opens, with its player and its "From TrackId.net" or "From the mix description" line.
  The stored shape of a mix does not change: no `DB_VERSION` bump, no server change.

## Consequences

- A link nobody identified shows nothing until the computer answers: there is no instant draft any more.
- `yarn invariants` reports, against `main`, the two removed `confirm()` texts and the unit tests of the removed code
  (71 names: `lookupMix`, the TrackId.net and oEmbed readers, the short-link reconstruction, `parseDescription`): expected,
  until this is on `main`. The four renamed tests are in its `RENAMED_TESTS`.
- Regression rows F12d, F12e, C09 and C11 are removed (`specs/003-web-first-redesign/regression.md`).

## Checks

`yarn typecheck`, `yarn lint`, `yarn test`, `yarn regression`.
