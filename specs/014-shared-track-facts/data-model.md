# Data model: Shared track facts

No IndexedDB change (no `DB_VERSION` bump). A store hit is stored as an ordinary `reccobeats` value (tracks) or `artistReach` row (artists). Two new server tables; neither has a user column, `owner_id` or any link to a library.

## `public.shared_track_facts` (migration 0004)

| Column | Type | Rule |
|---|---|---|
| `track_id` | text, primary key | `~ '^[0-9A-Za-z]{22}$'` |
| `bpm` | real, null | `between 30 and 300` |
| `key` | smallint, null | `between 0 and 11` (pitch class, C = 0) |
| `major` | boolean, null | not null only when `key` is not null |
| `source` | text, default `'reccobeats'` | `in ('reccobeats')` |
| `added_at` | timestamptz, default `now()` | server-set, never trusted from the client |

Table check: `bpm is not null or key is not null`.

## `public.shared_artist_reach` (migration 0004, second step)

| Column | Type | Rule |
|---|---|---|
| `artist_id` | text | `~ '^[0-9A-Za-z]{22}$'` |
| `source` | text | `in ('listenbrainz', 'deezer')` |
| `measured_on` | date | `between current_date - 7 and current_date + 1` |
| `value` | bigint | `between 0 and 10000000000` (listeners for ListenBrainz, fans for Deezer; never null: a missing number is not stored) |
| `added_at` | timestamptz, default `now()` | |

Primary key `(artist_id, source, measured_on)`. A newer measurement is a new row; reads return the newest per (artist, source).

## Client shapes (`src/features/shared.ts`, types only)

- `SharedTrackFact { trackId; bpm: number | null; key: number | null; major: boolean | null }`
- `SharedReachFact { artistId; source: 'listenbrainz' | 'deezer'; value: number; measuredAt: number }` (`measuredAt` epoch ms at 00:00 UTC of `measured_on` when read)
- `SharedRunNote { fromStore: number; sent: number; error: string | null }`, on `LookupState` (`done`) and `ReachState` (`done`), optional so older code paths and tests compile unchanged.

## Mapping into existing rows

| From the store | Written as |
|---|---|
| track fact | `FeatureRow.reccobeats = { bpm, key, major, energy: null, fetchedAt: now }` (no `rid`); `rekordbox`, `releaseYear` and `isrc` of the row kept as they are |
| reach fact | `ArtistReachRow { key: reachKey(id, source), status: 'ok', value, fetchedAt: measuredAt, retryAfter: null, sourceUrl }` |

Validation of anything read back (`validate.ts`, untrusted input like every pulled row): id shape and membership in the asked set, `bpm` finite in range, `key` integer 0..11, `major` boolean or null, `value` a safe non-negative integer, `measured_on` a date not in the future; a failing row is dropped and counted, never fixed up.
