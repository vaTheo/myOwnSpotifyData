# Data model: release years (all optional, no `DB_VERSION` bump)

| Where | Field | Rule |
|---|---|---|
| `TrackRow` (library) | `albumYear?: number` | `parseYear(album.release_date)` at playlist sync |
| `TopTrackItem` | `albumYear?: number` | same, at Top sync |
| `FeatureValue` (ReccoBeats) | `rid?: string` | ReccoBeats uuid from the audio-features answer |
| `FeatureRow` | `releaseYear?: { year: number \| null; checkedAt: number }` | pass 3; `null` = none, retried after 90 days |
| `TracklistRow` (mix) | `year?: number`, `yearFrom?: 'shazam' \| 'catalogue' \| 'spotify'` | from the worker JSON; Create playlist fills only undated rows |
| worker JSON `tracks[].metadata` | `release_date` (exists), `release_date_from?: "deezer" \| "musicbrainz"` | worker fill |

A year is a whole number in 1900..current year + 1 (`parseYear`), never 0. `validate.ts` accepts the new fields when valid and
drops only the invalid field (a bad year must not reject a whole row).
