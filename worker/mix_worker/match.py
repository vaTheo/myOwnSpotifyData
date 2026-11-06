"""The app's name-equality rules, in Python (round 003, research R5).

Ported from `src/model/normalize.ts` (`normalize`), `src/features/rekordbox-match.ts`
(`cleanTitle`, `artistRuns`) and `src/features/mix/spotifySearch.ts` (`artistCore`,
`sameTitle`). `src/features/mix/match.cases.json` is read by both test suites so the
two copies cannot drift. Equality only: a word of one name is never "the" other name.
"""

from __future__ import annotations

import re
import unicodedata

_FEAT_GROUP = re.compile(r"[(\[]\s*(?:featuring|feat|ft)\b[^)\]]*[)\]]", re.I)
_FEAT_TAIL = re.compile(r"\s+(?:-\s*)?(?:featuring|feat|ft)\b[^(\[]*", re.I)
_GENERIC_GROUP = re.compile(r"[(\[]\s*(?:original mix|extended mix|radio edit|mixed)\s*[)\]]", re.I)
_GENERIC_TAIL = re.compile(r"\s+-\s*(?:original mix|extended mix|radio edit|mixed)\s*$", re.I)
_ARTIST_SPLIT = re.compile(r",|&|\sx\s|\svs\.?\s|\sb2b\s|\bfeaturing\b|\bfeat\b|\bft\b", re.I)
_NAME_PREFIXES = {"the", "dj", "dr", "mr", "mc", "lil"}
_NAME_TAG = re.compile(r"\s*[(\[][^)\]]*[)\]]\s*$")


def normalize(s: str) -> str:
    """NFD, marks dropped, lower case, every run of non letter/digit → one space."""
    decomposed = unicodedata.normalize("NFD", s)
    out: list[str] = []
    space = False
    for ch in decomposed:
        cat = unicodedata.category(ch)
        if cat.startswith("M"):
            continue
        if cat[0] in ("L", "N"):
            out.append(ch.lower())
            space = False
        elif not space:
            out.append(" ")
            space = True
    return "".join(out).strip()


def strip_mix_markers(s: str) -> str:
    s = _GENERIC_GROUP.sub(" ", s).strip()
    s = _GENERIC_TAIL.sub("", s)
    return re.sub(r"\s+", " ", s).strip()


def clean_title(s: str) -> str:
    return normalize(strip_mix_markers(_FEAT_TAIL.sub(" ", _FEAT_GROUP.sub(" ", s))))


def artist_runs(s: str) -> list[str]:
    runs = [s[: m.start()].strip() for m in _ARTIST_SPLIT.finditer(s)]
    return [r for r in [*runs, s.strip()] if r]


def artist_core(name: str) -> str:
    words = normalize(_NAME_TAG.sub("", name)).split(" ")
    while len(words) > 1 and words[0] in _NAME_PREFIXES and not (len(words) == 2 and len(words[1]) == 1):
        words.pop(0)
    return " ".join(words)


def _unspaced(s: str) -> str:
    return re.sub(r"(?<=[^\W\d_]) (?=[^\W\d_])", "", s)


def same_title(a: str, b: str) -> bool:
    return a == b or _unspaced(a) == _unspaced(b)


def artist_matches(written: str, candidate: str) -> bool:
    """A leading run of the written credit is the candidate's artist."""
    cores = {artist_core(r) for r in artist_runs(written)} - {""}
    return artist_core(candidate) in cores


def title_matches(written: str, candidate: str) -> bool:
    """The same title once both are cleaned; a version the written title does
    not name ("(Mentor Original Radio Edit)") is a different title."""
    w = clean_title(written)
    return w != "" and same_title(w, clean_title(candidate))
