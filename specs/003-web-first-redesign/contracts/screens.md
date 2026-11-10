# Contract: the screen-by-screen plan

Every part of the app: what is wrong with it today (read from the code on 2026-11-06), what it becomes on a computer (large,
≥ 1200 px) and on a phone (compact, < 600 px), the data it shows, and the requirements it answers. Medium and expanded follow the
rules in [components](components.md) and research D6–D9. "Kept" means the behaviour, rule or wording stays exactly as today.

---

## 1. The frame (all screens) · FR-001–FR-008, FR-041

**Today**:

- Every screen is a 720 px column centred on a dark page, with six tabs in a bottom bar at 0.8 rem.
- On a 1440 px window two thirds of the width is empty, and the tabs sit at the bottom edge, far from the content.
- Each screen draws its own `h1`. There is no place for actions or for a running job.

**Computer**:

- An expanded navigation rail on the left (Overview, Listening, Library, Mix, with Settings at the foot), in
  `surface-container-low`.
- A 64 px top bar holds the screen title, the global search field, the activity button and the screen's actions.
- Banners sit under the top bar.
- Content fills the rest of the window, with 24 px margins. Prose is capped at 80 characters.

**Phone**: a top bar (title, search icon, activity icon, a back arrow on details) and a bottom navigation bar with the five
destinations. One column with 16 px margins.

**Data**: the job states, through `activeJobs()`.

**States**:

- Signing in: the frame is not shown, only the Connect card with "Signing you in…".
- Loading the library: the frame is shown, with a linear progress bar and "Loading your library…" in the content area (FR-028).

---

## 2. Connect · FR-027

**Today**: a heading, one dense paragraph that lists five external services, an error line and a button, left-aligned at the
top of a dark page.

**Computer and phone**: a centred card, 480 px at most.

- At the top: the app's name and a one-line purpose ("Your Spotify listening, ranked for DJ set preparation").
- Below it, a short list of what the app reads. Then a disclosure, "What leaves this browser", holding today's privacy paragraph
  word for word.
- An inline error with an icon.
- One filled "Connect Spotify" button.

**Kept**: the privacy statement's substance, the error text, PKCE sign-in.

---

## 3. Overview (new) · FR-050, US8

**Computer**: a feed of cards in three columns. Each card has a title, its figures, one link to its screen, and its state line
when something needs attention.

| Card                      | Figures                                                                                                  | Link                                 | When the data is missing                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------ |
| Listening                 | history range, total plays, total listening time, imported date; the stale-history warning               | Crate                                | "No listening history yet" + Import history      |
| Heavy rotation            | top five tracks of the current window, with their plays in the window and a `MonthBars` each             | Heavy rotation                       | the Crate gate card (import or re-import)        |
| Top this month            | the 4-week top five tracks, with BPM and key                                                             | Top                                  | "No top lists yet" + Sync in Settings            |
| Library                   | playlists, tracks, last sync; the quota lock with its retry time, or the pending playlists               | Playlists                            | "No playlists yet" + Sync in Settings            |
| Coverage                  | share of tracks with BPM or key (`coverage`), share of artists with reach (`reachCoverage`), as-of dates | Settings · Audio data / Artist reach | the share reads 0 of N, with Look up in Settings |
| Last saved mix            | title, track count, saved date, whether a playlist was made                                              | `#/mix/<key>`                        | "No saved mixes yet" + Mix                       |
| Server (only when set up) | last sync, pending datasets, paused or offline state                                                     | Settings · Server                    | not shown when no server is configured           |

**Phone**: one column, in the same order.

**The play-button round (`specs/017-track-play-button/`)**: a track item (Heavy rotation, Top this month) is ▶ (an empty place of the same width when Spotify does
not know the track), the link to its details, then the headphones Listen menu, three siblings; on a card under 400 px the item takes
two lines (title and artists, then the bars or the BPM and key pills and the value), so nothing is hidden.

**Columns (controller ruling, S10 round 1)**: one column on compact windows, two from 600 px through 1,199 px (medium and
expanded), three from 1,200 px. Three columns at 840–1,199 px would leave cards about 230–330 px wide: the Heavy rotation
and Top rows would cut their titles to a few letters and drop their bars, so expanded keeps two.

**Rules**:

- Every figure comes from `overviewBlocks()` and equals its screen's figure (SC-009).
- No Spotify read (Principle II).
- The mixes are read after the first paint (research D14).
- A gated card follows its screen's gate.

---

## 4. Listening · Top · FR-029, US2

**Today**:

- Two stacked segmented rows (period, then tracks or artists).
- Each track row wraps "N playlists", "N plays", BPM and key badges under its title.
- Tapping a row expands its playlists in place.

**Computer**:

- Top bar tabs: **Top** · Crate.
- Toolbar: period segmented buttons (4 weeks · 6 months · All time), Tracks/Artists segmented buttons, a **Compare periods**
  toggle, and the filter bar (BPM, key) on Tracks.

| Tracks column                                        | Priority | Sort first          |
| ---------------------------------------------------- | -------- | ------------------- |
| Play (play-button round: ▶, the Spotify app)         | 1        | —                   |
| # (Spotify rank)                                     | 1        | ascending (default) |
| Cover                                                | 3        | —                   |
| Title                                                | 1        | A→Z                 |
| Artists                                              | 2        | A→Z                 |
| Plays                                                | 1        | most first          |
| Playlists (count; the "not in a playlist" flag at 0) | 2        | most first          |
| BPM                                                  | 1        | ascending           |
| Key                                                  | 1        | Camelot order       |
| Listen (play-button round: the headphones menu)      | 1        | —                   |

| Artists column | Priority | Sort first          |
| -------------- | -------- | ------------------- |
| #              | 1        | ascending (default) |
| Image          | 3        | —                   |
| Name           | 1        | A→Z                 |
| Saved tracks   | 1        | most first          |
| Playlists      | 2        | most first          |

**Compare periods** (large windows only): three narrow ranked columns, one per period. Hovering or focusing an item outlines the
same item in the other columns. Selecting a track opens its details.

