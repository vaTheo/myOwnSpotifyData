"""Settings: the one reader of worker/.env, mix-worker.env and the environment.

Pure over its inputs (the file path, a mapping, injected hostname/home/
platform), so tests never touch the real environment (contracts/worker.md).
"""

from __future__ import annotations

import importlib.resources
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path

APP_DIR = "myownspotifydata-worker"


class SettingsError(Exception):
    """A missing or invalid setting; `setting` names it."""

    def __init__(self, setting: str, message: str) -> None:
        super().__init__(f"{setting}: {message}")
        self.setting = setting
        self.message = message


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_key: str
    worker_name: str
    session_file: Path
    work_dir: Path
    json_dir: Path
    log_file: Path
    ffmpeg: str | None
    ytdlp_cookies: Path | None
    proxy: str | None
    stale_seconds: int
    poll_seconds: int
    heartbeat_seconds: int
    max_duration_seconds: int
    probe_step_seconds: int
    probe_seconds: int
    cooldown_seconds: float
    rate_limit_pause_seconds: float
    rate_limit_pauses: int
    shazam_device: str
    max_skew: float
    merge_gap_seconds: int
    result_max_bytes: int
    # Round 003 (gaps): defaults here so a hand-built Settings stays valid.
    second_pass_step_seconds: int = 30
    second_pass_offset_seconds: int = 7
    second_pass_speeds: tuple[float, ...] = (0.96, 1.04)
    clues: bool = True
    clue_seconds: int = 90
    lookups: int = 100
    break_every_calls: int = 0
    cooldown_spread_percent: float = 50.0
    rate_limit_pause_spread_percent: float = 40.0
    break_seconds: float = 120.0


def template_text() -> str:
    """worker/.env.example, shipped inside the package for the executables."""
    return (
        importlib.resources.files("mix_worker")
        .joinpath("env.example")
        .read_text(encoding="utf-8")
    )


