# Data model: The worker takes phone share links and trims SoundCloud links

Nothing stored changes: no table, no column, no IndexedDB store or field. The round adds one value the worker computes for the time
of a request and never stores on the server.

## Request link (unchanged shape, one more accepted form)

`jobs.payload.url`, written by the app's `requestIdentify` with `requestKey(input)`.

| Input | Request link | Before this round |
|---|---|---|
| a SoundCloud set address, any of the three hosts, with or without parameters | `https://soundcloud.com/<path>` (trimmed by the app) | the same |
| `on.soundcloud.com/<token>` | `https://on.soundcloud.com/<token>` plus its own query and fragment, as Look up saves it | refused |
| a SoundCloud profile, a bare `on.soundcloud.com` | refused | the same |
| any other `https` link | the link without its fragment and without `utm_*`, `si`, `feature` | the same |
| `http:`, free text | refused | the same |

It is the key of the saved mix (`mixes`, by `url`), of the request history (`mixJobs`) and of the automatic Ask again's plan.

## Working address (new, in the worker's memory only)

`links.working_address(request link, locate)`, computed once per request.

| Request link | Working address |
|---|---|
| on `on.soundcloud.com` | the trimmed address the short link leads to, or a `LinkFailure` |
| on `soundcloud.com`, `www.` or `m.`, a set address | its trimmed form (equal to the request link when the app recorded it) |
| on a SoundCloud page host, not a set address | the request link as it is |
| any other host | the request link as it is |

Trimmed form: `https://soundcloud.com<path>`, the query and fragment dropped, exactly one trailing slash dropped, the path kept
character for character, at least two path parts.

## LinkFailure

| Field | Holds |
|---|---|
| `reason` | one of the three texts of FR-010; becomes the request's `error`, shown in the app |
| `detail` | for the log only: `HTTP 404`, `TimeoutError`, `leads to <scheme>://<host>`, `no redirect`, `too many redirects`, `not a set address`; never a path or a query |

## Which step uses which link

| Step | Link |
|---|---|
| the log line `claimed <id> · …` | request link |
| the shared-mode host check (`shared_link_allowed`) | request link |
| asking `on.soundcloud.com` | request link (then each `Location` that stays on the short host) |
| the download (yt-dlp) | working address |
| the TrackId.net question and its exact-match guard | working address |
| the saved run (`<work_dir>/runs/<sha1>.json`) | working address |
| reading the description, chapters and comments | working address |
| `mix_info.source_url` in the result file | working address |
| progress, finish, release | the request's id |
| the automatic Ask again: its plan, its open-request check, its insert | request link |
| the app: applying the result, the Mixes list, Ask again | request link |

## State transitions

None added. A request that cannot be resolved goes `claimed` → `failed` with its reason, like a failed download.
