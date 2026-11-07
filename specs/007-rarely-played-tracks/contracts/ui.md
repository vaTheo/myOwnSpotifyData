# UI contract: Rarely played

**Route**: `#/crate/rarely-played` (and `?d=<trackId>` for the details sheet), under Listening · Crate. Title "Rarely played"; the
top bar's way back goes to the Crate hub.

**Hub card**: sixth card "Rarely played": icon, "Songs in your playlists you barely played", the count for the default selection,
setting badge "Never".

**View** (history ready):
1. Toolbar: chips `Never` `1 play` `2 plays` `3 plays` (toggle, multi, at least one on) and a menu "All playlists" / each playlist.
2. Caption: `{n} tracks · plays counted to {import date}`.
3. Table (`CrateTable`): rank, title, artist, Plays, Playlists (`first +N`, hidden on compact), BPM, key, Released; sort and the
   Filters (BPM, key, decade) as in the other views; 100 rows a page.
4. Row opens the track details sheet.

**Empty states**: history missing or old: `CrateEmpty` (import link). No match: "Nothing at {counts}." with "Try 0 to 3 plays"
when fewer than four chips are on; one playlist with no match: "Nothing to listen to in this playlist."

**Accessibility**: chips are toggle buttons with `aria-pressed`; the menu is labelled "Playlist"; the caption is a live region
(`role="status"`); tokens only, `yarn shots` clean at four widths.
