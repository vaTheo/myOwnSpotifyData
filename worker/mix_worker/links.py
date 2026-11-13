"""The address a request is worked on (spec 028).

A request carries the link the app recorded. The worker works on one clean
address: a SoundCloud set address is trimmed with the app's rule
(`normalizeMixUrl` in `src/features/mix/url.ts`; both test suites read
`src/features/mix/url.cases.json`), and a phone share link
(`on.soundcloud.com/<token>`) is followed to the set it leads to, only
inside SoundCloud's hosts. Nothing here does I/O: the one request is
injected (`locate`), and nothing here raises.
"""

from __future__ import annotations

import urllib.parse
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

PAGE_HOSTS = ("soundcloud.com", "www.soundcloud.com", "m.soundcloud.com")
SHORT_HOST = "on.soundcloud.com"
MAX_REQUESTS = 3  # to the short host, per request; it answers in one (research R1)
LINK_TIMEOUT_SECONDS = 10
REDIRECTS = (301, 302, 303, 307, 308)
GONE = (400, 404, 410)  # an unknown token answers 404, a malformed one 400

NOT_FOUND = "Short link not found; paste the set's full link"
NO_ANSWER = "SoundCloud did not answer for the short link; ask again later"
NOT_A_SET = "Short link does not lead to a SoundCloud set"

# (address, timeout) → (status, Location header); one request, no redirect
# followed; raises on a network error. The real one is `cli.http_location`.
Locate = Callable[[str, float], tuple[int, str | None]]


@dataclass(frozen=True)
class LinkFailure:
    """A request whose link gives no address to work on."""

    reason: str  # the request's `error`, shown in the app
    detail: str  # for the log only


def trim_soundcloud(url: Any) -> str | None:
    """`https://soundcloud.com<path>` for a SoundCloud set address, else None:
    the query and the fragment dropped, the host rewritten, exactly one
    trailing slash dropped, the path kept character for character (TrackId.net
    matches the exact address). A profile (fewer than two path parts) is None."""
    if not isinstance(url, str):
        return None
    try:
        parts = urllib.parse.urlsplit(url.strip())
        host = parts.hostname
        parts.port  # noqa: B018 - a bad port raises here, as the browser's URL refuses it
    except ValueError:
        return None
    if parts.scheme not in ("http", "https") or host not in PAGE_HOSTS:
        return None
    path = parts.path[:-1] if parts.path.endswith("/") else parts.path
    if len([part for part in path.split("/") if part]) < 2:
        return None
    return f"https://soundcloud.com{path}"


def host_on(url: Any, hosts: tuple[str, ...]) -> str | None:
    """The host of an `https` address on one of `hosts`, without user info and
    on the default port; else None. The one test of where the worker may go
    for a SoundCloud link (the shared-mode check uses it too, ADR-16)."""
    if not isinstance(url, str):
        return None
    try:
        parts = urllib.parse.urlsplit(url)
        host, port = parts.hostname, parts.port
    except ValueError:
        return None
    safe = parts.scheme == "https" and host in hosts and parts.username is None and parts.password is None and port in (None, 443)
    return host if safe else None


def _where(url: str) -> str:
    """For the log: the scheme and host a refused address names, never its
    path or query (a share token is someone's)."""
    try:
        parts = urllib.parse.urlsplit(url)
        host, port = parts.hostname, parts.port
    except ValueError:
        return "an unreadable address"
    if not parts.scheme or not host:
        return "an unreadable address"
    return f"{parts.scheme}://{host}" + (f":{port}" if port else "")


def resolve_short_link(url: str, locate: Locate) -> str | LinkFailure:
    """The trimmed set address a share link leads to. At most `MAX_REQUESTS`
    requests, each to the short host only; a `Location` is accepted only on
    SoundCloud's hosts. One try per request, never a retry."""
    current = url
    for _ in range(MAX_REQUESTS):
        if host_on(current, (SHORT_HOST,)) is None:
            return LinkFailure(NOT_A_SET, f"leads to {_where(current)}")
        try:
            status, location = locate(current, LINK_TIMEOUT_SECONDS)
        except Exception as err:  # noqa: BLE001 - a network layer may raise anything
            return LinkFailure(NO_ANSWER, type(err).__name__)
        if status in GONE:
            return LinkFailure(NOT_FOUND, f"HTTP {status}")
        if status not in REDIRECTS:
            if isinstance(status, int) and 200 <= status < 300:
                return LinkFailure(NOT_A_SET, "no redirect")  # a page, not a redirect
            return LinkFailure(NO_ANSWER, f"HTTP {status}")
        if not isinstance(location, str) or not location.strip():
            return LinkFailure(NOT_A_SET, "no redirect")
        try:
            target = urllib.parse.urljoin(current, location.strip())
        except ValueError:
            return LinkFailure(NOT_A_SET, "leads to an unreadable address")
        host = host_on(target, PAGE_HOSTS + (SHORT_HOST,))
        if host is None:
            return LinkFailure(NOT_A_SET, f"leads to {_where(target)}")
        if host != SHORT_HOST:
            trimmed = trim_soundcloud(target)
            return trimmed if trimmed is not None else LinkFailure(NOT_A_SET, "not a set address")
        current = target
    return LinkFailure(NOT_A_SET, "too many redirects")


def working_address(url: str, locate: Locate) -> str | LinkFailure:
    """The address a request is worked on: the set a share link leads to, a
    SoundCloud set address trimmed, any other link as it arrives. `locate` is
    called for a share link only."""
    try:
        host = urllib.parse.urlsplit(url).hostname
    except ValueError:
        return url
    if host == SHORT_HOST:
        return resolve_short_link(url, locate)
    if host in PAGE_HOSTS:
        return trim_soundcloud(url) or url
    return url
