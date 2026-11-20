"""Spec 034: WORKER_EMAIL and WORKER_PASSWORD, the worker signs in by itself.

Every server answer is faked; the password below must never appear in any
line the worker prints or logs, nor in any file it writes (SC-003).
"""

import sys
import tempfile
import unittest
from pathlib import Path

from mix_worker.cli import EXIT_OFFLINE, EXIT_OK, EXIT_PAUSED, EXIT_SETTINGS, EXIT_SIGNED_OUT, CliDeps, main, run_queue
from mix_worker.config import Settings, SettingsError, load_settings, parse_env_file
from mix_worker.download import Downloaded
from mix_worker.pipeline import Deps
from mix_worker.server import Result
from mix_worker.session import WRONG_PASSWORD, PasswordSignIn, Session, load, save

EMAIL = "worker@example.com"
PASSWORD = "s3cret pass#word=\"x'"
SERVER = "SUPABASE_URL=https://abc.supabase.co\nSUPABASE_KEY=sb_publishable_1234567890\n"
FILE_ACCOUNT = f"WORKER_EMAIL={EMAIL}\nWORKER_PASSWORD='{PASSWORD}'   # the one secret\n"
GRANT = Result("ok", {"access_token": "pa", "refresh_token": "pr", "expires_in": 3600}, 200)
WRONG = Result("error", None, 400, "Invalid login credentials")


class AuthClient:
    """Answers the sign-ins and the refresh; records every call."""

    def __init__(self, grant=GRANT, refresh=None):
        self.grant = grant
        self.refresh_result = refresh or Result("ok", {"access_token": "a2", "refresh_token": "r2", "expires_in": 3600}, 200)
        self.calls = []

    def sign_in_password(self, email, password):
        self.calls.append(("password", email, password))
        return self.grant

    def refresh(self, token):
        self.calls.append(("refresh", token))
        return self.refresh_result

    def send_otp(self, email):
        self.calls.append(("otp", email))
        return Result("ok", None, 200)

    def request_link(self, email, redirect_to, challenge):
        self.calls.append(("link", email))
        return Result("ok", None, 200)

    def logout(self, token):
        self.calls.append(("logout", token))
        return Result("ok", None, 204)

    def signs(self):
        return [c for c in self.calls if c[0] == "password"]


def files_text(root):
    """Every file under `root`, as text."""
    return "\n".join(p.read_text(encoding="utf-8", errors="replace") for p in Path(root).rglob("*") if p.is_file())


class SettingsTest(unittest.TestCase):
    def load(self, text="", env=None):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "mix-worker.env"
            path.write_text(SERVER + text, encoding="utf-8")
            return load_settings(
                path, env or {}, hostname=lambda: "lxc", home=Path(tmp), platform="linux", frozen_dir=None, exists=lambda p: p.exists()
            )

    def test_unset_by_default(self):
        s = self.load()
        self.assertEqual((s.worker_email, s.worker_password, s.signs_in_by_password), ("", "", False))

    def test_the_password_is_read_whole_from_the_file_between_quotes(self):
        s = self.load(FILE_ACCOUNT)
        self.assertEqual((s.worker_email, s.worker_password), (EMAIL, PASSWORD))
        self.assertTrue(s.signs_in_by_password)

    def test_the_password_is_read_whole_from_the_environment(self):
        raw = " pass #word = 'x\" "
        s = self.load(env={"WORKER_EMAIL": EMAIL, "WORKER_PASSWORD": raw})
        self.assertEqual(s.worker_password, raw)

    def test_the_environment_wins(self):
        s = self.load(FILE_ACCOUNT, env={"WORKER_PASSWORD": "other"})
        self.assertEqual(s.worker_password, "other")

    def test_an_unquoted_password_loses_what_follows_space_hash(self):
        # The documented rule: quote the password in a settings file.
        self.assertEqual(parse_env_file("WORKER_PASSWORD=abc #def\n"), {"WORKER_PASSWORD": "abc"})
        self.assertEqual(parse_env_file("WORKER_PASSWORD='abc #def'\n"), {"WORKER_PASSWORD": "abc #def"})

    def test_one_alone_names_the_missing_one(self):
        with self.assertRaises(SettingsError) as err:
            self.load(f"WORKER_EMAIL={EMAIL}\n")
        self.assertEqual(err.exception.setting, "WORKER_PASSWORD")
        with self.assertRaises(SettingsError) as err:
            self.load(f"WORKER_PASSWORD='{PASSWORD}'\n")
        self.assertEqual(err.exception.setting, "WORKER_EMAIL")
        self.assertNotIn(PASSWORD, str(err.exception))

    def test_the_password_is_not_in_the_repr(self):
        self.assertNotIn(PASSWORD, repr(self.load(FILE_ACCOUNT)))


