import json
import tempfile
import unittest
from pathlib import Path

from mix_worker.config import Settings
from mix_worker.download import DownloadFailure, Downloaded
from mix_worker.pipeline import Deps, run_one
from mix_worker.scan import ScanRefused
from mix_worker.server import Result

JOB_ID = "6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f"
TRACK = {"song_name": "T", "artist": "A", "time_in_mix": "00:00:00", "confidence": 90.0, "duration": None, "metadata": {"shazam_id": "1"}}


class FakeClient:
    def __init__(self, finish_results=None):
        self.calls = []
        self.finish_results = finish_results or [Result("ok", "done", 200)]
        self.base_url = "https://abc.supabase.co"

    def finish(self, token, job_id, worker, body):
        self.calls.append(("finish", token, job_id, worker, body))
        return self.finish_results.pop(0)

    def release(self, token, job_id, worker):
        self.calls.append(("release", token, job_id, worker))
        return Result("ok", None, 200)


class FakeLog:
    def __init__(self):
        self.steps = []
        self.lines = []
        self.errors = []

    def step(self, name, outcome, seconds):
        self.steps.append((name, outcome))

    def line(self, text):
        self.lines.append(text)

    def exception(self, err):
        self.errors.append(err)


def make(tmp, *, client=None, download=None, scan=None, result_max_bytes=900000, max_duration=14400):
    work = Path(tmp) / "work"
    jsons = Path(tmp) / "json"
    settings = Settings(
        supabase_url="https://abc.supabase.co", supabase_key="k", worker_name="laptop",
        session_file=Path(tmp) / "s.json", work_dir=work, json_dir=jsons, log_file=work / "worker.log",
        ffmpeg="ffmpeg", ytdlp_cookies=None, proxy=None, stale_seconds=1, poll_seconds=1,
        max_duration_seconds=max_duration, probe_step_seconds=60, probe_seconds=10, cooldown_seconds=0.0,
        rate_limit_pause_seconds=0.0, max_skew=0.0, merge_gap_seconds=180, result_max_bytes=result_max_bytes,
    )

    def default_download(url, dest):
        dest.mkdir(parents=True, exist_ok=True)
        audio = dest / "abc123.webm"
        audio.write_bytes(b"audio")
        return Downloaded(path=audio, title="pi/live: a set", uploader="Someone", duration=7260)

    log = FakeLog()
    deps = Deps(
        client=client or FakeClient(),
        download=download or default_download,
        scan=scan or (lambda path, duration: [TRACK]),
        now=lambda: 1_793_959_500.0,  # 2026-11-06T10:05:00Z
        today=lambda: "2026-11-06",
        log=log,
    )
    return settings, deps, log


def job(url="https://www.youtube.com/watch?v=abc123"):
    return {"id": JOB_ID, "kind": "identify-mix", "payload": {"url": url}, "status": "claimed"}


class Success(unittest.TestCase):
    def test_done_end_to_end(self):
        with tempfile.TemporaryDirectory() as tmp:
            settings, deps, log = make(tmp)
            outcome = run_one(job(), settings, "tok", deps)
            self.assertEqual(outcome.status, "done")
            kept = list((Path(tmp) / "json").iterdir())
            self.assertEqual(len(kept), 1)
            self.assertEqual(kept[0].name, "2026-11-06 pi-live- a set [6f1c2d3e].json")
            self.assertFalse((Path(tmp) / "work" / JOB_ID).exists())
            call = deps.client.calls[0]
            self.assertEqual(call[:4], ("finish", "tok", JOB_ID, "laptop"))
            body = call[4]
            self.assertEqual(body["status"], "done")
            self.assertEqual(body["finished_at"], "2026-11-06T10:05:00Z")
            self.assertEqual(body["result"], json.loads(kept[0].read_text(encoding="utf-8")))
            info = body["result"]["mix_info"]
            self.assertEqual(info["title"], "pi/live: a set")
            self.assertEqual(info["artist"], "Someone")
            self.assertEqual(info["audio_filename"], "abc123.webm")
            self.assertEqual(info["source_url"], "https://www.youtube.com/watch?v=abc123")
            self.assertEqual(info["duration_seconds"], 7260)
            self.assertEqual(info["date"], "2026-11-06")
            self.assertEqual(info["track_count"], 1)
            self.assertEqual(body["result"]["tracks"], [TRACK])
            self.assertEqual([s[0] for s in log.steps], ["download", "scan", "write", "send", "clean"])

    def test_taken_elsewhere_is_logged_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            settings, deps, log = make(tmp, client=FakeClient([Result("ok", "taken", 200)]))
            outcome = run_one(job(), settings, "tok", deps)
            self.assertEqual(outcome.status, "taken")
            self.assertTrue(any("taken" in line for line in log.lines))

    def test_only_the_project_host(self):
        with tempfile.TemporaryDirectory() as tmp:
            settings, deps, log = make(tmp)
            run_one(job(), settings, "tok", deps)
            self.assertTrue(all(deps.client.base_url.startswith("https://abc.supabase.co") for _ in deps.client.calls))
            self.assertNotIn("spotify", json.dumps(deps.client.calls).lower())


