import json
import threading
import unittest
from pathlib import Path

from mix_worker.clues import (
    Clue,
    Line,
    Lookups,
    attach,
    candidate_track,
    fill_years,
    from_info,
    from_text,
    names_a_track,
    parse_line,
    read,
    readings,
    split_tracklist,
    valid_year,
)
from mix_worker.scan import hhmmss

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = Path(__file__).resolve().parent / "fixtures" / "clues"
PARSE_CASES = json.loads((ROOT / "src/features/mix/parse.cases.json").read_text(encoding="utf-8"))

WHOMP = [
    "Ina Kacz - Visionary", "Submeditation - Microwave", "Falko Brocksieper - Entropy", "Giorgio & Andreas - Decline",
    "Diadem - Mel", "Marcellino Sanchez - Hula Shake", "Curtis & Dakota - Dancing in the Dark", "Von Riu - Unreleased",
    "Shafunkers - Everyday (Piliavin & Zimbardo Edit)", "Muzo - The Mack (Original Mix)",
    "Stefano Greppi - Danilove - Politics is a jungle", "Sebbo - Never Want Another (Original Mix)",
    "Moth - Deep, Dark and Dirty", "???", "Cloud City (Dano & Halo) - Divebomb",
]


def fixture(name):
    d = json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))
    return {"uploader": "uploader", "description": d["description"], "comments": d["comments"]}


class SharedLineCases(unittest.TestCase):
    """The same file the app's `parse.cases.test.ts` reads."""

    def test_every_case(self):
        for c in PARSE_CASES:
            with self.subTest(line=c["line"]):
                ln = parse_line(c["line"])
                if c["artist"] is None:
                    self.assertIsNone(ln)
                else:
                    self.assertEqual((ln.artist, ln.title, ln.label, ln.at), (c["artist"], c["title"], c["label"], c["startSec"]))


class Lines(unittest.TestCase):
    def test_not_a_track(self):
        for title in ("Unreleased", "ID", "???", "?", "unknown"):
            self.assertFalse(names_a_track(Line("Von Riu", title)))
        self.assertTrue(names_a_track(Line("Lia Catreux", "Crave")))

    def test_readings_two_dashes_and_sentence(self):
        self.assertEqual(
            readings(Line("Stefano Greppi", "Danilove - Politics is a jungle")),
            [("Stefano Greppi", "Danilove - Politics is a jungle"), ("Stefano Greppi - Danilove", "Politics is a jungle")],
        )
        self.assertEqual(readings(Line("The Real", "Mary Mac. Vinyl only")), [("The Real", "Mary Mac. Vinyl only"), ("The Real", "Mary Mac")])

    def test_reply_mentions(self):
        self.assertEqual(from_text("@someone: JALA - Not Surrender", 725.0, "a", "comment")[0].line, Line("JALA", "Not Surrender"))
        self.assertEqual(from_text("@someone The Real - Mary Mac. Vinyl only", 495.0, "a", "comment")[0].line.artist, "The Real")
        self.assertIsNone(from_text("is this Dettmann ? Good intro btw", 242.0, "a", "comment")[0].line)


class SplitSearch(unittest.TestCase):
    """Separators are not standard (owner, 2026-11-06): none is privileged."""

    def expect_whomp(self, text):
        pieces = split_tracklist(text)
        self.assertIsNotNone(pieces, text[:40])
        self.assertEqual([p.split(" ", 1)[1] if p[:1].isdigit() else p for p in pieces], WHOMP)

    def test_as_posted_and_rewritten(self):
        self.expect_whomp("Tracklist: " + "  // ".join(WHOMP))
        self.expect_whomp("\n".join(WHOMP))
        self.expect_whomp(" | ".join(WHOMP))
        self.expect_whomp(" • ".join(WHOMP))
        self.expect_whomp("TL: " + " ; ".join(WHOMP))
        self.expect_whomp(" ".join(f"{i}. {t}" for i, t in enumerate(WHOMP, 1)))

    def test_clocks_as_item_starts_keep_their_times(self):
        text = " ".join(f"{i * 5:02d}:00 {t}" for i, t in enumerate(WHOMP))
        clues = from_text(text, 1651.0, "dj", "comment")
        self.assertEqual(len(clues), 15)
        self.assertEqual([c.at for c in clues[:3]], [0, 300, 600])

    def test_not_tracklists(self):
        self.assertIsNone(split_tracklist("Rouge - Deep Inside / Orbit"))
        self.assertIsNone(split_tracklist("A - B // C - D"))
        self.assertIsNone(split_tracklist("omg - what a drop, so good, wow"))


