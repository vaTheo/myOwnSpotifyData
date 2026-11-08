import tempfile
import unittest
from pathlib import Path

from mix_worker import __version__
from unittest import mock
import io
import urllib.error

from mix_worker.cli import http_get, PRESS_ENTER, SHARED_LINK_REASON, shared_link_allowed, CliDeps, EXIT_NOT_SHARED, EXIT_OK, EXIT_SETTINGS, EXIT_SIGNED_OUT, EXIT_TEMPLATE, code_for, main, make_client, run_queue
from mix_worker.config import Settings, SettingsError
from mix_worker.pipeline import Deps
from mix_worker.server import Result, ServerClient, SharedServerClient
from mix_worker.session import Session, load, save

GOOD = "SUPABASE_URL=https://abc.supabase.co\nSUPABASE_KEY=sb_publishable_1234567890\n"


class FakeClient:
    def __init__(self):
        self.calls = []
        self.otp = Result("ok", None, 200)
        self.verified = Result("ok", {"access_token": "a", "refresh_token": "r", "expires_in": 3600}, 200)

    def send_otp(self, email):
        self.calls.append(("otp", email))
        return self.otp

    def request_link(self, email, redirect_to, challenge):
        self.calls.append(("link", email, redirect_to, challenge))
        return self.otp

    def exchange_code(self, code, verifier):
        self.calls.append(("exchange", code, verifier))
        return self.verified

    def verify(self, email, code):
        self.calls.append(("verify", email, code))
        return self.verified

    def logout(self, token):
        self.calls.append(("logout", token))
        return Result("ok", None, 204)


class Harness:
    def __init__(self, tmp, config_text=GOOD, frozen=None, answers=(), session=None):
        self.tmp = Path(tmp)
        self.config = self.tmp / "mix-worker.env"
        if config_text is not None:
            self.config.write_text(config_text, encoding="utf-8")
        self.out = []
        self.answers = list(answers)
        self.client = FakeClient()
        self.ran = []
        env = {"HOME": str(self.tmp)}
        session_file = self.tmp / "session.json"
        if session is not None:
            save(session_file, session)
        env["WORKER_SESSION_FILE"] = str(session_file)
        env["WORKER_WORK_DIR"] = str(self.tmp / "work")
        self.deps = CliDeps(
            env=env,
            home=self.tmp,
            platform="linux",
            hostname=lambda: "laptop",
            frozen_dir=frozen,
            read=lambda prompt: self.answers.pop(0),
            out=lambda text: self.out.append(text),
            client_factory=lambda url, key: self.client,
            run_queue=lambda settings, deps, session, once, interval: self.ran.append((once, interval)) or EXIT_OK,
            wait_for_code=lambda redirect_to, timeout: "CODE-FROM-LINK",
            build_deps=lambda settings: None,
            ffmpeg_version=lambda path: "n9.0.2" if path != "/nowhere" else None,
            which=lambda name: "/usr/bin/node" if name == "node" else None,
            now=lambda: 1000.0,
        )

    def main(self, *argv):
        return main(["--config", str(self.config), *argv], deps=self.deps)

    def text(self):
        return "\n".join(self.out)


class Version(unittest.TestCase):
    def test_version(self):
        with tempfile.TemporaryDirectory() as tmp:
            h = Harness(tmp)
            self.assertEqual(h.main("--version"), EXIT_OK)
            self.assertIn(f"mix-worker {__version__}", h.text())


