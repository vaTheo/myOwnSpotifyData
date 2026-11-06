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
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

PROBE_SECONDS = 12
MIN_PROBE_BYTES = 1000
# A cooldown doubled after each rate limit never grows past this.
MAX_COOLDOWN_SECONDS = 30.0
# Every wait (the pause before a call, a rate-limit pause, a network retry) is
# spread by a random ± this percent, so calls never fall on a fixed rhythm.
JITTER_PERCENT = 40


def spread(seconds: float) -> float:
    """The random part added to a wait of `seconds`: ± `JITTER_PERCENT` %."""
    f = JITTER_PERCENT / 100
    return random.uniform(-f * seconds, f * seconds)  # noqa: S311 - pacing, not crypto
# One recognition (its own retries included) is cut off after this; the
# library's default is aiohttp's 5 minutes, which once stalled a whole set.
PROBE_TIMEOUT_SECONDS = 45.0
# A probe whose call times out or loses the network is tried this many times,
# with NETWORK_WAIT_SECONDS × attempt between tries, then skipped.
NETWORK_ATTEMPTS = 3
NETWORK_WAIT_SECONDS = 10.0
# This many probes skipped in a row for the network fails the request.
NETWORK_SKIPS_IN_A_ROW = 3


class ScanRefused(Exception):
    """The recognition service refused twice (rate limited)."""


class ScanUnreachable(Exception):
    """The recognition service did not answer for several probes in a row."""


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
class ScanOutput:
    """What `run_scan` hands the pipeline: the rows, the second pass's
    summary (`{places, found, stopped}`, or None when it did not run) and the
    stretches still without a track (round 003)."""

    rows: list[dict[str, Any]]
    second_pass: dict[str, Any] | None = None
    gaps: list[tuple[int, int]] = field(default_factory=list)


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


def gap_positions(misses: list[int], step: int, offset: int) -> list[int]:
    """Second-pass starts (D4b): `offset` seconds after each probe that found
    nothing, at most one every `step` seconds, so a long gap is re-heard at
    new places without re-asking for every miss."""
    chosen: list[int] = []
    for t in sorted(misses):
        p = t + offset
        if not chosen or p - chosen[-1] >= step:
            chosen.append(p)
    return chosen


def gaps_of(misses: list[int], hit_times: list[int], step: int) -> list[tuple[int, int]]:
    """The stretches still without a track (round 003): runs of first-pass
    probes that found nothing, each probe covering `step` seconds, split
    wherever a hit (of either pass) fell inside. `[(start, end)]`, seconds."""
    hits = sorted(hit_times)
    gaps: list[tuple[int, int]] = []
    for t in sorted(misses):
        end = t + step
        if any(t <= h < end for h in hits):
            continue
        if gaps and gaps[-1][1] == t:
            gaps[-1] = (gaps[-1][0], end)
        else:
            gaps.append((t, end))
    return gaps


