"""The owner's Supabase project over urllib: GoTrue and PostgREST, never raising.

Every method returns a `Result`; the mapping copies the app's `client.ts`
(contracts/server-schema.md "Error mapping"). The opener and the sleep are
injected so tests see every request and no test touches the network.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

TIMEOUT_SECONDS = 30
RELEASE_TIMEOUT_SECONDS = 3
RETRY_AFTER_DEFAULT = 5.0
RETRY_AFTER_MAX = 60.0

ResultKind = str  # 'ok' | 'offline' | 'paused' | 'unauthorized' | 'too_large' | 'error'


@dataclass
class Result:
    kind: ResultKind
    value: Any = None
    status: int | None = None
    message: str = ""

    @property
    def ok(self) -> bool:
        return self.kind == "ok"


def _message_of(body: bytes) -> str:
    try:
        data = json.loads(body.decode("utf-8", "replace"))
    except ValueError:
        return body.decode("utf-8", "replace")[:200]
    if isinstance(data, dict):
        for key in ("msg", "message", "error_description", "error", "hint"):
            if isinstance(data.get(key), str):
                return data[key]
    return str(data)[:200]


def _is_dns_failure(reason: object) -> bool:
    text = str(reason).lower()
    return any(
        marker in text
        for marker in ("name or service not known", "nodename nor servname", "getaddrinfo", "temporary failure in name resolution")
    )


class ServerClient:
    def __init__(
        self,
        base_url: str,
        api_key: str,
        opener: Callable[..., Any] = urllib.request.urlopen,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self._opener = opener
        self._sleep = sleep

    # -- the one request -----------------------------------------------------

    def _request(
        self,
        method: str,
        path: str,
        body: Any = None,
        token: str | None = None,
        prefer: str | None = None,
        timeout: float = TIMEOUT_SECONDS,
    ) -> Result:
        url = self.base_url + path
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("apikey", self.api_key)
        req.add_header("Accept", "application/json")
        if data is not None:
            req.add_header("Content-Type", "application/json")
        if token:
            req.add_header("Authorization", f"Bearer {token}")
        if prefer:
            req.add_header("Prefer", prefer)
        waited = False
        while True:
            try:
                with self._opener(req, timeout=timeout) as resp:
                    raw = resp.read()
                    status = int(resp.status)
            except urllib.error.HTTPError as err:
                status = err.code
                raw = err.read() if hasattr(err, "read") else b""
                if status == 429 and not waited:
                    waited = True
                    header = err.headers.get("Retry-After") if err.headers else None
                    try:
                        wait = float(header) if header else RETRY_AFTER_DEFAULT
                    except ValueError:
                        wait = RETRY_AFTER_DEFAULT
                    self._sleep(min(max(wait, 0.0), RETRY_AFTER_MAX))
                    continue
                return self._map_http_error(status, raw)
            except urllib.error.URLError as err:
                if _is_dns_failure(err.reason):
                    return Result("paused", None, None, "the server's address does not resolve; the project may be paused")
                return Result("offline", None, None, f"network error: {err.reason}")
            except (OSError, TimeoutError) as err:
                return Result("offline", None, None, f"network error: {err}")
            if not raw.strip():
                return Result("ok", None, status)
            try:
                return Result("ok", json.loads(raw.decode("utf-8")), status)
            except ValueError:
                return Result("error", None, status, "the server answered something that is not JSON")

    @staticmethod
    def _map_http_error(status: int, raw: bytes) -> Result:
        message = _message_of(raw)
        if status in (401, 403):
            return Result("unauthorized", None, status, message)
        if status == 413:
            return Result("too_large", None, status, message)
        if status == 429:
            return Result("offline", None, status, "rate limited by the server; try later")
        if status >= 500:
            if "paused" in raw.decode("utf-8", "replace").lower():
                return Result("paused", None, status, "the project is paused; resume it from the dashboard")
            return Result("offline", None, status, f"server error {status}: {message}")
        return Result("error", None, status, message or f"server error {status}")

    # -- sign-in (research D8) -----------------------------------------------

    def send_otp(self, email: str) -> Result:
        """The six-digit code mail (needs `{{ .Token }}` in the Magic Link template)."""
        return self._request("POST", "/auth/v1/otp", {"email": email, "create_user": False})

    def request_link(self, email: str, redirect_to: str, code_challenge: str) -> Result:
        """The magic link in the PKCE flow, as the app asks for it (research D8)."""
        return self._request(
            "POST",
            "/auth/v1/otp?redirect_to=" + urllib.parse.quote(redirect_to, safe=""),
            {"email": email, "create_user": False, "code_challenge": code_challenge, "code_challenge_method": "s256"},
        )

    def exchange_code(self, auth_code: str, code_verifier: str) -> Result:
        r = self._request("POST", "/auth/v1/token?grant_type=pkce", {"auth_code": auth_code, "code_verifier": code_verifier})
        return self._session_triple(r)

    def verify(self, email: str, code: str) -> Result:
        r = self._request("POST", "/auth/v1/verify", {"type": "email", "email": email, "token": code})
        return self._session_triple(r)

    def refresh(self, refresh_token: str) -> Result:
        r = self._request("POST", "/auth/v1/token?grant_type=refresh_token", {"refresh_token": refresh_token})
        return self._session_triple(r)

    def logout(self, access_token: str) -> Result:
        # scope=local: this session only; GoTrue's default (global) would also
        # sign out the owner's browsers (audit Finding 3).
        return self._request("POST", "/auth/v1/logout?scope=local", token=access_token)

    @staticmethod
    def _session_triple(r: Result) -> Result:
        if not r.ok:
            return r
        v = r.value
        if (
            isinstance(v, dict)
            and isinstance(v.get("access_token"), str)
            and isinstance(v.get("refresh_token"), str)
            and isinstance(v.get("expires_in"), (int, float))
        ):
            return Result("ok", {"access_token": v["access_token"], "refresh_token": v["refresh_token"], "expires_in": v["expires_in"]}, r.status)
        return Result("error", None, r.status, "the sign-in answer had no session")

    # -- the queue (contracts/server-schema.md) ------------------------------

    def is_shared_worker(self, access_token: str) -> Result:
        r = self._request("POST", "/rest/v1/rpc/is_shared_worker", {}, token=access_token)
        if not r.ok:
            return r
        return Result("ok", r.value is True, r.status)

    def claim(self, access_token: str, worker: str, stale_seconds: int) -> Result:
        r = self._request("POST", "/rest/v1/rpc/claim_job", {"p_worker": worker, "p_stale_seconds": stale_seconds}, token=access_token)
        if not r.ok:
            return r
        if r.value is None or (isinstance(r.value, list) and not r.value):
            return Result("ok", None, r.status)
        if isinstance(r.value, list) and isinstance(r.value[0], dict):
            return Result("ok", r.value[0], r.status)
        return Result("error", None, r.status, "claim_job answered an unexpected shape")

    def _job_filter(self, job_id: str, worker: str) -> str:
        return (
            "/rest/v1/jobs?id=eq." + urllib.parse.quote(job_id, safe="")
            + "&status=eq.claimed&claimed_by=eq." + urllib.parse.quote(worker, safe="")
        )

    def finish(self, access_token: str, job_id: str, worker: str, body: dict[str, Any]) -> Result:
        r = self._request("PATCH", self._job_filter(job_id, worker), body, token=access_token, prefer="return=representation")
        if not r.ok:
            return r
        taken = not (isinstance(r.value, list) and r.value)
        return Result("ok", "taken" if taken else "done", r.status)

    def progress(self, access_token: str, job_id: str, worker: str, progress: dict[str, Any]) -> Result:
        """Writes the run's progress on the request it holds (round 004) and
        reads back whether the owner asked to stop it. `value`: `{"stop":
        bool, "taken": bool}`. A failure (no 0003 migration, offline) is a
        `Result` the caller logs; it never stops the run."""
        r = self._request(
            "PATCH",
            self._job_filter(job_id, worker) + "&select=stop_requested_at",
            {"progress": progress},
            token=access_token,
            prefer="return=representation",
        )
        if not r.ok:
            return r
        rows = r.value if isinstance(r.value, list) else []
        stop = bool(rows and isinstance(rows[0], dict) and rows[0].get("stop_requested_at"))
        return Result("ok", {"stop": stop, "taken": not rows}, r.status)

    def enqueue(self, access_token: str, url: str) -> Result:
        """Round 023, the automatic Ask again: what the app's Ask again does
        (`requestIdentify` in src/server/sync.ts), one open request per link.
        `value`: "exists" when one is queued or claimed (nothing inserted),
        "queued" when the row was added. The insert runs under the owner's
        session: `jobs_insert` checks `owner_id = auth.uid()`, the default."""
        query = urllib.parse.urlencode(
            {"select": "id", "kind": "eq.identify-mix", "payload->>url": "eq." + url, "status": "in.(queued,claimed)"}
        )
        found = self._request("GET", "/rest/v1/jobs?" + query, token=access_token)
        if not found.ok:
            return found
        if isinstance(found.value, list) and found.value:
            return Result("ok", "exists", found.status)
        r = self._request(
            "POST", "/rest/v1/jobs", {"kind": "identify-mix", "payload": {"url": url}}, token=access_token, prefer="return=representation"
        )
        if not r.ok:
            return r
        if isinstance(r.value, list) and r.value:
            return Result("ok", "queued", r.status)
        return Result("error", None, r.status, "the server answered without the created row")

    def release(self, access_token: str, job_id: str, worker: str) -> Result:
        return self._request(
            "PATCH",
            self._job_filter(job_id, worker),
            {"status": "queued", "claimed_by": None, "claimed_at": None},
            token=access_token,
            prefer="return=representation",
            timeout=RELEASE_TIMEOUT_SECONDS,
        )


class SharedServerClient(ServerClient):
    """The shared worker's queue calls (round 015, contracts/worker.md): the
    same four method names and return shapes, over the definer functions.

    HTTP `42501` (the body's `code`) is `Result("not_shared_worker")`, which
    the caller turns into exit 7; every other mapping is the personal client's.
    """

    @staticmethod
    def _map_http_error(status: int, raw: bytes) -> Result:
        try:
            data = json.loads(raw.decode("utf-8", "replace"))
        except ValueError:
            data = None
        if isinstance(data, dict) and data.get("code") == "42501":
            return Result("not_shared_worker", None, status, _message_of(raw))
        return ServerClient._map_http_error(status, raw)

    def claim(self, access_token: str, worker: str, stale_seconds: int) -> Result:
        r = self._request("POST", "/rest/v1/rpc/claim_any_job", {"p_worker": worker, "p_stale_seconds": stale_seconds}, token=access_token)
        if not r.ok:
            return r
        if r.value is None or (isinstance(r.value, list) and not r.value):
            return Result("ok", None, r.status)
        if isinstance(r.value, list) and isinstance(r.value[0], dict):
            row = r.value[0]
            return Result("ok", {"id": row.get("id"), "payload": row.get("payload")}, r.status)
        return Result("error", None, r.status, "claim_any_job answered an unexpected shape")

    def finish(self, access_token: str, job_id: str, worker: str, body: dict[str, Any]) -> Result:
        r = self._request("POST", "/rest/v1/rpc/worker_finish_job", {"p_id": job_id, "p_worker": worker, "p_body": body}, token=access_token)
        if not r.ok:
            return r
        return Result("ok", "done" if r.value is True else "taken", r.status)

    def progress(self, access_token: str, job_id: str, worker: str, progress: dict[str, Any]) -> Result:
        r = self._request("POST", "/rest/v1/rpc/worker_set_progress", {"p_id": job_id, "p_worker": worker, "p_progress": progress}, token=access_token)
        if not r.ok:
            return r
        rows = r.value if isinstance(r.value, list) else []
        row = rows[0] if rows and isinstance(rows[0], dict) else None
        if row is None:
            return Result("ok", {"stop": False, "taken": True}, r.status)
        return Result("ok", {"stop": bool(row.get("stop")), "taken": bool(row.get("taken"))}, r.status)

    def enqueue(self, access_token: str, url: str) -> Result:
        """Never: a shared worker has no table privilege (ADR-16); the run loop
        does not plan an automatic Ask again in shared mode either."""
        return Result("error", None, None, "a shared worker never inserts a request")

    def release(self, access_token: str, job_id: str, worker: str) -> Result:
        return self._request("POST", "/rest/v1/rpc/worker_release_job", {"p_id": job_id, "p_worker": worker}, token=access_token, timeout=RELEASE_TIMEOUT_SECONDS)
