import asyncio
import json
import tempfile
import unittest
from pathlib import Path

from mix_worker import runstate
from mix_worker.trackid import Span, plan_guides
from mix_worker.scan import (
    Hit,
    ScanRefused,
    ScanUnreachable,
    cut_probe,
    default_classify,
    drop_sandwiched,
    gap_positions,
    gaps_of,
    inside_known,
    StopRequested,
    _details,
    confidence_of,
    hhmmss,
    merge,
    merge_with_hits,
    MIN_PROBE_BYTES,
    PROBE_SECONDS,
    pad_wav,
    probe_times,
    second_pass_order,
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


def cassette_at(offset):
    """CASSETTE heard at another place in the record."""
    return {**CASSETTE, "matches": [{**CASSETTE["matches"][0], "offset": offset}]}


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


class Sandwiched(unittest.TestCase):
    """Spec 019 (the sandwich round): a hit of another song strictly between
    two neighbouring hits of song A at most `gap` seconds apart is dropped."""

    def keys(self, hits):
        return [(h.time, h.entry["metadata"]["shazam_id"]) for h in hits]

    def test_a_x_a_within_the_gap_drops_x_and_merges_a(self):
        kept, dropped = drop_sandwiched([hit(720, "A"), hit(780, "X"), hit(840, "A")], gap=180)
        self.assertEqual(self.keys(kept), [(720, "A"), (840, "A")])
        self.assertEqual(dropped, 1)
        rows = merge(kept, gap=180)
        self.assertEqual([(r["time_in_mix"], r["metadata"]["shazam_id"], r["hits"]) for r in rows], [("00:12:00", "A", 2)])

    def test_a_far_apart_keeps_what_is_between(self):
        kept, dropped = drop_sandwiched([hit(0, "A"), hit(60, "X"), hit(181, "A")], gap=180)
        self.assertEqual(self.keys(kept), [(0, "A"), (60, "X"), (181, "A")])
        self.assertEqual(dropped, 0)
        kept, dropped = drop_sandwiched([hit(0, "A"), hit(60, "X"), hit(180, "A")], gap=180)
        self.assertEqual(self.keys(kept), [(0, "A"), (180, "A")])  # exactly the gap: dropped
        self.assertEqual(dropped, 1)

    def test_two_different_songs_around_keep_x(self):
        kept, dropped = drop_sandwiched([hit(0, "A"), hit(60, "X"), hit(120, "B")], gap=180)
        self.assertEqual(self.keys(kept), [(0, "A"), (60, "X"), (120, "B")])
        self.assertEqual(dropped, 0)

    def test_several_songs_between_are_all_dropped(self):
        kept, dropped = drop_sandwiched([hit(0, "A"), hit(30, "X"), hit(60, "Y"), hit(90, "A")], gap=180)
        self.assertEqual(self.keys(kept), [(0, "A"), (90, "A")])
        self.assertEqual(dropped, 2)

    def test_a_chain_drops_every_filling_and_a_is_one_row(self):
        hits = [hit(0, "A"), hit(60, "X"), hit(120, "A"), hit(180, "Z"), hit(240, "A")]
        kept, dropped = drop_sandwiched(hits, gap=180)
        self.assertEqual(self.keys(kept), [(0, "A"), (120, "A"), (240, "A")])
        self.assertEqual(dropped, 2)
        self.assertEqual([(r["metadata"]["shazam_id"], r["hits"]) for r in merge(kept, gap=180)], [("A", 3)])

    def test_nearest_a_pairs_only(self):
        # X@100 is within 180 s of A@0 and of A@200, but the two A hits
        # around it are 200 s apart: X stays.
        kept, dropped = drop_sandwiched([hit(0, "A"), hit(100, "X"), hit(200, "A")], gap=180)
        self.assertEqual(dropped, 0)

    def test_ties_keep_the_input_order(self):
        hits = [hit(100, "C"), hit(100, "B"), hit(0, "D")]
        kept, dropped = drop_sandwiched(hits, gap=180)
        self.assertEqual(self.keys(kept), [(100, "C"), (100, "B"), (0, "D")])
        self.assertEqual(dropped, 0)
        kept, dropped = drop_sandwiched([hit(0, "A"), hit(60, "Y"), hit(60, "X"), hit(120, "A")], gap=180)
        self.assertEqual(self.keys(kept), [(0, "A"), (120, "A")])
        self.assertEqual(dropped, 2)

    def test_a_hit_at_the_time_of_an_a_hit_is_not_between(self):
        hits = [hit(0, "A"), hit(0, "X"), hit(60, "A"), hit(120, "Y"), hit(120, "A")]
        kept, dropped = drop_sandwiched(hits, gap=180)
        self.assertEqual(self.keys(kept), [(0, "A"), (0, "X"), (60, "A"), (120, "Y"), (120, "A")])
        self.assertEqual(dropped, 0)

    def test_same_shazam_id_with_other_names_is_the_same_song(self):
        a1 = hit(0, "A", title="Song (Radio Edit)")
        a2 = hit(120, "A", title="Song (Extended Mix)")
        kept, dropped = drop_sandwiched([a1, hit(60, "X"), a2], gap=180)
        self.assertEqual(self.keys(kept), [(0, "A"), (120, "A")])
        self.assertEqual(dropped, 1)

    def test_name_key_without_shazam_id(self):
        def named(t, artist, title):
            return Hit(time=t, entry={"song_name": title, "artist": artist, "time_in_mix": hhmmss(t), "confidence": 1.0, "duration": None})

        kept, dropped = drop_sandwiched([named(0, "Artist", "Same"), named(60, "Other", "X"), named(120, " ARTIST ", "same ")], gap=180)
        self.assertEqual([h.time for h in kept], [0, 120])
        self.assertEqual(dropped, 1)

    def test_interleaved_a_b_a_b_drops_the_two_middle_hits(self):
        # Every pair is judged on the hits as they came: B@30 sits between
        # A@0 and A@60, A@60 sits between B@30 and B@90. Both go; the first
        # A and the last B stay (a transition from A to B).
        kept, dropped = drop_sandwiched([hit(0, "A"), hit(30, "B"), hit(60, "A"), hit(90, "B")], gap=180)
        self.assertEqual(self.keys(kept), [(0, "A"), (90, "B")])
        self.assertEqual(dropped, 2)
        self.assertEqual([(r["metadata"]["shazam_id"], r["hits"]) for r in merge(kept, gap=180)], [("A", 1), ("B", 1)])

    def test_the_earliest_hit_always_stays(self):
        kept, dropped = drop_sandwiched([], gap=180)
        self.assertEqual((kept, dropped), ([], 0))
        kept, dropped = drop_sandwiched([hit(0, "B"), hit(30, "A"), hit(60, "B"), hit(90, "A"), hit(120, "B")], gap=180)
        self.assertEqual(self.keys(kept), [(0, "B"), (120, "B")])
        self.assertEqual(dropped, 3)

    def test_scan_drops_x_counts_it_and_keeps_the_raw_hits(self):
        answers = [CASSETTE, OTHER, CASSETTE]

        async def recognise(data, skew):
            return answers.pop(0)

        async def sleep(s):
            pass

        report, lines, raw = {}, [], []
        rows = run(scan(180, step=60, cooldown=0.0, pause=0.0, max_skew=0.0, gap=180, recognise=recognise, cut=lambda t: b"x" * 5000, sleep=sleep, classify=classify, line=lines.append, report=report, hits_out=raw, clock=lambda: 0.0))
        self.assertEqual([(r["time_in_mix"], r["song_name"], r["hits"]) for r in rows], [("00:00:00", "I Will Survive", 2)])
        self.assertEqual(report["sandwiched"], 1)
        self.assertTrue(any("1 finding between two hits of the same song dropped" in x for x in lines))
        self.assertEqual([h.time for h in raw], [0, 60, 120])  # the run state keeps every hit

    def test_scan_without_a_sandwich_reports_zero_and_says_nothing(self):
        answers = [CASSETTE, OTHER]

        async def recognise(data, skew):
            return answers.pop(0)

        async def sleep(s):
            pass

        report, lines = {}, []
        rows = run(scan(120, step=60, cooldown=0.0, pause=0.0, max_skew=0.0, gap=180, recognise=recognise, cut=lambda t: b"x" * 5000, sleep=sleep, classify=classify, line=lines.append, report=report, clock=lambda: 0.0))
        self.assertEqual(len(rows), 2)
        self.assertEqual(report["sandwiched"], 0)
        self.assertFalse(any("between two hits of the same song" in x for x in lines))

    def test_second_pass_hit_between_is_dropped_and_its_stretch_stays_known(self):
        # First pass at 0, 15, 30, 45: A then three misses (no A after, so the
        # second pass runs). Second pass at 22 hears X, at 52 hears A again.
        answers = [CASSETTE, NO_MATCH, NO_MATCH, NO_MATCH, OTHER, CASSETTE]

        async def recognise(data, skew):
            return answers.pop(0)

        async def sleep(s):
            pass

        report = {}
        rows = run(scan(60, step=15, cooldown=0.0, pause=0.0, max_skew=0.0, gap=180, recognise=recognise, cut=lambda t: b"x" * 5000, cut_at=lambda t, s: b"x" * 5000, gap_step=30, speeds=(), sleep=sleep, classify=classify, report=report, clock=lambda: 0.0))
        self.assertEqual([(r["song_name"], r["hits"]) for r in rows], [("I Will Survive", 2)])
        self.assertEqual(report["sandwiched"], 1)
        self.assertEqual(report["gaps"], [(30, 45)])  # 15-30 holds the dropped X: known, not a gap


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
        self.assertEqual(len(lines), 6)
        self.assertEqual(lines[0], "  probe 1/4 · 00:00:00 · cut 4 KB 0.00 s · shazam 0.0 s · NEW · Gloria Gaynor — I Will Survive · USUR10200634 · Polydor · at 1:32 in the track · 0.0 % · 100 %")
        self.assertIn("probe 2/4 · 00:01:00 · cut 4 KB 0.00 s · shazam 0.0 s · same track · Gloria Gaynor", lines[1])
        self.assertEqual(lines[2], "  probe 3/4 · 00:02:00 · cut 4 KB 0.00 s · shazam 0.0 s · no match")
        self.assertEqual(lines[3], "  probe 4/4 · 00:03:00 · cut 4 KB 0.00 s · skipped (undecodable or silent)")
        self.assertEqual(lines[4], "  evidence · 1 out of step")  # spec 029: the cassette holds an offset
        self.assertEqual(lines[5], "  shazam · 3 answers · median 0.0 s · 0 over 5 s (0 %)")

    def test_answer_time_on_each_line_and_in_the_summary(self):
        # Round 005 follow-up: the clock moves 6.8 s during a slow answer, 1.2 s during a fast one.
        now = [0.0]
        answers = [6.8, 1.2, 7.0]
        lines = []

        async def recognise(data, max_skew):
            now[0] += answers.pop(0)
            return NO_MATCH

        async def sleep(s):
            pass

        run(scan(180, step=60, cooldown=0.0, pause=0.0, max_skew=0.0, gap=180, recognise=recognise, cut=lambda t: b"x" * 5000, sleep=sleep, classify=classify, line=lines.append, clock=lambda: now[0]))
        self.assertIn("· shazam 6.8 s · no match", lines[0])
        self.assertIn("· shazam 1.2 s · no match", lines[1])
        self.assertEqual(lines[-1], "  shazam · 3 answers · median 6.8 s · 2 over 5 s (67 %)")

    def test_rate_limit_lines(self):
        responses = [RateLimited(), RateLimited()]
        lines = []

        async def recognise(data, max_skew):
            raise responses.pop(0)

        async def sleep(s):
            pass

        with self.assertRaises(ScanRefused):
            run(scan(60, step=60, cooldown=3.0, pause=300.0, max_skew=0.0, gap=180, recognise=recognise, cut=lambda t: b"x" * 5000, sleep=sleep, classify=classify, line=lines.append, max_pauses=1, clock=lambda: 0.0))
        self.assertEqual(lines, ["  probe 1/1 · 00:00:00 · cut 4 KB 0.00 s · shazam 0.0 s · rate limited (1/1) · pausing 300 s, then this probe again at the same pace", "  probe 1/1 · 00:00:00 · cut 4 KB 0.00 s · rate limited again · giving up after 1 pauses"])


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


OTHER = {**CASSETTE, "track": {**CASSETTE["track"], "key": "1", "title": "Another One", "subtitle": "Someone Else"}}


class GuidedScan(unittest.TestCase):
    """Round 016: TrackId.net spans guide the first pass."""

    SPAN = Span(60, 200, "Gloria Gaynor", "I Will Survive")  # core 70-190: grid 90, 120, 150 are inside

    def setUp(self):
        self.cuts, self.asked, self.sleeps, self.lines = [], [], [], []

    def go(self, answer, duration=300, step=30, spans=None, guided=True, second=False, **kw):
        async def recognise(data, skew):
            self.asked.append(len(self.cuts))
            r = answer(self.cuts[-1]) if callable(answer) else answer
            if isinstance(r, Exception):
                raise r
            return r

        async def sleep(s):
            self.sleeps.append(s)

        def cut(t):
            self.cuts.append(t)
            return b"x" * 5000

        spans = [self.SPAN] if spans is None else spans
        guides = plan_guides(spans, step, 12) if guided else None
        report = {}
        extra = dict(guides=guides, spans=spans) if guided is not None else {}
        rows = run(scan(duration, step=step, cooldown=2.0, pause=0.0, max_skew=0.0, gap=180, recognise=recognise, cut=cut, cut_at=(lambda t, sp: self.cuts.append(t) or b"x" * 5000) if second else None, gap_step=30, speeds=(), sleep=sleep, classify=classify, line=self.lines.append, report=report, **extra, **kw))
        return rows, report

    def plain(self, answer, duration=300, step=30):
        cuts, sleeps, asked = [], [], []

        async def recognise(data, skew):
            asked.append(1)
            return answer(cuts[-1]) if callable(answer) else answer

        async def sleep(s):
            sleeps.append(s)

        def cut(t):
            cuts.append(t)
            return b"x" * 5000

        report = {}
        rows = run(scan(duration, step=step, cooldown=2.0, pause=0.0, max_skew=0.0, gap=180, recognise=recognise, cut=cut, speeds=(), sleep=sleep, classify=classify, report=report))
        return rows, report, cuts, sleeps, asked

    def test_a_no_guides_is_identical(self):
        def answer(t):
            return CASSETTE if t in (0, 30) else NO_MATCH

        rows0, rep0, cuts0, sleeps0, asked0 = self.plain(answer)
        rows1, rep1 = self.go(answer, spans=[], guided=True)  # empty plan: nothing changes
        self.assertEqual(self.cuts, cuts0)
        self.assertEqual(self.sleeps, sleeps0)
        self.assertEqual(len(self.asked), len(asked0))
        self.assertEqual(rows1, rows0)
        self.assertEqual(rep1["gaps"], rep0["gaps"])
        self.assertIsNone(rep1["guided"])
        self.assertEqual(rep1["span_checks"], {})
        self.assertIsNone(rep0.get("guided"))

    def test_b_core_skipped_except_the_one_confirming_probe(self):
        rows, rep = self.go(NO_MATCH)
        grid = [t for t in range(0, 300, 30) if t not in (90, 120, 150)]
        self.assertEqual(self.cuts[:3], [0, 30, 60])
        self.assertEqual(self.cuts[3], 124)  # (60 + 200) / 2 - 6, before the next grid time
        self.assertEqual([t for t in self.cuts if t % 30 == 0 and t < 300][:len(grid)], grid)
        self.assertEqual(len(self.asked), len(grid) + 1)
        self.assertEqual(len(self.sleeps), len(self.asked))  # no sleep for a skipped probe
        self.assertEqual(rep["guided"], {"spans": 1, "skipped_probes": 3})
        self.assertTrue(any("trackid confirm · span 1" in l for l in self.lines))

    def test_b_skipped_probes_count_as_done_and_are_not_misses(self):
        seen = []
        rows, rep = self.go(NO_MATCH, second=True, progress=seen.append, clock=lambda: 0.0, wall=lambda: 1_794_000_000.0)
        self.assertEqual(seen[0]["total"], 10)
        # no second-pass probe (grid + 7) lands in the span's times: 60-200 is covered
        self.assertEqual([t for t in self.cuts if t % 30 == 7 and 60 <= t <= 200], [])
        self.assertTrue(any(t % 30 == 7 for t in self.cuts))
        for start, end in rep["gaps"]:
            self.assertFalse(start < 200 and end > 60)

    def test_c_confirm_answer_goes_to_the_check_not_the_hits(self):
        hits = []
        rows, rep = self.go(lambda t: CASSETTE if t in (124, 0) else NO_MATCH, hits_out=hits)
        self.assertEqual([h.time for h in hits], [0])
        self.assertEqual(rep["span_checks"][0], {"outcome": "agrees"})
        self.assertEqual([r["time_in_mix"] for r in rows], ["00:00:00"])

    def test_c_hit_inside_the_unshrunk_span_is_absorbed_and_outside_stays(self):
        hits = []
        # 60 is inside the span (start edge) but not inside the core: ordinary probe, absorbed
        rows, rep = self.go(lambda t: OTHER if t in (60, 270) else NO_MATCH, hits_out=hits)
        self.assertEqual([h.time for h in hits], [270])
        self.assertEqual(rep["span_checks"][0]["outcome"], "differs")

    def test_d_outcomes(self):
        _, rep = self.go(lambda t: OTHER if t == 124 else NO_MATCH)
        c = rep["span_checks"][0]
        self.assertEqual((c["outcome"], c["artist"], c["song_name"]), ("differs", "Someone Else", "Another One"))
        self.assertIsInstance(c["confidence"], float)
        self.setUp()
        _, rep = self.go(NO_MATCH)
        self.assertEqual(rep["span_checks"][0], {"outcome": "no_match"})
        self.setUp()
        _, rep = self.go(SignatureError("silence"))
        self.assertEqual(rep["span_checks"][0], {"outcome": "not_asked"})

    def test_d_stop_before_the_confirm_is_not_asked(self):
        n = {"c": 0}

        def progress(p):
            n["c"] += 1
            if n["c"] == 2:
                raise StopRequested()

        rows, rep = self.go(lambda t: CASSETTE if t == 0 else NO_MATCH, progress=progress, clock=iter(range(0, 10_000, 100)).__next__)
        self.assertEqual(rep["span_checks"][0]["outcome"], "not_asked")
        self.assertIsNotNone(rep["stopped"])

    def test_e_a_short_core_is_not_guided(self):
        short = Span(60, 120, "Gloria Gaynor", "I Will Survive")  # core 50 s - 20 = 40... use 60-109
        short = Span(60, 109, "Gloria Gaynor", "I Will Survive")  # core 29 s
        self.assertEqual(plan_guides([short], 30, 12), [])
        hits = []
        rows, rep = self.go(lambda t: CASSETTE if t == 90 else NO_MATCH, spans=[short], hits_out=hits)
        self.assertEqual(hits, [])  # the ordinary hit inside the span's times is absorbed
        self.assertEqual(rep["span_checks"][0], {"outcome": "agrees"})
        self.assertIsNone(rep["guided"])
        self.assertEqual([t for t in self.cuts if t % 30 == 0], list(range(0, 300, 30)))

    def test_f_overlapping_spans_share_the_skipped_probes(self):
        a = Span(60, 200, "Gloria Gaynor", "I Will Survive")
        b = Span(100, 240, "Gloria Gaynor", "I Will Survive")
        self.assertEqual([g.span_index for g in plan_guides([a, b], 30, 12)], [0, 1])
        rows, rep = self.go(lambda t: CASSETTE if t in (124, 144) else NO_MATCH, spans=[a, b])
        self.assertEqual(rep["guided"]["spans"], 2)
        self.assertEqual(set(rep["span_checks"]), {0, 1})
        self.assertEqual(rep["span_checks"][0], {"outcome": "agrees"})
        self.assertEqual(rep["span_checks"][1], {"outcome": "agrees"})
        # grid times inside either core are skipped once each
        for t in (90, 120, 150, 180):
            self.assertNotIn(t, self.cuts)

    def test_g_confirm_is_remembered_and_not_asked_again(self):
        remembered = []
        self.go(lambda t: CASSETTE if t == 124 else NO_MATCH, remember=lambda k, key, e: remembered.append((k, key, e is not None)))
        self.assertIn(("confirm", "0", True), remembered)
        self.assertNotIn(("first", "90", False), remembered)  # skipped probes remember nothing
        self.setUp()
        _, rep = self.go(NO_MATCH, resume={"confirm": {"0": dict(track_entry(CASSETTE, "00:02:04"))}, "first": {}})
        self.assertNotIn(124, self.cuts)
        self.assertEqual(rep["span_checks"][0], {"outcome": "agrees"})

    def test_h_refusal_and_cooldown_unchanged(self):
        with self.assertRaises(ScanRefused):
            self.go(RateLimited(), max_pauses=1, spans=[])  # no spans: nothing changed
        self.assertTrue(all(s in (2.0, 0.0) for s in self.sleeps))
        self.setUp()
        rows, rep = self.go(lambda t: CASSETTE if t == 0 else NO_MATCH)
        self.assertTrue(all(s == 2.0 for s in self.sleeps))

    def test_i_a_refusal_or_stop_with_spans_returns_instead_of_raising(self):
        # Batch E ruling: with spans the rows come from the record, so nothing found is not a failure.
        rows, rep = self.go(RateLimited(), max_pauses=1)
        self.assertEqual(rows, [])
        self.assertEqual(rep["stopped"]["reason"], "rate limited")
        self.assertEqual(rep["span_checks"][0]["outcome"], "not_asked")
        self.setUp()
        rows, rep = self.go(NO_MATCH, progress=lambda p: (_ for _ in ()).throw(StopRequested()), clock=iter(range(0, 10_000, 100)).__next__)
        self.assertEqual(rep["stopped"]["reason"], "by you")

    def test_j_trackid_rows_keep_the_f15_pin_with_the_optional_fields(self):
        from mix_worker.trackid import span_rows

        with tempfile.TemporaryDirectory() as tmp:
            rows = span_rows([Span(616, 857, "Kyntral", "Yuco", "Kyntral", 31)], {0: {"outcome": "agrees"}}, "temple-rat")
            data = write_result(Path(tmp) / "o.json", title="t", artist=None, audio_filename="a", source_url="u", duration=None, date="d", tracks=rows)
        self.assertEqual(data["tracks"][0], {
            "song_name": "Yuco", "artist": "Kyntral", "time_in_mix": "00:10:16", "origin": "trackid",
            "trackid": {"slug": "temple-rat", "span_start": 616, "span_end": 857, "references": 31},
            "shazam_check": {"outcome": "agrees"}, "metadata": {"label": "Kyntral"}, "hits": 0,
        })


    def test_k_same_track_probe_overlapping_the_span_is_absorbed(self):
        span = Span(69, 230, "Gloria Gaynor", "I Will Survive")  # the probe at 60 covers 60-72: 9 s before the span
        hits = []
        rows, rep = self.go(lambda t: CASSETTE if t == 60 else NO_MATCH, spans=[span], hits_out=hits)
        self.assertEqual(hits, [])
        self.assertEqual([r for r in rows if r["origin"] != "trackid"], [])
        self.assertEqual(rep["span_checks"][0], {"outcome": "agrees"})

    def test_k_another_spelling_of_the_spans_track_is_absorbed_by_the_overlap_rule(self):
        # Worker 0.7.6: TrackId.net wrote the same record another way; the probe at 60 still names the span's track.
        span = Span(69, 230, "Glo:ria Gaynor", "I Will Survive (Remastered)")
        hits = []
        rows, rep = self.go(lambda t: CASSETTE if t == 60 else NO_MATCH, spans=[span], hits_out=hits)
        self.assertEqual(hits, [])
        self.assertEqual(rep["span_checks"][0], {"outcome": "agrees"})

    def test_k_another_track_is_absorbed_only_when_the_window_center_is_inside(self):
        hits = []
        # probe 60 covers 60-72, center 66: outside [75, 230) -> a neighbour's tail stays a row
        self.go(lambda t: OTHER if t == 60 else NO_MATCH, spans=[Span(75, 230, "Gloria Gaynor", "I Will Survive")], hits_out=hits)
        self.assertEqual([h.time for h in hits], [60])
        self.setUp()
        hits = []
        self.go(lambda t: OTHER if t == 60 else NO_MATCH, spans=[Span(66, 230, "Gloria Gaynor", "I Will Survive")], hits_out=hits)
        self.assertEqual(hits, [])

    def test_k_abutting_spans_never_both_absorb_one_hit(self):
        a, b = Span(60, 120, "Gloria Gaynor", "I Will Survive"), Span(120, 180, "Gloria Gaynor", "I Will Survive")
        hits = []
        # step 6: the probe at 114 covers 114-126, center 120: half-open spans, so B only
        _, rep = self.go(lambda t: OTHER if t == 114 else NO_MATCH, step=6, spans=[a, b], guided=False, hits_out=hits)
        self.assertEqual(hits, [])
        self.assertEqual(rep["span_checks"][0], {"outcome": "no_match"})
        self.assertEqual(rep["span_checks"][1]["outcome"], "differs")

    def test_l_the_confirm_comes_even_when_the_step_is_wide(self):
        for step in (30, 60):
            self.setUp()
            _, rep = self.go(lambda t: CASSETTE if t == 84 else NO_MATCH, step=step, spans=[Span(60, 120, "Gloria Gaynor", "I Will Survive")], guided=True, **{})
            self.assertEqual(self.cuts.count(84), 1, step)
            self.assertEqual(rep["span_checks"][0], {"outcome": "agrees"}, step)

    def test_l_two_overlapping_spans_both_get_their_confirm_at_step_60(self):
        a = Span(60, 200, "Gloria Gaynor", "I Will Survive")
        b = Span(100, 240, "Gloria Gaynor", "I Will Survive")
        _, rep = self.go(lambda t: OTHER if t in (124, 164) else NO_MATCH, step=60, spans=[a, b])
        self.assertEqual((self.cuts.count(124), self.cuts.count(164)), (1, 1))
        self.assertLess(self.cuts.index(124), self.cuts.index(164))
        self.assertEqual(rep["span_checks"][0]["outcome"], "differs")

    def test_l_a_confirm_for_the_end_of_the_loop_is_still_made(self):
        # the only grid probe after the confirm time is past the audio: the remaining guide is confirmed after the loop
        _, rep = self.go(lambda t: CASSETTE if t == 84 else NO_MATCH, duration=61, step=60, spans=[Span(60, 120, "Gloria Gaynor", "I Will Survive")])
        self.assertEqual(self.cuts.count(84), 1)

    def test_m_an_undecodable_confirm_is_not_remembered(self):
        remembered = []
        _, rep = self.go(SignatureError("silence"), remember=lambda k, key, e: remembered.append(k))
        self.assertNotIn("confirm", remembered)
        self.assertEqual(rep["span_checks"][0], {"outcome": "not_asked"})
        self.setUp()
        remembered = []
        self.go(NO_MATCH, remember=lambda k, key, e: remembered.append(k))
        self.assertIn("confirm", remembered)  # an answered "no match" is remembered

    # Spec 029, User Story 3: the check asks again at the second-pass speeds when normal speed does not agree.
    # speeds (0.91, 1.09): second_pass_order gives ×1, ×0.91, ×1.09, so the retries come at ×0.91 then ×1.09.
    THIRD = {"matches": [{"id": "3", "offset": 10.0, "timeskew": 0.0, "frequencyskew": 0.0}],
             "track": {"key": "3", "title": "Third Tune", "subtitle": "Nobody Known"}}  # 100 %, above OTHER's

    def retry(self, by, gap_step=30, with_cut_at=True, resume=None, short=(), span=None):
        """A guided scan whose probes say `t@speed`; `by[(t, speed)]` answers, else no match; a `(t, speed)` in
        `short` is cut shorter than MIN_PROBE_BYTES. Returns the report, the calls made at the confirm time 124
        (in order) and every call."""
        span = span or self.SPAN
        calls, state = [], {}

        async def recognise(data, skew):
            t, speed = data.rstrip().decode().split("@")
            calls.append((int(t), float(speed)))
            r = by.get((int(t), float(speed)), NO_MATCH)
            if isinstance(r, Exception):
                raise r
            return r

        async def sleep(s):
            pass

        def probe(t, speed):
            if (t, speed) in short:
                return b"x" * (MIN_PROBE_BYTES - 1)
            return f"{t}@{speed:g}".encode().ljust(5000)

        def remember(kind, key, entry):
            state.setdefault(kind, {})[key] = entry

        report = {}
        run(scan(300, step=30, cooldown=0.0, pause=0.0, max_skew=0.0, gap=180, recognise=recognise,
                 cut=lambda t: probe(t, 1.0), cut_at=probe if with_cut_at else None, gap_step=gap_step, speeds=(0.91, 1.09),
                 sleep=sleep, classify=classify, line=self.lines.append, report=report, clock=lambda: 0.0,
                 guides=plan_guides([span], 30, 12), spans=[span], remember=remember, resume=resume))
        self.state = state
        return report, [c for c in calls if c[0] == 124], calls

    def test_n_another_spelling_of_the_spans_track_agrees_and_asks_nothing_more(self):
        # Worker 0.7.6: normal speed heard the span's record under Shazam's spelling: it agrees, no retry is spent.
        span = Span(60, 200, "Glo:ria Gaynor", "I Will Survive (Remastered)")
        rep, at, _ = self.retry({(124, 1.0): CASSETTE, (124, 0.91): OTHER, (124, 1.09): OTHER}, span=span)
        self.assertEqual(rep["span_checks"][0], {"outcome": "agrees"})
        self.assertEqual(at, [(124, 1.0)])

    def test_n_a_retry_in_another_spelling_is_the_one_absorbed(self):
        span = Span(60, 200, "Glo:ria Gaynor", "I Will Survive (Remastered)")
        rep, at, _ = self.retry({(124, 1.0): OTHER, (124, 0.91): CASSETTE, (124, 1.09): OTHER}, span=span)
        self.assertEqual(rep["span_checks"][0], {"outcome": "agrees"})
        self.assertEqual(at, [(124, 1.0), (124, 0.91)])

    # Worker 0.7.6: a row's level also counts the hits of its track that a span took (they make no row).
    # Grid 0, 30, 60: the probe at 30 ends at 42, before the span (60-200): a row. The probe at 60 overlaps the
    # span and names its track: absorbed. The two are 30 s apart.
    def lead_in(self, second_offset, **kw):
        by = {30: cassette_at(130.0), 60: cassette_at(second_offset)}
        rows, rep = self.go(lambda t: by.get(t, NO_MATCH), **kw)
        self.assertEqual(rep["span_checks"][0], {"outcome": "agrees"})
        return [(r["time_in_mix"], r["hits"], r.get("evidence")) for r in rows]

    def test_o_a_hit_the_span_took_in_step_makes_the_lead_in_row_solid(self):
        self.assertEqual(self.lead_in(160.0), [("00:00:30", 1, "solid")])

    def test_o_a_hit_the_span_took_out_of_step_leaves_the_row_heard_once(self):
        self.assertEqual(self.lead_in(200.0), [("00:00:30", 1, "once")])

    def test_o_the_check_probes_answer_counts_too(self):
        # Span 100-180: its check probe is at 134. The probe at 180 starts where the span ends: a row, 46 s later.
        span = Span(100, 180, "Gloria Gaynor", "I Will Survive")
        by = {134: cassette_at(100.0), 180: cassette_at(146.0)}
        rows, rep = self.go(lambda t: by.get(t, NO_MATCH), spans=[span])
        self.assertEqual(rep["span_checks"][0], {"outcome": "agrees"})
        self.assertEqual([(r["time_in_mix"], r["hits"], r.get("evidence")) for r in rows], [("00:03:00", 1, "solid")])

    def test_o_a_hit_of_another_track_a_span_took_counts_for_that_track(self):
        # OTHER is heard at 30 (a row) and again at 60, where the span starts: the span takes it ("differs").
        other = lambda offset: {**OTHER, "matches": [{**OTHER["matches"][0], "offset": offset}]}
        by = {30: other(20.0), 60: other(50.0)}
        rows, rep = self.go(lambda t: by.get(t, NO_MATCH), spans=[Span(66, 230, "Gloria Gaynor", "I Will Survive")])
        self.assertEqual(rep["span_checks"][0]["outcome"], "differs")
        self.assertEqual([(r["time_in_mix"], r["hits"], r.get("evidence")) for r in rows], [("00:00:30", 1, "solid")])

    def test_o_a_saved_entry_without_a_name_pairs_with_nothing_and_breaks_nothing(self):
        rows, rep = self.go(lambda t: cassette_at(130.0) if t == 30 else NO_MATCH, resume={"confirm": {"0": {"song_name": "No Artist"}}})
        self.assertEqual([(r["time_in_mix"], r.get("evidence")) for r in rows], [("00:00:30", "once")])
        self.assertEqual(rep["span_checks"][0]["outcome"], "differs")

    def test_o_the_span_hits_count_again_on_a_resumed_run(self):
        state = {}
        first = self.lead_in(160.0, remember=lambda kind, key, entry: state.setdefault(kind, {}).__setitem__(key, entry))
        self.setUp()
        rows, _ = self.go(NO_MATCH, resume=state)  # nothing is asked again: every probe comes from the saved run
        self.assertEqual(self.asked, [])
        self.assertEqual([(r["time_in_mix"], r["hits"], r.get("evidence")) for r in rows], first)

    def test_n_the_check_asks_again_at_each_speed_until_one_agrees(self):
        rep, at, _ = self.retry({(124, 1.0): OTHER, (124, 0.91): OTHER, (124, 1.09): CASSETTE})
        self.assertEqual(rep["span_checks"][0], {"outcome": "agrees"})
        self.assertEqual(at, [(124, 1.0), (124, 0.91), (124, 1.09)])  # two extra calls, in second_pass_order

    def test_n_normal_speed_agrees_no_extra_call(self):
        rep, at, _ = self.retry({(124, 1.0): CASSETTE, (124, 0.91): OTHER, (124, 1.09): OTHER})
        self.assertEqual(rep["span_checks"][0], {"outcome": "agrees"})
        self.assertEqual(at, [(124, 1.0)])

    def test_n_no_speed_agrees_differs_keeps_what_normal_speed_heard(self):
        rep, at, _ = self.retry({(124, 1.0): OTHER, (124, 0.91): self.THIRD, (124, 1.09): self.THIRD})
        c = rep["span_checks"][0]
        self.assertEqual((c["outcome"], c["artist"], c["song_name"]), ("differs", "Someone Else", "Another One"))
        self.assertEqual(len(at), 3)  # exactly two extra calls

    def test_n_normal_speed_silent_then_the_first_retry_agrees(self):
        rep, at, _ = self.retry({(124, 0.91): CASSETTE})
        self.assertEqual(rep["span_checks"][0], {"outcome": "agrees"})
        self.assertEqual(at, [(124, 1.0), (124, 0.91)])

    def test_n_no_retry_when_the_second_pass_is_off(self):
        for kw in ({"gap_step": 0}, {"with_cut_at": False}):
            self.setUp()
            rep, at, _ = self.retry({(124, 1.0): OTHER, (124, 0.91): CASSETTE, (124, 1.09): CASSETTE}, **kw)
            self.assertEqual(at, [(124, 1.0)], kw)
            self.assertEqual(rep["span_checks"][0]["outcome"], "differs", kw)

    def test_n_an_answered_retry_is_remembered_and_a_resumed_run_asks_nothing_again(self):
        by = {(124, 1.0): OTHER, (124, 0.91): OTHER, (124, 1.09): CASSETTE}
        rep, _, _ = self.retry(by)
        self.assertEqual(set(self.state["confirm"]), {"0", "0@0.91", "0@1.09"})
        self.assertEqual(self.state["confirm"]["0@1.09"]["song_name"], "I Will Survive")
        resume = self.state
        self.setUp()
        rep2, at, calls = self.retry(by, resume=resume)
        self.assertEqual(calls, [])
        self.assertEqual(rep2["span_checks"], rep["span_checks"])
        # every retry stored as not agreeing: still nothing asked, the outcome still "differs"
        stored = {**resume, "confirm": {"0": dict(track_entry(OTHER, "00:02:04")), "0@0.91": None, "0@1.09": dict(track_entry(self.THIRD, "00:02:04"))}}
        self.setUp()
        rep3, _, calls = self.retry(by, resume=stored)
        self.assertEqual(calls, [])
        self.assertEqual(rep3["span_checks"][0]["artist"], "Someone Else")

    def test_n_a_resumed_run_asks_the_retries_not_yet_stored(self):
        by = {(124, 0.91): OTHER, (124, 1.09): CASSETTE}
        rep, at, _ = self.retry(by, resume={"confirm": {"0": dict(track_entry(OTHER, "00:02:04")), "0@0.91": None}})
        self.assertEqual(at, [(124, 1.09)])
        self.assertEqual(rep["span_checks"][0], {"outcome": "agrees"})

    def test_n_a_retry_cut_too_short_is_skipped_and_the_next_speed_is_asked(self):
        rep, at, _ = self.retry({(124, 1.0): OTHER, (124, 1.09): CASSETTE}, short=((124, 0.91),))
        self.assertEqual(at, [(124, 1.0), (124, 1.09)])  # ×0.91 not asked
        self.assertEqual(set(self.state["confirm"]), {"0", "0@1.09"})  # nor remembered
        self.assertEqual(rep["span_checks"][0], {"outcome": "agrees"})

    def test_n_a_stop_inside_a_retry_leaves_the_scan_as_in_the_first_pass(self):
        rep, at, _ = self.retry({(124, 1.0): OTHER, (124, 0.91): StopRequested()})
        self.assertEqual(rep["stopped"]["reason"], "by you")  # with spans: returned, not raised (test_i)
        self.assertEqual(at, [(124, 1.0), (124, 0.91)])  # nothing asked after the stop
        # the normal-speed entry was remembered before the retry was asked; the stopped retry is not
        self.assertEqual(set(self.state["confirm"]), {"0"})
        self.assertEqual(self.state["confirm"]["0"]["artist"], "Someone Else")

    def test_n_the_retry_log_line_holds_the_speed_and_the_heard_position(self):
        self.retry({(124, 1.0): OTHER, (124, 0.91): NO_MATCH, (124, 1.09): CASSETTE})
        confirm = [l for l in self.lines if "trackid confirm" in l]
        self.assertEqual(len(confirm), 3)
        self.assertTrue(confirm[0].startswith("  trackid confirm · span 1 · 00:02:04 · shazam "), confirm[0])
        self.assertIn("at 1:32 in the track", confirm[0])  # the normal-speed entry holds `heard` too
        self.assertTrue(confirm[1].startswith("  trackid confirm · span 1 · 00:02:04 ×0.91 · shazam "), confirm[1])
        self.assertTrue(confirm[1].endswith(" · no match"), confirm[1])
        self.assertTrue(confirm[2].startswith("  trackid confirm · span 1 · 00:02:04 ×1.09 · shazam "), confirm[2])
        self.assertIn("Gloria Gaynor — I Will Survive · USUR10200634 · Polydor · at 1:32 in the track", confirm[2])


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
        # 6 first-pass probes, all no match; places 7, 37, 67, heard speed by
        # speed (round 004, R6): ×1 at 7, 37, 67 (67 hits); ×0.96 at 7 (hits,
        # same track), 37; ×1.04 at 37.
        answers = [NO_MATCH] * 6 + [NO_MATCH, NO_MATCH, CASSETTE, CASSETTE, NO_MATCH, NO_MATCH]
        asked_cuts = []

        async def recognise(data, skew):
            return answers.pop(0)

        def cut_at(t, speed):
            asked_cuts.append((t, speed))
            return b"x" * 5000

        report = {}
        lines = []
        rows = run(scan(90, recognise=recognise, cut=lambda t: b"x" * 5000, cut_at=cut_at, report=report, line=lines.append, **self.kw()))
        self.assertEqual(asked_cuts, [(7, 1.0), (37, 1.0), (67, 1.0), (7, 0.96), (37, 0.96), (37, 1.04)])
        self.assertEqual(rows[0]["origin"], "replay")
        self.assertEqual(rows[0]["speed_percent"], -4)  # the row starts at the ×0.96 hit, at 7 s
        self.assertEqual(report["second_pass"], {"places": 3, "found": 1, "stopped": None})
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


def wav_of(seconds: float, rate: int = 16000) -> bytes:
    """An invented mono 16-bit WAV: a non-zero pattern, `seconds` long."""
    import io
    import wave

    frames = round(seconds * rate)
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(bytes((i % 251) + 1 for i in range(frames * 2)))
    return out.getvalue()


def wav_read(data: bytes):
    import io
    import wave

    with wave.open(io.BytesIO(data), "rb") as w:
        return w.getparams(), w.readframes(w.getnframes())


class PadWav(unittest.TestCase):
    """Spec 029, FR-007: a probe shorter than 12 s is filled with silence."""

    def test_short_wav_is_filled_with_zeros_to_twelve_seconds(self):
        short = wav_of(7)
        params, samples = wav_read(short)
        padded = pad_wav(short)
        out_params, out_samples = wav_read(padded)
        self.assertEqual(PROBE_SECONDS, 12)
        self.assertEqual(out_params.nframes, 12 * 16000)
        self.assertEqual(
            (out_params.nchannels, out_params.sampwidth, out_params.framerate),
            (params.nchannels, params.sampwidth, params.framerate),
        )
        self.assertEqual(out_samples[: len(samples)], samples)
        self.assertEqual(out_samples[len(samples):], bytes(5 * 16000 * 2))

    def test_twelve_seconds_come_back_byte_for_byte(self):
        full = wav_of(12)
        self.assertEqual(pad_wav(full), full)
        longer = wav_of(13)
        self.assertEqual(pad_wav(longer), longer)

    def test_no_audio_stays_no_audio(self):
        for data in (b"", b"RIFF", b"x" * (MIN_PROBE_BYTES - 1), wav_of(0)):
            self.assertLess(len(data), MIN_PROBE_BYTES)
            self.assertEqual(pad_wav(data), data)

    def test_bytes_that_are_not_a_wav_come_back_and_nothing_raises(self):
        broken = wav_of(7)
        for data in (b"x" * 5000, b"RIFF" + b"x" * 2000, broken[:20] + b"\xff" * 3000, b"\x00" * 5000):
            self.assertEqual(pad_wav(data), data)


class CutProbePads(unittest.TestCase):
    def cut_with(self, written: bytes, seconds: int = 12) -> bytes:
        import subprocess
        import tempfile
        from unittest import mock

        with tempfile.TemporaryDirectory() as tmp:
            audio = Path(tmp) / "a.m4a"
            audio.write_bytes(b"x")

            def fake_run(cmd, **kw):
                Path(cmd[-1]).write_bytes(written)
                return subprocess.CompletedProcess(cmd, 0, b"", b"")

            with mock.patch("mix_worker.scan.subprocess.run", fake_run):
                return cut_probe("ffmpeg", audio, 60, seconds)

    def test_a_short_cut_comes_back_twelve_seconds_long(self):
        params, _ = wav_read(self.cut_with(wav_of(7)))
        self.assertEqual(params.nframes, 12 * 16000)

    def test_the_pad_target_is_twelve_seconds_whatever_the_probe_length(self):
        params, _ = wav_read(self.cut_with(wav_of(8), seconds=8))
        self.assertEqual(params.nframes, 12 * 16000)

    def test_a_full_cut_comes_back_untouched(self):
        full = wav_of(12)
        self.assertEqual(self.cut_with(full), full)

    def test_a_cut_with_no_audio_stays_under_the_floor(self):
        self.assertEqual(self.cut_with(wav_of(0)), wav_of(0))
        self.assertLess(len(self.cut_with(wav_of(0))), MIN_PROBE_BYTES)


class SecondPassOrder(unittest.TestCase):
    def test_normal_speed_first_by_default(self):
        self.assertEqual(second_pass_order((0.96, 1.04)), (1.0, 0.96, 1.04))
        self.assertEqual(second_pass_order(()), (1.0,))

    def test_listing_normal_speed_keeps_its_place(self):
        self.assertEqual(second_pass_order((0.91, 1.09, 1.0)), (0.91, 1.09, 1.0))

    def test_second_pass_hears_the_listed_order(self):
        speeds_heard = []

        async def recognise(data, skew):
            return NO_MATCH

        async def sleep(s):
            pass

        def cut_at(t, speed):
            speeds_heard.append(speed)
            return b"x" * 5000

        run(scan(60, step=15, cooldown=0.0, pause=0.0, max_skew=0.0, gap=180, recognise=recognise, cut=lambda t: b"x" * 5000, cut_at=cut_at, speeds=(0.91, 1.09, 1.0), sleep=sleep, classify=classify, clock=lambda: 0.0))
        firsts = [s for i, s in enumerate(speeds_heard) if i == 0 or s != speeds_heard[i - 1]]
        self.assertEqual(firsts, [0.91, 1.09, 1.0])


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


class Round004Scan(unittest.TestCase):
    def base(self, **over):
        async def sleep(s):
            self.sleeps.append(s)

        kw = dict(step=15, cooldown=0.0, pause=0.0, max_skew=0.0, gap=180, sleep=sleep, classify=classify, clock=lambda: 0.0, wall=lambda: 1_794_000_000.0)
        kw.update(over)
        return kw

    def setUp(self):
        self.sleeps = []

    def test_progress_at_each_step_change_and_counts(self):
        seen = []

        async def recognise(data, skew):
            return NO_MATCH

        run(scan(60, recognise=recognise, cut=lambda t: b"x" * 5000, cut_at=lambda t, s: b"x" * 5000, speeds=(), progress=seen.append, **self.base()))
        steps = [(p["step"], p["done"], p["total"]) for p in seen]
        self.assertEqual(steps[0], ("first", 1, 4))  # first call: published (never before)
        self.assertIn(("second ×1", 0, 2), steps)
        self.assertEqual(seen[0]["percent"], 25)
        self.assertEqual(seen[0]["at"], "2026-11-06T21:20:00Z")

    def test_stop_keeps_the_hits(self):
        answers = [CASSETTE, NO_MATCH, NO_MATCH, NO_MATCH]
        calls = {"n": 0}

        async def recognise(data, skew):
            return answers.pop(0)

        def progress(p):
            calls["n"] += 1
            if calls["n"] == 2:
                raise StopRequested()

        clock = iter(range(0, 10_000, 100))
        report = {}
        rows = run(scan(60, recognise=recognise, cut=lambda t: b"x" * 5000, progress=progress, report=report, **self.base(clock=lambda: next(clock))))
        self.assertEqual(len(rows), 1)
        self.assertEqual(report["stopped"]["reason"], "by you")

    def test_stop_during_a_refusal_pause_is_seen_within_a_slice(self):
        answers = [CASSETTE, RateLimited(), NO_MATCH]

        async def recognise(data, skew):
            r = answers.pop(0)
            if isinstance(r, Exception):
                raise r
            return r

        def progress(p):
            if p["step"] == "paused" and p["paused_until"] and len(self.sleeps) > 2:
                raise StopRequested()

        report = {}
        run(scan(30, recognise=recognise, cut=lambda t: b"x" * 5000, progress=progress, report=report, **self.base(pause=360.0)))
        self.assertEqual(report["stopped"]["reason"], "by you")
        self.assertLess(sum(self.sleeps), 100)  # not the full 6 minutes

    def test_refusals_close_together_warn_once(self):
        answers = [RateLimited(), NO_MATCH, RateLimited(), NO_MATCH, RateLimited(), NO_MATCH]
        lines = []

        async def recognise(data, skew):
            r = answers.pop(0)
            if isinstance(r, Exception):
                raise r
            return r

        report = {}
        run(scan(45, recognise=recognise, cut=lambda t: b"x" * 5000, line=lines.append, report=report, warn_calls=150, max_pauses=8, **self.base()))
        self.assertEqual(report["warnings"], ["refuses often"])
        self.assertEqual(sum("are you on a VPN" in x for x in lines), 1)

    def test_resume_skips_what_the_stopped_run_heard(self):
        asked = []

        async def recognise(data, skew):
            return CASSETTE

        def cut(t):
            asked.append(t)
            return b"x" * 5000

        hit = track_entry(CASSETTE, "00:00:00")
        remembered = []
        report = {}
        rows = run(scan(60, recognise=recognise, cut=cut, resume={"first": {"0": hit, "15": None}}, remember=lambda k, key, e: remembered.append((k, key)), report=report, **self.base()))
        self.assertEqual(asked, [30, 45])
        self.assertEqual(report["resumed"], {"probes_kept": 2, "from": "00:00:15"})
        self.assertEqual(remembered, [("first", "30"), ("first", "45")])
        self.assertEqual(rows[0]["hits"], 3)


def answer(key, offset, timeskew=0.0, frequencyskew=0.0, entries=1, title=None, isrc=None):
    """An invented Shazam answer: `entries` matches, the first with this position and these skews."""
    first = {"id": f"m{key}", "timeskew": timeskew, "frequencyskew": frequencyskew}
    if offset is not None:
        first["offset"] = offset
    track = {"key": key, "title": title or f"Tune {key}", "subtitle": "Invented Artist"}
    if isrc:
        track["isrc"] = isrc
    return {"matches": [first] + [{"id": f"m{key}-{i}"} for i in range(1, entries)], "track": track}


class Evidence(unittest.TestCase):
    """Spec 029, User Story 1: the scan keeps what Shazam says of a hit and grades its rows."""

    LEVEL_FIELDS = ("evidence", "mix_speed_percent", "candidates")

    def go(self, duration, by_probe, step=15, second=False, speeds=(1.09,), plain=False):
        """A scan whose fake `recognise` answers per probe: `by_probe[(t, speed)]`, else no match."""
        calls = []

        def strip(r):  # the same answer without a position: the scan of today
            return {**r, "matches": [{k: v for k, v in m.items() if k != "offset"} for m in r["matches"]]}

        async def recognise(data, skew):
            t, speed = data.rstrip().decode().split("@")
            calls.append((int(t), float(speed)))
            r = by_probe.get((int(t), float(speed)), NO_MATCH)
            return strip(r) if plain and r is not NO_MATCH else r

        async def sleep(s):
            pass

        def probe(t, speed):
            return f"{t}@{speed:g}".encode().ljust(5000)

        extra = dict(cut_at=probe, gap_step=30, gap_offset=7, speeds=speeds) if second else {}
        rows = run(scan(duration, step=step, cooldown=0.0, pause=0.0, max_skew=0.0, gap=180, recognise=recognise,
                        cut=lambda t: probe(t, 1.0), sleep=sleep, classify=classify, clock=lambda: 0.0, probe_seconds=12, **extra))
        return rows, calls

    def levels(self, rows):
        return [(r["song_name"], r.get("evidence")) for r in rows]

    # The second-pass case: four first-pass misses (0, 30, 60, 90), places 7, 37, 67, 97 at ×1 then ×1.09;
    # the track plays 6 % slow, so a ×1.09 re-cut has timeskew 0.94 × 1.09 − 1.
    SLOW = {(67, 1.09): answer("S", 40.0, timeskew=0.94 * 1.09 - 1), (97, 1.09): answer("S", 68.2, timeskew=0.94 * 1.09 - 1)}

    def test_1_solid_on_the_first_pass(self):
        rows, _ = self.go(45, {(15, 1.0): answer("A", 60.0), (30, 1.0): answer("A", 75.0)})
        self.assertEqual(len(rows), 1)
        self.assertEqual((rows[0]["evidence"], rows[0]["mix_speed_percent"], rows[0]["candidates"], rows[0]["hits"]), ("solid", 0.0, 1, 2))

    def test_2_solid_on_second_pass_hits_at_the_speed_in_the_mix(self):
        rows, calls = self.go(120, self.SLOW, step=30, second=True)
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual((row["evidence"], row["mix_speed_percent"], row["origin"], row["speed_percent"], row["hits"]), ("solid", -6.0, "replay", 9, 2))
        self.assertEqual(len(calls), 4 + 4 + 4)  # every probe asked once, as before

    def test_3_out_of_step(self):
        rows, _ = self.go(60, {(0, 1.0): answer("A", 30.0), (30, 1.0): answer("A", 30.4)}, step=30)
        self.assertEqual(self.levels(rows), [("Tune A", "out_of_step")])

    def test_5_many_candidates(self):
        rows, _ = self.go(30, {(0, 1.0): answer("A", 50.0, entries=12)})
        self.assertEqual((rows[0]["evidence"], rows[0]["candidates"]), ("candidates", 12))

    def test_6_heard_once(self):
        rows, _ = self.go(30, {(0, 1.0): answer("A", 50.0)})
        self.assertEqual((rows[0]["evidence"], rows[0]["candidates"]), ("once", 1))

    def test_a_first_hit_without_a_position_gives_a_row_without_the_three_fields(self):
        rows, _ = self.go(45, {(15, 1.0): answer("A", None), (30, 1.0): answer("A", 75.0)})
        self.assertEqual(len(rows), 1)
        for name in self.LEVEL_FIELDS:
            self.assertNotIn(name, rows[0])

    def test_rows_hits_confidence_origin_and_speed_are_those_of_today_and_no_row_holds_heard(self):
        by_probe = {
            **self.SLOW,
            (0, 1.0): answer("A", 60.0, timeskew=0.002, frequencyskew=-0.004),
            (30, 1.0): answer("A", 90.0, timeskew=-0.001),
            (150, 1.0): answer("B", 10.0, entries=12),
            (180, 1.0): answer("C", 5.0),
            (210, 1.0): answer("C", 5.2),
        }
        # A at 0 and 30, misses at 60, 90, 120 (second pass: S at 67 and 97 at ×1.09), B at 150, C at 180 and 210.
        rows, calls = self.go(240, by_probe, step=30, second=True)
        today, today_calls = self.go(240, by_probe, step=30, second=True, plain=True)
        self.assertEqual(calls, today_calls)  # the same Shazam calls (SC-001)
        for row in today:
            for name in (*self.LEVEL_FIELDS, "heard"):
                self.assertNotIn(name, row)
        self.assertEqual([{k: v for k, v in r.items() if k not in self.LEVEL_FIELDS} for r in rows], today)
        self.assertEqual(self.levels(rows), [("Tune A", "solid"), ("Tune S", "solid"), ("Tune B", "candidates"), ("Tune C", "out_of_step")])
        for row in rows:
            self.assertNotIn("heard", row)

    def test_merge_of_hits_holding_heard_returns_rows_without_it(self):
        heard = {"offset": 1.0, "timeskew": 0.0, "frequencyskew": 0.0, "matches": 1, "speed": 1.0}
        a, b = hit(0, "A"), hit(60, "A")
        a.entry["heard"], b.entry["heard"] = dict(heard), dict(heard)
        rows = merge([a, b], gap=180)
        self.assertEqual(len(rows), 1)
        self.assertNotIn("heard", rows[0])
        self.assertIn("heard", a.entry)  # the hit keeps its evidence

    def test_merge_with_hits_gives_each_row_its_hits_in_time_order(self):
        hits = [hit(120, "B"), hit(0, "A"), hit(60, "A"), hit(300, "A")]
        out = merge_with_hits(hits, gap=180)
        self.assertEqual([row for row, _ in out], merge(hits, gap=180))
        self.assertEqual([[h.time for h in hs] for _, hs in out], [[0, 60], [120], [300]])

    def test_one_full_row_pinned(self):
        skew = 0.923 * 1.09 - 1  # the track plays 7.7 % slow, heard on a ×1.09 re-cut
        first = answer("P", 40.0, timeskew=skew, title="Track", isrc="XX0000000000")
        later = answer("P", 40.0 + 30 * 0.923, timeskew=skew, title="Track", isrc="XX0000000000")
        rows, _ = self.go(120, {(67, 1.09): first, (97, 1.09): later}, step=30, second=True)
        self.assertEqual(rows, [{
            "song_name": "Track", "artist": "Invented Artist", "time_in_mix": "00:01:07",
            "confidence": confidence_of(first["matches"][0]), "duration": None,
            "metadata": {"isrc": "XX0000000000", "shazam_id": "P"},
            "origin": "replay", "speed_percent": 9, "hits": 2,
            "evidence": "solid", "mix_speed_percent": -7.7, "candidates": 1,
        }])


RUN_LINK = "https://example.com/invented-set"
RUN_SETTINGS = {"step": 30, "probe_seconds": 12}


class EvidenceResume(unittest.TestCase):
    """Spec 029, T009: the evidence of a hit survives a stopped and resumed run (the real run-state file in between)."""

    LEVEL_FIELDS = Evidence.LEVEL_FIELDS
    # A at 0 and 30 (solid), misses at 60, 90, 120 (second pass: places 67, 97, 127; S at 67 and 97 at ×1.09, the
    # track playing 6 % slow), B at 150 (12 candidates), C at 180 and 210 (out of step).
    BY_PROBE = {
        **Evidence.SLOW,
        (0, 1.0): answer("A", 60.0, timeskew=0.002, frequencyskew=-0.004),
        (30, 1.0): answer("A", 90.0, timeskew=-0.001),
        (150, 1.0): answer("B", 10.0, entries=12),
        (180, 1.0): answer("C", 5.0),
        (210, 1.0): answer("C", 5.2),
    }

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.work = Path(tmp.name)

    def go(self, stop_at=None, resume=None):
        """One scan of 240 s at step 30, second pass at ×1 then ×1.09; `stop_at(t, speed)` true stops it at that
        probe (a Stop, before any answer). Each answer goes to a real `runstate.Recorder`."""
        calls = []
        rec = runstate.Recorder(self.work, RUN_LINK, RUN_SETTINGS, base=resume)

        async def recognise(data, skew):
            t, speed = data.rstrip().decode().split("@")
            t, speed = int(t), float(speed)
            if stop_at is not None and stop_at(t, speed):
                raise StopRequested()
            calls.append((t, speed))
            return self.BY_PROBE.get((t, speed), NO_MATCH)

        async def sleep(s):
            pass

        def probe(t, speed):
            return f"{t}@{speed:g}".encode().ljust(5000)

        rows = run(scan(240, step=30, cooldown=0.0, pause=0.0, max_skew=0.0, gap=180, recognise=recognise,
                        cut=lambda t: probe(t, 1.0), cut_at=probe, gap_step=30, gap_offset=7, speeds=(1.09,),
                        sleep=sleep, classify=classify, clock=lambda: 0.0, probe_seconds=12,
                        resume=resume, remember=rec.remember))
        return rows, calls

    def stopped(self, stop_at):
        """The whole scan's rows, then a run stopped by `stop_at` in a fresh folder, and the state it saved."""
        whole, _ = self.go()
        self.setUp()
        self.go(stop_at=stop_at)
        state, why = runstate.load(self.work, RUN_LINK, RUN_SETTINGS, 7)
        self.assertIsNone(why)
        return whole, state

    def without(self, rows):
        return [{k: v for k, v in r.items() if k not in self.LEVEL_FIELDS} for r in rows]

    @staticmethod
    def as_0_7_4(state, kinds):
        for kind in kinds:  # entries as worker 0.7.4 wrote them: no `heard`
            for entry in state[kind].values():
                if entry is not None:
                    entry.pop("heard", None)

    def test_stopped_after_the_first_pass_resumes_to_the_same_rows_and_levels_without_asking_again(self):
        whole, state = self.stopped(lambda t, speed: t % 30 != 0)  # the Stop comes at the second pass's first probe
        self.assertEqual(sorted(int(k) for k in state["first"]), [0, 30, 60, 90, 120, 150, 180, 210])
        self.assertEqual(state["second"], {})
        self.assertEqual(state["first"]["0"]["heard"]["offset"], 60.0)
        rows, calls = self.go(resume=state)
        self.assertEqual([c for c in calls if c[0] % 30 == 0], [])  # no first-pass probe asked again
        self.assertEqual(rows, whole)
        self.assertEqual([(r["song_name"], r.get("evidence")) for r in rows],
                         [("Tune A", "solid"), ("Tune S", "solid"), ("Tune B", "candidates"), ("Tune C", "out_of_step")])

    def test_a_second_pass_hit_resumed_keeps_its_level_and_mix_speed(self):
        whole, state = self.stopped(lambda t, speed: (t, speed) == (97, 1.09))  # 67 at ×1.09 heard and remembered
        kept = state["second"]["67@1.09"]
        self.assertEqual((kept["origin"], kept["speed_percent"], kept["heard"]["speed"]), ("replay", 9, 1.09))
        rows, calls = self.go(resume=state)
        self.assertEqual(calls, [(97, 1.09), (127, 1.09)])  # only what the stopped run did not hear
        self.assertEqual(rows, whole)
        s = next(r for r in rows if r["song_name"] == "Tune S")
        self.assertEqual((s["evidence"], s["mix_speed_percent"], s["origin"], s["speed_percent"]), ("solid", -6.0, "replay", 9))

    def test_a_state_written_by_0_7_4_gives_rows_without_the_three_fields(self):
        whole, state = self.stopped(lambda t, speed: (t, speed) == (97, 1.09))
        self.as_0_7_4(state, ("first", "second"))
        rows, calls = self.go(resume=state)
        self.assertEqual(calls, [(97, 1.09), (127, 1.09)])
        for row in rows:  # every row's first hit comes from an old entry: S's too (67), though 97 is heard afresh
            for name in (*self.LEVEL_FIELDS, "heard"):
                self.assertNotIn(name, row)
        self.assertEqual(rows, self.without(whole))  # the rest of each row is as today

    def test_an_old_first_pass_with_a_fresh_second_pass_grades_only_the_fresh_row(self):
        whole, state = self.stopped(lambda t, speed: t % 30 != 0)
        self.as_0_7_4(state, ("first",))
        rows, _ = self.go(resume=state)
        self.assertEqual(self.without(rows), self.without(whole))
        self.assertEqual([(r["song_name"], r.get("evidence")) for r in rows],
                         [("Tune A", None), ("Tune S", "solid"), ("Tune B", None), ("Tune C", None)])


class EvidenceLog(unittest.TestCase):
    """Spec 029, T010: the log says where in the track a hit was heard, at which speed, and counts the levels."""

    @staticmethod
    def heard(offset, timeskew=0.0, speed=1.0):
        return {"offset": offset, "timeskew": timeskew, "frequencyskew": 0.0, "matches": 1, "speed": speed}

    def entry(self, heard=None, **meta):
        e = {"song_name": "Track", "artist": "Invented Artist", "confidence": 73.0, "metadata": meta}
        if heard is not None:
            e["heard"] = heard
        return e

    def test_details_without_evidence_read_as_today(self):
        self.assertEqual(_details(self.entry(isrc="XX0000000000", label="Invented Label")), "XX0000000000 · Invented Label · 73 %")
        self.assertEqual(_details({"confidence": 80}), "80 %")

    def test_details_with_evidence_say_the_position_then_the_speed_before_the_percent(self):
        slow = self.heard(92.9, timeskew=0.923 * 1.09 - 1, speed=1.09)
        self.assertEqual(_details(self.entry(slow, isrc="XX0000000000", label="Invented Label")),
                         "XX0000000000 · Invented Label · at 1:32 in the track · \u22127.7 % · 73 %")

    def test_the_position_in_minutes_and_seconds_rounded_down(self):
        for offset, said in ((7.9, "at 0:07"), (59.99, "at 0:59"), (92.9, "at 1:32"), (725.4, "at 12:05"), (-3.2, "at 0:00")):
            self.assertEqual(_details(self.entry(self.heard(offset))), f"{said} in the track · 0.0 % · 73 %", offset)

    def test_the_speed_signed_with_one_decimal(self):
        for timeskew, speed, said in ((0.034, 1.0, "+3.4 %"), (-0.077, 1.0, "\u22127.7 %"), (0.0, 1.0, "0.0 %"),
                                      (-0.0004, 1.0, "0.0 %"), (0.94 * 1.09 - 1, 1.09, "\u22126.0 %"), (1.09 * 0.91 - 1, 0.91, "+9.0 %")):
            self.assertEqual(_details(self.entry(self.heard(10.0, timeskew, speed))), f"at 0:10 in the track · {said} · 73 %", (timeskew, speed))

    def go(self, duration, by_probe, second=False):
        lines = []

        async def recognise(data, skew):
            t, speed = data.rstrip().decode().split("@")
            return by_probe.get((int(t), float(speed)), NO_MATCH)

        async def sleep(s):
            pass

        def probe(t, speed):
            return f"{t}@{speed:g}".encode().ljust(5000)

        extra = dict(cut_at=probe, gap_step=30, gap_offset=7, speeds=(1.09,)) if second else {}
        run(scan(duration, step=30, cooldown=0.0, pause=0.0, max_skew=0.0, gap=180, recognise=recognise,
                 cut=lambda t: probe(t, 1.0), sleep=sleep, classify=classify, clock=lambda: 0.0, probe_seconds=12,
                 line=lines.append, **extra))
        return lines

    def test_a_whole_scan_says_the_position_and_speed_of_each_hit_and_the_four_levels_after_the_second_pass(self):
        # A solid, S solid (second pass at x1.09), B many candidates, C out of step, D heard once.
        lines = self.go(270, {**EvidenceResume.BY_PROBE, (240, 1.0): answer("D", 20.0)}, second=True)
        first = next(x for x in lines if "probe 1/9" in x)
        self.assertTrue(first.endswith("NEW · Invented Artist — Tune A · at 1:00 in the track · +0.2 % · 97 %"), first)
        gap = next(x for x in lines if "00:01:07 ×1.09" in x)
        self.assertIn("Invented Artist — Tune S · at 0:40 in the track · \u22126.0 % · ", gap)
        summary = next(i for i, x in enumerate(lines) if x.startswith("  second pass · ") and "new track" in x)
        self.assertEqual(lines[summary + 1], "  evidence · 2 solid · 1 many candidates · 1 out of step · 1 heard once")
        self.assertEqual(sum("evidence ·" in x for x in lines), 1)

    def test_levels_with_no_row_are_left_out_and_without_a_second_pass_the_line_comes_before_the_answers(self):
        lines = self.go(60, {(0, 1.0): answer("A", 50.0), (30, 1.0): answer("B", 5.0, entries=12)})
        self.assertEqual(lines[-2:], ["  evidence · 1 many candidates · 1 heard once", "  shazam · 2 answers · median 0.0 s · 0 over 5 s (0 %)"])

    def test_no_evidence_line_when_no_row_has_a_level(self):
        lines = self.go(60, {(0, 1.0): answer("A", None), (30, 1.0): answer("A", None)})
        self.assertTrue(any("Tune A" in x for x in lines))
        self.assertFalse(any("evidence" in x for x in lines))
        self.assertFalse(any("in the track" in x for x in lines))
        self.assertFalse(any("evidence" in x for x in self.go(60, {}, second=True)))
