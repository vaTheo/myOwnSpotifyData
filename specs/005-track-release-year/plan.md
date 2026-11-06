# Implementation Plan: The release year of every track

**Branch**: `005-track-release-year` (work on `task/general-dev`) | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

## Summary

One year per track, whatever the screen. Sets: the app reads Shazam's "Released" year the worker already sends; the worker asks
Deezer then MusicBrainz by ISRC for heard tracks Shazam did not date; Create playlist dates the rows it matches from the album of
the Spotify search answer it already gets. Library: the BPM run gains a third pass asking ReccoBeats for each found track's
albums and keeping the earliest release year; the playlist and Top syncs keep the album year they already download. Every list
of songs shows the year and gets a year sort and a decade filter. Worker 0.5.0. No migration, no `DB_VERSION` bump.

## Technical Context

**Language/Version**: worker Python 3.11–3.13; app TypeScript ~6.0.3, Preact + signals. **Primary Dependencies**: none new.
**Storage**: optional fields only (`TrackRow.albumYear`, `TopTrackItem.albumYear`, `FeatureValue.rid`, `FeatureRow.releaseYear`,
`TracklistRow.year`/`yearFrom`); they travel inside the `library`, `features` and `mixes` rows the server already stores.
**Testing**: worker `unittest`, app Vitest. **Constraints**: no Spotify call added; keyless sources by id/ISRC; one ReccoBeats
request per second (the existing `LOOKUP_INTERVAL_MS`); every failure shown. **Scale**: a library of ~5,000 tracks: the year
pass costs one call per track ReccoBeats knows (~2,500 the first run, about 45 minutes at one per second), then only new ones.

## Constitution Check

| Principle | Check | Status |
|---|---|---|
| I / ADR-08 | the server stores the year inside rows it already keeps; computes nothing | ✅ |
| II / ADR-02 | no Spotify call added: search answers and sync pages already downloaded; BPM run from Settings only | ✅ |
| III / ADR-03 | Create playlist writes unchanged; the year is saved on the local mix only | ✅ |
| IV / ADR-04, ADR-10 | ReccoBeats by its own id from the BPM answer (keyed on the Spotify id/ISRC); Deezer/MusicBrainz by ISRC; never a name | ✅ |
| V / ADR-05 | optional fields, no bump | ✅ |
| VII | year pass errors end the run in Settings' error state like BPM; worker year lookups never fail a set (log line) | ✅ |

## Project Structure

```text
worker/mix_worker/{clues.py (Lookups.release_year), pipeline.py or scan.py (fill years before send)}, tests; 0.5.0
src/db/schema.ts, src/model/year.ts (new: parseYear, yearOf, decades), src/server/validate.ts
src/features/{reccobeats.ts (rid, fetchAlbumYear, fetchTrackIds), lookup.ts (pass 3)}, src/sync/{runner.ts, items.ts}
src/features/mix/{worker.ts (resultToRows year), spotifySearch.ts + createPlaylist.ts (Spotify album year)}, src/spotify/types.ts
src/ui: components/YearView.tsx (new), FeaturePills/TrackRow year, Top, Playlist, Artist, crate/*, UnderRadar, Mix, Settings
docs: research note, how-it-works §9 §10 §17, inventory, README, CHANGELOG, worker README + RELEASE_NOTES
```

## Complexity Tracking

None.
