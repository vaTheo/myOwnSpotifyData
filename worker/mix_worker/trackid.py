"""TrackId.net, asked by the exact mix link only (round 016, ADR-17).

Two calls once per request, before the first probe: the list by `?url=` and the
record by the slug the list gave. Anything odd is "unknown" (`None`) with one
log line; nothing here raises, so TrackId.net can never cost a request. The
keyword endpoint is never used (a name search; ADR-04, ADR-10).

`fetch(url, headers, timeout)` returns `(status, body_bytes)` or raises; it is
injected (the real one lives in the pipeline wiring), as are `sleep` and `log`.
`parse_spans` ports `tidSpansToRows` of `src/features/mix/trackid.ts`.
"""

from __future__ import annotations

import json
import re
import urllib.parse
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from . import __version__

TRACKID_LIST_URL = "https://trackid.net/api/public/audiostreams"
TRACKID_EDGE_SECONDS = 10
TRACKID_MIN_CORE_SECONDS = 40
TRACKID_DURATION_TOLERANCE = 0.05
TRACKID_SPAN_CAP = 500
TRACKID_TIMEOUT_SECONDS = 10
TRACKID_INTERVAL_SECONDS = 0.25
MERGE_TOLERANCE_SECONDS = 5  # the app's MIX_MERGE_TOLERANCE_SEC

Fetch = Callable[[str, dict[str, str], float], tuple[int, bytes]]

_CLOCK = re.compile(r"^(\d{1,3}):([0-5]\d):([0-5]\d)(?:\.(\d+))?$")


@dataclass(frozen=True)
class Span:
    start: float
    end: float
    artist: str
    title: str
    label: str | None = None
    references: int | None = None


@dataclass(frozen=True)
class Record:
    slug: str
    title: str
    duration: float | None
    spans: list[Span] = field(default_factory=list)


def parse_clock(value: Any) -> float | None:
    """`HH:MM:SS[.fffffff]` to seconds, or None when it is not that shape."""
    if not isinstance(value, str):
        return None
    m = _CLOCK.match(value.strip())
    if not m:
        return None
    seconds = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3))
    if m.group(4):
        seconds += float("0." + m.group(4))
    return float(seconds)


def _dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def parse_spans(
    record: Any, log: Callable[[str], None] | None = None, cap: int = TRACKID_SPAN_CAP
) -> list[Span]:
    """Flatten, drop, merge, sort, cap (the contract's order)."""
    groups: dict[Any, list[Span]] = {}
    index = 0
    for process in _list(_dict(record).get("detectionProcesses")):
        for t in _list(_dict(process).get("detectionProcessMusicTracks")):
            t = _dict(t)
            start = parse_clock(t.get("startTime"))
            end = parse_clock(t.get("endTime"))
            if start is None or end is None or end < start:
                continue
            artist, title = _text(t.get("artist")), _text(t.get("title"))
            if not artist or not title:
                continue
            raw_id = t.get("musicTrackId")
            valid = (isinstance(raw_id, int) and not isinstance(raw_id, bool)) or (
                isinstance(raw_id, str) and raw_id != ""
            )
            key = ("id", str(raw_id)) if valid else ("missing", index)
            index += 1
            label = t.get("label")
            refs = t.get("referenceCount")
            groups.setdefault(key, []).append(
                Span(
                    start,
                    end,
                    artist,
                    title,
                    label if isinstance(label, str) else None,
                    refs if isinstance(refs, int) and not isinstance(refs, bool) else None,
                )
            )
    merged: list[Span] = []
    for group in groups.values():
        group.sort(key=lambda s: (s.start, s.end))
        current = group[0]
        for nxt in group[1:]:
            if nxt.start <= current.end + MERGE_TOLERANCE_SECONDS:
                current = Span(
                    current.start,
                    max(current.end, nxt.end),
                    current.artist,
                    current.title,
                    current.label,
                    current.references,
                )
            else:
                merged.append(current)
                current = nxt
        merged.append(current)
    merged.sort(key=lambda s: (s.start, s.end))
    if len(merged) > cap:
        if log:
            log(f"trackid · {len(merged)} spans, keeping the first {cap}")
        merged = merged[:cap]
    return merged


def trusted(record: Record, audio_duration: float | None) -> bool:
    """The record's duration within 5 % of the audio's; an unknown one is trusted."""
    if not audio_duration or audio_duration <= 0 or record.duration is None:
        return True
    return abs(record.duration - audio_duration) / audio_duration <= TRACKID_DURATION_TOLERANCE


class _Unknown(Exception):
    """Internal: the reason (one log line) TrackId.net knows nothing usable."""


def _get(url: str, fetch: Fetch) -> dict[str, Any]:
    headers = {"User-Agent": f"mix-worker/{__version__}", "Accept": "application/json"}
    try:
        status, raw = fetch(url, headers, TRACKID_TIMEOUT_SECONDS)
    except Exception as err:  # noqa: BLE001 - a network layer may raise anything
        raise _Unknown(f"unreachable ({type(err).__name__})") from err
    if status != 200:
        raise _Unknown(f"HTTP {status}")
    try:
        data = json.loads(raw)
    except (ValueError, TypeError) as err:
        raise _Unknown("malformed answer") from err
    result = _dict(_dict(data).get("result"))
    if not result:
        raise _Unknown("malformed answer")
    return result


def fetch_trackid(
    link: str,
    fetch: Fetch,
    sleep: Callable[[float], None],
    log: Callable[[str], None],
) -> Record | None:
    """The two-call flow; a `Record` (spans parsed), or None with one log line."""
    try:
        listing = _get(f"{TRACKID_LIST_URL}?url={urllib.parse.quote(link, safe='')}", fetch)
        streams = _list(listing.get("audiostreams"))
        if listing.get("rowCount") != 1 or len(streams) != 1:
            raise _Unknown("not known")
        entry = _dict(streams[0])
        slug = entry.get("slug")
        if entry.get("url") != link or not isinstance(slug, str) or not slug.strip():
            raise _Unknown("not known")
        sleep(TRACKID_INTERVAL_SECONDS)
        detail = _get(f"{TRACKID_LIST_URL}/{urllib.parse.quote(slug, safe='')}", fetch)
        if detail.get("slug") != slug or detail.get("url") != link:
            raise _Unknown("not known")
        duration = parse_clock(detail.get("duration"))
        return Record(slug, _text(detail.get("title")), duration, parse_spans(detail, log))
    except _Unknown as why:
        log("trackid · not known" if str(why) == "not known" else f"trackid · {why}")
    except Exception as err:  # noqa: BLE001 - TrackId.net never costs a request
        log(f"trackid · failed ({type(err).__name__})")
    return None
