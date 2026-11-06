import json
import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path

from mix_worker.server import Result
from mix_worker.session import Session, clear, ensure_fresh, load, save


class FakeClient:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def refresh(self, token):
        self.calls.append(token)
        return self.result


def session(expires_at):
    return Session(email="dj@example.com", access_token="a", refresh_token="r", expires_at=expires_at)


class Files(unittest.TestCase):
    def test_save_and_load(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "nested" / "session.json"
            save(p, session(1000))
            self.assertEqual(load(p), session(1000))
            if sys.platform != "win32":
                self.assertEqual(stat.S_IMODE(os.stat(p).st_mode), 0o600)

    def test_missing_or_corrupt(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertIsNone(load(Path(tmp) / "none.json"))
            p = Path(tmp) / "bad.json"
            p.write_text("{not json", encoding="utf-8")
            self.assertIsNone(load(p))
            p.write_text(json.dumps({"email": "x"}), encoding="utf-8")
            self.assertIsNone(load(p))

    def test_clear(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "session.json"
            save(p, session(1))
            clear(p)
            self.assertFalse(p.exists())
            clear(p)  # a second clear is fine


class Fresh(unittest.TestCase):
    def test_untouched_when_more_than_60s_remain(self):
        c = FakeClient(Result("ok", {}))
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "s.json"
            s = ensure_fresh(session(1000), c, p, now=lambda: 900)
            self.assertEqual(s, session(1000))
            self.assertEqual(c.calls, [])

    def test_refreshes_and_saves_under_60s(self):
        c = FakeClient(Result("ok", {"access_token": "a2", "refresh_token": "r2", "expires_in": 3600}))
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "s.json"
            s = ensure_fresh(session(1000), c, p, now=lambda: 950)
            self.assertEqual(c.calls, ["r"])
            self.assertEqual(s.access_token, "a2")
            self.assertEqual(s.refresh_token, "r2")
            self.assertEqual(s.expires_at, 950 + 3600)
            self.assertEqual(load(p), s)

    def test_unauthorized_clears(self):
        c = FakeClient(Result("unauthorized", None, status=401, message="x"))
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "s.json"
            save(p, session(1000))
            self.assertIsNone(ensure_fresh(session(1000), c, p, now=lambda: 990))
            self.assertFalse(p.exists())

    def test_offline_keeps_the_old_session(self):
        c = FakeClient(Result("offline", None, message="x"))
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "s.json"
            r = ensure_fresh(session(1000), c, p, now=lambda: 990)
            self.assertEqual(r, Result("offline", None, message="x"))


if __name__ == "__main__":
    unittest.main()