**Phone**: two-line items, "Title" over "Artists · N plays · 126 · 8A". The period and kind controls become two segmented rows
that scroll horizontally if needed.

**Selecting**: a track opens track details (`?d=`). An artist opens the Artist screen.

---

## 5. Listening · Crate hub · FR-035, US4

**Today**: five full-width buttons. Each shows the view's name, a "Top: artist — title" line and two badges, with the import line
above them.

**Computer**:

- Top bar tabs: Top · **Crate**.
- The import status line runs under the tabs: range · plays · imported date · Update import. When the history is stale it reads
  "History ends Aug 2026 · re-import" in the warning colour.
- Below it, five cards in a three-column grid. Each card has an icon (`trending_up`, `diamond`, `star`, `calendar_month`,
  `skip_next`), its name, a one-line description, its track count, its current setting, its top track, and a small chart:

| Card              | Chart                                 |
| ----------------- | ------------------------------------- |
| Heavy rotation    | plays per month in the window         |
| Forgotten gems    | the top gem's lifetime plays per year |
| All-time classics | how many tracks played in N+ years    |
| By year           | a mini year × month grid              |
| Finish rate       | the top track's meter                 |

The whole card is one link.

**Phone**: the cards in one column, each without its chart below 400 px.

**Gates kept**: no import, or an import before month data (`crateStatus`), shows today's `CrateEmpty` card in place of the grid.

---

## 6. Listening · Crate views · FR-036, FR-025, US4

**Today**:

- Each view stacks a control, a caption and a row list with two badges.
- Opening a row shows the playlists and a text strip ("Jan 3 · Feb — · Mar 1").
- By year stacks **two horizontally scrolling chip rows**: every year, then 17 period chips.

**Computer (common to the five views)**:

- A back link "‹ Crate" and the view title in the top bar.
- The view's controls as segmented buttons in the toolbar, with its caption under them (kept word for word).
- A table, then the paging footer.
- Selecting a row opens track details, which carries the playlist links and "Open <month> ›".

| View              | Columns beyond #, Title, Artist, BPM, Key                         | Chart column                                                           |
| ----------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Heavy rotation    | Plays in window · Lifetime · Flag ("New", or "not in a playlist") | `MonthBars` over the window                                            |
| Forgotten gems    | Plays · Last played (month) · Flag                                | `MonthBars` over the last 24 months                                    |
| All-time classics | Years played ("6 of 9") · Plays · Flag                            | plays per year across the span (a year with no plays inside the import as a zero tick, FR-026)                  |
| By year           | Plays in selection · Of year / all time · Flag                    | `MonthBars` over the selected year (Winter adds the previous December) |
| Finish rate       | `Meter` (% finished) · Finished of outcomes · Skipped · Unclear   | —                                                                      |

- **By year on medium and wider**: the two chip rows give way to a `YearMonthGrid` above the table. Clicking a month, a year's
  total or a season header selects that period. The table follows.
- **By year on compact**: the year and period chip rows stay, centred on the selection as today.
- **Finish rate**: the legend "65%+ green · under 35% red" becomes a legend with the two band swatches and their words.

**Phone**: two-line items with the view's main metric. The chart moves into the details.

**Play-button round**: every view starts with ▶ (Play on Spotify) and ends with the headphones Listen menu; on a phone ▶ sits before the rank
in the item's lead and the menu in its trail.

**Kept**: every rule, threshold, caption, the paging step of 100, `applyPeriod`, "Try 6 months", and the stale-history empty text.

---

## 7. Library · Playlists · FR-030, FR-020, US3

**Today**: a filter and a one-column list (cover, name, "N tracks", a "pending" badge).

**Computer**:

- Top bar tabs: **Playlists** · Artists.
- With nothing selected: a full-width table of cover, name, tracks, last synced and status ("pending" flag), sortable by each,
  with the filter in the toolbar.
- With a playlist selected (`#/playlist/<id>`): the list narrows to a 360 px pane on the left (cover, name, tracks) and the
  playlist opens on the right (section 8).

**Phone**: two-line items (name; "N tracks · synced 3 Nov"). Selecting one opens the playlist full screen.

**Empty**: "No playlists yet" + "Sync in Settings" (kept).

---

## 8. Library · Playlist · FR-031, FR-032, US2, US3

**Today**:

- The name, a muted count line, then two buttons, the Like status lines, the order control, a caption and the rows.
- Each row wraps plays, up to three "Top …" badges, the Match badges, BPM and key.
- Album, duration and added date are never shown.

**Computer**:

- **Header**: cover (64 px), name, "128 tracks · Open in Spotify". The top bar's actions are **Sync this playlist** (`sync`) and
  **Like all songs** (`favorite`), with their labels and disabled states as today. The Like status (checking or liking progress,
  done summary, error, "Connect again to allow likes") shows inline under the header, never as a banner.
- **Toolbar**: the order segmented buttons (By plays · Playlist order · Match) and the filter bar (text, BPM, key). On larger
  windows (medium and up) the filter bar folds behind a **Filters** button in the strip, so a 900 px tall window still holds 15
  rows (SC-001); it shows while a filter is in force (the button is then disabled). On a phone it is always shown (S09).
- **No play counts yet**: the "No play counts yet — import your history" line stays under the toolbar.

| Column                                                      | Priority | Sort first     |
| ----------------------------------------------------------- | -------- | -------------- |
| Play (play-button round: ▶, the Spotify app)                | 1        | —              |
| # (rank in the current order)                               | 1        | default        |
| Title                                                       | 1        | A→Z            |
| Artists                                                     | 2        | A→Z            |
| Album                                                       | 4        | A→Z            |
| Duration                                                    | 4        | shortest first |
| Added                                                       | 4        | newest first   |
| Plays (with "by artist and title" as a tooltip and an icon) | 1        | most first     |
| Top (flags for 4 weeks, 6 months, all time)                 | 3        | —              |
| BPM                                                         | 1        | ascending      |
| Key                                                         | 1        | Camelot order  |
| Listen (play-button round: the headphones menu, was the link) | 1        | —              |

