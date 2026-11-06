# Feature Specification: The release year of every track

**Feature Branch**: `005-track-release-year`

**Created**: 2026-11-07

**Status**: Draft

**Input**: Owner, 2026-11-07: "New features I would like that you fetch the year of release of each track when you search for
tracks." Picks: source = **Shazam + Spotify + catalogues**; on the Mix screen **sort by year** and **filter by decade**. Then:
"and it also must be added for the songs fetched from my Spotify playlists and listens"; "Can't you fetch those info with the
BPM audio data?" → pick **with the BPM job**; screens: "on every song that is displayed".

What is already there: Shazam answers a four-digit "Released" year for 402 of the 505 tracks of the ten sets saved on 2026-11-06
(80 %); the worker writes it into the set's JSON (`metadata.release_date`) and the app drops it. The catalogues the worker already
asks for clues (Deezer, MusicBrainz) know a release date for most ISRCs; Create playlist already runs one Spotify search per row,
and its answer carries the album's release date. ReccoBeats, the keyless source the BPM and key run already asks by Spotify id
or ISRC, lists every album a track appears on with its release date (probed 2026-11-07: *Stairway to Heaven* → the 1971 albums
and the 2007 compilations), so the earliest is the original release; it costs one more call per track and covers the tracks the
BPM run finds (45–62 % in the 2026-09-05 research).

## Constitution notice

- **Principle III / ADR-02, ADR-03**: no new Spotify call. The year from Spotify is read from the answer of the search Create
  playlist already makes, on the owner's tap; nothing reads Spotify on load.
- **ADR-04 / ADR-10**: the catalogue lookups are keyed on the ISRC Shazam returned, and the library's on the Spotify id or ISRC
  the BPM run already sends ReccoBeats, never on a name; the library's lookups run only inside the BPM run started from Settings,
  paced, resumable, and pinned by its pacing test.
