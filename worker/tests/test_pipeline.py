import json
import urllib.parse
import tempfile
import unittest
from pathlib import Path

from mix_worker.config import Settings
from mix_worker.download import DownloadFailure, Downloaded
from mix_worker.pipeline import Deps, run_one
from mix_worker.scan import ScanRefused, ScanUnreachable
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
        ffmpeg="ffmpeg", ytdlp_cookies=None, proxy=None, stale_seconds=1, poll_seconds=1, heartbeat_seconds=30,
        max_duration_seconds=max_duration, probe_step_seconds=60, probe_seconds=10, cooldown_seconds=0.0,
        rate_limit_pause_seconds=0.0, rate_limit_pauses=3, shazam_device="android", max_skew=0.0, merge_gap_seconds=180, result_max_bytes=result_max_bytes,
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
        sleep=lambda s: None,
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

    def test_outbound_hosts_gain_only_trackid_net(self):
        # Round 016: the worker's TrackId.net layer is the one new host, asked by the mix link only.
        from mix_worker.trackid import TRACKID_LIST_URL, fetch_trackid

        urls = []

        def fetch(url, headers, timeout):
            urls.append(url)
            return 200, b'{"result": {"audiostreams": [], "rowCount": 0}}'

        fetch_trackid("https://soundcloud.com/a/b", fetch, lambda s: None, lambda line: None)
        hosts = {urllib.parse.urlsplit(u).hostname for u in urls}
        self.assertEqual(hosts, {"trackid.net"})
        self.assertTrue(all(u.startswith(TRACKID_LIST_URL) for u in urls))
        self.assertTrue(all("keywords" not in u for u in urls))

    def test_a_failing_trackid_layer_is_unknown_and_logged_once(self):
        from mix_worker.trackid import fetch_trackid

        def fetch(url, headers, timeout):
            raise OSError("down")

        lines = []
        self.assertIsNone(fetch_trackid("https://soundcloud.com/a/b", fetch, lambda s: None, lines.append))
        self.assertEqual(len(lines), 1)


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

    def test_unreachable_scan(self):
        with tempfile.TemporaryDirectory() as tmp:
            def silent(p, d):
                raise ScanUnreachable()
            settings, deps, log = make(tmp, scan=silent)
            run_one(job(), settings, "tok", deps)
            self.assertEqual(self.failed_body(deps), "Recognition service did not answer; try later")

    def test_a_token_callable_is_asked_at_send_time(self):
        with tempfile.TemporaryDirectory() as tmp:
            settings, deps, log = make(tmp)
            asked = []
            run_one(job(), settings, lambda: asked.append(1) or "fresh", deps)
            self.assertEqual(len(asked), 1)

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

    def test_no_limit_by_default(self):
        with tempfile.TemporaryDirectory() as tmp:
            settings, deps, log = make(tmp, max_duration=0)
            self.assertEqual(run_one(job(), settings, "tok", deps).status, "done")

    def test_bad_payload_and_too_long(self):
        with tempfile.TemporaryDirectory() as tmp:
            settings, deps, log = make(tmp)
            run_one({"id": JOB_ID, "payload": {"url": "ftp://x"}}, settings, "tok", deps)
            self.assertEqual(self.failed_body(deps), "Request has no valid link")
        with tempfile.TemporaryDirectory() as tmp:
            settings, deps, log = make(tmp, max_duration=100)
            run_one(job(), settings, "tok", deps)
            self.assertEqual(self.failed_body(deps), "Set too long (2 h 01 min; the limit is 1 min 40 s, setting WORKER_MAX_DURATION_SECONDS)")

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
            settings, deps, log = make(tmp, client=FakeClient([Result("offline", None, None, "net")] * 4))
            waits = []
            deps.sleep = waits.append
            outcome = run_one(job(), settings, "tok", deps)
            self.assertEqual(outcome.status, "server")
            self.assertEqual(outcome.server.kind, "offline")
            self.assertEqual(waits, [30.0, 60.0, 120.0])
            self.assertEqual(len(list((Path(tmp) / "json").iterdir())), 1)

    def test_a_send_that_works_on_a_retry(self):
        with tempfile.TemporaryDirectory() as tmp:
            settings, deps, log = make(tmp, client=FakeClient([Result("error", None, 502, "bad gateway"), Result("ok", "done", 200)]))
            self.assertEqual(run_one(job(), settings, "tok", deps).status, "done")
            self.assertTrue(any("send · error: bad gateway · trying again in 30 s (1/3)" in x for x in log.lines))

    def test_a_paused_project_is_not_retried(self):
        with tempfile.TemporaryDirectory() as tmp:
            settings, deps, log = make(tmp, client=FakeClient([Result("paused", None, 503, "paused")]))
            self.assertEqual(run_one(job(), settings, "tok", deps).server.kind, "paused")