**Match mode**:

- A seed bar replaces the caption: "Matching: Nightdrive · 126 BPM · 8A", with **Clear**.
- Before a seed is chosen, it reads "Select a track to match against" and a row click sets the seed, as today.
- Two columns appear after Plays: **Relation** (same key, relative, boost, +1, −1) and **ΔBPM** ("+1.6%").
- On larger windows they take the place of **Album** and **Added**, which Match drops so the title stays readable (ruling, S02
  review).
- The order is `rankMatches`'s, unchanged. Out-of-tolerance rows keep ΔBPM and lose Relation, as today.
- The "No BPM or key for this track yet" and "No BPM for this track — matching by key alone" notes are kept.
- A row's details also offer **Match from this track**, so a seed can be set without switching mode first.

**Phone**: two-line items. In Match mode the second line reads "relation · ΔBPM · BPM · key".

---

## 9. Library · Artists · FR-033, US2

**Today**:

- A segmented switch between Saved tracks and Under the radar.
- Saved tracks is a list of "N tracks · N playlists".
- Under the radar adds a sort control, a filter, a coverage caption and per-row text lines for reach.

**Computer**:

- Top bar tabs: Playlists · **Artists**.
- Toolbar: view segmented buttons (Saved tracks · Under the radar) and the filter.
- One artist table. Selecting an artist opens it beside the list (`#/artist/<key>`), as Playlists does.

| Column                                | Saved tracks               | Under the radar            | Sort first                          |
| ------------------------------------- | -------------------------- | -------------------------- | ----------------------------------- |
| # (rank over the full list)           | ✓                          | ✓                          | default                             |
| Name                                  | ✓                          | ✓                          | A→Z                                 |
| Tracks                                | ✓                          | ✓                          | most first                          |
| Playlists                             | ✓                          | ✓                          | most first                          |
| Plays                                 | once a history is imported | once a history is imported | most first (= "Most played")        |
| Listeners (ListenBrainz)              | once reach data exists     | ✓                          | fewest first (= "Fewest listeners") |
| Fans (Deezer)                         | once reach data exists     | ✓                          | fewest first (= "Fewest fans")      |
| Wikipedia (languages · monthly views) | —                          | Well known rows only       | —                                   |
| Spotify link                          | ✓                          | ✓                          | —                                   |

**Under the radar keeps**:

- the coverage line ("812 of 1,034 artists have reach data · as of 2 Nov 2026");
- its three sorts, now the Plays, Listeners and Fans headers (the segmented control stays on compact);
- the group order: radar rows first, then a **No reach data** heading row with "Not resolved yet · Look up artists ›", then a
  **Well known** heading row at the bottom. They are headings, never filters;
- listeners and fans in separate columns, never summed;
- a missing number shown as `NoData`, never 0;
- the CC BY-SA credit under the table when Well known rows show.

**Gates kept**: `artistReachSummary.version !== 1` shows today's "No reach data yet" card with Look up artists. The reach columns
in Saved tracks follow the same gate.

**Phone**: two-line items, with "N tracks · N playlists" or "1.2k listeners · 340 fans".

---

## 10. Library · Artist · FR-034

**Today**:

- The name, a count line and three text lines of reach.
- The first three track rows open by default with their playlists, a phone workaround.

**Computer** (the detail pane):

- **Header**: name, "14 saved tracks in 9 playlists · Open in Spotify" (the artist in the Spotify app, `spotify:artist:<id>`, in place;
  round 017 follow-up).
- **A reach card**: Listeners and Fans as two figures side by side, the Wikipedia profile line, "as of" and the credit, and the
  outbound links (ListenBrainz, Deezer, Wikipedia) as outlined buttons with `open_in_new`. When unresolved, it reads "No reach
  data" with Look up artists, under the same rules as today.
- **Track table**: Title, Album, Plays, Playlists (count), BPM, Key. Selecting a track opens its details, with the playlists.
  Play-button round: ▶ (Play on Spotify) first, the headphones Listen menu last, in place of the Spotify link.
- The open-the-first-three workaround goes, because the details sheet replaces it.

**Phone**: the header, the reach card, then two-line items.

**Kept**: the top-list-only artist case ("No saved tracks from X in your playlists"), and no reach block for an artist without an
aggregate.

---

## 11. Track details (sheet over any track list) · FR-019, US3

**Today**: does not exist. Pieces are scattered across in-place expansions: playlists, strips, "N of M plays", "last …".

**Content**, from `trackFacts()`:

1. **Identity**: title, artists (each linked to its Artist screen when saved), album, duration, Spotify link; "Local file" for local
   tracks, with no link.
2. **Audio**: BPM, key in the owner's notation, plus the other two notations in small text, energy when the source has it, and the
   source ("Rekordbox" or "ReccoBeats", with the date). **Match from this track** when opened from a playlist.
3. **Plays**: plays, with the "by artist and title" note, listening time, first play, last play, starts, finished, skipped and
   unclear. Each line appears only once a history is imported; otherwise the "import your history" link shows.
4. **History**: `MonthBars` over the whole history (or a mini `YearMonthGrid` on large), and "Open <month> ›" for its peak month.
5. **Playlists**: every synced playlist that holds it, as links ("Not in any of your 42 playlists" otherwise, kept).

**Layout**: docked side sheet on large, modal on medium and expanded, full screen on compact (research D9).

---

## 12. Mix · FR-037, US6

**Today**: one column of about ten stacked sections:

1. the link form;
2. Identify on my computer, with its history;
3. the Requests card;
4. the JSON import;
5. the status lines;
6. the saved mixes, or the open mix (‹ Mixes, provenance, player, Replace with the description tracklist, tracklist, Create
   playlist, paste box);
7. the worker how-to card, always open, with four OS sections.

**Computer**: the list–detail workspace.

