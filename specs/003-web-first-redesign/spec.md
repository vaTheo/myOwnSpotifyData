# Feature Specification: A web-first redesign of every screen, following Google's design guidance

**Feature Branch**: `003-web-first-redesign`

**Created**: 2026-11-06

**Status**: Implemented (2026-11-07, on `worktree-task-design`; merge pending)

**Input**: User description: "I'm not happu with the mobile first design, it uglly and not good for web. I think I will use this app manly on web so I need you to do a complete rework of the design. You will need to go trhough esch part a create a plan to make it UX and UI friendly. You must analyses type of data are used and how you could make them available to the user. Use goodle best practicies to make a good design". Clarified on 2026-11-06: the visual direction is Material Design 3 as Google ships it (tonal surfaces,
rounded containers, a colour scheme generated from one seed colour), in a dark theme only (the owner: "I want you to keep the
darkmode"); the redesign adds
charts of the existing data, a global search, BPM and key filters, and a new Overview home screen; navigation regroups into
Overview, Listening (Top, Crate), Library (Playlists, Artists), Mix and Settings. Added the same day: "I would like to integrate
CHARTREUSE COLOR in you design": chartreuse is the app's colour.

## Clarifications

### Session 2026-11-06

- Q: Which visual direction should the redesign take? → A: Material Design 3, faithful: tonal surfaces, rounded containers, a
  palette generated from one seed colour.
- Q: Light, dark, or both? → A: The owner, after picking Material 3: "I want you to keep the darkmode". The app stays dark only:
  Material 3's dark colour scheme, no light theme and no theme switch.
- Q: Which colour carries the design? → A: The owner: "I would like to integrate CHARTREUSE COLOR in you design". Chartreuse
  (#7FFF00, the colour the web names chartreuse) replaces today's green as the seed and stays vivid on screen as the accent.
- Q: Beyond re-laying out what each screen shows, how much new presentation should the redesign add? → A: All of it: charts of the
  existing data (plays per month, finish-rate meters, a year × month grid for By year, the three Top periods side by side), a global
  search, BPM-range and compatible-key filters on track tables, and a new Overview home screen.
- Q: How should the navigation be organised? → A: Regroup: Listening (Top, Crate), Library (Playlists, Artists), Mix, Settings. With
  the Overview this makes five destinations, the most a phone's bottom bar takes.

### Amendments during the build (2026-11-06 to 2026-11-07)

Approved by the owner at the contact-sheet Stops, or ruled by the controller under the owner's delegation of 2026-11-07. This
list is the record; the steps that made them are in [execution.md](execution.md):

- **FR-015 / FR-016, amended (owner, S04 Stop, 2026-11-06)**: beside a list pane on expanded windows (840–1199 px), the Playlist
  and Artist tracks show as two-line items without sort headers, as on compact; the table and its sort come back on large windows.
  At 1440 px with the pane, Album, Length and Added hide by priority.
- **FR-016 on phones (ruling)**: compact windows have no header sort; the screens whose order is a control (Playlist order, Under
  the radar sorts, Mix's Sort) keep that control.
- **FR-026 (ruling, S06)**: All-time classics draws a year with no plays inside the imported range as a zero tick, not a gap;
  only months or years outside the history are gaps.
- **US6, the Mix review (owner, 2026-11-06)**: Check on Spotify (a button per mix, read on tap, answers kept on the rows),
  Validate per track, Create playlist with **Validated only** or **All tracks**; from `main`'s rounds 003–004: a later worker
  result keeps the review (D1), a run line with Ask again (D3), a comment candidate starts To review and joins Validated only once
  validated, All tracks includes it (D6, amends ADR-10); Heard once is a filter chip (D2); a request already gone says so inline
  (D4); a server without migration 0003 is named (D5). Check on Spotify saves the working list when it ends (R1).
- **One Spotify quota lock-out (ruling, S08d)**: a quota answer to sync, Check on Spotify, Create playlist or Like all songs locks
  all of them until it lapses, across reloads; Disconnect keeps it.
- **Layout rulings**: the Playlist header is one strip above the table (no side column) and Playlist rows are 48 px on large
  windows (owner, S02); row charts hide with the sheet open and on medium windows (owner, S06); the Mixes pane folds while a mix
  is open from 840 to 1599 px; the Overview has two columns from 840 px and three from 1200 px; Escape in search clears the text
  first, then closes.
- **Other rulings a reader needs**: the Listening and Library tab roots are titled after their destination; the Spotify link
  column comes first in priority and the "not in a playlist" flag stays in the phone item; Match drops Album and Added at
  1440; moving between rows with the details sheet open replaces the history entry, so Back returns to the list; Playlists
  split from expanded windows and the list pane folds while Match is on below large; on Mix, Edit and Delete sit in a row
  "More" menu, the Spotify column is 64 px, phones get one "Listen…" item; the mix error shows under the open mix's header
  when the Mixes pane is folded or the window has one column (one copy), and the "Mixes" button carries an error indicator
  (S08b, constitution VII); the "Found tracks" chip carries no count; the CC BY-SA credit sits in the "Well known" heading
  row; Connect's `/me` refused inside the lock-out is a warning banner (Connect is not Mix or Like).
- **Numbering**: the round's ADR is ADR-11 (ADR-10 was taken on `main` by round 003), its inventory row F21 (F20 was taken on
  `main` by round 005), and the constitution PATCH is 2.1.1 (`main` reached 2.1.0). The folder keeps the number 003 beside
  `specs/003-fill-scan-gaps/`: the round's execution plan ([execution.md](execution.md)) and its steps point at this path.

## Constitution notice

The constitution's preamble and the root `CLAUDE.md` describe an app "the owner (a DJ) uses on an Android phone". The owner now
uses it mainly in a web browser on a computer. This changes the design premise, not a principle:

- **Principles I to VII stay as they are.** The redesign changes how data is presented, never where it comes from, when Spotify is
  read or written, what leaves the browser, or how the local database is upgraded.
- **Principle IV** keeps long jobs (Audio data lookup, Rekordbox import, Artist reach) starting only from Settings. A new activity
  indicator may *show* a running job on every screen. It never *starts* one.
- **Principle VII** and the Under the radar rules carry over unchanged. Every failure surface that exists today keeps a visible place.
  Mix and Like failures stay inline. Listeners and fans stay side by side, never summed. A missing number is never printed as zero.
  Well known stays a heading at the bottom, never a filter.
- **Principle II** binds the new Overview: it is built only from what is already stored and never reads Spotify on open.
- **Principle V** keeps saved mixes out of the library model. The Overview's "last saved mix" and the search over mixes read the
  saved mixes on their own, when those are shown, never as part of loading the library.
- **Wording to change in the round's documents**: the constitution preamble (PATCH bump), the first line of `CLAUDE.md`, the
  README (owner's manual) and How the app works §13. The feature inventory's F4 stops being "the default route", because the
  Overview takes that place. A new ADR (ADR-11) records the move from phone-first to web-first adaptive design, Material Design 3
  as the visual system and the five-destination navigation, because that decision outlives the round.

## Design references

"Google's best practices" in this spec means three public bodies of guidance. The plan picks the details; the spec only depends on
their published rules:

- **Material Design 3** (m3.material.io): adaptive layout by window size class, the canonical layouts (list–detail, supporting
  pane, feed), the navigation components (bar, rail), colour roles, the type scale, shape, elevation, and the 48 × 48 touch target.
- **web.dev Core Web Vitals**: a page counts as "good" when its largest content paints within 2.5 s, it answers an interaction
  within 200 ms, and its layout shift score stays under 0.1.
- **WCAG 2.2 level AA**, which Google's accessibility guidance follows: contrast, keyboard operation, visible focus, reflow, text
  alternatives for charts and images.

Window size classes used below (Material 3): **compact** under 600 px wide (a phone), **medium** 600–839 px (a small tablet, a
narrow browser window), **expanded** 840–1199 px (a laptop with a side panel open), **large** 1200 px and wider (a laptop or desktop
browser window).

## Data inventory: what the app holds and how the redesign shows it

The analysis the owner asked for: each kind of data the app stores or computes, its shape, where it shows today and how the redesign
presents it. Several fields are stored and never shown today. They are marked **unused today**, and the redesign surfaces them.

| Data | What it holds | Shape | Today | Redesign |
|---|---|---|---|---|
| Playlists | name, cover, track count, last synced, pending sync | a collection with a few attributes | one-column list, cover and count | a table (or a cover grid) with name, tracks, last synced and status, opening the playlist beside the list |
| Playlist tracks | position, title, artists, album, duration, **added date (unused today)**, plays (and whether counted by name), top-list membership per period, BPM, key | a ranked table, about 10 attributes per row | one row per track, the attributes as wrapping badges | a sortable table with one aligned column per attribute; Match adds relation and ΔBPM columns |
| Top lists | rank, cover, title, artists per period (4 weeks, 6 months, all time); artists with saved-track and playlist counts | three ranked lists per kind | one period at a time, rows with badges | a table per period, or the three periods side by side on large windows to compare them |
| Saved artists | name, saved tracks, playlists, plays; reach (ListenBrainz listeners, Deezer fans, Wikipedia languages and views) | a ranked table | Saved tracks and Under the radar are separate row lists | one artist table with numeric columns; reach columns appear once reach data exists, under the same gate as today |
| Listening history per track | plays, **listening time (unused today)**, **first play (unused today)**, last play, plays per month, starts, finished, skipped | numbers plus a monthly time series | plain-text month strips (`Jan 3 · Feb —`) inside an expanded row | numbers in columns; the months drawn as a small bar chart with exact values on hover, on focus and for screen readers |
| Crate views | five rankings over the history, each with its own settings and metrics | ranked tables with a view-specific metric | a hub of five buttons; each view a row list with two badges | a hub of five summary cards with headline figures; each view a table with its own columns; By year picks its period on a year × month grid |
| Audio data | BPM, key, mode, **energy (unused today)**, the source (ReccoBeats or Rekordbox), coverage | two to four values per track | two coloured pills per row | BPM and key columns, sortable everywhere; key keeps its Camelot colour **and** its text; energy and source in the track details; a BPM range and a compatible-key filter on every track table |
| Artist reach | listeners, fans, Wikipedia languages and monthly views, as-of date, outbound links, licence credit | two to four numbers per artist, often missing | a text line per row | separate numeric columns; a missing value shows a dash announced as "no data", never 0 |
| Mixes | link, title, author, player, tracklist rows (start and end time, artist, title, label, source, confidence, references, library match), created playlist, worker requests and their states | a document with an editable table and a job history | one long column of sections | a two-pane workspace: saved mixes and requests on the left, the open mix (player, tracklist table, create-playlist results) on the right |
| Jobs and sync state | sync (running, quota lock, error), import, lookup, Rekordbox import, reach, server pull and push, like, create playlist, identify requests | status, progress and last result per job | inside the Settings card or the screen that started the job | unchanged where they live, plus one activity indicator in the app frame that shows any running job from every screen |
| Server state | per dataset: last write, row count, pending changes; last sync | a small table | a table in the Server card | unchanged in content; laid out as a table within the Settings page |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An app frame made for a computer browser (Priority: P1)

The owner opens the app in a browser on a laptop. The navigation sits on the side and is always visible. The content uses the width
of the window instead of a 720 px column in the middle of a dark page. Each screen has a top bar with its title and its own actions.
When the owner narrows the window, or opens the app on the phone, the same app adapts: the side navigation becomes a bottom bar and
two panes become one. Nothing that works today stops working.

**Why this priority**: every other story sits inside this frame. On its own it fixes the main complaint: a phone layout stretched
onto a computer screen.

**Independent Test**: open every screen at 1440, 1024, 768 and 390 px wide. Navigation is visible and usable at each width, nothing
scrolls sideways, and every feature in the inventory (F1–F19) is still reachable.

**Acceptance Scenarios**:

1. **Given** a window 1200 px or wider, **When** any screen is open, **Then** the navigation is shown on the side with an icon and a
   label for each of Overview, Listening, Library, Mix and Settings, and the current destination is marked by more than colour.
2. **Given** a window under 600 px wide, **When** any screen is open, **Then** navigation is a bottom bar, the content is one column
   and no page scrolls sideways.
3. **Given** a deep link such as `#/playlist/<id>` or `#/crate/year/2026-08`, **When** it is opened at any width, **Then** the same
   screen and selection open as today, inside Library or Listening with that destination marked, and back and forward restore the
   previous screen and its scroll position.
4. **Given** a sync running from Settings, **When** the owner moves to Listening, **Then** the activity indicator in the frame still shows
   the sync and its progress, and selecting it leads back to the Settings section that owns it.

---

### User Story 2 - Track lists become readable, sortable tables (Priority: P1)

On the Playlist, Top, Artist and Crate screens, every track is one line of a table. Title, artists, plays, BPM and key each sit in a
column, aligned and comparable down the page. The owner clicks a column header to sort by it and clicks again to reverse. The screen's
own ranking stays the default order, and a row keeps its rank number when the list is filtered or re-sorted.

**Why this priority**: track lists are most of what the owner looks at. Badges that wrap onto several lines make dozens of rows
impossible to compare at a glance on a wide screen.

**Independent Test**: open a playlist of 100+ tracks at 1440 px. The rows show title, artists, album, duration, added date, plays,
top-list flags, BPM and key in columns. Sorting by BPM, then by plays, reorders the rows and keeps each rank number.

**Acceptance Scenarios**:

1. **Given** a playlist with play counts and audio data, **When** it is opened on a large window, **Then** at least 15 rows are
   visible without scrolling, each with title, artists, plays, BPM and key readable without opening the row.
2. **Given** that table, **When** the owner clicks the BPM header, **Then** rows sort by BPM ascending, the header shows the
   direction, rows without a BPM go last, and a second click reverses the order.
3. **Given** a track with no BPM, no key or no play count, **When** it is shown, **Then** that cell shows a dash announced as
   "no data", never a 0.
4. **Given** a compact window, **When** the same playlist is open, **Then** each track is a two-line item (title; artists with plays,
   BPM and key) and the other fields move to the track's details.

---

### User Story 3 - Details open beside the list (Priority: P2)

Selecting a track, an artist, a playlist or a saved mix on a wide window opens its details in a pane beside the list (Material's
list–detail and supporting-pane layouts) instead of expanding the row or replacing the screen. The track details gather everything the
app knows about the track. The owner can go down a list with the keyboard and watch the details follow.

**Why this priority**: today the owner opens a row, scrolls, closes it and loses their place. A side pane keeps the list and the
answer on screen together. It needs the frame (US1) and the tables (US2) first.

**Independent Test**: on Top at 1440 px, select a track. A pane shows its title, artists, album, duration, BPM, key (in the chosen
notation), energy and audio data source when known, plays, listening time, first and last play, finished and skipped counts, the
playlists that hold it (as links) and a Spotify link. The list stays scrolled where it was.

**Acceptance Scenarios**:

1. **Given** the Playlists screen on a large window, **When** the owner selects a playlist, **Then** its tracks open in the right-hand
   pane, the list stays in place, and the address changes so the selection can be bookmarked and restored with back.
2. **Given** a compact window, **When** the owner selects the same playlist, **Then** it opens full screen as today, with a back
   control to return.
3. **Given** a detail pane is open, **When** the owner presses Escape, **Then** the pane closes and focus returns to the selected row.
4. **Given** the window shrinks from large to compact with a pane open, **When** the layout changes, **Then** the selected item stays
   open as a full-screen detail and nothing is lost.

---

### User Story 4 - Listening history made visible (Priority: P2)

The Crate hub becomes five cards. Each card names its view, says in one line what it finds, and shows its headline figures (track
count, current setting, top track). Inside a view, the numbers that were text strips become pictures: plays per month as small bars,
the finish rate as a coloured meter with its percentage, and By year as a year × month grid of play totals the owner clicks to pick a
year, a season or a month.

**Why this priority**: the history is the richest data in the app, and today it reads as rows of `Jan 3 · Feb — · Mar 1`. This
story is where the owner's request to make the data available pays off most.

**Independent Test**: with a history imported, open each Crate view at 1440 px. Every month-by-month figure that was text is shown as
a chart. Each chart gives its exact values on hover, on keyboard focus and to a screen reader. Every figure shown today is still
present.

**Acceptance Scenarios**:

1. **Given** Heavy rotation over 6 months, **When** it is shown, **Then** each row carries a six-bar chart of its plays per month,
   with the same values the text strip shows today.
2. **Given** By year, **When** the owner clicks a month cell on the year × month grid, **Then** the list shows that month, as
   `Open Aug 2026 ›` does today.
3. **Given** Finish rate, **When** a row is shown, **Then** its rate is a meter in the high, middle or low band with the percentage
   written beside it, and the legend explains the bands in words.
4. **Given** an import made before month data existed (the Crate's re-import gate), **When** the hub opens, **Then** the cards are
   replaced by the existing explanation and its re-import action, unchanged in meaning.

---

### User Story 5 - Settings becomes a clear "Data and sync" page (Priority: P2)

Settings is reorganised into labelled sections, one per data source: Spotify account, Spotify sync, Listening history, Audio data,
Artist reach, Server, and a separate danger zone for Disconnect. Each section shows the same things in the same order:
what it is, its status (last run, coverage, as-of date), its main action, its progress while running, and its last error or warning.
On a large window an index of the sections stays visible beside them.

**Why this priority**: Settings holds every long job and every recovery action. It is the longest screen and the one where a missed
warning costs a quota lock-out or lost data.

**Independent Test**: open Settings at 1440 px in each state: never synced, syncing, quota-locked, error, all data present. Every
status and error message shown today appears, in the section it belongs to, and every action keeps its disabled rules.

**Acceptance Scenarios**:

1. **Given** the Spotify quota lock, **When** Settings is open, **Then** the Spotify sync section shows the lock, the pending playlist
   count and the retry time as a warning in text and colour, and Sync now is disabled until then, as today.
2. **Given** a large window, **When** the owner clicks "Artist reach" in the section index, **Then** the page scrolls to that section
   and the index marks it.
3. **Given** the danger zone, **When** the owner clicks Disconnect, **Then** the same confirmation question as today is asked, word
   for word.

---

### User Story 6 - A Mix workspace for the desktop (Priority: P2)

On a wide window the Mix screen is a workspace. On the left: the link box, the JSON import, the saved mixes and the requests to the
owner's computer with their states. On the right: the open mix, with its title and sources, the player, the tracklist as an editable
table (time, artist – title, label, source, confidence, references, library match with BPM and key, row actions), Create playlist with
its results and the "not found" dig links, and the paste box.

**Why this priority**: the Mix screen is 900 lines of one column today. It is the screen where the owner spends long sessions
correcting a tracklist, so it gains most from a second pane. It does not block the other stories.

**Independent Test**: on a large window, open a saved mix. Edit a row inline, delete a row, add a track, save, create a playlist, and
pick an earlier request from the requests list. Every step works without leaving the workspace, and every failure shows inline in the
pane it concerns.

**Acceptance Scenarios**:

1. **Given** a saved mix, **When** the owner edits a row's artist and title, **Then** the row turns into input fields in place and
   Save and Cancel sit on that row.
2. **Given** Create playlist has failed, **When** the result is shown, **Then** the failure is an inline message in the mix pane and
   never a banner.
3. **Given** a compact window, **When** the Mix screen opens, **Then** the panes stack in this order: link box, open mix, saved mixes,
   requests, worker how-to.

---

### User Story 7 - Find and filter (Priority: P3)

The owner presses `/` or Ctrl+K to search everything the app holds: tracks, artists, playlists and saved mixes. Results are grouped by
kind and open the matching screen. Track tables also take a BPM range and a key filter (with compatible keys on the Camelot wheel), so
the owner can ask "128–132 BPM, compatible with 8A" of any playlist.

**Why this priority**: valuable for preparing sets on a computer, but it adds new behaviour on top of the redesign rather than fixing
what exists.

**Independent Test**: type part of an artist name in the search. Artists, tracks and playlists matching it appear grouped, and
choosing one opens it. On a playlist, set 124–128 BPM and key 8A. Only tracks in range and compatible with 8A remain, and the count
says how many of the total are shown.

**Acceptance Scenarios**:

1. **Given** any screen, **When** the owner presses `/` outside a text field, **Then** the search opens with focus in it.
2. **Given** a BPM filter is set, **When** a track has no BPM, **Then** it is hidden while the filter is active, and the count says so.

---

### User Story 8 - An Overview home (Priority: P3)

A new first screen sums up the owner's data from what is already stored: the history range and total plays, the current heavy
rotation's top tracks, the playlists last synced, audio data and reach coverage, the last saved mix, and any warning (stale history,
quota lock, pending server push). Each block links to its screen.

**Why this priority**: a convenience. Every figure on it is already reachable elsewhere.

**Independent Test**: open the app with all data present. The Overview shows each block with figures equal to those on the
corresponding screens, and reads nothing from Spotify.

**Acceptance Scenarios**:

1. **Given** the app opens, **When** the Overview renders, **Then** no Spotify request is made (Principle II).
2. **Given** no history is imported, **When** the Overview renders, **Then** the history blocks show an explanation and the import
   action instead of figures.

---

### Edge Cases

- **Very long names** (track titles, playlist names, mix titles, multi-artist credits): truncated with an ellipsis in table cells. The
  full text appears on hover, on keyboard focus and in the details pane. A title never pushes the numeric columns out of view.
- **Very long lists** (several thousand history rows, 1,000+ artists): the screen stays responsive. Lists keep growing page by page as
  today ("Showing the top 100 of 2,431", "Show 100 more") or load as the owner scrolls, and the count is always visible.
- **Missing data**: no BPM, no key, a BPM with no key, no play count before an import, no reach, local files with no Spotify id. Each
  shows a dash announced as "no data", never a zero, and a local file shows no Spotify link.
- **Gated views**: Crate before an import or after an old one, and Under the radar before the first reach run. They keep their
  explanation card and their single action. A gate never shows a half-filled table.
- **A job running while the owner navigates**: the activity indicator follows them. Two jobs at once (a mix lookup during a sync) both
  appear.
- **Window resized or rotated mid-task**: the selection, the open detail, the sort, the filters and the scroll position survive the
  change of layout.
- **Zoom at 200% and text enlarged in the browser**: content reflows to one column with no sideways scroll on the page (tables may
  scroll inside themselves) and no text is clipped.
- **Colours on the dark surfaces**: every colour, including chartreuse, the twelve Camelot key colours and the finish-rate bands,
  keeps the required contrast on each dark surface tone it sits on (page, card, pane, selected row). Text and icons on a chartreuse
  fill are dark, because white on chartreuse fails contrast.
- **Chartreuse next to data colours**: the Camelot greens (keys 4 and 5) and the finish rate's high band sit near chartreuse. They
  stay told apart from the accent by their text and their own tone, and a chartreuse mark never means a key or a band.
- **The SoundCloud player in a narrow pane**: it keeps a usable size or moves above the tracklist. It never overflows the pane.
- **Charts with little data**: a single month, a year with gaps (Classics prints a dash for a year without plays) or all zeros draws
  an honest empty chart, never a misleading scale.
- **Key notation**: the Camelot or musical-key preference applies to every key shown, including new columns, filters and details.
- **Touch on a large screen** (a touchscreen laptop or a tablet): every target stays at least 48 × 48 px whatever the layout.
- **Banners**: an error or warning banner appears at the top of the content area, can be dismissed, and never covers the navigation
  or a primary action.

## Requirements *(mandatory)*

### Functional Requirements

#### Frame and navigation

- **FR-001**: The app MUST adapt its layout to the window's size class (compact, medium, expanded, large). Large is the primary
  target and compact stays fully usable.
- **FR-002**: Navigation MUST offer five destinations, in this order: **Overview** (the new home, FR-050), **Listening** (tabs
  Top and Crate), **Library** (tabs Playlists and Artists), **Mix** and **Settings**. It MUST be a side rail with icons and labels on
  medium windows and wider, Settings set apart at the foot of the rail, and a bottom bar holding all five on compact windows (the
  most Material allows there). Inside Listening and Library, tabs at the top of the screen switch between the two parts. Each
  destination reopens on the tab the owner last used, Top and Playlists on a first visit.
- **FR-002a**: Opening the app with no address MUST land on Overview. Every address that exists today (`#/top`, `#/crate`,
  `#/crate/<view>`, `#/playlists`, `#/playlist/<id>`, `#/artists`, `#/artist/<key>`, `#/mix`, `#/settings`, `#/import`) MUST
  open the same content inside its new destination and tab, with that destination marked as current.
- **FR-003**: The current destination MUST be marked by an indicator shape and the label's weight, not by colour alone.
- **FR-004**: Every screen MUST have a top bar holding its title, its back control when it is a detail, and its contextual actions
  (for example Sync this playlist, Like all songs).
- **FR-005**: Lists and tables MUST use the available width on expanded and large windows. Prose (explanations, Settings text, help)
  MUST be capped at a readable line length of about 80 characters.
- **FR-006**: Every existing route and deep link MUST keep working. Back and forward MUST keep today's behaviour, including scroll
  restoration. A new pane selection MUST be part of the address, so it can be bookmarked and restored with back.
- **FR-007**: The frame MUST show an activity indicator whenever a job runs (sync, history import, audio data lookup, Rekordbox
  import, artist reach, server pull or push, like all songs, create playlist, mix lookup), with the job's name and progress, from
  every screen. Selecting it MUST lead to the place that owns the job. It MUST NOT start, stop or retry a job.
- **FR-008**: The app MUST stay installable as today and keep its name, icon and deep links.

#### Visual system

- **FR-009**: Every screen MUST use one visual system built on Material Design 3: colour roles, a type scale, shape, elevation, a
  spacing grid in multiples of 4 px and one icon set. The look is Material Design 3 as Google ships it: surfaces told apart by
  tonal levels rather than borders, rounded containers, Material's type scale, and a colour scheme generated from one seed colour,
  **chartreuse (#7FFF00)**. Navigation, top bars, tabs, segmented buttons, chips, cards, lists, search, menus, tooltips and progress
  indicators MUST follow Material 3's component guidance. The twelve Camelot key colours stay as data colours, tuned for contrast on
  the dark surfaces.
- **FR-009a**: Chartreuse MUST appear on screen as itself, not as the pale tint Material derives from a seed by default (Material's
  "fidelity" scheme keeps the seed's own colour as the primary). It marks what the owner acts on or is looking at: the current
  destination, primary buttons, the selected tab, chip or segment, the sort direction, the keyboard focus ring, progress
  indicators, links, and the main series of every chart. It MUST NOT colour large areas (page or card backgrounds), so the dark
  surfaces stay calm and the accent stays a signal.
- **FR-010**: The app MUST use one dark theme: Material 3's dark colour scheme generated from the seed colour, whatever the system
  setting. There is no light theme and no theme switch. The browser's own interface around the page (address bar on a phone,
  scrollbars, form controls) MUST be dark too.
- **FR-011**: Numbers in columns MUST be right-aligned with figures of equal width, and keep today's locale formatting (thousands
  separators, dates).
- **FR-012**: Colour MUST NOT be the only carrier of meaning. The Camelot key colours, the finish-rate bands, the "not in a playlist"
  flag, warnings and errors each also carry text or an icon.
- **FR-013**: Motion MUST be brief (under 300 ms for a transition) and MUST be removed when the system asks for reduced motion.
- **FR-014**: Every icon-only control MUST have an accessible name and a tooltip, as the Spotify link has today.

#### Data presentation

- **FR-015**: Every track collection (Top tracks, Playlist, Artist, the five Crate views, the Mix tracklist) MUST be shown as a table
  on medium windows and wider: one column per attribute, header cells and a visible sort order.
- **FR-016**: The owner MUST be able to sort a table by any of its columns, ascending or descending, with the direction shown in the
  header. The screen's own ranking MUST stay the default. Rank numbers MUST come from the full list, so filtering or re-sorting never
  renumbers a row. Rows missing the sorted value MUST go last in either direction.
- **FR-017**: On compact windows the same rows MUST collapse into two-line items: title, then artists with the screen's main metric,
  BPM and key. The other columns move to the details.
- **FR-018**: When the window is too narrow for every column, secondary columns MUST hide in a fixed priority order. Title, the main
  metric, BPM and key MUST be the last to go.
- **FR-019**: Selecting a track MUST open its details: in a pane beside the list on expanded and large windows, full screen on
  compact. The details MUST show everything the app holds for the track: title, artists (linked), album, duration, BPM, key (in the
  chosen notation), energy and the audio data source when known, plays (and whether counted by artist and title), listening time,
  first and last play, plays per month, starts, finished and skipped, the playlists that hold it (as links) and its Spotify link.
  This replaces today's expand-in-place sublists.
- **FR-020**: Selecting a playlist, an artist or a saved mix on expanded and large windows MUST open it in a detail pane beside its
  list (list–detail). On compact windows it MUST open full screen with a back control.
- **FR-021**: A missing value MUST show as a dash announced as "no data" to assistive technology, never as 0. This extends the Under
  the radar rule to every table.
- **FR-022**: Long lists MUST keep a visible count ("Showing 100 of 2,431") and grow page by page or as the owner scrolls. A screen
  MUST stay responsive with the largest list the owner has.
- **FR-023**: Truncated text MUST reveal its full value on hover and on keyboard focus.
- **FR-024**: Every text filter that exists today MUST be kept, placed in the screen's toolbar on medium windows and wider.
- **FR-025**: The month-by-month and rate figures MUST be drawn as charts: plays per month as small bars (Heavy rotation over its
  window, By year over the year, the track details over the whole history), plays per year for All-time classics, and the finish
  rate as a meter in its band. By year MUST offer a year × month grid of play totals as its period picker; clicking a year, a month
  or a season selects it, and the season and month choices of today stay available.
- **FR-026**: Every chart MUST give its exact values on hover, on keyboard focus and as text for screen readers, and MUST draw an
  empty or partial series honestly (zero is drawn as zero, a missing month as a gap).

#### Each screen

- **FR-027 Connect**: a centred sign-in card with the app's name, what it does, the privacy statement (what leaves the browser,
  unchanged in substance) and one primary action. A sign-in error is shown inline.
- **FR-028 Loading**: while the library loads, the frame and navigation MUST already be visible, with a loading indicator in the
  content area.
- **FR-029 Top** (Listening): the period control (4 weeks, 6 months, all time) and the Tracks/Artists control in the toolbar. On
  large windows a "Compare periods" choice MUST show the three periods side by side as three ranked columns, and an item present in
  several columns is marked in each of them on hover or focus. Tracks table:
  rank, cover, title, artists, plays, playlists (or the "not in a playlist" flag), BPM, key. Artists table: rank, image, name, saved
  tracks, playlists. Selecting a track opens its details. Selecting an artist opens the Artist screen.
- **FR-030 Playlists** (Library): the filter in the toolbar and a table of cover, name, tracks, last synced and a "pending" status. Selecting
  one opens it per FR-020.
- **FR-031 Playlist**: a header with cover, name, track count and Spotify link. Sync this playlist and Like all songs in the top bar,
  with their states and every Like message inline under the header (never a banner). The order control (By plays, Playlist order,
  Match). A table of #, title, artists, album, duration, added, plays, top-list flags, BPM and key. The "No play counts yet — import
  your history" note when there is no import.
- **FR-032 Match**: in Match mode a seed bar MUST name the seed track, its BPM and key, with a Clear action. Two columns MUST appear:
  key relation (same key, relative, boost, +1, −1) and ΔBPM. Selecting a row MUST set the seed, as today. The "No BPM or key for this
  track yet" and "matching by key alone" notes MUST be kept.
- **FR-033 Artists** (Library): one artist table with a view control (Saved tracks, Under the radar) and the filter. Saved tracks columns:
  rank, name, tracks, playlists, plus plays once a history is imported, and listeners and fans once reach data exists (same gate as
  today). Under the radar MUST keep its sorts (Most played, Fewest listeners, Fewest fans) as column sorts or a control. It MUST keep
  the coverage line, the "No reach data" and "Well known" headings at the bottom (headings, never filters), listeners and fans in two
  separate columns (never summed), the Wikipedia line on Well known rows only, and the CC BY-SA credit wherever Wikipedia figures show.
- **FR-034 Artist**: a header with name, saved tracks, playlists and Spotify link, and the reach block (listeners, fans, Wikipedia
  profile, as-of date, credit, outbound links, "Look up artists" when unresolved). A track table: title, album, plays, BPM, key,
  playlists. The details list the playlists that hold each track.
- **FR-035 Crate hub** (Listening): five cards (Heavy rotation, Forgotten gems, All-time classics, By year, Finish rate), each with its name, a
  one-line description, its track count, its current setting and its top track, computed with the view's current setting as today.
  The import status line (range, plays, imported date, stale-history warning, Update import) above the cards.
- **FR-036 Crate views**: each view keeps its control (window, unplayed-for, sort, year and period, Finished/Skipped), its caption
  and its rules, shown as a table with its own columns: Heavy rotation (plays in window, lifetime, New or not in a playlist, months in
  window), Forgotten gems (plays, last played), All-time classics (years played of the span, plays, per year), By year (plays in the
  selection, of the year or all time, months), Finish rate (percent finished with its band, finished of outcomes, skipped, unclear).
  The "Open <month> ›" link from Heavy rotation to By year MUST keep working.
- **FR-037 Mix**: the two-pane workspace of US6 on expanded and large windows, stacked on compact. Every message the screen has today
  (lookup states, the not-SoundCloud error, the mix error, create-playlist results, request states) MUST keep its place inline. The
  worker how-to MUST be reachable as help without filling the screen by default.
- **FR-038 Settings**: the sections of US5, each with what it is, its status, its action, its progress and its last error or warning,
  and a section index beside them on large windows. Long jobs MUST still start only here. Disconnect MUST sit in a separate danger
  zone.
- **FR-039 Import**: the steps to get the export, the last import's summary and the file picker. On a computer the file MUST also be
  accepted by dropping it on the import area.
- **FR-040 Empty states**: every empty state MUST say why the screen is empty and offer the one action that fixes it, keeping
  today's meaning ("No playlists yet. Sync in Settings", the Crate and Under the radar gate cards).
- **FR-041 Banners**: banners MUST keep their two kinds (error, warning), appear at the top of the content area, stay dismissible and
  never cover the navigation or a primary action.

#### Accessibility and keyboard

- **FR-042**: The app MUST meet WCAG 2.2 level AA in its dark theme: text contrast of at least 4.5:1 (3:1 for large text and for
  controls and chart marks), visible focus on every control, and reflow without sideways page scrolling at 320 px wide.
- **FR-043**: Every action MUST work with the keyboard alone, in reading order. Escape MUST close an open pane or dialog and return
  focus to where it came from. `/` or Ctrl+K MUST open the global search (FR-051) from any screen when focus is not in a text
  field. Lists and tables MUST be navigable with the arrow keys, Enter opening the selected item.
- **FR-044**: Screens MUST expose landmarks (navigation, main, complementary pane) and one heading structure. Tables MUST expose
  their headers to assistive technology. A change of sort or filter MUST be announced.
- **FR-045**: Touch targets MUST be at least 48 × 48 px.

#### What does not change

- **FR-046**: The redesign MUST NOT add a Spotify read, a Spotify write, a scope, an external host or anything that leaves the
  browser. Typefaces and icons MUST be served by the app itself (the content security rules allow only the hosts the app already
  talks to).
- **FR-047**: Every feature in the inventory (F1–F19) MUST remain reachable and behave as today. Only its presentation changes,
  plus the additions this spec lists.
- **FR-048**: Every failure surface that exists today (Settings state lines, inline messages, banners) MUST be kept. Every
  confirmation question MUST be kept word for word, still asked by the browser's own dialog.
- **FR-049**: How data is computed (rankings, Crate rules, Match tolerance, reach groups, gates) MUST NOT change.

#### Overview, search and filters

- **FR-050 Overview**: the home screen MUST sum up the owner's data in blocks, each linking to its screen: listening (history range,
  total plays, total listening time, import date, the stale-history warning), Heavy rotation's top five at its current setting,
  the 4-week top tracks, the library (playlists, last sync, a quota lock or pending playlists), coverage (share of tracks with audio
  data, share of artists with reach data, as-of dates), the last saved mix, and the server (last sync, pending changes) when one is
  set up. Every figure MUST equal the one on its own screen. It MUST be built only from stored data and never read Spotify
  (Principle II). A block whose data is missing shows a one-line explanation and the one action that fixes it, and a gated block
  (Crate, Under the radar) follows the same gate as its screen.
- **FR-051 Search**: one search MUST cover tracks (library and history), artists, playlists and saved mixes, by name, ignoring case
  and accents as today's filters do. Results are grouped by kind, a few per group with "show all", navigable with the keyboard, and
  choosing one opens it. It searches only what is stored in this browser.
- **FR-052 BPM and key filters**: every track table MUST offer a BPM range and a key filter. The key filter takes one key and an
  "include compatible keys" option, where compatible means exactly the relations Match already uses (same key, relative, ±1, boost).
  While a filter is active, tracks without the filtered value are hidden, the count says how many of the total are shown, and one
  action clears every filter. Keys are entered and shown in the owner's chosen notation.

### Key Entities

The redesign adds no stored data. The entities it presents are listed in the data inventory above:
Playlist, Playlist entry, Track, Top list, Saved artist, Play record (with its monthly buckets), Audio data, Artist identity and
reach, Mix (with its tracklist rows and requests), Job state, Server state.

- **View state** (presentation only): per screen, the sort column and direction, the open detail and the filters. Part of the
  address where FR-006 asks for it, otherwise kept for the session as today's selections are.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a 1440 × 900 window, a playlist screen shows at least 15 tracks without scrolling, each with title, artists, plays,
  BPM and key readable without opening the row.
- **SC-002**: From any track list, the owner can see a track's BPM, key, play count and the playlists that hold it in at most one
  click.
- **SC-003**: Every screen is usable with no sideways page scroll at every width from 320 px to 2560 px, and at 200% browser zoom.
- **SC-004**: An automated accessibility check finds no WCAG 2.2 AA contrast or naming failure on any screen, and a
  keyboard-only walkthrough completes every task in the inventory.
- **SC-005**: Every screen meets the "good" Core Web Vitals thresholds on the owner's computer with their real library: largest
  content within 2.5 s of opening, any click or key press answered within 200 ms (including sorting the largest table), and a layout
  shift score under 0.1.
- **SC-006**: A walkthrough of features F1–F19 passes in full at large and compact widths: every feature reachable, every message
  and confirmation shown today still shown.
- **SC-007**: Data that is stored but not shown today (added date, duration on the playlist screen, listening time, first play,
  energy, audio data source) is visible in the track details or the tables.
- **SC-008**: From any screen, the owner opens a named track, artist, playlist or saved mix through the search in under 5 seconds.
- **SC-009**: Every figure on the Overview equals the same figure on its own screen, checked block by block with the owner's data.
- **SC-010**: The owner reviews each redesigned screen at their usual window size and approves it as better than the current one
  before the round closes.

## Assumptions

- **Primary device**: a laptop or desktop browser window of 1200 px or wider. The phone (compact) stays supported because the owner
  says "mainly" on the web, and Material's adaptive guidance asks for every size class anyway.
- **Language**: English stays the only language, as today.
- **Confirmations**: the browser's own confirmation dialog stays. Replacing it with in-app dialogs would change the rule that every
  question is listed in How the app works §14 and asked from one place. That is out of scope.
- **Dependencies**: any new library (a component kit, an icon set, a typeface, a chart helper) is the owner's decision at plan time
  (ADR-06). The spec does not require one. Material Design 3 is followed as guidance, whether or not its own component library is
  used.
- **Testing**: the project has no screen tests in its test suite (a standing rule). The redesign is checked by the walkthroughs and
  audits in the success criteria. After every step, a screenshot loop on the owner's computer opens every screen at four widths on
  demo data, checks alignment, overflow, overlap, target size and accessibility automatically, and is reviewed screenshot by
  screenshot. The owner asked for it and picked its tool on 2026-11-06. Any new rule (sorting, filtering, chart scaling, column priority) is covered by the project's unit tests, like
  the rest of the app's rules.
- **Delivery**: the redesign lands screen by screen behind the new frame. Each commit compiles and passes the three checks, so the
  app is never half old and half broken on `main`.
- **Out of scope**: new data sources, changes to rankings or rules, new Spotify features, offline changes, a native app, translations.
- **Theme**: dark only, at the owner's request. A light theme is not built. Adding one later would be its own small round.
- **Round documents**: the spec under `docs/specs/`, an inventory row (F21), How the app works §13, README (owner's manual),
  CHANGELOG, ADR-11, and the constitution and `CLAUDE.md` wording of the Constitution notice.
