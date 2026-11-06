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
    from_info,
    from_text,
    names_a_track,
    parse_line,
    read,
    readings,
    split_tracklist,
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
