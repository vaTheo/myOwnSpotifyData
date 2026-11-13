import json
import tempfile
import unittest
from pathlib import Path

from mix_worker import runstate

SETTINGS = {"step": 15, "probe_seconds": 12}
LINK = "https://soundcloud.com/a/b"


class RunState(unittest.TestCase):
    def test_record_load_and_clear(self):
        with tempfile.TemporaryDirectory() as tmp:
            w = Path(tmp)
            rec = runstate.Recorder(w, LINK, SETTINGS, now=lambda: 1000.0)
            rec.remember("first", "0", {"song_name": "T", "artist": "A"})
            rec.remember("first", "15", None)
            rec.remember("second", "22@1", None)
            state, why = runstate.load(w, LINK, SETTINGS, 7, now=lambda: 2000.0)
            self.assertIsNone(why)
            self.assertEqual(state["first"], {"0": {"song_name": "T", "artist": "A"}, "15": None})
            self.assertEqual(state["second"], {"22@1": None})
            rec.clear()
            self.assertEqual(runstate.load(w, LINK, SETTINGS, 7), (None, None))

    def test_refusals(self):
        with tempfile.TemporaryDirectory() as tmp:
            w = Path(tmp)
            runstate.Recorder(w, LINK, SETTINGS, now=lambda: 0.0).remember("first", "0", None)
            self.assertEqual(runstate.load(w, LINK, {"step": 30, "probe_seconds": 12}, 7, now=lambda: 1.0)[1], "the probe settings changed since")
            self.assertEqual(runstate.load(w, LINK, SETTINGS, 7, now=lambda: 8 * 86400.0)[1], "the stopped run is older than 7 days")
            self.assertEqual(runstate.load(w, LINK, SETTINGS, 0), (None, None))
            self.assertEqual(runstate.load(w, "https://other/x", SETTINGS, 7), (None, None))
            runstate.path_for(w, LINK).write_text("{broken", encoding="utf-8")
            self.assertEqual(runstate.load(w, LINK, SETTINGS, 7)[1], "the saved run could not be read")

    def test_trackid_key_changes_start_over_and_confirm_is_remembered(self):
        with tempfile.TemporaryDirectory() as tmp:
            w = Path(tmp)
            key = runstate.trackid_key("slug-a", [(70.0, 190.0)])
            self.assertEqual(key, runstate.trackid_key("slug-a", [(70.0, 190.0)]))
            rec = runstate.Recorder(w, LINK, SETTINGS, now=lambda: 0.0, trackid=key)
            rec.remember("confirm", "0", {"song_name": "T", "artist": "A"})
            rec.remember("first", "0", None)
            state, why = runstate.load(w, LINK, SETTINGS, 7, now=lambda: 1.0, trackid=key)
            self.assertIsNone(why)
            self.assertEqual(state["confirm"], {"0": {"song_name": "T", "artist": "A"}})
            for other in (
                runstate.trackid_key("slug-b", [(70.0, 190.0)]),
                runstate.trackid_key("slug-a", [(70.0, 200.0)]),
                None,
            ):
                self.assertEqual(runstate.load(w, LINK, SETTINGS, 7, now=lambda: 1.0, trackid=other), (None, "the TrackId.net spans changed since"))

    def test_a_run_without_trackid_loads_as_before(self):
        with tempfile.TemporaryDirectory() as tmp:
            w = Path(tmp)
            runstate.Recorder(w, LINK, SETTINGS, now=lambda: 0.0).remember("first", "0", None)
            self.assertIsNone(runstate.load(w, LINK, SETTINGS, 7, now=lambda: 1.0)[1])
            self.assertEqual(runstate.load(w, LINK, SETTINGS, 7, now=lambda: 1.0, trackid=runstate.trackid_key("s", []))[1], "the TrackId.net spans changed since")

    def test_entries_holding_heard_come_back_equal(self):
        # Spec 029: a hit's evidence (`heard`) is kept in the file and read back as it was written.
        first = {"song_name": "T", "artist": "A", "heard": {"offset": 92.9, "timeskew": 4.68e-05, "frequencyskew": None, "matches": 3, "speed": 1.0}}
        second = {"song_name": "U", "artist": "B", "origin": "replay", "speed_percent": 9,
                  "heard": {"offset": 40.0, "timeskew": 0.0246, "frequencyskew": -0.000161, "matches": 1, "speed": 1.09}}
        with tempfile.TemporaryDirectory() as tmp:
            w = Path(tmp)
            rec = runstate.Recorder(w, LINK, SETTINGS, now=lambda: 0.0)
            rec.remember("first", "0", first)
            rec.remember("second", "67@1.09", second)
            state, why = runstate.load(w, LINK, SETTINGS, 7, now=lambda: 1.0)
            self.assertIsNone(why)
            self.assertEqual(state["first"], {"0": first})
            self.assertEqual(state["second"], {"67@1.09": second})

    def test_written_atomically(self):
        with tempfile.TemporaryDirectory() as tmp:
            w = Path(tmp)
            rec = runstate.Recorder(w, LINK, SETTINGS)
            rec.remember("first", "0", None)
            self.assertEqual(list((w / "runs").iterdir()), [runstate.path_for(w, LINK)])
            json.loads(runstate.path_for(w, LINK).read_text())
