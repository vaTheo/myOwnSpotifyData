import io
import json
import unittest
import urllib.error
import urllib.parse
from pathlib import Path

from mix_worker.server import ServerClient, SharedServerClient

BASE = "https://abc.supabase.co"
KEY = "sb_publishable_123"


class FakeResponse:
    def __init__(self, status, body, headers=None):
        self.status = status
        self._body = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.headers = {k: v for k, v in (headers or {}).items()}

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class FakeOpener:
    """Records every request; answers from a queue of responses or errors."""

    def __init__(self, *answers):
        self.answers = list(answers)
        self.calls = []

    def __call__(self, req, timeout=None):
        body = req.data.decode() if req.data else None
        self.calls.append(
            {
                "url": req.full_url,
                "method": req.get_method(),
                "headers": {k.lower(): v for k, v in req.header_items()},
                "body": json.loads(body) if body else None,
                "timeout": timeout,
            }
        )
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer


def http_error(code, body=b"", headers=None):
    return urllib.error.HTTPError("https://abc.supabase.co/x", code, "err", headers or {}, io.BytesIO(body))


def client(*answers, sleeps=None):
    opener = FakeOpener(*answers)
    sleeps = sleeps if sleeps is not None else []
    return ServerClient(BASE, KEY, opener=opener, sleep=sleeps.append), opener


class Auth(unittest.TestCase):
    def test_send_otp(self):
        c, o = client(FakeResponse(200, {}))
        r = c.send_otp("dj@example.com")
        self.assertEqual(r.kind, "ok")
        call = o.calls[0]
        self.assertEqual(call["url"], BASE + "/auth/v1/otp")
        self.assertEqual(call["method"], "POST")
        self.assertEqual(call["body"], {"email": "dj@example.com", "create_user": False})
        self.assertEqual(call["headers"]["apikey"], KEY)
        self.assertEqual(call["headers"]["content-type"], "application/json")
        self.assertNotIn("authorization", call["headers"])

    def test_verify_returns_session_triple(self):
        c, o = client(FakeResponse(200, {"access_token": "a", "refresh_token": "r", "expires_in": 3600, "user": {"email": "dj@example.com"}}))
        r = c.verify("dj@example.com", "123456")
        self.assertEqual(r.kind, "ok")
        self.assertEqual(r.value, {"access_token": "a", "refresh_token": "r", "expires_in": 3600})
        self.assertEqual(o.calls[0]["url"], BASE + "/auth/v1/verify")
        self.assertEqual(o.calls[0]["body"], {"type": "email", "email": "dj@example.com", "token": "123456"})

    def test_verify_refused(self):
        c, _ = client(http_error(403, b'{"error_code":"otp_expired","msg":"Token has expired or is invalid"}'))
        r = c.verify("dj@example.com", "000000")
        self.assertEqual(r.kind, "unauthorized")
        self.assertIn("expired", r.message)

    def test_refresh(self):
        c, o = client(FakeResponse(200, {"access_token": "a2", "refresh_token": "r2", "expires_in": 3600}))
        r = c.refresh("r1")
        self.assertEqual(r.value["access_token"], "a2")
        self.assertEqual(o.calls[0]["url"], BASE + "/auth/v1/token?grant_type=refresh_token")
        self.assertEqual(o.calls[0]["body"], {"refresh_token": "r1"})

    def test_logout(self):
        c, o = client(FakeResponse(204, b""))
        self.assertEqual(c.logout("a").kind, "ok")
        # scope=local: GoTrue's default (global) would also sign out the
        # owner's browsers (audit Finding 3).
        self.assertEqual(o.calls[0]["url"], BASE + "/auth/v1/logout?scope=local")
        self.assertEqual(o.calls[0]["headers"]["authorization"], "Bearer a")


