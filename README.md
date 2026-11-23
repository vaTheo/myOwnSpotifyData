<p align="center">
  <img src="public/icon-192.png" width="96" alt="">
</p>

<h1 align="center">myOwnSpotifyData</h1>

<p align="center">
  Prepare DJ sets from your own Spotify data, in your browser.
</p>

<p align="center">
  <a href="https://vatheo.github.io/myOwnSpotifyData/"><img src="https://img.shields.io/badge/open-the%20app-1DB954?logo=spotify&logoColor=white" alt="Open the app"></a>
  <a href="https://github.com/vaTheo/myOwnSpotifyData/releases/latest"><img src="https://img.shields.io/github/v/release/vaTheo/myOwnSpotifyData?filter=worker-v%2A&label=worker&logo=github" alt="Latest worker release"></a>
  <a href="https://github.com/vaTheo/myOwnSpotifyData/pkgs/container/mix-worker"><img src="https://img.shields.io/badge/docker-ghcr.io%2Fvatheo%2Fmix--worker-2496ED?logo=docker&logoColor=white" alt="Docker image"></a>
</p>

<p align="center">
  🔥 Most played tracks · 📋 Playlists ranked by plays · 🎤 Artists by saved tracks · 🎚️ BPM and key · 🎧 DJ mix to playlist
</p>

---

## 🎧 Use the app

Nothing to install.

1. Open <https://vatheo.github.io/myOwnSpotifyData/> in your computer's browser (phone: Chrome → **Add to Home Screen**).
2. If a sign-in screen shows, type your email, tap **Send me a link**, open the link in this same browser within 10 minutes.
   No account yet? Ask the owner to add your email.
3. Tap **Connect Spotify** and log in with your Spotify account.
4. In **Settings**, tap **Sync now**. Play counts need one more step: request _Extended streaming history_ on Spotify's
   privacy page, then import the zip in **Settings → Listening history**.

## 🔎 Identify a DJ mix

The app records the request. A small program, the **worker**, answers it from a computer.

### On your computer

1. In the app, open **Mix**, paste the set's link, tap **Identify on my computer**. The row says _Queued_.
   A SoundCloud phone link (`https://on.soundcloud.com/…`) works too.
2. Download the file for your system from the [latest worker release](https://github.com/vaTheo/myOwnSpotifyData/releases/latest).
3. Put it in a folder of its own and start it. Nothing to fill in.
4. Type your email, open the email on that computer, click the link. Leave the window open.
5. The row goes _Queued → Identifying → Found tracks_ (about 40 min for a 2-hour set). Open it, review, tap **Create playlist from mix**.

### On a server (Docker)

A container has no browser: the worker signs in by password.

1. The owner creates a dedicated account and lists it as a shared worker
   ([section C, steps 1–2](worker/README.md#c-on-a-headless-linux-server-a-debian-lxc)).
2. In a folder: `docker-compose.yml` from the release, and `mix-worker.env` with that account's `WORKER_EMAIL` and
   `WORKER_PASSWORD`. Both are required: without them the container stops and restarts in a loop.
3. Run `docker compose up -d`, then `docker compose logs -f`.

Every detail: [worker README, section D](worker/README.md#d-with-docker-on-a-server).

### Good to know

- Turn your VPN off: Shazam refuses far more often with one.
- The request waits while the computer is off.
- Hard-reload the app before you start a new worker version.

## 🔒 What leaves your browser

- Your Spotify token never leaves the browser. Spotify is written to only on your tap: **Create playlist from mix** and
  **Like all songs**.
- Lookups send only ids, ISRCs and article titles, only when you start them: ReccoBeats (BPM and key);
  MusicBrainz, ListenBrainz, Deezer, Wikidata and Wikimedia (artist reach). An open mix loads its player from SoundCloud.
- The optional server is the owner's Supabase project (yours if you run the app yourself): your data is copied there,
  nowhere else. BPM, key and artist numbers found go to a store its users share, nothing personal.

Every detail: [Using the app](docs/manual/000-using-the-app.md#what-leaves-your-browser).

## 📚 More

| Page | For |
|---|---|
| [Using the app](docs/manual/000-using-the-app.md) | Every screen, what leaves your browser |
| [Identify a mix](docs/manual/100-identify-a-mix.md) | The Mix screen and the worker, step by step |
| [Owner setup](docs/manual/200-owner-setup.md) | One-time setup, the server, several people |
| [Developers](docs/manual/300-developers.md) | Run locally, the scripts |
| [Worker README](worker/README.md) | The worker's full manual: four ways to run it, settings, exit codes |
| [Documentation map](docs/README.md) | Every page of the docs |
| [CHANGELOG](CHANGELOG.md) | What changed, when |
