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
from .scan import ScanRefused
from .server import Result

REFUSED_REASON = "Recognition service refused (rate limited); try later"
TOO_LARGE_REASON = "Result too large"
NO_TRACK_REASON = "No track identified"
BAD_LINK_REASON = "Request has no valid link"
TOO_LONG_REASON = "Set longer than 4 hours"


@dataclass
class Deps:
    client: Any
    download: Callable[[str, Path], Downloaded | DownloadFailure]
    scan: Callable[[Path, int | None], list[dict[str, Any]]]
    now: Callable[[], float] = time.time
    today: Callable[[], str] = lambda: time.strftime("%Y-%m-%d")
    log: Any = None


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


class _Steps:
    def __init__(self, deps: Deps) -> None:
        self.deps = deps

    def done(self, name: str, outcome: str, started: float) -> None:
        if self.deps.log is not None:
            self.deps.log.step(name, outcome, self.deps.now() - started)


def _finish(deps: Deps, settings: Settings, token: str, job_id: str, body: dict[str, Any]) -> Result:
    return deps.client.finish(token, job_id, settings.worker_name, body)


def _fail(deps: Deps, settings: Settings, token: str, job_id: str, reason: str) -> Outcome:
    r = _finish(deps, settings, token, job_id, {"status": "failed", "finished_at": _iso(deps.now()), "error": reason})
    if not r.ok:
        return Outcome("server", reason=reason, server=r)
    if r.value == "taken":
        if deps.log is not None:
            deps.log.line(f"  request {job_id[:8]} was taken by another worker; result dropped")
        return Outcome("taken", reason=reason)
    return Outcome("failed", reason=reason)


def run_one(job: dict[str, Any], settings: Settings, token: str, deps: Deps) -> Outcome:
    job_id = str(job.get("id", ""))
    steps = _Steps(deps)
    payload = job.get("payload")
    url = payload.get("url") if isinstance(payload, dict) else None
    if not isinstance(url, str) or urlparse(url).scheme != "https":
        return _fail(deps, settings, token, job_id, BAD_LINK_REASON)
    job_dir = settings.work_dir / job_id
    try:
        started = deps.now()
        got = deps.download(url, job_dir)
        if isinstance(got, DownloadFailure):
            steps.done("download", got.reason, started)
            return _fail(deps, settings, token, job_id, got.reason)
        steps.done("download", f"{got.path.name} · {got.duration or '?'} s", started)
        if got.duration is not None and got.duration > settings.max_duration_seconds:
            return _fail(deps, settings, token, job_id, TOO_LONG_REASON)

        started = deps.now()
        try:
            tracks = deps.scan(got.path, got.duration)
        except ScanRefused:
            steps.done("scan", "refused", started)
            return _fail(deps, settings, token, job_id, REFUSED_REASON)
        steps.done("scan", f"{len(tracks)} tracks", started)
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
        )
        steps.done("write", json_path.name, started)
        size = len(json.dumps(result, ensure_ascii=False).encode("utf-8"))
        if size > settings.result_max_bytes:
            return _fail(deps, settings, token, job_id, TOO_LARGE_REASON)

        started = deps.now()
        r = _finish(deps, settings, token, job_id, {"status": "done", "finished_at": _iso(deps.now()), "result": result})
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