class SharedMode(unittest.TestCase):
    """Round 015 T011: the shared client under the same pipeline."""

    def test_only_the_project_host_and_the_f15_result_through_worker_finish_job(self):
        from urllib.parse import urlsplit

        from mix_worker.server import SharedServerClient

        seen = []

        class Resp:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def read(self):
                return b"true" if seen[-1][1].endswith("/rpc/worker_finish_job") else b"[]"

        def opener(req, timeout=None):
            seen.append((req.get_method(), req.full_url, json.loads(req.data.decode()) if req.data else None))
            return Resp()

        with tempfile.TemporaryDirectory() as tmp:
            client = SharedServerClient("https://abc.supabase.co", "k", opener=opener, sleep=lambda s: None)
            settings, deps, log = make(tmp, client=client)
            outcome = run_one(job(), settings, "tok", deps)
            self.assertEqual(outcome.status, "done")
            kept = list((Path(tmp) / "json").iterdir())
            self.assertEqual(len(kept), 1)
            self.assertTrue(all(urlsplit(url).netloc == "abc.supabase.co" for _, url, _ in seen))
            finishes = [c for c in seen if c[1].endswith("/rpc/worker_finish_job")]
            self.assertEqual(len(finishes), 1)
            body = finishes[0][2]
            self.assertEqual(body["p_id"], JOB_ID)
            self.assertEqual(body["p_worker"], "laptop")
            self.assertEqual(body["p_body"]["status"], "done")
            self.assertEqual(body["p_body"]["result"], json.loads(kept[0].read_text(encoding="utf-8")))
            self.assertEqual(body["p_body"]["result"]["tracks"], [TRACK])
            self.assertFalse(any("/rest/v1/jobs" in url for _, url, _ in seen))

if __name__ == "__main__":
    unittest.main()


