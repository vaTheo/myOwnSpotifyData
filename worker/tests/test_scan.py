import asyncio
import json
import tempfile
import unittest
from pathlib import Path

from mix_worker.scan import (
    Hit,
    ScanRefused,
    confidence_of,
    hhmmss,
    merge,
    probe_times,
    scan,
    track_entry,
    write_result,
)

CASSETTE = {
    "matches": [{"id": "211404070", "offset": 92.9, "timeskew": 4.68e-05, "frequencyskew": -0.000161}],
    "track": {
        "key": "53982678",
        "title": "I Will Survive",
        "subtitle": "Gloria Gaynor",
        "isrc": "USUR10200634",
        "url": "https://www.shazam.com/track/53982678/i-will-survive",
        "genres": {"primary": "Pop"},
        "images": {"coverart": "https://is1-ssl.mzstatic.com/x/400x400cc.jpg", "coverarthq": "https://x/hq.jpg"},
        "sections": [
            {"type": "SONG", "metadata": [{"title": "Album", "text": "Love Tracks"}, {"title": "Label", "text": "Polydor"}, {"title": "Released", "text": "1978"}]},
            {"type": "VIDEO"},
        ],
    },
}
NO_MATCH = {"matches": [], "location": {"accuracy": 0.01}}


class RateLimited(Exception):
    pass


class SignatureError(Exception):
    pass


def classify(err):
    if isinstance(err, RateLimited):
        return "rate_limited"
    if isinstance(err, SignatureError):
        return "skip"
    return "raise"


class Probes(unittest.TestCase):
    def test_probe_times(self):
        self.assertEqual(probe_times(7260, 60), list(range(0, 7260, 60)))
        self.assertEqual(probe_times(7260, 60)[-1], 7200)
        self.assertEqual(probe_times(100, 60), [0, 60])
        self.assertEqual(probe_times(0, 60), [0])
        self.assertEqual(probe_times(None, 60), [0])
        self.assertEqual(hhmmss(0), "00:00:00")
        self.assertEqual(hhmmss(3661), "01:01:01")

    def test_confidence(self):
        self.assertAlmostEqual(confidence_of({"frequencyskew": 0.001, "timeskew": 0.0005}), 0.6 * 99 + 0.4 * 99.5)
        self.assertEqual(confidence_of({"frequencyskew": 0.5, "timeskew": -0.2}), 0.0)
        self.assertEqual(confidence_of({}), 0.0)
        self.assertEqual(confidence_of({"frequencyskew": "x"}), 0.0)


class Entry(unittest.TestCase):
    def test_full_entry(self):
        e = track_entry(CASSETTE, "00:01:00")
        self.assertEqual(
            e,
            {
                "song_name": "I Will Survive",
                "artist": "Gloria Gaynor",
                "time_in_mix": "00:01:00",
                "confidence": confidence_of(CASSETTE["matches"][0]),
                "duration": None,
                "metadata": {
                    "isrc": "USUR10200634",
                    "album": "Love Tracks",
                    "label": "Polydor",
                    "release_date": "1978",
                    "genres": ["Pop"],
                    "shazam_id": "53982678",
                    "artwork_url": "https://is1-ssl.mzstatic.com/x/400x400cc.jpg",
                    "links": {"shazam": "https://www.shazam.com/track/53982678/i-will-survive"},
                },
            },
        )

    def test_absent_fields_are_omitted_and_bad_links_dropped(self):
        resp = {"matches": [{"id": "1"}], "track": {"key": "9", "title": "T", "subtitle": "A", "url": "http://www.shazam.com/x"}}
        e = track_entry(resp, "00:00:00")
        self.assertEqual(e["metadata"], {"shazam_id": "9"})
        resp["track"]["url"] = "https://evil.example/track"
        self.assertEqual(track_entry(resp, "00:00:00")["metadata"], {"shazam_id": "9"})
        resp = {"matches": [{"id": "1"}], "track": {"title": "T", "subtitle": "A"}}
        self.assertNotIn("metadata", track_entry(resp, "00:00:00"))

    def test_no_match_and_garbage(self):
        self.assertIsNone(track_entry(NO_MATCH, "00:00:00"))
        self.assertIsNone(track_entry({}, "00:00:00"))
        self.assertIsNone(track_entry({"matches": [{"id": "1"}], "track": {"title": "", "subtitle": "A"}}, "00:00:00"))
        self.assertIsNone(track_entry("nope", "00:00:00"))


def hit(t, key, confidence=50.0, title=None):
    return Hit(time=t, entry={"song_name": title or f"T{key}", "artist": "A", "time_in_mix": hhmmss(t), "confidence": confidence, "duration": None, "metadata": {"shazam_id": key}})


