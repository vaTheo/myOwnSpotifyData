# Feature Specification: One Crate view screen with a view switch, and four small fixes

**Feature Branch**: `task/dev-session-2`

**Created**: 2026-11-13

**Status**: Draft (owner 2026-11-13: "Hub stay as landing page and scope 2"; one question open, Q1)

**Input**: Owner (2026-11-13): "i have feeling that we could regroup things together. we ahve multiple page for each of the features like havy rotation, forgotten gems, all-time classics and so one for each track list, but it could be a better made view with just some option to display things differently, this way we could lower number op pages and complexity of the app."

## Today (as found, 2026-11-13)

A review of every page of the app found one place where pages repeat each other: the Crate.

- The Crate is seven addresses: the hub (`#/crate`, six cards) and six view pages (Heavy rotation, Forgotten gems, All-time classics, By year, Finish rate, Rarely played).
- The six view pages have the same structure: one control, a caption, the filter bar, the same table, the same details sheet. They differ by their rule, their control, one or two columns, their chart, their empty message and the extra figures in the sheet.
- To go from one view to another, the owner goes back to the hub and picks another card.
- Top shows Spotify's own ranking and no line says so, so Top tracks reads like a second Heavy rotation.
- Artists has two views (Saved tracks, Under the radar) with one "Filter artists" box, but each view remembers its own text: the text typed in one is gone in the other.
- The Activity button lists the running jobs; five of them link to the top of Settings, not to the item that shows the job.
- The Crate's gate card says "These five views"; there are six since Rarely played (spec 007). Spec 003 FR-015 and FR-035 say five too.

Reviewed and left as they are: Overview, the Crate hub, Playlists, Playlist, Artist, Under the radar, Mix, Settings, Import, Search, Sign-in, Connect.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Move between the Crate views without going back to the hub (Priority: P1)

The owner opens a Crate view from the hub. At the top of the screen, a view switch names the six views: Heavy rotation, Forgotten gems, All-time classics, By year, Finish rate, Rarely played. The open view is marked. The owner picks another name and the screen shows that view: its control, its caption, its table. The six pages are now one screen with six choices.

**Why this priority**: this is the owner's request: fewer pages, one view with options.

**Independent Test**: on the demo data, open Heavy rotation from the hub, then reach each of the five other views with one tap each, never opening the hub.

**Acceptance Scenarios**:

1. **Given** a Crate view open, **Then** the view switch shows the six view names in the hub's order, with the open one marked.
2. **Given** Heavy rotation open, **When** the owner picks Forgotten gems in the switch, **Then** the screen shows Forgotten gems with its own control, caption, table and empty message, and the address is the one of Forgotten gems.
3. **Given** a view picked in the switch, **Then** the top bar names that view and its back control leads to the hub.
4. **Given** the owner switched from one view to another, **When** they use the browser's Back, **Then** they return to the view they came from; the top bar's back control always leads to the hub.
5. **Given** the hub, **Then** it is unchanged: six cards, each with its count, its current setting, its top track and its chart, each opening its view.
6. **Given** the Listening tabs, **When** the owner comes back to the Crate tab, **Then** it reopens the view they last had open, as today.

### User Story 2 - Each view is exactly what it was (Priority: P1)

Regrouping the pages must not change what a view finds or says. Each view keeps its rule, its thresholds, its ranking, its control, its caption, its columns, its chart, its flags, its empty message with its action, and its extra figures in the details sheet, word for word.

**Why this priority**: the owner prepares sets from these lists; a changed rule or a lost setting is a regression.

**Independent Test**: on the demo data, for each of the six views, the rows, their order, the caption and the control are the same before and after the change.

**Acceptance Scenarios**:

