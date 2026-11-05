# Spotify platform research (2026-09-04)

Raw output of two research workflows run on 2026-09-04 (17 agents, ~1,150 page reads). Each high-impact claim was re-checked by an independent fact-checker against the linked source. This file is a reference for implementation; the design spec (`../specs/2026-09-04-spotify-dj-webapp-design.md`) is the authority on what we build. Where the two disagree, the spec wins.

---

# Part 1: Web API, auth, hosting, storage, stack

# Research brief: single-user Spotify DJ web app (as of 2026-09-04)

Scope: browser-only SPA (TypeScript, Vite 8, Node 24, yarn 1) for one DJ: top tracks/artists, artist counts across hundreds of playlists, client-side track search with "which playlists contain it". Every claim below was checked by a fact-checker; items marked (secondary) or (unverified) are not from an official source. Section 8 lists claims the checker corrected; section 9 lists what remains open.

## 1. Auth and platform policy

**Flow: Authorization Code + PKCE, fully in the browser, no backend, no client secret.**
- Authorize: `GET https://accounts.spotify.com/authorize` with `client_id`, `response_type=code`, `redirect_uri`, `code_challenge_method=S256`, `code_challenge`, optional `scope` (space-separated) and `state` (use it). Code verifier 43-128 chars. https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow
- Exchange: `POST https://accounts.spotify.com/api/token`, `Content-Type: application/x-www-form-urlencoded`, body `grant_type=authorization_code, code, redirect_uri, client_id, code_verifier`. Response: `access_token`, `token_type=Bearer`, `scope`, `expires_in` (3600), `refresh_token`. `redirect_uri` must match the authorize request exactly. Same URL.
- Access tokens last 1 hour; send as `Authorization: Bearer <token>`. https://developer.spotify.com/documentation/web-api/concepts/access-token
- Refresh (public client): `POST https://accounts.spotify.com/api/token`, body `grant_type=refresh_token, refresh_token, client_id`; no Authorization header. Response may or may not include a new `refresh_token`; official text: "When a refresh token is not returned, continue using the existing token." https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens
- Rotation is undocumented (unclear). Spotify's own PKCE sample overwrites the stored refresh token on every refresh (https://raw.githubusercontent.com/spotify/web-api-examples/master/authorization/authorization_code_pkce/public/app.js); a TS-SDK contributor says PKCE refresh tokens are single-use (https://api.github.com/repos/spotify/spotify-web-api-ts-sdk/issues/79/comments). Design for rotation: persist the new token whenever present, keep the old one only if absent, single-flight refreshes (two tabs must never refresh concurrently).
- Refresh tokens expire 6 months after the ORIGINAL authorization; refreshing does not extend it; expiry returns HTTP 400 `{"error":"invalid_grant"}`; discard tokens and restart login; staff: "Don't retry a failed refresh". Effective 2026-06-18 (new apps) / 2026-07-20 (existing). https://developer.spotify.com/blog/2026-06-18-refresh-token-expiration , https://community.spotify.com/t5/Spotify-for-Developers/Refresh-token-expiration-discussion-thread/td-p/7474150 (secondary)
- A throttled ~1,000-request sync can exceed 1 hour: refresh mid-sync.
- CORS: `api.spotify.com/v1/me` and the token endpoint answer cross-origin requests with `access-control-allow-origin: <Origin>`, methods GET/POST/OPTIONS/PUT/DELETE/PATCH, headers incl. Authorization; preflight to the token endpoint returns 204 (empirical, curl, 2026-09-04). Spotify's own how-to is a Vite + TS SPA with redirect `http://127.0.0.1:5173/callback`. https://developer.spotify.com/documentation/web-api/howtos/web-app-profile
- Implicit grant (`response_type=token`) is gone since 2025-11-27. https://developer.spotify.com/blog/2025-10-14-reminder-oauth-migration-27-nov-2025

