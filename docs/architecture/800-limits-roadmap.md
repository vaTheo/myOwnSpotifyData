# 800 — Limits and roadmap

> **Status**: Living
> **Last updated**: 2026-11-08

What the app cannot do, what was decided against, and the ideas not built yet. A row moves to the
[feature inventory](100-features.md) once it ships. The decisions that cause most of these limits are in the
[ADR index](700-adr/README.md).

## 1. Platform limits (cannot be fixed in the app)

| Limit | Why | Source |
|---|---|---|
| No play counts from Spotify's Web API | the API has none; only the history export carries them | [ADR-07](700-adr/ADR-07-play-counts-from-export.md), [platform research](../research/2026-09-04-spotify-platform-research.md) |
| Daily quota on playlist reads, lock-out of hours | unpublished Spotify limit | [ADR-02](700-adr/ADR-02-no-spotify-reads-on-load.md) |
| Development Mode: owner listed in User Management, Premium | Spotify app mode | [README](../../README.md) "One-time setup" |
| No Spotify audio features, artist followers or popularity for new apps | Spotify stopped answering them | [BPM research](../research/2026-09-05-bpm-key-sources.md), [reach research](../research/2026-09-05-artist-reach-sources.md) |
| A token refresh never widens the scope | OAuth: the refresh keeps the original grant | [ADR-03](700-adr/ADR-03-library-writes-on-tap.md) |
| No browser-only path returns a full mix tracklist | public sources only know already-identified mixes | [Mix tracklist spec](../specs/2026-09-06-mix-tracklist-design.md) |
| Real Spotify playlist folders | not in the API | [Tracklistify spec](../specs/2026-09-28-tracklistify-import-design.md) |

## 2. Known limits of what is built

- Mix tracklist is a draft with holes: TrackId identified 32.6% of one measured 190-minute mix; a fresh upload is often absent.
- TrackId.net with the Shazam probes (round 016, [ADR-17](700-adr/ADR-17-trackid-worker.md)): coverage is partial (a mix TrackId.net does not know is scanned as before); a
  wrong TrackId.net timeline is shown as `differs` on the row, never corrected; the keyword endpoint is not used (a mix is found by its exact link only); a record
  is fetched once per request, no per-run cache; an old app refuses the new rows (update and hard-reload the app first); the Shazam check of a span with no
  confirming probe is `not_asked`; a neighbour's tail heard at a span boundary and naming another track may still be a row beside the span (such a hit is absorbed only when its probe window's center is inside the span); a refusal, a Stop or an unreachable first pass with only absorbed hits sends the TrackId.net rows instead of failing; the worker
  reports a progress step `trackid`.
- Artist reach covers only artists with a Spotify id who appear in a synced playlist; plays shown are plays of saved tracks.
- `N languages` (Wikidata sitelinks) is a floor, not an exact count.
- Playlist name and description caps (100 / 300) are defensive guesses, not measured Spotify maxima.
- A Tracklistify `tracklist.json` without `mix_info.audio_filename` and `.title` is refused.
- No DOM or component tests in `yarn test`: the UI is checked by the dev-only visual loop (`yarn shots`, every page at four
  widths on demo data, [ADR-11](700-adr/ADR-11-web-first-material-3.md)) and by hand; it runs on Chromium and Firefox here,
  WebKit needs system libraries (libicu74, libjpeg-turbo8) the owner's Debian lacks. It is not run in CI.
- Check on Spotify (F21) saves its answers when it ends: a page reload in the middle loses the answers read so far.
- A Spotify link pasted on a Mix row (F28) is trusted as given, never verified: a wrong link adds the wrong track until replaced;
  `spotify.link` short links (they need a redirect) are refused. It is saved like an edit: at once on a saved mix (spec 024); on a
  lookup never saved, a reload before Save mix loses it.
