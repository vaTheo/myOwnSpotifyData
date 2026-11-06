import tempfile
import unittest
from pathlib import Path

from mix_worker.config import Settings
from mix_worker.download import DownloadFailure, Downloaded, download, progress_hook, reason_for


def settings(**over):
    base = dict(
        supabase_url="https://abc.supabase.co", supabase_key="k", worker_name="w",
        session_file=Path("/s"), work_dir=DEST, json_dir=Path("/j"), log_file=Path("/l"),
        ffmpeg="/usr/bin/ffmpeg", ytdlp_cookies=None, proxy=None, stale_seconds=1, poll_seconds=1, heartbeat_seconds=30,
        max_duration_seconds=14400, probe_step_seconds=60, probe_seconds=10, cooldown_seconds=0.0,
        rate_limit_pause_seconds=0.0, rate_limit_pauses=3, shazam_device="android", max_skew=0.001, merge_gap_seconds=180, result_max_bytes=900000,
    )
    base.update(over)
    return Settings(**base)


class FakeYdl:
    instances = []

    def __init__(self, opts):
        self.opts = opts
        self.info = None
        self.error = None
        FakeYdl.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def extract_info(self, url, download=True):
        if self.error:
            raise self.error
        self.calls = getattr(self, "calls", []) + [("extract", download)]
        return self.info

    def process_ie_result(self, info, download=True):
        self.calls = getattr(self, "calls", []) + [("process", download)]
        return info


def factory(info=None, error=None):
    def make(opts):
        y = FakeYdl(opts)
        y.info = info
        y.error = error
        return y
    return make


TMP = tempfile.TemporaryDirectory()
DEST = Path(TMP.name) / "job"

INFO = {
    "id": "abc123",
    "title": "A set",
    "uploader": "Someone",
    "duration": 7260,
    "requested_downloads": [{"filepath": str(DEST / "abc123.webm")}],
}


class Options(unittest.TestCase):
    def test_options_and_result(self):
        FakeYdl.instances.clear()
        r = download("https://x.y/z", DEST, settings(), ydl_factory=factory(INFO), match_filter=lambda *a: None)
        self.assertEqual(r, Downloaded(path=DEST / "abc123.webm", title="A set", uploader="Someone", duration=7260))
        opts = FakeYdl.instances[0].opts
        self.assertTrue(opts["noplaylist"])
        self.assertTrue(callable(opts["match_filter"]))
        self.assertEqual(opts["format"], "bestaudio/best")
        self.assertTrue(str(opts["outtmpl"]).startswith(str(DEST)))
        self.assertEqual(opts["max_filesize"], 2 * 1024 ** 3)
        self.assertEqual(opts["socket_timeout"], 30)
        self.assertEqual(opts["retries"], 3)
        self.assertEqual(opts["ffmpeg_location"], "/usr/bin/ffmpeg")
        self.assertTrue(opts["quiet"])
        self.assertNotIn("cookiefile", opts)

    def test_cookies_when_set(self):
        FakeYdl.instances.clear()
        download("https://x.y/z", DEST, settings(ytdlp_cookies=Path("/c.txt")), ydl_factory=factory(INFO), match_filter=lambda *a: None)
        self.assertEqual(FakeYdl.instances[0].opts["cookiefile"], str(Path("/c.txt")))

    def test_uploader_fallbacks_and_missing_duration(self):
        info = dict(INFO, uploader=None, channel="Chan", duration=None)
        r = download("u", DEST, settings(), ydl_factory=factory(info), match_filter=lambda *a: None)
        self.assertEqual((r.uploader, r.duration), ("Chan", None))
        info = dict(INFO, uploader=None, channel=None, artist="Art")
        self.assertEqual(download("u", DEST, settings(), ydl_factory=factory(info), match_filter=lambda *a: None).uploader, "Art")
        info = dict(INFO, uploader=None, channel=None, title=None)
        r = download("u", DEST, settings(), ydl_factory=factory(info), match_filter=lambda *a: None)
        self.assertEqual((r.title, r.uploader), ("abc123", None))


class Early(unittest.TestCase):
    def test_too_long_is_refused_before_any_download(self):
        FakeYdl.instances.clear()
        r = download("u", DEST, settings(), ydl_factory=factory(dict(INFO, duration=17681)), match_filter=lambda *a: None, max_duration=14400)
        self.assertEqual(r, DownloadFailure("Set too long (4 h 54 min; the limit is 4 h 00 min, setting WORKER_MAX_DURATION_SECONDS)"))
        self.assertEqual(FakeYdl.instances[0].calls, [("extract", False)])

    def test_metadata_then_download(self):
        FakeYdl.instances.clear()
        lines = []
        r = download("u", DEST, settings(), ydl_factory=factory(INFO), match_filter=lambda *a: None, line=lines.append, max_duration=28800)
        self.assertIsInstance(r, Downloaded)
        self.assertEqual(FakeYdl.instances[0].calls, [("extract", False), ("process", True)])
        self.assertEqual(lines[0], "  download · A set · 2 h 01 min")