class Merge(unittest.TestCase):
    def test_runs_become_rows(self):
        rows = merge([hit(0, "A"), hit(60, "A"), hit(120, "B"), hit(180, "B"), hit(240, "A")], gap=180)
        self.assertEqual([(r["time_in_mix"], r["metadata"]["shazam_id"]) for r in rows], [("00:00:00", "A"), ("00:02:00", "B"), ("00:04:00", "A")])

    def test_gap_inside_a_track_is_bridged_and_a_replay_is_not(self):
        rows = merge([hit(0, "A"), hit(120, "A")], gap=180)
        self.assertEqual(len(rows), 1)
        rows = merge([hit(0, "A"), hit(300, "A")], gap=180)
        self.assertEqual(len(rows), 2)

    def test_best_confidence_and_name_key_without_shazam_id(self):
        rows = merge([hit(0, "A", 40.0), hit(60, "A", 90.0), hit(120, "A", 70.0)], gap=180)
        self.assertEqual(rows[0]["confidence"], 90.0)
        self.assertEqual(rows[0]["time_in_mix"], "00:00:00")
        a = Hit(time=0, entry={"song_name": "Same", "artist": "Artist", "time_in_mix": "00:00:00", "confidence": 1.0, "duration": None})
        b = Hit(time=60, entry={"song_name": "same", "artist": "ARTIST", "time_in_mix": "00:01:00", "confidence": 2.0, "duration": None})
        self.assertEqual(len(merge([a, b], gap=180)), 1)
        self.assertEqual(merge([], gap=180), [])


def run(coro):
    return asyncio.run(coro)


class Scan(unittest.TestCase):
    def make(self, responses, cut_lengths=None, duration=180):
        calls = {"sleeps": [], "recognised": [], "cuts": []}

        def cut(t):
            calls["cuts"].append(t)
            n = cut_lengths[len(calls["cuts"]) - 1] if cut_lengths else 5000
            return b"x" * n

        async def recognise(data, max_skew):
            calls["recognised"].append((len(data), max_skew))
            r = responses.pop(0)
            if isinstance(r, Exception):
                raise r
            return r

        async def sleep(s):
            calls["sleeps"].append(s)

        return calls, cut, recognise, sleep

    def test_cooldown_before_every_call_and_max_skew(self):
        calls, cut, recognise, sleep = self.make([CASSETTE, NO_MATCH, CASSETTE])
        rows = run(scan(180, step=60, cooldown=3.0, pause=300.0, max_skew=0.001, gap=180, recognise=recognise, cut=cut, sleep=sleep, classify=classify))
        self.assertEqual(calls["sleeps"], [3.0, 3.0, 3.0])
        self.assertEqual([m for _, m in calls["recognised"]], [0.001, 0.001, 0.001])
        self.assertEqual(calls["cuts"], [0, 60, 120])
        self.assertEqual([r["time_in_mix"] for r in rows], ["00:00:00"])
        self.assertEqual(len(rows), 1)  # 0 and 120 bridged by the gap

    def test_max_skew_zero_means_none(self):
        calls, cut, recognise, sleep = self.make([NO_MATCH])
        run(scan(60, step=60, cooldown=0.0, pause=0.0, max_skew=0.0, gap=180, recognise=recognise, cut=cut, sleep=sleep, classify=classify))
        self.assertEqual(calls["recognised"][0][1], None)

    def test_signature_error_is_skipped(self):
        calls, cut, recognise, sleep = self.make([SignatureError("silence"), CASSETTE])
        rows = run(scan(120, step=60, cooldown=0.0, pause=0.0, max_skew=0.0, gap=180, recognise=recognise, cut=cut, sleep=sleep, classify=classify))
        self.assertEqual([r["time_in_mix"] for r in rows], ["00:01:00"])

    def test_rate_limited_pauses_grow_and_the_cooldown_doubles(self):
        calls, cut, recognise, sleep = self.make([RateLimited(), RateLimited(), CASSETTE, NO_MATCH])
        rows = run(scan(120, step=60, cooldown=6.0, pause=300.0, max_skew=0.0, gap=180, recognise=recognise, cut=cut, sleep=sleep, classify=classify))
        # cooldown 6, pause 300, cooldown 12, pause 600, cooldown 24 (probe 1 again), cooldown 24 (probe 2)
        self.assertEqual(calls["sleeps"], [6.0, 300.0, 12.0, 600.0, 24.0, 24.0])
        self.assertEqual(calls["cuts"], [0, 60])
        self.assertEqual(len(rows), 1)

    def test_cooldown_is_capped_and_jitter_added(self):
        calls, cut, recognise, sleep = self.make([RateLimited(), CASSETTE])
        run(scan(60, step=60, cooldown=20.0, pause=1.0, max_skew=0.0, gap=180, recognise=recognise, cut=cut, sleep=sleep, classify=classify, jitter=lambda c: c / 4))
        self.assertEqual(calls["sleeps"], [25.0, 1.0, 37.5])

    def test_one_more_than_the_allowed_pauses_refuses(self):
        calls, cut, recognise, sleep = self.make([RateLimited(), RateLimited(), RateLimited()])
        with self.assertRaises(ScanRefused):
            run(scan(60, step=60, cooldown=0.0, pause=0.0, max_skew=0.0, gap=180, recognise=recognise, cut=cut, sleep=sleep, classify=classify, max_pauses=2))
        self.assertEqual(len([s for s in calls["sleeps"]]), 5)

    def test_other_errors_raise(self):
        calls, cut, recognise, sleep = self.make([ValueError("x")])
        with self.assertRaises(ValueError):
            run(scan(60, step=60, cooldown=0.0, pause=0.0, max_skew=0.0, gap=180, recognise=recognise, cut=cut, sleep=sleep, classify=classify))

    def test_unknown_duration_probes_until_the_cut_is_short(self):
        calls, cut, recognise, sleep = self.make([NO_MATCH, NO_MATCH, NO_MATCH], cut_lengths=[5000, 5000, 200])
        rows = run(scan(None, step=60, cooldown=0.0, pause=0.0, max_skew=0.0, gap=180, recognise=recognise, cut=cut, sleep=sleep, classify=classify))
        self.assertEqual(calls["cuts"], [0, 60, 120])
        self.assertEqual(len(calls["recognised"]), 2)
        self.assertEqual(rows, [])


