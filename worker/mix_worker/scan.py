"""The scan: 12-second probes cut by ffmpeg, recognised one at a time with
ShazamIO, merged into one row per run of hits, written in the F15 shape
(research D2–D6). Everything external is injected: `cut`, `recognise`,
`sleep`, `classify`.
"""

from __future__ import annotations

import asyncio
import json
import random
import subprocess
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

PROBE_SECONDS = 12
MIN_PROBE_BYTES = 1000
# A cooldown doubled after each rate limit never grows past this.
MAX_COOLDOWN_SECONDS = 30.0


class ScanRefused(Exception):
    """The recognition service refused twice (rate limited)."""


def hhmmss(seconds: int) -> str:
    h, rest = divmod(int(seconds), 3600)
    m, s = divmod(rest, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def probe_times(duration: int | None, step: int) -> list[int]:
    """Probe starts for a known duration; `[0]` when unknown (the scan then
    continues until a probe comes back short)."""
    if not duration or duration <= 0:
        return [0]
    return list(range(0, int(duration), step))


def confidence_of(match: Any) -> float:
    """The fork's formula from the two skews (D5); 0 when they are missing."""
    if not isinstance(match, dict):
        return 0.0

    def score(key: str) -> float:
        value = match.get(key)
        if not isinstance(value, (int, float)):
            return 0.0
        return 100.0 * (1.0 - min(abs(float(value)), 0.1) / 0.1)

    return 0.6 * score("frequencyskew") + 0.4 * score("timeskew")


def _shazam_link(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    parsed = urlparse(value)
    if parsed.scheme != "https" or parsed.hostname not in ("shazam.com", "www.shazam.com"):
        return None
    return value


def track_entry(response: Any, time_in_mix: str) -> dict[str, Any] | None:
    """One track of the F15 shape from a Shazam answer, or None on no match."""
    if not isinstance(response, dict):
        return None
    matches = response.get("matches")
    track = response.get("track")
    if not isinstance(matches, list) or not matches or not isinstance(track, dict):
        return None
    title = track.get("title")
    artist = track.get("subtitle")
    if not isinstance(title, str) or not title.strip() or not isinstance(artist, str) or not artist.strip():
        return None
    entry: dict[str, Any] = {
        "song_name": title.strip(),
        "artist": artist.strip(),
        "time_in_mix": time_in_mix,
        "confidence": confidence_of(matches[0]),
        "duration": None,
    }
    meta: dict[str, Any] = {}
    if isinstance(track.get("isrc"), str) and track["isrc"]:
        meta["isrc"] = track["isrc"]
    for section in track.get("sections") or []:
        if isinstance(section, dict) and section.get("type") == "SONG":
            for item in section.get("metadata") or []:
                if not isinstance(item, dict):
                    continue
                name, text = item.get("title"), item.get("text")
                if not isinstance(text, str) or not text:
                    continue
                if name == "Album":
                    meta["album"] = text
                elif name == "Label":
                    meta["label"] = text
                elif name == "Released":
                    meta["release_date"] = text
    genres = track.get("genres")
    if isinstance(genres, dict) and isinstance(genres.get("primary"), str):
        meta["genres"] = [genres["primary"]]
    if isinstance(track.get("key"), str) and track["key"]:
        meta["shazam_id"] = track["key"]
    images = track.get("images")
    if isinstance(images, dict) and isinstance(images.get("coverart"), str):
        meta["artwork_url"] = images["coverart"]
    link = _shazam_link(track.get("url"))
    if link:
        meta["links"] = {"shazam": link}
    if meta:
        entry["metadata"] = meta
    return entry


@dataclass(frozen=True)
class Hit:
    time: int
    entry: dict[str, Any]


def _key(entry: dict[str, Any]) -> str:
    meta = entry.get("metadata")
    if isinstance(meta, dict) and isinstance(meta.get("shazam_id"), str):
        return "id:" + meta["shazam_id"]
    return "name:" + entry["artist"].strip().lower() + "|" + entry["song_name"].strip().lower()


def merge(hits: list[Hit], gap: int) -> list[dict[str, Any]]:
    """One row per run of hits of the same track (D5): a hit of the same key
    within `gap` seconds of the row's last hit extends it (best confidence
    kept, start time kept); anything else opens a new row."""
    rows: list[dict[str, Any]] = []
    current_key: str | None = None
    last_time = 0
    for hit in sorted(hits, key=lambda h: h.time):
        key = _key(hit.entry)
        if rows and key == current_key and hit.time - last_time <= gap:
            rows[-1]["confidence"] = max(rows[-1]["confidence"], hit.entry["confidence"])
        else:
            rows.append(dict(hit.entry))
            current_key = key
        last_time = hit.time
    return rows


async def scan(
    duration: int | None,
    *,
    step: int,
    cooldown: float,
    pause: float,
    max_skew: float,
    gap: int,
    recognise: Callable[[bytes, float | None], Awaitable[Any]],
    cut: Callable[[int], bytes],
    sleep: Callable[[float], Awaitable[None]],
    classify: Callable[[Exception], str],
    line: Callable[[str], None] | None = None,
    max_pauses: int = 3,
    jitter: Callable[[float], float] = lambda cooldown: 0.0,
    clock: Callable[[], float] = time.monotonic,
) -> list[dict[str, Any]]:
    """Probes at 0, step, 2·step…; one recognition at a time with `cooldown`
    (+ `jitter(cooldown)`) before each. A `rate_limited` error doubles the
    cooldown for the rest of the set (`MAX_COOLDOWN_SECONDS` at most) and
    pauses `pause` × the number of pauses so far, then retries the same probe;
    one more than `max_pauses` raises `ScanRefused`. A `skip` error
    (undecodable probe) is skipped."""
    hits: list[Hit] = []
    seen: set[str] = set()
    say = line or (lambda text: None)
    known = duration is not None and duration > 0
    times = probe_times(duration, step) if known else None
    skew = max_skew if max_skew > 0 else None
    index = 0
    pauses = 0
    while True:
        if times is not None:
            if index >= len(times):
                break
            t = times[index]
        else:
            t = index * step
        began = clock()
        data = cut(t)
        if len(data) < MIN_PROBE_BYTES:
            break
        where = (
            f"probe {index + 1}/{len(times) if times is not None else '?'} · {hhmmss(t)}"
            f" · cut {len(data) // 1024} KB {clock() - began:.2f} s"
        )
        while True:
            await sleep(cooldown + jitter(cooldown))
            try:
                response = await recognise(data, skew)
            except Exception as err:  # classified, never swallowed silently
                kind = classify(err)
                if kind == "skip":
                    say(f"  {where} · skipped (undecodable or silent)")
                    response = None
                    break
                if kind == "rate_limited":
                    pauses += 1
                    if pauses > max_pauses:
                        say(f"  {where} · rate limited again · giving up after {max_pauses} pauses")
                        raise ScanRefused() from err
                    cooldown = min(max(cooldown * 2, 1.0), MAX_COOLDOWN_SECONDS)
                    wait = pause * pauses
                    say(
                        f"  {where} · rate limited ({pauses}/{max_pauses}) · pausing {int(wait)} s,"
                        f" then this probe again · cooldown now {cooldown:g} s"
                    )
                    await sleep(wait)
                    continue  # the same probe again, after the pause
                raise
            break
        entry = track_entry(response, hhmmss(t)) if response is not None else None
        if entry is not None:
            hits.append(Hit(time=t, entry=entry))
            key = _key(entry)
            meta = entry.get("metadata") or {}
            details = " · ".join(
                x for x in (meta.get("isrc"), meta.get("label"), f"{entry['confidence']:.0f} %") if x
            )
            mark = "same track" if key in seen else "NEW"
            seen.add(key)
            say(f"  {where} · {mark} · {entry['artist']} — {entry['song_name']} · {details}")
        elif response is not None:
            say(f"  {where} · no match")
        index += 1
    return merge(hits, gap)


def write_result(
    path: Path,
    *,
    title: str,
    artist: str | None,
    audio_filename: str,
    source_url: str,
    duration: int | None,
    date: str,
    tracks: list[dict[str, Any]],
) -> dict[str, Any]:
    """The JSON the app's parser reads (data-model.md "Scan result"), saved
    to disk first (FR-016) and returned as sent."""
    info: dict[str, Any] = {"title": title}
    if artist:
        info["artist"] = artist
    info["audio_filename"] = audio_filename
    info["source_url"] = source_url
    if duration:
        info["duration_seconds"] = int(duration)
    info["date"] = date
    info["track_count"] = len(tracks)
    data = {"mix_info": info, "tracks": tracks}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data


# -- the real seams (not exercised by tests) ---------------------------------


def ffmpeg_path(configured: str | None) -> str:
    if configured:
        return configured
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


def cut_probe(
    ffmpeg: str,
    file: Path,
    start: int,
    seconds: int = PROBE_SECONDS,
    line: Callable[[str], None] | None = None,
) -> bytes:
    """`seconds` from `start`, mono 16 kHz WAV, as bytes (D4); the command
    and anything ffmpeg prints go to `line`.

    Written to one scratch file beside the audio and read back: on a pipe
    ffmpeg cannot seek back to fill the WAV header's sizes, and the decoder
    then refuses the payload ("unexpected end of file")."""
    scratch = file.with_name(f".probe-{file.stem}.wav")
    cmd = [
        ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "warning", "-y",
        "-ss", str(start), "-t", str(seconds), "-i", str(file),
        "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", str(scratch),
    ]
    say = line or (lambda text: None)
    done = subprocess.run(cmd, capture_output=True, check=False)
    for message in done.stderr.decode("utf-8", "replace").splitlines():
        if message.strip():
            say(f"    ffmpeg · {message.strip()}")
    try:
        if done.returncode != 0 or not scratch.exists():
            say(f"    ffmpeg · exit {done.returncode} · {' '.join(cmd[-15:])}")
            return b""
        # The size and time of a good cut go on the probe's own line (scan);
        # ffmpeg gets a line here only when it printed something or failed.
        return scratch.read_bytes()
    finally:
        try:
            scratch.unlink()
        except OSError:
            pass


def default_classify(err: Exception) -> str:
    try:
        from shazamio.exceptions import RateLimited  # type: ignore[import-not-found]
    except Exception:  # pragma: no cover - older library layouts
        RateLimited = None  # type: ignore[assignment]
    try:
        from shazamio_core import SignatureError  # type: ignore[import-not-found]
    except Exception:  # pragma: no cover
        SignatureError = None  # type: ignore[assignment]
    if RateLimited is not None and isinstance(err, RateLimited):
        return "rate_limited"
    if SignatureError is not None and isinstance(err, SignatureError):
        return "skip"
    if type(err).__name__ in ("RateLimited",):
        return "rate_limited"
    if type(err).__name__ in ("SignatureError",):
        return "skip"
    return "raise"


def shazam_for(device: str, http_client: Any) -> Any:
    """A `Shazam` that sends recognitions as `device`.

    ShazamIO 0.9.0 hard-codes the iPhone profile in `send_recognize_request_v2`
    (`api.py`); its PR #258 measured 2–4 refusals in 11 calls with it and none
    with Android. The answer's fields the worker reads (title, subtitle, isrc,
    sections, url, key, images) are the same; only the Apple Music link
    differs, and the worker never reads it (research D3).
    """
    import uuid

    from shazamio import Shazam  # type: ignore[import-not-found]

    if device == "iphone":
        return Shazam(http_client=http_client)

    from shazamio.converter import Converter  # type: ignore[import-not-found]
    from shazamio.misc import ShazamUrl  # type: ignore[import-not-found]

    class AndroidShazam(Shazam):  # type: ignore[misc, valid-type]
        def headers(self) -> dict[str, str]:
            base = super().headers()
            base["X-Shazam-Platform"] = "ANDROID"
            base["User-Agent"] = "Dalvik/2.1.0 (Linux; U; Android 14; Pixel 8 Build/AP2A.240805.005)"
            return base

        async def send_recognize_request_v2(self, sig: Any, proxy: str | None = None) -> Any:
            data = Converter.data_search(sig.timezone, sig.signature.uri, sig.signature.samples, sig.timestamp)
            return await self.http_client.request(
                "POST",
                ShazamUrl.SEARCH_FROM_FILE.format(
                    language=self.language,
                    device="android",
                    endpoint_country=self.endpoint_country,
                    uuid_1=str(uuid.uuid4()).upper(),
                    uuid_2=str(uuid.uuid4()).upper(),
                ),
                headers=self.headers(),
                proxy=proxy,
                json=data,
            )

    return AndroidShazam(http_client=http_client)


def run_scan(
    file: Path,
    duration: int | None,
    settings: Any,
    line: Callable[[str], None] | None = None,
) -> list[dict[str, Any]]:
    """The pipeline's `scan` seam: builds the Shazam client lazily and runs
    the async scan with the real cutter and sleeps."""
    from aiohttp_retry import ExponentialRetry  # type: ignore[import-not-found]
    from shazamio import HTTPClient  # type: ignore[import-not-found]

    ffmpeg = ffmpeg_path(settings.ffmpeg)
    say = line or (lambda text: None)
    say(
        f"  scan · ffmpeg {ffmpeg} · one {settings.probe_seconds} s probe every {settings.probe_step_seconds} s"
        f" · {len(probe_times(duration, settings.probe_step_seconds)) if duration else '?'} probes"
        f" · as {settings.shazam_device} · cooldown {settings.cooldown_seconds} s (+0-50 %) · up to {settings.rate_limit_pauses} pauses"
    )

    async def go() -> list[dict[str, Any]]:
        client = HTTPClient(retry_options=ExponentialRetry(attempts=5, max_timeout=60.0))
        shazam = shazam_for(settings.shazam_device, client)
        try:
            async def recognise(data: bytes, max_skew: float | None) -> Any:
                return await shazam.recognize(data, proxy=settings.proxy, max_skew=max_skew)

            return await scan(
                duration,
                step=settings.probe_step_seconds,
                cooldown=settings.cooldown_seconds,
                pause=settings.rate_limit_pause_seconds,
                max_skew=settings.max_skew,
                gap=settings.merge_gap_seconds,
                recognise=recognise,
                cut=lambda t: cut_probe(ffmpeg, file, t, settings.probe_seconds, say),
                sleep=asyncio.sleep,
                classify=default_classify,
                line=say,
                max_pauses=settings.rate_limit_pauses,
                jitter=lambda cooldown: random.uniform(0.0, cooldown / 2),  # noqa: S311 - pacing, not crypto
            )
        finally:
            # The library only closes a client it created itself; ours is
            # closed here so no connection outlives the scan.
            await shazam.close()
            await client.close()

    return asyncio.run(go())
