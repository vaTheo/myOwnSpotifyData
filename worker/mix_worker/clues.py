"""Clues around the gaps (round 003): the set's description, chapters and
comments, read through yt-dlp; parsed into track lines without assuming any
separator; attached to the stretches the audio left empty; and, for a clue
that reads as one "Artist – Title", confirmed by exact equality in Deezer,
then MusicBrainz (or read by id from a Discogs or Deezer link).

Everything external is injected: `ydl_factory`, `fetch_json`, `sleep`.
A name lookup is the constitution's one exception to "never by name"
(Principle IV, ADR-10): only for a clue that carries no identifier, accepted
only on equality (`match.py`), and always marked as coming from a clue.
"""

from __future__ import annotations

import json
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from .match import artist_matches, normalize, title_matches

TEXT_MAX = 1000
HEARTBEAT_SECONDS = 15  # a "still reading" line this often, so a slow page never looks stalled
GAP_CLUES_MAX = 30
SET_CLUES_MAX = 200
MARGIN_SECONDS = 30
TRACKLIST_MIN = 3
DESCRIPTION_MIN_RUN = 5  # the app's MIX_DESCRIPTION_MIN_RUN: prose is never read as tracks
PACE = {"deezer": 0.2, "musicbrainz": 1.1, "discogs": 2.5}
BUSY_WAITS = (2.0, 4.0)  # after a 503/429, then the clue is given up
FETCH_TIMEOUT = 15

# -- one line: the app's rules (src/features/mix/parse.ts) ---------------------

_CLOCK = r"\d{1,3}[:.]\d{1,2}(?:[:.]\d{1,2})?(?:\.\d+)?"
_PARSE_CLOCK = re.compile(r"^(\d{1,3})[:.](\d{1,2})(?:([:.])(\d{1,2}))?(?:\.\d+)?$")
_PREFIX_BRACKET_CLOCK = re.compile(rf"^[\[(]\s*({_CLOCK})\s*[\])]\s*:?\s*")
_PREFIX_BARE_CLOCK = re.compile(rf"^({_CLOCK})\s+")
_PREFIX_INDEX = re.compile(r"^\d{1,3}[.)]\s+")
_PREFIX_SIDE = re.compile(r"^[a-dA-D]\d{1,2}[.)]\s+")
_PREFIX_BRACKET_MIN = re.compile(r"^\[(\d{1,3})\]\s*")
_DASH_SPLIT = re.compile(r"^(.*?)\s+[-–—]\s+(.*)$", re.S)
_TRAILING_LABEL = re.compile(r"\s*\[([^\]]+)\]\s*$")


def parse_clock(s: str) -> int | None:
    m = _PARSE_CLOCK.match(s.strip())
    if not m:
        return None
    a, b = int(m.group(1)), int(m.group(2))
    if m.group(3) is not None and m.group(4) is not None:
        return a * 3600 + b * 60 + int(m.group(4))
    return a * 60 + b


def _strip_prefix(line: str) -> tuple[str, int | None]:
    for rx, kind in (
        (_PREFIX_BRACKET_CLOCK, "clock"),
        (_PREFIX_BARE_CLOCK, "clock"),
        (_PREFIX_INDEX, None),
        (_PREFIX_SIDE, None),
        (_PREFIX_BRACKET_MIN, "minutes"),
    ):
        m = rx.match(line)
        if m:
            at = parse_clock(m.group(1)) if kind == "clock" else int(m.group(1)) * 60 if kind == "minutes" else None
            return line[m.end():], at
    return line, None


@dataclass(frozen=True)
class Line:
    artist: str
    title: str
    label: str | None = None
    at: int | None = None


def parse_line(line: str) -> Line | None:
    """One `Artist – Title` line, the app's shapes (clock, index, side and
    `[n]` prefixes; ` - `/` – `/` — `; a trailing `[Label]`), or None."""
    rest, at = _strip_prefix(line.strip())
    m = _DASH_SPLIT.match(rest)
    if not m:
        return None
    artist, title = m.group(1).strip(), m.group(2).strip()
    label = None
    lm = _TRAILING_LABEL.search(title)
    if lm:
        label = lm.group(1).strip()
        title = title[: lm.start()].strip()
    if not artist or not title:
        return None
    return Line(artist=artist, title=title, label=label, at=at)


