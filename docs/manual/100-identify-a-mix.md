# 100 — Identify a mix

> **Status**: Living
> **Last updated**: 2026-11-23

The owner's manual, part two: the worker that answers **Identify on my computer**. Its full manual is [`worker/README.md`](../../worker/README.md).

## Identify a mix from your computer (optional, needs the server)

The Mix screen's **Identify on my computer** button records a request on your
server. `worker/`, a small program you run on your computer, takes it:
downloads the set's audio, recognises it twelve seconds at a time with Shazam,
sends the tracklist back (ISRC and label when Shazam knows them) and deletes
the audio. The next sync shows the rows on the Mix screen, where you review
them and tap Create playlist from mix as before. The request's state is shown
on its row of the Mixes list (waiting, running on which computer, done,
failed with the reason) with Ask again. Where the first listen found nothing, the worker
listens again (7 s later, then 4 % slower and faster) and reads the set's
description and comments: they show on those parts of the tracklist (a
comment without the name of the person who wrote it), and a
comment that names a track the free catalogues (Deezer, MusicBrainz) hold
exactly becomes a row marked "from a comment · not heard", kept like every
track: remove it if it is wrong.
A link copied in SoundCloud's phone app (`https://on.soundcloud.com/…`) can be
asked as it is (worker 0.7.4 or newer): the app records the request under that
link, the worker asks SoundCloud where it leads, only inside SoundCloud's own
hosts, and the tracks land on the mix saved under the share link. If the link
cannot be followed, the request fails with its reason ("Short link not found;
paste the set's full link", "SoundCloud did not answer for the short link; ask
again later", "Short link does not lead to a SoundCloud set"). A set asked by
its share link and later pasted by its full `soundcloud.com/…` link is saved
as two mixes.
While a set is analysed, its row in the Mixes list shows where it is ("First pass · 47 % · about
25 min left", "Paused by Shazam until 20:35"); a waiting request has **Move to
top** and **Cancel**, a running one **Stop** (it keeps the tracks found, and Ask
again continues it later). Each heard track shows how many 12-second clips
matched it and, since worker 0.7.5, how far to trust it and the speed it plays
at ("Solid ×3 · −5.8 %"; an older result shows the best score, "heard 3× · best
91 %"); sort by them, or show only the tracks heard once, Solid or Flagged to
judge them. One thing is removed for you (worker
0.7.2): a different song heard between two clips of one song at most 3 minutes
apart (A, X, A) is a false match inside that song, so the worker drops it and
the log counts it (`WORKER_MERGE_GAP_SECONDS` sets the 3 minutes). Run the
worker without a VPN: Shazam refuses far more often on one. When Shazam stops
a set anyway, the tracks found are sent at once ("Stopped early … (rate
limited)") and, since worker 0.7.3, the worker asks again by itself 30 minutes
later, up to 6 times a set, continuing where it stopped (only the worker
started with `run --watch` or a double-click, on your own account; closing it
forgets the plan, so press Ask again then). The **Mixes**
list holds every link sent beside your saved mixes, one row per link with a
chip (Queued, Identifying, Paused, Stopping…, Found tracks, Failed, Rejected,
Saved, Playlist made): running first, then waiting in the order the worker
takes them, then the rest newest first. **Check now** asks the server again
(it also checks every minute while something waits or runs); a done row opens
its saved mix, a failed one has Ask again. If a request was already taken or
finished when you tapped Cancel, Move to top or Stop, the list says so. A new
result keeps your review: Spotify answers stay, removed tracks stay removed,
and only new tracks are added.
Each track also shows its release year (Shazam's, or the earliest Deezer or
MusicBrainz give for its ISRC, or the Spotify album Create playlist matched,
which dates the undated tracks); sort **by year** or keep one **decade**,
also with Heard once.
Every identified set stays in this browser and on the server.

Four ways to run it, all in the worker's manual, [`worker/README.md`](../../worker/README.md):

- from the repo with Python and uv: `cd worker && cp .env.example .env`
  (the same two public values as the app's `.env`), `uv sync`, `uv run
  mix-worker login` (click the mail's link on that computer), `uv run
  mix-worker run --once`;
- or one packaged executable per system (Windows, Linux, macOS) from a
  `worker-v…` release: put it in a folder and start it; since 0.7.7 it knows
  the server (the release build writes in the repository secrets
  `SUPABASE_URL` and `SUPABASE_KEY`, never the code), and a value in
  the `mix-worker.env` it writes still wins. ffmpeg and yt-dlp are inside; only
  YouTube links need Node or Deno on the computer;
- or on a server with no screen (a Debian LXC), as a service: since 0.7.8
  a dedicated account listed as a shared worker signs in by itself with
  `WORKER_EMAIL` and `WORKER_PASSWORD` (form C of the manual);
- or on a server with Docker, amd64 or arm64: since 0.7.9 the image
  `ghcr.io/vatheo/mix-worker` and the release's `docker-compose.yml`, signed
  in the same way (form D of the manual).

Once, in the Supabase dashboard: run `supabase/migrations/0002_jobs.sql`.
Nothing else: the worker signs in with the same magic link as the app,
returned to a local address the project already allows. Requests wait while
the computer is off;
the audio never leaves your computer; the worker never talks to Spotify.
Since worker 0.7.0 (`WORKER_TRACKID`, on by default) it first asks TrackId.net about the exact mix link: for a mix TrackId.net knows it
makes one confirming Shazam probe per span (since 0.7.5, asked again at the second-pass speeds when it does not name the span's
track; since 0.7.6 a name written another way, "(Remastered)" or other punctuation in the artist, counts as the same track) and none other inside it, and each span is a row "from TrackId.net" with a Shazam check;
update the app (hard-reload) before using it.
By default the worker serves one account, the one that signed it in (yours): a
friend's **Identify on my computer** is recorded on the server but not taken,
and waits as Queued in their Mixes list until they Cancel it. To serve every
user, create a user with a dedicated
email in the Supabase dashboard, run `supabase/migrations/0006_shared_worker.sql`,
list that user (`insert into public.shared_workers (user_id, label) values
('<id>', 'my PC');`), and sign the worker in with that email. It then takes
one request per user in turn; delete the row to switch it off. Since worker 0.7.1 the mode follows the account (`WORKER_MODE=auto`,
the default): the worker asks the server whether the account is listed and says so on its start line; `personal` or `shared` in
`mix-worker.env` still force a mode.
## Links

- Owner's manual: [000 — Using the app](000-using-the-app.md) · [100 — Identify a mix](100-identify-a-mix.md) ·
  [200 — Owner setup](200-owner-setup.md) · [300 — Developers](300-developers.md)
- [README](../../README.md) · [Worker manual](../../worker/README.md) · [CHANGELOG](../../CHANGELOG.md)
- [How the app works](../architecture/000-how-it-works.md) · [Feature inventory](../architecture/100-features.md) ·
  [Limits and roadmap](../architecture/800-limits-roadmap.md)
- [Contributing](../dev-guide/000-contributing.md)
- [Documentation map](../README.md)
