import asyncio
import json
import tempfile
import unittest
from pathlib import Path

from mix_worker.scan import (
    Hit,
    ScanRefused,
    ScanUnreachable,
    cut_probe,
    default_classify,
    gap_positions,
    gaps_of,
    inside_known,
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
    if isinstance(err, TimeoutError):
        return "network"
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

    def test_rate_limited_pauses_are_flat_and_the_pace_unchanged(self):
        calls, cut, recognise, sleep = self.make([RateLimited(), RateLimited(), CASSETTE, NO_MATCH])
        rows = run(scan(120, step=60, cooldown=6.0, pause=300.0, max_skew=0.0, gap=180, recognise=recognise, cut=cut, sleep=sleep, classify=classify))
        # Owner, 2026-11-06: a flat pause each time, the pace unchanged.
        self.assertEqual(calls["sleeps"], [6.0, 300.0, 6.0, 300.0, 6.0, 6.0])
        self.assertEqual(calls["cuts"], [0, 60])
        self.assertEqual(len(rows), 1)

    def test_jitter_on_calls_not_on_the_pause(self):
        calls, cut, recognise, sleep = self.make([RateLimited(), CASSETTE])
        run(scan(60, step=60, cooldown=20.0, pause=1.0, max_skew=0.0, gap=180, recognise=recognise, cut=cut, sleep=sleep, classify=classify, jitter=lambda c: c / 4))
        self.assertEqual(calls["sleeps"], [25.0, 1.0, 25.0])  # the pace is not slowed; the pause is exact

    def test_one_more_than_the_allowed_pauses_refuses(self):
        calls, cut, recognise, sleep = self.make([RateLimited(), RateLimited(), RateLimited()])
        with self.assertRaises(ScanRefused):
            run(scan(60, step=60, cooldown=0.0, pause=0.0, max_skew=0.0, gap=180, recognise=recognise, cut=cut, sleep=sleep, classify=classify, max_pauses=2))
        self.assertEqual(len([s for s in calls["sleeps"]]), 5)

    def test_a_timeout_is_tried_again_then_the_probe_answers(self):
        calls, cut, recognise, sleep = self.make([TimeoutError(), CASSETTE])
        lines = []
        rows = run(scan(60, step=60, cooldown=3.0, pause=300.0, max_skew=0.0, gap=180, recognise=recognise, cut=cut, sleep=sleep, classify=classify, line=lines.append, clock=lambda: 0.0))
        self.assertEqual(calls["sleeps"], [3.0, 10.0, 3.0])
        self.assertEqual(calls["cuts"], [0])
        self.assertEqual(len(rows), 1)
        self.assertIn("no answer (TimeoutError, 1/3) · trying again in 10 s", lines[0])

    def test_a_probe_that_never_answers_is_skipped_and_the_scan_goes_on(self):
        calls, cut, recognise, sleep = self.make([TimeoutError()] * 3 + [CASSETTE])
        lines = []
        rows = run(scan(120, step=60, cooldown=0.0, pause=0.0, max_skew=0.0, gap=180, recognise=recognise, cut=cut, sleep=sleep, classify=classify, line=lines.append, clock=lambda: 0.0))
        self.assertEqual([r["time_in_mix"] for r in rows], ["00:01:00"])
        self.assertTrue(any("after 3 tries · probe skipped" in x for x in lines))

    def test_three_probes_in_a_row_without_answer_fail_the_scan(self):
        calls, cut, recognise, sleep = self.make([TimeoutError()] * 9)
        with self.assertRaises(ScanUnreachable):
            run(scan(300, step=60, cooldown=0.0, pause=0.0, max_skew=0.0, gap=180, recognise=recognise, cut=cut, sleep=sleep, classify=classify))
        self.assertEqual(calls["cuts"], [0, 60, 120])

    def test_an_answer_resets_the_run_of_skipped_probes(self):
        T = TimeoutError
        calls, cut, recognise, sleep = self.make([T(), T(), T(), NO_MATCH, T(), T(), T(), T(), T(), T(), CASSETTE])
        rows = run(scan(300, step=60, cooldown=0.0, pause=0.0, max_skew=0.0, gap=180, recognise=recognise, cut=cut, sleep=sleep, classify=classify))
        self.assertEqual([r["time_in_mix"] for r in rows], ["00:04:00"])

    def test_default_classify_network_errors(self):
        import asyncio as aio

        import aiohttp

        self.assertEqual(default_classify(aio.TimeoutError()), "network")
        self.assertEqual(default_classify(TimeoutError()), "network")
        self.assertEqual(default_classify(aiohttp.ClientConnectionError()), "network")
        self.assertEqual(default_classify(ValueError()), "raise")

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

        run(scan(240, step=60, cooldown=0.0, pause=0.0, max_skew=0.0, gap=180, recognise=recognise, cut=lambda t: b"x" * 5000, sleep=sleep, classify=classify, line=lines.append, clock=lambda: 0.0))
        self.assertEqual(len(lines), 4)
        self.assertEqual(lines[0], "  probe 1/4 · 00:00:00 · cut 4 KB 0.00 s · NEW · Gloria Gaynor — I Will Survive · USUR10200634 · Polydor · 100 %")
        self.assertIn("probe 2/4 · 00:01:00 · cut 4 KB 0.00 s · same track · Gloria Gaynor", lines[1])
        self.assertEqual(lines[2], "  probe 3/4 · 00:02:00 · cut 4 KB 0.00 s · no match")
        self.assertEqual(lines[3], "  probe 4/4 · 00:03:00 · cut 4 KB 0.00 s · skipped (undecodable or silent)")

    def test_rate_limit_lines(self):
        responses = [RateLimited(), RateLimited()]
        lines = []

        async def recognise(data, max_skew):
            raise responses.pop(0)

        async def sleep(s):
            pass

        with self.assertRaises(ScanRefused):
            run(scan(60, step=60, cooldown=3.0, pause=300.0, max_skew=0.0, gap=180, recognise=recognise, cut=lambda t: b"x" * 5000, sleep=sleep, classify=classify, line=lines.append, max_pauses=1, clock=lambda: 0.0))
        self.assertEqual(lines, ["  probe 1/1 · 00:00:00 · cut 4 KB 0.00 s · rate limited (1/1) · pausing 300 s, then this probe again at the same pace", "  probe 1/1 · 00:00:00 · cut 4 KB 0.00 s · rate limited again · giving up after 1 pauses"])


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


class SecondPass(unittest.TestCase):
    """Round 003: the gaps heard again (+7 s, every 30 s, ×1 then ×0.96 then ×1.04)."""

    def kw(self, **over):
        base = dict(step=15, cooldown=0.0, pause=0.0, max_skew=0.0, gap=180, sleep=self.sleep, classify=classify, clock=lambda: 0.0)
        base.update(over)
        return base

    async def sleep(self, s):
        pass

    def test_positions(self):
        self.assertEqual(gap_positions([0, 15, 30, 45, 60, 75], 30, 7), [7, 37, 67])
        self.assertEqual(gap_positions([300], 30, 7), [307])

    def test_gaps_of(self):
        self.assertEqual(gaps_of([0, 15, 30, 90], [], 15), [(0, 45), (90, 105)])
        self.assertEqual(gaps_of([0, 15, 30], [22], 15), [(0, 15), (30, 45)])
        self.assertEqual(gaps_of([], [0], 15), [])

    def test_hit_at_a_corrected_speed_is_marked_and_the_rest_reported(self):
        # 6 first-pass probes, all no match; then positions 7, 37, 67:
        # 7 → ×1 no, ×0.96 hit; 37 → ×1, ×0.96, ×1.04 no; 67 → ×1 hit.
        answers = [NO_MATCH] * 6 + [NO_MATCH, CASSETTE, NO_MATCH, NO_MATCH, NO_MATCH, CASSETTE]
        asked_cuts = []

        async def recognise(data, skew):
            return answers.pop(0)

        def cut_at(t, speed):
            asked_cuts.append((t, speed))
            return b"x" * 5000

        report = {}
        lines = []
        rows = run(scan(90, recognise=recognise, cut=lambda t: b"x" * 5000, cut_at=cut_at, report=report, line=lines.append, **self.kw()))
        self.assertEqual(asked_cuts, [(7, 1.0), (7, 0.96), (37, 1.0), (37, 0.96), (37, 1.04), (67, 1.0)])
        self.assertEqual(rows[0]["origin"], "replay")
        self.assertEqual(rows[0]["speed_percent"], -4)
        self.assertEqual(report["second_pass"], {"places": 3, "found": 1, "stopped": None})  # the 2nd hit is the same track
        self.assertEqual(report["gaps"], [(15, 60), (75, 90)])
        self.assertTrue(any("second pass · 1 new track in 3 places" in x for x in lines))

    def test_refusal_keeps_what_was_found(self):
        answers = [CASSETTE, NO_MATCH, NO_MATCH, NO_MATCH, RateLimited(), RateLimited()]

        async def recognise(data, skew):
            r = answers.pop(0)
            if isinstance(r, Exception):
                raise r
            return r

        report = {}
        rows = run(scan(60, recognise=recognise, cut=lambda t: b"x" * 5000, cut_at=lambda t, s: b"x" * 5000, report=report, max_pauses=1, **self.kw()))
        self.assertEqual(len(rows), 1)
        self.assertEqual(report["second_pass"]["stopped"], "rate limited")

    def test_off(self):
        async def recognise(data, skew):
            return NO_MATCH

        cuts = []
        report = {}
        run(scan(30, recognise=recognise, cut=lambda t: b"x" * 5000, cut_at=lambda t, s: cuts.append(t) or b"", gap_step=0, report=report, **self.kw()))
        self.assertEqual(cuts, [])
        self.assertEqual(report["second_pass"]["places"], 0)


class CutProbeSpeed(unittest.TestCase):
    def test_ffmpeg_arguments(self):
        import subprocess
        import tempfile
        from unittest import mock

        with tempfile.TemporaryDirectory() as tmp:
            audio = Path(tmp) / "a.m4a"
            audio.write_bytes(b"x")
            seen = []

            def fake_run(cmd, **kw):
                seen.append(cmd)
                Path(cmd[-1]).write_bytes(b"RIFF" + b"x" * 2000)
                return subprocess.CompletedProcess(cmd, 0, b"", b"")

            with mock.patch("mix_worker.scan.subprocess.run", fake_run):
                cut_probe("ffmpeg", audio, 60, 12)
                cut_probe("ffmpeg", audio, 60, 12, speed=1.04)
                cut_probe("ffmpeg", audio, 60, 12, speed=0.96)
        plain, fast, slow = seen
        self.assertNotIn("-af", plain)
        self.assertEqual(plain[plain.index("-t") + 1], "12")
        self.assertLess(fast.index("-t"), fast.index("-i"))
        self.assertEqual(fast[fast.index("-t") + 1], "12.48")
        self.assertEqual(fast[fast.index("-af") + 1], "aresample=16000,asetrate=16640,aresample=16000")
        self.assertEqual(slow[slow.index("-t") + 1], "11.52")
        self.assertEqual(slow[slow.index("-af") + 1], "aresample=16000,asetrate=15360,aresample=16000")


class LessCalls(unittest.TestCase):
    """Owner, 2026-11-06: skip stretches inside a known track; planned breaks."""

    def test_inside_known(self):
        keys = {0: "a", 15: "a", 60: "a", 120: "b", 300: "c"}
        # 30, 45 sit between two "a" probes: that track. 75-105 between "a" and "b": open.
        # 135-285 between "b" and "c": open. 315: after the last hit: open.
        self.assertEqual(inside_known([30, 45, 75, 90, 105, 135, 150, 315], keys, 180), [75, 90, 105, 135, 150, 315])

    def test_a_long_run_inside_the_same_track_is_still_heard(self):
        keys = {0: "a", 300: "a"}
        self.assertEqual(inside_known([15, 30, 285], keys, 180), [15, 30, 285])

    def test_planned_break_every_n_calls(self):
        sleeps = []

        async def sleep(s):
            sleeps.append(s)

        async def recognise(data, skew):
            return NO_MATCH

        lines = []
        run(scan(90, step=15, cooldown=1.0, pause=0.0, max_skew=0.0, gap=180, recognise=recognise, cut=lambda t: b"x" * 5000, sleep=sleep, classify=classify, line=lines.append, clock=lambda: 0.0, break_every=2, break_seconds=60.0))
        # 6 probes: cooldown, cooldown, break, cooldown, cooldown, break, cooldown, cooldown
        self.assertEqual(sleeps, [1.0, 1.0, 60.0, 1.0, 1.0, 60.0, 1.0, 1.0])
        self.assertEqual(sum("break · 2 calls" in x for x in lines), 2)

    def test_second_pass_skips_inside_a_known_track(self):
        # probes 0 hit, 15 miss, 30 hit (same track), 45 miss: only 45 is heard again
        answers = [CASSETTE, NO_MATCH, CASSETTE, NO_MATCH, NO_MATCH]
        cuts = []

        async def recognise(data, skew):
            return answers.pop(0) if answers else NO_MATCH

        async def sleep(s):
            pass

        def cut_at(t, speed):
            cuts.append(t)
            return b"x" * 5000

        run(scan(60, step=15, cooldown=0.0, pause=0.0, max_skew=0.0, gap=180, recognise=recognise, cut=lambda t: b"x" * 5000, cut_at=cut_at, speeds=(), sleep=sleep, classify=classify, clock=lambda: 0.0))
        self.assertEqual(cuts, [52])


class Retries(unittest.TestCase):
    """Owner, 2026-11-06: a first-pass refusal keeps the hits."""

    def test_first_pass_refusal_keeps_the_hits(self):
        answers = [CASSETTE, NO_MATCH, RateLimited(), RateLimited()]

        async def recognise(data, skew):
            r = answers.pop(0)
            if isinstance(r, Exception):
                raise r
            return r

        async def sleep(s):
            pass

        report = {}
        rows = run(scan(120, step=15, cooldown=0.0, pause=0.0, max_skew=0.0, gap=180, recognise=recognise, cut=lambda t: b"x" * 5000, cut_at=lambda t, s: b"x" * 5000, sleep=sleep, classify=classify, max_pauses=1, report=report, clock=lambda: 0.0))
        self.assertEqual(len(rows), 1)
        self.assertEqual(report["stopped"], {"at": "00:00:30", "reason": "rate limited"})
        self.assertEqual(report["second_pass"]["places"], 0)  # no second pass after a stop

    def test_shazam_server_error_is_a_visible_retry(self):
        class FailedDecodeJson(Exception):
            pass

        self.assertEqual(default_classify(FailedDecodeJson("Failed to decode json (status=502): <html>")), "network")
        self.assertEqual(default_classify(FailedDecodeJson("Failed to decode json (status=200): x")), "raise")


class AcrossSets(unittest.TestCase):
    """Owner, 2026-11-06: the planned-break count runs across sets."""

    def go(self, shared, now):
        sleeps = []

        async def sleep(s):
            sleeps.append(s)

        async def recognise(data, skew):
            return NO_MATCH

        lines = []
        run(scan(30, step=15, cooldown=1.0, pause=0.0, max_skew=0.0, gap=180, recognise=recognise, cut=lambda t: b"x" * 5000, sleep=sleep, classify=classify, line=lines.append, clock=lambda: now, break_every=3, break_seconds=60.0, shared=shared))
        return sleeps, lines

    def test_count_carries_into_the_next_set(self):
        shared = {}
        first, _ = self.go(shared, 1000.0)
        self.assertEqual(first, [1.0, 1.0])
        self.assertEqual(shared["calls"], 2)
        second, lines = self.go(shared, 1100.0)  # 100 s later: same window
        self.assertEqual(second, [1.0, 60.0, 1.0])  # break after the 3rd call overall
        self.assertTrue(any("2 calls already made" in x for x in lines))

    def test_a_quiet_spell_starts_afresh(self):
        shared = {"calls": 2, "last": 0.0}
        sleeps, _ = self.go(shared, 5000.0)  # long after the window
        self.assertEqual(sleeps, [1.0, 1.0])


class ExactBreak(unittest.TestCase):
    def test_the_planned_break_has_no_spread(self):
        sleeps = []

        async def sleep(s):
            sleeps.append(s)

        async def recognise(data, skew):
            return NO_MATCH

        run(scan(45, step=15, cooldown=1.0, pause=0.0, max_skew=0.0, gap=180, recognise=recognise, cut=lambda t: b"x" * 5000, sleep=sleep, classify=classify, clock=lambda: 0.0, break_every=2, break_seconds=180.0, jitter=lambda s: s * 0.4))
        self.assertEqual(sleeps, [1.4, 1.4, 180.0, 1.4])  # calls spread, the break exact


class AddedSpread(unittest.TestCase):
    """Owner, 2026-11-06: 2 s + 0-50 % between calls, 3 min + 0-40 % after a refusal."""

    def test_added_only_grows(self):
        from mix_worker.scan import added

        f = added(50)
        values = [f(2.0) for _ in range(500)]
        self.assertTrue(all(0.0 <= v <= 1.0 for v in values))
        self.assertGreater(max(values), 0.8)

    def test_refusal_pause_gets_its_own_spread(self):
        answers = [RateLimited(), NO_MATCH]
        sleeps = []

        async def recognise(data, skew):
            r = answers.pop(0)
            if isinstance(r, Exception):
                raise r
            return r

        async def sleep(s):
            sleeps.append(s)

        run(scan(15, step=15, cooldown=2.0, pause=180.0, max_skew=0.0, gap=180, recognise=recognise, cut=lambda t: b"x" * 5000, sleep=sleep, classify=classify, clock=lambda: 0.0, jitter=lambda s: s * 0.5, pause_jitter=lambda s: s * 0.4))
        self.assertEqual(sleeps, [3.0, 252.0, 3.0])  # 2 s +50 %, 180 s +40 %, 2 s +50 %


class ClipCount(unittest.TestCase):
    """Round 004: each row keeps how many clips matched it and its best score."""

    def test_hits_and_best(self):
        a = dict(track_entry(CASSETTE, "00:00:00"))
        lo = dict(a, confidence=60.0)
        hi = dict(a, confidence=95.0)
        rows = merge([Hit(0, lo), Hit(15, hi), Hit(30, lo), Hit(600, lo)], 180)
        self.assertEqual([(r["hits"], r["confidence"]) for r in rows], [(3, 95.0), (1, 60.0)])