_NOT_A_TRACK = {"", "id", "unreleased", "unknown", "tba", "tbc", "untitled", "id id", "dub", "unreleased id"}


def names_a_track(line: Line) -> bool:
    """False for `???`, `ID`, `Unreleased`…: kept as text, never looked up."""
    return normalize(line.title) not in _NOT_A_TRACK and normalize(line.artist) not in _NOT_A_TRACK


# -- a whole tracklist in one text, whatever the separator (research R4) ------

_TRACKLIST_WORD = re.compile(r"^\s*(?:track\s*-?\s*list(?:ing)?|tl)\s*[:\-–—]?\s*", re.I)
_SEPARATORS = ["\n", "//", " / ", " | ", "|", "•", "·", ";", ","]
_ITEM_STARTS = [
    re.compile(rf"(?:(?<=\s)|^)(?=[\[(]?{_CLOCK}[\])]?\s)"),  # a clock before each track
    re.compile(r"(?:(?<=\s)|^)(?=\d{1,3}[.)]\s)"),  # 1. 2. 3. / 1) 2) 3)
]


def split_tracklist(text: str) -> list[str] | None:
    """The pieces of a tracklist written in one text, or None when it is not
    one: every separator and item start is tried, the split with the most
    pieces reading as `Artist – Title` wins (at least `TRACKLIST_MIN`, and
    two thirds of the pieces), fewer pieces on a tie. No separator is assumed."""
    body = _TRACKLIST_WORD.sub("", text.strip(), count=1)
    splits: list[list[str]] = []
    for sep in _SEPARATORS:
        if sep in body:
            splits.append(body.split(sep))
    for rx in _ITEM_STARTS:
        parts = rx.split(body)
        if len(parts) > 1:
            splits.append(parts)
    best: tuple[int, int, list[str]] | None = None
    for parts in splits:
        pieces = [p.strip() for p in parts if p.strip()]
        good = sum(1 for p in pieces if parse_line(p) is not None)
        if good < TRACKLIST_MIN or good * 3 < len(pieces) * 2:
            continue
        if best is None or good > best[0] or (good == best[0] and len(pieces) < best[1]):
            best = (good, len(pieces), pieces)
    return best[2] if best else None


# -- clues --------------------------------------------------------------------


@dataclass
class Clue:
    at: float | None  # seconds into the set; None for a set-wide line
    author: str
    text: str
    kind: str  # "comment" | "chapter" | "description"
    line: Line | None = None  # the track it names, when it reads as one
    # A line of a tracklist (the description's, or a comment listing 3+
    # tracks): it becomes a row even when no catalogue knows it (owner,
    # 2026-11-06); a single comment answer still needs a catalogue match.
    listed: bool = False

    def as_json(self) -> dict[str, Any]:
        return {"at": None if self.at is None else round(float(self.at), 1), "author": self.author, "text": self.text, "kind": self.kind}


_MENTION = re.compile(r"^\s*@[^\s:]+:?\s+")
_LEAD_CLOCK = re.compile(rf"^\s*[\[(]?({_CLOCK})[\])]?\s")


def _cut(text: str) -> str:
    text = text.strip()
    return text if len(text) <= TEXT_MAX else text[: TEXT_MAX - 1] + "…"


def from_text(text: str, at: float | None, author: str, kind: str) -> list[Clue]:
    """One comment or chapter: a whole tracklist (set-wide lines, each with
    its own clock if any), or one clue at `at`, naming a track when its text
    (after a reply mention) is one `Artist – Title`."""
    body = _MENTION.sub("", text or "", count=1).strip()
    if not body:
        return []
    pieces = split_tracklist(body)
    if pieces is not None:
        out = []
        for piece in pieces:
            ln = parse_line(piece)
            out.append(Clue(at=ln.at if ln else None, author=author, text=_cut(piece), kind=kind, line=ln, listed=True))
        return out
    ln = parse_line(body)
    if ln is not None and ln.at is not None and at is None:
        at = ln.at  # a YouTube comment "12:34 Artist - Title"
    elif at is None:
        m = _LEAD_CLOCK.match(body)
        if m:
            at = parse_clock(m.group(1))
    return [Clue(at=at, author=author, text=_cut(body), kind=kind, line=ln)]


