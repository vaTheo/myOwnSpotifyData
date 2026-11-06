"""The command line (contracts/worker.md "Commands and exit codes")."""

from __future__ import annotations

import argparse
import os
import socket
import sys
import time
from pathlib import Path
from typing import Any

from . import __version__
from .config import Settings, SettingsError, load_settings
from .pipeline import Deps, Outcome, run_one
from .server import Result, ServerClient
from .session import Session, ensure_fresh, load, save

EXIT_OK = 0
EXIT_OFFLINE = 2
EXIT_PAUSED = 3
EXIT_SIGNED_OUT = 4
EXIT_SETTINGS = 5
EXIT_TEMPLATE = 6
EXIT_INTERRUPTED = 130

NOT_SIGNED_IN = "not signed in — run `mix-worker login`"


def frozen_dir() -> Path | None:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return None


def default_config_path() -> Path | None:
    folder = frozen_dir()
    if folder is not None:
        return folder / "mix-worker.env"
    here = Path(__file__).resolve().parent.parent / ".env"
    return here


def settings_from(config: Path | None) -> Settings:
    return load_settings(
        config,
        os.environ,
        hostname=socket.gethostname,
        home=Path.home(),
        platform=sys.platform,
        frozen_dir=frozen_dir(),
        exists=lambda p: p.exists(),
    )


def code_for(result: Result) -> int:
    return {"offline": EXIT_OFFLINE, "paused": EXIT_PAUSED, "unauthorized": EXIT_SIGNED_OUT}.get(result.kind, EXIT_OFFLINE)


def build_deps(settings: Settings) -> Deps:
    from .download import download as do_download
    from .log import Log
    from .scan import run_scan

    return Deps(
        client=ServerClient(settings.supabase_url, settings.supabase_key),
        download=lambda url, dest: do_download(url, dest, settings),
        scan=lambda path, duration: run_scan(path, duration, settings),
        log=Log(settings.log_file),
    )


def run_queue(settings: Settings, deps: Deps, session: Session, *, once: bool, interval: int, sleep: Any = time.sleep) -> int:
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
        url = job.get("payload", {}).get("url") if isinstance(job.get("payload"), dict) else None
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


def cmd_login(settings: Settings, client: ServerClient, read: Any = input, out: Any = print) -> int:
    existing = load(settings.session_file)
    if existing is not None:
        out(f"already signed in as {existing.email} (run `mix-worker logout` first to change)")
        return EXIT_OK
    email = read("Email of the server's owner: ").strip()
    if not email:
        out("no email given")
        return EXIT_SIGNED_OUT
    sent = client.send_otp(email)
    if not sent.ok:
        out(f"could not ask for a code: {sent.message}")
        return code_for(sent) if sent.kind in ("offline", "paused") else EXIT_SIGNED_OUT
    code = read("The 6-digit code from the mail: ").strip()
    verified = client.verify(email, code)
    if not verified.ok:
        out(f"code refused: {verified.message}")
        return code_for(verified) if verified.kind in ("offline", "paused") else EXIT_SIGNED_OUT
    session = Session(
        email=email,
        access_token=verified.value["access_token"],
        refresh_token=verified.value["refresh_token"],
        expires_at=time.time() + float(verified.value["expires_in"]),
    )
    save(settings.session_file, session)
    out(f"signed in as {email} · session kept at {settings.session_file}")
    return EXIT_OK


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="mix-worker", description="Identify the tracks of the sets queued from the phone.")
    p.add_argument("--version", action="version", version=f"mix-worker {__version__}")
    p.add_argument("--config", type=Path, default=None, help="settings file (default: worker/.env, or mix-worker.env beside the executable)")
    sub = p.add_subparsers(dest="command")
    sub.add_parser("login", help="sign in with an email code, once per computer")
    run = sub.add_parser("run", help="process the queue")
    mode = run.add_mutually_exclusive_group()
    mode.add_argument("--once", action="store_true", help="until the queue is empty, then exit (default)")
    mode.add_argument("--watch", action="store_true", help="keep polling until stopped")
    run.add_argument("--interval", type=int, default=None, help="seconds between two looks in --watch mode")
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    config = args.config or default_config_path()
    try:
        settings = settings_from(config)
    except SettingsError as err:
        print(f"setting {err.setting}: {err.message} (file: {config})", file=sys.stderr)
        return EXIT_SETTINGS
    client = ServerClient(settings.supabase_url, settings.supabase_key)
    if args.command == "login":
        return cmd_login(settings, client)
    if args.command == "run":
        session = load(settings.session_file)
        if session is None:
            print(NOT_SIGNED_IN, file=sys.stderr)
            return EXIT_SIGNED_OUT
        deps = build_deps(settings)
        return run_queue(settings, deps, session, once=not args.watch, interval=args.interval or settings.poll_seconds)
    parser().print_help()
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
