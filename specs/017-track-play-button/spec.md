# Feature Specification: Play button and Listen menu on every track list

**Feature Branch**: `task/dev-session`

**Created**: 2026-11-09

**Status**: Draft

**Input**: User description: "In every place where there is a track listed you must put an onclick to open it in Spotify on the line of the track." Refined by the owner: "I want same feature as mix, so a column with the play button, you can put it at the first column." Then, on the end-of-row Spotify icon: "A but you can replace it with the icon with headset and put all type of opening inside, like mix section."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Play a track from any list (Priority: P1)

The owner looks at any list of tracks in the app (Top tracks, a playlist, an artist's tracks, a Crate view, the Overview). Each track row starts with a play button, the same one the Mix tracklist already has. One tap on it opens that track in the Spotify app, ready to play, without leaving the list or opening the details panel.

**Why this priority**: It is the whole request: one gesture from any track list to the track playing in Spotify.

**Independent Test**: Open Top tracks on the demo data, press the play button of the third row; the Spotify app opens on that track and the app's list stays where it was, with no details panel open.

**Acceptance Scenarios**:

1. **Given** a track list with a track Spotify knows, **When** the owner presses the play button of its row, **Then** the Spotify app opens on that track.
2. **Given** a track row, **When** the owner presses its play button, **Then** the row's other click (details panel or link) does not also run.
3. **Given** a track row, **When** the owner clicks anywhere else on the row, **Then** the row does what it does today (details panel).
4. **Given** the Mix tracklist, **When** the owner compares it with another track list, **Then** the play button looks and behaves the same (same icon, same name read aloud, opens the app the same way).

---

### User Story 2 - Same button on computer and on phone (Priority: P1)

The owner uses the app in a computer browser and on an Android phone. The play button is there on both, first on the row, and large enough to tap.

**Why this priority**: The owner uses both every week; a button missing on the phone layout breaks the habit.

**Independent Test**: Open the same list at desktop width and at phone width; on both the play button is the first control of each row and opens the track.

**Acceptance Scenarios**:

1. **Given** a wide window, **When** a track list is shown, **Then** the play button is the first column of the table, before the rank.
2. **Given** a phone-width window, **When** a track list is shown as compact items, **Then** the play button is the first control of each item and keeps a 48 px touch target.
3. **Given** keyboard use, **When** the owner tabs into a row, **Then** the play button can be reached and pressed with Enter or Space, and it is read aloud as "Play {artist} – {title} on Spotify".

---

### User Story 3 - Rows Spotify cannot open (Priority: P2)

Some rows have no Spotify track: local files from the owner's library, rows of the history that never matched a Spotify id. Those rows keep their place in the list but show no play button, so a button never leads nowhere.

**Why this priority**: Rare rows, but a dead button would erode trust in all the others.

**Independent Test**: On the demo data, find a local-file track; its row shows an empty first cell and the rest of the row is unchanged.

**Acceptance Scenarios**:

1. **Given** a row without a Spotify track id, **When** the list is shown, **Then** the first cell is empty and the columns stay aligned with the other rows.

---

### User Story 4 - Every way to open a track, in one menu (Priority: P2)

At the end of each track row, the small "Open in Spotify" icon is replaced by the headphones menu the Mix tracklist already has. It holds every way to open the track: Play on Spotify (the app), the Spotify web page, then searches on Beatport, Bandcamp, Discogs, SoundCloud and YouTube.

**Why this priority**: The owner digs for a track on several platforms when preparing a set; one menu per row saves typing the name each time.

**Independent Test**: Open a playlist on the demo data, open the headphones menu of a row; it lists Play on Spotify, Open Spotify web page, Beatport, Bandcamp, Discogs, SoundCloud and YouTube, and each opens the right place for that track.

**Acceptance Scenarios**:

1. **Given** a track row, **When** the owner opens its headphones menu, **Then** it lists the Spotify links first (when the track has a Spotify id), then the five platform searches for that artist and title.
2. **Given** a track row, **When** the owner picks a platform search, **Then** a new tab opens on that platform's search for "{artist} {title}".
3. **Given** a track row, **When** the owner looks at the end of the row, **Then** the old "Open in Spotify" icon is gone; the headphones menu is in its place.
4. **Given** a row without a Spotify id, **When** the owner opens its menu, **Then** only the platform searches are listed.
5. **Given** a phone-width window, **When** a track list is shown, **Then** the headphones menu is reachable on each item, as on the Mix page.

---

### Edge Cases

- A list where no row has a Spotify id still keeps the empty first column, so the layout does not jump between pages.
- The Spotify app is not installed on the computer: the button does what the Mix play button does today (the system asks or does nothing); no new fallback is added.
- Sorting, filtering and infinite scrolling: each row keeps its own button; a row that loads later gets its button like the others.
- Lists of artists or playlists (not tracks) are not touched.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every list of tracks shows a play button on each row whose track has a Spotify id: Top tracks, Playlist, Artist (its tracks), every Crate view (Rotation, Classics, Gems, By year, Rarely played, Finish), and the Overview track lists.
- **FR-002**: The play button is the first column of the table on a wide window, and the first control of the item on a phone.
- **FR-003**: The play button opens the track in the Spotify app, exactly as the Mix tracklist's play button does today: same icon, same accessible name pattern "Play {artist} – {title} on Spotify", same kind of link.
- **FR-004**: Pressing the play button never triggers the row's own action (details panel, link to details).
- **FR-005**: A row without a Spotify track id shows an empty first cell, with no button and no placeholder text.
- **FR-006**: The rest of each row keeps its current behaviour: a click elsewhere opens the details panel as today.
- **FR-007**: On every list of FR-001, the "Open in Spotify" icon at the end of track rows is replaced by the Mix headphones menu ("Listen to {artist} – {title}"). Its items, in order: Play on Spotify (the app) and Open Spotify web page, when the track has a Spotify id; then searches on Beatport, Bandcamp, Discogs, SoundCloud and YouTube for the track's artist and title.
- **FR-011**: The menu items and their links are the ones the Mix tracklist builds, so a platform added or changed later changes on every page at once.
- **FR-012**: Lists of artists and playlists keep their "Open in Spotify" icon (they are not track rows). An artist's icon (Top artists, Artists, Under the radar) and the Artist page header's "Open in Spotify" text link open the artist in the Spotify app (`spotify:artist:{id}`, opened in place, no new tab), the same icon and name as before; a missing artist id shows no link. Playlist links stay web pages in a new tab (owner's follow-up, 2026-11-09).
- **FR-008**: The Mix tracklist is unchanged: its play button stays in its Spotify column, with its found / not found marks.
- **FR-009**: Opening a track from the play button reads nothing from Spotify and writes nothing to Spotify; it is a plain link.
- **FR-010**: The button works on the demo data the same way as on the owner's data.

### Key Entities

- **Listen menu**: the headphones menu at the end of a track row, holding every way to open the track, in the Mix order: direct pages first, then search pages.
- **Track row**: one line of a track list; carries the track's Spotify id when there is one, its artist and title for the button's name.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From any track list, the owner reaches the track playing in Spotify in one tap, on computer and on phone.
- **SC-002**: 100 % of track lists named in FR-001 show the play button first on rows with a Spotify id, at all four widths the screenshot loop checks.
- **SC-003**: 0 rows without a Spotify id show a play button.
- **SC-004**: The play button looks and is read aloud the same on every page, Mix included.
- **SC-005**: No row action changes besides the new button and the menu: a click elsewhere on a row behaves as before on every page.
- **SC-006**: Every track row offers the same set of ways to open it as a Mix row: Spotify app, Spotify web page, five platform searches, in one menu.

## Assumptions

- "Same feature as Mix" means the Mix play button (the play icon that opens the Spotify app directly, a `spotify:` track link) at the start of the row, and the Mix headphones menu at its end.
- The Mix page shows SoundCloud and Shazam icons beside its menu; the other lists show only the headphones menu, to keep rows short. Shazam is a Mix-only link (it comes from a mix import) and does not appear elsewhere.
- The platform links are searches by name the owner opens by hand, as on the Mix page; the app itself never searches a platform by name (ADR-04 unchanged).
- The play button is added beside the existing row click; the details panel still opens from a click on the row.
- Lists of artists, playlists and search suggestions are out of scope: they are not track rows.
- The track details panel already has its own "Open in Spotify" link and is not changed.
- The Mix tracklist keeps its own layout; moving its play button to the first column is out of scope. (Later, spec 022 `specs/022-mix-phone-play-button/`: on a phone the same ▶ also sits on a found Mix row's meta line, before Shazam and SoundCloud; before that it was only in More › Listen….)
- No new Spotify read, write or scope is involved (ADR-02, ADR-03 unchanged).