def write_template(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(template_text(), encoding="utf-8")


def parse_env_file(text: str) -> dict[str, str]:
    """KEY=VALUE lines; `#` comments (whole line or after the value); quotes.

    An empty value is "unset", so the template's blank lines change nothing.
    """
    out: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if value[:1] in ('"', "'") and len(value) >= 2 and value.endswith(value[0]):
            value = value[1:-1]
        else:
            for marker in (" #", "\t#"):
                if marker in value:
                    value = value.split(marker, 1)[0].rstrip()
            if value.startswith("#"):
                value = ""
        if value:
            out[key] = value
    return out


def _default_paths(
    platform: str, home: Path, env: Mapping[str, str]
) -> tuple[Path, Path, Path]:
    """(session file, work dir, json dir) for the platform."""
    if platform.startswith("win"):
        roaming = Path(env.get("APPDATA") or home / "AppData" / "Roaming")
        local = Path(env.get("LOCALAPPDATA") or home / "AppData" / "Local")
        session = roaming / APP_DIR / "session.json"
        work = local / APP_DIR
    else:
        session = home / ".config" / APP_DIR / "session.json"
        work = home / ".cache" / APP_DIR
    return session, work, home / "Music" / "mix-worker"


def _int(values: Mapping[str, str], name: str, default: int, minimum: int) -> int:
    raw = values.get(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError as err:
        raise SettingsError(name, f"not a whole number: {raw!r}") from err
    if value < minimum:
        raise SettingsError(name, f"must be at least {minimum}")
    return value


def _float(values: Mapping[str, str], name: str, default: float, minimum: float) -> float:
    raw = values.get(name)
    if raw is None:
        return default
    try:
        value = float(raw)
    except ValueError as err:
        raise SettingsError(name, f"not a number: {raw!r}") from err
    if value < minimum:
        raise SettingsError(name, f"must be at least {minimum}")
    return value


def _probe_seconds(values: Mapping[str, str]) -> int:
    value = _int(values, "WORKER_PROBE_SECONDS", 12, 2)
    if value > 12:
        # Shazam answers no match from 15 s up; the library fingerprints 12 s at most.
        raise SettingsError("WORKER_PROBE_SECONDS", "must be at most 12")
    return value


def _speeds(values: Mapping[str, str]) -> tuple[float, ...]:
    raw = values.get("WORKER_SECOND_PASS_SPEEDS")
    if raw is None:
        return (0.96, 1.04)
    out: list[float] = []
    for part in raw.replace(" ", "").split(","):
        if not part:
            continue
        try:
            value = float(part)
        except ValueError as err:
            raise SettingsError("WORKER_SECOND_PASS_SPEEDS", f"not a number: {part!r}") from err
        if not 0.8 <= value <= 1.2:
            raise SettingsError("WORKER_SECOND_PASS_SPEEDS", "each speed must be between 0.8 and 1.2")
        out.append(value)
    return tuple(out)


def _device(values: Mapping[str, str]) -> str:
    value = values.get("WORKER_SHAZAM_DEVICE", "android").strip().lower()
    if value not in ("android", "iphone"):
        raise SettingsError("WORKER_SHAZAM_DEVICE", "must be android or iphone")
    return value


def load_settings(
    path: Path | None,
    env: Mapping[str, str],
    *,
    hostname: Callable[[], str],
    home: Path,
    platform: str,
    frozen_dir: Path | None,
    exists: Callable[[Path], bool],
) -> Settings:
    """The settings from `path` (when it exists) overridden by `env`.

    `frozen_dir` is the packaged executable's folder: a `session.json` there
    wins over the per-user default, so one folder can hold everything.
    """
    values: dict[str, str] = {}
    if path is not None and exists(path):
        values.update(parse_env_file(path.read_text(encoding="utf-8")))
    for key, value in env.items():
        if value:
            values[key] = value

    url = values.get("SUPABASE_URL", "").rstrip("/")
    if not url:
        raise SettingsError("SUPABASE_URL", "not set; the project URL, https://<ref>.supabase.co")
    if not url.startswith("https://"):
        raise SettingsError("SUPABASE_URL", "must start with https://")
    key = values.get("SUPABASE_KEY", "")
    if not key:
        raise SettingsError("SUPABASE_KEY", "not set; the publishable key of the project")

    session_default, work_default, json_default = _default_paths(platform, home, env)
    if frozen_dir is not None and exists(frozen_dir / "session.json"):
        session_default = frozen_dir / "session.json"
    work_dir = Path(values["WORKER_WORK_DIR"]) if values.get("WORKER_WORK_DIR") else work_default
    cookies = values.get("WORKER_YTDLP_COOKIES")

    return Settings(
        supabase_url=url,
        supabase_key=key,
        worker_name=values.get("WORKER_NAME") or hostname(),
        session_file=Path(values["WORKER_SESSION_FILE"]) if values.get("WORKER_SESSION_FILE") else session_default,
        work_dir=work_dir,
        json_dir=Path(values["WORKER_JSON_DIR"]) if values.get("WORKER_JSON_DIR") else json_default,
        log_file=Path(values["WORKER_LOG_FILE"]) if values.get("WORKER_LOG_FILE") else work_dir / "worker.log",
        ffmpeg=values.get("WORKER_FFMPEG") or None,
        ytdlp_cookies=Path(cookies) if cookies else None,
        proxy=values.get("WORKER_PROXY") or None,
        stale_seconds=_int(values, "WORKER_STALE_SECONDS", 21600, 1),
        poll_seconds=_int(values, "WORKER_POLL_SECONDS", 60, 1),
        heartbeat_seconds=_int(values, "WORKER_HEARTBEAT_SECONDS", 30, 1),
        max_duration_seconds=_int(values, "WORKER_MAX_DURATION_SECONDS", 0, 0),
        probe_step_seconds=_int(values, "WORKER_PROBE_STEP_SECONDS", 15, 1),
        probe_seconds=_probe_seconds(values),
        cooldown_seconds=_float(values, "WORKER_COOLDOWN_SECONDS", 2.0, 0.0),
        rate_limit_pause_seconds=_float(values, "WORKER_RATE_LIMIT_PAUSE_SECONDS", 180.0, 0.0),
        rate_limit_pauses=_int(values, "WORKER_RATE_LIMIT_PAUSES", 8, 0),
        shazam_device=_device(values),
        max_skew=_float(values, "WORKER_MAX_SKEW", 0.1, 0.0),
        merge_gap_seconds=_int(values, "WORKER_MERGE_GAP_SECONDS", 180, 1),
        result_max_bytes=_int(values, "WORKER_RESULT_MAX_BYTES", 900000, 1),
        second_pass_step_seconds=_int(values, "WORKER_SECOND_PASS_STEP_SECONDS", 30, 0),
        second_pass_offset_seconds=_int(values, "WORKER_SECOND_PASS_OFFSET_SECONDS", 7, 0),
        second_pass_speeds=_speeds(values),
        clues=_int(values, "WORKER_CLUES", 1, 0) > 0,
        clue_seconds=_int(values, "WORKER_CLUE_SECONDS", 90, 5),
        lookups=_int(values, "WORKER_LOOKUPS", 100, 0),
        break_every_calls=_int(values, "WORKER_BREAK_EVERY_CALLS", 0, 0),
        cooldown_spread_percent=_float(values, "WORKER_COOLDOWN_SPREAD_PERCENT", 50.0, 0.0),
        rate_limit_pause_spread_percent=_float(values, "WORKER_RATE_LIMIT_PAUSE_SPREAD_PERCENT", 40.0, 0.0),
        break_seconds=_float(values, "WORKER_BREAK_SECONDS", 120.0, 0.0),
    )
