# Quickstart: set up the worker and prove the feature works

Builds on `../001-backend-data-sync/quickstart.md` (the project exists, the app is signed in, migration 0001 applied).

## 1. Owner setup, once

1. **Nothing in the email templates**: a Free project created after 2026-06-03 on Supabase's default mailer cannot edit them
   (the owner found the body read-only on 2026-11-06); the worker signs in with the magic link instead, caught on the dev
   redirect address the project already allows. Signups stay off.
2. **Migration**: apply `supabase/migrations/0002_jobs.sql` in the SQL editor (or `supabase db push`). Check: Database →
   Functions lists `claim_job`; `jobs` has `applied_at`.
3. **Command line form** (this computer): `cd worker && cp .env.example .env`, fill `SUPABASE_URL` and `SUPABASE_KEY` with
   the two public values of the app's `.env`; `uv sync` (installs yt-dlp, ShazamIO and a static ffmpeg); `uv run mix-worker
   check` (expect: settings printed, the packaged ffmpeg and its version, "no session"); `uv run mix-worker login` → email →
   open the mail on this computer and click its link (the tab says "mix-worker is signed in") → "signed in as <email>".
   `yarn dev` must not be running during that minute (same port).
4. **Packaged form**: download the executable for the system from the release of tag `worker-v…` into a folder of its own.
   Windows: double-click once → it writes `mix-worker.env` and exits; fill the two values; double-click again → "Windows
   protected your PC" → More info → Run anyway → email → the mail's link opened on that computer → it polls. macOS: right-click → Open the first time (unsigned),
   then the same. Linux: `chmod +x mix-worker-linux-x86_64 && ./mix-worker-linux-x86_64`. Nothing else to install; for YouTube
   links, Node or Deno must be on PATH (the `check` output says whether one is).

## 2. Run

- App: `yarn dev` (`http://127.0.0.1:5173/myOwnSpotifyData/`) or the deployed site; `yarn typecheck && yarn lint && yarn test`.
- Worker tests: `python -m unittest discover -s worker/tests -t worker` (or `uv run --directory worker python -m unittest`).
- Worker: `uv run mix-worker run --once` / `run --watch`.

## 3. Validation scenarios (each maps to a spec scenario)

| # | Steps | Expect |
|---|---|---|
| 1 | Phone, Mix screen, paste a public SoundCloud set the app never saw, tap **Identify on my computer** | within 2 s: "Waiting for your computer since <time>", button disabled, "Ask again" absent; Settings shows no Spotify call (sync counters unchanged) (US1-1, SC-001) |
| 2 | Computer: `mix-worker run --once` | log: claimed `<id>` · download · `probe n/N` lines · `k tracks` · sent · cleaned; JSON in `~/Music/mix-worker`; the request folder gone; exit 0 (US1-2/3, US3-1, FR-016) |
| 3 | Phone: Settings → **Sync now with server**, open the Mix screen | the link's mix lists the rows with time, confidence, ISRC on rows Shazam reported one for; state "Done <time>"; rows editable/deletable; **Create playlist from mix** works unchanged (US1-4/5, FR-005, FR-007) |
| 4 | Paste a YouTube set URL, request, run the worker | same as 2–3; the mix shows no player, title from YouTube's metadata (edge case: non-SoundCloud link, FR-015) |
| 5 | Request a link that does not exist (`https://soundcloud.com/nobody/nothing-here`), run the worker | request "Failed <time>: Private or removed link"; **Ask again** offered; the worker's run exits 0 (US2-1/3, SC-003) |
| 6 | Request a live stream URL | "Failed: Live streams are not supported" (edge case) |
| 7 | Request a set, start the worker, Ctrl-C during the scan | the worker prints "released <id>", exit 130; the phone shows "Waiting" again after a sync; the next run takes it (US2-4, US3-3, SC-004) |
| 8 | Set `WORKER_STALE_SECONDS=60` on a second computer (or a second shell with another `WORKER_NAME`) while the first is mid-request for over a minute | the second claims the same request; the first's `done` is answered with `[]` and logged "request taken by <name>" (edge case: two computers; FR-012/13) |
| 9 | Request the same link twice while waiting | second tap: "Already requested" inline, no second row (FR-004) |
| 10 | Pause the project from the dashboard (or point `SUPABASE_URL` at a paused one), run the worker | "server paused — resume it from the dashboard", exit 3, no retry loop; the phone's button shows the Settings wording for paused (US2-5, FR-017) |
| 11 | Delete `session.json`, run the worker | "not signed in — run `mix-worker login`", exit 4, no request touched (US3-2) |
| 11b | `mix-worker login` while `yarn dev` holds port 5173 | the message names the port and `--code`, exit 4 (D8) |
| 12 | Set `WORKER_FFMPEG=/nowhere`, run `check` | names the setting and says the packaged ffmpeg is used when it is unset, exit 5; unset it: `check` prints the packaged ffmpeg's version (US3-2, FR-023) |
| 13 | Phone A applied a result; phone B syncs | B gets the mix rows through the mixes sync and shows the request as "Done", no second apply (data-model: `applied_at`) |
| 14 | Settings → **Sign out** of the server | the Mix screen's button reads the Settings signed-out wording; request states gone; mix rows kept (FR-009) |
| 15 | Settings → **Remove server data** | `jobs` empty on the dashboard; the worker's next run says "queue empty" (edge case) |
| 16 | Hand-import the kept JSON from `~/Music/mix-worker` on the Mix screen | the same rows appear as a Tracklistify import (assumption: the shape stays importable) |
| 17 | The packaged form end to end on a request (scenarios 1–3) on a Windows, a Linux and a macOS computer with no Python and no ffmpeg | same lines, same result on each (FR-021, SC-008) |
| 18 | Edit one scan row and add a manual row, then **Ask again** and run the worker | after the sync, the edited and manual rows are still there, the untouched scan rows were replaced (FR-006) |

Measure during 2: download time, probe count, scan time for the set's length (research "Sizes"); record them in the spec page
under `docs/specs/`.

## 4. Tests that pin the rules

App (`yarn test`): `url.test.ts` `requestKey`; `worker.test.ts` merge rule, `resultToRows` on the F15 fixture and on a result
without `metadata`, `jobView` rejections, `requestStatusText` for every server state × job status; `sync.test.ts` pull applies
once, marks `applied_at`, skips when another device did, rejected result counted and not marked, history meta written,
`requestIdentify` "exists"; `validate.test.ts` `validateJobRow`; `repo.test.ts` the optional fields round-trip.
Worker (`unittest`): the list in `contracts/worker.md`.