class ReferenceSets(unittest.TestCase):
    """The owner's five sets (research R8), offline."""

    def named(self, name):
        return [(c.at, c.line.artist, c.line.title) for c in from_info(fixture(name)) if c.line]

    def test_whomp_tracklist_comment_is_set_wide(self):
        clues = [c for c in from_info(fixture("whomp023-mars-o10c")) if c.at is None]
        self.assertEqual([c.text for c in clues], WHOMP)

    def test_vault_reply(self):
        self.assertIn((3092.709, "Space Above", "Leave Home Edit Select Remix"), self.named("vault-sessions-105-tauceti"))

    def test_artaphine_replies(self):
        named = self.named("tauceti-artaphine-series-092")
        self.assertIn((725.051, "JALA", "Not Surrender"), named)
        self.assertIn((242.72, "Rrose", "onceless"), named)

    def test_lot_radio(self):
        clues = from_info(fixture("naone-the-lot-radio-01-11-2025"))
        self.assertIn((495.566, "The Real", "Mary Mac. Vinyl only"), [(c.at, c.line.artist, c.line.title) for c in clues if c.line])
        self.assertTrue(any("discogs.com/master/320251" in c.text and c.at == 2519.088 for c in clues))

    def test_brum_description(self):
        named = self.named("closing-at-nuits-sonores-edition-2025-recording-31-05-2025")
        self.assertEqual(len(named), 31)
        self.assertEqual(named[0], (None, "IPAR", "Temporal Fenestra"))
        self.assertIn((None, "Nigm", "Sunken"), named)

    def test_prose_description_is_not_read(self):
        self.assertEqual([c for c in from_info(fixture("tauceti-artaphine-series-092")) if c.kind == "description"], [])

    def test_youtube_shapes(self):
        clues = from_info({
            "uploader": "dj",
            "description": "",
            "chapters": [{"start_time": 60.0, "title": "Artist - Title"}],
            "comments": [{"text": "12:34 Other - Song", "author": "x"}, {"text": "great", "author": "y"}],
        })
        self.assertEqual([(c.at, c.kind) for c in clues], [(60.0, "chapter"), (754, "comment"), (None, "comment")])


class Attach(unittest.TestCase):
    def test_on_gaps_set_wide_and_dropped(self):
        clues = [Clue(100, "a", "in", "comment"), Clue(195, "a", "margin", "comment"), Clue(500, "a", "elsewhere", "comment"), Clue(None, "dj", "list", "comment")]
        placed = attach(clues, [(60, 180)])
        self.assertEqual([c.text for c in placed.gaps[0]["clues"]], ["in", "margin"])
        self.assertEqual([c.text for c in placed.set_wide], ["list"])

    def test_caps(self):
        clues = [Clue(60 + i, "a", str(i), "comment") for i in range(50)]
        self.assertEqual(len(attach(clues, [(60, 120)]).gaps[0]["clues"]), 30)


class FakeCatalogues:
    """Answers recorded on 2026-11-06 (research R5, R8), trimmed."""

    def __init__(self, fail=False):
        self.urls = []
        self.fail = fail

    def __call__(self, url):
        self.urls.append(url)
        if self.fail:
            raise OSError("down")
        if "api.deezer.com/search" in url:
            if "Space+Above" in url:
                return {"data": [{"artist": {"name": "Space Above"}, "title": "Leave Home (Edit Select Remix)", "isrc": "NLCK41072412", "link": "https://www.deezer.com/track/1"}]}
            if "Rrose" in url:
                return {"data": [{"artist": {"name": "Rrose"}, "title": "Onceless (Original Mix)", "isrc": "DEPL91329165", "link": "https://www.deezer.com/track/2"}]}
            if "Rosie+Gaines" in url:
                return {"data": [{"artist": {"name": "Rosie Gaines"}, "title": "Closer Than Close (Mentor Original Radio Edit)", "isrc": "GBCVW0700091"}]}
            return {"data": []}
        if "musicbrainz.org" in url:
            for artist, title in (("Jala", "Not Surrender"), ("The Real", "Mary Mac"), ("Nigm", "Sunken")):
                low = url.lower()
                if f"%22{artist.replace(' ', '+')}%22".lower() in low and f"%22{title.replace(' ', '+')}%22".lower() in low:
                    return {"recordings": [{"id": "mbid", "title": title, "artist-credit": [{"name": artist}]}]}
            return {"recordings": []}
        if "api.discogs.com/masters/320251" in url:
            return {"artists": [{"name": "Rouge (2)"}], "tracklist": [{"title": "Deep Inside", "type_": "track"}, {"title": "Orbit", "type_": "track"}]}
        raise AssertionError(url)


