import tempfile
import unittest
from pathlib import Path

from mix_worker.cli import EXIT_INTERRUPTED, EXIT_OFFLINE, EXIT_OK, EXIT_PAUSED, EXIT_SIGNED_OUT, run_queue
from mix_worker.config import Settings
from mix_worker.download import Downloaded, DownloadFailure
from mix_worker.pipeline import Deps
from mix_worker.server import Result
from mix_worker.session import Session, save


def job(n):
    return {"id": f"00000000-0000-4000-8000-{n:012d}", "kind": "identify-mix", "payload": {"url": f"https://x.y/{n}"}, "status": "claimed"}


class FakeClient:
    def __init__(self, claims, refresh=None):
        self.claims = list(claims)
        self.refresh_result = refresh or Result("ok", {"access_token": "a2", "refresh_token": "r2", "expires_in": 3600})
        self.calls = []
        self.base_url = "https://abc.supabase.co"

    def refresh(self, token):
        self.calls.append(("refresh", token))
        return self.refresh_result

    def claim(self, token, worker, stale):
        self.calls.append(("claim", token, worker, stale))
        return self.claims.pop(0)

    def finish(self, token, job_id, worker, body):
        self.calls.append(("finish", job_id, body["status"]))
        return Result("ok", "done", 200)

    def release(self, token, job_id, worker):
        self.calls.append(("release", job_id))
        return Result("ok", None, 200)


class FakeLog:
    def __init__(self):
        self.lines = []

    def line(self, text):
        self.lines.append(text)

    def step(self, *a):
        pass

    def exception(self, err):
        self.lines.append(f"exception {err!r}")


def make(tmp, client, download=None, scan=None, expires_at=10_000.0):
    work = Path(tmp) / "work"
    settings = Settings(
        supabase_url="https://abc.supabase.co", supabase_key="k", worker_name="laptop",
        session_file=Path(tmp) / "s.json", work_dir=work, json_dir=Path(tmp) / "json", log_file=work / "w.log",
        ffmpeg="ffmpeg", ytdlp_cookies=None, proxy=None, stale_seconds=4321, poll_seconds=7, heartbeat_seconds=30,
        max_duration_seconds=14400, probe_step_seconds=60, probe_seconds=10, cooldown_seconds=0.0,
        rate_limit_pause_seconds=0.0, rate_limit_pauses=3, shazam_device="android", max_skew=0.0, merge_gap_seconds=180, result_max_bytes=900000, worker_mode="personal",
    )

    def ok_download(url, dest):
        dest.mkdir(parents=True, exist_ok=True)
        p = dest / "a.webm"
        p.write_bytes(b"x")
        return Downloaded(path=p, title="t", uploader=None, duration=60)

    deps = Deps(client=client, download=download or ok_download, scan=scan or (lambda p, d: [{"song_name": "T", "artist": "A", "time_in_mix": "00:00:00", "confidence": 1.0, "duration": None}]), now=lambda: 1_000.0, today=lambda: "2026-11-06", log=FakeLog())
    session = Session(email="dj@example.com", access_token="a", refresh_token="r", expires_at=expires_at)
    save(settings.session_file, session)
    return settings, deps, session


class Refresh(unittest.TestCase):
    def test_the_result_is_sent_with_a_token_refreshed_after_the_scan(self):
        with tempfile.TemporaryDirectory() as tmp:
            tokens = iter(["a2", "a3", "a4"])

            class Client(FakeClient):
                def refresh(self, token):
                    self.calls.append(("refresh", token))
                    return Result("ok", {"access_token": next(tokens), "refresh_token": "r", "expires_in": -1})

                def finish(self, token, job_id, worker, body):
                    self.calls.append(("finish-token", token))
                    return Result("ok", "done", 200)

            client = Client([Result("ok", job(1)), Result("ok", None)])
            settings, deps, session = make(tmp, client)
            self.assertEqual(run_queue(settings, deps, session, once=True, interval=7), EXIT_OK)
            self.assertIn(("finish-token", "a3"), client.calls)


