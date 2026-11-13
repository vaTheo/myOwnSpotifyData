import unittest

from mix_worker import evidence

PROBE = 12


def heard(offset, timeskew=0.0, speed=1.0, matches=1, frequencyskew=None):
    """A hit's evidence as `heard_of` stores it, with made-up numbers."""
    return {"offset": offset, "timeskew": timeskew, "frequencyskew": frequencyskew, "matches": matches, "speed": speed}


# A ×1.09 re-cut whose Shazam time skew is +2.46 %: the mix plays at 0.94 of the record's speed.
RECUT = {"timeskew": 0.0246, "speed": 1.09}


class HeardOf(unittest.TestCase):
    """What a Shazam answer gives a hit: its first match's position and skews, and how many matches."""

    def answer(self, *matches):
        return {"matches": list(matches), "track": {"title": "Made Up Song", "subtitle": "Made Up Artist"}}

    def test_a_full_answer(self):
        response = self.answer(
            {"id": "1", "offset": 92.5, "timeskew": -0.077, "frequencyskew": -0.071},
            {"id": "2", "offset": 10.0, "timeskew": 0.0, "frequencyskew": 0.0},
        )
        self.assertEqual(
            evidence.heard_of(response),
            {"offset": 92.5, "timeskew": -0.077, "frequencyskew": -0.071, "matches": 2, "speed": 1.0},
        )

    def test_the_speed_is_kept(self):
        response = self.answer({"offset": 92.5, "timeskew": 0.0246, "frequencyskew": 0.02})
        self.assertEqual(evidence.heard_of(response, 1.09)["speed"], 1.09)

    def test_matches_is_the_length_of_the_list(self):
        response = self.answer(*[{"offset": 1.0, "timeskew": 0.0, "frequencyskew": 0.0}] * 12)
        self.assertEqual(evidence.heard_of(response)["matches"], 12)

    def test_frequencyskew_missing_or_not_a_number_gives_none(self):
        for skew in (None, "0.1", True):
            with self.subTest(frequencyskew=skew):
                first = {"offset": 92.5, "timeskew": 0.0}
                if skew is not None:
                    first["frequencyskew"] = skew
                self.assertIsNone(evidence.heard_of(self.answer(first))["frequencyskew"])

    def test_no_evidence(self):
        cases = {
            "not a dict": None,
            "no matches key": {"track": {}},
            "matches empty": self.answer(),
            "matches not a list": {"matches": {"offset": 1.0, "timeskew": 0.0}},
            "first match not a dict": self.answer("x"),
            "no offset": self.answer({"timeskew": 0.0, "frequencyskew": 0.0}),
            "offset a string": self.answer({"offset": "92.5", "timeskew": 0.0}),
            "offset a boolean": self.answer({"offset": True, "timeskew": 0.0}),
            "no timeskew": self.answer({"offset": 92.5}),
            "timeskew a boolean": self.answer({"offset": 92.5, "timeskew": False}),
        }
        for name, response in cases.items():
            with self.subTest(name):
                self.assertIsNone(evidence.heard_of(response))


class MixSpeed(unittest.TestCase):
    """The speed the mix plays the record at: (1 + timeskew) / the speed the probe was cut at."""

    def test_first_pass(self):
        self.assertAlmostEqual(evidence.mix_speed(heard(0, timeskew=-0.077)), 0.923)

    def test_recut(self):
        self.assertAlmostEqual(evidence.mix_speed(heard(0, **RECUT)), 0.94)