class PasswordSignInTest(unittest.TestCase):
    def make(self, tmp, client=None):
        lines = []
        path = Path(tmp) / "session.json"
        account = PasswordSignIn(EMAIL, PASSWORD, path, lines.append, now=lambda: 1000.0)
        return account, client or AuthClient(), path, lines

    def test_no_session_signs_in_and_saves_it_without_the_password(self):
        with tempfile.TemporaryDirectory() as tmp:
            account, client, path, lines = self.make(tmp)
            s = account.fresh(None, client)
            self.assertEqual(s, Session(EMAIL, "pa", "pr", 4600.0))
            self.assertEqual(load(path), s)
            self.assertEqual(client.signs(), [("password", EMAIL, PASSWORD)])
            self.assertEqual(len(lines), 1)
            self.assertIn(f"signed in as {EMAIL} by password", lines[0])
            self.assertNotIn(PASSWORD, files_text(tmp) + "\n".join(lines) + repr(account))
            if sys.platform != "win32":  # Windows has no Unix file modes
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_a_valid_session_of_the_account_is_kept(self):
        with tempfile.TemporaryDirectory() as tmp:
            account, client, _, lines = self.make(tmp)
            mine = Session(EMAIL.upper(), "a", "r", 9e9)
            self.assertIs(account.fresh(mine, client), mine)
            self.assertEqual((client.calls, lines), ([], []))

    def test_another_accounts_session_is_replaced(self):
        with tempfile.TemporaryDirectory() as tmp:
            account, client, path, lines = self.make(tmp)
            save(path, Session("dj@example.com", "a", "r", 9e9))
            s = account.fresh(load(path), client)
            self.assertEqual(s.email, EMAIL)
            self.assertEqual(load(path).email, EMAIL)
            self.assertEqual(len(client.signs()), 1)
            self.assertIn("dj@example.com", lines[0])

    def test_a_refused_refresh_leads_to_one_sign_in(self):
        with tempfile.TemporaryDirectory() as tmp:
            account, client, path, _ = self.make(tmp, AuthClient(refresh=Result("unauthorized", None, 401, "x")))
            s = account.fresh(Session(EMAIL, "a", "r", 1010.0), client)
            self.assertEqual([c[0] for c in client.calls], ["refresh", "password"])
            self.assertEqual(s.access_token, "pa")
            self.assertEqual(load(path).access_token, "pa")

    def test_a_400_refresh_counts_as_refused(self):
        for status in (400, 422):
            with tempfile.TemporaryDirectory() as tmp:
                dead = Result("error", None, status, "Invalid Refresh Token: Refresh Token Not Found")
                account, client, path, _ = self.make(tmp, AuthClient(refresh=dead))
                save(path, Session(EMAIL, "a", "r", 1010.0))
                s = account.fresh(load(path), client)
                self.assertEqual([c[0] for c in client.calls], ["refresh", "password"])
                self.assertEqual((s.access_token, load(path).access_token), ("pa", "pa"))

    def test_other_refresh_errors_are_not_a_refusal(self):
        for answer in (Result("error", None, 404, "not found"), Result("offline", None, None, "net")):
            with tempfile.TemporaryDirectory() as tmp:
                account, client, _, _ = self.make(tmp, AuthClient(refresh=answer))
                self.assertIs(account.fresh(Session(EMAIL, "a", "r", 1010.0), client), answer)
                self.assertEqual(client.signs(), [])

    def test_a_wrong_password_is_tried_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            account, client, path, lines = self.make(tmp, AuthClient(grant=WRONG))
            first = account.fresh(None, client)
            second = account.fresh(None, client)
            self.assertIs(first, second)
            self.assertEqual(first.kind, "unauthorized")
            self.assertIn(WRONG_PASSWORD, first.message)
            self.assertEqual(len(client.signs()), 1)
            self.assertEqual(len(lines), 1)
            self.assertIn("email or password is wrong", lines[0])
            self.assertFalse(path.exists())

    def test_offline_and_paused_are_not_a_wrong_password(self):
        for kind in ("offline", "paused"):
            with tempfile.TemporaryDirectory() as tmp:
                account, client, _, _ = self.make(tmp, AuthClient(grant=Result(kind, None, None, kind)))
                self.assertEqual(account.fresh(None, client).kind, kind)
                self.assertIsNone(account.refused)
                account.fresh(None, client)
                self.assertEqual(len(client.signs()), 2)


