"""One request end to end (contracts/worker.md "One request") and the loop."""

from __future__ import annotations

import json
import re
import shutil
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from .config import Settings
from .download import DownloadFailure, Downloaded
from .scan import ScanOutput, ScanRefused, ScanUnreachable, StopRequested
from .server import Result

REFUSED_REASON = "Recognition service refused (rate limited); try later"
UNREACHABLE_REASON = "Recognition service did not answer; try later"
STOPPED_EARLY = "Stopped early at {at} ({reason}); ask again later for the rest"
STOPPED_BY_YOU = "Stopped by you before any track was found"
TOO_LARGE_REASON = "Result too large"
NO_TRACK_REASON = "No track identified"
BAD_LINK_REASON = "Request has no valid link"


@dataclass
class Deps:
    client: Any
    download: Callable[[str, Path], Downloaded | DownloadFailure]
    scan: Callable[[Path, int | None], Any]  # rows, or a ScanOutput (round 003)
    now: Callable[[], float] = time.time
    today: Callable[[], str] = lambda: time.strftime("%Y-%m-%d")
    log: Any = None
    # Waits between send retries (owner, 2026-11-06); `jitter` spreads them.
    sleep: Callable[[float], None] = time.sleep
    jitter: Callable[[float], float] = lambda seconds: 0.0
    # Round 003: (url, gaps, rows) → Gathered; None = no clue step.
    clues: Callable[[str, list[tuple[int, int]], list[dict[str, Any]]], Any] | None = None
    # Round 004: `scan` takes progress/resume/remember keywords (the real one
    # does; test fakes that take two arguments leave it False).
    scan_hooks: bool = False


@dataclass
class Outcome:
    status: str  # 'done' | 'failed' | 'taken' | 'server'
    reason: str | None = None
    json_path: Path | None = None
    server: Result | None = None