class Lookup(unittest.TestCase):
    def make(self, fake=None, budget=100):
        self.fake = fake or FakeCatalogues()
        self.sleeps = []
        self.lines = []
        t = [0.0]

        def sleep(s):
            self.sleeps.append(round(s, 2))
            t[0] += s

        return Lookups(fetch=self.fake, sleep=sleep, line=self.lines.append, budget=budget, clock=lambda: t[0])

    def clue(self, text, at=100.0):
        return from_text(text, at, "someone", "comment")[0]

    def test_accepted(self):
        lk = self.make()
        c = lk.candidate(self.clue("@someone: Space Above - Leave Home Edit Select Remix"))
        self.assertEqual((c.artist, c.title, c.source, c.isrc), ("Space Above", "Leave Home (Edit Select Remix)", "deezer", "NLCK41072412"))
        self.assertEqual(lk.candidate(self.clue("Rrose - onceless")).source, "deezer")
        self.assertEqual(lk.candidate(self.clue("@someone: JALA - Not Surrender")).source, "musicbrainz")
        self.assertEqual(lk.candidate(self.clue("@someone The Real - Mary Mac. Vinyl only")).title, "Mary Mac")

    def test_refused(self):
        lk = self.make()
        self.assertIsNone(lk.candidate(self.clue("Rosie Gaines - Closer Than Close")))
        self.assertIsNone(lk.candidate(self.clue("Ina Kacz - Visionary")))
        self.assertIsNone(lk.candidate(self.clue("Von Riu - Unreleased")))
        self.assertIsNone(lk.candidate(self.clue("track id?")))

    def test_musicbrainz_only_after_deezer(self):
        lk = self.make()
        lk.candidate(self.clue("Rrose - onceless"))
        self.assertFalse(any("musicbrainz" in u for u in self.fake.urls))

    def test_discogs_two_tracks_enriches_only(self):
        lk = self.make()
        clue = self.clue("@someone: https://www.discogs.com/master/320251-Rouge-Deep-Inside-Orbit")
        self.assertIsNone(lk.candidate(clue))
        self.assertIn("Discogs: Rouge – Deep Inside / Orbit", clue.text)

    def test_pacing_budget_and_errors(self):
        lk = self.make()
        lk.candidate(self.clue("Ina Kacz - Visionary"))
        lk.candidate(self.clue("Ina Kacz - Visionary"))
        # Second clue: Deezer waits 0.2 s after its last call; MusicBrainz waits
        # the rest of its 1.1 s (0.2 s already passed): the calls stay spaced.
        self.assertEqual(self.sleeps, [0.2, 0.9])
        lk = self.make(budget=1)
        lk.candidate(self.clue("Ina Kacz - Visionary"))
        n = len(self.fake.urls)
        self.assertIsNone(lk.candidate(self.clue("Rrose - onceless")))
        self.assertEqual(len(self.fake.urls), n)
        lk = self.make(FakeCatalogues(fail=True))
        self.assertIsNone(lk.candidate(self.clue("Rrose - onceless")))
        self.assertTrue(any("OSError" in x for x in self.lines))

    def test_candidate_track_shape(self):
        lk = self.make()
        clue = self.clue("@someone: Space Above - Leave Home Edit Select Remix", 3092.709)
        t = candidate_track(lk.candidate(clue), clue, hhmmss)
        self.assertEqual(t["time_in_mix"], "00:51:32")
        self.assertEqual(t["origin"], "clue")
        self.assertNotIn("confidence", t)
        self.assertEqual(t["metadata"], {"isrc": "NLCK41072412", "links": {"deezer": "https://www.deezer.com/track/1"}})
        self.assertEqual(t["clue"]["kind"], "comment")


