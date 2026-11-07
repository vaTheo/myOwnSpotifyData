# Quickstart: validating the web-first redesign

How to prove the redesign works. Each step is run at the end of the round, and the steps of a delivery stage are run when that
stage lands ([plan.md](plan.md), "Delivery order"). Contracts: [screens](contracts/screens.md), [routes](contracts/routes.md),
[tokens](contracts/design-tokens.md).

## 0. The visual loop (after every step, research D19)

```sh
yarn typecheck && yarn lint && yarn test
yarn shots                         # every page × 1440, 1024, 768, 390 px on demo data
```

Expected:

- The run exits 0. Look at the exit code, not a grep of its output.
- `shots-output/report.json` lists no failure: overflow, clipping, overlap, column alignment, target size, focus, axe WCAG 2.2 AA,
  console errors, or a request outside `127.0.0.1`.
- Every screenshot of the screens the step touched is opened and looked at, at all four widths.
- Anything misaligned is fixed and the loop runs again.
- `shots-output/contact-sheet.html` goes to the owner. The screens they approve become baselines with
  `yarn shots --update-snapshots`.

To look at the demo data by hand: `yarn dev`, then `http://127.0.0.1:5173/myOwnSpotifyData/?demo` (or `?demo=empty`,
`?demo=old-import`, `?demo=no-reach`, `?demo=locked`). The demo uses its own database and an in-memory session, so the real data
in the same browser is untouched.

## Prerequisites (the sections below)

- Node 24, `yarn`, the owner's Spotify app Client ID in `.env.local`, as always.
- Most sections can run on the demo data. Sections 11 and 12 (Overview figures, speed) use the owner's real profile.
- For sections 11 and 12: a browser profile that has already synced, imported a history, run a BPM and key lookup and an artist
  reach lookup, and saved at least one mix. The owner's own profile works; the redesign changes no stored data.
- Chrome or Edge for Lighthouse (built into DevTools).

## 1. Automated checks

```sh
yarn typecheck && yarn lint && yarn test
```

Expected: all green, including the new tests for routes, window class, sorting, keyboard movement, filters, search, chart series,
track facts, active jobs, overview blocks, and the token contrast test.

## 2. Run the app

```sh
yarn dev
```

Open `http://127.0.0.1:5173/myOwnSpotifyData/`, never `localhost`.

## 3. Widths (US1, SC-003)

Use DevTools' responsive mode at 1440 × 900, 1024 × 768, 768 × 1024 and 390 × 844. At each width visit Overview, Top, Crate,
every Crate view, Playlists, a playlist, Artists (both views), an artist, Mix with a mix open, Settings and Import.

Expected:

- The navigation is a rail at 768 px and wider, with labels beside the icons at 1440. It is a bottom bar at 390 px.
- No page scrolls sideways.
- The current destination shows its indicator and filled icon.
- Then zoom the browser to 200% at 1280 px wide. The content reflows and nothing is clipped.

## 4. Addresses (FR-002a, FR-006)

Open each address below in a fresh tab. Expected:

| Address                | Expected                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `#/`                   | Overview                                                                           |
| `#/top`                | Listening, Top tab                                                                 |
| `#/crate/year/2026-08` | Listening, Crate, By year with 2026 and August selected                            |
| `#/playlist/<id>`      | Library, Playlists. At 1440 px: list + detail. At 390 px: the playlist full screen |
| `#/artist/<key>`       | the same pattern under Library, Artists                                            |
| `#/mix/<key>`          | Mix with that saved mix open                                                       |
| `#/mix/unknown`        | the workspace with "This saved mix is not in this browser"                         |
| `#/top?d=<trackId>`    | Top with that track's details open                                                 |

Then press back. The sheet closes, the previous screen returns, and its scroll position is restored.

## 5. Tables (US2, SC-001, SC-002)

1. At 1440 × 900, open a playlist of 100+ tracks. At least 15 rows are visible, each with title, artists, plays, BPM and key in
   aligned columns.
2. Click BPM: ascending, rows without a BPM last, rank numbers unchanged. Click again: descending, missing values still last.
   Click #: back to By plays.
3. Tab into the table and use the arrow keys, Home, End and Enter. Enter opens the track's details.
4. Narrow the window from 1440 to 700 px. Album, Duration and Added hide first. Title, Plays, BPM and Key stay.
5. At 390 px, each row is two lines: title, then artists · plays · BPM · key.

## 6. Details (US3, SC-002, SC-007)

From Top, a playlist, a Crate view and an artist, open a track. Expected:

- The sheet shows album, duration, BPM, key (plus the other notations), energy and the audio data source (when known), plays,
  listening time, first and last play, starts, finished and skipped, a month chart, and the playlists as links.
- Escape closes it and focus returns to the row.
- With the sheet open at 1440 px, resize to 390 px. The details stay open, full screen.

## 7. History (US4)