- The marked Mix row (F29) is the place of a row in the list, kept for the page only: a reload or another mix forgets it; a delete,
  a paste, the description, a lookup or a reopened mix clears it rather than follow the track; an answer written into the rows in
  place (Check on Spotify, release years) keeps it. A worker result or another device's change reaches the open list after a pull
  (spec 024), which clears it. The glow may be clipped at the scroll container's left and right edges (the bar and lines stay).
- The redesign's speed targets (LCP ≤ 2.5 s, INP < 200 ms, CLS < 0.1) are checked on demo data only until the owner runs
  the speed run on the real profile (`specs/003-web-first-redesign/quickstart.md` §12).
- The worker (F19): Shazam's tolerance for unauthenticated calls is undocumented; the pacing (one 12 s probe a minute, 3 s
  cooldown, one pause) is a guess from the surviving Tracklistify copy, and a second refusal fails the request. A set is sampled
  once a minute, so a track played under a minute can be missed. The executables are unsigned; the ffmpeg inside is a GPL build;
  YouTube links need Node or Deno on the computer. Requests wait while the computer is off.
  Since worker 0.7.2 (the sandwich round, F35) a song heard between two clips of one song at most the merge gap apart (A, X, A,
  3 minutes by default) is dropped as a false match: a DJ who really plays X inside that stretch loses it, and two songs
  interleaved within the gap (A, B, A, B) keep only the first A and the last B.
  Since worker 0.7.3 (the auto-resume round, F39) a set stopped by refusals is asked again by itself 30 minutes later, at most 6
  times; the plan is kept in memory only, so a worker closed or restarted during the wait forgets it (press Ask again), and a shared
  worker or `run --once` never asks again by itself.
- The server (F18) is a Supabase Free project: it pauses after a week without traffic and only the dashboard resumes it; 500 MB
  of database; no automatic backups; a sign-in link only works in the browser that asked for it, within 10 minutes; the built-in
  email service sends a few links an hour at most.
- Release years (F20) are only as good as their source: ReccoBeats' earliest album (asked only for songs Spotify does not already
  date, since the round 006 fix, so a dated song shows its album's year), else the album a playlist or Top list
  holds (often a remaster or a compilation), else Shazam's or a catalogue's year for the ISRC heard; a year no source has shows
  as a dash ("no data") and sorts last. The first BPM run with years takes about 45 minutes for a 5,000-track library (one request a second);
  a playlist synced before 2026-11-07 is downloaded once more by the next Spotify sync (round 006 fix: no `withYears` marker) and then has its album years; a set saved before then gets
  years only when it is identified again (or on Create playlist, from the matched album).
- Automatic updates (F22): the Spotify sync age (12 hours) is fixed in code (`AUTO_SYNC_AGE_MS`); an automatic run takes no wake lock,
  so a long first run stalls while the phone sleeps and continues on return; two devices running the reach run at once each push and
  the newer dataset wins; a step that failed waits for the next open or its button; Spotify's lock-out is known per device only, so
  another device's chain may try one sync during a lock (then it is locked too) ([ADR-12](700-adr/ADR-12-automatic-updates.md)).
- A saved mix changed on two devices at once (F40, spec 024): the server keeps the copy saved last, per mix, by its saved time;
  the other device's change since its last pull is lost (a song deleted there comes back). An open mix follows a newer pulled
  copy only when it holds no change of its own (no Add track row left blank, no Edit or Link form open); otherwise its next save
  wins. The other device sees a change at its next sync (open, return to the tab, back online, or the 60 s poll while a request
  runs), not live.
