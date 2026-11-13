# Contract: the shared trim cases

`src/features/mix/url.cases.json` (new), read by `src/features/mix/url.cases.test.ts` (through `normalizeMixUrl`) and by
`worker/tests/test_links.py` (through `links.trim_soundcloud`), as `match.cases.json` and `parse.cases.json` already are. Both
suites must give `expected` for every `input`.

```json
{
  "trim": [
    { "input": "https://soundcloud.com/user/some-mix", "expected": "https://soundcloud.com/user/some-mix" },
    { "input": "https://soundcloud.com/user", "expected": null }
  ]
}
```

Every name in it is made up (`user`, `some-mix`, `123456`). Paths are ASCII only, percent-encoded where a name is not (research
R3). 28 cases: the 26 of the plan and two encoded paths added by the review.

## The cases

The expected values were produced by running today's `normalizeMixUrl` on 2026-11-13: the app's rule is the reference, the worker's
port must match it.

| Input | Expected |
|---|---|
| `https://soundcloud.com/user/some-mix` | `https://soundcloud.com/user/some-mix` |
| `https://soundcloud.com/user/some-mix?si=abc123&utm_source=clipboard` | `https://soundcloud.com/user/some-mix` |
| `https://soundcloud.com/user/some-mix?in=someone/sets/favourites` | `https://soundcloud.com/user/some-mix` |
| `https://soundcloud.com/user/some-mix?in_system_playlist=your-moods%3A123456%3A5` | `https://soundcloud.com/user/some-mix` |
| `https://soundcloud.com/user/some-mix?ref=clipboard&p=a&c=0&si=abc123&utm_source=clipboard&utm_medium=text&utm_campaign=social_sharing` | `https://soundcloud.com/user/some-mix` |
| `https://soundcloud.com/user/some-mix#t=1:23` | `https://soundcloud.com/user/some-mix` |
| `https://m.soundcloud.com/user/some-mix?si=abc123` | `https://soundcloud.com/user/some-mix` |
| `https://www.soundcloud.com/user/some-mix` | `https://soundcloud.com/user/some-mix` |
| `https://SoundCloud.com/user/some-mix` | `https://soundcloud.com/user/some-mix` |
| `https://soundcloud.com/user/some-mix/` | `https://soundcloud.com/user/some-mix` |
| `https://soundcloud.com/user/some-mix//` | `https://soundcloud.com/user/some-mix/` (one slash dropped, not two) |
| `https://soundcloud.com/User/Some-Mix` | `https://soundcloud.com/User/Some-Mix` (the path's case is kept) |
| `https://soundcloud.com/user/some-mix/s-AbCdEf123?si=abc123` | `https://soundcloud.com/user/some-mix/s-AbCdEf123` (a private set) |
| `https://soundcloud.com/user/sets/some-playlist?si=abc123` | `https://soundcloud.com/user/sets/some-playlist` (a playlist: the download refuses it later) |
| `https://soundcloud.com/user/caf%C3%A9-mix?si=abc123` | `https://soundcloud.com/user/caf%C3%A9-mix` (an encoded path is kept as it is: how a name outside ASCII reaches the worker) |
| `https://soundcloud.com/user/a%20set/` | `https://soundcloud.com/user/a%20set` |
| `http://soundcloud.com/user/some-mix` | `https://soundcloud.com/user/some-mix` |
| `  https://soundcloud.com/user/some-mix  ` | `https://soundcloud.com/user/some-mix` |
| `https://soundcloud.com/user` | `null` (a profile) |
| `https://soundcloud.com/user/` | `null` |
| `https://soundcloud.com/` | `null` |
| `https://on.soundcloud.com/abc123XYZ` | `null` (a short link is not trimmed, it is resolved) |
| `https://example.com/user/some-mix` | `null` |
| `https://soundcloud.com.example.com/user/some-mix` | `null` |
| `soundcloud.com/user/some-mix` | `null` (no scheme) |
| `ftp://soundcloud.com/user/some-mix` | `null` |
| `not a link` | `null` |
| (empty) | `null` |

## Rule

A new case goes in the file, never in one suite only. A case that one language cannot match is a bug in the port, or a difference to
record in research R3 and keep out of the file.