class Read(unittest.TestCase):
    def factory(self, behaviour):
        class Ydl:
            def __init__(self, opts):
                self.opts = opts

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def extract_info(self, url, download):
                assert download is False and self.opts["getcomments"] is True
                assert self.opts["extractor_args"]["youtube"] == {"max_comments": ["100", "100", "0", "0"], "comment_sort": ["new"]}
                return behaviour()

        return Ydl

    def test_normal(self):
        lines = []
        clues = read("https://x.y/z", ydl_factory=self.factory(lambda: {"description": "", "comments": [{"text": "A - B", "start_time": 5.0}]}), timeout=5, line=lines.append)
        self.assertEqual(len(clues), 1)

    def test_failure_and_timeout(self):
        lines = []

        def boom():
            raise RuntimeError("private")

        self.assertIsNone(read("u", ydl_factory=self.factory(boom), timeout=5, line=lines.append))
        self.assertIn("could not read", lines[-1])
        gate = threading.Event()
        self.assertIsNone(read("u", ydl_factory=self.factory(lambda: gate.wait(5) and {}), timeout=0.05, line=lines.append))
        gate.set()
        self.assertIn("dropped after", lines[-1])


class Gather(unittest.TestCase):
    def test_vault_set_end_to_end_offline(self):
        from mix_worker.clues import gather

        info = fixture("vault-sessions-105-tauceti")
        lines = []
        lk = Lookups(fetch=FakeCatalogues(), sleep=lambda s: None, line=lines.append, budget=100)
        got = gather(
            "https://soundcloud.com/x/y",
            [(3060, 3120)],
            [{"artist": "Someone", "song_name": "Heard"}],
            read_clues=lambda u: from_info(info),
            lookups=lk,
            hhmmss=hhmmss,
            line=lines.append,
        )
        self.assertEqual([(t["artist"], t["time_in_mix"]) for t in got.candidates], [("Space Above", "00:51:32")])
        self.assertTrue(any(c["text"].startswith("great mix! track id?") for c in got.gaps[0]["clues"]))
        self.assertTrue(any("candidate · 00:51:32 · Space Above" in x for x in lines))

    def test_a_track_already_heard_is_not_proposed(self):
        from mix_worker.clues import gather

        got = gather(
            "u",
            [],
            [{"artist": "Rrose", "song_name": "Onceless (Original Mix)"}],
            read_clues=lambda u: [Clue(None, "dj", "Rrose - onceless", "description", Line("Rrose", "onceless"))],
            lookups=Lookups(fetch=FakeCatalogues(), sleep=lambda s: None, line=lambda t: None, budget=100),
            hhmmss=hhmmss,
            line=lambda t: None,
        )
        self.assertEqual(got.candidates, [])

    def test_no_clues(self):
        from mix_worker.clues import gather

        got = gather("u", [(0, 15)], [], read_clues=lambda u: None, lookups=None, hhmmss=hhmmss, line=lambda t: None)
        self.assertEqual((got.candidates, got.clues), ([], []))


class Busy(unittest.TestCase):
    def test_a_503_waits_and_tries_again_then_gives_up(self):
        import urllib.error

        calls = []

        def fetch(url):
            calls.append(url)
            if len(calls) <= 2:
                raise urllib.error.HTTPError(url, 503, "busy", {}, None)
            return {"data": [{"artist": {"name": "Rrose"}, "title": "Onceless (Original Mix)"}]}

        sleeps = []
        lk = Lookups(fetch=fetch, sleep=sleeps.append, line=lambda t: None, budget=5, clock=lambda: 1e6)
        self.assertEqual(lk.candidate(from_text("Rrose - onceless", 1.0, "a", "comment")[0]).title, "Onceless (Original Mix)")
        self.assertEqual([s for s in sleeps if s >= 1], [2.0, 4.0])  # plus the usual 0.2 s pace

        def always(url):
            raise urllib.error.HTTPError(url, 503, "busy", {}, None)

        lines = []
        lk = Lookups(fetch=always, sleep=lambda s: None, line=lines.append, budget=5, clock=lambda: 1e6)
        self.assertIsNone(lk.candidate(from_text("Rrose - onceless", 1.0, "a", "comment")[0]))
        self.assertIn("HTTPError", lines[0])


