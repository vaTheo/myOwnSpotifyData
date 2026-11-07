# Feature Specification: Rarely played tracks in my playlists

**Feature Branch**: `007-rarely-played-tracks`

**Created**: 2026-11-07

**Status**: Draft

**Input**: User description: "A way to find songs in my playlists that I have never listened to, or listened to only 1, 2 or 3 times."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - List the songs I never or barely played (Priority: P1)

As a DJ with large playlists, I want to see the songs in my playlists that I have played 0, 1, 2 or 3 times, so that I can find the
tracks I collected and forgot to listen to.

**Why this priority**: this is the whole request; everything else refines it.

**Independent Test**: with a listening history imported, open the view, pick "Never", and check that every row is a playlist song
with no play in the history; repeat for 1, 2 and 3 plays.

**Acceptance Scenarios**:

1. **Given** a library with playlists and an imported listening history, **When** I open the view and choose "Never played", **Then**
   I see each playlist song with zero plays, once per song, with the playlist(s) it is in.
2. **Given** the same library, **When** I choose "1 play", "2 plays" or "3 plays", **Then** I see only songs with exactly that many plays.
3. **Given** I choose several counts at once (for example 0 and 1), **When** the list shows, **Then** it holds the songs matching any
   of them, and each row shows its play count.
4. **Given** a song is in three playlists, **When** it matches, **Then** it appears once and names all three playlists.

---

### User Story 2 - Narrow to one playlist (Priority: P2)

As a DJ preparing a set from one playlist, I want to limit the list to that playlist, so that I only see its unplayed songs.

**Why this priority**: useful once the global list works; the playlist screen is where the owner already prepares sets.

**Independent Test**: choose one playlist and check that every row belongs to it.

**Acceptance Scenarios**:

1. **Given** the list is showing, **When** I pick a playlist, **Then** only its songs that match the chosen counts remain.
2. **Given** a playlist with no match, **When** I pick it, **Then** I see a clear "nothing to listen to here" message, not a blank page.

---

### User Story 3 - Work with the list like any other song table (Priority: P3)

As a DJ, I want to sort and filter these songs like the other song tables (BPM, key, release year, artist), so that I can pick
what to listen to next.

**Why this priority**: it reuses habits the owner already has and turns the list into a listening queue.

**Independent Test**: sort the list by BPM, then by release year; filter by decade; open a song's details.

**Acceptance Scenarios**:

1. **Given** the list is showing, **When** I sort or filter, **Then** it behaves as in the other song tables.
2. **Given** a row, **When** I open it, **Then** I see the same track details as elsewhere, including the play count.

---

### Edge Cases

- No listening history imported: play counts do not exist, so the view MUST say so and point to the import. It MUST NOT show every
  song as "never played".
- The history was imported long ago: songs played since are counted as unplayed. The view MUST show the date of the last import.
- A song played on a different Spotify version of the track (same song, other album or re-release): counted as the history counts
  it today; no extra matching is attempted.
- A playlist song with no history row at all is "never played"; a song that is in the history but not in a playlist is not listed.
- Local files or unavailable songs in a playlist: shown only when they carry a play count of their own, otherwise left out.
- Very large libraries (20,000+ songs): the list stays usable (scrolling, sorting).
- Empty result for a chosen count: a clear empty message naming the count.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The owner MUST be able to open a list of songs that are in at least one of their playlists.
- **FR-002**: The list MUST be limited by play count: 0 ("never played"), 1, 2 or 3 plays, any combination, from the listening history.
- **FR-003**: Each song MUST appear once, with its play count and the names of the playlists it is in.
- **FR-004**: The owner MUST be able to limit the list to one playlist.
- **FR-005**: The list MUST support the sorting and filtering the other song tables offer (title, artist, BPM, key, release year, decade).
- **FR-006**: Without an imported listening history, the view MUST explain that play counts need the import and MUST NOT list
  songs as never played.
- **FR-007**: The view MUST show how recent the play counts are (the date of the last history import).
- **FR-008**: The view MUST work from data already on the device; opening it MUST NOT read Spotify.
- **FR-009**: The result MUST show the number of songs matching, and a clear message when there are none.
- **FR-010**: Nothing in this feature changes the owner's Spotify library or playlists.

### Key Entities *(include if feature involves data)*

- **Play count**: how many times a song was played, taken from the imported listening history; zero when the song has no history.
- **Playlist song**: a song in one or more of the owner's playlists, with the playlists it belongs to.
- **Rarity filter**: the chosen set of play counts (any of 0, 1, 2, 3) and an optional playlist.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The owner can go from opening the app to a list of never-played playlist songs in 3 taps or clicks or fewer.
- **SC-002**: For a library of 20,000 songs, the list shows or updates within 1 second of choosing a count.
- **SC-003**: On a test library, 100% of listed songs have a play count in the chosen set, and 100% of playlist songs with such a
  count are listed.
- **SC-004**: With no history imported, 0 songs are labelled "never played" and the owner sees how to import one.

## Assumptions

- The owner uses the app's existing listening-history import as the only source of play counts; Spotify's own play counts are not available.
- "My playlists" means every playlist already synced into the app, including ones the owner follows; the playlist filter narrows it.
- Play counts are for all time, not a period.
- Counts are exact (0, 1, 2, 3), and the owner may combine them; "3 or fewer" is the combination of all four.
- The view is a sixth Crate view, "Rarely played", in Listening · Crate (`#/crate/rarely-played`), next to Heavy rotation and Forgotten
  gems (owner's pick, option A). It reuses the Crate's history-import gate, empty state, song table and Filters. A Playlist-screen
  filter is out of scope.
- Layout: a count line with the last import date, play-count chips (Never, 1, 2, 3), a playlist menu, then the song table with a
  Plays and a Playlists column.
- The Spotify sync and the history import are unchanged; this feature only reads what they already stored.