class Queue(unittest.TestCase):
    ROW = {"id": "6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f", "kind": "identify-mix", "payload": {"url": "https://x.y/z"}, "status": "claimed"}

    def test_claim_empty_and_row(self):
        c, o = client(FakeResponse(200, []), FakeResponse(200, [self.ROW]))
        r = c.claim("a", "laptop", 21600)
        self.assertEqual(r.kind, "ok")
        self.assertIsNone(r.value)
        self.assertEqual(c.claim("a", "laptop", 21600).value, self.ROW)
        call = o.calls[0]
        self.assertEqual(call["url"], BASE + "/rest/v1/rpc/claim_job")
        self.assertEqual(call["method"], "POST")
        self.assertEqual(call["body"], {"p_worker": "laptop", "p_stale_seconds": 21600})
        self.assertEqual(call["headers"]["authorization"], "Bearer a")
        self.assertEqual(call["headers"]["apikey"], KEY)

    def test_finish_done_and_taken(self):
        c, o = client(FakeResponse(200, [self.ROW]), FakeResponse(200, []))
        body = {"status": "done", "finished_at": "2026-11-06T10:05:00Z", "result": {"tracks": []}}
        r = c.finish("a", self.ROW["id"], "laptop", body)
        self.assertEqual((r.kind, r.value), ("ok", "done"))
        call = o.calls[0]
        self.assertEqual(call["method"], "PATCH")
        self.assertEqual(call["url"], BASE + "/rest/v1/jobs?id=eq." + self.ROW["id"] + "&status=eq.claimed&claimed_by=eq.laptop")
        self.assertEqual(call["headers"]["prefer"], "return=representation")
        self.assertEqual(call["body"], body)
        self.assertEqual(c.finish("a", self.ROW["id"], "laptop", body).value, "taken")

    def test_progress_reads_the_stop_flag(self):
        c, o = client(
            FakeResponse(200, [{"stop_requested_at": None}]),
            FakeResponse(200, [{"stop_requested_at": "2026-11-06T22:00:00Z"}]),
            FakeResponse(200, []),
        )
        body = {"step": "first", "done": 10, "total": 100, "percent": 10}
        self.assertEqual(c.progress("a", self.ROW["id"], "laptop", body).value, {"stop": False, "taken": False})
        self.assertEqual(o.calls[0]["url"], BASE + "/rest/v1/jobs?id=eq." + self.ROW["id"] + "&status=eq.claimed&claimed_by=eq.laptop&select=stop_requested_at")
        self.assertEqual(o.calls[0]["body"], {"progress": body})
        self.assertEqual(c.progress("a", self.ROW["id"], "laptop", body).value, {"stop": True, "taken": False})
        self.assertEqual(c.progress("a", self.ROW["id"], "laptop", body).value, {"stop": False, "taken": True})

    def test_finish_failed_sends_error_only(self):
        c, o = client(FakeResponse(200, [self.ROW]))
        c.finish("a", self.ROW["id"], "laptop", {"status": "failed", "finished_at": "t", "error": "No track identified"})
        self.assertNotIn("result", o.calls[0]["body"])
        self.assertEqual(o.calls[0]["body"]["error"], "No track identified")

    def test_release(self):
        c, o = client(FakeResponse(200, [self.ROW]))
        self.assertEqual(c.release("a", self.ROW["id"], "laptop").kind, "ok")
        self.assertEqual(o.calls[0]["body"], {"status": "queued", "claimed_by": None, "claimed_at": None})
        self.assertEqual(o.calls[0]["timeout"], 3)

    def test_worker_name_is_url_encoded(self):
        c, o = client(FakeResponse(200, [self.ROW]))
        c.finish("a", self.ROW["id"], "my laptop&more", {"status": "failed", "finished_at": "t", "error": "x"})
        self.assertIn("claimed_by=eq.my%20laptop%26more", o.calls[0]["url"])


class Mapping(unittest.TestCase):
    def test_network_and_5xx_are_offline(self):
        c, _ = client(urllib.error.URLError("no route"))
        self.assertEqual(c.claim("a", "w", 1).kind, "offline")
        c, _ = client(http_error(503, b"upstream"))
        self.assertEqual(c.claim("a", "w", 1).kind, "offline")

    def test_paused(self):
        c, _ = client(http_error(540, b'{"message":"This project is paused"}'))
        self.assertEqual(c.claim("a", "w", 1).kind, "paused")
        c, _ = client(urllib.error.URLError("[Errno -2] Name or service not known"))
        self.assertEqual(c.claim("a", "w", 1).kind, "paused")

    def test_unauthorized_and_too_large(self):
        c, _ = client(http_error(401, b'{"message":"JWT expired"}'))
        self.assertEqual(c.claim("a", "w", 1).kind, "unauthorized")
        c, _ = client(http_error(413, b""))
        self.assertEqual(c.finish("a", "id", "w", {}).kind, "too_large")

    def test_429_waits_once_then_offline(self):
        sleeps = []
        c, o = client(http_error(429, b"", {"Retry-After": "2"}), http_error(429, b"", {"Retry-After": "2"}), sleeps=sleeps)
        r = c.claim("a", "w", 1)
        self.assertEqual(r.kind, "offline")
        self.assertEqual(sleeps, [2.0])
        self.assertEqual(len(o.calls), 2)

    def test_other_4xx_is_error_with_message(self):
        c, _ = client(http_error(400, b'{"message":"bad filter"}'))
        r = c.claim("a", "w", 1)
        self.assertEqual(r.kind, "error")
        self.assertEqual(r.status, 400)
        self.assertIn("bad filter", r.message)

    def test_never_raises_on_garbage(self):
        c, _ = client(FakeResponse(200, b"not json"))
        self.assertEqual(c.claim("a", "w", 1).kind, "error")

    def test_only_the_project_host(self):
        c, o = client(FakeResponse(200, []), FakeResponse(200, {}), FakeResponse(204, b""))
        c.claim("a", "w", 1)
        c.send_otp("e")
        c.logout("a")
        for call in o.calls:
            self.assertTrue(call["url"].startswith(BASE + "/"))


