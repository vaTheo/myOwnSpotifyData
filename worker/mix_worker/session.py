"""The sign-in session on disk: one JSON file, mode 0600, refreshed in place."""

from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import time
from urllib.parse import parse_qs, urlsplit
from collections.abc import Callable
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from .server import Result

REFRESH_MARGIN_SECONDS = 60


@dataclass(frozen=True)
class Session:
    email: str
    access_token: str
    refresh_token: str
    expires_at: float


def load(path: Path) -> Session | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    try:
        return Session(
            email=str(data["email"]),
            access_token=str(data["access_token"]),
            refresh_token=str(data["refresh_token"]),
            expires_at=float(data["expires_at"]),
        )
    except (KeyError, TypeError, ValueError):
        return None


def save(path: Path, session: Session) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(asdict(session), f)
    os.replace(tmp, path)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def clear(path: Path) -> None:
    try:
        path.unlink()
    except FileNotFoundError:
        pass


def ensure_fresh(
    session: Session,
    client: Any,
    path: Path,
    now: Callable[[], float] = time.time,
) -> Session | Result | None:
    """The session, refreshed when under the margin.

    Returns the (possibly new) `Session`; `None` when the refresh was refused
    (the file is removed: run `mix-worker login` again); the `Result` when the
    server could not be reached (offline, paused), so the caller reports it.
    """
    if session.expires_at - now() > REFRESH_MARGIN_SECONDS:
        return session
    r = client.refresh(session.refresh_token)
    if r.ok:
        fresh = Session(
            email=session.email,
            access_token=r.value["access_token"],
            refresh_token=r.value["refresh_token"],
            expires_at=now() + float(r.value["expires_in"]),
        )
        save(path, fresh)
        return fresh
    if r.kind == "unauthorized":
        clear(path)
        return None
    return r


# -- the magic link in the PKCE flow (research D8) -----------------------------


def new_verifier() -> str:
    """A PKCE code verifier: 64 URL-safe characters."""
    return secrets.token_urlsafe(48)


def challenge_for(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def code_from_redirect(path: str) -> str | None:
    """The `code` of the link's redirect, or None (an error, another path)."""
    parts = urlsplit(path)
    codes = parse_qs(parts.query).get("code")
    if not codes or not codes[0]:
        return None
    return codes[0]