- **Left pane (360 px)**, top to bottom:
  - the link field and Look up (Look up again for an open mix);
  - **Identify on my computer**, with the request's state;
  - **Import Tracklistify JSON** (`FileDrop`);
  - **Saved mixes**: title, "N tracks · saved 3 Nov", a selected state, and Remove in a row menu (the `confirm()` is kept);
  - **Requests to your computer**: status chips for queued, claimed, done, failed and rejected, the earlier requests collapsed;
  - **Run the worker on your computer**: a collapsed help section.
- **Right pane, the open mix** (`#/mix/<key>`):
  - **Header**: title, author, the provenance line (sources, links), Look up again, and Replace with the description tracklist
    when it applies.
  - **The player**, 166 px tall: SoundCloud's compact height on large, the full 400 px on request.
  - **The tracklist table**:

| Column                  | Notes                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| Time                    | start, `formatClock`                                                                     |
| Artist                  | the artist (spec 020; was one "Artist – Title" column)                                   |
| Title                   | the track name, the second line under it                                                 |
| Label                   | —                                                                                        |
| Source                  | trackid, description, pasted, manual, tracklistify, or worker, as an icon with a tooltip |
| Confidence / references | "87% match", "12 other mixes"                                                            |
| In your library         | BPM and key when matched                                                                 |
| Actions                 | Edit, Delete; the row becomes text fields with Save and Cancel when edited               |

- Gap rows are separators with Delete.
- Under the table: **Add track** and **Save mix** (filled, with "Saved ✓" kept).
- **Create playlist** as a card: button, progress, result, the "not found" disclosure with its dig links, and every failure
  inline.
- **Paste a tracklist** as a collapsed section.
- **No mix open**: the right pane shows an `EmptyState`: "Paste a link, import a JSON, or pick a saved mix".

**Owner's additions (2026-11-06, tasks T116–T119)**, which take precedence over the lists above where they differ:

- The left pane shows one **Mixes** list (saved mixes and requests merged), each row with one status chip: Queued, Identifying,
  Found N tracks, Failed, Rejected, Saved · N tracks · K validated, Playlist made.
- The open mix's header has **Check on Spotify** (a read on tap, with progress and Stop) and the line
  "N tracks · K validated · M on Spotify · L not found".
- The tracklist adds the columns **Spotify** (Not checked / On Spotify link / Not found), **Listen** (dig links for every track) and
  **Review** (Validate toggle, Remove), and filter chips All, To review, Validated, Not on Spotify.
- Create playlist offers **Validated only** or **All tracks**.

**From round 004 and the owner's decisions (2026-11-06, tasks T120–T129)**. `origin/main` (rounds 003 "fill scan gaps" and 004
"worker progress and queue control") is merged before S08. With the "Owner's additions", this is the complete Mix contract;
it takes precedence over both lists above where they differ, and **(replaces …)** names the line it changes. Its research
findings are folded into the spec's clarifications and tasks T120–T129.

- **Left pane, the Mixes list** (one row per link: a saved mix, a request, or both):
  - **Order (replaces "newest first")**: running requests first; then waiting ones in the order the worker takes them
    (`priority` high to low, then oldest first), so Move to top shows the row first; then the rest, newest first. Earlier
    finished requests of a link stay collapsed.
  - **Chips (replaces the T116 chip list)**: Queued, Identifying, Paused (step `paused`), Stopping… (Stop asked on a running
    request), Found tracks (done, result not applied yet), Failed, Rejected, Saved · N tracks · K validated, Playlist made.
    N counts tracks, never gap rows; candidates count. Found has no N (ruling, S08b review F5): the count needs the result
    body, fetched only to apply it, and reading it to count would be a new request.
  - **Progress line** under an Identifying, Paused or Stopping… row, word for word from `progressLine`: "First pass · 47 % · about
    25 min left", "Second pass ×1.04 · …", "Downloading", "Reading the comments", "Paused by Shazam until 20:35", "· Shazam refuses
    often: a VPN or a shared network?", "· last news 20:12: the computer stopped sending news" (no news for 10 min),
    "· stopping…". Without progress: "Running on <worker> since …". A queued row: "Waiting for your computer since …". A
    `ProgressBar` from `percent`, labelled with the step name, when `percent` is known. It refreshes with the existing 60 s
    auto-pull: no new poll.
  - **Finished rows**: "Done <when>"; a stopped-early done row adds the worker's text "Stopped early at 01:12:00 (by you); ask
    again later for the rest" and offers **Ask again** (new: before, only Failed and Rejected did); "Failed <when>: <reason>"
    with Ask again; "Result rejected — ask again" with Ask again. Ask again shows only when the server can take a request now.
  - **Row actions**: a queued row has **Move to top** (no `confirm()`; hidden when the row is already first) and **Cancel**; a
    running row has **Stop**, disabled while Stopping…; a saved mix keeps **Remove** in its row menu. Selecting a row opens it
    on the right (`#/mix/<key>` for a saved mix), or fills the link field when nothing is saved yet.
  - **'Gone' answers**: when Cancel, Move to top or Stop finds the request already taken or finished, an inline `StatusLine`
    in the left pane says "Already taken by your computer" or "Already finished" (ruling D4). Never a banner.
  - **Migration 0003 missing**: when the server says the progress, priority or stop column does not exist, the inline error
    reads "Apply migration 0003 on the server to use Cancel, Move to top and Stop" (ruling D5). The list still shows every
    request without progress.
  - The list header keeps "N requests waiting or running · checked every minute." / "Nothing waiting." and **Check now** /
    "Checking…".
  - **Run the worker on your computer** (collapsed) adds the VPN note from `worker/README.md`.