if __name__ == "__main__":
    unittest.main()


class LinkFlow(unittest.TestCase):
    def test_request_link_posts_the_pkce_challenge_and_redirect(self):
        c, o = client(FakeResponse(200, {}))
        r = c.request_link("dj@example.com", "http://127.0.0.1:5173/myOwnSpotifyData/?link=worker", "CHALLENGE")
        self.assertEqual(r.kind, "ok")
        call = o.calls[0]
        self.assertEqual(call["url"], BASE + "/auth/v1/otp?redirect_to=http%3A%2F%2F127.0.0.1%3A5173%2FmyOwnSpotifyData%2F%3Flink%3Dworker")
        self.assertEqual(call["body"], {"email": "dj@example.com", "create_user": False, "code_challenge": "CHALLENGE", "code_challenge_method": "s256"})

    def test_exchange_code(self):
        c, o = client(FakeResponse(200, {"access_token": "a", "refresh_token": "r", "expires_in": 3600}))
        r = c.exchange_code("CODE", "VERIFIER")
        self.assertEqual(r.value, {"access_token": "a", "refresh_token": "r", "expires_in": 3600})
        self.assertEqual(o.calls[0]["url"], BASE + "/auth/v1/token?grant_type=pkce")
        self.assertEqual(o.calls[0]["body"], {"auth_code": "CODE", "code_verifier": "VERIFIER"})

    def test_exchange_refused(self):
        c, _ = client(http_error(400, b'{"error_code":"flow_state_not_found","msg":"invalid flow state"}'))
        r = c.exchange_code("CODE", "VERIFIER")
        self.assertEqual(r.kind, "error")
        self.assertIn("flow state", r.message)


def shared(*answers):
    opener = FakeOpener(*answers)
    return SharedServerClient(BASE, KEY, opener=opener, sleep=lambda s: None), opener


class SharedClient(unittest.TestCase):
    def test_claim_posts_claim_any_job(self):
        c, op = shared(FakeResponse(200, [{"id": "j1", "payload": {"url": "u"}}]))
        r = c.claim("tok", "laptop", 21600)
        self.assertTrue(r.ok)
        self.assertEqual(r.value, {"id": "j1", "payload": {"url": "u"}})
        call = op.calls[0]
        self.assertEqual(call["url"], BASE + "/rest/v1/rpc/claim_any_job")
        self.assertEqual(call["body"], {"p_worker": "laptop", "p_stale_seconds": 21600})
        self.assertEqual(call["headers"]["authorization"], "Bearer tok")

    def test_claim_empty_queue_is_none(self):
        c, _ = shared(FakeResponse(200, []))
        r = c.claim("tok", "laptop", 1)
        self.assertTrue(r.ok)
        self.assertIsNone(r.value)

    def test_finish_done_and_taken(self):
        body = {"status": "done", "finished_at": "t", "result": {}}
        c, op = shared(FakeResponse(200, True), FakeResponse(200, False))
        self.assertEqual(c.finish("tok", "j1", "laptop", body).value, "done")
        self.assertEqual(c.finish("tok", "j1", "laptop", body).value, "taken")
        call = op.calls[0]
        self.assertEqual(call["url"], BASE + "/rest/v1/rpc/worker_finish_job")
        self.assertEqual(call["body"], {"p_id": "j1", "p_worker": "laptop", "p_body": body})

    def test_progress_returns_stop_and_taken(self):
        c, op = shared(
            FakeResponse(200, [{"taken": False, "stop": True}]),
            FakeResponse(200, [{"taken": True, "stop": False}]),
        )
        self.assertEqual(c.progress("tok", "j1", "laptop", {"n": 1}).value, {"stop": True, "taken": False})
        self.assertEqual(c.progress("tok", "j1", "laptop", {"n": 2}).value, {"stop": False, "taken": True})
        call = op.calls[0]
        self.assertEqual(call["url"], BASE + "/rest/v1/rpc/worker_set_progress")
        self.assertEqual(call["body"], {"p_id": "j1", "p_worker": "laptop", "p_progress": {"n": 1}})

    def test_release_uses_short_timeout(self):
        c, op = shared(FakeResponse(200, None))
        c.release("tok", "j1", "laptop")
        call = op.calls[0]
        self.assertEqual(call["url"], BASE + "/rest/v1/rpc/worker_release_job")
        self.assertEqual(call["body"], {"p_id": "j1", "p_worker": "laptop"})
        self.assertEqual(call["timeout"], 3)

    def test_42501_is_not_shared_worker(self):
        err = http_error(403, json.dumps({"code": "42501", "message": "permission denied"}).encode())
        c, _ = shared(err)
        r = c.claim("tok", "laptop", 1)
        self.assertEqual(r.kind, "not_shared_worker")
        self.assertFalse(r.ok)

    def test_other_403_stays_unauthorized(self):
        c, _ = shared(http_error(403, b'{"message":"nope"}'))
        self.assertEqual(c.claim("tok", "laptop", 1).kind, "unauthorized")

    def test_is_shared_worker(self):
        c, op = shared(FakeResponse(200, True), FakeResponse(200, False))
        self.assertEqual(c.is_shared_worker("tok").value, True)
        self.assertEqual(c.is_shared_worker("tok").value, False)
        self.assertEqual(op.calls[0]["url"], BASE + "/rest/v1/rpc/is_shared_worker")
        self.assertEqual(op.calls[0]["body"], {})


