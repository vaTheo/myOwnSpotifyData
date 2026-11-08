"""TrackId.net client (round 016): every call injected, every test offline."""

import json
import unittest
import urllib.parse
from pathlib import Path

from mix_worker import __version__
from mix_worker.trackid import (
    TRACKID_DURATION_TOLERANCE,
    TRACKID_EDGE_SECONDS,
    TRACKID_INTERVAL_SECONDS,
    TRACKID_MIN_CORE_SECONDS,
    TRACKID_SPAN_CAP,
    TRACKID_TIMEOUT_SECONDS,
    Record,
    Span,
    check_of,
    merge_rows,
    span_rows,
    uncovered,
    plan_guides,
    fetch_trackid,
    parse_clock,
    parse_spans,
    trusted,
)

FIX = Path(__file__).parent / "fixtures"
LINK = "https://soundcloud.com/yagathering/temple-rat-pinegrove-2025"
SLUG = "temple-rat-yaga25-off-the-map"
LIST_URL = "https://trackid.net/api/public/audiostreams?url=" + urllib.parse.quote(LINK, safe="")
DETAIL_URL = "https://trackid.net/api/public/audiostreams/" + SLUG


def fixture(name):
    return json.loads((FIX / name).read_text(encoding="utf-8"))


def body(obj):
    return json.dumps(obj).encode()


class Net:
    """A fake fetch: url -> (status, bytes) or an exception to raise."""

    def __init__(self, answers):
        self.answers = answers
        self.urls = []
        self.headers = []
        self.timeouts = []

    def __call__(self, url, headers, timeout):
        self.urls.append(url)
        self.headers.append(headers)
        self.timeouts.append(timeout)
        answer = self.answers[url]
        if isinstance(answer, Exception):
            raise answer
        return answer


def good():
    return {LIST_URL: (200, body(fixture("trackid_list.json"))), DETAIL_URL: (200, body(fixture("trackid_record.json")))}


def run(answers, link=LINK):
    net, sleeps, lines = Net(answers), [], []
    record = fetch_trackid(link, net, sleeps.append, lines.append)
    return record, net, sleeps, lines