class Harness:
    def __init__(self, tmp, text=FILE_ACCOUNT, client=None, session=None, env=None):
        self.tmp = Path(tmp)
        self.config = self.tmp / "mix-worker.env"
        self.config.write_text(SERVER + text, encoding="utf-8")
        self.out = []
        self.client = client or AuthClient()
        self.ran = []
        session_file = self.tmp / "session.json"
        if session is not None:
            save(session_file, session)
        self.deps = CliDeps(
            env={"WORKER_SESSION_FILE": str(session_file), "WORKER_WORK_DIR": str(self.tmp / "work"), **(env or {})},
            home=self.tmp,
            platform="linux",
            hostname=lambda: "lxc",
            frozen_dir=None,
            read=lambda prompt: self.fail_prompt(prompt),
            out=self.out.append,
            client_factory=lambda url, key: self.client,
            run_queue=lambda settings, deps, session, once, interval, account=None: self.ran.append((session, account)) or EXIT_OK,
            build_deps=lambda settings: None,
            ffmpeg_version=lambda path: "n9.0.2",
            which=lambda name: None,
            now=lambda: 1000.0,
            builtin={},
        )

    @staticmethod
    def fail_prompt(prompt):
        raise AssertionError(f"asked: {prompt}")

    def main(self, *argv):
        return main(["--config", str(self.config), *argv], deps=self.deps)

    def text(self):
        return "\n".join(self.out)

    def assert_no_password(self, case):
        written = files_text(self.tmp).replace(self.config.read_text(encoding="utf-8"), "")
        case.assertNotIn(PASSWORD, self.text() + written)