class Check(unittest.TestCase):
    def test_check_prints_the_resolved_settings(self):
        with tempfile.TemporaryDirectory() as tmp:
            h = Harness(tmp)
            self.assertEqual(h.main("check"), EXIT_OK)
            text = h.text()
            self.assertIn("https://abc.supabase.co", text)
            self.assertIn("sb_publi…", text)
            self.assertNotIn("sb_publishable_1234567890", text)
            self.assertIn("ffmpeg: packaged (n9.0.2)", text)
            self.assertIn("JavaScript runtime: node found", text)
            self.assertIn("session: none", text)
            self.assertIn("worker name: laptop", text)

    def test_check_with_session_and_no_runtime(self):
        with tempfile.TemporaryDirectory() as tmp:
            h = Harness(tmp, session=Session("dj@example.com", "a", "r", 9e9))
            h.deps.which = lambda name: None
            self.assertEqual(h.main("check"), EXIT_OK)
            self.assertIn("session: signed in as dj@example.com", h.text())
            self.assertIn("JavaScript runtime: none (YouTube links need Node or Deno)", h.text())

    def test_check_names_a_bad_setting(self):
        with tempfile.TemporaryDirectory() as tmp:
            h = Harness(tmp, config_text="SUPABASE_URL=http://nope\nSUPABASE_KEY=k\n")
            self.assertEqual(h.main("check"), EXIT_SETTINGS)
            self.assertIn("SUPABASE_URL", h.text())
            self.assertIn(str(h.config), h.text())

    def test_check_fails_when_ffmpeg_cannot_start(self):
        with tempfile.TemporaryDirectory() as tmp:
            h = Harness(tmp, config_text=GOOD + "WORKER_FFMPEG=/nowhere\n")
            self.assertEqual(h.main("check"), EXIT_SETTINGS)
            self.assertIn("WORKER_FFMPEG", h.text())
            self.assertIn("packaged", h.text())


class Login(unittest.TestCase):
    def test_login_saves_the_session(self):
        with tempfile.TemporaryDirectory() as tmp:
            h = Harness(tmp, answers=["dj@example.com", "123456"])
            self.assertEqual(h.main("login", "--code"), EXIT_OK)
            self.assertEqual(h.client.calls, [("otp", "dj@example.com"), ("verify", "dj@example.com", "123456")])
            s = load(h.tmp / "session.json")
            self.assertEqual((s.email, s.access_token, s.refresh_token, s.expires_at), ("dj@example.com", "a", "r", 4600.0))
            self.assertIn("signed in as dj@example.com", h.text())

    def test_login_refused_code(self):
        with tempfile.TemporaryDirectory() as tmp:
            h = Harness(tmp, answers=["dj@example.com", "000000"])
            h.client.verified = Result("unauthorized", None, 403, "Token has expired or is invalid")
            self.assertEqual(h.main("login", "--code"), EXIT_SIGNED_OUT)
            self.assertIsNone(load(h.tmp / "session.json"))
            self.assertIn("expired", h.text())

    def test_login_by_link_is_the_default(self):
        with tempfile.TemporaryDirectory() as tmp:
            h = Harness(tmp, answers=["dj@example.com"])
            self.assertEqual(h.main("login"), EXIT_OK)
            link, exchange = h.client.calls
            self.assertEqual(link[:3], ("link", "dj@example.com", "http://127.0.0.1:5173/myOwnSpotifyData/?link=worker"))
            self.assertRegex(link[3], r"^[A-Za-z0-9_-]{43}$")
            self.assertEqual(exchange[:2], ("exchange", "CODE-FROM-LINK"))
            self.assertRegex(exchange[2], r"^[A-Za-z0-9_-]{43,128}$")
            self.assertEqual(load(h.tmp / "session.json").email, "dj@example.com")
            self.assertIn("signed in as dj@example.com", h.text())

    def test_login_by_link_times_out(self):
        with tempfile.TemporaryDirectory() as tmp:
            h = Harness(tmp, answers=["dj@example.com"])
            h.deps.wait_for_code = lambda redirect_to, timeout: None
            self.assertEqual(h.main("login"), EXIT_SIGNED_OUT)
            self.assertNotIn(("exchange",), [c[:1] for c in h.client.calls])
            self.assertIn("no link was opened", h.text())

    def test_login_by_link_port_busy(self):
        with tempfile.TemporaryDirectory() as tmp:
            h = Harness(tmp, answers=["dj@example.com"])

            def busy(redirect_to, timeout):
                raise OSError(98, "Address already in use")

            h.deps.wait_for_code = busy
            self.assertEqual(h.main("login"), EXIT_SIGNED_OUT)
            self.assertIn("5173", h.text())
            self.assertIn("--code", h.text())

    def test_logout(self):
        with tempfile.TemporaryDirectory() as tmp:
            h = Harness(tmp, session=Session("dj@example.com", "tok", "r", 9e9))
            self.assertEqual(h.main("logout"), EXIT_OK)
            self.assertEqual(h.client.calls, [("logout", "tok")])
            self.assertFalse((h.tmp / "session.json").exists())


