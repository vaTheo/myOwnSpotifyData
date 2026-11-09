# Play button and Listen menu on every track list: design

> **Status**: Implemented on `task/dev-session` (2026-11-09, inventory F33)
> **Last updated**: 2026-11-09

Date: 2026-11-09. Driven with the Spec Kit skills; the specification, research, contract, quickstart and task list live under
[`specs/017-track-play-button/`](../../specs/017-track-play-button/spec.md). This page is the short record the documentation map
expects; the docs call it the play-button round (its folder number, 017, is also the worker's 0.7.1 round). No new ADR: no Spotify read, write or scope, and no stored data changes.

## What it is

The owner asked for one gesture from any track list to the track playing in Spotify, "same feature as Mix":

- **▶ first**: every track table (Top tracks, Playlist, Artist, the six Crate views) starts with the Mix tracklist's play button
  (`PlayOnSpotify`, the app's `spotify:track:<id>` link, "Play {artist} – {title} on Spotify"). A row without a Spotify id
  (a local file) shows an empty cell. On a phone ▶ is the first cell of the item's lead, before the cover or the rank.
- **Listen menu last**: the "Open in Spotify" icon at the end of a track row becomes the Mix headphones menu (Play on Spotify,
  the Spotify web page, then Beatport, Bandcamp, Discogs, SoundCloud and YouTube searches, from `digLinks`, so a platform changes
  everywhere at once). Artist and playlist lists keep their icon.
- **Overview**: a track item (Heavy rotation, Top this month) is ▶ (when Spotify knows the track), its details link and the menu,
  three siblings, never a button inside the link. On a card under 400 px the item takes two lines: the title on the first, the bars or the BPM and key pills and the value on the
  second, so nothing is hidden. A local track keeps an empty place where ▶ would be, so the links stay aligned.
- **Unchanged**: the Mix tracklist's own layout, the row click (details), the track details sheet.

## Where it lives

`src/ui/listen.ts` (`ListenTrack`, `spotifyTrackId`, `trackListenItems`), `playColumn` and `listenColumn` in
`src/ui/table/columns.tsx`, `src/ui/components/PlayOnSpotify.tsx`, the Overview's `Item` in `src/ui/overview/Overview.tsx`, and the
lead slot and Overview rules in `src/styles.css`. Contract: `specs/017-track-play-button/contracts/track-listen.md`.

## Links

- [How the app works](../architecture/000-how-it-works.md) §10, §13 · [Feature inventory](../architecture/100-features.md) F33
- [Documentation map](../README.md)