class CommandsTest(unittest.TestCase):
    def test_run_without_session_signs_in_then_runs(self):
        with tempfile.TemporaryDirectory() as tmp:
            h = Harness(tmp)
            self.assertEqual(h.main("run", "--watch"), EXIT_OK)
            self.assertEqual(len(h.client.signs()), 1)
            session, account = h.ran[0]
            self.assertEqual((session.email, session.access_token), (EMAIL, "pa"))
            self.assertIsInstance(account, PasswordSignIn)
            self.assertIn(f"signed in as {EMAIL} by password", h.text())
            h.assert_no_password(self)

    def test_no_command_signs_in_without_a_prompt(self):
        with tempfile.TemporaryDirectory() as tmp:
            h = Harness(tmp)
            self.assertEqual(h.main(), EXIT_OK)
            self.assertEqual(len(h.client.signs()), 1)
            self.assertEqual(len(h.ran), 1)

    def test_run_with_a_valid_session_does_not_sign_in(self):
        with tempfile.TemporaryDirectory() as tmp:
            h = Harness(tmp, session=Session(EMAIL, "a", "r", 9e9))
            self.assertEqual(h.main("run"), EXIT_OK)
            self.assertEqual(h.client.calls, [])
            self.assertEqual(h.ran[0][0].access_token, "a")

    def test_run_with_another_accounts_session_replaces_it(self):
        with tempfile.TemporaryDirectory() as tmp:
            h = Harness(tmp, session=Session("dj@example.com", "a", "r", 9e9))
            self.assertEqual(h.main("run"), EXIT_OK)
            self.assertEqual(len(h.client.signs()), 1)
            self.assertEqual(load(h.tmp / "session.json").email, EMAIL)

    def test_a_wrong_password_exits_4_after_one_try(self):
        with tempfile.TemporaryDirectory() as tmp:
            h = Harness(tmp, client=AuthClient(grant=WRONG))
            self.assertEqual(h.main("run", "--watch"), EXIT_SIGNED_OUT)
            self.assertEqual(len(h.client.signs()), 1)
            self.assertEqual(h.ran, [])
            self.assertEqual(sum("email or password is wrong" in line for line in h.out), 1)
            h.assert_no_password(self)

    def test_offline_and_paused_keep_their_codes(self):
        for kind, code in (("offline", EXIT_OFFLINE), ("paused", EXIT_PAUSED)):
            with tempfile.TemporaryDirectory() as tmp:
                h = Harness(tmp, client=AuthClient(grant=Result(kind, None, None, f"the server is {kind}")))
                self.assertEqual(h.main("run"), code)
                self.assertIn(f"server: the server is {kind}", h.text())
                self.assertNotIn("wrong", h.text())

    def test_one_setting_alone_exits_5_naming_the_other(self):
        with tempfile.TemporaryDirectory() as tmp:
            h = Harness(tmp, text=f"WORKER_EMAIL={EMAIL}\n")
            self.assertEqual(h.main("run"), EXIT_SETTINGS)
            self.assertIn("WORKER_PASSWORD", h.text())
            self.assertEqual(h.client.calls, [])
            h = Harness(tmp, text="", env={"WORKER_PASSWORD": PASSWORD})
            self.assertEqual(h.main("run"), EXIT_SETTINGS)
            self.assertIn("setting WORKER_EMAIL", h.text())
            self.assertNotIn(PASSWORD, h.text())

    def test_login_signs_in_without_a_prompt(self):
        with tempfile.TemporaryDirectory() as tmp:
            h = Harness(tmp)
            self.assertEqual(h.main("login"), EXIT_OK)
            self.assertEqual(h.client.calls, [("password", EMAIL, PASSWORD)])
            self.assertEqual(load(h.tmp / "session.json").email, EMAIL)
            self.assertEqual(h.main("login"), EXIT_OK)
            self.assertIn(f"already signed in as {EMAIL}", h.text())
            self.assertEqual(len(h.client.signs()), 1)
            h.assert_no_password(self)

    def test_login_wrong_password_exits_4(self):
        with tempfile.TemporaryDirectory() as tmp:
            h = Harness(tmp, client=AuthClient(grant=WRONG))
            self.assertEqual(h.main("login"), EXIT_SIGNED_OUT)
            self.assertIn("email or password is wrong", h.text())

    def test_check_names_the_account_never_the_password(self):
        with tempfile.TemporaryDirectory() as tmp:
            h = Harness(tmp)
            self.assertEqual(h.main("check"), EXIT_OK)
            self.assertIn(f"sign-in: by password as {EMAIL}", h.text())
            self.assertNotIn(PASSWORD, h.text())
            self.assertEqual(h.client.calls, [])

    def test_check_without_the_settings_has_no_sign_in_line(self):
        with tempfile.TemporaryDirectory() as tmp:
            h = Harness(tmp, text="")
            self.assertEqual(h.main("check"), EXIT_OK)
            self.assertNotIn("sign-in:", h.text())

    def test_run_with_a_dead_refresh_token_signs_in(self):
        with tempfile.TemporaryDirectory() as tmp:
            dead = Result("error", None, 400, "Invalid Refresh Token: Refresh Token Not Found")
            h = Harness(tmp, client=AuthClient(refresh=dead), session=Session(EMAIL, "a", "r", 1010.0))
            self.assertEqual(h.main("run", "--watch"), EXIT_OK)
            self.assertEqual([c[0] for c in h.client.calls], ["refresh", "password"])
            self.assertEqual(h.ran[0][0].access_token, "pa")
            self.assertEqual(load(h.tmp / "session.json").access_token, "pa")

    def test_logout_then_run_signs_in_again(self):
        with tempfile.TemporaryDirectory() as tmp:
            h = Harness(tmp, session=Session(EMAIL, "a", "r", 9e9))
            self.assertEqual(h.main("logout"), EXIT_OK)
            self.assertFalse((h.tmp / "session.json").exists())
            self.assertEqual(h.main("run"), EXIT_OK)
            self.assertEqual(len(h.client.signs()), 1)


