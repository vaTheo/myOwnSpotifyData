"""The audio of a link, through yt-dlp in-process (research D7).

`bestaudio/best`, no post-processing: the recogniser decodes the native
container, so ffmpeg is used only for the probes. Any link yt-dlp supports is
accepted; no platform is treated specially (FR-015).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .config import Settings

MAX_FILESIZE_BYTES = 2 * 1024**3


@dataclass(frozen=True)
class Downloaded:
    path: Path
    title: str
    uploader: str | None
    duration: int | None


@dataclass(frozen=True)
class DownloadFailure:
    reason: str


def reason_for(message: str) -> str:
    """One line in plain words for the phone (FR-018)."""
    low = message.lower()
    if "private video" in low or "video unavailable" in low or "this video is private" in low:
        return "Private or removed link"
    if "unsupported url" in low:
        return "Unsupported or unreachable link"
    if "does not pass filter" in low or "is_live" in low:
        return "Live streams are not supported"
    if "larger than max-filesize" in low:
        return "Download refused (file too large)"
    first = message.strip().splitlines()[0] if message.strip() else "unknown error"
    return f"Download failed: {first}"


def progress_hook(
    line: Callable[[str], None], first: int = 1, step: int = 5
) -> Callable[[dict[str, Any]], None]:
    """A yt-dlp progress hook: one line at `first` percent, then every `step`
    percent (at the real value when a jump crosses a step), then the end."""
    state = {"next": first}

    def mb(n: Any) -> str:
        return f"{float(n) / 1_048_576:.1f} MB" if isinstance(n, (int, float)) else "? MB"

    def hook(d: dict[str, Any]) -> None:
        status = d.get("status")
        if status == "downloading":
            done = d.get("downloaded_bytes")
            total = d.get("total_bytes") or d.get("total_bytes_estimate")
            if not isinstance(done, (int, float)) or not isinstance(total, (int, float)) or total <= 0:
                return
            percent = int(done * 100 / total)
            if percent < state["next"] or percent >= 100:
                return
            while state["next"] <= percent:
                state["next"] = step if state["next"] < step else state["next"] + step
            speed = d.get("speed")
            eta = d.get("eta")
            extra = ""
            if isinstance(speed, (int, float)) and speed > 0:
                extra += f" · {speed / 1_048_576:.1f} MB/s"
            if isinstance(eta, (int, float)):
                extra += f" · {int(eta)} s left"
            line(f"  download · {percent:3d} % · {mb(done)} of {mb(total)}{extra}")
        elif status == "finished":
            line(f"  download · 100 % · {mb(d.get('downloaded_bytes') or d.get('total_bytes'))}")

    return hook


def ydl_options(dest_dir: Path, settings: Settings, match_filter: Any) -> dict[str, Any]:
    opts: dict[str, Any] = {
        "noplaylist": True,
        "match_filter": match_filter,
        "format": "bestaudio/best",
        "outtmpl": str(dest_dir / "%(id)s.%(ext)s"),
        "max_filesize": MAX_FILESIZE_BYTES,
        "socket_timeout": 30,
        "retries": 3,
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
    }
    if settings.ffmpeg:
        opts["ffmpeg_location"] = settings.ffmpeg
    if settings.ytdlp_cookies is not None:
        opts["cookiefile"] = str(settings.ytdlp_cookies)
    return opts


def _first_text(info: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = info.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def download(
    url: str,
    dest_dir: Path,
    settings: Settings,
    ydl_factory: Callable[[dict[str, Any]], Any] | None = None,
    match_filter: Any = None,
    line: Callable[[str], None] | None = None,
) -> Downloaded | DownloadFailure:
    if ydl_factory is None or match_filter is None:
        import yt_dlp  # imported here so tests never load it
        from yt_dlp.utils import match_filter_func

        ydl_factory = ydl_factory or yt_dlp.YoutubeDL
        match_filter = match_filter or match_filter_func("!is_live")
    dest_dir.mkdir(parents=True, exist_ok=True)
    try:
        opts = ydl_options(dest_dir, settings, match_filter)
        if line is not None:
            opts["progress_hooks"] = [progress_hook(line)]
        with ydl_factory(opts) as ydl:
            info = ydl.extract_info(url, download=True)
    except Exception as err:  # yt_dlp.utils.DownloadError and anything else
        return DownloadFailure(reason_for(str(err)))
    if not isinstance(info, dict):
        return DownloadFailure("Download failed: nothing was downloaded")
    if info.get("_type") == "playlist":
        return DownloadFailure("Playlist links are not supported; paste one set")
    if info.get("is_live"):
        return DownloadFailure("Live streams are not supported")
    downloads = info.get("requested_downloads") or []
    filepath = downloads[0].get("filepath") if downloads and isinstance(downloads[0], dict) else None
    if not filepath:
        return DownloadFailure("Download failed: nothing was downloaded")
    duration = info.get("duration")
    return Downloaded(
        path=Path(filepath),
        title=_first_text(info, "title") or str(info.get("id") or "Identified mix"),
        uploader=_first_text(info, "uploader", "channel", "artist"),
        duration=int(duration) if isinstance(duration, (int, float)) and duration > 0 else None,
    )
