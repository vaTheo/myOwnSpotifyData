"""The command line (contracts/worker.md "Commands and exit codes").

Everything the commands touch (environment, terminal, clock, the server
client, the queue loop) comes through `CliDeps`, so `tests/test_cli.py` runs
every command without a network, a real home folder or a real ffmpeg.
"""

from __future__ import annotations

import argparse
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.parse
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from . import __version__
from .config import Settings, SettingsError, load_settings, write_template
from .pipeline import Deps, Outcome, run_one
from .server import Result, ServerClient
from .session import Session, challenge_for, clear, code_from_redirect, ensure_fresh, load, new_verifier, save

EXIT_OK = 0
EXIT_OFFLINE = 2
EXIT_PAUSED = 3
EXIT_SIGNED_OUT = 4
EXIT_SETTINGS = 5
EXIT_TEMPLATE = 6
EXIT_INTERRUPTED = 130

NOT_SIGNED_IN = "not signed in — run `mix-worker login`"
# The dev redirect URL every project already allows (ADR-01): the worker
# listens there for the link's code during `login`, nothing to configure.
LINK_HOST, LINK_PORT, LINK_PATH = "127.0.0.1", 5173, "/myOwnSpotifyData/"
LINK_REDIRECT = f"http://{LINK_HOST}:{LINK_PORT}{LINK_PATH}?link=worker"
LINK_TIMEOUT_SECONDS = 600
LINK_PAGE = (
    "<!doctype html><meta charset=utf-8><title>mix-worker</title>"
    "<p style='font:16px system-ui;margin:2em'>mix-worker is signed in. You can close this tab.</p>"
)
NO_RUNTIME = "none (YouTube links need Node or Deno)"


