# Screens contract: spec 030

Amends `specs/003-web-first-redesign/contracts/screens.md` §1, §4, §6, §9. Everything not named here is unchanged.

## §6 Crate views: the view switch

Expanded and wider, 840 px and up (a view open from the hub):

```
←  Forgotten gems                                   [search] [activity]
Heavy rotation | Forgotten gems | All-time classics | By year | Finish rate | Rarely played
[6 months | 1 year | 2 years]
Played 10+ times, nothing since Nov 2025 · 31 tracks
[filter bar]
table …                                                   [details sheet]
```

Compact and medium, below 840 px (390 px shown):

```
←  Forgotten gems
[ Forgotten gems            ▾ ]
[6 months | 1 year | 2 years]
Played 10+ times, nothing since …
list …
```

- The switch names the six views in the hub's order; the open one is marked (`aria-current="page"` on the link, the selected option in the picker).
- Each name is a link to the view's existing address, with no period and no open track.
- The top bar title is the open view's name; the up arrow leads to `#/crate`.
- Below 840 px the switch is the picker: six names do not fit in a medium window's row (found by the visual loop). It takes the full width on compact and its own width, at least five targets, on medium.
- The switch is drawn only when the Crate gate passes; the gate card is drawn alone.
- Below the switch, each view is §6 as written: control, caption, legend, filter bar, table, empty message and its action, sheet figures.
- The row never pushes the table: beside the docked sheet it scrolls inside itself.

## §4 Top: caption

Under the toolbar, one caption line:

- Tracks, with a history import: "Spotify's own ranking for this period. Plays come from your history import."
- Tracks without an import, and Artists: "Spotify's own ranking for this period."
- Compare periods: "Spotify's own ranking, period by period."

## §9 Artists: one filter text

"Filter artists" holds one text for Saved tracks and Under the radar. Under the radar's groups, sorts, columns and gate are unchanged.

## §1 Frame: Activity links

| Job | Opens |
|---|---|
| Syncing playlists | `#/settings/sync` |
| Looking up BPM and key, Looking up release years, Importing Rekordbox | `#/settings/audio` |
| Looking up artists | `#/settings/reach` |
| Saving to server, Loading from server | `#/settings/server` |
| Importing history, Liking songs, Creating playlist | unchanged |

## §5 Crate gate card: wording

- No import: "These six views are built from your Spotify Extended streaming history, …" (rest unchanged).
- Import again: "The Crate's views need data the old import didn't keep. Your play counts still work everywhere else."