def _details(entry: dict[str, Any]) -> str:
    meta = entry.get("metadata") or {}
    conf = entry.get("confidence")
    return " · ".join(
        x for x in (meta.get("isrc"), meta.get("label"), f"{conf:.0f} %" if isinstance(conf, (int, float)) else None) if x
    )


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
    cut_at: Callable[[int, float], bytes] | None = None,
    gap_step: int = 30,
    gap_offset: int = 7,
    speeds: tuple[float, ...] = (0.96, 1.04),
    hits_out: list[Hit] | None = None,
    report: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Probes at 0, step, 2·step…; one recognition at a time with `cooldown`
    (+ `jitter(cooldown)`) before each. A `rate_limited` error doubles the
    cooldown for the rest of the set (`MAX_COOLDOWN_SECONDS` at most) and
    pauses `pause` × the number of pauses so far, then retries the same probe;
    one more than `max_pauses` raises `ScanRefused`. A `skip` error
    (undecodable probe) is skipped.

    With `cut_at`, a second pass (D4b) re-hears the gaps: at `gap_positions`
    of the probes that found nothing, at normal speed, then at each of
    `speeds` (a track the DJ played faster or slower), stopping at the first
    match. Every hit of both passes is merged into rows, and copied to
    `hits_out` when given (the comment step reads where tracks were heard).
    A refusal or a run of unanswered calls during the second pass stops it
    and keeps every hit so far (research R6). With `report`, fills
    `second_pass` (`{places, found, stopped}`) and `gaps` (the stretches still
    without a track, `[(start, end)]` in seconds)."""
    hits: list[Hit] = []
    misses: list[int] = []
    seen: set[str] = set()
    say = line or (lambda text: None)
    known = duration is not None and duration > 0
    times = probe_times(duration, step) if known else None
    skew = max_skew if max_skew > 0 else None
    pace = {"cooldown": cooldown, "pauses": 0, "net_skips": 0}

    async def ask(data: bytes, where: str) -> Any:
        """One recognition with the pacing and error rules; None when the
        probe is skipped (undecodable, or no answer after the retries)."""
        tries = 0
        while True:
            c = pace["cooldown"]
            await sleep(c + jitter(c))
            try:
                response = await recognise(data, skew)
            except Exception as err:  # classified, never swallowed silently
                kind = classify(err)
                if kind == "skip":
                    say(f"  {where} · skipped (undecodable or silent)")
                    return None
                if kind == "rate_limited":
                    pace["pauses"] += 1
                    n = pace["pauses"]
                    if n > max_pauses:
                        say(f"  {where} · rate limited again · giving up after {max_pauses} pauses")
                        raise ScanRefused() from err
                    pace["cooldown"] = min(max(pace["cooldown"] * 2, 1.0), MAX_COOLDOWN_SECONDS)
                    wait = pause * n
                    wait += jitter(wait)  # every wait gets the same random spread (owner, 2026-11-06)
                    say(
                        f"  {where} · rate limited ({n}/{max_pauses}) · pausing {int(wait)} s,"
                        f" then this probe again · cooldown now {pace['cooldown']:g} s (±{JITTER_PERCENT} %)"
                    )
                    await sleep(wait)
                    continue  # the same probe again, after the pause
                if kind == "network":
                    tries += 1
                    reason = type(err).__name__
                    if tries < NETWORK_ATTEMPTS:
                        wait = NETWORK_WAIT_SECONDS * tries
                        wait += jitter(wait)
                        say(f"  {where} · no answer ({reason}, {tries}/{NETWORK_ATTEMPTS}) · trying again in {int(wait)} s")
                        await sleep(wait)
                        continue
                    pace["net_skips"] += 1
                    if pace["net_skips"] >= NETWORK_SKIPS_IN_A_ROW:
                        say(f"  {where} · no answer ({reason}) · {pace['net_skips']} probes in a row · giving up")
                        raise ScanUnreachable() from err
                    say(f"  {where} · no answer ({reason}) after {NETWORK_ATTEMPTS} tries · probe skipped")
                    return None
                raise
            pace["net_skips"] = 0
            return response

    def record(t: int, entry: dict[str, Any], where: str, speed: float | None = None) -> None:
        if speed is not None:
            # Heard on the second pass: say so, and at which speed (R7).
            entry["origin"] = "replay"
            entry["speed_percent"] = round((speed - 1.0) * 100)
        hits.append(Hit(time=t, entry=entry))
        key = _key(entry)
        mark = "same track" if key in seen else "NEW"
        seen.add(key)
        say(f"  {where} · {mark} · {entry['artist']} — {entry['song_name']} · {_details(entry)}")

    index = 0
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
        response = await ask(data, where)
        entry = track_entry(response, hhmmss(t)) if response is not None else None
        if entry is not None:
            record(t, entry, where)
        else:
            misses.append(t)
            if response is not None:
                say(f"  {where} · no match")
        index += 1

    second = {"places": 0, "found": 0, "stopped": None}
    if cut_at is not None and misses and gap_step > 0:
        positions = gap_positions(misses, gap_step, gap_offset)
        second["places"] = len(positions)
        say(
            f"  second pass · {len(misses)} probes found nothing · {len(positions)} places heard again"
            f" (+{gap_offset} s, speed ×1{''.join(f' then ×{s:g}' for s in speeds)})"
        )
        try:
            for n, p in enumerate(positions, 1):
                for speed in (1.0, *speeds):
                    data = cut_at(p, speed)
                    if len(data) < MIN_PROBE_BYTES:
                        break
                    where = f"gap {n}/{len(positions)} · {hhmmss(p)} ×{speed:g}"
                    response = await ask(data, where)
                    entry = track_entry(response, hhmmss(p)) if response is not None else None
                    if entry is not None:
                        record(p, entry, where, speed)
                        second["found"] += 1
                        break
                    if response is not None:
                        say(f"  {where} · no match")
        except ScanRefused:
            second["stopped"] = "rate limited"
        except ScanUnreachable:
            second["stopped"] = "no answer"
        say(
            f"  second pass · found {second['found']} in {second['places']} places"
            + (f" · stopped early ({second['stopped']}), what was found is kept" if second["stopped"] else "")
        )

    if cut_at is not None and gap_step > 0 and not misses:
        say("  second pass · every probe found a track · nothing to hear again")
    if hits_out is not None:
        hits_out.extend(hits)
    if report is not None:
        report["second_pass"] = second
        report["gaps"] = gaps_of(misses, [h.time for h in hits], step)
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
    extra: dict[str, Any] | None = None,
    max_bytes: int | None = None,
    line: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    """The JSON the app's parser reads (data-model.md "Scan result"), saved
    to disk first (FR-016) and returned as sent. `extra` adds round 003's
    `mix_info` keys (`second_pass`, `gaps`, `clues`); tracks are in set
    order, those without a time (set-wide candidates) last; with `max_bytes`
    clues are dropped until the result fits (logged)."""
    info: dict[str, Any] = {"title": title}
    if artist:
        info["artist"] = artist
    info["audio_filename"] = audio_filename
    info["source_url"] = source_url
    if duration:
        info["duration_seconds"] = int(duration)
    info["date"] = date
    info["track_count"] = len(tracks)
    info.update(extra or {})
    ordered = sorted(tracks, key=lambda t: (t.get("time_in_mix") is None, t.get("time_in_mix") or ""))
    data = {"mix_info": info, "tracks": ordered}
    if max_bytes is not None:
        from .clues import trim

        dropped = trim(data, max_bytes)
        if dropped and line is not None:
            line(f"  write · {dropped} clues left out to stay under {max_bytes} bytes")
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
    speed: float = 1.0,
) -> bytes:
    """`seconds` from `start`, mono 16 kHz WAV, as bytes (D4); the command
    and anything ffmpeg prints go to `line`.

    With `speed` ≠ 1 (second pass, research R2), `seconds × speed` of the set
    is played `speed` times as fast, pitch included, as a DJ's pitch fader
    does, so the probe stays `seconds` long.

    Written to one scratch file beside the audio and read back: on a pipe
    ffmpeg cannot seek back to fill the WAV header's sizes, and the decoder
    then refuses the payload ("unexpected end of file")."""
    scratch = file.with_name(f".probe-{file.stem}.wav")
    cmd = [
        ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "warning", "-y",
        "-ss", str(start), "-t", f"{seconds * speed:g}", "-i", str(file), "-vn",
        *(["-af", f"aresample=16000,asetrate={round(16000 * speed)},aresample=16000"] if speed != 1.0 else []),
        "-ac", "1", "-ar", "16000", "-f", "wav", str(scratch),
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
    if isinstance(err, (TimeoutError, asyncio.TimeoutError, ConnectionError)):
        return "network"
    try:
        from aiohttp import ClientError  # type: ignore[import-not-found]
    except Exception:  # pragma: no cover
        ClientError = None  # type: ignore[assignment]
    if ClientError is not None and isinstance(err, ClientError):
        return "network"
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
) -> "ScanOutput":
    """The pipeline's `scan` seam: builds the Shazam client lazily and runs
    the async scan with the real cutter and sleeps, second pass included."""
    from aiohttp_retry import ExponentialRetry  # type: ignore[import-not-found]
    from shazamio import HTTPClient  # type: ignore[import-not-found]

    ffmpeg = ffmpeg_path(settings.ffmpeg)
    say = line or (lambda text: None)
    say(
        f"  scan · ffmpeg {ffmpeg} · one {settings.probe_seconds} s probe every {settings.probe_step_seconds} s"
        f" · {len(probe_times(duration, settings.probe_step_seconds)) if duration else '?'} probes"
        f" · as {settings.shazam_device} · cooldown {settings.cooldown_seconds} s (±{JITTER_PERCENT} %) · up to {settings.rate_limit_pauses} pauses"
    )

    report: dict[str, Any] = {}

    async def go() -> list[dict[str, Any]]:
        client = HTTPClient(retry_options=ExponentialRetry(attempts=5, max_timeout=60.0))
        shazam = shazam_for(settings.shazam_device, client)
        try:
            async def recognise(data: bytes, max_skew: float | None) -> Any:
                return await asyncio.wait_for(
                    shazam.recognize(data, proxy=settings.proxy, max_skew=max_skew),
                    timeout=PROBE_TIMEOUT_SECONDS,
                )

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
                jitter=spread,
                cut_at=lambda t, speed: cut_probe(ffmpeg, file, t, settings.probe_seconds, say, speed=speed),
                gap_step=getattr(settings, "second_pass_step_seconds", 0),
                gap_offset=getattr(settings, "second_pass_offset_seconds", 7),
                speeds=tuple(getattr(settings, "second_pass_speeds", ())),
                report=report,
            )
        finally:
            # The library only closes a client it created itself; ours is
            # closed here so no connection outlives the scan.
            await shazam.close()
            await client.close()

    rows = asyncio.run(go())
    return ScanOutput(rows=rows, second_pass=report.get("second_pass"), gaps=report.get("gaps", []))