def from_description(text: str, author: str) -> list[Clue]:
    """Runs of at least `DESCRIPTION_MIN_RUN` track lines (the app's guard);
    a line with a clock is placed at it, the others are set-wide. Failing
    that, a one-paragraph tracklist (any separator)."""
    out: list[Clue] = []
    run: list[Clue] = []

    def flush() -> None:
        if len(run) >= DESCRIPTION_MIN_RUN:
            out.extend(run)
        run.clear()

    for raw in (text or "").splitlines():
        line = raw.strip()
        if not line:
            continue
        ln = parse_line(line)
        if ln is None:
            flush()
            continue
        run.append(Clue(at=ln.at, author=author, text=_cut(line), kind="description", line=ln, listed=True))
    flush()
    if out:
        return out
    for para in re.split(r"\n\s*\n", text or ""):
        pieces = split_tracklist(para)
        if pieces:
            for piece in pieces:
                ln = parse_line(piece)
                out.append(Clue(at=ln.at if ln else None, author=author, text=_cut(piece), kind="description", line=ln, listed=True))
    return out


def from_info(info: dict[str, Any]) -> list[Clue]:
    """Every clue of a yt-dlp info dict: description, chapters, comments."""
    uploader = str(info.get("uploader") or "uploader")
    clues = from_description(str(info.get("description") or ""), uploader)
    for ch in info.get("chapters") or []:
        if isinstance(ch, dict) and isinstance(ch.get("title"), str):
            at = ch.get("start_time") if isinstance(ch.get("start_time"), (int, float)) else None
            ln = parse_line(ch["title"])
            clues.append(Clue(at=at, author=uploader, text=_cut(ch["title"]), kind="chapter", line=ln))
    for c in info.get("comments") or []:
        if not isinstance(c, dict) or not isinstance(c.get("text"), str):
            continue
        at = c.get("start_time") if isinstance(c.get("start_time"), (int, float)) else None
        clues.extend(from_text(c["text"], at, str(c.get("author") or "someone"), "comment"))
    return clues


def read(
    url: str,
    *,
    ydl_factory: Callable[[dict[str, Any]], Any],
    timeout: float,
    line: Callable[[str], None],
) -> list[Clue] | None:
    """One `extract_info` without download, comments included, in a thread
    joined after `timeout` seconds (research R3); None when it failed or ran
    late (one log line), so the request goes on as without clues."""
    box: dict[str, Any] = {}
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "getcomments": True,
        "socket_timeout": 20,
        # YouTube: the 100 newest top-level comments, no replies (owner,
        # 2026-11-06): a popular video's full thread ran past the 90 s limit.
        "extractor_args": {"youtube": {"max_comments": ["100", "100", "0", "0"], "comment_sort": ["new"]}},
    }

    def work() -> None:
        try:
            with ydl_factory(opts) as ydl:
                box["info"] = ydl.extract_info(url, download=False)
        except Exception as err:  # reported below, never fatal
            box["error"] = err

    started = time.monotonic()
    line(f"  clues · reading the description, chapters and comments ({int(timeout)} s at most)")
    worker = threading.Thread(target=work, daemon=True)
    worker.start()
    while worker.is_alive():
        left = timeout - (time.monotonic() - started)
        if left <= 0:
            break
        worker.join(min(HEARTBEAT_SECONDS, left))
        if worker.is_alive() and timeout - (time.monotonic() - started) > 0:
            line(f"  clues · still reading · {int(time.monotonic() - started)} s")
    if worker.is_alive():
        line(f"  clues · dropped after {int(timeout)} s")
        return None
    if "error" in box:
        line(f"  clues · could not read: {type(box['error']).__name__}: {str(box['error'])[:120]}")
        return None
    info = box.get("info")
    if not isinstance(info, dict):
        line("  clues · nothing readable")
        return None
    clues = from_info(info)
    line(f"  clues · {len(clues)} read in {time.monotonic() - started:.1f} s")
    return clues