class Progress(unittest.TestCase):
    def test_one_percent_then_every_five_then_the_end(self):
        lines = []
        hook = progress_hook(lines.append)
        total = 100 * 1_048_576
        for done in (0, 1, 2, 4, 5, 6, 10, 23, 99):
            hook({"status": "downloading", "downloaded_bytes": done * 1_048_576, "total_bytes": total, "speed": 2 * 1_048_576, "eta": 30})
        hook({"status": "finished", "downloaded_bytes": total})
        percents = [l.split("·")[1].strip() for l in lines]
        self.assertEqual(percents, ["1 %", "5 %", "10 %", "23 %", "99 %", "100 %"])
        self.assertEqual(lines[0], "  download ·   1 % · 1.0 MB of 100.0 MB · 2.0 MB/s · 30 s left")
        self.assertEqual(lines[-1], "  download · 100 % · 100.0 MB")

    def test_a_jump_logs_once_at_the_real_value(self):
        lines = []
        hook = progress_hook(lines.append)
        hook({"status": "downloading", "downloaded_bytes": 37, "total_bytes": 100})
        hook({"status": "downloading", "downloaded_bytes": 38, "total_bytes": 100})
        hook({"status": "downloading", "downloaded_bytes": 40, "total_bytes": 100})
        self.assertEqual([l.split("·")[1].strip() for l in lines], ["37 %", "40 %"])

    def test_estimate_and_missing_total(self):
        lines = []
        hook = progress_hook(lines.append)
        hook({"status": "downloading", "downloaded_bytes": 50, "total_bytes_estimate": 100})
        hook({"status": "downloading", "downloaded_bytes": 50})
        self.assertEqual(len(lines), 1)
        self.assertIn(" 50 %", lines[0])

    def test_the_hook_is_passed_to_yt_dlp_only_with_a_line(self):
        FakeYdl.instances.clear()
        download("u", DEST, settings(), ydl_factory=factory(INFO), match_filter=lambda *a: None, line=print)
        self.assertEqual(len(FakeYdl.instances[0].opts["progress_hooks"]), 1)
        FakeYdl.instances.clear()
        download("u", DEST, settings(), ydl_factory=factory(INFO), match_filter=lambda *a: None)
        self.assertNotIn("progress_hooks", FakeYdl.instances[0].opts)


class Failures(unittest.TestCase):
    def test_error_messages_become_reasons(self):
        for message, reason in [
            ("ERROR: [youtube] abc: Private video. Sign in if you've been granted access", "Private or removed link"),
            ("ERROR: [youtube] abc: Video unavailable", "Private or removed link"),
            ("This video is private", "Private or removed link"),
            ("ERROR: Unsupported URL: https://example.com/", "Unsupported or unreachable link"),
            ("abc123 does not pass filter (!is_live), skipping ..", "Live streams are not supported"),
            ("File is larger than max-filesize (3000000000 bytes > 2147483648 bytes). Aborting.", "Download refused (file too large)"),
            ("ERROR: unable to download video data: HTTP Error 403: Forbidden\nmore", "Download failed: ERROR: unable to download video data: HTTP Error 403: Forbidden"),
        ]:
            self.assertEqual(reason_for(message), reason, message)

    def test_download_error_is_a_failure(self):
        class DownloadError(Exception):
            pass
        r = download("u", DEST, settings(), ydl_factory=factory(error=DownloadError("ERROR: Unsupported URL: x")), match_filter=lambda *a: None)
        self.assertEqual(r, DownloadFailure("Unsupported or unreachable link"))

    def test_playlist_and_live_and_nothing_downloaded(self):
        r = download("u", DEST, settings(), ydl_factory=factory({"_type": "playlist", "entries": []}), match_filter=lambda *a: None)
        self.assertEqual(r, DownloadFailure("Playlist links are not supported; paste one set"))
        r = download("u", DEST, settings(), ydl_factory=factory(dict(INFO, is_live=True)), match_filter=lambda *a: None)
        self.assertEqual(r, DownloadFailure("Live streams are not supported"))
        r = download("u", DEST, settings(), ydl_factory=factory(dict(INFO, requested_downloads=[])), match_filter=lambda *a: None)
        self.assertEqual(r, DownloadFailure("Download failed: nothing was downloaded"))
        r = download("u", DEST, settings(), ydl_factory=factory(None), match_filter=lambda *a: None)
        self.assertEqual(r, DownloadFailure("Download failed: nothing was downloaded"))

    def test_unexpected_exception_is_a_failure_too(self):
        r = download("u", DEST, settings(), ydl_factory=factory(error=RuntimeError("boom")), match_filter=lambda *a: None)
        self.assertEqual(r, DownloadFailure("Download failed: boom"))


if __name__ == "__main__":
    unittest.main()
