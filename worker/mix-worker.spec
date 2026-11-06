# -*- mode: python ; coding: utf-8 -*-
# PyInstaller one-file build of the worker (research D9). Built by
# .github/workflows/worker-release.yml on a runner of each system; never by hand
# for a release. Locally: `uv run --group build pyinstaller mix-worker.spec`
# (a plain `uv run` would drop the build group again).
from PyInstaller.utils.hooks import collect_all, collect_data_files

datas, binaries, hiddenimports = [], [], []
for package in ("yt_dlp", "shazamio", "shazamio_core", "imageio_ffmpeg", "aiohttp", "aiohttp_retry", "pydantic"):
    d, b, h = collect_all(package)
    datas += d
    binaries += b
    hiddenimports += h
# mix_worker/env.example: the settings template the executable writes on its first start.
datas += collect_data_files("mix_worker")

a = Analysis(
    ["mix_worker/__main__.py"],
    pathex=["."],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "unittest", "test"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="mix-worker",
    debug=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
)