- **ADR-02**: the library's years never cost a Spotify call: ReccoBeats inside the BPM run, plus the album date the playlist and
  Top syncs already download (on the owner's tap).
- **Principle I / ADR-08**: the server stores the year with the saved mix (inside the row it already keeps); no migration.
- **ADR-05**: the year is an optional field on a row; no `DB_VERSION` bump.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Each track of a scanned set knows its release year (Priority: P1)

When the worker sends a set, every heard track carries its release year: Shazam's when it gave one, otherwise the year the
catalogues give for its ISRC. The Mix screen shows it on the row ("1993"). A track no source dates has no year, shown as nothing,
never as 0.

**Why this priority**: sorting and filtering need the year; this is where 80 % comes for free.

**Independent Test**: scan a set; open it on the phone; the rows Shazam dated show their year; a row with an ISRC Shazam did not
date shows the catalogue's year; a row with neither shows no year.

**Acceptance Scenarios**:

1. **Given** Shazam answered "Released 1993" for a track, **When** the set arrives, **Then** its row shows 1993 and no catalogue
   is asked for it.
2. **Given** Shazam gave an ISRC but no year, **When** the worker finishes the scan, **Then** it asks the catalogues by that ISRC
   and the row gets the earliest year they give.
3. **Given** no year from any source, **When** shown, **Then** the row has no year and sorts after the dated rows.
4. **Given** a catalogue does not answer or refuses, **When** the set is sent, **Then** the set is sent anyway, without that year
   (one log line), and never fails because of the year.
5. **Given** a saved mix from before this round, **When** opened, **Then** its rows show the year when the stored JSON had one
   (a set fetched again) and nothing otherwise.

---

### User Story 2 - Sort the set by year and keep one decade (Priority: P1)

Beside the current sorts (time in the set, clips heard, best score) the owner can sort by **year** (oldest first) and show only one
**decade** (the 80s, 90s, 2000s… among the decades present in the set). Hidden rows are not deleted; Create playlist still uses
the whole working list unless rows were deleted.

**Why this priority**: it is what the owner asked for to prepare a set.

**Independent Test**: on a set with tracks from 1987, 1993, 1996 and 2019 and one undated, sort by year: 1987, 1993, 1996, 2019,
then the undated one; choose "90s": only 1993 and 1996 remain; clear the filter: all five.

**Acceptance Scenarios**:

1. **Given** the year sort, **When** two rows share a year, **Then** they keep their order in the set.
2. **Given** the decade filter, **When** the set has no track of a decade, **Then** that decade is not offered.
3. **Given** a filter that hides rows, **When** the owner taps Create playlist, **Then** the playlist holds the full list, as it
   does with the "heard once" view (round 004).
4. **Given** the decade filter and the "heard once" view together, **Then** only rows matching both show.

---

### User Story 3 - Create playlist fills the years still missing (Priority: P2)

When Create playlist searches Spotify for each row, a row that had no year and is matched takes the year of the matched track's
album, and keeps it in the saved mix. This also dates the rows from a comment or the description, which the worker never heard.

**Why this priority**: it closes most of the remaining gap at no extra Spotify cost, but only after Create playlist.

**Independent Test**: a set with an undated clue row; tap Create playlist; once done, the row shows the album's year; a row that
already had Shazam's year keeps it.

**Acceptance Scenarios**:

1. **Given** a row with a year already, **When** Create playlist matches it, **Then** its year does not change.
2. **Given** a row Create playlist does not match, **Then** it stays without a year.
3. **Given** Create playlist fails part-way, **Then** the years learned before the failure are kept.

---

### User Story 4 - Every track of the library knows its release year (Priority: P1)

The BPM and key run in Settings also gives each track of the owner's playlists, listens and Top lists its **original release
year**: the earliest release date ReccoBeats lists among the albums the track is on. A track ReccoBeats does not know takes the
year of its album when the playlist or Top sync downloads it (no extra call). Like the BPM, the years survive a reload, the run
resumes where it stopped, and only tracks without a year are asked again.

**Why this priority**: the owner prepares sets from the library more than from scanned sets.

**Independent Test**: run the BPM run on a library; a track on a 1971 album and a 2007 compilation shows 1971; a track
ReccoBeats does not know but that is in a synced playlist shows its album's year; a track in neither shows nothing.

**Acceptance Scenarios**:

1. **Given** the BPM run, **When** it reaches a track with no year, **Then** it asks for its albums and keeps the earliest valid
   year; a track with a year is not asked again.
2. **Given** the run stopped (app closed, offline, ReccoBeats busy), **When** started again, **Then** it continues with the
   tracks still without a year.
3. **Given** ReccoBeats refuses or does not answer, **Then** the run behaves as it does for BPM today (waits, then stops with a
   message in Settings) and the years already found are kept.
4. **Given** a year from ReccoBeats and another from a playlist sync, **Then** ReccoBeats' (the earliest release) wins.
5. **Given** Settings, **Then** the run's line counts the years found ("years: 3,120 of 4,980").

---

### User Story 5 - The year on every song shown, sortable and filterable (Priority: P1)

Every screen that lists songs (Top and most played, a playlist ranked by plays, Crate, Match, Under the radar's tracks, a mix)
shows the year of a dated song, and offers a **year sort** and a **decade filter** beside its current controls.

**Why this priority**: the owner asked for it "on every song that is displayed".

**Independent Test**: on each of those screens, a dated song shows its year; sort by year puts the oldest first and the undated
last; choosing "90s" keeps only songs from 1990 to 1999; clearing the filter restores the list.

**Acceptance Scenarios**:

1. **Given** a screen whose songs are all undated, **Then** the year sort and the decade filter are not offered.
2. **Given** a decade filter on a screen, **When** the owner changes screen and comes back, **Then** the filter is kept the same
   way the screen keeps its other controls.
3. **Given** the Crate's existing BPM and key filters, **When** a decade filter is added, **Then** only songs matching all show.

### Edge Cases

- Shazam or a catalogue gives a full date ("1993-05-17") or a year only ("1993"): only the year is kept.
- A year outside 1900 to the current year + 1 is ignored (catalogues sometimes hold "0000" or a typo).
- The year is the release Shazam or Spotify matched, which can be a reissue or a compilation: shown as given; the catalogues'
  earliest year is used only when Shazam gave none.
- The owner edits a row's artist or title: the year stays until a new search matches another track.
- A set with no dated track: the year sort and the decade filter are not offered.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST read the year the worker already sends for each heard track and keep it on the row of the saved mix.
- **FR-002**: For a heard track with an ISRC and no year, the worker MUST ask the catalogues by ISRC (Deezer, then MusicBrainz)
  and send the earliest valid year found; never by name.
- **FR-003**: The year lookups MUST respect the catalogues' existing pace and lookup cap, and MUST NOT delay or fail the sending
  of a set: a failure leaves the year out.
- **FR-004**: A year MUST be a whole year between 1900 and the current year + 1; anything else is dropped.
- **FR-005**: The Mix screen MUST show the year on each dated row and nothing on an undated row (never 0, never "unknown").
- **FR-006**: The Mix screen MUST offer a year sort (oldest first, undated last, ties in set order) when at least one row is dated.
- **FR-007**: The Mix screen MUST offer a decade filter listing only the decades present; it combines with the existing views and
  never deletes rows.
- **FR-008**: Create playlist MUST give an undated, matched row the year of the matched Spotify track's album, from the search it
  already makes, and save it; a dated row keeps its year.
- **FR-009**: The year MUST sync with the saved mix to the owner's other devices like every other row field.
- **FR-010**: Saved mixes and set files from before this round MUST open unchanged.
- **FR-011**: The BPM and key run MUST also look up the original release year (earliest album release date) of each library
  track without one, from the same keyless source, by Spotify id or ISRC, within its existing pacing, resume and error handling.
- **FR-012**: The playlist and Top syncs MUST keep the album's release year of each track they already download, with no new
  call; it is used only when the BPM run found none.
- **FR-013**: Every screen that lists songs MUST show the year of a dated song and offer the year sort and the decade filter,
  combined with its existing controls; undated songs show no year.
- **FR-014**: The library's years MUST be kept on the device across reloads and sync to the owner's server with the data they
  belong to, like the BPM values.

### Key Entities

- **Track year**: on each row of a saved mix; a whole year or absent; where it came from (Shazam, a catalogue, Spotify) is kept
  for provenance, not shown on the row.

## Success Criteria *(mandatory)*

- **SC-001**: After a scan, at least 80 % of the heard tracks show a year (Shazam alone gave 80 % on the 2026-11-06 sets), and
  more once the catalogues answer.
- **SC-002**: After Create playlist, at least 90 % of the matched rows show a year.
- **SC-003**: Sorting a 60-track set by year or keeping one decade takes one tap and no network.
- **SC-004**: No set fails or arrives later than one minute because of the year lookups.
- **SC-005**: No undated row ever shows 0 or a placeholder year.
- **SC-006**: After one BPM run, at least half of the library's tracks show a year, and a playlist synced since shows a year on
  at least 90 % of its tracks.
- **SC-007**: The year adds no Spotify call anywhere.

## Assumptions

- The year is shown on the row, small, beside the label: sorting by year needs it visible (the owner picked sort and filter).
- The catalogue lookups share round 003's lookup cap (100 per set) and pace; year lookups come after the clue lookups.
- Spotify's album date is "YYYY", "YYYY-MM" or "YYYY-MM-DD"; only the year is used.
- Years are not looked up again for sets saved before this round; fetching a set again gets them.
- The year lookup roughly doubles the BPM run's time on its first pass (one album call per track found); later runs ask only
  new tracks. It runs after the BPM lookup of the same tracks, in the same run, not as a separate button.
- A playlist synced before this round gets album years only when it changes or is synced again; the BPM run covers the rest.
- Under the radar lists artists; its year applies where it shows songs.