def frozen_dir() -> Path | None:
    """The packaged executable's folder, or None for the command line form."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return None


def code_for(result: Result) -> int:
    return {"offline": EXIT_OFFLINE, "paused": EXIT_PAUSED, "unauthorized": EXIT_SIGNED_OUT}.get(result.kind, EXIT_OFFLINE)


def build_deps(settings: Settings) -> Deps:
    from .download import download as do_download
    from .log import Log
    from .scan import run_scan

    log = Log(settings.log_file)
    return Deps(
        client=ServerClient(settings.supabase_url, settings.supabase_key),
        download=lambda url, dest: do_download(url, dest, settings, line=log.line, max_duration=settings.max_duration_seconds or None),
        scan=lambda path, duration: run_scan(path, duration, settings, line=log.line),
        log=log,
    )


def wait_for_code(redirect_to: str, timeout: float) -> str | None:
    """Serves one local page at the redirect address and returns the `code`
    the magic link brings, or None after `timeout` seconds. Raises OSError
    when the port is taken (the app's dev server, for instance)."""
    import http.server
    import socketserver

    parts = urllib.parse.urlsplit(redirect_to)
    found: dict[str, str] = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802 - http.server's name
            code = code_from_redirect(self.path)
            body = LINK_PAGE if code else "<!doctype html><p>No sign-in code in this link. Ask for a new one in the terminal.</p>"
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(body.encode("utf-8"))
            if code:
                found["code"] = code

        def log_message(self, *args: Any) -> None:  # quiet
            return

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer((parts.hostname or LINK_HOST, parts.port or 80), Handler) as server:
        server.timeout = 1.0
        deadline = time.monotonic() + timeout
        while "code" not in found and time.monotonic() < deadline:
            server.handle_request()
    return found.get("code")


def ffmpeg_version(configured: str | None) -> str | None:
    """The version token of the ffmpeg the worker will use, or None when it
    cannot start (the packaged one when `configured` is None)."""
    from .scan import ffmpeg_path

    try:
        path = ffmpeg_path(configured)
        done = subprocess.run([path, "-version"], capture_output=True, text=True, timeout=20, check=False)
    except (OSError, subprocess.SubprocessError, ImportError):
        return None
    if done.returncode != 0:
        return None
    first = (done.stdout or "").splitlines()[0] if done.stdout else ""
    parts = first.split()
    return parts[2] if len(parts) >= 3 and parts[1] == "version" else (first or "unknown")


@dataclass
class CliDeps:
    env: Mapping[str, str] = field(default_factory=lambda: os.environ)
    home: Path = field(default_factory=Path.home)
    platform: str = sys.platform
    hostname: Callable[[], str] = socket.gethostname
    frozen_dir: Path | None = field(default_factory=frozen_dir)
    read: Callable[[str], str] = input
    out: Callable[[str], None] = print
    client_factory: Callable[[str, str], Any] = ServerClient
    run_queue: Callable[..., int] = None  # type: ignore[assignment]  # set below
    build_deps: Callable[[Settings], Deps] = build_deps
    ffmpeg_version: Callable[[str | None], str | None] = ffmpeg_version
    which: Callable[[str], str | None] = shutil.which
    now: Callable[[], float] = time.time
    wait_for_code: Callable[[str, float], str | None] = wait_for_code

    def __post_init__(self) -> None:
        if self.run_queue is None:
            self.run_queue = run_queue


def run_queue(settings: Settings, deps: Deps, session: Session, *, once: bool, interval: int, sleep: Any = time.sleep) -> int:
    """Claims and processes requests until the queue is empty (`once`) or
    forever (`--watch`), with the exit codes of the contract."""
    log = deps.log
    client = deps.client
    log.line(f"mix-worker {__version__} · {settings.supabase_url} · as {session.email} · on {settings.worker_name}")
    while True:
        fresh = ensure_fresh(session, client, settings.session_file)
        if fresh is None:
            log.line(NOT_SIGNED_IN)
            return EXIT_SIGNED_OUT
        if isinstance(fresh, Result):
            log.line(f"server: {fresh.message}")
            return code_for(fresh)
        session = fresh
        claimed = client.claim(session.access_token, settings.worker_name, settings.stale_seconds)
        if not claimed.ok:
            log.line(f"server: {claimed.message}")
            return code_for(claimed)
        job = claimed.value
        if job is None:
            if once:
                log.line("queue empty")
                return EXIT_OK
            try:
                sleep(interval)
            except KeyboardInterrupt:
                log.line("stopped")
                return EXIT_INTERRUPTED
            continue
        job_id = str(job.get("id", ""))
        payload = job.get("payload")
        url = payload.get("url") if isinstance(payload, dict) else None
        log.line(f"claimed {job_id[:8]} · {url}")
        try:
            outcome: Outcome = run_one(job, settings, session.access_token, deps)
        except KeyboardInterrupt:
            client.release(session.access_token, job_id, settings.worker_name)
            log.line(f"released {job_id[:8]} · stopped")
            return EXIT_INTERRUPTED
        if outcome.status == "server" and outcome.server is not None:
            log.line(f"server: {outcome.server.message}")
            return code_for(outcome.server)
        log.line(f"{outcome.status} {job_id[:8]}" + (f" · {outcome.reason}" if outcome.reason else ""))


def _masked(key: str) -> str:
    return key[:8] + "…" if len(key) > 8 else "…"


def cmd_check(settings: Settings, config: Path | None, deps: CliDeps) -> int:
    out = deps.out
    out(f"settings file: {config}")
    out(f"server: {settings.supabase_url}")
    out(f"key: {_masked(settings.supabase_key)}")
    out(f"worker name: {settings.worker_name}")
    out(f"session file: {settings.session_file}")
    out(f"work dir: {settings.work_dir}")
    out(f"json dir: {settings.json_dir}")
    out(f"log file: {settings.log_file}")
    out(
        f"probes: one of {settings.probe_seconds} s every {settings.probe_step_seconds} s · cooldown {settings.cooldown_seconds} s"
        f" · {settings.rate_limit_pauses} rate-limit pauses of {settings.rate_limit_pause_seconds:g} s × n"
        f" · merge gap {settings.merge_gap_seconds} s · max skew {settings.max_skew}"
    )
    out(f"stale after: {settings.stale_seconds} s · poll: {settings.poll_seconds} s · max set: {settings.max_duration_seconds or 'no limit'}")
    version = deps.ffmpeg_version(settings.ffmpeg)
    if version is None:
        if settings.ffmpeg:
            out(f"ffmpeg: cannot start {settings.ffmpeg} — setting WORKER_FFMPEG; unset it to use the packaged ffmpeg")
        else:
            out("ffmpeg: the packaged ffmpeg cannot start — set WORKER_FFMPEG to another ffmpeg")
        return EXIT_SETTINGS
    out(f"ffmpeg: packaged ({version})" if not settings.ffmpeg else f"ffmpeg: {settings.ffmpeg} ({version})")
    runtime = next((name for name in ("node", "deno") if deps.which(name)), None)
    out(f"JavaScript runtime: {runtime} found" if runtime else f"JavaScript runtime: {NO_RUNTIME}")
    session = load(settings.session_file)
    out(f"session: signed in as {session.email}" if session else "session: none")
    return EXIT_OK


def _save_session(settings: Settings, deps: CliDeps, email: str, triple: dict[str, Any]) -> int:
    session = Session(
        email=email,
        access_token=triple["access_token"],
        refresh_token=triple["refresh_token"],
        expires_at=deps.now() + float(triple["expires_in"]),
    )
    save(settings.session_file, session)
    deps.out(f"signed in as {email} · session kept at {settings.session_file}")
    return EXIT_OK


def cmd_login(settings: Settings, client: Any, deps: CliDeps, *, by_code: bool = False) -> int:
    """Default: the magic link of the app, caught on the local dev address
    (no template change, no SMTP). `--code`: the six-digit code typed here,
    for a project whose Magic Link template carries `{{ .Token }}`."""
    out = deps.out
    existing = load(settings.session_file)
    if existing is not None:
        out(f"already signed in as {existing.email} (run `mix-worker logout` first to change)")
        return EXIT_OK
    email = deps.read("Email of the server's owner: ").strip()
    if not email:
        out("no email given")
        return EXIT_SIGNED_OUT
    if not by_code:
        return _login_by_link(settings, client, deps, email)
    sent = client.send_otp(email)
    if not sent.ok:
        out(f"could not ask for a code: {sent.message}")
        return code_for(sent) if sent.kind in ("offline", "paused") else EXIT_SIGNED_OUT
    out("A mail with a 6-digit code is on its way (the Magic Link template must carry {{ .Token }}).")
    code = deps.read("The code from the mail: ").strip()
    verified = client.verify(email, code)
    if not verified.ok:
        out(f"code refused: {verified.message}")
        return code_for(verified) if verified.kind in ("offline", "paused") else EXIT_SIGNED_OUT
    return _save_session(settings, deps, email, verified.value)


def _login_by_link(settings: Settings, client: Any, deps: CliDeps, email: str) -> int:
    out = deps.out
    verifier = new_verifier()
    sent = client.request_link(email, LINK_REDIRECT, challenge_for(verifier))
    if not sent.ok:
        out(f"could not ask for a link: {sent.message}")
        return code_for(sent) if sent.kind in ("offline", "paused") else EXIT_SIGNED_OUT
    out(
        "A sign-in mail is on its way. Open it ON THIS COMPUTER and click its link within 10 minutes: "
        f"the link comes back to {LINK_REDIRECT.split('?')[0]} where this program is listening."
    )
    try:
        code = deps.wait_for_code(LINK_REDIRECT, LINK_TIMEOUT_SECONDS)
    except OSError as err:
        out(
            f"could not listen on port {LINK_PORT} ({err}): stop whatever uses it (the app's `yarn dev`, for instance) and run "
            "`mix-worker login` again, or use `mix-worker login --code` if the Magic Link template carries {{ .Token }}"
        )
        return EXIT_SIGNED_OUT
    if code is None:
        out("no link was opened in time; run `mix-worker login` again")
        return EXIT_SIGNED_OUT
    exchanged = client.exchange_code(code, verifier)
    if not exchanged.ok:
        out(f"the link could not be exchanged: {exchanged.message} (open the link on this computer, once, within 10 minutes)")
        return code_for(exchanged) if exchanged.kind in ("offline", "paused") else EXIT_SIGNED_OUT
    return _save_session(settings, deps, email, exchanged.value)


def cmd_logout(settings: Settings, client: Any, deps: CliDeps) -> int:
    session = load(settings.session_file)
    if session is not None:
        client.logout(session.access_token)
    clear(settings.session_file)
    deps.out("signed out")
    return EXIT_OK


def cmd_run(settings: Settings, deps: CliDeps, *, once: bool, interval: int | None) -> int:
    session = load(settings.session_file)
    if session is None:
        deps.out(NOT_SIGNED_IN)
        return EXIT_SIGNED_OUT
    return deps.run_queue(settings, deps.build_deps(settings), session, once=once, interval=interval or settings.poll_seconds)


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="mix-worker", description="Identify the tracks of the sets queued from the phone.", add_help=True)
    p.add_argument("--version", action="store_true", help="print the version and exit")
    p.add_argument("--config", type=Path, default=None, help="settings file (default: worker/.env, or mix-worker.env beside the executable)")
    sub = p.add_subparsers(dest="command")
    sub.add_parser("check", help="print the settings and what is missing; no network")
    login = sub.add_parser("login", help="sign in once per computer: a magic link opened on this computer (default), or a typed code")
    login.add_argument("--code", action="store_true", help="type the 6-digit code from the mail instead (the Magic Link template must carry {{ .Token }})")
    sub.add_parser("logout", help="forget the session on this computer")
    run = sub.add_parser("run", help="process the queue")
    mode = run.add_mutually_exclusive_group()
    mode.add_argument("--once", action="store_true", help="until the queue is empty, then exit (default)")
    mode.add_argument("--watch", action="store_true", help="keep polling until stopped")
    run.add_argument("--interval", type=int, default=None, help="seconds between two looks in --watch mode")
    return p