- **Crate hub**: five cards with charts. Their counts and top tracks equal those inside each view.
- **Heavy rotation over 6 months**: each row's bars match the numbers in its details.
- **By year**: click a month cell on the grid. The table shows that month. Click "Winter": December of the previous year is
  included.
- **Finish rate**: each meter's band colour matches its percentage, and the legend explains the bands in words.
- **Gate**: with a profile whose history import predates month data, the hub shows the re-import card and no grid.

## 8. Settings (US5)

Walk through each state:

- never synced;
- syncing (start Sync now);
- quota lock: if one cannot be produced live, check it with the existing `syncState` unit fixtures and by reading the screen
  code;
- a lookup running;
- the server signed out and connected.

Expected:

- Every status line, warning and error from today appears in its section.
- Sync now stays disabled while busy.
- The section index scrolls to and marks each section.
- Disconnect asks the same question as today.

## 9. Mix (US6)

At 1440 px:

1. Open a saved mix from the left pane. The address becomes `#/mix/<key>`.
2. Edit a row: it becomes text fields with Save and Cancel.
3. Delete a row, add a track, then Save mix: "Saved ✓".
4. Create playlist, or check it with an account lacking the scope: every outcome shows inline in the mix pane, never as a banner.
5. Pick an earlier request from Requests: its link goes into the link field.

At 390 px, check the stacking order from the screen contract.

## 10. Search and filters (US7, SC-008)

- Press `/` on Top. The search opens.
- Type part of an artist's name. Results are grouped, five per group. Enter on an artist opens it.
- Ctrl+K from Settings opens the search too.
- On a playlist, set BPM 124–128 and key 8A with compatible keys on. Only matching rows remain, "Showing N of M" is right, and
  Clear filters restores the list.
- Time from pressing Ctrl+K to an open result is under 5 s.

## 11. Overview (US8, SC-009)

- Open the app at `#/` with the Network panel filtered on `api.spotify.com`: no request.
- Compare each card's figures with its screen: plays and range against the Crate line, the rotation's top five, the coverage
  shares in Settings, the last mix in Mix. They are identical.
- On a profile with no history, the Listening card shows its explanation and Import history.

## 12. Accessibility and speed (SC-004, SC-005)

- **Lighthouse** (DevTools, Navigation mode, desktop) on Overview, a 500-track playlist, Artists with 1,000+ rows and Mix.
  Accessibility shows no contrast or naming failure. Performance shows LCP ≤ 2.5 s and CLS < 0.1.
- **INP**: in DevTools' Performance panel, record sorting the largest table and opening a details sheet. Each interaction takes
  under 200 ms.
- **Keyboard only**: complete the inventory walkthrough (F1–F20) without the mouse. Focus is always visible as a chartreuse ring.
  The scripted part runs with `yarn shots` (`tools/shots/keyboard.shots.ts`, pages `kbd-*` at 1440 and 390 px).
- **Reduced motion**: with "Emulate prefers-reduced-motion" on, sheets and panes appear with no animation.

### The owner's speed run (T101)

On the real profile, in Chrome, with the app built as deployed but served on the dev origin, so the browser finds the same
database and Spotify the same redirect address (the dev server itself is slower and would mislead):
`yarn build && yarn preview --host 127.0.0.1 --port 5173 --strictPort`, then `http://127.0.0.1:5173/myOwnSpotifyData/`. Stop
`yarn dev` first, and keep no other tab open in that window.

1. DevTools > Lighthouse: mode **Navigation**, device **Desktop**, categories **Performance** and **Accessibility**. Run it on
   `#/` (Overview), `#/playlist/<id>` of a playlist of about 500 tracks, `#/artists` (more than 1,000 rows) and `#/mix/<url>` of a
   saved mix. Note LCP, CLS, the Performance score and any Accessibility failure (contrast, names) of each.
2. DevTools > Performance, **Record**, then on Artists (`#/artists`, more than 1,000 rows) click the **Plays** column header and
   stop: note the longest "Interaction" (INP) in the Interactions track. Record again on the 500-track playlist
   (`#/playlist/<id>`) while clicking a track row to open its details sheet: note it.
3. Report the ten numbers back (LCP and CLS for four pages, two interactions) and any Accessibility failure. Targets: LCP ≤ 2.5 s, CLS < 0.1,
   each interaction < 200 ms, no Accessibility failure. A miss is fixed in its own round.

## 13. Nothing lost (SC-006, FR-046–FR-049)

Run the F1–F20 walkthrough from the feature inventory at 1440 px and at 390 px, ticking each feature. Then confirm:

- Every `confirm()` listed in How the app works §14 still appears, with the same words.
- The Network panel shows no host that the content security policy did not already list. The font comes from the app's own
  origin.
- Rankings, Match order and Crate counts equal the previous version on the same data. Open the deployed `main` side by side
  before merging.
