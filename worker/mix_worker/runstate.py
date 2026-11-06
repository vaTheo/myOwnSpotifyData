"""What a scan has heard, kept on the owner's computer so Ask again continues
a stopped set instead of starting over (round 004, research R4).

One file per link under `<work_dir>/runs/`, written after every probe with an
atomic rename; deleted when a run ends normally; used only by a new request
for the same link with the same probe settings within `max_days`.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any


def path_for(work_dir: Path, link: str) -> Path:
    return work_dir / "runs" / (hashlib.sha1(link.encode("utf-8")).hexdigest() + ".json")


def load(work_dir: Path, link: str, settings: dict[str, Any], max_days: int, now: Callable[[], float] = time.time) -> tuple[dict[str, Any] | None, str | None]:
    """The saved state for `link` when it can be resumed, else (None, why not)."""
    if max_days <= 0:
        return None, None
    p = path_for(work_dir, link)
    try:
        state = json.loads(p.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None, None
    except (OSError, ValueError):
        return None, "the saved run could not be read"
    if state.get("link") != link:
        return None, None
    if state.get("settings") != settings:
        return None, "the probe settings changed since"
    if now() - float(state.get("updated", 0)) > max_days * 86400:
        return None, f"the stopped run is older than {max_days} days"
    if not state.get("first"):
        return None, None
    return state, None


class Recorder:
    """Keeps the run state and writes it after every probe."""

    def __init__(self, work_dir: Path, link: str, settings: dict[str, Any], base: dict[str, Any] | None = None, now: Callable[[], float] = time.time) -> None:
        self.path = path_for(work_dir, link)
        self.now = now
        self.state: dict[str, Any] = base or {"link": link, "settings": settings, "started": now(), "first": {}, "second": {}}
        self.state.setdefault("first", {})
        self.state.setdefault("second", {})

    def remember(self, kind: str, key: str, entry: dict[str, Any] | None) -> None:
        self.state[kind][key] = entry
        self.state["updated"] = self.now()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.state, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, self.path)

    def clear(self) -> None:
        try:
            self.path.unlink()
        except FileNotFoundError:
            pass