class Round003(unittest.TestCase):
    """Second pass summary, clues on gaps and candidates in the result."""

    def sent(self, deps):
        return [c for c in deps.client.calls if c[0] == "finish"][-1][4]

    def test_scan_output_and_clues_go_into_the_result(self):
        from mix_worker.clues import Gathered
        from mix_worker.scan import ScanOutput

        replay = dict(TRACK, song_name="R", time_in_mix="00:20:00", origin="replay", speed_percent=4)
        candidate = {"song_name": "C", "artist": "B", "time_in_mix": None, "origin": "clue", "clue": {"at": None, "author": "dj", "text": "B - C", "kind": "description"}}
        seen = {}

        def clues(url, gaps, rows):
            seen["args"] = (url, gaps, [r["song_name"] for r in rows])
            return Gathered(
                gaps=[{"start": 600, "end": 900, "clues": [{"at": 610.0, "author": "x", "text": "ID?", "kind": "comment"}]}, {"start": 1500, "end": 1515, "clues": []}],
                clues=[{"at": None, "author": "dj", "text": "B - C", "kind": "description"}],
                candidates=[candidate],
            )

        with tempfile.TemporaryDirectory() as tmp:
            settings, deps, log = make(tmp, scan=lambda p, d: ScanOutput(rows=[TRACK, replay], second_pass={"places": 9, "found": 1, "stopped": None}, gaps=[(600, 900), (1500, 1515)]))
            deps.clues = clues
            outcome = run_one(job(), settings, "tok", deps)
            self.assertEqual(outcome.status, "done")
            body = self.sent(deps)["result"]
        self.assertEqual(seen["args"], ("https://www.youtube.com/watch?v=abc123", [(600, 900), (1500, 1515)], ["T", "R"]))
        info = body["mix_info"]
        self.assertEqual(info["second_pass"], {"places": 9, "found": 1, "stopped": None})
        self.assertEqual([g["start"] for g in info["gaps"]], [600])  # empty gaps are left out
        self.assertEqual(info["clues"][0]["text"], "B - C")
        self.assertEqual([t["song_name"] for t in body["tracks"]], ["T", "R", "C"])  # set-wide candidate last
        self.assertEqual(info["track_count"], 3)

    def test_a_refused_second_pass_is_still_done(self):
        from mix_worker.scan import ScanOutput

        with tempfile.TemporaryDirectory() as tmp:
            settings, deps, log = make(tmp, scan=lambda p, d: ScanOutput(rows=[TRACK], second_pass={"places": 4, "found": 0, "stopped": "rate limited"}))
            self.assertEqual(run_one(job(), settings, "tok", deps).status, "done")
            self.assertEqual(self.sent(deps)["result"]["mix_info"]["second_pass"]["stopped"], "rate limited")

    def test_candidates_alone_make_a_done_request(self):
        from mix_worker.clues import Gathered

        with tempfile.TemporaryDirectory() as tmp:
            settings, deps, log = make(tmp, scan=lambda p, d: [])
            deps.clues = lambda url, gaps, rows: Gathered(candidates=[{"song_name": "C", "artist": "B", "time_in_mix": None, "origin": "clue", "clue": {"at": None, "author": "dj", "text": "B - C", "kind": "comment"}}])
            self.assertEqual(run_one(job(), settings, "tok", deps).status, "done")

    def test_clues_are_cut_to_fit(self):
        from mix_worker.clues import Gathered

        many = [{"at": None, "author": "x", "text": "y" * 900, "kind": "comment"} for _ in range(50)]
        with tempfile.TemporaryDirectory() as tmp:
            settings, deps, log = make(tmp, result_max_bytes=8000)
            deps.clues = lambda url, gaps, rows: Gathered(clues=list(many))
            self.assertEqual(run_one(job(), settings, "tok", deps).status, "done")
            body = self.sent(deps)["result"]
            self.assertLessEqual(len(json.dumps(body, ensure_ascii=False).encode()), 8000)
            self.assertTrue(any("clues left out" in x for x in log.lines))

    def test_stopped_early_is_done_with_a_note(self):
        from mix_worker.scan import ScanOutput

        with tempfile.TemporaryDirectory() as tmp:
            settings, deps, log = make(tmp, scan=lambda p, d: ScanOutput(rows=[TRACK], stopped={"at": "00:47:00", "reason": "rate limited"}))
            self.assertEqual(run_one(job(), settings, "tok", deps).status, "done")
            body = self.sent(deps)
            self.assertEqual(body["error"], "Stopped early at 00:47:00 (rate limited); ask again later for the rest")
            self.assertEqual(body["result"]["mix_info"]["stopped_early"], {"at": "00:47:00", "reason": "rate limited"})