class QueueClient(AuthClient):
    def __init__(self, claims, refreshes, grant=GRANT):
        super().__init__(grant=grant)
        self.claims = list(claims)
        self.refreshes = list(refreshes)

    def refresh(self, token):
        self.calls.append(("refresh", token))
        return self.refreshes.pop(0)

    def claim(self, token, worker, stale):
        self.calls.append(("claim", token))
        return self.claims.pop(0)

    def finish(self, token, job_id, worker, body):
        self.calls.append(("finish", token, body["status"]))
        return Result("ok", "done", 200)

    def release(self, token, job_id, worker):
        self.calls.append(("release", token))
        return Result("ok", None, 200)


class FakeLog:
    def __init__(self):
        self.lines = []

    def line(self, text):
        self.lines.append(text)

    def step(self, *a):
        pass

    def exception(self, err):
        self.lines.append(repr(err))


REFUSED = Result("unauthorized", None, 401, "Invalid Refresh Token")
# What GoTrue really answers for a dead refresh token: 400, mapped to "error".
DEAD = Result("error", None, 400, "Invalid Refresh Token: Refresh Token Not Found")
REFRESHED = Result("ok", {"access_token": "a2", "refresh_token": "r2", "expires_in": 3600}, 200)
JOB = {"id": "00000000-0000-4000-8000-000000000001", "payload": {"url": "https://x.y/1"}}


def queue(tmp, client, expires_at, clock=None):
    work = Path(tmp) / "work"
    settings = Settings(
        supabase_url="https://abc.supabase.co", supabase_key="k", worker_name="lxc",
        session_file=Path(tmp) / "s.json", work_dir=work, json_dir=Path(tmp) / "json", log_file=work / "w.log",
        ffmpeg="ffmpeg", ytdlp_cookies=None, proxy=None, stale_seconds=60, poll_seconds=7, heartbeat_seconds=30,
        max_duration_seconds=0, probe_step_seconds=60, probe_seconds=10, cooldown_seconds=0.0,
        rate_limit_pause_seconds=0.0, rate_limit_pauses=3, shazam_device="android", max_skew=0.0, merge_gap_seconds=180,
        result_max_bytes=900000, worker_mode="personal", worker_email=EMAIL, worker_password=PASSWORD,
    )

    def download(url, dest):
        dest.mkdir(parents=True, exist_ok=True)
        p = dest / "a.webm"
        p.write_bytes(b"x")
        return Downloaded(path=p, title="t", uploader=None, duration=60)

    row = [{"song_name": "T", "artist": "A", "time_in_mix": "00:00:00", "confidence": 1.0, "duration": None}]
    clock = clock if clock is not None else [1_000.0]

    def scan(path, duration):
        clock[0] += 4_000.0  # a long scan: the session is old when the result is sent
        return row

    deps = Deps(client=client, download=download, scan=scan, now=lambda: 1_000.0, today=lambda: "2026-11-19", log=FakeLog())
    session = Session(EMAIL, "a", "r", expires_at)
    save(settings.session_file, session)
    account = PasswordSignIn(EMAIL, PASSWORD, settings.session_file, print, now=lambda: clock[0])
    return settings, deps, session, account


