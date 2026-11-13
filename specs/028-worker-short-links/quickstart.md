# Quickstart: The worker takes phone share links (round 028)

Prerequisites: the round merged; a SoundCloud set on the phone (its **Share › Copy link** gives `https://on.soundcloud.com/…`);
one set TrackId.net knows and one it does not; the worker signed in.

## Automated checks

```bash
yarn typecheck && yarn lint && yarn test
cd worker && uv run python -m unittest discover -s tests
```

Each must exit 0. No test touches the network.

## Release order

1. Merge. The app is deployed by its own job; hard-reload it on the phone and the computer.
2. The same push releases `worker-v0.7.4` (the version changed). Download it, or `git pull` and `uv sync` for the source form,
   and start it. `mix-worker --version` says `0.7.4`.
3. Only then ask from the phone. A worker 0.7.3 or older does not know share links (a shared one answers "link not allowed in
   shared mode").

## Checks (the owner's, on the real project)

| # | Do | Expect |
|---|---|---|
| 1 | On the phone, copy a set's link in the SoundCloud app, paste it in Mix, tap **Identify on my computer** | the request shows as queued; no "not a link the worker can take" |
| 2 | Watch the worker's log for that request | `claimed … · https://on.soundcloud.com/…`, then `link · https://soundcloud.com/<user>/<set>` (nothing after `?`), then the usual `download · …` |
| 3 | When it is done, open the mix on the phone | the tracks are on the mix whose link is the share link; one mix, not two |
| 4 | Same, with a set TrackId.net knows | the log shows `trackid · <title> · <n> spans`, as with the set's full link |
| 5 | Paste a share link with a wrong token (change two letters) and ask | the request fails with "Short link not found; paste the set's full link"; the log shows `link · HTTP 404` and no download line |
| 6 | Ask for a full SoundCloud link, as before | the log has no `link ·` line; everything as with 0.7.3 |
| 7 | Ask for a YouTube or Mixcloud link, as before | unchanged |
| 8 | Stop a short-link request midway, then **Ask again** | the scan resumes where it stopped |
| 9 | (shared worker, if one is listed) a friend asks with a share link | taken and identified; a link on another site still fails with "link not allowed in shared mode" |

The trim of a full link with parameters (`?in_system_playlist=…`) has no check by hand: the app trims such a link before it
records the request, so the worker never receives one from the app. The rule is pinned by the unit tests of both suites
(`src/features/mix/url.cases.json`), and check 2 shows it at work on the address a share link leads to.

## Recorded output

_(pending: owner-run)_