def mk(start, end, tid=1, artist="A", title="T", label=None, ref=None):
    def clock(s):
        return "%02d:%02d:%02d.0000000" % (s // 3600, s % 3600 // 60, s % 60)

    t = {"musicTrackId": tid, "startTime": clock(start) if isinstance(start, int) else start,
         "endTime": clock(end) if isinstance(end, int) else end, "artist": artist, "title": title}
    if label is not None:
        t["label"] = label
    if ref is not None:
        t["referenceCount"] = ref
    return t


def rec_of(*processes):
    return {"detectionProcesses": [{"detectionProcessMusicTracks": list(p)} for p in processes]}


class Constants(unittest.TestCase):
    def test_values(self):
        self.assertEqual(
            (TRACKID_EDGE_SECONDS, TRACKID_MIN_CORE_SECONDS, TRACKID_DURATION_TOLERANCE,
             TRACKID_SPAN_CAP, TRACKID_TIMEOUT_SECONDS, TRACKID_INTERVAL_SECONDS),
            (10, 40, 0.05, 500, 10, 0.25),
        )


class Clocks(unittest.TestCase):
    def test_parse(self):
        self.assertAlmostEqual(parse_clock("01:29:47.3790000"), 5387.379)
        self.assertAlmostEqual(parse_clock("00:10:16.7580000"), 616.758)
        self.assertEqual(parse_clock("00:00:05"), 5)

    def test_unparseable(self):
        for bad in ("", "abc", "1:2", "00:61:00x", None, 5, "00:10"):
            self.assertIsNone(parse_clock(bad), bad)


class Flow(unittest.TestCase):
    def test_recorded_flow(self):
        record, net, sleeps, lines = run(good())
        self.assertIsInstance(record, Record)
        self.assertEqual(record.slug, SLUG)
        self.assertAlmostEqual(record.duration, 5387.379)
        self.assertEqual(len(record.spans), 11)  # 12 in the file, the reprocess one merged
        self.assertEqual(net.urls, [LIST_URL, DETAIL_URL])
        self.assertEqual(sleeps, [TRACKID_INTERVAL_SECONDS])
        self.assertEqual(lines, [])
        first = record.spans[0]
        self.assertEqual((first.artist, first.title), ("Kyntral", "Yuco"))
        self.assertAlmostEqual(first.start, 616.758)
        self.assertAlmostEqual(first.end, 14 * 60 + 40.758)  # the reprocess span continues it

    def test_headers_and_timeout_contract(self):
        _, net, _, _ = run(good())
        self.assertEqual(net.timeouts, [TRACKID_TIMEOUT_SECONDS] * 2)
        for headers in net.headers:
            self.assertEqual(headers["User-Agent"], "mix-worker/" + __version__)

    def test_link_is_only_the_encoded_url_query(self):
        link = "https://soundcloud.com/a b/x?y=1&z=2"
        enc = "https://trackid.net/api/public/audiostreams?url=" + urllib.parse.quote(link, safe="")
        record, net, _, _ = run({enc: (200, body({"result": {"audiostreams": [], "rowCount": 0}}))}, link)
        self.assertIsNone(record)
        self.assertEqual(net.urls, [enc])
        self.assertNotIn("keywords", enc)

    def test_never_the_keyword_endpoint_and_only_trackid_host(self):
        answers = [good(), {LIST_URL: (500, b"")}, {LIST_URL: TimeoutError("t")}]
        for a in answers:
            _, net, _, _ = run(a)
            for url in net.urls:
                self.assertNotIn("keywords", url)
                self.assertEqual(urllib.parse.urlsplit(url).hostname, "trackid.net")
                self.assertIn(url, (LIST_URL, DETAIL_URL))


class Unknown(unittest.TestCase):
    def check(self, answers, link=LINK, calls=None):
        record, net, sleeps, lines = run(answers, link)
        self.assertIsNone(record)
        self.assertEqual(len(lines), 1, lines)
        self.assertTrue(lines[0].startswith("trackid · "), lines)
        if calls is not None:
            self.assertEqual(len(net.urls), calls)
        return lines[0]

    def listing(self, **change):
        obj = fixture("trackid_list.json")
        obj["result"].update(change)
        return obj

    def test_row_count_zero(self):
        line = self.check({LIST_URL: (200, body(self.listing(audiostreams=[], rowCount=0)))}, calls=1)
        self.assertEqual(line, "trackid · not known")

    def test_row_count_two(self):
        one = fixture("trackid_list.json")["result"]["audiostreams"][0]
        self.check({LIST_URL: (200, body(self.listing(audiostreams=[one, one], rowCount=2)))}, calls=1)

    def test_url_differs(self):
        obj = fixture("trackid_list.json")
        obj["result"]["audiostreams"][0]["url"] = LINK + "/"
        self.check({LIST_URL: (200, body(obj))}, calls=1)

    def test_empty_slug(self):
        obj = fixture("trackid_list.json")
        obj["result"]["audiostreams"][0]["slug"] = ""
        self.check({LIST_URL: (200, body(obj))}, calls=1)

    def test_detail_slug_differs(self):
        a = good()
        d = fixture("trackid_record.json")
        d["result"]["slug"] = "other"
        a[DETAIL_URL] = (200, body(d))
        self.check(a, calls=2)

    def test_detail_url_differs(self):
        a = good()
        d = fixture("trackid_record.json")
        d["result"]["url"] = "https://soundcloud.com/other/mix"
        a[DETAIL_URL] = (200, body(d))
        self.check(a, calls=2)

    def test_timeouts(self):
        self.check({LIST_URL: TimeoutError("timed out")}, calls=1)
        a = good()
        a[DETAIL_URL] = TimeoutError("timed out")
        self.check(a, calls=2)

    def test_other_errors_raised_by_the_seam(self):
        self.check({LIST_URL: OSError("refused")}, calls=1)
        self.check({LIST_URL: ValueError("odd")}, calls=1)

    def test_http_status(self):
        self.check({LIST_URL: (503, b"busy")}, calls=1)
        a = good()
        a[DETAIL_URL] = (404, b"")
        self.check(a, calls=2)

    def test_malformed_body(self):
        self.check({LIST_URL: (200, b"<html>")}, calls=1)
        self.check({LIST_URL: (200, b"[1, 2]")}, calls=1)
        self.check({LIST_URL: (200, body({"result": {"rowCount": 1, "audiostreams": ["x"]}}))}, calls=1)
        a = good()
        a[DETAIL_URL] = (200, b"nope")
        self.check(a, calls=2)
        a[DETAIL_URL] = (200, body({"result": []}))
        self.check(a, calls=2)

    def test_never_raises_whatever_the_seam_does(self):
        class Weird(Exception):
            pass

        self.check({LIST_URL: Weird("x")}, calls=1)


class Trust(unittest.TestCase):
    def rec(self, duration):
        return Record(slug="s", title="t", duration=duration, spans=[])

    def test_within_tolerance(self):
        self.assertTrue(trusted(self.rec(5387.0), 5387.0))
        self.assertTrue(trusted(self.rec(5387.0 * 1.04), 5387.0))
        self.assertTrue(trusted(self.rec(5387.0 * 0.96), 5387.0))

    def test_beyond_tolerance(self):
        self.assertFalse(trusted(self.rec(5387.0 * 1.06), 5387.0))
        self.assertFalse(trusted(self.rec(5387.0 * 0.9), 5387.0))

    def test_unknown_audio_duration_is_trusted(self):
        self.assertTrue(trusted(self.rec(100.0), None))
        self.assertTrue(trusted(self.rec(None), 100.0))


class ParseSpans(unittest.TestCase):
    def spans(self, record, **kw):
        return parse_spans(record, **kw)

    def test_flatten_processes_and_sort(self):
        out = self.spans(rec_of([mk(300, 400, 2, "B", "b")], [mk(0, 100, 1, "A", "a")]))
        self.assertEqual([(s.artist, s.start, s.end) for s in out], [("A", 0.0, 100.0), ("B", 300.0, 400.0)])

    def test_merge_same_track_within_five_seconds(self):
        out = self.spans(rec_of([mk(0, 100, 7)], [mk(105, 200, 7)]))
        self.assertEqual([(s.start, s.end) for s in out], [(0.0, 200.0)])

    def test_no_merge_beyond_five_seconds_or_other_track(self):
        out = self.spans(rec_of([mk(0, 100, 7)], [mk(106, 200, 7)]))
        self.assertEqual(len(out), 2)
        out = self.spans(rec_of([mk(0, 100, 7)], [mk(100, 200, 8)]))
        self.assertEqual(len(out), 2)

    def test_merge_keeps_the_longer_end_and_first_fields(self):
        out = self.spans(rec_of([mk(0, 200, 7, "A", "first", label="L1")], [mk(50, 100, 7, "A", "second")]))
        self.assertEqual(len(out), 1)
        self.assertEqual((out[0].end, out[0].title, out[0].label), (200.0, "first", "L1"))

    def test_missing_track_ids_never_merge(self):
        a, b = mk(0, 100), mk(100, 200)
        del a["musicTrackId"], b["musicTrackId"]
        self.assertEqual(len(self.spans(rec_of([a, b]))), 2)

    def test_drop_unparseable_or_reversed(self):
        out = self.spans(rec_of([mk("nope", 100, 1), mk(0, "", 2), mk(200, 100, 3), mk(300, 400, 4)]))
        self.assertEqual([s.start for s in out], [300.0])

    def test_equal_start_and_end_kept(self):
        self.assertEqual(len(self.spans(rec_of([mk(50, 50)]))), 1)

    def test_drop_without_artist_or_title(self):
        out = self.spans(rec_of([mk(0, 100, 1, "", "t"), mk(100, 200, 2, "a", "  "), mk(200, 300, 3, "a", "t")]))
        self.assertEqual(len(out), 1)
        a = mk(0, 100)
        del a["artist"]
        self.assertEqual(self.spans(rec_of([a])), [])

    def test_label_and_references(self):
        out = self.spans(rec_of([mk(0, 100, 1, label="Axces", ref=12), mk(100, 200, 2)]))
        self.assertEqual((out[0].label, out[0].references), ("Axces", 12))
        self.assertEqual((out[1].label, out[1].references), (None, None))

    def test_cap_at_500_with_one_line(self):
        lines = []
        record = rec_of([mk(i * 10, i * 10 + 5, i, "a%d" % i, "t") for i in range(TRACKID_SPAN_CAP + 20)])
        out = self.spans(record, log=lines.append)
        self.assertEqual(len(out), TRACKID_SPAN_CAP)
        self.assertEqual(out[-1].start, (TRACKID_SPAN_CAP - 1) * 10.0)
        self.assertEqual(len(lines), 1)

    def test_odd_shapes_give_nothing(self):
        for record in (None, [], {}, {"detectionProcesses": "x"}, {"detectionProcesses": [None, {"detectionProcessMusicTracks": [1, None]}]}):
            self.assertEqual(self.spans(record), [])

    def test_fixture_reprocess_span_is_merged(self):
        out = self.spans(fixture("trackid_record.json")["result"])
        self.assertEqual(len(out), 11)
        self.assertIsInstance(out[0], Span)

    def test_fixture_with_an_unparseable_span_added(self):
        record = fixture("trackid_record.json")["result"]
        record["detectionProcesses"][0]["detectionProcessMusicTracks"].append(mk("garbage", "00:01:00.0000000", 99))
        self.assertEqual(len(self.spans(record)), 11)


class Guides(unittest.TestCase):
    def test_plan_guides_cores_and_confirm_time(self):
        spans = [Span(0, 50, "A", "T"), Span(100, 300, "A", "U"), Span(600, 640, "A", "V")]
        guides = plan_guides(spans, 15, 12)
        self.assertEqual([(g.span_index, g.core_start, g.core_end, g.confirm_at) for g in guides], [(1, 110, 290, 194)])
        self.assertEqual(plan_guides([Span(0, 60, "A", "T")], 15, 12)[0].confirm_at, 24)
        self.assertEqual(plan_guides([Span(0, 60, "A", "T")], 15, 100)[0].confirm_at, 0)

    def test_check_of_outcomes(self):
        sp = Span(0, 100, "Gloria Gaynor", "I Will Survive (Original Mix)")
        e = {"artist": "Gloria Gaynor", "song_name": "I Will Survive", "confidence": 80.0}
        o = {"artist": "Other", "song_name": "Else", "confidence": 90.0}
        self.assertEqual(check_of(sp, [o, e]), {"outcome": "agrees"})
        self.assertEqual(check_of(sp, [e, o])["outcome"], "agrees")
        self.assertEqual(check_of(sp, [o, dict(o, confidence=10.0)]), {"outcome": "differs", "artist": "Other", "song_name": "Else", "confidence": 90.0})
        self.assertEqual(check_of(sp, [], probed=True), {"outcome": "no_match"})
        self.assertEqual(check_of(sp, []), {"outcome": "not_asked"})


if __name__ == "__main__":
    unittest.main()


class Rows(unittest.TestCase):
    def test_a_full_row(self):
        rows = span_rows([Span(616.9, 857.2, "Kyntral", "Yuco", "Kyntral", 31)], {0: {"outcome": "agrees"}}, "slug-1")
        self.assertEqual(rows, [{
            "song_name": "Yuco", "artist": "Kyntral", "time_in_mix": "00:10:16", "origin": "trackid",
            "trackid": {"slug": "slug-1", "span_start": 616, "span_end": 857, "references": 31},
            "shazam_check": {"outcome": "agrees"}, "metadata": {"label": "Kyntral"}, "hits": 0,
        }])
        self.assertNotIn("confidence", rows[0])

    def test_optional_parts_are_left_out(self):
        row = span_rows([Span(3700, 3800, "A", "T")], {}, "s")[0]
        self.assertEqual(row["time_in_mix"], "01:01:40")
        self.assertNotIn("references", row["trackid"])
        self.assertNotIn("metadata", row)
        self.assertEqual(row["shazam_check"], {"outcome": "not_asked"})

    def test_a_differing_check_keeps_only_its_four_keys(self):
        span = Span(0, 100, "A", "T")
        check = check_of(span, [{"artist": "Other", "song_name": "Track", "confidence": 0.7}])
        row = span_rows([span], {0: check}, "s")[0]
        self.assertEqual(row["shazam_check"], {"outcome": "differs", "artist": "Other", "song_name": "Track", "confidence": 0.7})
        self.assertEqual((row["artist"], row["song_name"]), ("A", "T"))

    def test_merge_sorts_by_seconds_and_is_stable(self):
        heard = [{"song_name": "h1", "time_in_mix": "00:05:00"}, {"song_name": "h2", "time_in_mix": "00:20:00"}]
        tid = span_rows([Span(300, 400, "A", "t1"), Span(60, 90, "A", "t0")], {}, "s")
        names = [r["song_name"] for r in merge_rows(heard, tid)]
        self.assertEqual(names, ["t0", "h1", "t1", "h2"])

    def test_uncovered_clips_gaps_and_drops_slivers(self):
        spans = [Span(100, 400, "A", "x"), Span(900, 1000, "A", "y")]
        self.assertEqual(uncovered([(0, 200), (350, 500), (950, 1000), (1100, 1200)], spans), [(0, 100), (400, 500), (1100, 1200)])
        self.assertEqual(uncovered([(0, 100)], [Span(0, 99.5, "A", "z")]), [])
        self.assertEqual(uncovered([(0, 500)], [Span(100, 200, "A", "a"), Span(300, 400, "A", "b")]), [(0, 100), (200, 300), (400, 500)])