class Lines(unittest.TestCase):
    def test_one_line_per_probe_new_then_same_then_no_match(self):
        responses = [CASSETTE, CASSETTE, NO_MATCH, SignatureError("x")]
        lines = []

        async def recognise(data, max_skew):
            r = responses.pop(0)
            if isinstance(r, Exception):
                raise r
            return r

        async def sleep(s):
            pass

        run(scan(240, step=60, cooldown=0.0, pause=0.0, max_skew=0.0, gap=180, recognise=recognise, cut=lambda t: b"x" * 5000, sleep=sleep, classify=classify, line=lines.append))
        self.assertEqual(len(lines), 4)
        self.assertEqual(lines[0], "  probe 1/4 · 00:00:00 · NEW · Gloria Gaynor — I Will Survive · USUR10200634 · Polydor · 100 %")
        self.assertIn("probe 2/4 · 00:01:00 · same track · Gloria Gaynor", lines[1])
        self.assertEqual(lines[2], "  probe 3/4 · 00:02:00 · no match")
        self.assertEqual(lines[3], "  probe 4/4 · 00:03:00 · skipped (undecodable or silent)")

    def test_rate_limit_lines(self):
        responses = [RateLimited(), RateLimited()]
        lines = []

        async def recognise(data, max_skew):
            raise responses.pop(0)

        async def sleep(s):
            pass

        with self.assertRaises(ScanRefused):
            run(scan(60, step=60, cooldown=3.0, pause=300.0, max_skew=0.0, gap=180, recognise=recognise, cut=lambda t: b"x" * 5000, sleep=sleep, classify=classify, line=lines.append, max_pauses=1))
        self.assertEqual(lines, ["  probe 1/1 · 00:00:00 · rate limited (1/1) · pausing 300 s, then this probe again · cooldown now 6 s", "  probe 1/1 · 00:00:00 · rate limited again · giving up after 1 pauses"])


class Device(unittest.TestCase):
    def test_android_profile_url_and_headers(self):
        from mix_worker.scan import shazam_for

        class Recorder:
            def __init__(self):
                self.calls = []

            async def request(self, method, url, **kw):
                self.calls.append((method, url, kw["headers"]))
                return {"matches": []}

            async def close(self):
                pass

        class Sig:
            timezone = "Europe/Paris"
            timestamp = 1
            class signature:
                uri = "data:audio/vnd.shazam.sig;base64,AAAA"
                samples = 160000

        rec = Recorder()
        shazam = shazam_for("android", rec)
        run(shazam.send_recognize_request_v2(Sig()))
        method, url, headers = rec.calls[0]
        self.assertEqual(method, "POST")
        self.assertIn("/android/-/tag/", url)
        self.assertEqual(headers["X-Shazam-Platform"], "ANDROID")
        self.assertIn("Android", headers["User-Agent"])
        self.assertEqual(type(shazam_for("iphone", rec)).__name__, "Shazam")


class Result(unittest.TestCase):
    def test_write_result_has_the_keys_the_app_requires(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "out.json"
            tracks = [track_entry(CASSETTE, "00:00:00")]
            data = write_result(p, title="pi/live: a set", artist="Someone", audio_filename="abc.webm", source_url="https://x.y/z", duration=7260, date="2026-11-06", tracks=tracks)
            back = json.loads(p.read_text(encoding="utf-8"))
            self.assertEqual(back, data)
            self.assertEqual(back["mix_info"]["title"], "pi/live: a set")
            self.assertEqual(back["mix_info"]["audio_filename"], "abc.webm")
            self.assertEqual(back["mix_info"]["artist"], "Someone")
            self.assertEqual(back["mix_info"]["source_url"], "https://x.y/z")
            self.assertEqual(back["mix_info"]["duration_seconds"], 7260)
            self.assertEqual(back["mix_info"]["track_count"], 1)
            self.assertEqual(back["tracks"][0]["song_name"], "I Will Survive")
            self.assertEqual(back["tracks"][0]["artist"], "Gloria Gaynor")

    def test_write_result_without_artist_or_duration(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = write_result(Path(tmp) / "o.json", title="t", artist=None, audio_filename="a", source_url="u", duration=None, date="d", tracks=[])
            self.assertNotIn("artist", data["mix_info"])
            self.assertNotIn("duration_seconds", data["mix_info"])


if __name__ == "__main__":
    unittest.main()