# -- placing clues on the gaps ------------------------------------------------


@dataclass
class Placed:
    gaps: list[dict[str, Any]] = field(default_factory=list)  # [{start, end, clues: [Clue]}]
    set_wide: list[Clue] = field(default_factory=list)


def attach(clues: list[Clue], gaps: list[tuple[int, int]], margin: int = MARGIN_SECONDS) -> Placed:
    """A clue with a time goes to the gap it falls in (± `margin`), nearest
    first, `GAP_CLUES_MAX` a gap; one at a moment the audio already named is
    dropped. A clue without a time is set-wide (`SET_CLUES_MAX`)."""
    placed = Placed(gaps=[{"start": s, "end": e, "clues": []} for s, e in gaps])
    for clue in clues:
        if clue.at is None:
            if len(placed.set_wide) < SET_CLUES_MAX:
                placed.set_wide.append(clue)
            continue
        for g in placed.gaps:
            if g["start"] - margin <= clue.at < g["end"] + margin:
                g["clues"].append(clue)
                break
    for g in placed.gaps:
        def distance(c: Clue, g: dict[str, Any] = g) -> float:
            assert c.at is not None
            return 0.0 if g["start"] <= c.at < g["end"] else min(abs(c.at - g["start"]), abs(c.at - g["end"]))

        g["clues"] = sorted(sorted(g["clues"], key=lambda c: c.at or 0), key=distance)[:GAP_CLUES_MAX]
        g["clues"].sort(key=lambda c: c.at or 0)
    return placed


# -- name lookups (research R5, R8) -------------------------------------------

USER_AGENT = "myOwnSpotifyData-worker/{version} (https://github.com/vaTheo/myOwnSpotifyData)"
_DISCOGS = re.compile(r"discogs\.com/(?:[^\s/]+/)*(master|release)/(\d+)", re.I)
_DEEZER_TRACK = re.compile(r"deezer\.com/(?:[a-z]{2}/)?track/(\d+)", re.I)
_SENTENCE = re.compile(r"[.!?]\s")
_DISCOGS_SUFFIX = re.compile(r"\s*\(\d+\)$")


@dataclass
class Candidate:
    artist: str
    title: str
    source: str  # "deezer" | "musicbrainz" | "discogs" | "text" (a tracklist line no catalogue holds)
    link: str | None = None
    isrc: str | None = None


