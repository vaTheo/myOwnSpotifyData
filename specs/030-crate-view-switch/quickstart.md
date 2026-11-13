# Quickstart: checking spec 030

Demo data only, never the owner's (`?demo`). Open `http://127.0.0.1:5173/myOwnSpotifyData/?demo`, never `localhost`.

```sh
yarn                # once
yarn typecheck && yarn lint && yarn test    # read the exit code
yarn dev
```

By hand, at 1440 px then at 390 px:

1. `#/crate`: six cards, as before. Open Heavy rotation.
2. The switch names six views, Heavy rotation marked. Pick Forgotten gems: the title, the address (`#/crate/gems`) and the list change. Browser Back returns to Heavy rotation; the top bar arrow goes to the hub.
3. Set Heavy rotation to 6 months, switch away and back: still 6 months; the hub card says so.
4. Filter Heavy rotation by a word, switch to Finish rate: no filter there; come back: the filter is still set.
5. Open a track in Heavy rotation, tap "Open <month>": By year opens on that month. Switch view with a sheet open: the sheet closes.
6. `#/crate/year/2026-08` in a new tab: By year on Aug 2026. `#/crate/nope`: the hub.
7. `?demo=empty` then `#/crate/gems`: the gate card alone, saying six views.
8. `#/top`: the caption under the toolbar, for Tracks, Artists and Compare periods.
9. `#/artists`: type two letters, switch to Under the radar and back: the text and the filtering hold.
10. With a job running (demo variant with jobs), tap it in the Activity button: Settings opens on its item.

Before the PR:

```sh
yarn regression     # the rows named in plan.md step 6
yarn invariants     # the branch against main: rankings and Crate outputs identical
```

```sh
yarn shots && yarn shots:summary && yarn shots:sheet    # asked by the owner for this round: 0 findings on the pages touched
```