**Redirect URI rules** (https://developer.spotify.com/documentation/web-api/concepts/redirect_uri):
- HTTPS required except loopback IP literals `http://127.0.0.1:PORT` or `http://[::1]:PORT`. `localhost` is rejected. LAN `http://192.168.x.x` is rejected (non-loopback HTTP). Custom schemes still allowed. https://developer.spotify.com/blog/2025-02-12-increasing-the-security-requirements-for-integrating-with-spotify
- Exact string match (case, path, trailing slash). Loopback URIs may be registered without a port and get the port at authorization time. Several URIs per app: register the production HTTPS URL and `http://127.0.0.1:5173/callback`. https://developer.spotify.com/documentation/web-api/concepts/apps
- Vite's default dev server already answers on `http://127.0.0.1:5173/` (empirical); just open that URL, never `localhost`. https://vite.dev/config/server-options

**Development Mode is the only mode available** (https://developer.spotify.com/documentation/web-api/concepts/quota-modes):
- Owner must hold Spotify Premium continuously ("If the owner's Premium subscription lapses, the app will stop working"). Up to 5 allow-listed users per Client ID (Dashboard > app > Settings > Users Management). Up to 25 Client IDs per developer since July 2026; quota shared across all of them. https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security , https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates
- A Client ID created now gets the restricted endpoint set (section 3) since 2026-02-11. The March 9 postponement only concerned existing integrations and even that is contradicted by the migration guide (see section 8). https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide
- Non-allow-listed users can log in but every API call returns 403; treat 403 on `/me` as "not allow-listed", not a scope error. Whether the owner must add their own account is undocumented; add it anyway.
- Extended Quota Mode: organizations only since 2025-05-15, legal entity, launched service, >=250k MAU. Not reachable for this app.
- App name must not begin with "Spot"; name and description appear on the consent screen.

**Scopes** (https://developer.spotify.com/documentation/web-api/concepts/scopes): request exactly `user-top-read playlist-read-private playlist-read-collaborative user-library-read user-read-recently-played`. `GET /me` needs no scope for `id`, `display_name`, `images`, `account_id`. Skip `user-read-private` / `user-read-email`: `country`, `email`, `product`, `explicit_content`, `followers` are removed for dev-mode apps. `user-follow-read` only if you call `GET /me/following`.

**Caching and attribution rules**:
- Developer Terms v10 (2025-05-15) IV.3.1/3.2: no storing/aggregating databases of Spotify Content beyond what is strictly necessary; "Do not store Spotify Content indefinitely"; local caching only "temporary caching of (1) metadata and cover art"; keep data up to date and delete older data; on disconnect delete the user's data within 5 days (Appendix A 5.c); no ML/AI training. No numeric cache TTL is given. https://developer.spotify.com/terms
- Developer Policy (2025-05-15): attribute displayed content with the Spotify marks; metadata and cover art must link back to Spotify; provide an easily accessible "disconnect" that wipes data; III.13 "Do not analyze the Spotify Content ... creating new or derived listenership metrics ... usage statistics, user metrics" (see section 9); III.10 personal non-commercial use. https://developer.spotify.com/policy
- Design guidelines: Spotify logo/icon near any metadata; link text like "OPEN SPOTIFY" / "PLAY ON SPOTIFY"; artwork unaltered, 4 px corner radius on small devices, 8 px on larger; no co-branding; "for Spotify" naming acceptable. https://developer.spotify.com/documentation/design
- Consequence: IndexedDB cache = rebuildable performance cache with visible "last synced" time, refresh action, snapshot_id invalidation, and a disconnect button that clears tokens and all cached content.

## 2. Endpoint cheat-sheet (Development Mode, new Client ID)

| Endpoint | Path | Max limit | Key params | Scope | Notes |
|---|---|---|---|---|---|
| Top items | `GET /me/top/{artists\|tracks}` | 50 (default 20) | `time_range` short_term (~4 wk) / medium_term (~6 mo, default) / long_term (~1 yr), `offset` | user-top-read | Affinity ranking, not play counts. Offset >=50 reportedly returns empty (2020, secondary: https://github.com/spotify/web-api/issues/1592); "offset=49 trick" and daily refresh unverified. https://developer.spotify.com/documentation/web-api/reference/get-users-top-artists-and-tracks |
| Current user's playlists | `GET /me/playlists` | 50 (default 20); offset max 100,000 | `limit`, `offset` | playlist-read-private (+ playlist-read-collaborative to include collaborative) | Owned AND followed. Use `id, name, owner.id, collaborative, public, snapshot_id, images, items.total` (`tracks` deprecated). No embedded entries. Entries in the list may be null (community, unverified): filter defensively. https://developer.spotify.com/documentation/web-api/reference/get-a-list-of-current-users-playlists |
| Playlist | `GET /playlists/{id}` | embedded `items` page size not stated (historically 100; measure) | `market`, `fields`, `additional_types` | playlist-read-private | `items` present only for owned/collaborative playlists; otherwise metadata only. Returns `snapshot_id`. https://developer.spotify.com/documentation/web-api/reference/get-playlist |
| Playlist items | `GET /playlists/{id}/items` | 50 (default 20) | `offset`, `fields`, `market`, `additional_types` (track, episode) | playlist-read-private | 403 unless owner or collaborator. Read `items[].item` (`track` deprecated); `added_at` nullable, `added_by` nullable, `is_local`; `item` may be null (spotify/web-api#958, open since 2018); branch on `item.type` (track vs episode). `/playlists/{id}/tracks` is REMOVED (403). `fields` examples still use `track(...)`; `item(...)` untested. https://developer.spotify.com/documentation/web-api/reference/get-playlists-items |
| Saved tracks | `GET /me/tracks` | 50 (default 20) | `offset`, `market` | user-library-read | Items `{added_at, track}` (still `track`). `popularity`, `preview_url`, `available_markets`, `linked_from` deprecated. "Liked Songs" not in `/me/playlists` (unverified but long-standing). https://developer.spotify.com/documentation/web-api/reference/get-users-saved-tracks |
| Recently played | `GET /me/player/recently-played` | 50 (default 20) | `after` / `before` (Unix ms, mutually exclusive) | user-read-recently-played | Cursor paging; no podcast episodes; only ~50 most recent plays retrievable (secondary: https://github.com/spotify/web-api/issues/627). https://developer.spotify.com/documentation/web-api/reference/get-recently-played |
| Several tracks | `GET /tracks?ids=` | was 50 | - | - | REMOVED for dev mode. Use `GET /tracks/{id}` per id (1 request each). https://developer.spotify.com/documentation/web-api/references/changes/february-2026 |
| Several artists | `GET /artists?ids=` | was 50 | - | - | REMOVED. Use `GET /artists/{id}`; `followers`/`popularity` removed, `genres` deprecated (often empty). https://developer.spotify.com/documentation/web-api/reference/get-an-artist |
| Search | `GET /search` | 10 (default 5); offset 0-1000 | `q`, `type` (required; album, artist, playlist, track, show, episode, audiobook), `market`, `include_external` | none required (`user-read-private` only for market-from-token) | Catalog search, not library search; field filters `artist:`, `track:`, `album:`, `year:`, `isrc:`, `genre:`. Unsuitable for the "search my tracks" feature. https://developer.spotify.com/documentation/web-api/reference/search |
| Current profile | `GET /me` | - | - | none for `id`, `display_name`, `images`, `account_id` | Needed once for `owner.id === me.id`. `account_id` (immutable, May 2026) preferred as cache namespace. https://developer.spotify.com/documentation/web-api/reference/get-current-users-profile |
| Followed artists | `GET /me/following?type=artist` | 50 | `after` (last artist id) | user-follow-read | Optional. https://developer.spotify.com/documentation/web-api/reference/get-followed |

Also still available: `GET /artists/{id}/albums` (max 10), `GET /albums/{id}`, `GET /albums/{id}/tracks`, `GET /tracks/{id}`, player endpoints, `PUT/DELETE /me/library`. Full list: https://developer.spotify.com/documentation/web-api/references/changes/february-2026

Object changes: playlist `tracks` -> `items`, `tracks.tracks` -> `items.items`, `tracks.tracks.track` -> `items.items.item`. Track/album `external_ids` (ISRC/UPC) were REVERTED to available in March 2026 (https://developer.spotify.com/documentation/web-api/references/changes/march-2026). Track relinking may substitute a different track id when a market applies and `linked_from` is removed, so dedupe by ISRC or (name, artists, duration) as fallback (https://developer.spotify.com/documentation/web-api/concepts/track-relinking). Local files: `is_local: true`, `id: null`, URI `spotify:local:{artist}:{album}:{title}:{seconds}`; key them by URI (https://developer.spotify.com/documentation/web-api/concepts/playlists). Playlists reportedly cap at 10,000 items (community, unverified).

## 3. Capabilities NOT available to a new app

Removed 2024-11-27 for new and dev-mode apps (https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api): Audio Features, Audio Analysis, Recommendations, Related Artists, Featured Playlists, Category Playlists, 30-second `preview_url` in multi-get responses, algorithmic and Spotify-owned editorial playlists. Reference pages carry Deprecated banners (https://developer.spotify.com/documentation/web-api/reference/get-audio-features); third parties report 403 (https://dev.to/birrings/spotifys-audiofeatures-api-died-in-2024-heres-what-i-built-to-replace-it-3dn3, secondary).

Removed February 2026 (https://developer.spotify.com/documentation/web-api/references/changes/february-2026): all batch GETs (`/tracks`, `/artists`, `/albums`, `/episodes`, `/shows`, `/audiobooks`, `/chapters`), `GET /artists/{id}/top-tracks`, `/browse/new-releases`, `/browse/categories`, `GET /users/{id}`, `GET /users/{id}/playlists`, `GET /markets`, `GET /playlists/{id}/tracks`, per-type save/follow/check endpoints. Fields removed: Track `popularity`, `available_markets`, `linked_from`; Artist `followers`, `popularity`; Album `label`, `popularity`, `album_group`, `available_markets`; User `country`, `email`, `explicit_content`, `followers`, `product`. Artist `genres` and Track `preview_url` are marked Deprecated on their reference pages (https://developer.spotify.com/documentation/web-api/reference/get-track).

What this means for a DJ app:
- No BPM, key, energy, danceability, or audio analysis from Spotify. If needed, plan an external source: Apple Music API (tempo/key), local analysis with Essentia, AcousticBrainz dumps, third-party BPM APIs, or manual tagging. Do not build the UI around Spotify-provided audio features.
- No `popularity` for ranking; no play counts anywhere in the API. "Most played" = `GET /me/top/*` across three ranges plus the last ~50 recently played. For real counts the owner can request the "Extended streaming history" export (per-stream records with msPlayed, track URI) from account privacy settings as an offline input (https://support.spotify.com/us/article/understanding-my-data/), or poll recently-played on a schedule and persist `played_at`.
- Artist statistics must come from the `artists[{id,name}]` arrays embedded in playlist items; no batch enrichment, and per-artist lookups cost one request each and may return empty `genres`. Genre grouping is best-effort only.
- Playlist coverage shrinks to playlists the DJ OWNS or COLLABORATES on. Followed playlists (other users, Spotify editorial) return 403 on items and metadata-only on `GET /playlists/{id}`; whether Spotify-owned playlists appear at all in `/me/playlists` is unverified (community says omitted/404). Show them as "not syncable" rows.
- No preview playback; every track/artist/playlist links out to `external_urls.spotify` instead.
- Search endpoint capped at 10 results per call: the track-search feature must be client-side over the local index.

## 4. Rate limiting and bulk-fetch strategy

Facts (https://developer.spotify.com/documentation/web-api/concepts/rate-limits, https://developer.spotify.com/documentation/web-api/concepts/quota-modes, https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates):
- Rate limit: rolling 30-second window, numeric limit unpublished and lower in dev mode; 429 "normally" carries `Retry-After` (seconds). The "~180 req/min" figure is 2020-era folklore, unverified.
- Quota: separate mechanism, counted per developer account across all Client IDs, grouped into undocumented "quota buckets" ("subject to change"); exhaustion returns 429 with body `{"error":{"status":429,"message":"Too many requests","reason":"QUOTA_EXCEEDED"}}`. No numbers published.
- `Retry-After` may not be readable from browser JS: `api.spotify.com` reportedly does not send `Access-Control-Expose-Headers: Retry-After` (https://github.com/spotify/web-api/issues/159, secondary, since 2016, no fix found). Implement a fallback exponential backoff for when `response.headers.get('Retry-After')` is null.
- Spotify's own guidance: store `snapshot_id` to avoid refreshing unchanged playlists; lazy-load; watch the Dashboard request graph. The page's "use batch APIs" tip is stale for dev mode.

Concrete request budgets (all list endpoints page at 50):
- Playlist listing: ceil(N/50); 300 playlists = 6 requests. This is the cheap "what changed" probe: gives every `snapshot_id` and `items.total`.
- Items: ceil(total/50) per owned playlist. 300 playlists x 100 tracks = ~600 requests; 50k entries = ~1,000 requests; a 10,000-item playlist = 200 requests.
- Top items: 2 types x 3 ranges x 1 request (limit 50) = 6 (12 if probing offset 49). Recently played: 1 request. Saved tracks: ceil(total/50).
- A full first sync of a large library is on the order of 1,000 requests and may take more than an hour when throttled; later syncs cost <10 requests plus only changed playlists.

Strategy:
1. `GET /me` once; page `GET /me/playlists` completely (never partially: deletions are detected only by diffing a complete listing, since "delete" = unfollow, https://developer.spotify.com/documentation/web-api/concepts/playlists).
2. Diff against cache: ids gone -> delete their entries; playlists with `owner.id !== me.id && !collaborative` -> metadata only, never fetch items (avoid guaranteed 403s); unchanged `snapshot_id` -> skip.
3. For new/changed playlists page `/playlists/{id}/items` with `limit=50`, concurrency 2-4, a `fields` filter (probe `items(item(...))` vs `items(track(...))` once at startup; include `next,total` at top level and `type` inside the item so pagination and type branching survive), replace that playlist's entries in one IndexedDB transaction, and write the new `snapshot_id` LAST so an interrupted sync retries it.
4. 429 without `QUOTA_EXCEEDED`: sleep `Retry-After` (or backoff) and continue. 429 with `QUOTA_EXCEEDED`: stop, persist progress (playlist id + offset), resume later. 400 `invalid_grant` on refresh: pause sync, prompt re-login (keep the cache).
5. Refresh the access token proactively when `expires_at` is near; sync runs longer than 1 hour.
6. Never sync on every page load; sync on demand with per-playlist progress. Tolerate spurious `snapshot_id` changes (metadata edits undocumented; community reports 10-60 s lag after edits, unverified) and schedule an occasional full resync.
7. Handle `item == null`, `item.type === 'episode'` (no artists), `is_local` (no id), relinked ids (dedupe by ISRC).

## 5. Hosting recommendation

Constraints: private repo on (assumed) GitHub Free; HTTPS required for the phone-facing redirect URI; only ONE stable production hostname can be registered (preview/branch hostnames can never complete OAuth); no server code needed.

**Default: Cloudflare Workers static assets, deployed by Workers Builds from the private repo.**
- `wrangler.jsonc` at repo root, no Worker script file:
  ```jsonc
  { "name": "my-spotify-data", "compatibility_date": "2026-09-04", "preview_urls": false,
    "assets": { "directory": "./dist/", "not_found_handling": "single-page-application" } }
  ```
  https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/
- Dashboard: Workers & Pages > Create application > Import a repository > GitHub App "Only select repositories"; build command `yarn build`; deploy command default `npx wrangler deploy`. https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
- Build image defaults to yarn 4.9.1 and Node 24.18.0 and does NOT detect the yarn version from `yarn.lock`; set build variable `YARN_VERSION=1.22.22`; `.nvmrc` (24) is honoured. https://developers.cloudflare.com/workers/ci-cd/builds/build-image/
- URL `https://my-spotify-data.<subdomain>.workers.dev` (root path, Vite `base` stays `/`), "intended for personal or hobby projects". https://developers.cloudflare.com/workers/configuration/routing/workers-dev/
- Free tier: static asset requests "free and unlimited", 20,000 files, 25 MiB/file, 3,000 build minutes/month, 1 concurrent build. Do not set `run_worker_first` (would route requests through the 100k/day Worker budget). https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/ , https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/
- Cloudflare's direction: "Start new projects with Workers"; Pages gets no new investment. https://developers.cloudflare.com/pages/ , https://blog.cloudflare.com/full-stack-development-on-cloudflare-workers/
- Optional URL gating without a custom domain: Worker > Access tab > "Protect this Worker behind Access" (needs Zero Trust enabled). https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- Caveat: Workers Builds pages never state "private repositories supported" verbatim (Pages does). Try it; fall back to Pages git integration.

**Runner-ups**
- Cloudflare Pages git integration: "Both private and public repositories are supported"; automatic SPA fallback when no `404.html`; `https://<project>.pages.dev`; 500 builds/month. Do not use Direct Upload if git integration might be wanted later (cannot switch). https://developers.cloudflare.com/pages/get-started/git-integration/ , https://developers.cloudflare.com/pages/configuration/serving-pages/
- Vercel Hobby: personal-account private repos OK (not org-owned); "non-commercial, personal use only" with "financial gain of anyone involved" wording that is ambiguous for a working DJ; SPA rewrite via `vercel.json`. https://vercel.com/docs/git , https://vercel.com/docs/limits/fair-use-guidelines
- Netlify Free: personal-account private repos supported (https://docs.netlify.com/git/overview/), but 300 credits/month at 15 per production deploy = ~20 deploys/month. https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/
- GitHub Pages: NOT available for private repos on GitHub Free (Pro required; site is public anyway). If ever used: `base: '/myOwnSpotifyData/'`, redirect URI `https://<owner>.github.io/myOwnSpotifyData/callback`, and the 404.html SPA hack unless routing is hash-based. https://docs.github.com/en/get-started/learning-about-github/githubs-plans , https://vite.dev/guide/static-deploy
- Others: Surge (`200.html`, CLI upload), Render static sites, Tailscale Funnel (home machine must stay on).

**PWA**
- Ship only a manifest (`name`, `short_name`, `start_url: '/'`, `display: 'standalone'`, `theme_color`, `background_color`, 192 + 512 PNG icons), `<link rel="apple-touch-icon">` (180 px), `viewport-fit=cover`. No service worker: not required for Chrome install (108+/112+) nor iOS; data is live. https://web.dev/articles/install-criteria , https://developer.chrome.com/blog/update-install-criteria
- iOS 26: every Home Screen site opens as a web app by default. https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/
- iOS storage is isolated between Safari and the installed app (cookies and localStorage not copied): the DJ logs in once per context, and the installed app starts with an empty cache. Prompt "Add to Home Screen" BEFORE the first big sync. https://developer.apple.com/videos/play/wwdc2023/10120/ , https://webkit.org/tracking-prevention/
- Safari ITP deletes all script-writable storage after 7 days of Safari use without interaction; Home Screen web apps are exempt. Refresh tokens in localStorage can vanish in plain Safari.

**OAuth on phones**
- Apple: "Authentication through OAuth on a third-party domain will still open in your web app. This is done through heuristics." Out-of-scope links open in Safari View Controller; `window.open` always stays in the app. Use same-window navigation (`location.assign`) to `accounts.spotify.com`, never `target=_blank`. Chrome/Android renders out-of-scope navigations inside the PWA window (https://web.dev/articles/add-manifest).
- Store `code_verifier` and `state` in localStorage before navigating; if the callback lands without a verifier (different browser context), show "Start again", not an error.
- Phone testing during development: LAN HTTP URIs are rejected; use the deployed HTTPS URL, or USB/adb port forwarding so the phone hits `127.0.0.1`.

## 6. Client storage and search

**Quotas and eviction** (https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria):
- localStorage: 5 MiB per origin; `QuotaExceededError` beyond. Fine for last-sync timestamp, prefs, tokens; not for the entry cache.
- IndexedDB: Chromium up to 60% of disk per origin (80% browser-wide), LRU per-origin eviction only under pressure, persistent origins skipped. Safari 17+/iOS 17+: up to 60% of disk, same for Home Screen apps, no prompt, `QuotaExceededError` on overflow. https://webkit.org/blog/14403/updates-to-storage-policy/
- Safari ITP 7-day deletion (above); `navigator.storage.persist()` is auto-granted by heuristics (Chrome: engagement/install; Safari: Home Screen) and only protects against pressure eviction. Call it after the first sync; do not depend on it. https://web.dev/articles/persistent-storage
- Footprint estimate for 50k entries + 20k tracks: ~5-15 MB (researcher's estimate, unmeasured); comfortably inside IndexedDB, outside localStorage.
- IndexedDB performance (desktop Chrome 2021, secondary): getAll in batches of 1000 reads 50k records in ~488 ms; writing 50k in one transaction ~7.2 s, 10k ~1.4 s; per-write transactions are the killer (1000 single transactions 10.5 s vs 0.6 s relaxed). Batch per playlist, use `getAll`, treat IndexedDB as persistence behind an in-memory model. https://nolanlawson.com/2021/08/22/speeding-up-indexeddb-reads-and-writes/ , https://rxdb.info/slow-indexeddb.html

**Library picks**
- IndexedDB wrapper: `idb` 8.0.3, 1.4 kB gz, 0 deps, ISC, typed `DBSchema` (last release 2025-05-07, stable). Dexie 4.4.5 is 31 kB gz and brings liveQuery/compound-index query builder that in-memory querying does not need. https://registry.npmjs.org/idb/latest , https://registry.npmjs.org/dexie/latest
- Search: `minisearch` 7.2.0, 5.8 kB gz, 0 deps, MIT, typed; prefix, fuzzy (`fuzzy: 0.2`), field boosting, `addAllAsync`, `toJSON`/`loadJSON`. It does NOT fold diacritics by default: supply `processTerm: t => t.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')` at index and search time (and when loading a serialized index). https://lucaong.github.io/minisearch/types/MiniSearch.Options.html
- Rejected: Fuse.js 7.5.0 (9.4 kB gz; Bitap linear scan per keystroke, 32-char pattern cap, weak at 20-50k docs; https://www.fusejs.io/performance.html); FlexSearch 0.8.212 (16.8 kB gz; ESM entry exists, but self-reported "typed 75%" and a history of typing breakage, e.g. https://api.github.com/repos/nextapps-de/flexsearch/issues/435); Orama 3.1.18 (24.4 kB gz despite "<2kb" marketing; typo-tolerance docs unreadable; OSS direction uncertain, https://github.com/orgs/oramasearch/discussions/1000).

**Data model and processing**
- Stores: `playlists {id, name, snapshotId, ownerId, collaborative, itemCount, syncedAt}`, `tracks {id|uri, name, artists:[{id,name}], albumName, durationMs, isrc?}`, `entries {playlistId, position, trackKey, addedAt}` with keyPath `[playlistId, position]` and index on `trackKey`. Namespace by `account_id`.
- Aggregate in memory: load `entries` + `tracks` with `getAll`, build `Map<artistId, Set<trackKey>>` and `Map<trackKey, Set<playlistId>>`, sort once, recompute after each sync. Index one MiniSearch document per unique track (name, artists, album) plus playlist names; optionally cache the serialized index keyed by sync version.
- Web Worker: optional. First chunk writes per playlist, use `addAllAsync`, yield between chunks (`scheduler.yield()` with `setTimeout(0)` fallback; 50 ms long-task guidance not re-fetched). If a mid-range phone still janks, move sync + indexing into a module worker: `new Worker(new URL('./sync.worker.ts', import.meta.url), { type: 'module' })` (Vite zero-config; IndexedDB and fetch available in workers; https://vite.dev/guide/features , https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API). Keep token handling on the main thread.
- Compliance framing: temporary, refreshable cache; "last synced" visible; disconnect wipes tokens and cache.

## 7. Front-end stack, ranked by least added complexity

All measured locally with Vite 8.2.2 + TS 6.0.3 + ESLint 10.9.1 + Vitest 5.0.0 (hello-world counter, gzip -9; bench at `/tmp/claude-1000/-home-tvincent-code-myOwnSpotifyData/321d526b-0faa-489d-83cb-e0059fea2562/scratchpad/stack-bench`):

1. **Vanilla TS** (0 packages, 0.5 kB gz) or **lit-html standalone** (2 packages, 3.4 kB gz, no plugin, no decorators): the "vanilla + helper" sweet spot if no JSX is wanted.
2. **Preact + @preact/signals with NO Vite plugin** (2-3 packages, 8.2 kB gz): Vite's built-in Oxc JSX transform honours tsconfig `jsx: react-jsx` + `jsxImportSource: preact`; identical output to the preset build. Only component HMR and devtools are lost. `@preact/preset-vite` 2.10.6 would add ~75 packages and a NON-optional `@babel/core` peer that yarn classic will not install (add it explicitly). Lint with existing typescript-eslint (+ `eslint-plugin-react-hooks` 7.1.1 `configs.flat.recommended`, ESLint 10 peer OK). **Recommended.**
3. **SolidJS** 1.9.15 (4.3 kB gz) but `vite-plugin-solid` 2.11.14 drags a 59-package Babel closure; `@testing-library/jest-dom` peer is optional (`peerDependenciesMeta`), `@babel/core` is a direct dep. Use `jsx: preserve`, `jsxImportSource: solid-js`, `moduleResolution: bundler` (docs still show deprecated `node`).
4. **Svelte 5** 5.57.0 (10 kB gz): plugin 7.3.0 (peer vite ^8, svelte ^5.46.4), svelte-check as a second type-checker in `yarn typecheck`, extra ESLint parser layer (`eslint-plugin-svelte` 3.23.0 with `parserOptions.parser: tseslint.parser`, `extraFileExtensions: ['.svelte']`), 31 packages. TS 6 supported since svelte-check 4.4.8 (https://svelte.dev/blog/whats-new-in-svelte-june-2026).
5. **Lit** 3.3.3 (6 packages, 6.2 kB gz, no plugin) but standard decorators break: Vite 8's Oxc "does not support lowering native decorators" (https://vite.dev/guide/migration; tracked in https://github.com/vitejs/vite/discussions/21891); the build succeeds yet emits invalid JS. Requires `experimentalDecorators: true` + `useDefineForClassFields: false` in the client tsconfig (https://lit.dev/docs/components/decorators/), or decorator-free `static properties`.
6. **React 19** (8 packages, 59 kB gz, ~7x Preact for the same JSX); `eslint-plugin-react` 7.37.5 has no ESLint 10 peer.

Compatibility facts:
- Vite 8.2.2: Rolldown + Oxc, no esbuild; engines node ^20.19 || >=22.12; default `build.target` = baseline-widely-available (chrome111, firefox114, safari16.4, ios16.4). https://vite.dev/config/build-options
- TypeScript: 6.0.3 is the last 6.x; **TS 7.0.2 (Go port) is npm `latest` since 2026-07-08** and has no stable programmatic API until 7.1, so `typescript-eslint` 8.69.0 (peer `>=4.8.4 <6.1.0`) crashes on it. The repo's `^6.0.3` range would accept 6.1; pin `~6.0.3`. https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/ , https://typescript-eslint.io/users/dependency-versions/
- TS 6.0 defaults changed: `strict`, `module esnext`, `types: []`, `rootDir '.'`, `noUncheckedSideEffectImports`; `moduleResolution node10` deprecated, `baseUrl` deprecated. https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/
- ESLint 10 (flat config only, Node >=20.19). https://eslint.org/blog/2026/02/eslint-v10.0.0-released/
- Vitest 5.0.0 (peers vite ^6.4 || ^7 || ^8; Node >=22.12): default env `node`; DOM tests via `happy-dom` 20.14.0 (engines >=20) with `// @vitest-environment happy-dom` per file, no config file needed. `jsdom` 30.0.1 requires Node ^24.15.0 and fails to install on this machine's Node 24.14.1; Node 24.20.0 LTS exists (`nvm install 24` fixes it) but happy-dom is smaller. https://vitest.dev/guide/environment , https://registry.npmjs.org/jsdom/latest
- Tailwind 4.3.3 (`@tailwindcss/vite`, peer vite ^8) works: 17 packages / ~25 MB native binaries, raises Firefox floor to 128. Plain CSS is enough: `viewport-fit=cover` + `env(safe-area-inset-*)`, `100dvh`/`100svh`, container queries (all inside the iOS 16.4 floor), `color-scheme`, touch targets >=24 px (WCAG 2.5.8) and ~48 px recommended (https://web.dev/articles/accessible-tap-targets).
- Vite env: only `VITE_*` vars reach the bundle and are public. Use `VITE_SPOTIFY_CLIENT_ID` and `VITE_SPOTIFY_REDIRECT_URI`; remove `SPOTIFY_CLIENT_SECRET` from `.env.example` and the client path (PKCE never uses it); keep `loadConfig()` only if a Node script survives. https://vite.dev/guide/env-and-mode

tsconfig approach (verified with `tsc --noEmit` for every candidate):
- Keep the root `tsconfig.json` (NodeNext, `types: ["node"]`, `rootDir: "src"`) for Node code and `tsconfig.build.json` for `dist/`; exclude the client directory from both so the `.js`-extension rule and emit never touch browser code.
- Add a client tsconfig: `{ target: "ES2022", module: "esnext", moduleResolution: "bundler", lib: ["ES2022","DOM","DOM.Iterable"], types: ["vite/client"], strict, skipLibCheck, noEmit, isolatedModules, verbatimModuleSyntax, jsx: "react-jsx", jsxImportSource: "preact" }`. `types: ["vite/client"]` is mandatory under TS 6 (`types` defaults to `[]`). create-vite's template additionally sets `allowArbitraryExtensions`, `erasableSyntaxOnly`, `moduleDetection: force`, `tsBuildInfoFile: ./node_modules/.tmp/...`. https://raw.githubusercontent.com/vitejs/vite/main/packages/create-vite/template-react-ts/tsconfig.app.json
- Either two `tsc --noEmit -p` runs in `yarn typecheck`, or a root `{ "files": [], "references": [...] }` with `tsc -b` (works under TS 6 without `composite`).
- One root `vite.config.ts` with `/// <reference types="vitest/config" />` doubles as the Vitest config; repoint `yarn dev` to `vite`.

## 8. Do not rely on (corrected or stale claims)

No researcher claim was formally marked refuted, but the checker corrected these; treat the original statements as false:

- `tracks.total` on `/me/playlists` items: `tracks` is deprecated; read `items.total`.
- "`external_ids` removed in Feb 2026": reverted in March 2026; ISRC/UPC are available.
- `GET /playlists/{id}/tracks` and `items[].track`: removed/deprecated; use `/items` and `items[].item` (saved tracks still use `track`).
- Rate-limits page advice "use batch APIs": batch endpoints are removed for dev-mode apps.
- "Retry-After will be honoured in the browser": unverified; header may not be CORS-exposed; always have a fallback backoff.
- "`user-read-private`/`user-read-email` needed for profile/search": not needed; their fields are removed.
- "1 Client ID per developer" (Feb 2026 blog): superseded, 25 since July 2026.
- "Endpoint restrictions for existing apps were postponed" vs migration guide "migrated March 9, 2026": conflicting; a Dev Mode app saw 403 on `/tracks` on 2026-03-06 (https://github.com/bjarneo/cliamp/issues/54). Do not assume an older Client ID keeps old endpoints; irrelevant for a new one.
- "Owner account works without allow-listing": community-only; add the owner explicitly.
- "Playlist `item` is never null": it can be (issue #958; `/me/playlists` reference says "a track object may be null").
- `popularity` for ranking, `preview_url` for previews, `linked_from` for relinking, artist `genres`: removed/deprecated; use top-items, external links, ISRC, and treat genres as best-effort.
- Search endpoint for "search my tracks": limit 10, catalog only; use the local index.
- Recently-played as play history: ~50 items only (secondary).
- Vite dev server "must be configured to host 127.0.0.1": not needed; it already answers on 127.0.0.1; just open that URL.
- "Cloudflare Access cannot gate a bare workers.dev hostname": it can (Worker > Access tab).
- "Netlify personal private repos unverified": official git overview (2026-06-16) confirms they are supported on Free; org-owned private repos need Pro.
- "Cloudflare build auto-detects yarn 1 from yarn.lock": it does not; set `YARN_VERSION`.
- `vite-plugin-solid` "yarn will warn about the jest-dom peer": optional in `peerDependenciesMeta`; no warning, no manual Babel install.
- FlexSearch "non-ESM main entry": misleading; an ESM entry exists (typing weakness stands).
- bundlephobia's react-dom "1.4 kB gz": index shim only; real client bundle 59 kB gz.
- "typescript `^6.0.3` is a safe pin": TS 7 is npm `latest` and 6.1 is outside typescript-eslint's range; pin `~6.0.3`.
- SolidJS docs' `moduleResolution: "node"`: deprecated in TS 6; use `bundler`.
- "Spotify-owned editorial playlists you follow will yield items": no; metadata at best.
- The Feb 2026 changelog listing on the hosting topic that "external_ids" is removed and that `/playlists/{id}/items` works for all playlists: items only for owned/collaborative.

## 9. Unresolved questions

- PKCE refresh-token rotation: does every refresh return a new token and invalidate the old? Settle with one live test (refresh, then retry the old token). Design for rotation regardless.
- Does the owner count toward the 5 users / must they be added? Add them; test with a second account.
- Numeric dev-mode rate limit and per-account quota: unpublished; measure with the real app and the Dashboard graph.
- Does `fields` on `/playlists/{id}/items` accept `item(...)`, `track(...)`, or both? Probe at startup with a live token; fall back to no `fields`.
- Are followed/Spotify-owned playlists present (metadata-only) in `/me/playlists` or omitted entirely? Inspect the first listing.
- How many of the DJ's playlists are owned vs followed? Ask the owner; this decides feature coverage.
- `snapshot_id` semantics: metadata-only edits, collaborator edits, lag after edits (community: 10-60 s). Tolerate re-fetches.
- Top items: offset >=50 cap, offset=49 trick, refresh cadence. Probe at runtime.
- Recently-played depth beyond 50 with `before` cursors. Probe.
- Are artist `genres` still populated for a new Client ID? Live check before any genre feature.
- Is `Retry-After` exposed to browser JS on 429? Trigger one and inspect `response.headers`.
- July 2026 community report of intermittent CORS preflight failures on `api.spotify.com` (https://community.spotify.com/t5/Spotify-for-Developers/api-spotify-com-CORS-preflight-broken/td-p/7508125, unreadable): test early; keep a tiny proxy as fallback plan.
- Does Policy III.13 ("do not analyze ... usage statistics, user metrics") cover a private single-user aggregation? No official reconciliation with "personal projects" positioning; owner should read the clause.
- "Liked Songs" excluded from `/me/playlists`: long-standing but unofficial; verify.
- `GET /playlists/{id}` embedded `items` page size (historically 100) and the 10,000-item playlist cap: measure / community only.
- Workers Builds + private repo: not stated verbatim; try it, fall back to Pages. Also verify `YARN_VERSION=1.22.22` + `.nvmrc` on the first build.
- Cloudflare free-tier egress: no explicit bandwidth statement found for Pages or Workers static assets.
- Does Spotify's OAuth hop stay inside an iOS Home Screen web app under Apple's heuristics? Test on the owner's phone and iOS version.
- Does `navigator.storage.persist()` exempt a plain-Safari origin from the 7-day ITP wipe? Only anecdotal; design as if not.
- Vercel: is a working DJ's tool "financial gain of anyone involved"? Ambiguous; 100 deployments/day and 200 projects figures unverified.
- Phone testing over LAN HTTPS with a self-signed cert: unverified whether the dashboard accepts a private-IP HTTPS redirect URI; adb port-forward or the deployed URL avoids the question.
- Real timings for MiniSearch indexing (~20k docs) and 50k-entry aggregation on a mid-range Android phone; the 5-15 MB footprint estimate. Measure after the first sync.
- Whether component-level HMR matters to the owner (zero-plugin Preact vs preset + explicit `@babel/core`).
- typescript-eslint support timeline for TS 6.1/7: none published.
- Orama tolerance + prefix interaction (issue #544): moot if MiniSearch is chosen.
- Checker did not re-read the Vite 8 announcement, TS 6.0 handbook page, Svelte TypeScript docs, or Vite static-deploy guide; all are consistent with verified registry/config facts but are not independently confirmed.

## Follow-up answers to the completeness critic

### Q: Can the ~600-1,000-request first sync actually complete on a phone, and how many times must it run? The brief's "may take more than an hour when throttled" is unsourced, the Development Mode rate limit is unpublished, and it never mentions that mobile browsers suspend a backgrounded/locked-screen page (Safari iOS has no Background Sync API through 26.6 per caniuse; Chrome Android throttles background pages) so the sync only runs while the screen is on and the tab is foreground. Because storage is isolated per context, the same sync is repeated for desktop, Safari, and the Home Screen app, each against the shared account quota. The brief takes browser-only as a given and never weighs the alternative of a scheduled Cloudflare Worker (cron + KV/R2) doing one sync and serving a JSON snapshot that phones download in one request.

## Answer: no — not reliably. The binding constraint is Spotify's undisclosed **daily quota**, not the 30-second rate limit, and it is shared per developer account across every device.

### Spotify facts (all fetched 2026-09-04)

| # | Fact | Source | Impact |
|---|------|--------|--------|
| 1 | Rate limit is "calculated based on the number of calls that your app makes to Spotify in a rolling 30 second window"; the number is **not published** and is lower in Development Mode; 429 "will normally include a Retry-After header". No date on page. | https://developer.spotify.com/documentation/web-api/concepts/rate-limits | high |
| 2 | A separate **quota** system: "Endpoints are grouped into quota buckets and requests to endpoints in the same bucket count toward a shared limit... The specific groupings and limits are subject to change." Exceeding returns `429 {"error":{"status":429,"message":"Too many requests","reason":"QUOTA_EXCEEDED"}}`. No numbers. | https://developer.spotify.com/documentation/web-api/concepts/quota-modes | high |
| 3 | Since **2026-07-23** quota is counted **per developer account**, all (up to 25) Dev-Mode client IDs share one pool — a second client ID does not buy a second quota. | https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates ; https://developer.spotify.com/documentation/web-api/references/changes/july-2026 | high |
| 4 | Spotify staff ("LambertSpot", 2026-02-27) confirmed a **"playlist related daily quota"** exists and "made it 8 times bigger... some will still run into the daily quota limit if you are making a lot of requests". Same thread, Feb 2026 (pre-bump): 429 "after roughly 100/200 requests at 1/2 requests per second"; Retry-After of "between a 6 and 24 hour"; one user hit 429 with retry 61389 s (~17 h) after GETting `/playlists/{id}/items` for ~17 playlists plus a few writes; another: "~30 requests" to `/playlists/{id}/items` → 429, "1 attempt / day". Apr 2026: "after a couple hundred [searches] it 429 for 20 hours". Staff 2026-03-17: "nothing concrete to share yet" on numbers. | https://community.spotify.com/t5/Spotify-for-Developers/Low-number-of-requests-leading-to-429-response/td-p/7338415 (pages 1, 3, 4; fetched via headless browser, site blocks plain HTTP) | high |
| 5 | The "~180 requests/min" figure circulating online comes from a **2023 Medium article** quoted in a 2022–2024 community thread, not from Spotify; a June 2024 user reported errors at 3 req/s. Pre-2026, stale. | https://community.spotify.com/t5/Spotify-for-Developers/Web-API-ratelimit/td-p/5330410 | medium |
| 6 | Extended Quota Mode requires an organisation, 250,000 MAU, etc. — **unavailable** to this project; Dev Mode = 5 users, owner must be Premium. | https://developer.spotify.com/documentation/web-api/concepts/quota-modes ; https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide | high |
| 7 | Feb 2026 removed batch endpoints (`GET /tracks`, `/artists`, ...) and renamed `/playlists/{id}/tracks` → `/playlists/{id}/items`; `GET /me/playlists`, `GET /me/top/{type}`, `GET /me/tracks` remain. | https://developer.spotify.com/documentation/web-api/references/changes/february-2026 | high |
| 8 | Page sizes: `GET /me/playlists` limit max **50** (offset max 100,000), returns `snapshot_id` per playlist; `GET /playlists/{id}/items` limit max **50** (default 20), `fields` filter supported; `GET /me/top/{type}` limit max **50**. So P playlists cost ⌈P/50⌉ + Σ⌈tracks/50⌉ requests — the brief's 600–1,000 for a few hundred playlists is consistent. | https://developer.spotify.com/documentation/web-api/reference/get-a-list-of-current-users-playlists ; https://developer.spotify.com/documentation/web-api/reference/get-playlists-items ; https://developer.spotify.com/documentation/web-api/reference/get-users-top-artists-and-tracks | high |
| 9 | Spotify's own advice: store `snapshot_id` "to avoid refreshing an entire playlist that has not changed" — so the full crawl is a one-time cost **per storage context**, later syncs are incremental. | https://developer.spotify.com/documentation/web-api/concepts/rate-limits | medium |
| 10 | Tokens: access token 1 h; refresh token **6 months** from authorisation, not extended by use; PKCE refresh needs only `client_id` (no secret). A server-side sync must be re-authorised by the owner at least every 6 months. | https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens | high |
| 11 | Developer Policy: no cache-TTL rule found; user data may be stored "for as long as is necessary to provide your SDA", delete on disconnect. Storing a JSON snapshot server-side is not prohibited by anything I could find. | https://developer.spotify.com/policy | medium |

### Phone-browser facts

| # | Fact | Source | Impact |
|---|------|--------|--------|
| 12 | Background Sync API: Safari iOS **not supported 3.2 → 26.6** (latest listed); Chrome Android 152 supported. | https://caniuse.com/background-sync | high |
| 13 | Apple Frameworks Engineer (Mar 2025): keeping JS running in the background "you cannot control this... On iOS it is very intentional to prevent this kind of behavior." | https://developer.apple.com/forums/thread/777860 | high |
| 14 | Chrome Page Lifecycle: in the frozen state "JavaScript timers and fetch callbacks don't run"; Chrome 88+ throttles hidden-tab timers to 1/s, then 1/min after 5 min hidden. | https://developer.chrome.com/docs/web-platform/page-lifecycle-api ; https://developer.chrome.com/blog/timer-throttling-in-chrome-88 | high |
| 15 | Mitigation available: Screen Wake Lock API supported on Safari iOS **16.4+** and Chrome Android — a sync page can keep the screen on, but only while it stays in the foreground. | https://caniuse.com/wake-lock | medium |

### Server-side alternative facts

| # | Fact | Source | Impact |
|---|------|--------|--------|
| 16 | Cloudflare Workers Free: 100k req/day, **10 ms CPU** per cron invocation, cron wall-clock **15 min**, **50 subrequests per invocation** (10,000 on Paid, $5/month minimum), 5 cron triggers per account, `* * * * *` (every minute) is a valid cron. → a 600–1,000-call crawl does **not** fit one free invocation; needs Paid or ~12–20 chunked minute-cron runs with a KV cursor. | https://developers.cloudflare.com/workers/platform/limits/ ; https://developers.cloudflare.com/workers/platform/pricing/ ; https://developers.cloudflare.com/workers/configuration/cron-triggers/ | high |
| 17 | Workers KV Free: 100k reads/day, 1,000 writes/day, 25 MiB max value — ample for one snapshot. | https://developers.cloudflare.com/kv/platform/limits/ | medium |
| 18 | GitHub Actions (repo already on GitHub, private): `schedule` min interval 5 min, "can be delayed during periods of high loads"; Free plan includes 2,000 min/month for private repos; no subrequest cap. A viable no-new-vendor sync runner. | https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows ; https://docs.github.com/en/billing/managing-billing-for-your-products/about-billing-for-github-actions | medium |

### How long, and how many times
- **Duration if only the rate limit applied**: 1,000 requests at the 2024-era ~3 req/s ≈ 5.5 min; at the 1–2 req/s that Feb-2026 users reported still yielding 429s ≈ 8–17 min, plus Retry-After pauses — foreground, screen on (wake lock), no tab switch. Under Safari iOS it stops the instant the screen locks (13).
- **What actually breaks it**: the per-account **daily** playlist quota (4). Pre-bump reports were ~100–200 playlist-related requests/day; post-bump ×8 would be ~800–1,600 **if linear (my extrapolation, unverified)** — i.e. the single first sync is already at or near the daily budget, and one lockout costs 6–24 h.
- **Repeat count**: once per isolated storage context (desktop browser, Safari, Home Screen app — the storage-isolation claim itself I did not re-verify with a source), each drawing on the same account quota the same day (3). Two devices on one day ≈ 1,200–2,000 requests → QUOTA_EXCEEDED is plausible; after that, `snapshot_id` makes refreshes cheap (9).

### Could not verify
- Live requests/second in Development Mode today: **no credentials available to measure**; no official number exists (1, 4).
- Current size of the playlist daily quota after the Feb-27 ×8 bump (Spotify has published none).
- Community claim that `limit=100` works on `/playlists/{id}/items` (documented max is 50).
- Whether Chrome for Android still stops fetches after 5 min in background (only a 2018 XDA article; Chrome's lifecycle doc gives no Android timing).
- Whether Cloudflare's 50-subrequest free limit is enforced identically for `scheduled()` invocations (docs say "per invocation" without cron-specific wording).
- Whether `GET /me/playlists` now exposes `items.total` instead of `tracks.total` after the Feb 2026 `tracks`→`items` rename.

**Design implication:** run the ~600–1,000-request crawl exactly once, server-side (GitHub Actions cron in the existing private repo, or a Cloudflare Worker on the $5 Paid plan — Free's 50 subrequests/invocation forbids it in one run), holding the owner's PKCE refresh token (re-authorise every ≤6 months) and publishing one JSON snapshot that every device downloads in a single request; keep the browser to reading the snapshot plus cheap `snapshot_id`-gated deltas, so a phone never has to keep its screen on for a quota-burning sync.

### Q: What is the recovery path if Apple's heuristic does NOT keep the accounts.spotify.com hop inside the iOS Home Screen web app? If the callback opens in Safari, its storage is isolated from the installed app, so the installed app can never obtain a code_verifier match or a token; the brief's mitigation ('show Start again') just repeats the same failing flow. The brief lists this as an open question to test on the owner's phone but gives no plan B (e.g. target plain Safari only and accept the 7-day ITP wipe of the refresh token, or hand the token over some other way), and the Apple quote it relies on is not linked in that bullet.

## Answer: iOS Home Screen web app + Spotify OAuth — what Apple actually says, and the plan B

### 1. The "heuristic" quote is about macOS Dock web apps, not iOS (impact = high)
- WWDC23 session 10120 "What's new in web apps", transcript: "Authentication through OAuth on a third-party domain will still open in your web app. This is done through heuristics. If you test and find that your OAuth flow opens the authentication experience in the user's default browser, please send us feedback … If you want to ensure your OAuth flows do not open in the user's default browser, you can use window.open." — this passage is in the **Mac (Dock)** section. https://developer.apple.com/videos/play/wwdc2023/10120/
- The iOS rule in the same transcript is deterministic, not heuristic: "In Home Screen web apps on iOS, links outside the scope will open in Safari View Controller." and "The default scope is the host of the webpage used to create the web app." (same URL). So the accounts.spotify.com hop does not go to full Safari; it opens in an in-app Safari View Controller hosted by the web app.
- Return hand-off (not stated by Apple in that transcript): Firtman, 26 Mar 2019 (iOS 12.2): "From iOS 12.2, an In-App PWA Browser is used." … "When the external URL redirects or points to a URL within the scope—including POST requests, JavaScript redirects or links—the PWA closes the browser and loads the content in the standalone window. This is particularly useful for OAuth authentication." https://firt.dev/ios-12.2/ Corroborated on iOS 13+ by an Apple forum thread (Jun 2020 → Mar 2023) where the OpenID redirect did land back in the standalone app (followed by an unrelated freeze bug fixed by backgrounding): https://developer.apple.com/forums/thread/649699
- Storage split is real: "Home Screen web apps have a standalone, app-like experience on iOS, with separate cookies and storage from the browser." (WWDC23, URL above). Safari View Controller website data is also not accessible/shared with the host: "you can't access AutoFill data, browsing history, or website data … To share data between your app and Safari, use ASWebAuthenticationSession instead." https://developer.apple.com/documentation/safariservices/sfsafariviewcontroller (fetched via the docs JSON endpoint)

### 2. ITP facts the fallback depends on (impact = high)
- WebKit, 24 Mar 2020: ITP deletes "all of a website's script-writable storage after seven days of Safari use without user interaction on the site" (IndexedDB, LocalStorage, SessionStorage, SW registrations, cache). "Web applications added to the home screen are not part of Safari and thus have their own counter of days of use … We do not expect the first-party in such a web application to have its website data deleted." https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/
- Still true as of Feb 2024 (pre-EU-beta): "Home Screen Web apps were exempt from Safari's 7-Day Cap on All Script-Writeable Storage" https://blog.tomayac.com/2024/02/28/so-what-exactly-did-apple-break-in-the-eu/ ; Apple reversed the EU removal: "we will continue to offer the existing Home Screen web apps capability in the EU … built directly on WebKit" (Apple statement quoted by The Register, 2 Mar 2024; the passage is no longer on Apple's current DMA page) https://www.theregister.com/2024/03/02/apple_reverses_pwa_decision/ — relevant because the owner is in France.
- iOS 26 (WebKit, 15 Sep 2025): "By default, every website added to the Home Screen opens as a web app. If the user prefers to add a bookmark for their browser, they can disable 'Open as Web App'." https://webkit.org/blog/17333/webkit-features-in-safari-26-0/ — so "target Safari only" cannot be enforced by omitting a manifest; it is a user toggle. Safari 27 beta post (WWDC26) contains no web-app/scope/ITP changes: https://webkit.org/blog/17967/news-from-wwdc26-webkit-in-safari-27-beta/

### 3. Spotify constraints that bound the fallback (impact = high)
- Redirect URI: "Use HTTPS … unless you are using a loopback address"; "localhost is not allowed"; enforced for new apps from 9 Apr 2025, all clients by Nov 2025; no custom schemes mentioned. https://developer.spotify.com/documentation/web-api/concepts/redirect_uri
- PKCE: exchange at `https://accounts.spotify.com/api/token` with `code`, `grant_type=authorization_code`, `redirect_uri`, `client_id`, `code_verifier`; no client secret; redirect URI "must exactly match"; code lifetime not documented. https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow (RFC 6749 §4.1.2: "A maximum authorization code lifetime of 10 minutes is RECOMMENDED"; single use. https://www.rfc-editor.org/rfc/rfc6749)
- Refresh tokens: "Refresh tokens issued to apps registered in the Developer Dashboard have a lifetime of 6 months. The 6-month lifetime starts when the user authorizes your app." and "a refresh token might not be included in each response … continue using the existing token." https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens
- Only three grants (auth code, auth code + PKCE, client credentials); no device-code flow. https://developer.spotify.com/documentation/web-api/concepts/authorization
- Clipboard on iOS: write needs a user gesture; `readText()` outside a gesture rejects, inside one iOS shows "a callout bar with a single option to paste" (WebKit, 23 Jun 2020, Safari 13.1). https://webkit.org/blog/10855/async-clipboard-api/

### 4. Recovery path (plan B), ranked
1. **Context-agnostic code hand-off (recommended, no backend, no new deps).** Keep `code_verifier`+`state` only in the app that started the flow. The `/callback` page (same host as `start_url`, inside any manifest `scope` path) checks its own storage: verifier present → exchange in place; absent (landed in Safari or a different context) → show the `code` with a Copy button and "open the app, tap Paste code". The app's login screen has a Paste-code button that reads the clipboard in a tap handler and runs the same exchange. No token ever crosses contexts; works in every start/land combination; must complete within the code lifetime (~10 min per RFC; Spotify value unverified).
2. **Safari-only mode.** DJ toggles off "Open as Web App" (iOS 26) or uses a Safari tab; accept the 7-days-of-Safari-use cap (a tap on the site resets it) and simply re-authorize when storage is gone. Note the 6-month absolute refresh-token limit forces a re-auth twice a year regardless of install mode.
3. **Backend relay** (callback stored server-side keyed by `state`, app polls): only if 1 is unacceptable; adds hosting and contradicts the minimal-tooling brief.

**Design implication:** build the callback page as option 1 from the start (it costs one screen), keep the PWA install path, and test on-phone only to confirm the Safari View Controller round-trip; if it fails, the DJ still gets in via paste, and refresh tokens still live in the ITP-exempt Home Screen storage.

### Could not verify
- No Apple document describes the Safari View Controller → in-scope hand-off for iOS 16.4–26; evidence is Firtman (2019) plus iOS 13 forum reports. Firtman's Medium originals returned HTTP 403.
- Whether the Spotify login cookie inside the web app's Safari View Controller persists between launches (DJ may need to log into Spotify once per fresh session).
- Whether "window.open … always open in the web app regardless of scope" applies on iOS (Apple stated it in the Mac context).
- Spotify's actual authorization-code expiry (undocumented).
- Apple forum thread 745414 (EU/17.4) body could not be read; Safari 27 release notes page not fetched.

### Q: What will 'most-played tracks and artists' actually be built from? The brief answers with an affinity proxy (GET /me/top/* capped at 50 per range, plus ~50 recently-played) and only mentions the Extended Streaming History export in passing. It does not say whether the owner accepts the proxy, nor document the export well enough to design an import: Spotify's support page confirms it is lifetime, per-stream data with ms_played and a track URI per row (so it can be tens of MB of JSON), but the preparation lead time, the file naming/schema, and how a browser-only phone app would ingest such a file (file input, streaming parse, storage in IndexedDB, join to playlist tracks by URI) are all unspecified.

## Answer: what "most-played" can be built from

### 1. API proxy (what the brief assumed)
- `GET /me/top/{type}` (type = artists|tracks), scope `user-top-read`; `time_range` = `long_term` ("~1 year of data"), `medium_term` (default, ~6 months), `short_term` (~4 weeks); `limit` 1–50 (default 20) + `offset`; items are ranked "based on calculated affinity" — **no play counts, no ms_played**. No deprecation banner (fetched 2026-09-04). impact=high. https://developer.spotify.com/documentation/web-api/reference/get-users-top-artists-and-tracks
- `GET /me/player/recently-played`, scope `user-read-recently-played`; `limit` max 50; `after`/`before` are Unix-ms cursors; "Currently doesn't support podcast episodes". The page does not document how far back cursors reach — depth **unverified**; it cannot yield lifetime counts. impact=high. https://developer.spotify.com/documentation/web-api/reference/get-recently-played
- Feb 2026 Development-Mode migration (new apps 2026-02-11, existing apps 2026-03-09): neither `/me/top` nor `/me/player/recently-played` is in the removed list. Removed/changed things that *do* affect this feature: batch `GET /tracks`, `GET /artists` removed ("must fetch individually"); `popularity`/`followers` fields dropped; `/playlists/{id}/tracks` → `/playlists/{id}/items`; playlist `items` "only returned for playlists the user owns or collaborates on". impact=high. https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide
- `GET /playlists/{playlist_id}/items`: limit 1–50, `fields` filter, each entry has `added_at`, `item.uri`, `item.type`, `is_local`; "only accessible for playlists owned by the current user or playlists the user is a collaborator of… 403 Forbidden" otherwise. impact=high (followed playlists can't be enumerated). https://developer.spotify.com/documentation/web-api/reference/get-playlists-items
- Dev mode: "Up to 5 authenticated Spotify users", "The app owner must have a Spotify Premium account", quota numbers unpublished, 429 `"reason": "QUOTA_EXCEEDED"`; page dated 15 May 2025. https://developer.spotify.com/documentation/web-api/concepts/quota-modes — 2026-07-23 blog: quota is now pooled per developer account, up to 25 client IDs; still no numeric quota. https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates — Rate limit = rolling 30 s window, `Retry-After` on 429, numbers unpublished. https://developer.spotify.com/documentation/web-api/concepts/rate-limits

### 2. Extended Streaming History export (real play events)
- Official scope: Extended streaming history = items "listened to or watched during the lifetime of your account"; Spotify lists 21 field descriptions (stream end time UTC, username, platform, ms played, country, IP, user agent, track/artist/album name, "A Spotify Track URI", episode name/show/URI, reason_start, reason_end, shuffle, skipped, offline, offline timestamp, private session) and defers exact technical names to the "Read Me First - Extended Streaming History" file in the ZIP. The **Account data** package's streaming history covers only the "past year" with endTime/artist name/track name/msPlayed — **no track URI**, so it cannot be joined to playlists. https://support.spotify.com/us/article/understanding-my-data/
- Request path: "Download your data" tool on the Account Privacy page (or privacy@spotify.com); delivered as "a ZIP file". The support page states **no lead time**. https://support.spotify.com/us/article/data-rights-and-privacy-settings/
- Lead time "30 days" is shown on the login-gated privacy page; I could only verify it through sources quoting it: Ortham (2024-12-21): "The page says that the preparation time is 30 days… in my case it took about 4 hours"; takeoutday (updated 2026-08-23): Account data "usually within a few days", Extended "up to 30 days". Spotify Community threads returned HTTP 403 to me. impact=high (owner must request it weeks before the feature is usable). https://blog.ortham.net/posts/2024-12-21-spotify-streaming-history-part-1/ , https://takeoutday.org/guides/download-spotify-data
- Actual schema (Ortham's real record, consistent with the 21 official descriptions): `ts` (ISO-8601 UTC, stream end), `platform`, `ms_played`, `conn_country`, `ip_addr`, `master_metadata_track_name`, `master_metadata_album_artist_name`, `master_metadata_album_album_name`, `spotify_track_uri` (`spotify:track:<id>`, null for podcasts), `episode_name`, `episode_show_name`, `spotify_episode_uri`, `reason_start`, `reason_end`, `shuffle`, `skipped`, `offline`, `offline_timestamp`, `incognito_mode`. **Artist is a name only — no artist URI/ID.** Sizes: JSON files ≤ ~12 MB each + a PDF; Ortham: 227,024 streams = 155 MB pretty-printed JSON. Same URL as above.
- File naming: `Streaming_History_Audio_YYYY-YYYY_N.json` (takeoutday, 2026-08-23; older exports used `endsong_N.json`). Not published on any Spotify page I could fetch → **unverified**; detect files by content (`ts` + `ms_played` keys), not by name. `StreamingHistory_music_N.json` in some guides is the Account-data package, not the extended one.
- Spotify does not define what counts as a "play"; `ms_played`/`skipped`/`reason_end` are raw, so the owner must pick a threshold (e.g. ≥30 s).

### 3. Policy
- Developer Policy (effective 15 May 2025) III.13: "Do not analyze the Spotify Content or the Spotify Service for any purpose, including without limitation, creating new or derived listenership metrics, benchmarking, functionality, usage statistics, user metrics, or building profiles of users". https://developer.spotify.com/policy — Developer Terms IV.3.1.a: "you may not store, aggregate or create compilations or databases of Spotify Content, other than as strictly necessary". No personal-use carve-out found. https://developer.spotify.com/terms
- The export arrives via the data-rights channel, not the Developer Platform, so counting plays from it is not "analyzing Spotify Content obtained via the API"; but computing counts from `/me/top`, `/recently-played` or playlist API data is squarely what III.13 names. Whether Spotify would treat a 1-user personal app differently is **unverified** (interpretation, not a fetched fact).

### 4. Browser-only ingestion on a phone
- Unzip without a dependency: `DecompressionStream("deflate-raw")` supported Chrome 103+, Safari/iOS 16.4+, Firefox 113+ (caniuse). Simpler: owner unzips in iOS Files/Android and picks the JSON files via `<input type="file" multiple>`; at ≤12 MB per file, per-file `JSON.parse` is enough — no streaming parser needed. https://caniuse.com/mdn-api_decompressionstream_decompressionstream_deflate-raw , https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream/DecompressionStream
- Storage (MDN, modified 2026-01-05): Chromium up to 60% of disk; Safari/iOS 17+ ~60% of disk per origin for browser apps (Home-Screen web apps get the browser quota); Safari evicts script-writable storage after 7 days of browser use with no interaction on the origin. Whether `navigator.storage.persist()` or Home-Screen install exempts IndexedDB from the 7-day rule is **unverified**. impact=high (a 150 MB raw import can vanish; keep the raw files re-importable and store only compact aggregates). https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- Join: export → aggregate per `spotify_track_uri` {plays, ms, first/last ts}; join to playlist `item.uri`. Artist-level counts from the export are by name only; artist IDs need `GET /tracks/{id}` one call per distinct URI (batch endpoint removed in dev mode, quota unpublished) or reuse of artist IDs from playlist items already fetched.

### Could not verify
Spotify's own wording of the 30-day lead time (login-gated page); exact export file names and whether username/user agent/audiobook fields appear in current exports; `recently-played` cursor depth; numeric dev-mode quota; Safari 7-day eviction exemption for installed web apps; Spotify's stance on personal-use metrics under III.13.

**Design implication:** decide now with the owner: (a) `/me/top` panel = 3×50 affinity-ranked items, no counts, zero import work; or (b) real counts = a one-time-plus-periodic file import (request weeks ahead), a `plays_by_track_uri` aggregate table in IndexedDB (raw ~150 MB, aggregate a few MB) joined to playlist `item.uri`, artist counts by name unless URIs are resolved one call at a time — (b) cannot be retrofitted onto (a)'s storage/aggregation without a rewrite.


---

# Part 2: Extended Streaming History export format

## Facts (researcher, then fact-checker verdict where checked)

- **[medium/verified-official]** The export is requested with the automated "Download your data" tool on the Account Privacy page (https://www.spotify.com/account/privacy/); the result is "a ZIP file with a copy of your personal data" and a "Read Me First" file is included in the download.
  - source: https://support.spotify.com/us/article/data-rights-and-privacy-settings/
  - notes: Third-party guides (takeoutday.org, mystats.music, stats.fm) describe the UI path as Account > Privacy settings (or Security and privacy) > Download your data > tick 'Extended streaming history' > Request data, then confirm via verification email.
- **[high/verified-official]** Three packages can be downloaded "either separately or all at once": Account data ("A list of items (e.g. songs, videos, and podcasts) listened to or watched in the past year" plus playlists, searches, library, followers, payment data), Extended streaming history ("A list of items (e.g. songs, videos, and podcasts) listened to or watched during the lifetime of your account"), and Technical log information.
  - source: https://support.spotify.com/cg-en/article/understanding-my-data/
  - notes: The Account-data package's streaming files (StreamingHistory_music_N.json) use a different schema (endTime/artistName/trackName/msPlayed) with no track URI — see AnasImloul schema fact. The importer must reject/ignore them.
- **[low/verified-official]** Spotify's legal page names the packages as: Account data; "Extended streaming history (for the life of your account)"; Technical log information; obtained via "the 'Download your data' tool on your Account Privacy page, or contact us".
  - source: https://www.spotify.com/us/legal/gdpr-article-15-information/
- **[medium/verified-secondary]** Spotify's own UI states the preparation time as: "This shouldn't take longer than 30 days. But don't worry, we'll send you an email when it's ready." and "We are preparing your data file. This can take up to 30 days to complete." Delivery is an email containing a download link to the zip.
  - source: https://support.stats.fm/docs/import/spotify-import/
  - notes: UI text quoted by stats.fm and by a community post (https://community.spotify.com/t5/Spotify-for-Developers/Is-there-an-API-endpoint-available-for-requesting-a-download-of/m-p/5186558). In practice: Jrtechs (Jan 2026) got extended history within one day; mystats.music says usually 1-5 days; rigtch.fm (Mar 2026) says 5-14 days; explorify says ~3 weeks. Plan the UX for 'comes later by email', not synchronous.
- **[low/verified-secondary]** A Spotify Moderator (Ivelina, 2024-11-07) states the confirmation link in the verification email "expires in 14 days". No official statement about how long the final download link stays valid was found; a June-2026 third-party guide only says links "are only valid for a short window after the email arrives".
  - source: https://community.spotify.com/t5/Other-Podcasts-Partners-etc/DATA-FOR-STATS-FM/td-p/6488362
  - notes: Fetched via r.jina.ai reader proxy because community.spotify.com returns 403 to non-browser fetches. Download-link validity remains an open question.
- **[high/verified-official]** Official field list for Extended streaming history (21 items): date/time "of when the stream ended in UTC format"; Spotify username; platform; "For how many milliseconds the track was played"; country code; IP address; user agent; track name; artist/band/podcast name; album name; "A Spotify Track URI, that is identifying the unique music track"; episode name; show name; Spotify Episode URI; reason track started; reason track ended; shuffle; skipped; offline; "Timestamp of offline mode use"; private session. Spotify says: "Look for the 'Read Me First - Extended Streaming History' file provided with your data for a detailed description of each technical field".
  - source: https://support.spotify.com/us/article/understanding-my-data/
  - notes: The support page gives descriptions, not JSON key names, and does not list the audiobook fields although real 2025 exports contain them. Note the official list still mentions username and user agent, but exports since 2024 no longer contain them (see next facts). ts is the END of the stream in UTC.
- **[high/verified-secondary — checker: confirmed]** Exact JSON keys in a 2025 export (23 keys): ts, platform, ms_played, conn_country, ip_addr, master_metadata_track_name, master_metadata_album_artist_name, master_metadata_album_album_name, spotify_track_uri, episode_name, episode_show_name, spotify_episode_uri, audiobook_title, audiobook_uri, audiobook_chapter_uri, audiobook_chapter_title, reason_start, reason_end, shuffle, skipped, offline, offline_timestamp, incognito_mode. The example file contains raw non-ASCII text ("Hôtel Costes 9"), i.e. UTF-8, not \u-escaped.
  - source: https://raw.githubusercontent.com/elastic/elastic-labs/4597e7e057eeb626ccd933f77c694321e8d33ac8/supporting-blog-content/spotify-to-elasticsearch/to_read/example.json
  - notes: File committed 2025-02-04 (checked via GitHub API). Same 23-key shape is typed as SpotifyRawRecord in NateShoffner/spotify-unzipped (created June 2026, browser-only tool) with every value except ts/platform/ms_played typed nullable: https://raw.githubusercontent.com/NateShoffner/spotify-unzipped/a929c1429f9b2e509ee78cbdb4a70482df167c70/src/types/spotify.ts
  - checker: Downloaded and parsed: exactly these 23 keys in this order, non-ASCII bytes present, no \u escapes; GitHub API shows the file was committed 2025-02-04. The same 23 keys are typed in NateShoffner/spotify-unzipped (repo created 2026-06-16). One correction to that typing: it declares offline_timestamp as string|null, but every real file inspected carries an integer (Unix seconds) or null.
- **[high/verified-secondary]** Older exports (through early 2024) had the keys username, ip_addr_decrypted and user_agent_decrypted; exports received from late 2024 onward have ip_addr and no username/user_agent keys. Eric Chiang's Feb-2024 export lists: ts, username, platform, ms_played, conn_country, ip_addr_decrypted, user_agent_decrypted, master_metadata_track_name, master_metadata_album_artist_name, master_metadata_album_album_name, spotify_track_uri, episode_name, episode_show_name, spotify_episode_uri, reason_start, reason_end, shuffle, skipped, offline, offline_timestamp, incognito_mode.
  - source: https://ericchiang.github.io/post/spotify/
  - notes: New shape confirmed by a Nov-25-2024 export posted in Yooooomi/your_spotify issue #458 (https://api.github.com/repos/Yooooomi/your_spotify/issues/458) and by Ortham's Dec-2024 export. That Nov-2024 sample still lacks the four audiobook_* keys, while the Feb-2025 elastic sample has them, so key presence varies by export date: treat every key as optional and every value as nullable.
- **[medium/verified-secondary]** Field types/values observed in a real Dec-2024 export: ts is ISO-8601 with Z (e.g. "2014-07-27T20:34:47Z"); ms_played integer; conn_country 2-letter; metadata strings or null; spotify_track_uri "spotify:track:<id>" or null; episode fields null for music; reason_start values: appload, backbtn, clickrow, clickside, fwdbtn, playbtn, popup, remote, trackdone, trackerror, unknown, uriopen and an empty string; reason_end values: appload, backbtn, clickrow, clickside, endplay, fwdbtn, logout, playbtn, popup, remote, trackdone, trackerror, unexpected-exit, unexpected-exit-while-paused, unknown, uriopen and an empty string; shuffle/skipped/offline/incognito_mode booleans; offline_timestamp integer or null. "Since the 19th of October 2023 the platform is just recorded as android, linux, windows or not_applicable" (earlier values were detailed OS/device strings).
  - source: https://blog.ortham.net/posts/2024-12-21-spotify-streaming-history-part-1/
  - notes: skipped was null in some older exports (fedecalendino sample) and boolean in newer ones.
- **[high/verified-secondary]** The zip is "a zip archive of a directory of JSON files that contain the data, split so that each file has a maximum size of about 12 MB, plus a PDF file that describes the data structures in those files"; one heavy listener's history was "227024 of those objects, totalling 155 MB of pretty-printed JSON".
  - source: https://blog.ortham.net/posts/2024-12-21-spotify-streaming-history-part-1/
  - notes: Files are pretty-printed (indented), so bytes-per-record is ~680 B; per-file record count is bounded by the ~12 MB size cap, not a fixed count.
- **[high/verified-secondary]** Feb-2024 export layout: top folder MyData/, 11 files, 6.5 MB zipped / ~80 MB uncompressed, 8 audio files named Streaming_History_Audio_2013-2015_0.json ... Streaming_History_Audio_2022-2023_7.json, one Streaming_History_Video_2018-2023.json, and ReadMeFirst_ExtendedStreamingHistory.pdf; 120,673 streams over ~10 years.
  - source: https://ericchiang.github.io/post/spotify/
  - notes: Zip compression ratio ~12x. The _N suffix is a global running index across year-range files starting at 0 (Chareste parser README: 'they start from 0 and not 1'). Video/podcast-video history is a separate Streaming_History_Video_*.json file; podcast audio plays live inside the Audio files as records with episode_* / spotify_episode_uri set.
- **[high/verified-secondary]** Jan-2026 export: "roughly 15,700 listen events" per file, ~235,000 events across 16 Streaming_History JSON files for ten years; the Extended Streaming History package arrived within one day of the request. For comparison the Technical log package was 157 files / 105 MB and Account data 20 files / 3.3 MB.
  - source: https://jrtechs.net/data-science/the-data-spotify-collected-on-me-over-ten-years
  - notes: Sizing budget: a heavy 10-year listener => 120k-240k records, 80-160 MB pretty-printed JSON, ~7-15 MB zip, 8-20 files.
- **[high/verified-secondary]** The top-level folder name inside the zip varies: MyData/ in a 2024 export; a 2025 export used the folder "Spotify Extended Streaming History/" containing e.g. Streaming_History_Audio_2020-2022_0.json, Streaming_History_Audio_2022-2024_1.json, Streaming_History_Audio_2024-2025_5.json. The downloaded zip is named my_spotify_data.zip regardless of package.
  - source: https://raw.githubusercontent.com/antonbylund/myspotifydata/HEAD/README.md
  - notes: my_spotify_data.zip naming: Sept-2024 community feature request (https://community.spotify.com/t5/Spotify-for-Developers/Update-data-request-file-naming-conventions/m-p/6363956) and mystats.music/listenstats. Match files by basename regex, never by folder path.
- **[high/verified-secondary]** The Account-data package's streaming files are StreamingHistory_music_*.json with schema { endTime, artistName, trackName, msPlayed } (no track URI), whereas extended files Streaming_History_Audio_*.json use the ts/ms_played/spotify_track_uri schema; stats.fm: "Only the Extended streaming history data package includes the correct files to import" and the other packages "are both not eligible for importing".
  - source: https://raw.githubusercontent.com/AnasImloul/spotify-wrapped/03e8785b60716f43e3b96fab134d0600f0670148/src/lib/schemas.ts
  - notes: stats.fm FAQ: https://support.stats.fm/docs/import/faq/no-endsong/ . Users frequently download the wrong package (mystats.music: 'Most users accidentally download the wrong file'); detect the wrong schema and explain.
- **[high/verified-secondary]** spotify_track_uri is populated for normal music plays and is what community importers join on (your_spotify extracts the id with uri.split(":")[2] and calls GET /tracks), but it is nullable and the importer skips any record where spotify_track_uri, master_metadata_track_name or master_metadata_album_artist_name is null, and any record with ms_played < 30 * 1000 ("If track was played for less than 30 seconds").
  - source: https://raw.githubusercontent.com/Yooooomi/your_spotify/master/apps/server/src/tools/importers/full_privacy.ts
  - notes: File last modified 2026-07-09 (GitHub API), so this is current practice. No your_spotify issue since 2025-01-01 mentions Streaming_History (GitHub issue search = 0), suggesting no breaking format change in 2025-2026.
- **[high/verified-secondary]** Null-metadata rows are a known Spotify-side defect: a user found "a lot of the data contains null values after 2022" starting around 2022-10-14/15; Spotify support replied: "We recently updated some of the systems we use to compile the streaming history of users, and due to a technical issue some of the streams didn't get all of the information regarding what content was being played." and said it was corrected; another user reported over 7,000 July-2024 records with every metadata field null but ms_played present, and the moderator gave no explanation (2024-08-28).
  - source: https://community.spotify.com/t5/Spotify-for-Developers/Null-values-in-streaming-history/td-p/5505052
  - notes: Second thread: https://community.spotify.com/t5/Other-Podcasts-Partners-etc/Extended-Streaming-History-missing-track-metadata/td-p/6269152 (both read via r.jina.ai). Local files also have no Spotify URI. Expect clusters of un-joinable plays; surface them as 'unattributed' rather than dropping silently.
- **[high/verified-secondary]** The same recording appears under several spotify_track_uri values: of 14,817 distinct track URIs in one history, 14,671 had an ISRC and only 13,036 ISRCs were unique (~11% of URIs are alternate ids of another URI); causes cited are relinking, market availability and re-releases. Play counts per URI therefore undercount per song unless merged.
  - source: https://blog.ortham.net/posts/2024-12-28-spotify-streaming-history-part-2/
  - notes: Part 1 shows a concrete example ('A New Hope and End Credits' as four tracks with different ISRCs) and manual merging reduced 537 albums to 497. The Web API track object exposes linked_from and external_ids.isrc (https://developer.spotify.com/documentation/web-api/concepts/track-relinking) for merging; the history itself has no linked_from.
- **[medium/verified-secondary]** Timestamp pitfalls: ts is rounded to the second and records overlap — "65946 streams that overlapped with their predecessor, totalling just over 8.3 days"; identical records with different timestamps exist; "about 8% of ts values and about 2.6% of the total duration potentially being wrong"; skipped is unreliable ("All values between 2015-04-13 and 2022-10-16 are false"); offline_timestamp "units switched from seconds to milliseconds at some point" and its meaning per the ReadMeFirst PDF is only "This field is a timestamp of when offline mode was used, if used".
  - source: https://blog.ortham.net/posts/2024-12-21-spotify-streaming-history-part-1/
  - notes: The Nov-2024 export in your_spotify #458 shows offline_timestamp 1699136230 (seconds) for a 2023 stream, so the unit is inconsistent even in recent data. ReadMeFirst quote also in https://community.spotify.com/t5/Spotify-for-Developers/In-what-format-is-the-offline-timestamp-key-in-your-personal/td-p/5493444 (no replies). Do not use ts as a unique key; do not rely on skipped or offline_timestamp.
- **[high/verified-official]** Spotify's stream rule: "A stream is counted when a listener plays your song for at least 30 seconds"; offline plays are counted "when the listener goes online (which they must do at least once every 30 days)".
  - source: https://support.spotify.com/us/artists/article/how-your-streams-are-counted/
- **[high/verified-official]** Wrapped methodology (official, Dec 2025): "a play is counted once you've listened for more than 30 seconds"; "Streams from Private Mode or from songs and playlists you've excluded from your Taste Profile don't shape your taste-based stories"; "your Wrapped includes all of your offline listening"; window is January 1 until mid November.
  - source: https://newsroom.spotify.com/2025-12-05/wrapped-methodology-explained/
  - notes: incognito_mode = private session. The export includes those plays; Wrapped excludes them. Community tooling: stats.fm filters "Streams shorter than 30 seconds* (since they make your stats inaccurate)" (https://support.stats.fm/docs/import/); playbackstats.com uses a "30-second threshold for its qualified-play rankings" while still summing all ms_played for hours; your_spotify skips < 30000 ms.
- **[medium/verified-official]** JSON exchanged between systems "MUST be encoded using UTF-8"; parsers "MAY ignore the presence of a byte order mark rather than treating it as an error".
  - source: https://www.rfc-editor.org/rfc/rfc8259
  - notes: Real export files contain raw UTF-8 (see elastic sample). Decode with TextDecoder('utf-8') (which strips a BOM by default) or fflate.strFromU8.
- **[high/verified-secondary]** fflate: decompression-only build is ~3 kB; unzipSync(zipped, { filter(file) {...} }) can skip entries by name/size; the streaming API is new fflate.Unzip() + unzipper.register(fflate.UnzipInflate) with onfile -> file.ondata(err, dat, final) and file.start(), fed by unzipper.push(chunk, final); async APIs run "in a separate thread entirely and automatically by using Web (or Node) Workers"; strFromU8 converts bytes to string.
  - source: https://github.com/101arrowz/fflate
  - notes: Allows decompressing one Streaming_History_Audio file at a time and discarding it, instead of inflating the whole ~150 MB at once.
- **[high/verified-secondary]** A 2026 browser-only importer (spotify-unzipped) does: JSZip.loadAsync(arrayBuffer) inside a Web Worker, selects entries with /Streaming_History_(Audio|Video).*\.json$/i, keeps Audio files only when present, sorts by name, then per file `await entry.async('text')` and `JSON.parse(text)` with a try/catch that skips unparsable files, posting progress per file.
  - source: https://raw.githubusercontent.com/NateShoffner/spotify-unzipped/master/src/workers/dataProcessor.worker.ts
  - notes: mystats.music also parses in "a secure Web Worker" and accepts my_spotify_data.zip directly; playbackstats.com lets users "choose the complete unzipped export folder" (webkitdirectory) and keeps data in memory only.
- **[high/verified-secondary]** The File System Access API (showDirectoryPicker/showOpenFilePicker) is supported only in Chromium desktop (Chrome/Edge 105+, Opera 91+); not supported in Firefox, Safari (desktop and iOS 3.2-26.6), Chrome for Android, Firefox for Android, Samsung Internet.
  - source: https://caniuse.com/native-filesystem-api
  - notes: For a phone-friendly app use <input type="file" accept=".zip,.json" multiple> (MDN: with multiple 'the user can select one or more files'); on phones a single .zip pick is the most practical.
- **[high/verified-secondary]** Mobile Safari memory: a web page "consistently" crashes at around 100 MB on a 3rd-gen iPhone SE and around 200 MB on an 8th-gen iPad (iOS 26.2), sometimes freezing the device; no JS exception is thrown.
  - source: https://lapcatsoftware.com/articles/2026/1/7.html
  - notes: catchmetrics.io gives per-device JS heap ceilings (~200-450 MB for iPhone 6s..14, ~1 GB+ for iPhone 15+) and notes "When a page exceeds available memory, it doesn't slow down gracefully. It crashes." (https://www.catchmetrics.io/blog/deep-dive-ram-internals-webkit). Holding 150 MB of decoded JSON strings plus parsed objects at once will crash older phones.
- **[medium/verified-secondary]** V8 caps a single string at 2^29 - 24 characters (~536 M) on 64-bit, and JSON.parse "is synchronous and blocks the main thread for its entire duration"; recommendation is to stream/parse incrementally or in a worker for large payloads.
  - source: https://jsonkit.in/blog/json-size-limits-guide
  - notes: Individual export files (<= ~12 MB) are far below the string limit; the risk is cumulative memory and main-thread blocking, not the string cap.
- **[medium/verified-secondary]** Recent guides (updated Aug 2026 and Mar/Jun 2026) still describe the same request path (Account > Privacy settings > Download your data > Extended streaming history, confirm via email, up to 30 days) and the same Streaming_History_Audio_YYYY-YYYY_N.json naming; a May-2026 analysis of a fresh export lists the same keys including ip_addr; no source reports a 2025 or 2026 schema change.
  - source: https://takeoutday.org/guides/download-spotify-data
  - notes: Also https://rigtch.fm/blog/how-to-import-your-full-spotify-listening-history (2026-03-19), https://addshore.com/2026/05/where-do-i-spotify/ (May 2026, keys listed), https://www.theodorehq.com/echo/blog/posts/download-spotify-streaming-history (June 2026). Absence of evidence, not proof.
- **[low/verified-secondary]** An alternative community play heuristic (Chareste parser) counts a track as played when ms_played >= 1/3 of the track length and an episode when >= 5 min or >= 1/2 its length; this needs track duration from the Web API and is not Spotify's rule.
  - source: https://github.com/Chareste/SpotifyHistoryParserExtended

## Sample record (2025 export, 23 keys)

```json
{
    "ts": "2010-06-16T16:33:36Z",
    "platform": "iPhone 11",
    "ms_played": 284289,
    "conn_country": "AT",
    "ip_addr": "11.144.233.10",
    "master_metadata_track_name": "Kiss me twice",
    "master_metadata_album_artist_name": "Parov Stelar",
    "master_metadata_album_album_name": "Hôtel Costes 9",
    "spotify_track_uri": "spotify:track:3NVWHqOWoYQyewSBO3g8Mt",
    "episode_name": null,
    "episode_show_name": null,
    "spotify_episode_uri": null,
    "audiobook_title": null,
    "audiobook_uri": null,
    "audiobook_chapter_uri": null,
    "audiobook_chapter_title": null,
    "reason_start": "trackdone",
    "reason_end": "trackdone",
    "shuffle": false,
    "skipped": false,
    "offline": false,
    "offline_timestamp": null,
    "incognito_mode": false
}
```

## Facts the checker added

- **[high]** Audio file names are not always year ranges: real exports contain single-year names such as Streaming_History_Audio_2017_1.json, _2018_3.json, _2022_10.json, _2024_13.json (jrtechs Jan-2026 export) and _2021_4.json, _2015_1.json, _2026_4.json (eight Jan-2026 exports in dstouck92/JSONstorage1). The matching regex must be /^Streaming_History_Audio_\d{4}(?:-\d{4})?_\d+\.json$/i (basename only).
  - source: https://jrtechs.net/data-science/the-data-spotify-collected-on-me-over-ten-years
- **[high]** Streaming_History_Video_*.json uses exactly the same record schema as the Audio files (21 old keys in 2024 exports, 23 keys since 2025; jpollard's audio.schema.json and video.schema.json are identical) and holds music-video plays WITH spotify:track URIs (54 of 81 records in a June-2025 export; 91 of 108 in another) plus video podcast episodes; these records do not appear in the Audio files (0 same-ts overlap against 4 exports / 669k audio records). The importer must decide explicitly whether to count Video-file track plays; ignoring the file undercounts, matching '(Audio|Video)' counts them.
  - source: https://raw.githubusercontent.com/marcobadiello/Esame-Sistemi-2/0f7f7e761df70cfb896c233502456e3854679716/DATI/Spotify%20Extended%20Streaming%20History/Streaming_History_Video_2020-2025.json
- **[high]** Spotify's own ReadMeFirst_ExtendedStreamingHistory.pdf (1,618,128-byte version shipped unchanged in exports from Dec 2024 through Jan 2026, 58 languages) is stale: it still documents username, ip_addr_decrypted, user_agent_decrypted, no audiobook_* keys, shows every boolean as null/true/false, says "Each stream in the file begins with {"ts"", defines ts as "when the track stopped playing in UTC", spotify_track_uri as "spotify:track:<base-62 string>", and offline_timestamp only as "a timestamp of when offline mode was used, if used". Do not code to the PDF or to the support page; code to the real 23-key shape.
  - source: https://raw.githubusercontent.com/mhleethomas/Spotify_Extended_Streaming_History/HEAD/docs/ReadMeFirst_ExtendedStreamingHistory.pdf
- **[high]** Newest evidence (a July-2026 export, file Streaming_History_Audio_2026_3.json, 1,706 records, ts like 2026-07-16T21:16:25Z) still has exactly the 23 keys with ip_addr and the four audiobook_* keys and no username/*_decrypted keys; offline_timestamp is int|null in Unix seconds. No schema change through mid-2026.
  - source: https://raw.githubusercontent.com/zahran001/spotify-analytics/HEAD/spotify-play-schema-spec.md
- **[high]** Audiobook records live inside the Audio/Video files (GitHub code search for 'Streaming_History_Audiobook' returns 0 results and no Jan-2026 export listing has such a file) and use audiobook_uri = "spotify:show:<id>" and audiobook_chapter_uri = "spotify:episode:<id>" with spotify_track_uri and spotify_episode_uri null (60 real records in a July-2026 export). Classify a record by which of spotify_track_uri / spotify_episode_uri / audiobook_uri is non-null; never assume 'spotify:show' means podcast.
  - source: https://raw.githubusercontent.com/Tim-Claessen/wrapt/HEAD/spotify_history/Batch2/Streaming_History_Video_2024.json
- **[medium]** Boolean fields really are nullable: every record of 2023-2024-era exports has "offline": null and many have "skipped": null (e.g. hanada-stephan file: offline null on 116/116, skipped null in others), and a July-2026-generated export still has "offline": null on audiobook rows. offline_timestamp is an integer Unix-seconds epoch (e.g. 1737979402) or null, and is 0 in old-format exports; in one June-2025 export all 15,907 records of a file had a non-null value approximately equal to ts - ms_played even with offline=false. Treat shuffle/skipped/offline/incognito_mode as boolean|null and offline_timestamp as number|null; do not use it for logic.
  - source: https://raw.githubusercontent.com/hanada-stephan/spotify_historical_data/9938661efecdb67a93cde5975a6bda8d09596809/data/raw/Streaming_History_Video_2022-2024.json
- **[medium]** Lexical file-name order is not chronological ('Streaming_History_Audio_2022-2023_11.json' sorts before '_2022_10.json', '_10' before '_2'); within one export the _N suffix is contiguous from 0 and strictly chronological (e.g. file _0 ends 2021-11-13T16:42:32Z, file _1 starts 2021-11-13T16:42:35Z). Order by numeric N or by ts, not by name.
  - source: https://raw.githubusercontent.com/marcobadiello/Esame-Sistemi-2/0f7f7e761df70cfb896c233502456e3854679716/DATI/Spotify%20Extended%20Streaming%20History/Streaming_History_Audio_2024-2025_3.json
- **[medium]** Real per-file sizes are 12.63-12.84 MB (e.g. 12,813,604 bytes), i.e. ~15,500-16,000 records per file with the 23-key shape (~800 bytes/record) and 18,000-19,400 with the 19-key Dec-2024 shape; files start with "[\n  {" (2-space indent, no BOM) and contain raw UTF-8 without \u escapes. A 10-year heavy listener in Jan-2026 exports has 7-11 audio files (~90-135 MB).
  - source: https://api.github.com/repos/dstouck92/JSONstorage1/git/trees/HEAD?recursive=1
- **[medium]** The Account-data package now ships StreamingHistory_music_N.json, StreamingHistory_podcast_N.json and StreamingHistory_audiobook_N.json plus Read_Me_First.pdf (Jan-2026 listing); your_spotify issue #458 comments (2024-11-27) also report "seperate Podcast, Audio, and Video json files in the account data". Wrong-package detection should recognise all three StreamingHistory_* names and the endTime/msPlayed schema.
  - source: https://jrtechs.net/data-science/the-data-spotify-collected-on-me-over-ten-years
- **[low]** Observed enum values in a 2025 export (730k records): reason_start = trackdone, fwdbtn, clickrow, backbtn, playbtn, appload, remote, trackerror, unknown, "" (empty string), endplay, switched-to-audio; reason_end = trackdone, fwdbtn, endplay, backbtn, logout, unexpected-exit-while-paused, remote, unexpected-exit, unknown, trackerror, playbtn, "". ms_played can be 0 (36 of 15,907 records) and 13.5% of records were under 30 s. Exact duplicate (ts, uri, ms_played) records are rare (1 pair in 15,907).
  - source: https://raw.githubusercontent.com/marcobadiello/Esame-Sistemi-2/0f7f7e761df70cfb896c233502456e3854679716/DATI/Spotify%20Extended%20Streaming%20History/Streaming_History_Audio_2024-2025_3.json
- **[low]** Ortham (Dec 2024): the skipped flag was always false between April 2015 and October 2022, so skip detection should use `skipped or reason_end in ('backbtn','unknown','endplay','fwdbtn')`; since 2023-10-19 platform is recorded only as android/linux/windows/not_applicable (and 'ios' in 2025 files); ~2.6% of total streaming time consists of overlapping consecutive streams; 42,538 online streams carried an offline_timestamp.
  - source: https://blog.ortham.net/posts/2024-12-21-spotify-streaming-history-part-1/
- **[low]** Download-link validity remains undocumented: the community threads 'Extended streaming history' (td-p/5695049) and 'Why isn't my extended streaming history data ready yet' (td-p/6009253) contain no moderator timeframe, the official 'Data rights and privacy' page gives none, and the June-2026 Echo guide only says links are "only valid for a short window after the email arrives". Real arrival times reported: ~4 hours (Ortham), next day (jrtechs, issue #458) despite the stated 30 days.
  - source: https://www.theodorehq.com/echo/blog/posts/download-spotify-streaming-history

## Open questions

- How long the final download link in the 'your data is ready' email stays valid: no official statement found; only the confirmation (verification) link is documented by a moderator as expiring in 14 days, and a June-2026 guide says download links are valid for 'a short window'.
- Whether Streaming_History_Video_*.json uses exactly the same 23-key schema as the Audio files (every tool inspected simply ignores or merges it; no source documents its keys). Safe default: ignore Video files for play counts.
- Whether audiobook plays ever get their own Streaming_History_Audiobook file in the Extended package, or always live inside the Audio files via audiobook_* keys (the Nov-2024 report of 'separate files' referred to the Account-data package). Safe default: match any Streaming_History_Audio*.json and classify records by which URI key is non-null.
- Exact date the export switched from username/ip_addr_decrypted/user_agent_decrypted to ip_addr (between Feb 2024 and Nov 2024) and when the four audiobook_* keys were added (present by Feb 2025, absent in a Nov-2024 sample) — relevant only if the user has an old zip lying around.
- offline_timestamp semantics and units (seconds vs milliseconds appear in the same era); Spotify never answered the community question. Recommend ignoring it.
- Whether the ReadMeFirst_ExtendedStreamingHistory.pdf is still included in 2026 zips (present in 2024 exports; 2026 write-ups do not mention it). Not needed by the importer either way.
- Whether Spotify filters or dedups anything in the export (stats.fm says it removes 'duplicate streams' on import, and Ortham found identical records with different ts); no official dedup rule exists, so any client-side dedup is a heuristic.
- No 2025/2026 schema change was found (your_spotify has zero related issues since 2025 and 2026 tools use the same 23 keys), but Spotify does not announce format changes, so the parser must stay tolerant of added/removed keys.

## Design implications

- Input UX: accept the raw my_spotify_data.zip via <input type="file" accept=".zip,.json" multiple> (works on iOS/Android); do not depend on showDirectoryPicker (unsupported on Safari, Firefox and every mobile browser). Optionally also accept multiple loose .json files for users who already unzipped.
- File selection: match entries by basename with /Streaming_History_Audio.*\.json$/i regardless of folder (folder has been MyData/ and 'Spotify Extended Streaming History/'); skip Streaming_History_Video_*.json, the PDF and everything else; if only StreamingHistory_music_N.json / endTime-shaped records are found, tell the user they downloaded the 'Account data' package and must request 'Extended streaming history'.
- Memory: never concatenate files or inflate the whole archive at once. Read the zip as an ArrayBuffer (~7-15 MB), then for each Audio entry inflate -> TextDecoder('utf-8') -> JSON.parse -> fold into an aggregate Map<trackId, {plays, ms, first, last}> -> drop the strings/objects before the next file. Each file is <= ~12 MB pretty-printed (~12-16k records) so per-file parse is cheap; peak live memory stays in the tens of MB, under the ~100-200 MB iOS Safari crash zone. Do this in a Web Worker (fflate async API or a dedicated worker) and post per-file progress; expect ~20 files / ~150 MB / ~230k records for a 10-year heavy listener.
- Schema tolerance: type every key as optional and every value as nullable (keys differ across export dates: username/ip_addr_decrypted/user_agent_decrypted in <=early-2024 exports, ip_addr later, audiobook_* keys appearing by 2025). Parse defensively; skip records that are not objects; do not fail the whole import on one bad file.
- Record classification and join key: a music play is a record whose spotify_track_uri starts with 'spotify:track:'; the Web API track id is uri.split(':')[2]. Records with spotify_episode_uri are podcasts, with audiobook_uri audiobooks; records where all metadata is null are unattributed (Spotify-side gaps from Oct 2022-early 2023 and mid 2024, plus local files). Count and display unattributed plays instead of silently dropping them.
- Play counting: count a play when ms_played >= 30000 (Spotify's official stream rule and Wrapped rule, also used by stats.fm and your_spotify); keep the total ms_played separately so 'hours listened' includes short plays. Consider a toggle to exclude incognito_mode plays to mirror Wrapped. Do not use skipped (false for all records 2015-2022) or offline_timestamp.
- Timestamps: ts is the stream END time in UTC ('Z'); derive start as ts - ms_played when needed; convert to the DJ's local zone only for display. Do not use ts as a unique key: legitimate records share the same second and overlaps are common; if deduping, use a composite (ts, spotify_track_uri, ms_played) and expect near-duplicates to remain.
- Relinking / duplicate ids: ~11% of distinct track URIs in one real history were alternate ids of the same recording (relinks, market variants, re-releases), so playlist track id -> history id joins will miss some plays. Join first on exact id, then batch GET /tracks (50 ids per call) for playlist tracks and history ids to obtain linked_from.id and external_ids.isrc, and merge play counts across ids sharing an ISRC (or linked_from). Show the DJ when a playlist track's count was merged from several ids.
- Privacy: the export contains ip_addr and conn_country for every play; process entirely client-side, never upload the raw files, and persist only the aggregated per-track counts (e.g. IndexedDB) so the raw JSON is discarded after import.
- Onboarding copy: explain that the user must request 'Extended streaming history' (not 'Account data') on spotify.com/account/privacy, confirm the verification email within 14 days, and that the zip arrives by email typically within days but officially up to 30 days; the export is a snapshot, so provide a 're-import newer export' path that replaces the previous aggregate.