class InStep(unittest.TestCase):
    """Two hits of one track agree on where the record is: far enough apart, close enough, on the same line."""

    def test_table(self):
        cases = [
            # (name, a time, a, b time, b, expected)
            ("in step at original speed", 100, heard(50), 112, heard(62), True),
            ("in step on re-cut hits", 100, heard(50, **RECUT), 120, heard(50 + 20 * 0.94, **RECUT), True),
            ("6 s apart is not a pair", 100, heard(50), 106, heard(56), False),
            ("13.08 s after a x1.09 hit is a pair", 100, heard(50, **RECUT), 113.08, heard(50 + 13.08 * 0.94), True),
            ("12 s after a x1.09 hit is not a pair", 100, heard(50, **RECUT), 112, heard(50 + 12 * 0.94), False),
            ("60 s apart is a pair", 100, heard(50), 160, heard(110), True),
            ("75 s apart is not a pair", 100, heard(50), 175, heard(125), False),
            ("0.6 s off is not in step", 100, heard(50), 112, heard(62.6), False),
            ("0.6 s early is not in step", 100, heard(50), 112, heard(61.4), False),
            ("0.4 s off is in step", 100, heard(50), 112, heard(62.4), True),
            ("the later hit first is not a pair", 112, heard(62), 100, heard(50), False),
            ("the earlier hit without evidence is not a pair", 100, None, 112, heard(62), False),
            ("the later hit without evidence is not a pair", 100, heard(50), 112, None, False),
        ]
        for name, a_time, a, b_time, b, expected in cases:
            with self.subTest(name):
                self.assertIs(evidence.in_step(a_time, a, b_time, b, PROBE), expected)