class TracklistRows(unittest.TestCase):
    """Owner, 2026-11-06: every line of a tracklist becomes a row; a catalogue only adds the ISRC."""

    def test_whomp_tracklist_lines_all_become_rows(self):
        from mix_worker.clues import gather

        lines = []
        got = gather(
            "u", [], [{"artist": "Diadem", "song_name": "Mel"}],  # already heard: skipped
            read_clues=lambda u: from_info(fixture("whomp023-mars-o10c")),
            lookups=Lookups(fetch=FakeCatalogues(), sleep=lambda s: None, line=lines.append, budget=100),
            hhmmss=hhmmss, line=lines.append,
        )
        names = [(t["artist"], t["song_name"]) for t in got.candidates]
        self.assertEqual(len(names), 12)  # 15 pieces − ??? − Unreleased − Diadem (heard)
        self.assertIn(("Ina Kacz", "Visionary"), names)
        self.assertNotIn(("Von Riu", "Unreleased"), names)
        self.assertTrue(all(t["confirmed_by"] is None and t["origin"] == "clue" for t in got.candidates))
        self.assertTrue(any("as written in the tracklist" in x for x in lines))

    def test_a_single_comment_still_needs_a_catalogue(self):
        from mix_worker.clues import gather

        got = gather(
            "u", [(3000, 3200)], [],
            read_clues=lambda u: [Clue(3100.0, "x", "@someone: Ina Kacz - Visionary", "comment", Line("Ina Kacz", "Visionary"))],
            lookups=Lookups(fetch=FakeCatalogues(), sleep=lambda s: None, line=lambda t: None, budget=100),
            hhmmss=hhmmss, line=lambda t: None,
        )
        self.assertEqual(got.candidates, [])

    def test_a_catalogue_match_adds_the_isrc(self):
        from mix_worker.clues import gather

        got = gather(
            "u", [], [],
            read_clues=lambda u: [Clue(None, "dj", "Rrose - onceless", "description", Line("Rrose", "onceless"), listed=True)],
            lookups=Lookups(fetch=FakeCatalogues(), sleep=lambda s: None, line=lambda t: None, budget=100),
            hhmmss=hhmmss, line=lambda t: None,
        )
        self.assertEqual(got.candidates[0]["confirmed_by"], "deezer")
        self.assertEqual(got.candidates[0]["metadata"]["isrc"], "DEPL91329165")

    def test_rows_even_with_lookups_off(self):
        from mix_worker.clues import gather

        got = gather(
            "u", [], [],
            read_clues=lambda u: [Clue(None, "dj", "A - B [Label]", "description", Line("A", "B", "Label"), listed=True)],
            lookups=None, hhmmss=hhmmss, line=lambda t: None,
        )
        self.assertEqual(got.candidates[0]["metadata"], {"label": "Label"})


class YearCatalogues:
    """Deezer and MusicBrainz answers by ISRC (research R2), trimmed."""

    def __init__(self, deezer=None, musicbrainz=None, fail_on=None):
        self.urls = []
        self.deezer = deezer or {}
        self.musicbrainz = musicbrainz or {}
        self.fail_on = fail_on

    def __call__(self, url):
        import urllib.error

        self.urls.append(url)
        if self.fail_on and self.fail_on in url:
            raise OSError("down")
        if url.startswith("https://api.deezer.com/track/isrc:"):
            isrc = url.rsplit(":", 1)[1]
            return self.deezer.get(isrc, {"error": {"type": "DataException", "message": "no data", "code": 800}})
        if url.startswith("https://musicbrainz.org/ws/2/isrc/"):
            isrc = url.split("/isrc/")[1].split("?")[0]
            if isrc not in self.musicbrainz:
                raise urllib.error.HTTPError(url, 404, "Not Found", {}, None)
            return self.musicbrainz[isrc]
        raise AssertionError(url)