def fetch_json(url: str, *, user_agent: str) -> Any:
    """The real seam: one GET, JSON answer, `FETCH_TIMEOUT` seconds."""
    req = urllib.request.Request(url, headers={"User-Agent": user_agent, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT) as res:  # noqa: S310 - fixed https hosts
        return json.loads(res.read().decode("utf-8"))


def readings(line: Line) -> list[tuple[str, str]]:
    """The ways one line may be meant: as written; a two-dash line split at
    its second dash too; a title followed by a sentence cut before it."""
    out = [(line.artist, line.title)]
    m = _DASH_SPLIT.match(line.title)
    if m:
        out.append((f"{line.artist} - {m.group(1).strip()}", m.group(2).strip()))
    s = _SENTENCE.search(line.title)
    if s and s.start() > 0:
        out.append((line.artist, line.title[: s.start()].strip()))
    seen: set[tuple[str, str]] = set()
    return [r for r in out if not (r in seen or seen.add(r))]


class Lookups:
    """Paced name lookups for one set, `budget` clues at most."""

    def __init__(
        self,
        *,
        fetch: Callable[[str], Any],
        sleep: Callable[[float], None],
        line: Callable[[str], None],
        budget: int,
        clock: Callable[[], float] = time.monotonic,
        jitter: Callable[[float], float] = lambda seconds: 0.0,
        this_year: Callable[[], int] = lambda: time.localtime().tm_year,
    ) -> None:
        self.fetch = fetch
        self.this_year = this_year
        self.jitter = jitter
        self.sleep = sleep
        self.say = line
        self.budget = budget
        self.clock = clock
        self.last: dict[str, float] = {}
        self.used = 0

    def _get(self, host: str, url: str) -> Any:
        """One paced call; a 503 or 429 (MusicBrainz answers 503 now and then
        even at 1 call a second, measured 2026-11-06) waits `BUSY_WAITS` and
        tries again; anything else is raised to `candidate`."""
        for attempt in range(len(BUSY_WAITS) + 1):
            wait = PACE[host] - (self.clock() - self.last.get(host, -1e9))
            if wait > 0:
                self.sleep(wait)
            self.last[host] = self.clock()
            try:
                return self.fetch(url)
            except urllib.error.HTTPError as err:
                if err.code not in (429, 503) or attempt == len(BUSY_WAITS):
                    raise
                wait = BUSY_WAITS[attempt]
                self.sleep(wait + self.jitter(wait))
        raise AssertionError("unreachable")

    def _deezer(self, artist: str, title: str) -> Candidate | None:
        q = urllib.parse.urlencode({"q": f"{artist} {title}", "limit": 10})
        data = self._get("deezer", f"https://api.deezer.com/search?{q}")
        for item in (data or {}).get("data") or []:
            name = (item.get("artist") or {}).get("name")
            if isinstance(name, str) and isinstance(item.get("title"), str):
                if artist_matches(artist, name) and title_matches(title, item["title"]):
                    isrc = item.get("isrc") if isinstance(item.get("isrc"), str) else None
                    link = item.get("link") if isinstance(item.get("link"), str) else None
                    return Candidate(artist=name, title=item["title"], source="deezer", link=link, isrc=isrc)
        return None

    def _musicbrainz(self, artist: str, title: str) -> Candidate | None:
        def quoted(s: str) -> str:
            return s.replace("\\", " ").replace('"', " ")

        q = urllib.parse.urlencode(
            {"query": f'artist:"{quoted(artist)}" AND recording:"{quoted(title)}"', "fmt": "json", "limit": 5}
        )
        data = self._get("musicbrainz", f"https://musicbrainz.org/ws/2/recording?{q}")
        for rec in (data or {}).get("recordings") or []:
            names = [c.get("name") for c in rec.get("artist-credit") or [] if isinstance(c, dict)]
            if not isinstance(rec.get("title"), str) or not title_matches(title, rec["title"]):
                continue
            hit = next((n for n in names if isinstance(n, str) and artist_matches(artist, n)), None)
            if hit is None:
                continue
            isrcs = rec.get("isrcs") if isinstance(rec.get("isrcs"), list) else []
            link = f"https://musicbrainz.org/recording/{rec['id']}" if isinstance(rec.get("id"), str) else None
            credit = " & ".join(n for n in names if isinstance(n, str)) or hit
            return Candidate(artist=credit, title=rec["title"], source="musicbrainz", link=link, isrc=isrcs[0] if isrcs else None)
        return None

    def confirm(self, line: Line) -> Candidate | None:
        """Deezer, then MusicBrainz, for each reading of the line; equality only."""
        for artist, title in readings(line):
            if not names_a_track(Line(artist, title)):
                continue
            for source in (self._deezer, self._musicbrainz):
                found = source(artist, title)
                if found is not None:
                    return found
        return None

    def from_link(self, clue: Clue) -> tuple[Candidate | None, str | None]:
        """A Discogs or Deezer link in the clue, read by its id: a candidate
        (a Deezer track; a Discogs release of one track, confirmed by name)
        and/or a text to add to the clue ("Discogs: A – T1 / T2")."""
        m = _DEEZER_TRACK.search(clue.text)
        if m:
            data = self._get("deezer", f"https://api.deezer.com/track/{m.group(1)}")
            name = ((data or {}).get("artist") or {}).get("name")
            if isinstance(name, str) and isinstance((data or {}).get("title"), str):
                return Candidate(artist=name, title=data["title"], source="deezer", link=data.get("link"), isrc=data.get("isrc")), None
            return None, None
        m = _DISCOGS.search(clue.text)
        if not m:
            return None, None
        kind = "masters" if m.group(1).lower() == "master" else "releases"
        data = self._get("discogs", f"https://api.discogs.com/{kind}/{m.group(2)}") or {}
        artists = [_DISCOGS_SUFFIX.sub("", a.get("name", "")) for a in data.get("artists") or [] if isinstance(a, dict)]
        tracks = [t.get("title") for t in data.get("tracklist") or [] if isinstance(t, dict) and t.get("type_", "track") == "track"]
        tracks = [t for t in tracks if isinstance(t, str) and t]
        artist = " & ".join(a for a in artists if a)
        if not artist or not tracks:
            return None, None
        note = f"Discogs: {artist} – {' / '.join(tracks)}"
        if len(tracks) == 1:
            return self.confirm(Line(artist, tracks[0])), note
        return None, note

    def candidate(self, clue: Clue) -> Candidate | None:
        """The candidate a clue proposes, within the budget; errors are one log
        line and no candidate."""
        if self.used >= self.budget:
            return None
        has_link = bool(_DEEZER_TRACK.search(clue.text) or _DISCOGS.search(clue.text))
        if not has_link and (clue.line is None or not names_a_track(clue.line)):
            return None
        self.used += 1
        what = clue.text[:60] if has_link or clue.line is None else f"{clue.line.artist} — {clue.line.title}"
        try:
            if has_link:
                found, note = self.from_link(clue)
                if note:
                    clue.text = _cut(f"{clue.text} ({note})")
            else:
                assert clue.line is not None
                found = self.confirm(clue.line)
        except Exception as err:  # a catalogue down is never fatal
            self.say(f"  lookup {self.used}/{self.budget} · {what} · {type(err).__name__}")
            return None
        if found is None:
            self.say(f"  lookup {self.used}/{self.budget} · {what} · not found as written")
        return found

    def release_year(self, isrc: str) -> tuple[int, str] | None:
        """Round 005: the earliest valid year Deezer and MusicBrainz give for
        an ISRC, with the catalogue that gave it; one lookup of the shared
        budget; None when the budget is spent or no catalogue dates it. An
        unknown ISRC (Deezer's error answer, MusicBrainz's 404) is no year;
        any other failure is raised to `fill_years`."""
        if self.used >= self.budget:
            return None
        self.used += 1
        now = self.this_year()
        quoted = urllib.parse.quote(isrc, safe="")
        found: list[tuple[int, str]] = []
        data = self._get("deezer", f"https://api.deezer.com/track/isrc:{quoted}")
        if isinstance(data, dict) and not data.get("error") and data.get("id") is not None:
            same = data.get("isrc")
            if not isinstance(same, str) or same.upper() == isrc.upper():
                album = data.get("album") if isinstance(data.get("album"), dict) else {}
                for text in (data.get("release_date"), album.get("release_date")):
                    year = valid_year(text, now)
                    if year is not None:
                        found.append((year, "deezer"))
        try:
            data = self._get("musicbrainz", f"https://musicbrainz.org/ws/2/isrc/{quoted}?inc=releases&fmt=json")
        except urllib.error.HTTPError as err:
            if err.code != 404:
                if found:
                    raise PartialYear(min(found, key=lambda f: f[0]), err) from err
                raise
            data = None
        except Exception as err:
            if found:
                raise PartialYear(min(found, key=lambda f: f[0]), err) from err
            raise
        recordings = data.get("recordings") if isinstance(data, dict) else None
        for rec in recordings if isinstance(recordings, list) else []:
            for rel in (rec.get("releases") or []) if isinstance(rec, dict) else []:
                year = valid_year(rel.get("date"), now) if isinstance(rel, dict) else None
                if year is not None:
                    found.append((year, "musicbrainz"))
        # Earliest wins; on a tie Deezer, asked first (min is stable).
        return min(found, key=lambda f: f[0]) if found else None


class PartialYear(Exception):
    """MusicBrainz failed after Deezer gave a year: the year is kept, then
    the year step stops on `cause`."""

    def __init__(self, hit: tuple[int, str], cause: Exception) -> None:
        super().__init__(str(cause))
        self.hit = hit
        self.cause = cause


def valid_year(text: Any, this_year: int) -> int | None:
    """The year of "1993", "1993-05" or "1993-05-17" when it lies in
    1900..`this_year` + 1 (FR-004); None for "0000", garbage or a non-string."""
    if not isinstance(text, str) or len(text) < 4 or not text[:4].isdigit():
        return None
    year = int(text[:4])
    return year if 1900 <= year <= this_year + 1 else None


def _drop_junk_years(tracks: list[dict[str, Any]], this_year: int) -> None:
    """A `release_date` that is not a valid year ("0000", garbage) is removed:
    the JSON never carries a junk year (absent, never junk)."""
    for t in tracks:
        meta = t.get("metadata")
        if isinstance(meta, dict) and "release_date" in meta and valid_year(meta["release_date"], this_year) is None:
            del meta["release_date"]
            meta.pop("release_date_from", None)


def fill_years(tracks: list[dict[str, Any]], lookups: Lookups, line: Callable[[str], None]) -> dict[str, int] | None:
    """Round 005: a year for every heard track (not a clue candidate) with an
    ISRC and no valid `release_date`, from the catalogues by ISRC, written as
    `release_date` "YYYY" and `release_date_from`. Runs after the clues, on
    the same budget. Never raises: a failure stops the step with one log line
    and keeps what was filled (Deezer's year when MusicBrainz then fails). A
    `release_date` still invalid at the end is removed. Returns {"asked", "filled"}, or None when no
    track needed a year."""
    now = lookups.this_year()
    todo = [
        t for t in tracks
        if t.get("origin") != "clue"
        and isinstance(t.get("metadata"), dict)
        and isinstance(t["metadata"].get("isrc"), str)
        and t["metadata"]["isrc"]
        and valid_year(t["metadata"].get("release_date"), now) is None
    ]
    if not todo:
        _drop_junk_years(tracks, now)
        return None
    asked = filled = 0
    known: dict[str, tuple[int, str] | None] = {}
    stopped: str | None = None
    for t in todo:
        isrc = t["metadata"]["isrc"].strip().upper()
        if isrc not in known:
            if lookups.used >= lookups.budget:
                break
            try:
                known[isrc] = lookups.release_year(isrc)
            except PartialYear as err:  # Deezer's year kept, then stop
                known[isrc] = err.hit
                stopped = f"{type(err.cause).__name__}: {str(err.cause)[:120]}"
            except Exception as err:  # a catalogue down never fails the set
                asked += 1
                stopped = f"{type(err).__name__}: {str(err)[:120]}"
                break
        asked += 1
        hit = known[isrc]
        if hit is not None:
            t["metadata"]["release_date"] = f"{hit[0]:04d}"
            t["metadata"]["release_date_from"] = hit[1]
            filled += 1
        if stopped is not None:
            break
    _drop_junk_years(tracks, now)
    if stopped is not None:
        line(f"  years · stopped: {stopped} · filled {filled} of {asked} by ISRC")
    else:
        left = len(todo) - asked
        line(f"  years · filled {filled} of {asked} by ISRC" + (f" · {left} not asked (lookup cap)" if left else ""))
    return {"asked": asked, "filled": filled}


def candidate_track(c: Candidate, clue: Clue, hhmmss: Callable[[int], str]) -> dict[str, Any]:
    """The F15 track for a candidate (data-model.md): no confidence, marked."""
    meta: dict[str, Any] = {}
    if c.isrc:
        meta["isrc"] = c.isrc
    if c.link and c.link.startswith("https://"):
        meta["links"] = {c.source: c.link}
    if c.source == "text" and clue.line is not None and clue.line.label:
        meta["label"] = clue.line.label
    entry: dict[str, Any] = {
        "song_name": c.title,
        "artist": c.artist,
        "time_in_mix": hhmmss(int(clue.at)) if clue.at is not None else None,
        "origin": "clue",
        "clue": clue.as_json(),
        "confirmed_by": c.source if c.source != "text" else None,
    }
    if meta:
        entry["metadata"] = meta
    return entry


# -- the pipeline's step ------------------------------------------------------


@dataclass
class Gathered:
    """What the clue step adds to a result (data-model.md)."""

    gaps: list[dict[str, Any]] = field(default_factory=list)  # [{start, end, clues: [json]}]
    clues: list[dict[str, Any]] = field(default_factory=list)  # set-wide, json
    candidates: list[dict[str, Any]] = field(default_factory=list)  # F15 tracks


def _known(line: Line, rows: list[dict[str, Any]]) -> bool:
    return any(
        artist_matches(line.artist, str(r.get("artist", ""))) and title_matches(line.title, str(r.get("song_name", "")))
        for r in rows
    )


def gather(
    url: str,
    gaps: list[tuple[int, int]],
    rows: list[dict[str, Any]],
    *,
    read_clues: Callable[[str], list[Clue] | None],
    lookups: Lookups | None,
    hhmmss: Callable[[int], str],
    line: Callable[[str], None],
) -> Gathered:
    """Read the clues, place them on the still-empty gaps, and turn the ones
    naming a track not already in the set into candidates (research R3–R8)."""
    clues = read_clues(url)
    if not clues:
        return Gathered(gaps=[{"start": s, "end": e, "clues": []} for s, e in gaps])
    placed = attach(clues, gaps)
    candidates: list[dict[str, Any]] = []
    taken: list[dict[str, Any]] = list(rows)
    if True:  # lookups may be off; tracklist lines still become rows
        for clue in [c for g in placed.gaps for c in g["clues"]] + placed.set_wide:
            if clue.line is not None and _known(clue.line, taken):
                continue
            found = lookups.candidate(clue) if lookups is not None else None
            if found is None and clue.listed and clue.line is not None and names_a_track(clue.line):
                # The tracklist says so: a row as written, no ISRC.
                found = Candidate(artist=clue.line.artist, title=clue.line.title, source="text")
            if found is None:
                continue
            track = candidate_track(found, clue, hhmmss)
            if any(artist_matches(found.artist, str(r.get("artist", ""))) and title_matches(found.title, str(r.get("song_name", ""))) for r in taken):
                continue
            candidates.append(track)
            taken.append(track)
            where = hhmmss(int(clue.at)) if clue.at is not None else "set-wide"
            how = "as written in the tracklist (no catalogue holds it)" if found.source == "text" else found.source
            line(f"  candidate · {where} · {found.artist} — {found.title} · {how}" + (f" · {found.isrc}" if found.isrc else ""))
    on_gaps = sum(len(g["clues"]) for g in placed.gaps)
    line(
        f"  clues · {on_gaps} on gaps · {len(placed.set_wide)} set-wide · {len(candidates)} candidates"
        + (f" · {lookups.used} looked up" if lookups is not None else "")
    )
    return Gathered(
        gaps=[{"start": g["start"], "end": g["end"], "clues": [c.as_json() for c in g["clues"]]} for g in placed.gaps],
        clues=[c.as_json() for c in placed.set_wide],
        candidates=candidates,
    )


def trim(result: dict[str, Any], max_bytes: int) -> int:
    """Drops clues until the result fits `max_bytes`: set-wide ones from the
    end first, then the last clue of the most crowded gap. Returns how many
    were dropped (logged by the caller); tracks are never dropped here."""
    info = result.get("mix_info") or {}
    dropped = 0

    def size() -> int:
        return len(json.dumps(result, ensure_ascii=False).encode("utf-8"))

    while size() > max_bytes:
        if info.get("clues"):
            info["clues"].pop()
        else:
            crowded = max(info.get("gaps") or [], key=lambda g: len(g["clues"]), default=None)
            if crowded is None or not crowded["clues"]:
                break
            crowded["clues"].pop()
        dropped += 1
    return dropped
