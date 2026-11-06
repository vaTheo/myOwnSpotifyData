import tempfile
import unittest
from pathlib import Path

from mix_worker import config
from mix_worker.config import SettingsError, load_settings, write_template

GOOD = {"SUPABASE_URL": "https://abc.supabase.co", "SUPABASE_KEY": "sb_publishable_123"}
HOME = Path("/home/dj")


def load(env=None, path=None, platform="linux", frozen_dir=None, exists=lambda p: False):
    merged = dict(GOOD)
    merged.update(env or {})
    return load_settings(
        path,
        merged,
        hostname=lambda: "laptop",
        home=HOME,
        platform=platform,
        frozen_dir=frozen_dir,
        exists=exists,
    )


class Defaults(unittest.TestCase):
    def test_every_default(self):
        s = load()
        self.assertEqual(s.supabase_url, "https://abc.supabase.co")
        self.assertEqual(s.supabase_key, "sb_publishable_123")
        self.assertEqual(s.worker_name, "laptop")
        self.assertEqual(s.session_file, HOME / ".config/myownspotifydata-worker/session.json")
        self.assertEqual(s.work_dir, HOME / ".cache/myownspotifydata-worker")
        self.assertEqual(s.json_dir, HOME / "Music/mix-worker")
        self.assertEqual(s.log_file, HOME / ".cache/myownspotifydata-worker/worker.log")
        self.assertIsNone(s.ffmpeg)
        self.assertIsNone(s.ytdlp_cookies)
        self.assertIsNone(s.proxy)
        self.assertEqual(s.stale_seconds, 21600)
        self.assertEqual(s.poll_seconds, 60)
        self.assertEqual(s.heartbeat_seconds, 30)
        self.assertEqual(s.max_duration_seconds, 0)
        self.assertEqual(s.probe_step_seconds, 60)
        self.assertEqual(s.probe_seconds, 10)
        self.assertEqual(s.cooldown_seconds, 3.0)
        self.assertEqual(s.rate_limit_pause_seconds, 300.0)
        self.assertEqual(s.rate_limit_pauses, 3)
        self.assertEqual(s.max_skew, 0.1)
        self.assertEqual(s.shazam_device, "android")
        self.assertEqual(s.merge_gap_seconds, 180)
        self.assertEqual(s.result_max_bytes, 900000)

    def test_windows_paths(self):
        s = load(env={"APPDATA": r"C:\Users\dj\AppData\Roaming", "LOCALAPPDATA": r"C:\Users\dj\AppData\Local"}, platform="win32")
        self.assertEqual(str(s.session_file), str(Path(r"C:\Users\dj\AppData\Roaming") / "myownspotifydata-worker" / "session.json"))
        self.assertEqual(str(s.work_dir), str(Path(r"C:\Users\dj\AppData\Local") / "myownspotifydata-worker"))

    def test_session_beside_frozen_executable_when_present(self):
        d = Path("/apps/mix-worker")
        s = load(frozen_dir=d, exists=lambda p: p == d / "session.json")
        self.assertEqual(s.session_file, d / "session.json")
        s2 = load(frozen_dir=d, exists=lambda p: False)
        self.assertEqual(s2.session_file, HOME / ".config/myownspotifydata-worker/session.json")


class FileAndEnv(unittest.TestCase):
    def test_file_parsing_and_env_override(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / ".env"
            p.write_text(
                "# comment\n\nSUPABASE_URL=https://file.supabase.co   # trailing comment\n"
                'SUPABASE_KEY="quoted key"\nWORKER_NAME=\'single\'\nWORKER_POLL_SECONDS=5\n'
                "WORKER_PROXY=   \n",
                encoding="utf-8",
            )
            s = load_settings(p, {"WORKER_POLL_SECONDS": "7"}, hostname=lambda: "h", home=HOME, platform="linux", frozen_dir=None, exists=Path.exists)
            self.assertEqual(s.supabase_url, "https://file.supabase.co")
            self.assertEqual(s.supabase_key, "quoted key")
            self.assertEqual(s.worker_name, "single")
            self.assertEqual(s.poll_seconds, 7)
            self.assertIsNone(s.proxy)

    def test_errors_name_the_setting(self):
        for env, name in [
            ({"SUPABASE_URL": "http://abc.supabase.co"}, "SUPABASE_URL"),
            ({"SUPABASE_URL": ""}, "SUPABASE_URL"),
            ({"SUPABASE_KEY": ""}, "SUPABASE_KEY"),
            ({"WORKER_POLL_SECONDS": "-1"}, "WORKER_POLL_SECONDS"),
            ({"WORKER_COOLDOWN_SECONDS": "soon"}, "WORKER_COOLDOWN_SECONDS"),
            ({"WORKER_MAX_SKEW": "-0.1"}, "WORKER_MAX_SKEW"),
            ({"WORKER_PROBE_SECONDS": "13"}, "WORKER_PROBE_SECONDS"),
            ({"WORKER_SHAZAM_DEVICE": "web"}, "WORKER_SHAZAM_DEVICE"),
            ({"WORKER_PROBE_SECONDS": "1"}, "WORKER_PROBE_SECONDS"),
        ]:
            with self.assertRaises(SettingsError) as ctx:
                load(env=env)
            self.assertEqual(ctx.exception.setting, name)

    def test_max_skew_zero_allowed(self):
        self.assertEqual(load(env={"WORKER_MAX_SKEW": "0"}).max_skew, 0.0)

    def test_missing_file_is_fine(self):
        s = load_settings(Path("/nowhere/.env"), dict(GOOD), hostname=lambda: "h", home=HOME, platform="linux", frozen_dir=None, exists=lambda q: False)
        self.assertEqual(s.worker_name, "h")


class Template(unittest.TestCase):
    def test_template_equals_env_example(self):
        example = Path(__file__).resolve().parents[1] / ".env.example"
        self.assertEqual(config.template_text(), example.read_text(encoding="utf-8"))

    def test_write_template(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "mix-worker.env"
            write_template(p)
            self.assertEqual(p.read_text(encoding="utf-8"), config.template_text())


if __name__ == "__main__":
    unittest.main()


class Version(unittest.TestCase):
    def test_pyproject_and_package_agree(self):
        # The release workflow tags `worker-v<pyproject version>` and refuses a mismatch.
        import tomllib

        from mix_worker import __version__

        root = Path(__file__).resolve().parent.parent
        with open(root / "pyproject.toml", "rb") as f:
            self.assertEqual(tomllib.load(f)["project"]["version"], __version__)
