"""How sure a heard row is (spec 029): the rules that grade a row of Shazam hits.

Pure: no I/O, standard library only. A hit's evidence (`heard`) comes from its Shazam answer;
two hits of one track are in step when their positions in the record follow the mix's clock.
"""

from __future__ import annotations

import statistics
from typing import Any

STEP_TOLERANCE_SECONDS = 0.5
STEP_MAX_GAP_SECONDS = 60
INSIDE_MARGIN_SECONDS = 30
MANY_CANDIDATES = 10
LEVELS = ("solid", "inside", "candidates", "out_of_step", "once")

# Floating point: 13.08 s after a ×1.09 hit of a 12 s probe is computed as 13.0799…
_GAP_EPSILON = 0.001

Heard = dict[str, Any]


def _number(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def heard_of(response: Any, speed: float = 1.0) -> Heard | None:
    """The first match's position and skews, the number of matches and the probe's speed; `None` without them."""
    if not isinstance(response, dict):
        return None
    matches = response.get("matches")
    if not isinstance(matches, list) or not matches or not isinstance(matches[0], dict):
        return None
    first = matches[0]
    offset, timeskew = first.get("offset"), first.get("timeskew")
    if not _number(offset) or not _number(timeskew):
        return None
    frequencyskew = first.get("frequencyskew")
    return {
        "offset": offset,
        "timeskew": timeskew,
        "frequencyskew": frequencyskew if _number(frequencyskew) else None,
        "matches": len(matches),
        "speed": speed,
    }


def mix_speed(heard: Heard) -> float:
    """The speed the mix plays the record at: (1 + timeskew) / the speed the probe was cut at."""
    return (1 + heard["timeskew"]) / heard["speed"]


def in_step(a_time: float, a: Heard | None, b_time: float, b: Heard | None, probe_seconds: float) -> bool:
    """True when b, after a, shares no audio with it, is at most 60 s later and lands where a's clock says."""
    if a is None or b is None:
        return False
    gap = b_time - a_time
    if gap < probe_seconds * a["speed"] - _GAP_EPSILON or gap > STEP_MAX_GAP_SECONDS:
        return False
    return abs(b["offset"] - (a["offset"] + gap * mix_speed(a))) <= STEP_TOLERANCE_SECONDS


def levels(rows: list[tuple[str, list[tuple[float, Heard | None]]]], probe_seconds: float) -> list[dict[str, Any]]:
    """One dict per row, in order: `{}` when its first hit has no evidence, else its level, mix speed and candidates."""
    by_key: dict[str, list[tuple[float, Heard | None]]] = {}
    for key, hits in rows:
        by_key.setdefault(key, []).extend(hits)

    def paired(time: float, heard: Heard | None, key: str) -> bool:
        return any(
            in_step(time, heard, t, h, probe_seconds) or in_step(t, h, time, heard, probe_seconds)
            for t, h in by_key[key]
        )

    in_step_hits = [[h for t, h in hits if h is not None and paired(t, h, key)] for key, hits in rows]
    graded = [bool(hits) and hits[0][1] is not None for _, hits in rows]
    solid = [graded[i] and bool(in_step_hits[i]) for i in range(len(rows))]

    def inside(i: int) -> bool:
        key, hits = rows[i]
        t = hits[0][0]
        return any(
            solid[j]
            and rows[j][0] != key
            and rows[j][1][0][0] + INSIDE_MARGIN_SECONDS < t < rows[j][1][-1][0] - INSIDE_MARGIN_SECONDS
            for j in range(len(rows))
        )

    out: list[dict[str, Any]] = []
    for i, (_, hits) in enumerate(rows):
        if not graded[i]:
            out.append({})
            continue
        first = hits[0][1]
        assert first is not None
        if solid[i]:
            level = "solid"
        elif inside(i):
            level = "inside"
        elif first["matches"] >= MANY_CANDIDATES:
            level = "candidates"
        elif len(hits) >= 2:
            level = "out_of_step"
        else:
            level = "once"
        speeds = [mix_speed(h) for h in in_step_hits[i]] or [mix_speed(first)]
        out.append(
            {
                "evidence": level,
                "mix_speed_percent": round((statistics.median(speeds) - 1) * 100, 1),
                "candidates": first["matches"],
            }
        )
    return out
