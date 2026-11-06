import json
import unittest
from pathlib import Path

from mix_worker.match import artist_matches, normalize, title_matches

CASES = json.loads((Path(__file__).resolve().parents[2] / "src/features/mix/match.cases.json").read_text(encoding="utf-8"))


class SharedCases(unittest.TestCase):
    """The same file the app's `match.cases.test.ts` reads: same verdicts."""

    def test_artist(self):
        for c in CASES["artist"]:
            with self.subTest(**c):
                self.assertEqual(artist_matches(c["written"], c["candidate"]), c["accept"])

    def test_title(self):
        for c in CASES["title"]:
            with self.subTest(**c):
                self.assertEqual(title_matches(c["written"], c["candidate"]), c["accept"])


class Normalize(unittest.TestCase):
    def test_marks_case_and_punctuation(self):
        self.assertEqual(normalize("  Rosé – Ça VA!! "), "rose ca va")
        self.assertEqual(normalize("Плотность"), "плотность")