class Enqueue(unittest.TestCase):
    """Round 023: the automatic Ask again inserts what the app's Ask again inserts."""

    URL = "https://soundcloud.com/a/b?x=1&y=2"

    def test_no_open_request_inserts_the_apps_row(self):
        c, op = client(FakeResponse(200, []), FakeResponse(201, [{"id": "j2"}]))
        r = c.enqueue("tok", self.URL)
        self.assertEqual((r.kind, r.value), ("ok", "queued"))
        look, insert = op.calls
        self.assertEqual(look["method"], "GET")
        self.assertTrue(look["url"].startswith(BASE + "/rest/v1/jobs?"))
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(look["url"]).query)
        self.assertEqual(query, {"select": ["id"], "kind": ["eq.identify-mix"], "payload->>url": ["eq." + self.URL], "status": ["in.(queued,claimed)"]})
        self.assertEqual(look["headers"]["authorization"], "Bearer tok")
        self.assertEqual(insert["method"], "POST")
        self.assertEqual(insert["url"], BASE + "/rest/v1/jobs")
        self.assertEqual(insert["body"], {"kind": "identify-mix", "payload": {"url": self.URL}})
        self.assertEqual(insert["headers"]["prefer"], "return=representation")
        self.assertEqual(insert["headers"]["authorization"], "Bearer tok")

    def test_the_payload_is_the_apps(self):
        sync = (Path(__file__).resolve().parents[2] / "src" / "server" / "sync.ts").read_text(encoding="utf-8")
        self.assertIn("const JOB_KIND = 'identify-mix';", sync)
        self.assertIn("{ kind: JOB_KIND, payload: { url } }", sync)
        self.assertIn("status: 'in.(queued,claimed)'", sync)

    def test_an_open_request_inserts_nothing(self):
        c, op = client(FakeResponse(200, [{"id": "j1"}]))
        r = c.enqueue("tok", self.URL)
        self.assertEqual((r.kind, r.value), ("ok", "exists"))
        self.assertEqual(len(op.calls), 1)

    def test_errors_are_mapped_and_never_raise(self):
        c, op = client(urllib.error.URLError("down"))
        self.assertEqual(c.enqueue("tok", self.URL).kind, "offline")
        c, op = client(FakeResponse(200, []), http_error(403, b'{"message":"new row violates row-level security"}'))
        self.assertEqual(c.enqueue("tok", self.URL).kind, "unauthorized")
        c, op = client(FakeResponse(200, []), FakeResponse(201, []))
        self.assertEqual(c.enqueue("tok", self.URL).kind, "error")

    def test_the_shared_client_never_inserts(self):
        c, op = shared()
        r = c.enqueue("tok", self.URL)
        self.assertEqual(r.kind, "error")
        self.assertEqual(op.calls, [])