class Run(unittest.TestCase):
    def test_run_once_and_watch(self):
        with tempfile.TemporaryDirectory() as tmp:
            h = Harness(tmp, session=Session("dj@example.com", "a", "r", 9e9))
            self.assertEqual(h.main("run", "--once"), EXIT_OK)
            self.assertEqual(h.main("run", "--watch", "--interval", "5"), EXIT_OK)
            self.assertEqual(h.main("run"), EXIT_OK)
            self.assertEqual(h.ran, [(True, 60), (False, 5), (True, 60)])

    def test_run_without_session(self):
        with tempfile.TemporaryDirectory() as tmp:
            h = Harness(tmp)
            self.assertEqual(h.main("run", "--once"), EXIT_SIGNED_OUT)
            self.assertIn("mix-worker login", h.text())
            self.assertEqual(h.ran, [])


class NoCommand(unittest.TestCase):
    def test_no_command_logs_in_then_watches(self):
        with tempfile.TemporaryDirectory() as tmp:
            h = Harness(tmp, answers=["dj@example.com"])
            self.assertEqual(h.main(), EXIT_OK)
            self.assertEqual(h.client.calls[0][:2], ("link", "dj@example.com"))
            self.assertEqual(h.ran, [(False, 60)])

    def test_no_command_with_session_just_watches(self):
        with tempfile.TemporaryDirectory() as tmp:
            h = Harness(tmp, session=Session("dj@example.com", "a", "r", 9e9))
            self.assertEqual(h.main(), EXIT_OK)
            self.assertEqual(h.client.calls, [])
            self.assertEqual(h.ran, [(False, 60)])

    def test_frozen_without_config_writes_the_template(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp) / "app"
            folder.mkdir()
            h = Harness(tmp, config_text=None, frozen=folder)
            code = main([], deps=h.deps)
            self.assertEqual(code, EXIT_TEMPLATE)
            written = folder / "mix-worker.env"
            self.assertTrue(written.exists())
            self.assertIn(str(written), h.text())
            self.assertEqual(h.ran, [])



class DoubleClickConsole(unittest.TestCase):
    """The Windows executable started with a double-click keeps its window open on a problem."""

    def run_main(self, argv, *, platform="win32", frozen=Path("C:/w"), code=EXIT_SETTINGS, boom=False, read_raises=None):
        out, reads = [], []

        def read(prompt):
            reads.append(prompt)
            if read_raises:
                raise read_raises
            return ""

        deps = CliDeps(env={}, platform=platform, frozen_dir=frozen, read=read, out=out.append)
        import mix_worker.cli as cli

        original = cli._main

        def fake(argv, deps):
            if boom:
                raise RuntimeError("boom")
            return code

        cli._main = fake
        try:
            result = main(argv, deps=deps)
        finally:
            cli._main = original
        return result, out, reads

    def test_waits_after_a_problem(self):
        code, out, reads = self.run_main([])
        self.assertEqual(code, EXIT_SETTINGS)
        self.assertIn(PRESS_ENTER, out)
        self.assertEqual(len(reads), 1)

    def test_waits_after_the_first_start_wrote_the_template(self):
        code, out, reads = self.run_main([], code=EXIT_TEMPLATE)
        self.assertEqual(code, EXIT_TEMPLATE)
        self.assertEqual(len(reads), 1)

    def test_does_not_wait_after_a_clean_exit(self):
        _, out, reads = self.run_main([], code=EXIT_OK)
        self.assertEqual(reads, [])

    def test_does_not_wait_with_arguments(self):
        _, out, reads = self.run_main(["check"])
        self.assertEqual(reads, [])

    def test_does_not_wait_off_windows_or_unpackaged(self):
        self.assertEqual(self.run_main([], platform="linux")[2], [])
        self.assertEqual(self.run_main([], frozen=None)[2], [])

    def test_prints_a_crash_and_waits(self):
        code, out, reads = self.run_main([], boom=True)
        self.assertEqual(code, 1)
        self.assertTrue(any("boom" in line for line in out))
        self.assertEqual(len(reads), 1)

    def test_an_unreadable_console_does_not_fail(self):
        code, _, reads = self.run_main([], read_raises=EOFError())
        self.assertEqual(code, EXIT_SETTINGS)
        self.assertEqual(len(reads), 1)

    def test_a_crash_off_the_double_click_still_raises(self):
        with self.assertRaises(RuntimeError):
            self.run_main(["check"], boom=True)

    def test_code_7_holds_the_console(self):
        code, out, reads = self.run_main([], code=EXIT_NOT_SHARED)
        self.assertEqual(code, 7)
        self.assertIn(PRESS_ENTER, out)
        self.assertEqual(len(reads), 1)