class RunQueueTest(unittest.TestCase):
    def test_a_refresh_refused_at_start_signs_in_and_claims(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = QueueClient([Result("ok", None)], [REFUSED])
            settings, deps, session, account = queue(tmp, client, expires_at=1_010.0)
            self.assertEqual(run_queue(settings, deps, session, once=True, interval=1, account=account), EXIT_OK)
            self.assertEqual([c[0] for c in client.calls], ["refresh", "password", "claim"])
            self.assertEqual(client.calls[2], ("claim", "pa"))
            self.assertIn(f"signed in as {EMAIL} by password · session kept at {settings.session_file}", deps.log.lines)
            self.assertNotIn(PASSWORD, "\n".join(deps.log.lines) + files_text(tmp))

    def test_a_400_refresh_at_start_signs_in_and_claims(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = QueueClient([Result("ok", None)], [DEAD])
            settings, deps, session, account = queue(tmp, client, expires_at=1_010.0)
            self.assertEqual(run_queue(settings, deps, session, once=True, interval=1, account=account), EXIT_OK)
            self.assertEqual([c[0] for c in client.calls], ["refresh", "password", "claim"])
            self.assertEqual(client.calls[2], ("claim", "pa"))

    def test_a_400_refresh_during_a_request_signs_in_and_sends(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = QueueClient([Result("ok", JOB), Result("ok", None)], [REFRESHED, DEAD] + [REFRESHED] * 10)
            settings, deps, session, account = queue(tmp, client, expires_at=1_010.0)
            self.assertEqual(run_queue(settings, deps, session, once=True, interval=1, account=account), EXIT_OK)
            self.assertEqual(len(client.signs()), 1)
            finish = [c for c in client.calls if c[0] == "finish"]
            self.assertEqual(finish[-1][1:], ("pa", "done"))
            self.assertNotIn(PASSWORD, "\n".join(deps.log.lines) + files_text(tmp))

    def test_without_an_account_a_400_refresh_is_unchanged(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = QueueClient([Result("ok", None)], [DEAD])
            settings, deps, session, _ = queue(tmp, client, expires_at=1_010.0)
            self.assertEqual(run_queue(settings, deps, session, once=True, interval=1), EXIT_OFFLINE)
            self.assertEqual([c[0] for c in client.calls], ["refresh"])
            self.assertTrue(settings.session_file.exists())

    def test_a_refresh_refused_during_a_request_signs_in_and_sends(self):
        with tempfile.TemporaryDirectory() as tmp:
            # Start: refreshed; the request's token() then sees a refusal.
            client = QueueClient([Result("ok", JOB), Result("ok", None)], [REFRESHED, REFUSED] + [REFRESHED] * 10)
            settings, deps, session, account = queue(tmp, client, expires_at=1_010.0)
            self.assertEqual(run_queue(settings, deps, session, once=True, interval=1, account=account), EXIT_OK)
            self.assertEqual(len(client.signs()), 1)
            finish = [c for c in client.calls if c[0] == "finish"]
            self.assertEqual(finish[-1][2], "done")
            self.assertNotIn(PASSWORD, "\n".join(deps.log.lines) + files_text(tmp))

    def test_a_wrong_password_after_a_refused_refresh_exits_4_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = QueueClient([Result("ok", None)], [REFUSED], grant=WRONG)
            settings, deps, session, account = queue(tmp, client, expires_at=1_010.0)
            self.assertEqual(run_queue(settings, deps, session, once=True, interval=1, account=account), EXIT_SIGNED_OUT)
            self.assertEqual([c[0] for c in client.calls], ["refresh", "password"])
            self.assertEqual(sum("email or password is wrong" in line for line in deps.log.lines), 1)
            self.assertFalse(any(line.startswith("server:") for line in deps.log.lines))

    def test_without_an_account_a_refused_refresh_still_exits_4(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = QueueClient([Result("ok", None)], [REFUSED])
            settings, deps, session, _ = queue(tmp, client, expires_at=1_010.0)
            self.assertEqual(run_queue(settings, deps, session, once=True, interval=1), EXIT_SIGNED_OUT)
            self.assertEqual([c[0] for c in client.calls], ["refresh"])


if __name__ == "__main__":
    unittest.main()
