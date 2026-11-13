# Contract: the worker (0.7.4)

Amends `specs/002-mix-analysis-worker/contracts/worker.md` ("One request", "Modules and the seams the tests use", "Outbound
hosts"). Everything there holds for a request whose link is not on SoundCloud.

## `worker/mix_worker/links.py` (new, no I/O of its own)

```python
PAGE_HOSTS = ("soundcloud.com", "www.soundcloud.com", "m.soundcloud.com")
SHORT_HOST = "on.soundcloud.com"
MAX_REQUESTS = 3
LINK_TIMEOUT_SECONDS = 10

NOT_FOUND = "Short link not found; paste the set's full link"
NO_ANSWER = "SoundCloud did not answer for the short link; ask again later"
NOT_A_SET = "Short link does not lead to a SoundCloud set"

@dataclass(frozen=True)
class LinkFailure:
    reason: str   # one of the three above
    detail: str   # for the log

Locate = Callable[[str, float], tuple[int, str | None]]   # (status, Location header); may raise

def trim_soundcloud(url: str) -> str | None
def host_on(url, hosts) -> str | None   # https, no user info, default port, host in hosts; else None
def resolve_short_link(url: str, locate: Locate) -> str | LinkFailure
def working_address(url: str, locate: Locate) -> str | LinkFailure
```

- `trim_soundcloud`: the app's `normalizeMixUrl`. Surrounding spaces removed; `http` or `https`; host lower-cased and in
  `PAGE_HOSTS`; query and fragment dropped; exactly one trailing slash dropped; fewer than two path parts gives `None`; anything
  that cannot be parsed gives `None`. Answer: `https://soundcloud.com<path>`. Pinned by [url-cases.md](url-cases.md).
- `resolve_short_link`: asks `locate(current, LINK_TIMEOUT_SECONDS)`, starting with `url`, at most `MAX_REQUESTS` times. Never
  raises. Never asks a host other than `SHORT_HOST`.
- `working_address`: a link on `SHORT_HOST` gives `resolve_short_link`; a link on a page host gives `trim_soundcloud(url) or url`;
  any other link gives `url`. `locate` is called only for a short link.

A `Location` is accepted only when it is `https`, has no user info, uses the default port, and its host is in `PAGE_HOSTS` or is
`SHORT_HOST`. A relative `Location` is joined to the address that was asked.

| Answer to a request on `on.soundcloud.com` | Outcome |
|---|---|
| 301, 302, 303, 307 or 308, `Location` accepted, on a page host | `trim_soundcloud(Location)`; `None` (a profile) gives `NOT_A_SET`, detail `not a set address` |
| the same, `Location` on the short host | asked again; after `MAX_REQUESTS` requests, `NOT_A_SET`, detail `too many redirects` |
| a redirect status with a `Location` not accepted | `NOT_A_SET`, detail `leads to <scheme>://<host>[:port]` (never the path or the query: a share token is someone's), or `leads to an unreadable address` |
| the request link itself is not an accepted `https` share link (user info, a port) | `NOT_A_SET`, the same detail, no request made |
| a redirect status without `Location` | `NOT_A_SET`, detail `no redirect` |
| 400, 404, 410 | `NOT_FOUND`, detail `HTTP <status>` (checked 2026-11-13: an unknown token answers 404, a malformed one 400) |
| any 2xx | `NOT_A_SET`, detail `no redirect` |
| any other status (401, 403, 429, 5xx, …) | `NO_ANSWER`, detail `HTTP <status>` |
| `locate` raises (network, timeout) | `NO_ANSWER`, detail the error's type name |

## `worker/mix_worker/cli.py`

- `http_location(url: str, timeout: float) -> tuple[int, str | None]`: the real `Locate`. One `GET`, `User-Agent:
  mix-worker/<version>`, the opener that follows no redirect (as `http_get`), the body not read. An HTTP error status is an
  answer `(status, Location)`, not an exception. A network error or a timeout raises.
- `SHARED_HOSTS = links.PAGE_HOSTS + (links.SHORT_HOST,)`. `shared_link_allowed` and `SHARED_LINK_REASON` keep their names, their
  place (checked before `run_one`) and their other rules (https, no user info, default port); the test itself is
  `links.host_on`, the one the resolver applies to every `Location`.
- `build_deps`: `address=lambda url: working_address(url, http_location)`. No setting turns it off.
- `run_queue`: unchanged. The `claimed` line, `auto.after(url, outcome)` and `enqueue` use the request's link.

## `worker/mix_worker/pipeline.py`

- `Deps.address: Callable[[str], str | LinkFailure] | None = None` (`None`: `run_one` is byte-identical to 0.7.3).
- `run_one`, "One request" step 1 becomes:
  1. **Validate** `payload.url` (https), as today.
  2. **Address** (new, under the `download` step, before the download): `work = deps.address(url)`.
     - A `LinkFailure`: log `  link · <detail>`, finish the request `failed` with `reason`. No download, no other request.
     - `work != url`: log `  link · <work>`.
  3. `work` is passed to `deps.download`, `deps.trackid`, `runstate.load`, `runstate.Recorder`, `deps.clues` and
     `write_result(source_url=)`. Progress, finish and release use the request's id, as today.

## Outbound hosts

The list of `specs/002-mix-analysis-worker/contracts/worker.md` gains `on.soundcloud.com`: at most 3 requests per short-link
request, only for a request whose link is on that host. Still never a Spotify host.

## Version

`worker/pyproject.toml` and `worker/mix_worker/__init__.py`: `0.7.4` (tested equal), then `uv lock`. The push to `main` releases
`worker-v0.7.4`.

## Tests

`worker/tests/test_links.py` (new), additions to `test_pipeline.py`, `test_cli.py` and `test_run_queue.py`: listed in plan.md,
"Tests". One existing expectation changes: `shared_link_allowed("https://on.soundcloud.com/x")` (`test_cli.py`) becomes true.
