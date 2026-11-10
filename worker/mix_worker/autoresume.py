"""The automatic Ask again after a rate-limit stop (round 023, spec 023).

Once the partial result of a set stopped by Shazam's refusals is sent, the
run loop asks again for that set `minutes` later, between two requests, by
inserting the row the app's Ask again inserts; the normal claim then resumes
the saved run. At most `cycles` times per set; a complete run resets the
count. In memory only: a restart forgets what was planned.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

RATE_LIMITED = "rate limited"  # scan.py's `stopped["reason"]` for a refusal past the pauses


class AutoResume:
    def __init__(self, minutes: int, cycles: int, clock: Callable[[], float], off: str | None = None) -> None:
        """`off` names why it cannot run here ("shared mode", "run --once",
        no saved run to resume because `WORKER_RESUME_DAYS` is 0);
        `minutes` 0 (or `cycles` 0) is off without a word, as before round 023."""
        self.seconds = minutes * 60
        self.minutes = minutes
        self.cycles = cycles
        self.clock = clock
        self.off = off
        self.pending: dict[str, float] = {}  # url -> when to ask again
        self.used: dict[str, int] = {}  # url -> automatic asks inserted

    def after(self, url: Any, outcome: Any) -> str | None:
        """The run of `url` ended with `outcome`: plan the next ask, or not.
        Returns the line to log, or None."""
        if not isinstance(url, str):
            return None
        self.pending.pop(url, None)  # this run supersedes whatever was planned
        stopped = getattr(outcome, "stopped", None)
        if outcome.status == "done" and stopped is None:
            self.used.pop(url, None)  # complete: the count starts over
            return None
        if outcome.status != "done" or stopped != RATE_LIMITED or self.seconds <= 0 or self.cycles <= 0:
            return None
        if self.off is not None:
            return f"  auto ask again · off ({self.off}); press Ask again in the app for the rest"
        n = self.used.get(url, 0)
        if n >= self.cycles:
            return f"  auto ask again · {self.cycles} of {self.cycles} done for this set; press Ask again in the app for the rest"
        self.pending[url] = self.clock() + self.seconds
        return f"  auto ask again · {url} in {self.minutes} min ({n + 1}/{self.cycles})"

    def take_due(self) -> list[str]:
        """The sets whose time has come, each handed out once."""
        now = self.clock()
        due = [url for url, at in self.pending.items() if at <= now]
        for url in due:
            del self.pending[url]
        return due

    def queued(self, url: str, result: Any) -> str:
        """The insert's answer: counted when a row was added; a failure is one
        line and is not tried again (the owner's Ask again still works)."""
        if not result.ok:
            return f"auto ask again · not queued ({result.kind}: {result.message}); press Ask again in the app"
        if result.value == "exists":
            return f"auto ask again · {url} is already asked"
        self.used[url] = self.used.get(url, 0) + 1
        return f"auto ask again · queued {url} ({self.used[url]}/{self.cycles})"