def main(argv: list[str] | None = None, deps: CliDeps | None = None) -> int:
    deps = deps or CliDeps()
    args = parser().parse_args(argv)
    if args.version:
        deps.out(f"mix-worker {__version__}")
        return EXIT_OK
    frozen = deps.frozen_dir
    config: Path | None = args.config
    if config is None:
        config = frozen / "mix-worker.env" if frozen is not None else Path(__file__).resolve().parent.parent / ".env"
    if frozen is not None and args.config is None and not config.exists():
        write_template(config)
        deps.out(f"Wrote the settings template to {config}. Fill SUPABASE_URL and SUPABASE_KEY, then start again.")
        return EXIT_TEMPLATE
    try:
        settings = load_settings(
            config,
            deps.env,
            hostname=deps.hostname,
            home=deps.home,
            platform=deps.platform,
            frozen_dir=frozen,
            exists=lambda p: p.exists(),
        )
    except SettingsError as err:
        deps.out(f"setting {err.setting}: {err.message} (file: {config})")
        return EXIT_SETTINGS
    client = deps.client_factory(settings.supabase_url, settings.supabase_key)
    if args.command == "check":
        return cmd_check(settings, config, deps)
    if args.command == "login":
        return cmd_login(settings, client, deps, by_code=args.code)
    if args.command == "logout":
        return cmd_logout(settings, client, deps)
    if args.command == "run":
        return cmd_run(settings, deps, once=not args.watch, interval=args.interval)
    # No command: the double-click. Sign in when needed, then watch.
    if load(settings.session_file) is None:
        code = cmd_login(settings, client, deps)
        if code != EXIT_OK:
            return code
    return cmd_run(settings, deps, once=False, interval=None)


if __name__ == "__main__":
    sys.exit(main())