class QueueClient:
    """A queue client that records its calls; `shared_answer` is what is_shared_worker says."""

    def __init__(self, claims, shared_answer=None):
        self.claims = list(claims)
        self.shared_answer = shared_answer
        self.calls = []

    def refresh(self, token):
        self.calls.append(("refresh",))
        return Result("ok", {"access_token": "a2", "refresh_token": "r2", "expires_in": 3600})

    def is_shared_worker(self, token):
        self.calls.append(("is_shared_worker",))
        return self.shared_answer

    def claim(self, token, worker, stale):
        self.calls.append(("claim", token))
        return self.claims.pop(0)

    def finish(self, token, job_id, worker, body):
        self.calls.append(("finish", body["status"]))
        return Result("ok", "done", 200)

    def release(self, token, job_id, worker):
        self.calls.append(("release",))
        return Result("ok", None, 200)


class RunLog:
    def __init__(self):
        self.lines = []

    def line(self, text):
        self.lines.append(text)

    def step(self, *a):
        pass

    def exception(self, err):
        self.lines.append(repr(err))


def queue_settings(tmp, mode):
    work = Path(tmp) / "work"
    return Settings(
        supabase_url="https://abc.supabase.co", supabase_key="k", worker_name="laptop",
        session_file=Path(tmp) / "s.json", work_dir=work, json_dir=Path(tmp) / "json", log_file=work / "w.log",
        ffmpeg="ffmpeg", ytdlp_cookies=None, proxy=None, stale_seconds=4321, poll_seconds=7, heartbeat_seconds=30,
        max_duration_seconds=14400, probe_step_seconds=60, probe_seconds=10, cooldown_seconds=0.0,
        rate_limit_pause_seconds=0.0, rate_limit_pauses=3, shazam_device="android", max_skew=0.0, merge_gap_seconds=180,
        result_max_bytes=900000, worker_mode=mode,
    )


def queue_run(tmp, client, mode):
    settings = queue_settings(tmp, mode)
    session = Session(email="dj@example.com", access_token="a", refresh_token="r", expires_at=9e12)
    save(settings.session_file, session)

    def download(url, dest):
        from mix_worker.download import Downloaded

        dest.mkdir(parents=True, exist_ok=True)
        p = dest / "a.webm"
        p.write_bytes(b"x")
        return Downloaded(path=p, title="t", uploader=None, duration=60)

    row = [{"song_name": "T", "artist": "A", "time_in_mix": "00:00:00", "confidence": 1.0, "duration": None}]
    deps = Deps(client=client, download=download, scan=lambda p, d: row, now=lambda: 1_000.0, today=lambda: "2026-11-08", log=RunLog())
    code = run_queue(settings, deps, session, once=True, interval=1, sleep=lambda s: None)
    return code, deps.log.lines


def a_job():
    return {"id": "00000000-0000-4000-8000-000000000001", "payload": {"url": "https://x.y/1"}}


