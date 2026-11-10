"""Round 023 (spec 023): the automatic Ask again after a rate-limit stop."""

import unittest

from mix_worker.autoresume import AutoResume
from mix_worker.pipeline import Outcome
from mix_worker.server import Result

URL = "https://x.y/1"


class Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


def limited():
    return Outcome("done", stopped="rate limited")


class Schedule(unittest.TestCase):
    def test_a_rate_limited_partial_is_asked_again_once_after_30_minutes(self):
        clock = Clock()
        auto = AutoResume(30, 6, clock)
        line = auto.after(URL, limited())
        self.assertEqual(line, f"  auto ask again · {URL} in 30 min (1/6)")
        clock.t = 30 * 60 - 1
        self.assertEqual(auto.take_due(), [])
        clock.t = 30 * 60
        self.assertEqual(auto.take_due(), [URL])
        self.assertEqual(auto.take_due(), [])  # once

    def test_other_endings_schedule_nothing(self):
        for outcome in [
            Outcome("done"),
            Outcome("done", stopped="by you"),
            Outcome("done", stopped="no answer"),
            Outcome("failed", reason="Recognition service refused (rate limited); try later"),
            Outcome("taken"),
        ]:
            clock = Clock()
            auto = AutoResume(30, 6, clock)
            self.assertIsNone(auto.after(URL, outcome), outcome)
            clock.t = 10**6
            self.assertEqual(auto.take_due(), [], outcome)

    def test_at_most_six_cycles_then_nothing(self):
        clock = Clock()
        auto = AutoResume(30, 6, clock)
        for n in range(1, 7):
            self.assertIn(f"({n}/6)", auto.after(URL, limited()))
            clock.t += 1800
            self.assertEqual(auto.take_due(), [URL])
            auto.queued(URL, Result("ok", "queued"))
        line = auto.after(URL, limited())
        self.assertEqual(line, "  auto ask again · 6 of 6 done for this set; press Ask again in the app for the rest")
        clock.t += 10**6
        self.assertEqual(auto.take_due(), [])

    def test_a_complete_run_resets_the_count(self):
        clock = Clock()
        auto = AutoResume(30, 2, clock)
        for _ in range(2):
            auto.after(URL, limited())
            clock.t += 1800
            auto.take_due()
            auto.queued(URL, Result("ok", "queued"))
        auto.after(URL, Outcome("done"))
        self.assertIn("(1/2)", auto.after(URL, limited()))

    def test_a_manual_ask_again_does_not_reset_the_count_and_replaces_the_pending_one(self):
        clock = Clock()
        auto = AutoResume(30, 6, clock)
        auto.after(URL, limited())
        clock.t = 1800
        auto.take_due()
        auto.queued(URL, Result("ok", "queued"))  # 1 used
        auto.after(URL, limited())  # pending, due at 3600
        clock.t = 2000
        auto.after(URL, Outcome("failed", reason="x"))  # the owner's own Ask again ran first: pending dropped
        clock.t = 10**6
        self.assertEqual(auto.take_due(), [])
        self.assertIn("(2/6)", auto.after(URL, limited()))

    def test_a_refused_or_existing_insert_is_not_counted_and_not_retried(self):
        clock = Clock()
        auto = AutoResume(30, 6, clock)
        auto.after(URL, limited())
        clock.t = 1800
        self.assertEqual(auto.take_due(), [URL])
        line = auto.queued(URL, Result("offline", None, None, "network error: down"))
        self.assertEqual(line, "auto ask again · not queued (offline: network error: down); press Ask again in the app")
        self.assertEqual(auto.take_due(), [])
        self.assertEqual(auto.queued(URL, Result("ok", "exists")), f"auto ask again · {URL} is already asked")
        self.assertIn("(1/6)", auto.after(URL, limited()))
        self.assertEqual(auto.queued(URL, Result("ok", "queued")), f"auto ask again · queued {URL} (1/6)")


class Off(unittest.TestCase):
    def test_zero_minutes_is_off_and_silent(self):
        clock = Clock()
        auto = AutoResume(0, 6, clock)
        self.assertIsNone(auto.after(URL, limited()))
        clock.t = 10**6
        self.assertEqual(auto.take_due(), [])

    def test_shared_or_once_schedule_nothing_with_one_line(self):
        for off in ("shared mode", "run --once", "WORKER_RESUME_DAYS is 0: nothing is saved to resume from"):
            clock = Clock()
            auto = AutoResume(30, 6, clock, off=off)
            self.assertEqual(auto.after(URL, limited()), f"  auto ask again · off ({off}); press Ask again in the app for the rest")
            clock.t = 10**6
            self.assertEqual(auto.take_due(), [])
            self.assertIsNone(auto.after(URL, Outcome("done")))


if __name__ == "__main__":
    unittest.main()