1. **Given** any of the six views, **Then** its rows and their order are the same as before this change for the same data and the same setting.
2. **Given** a setting changed in a view (window, unplayed-for, Most years / Most plays, year and period, Finished / Skipped, play counts and playlist), **When** the owner switches to another view and comes back, **Then** the setting is still there; the hub card and the Overview's Heavy rotation card show it too.
3. **Given** a sort or a filter set in one view, **When** the owner switches to another view, **Then** the other view shows its own sort and filter, not the first view's; coming back, the first view's sort and filter are still there.
4. **Given** By year, **Then** it keeps its year and period picker (the year by month grid on wider windows, the two rows of choices on the phone), and seasons work as today.
5. **Given** Finish rate, **Then** its legend is above the table; **given** Rarely played, **Then** its Playlists column, its play-count choices and its playlist choice are there.
6. **Given** a track opened in the details sheet, **Then** the sheet shows the open view's extra figures, and closes or follows the view as today.
7. **Given** no history import, or an import that needs redoing, **Then** every Crate address shows the gate card with its Import action, as today, for the six views including Rarely played.

### User Story 3 - Every existing address and link still lands on the right view (Priority: P1)

Bookmarks and the app's own links keep working.

**Independent Test**: open each address of the list below in a new tab; each shows the same view and period as before.

**Acceptance Scenarios**:

1. **Given** the address of a view (`#/crate/rotation`, `#/crate/gems`, `#/crate/classics`, `#/crate/year`, `#/crate/finish`, `#/crate/rarely-played`), **Then** it opens that view, with that view marked in the switch.
2. **Given** `#/crate/year/<period>` (a year, or a year and month), **Then** By year opens on that period.
3. **Given** the "Open <month>" link in the details sheet of Heavy rotation, Forgotten gems or All-time classics, **When** the owner taps it, **Then** By year opens on that month, whatever view was open.
4. **Given** the Overview's Heavy rotation card and the hub cards, **Then** their links open the same views as today.
5. **Given** an address with an open track (`?d=`), **Then** the view opens with that track's sheet, once, as today.
6. **Given** an unknown view name in the address, **Then** the hub opens, as today.
7. **Given** a track found by search over a Crate view, **Then** its sheet opens over the view, as today.

### User Story 4 - The switch works on the phone (Priority: P1)

On the phone the switch and the view's own control both fit above the list, and the list stays the main thing on the screen.

**Independent Test**: at a phone width of 390 px, on each of the six views, the switch and the view's control are fully usable, nothing is cut, and the page does not scroll sideways.

**Acceptance Scenarios**:

1. **Given** a phone width, **Then** the switch shows as [NEEDS CLARIFICATION: Q1, the form of the view switch on the phone: one scrolling row of six names, or one compact picker showing the open view's name].
2. **Given** a phone width and By year open, **Then** the switch, the year choices and the period choices are all reachable, and the first rows of the list are visible without scrolling on a common phone screen.
3. **Given** a phone width, **Then** the order controls of each view (Most years / Most plays, Finished / Skipped) are still there, because the phone has no column header to sort by.

### User Story 5 - Top says where its ranking comes from (Priority: P2)

The owner opens Top. One caption line above the table says that the ranking is Spotify's own for the chosen period, and that the Plays figures come from the imported history. Top no longer looks like a copy of Heavy rotation.

**Independent Test**: open Top on the demo data; the caption is visible for Tracks and for Artists, at each period.

**Acceptance Scenarios**:

1. **Given** Top open on Tracks, **Then** a caption reads: "Spotify's own ranking for this period. Plays come from your history import." (proposed wording).
2. **Given** Top open on Artists or on Compare periods, **Then** a caption says the ranking is Spotify's own; it mentions plays only where a Plays figure is shown.
3. **Given** no history import, **Then** the caption does not promise plays the screen does not show.

### User Story 6 - The Artists filter survives a view switch (Priority: P2)

The owner types a name in "Filter artists" on Saved tracks, then switches to Under the radar: the text is still in the box and the list is filtered by it. The same holds the other way.

**Independent Test**: on the demo data, type two letters on Saved tracks, switch to Under the radar and back; the text and the filtering hold each time.

**Acceptance Scenarios**:

1. **Given** text in "Filter artists" on one Artists view, **When** the owner switches to the other view, **Then** the box holds the same text and the list is filtered by it.
2. **Given** Under the radar, **Then** everything else is unchanged: its groups, Well known as a heading at the bottom, its sorts, listeners and fans side by side, a missing number never shown as zero.

### User Story 7 - A running job's link opens its Settings item (Priority: P3)

The owner taps a running job in the Activity button. Settings opens on the item that shows that job, not at the top of the page.

**Independent Test**: on the demo variant with jobs running, each job link leads to its item.

**Acceptance Scenarios**:

1. **Given** a job running, **When** the owner taps it in the Activity button, **Then** Settings opens with that job's item open and in view: Syncing playlists → Spotify sync; Looking up BPM and key, Looking up release years, Importing Rekordbox → Audio data; Looking up artists → Artist reach; Saving to server, Loading from server → Server.
2. **Given** Importing history, Liking songs or a playlist being created from a mix, **Then** their links are unchanged (Import, the playlist, the mix).

### User Story 8 - The gate card counts six views (Priority: P3)

**Acceptance Scenarios**:

1. **Given** no history import, **Then** the Crate's gate card no longer says "five views"; its text is true for six views.
2. **Given** the import-again gate card, **Then** its text is true for six views too.
3. **Given** spec 003, **Then** FR-015 and FR-035 no longer say five.

### Edge Cases

- A view with no rows (nothing in rotation, stale history, nothing forgotten, no rarely played track): the switch stays, so the owner can leave for another view; the empty message and its action ("Try 6 months", "Import a fresh export", "Try 0 to 3 plays") are unchanged.
- An address period is applied when By year is opened by that address or by an "Open <month>" link, including when another Crate view was open just before. It is not re-applied when the owner then changes the period by hand.
- Switching view with a track's sheet open: the sheet closes, because the track may not be in the other view.
- Switching view resets the list to its first page, as opening the view does today.
- A view opened beside its details sheet on a medium window: the switch must not push the table under its minimum width; a title is never drawn under 160 px.
- Keyboard: the switch is reachable and operable with the keyboard, and the open view is announced as selected.
- A filter that matches nothing on one Artists view after a switch: the list shows its "no match" message with the text still in the box.
- A job whose Settings item is already open: the link brings it into view and changes nothing else.

## Requirements *(mandatory)*

### Functional Requirements

**Crate view screen**

- **FR-001**: The six Crate views MUST be shown as one screen with a view switch naming Heavy rotation, Forgotten gems, All-time classics, By year, Finish rate and Rarely played, in the hub's order, with the open view marked as selected.
- **FR-002**: Picking a view in the switch MUST show that view and change the address to that view's existing address, so each view stays bookmarkable and the browser's Back returns to the previous view.
- **FR-003**: The top bar MUST name the open view, and its back control MUST lead to the hub (spec 003 FR-004 kept).
- **FR-004**: The Crate hub MUST stay the landing page of the Crate, with its six cards and its import line, unchanged.
- **FR-005**: Each view MUST keep its rule, thresholds, ranking, control, caption, columns, chart, flags, legend, empty messages and their actions, and its details sheet figures, word for word (spec 003 FR-036 and FR-049 kept).
- **FR-006**: Each view's setting MUST be kept while the owner moves between views, the hub and the Overview, and forgotten on reload, as today.
- **FR-007**: Each view MUST keep its own sort and its own filter; switching views MUST NOT carry them from one view to another.
- **FR-008**: Every Crate address MUST show the gate card unless the history import is the current version, for the six views alike; a gate never shows a half-filled table.
- **FR-009**: Every existing Crate address and in-app link MUST open the same view, period and open track as before (spec 003 FR-002a kept); an unknown view name MUST open the hub.
- **FR-010**: A period carried by an address or an "Open <month>" link MUST be applied each time By year is reached that way, including from another Crate view.
- **FR-011**: The Crate tab MUST reopen the last view the owner had open, as today.
- **FR-012**: At phone width the switch and the open view's control MUST be fully usable without sideways page scroll, in the form the owner picks (Q1); the per-view order controls MUST stay.
- **FR-013**: The switch MUST be operable with the keyboard and expose which view is selected to assistive technology.
- **FR-014**: Switching view MUST close an open details sheet and show the first page of the list.

**Small fixes**

- **FR-015**: Top MUST show one caption saying the ranking is Spotify's own for the chosen period; it MUST say that plays come from the history import only where a Plays figure is shown.
- **FR-016**: The "Filter artists" text MUST be one value for Saved tracks and Under the radar. Nothing else of Under the radar changes.
- **FR-017**: Each running job listed by the Activity button that Settings shows MUST link to its Settings item (Spotify sync, Audio data, Artist reach, Server); the links of Importing history, Liking songs and Create playlist MUST NOT change.
- **FR-018**: The Crate gate cards MUST NOT state a wrong number of views; spec 003 FR-015 and FR-035 MUST be corrected to six.

**Unchanged on purpose**

- **FR-019**: This round MUST NOT add a Spotify read or write, a stored field, a dependency, or a new `confirm()` question.
- **FR-020**: The docs of everything touched MUST be updated in the same batch: feature inventory, how-it-works (Crate and screens sections), README, CHANGELOG, spec 003 contracts (routes, screens) and its regression rows, and the folder notes concerned.

### Key Entities

- **Crate view**: one of six named ways to rank the owner's tracks from the history import. Has a name, an address, one setting, a rule, a caption and its own sort and filter.
- **View setting**: the owner's current choice for a view (window, unplayed-for, order, year and period, play counts and playlist). Lives for the session; read by the view, its hub card and the Overview.
- **Artists filter text**: the text typed in "Filter artists"; one value for both Artists views; lives for the session.
- **Running job link**: the address the Activity button opens for a job.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From any Crate view, the owner reaches any other Crate view in one tap (two with a compact picker on the phone), against two taps and a page change through the hub today.
- **SC-002**: The Crate offers two screens to learn (the hub and the view screen) instead of seven pages.
- **SC-003**: 100 % of the existing Crate addresses and in-app links open the same view and period as before.
- **SC-004**: For each of the six views on the demo data, the rows and their order are identical before and after the change.
- **SC-005**: At 390 px, on each of the six views, no control is cut and the page never scrolls sideways; the visual check reports 0 findings on the Crate pages when the owner asks for it.
- **SC-006**: Text typed in "Filter artists" survives 100 % of the switches between the two Artists views.
- **SC-007**: Each of the six job kinds Settings shows opens its own item from the Activity button.
- **SC-008**: The app's own checks pass (types, lint, tests, the regression rows of the Crate, Top, Artists and Activity).

## Assumptions

- Picking a view in the switch is an ordinary link to that view's address: the browser's Back steps through the views visited; the top bar's back control goes to the hub.
- On a computer the switch is a row of the six names above the view's control.
- The Top caption wording above is a proposal; the owner can reword it at review.
- The Activity mapping follows where Settings shows each job today: Rekordbox and release years live in the Audio data item.
- The sort and filter of a view stay per view because their columns differ (a "Plays in window" sort has no meaning in Finish rate).
- The visual loop (`yarn shots`) runs only when the owner asks; the regression rows and shots pages of the Crate are updated with the change.
- Out of scope, reviewed and rejected or not picked by the owner: removing the hub; folding Top into the Crate; moving Rarely played to Playlists; folding Import into Settings; merging Under the radar into Saved tracks; dropping Compare periods; turning Playlist order into a sort; changing the Settings state words; hiding Save mix (it would lose changes that are not saved automatically); any Mix change.
- Depends on: spec 003 (web-first redesign: FR-002a, FR-004, FR-036, FR-049, FR-052), spec 007 (Rarely played), spec 026 (Settings items and their addresses), ADR-07 (play counts and the Crate gate), ADR-11.