class Round004Pipeline(unittest.TestCase):
    def sent(self, deps):
        return [c for c in deps.client.calls if c[0] == "finish"][-1][4]

    def client_with_progress(self, answers):
        c = FakeClient()
        c.progress_answers = list(answers)
        c.progress_calls = []

        def progress(token, job_id, worker, body):
            c.progress_calls.append(body)
            return c.progress_answers.pop(0) if c.progress_answers else Result("ok", {"stop": False, "taken": False}, 200)

        c.progress = progress
        return c

    def test_progress_steps_and_a_failed_write_turns_it_off(self):
        from mix_worker.scan import ScanOutput

        with tempfile.TemporaryDirectory() as tmp:
            c = self.client_with_progress([Result("ok", {"stop": False, "taken": False}, 200), Result("error", None, 400, "column progress does not exist")])

            def scan(p, d, progress=None, resume=None, remember=None):
                progress({"step": "first", "done": 1, "total": 2})
                return ScanOutput(rows=[TRACK])

            settings, deps, log = make(tmp, client=c, scan=scan)
            deps.scan_hooks = True
            self.assertEqual(run_one(job(), settings, "tok", deps).status, "done")
            self.assertEqual(c.progress_calls[0]["step"], "download")
            self.assertTrue(any("is migration 0003 applied" in x for x in log.lines))
            self.assertEqual(len(c.progress_calls), 2)  # off after the failure

    def test_stop_with_tracks_is_done_stopped_early_by_you(self):
        from mix_worker.scan import ScanOutput

        with tempfile.TemporaryDirectory() as tmp:
            settings, deps, log = make(tmp, scan=lambda p, d, **k: ScanOutput(rows=[TRACK], stopped={"at": "00:47:00", "reason": "by you"}))
            deps.scan_hooks = True
            self.assertEqual(run_one(job(), settings, "tok", deps).status, "done")
            self.assertEqual(self.sent(deps)["error"], "Stopped early at 00:47:00 (by you); ask again later for the rest")

    def test_stop_before_any_track_fails_with_its_reason(self):
        from mix_worker.scan import StopRequested

        def scan(p, d, **k):
            raise StopRequested()

        with tempfile.TemporaryDirectory() as tmp:
            settings, deps, log = make(tmp, scan=scan)
            deps.scan_hooks = True
            run_one(job(), settings, "tok", deps)
            self.assertEqual(self.sent(deps)["error"], "Stopped by you before any track was found")

    def test_resume_state_kept_when_stopped_and_cleared_after_a_full_run(self):
        from mix_worker import runstate
        from mix_worker.scan import ScanOutput

        with tempfile.TemporaryDirectory() as tmp:
            seen = {}

            def stopped_scan(p, d, progress=None, resume=None, remember=None):
                remember("first", "0", dict(TRACK))
                return ScanOutput(rows=[TRACK], stopped={"at": "00:00:15", "reason": "by you"})

            settings, deps, log = make(tmp, scan=stopped_scan)
            deps.scan_hooks = True
            run_one(job(), settings, "tok", deps)
            url = job()["payload"]["url"]
            self.assertTrue(runstate.path_for(settings.work_dir, url).exists())

            def full_scan(p, d, progress=None, resume=None, remember=None):
                seen["resume"] = resume
                return ScanOutput(rows=[TRACK])

            deps.scan = full_scan
            deps.client = FakeClient()
            run_one(job(), settings, "tok", deps)
            self.assertEqual(seen["resume"]["first"], {"0": TRACK})
            self.assertFalse(runstate.path_for(settings.work_dir, url).exists())