class Levels(unittest.TestCase):
    """One level per row, the first that fits: solid, candidates, out_of_step, once."""

    def level(self, rows, elsewhere=None):
        return [r.get("evidence") for r in evidence.levels(rows, PROBE, elsewhere)]

    def test_two_hits_of_one_row_in_step_are_solid(self):
        self.assertEqual(self.level([("a", [(100, heard(50)), (112, heard(62))])]), ["solid"])

    def test_one_hit_in_each_of_two_rows_of_one_key_in_step_are_both_solid(self):
        rows = [("a", [(100, heard(50))]), ("a", [(112, heard(62))])]
        self.assertEqual(self.level(rows), ["solid", "solid"])

    def test_two_rows_of_different_keys_never_pair(self):
        rows = [("a", [(100, heard(50))]), ("b", [(112, heard(62))])]
        self.assertEqual(self.level(rows), ["once", "once"])

    def test_two_hits_out_of_step(self):
        self.assertEqual(self.level([("a", [(100, heard(50)), (112, heard(80))])]), ["out_of_step"])

    def test_ten_entries_are_candidates_nine_are_once(self):
        self.assertEqual(self.level([("a", [(100, heard(50, matches=10))])]), ["candidates"])
        self.assertEqual(self.level([("a", [(100, heard(50, matches=9))])]), ["once"])

    def test_candidates_reads_the_first_hit_only(self):
        rows = [("a", [(100, heard(50, matches=1)), (112, heard(80, matches=12))])]
        self.assertEqual(self.level(rows), ["out_of_step"])

    def test_candidates_wins_over_out_of_step(self):
        # Two hits 12 s apart, 18 s off the clock: not in step; the first answer lists 12 entries.
        rows = [("a", [(100, heard(50, matches=12)), (112, heard(80))])]
        self.assertEqual(self.level(rows), ["candidates"])

    def test_one_hit_is_once(self):
        self.assertEqual(self.level([("a", [(100, heard(50))])]), ["once"])

    def test_solid_wins_over_twelve_entries(self):
        rows = [("a", [(100, heard(50, matches=12)), (112, heard(62, matches=12))])]
        self.assertEqual(self.level(rows), ["solid"])

    def test_first_hit_without_evidence_gives_nothing(self):
        rows = [("a", [(100, None), (112, heard(62))]), ("a", [(124, heard(74))])]
        result = evidence.levels(rows, PROBE)
        self.assertEqual(result[0], {})
        self.assertEqual(result[1]["evidence"], "solid")

    def test_one_dict_per_row_in_order_with_the_three_fields(self):
        rows = [("a", [(100, heard(50, matches=3)), (112, heard(62, matches=7))]), ("b", [(400, heard(5, matches=2))])]
        self.assertEqual(
            evidence.levels(rows, PROBE),
            [
                {"evidence": "solid", "mix_speed_percent": 0.0, "candidates": 3},
                {"evidence": "once", "mix_speed_percent": 0.0, "candidates": 2},
            ],
        )

    def test_mix_speed_is_the_median_of_the_hits_in_step(self):
        # Three hits in step at 0.95, 0.94 and 0.92, and a far hit at 1.20 that pairs with none.
        hits = [
            (100, heard(50, timeskew=-0.05)),
            (112, heard(61.4, timeskew=-0.06)),
            (124, heard(72.68, timeskew=-0.08)),
            (300, heard(0, timeskew=0.20)),
        ]
        self.assertEqual(evidence.levels([("a", hits)], PROBE)[0]["mix_speed_percent"], -6.0)

    def test_mix_speed_is_the_first_hits_when_none_is_in_step(self):
        rows = [("a", [(100, heard(50, **RECUT)), (112, heard(500, timeskew=0.3))])]
        result = evidence.levels(rows, PROBE)[0]
        self.assertEqual(result["evidence"], "out_of_step")
        self.assertEqual(result["mix_speed_percent"], -6.0)

    def test_mix_speed_has_one_decimal(self):
        rows = [("a", [(100, heard(50, timeskew=-0.0773))])]
        self.assertEqual(evidence.levels(rows, PROBE)[0]["mix_speed_percent"], -7.7)

    def test_the_levels_in_order(self):
        self.assertEqual(evidence.LEVELS, ("solid", "candidates", "out_of_step", "once"))

    # Worker 0.7.6: hits of a row's track that made no row (a TrackId.net span took them) pair with the row's hits.
    def test_a_hit_taken_elsewhere_in_step_makes_the_row_solid(self):
        rows = [("a", [(100, heard(50))])]
        self.assertEqual(self.level(rows), ["once"])
        self.assertEqual(self.level(rows, {"a": [(115, heard(65))]}), ["solid"])
        self.assertEqual(self.level(rows, {"a": [(85, heard(35))]}), ["solid"])  # the taken hit comes first

    def test_a_row_out_of_step_on_its_own_is_solid_when_one_hit_pairs_with_a_taken_hit(self):
        # A lead-in hit, then a re-cut hit 142 s later at a wrong place: no pair inside the row.
        rows = [("a", [(100, heard(12)), (242, heard(136, timeskew=-0.04, speed=1.09))])]
        self.assertEqual(self.level(rows), ["out_of_step"])
        self.assertEqual(self.level(rows, {"a": [(115, heard(27))]}), ["solid"])

    def test_a_hit_taken_elsewhere_changes_nothing_when_it_does_not_pair(self):
        rows = [("a", [(100, heard(50))])]
        cases = {
            "out of step": {"a": [(115, heard(90))]},
            "another track": {"b": [(115, heard(65))]},
            "without evidence": {"a": [(115, None)]},
            "sharing audio": {"a": [(106, heard(56))]},
            "too far": {"a": [(175, heard(125))]},
            "nothing": {},
        }
        for name, elsewhere in cases.items():
            with self.subTest(name):
                self.assertEqual(self.level(rows, elsewhere), ["once"])

    def test_hits_taken_elsewhere_make_no_row_and_stay_out_of_the_speed(self):
        # The row's hit plays at 0.95; the taken hit, 15 s later and in step with it, measured 1.20.
        rows = [("a", [(100, heard(50, timeskew=-0.05))])]
        elsewhere = {"a": [(115, heard(64.25, timeskew=0.2))], "c": [(300, heard(1))]}
        self.assertEqual(
            evidence.levels(rows, PROBE, elsewhere), [{"evidence": "solid", "mix_speed_percent": -5.0, "candidates": 1}]
        )

    def test_a_row_without_evidence_stays_without_a_level_whatever_was_taken_elsewhere(self):
        self.assertEqual(evidence.levels([("a", [(100, None)])], PROBE, {"a": [(115, heard(65))]}), [{}])


if __name__ == "__main__":
    unittest.main()