def _iso(seconds: float) -> str:
    return datetime.fromtimestamp(seconds, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _safe_name(title: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|]', "-", title).strip()
    return cleaned[:120] or "mix"


class _Progress:
    """Round 004: the run's progress on the request, at most once a minute
    (the scan throttles its own calls); a Stop seen in the answer raises
    StopRequested; a failed write (no 0003 migration, offline) is logged once
    and progress stops for this run, never the run itself."""

    def __init__(self, deps: "Deps", settings: Settings, token: Token, job_id: str) -> None:
        self.deps, self.settings, self.token, self.job_id = deps, settings, token, job_id
        self.off = not hasattr(deps.client, "progress")

    def publish(self, body: dict[str, Any]) -> None:
        if self.off:
            return
        value = self.token() if callable(self.token) else self.token
        r = self.deps.client.progress(value, self.job_id, self.settings.worker_name, body)
        if not r.ok:
            self.off = True
            if self.deps.log is not None:
                self.deps.log.line(f"  progress · not sent ({r.kind}: {r.message}); is migration 0003 applied? the run goes on")
            return
        if isinstance(r.value, dict) and r.value.get("stop"):
            if self.deps.log is not None:
                self.deps.log.line("  stop · asked from the phone")
            raise StopRequested()

    def step(self, name: str) -> None:
        try:
            self.publish({"step": name, "at": _iso(self.deps.now())})
        except StopRequested:
            # Outside the scan a stop changes nothing yet: the scan sees it.
            pass


class _Steps:
    def __init__(self, deps: Deps) -> None:
        self.deps = deps

    def done(self, name: str, outcome: str, started: float) -> None:
        if self.deps.log is not None:
            self.deps.log.step(name, outcome, self.deps.now() - started)


Token = str | Callable[[], str]


SEND_WAITS = (30.0, 60.0, 120.0)  # retries of a send to the server, then the worker stops


def _finish(deps: Deps, settings: Settings, token: Token, job_id: str, body: dict[str, Any]) -> Result:
    """Sends the outcome; an unreachable server or a server error is tried
    again after 30 s, 1 min and 2 min (± the spread) before giving up. A
    paused project, a refused sign-in or a result too large is not retried."""
    for attempt in range(len(SEND_WAITS) + 1):
        # A scan can outlast the access token: a callable gives a fresh one.
        value = token() if callable(token) else token
        r = deps.client.finish(value, job_id, settings.worker_name, body)
        if r.ok or r.kind not in ("offline", "error") or attempt == len(SEND_WAITS):
            return r
        wait = SEND_WAITS[attempt]
        wait += deps.jitter(wait)
        if deps.log is not None:
            deps.log.line(f"  send · {r.kind}: {r.message} · trying again in {int(wait)} s ({attempt + 1}/{len(SEND_WAITS)})")
        deps.sleep(wait)
    raise AssertionError("unreachable")


def _fail(deps: Deps, settings: Settings, token: Token, job_id: str, reason: str) -> Outcome:
    r = _finish(deps, settings, token, job_id, {"status": "failed", "finished_at": _iso(deps.now()), "error": reason})
    if not r.ok:
        return Outcome("server", reason=reason, server=r)
    if r.value == "taken":
        if deps.log is not None:
            deps.log.line(f"  request {job_id[:8]} was taken by another worker; result dropped")
        return Outcome("taken", reason=reason)
    return Outcome("failed", reason=reason)


def run_one(job: dict[str, Any], settings: Settings, token: Token, deps: Deps) -> Outcome:
    job_id = str(job.get("id", ""))
    steps = _Steps(deps)
    payload = job.get("payload")
    url = payload.get("url") if isinstance(payload, dict) else None
    if not isinstance(url, str) or urlparse(url).scheme != "https":
        return _fail(deps, settings, token, job_id, BAD_LINK_REASON)
    job_dir = settings.work_dir / job_id
    news = _Progress(deps, settings, token, job_id)
    try:
        news.step("download")
        started = deps.now()
        got = deps.download(url, job_dir)
        if isinstance(got, DownloadFailure):
            steps.done("download", got.reason, started)
            return _fail(deps, settings, token, job_id, got.reason)
        steps.done("download", f"{got.path.name} · {got.duration or '?'} s", started)
        limit = settings.max_duration_seconds
        if limit and got.duration is not None and got.duration > limit:
            from .download import too_long_reason

            return _fail(deps, settings, token, job_id, too_long_reason(got.duration, settings.max_duration_seconds))

        started = deps.now()
        recorder = None
        hooks: dict[str, Any] = {}
        if deps.scan_hooks:
            from . import runstate

            key = {
                "step": settings.probe_step_seconds, "probe_seconds": settings.probe_seconds,
                "second": [settings.second_pass_step_seconds, settings.second_pass_offset_seconds, list(settings.second_pass_speeds)],
            }
            state, why = runstate.load(settings.work_dir, url, key, settings.resume_days)
            if why and deps.log is not None:
                deps.log.line(f"  scan · starting over: {why}")
            recorder = runstate.Recorder(settings.work_dir, url, key, base=state)
            hooks = {"progress": news.publish, "resume": state, "remember": recorder.remember}
        try:
            out = deps.scan(got.path, got.duration, **hooks)
        except StopRequested:
            steps.done("scan", "stopped by you", started)
            return _fail(deps, settings, token, job_id, STOPPED_BY_YOU)
        except ScanRefused:
            steps.done("scan", "refused", started)
            return _fail(deps, settings, token, job_id, REFUSED_REASON)
        except ScanUnreachable:
            steps.done("scan", "no answer", started)
            return _fail(deps, settings, token, job_id, UNREACHABLE_REASON)
        tracks = list(out.rows) if isinstance(out, ScanOutput) else list(out)
        second_pass = out.second_pass if isinstance(out, ScanOutput) else None
        stopped = out.stopped if isinstance(out, ScanOutput) else None
        gaps = list(out.gaps) if isinstance(out, ScanOutput) else []
        steps.done("scan", f"{len(tracks)} tracks", started)
        if recorder is not None and stopped is None:
            recorder.clear()  # a complete run: the next Ask again is a fresh scan

        extra: dict[str, Any] = {}
        if second_pass is not None:
            extra["second_pass"] = second_pass
        if stopped is not None:
            extra["stopped_early"] = stopped
        if isinstance(out, ScanOutput) and out.warnings:
            extra["warnings"] = list(out.warnings)
        if isinstance(out, ScanOutput) and out.resumed:
            extra["resumed"] = out.resumed
        if deps.clues is not None:
            news.step("clues")
            started = deps.now()
            gathered = deps.clues(url, gaps, tracks)
            steps.done("clues", f"{len(gathered.candidates)} candidates", started)
            tracks = tracks + gathered.candidates
            extra["gaps"] = [g for g in gathered.gaps if g["clues"]]
            if gathered.clues:
                extra["clues"] = gathered.clues
        if not tracks:
            return _fail(deps, settings, token, job_id, NO_TRACK_REASON)

        started = deps.now()
        from .scan import write_result

        json_path = settings.json_dir / f"{deps.today()} {_safe_name(got.title)} [{job_id[:8]}].json"
        result = write_result(
            json_path,
            title=got.title,
            artist=got.uploader,
            audio_filename=got.path.name,
            source_url=url,
            duration=got.duration,
            date=deps.today(),
            tracks=tracks,
            extra=extra,
            max_bytes=settings.result_max_bytes,
            line=deps.log.line if deps.log is not None else None,
        )
        steps.done("write", json_path.name, started)
        size = len(json.dumps(result, ensure_ascii=False).encode("utf-8"))
        if size > settings.result_max_bytes:
            return _fail(deps, settings, token, job_id, TOO_LARGE_REASON)

        started = deps.now()
        body: dict[str, Any] = {"status": "done", "finished_at": _iso(deps.now()), "result": result}
        if stopped is not None:
            # Shown on the phone's Requests card next to "Done".
            body["error"] = STOPPED_EARLY.format(at=stopped["at"], reason=stopped["reason"])
        r = _finish(deps, settings, token, job_id, body)
        if r.kind == "too_large":
            steps.done("send", "too large", started)
            return _fail(deps, settings, token, job_id, TOO_LARGE_REASON)
        if not r.ok:
            steps.done("send", r.kind, started)
            return Outcome("server", json_path=json_path, server=r)
        if r.value == "taken":
            steps.done("send", "taken elsewhere", started)
            if deps.log is not None:
                deps.log.line(f"  request {job_id[:8]} was taken by another worker; result kept at {json_path}")
            return Outcome("taken", json_path=json_path)
        steps.done("send", f"{size} bytes", started)
        return Outcome("done", json_path=json_path)
    except Exception as err:  # the loop must go on (FR-018)
        if deps.log is not None:
            deps.log.exception(err)
        return _fail(deps, settings, token, job_id, f"Worker error: {type(err).__name__}")
    finally:
        started = deps.now()
        shutil.rmtree(job_dir, ignore_errors=True)
        steps.done("clean", "audio removed", started)