class Failures(unittest.TestCase):
    def failed_body(self, deps):
        self.assertEqual(len(deps.client.calls), 1)
        body = deps.client.calls[0][4]
        self.assertEqual(body["status"], "failed")
        self.assertNotIn("result", body)
        return body["error"]

    def test_download_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            def failing(url, dest):
                dest.mkdir(parents=True, exist_ok=True)
                (dest / "partial").write_bytes(b"x")
                return DownloadFailure("Private or removed link")
            settings, deps, log = make(tmp, download=failing)
            outcome = run_one(job(), settings, "tok", deps)
            self.assertEqual(outcome.status, "failed")
            self.assertEqual(self.failed_body(deps), "Private or removed link")
            self.assertFalse((Path(tmp) / "work" / JOB_ID).exists())

    def test_no_track(self):
        with tempfile.TemporaryDirectory() as tmp:
            settings, deps, log = make(tmp, scan=lambda p, d: [])
            run_one(job(), settings, "tok", deps)
            self.assertEqual(self.failed_body(deps), "No track identified")
            self.assertEqual(list((Path(tmp) / "json").iterdir()) if (Path(tmp) / "json").exists() else [], [])

    def test_refused_scan(self):
        with tempfile.TemporaryDirectory() as tmp:
            def refusing(p, d):
                raise ScanRefused()
            settings, deps, log = make(tmp, scan=refusing)
            run_one(job(), settings, "tok", deps)
            self.assertEqual(self.failed_body(deps), "Recognition service refused (rate limited); try later")

    def test_result_too_large_locally_and_from_the_server(self):
        with tempfile.TemporaryDirectory() as tmp:
            settings, deps, log = make(tmp, result_max_bytes=10)
            run_one(job(), settings, "tok", deps)
            self.assertEqual(self.failed_body(deps), "Result too large")
        with tempfile.TemporaryDirectory() as tmp:
            settings, deps, log = make(tmp, client=FakeClient([Result("too_large", None, 413, "x"), Result("ok", "done", 200)]))
            outcome = run_one(job(), settings, "tok", deps)
            self.assertEqual(outcome.status, "failed")
            self.assertEqual(len(deps.client.calls), 2)
            self.assertEqual(deps.client.calls[1][4]["error"], "Result too large")

    def test_bad_payload_and_too_long(self):
        with tempfile.TemporaryDirectory() as tmp:
            settings, deps, log = make(tmp)
            run_one({"id": JOB_ID, "payload": {"url": "ftp://x"}}, settings, "tok", deps)
            self.assertEqual(self.failed_body(deps), "Request has no valid link")
        with tempfile.TemporaryDirectory() as tmp:
            settings, deps, log = make(tmp, max_duration=100)
            run_one(job(), settings, "tok", deps)
            self.assertEqual(self.failed_body(deps), "Set longer than 4 hours")

    def test_unexpected_exception(self):
        with tempfile.TemporaryDirectory() as tmp:
            def boom(p, d):
                raise KeyError("x")
            settings, deps, log = make(tmp, scan=boom)
            outcome = run_one(job(), settings, "tok", deps)
            self.assertEqual(outcome.status, "failed")
            self.assertEqual(self.failed_body(deps), "Worker error: KeyError")
            self.assertEqual(len(log.errors), 1)
            self.assertFalse((Path(tmp) / "work" / JOB_ID).exists())

    def test_server_away_during_send(self):
        with tempfile.TemporaryDirectory() as tmp:
            settings, deps, log = make(tmp, client=FakeClient([Result("offline", None, None, "net")]))
            outcome = run_one(job(), settings, "tok", deps)
            self.assertEqual(outcome.status, "server")
            self.assertEqual(outcome.server.kind, "offline")
            self.assertEqual(len(list((Path(tmp) / "json").iterdir())), 1)


if __name__ == "__main__":
    unittest.main()
