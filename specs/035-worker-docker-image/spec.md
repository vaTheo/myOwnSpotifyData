# Feature Specification: The worker as a Docker image

**Feature Branch**: `feat/worker-docker-image`

**Created**: 2026-11-23

**Status**: Implemented, worker 0.7.9 (first release run and public package pending)

**Input**: Owner (2026-11-23): "In the realease or somewhere pertinent, could you include a docker realease so it's easy to setup
from a server", then "ye x86 is fine", then "Build from the python source, if in this way it will work on any server", then "ok go,
add the arm image too".

## Today (as found, 2026-11-23)

- `.github/workflows/worker-release.yml` builds four PyInstaller executables (Windows, Linux x86_64, macOS arm64 and x86_64) when
  `worker/pyproject.toml` names a version with no `worker-v<version>` release yet, and attaches them to that release.
- A server runs the Linux executable by hand: a system user, `/etc/mix-worker.env`, a systemd unit (worker README section C).
- Settings come from a file, and every non-empty environment variable overrides it (`worker/mix_worker/config.py:248`). Run from
  the source (not frozen), a missing settings file is not an error and no template is written (`worker/mix_worker/cli.py:690`).
- The release writes the app's server (public URL and publishable key, repository secrets) into `mix_worker/builtin.py` before
  packing (`.github/scripts/write_builtin.py`); the repository keeps the empty file.
- The two native dependencies have Linux x86_64 and aarch64 wheels in `worker/uv.lock` (shazamio-core, imageio-ffmpeg, which
  brings ffmpeg).

## What changes

One more way to run the worker: a Docker image built from the Python source, published by the same release to the GitHub
Container Registry for `linux/amd64` and `linux/arm64`, with a compose file to start it.

## Requirements

- **FR-001** `worker/Dockerfile` builds the worker from the source: `python:3.13-slim`, the locked dependencies (`uv sync
  --frozen`, no build group), no compiler left in the image, a non-root user. `docker build worker/` works on any x86_64 or arm64
  machine with no other file.
- **FR-002** One volume, `/data`, holds everything the worker keeps: `WORKER_SESSION_FILE=/data/session.json`,
  `WORKER_WORK_DIR=/data/work`, `WORKER_JSON_DIR=/data/results` are set in the image (an environment value still wins).
- **FR-003** The entry point is `mix-worker --config /data/mix-worker.env`; the default command is `run --watch`. Settings come from
  the environment (`env_file` in compose); the optional `/data/mix-worker.env` is read when present. Any command works:
  `docker run … check`, `docker run … --version`.
- **FR-004** The published image knows the app's server: the release job writes `builtin.py` (same script, same secrets) before
  building. An image built locally from the repository has an empty `builtin.py` and needs `SUPABASE_URL` and `SUPABASE_KEY`.
- **FR-005** The release workflow gets an `image` job beside the four builds: write the built-in server, build for `linux/amd64`
  and `linux/arm64` (QEMU), smoke-test the amd64 image (`--version`; `check` with no setting prints `(built in)`), then push
  `ghcr.io/vatheo/mix-worker:<version>` and `:latest`. It runs only when the version is new, like the builds. The `release` job
  waits for it. Permission `packages: write` on that job only.
- **FR-006** `worker/docker-compose.yml`: the published image, `env_file: mix-worker.env`, a named volume on `/data`,
  `restart: on-failure`, `WORKER_NAME` set. It is attached to the release beside the executables.
- **FR-007** `worker/.dockerignore` keeps `.env`, `.venv`, `dist`, `build`, `tests`, caches and any session or result file out of
  the build context.
- **FR-008** Docs in the same commit: worker README section **D. With Docker on a server** (the account steps 1–2 of section C
  reused, the env file, `docker compose up -d`, `docker compose logs -f`, update with `pull`), `worker/CLAUDE.md`, how-it-works §15
  and §17, the inventory row, `CHANGELOG.md`, `worker/RELEASE_NOTES.md`; version 0.7.9 in `pyproject.toml`, `__init__.py`,
  `uv.lock`.

## Not changed

- How the worker scans, signs in or talks to the server; shared mode rules (SoundCloud only, ADR-16).
- The four executables and section C (systemd) stay.

## Calls made by the controller (owner may correct)

- **Exit codes 4, 5, 7** (wrong password, wrong setting, account not listed) cannot be excluded from Docker's `on-failure` restart
  the way systemd's `RestartPreventExitStatus` does. Docker's restart delay doubles from 100 ms up to one minute, so a refused
  password is retried at most once a minute after a few tries; section D says to fix the file and run `docker compose up -d`, and
  that `docker compose logs` shows the reason. No wrapper script.
- `WORKER_NAME` defaults to the container's hostname (a random id); the compose file sets it.
- **GHCR visibility**: the first push creates a private package. The owner sets it public once (GitHub → Packages →
  mix-worker → Package settings → Change visibility); section D says so.

## Success criteria

- `python -m unittest discover -s worker/tests` green; `yarn typecheck && yarn lint && yarn test` exit 0.
- Locally: `docker build -t mix-worker:dev worker/`, then `docker run --rm mix-worker:dev --version` prints `mix-worker 0.7.9`, and
  `docker run --rm -e SUPABASE_URL=https://example.supabase.co -e SUPABASE_KEY=sb_publishable_smoke mix-worker:dev check` reads
  the settings with no file.
- After the merge, the release run shows the `image` job green and both tags on GHCR, for amd64 and arm64.