class Once(unittest.TestCase):
    def test_two_rows_in_order_then_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = FakeClient([Result("ok", job(1)), Result("ok", job(2)), Result("ok", None)])
            settings, deps, session = make(tmp, client)
            code = run_queue(settings, deps, session, once=True, interval=1)
            self.assertEqual(code, EXIT_OK)
            finishes = [c for c in client.calls if c[0] == "finish"]
            self.assertEqual([c[1][-1] for c in finishes], ["1", "2"])
            self.assertEqual([c for c in client.calls if c[0] == "claim"][0][2:], ("laptop", 4321))
            self.assertIn("queue empty", deps.log.lines[-1])

    def test_a_failed_request_does_not_stop_the_loop(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = FakeClient([Result("ok", job(1)), Result("ok", job(2)), Result("ok", None)])
            calls = []

            def download(url, dest):
                calls.append(url)
                if url.endswith("/1"):
                    return DownloadFailure("Private or removed link")
                dest.mkdir(parents=True, exist_ok=True)
                p = dest / "a.webm"
                p.write_bytes(b"x")
                return Downloaded(path=p, title="t", uploader=None, duration=60)

            settings, deps, session = make(tmp, client, download=download)
            self.assertEqual(run_queue(settings, deps, session, once=True, interval=1), EXIT_OK)
            self.assertEqual([c[2] for c in client.calls if c[0] == "finish"], ["failed", "done"])

    def test_server_states_end_the_run(self):
        for result, code in [
            (Result("paused", None, 540, "paused"), EXIT_PAUSED),
            (Result("offline", None, None, "net"), EXIT_OFFLINE),
            (Result("unauthorized", None, 401, "jwt"), EXIT_SIGNED_OUT),
        ]:
            with tempfile.TemporaryDirectory() as tmp:
                client = FakeClient([result])
                settings, deps, session = make(tmp, client)
                self.assertEqual(run_queue(settings, deps, session, once=True, interval=1), code)
                self.assertEqual(len([c for c in client.calls if c[0] == "claim"]), 1)

    def test_refresh_refused_exits_signed_out_before_any_claim(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = FakeClient([Result("ok", None)], refresh=Result("unauthorized", None, 401, "x"))
            settings, deps, session = make(tmp, client, expires_at=1_010.0)
            self.assertEqual(run_queue(settings, deps, session, once=True, interval=1), EXIT_SIGNED_OUT)
            self.assertEqual([c[0] for c in client.calls], ["refresh"])
            self.assertFalse(settings.session_file.exists())

    def test_refresh_under_margin_then_claims_with_the_new_token(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = FakeClient([Result("ok", None)])
            settings, deps, session = make(tmp, client, expires_at=1_010.0)
            run_queue(settings, deps, session, once=True, interval=1)
            self.assertEqual(client.calls[0][0], "refresh")
            self.assertEqual(client.calls[1][:2], ("claim", "a2"))


class Watch(unittest.TestCase):
    def test_watch_sleeps_the_interval_and_stops_on_ctrl_c(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = FakeClient([Result("ok", None), Result("ok", None)])
            settings, deps, session = make(tmp, client)
            sleeps = []

            def sleep(s):
                sleeps.append(s)
                if len(sleeps) == 2:
                    raise KeyboardInterrupt()

            code = run_queue(settings, deps, session, once=False, interval=7, sleep=sleep)
            self.assertEqual(code, EXIT_INTERRUPTED)
            self.assertEqual(sleeps, [7, 7])

    def test_waiting_logs_the_empty_queue_and_an_alive_line_every_heartbeat(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = FakeClient([Result("ok", job(1)), Result("ok", None), Result("ok", None)])
            settings, deps, session = make(tmp, client)
            sleeps = []

            def sleep(s):
                sleeps.append(s)
                if len(sleeps) == 3:
                    raise KeyboardInterrupt()

            code = run_queue(settings, deps, session, once=False, interval=60, sleep=sleep)
            self.assertEqual(code, EXIT_INTERRUPTED)
            self.assertEqual(sleeps, [30, 30, 30])
            lines = deps.log.lines
            done_at = next(i for i, l in enumerate(lines) if l.startswith("done "))
            self.assertEqual(lines[done_at + 1], "queue empty · next look in 60 s")
            self.assertEqual(lines[done_at + 2], "alive · waiting for a request · next look in 30 s")
            self.assertEqual(lines[done_at + 3], "queue empty · next look in 60 s")
            self.assertEqual(lines[-1], "stopped")

    def test_ctrl_c_during_a_request_releases_it(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = FakeClient([Result("ok", job(1))])

            def interrupted(p, d):
                raise KeyboardInterrupt()

            settings, deps, session = make(tmp, client, scan=interrupted)
            code = run_queue(settings, deps, session, once=True, interval=1)
            self.assertEqual(code, EXIT_INTERRUPTED)
            self.assertIn(("release", job(1)["id"]), client.calls)
            self.assertFalse(any(c[0] == "finish" for c in client.calls))
            self.assertFalse((Path(tmp) / "work" / job(1)["id"]).exists())


class AutoAskAgain(unittest.TestCase):
    """Round 023: a rate-limited partial result is sent, then asked again 30 min later (at most 6 times)."""

    class Server(FakeClient):
        """A queue: `enqueue` adds a job the next `claim` returns."""

        def __init__(self, first, clock):
            super().__init__([])
            self.queue = [first]
            self.clock = clock
            self.enqueued = []
            self.next_id = 100

        def claim(self, token, worker, stale):
            self.calls.append(("claim", token, worker, stale))
            return Result("ok", self.queue.pop(0) if self.queue else None)

        def finish(self, token, job_id, worker, body):
            self.calls.append(("finish", job_id, body["status"], body.get("error"), self.clock.t))
            return Result("ok", "done", 200)

        def is_shared_worker(self, token):
            return Result("ok", True, 200)

        def enqueue(self, token, url):
            self.enqueued.append((url, self.clock.t))
            self.next_id += 1
            self.queue.append({"id": f"00000000-0000-4000-8000-{self.next_id:012d}", "payload": {"url": url}})
            return Result("ok", "queued", 201)

    class Clock:
        def __init__(self):
            self.t = 0.0

        def __call__(self):
            return self.t

    def go(self, *, once=False, mode="personal", minutes=30, until=8 * 3600, stopped="rate limited", url="https://x.y/1", server=None):
        from dataclasses import replace

        from mix_worker.scan import ScanOutput

        clock = self.Clock()
        first = {"id": "00000000-0000-4000-8000-000000000001", "payload": {"url": url}}
        with tempfile.TemporaryDirectory() as tmp:
            client = (server or self.Server)(first, clock)
            row = [{"song_name": "T", "artist": "A", "time_in_mix": "00:00:00", "confidence": 1.0, "duration": None}]
            settings, deps, session = make(
                tmp, client,
                scan=lambda p, d: ScanOutput(rows=row, stopped={"at": "00:10:00", "reason": stopped} if stopped else None),
                expires_at=9e12,
            )
            settings = replace(settings, worker_mode=mode, auto_resume_minutes=minutes)

            def sleep(s):
                clock.t += s
                if clock.t > until:
                    raise KeyboardInterrupt()

            code = run_queue(settings, deps, session, once=once, interval=60, sleep=sleep, clock=clock)
            return code, client, deps.log.lines

    def test_the_partial_result_is_sent_then_asked_again_once_after_30_minutes(self):
        code, client, lines = self.go(until=45 * 60)
        self.assertEqual(code, EXIT_INTERRUPTED)
        finishes = [c for c in client.calls if c[0] == "finish"]
        self.assertEqual(finishes[0][2], "done")
        self.assertTrue(finishes[0][3].startswith("Stopped early at 00:10:00 (rate limited)"))
        self.assertEqual(len(client.enqueued), 1)
        url, at = client.enqueued[0]
        self.assertEqual(url, "https://x.y/1")
        self.assertGreaterEqual(at, 30 * 60)
        self.assertLessEqual(at, 30 * 60 + 60)  # at the next look after the due time
        self.assertEqual(len(finishes), 2)  # the inserted request ran like an Ask again
        self.assertIn("  auto ask again · https://x.y/1 in 30 min (1/6)", lines)
        self.assertIn("auto ask again · queued https://x.y/1 (1/6)", lines)

    def test_at_most_six_cycles(self):
        _, client, lines = self.go(until=12 * 3600)
        self.assertEqual(len(client.enqueued), 6)
        self.assertEqual(len([c for c in client.calls if c[0] == "finish"]), 7)
        self.assertIn("  auto ask again · 6 of 6 done for this set; press Ask again in the app for the rest", lines)

    def test_a_stop_that_is_not_a_rate_limit_schedules_nothing(self):
        for stopped in ("by you", "no answer", None):
            _, client, _ = self.go(stopped=stopped, until=3 * 3600)
            self.assertEqual(client.enqueued, [], stopped)

    def test_shared_mode_schedules_nothing(self):
        _, client, lines = self.go(mode="shared", url="https://soundcloud.com/a/b", until=3 * 3600)
        self.assertEqual(client.enqueued, [])
        self.assertIn("  auto ask again · off in shared mode; press Ask again in the app for the rest", lines)

    def test_once_mode_schedules_nothing(self):
        code, client, lines = self.go(once=True)
        self.assertEqual(code, EXIT_OK)
        self.assertEqual(client.enqueued, [])
        self.assertIn("  auto ask again · off in run --once; press Ask again in the app for the rest", lines)

    def test_zero_minutes_is_off(self):
        _, client, lines = self.go(minutes=0, until=3 * 3600)
        self.assertEqual(client.enqueued, [])
        self.assertFalse(any("auto ask again" in l for l in lines))

    def test_a_failed_insert_is_one_line_and_the_loop_goes_on(self):
        class Down(self.Server):
            def enqueue(self, token, url):
                self.enqueued.append((url, self.clock.t))
                return Result("offline", None, None, "network error: down")

        code, client, lines = self.go(until=3 * 3600, server=Down)
        self.assertEqual(code, EXIT_INTERRUPTED)
        self.assertEqual(len(client.enqueued), 1)  # never retried
        self.assertIn("auto ask again · not queued (offline: network error: down); press Ask again in the app", lines)


if __name__ == "__main__":
    unittest.main()