class SharedStart(unittest.TestCase):
    def test_the_mode_picks_the_client(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertIs(type(make_client(queue_settings(tmp, "personal"))), ServerClient)
            self.assertIs(type(make_client(queue_settings(tmp, "shared"))), SharedServerClient)

    def test_shared_asks_once_then_names_the_mode_and_runs_the_personal_loop(self):
        with tempfile.TemporaryDirectory() as tmp:
            job = a_job()
            job["payload"]["url"] = "https://soundcloud.com/a/b"  # shared mode fetches SoundCloud links only
            client = QueueClient([Result("ok", job), Result("ok", None)], Result("ok", True, 200))
            code, lines = queue_run(tmp, client, "shared")
            self.assertEqual(code, EXIT_OK)
            self.assertEqual([c[0] for c in client.calls].count("is_shared_worker"), 1)
            self.assertTrue(lines[0].startswith("mix-worker "))
            self.assertTrue(lines[0].endswith(" · on laptop · shared worker"))
            self.assertIn(("finish", "done"), client.calls)
            self.assertEqual(lines[-1], "queue empty")

    def test_personal_never_asks_and_keeps_its_line(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = QueueClient([Result("ok", None)])
            code, lines = queue_run(tmp, client, "personal")
            self.assertEqual(code, EXIT_OK)
            self.assertNotIn("is_shared_worker", [c[0] for c in client.calls])
            self.assertTrue(lines[0].endswith(" · on laptop"))
            self.assertNotIn("shared", lines[0])

    def test_not_a_shared_worker_exits_7_before_any_claim(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = QueueClient([], Result("ok", False, 200))
            code, lines = queue_run(tmp, client, "shared")
            self.assertEqual(code, EXIT_NOT_SHARED)
            self.assertEqual(code, 7)
            self.assertIn("this account is not a shared worker: ask the owner to add it to shared_workers", lines)
            self.assertNotIn("claim", [c[0] for c in client.calls])

    def test_code_for_maps_the_new_status(self):
        self.assertEqual(code_for(Result("not_shared_worker")), 7)

    def test_refused_claim_during_a_run_exits_7(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = QueueClient([Result("not_shared_worker", None, 403, "denied")], Result("ok", True, 200))
            code, lines = queue_run(tmp, client, "shared")
            self.assertEqual(code, 7)
            self.assertIn("this account is no longer a shared worker", lines)

    def test_refused_finish_exits_7_without_a_release(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = QueueClient([Result("ok", a_job())], Result("ok", True, 200))
            client.finish = lambda token, job_id, worker, body: client.calls.append(("finish", body["status"])) or Result("not_shared_worker", None, 403, "denied")
            code, lines = queue_run(tmp, client, "shared")
            self.assertEqual(code, 7)
            self.assertIn("this account is no longer a shared worker", lines)
            self.assertNotIn("release", [c[0] for c in client.calls])


class PersonalUntouched(unittest.TestCase):
    """Round 015 T016: the default setting never reaches an rpc of migration 0006."""

    def test_default_mode_is_personal(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(Settings.__dataclass_fields__["worker_mode"].default, "personal")
            self.assertIs(type(make_client(queue_settings(tmp, Settings.__dataclass_fields__["worker_mode"].default))), ServerClient)

    def test_personal_run_calls_claim_job_and_patches_jobs_only(self):
        import json

        class Opener:
            def __init__(self):
                self.calls = []

            def __call__(self, req, timeout=None):
                self.calls.append((req.get_method(), req.full_url))
                opener = self

                class Resp:
                    status = 200

                    def __enter__(self):
                        return self

                    def __exit__(self, *a):
                        return False

                    def read(self):
                        if req.full_url.endswith("/rpc/claim_job"):
                            first = sum(1 for m, u in opener.calls if u.endswith("/rpc/claim_job")) == 1
                            return json.dumps([a_job()] if first else []).encode()
                        return b"[{\"id\": \"x\"}]"

                return Resp()

        opener = Opener()
        with tempfile.TemporaryDirectory() as tmp:
            client = ServerClient("https://abc.supabase.co", "k", opener=opener, sleep=lambda s: None)
            code, _ = queue_run(tmp, client, Settings.__dataclass_fields__["worker_mode"].default)
        self.assertEqual(code, EXIT_OK)
        urls = [u for _, u in opener.calls]
        for name in ("is_shared_worker", "claim_any_job", "worker_finish_job", "worker_set_progress", "worker_release_job"):
            self.assertFalse(any(name in u for u in urls), name)
        self.assertTrue(any(u.endswith("/rpc/claim_job") for u in urls))
        self.assertTrue(any(m == "PATCH" and "/rest/v1/jobs?" in u for m, u in opener.calls))


class HttpGetTest(unittest.TestCase):
    class Res:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def read(self):
            return b"body"

    def test_sends_headers_user_agent_and_timeout(self):
        with mock.patch("urllib.request.urlopen", return_value=self.Res()) as op:
            self.assertEqual(http_get("https://x.test/a", {"Accept": "application/json"}, 7.5), (200, b"body"))
        req = op.call_args.args[0]
        self.assertEqual(req.full_url, "https://x.test/a")
        self.assertEqual(req.get_header("Accept"), "application/json")
        self.assertEqual(req.get_header("User-agent"), f"mix-worker/{__version__}")
        self.assertEqual(op.call_args.kwargs["timeout"], 7.5)

    def test_http_error_returns_status_and_body(self):
        err = urllib.error.HTTPError("https://x.test/a", 404, "nf", {}, io.BytesIO(b"gone"))
        with mock.patch("urllib.request.urlopen", side_effect=err):
            self.assertEqual(http_get("https://x.test/a", {}, 5), (404, b"gone"))

    def test_network_error_raises(self):
        with mock.patch("urllib.request.urlopen", side_effect=urllib.error.URLError("down")):
            with self.assertRaises(urllib.error.URLError):
                http_get("https://x.test/a", {}, 5)


if __name__ == "__main__":
    unittest.main()


class SharedLinkRule(unittest.TestCase):
    def test_accepted_hosts(self):
        for url in ("https://soundcloud.com/a/b", "https://www.soundcloud.com/a/b", "https://m.soundcloud.com/a/b", "https://SoundCloud.com/a/b"):
            self.assertTrue(shared_link_allowed(url), url)

    def test_refused(self):
        for url in (
            "https://example.com/a", "http://soundcloud.com/a", "file:///etc/passwd", "https://127.0.0.1/a", "https://192.168.1.5/a",
            "https://soundcloud.com.evil.test/x", "https://evilsoundcloud.com/x", "https://soundcloud.com@evil.test/x",
            "https://evil.test\\@soundcloud.com/x", "https://user:pw@soundcloud.com/x", "https://soundcloud.com:8443/x",
            "https://on.soundcloud.com/x", "", "soundcloud.com/x",
        ):
            self.assertFalse(shared_link_allowed(url), url)
        self.assertFalse(shared_link_allowed(None))


class SharedLinkRun(unittest.TestCase):
    def job(self, url):
        return {"id": "00000000-0000-4000-8000-000000000001", "payload": {"url": url}}

    def run_mode(self, mode, url):
        downloads = []
        with tempfile.TemporaryDirectory() as tmp:
            client = QueueClient([Result("ok", self.job(url), 200), Result("ok", None, 200)], Result("ok", True, 200))
            bodies = []
            client.finish = lambda token, job_id, worker, body: bodies.append(body) or Result("ok", "done", 200)
            settings = queue_settings(tmp, mode)
            session = Session(email="dj@example.com", access_token="a", refresh_token="r", expires_at=9e12)
            save(settings.session_file, session)

            def download(u, dest):
                downloads.append(u)
                from mix_worker.download import DownloadFailure

                return DownloadFailure("stop here")

            deps = Deps(client=client, download=download, scan=lambda p, d: [], now=lambda: 1_000.0, today=lambda: "2026-11-08", log=RunLog())
            code = run_queue(settings, deps, session, once=True, interval=1, sleep=lambda s: None)
            return code, deps.log.lines, downloads, bodies

    def test_shared_refuses_a_foreign_link_before_any_download(self):
        code, lines, downloads, bodies = self.run_mode("shared", "https://example.com/x")
        self.assertEqual(code, 0)
        self.assertEqual(downloads, [])
        self.assertEqual([(b["status"], b["error"]) for b in bodies], [("failed", "link not allowed in shared mode")])
        self.assertEqual(SHARED_LINK_REASON, "link not allowed in shared mode")
        self.assertTrue(any("link not allowed in shared mode" in l for l in lines))

    def test_shared_lets_a_soundcloud_link_reach_the_download(self):
        _, _, downloads, _ = self.run_mode("shared", "https://soundcloud.com/a/b")
        self.assertEqual(downloads, ["https://soundcloud.com/a/b"])

    def test_personal_never_applies_the_check(self):
        _, _, downloads, _ = self.run_mode("personal", "https://example.com/x")
        self.assertEqual(downloads, ["https://example.com/x"])