def heard(isrc=None, year=None, origin=None):
    meta = {}
    if isrc:
        meta["isrc"] = isrc
    if year is not None:
        meta["release_date"] = year
    t = {"song_name": "T", "artist": "A", "time_in_mix": "00:01:00"}
    if meta:
        t["metadata"] = meta
    if origin:
        t["origin"] = origin
    return t


class Years(unittest.TestCase):
    def lookups(self, fake, budget=100, used=0):
        lk = Lookups(fetch=fake, sleep=lambda s: None, line=lambda t: None, budget=budget, clock=lambda: 1e6, this_year=lambda: 2026)
        lk.used = used
        return lk

    def test_valid_year(self):
        self.assertEqual(valid_year("1993", 2026), 1993)
        self.assertEqual(valid_year("1993-05", 2026), 1993)
        self.assertEqual(valid_year("1993-05-17", 2026), 1993)
        self.assertEqual(valid_year("2027-01-01", 2026), 2027)
        for bad in ("0000", "0000-00-00", "1899", "2028", "abcd", "93", "", None, 1993):
            self.assertIsNone(valid_year(bad, 2026), bad)

    def test_earliest_of_deezer_and_musicbrainz(self):
        fake = YearCatalogues(
            deezer={
                "AAA": {"id": 1, "isrc": "AAA", "release_date": "2004-03-01", "album": {"release_date": "2003-11-10"}},
                "BBB": {"id": 2, "isrc": "BBB", "release_date": "1995-01-01", "album": {"release_date": "0000-00-00"}},
            },
            musicbrainz={
                "AAA": {"recordings": [{"releases": [{"date": "2001-06"}, {"date": ""}, {}]}, {"releases": [{"date": "1999"}]}]},
                "BBB": {"recordings": [{"releases": [{"date": "1996-02-02"}]}]},
            },
        )
        lk = self.lookups(fake)
        self.assertEqual(lk.release_year("AAA"), (1999, "musicbrainz"))
        self.assertEqual(lk.release_year("BBB"), (1995, "deezer"))
        self.assertIsNone(lk.release_year("CCC"))  # Deezer "no data", MusicBrainz 404
        self.assertEqual(lk.used, 3)

    def test_deezer_answer_for_another_isrc_is_ignored(self):
        fake = YearCatalogues(deezer={"AAA": {"id": 1, "isrc": "ZZZ", "release_date": "1990-01-01"}})
        self.assertIsNone(self.lookups(fake).release_year("AAA"))

    def test_fill_writes_year_and_source_only_where_missing(self):
        fake = YearCatalogues(
            deezer={"AAA": {"id": 1, "isrc": "AAA", "release_date": "2004-03-01"}},
            musicbrainz={"AAA": {"recordings": [{"releases": [{"date": "2001"}]}]}},
        )
        tracks = [
            heard("AAA"),
            heard("DATED", "1993"),
            heard(),  # no ISRC
            heard("CLUE", origin="clue"),
            heard("NONE"),
            heard("BAD", "0000"),
        ]
        lines = []
        lk = self.lookups(fake)
        summary = fill_years(tracks, lk, lines.append)
        self.assertEqual(tracks[0]["metadata"], {"isrc": "AAA", "release_date": "2001", "release_date_from": "musicbrainz"})
        self.assertEqual(tracks[1]["metadata"], {"isrc": "DATED", "release_date": "1993"})
        self.assertNotIn("metadata", tracks[2])
        self.assertEqual(tracks[3]["metadata"], {"isrc": "CLUE"})
        self.assertEqual(tracks[4]["metadata"], {"isrc": "NONE"})
        self.assertEqual(tracks[5]["metadata"], {"isrc": "BAD"})  # junk year removed
        asked = {u.split("isrc")[1][1:].split("?")[0] for u in fake.urls}
        self.assertEqual(asked, {"AAA", "NONE", "BAD"})
        self.assertEqual(summary, {"asked": 3, "filled": 1})
        self.assertEqual(lines, ["  years · filled 1 of 3 by ISRC"])

    def test_nothing_to_ask(self):
        fake = YearCatalogues()
        lines = []
        junk = heard(year="0000")  # no ISRC: nothing to ask, the junk year still goes
        self.assertIsNone(fill_years([heard("A", "1993"), heard(), junk], self.lookups(fake), lines.append))
        self.assertNotIn("release_date", junk["metadata"])
        self.assertEqual(fake.urls, [])
        self.assertEqual(lines, [])

    def test_a_failure_stops_the_step_and_keeps_what_was_filled(self):
        fake = YearCatalogues(deezer={"AAA": {"id": 1, "isrc": "AAA", "release_date": "1990"}}, musicbrainz={"AAA": {"recordings": []}}, fail_on="BBB")
        tracks = [heard("AAA"), heard("BBB"), heard("CCC")]
        lines = []
        summary = fill_years(tracks, self.lookups(fake), lines.append)
        self.assertEqual(tracks[0]["metadata"]["release_date"], "1990")
        self.assertNotIn("release_date", tracks[1]["metadata"])
        self.assertFalse(any("CCC" in u for u in fake.urls))
        self.assertEqual(summary, {"asked": 2, "filled": 1})
        self.assertEqual(len(lines), 1)
        self.assertTrue(lines[0].startswith("  years · stopped: OSError"), lines[0])

    def test_the_shared_cap_is_respected(self):
        fake = YearCatalogues(deezer={"AAA": {"id": 1, "isrc": "AAA", "release_date": "1990"}})
        tracks = [heard("AAA"), heard("BBB"), heard("CCC")]
        lines = []
        lk = self.lookups(fake, budget=10, used=9)  # clues spent 9 of 10 first
        summary = fill_years(tracks, lk, lines.append)
        self.assertEqual(lk.used, 10)
        self.assertFalse(any("BBB" in u or "CCC" in u for u in fake.urls))
        self.assertEqual(summary, {"asked": 1, "filled": 1})
        self.assertEqual(lines, ["  years · filled 1 of 1 by ISRC · 2 not asked (lookup cap)"])

    def test_same_isrc_asked_once(self):
        fake = YearCatalogues(deezer={"AAA": {"id": 1, "isrc": "AAA", "release_date": "1990"}})
        tracks = [heard("AAA"), heard("AAA")]
        lk = self.lookups(fake)
        self.assertEqual(fill_years(tracks, lk, lambda t: None), {"asked": 2, "filled": 2})
        self.assertEqual(lk.used, 1)
        self.assertEqual(len(fake.urls), 2)  # one Deezer, one MusicBrainz

    def test_pace_between_catalogues(self):
        fake = YearCatalogues(deezer={"AAA": {"id": 1, "isrc": "AAA", "release_date": "1990"}})
        sleeps = []
        t = [0.0]

        def sleep(s):
            sleeps.append(round(s, 2))
            t[0] += s

        lk = Lookups(fetch=fake, sleep=sleep, line=lambda x: None, budget=10, clock=lambda: t[0], this_year=lambda: 2026)
        fill_years([heard("AAA"), heard("BBB")], lk, lambda x: None)
        self.assertEqual(sleeps, [0.2, 0.9])

    def test_musicbrainz_failing_after_deezer_keeps_deezers_year(self):
        fake = YearCatalogues(deezer={"AAA": {"id": 1, "isrc": "AAA", "release_date": "1990-04-01"}}, fail_on="musicbrainz.org/ws/2/isrc/AAA")
        tracks = [heard("AAA"), heard("BBB", "0000")]
        lines = []
        summary = fill_years(tracks, self.lookups(fake), lines.append)
        self.assertEqual(tracks[0]["metadata"], {"isrc": "AAA", "release_date": "1990", "release_date_from": "deezer"})
        self.assertEqual(tracks[1]["metadata"], {"isrc": "BBB"})  # not asked, junk year removed
        self.assertFalse(any("BBB" in u for u in fake.urls))
        self.assertEqual(summary, {"asked": 1, "filled": 1})
        self.assertEqual(lines, ["  years · stopped: OSError: down · filled 1 of 1 by ISRC"])

    def test_musicbrainz_failing_without_deezer_year_stops_with_nothing(self):
        fake = YearCatalogues(fail_on="musicbrainz.org/ws/2/isrc/AAA")
        tracks = [heard("AAA")]
        lines = []
        self.assertEqual(fill_years(tracks, self.lookups(fake), lines.append), {"asked": 1, "filled": 0})
        self.assertEqual(tracks[0]["metadata"], {"isrc": "AAA"})
        self.assertTrue(lines[0].startswith("  years · stopped: OSError"))