class Round005Years(unittest.TestCase):
    """The year fill by ISRC runs after the clues, before the result is sent."""

    def sent(self, deps):
        return [c for c in deps.client.calls if c[0] == "finish"][-1][4]

    def test_years_after_clues_and_in_mix_info(self):
        from mix_worker.clues import Gathered

        order = []
        candidate = {"song_name": "C", "artist": "B", "time_in_mix": None, "origin": "clue", "clue": {"at": None, "author": "dj", "text": "B - C", "kind": "comment"}}

        def clues(url, gaps, rows):
            order.append("clues")
            return Gathered(candidates=[candidate])

        def years(tracks):
            order.append(("years", [t["song_name"] for t in tracks]))
            tracks[0].setdefault("metadata", {})["release_date"] = "1993"
            tracks[0]["metadata"]["release_date_from"] = "deezer"
            return {"asked": 1, "filled": 1}

        with tempfile.TemporaryDirectory() as tmp:
            settings, deps, log = make(tmp, scan=lambda p, d: [dict(TRACK, metadata={"isrc": "X"})])
            deps.clues = clues
            deps.years = years
            self.assertEqual(run_one(job(), settings, "tok", deps).status, "done")
            body = self.sent(deps)["result"]
        self.assertEqual(order, ["clues", ("years", ["T", "C"])])
        self.assertEqual(body["mix_info"]["years"], {"asked": 1, "filled": 1})
        self.assertEqual(body["tracks"][0]["metadata"], {"isrc": "X", "release_date": "1993", "release_date_from": "deezer"})

    def test_a_raising_year_step_still_sends_the_set(self):
        def years(tracks):
            raise RuntimeError("boom")

        with tempfile.TemporaryDirectory() as tmp:
            settings, deps, log = make(tmp)
            deps.years = years
            self.assertEqual(run_one(job(), settings, "tok", deps).status, "done")
            body = self.sent(deps)["result"]
        self.assertNotIn("years", body["mix_info"])
        self.assertEqual(body["tracks"], [TRACK])
        self.assertIn("  years · stopped: RuntimeError: boom", log.lines)

    def test_nothing_asked_adds_no_key(self):
        with tempfile.TemporaryDirectory() as tmp:
            settings, deps, log = make(tmp)
            deps.years = lambda tracks: None
            self.assertEqual(run_one(job(), settings, "tok", deps).status, "done")
            self.assertNotIn("years", self.sent(deps)["result"]["mix_info"])


