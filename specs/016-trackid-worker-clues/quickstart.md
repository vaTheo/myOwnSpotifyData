# Quickstart: TrackId.net with the Shazam probes (round 016)

Prerequisites: round 015 merged (worker 0.6.0), a SoundCloud mix that TrackId.net knows (for example `https://soundcloud.com/yagathering/temple-rat-pinegrove-2025`, a 90-minute set with spans), and one it does not know (`https://soundcloud.com/sound-metaphors/temple-rat-live`).

## Release order

1. Merge the app change (validator, row text, badge) and wait for the Pages deploy; hard-reload the app on every device.
2. Merge the worker change and wait for the release of worker 0.7.0; download it or run from the source.

## Checks

| # | Do | Expect |
|---|---|---|
| 1 | Worker with `WORKER_TRACKID=on`, request the known mix | log shows `trackid · <title> · <n> spans · <m> guided`; the scan makes far fewer probes than `duration/15`, one per guided span plus the stretches TrackId.net does not cover |
| 2 | Open the mix in the app | rows "from TrackId.net · not heard", each with a Shazam line (agrees, heard another track, or no match); heard rows only outside the spans; every row's time ascending; no stretch has two rows |
| 3 | Request the unknown mix | log `trackid · not known`; the scan, probe count and rows are exactly as with `WORKER_TRACKID=off` |
| 4 | Same known mix with `WORKER_TRACKID=off` | today's scan; compare the Shazam call counts of 1 and 4 (expect at least 60 % fewer on 1 if TrackId.net covers 80 %) |
| 5 | Block `trackid.net` (offline or a bad host) and request the known mix | one log line, the scan is today's, the request finishes |
| 6 | Press Stop during the TrackId.net calls | the request is released as today |
| 7 | An older app tab (not reloaded) pulls the known mix | refuses the new rows (documented), no crash |

Record the output of 1, 3, 4 and the probe counts here when done.

## Recorded output

_(pending: owner-run)_
