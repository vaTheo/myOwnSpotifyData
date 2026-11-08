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
import math
import re
import urllib.parse
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from . import __version__
from .match import artist_matches, title_matches

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


@dataclass(frozen=True)
class Guide:
    """One guided span: its core (the span shrunk by the edges) is skipped by
    the first pass except the one confirming probe at `confirm_at`."""

    span_index: int
    core_start: float
    core_end: float
    confirm_at: int


def plan_guides(spans: list[Span], step: int, probe_seconds: int) -> list[Guide]:
    """A guide per span whose core (start + 10 s to end - 10 s) is at least
    `TRACKID_MIN_CORE_SECONDS` long; the confirming probe's window is centred
    on the span's middle, never below 0. `step` is the grid the scan walks (the
    skipping itself happens there, on the grid's own windows)."""
    guides: list[Guide] = []
    for i, span in enumerate(spans):
        core_start = span.start + TRACKID_EDGE_SECONDS
        core_end = span.end - TRACKID_EDGE_SECONDS
        if core_end - core_start < TRACKID_MIN_CORE_SECONDS:
            continue
        guides.append(Guide(i, core_start, core_end, max(0, int((span.start + span.end) / 2 - probe_seconds / 2))))
    return guides


def check_of(span: Span, entries: list[dict[str, Any]], probed: bool = False) -> dict[str, Any]:
    """What the Shazam probes inside a span said about it: `agrees` (some
    entry names the same track by the `match.py` rule), `differs` (entries, none
    agreeing; carries the most confident one), `no_match` (a probe was made
    inside the span and nothing matched), `not_asked` (no probe was made)."""
    for e in entries:
        if artist_matches(span.artist, str(e.get("artist", ""))) and title_matches(span.title, str(e.get("song_name", ""))):
            return {"outcome": "agrees"}
    if entries:
        best = max(entries, key=lambda e: e.get("confidence") or 0)
        # The worker's confidence is 0..100; the result shape and the app take 0..1.
        confidence = best.get("confidence")
        if isinstance(confidence, (int, float)) and not isinstance(confidence, bool):
            confidence = round(min(max(confidence / 100, 0.0), 1.0), 3)
        else:
            confidence = None
        return {"outcome": "differs", "artist": best.get("artist"), "song_name": best.get("song_name"), "confidence": confidence}
    return {"outcome": "no_match" if probed else "not_asked"}


def _clock(seconds: float) -> str:
    h, rest = divmod(int(seconds), 3600)
    m, s = divmod(rest, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def span_rows(spans: list[Span], checks: dict[int, dict[str, Any]], slug: str) -> list[dict[str, Any]]:
    """One result row per span (contracts/result-shape.md): the span is the
    truth, the Shazam check rides along; no `confidence` of its own."""
    rows: list[dict[str, Any]] = []
    for i, span in enumerate(spans):
        info: dict[str, Any] = {"slug": slug, "span_start": int(span.start), "span_end": int(span.end)}
        if span.references is not None:
            info["references"] = span.references
        row: dict[str, Any] = {
            "song_name": span.title,
            "artist": span.artist,
            "time_in_mix": _clock(span.start),
            "origin": "trackid",
            "trackid": info,
            "shazam_check": dict(checks.get(i) or {"outcome": "not_asked"}),
        }
        if span.label:
            row["metadata"] = {"label": span.label}
        row["hits"] = 0
        rows.append(row)
    return rows


def _seconds_of(row: dict[str, Any]) -> int:
    parts = str(row.get("time_in_mix") or "").split(":")
    try:
        h, m, s = (int(p) for p in parts)
    except ValueError:
        return 0
    return h * 3600 + m * 60 + s


def merge_rows(heard: list[dict[str, Any]], trackid_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Both lists by start time (stable: a heard row before a TrackId.net row at the same second)."""
    return sorted([*heard, *trackid_rows], key=_seconds_of)


def uncovered(gaps: list[tuple[int, int]], spans: list[Span]) -> list[tuple[int, int]]:
    """The gaps minus the stretches the spans cover; a piece under 1 s is dropped."""
    out: list[tuple[int, int]] = []
    for start, end in gaps:
        pieces = [(float(start), float(end))]
        for span in spans:
            nxt: list[tuple[float, float]] = []
            for a, b in pieces:
                if span.end <= a or span.start >= b:
                    nxt.append((a, b))
                    continue
                if span.start > a:
                    nxt.append((a, span.start))
                if span.end < b:
                    nxt.append((span.end, b))
            pieces = nxt
        out.extend((math.ceil(a), int(b)) for a, b in pieces if int(b) - math.ceil(a) >= 1)
    return out