class Round016Pipeline(unittest.TestCase):
    """TrackId.net in the request: guides only for a trusted record, rows merged, gaps clipped."""

    def sent(self, deps):
        return [c for c in deps.client.calls if c[0] == "finish"][-1][4]

    def record(self, duration=7260.0, spans=None):
        from mix_worker.trackid import Record, Span

        spans = [Span(100, 400, "Span Artist", "Span Title", "Lbl", 3)] if spans is None else spans
        return Record("the-slug", "A set", duration, spans)

    def run_with(self, tmp, trackid, scan=None, **kw):
        calls = []

        def fake(path, duration, **extra):
            calls.append(extra)
            return scan(path, duration, **extra) if scan else [TRACK]

        settings, deps, log = make(tmp, scan=fake, **kw)
        deps.trackid = trackid
        deps.scan_hooks = False
        outcome = run_one(job(), settings, "tok", deps)
        return outcome, calls, deps, log

    def test_guides_are_passed_only_for_a_trusted_record(self):
        from mix_worker.scan import ScanOutput

        with tempfile.TemporaryDirectory() as tmp:
            out = ScanOutput(rows=[TRACK], span_checks={0: {"outcome": "agrees"}})
            outcome, calls, deps, log = self.run_with(tmp, lambda link: self.record(), scan=lambda p, d, **e: out)
            self.assertEqual(outcome.status, "done")
            self.assertEqual(set(calls[0]), {"guides", "spans"})
            self.assertEqual(len(calls[0]["guides"]), 1)
            self.assertIn("  trackid · A set · 1 spans · 1 guided", log.lines)
            self.assertIn("  trackid · 1 agree · 0 differ · 0 no match", log.lines)
            tracks = self.sent(deps)["result"]["tracks"]
            self.assertEqual([t["origin"] if "origin" in t else "heard" for t in tracks], ["heard", "trackid"])
            self.assertEqual(tracks[1]["trackid"], {"slug": "the-slug", "span_start": 100, "span_end": 400, "references": 3})
            self.assertEqual(self.sent(deps)["result"]["mix_info"]["track_count"], 2)

    def test_not_known_a_failing_layer_and_off_leave_the_calls_as_today(self):
        results = []

        def boom(link):
            raise OSError("down")

        for trackid in (None, lambda link: None, boom):
            with tempfile.TemporaryDirectory() as tmp:
                outcome, calls, deps, log = self.run_with(tmp, trackid)
                results.append((outcome.status, calls, self.sent(deps)["result"]["tracks"], [s[0] for s in log.steps]))
        self.assertEqual(results[0], results[1])
        self.assertEqual(results[0], results[2])
        self.assertEqual(results[0][1], [{}])

    def test_a_failing_layer_is_logged_once_and_the_request_finishes(self):
        def boom(link):
            raise OSError("down")

        with tempfile.TemporaryDirectory() as tmp:
            outcome, calls, deps, log = self.run_with(tmp, boom)
        self.assertEqual(outcome.status, "done")
        self.assertEqual([l for l in log.lines if "trackid" in l], ["  trackid · failed (OSError)"])

    def test_a_record_of_another_length_is_not_used(self):
        with tempfile.TemporaryDirectory() as tmp:
            outcome, calls, deps, log = self.run_with(tmp, lambda link: self.record(duration=7260 * 1.06))
            self.assertEqual(calls, [{}])
            self.assertIn("  trackid · record length differs from the audio, not used", log.lines)
            self.assertEqual(self.sent(deps)["result"]["tracks"], [TRACK])

    def test_a_record_without_spans_changes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            outcome, calls, deps, log = self.run_with(tmp, lambda link: self.record(spans=[]))
            self.assertEqual(calls, [{}])
            self.assertEqual(self.sent(deps)["result"]["tracks"], [TRACK])

    def test_rows_merge_sorted_and_the_clue_step_gets_clipped_gaps(self):
        from mix_worker.clues import Gathered
        from mix_worker.scan import ScanOutput

        late = dict(TRACK, song_name="Late", time_in_mix="00:30:00")
        out = ScanOutput(rows=[TRACK, late], gaps=[(0, 150), (350, 500), (405, 405.5), (1000, 1100)], span_checks={0: {"outcome": "no_match"}})
        seen = {}

        def clues(url, gaps, rows):
            seen["gaps"], seen["rows"] = gaps, [r["song_name"] for r in rows]
            return Gathered(gaps=[], clues=[], candidates=[])

        with tempfile.TemporaryDirectory() as tmp:
            settings, deps, log = make(tmp, scan=lambda p, d: out)
            deps.trackid, deps.clues = (lambda link: self.record()), clues
            deps.scan = lambda p, d, **e: out
            self.assertEqual(run_one(job(), settings, "tok", deps).status, "done")
        self.assertEqual(seen["gaps"], [(0, 100), (400, 500), (1000, 1100)])
        self.assertEqual(seen["rows"], ["T", "Span Title", "Late"])
        self.assertIn("  trackid · 0 agree · 0 differ · 1 no match", log.lines)

    def test_a_refusal_with_only_absorbed_hits_still_sends_the_trackid_rows(self):
        from mix_worker.scan import ScanOutput

        out = ScanOutput(rows=[], stopped={"at": "00:03:00", "reason": "rate limited"}, span_checks={0: {"outcome": "not_asked"}})
        with tempfile.TemporaryDirectory() as tmp:
            outcome, calls, deps, log = self.run_with(tmp, lambda link: self.record(), scan=lambda p, d, **e: out)
            self.assertEqual(outcome.status, "done")
            body = self.sent(deps)
        self.assertEqual([t["origin"] for t in body["result"]["tracks"]], ["trackid"])
        self.assertIn("rate limited", body["error"])

    def test_the_slug_and_cores_join_the_run_state_key(self):
        from mix_worker import runstate

        with tempfile.TemporaryDirectory() as tmp:
            settings, deps, log = make(tmp, scan=lambda p, d, **e: (_ for _ in ()).throw(ScanRefused()))
            deps.scan_hooks = True
            seen = {}
            real = runstate.load

            def spy(*a, **k):
                seen.update(k)
                return real(*a, **k)

            deps.trackid = lambda link: self.record()
            runstate.load = spy
            try:
                run_one(job(), settings, "tok", deps)
            finally:
                runstate.load = real
        self.assertEqual(seen["trackid"], runstate.trackid_key("the-slug", [(110, 390)]))
