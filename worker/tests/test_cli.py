import tempfile
import unittest
from pathlib import Path

from mix_worker import __version__
from mix_worker.cli import CliDeps, EXIT_OK, EXIT_SETTINGS, EXIT_SIGNED_OUT, EXIT_TEMPLATE, main
from mix_worker.config import SettingsError
from mix_worker.server import Result
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


if __name__ == "__main__":
    unittest.main()
