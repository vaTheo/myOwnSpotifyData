# Contract: the app

Amends `specs/002-mix-analysis-worker/contracts/client-api.md` (the `requestKey` entry).

## `src/features/mix/url.ts`

`requestKey(input: string): string | null`, the link of a request and the key it lands on:

| Input | Answer |
|---|---|
| a SoundCloud set address | `normalizeMixUrl(input)` (unchanged) |
| `on.soundcloud.com/<token>` (`http` or `https`, any host case) | `classifyMixInput(input).url`: `https://on.soundcloud.com<path><query><fragment>` (**new**; was `null`) |
| a SoundCloud profile; `on.soundcloud.com` with no token | `null` (unchanged) |
| another `https` link | host lower-cased, fragment dropped, `utm_*`, `si`, `feature` dropped (unchanged) |
| `http:` on another host, free text | `null` (unchanged) |

`normalizeMixUrl`, `classifyMixInput`, `isShortLink`, `permalinkCandidates` do not change. `normalizeMixUrl` gains tests only: every
entry of `url.cases.json` ([url-cases.md](url-cases.md)).

## `src/model/state.ts`

`NOT_A_REQUEST_LINK`:

```text
That is not a link the worker can take: paste an https link to the set.
```

`startIdentifyRequest` does not change: it already records whatever `requestKey` returns and shows this text on `null`.

## `src/ui/mix/MixDetail.tsx`

The note shown when `view.shortLink` is true, one sentence added (the third):

```text
This is a mobile share link, so the TrackId.net lookup could not be confirmed for it. The player and any tracklist in the
description are shown below — or paste a tracklist. Identify on my computer works with this link. On a computer, open the mix and
copy its full soundcloud.com/… link for a TrackId lookup.
```

Same element, same class (`mix-caption`): no token, no layout change.

## Not changed

- No network call is added; the app never asks `on.soundcloud.com`.
- `requestIdentify`, the pull, `validateJobRow`, `mixWithResult`, `mixListItems`, `requestStatusText`: untouched. A failed
  request's reason is shown as today, whatever its text.
- An app that was not updated never records a short link and still applies a result whose request link is one.