- **Right pane, the open mix**:
  - **Running request**: while the open mix's latest request runs, the header shows the same progress line and **Stop**.
  - **Run line (owner's D3)**: a small line under the header, from the last result: "Second pass: 41 places · 3 found",
    "Resumed (120 clips kept)", "Stopped early at 01:12:00 (rate limited)" with **Ask again**, and "1 warning" that expands to
    "Shazam refuses often: a VPN or a shared network?". Absent for mixes from before round 003 and for non-worker mixes.
  - **Set-wide clues**: under the header, collapsed: "Tracklist from the description (N lines, no times)" or "… from the
    comments", one line per clue, as text.
  - **Header line** "N tracks · K validated · M on Spotify · L not found": gap rows never count; candidates count.
  - **Check on Spotify** checks candidates and second-listen rows like any row; gap rows are never checked.
- **Tracklist, per-track data**:
  - **Source (replaces "as an icon with a tooltip" for these rows)**: the icon, plus visible text for the origin:
    "second listen · +4 %", "second listen · −4 %", "second listen"; for a candidate "from a comment by <author>", "from the
    description" or "from a chapter", then the clue's text in quotes.
  - **Not heard**: a candidate (comment-only, `origin: 'clue'`) always carries a **not heard** badge, never a confidence, never
    "heard". It starts **To review** (owner's D6).
  - **Confidence (replaces "87% match" when the row has clip counts)**: "heard N× · best X %" when the row has `hits`; "X%
    match" otherwise; empty, never zero, for candidates, gaps, edited rows and rows from before. "heard 1×" marks a track heard
    once.
  - **Sort**: the round-004 Sort select (Time / Clips heard / Best score), above the table, shown only when a row has `hits`,
    at every width (phones have no header sort). Rows without the number last; ties in set order.
  - **Gap rows** stay separators with Delete; a gap with clues shows a collapsed "N clues around here", one "mm:ss · author ·
    text" line each.
  - All third-party text (clue authors and texts) renders as plain text; a URL in it is not a link.
- **Filter chips (replaces the T118 chip list)**: All, To review, Validated, Not on Spotify, and **Heard once (N)** shown only
  when a row has `hits` (ruling D2). One chip at a time; gap rows show under All only. Under a chip other than All, the caption
  reads "Hidden, not deleted. Create playlist follows Validated only or All tracks, not this filter." (replaces "The others
  are hidden, not deleted; Create playlist uses every row.").
- **A later result keeps the review (owner's D1)**: when a result arrives for a mix already saved (resume or Ask again), a
  track the owner had keeps Validated, its Spotify check and its link; a track the owner removed stays removed (remembered on
  the mix); only new tracks arrive To review. Edited, typed, pasted, TrackId and description rows stay as they are.
- **Create playlist (owner's D6)**: **Validated only** adds validated tracks, candidates included once validated; **All
  tracks** adds every track not removed, candidates included. Gap rows never; the Heard once chip and the Sort never change
  what is added. This amends ADR-10 ("candidates go into the playlist unless deleted"): its Amendment section (S12).
- **Messages kept, word for word**, all inline in the Mix screen, never a banner:
  - from before: Looking up…, the not-SoundCloud error, "Result rejected — ask again", the create-playlist states and
    failures, "Saved ✓";
  - `mixError`: "Could not read that file: …", "Could not read your saved mixes: …", "Could not read your requests: …", "Sign
    in to the server (Settings)", "Could not reach the server: …", "Could not record the request: …", "The request is
    recorded on the server but not here: …", "Could not save the mix: …", "Could not remove the mix: …", "Could not cancel the
    request: …", "Could not move the request: …", "Could not stop the scan: …";
  - the Identify button's texts: "Identify on my computer", "Ask again", "Server not set up (Settings)", "Server unreachable",
    "Server paused — resume it from the dashboard", "Syncing with the server…";
  - the worker's failure reasons as sent, such as "Recognition service refused (rate limited); try later" and "Stopped by
    you before any track was found".
- **`confirm()` kept, word for word**: "Remove this saved mix?"; the four "replace the working list" questions ("Looking up
  again replaces the current tracklist, including your edits. Continue?", "Importing this file replaces the current
  tracklist, including your edits. Continue?", "Replace your edited tracklist with the one from the description?", "Replace
  your edited tracklist with the pasted tracks?"); "Cancel this request? It leaves the queue; you can ask again later.";
  "Stop this scan? The computer ends it within about a minute and keeps the tracks found so far." Move to top has none.
- **Unchanged rules**: no Spotify read on load or open; no new poll; no banner; no `DB_VERSION` bump (every new field is
  optional: `validated`, `spotify`, `checkedAt` on a row; `removed` and `run` on the mix).

**Phone**: one column in this order: link field, open mix (if any), Identify, JSON import, Mixes list, worker help.

**Kept**:

- every message and its place: Looking up…, the not-SoundCloud error, `mixError`, request errors, "Result rejected", the
  create-playlist states;
- no banner;
- every `confirm()` ("Remove this saved mix?", the four "replace the working list" questions, and round 004's Cancel and Stop
  questions, listed above).

---

## 13. Settings · FR-038, US5

**Today**: six cards stacked in the 720 px column. Key notation is hidden inside Audio data, and the version line sits at the
bottom.

**Computer**:

- A 220 px sticky **section index** on the left of the content area, with an indicator on the section in view.
- The sections are cards at a readable width (≤ 840 px). Each card is built the same way:
  - title and one-line description;
  - status lines (`StatusLine`);
  - progress while running;
  - the last error or warning;
  - actions, with the main one filled.

| Section           | Status                                                                                                        | Actions                                                                                                         | Kept rules                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Spotify account   | signed in; scopes missing (Like, Create playlist)                                                             | Connect again                                                                                                   | "Nothing on this computer is deleted" (the wording drops "phone") |
| Spotify sync      | last sync; running progress; quota lock with pending count and retry time (warning); cancelled; error         | **Sync now**                                                                                                    | disabled while busy or reach runs; lock until `retryAt`           |
| Listening history | `historyLine`, the zone at import, the stale warning                                                          | Import history / Update import → `#/import`                                                                     | —                                                                 |
| Audio data        | `coverageLine`; lookup progress (pass, done/total); Rekordbox progress and summary; errors                    | **Look up BPM and key**; Rekordbox XML (`FileDrop`); **Key notation** (segmented: Camelot · Open Key · Classic) | long jobs start only here                                         |
| Artist reach      | `reachCoverageLine`; step and progress; run summary; per-step warnings; as-of                                 | **Look up artists**                                                                                             | 45–50 min per 1,000 artists text kept                             |
| Server            | unset, signed out, offline, paused (dashboard link), pushing or pulling progress, connected with stamps table | Sign in by link; Sync now; Remove server data (`confirm()` kept)                                                | —                                                                 |
| Danger zone       | the consequence in one sentence                                                                               | **Disconnect** (outlined, error colour; `confirm()` word for word)                                              | disabled while a job runs                                         |

- App version as the last line.

**Phone**: the index goes. The sections stack in the same order.

---

## 14. Import · FR-039

**Today**: Last import card, How to get the file card (or a disclosure), and the file input with progress.

**Computer**:

- One card at reading width. The top bar shows "‹ Settings" and "Import listening history".
- **Last import**: the summary lines.
- **How to get the file**: the numbered steps, open until a first import exists, then collapsed.
- **The file**: a `FileDrop` area ("Drop my_spotify_data.zip here or choose a file"), progress (file i of n), and the narrower-import
  `confirm()`, kept.

**Phone**: the same, with no drop hint.

---

## 15. Search (dialog over any screen) · FR-051, US7

**Opens**: `/`, Ctrl+K (⌘K) or the top bar field.

**Computer**:

- A docked panel under the top bar, 720 px wide, with the query field and grouped results (Tracks, Artists, Playlists, Mixes).
- Five results per group, with "Show all N".
- Each result has an icon, its name, one line of context ("Kiasmos · 142 plays", "128 tracks", "saved 3 Nov") and the matched
  part in bold.
- ArrowUp/Down moves, Enter opens, Escape closes.

**Phone**: a full-screen search view.

**Empty query**: the last five things opened this session. **No result**: "Nothing matches 'xyz'".

---

## 16. Banners, empty, loading, errors · FR-040, FR-041, FR-048

- **Banners**: Material banners under the top bar, with an `error` or `warning` icon, the message (`BannerMessage`, never a string)
  and a dismiss button. `visibleBanner` rules are kept.
- **Empty states**: icon, reason and one action, keeping today's meanings (table in the spec FR-040).
- **Inline errors**: an error-coloured `StatusLine` with an icon, in the section or pane they concern (Mix, Like, Settings).
- **Gates**: the Crate and Under the radar cards keep their text and their one button.

---

## From main after the redesign started

Features released on `origin/main` after the merge base b59ccf7 and merged into this branch. Rounds 003 (fill scan gaps) and 004
(worker progress and queue control) are already folded into §12 ("From round 004 and the owner's decisions") and built in
S08–S08d. This section adds round 005 (S13b, T131b), built in S13c (T132). Main's choices that this proposal departs from, and
why, are listed in [main-sync.md](../main-sync.md) "Departures".

### Round 005 · Release year of every song (F20, `specs/005-track-release-year/`)

**Main's choice (mobile-first)**: a small outlined pill with the year after the BPM and key pills on every track row. Above each
song list, a wrapping row of rounded buttons: "Sort by year", "All", and one chip per decade present
(`components/YearView.tsx`, raw sizes in `styles.css`). On Mix, a "by year, oldest first" option in the Sort select and a
Decade `<select>`. In Settings · Audio data, the line "Release years: N of M tracks" and "· years N" on the look-up's done line.

**Intent kept**:

- Every song shown carries its year.
- A missing year is never shown as 0 or as a placeholder year.
- Every song list can be put oldest first (undated last, ties in the screen's own order).
- Every song list can be narrowed to one decade among those present, combined with its other controls.
- Nothing is hidden for good and nothing is deleted.
- The look-up says how many songs are dated.
- No Spotify call is added: Create playlist and Check on Spotify date rows from the search they already make.

**Data, unchanged from main**:

- `yearOf(model, trackId)`: ReccoBeats' earliest album year, else a playlist sync's album year, else a Top list's. Cached per
  model.
- A Mix row's own `year` and `yearFrom` (`shazam`, `catalogue`, `spotify`).
- `decadeOf`, `decadeLabel` ("80s", "90s", "2000s", "1940s"), and `decadesPresent`.
- A decade absent from a list is dropped (`effectiveYearView`).

**Two kinds of width.** Window classes decide the frame: compact < 600, medium 600–839, expanded 840–1199, large ≥ 1200
(`layout/windowClass.ts`). Column priorities follow the **table's own width** (`@container dt` in `styles.css`): priority 1
always shows, priority 2 from a 720 px table, priority 3 from 960 px, priority 4 from 1120 px. Two-line items are drawn on
compact windows, and wherever a table has `compactBelow` and is narrower than it (a detail beside a list pane). Every rule below
names which of the two it uses.

#### 1. A **Released** column on every track table

The column goes on Top (Tracks), Playlist, Artist and the five Crate views, through one builder `yearColumn(yearOf)` in
`table/columns.tsx`, beside `bpmColumn` and `keyColumn`. It uses tokens only: the table's body type, `tabular-nums`, and
`--md-sys-color-on-surface-variant`.

| Property      | Value                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------- |
| Column id     | `released`                                                                                                           |
| Header        | **Released**. Not "Year": the Crate also counts listening years ("Years played", "Per year", By year's grid).        |
| Width / align | 88 px, end-aligned                                                                                                   |
| Priority      | **2** on every table: shown in any table of 720 px or more, with Artists, Playlists, In your library                 |
| Sort          | `sortValue` is the year, `firstDirection: 'asc'` (oldest first); undated rows go last in both directions (`sort.ts`) |
| Missing       | `NoData` (the dash announced "no data"), like every other missing value in a table (FR-048)                          |
| Two-line item | `compact: 'meta'`, after BPM and key. An undated song adds nothing to the meta line.                                 |
| Place         | after Key, before the Spotify link                                                                                   |

On the Playlist's Match order, the relation and ΔBPM columns stay, and Released sorts like any column there: the order control
and the header sort coexist as they do today. Under the radar lists artists, so it has no year column. Compare periods (three
narrow ranked lists) shows no year either.

```
Large (≥ 1200, table ≥ 1120 px), Playlist · By plays (other columns as today)
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ‹ Playlists   Warm-up tools                                   [Sync this playlist] [Like all songs]              │
│ 128 tracks · synced 4 Nov      ( By plays | Playlist order | Match )                            [Filters ▾ (1)] │
├───┬───────────────┬─────────────┬──────────┬──────┬────────┬───────┬─────┬───────┬──────┬────────┬─────────────┤
│ # │ Title         │ Artists     │ Album    │Length│ Added  │ Plays │ Top │ BPM   │ Key  │Released│ Open in Sp. │
├───┼───────────────┼─────────────┼──────────┼──────┼────────┼───────┼─────┼───────┼──────┼────────┼─────────────┤
│ 1 │ Noble Booth   │ S. Gubatz   │ Booth EP │ 6:12 │ 3 Mar  │   142 │ ★   │ 124.0 │ (8A) │   1993 │ ↗           │
│ 2 │ Harbour Lights│ Kiasmos     │ Lights LP│ 5:40 │ 9 Jan  │    98 │     │ 122.5 │ (5B) │      — │ ↗           │
└───┴───────────────┴─────────────┴──────────┴──────┴────────┴───────┴─────┴───────┴──────┴────────┴─────────────┘
Table 720–959 px: #, Title, Artists, Plays, BPM, Key, Released, link (Top and the p4 columns hidden).
Table < 720 px: Released hidden; the "Sort by year" switch shows in the Filters fold (§2).
Two-line items:
  Noble Booth
  Stefan Gubatz · 142 plays · 124 · 8A · 1993
```

#### 2. The **decade** in the Filters fold, and **Sort by year** where the header cannot do it

`TrackFilter` gains `decade: number | null` (pure, in `filters/trackFilter.ts`). `filterTracks` gets a `yearOf(row)` reader
beside `featureOf`. The fold shows these controls under the key picker:

- **Decade**: a row of single-select filter chips (the shared chip component, tokens), one per decade present among the table's
  rows (`decadesPresent`), oldest first. Tapping the selected chip clears it. The row is hidden when no row of the table is
  dated.
- An undated row fails a decade criterion, the rule the BPM and key criteria already follow.
- The decade counts in `hasCriteria`: the fold's badge, "Showing N of M", **Clear filters**, and the filters' empty state all
  include it.
- A decade absent from the current rows (another playlist, another period) is ignored and never empties the table
  (`effectiveYearView`'s rule).
- The decade is kept per table for the session, like the other criteria: a module-level signal, never in the address, never
  persisted.
- **Sort by year** is a switch labelled "Sort by year, oldest first". It shows whenever the table cannot sort by year from its
  header, that is when the table draws two-line items **or** the Released column is hidden (table narrower than 720 px).
  - On, it sets the table's sort signal to `{ columnId: 'released', direction: 'asc' }`.
  - Off, it returns the table to the screen's default sort.
  - Where the header is drawn, the switch is not, and the Released header shows as sorted when the switch set the sort.
- **How the fold knows** (S13c builds it). `DataTable` measures its own width today only when `compactBelow` is given
  (`useWidth`). T132 makes it always measure and adds a prop
  `onLayout?: (layout: { twoLine: boolean; widestPriority: 1 | 2 | 3 | 4 }) => void`. `widestPriority` is the highest
  priority drawn at that width: 1 below 720 px, 2 below 960, 3 below 1120, else 4. The table calls it when either value
  changes. The screen keeps the last layout in a local state and passes
  `yearSort: { sort, offered: layout.twoLine || layout.widestPriority < 2 }` to `trackFilterView`, which draws the switch
  only when `offered` is true. No new global signal.
- The Crate's By year keeps its period controls; the decade filters its table as on the other views.

```
Filters fold (open), any track table
┌────────────────────────────────────────────────────────────────┐
│ [ Filter by title or artist           ]                        │
│ BPM [ min ] – [ max ]   Key [ 8A ▾ ]   [■] Include compatible   │
│ Decade  (70s) (80s) [90s] (2000s) (2010s) (2020s)              │
│ ( ✓ Sort by year, oldest first )  ← a toggle chip, only where  │
│                                     Released has no sortable   │
│                                     header                     │
│ Showing 12 of 128 · Clear filters                              │
└────────────────────────────────────────────────────────────────┘
```

As built (S13c): the switch is a toggle chip (`button role="switch" aria-checked`, 48 px, filled with a check while on),
not a checkbox; see [main-sync.md](../main-sync.md) §4 ruling 13.

#### 3. Track details (sheet, §11)

The **Audio** block gains one line after the key:

- "Released 1993 · ReccoBeats (earliest album)";
- "Released 1993 · album", for a year from a playlist or Top sync;
- "Released" followed by `NoData` when the track is undated.

The source comes from a pure `yearFact(model, trackId)` in `details/trackFacts.ts`, which reads the sources in `yearOf`'s order.
So the sheet and the column never disagree.

#### 4. Mix tracklist (the open mix, §12)

- **Released column** in `TracklistTable.tsx`: priority 2, 88 px, placed after In your library.
  - It reads the row's own `year`, never the library's, because the year sort uses the row's.
  - A missing year shows `NoData`.
  - The cell's tooltip and accessible name say where the year came from: "1993, from Shazam", "1993, from the ISRC (Deezer
    or MusicBrainz)", or "1993, from Spotify (Create playlist or Check on Spotify)".
  - In two-line items the year joins the meta line, and an undated row adds nothing.
  - The **In your library** column keeps BPM and key only (main's `year={false}`).
- **Sort select**: it stays at every width, because the tracklist has no header sort.
  - It gains **Year, oldest first** (value `year`) when a row is dated.
  - The select shows when a row has clip counts **or** a row is dated (main's `counted || dated`).
  - A choice the rows no longer allow falls back to Time.
- **Decade select**: placed beside Sort ("All decades", then each decade present), shown when a row is dated.
  - It combines with the review chips (All, To review, Validated, Not on Spotify, Heard once) and with the Sort.
  - It hides rows and never deletes them.
  - The caption "The others are hidden, not deleted…" shows whenever a chip other than All, or a decade, is on.
  - The row being edited stays visible whatever the view (main's rule).
- **Create playlist** is unchanged: Validated only or All tracks decides; the Sort, the chips and the decade never do.
  - Create and Check on Spotify date the undated rows they match (`yearFrom: 'spotify'`; S13b fix I1 for Check).
  - The years reach the open rows, and the saved mix even when the playlist creation fails.
  - A copy the owner saved during the run keeps the owner's review and gains the years by track (S13b M2).

```
Large, open mix (columns as TracklistTable.tsx today, plus Released)
┌ Sunrise closing set ─────────────────────────────────────────────────────────────── [Check on Spotify] ┐
│ 24 tracks · 9 validated · 18 on Spotify · 2 not found                                                   │
│ (All) (To review) (Validated) (Not on Spotify) (Heard once)     Sort [Year, oldest first ▾] Decade [90s ▾]│
├──────┬─────────────────────────┬───────┬────────┬────────────┬───────────┬────────┬─────────┬──────┬──────┬────┤
│ Time │ Artist – Title          │ Label │ Source │ Confidence │ In library│Released│ Spotify │Listen│Review│More│
│ 0:07 │ Orbital – Halcyon       │ FFRR  │ ◉      │ 3× · 91 %  │ 126 · 8A  │   1992 │ ↗       │ ⋯    │ ✓ ✕  │ ⋮  │
│ 0:41 │ Leftfield – Song of Life│ Hard  │ ◉      │ 2× · 84 %  │ —         │   1993 │ Not chk.│ ⋯    │ ○ ✕  │ ⋮  │
└──────┴─────────────────────────┴───────┴────────┴────────────┴───────────┴────────┴─────────┴──────┴──────┴────┘
Label (p4), Source and Confidence (p3) hide as the table narrows. Released (p2) hides below 720 px of table, where the
Sort select still offers the year.
```

Since spec 020 (`specs/020-mix-artist-title-columns/`) the "Artist – Title" column is two, **Artist** then **Title**, both priority 1
and each sortable (A to Z first; Title by the track name alone); the Sort select offers "Artist" and "Title". The second line
(not heard, origin, quote, references, check) stays under Title; tooltips and aria names still say "Artist – Title". On a phone the
item reads the title, the artist under it, the second line, then the label and the meta line.

#### 5. Settings · Audio data (§13), and the Activity button

- **Built in S13b (merge)**:
  - The card's description reads "BPM and key for your tracks, from ReccoBeats and your Rekordbox collection; release years
    from ReccoBeats."
  - A second `StatusLine`, "Release years: N of M tracks", sits under `coverageLine` (counted once per model).
  - The look-up's done line reads "found N · not found N · years N". "Nothing new to look up." shows only when neither a
    track nor a year was asked.
  - The progress bar's label reads "Looking up · release years" during the third pass.
  - A failure in the years pass shows in the section's existing error `StatusLine` ("Last error: …"), and the years already
    found are kept.
- **Activity button** (S13c): the look-up entry reads "Looking up release years" during the third pass and "Looking up BPM and
  key" before it. It still links to Settings.
- **The button** keeps its label **Look up BPM and key**: one run with three passes, and the card's description names the years.

#### 6. Widths

Window classes decide the frame and the layout. Table widths (container queries) decide the columns and the year sort.

| Table width (container) | Released column                | Year sort                                              |
| ----------------------- | ------------------------------ | ------------------------------------------------------ |
| two-line items          | not a column; in the meta line | Filters · "Sort by year" switch (Mix: the Sort select) |
| < 720 px                | hidden (priority 2)            | Filters · "Sort by year" switch (Mix: the Sort select) |
| 720–959 px              | shown                          | Released header (Mix: the Sort select)                 |
| 960–1119 px             | shown, with the p3 columns     | Released header (Mix: the Sort select)                 |
| ≥ 1120 px               | shown, with every column       | Released header (Mix: the Sort select)                 |

| Window class      | Typical track table                                                                     | Decade                                  |
| ----------------- | --------------------------------------------------------------------------------------- | --------------------------------------- |
| Compact < 600     | two-line items                                                                          | Filters fold chips (Mix: Decade select) |
| Medium 600–839    | about 500–760 px of table after the rail: below 720 Released hides and the switch shows | Filters fold chips (Mix: Decade select) |
| Expanded 840–1199 | full width about 700–1060 px; beside a list pane, two-line items (`compactBelow`)       | Filters fold chips (Mix: Decade select) |
| Large ≥ 1200      | about 1000 px and up: every column at 1440                                              | Filters fold chips (Mix: Decade select) |

Messages: no new message on the screens. A failure of the years pass is Settings' existing look-up error line. A pulled row's
invalid year is dropped by `validate.ts`; main's rule removes the field, never the row.

### Play-button round · Play button and Listen menu on every track list (`specs/017-track-play-button/`)

Every track table (Top tracks, Playlist, Artist, the six Crate views) starts with **Play** (`playColumn`, priority 1, 56 px, hidden
header): the Mix tracklist's ▶ (`PlayOnSpotify`, "Play {artist} – {title} on Spotify", `spotify:track:<id>`), an empty cell for a
row without a Spotify id. It ends with **Listen** (`listenColumn`, priority 1, 64 px): the Mix headphones menu, Play on Spotify and
the Spotify web page when the track has an id, then Beatport, Bandcamp, Discogs, SoundCloud and YouTube searches. It replaces the
Spotify link on those tables; Top artists, Artists, Under the radar and Playlists keep their link. On a phone ▶ is first in the
item's lead (before the cover or the rank) and the menu is in its trail. The Overview's track items get the same pair around their
link. The Mix tracklist is unchanged. Contract: `specs/017-track-play-button/contracts/track-listen.md`.