- Server rows are stored in clear (the owner declined client-side encryption): whoever holds the supabase.com login can read them.
- Several people, one app (F27, round 011, [ADR-14](700-adr/ADR-14-users-by-server-account.md)):
  - No "remove this person from this device" button: every user's copy stays on a shared device until the browser's data is
    cleared (the spec's out of scope for now).
  - The Free project's storage and Spotify's daily read quota belong to the app and are shared by every user; the lock-out on a
    device stops every user there.
  - The data stored on a device before the update goes to whoever signs in there first.
  - When the server session ends mid-use (a refused refresh), the sign-in screen replaces the app at once; whether unsaved Mix
    Workspace edits survive that is not verified, and a job already running continues in the background until it ends.
  - Sign out checks for a running job or push and then awaits the server sign-out: a push that starts in that short window can
    run while the session is removed.
  - Another tab's sign-out, or a failed refresh there, reloads this tab even while a Spotify job runs here.
  - `scopedStorage` in `src/server/userScope.ts` is used by its tests only (the app uses `scopedView`, `scopeBrowser.ts`).
  - The server rules audit (`src/server/rules.test.ts`) does not see a `create table` inside a `do` body (dollar-quoted bodies are
    set aside), and reads a function declared `returns table (…)` as an unrecognised table statement (a false alarm, never a miss).
  - The user-data audit (`specs/011-multi-user-data/audit.md`, T022) left ten Minor findings open; its three Important ones are
    fixed (T023). Each with the fix it would take:
    - F4: a refresh that finishes after another tab signed someone else in writes the old person's rotated tokens over the new
      session (one round trip wide); the fix would be to re-read storage before saving and save only if the refreshed token is
      still the stored one.
    - F5: when the server session ends mid-use, the automatic chain's queued steps (BPM and key, reach) and a running Spotify sync
      go on behind the sign-in screen, for the same person only; the fix would be to add the gate to the chain's `signedIn` and
      stop the chain when the gate shows.
    - F6: a friend's **Identify on my computer** request waits forever: the worker serves only the account that logged it in;
      the fix would be to say so in the README or hide the button for other accounts (isolation itself is right).
    - F7: a refused or full `localStorage` is not always shown: opening a sign-in link then stays on "Signing you in..." and
      **Send me a link** fails silently; storage blocked outright stops the app at load; the fix would be to guard those writes
      and the module-load reads and show the storage message.
    - F8: the device's claim is one `localStorage` key: if it alone is lost, the next person to sign in becomes the claimer of the
      pre-update data; the fix would be to refuse to claim when that data exists without the key (judged not worth it).
    - F9: Disconnect does not reset the server pending line, the Mix screen's request history or the create choice, and does not
      wait for a running push (same person, no leak); the fix would be to reset those three and refuse while a push runs.
    - F10: signing out offline (or with an expired token) removes the session here but the server is not told, and nothing says
      so; the fix would be a warning on the sign-in screen when the server sign-out did not succeed.
    - F11: Settings' storage share is the whole project's database size, so every user sees the total and its changes; the fix
      would be to sum the caller's own rows instead.
    - F12: the app cannot tell a user that another user already uses the same Spotify account (the server hides other users'
      rows, which is the point); each user's data stays separate and nothing merges. The spec now says so.
    - F13: the key notation and the Automatic updates switch are per device, so a second person inherits them, and the device
      keeps every user's email in clear; the fix would be per-user preferences (a `meta` row each), only if the owner wants it.
- One worker for every user (F31, round 015, [ADR-16](700-adr/ADR-16-shared-worker.md)):
  - No cap on how many requests one user can queue; the fair turn only orders users, so one user with many requests takes every
    other turn, never more.
  - Two users who ask the same link are identified twice; no result is shared.
  - No app screen for workers: the list is edited in the SQL editor, and a user cannot see which worker took a request.
  - An owner can set `claimed_by_user` on their own request through the app's update policy; the only effect is on that request
    (a shared worker will not write to a row it does not hold, so it is left stalled until the stale limit).
  - Shared mode fetches SoundCloud links only (`https` on `soundcloud.com`, `www.` or `m.`); a request with any other link fails
    with "link not allowed in shared mode". Personal mode fetches whatever yt-dlp can.
  - After a personal worker takes over a stale request, `jobs.claimed_by_user` can still hold the earlier shared worker's id;
    harmless, since a write also needs the same worker name.
  - A 42501 on a progress write (a worker removed from the list) is only logged, so a disabled worker stops one step later, at its
    next claim or finish.
  - Not verified on the real project until the owner's run (T023).
- Shared track and artist facts (F30, round 014, [ADR-15](700-adr/ADR-15-shared-track-facts.md)):
  - A wrong shared value is fixed in the Supabase dashboard (Table Editor); no user can change or delete a row, and a valid but
    wrong first value stays for everyone until then. `added_at` is client-writable but harmless.
  - Partial rows are never completed: a store hit with only a BPM or only a key is final locally and for everyone.
  - Release years are not shared, so the year pass still costs one request per track; the saving is on the by-id and ISRC passes.
  - MusicBrainz and Deezer ids are not shared, so the reach shortcut saves only the ListenBrainz and Deezer-fans requests; the
    Deezer-id-by-ISRC step still runs for artists whose fans came from the store.
  - No screen for the store: the owner reads it in the dashboard only.
  - The 200-id cap is on reads only; an insert batch is not bounded, so a signed-in user could fill the free tier (the owner adds every
    user, so the trust model accepts it).
  - No backfill: values found before the round are not uploaded; the owner clears the results and runs again (no button for it).
  - The real-project run (`specs/014-shared-track-facts/quickstart.md`, T033) is the owner's and pending.

## 3. Out of scope, decided (not to be re-litigated without the owner)

Each spec has an "Out of scope" block; the main ones:

- Any server of the owner's own, Cloudflare Worker or paid service; the one exception is the owner's free-tier database with sign-in, declared by one second setting ([ADR-08](700-adr/ADR-08-owner-server-free-tier.md), which supersedes [ADR-01](700-adr/ADR-01-browser-only-pkce.md) on this point).
- Name search for artists or tracks in the reach and lookup jobs ([ADR-04](700-adr/ADR-04-keyless-sources-by-id.md)); the one
  exception is the worker's lookup of a clue without identifier, exact equality only and marked as such
  ([ADR-10](700-adr/ADR-10-name-lookup-for-clues.md)).
- Any audio fetch, fingerprinting or recognition **in the app or on the server**; the worker on the owner's computer does it
  ([ADR-09](700-adr/ADR-09-mix-identification-on-the-owners-computer.md)). MixesDB/1001Tracklists scraping (the worker reads the set's own description and comments through yt-dlp only).
- Adding to an existing playlist, editing a created playlist, public playlists, cover images.
- Light theme: not built, the owner's choice (dark only, no theme switch; [ADR-11](700-adr/ADR-11-web-first-material-3.md)).
  Adding one later would be its own small round on the same tokens.
- In-app confirmation dialogs: the browser's `confirm()` stays, word for word (How the app works §14).
- Adjustable Crate thresholds, a single blended reach score, a reach number on track rows. (Charts of the existing data were
  out of scope until the redesign, F21, which draws them.)
- Commit hooks, Dependabot, branch protection, PR templates, a docs checker ([ADR-06](700-adr/ADR-06-lean-tooling.md)).

## 4. Roadmap

Release years shipped on 2026-11-07 (F20, round 005), after the worker round (F19, 2026-11-06). Nothing is decided next; candidates discussed: a column of starts under 30 s on
track rows or a Crate-only play threshold, Linux/macOS binaries are already built, a second job kind on the same queue. New ideas are discussed with the owner first, get a dated spec under
[specs](../specs/), and are listed here until they ship.

| Idea | State | Notes |
|---|---|---|
| — | — | — |

## Links

- [Feature inventory](100-features.md)
- [How the app works](000-how-it-works.md)
- [ADR index](700-adr/README.md)
- [Specs](../specs/) · [Research](../research/)
- [Contributing](../dev-guide/000-contributing.md)
- [Documentation map](../README.md)

- **Long lists only append (round 008).** Scrolling adds 100 rows at a time and keeps every drawn row, so a 20,000-row list scrolled to the end holds all of them in the page. Windowing (drawing only the rows on screen) is the follow-up if a phone slows down.
