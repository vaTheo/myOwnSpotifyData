# The worker as a Docker image — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** publish the worker as a `linux/amd64` + `linux/arm64` Docker image built from the Python source, with a compose file, from
the existing worker release.

**Architecture:** a two-stage `worker/Dockerfile` (uv builds a non-editable venv, a slim stage copies it), settings by environment
and one `/data` volume; a new `image` job in `.github/workflows/worker-release.yml` writes the built-in server, builds both
platforms with QEMU + buildx, smoke-tests, pushes to GHCR; the release waits for it and attaches `docker-compose.yml`.

**Tech Stack:** Docker (buildx, QEMU), `python:3.13-slim-bookworm`, uv (`ghcr.io/astral-sh/uv`), GitHub Actions (`docker/*`
actions), GHCR.

**Spec:** `specs/035-worker-docker-image/spec.md`

## Global Constraints

- Platforms `linux/amd64` and `linux/arm64`; image `ghcr.io/vatheo/mix-worker`, tags `<version>` and `latest` (lowercase owner).
- Build from the source: `uv sync --frozen`, no `build` group, no compiler in the final image, non-root user.
- `/data` holds everything: `WORKER_SESSION_FILE=/data/session.json`, `WORKER_WORK_DIR=/data/work`, `WORKER_JSON_DIR=/data/results`.
- Entry point `mix-worker --config /data/mix-worker.env`, default command `run --watch`.
- The repository keeps the empty `mix_worker/builtin.py`; only CI writes it, with `.github/scripts/write_builtin.py` and the
  secrets `SUPABASE_URL`/`SUPABASE_KEY`. Nothing personal in any file (repo is public): examples use `worker@example.com`.
- No new dependency of the worker; no change to `worker/mix_worker/*.py` other than the version.
- Version 0.7.9 in `worker/pyproject.toml`, `worker/mix_worker/__init__.py`, `worker/uv.lock` (`uv lock`).
- Docs in the same commit as the code (CLAUDE.md "Reading protocol" 5). Subagents never `git add` or commit; the controller does.

## Review Focus

1. **`docker stop`**: the worker has no SIGTERM handler and Python as PID 1 ignores a default SIGTERM, so a stop would hang 10 s and
   kill the scan. The Dockerfile sets `STOPSIGNAL SIGINT` (Python turns it into `KeyboardInterrupt`, the Ctrl+C path). Task 1
   verifies `docker stop` returns in under 10 s.
2. **A bind-mounted `/data` owned by root**: the non-root user (uid 10001) cannot write the session. A named volume takes the image
   folder's owner; section D shows the named volume and, for a host folder, `chown 10001:10001`. Task 1 verifies writing to a
   named volume (`check` then `ls` the volume as that user).
3. **Compose `env_file` quoting differs from the worker's file parser**: compose strips the quotes and interpolates `$` in unquoted
   and double-quoted values. Section D says: password in single quotes (`WORKER_PASSWORD='…'`), taken literally by compose. Task 3
   writes it.
4. **A locally built image with no server**: `check` must stop with exit 5 and `setting SUPABASE_URL: not set…`, not a stack trace.
   Task 1 verifies it.
5. **arm64 really runs**: the QEMU build only proves it installs; Task 2 also runs `--version` on the arm64 image under QEMU.

---

### Task 1: The image, the compose file, the version

**Files:**
- Create: `worker/Dockerfile`, `worker/.dockerignore`, `worker/docker-compose.yml`
- Modify: `worker/pyproject.toml`, `worker/mix_worker/__init__.py`, `worker/uv.lock` (0.7.9)

**Interfaces:**
- Produces: a build context `worker/` that `docker build` and Task 2's `docker/build-push-action` (`context: worker`) use as is;
  `worker/docker-compose.yml` that Task 2 attaches to the release.

- [ ] **Step 1: version 0.7.9** in the three files (`cd worker && uv lock`).
- [ ] **Step 2: `worker/.dockerignore`**: `.env`, `*.env`, `.venv`, `dist`, `build`, `tests`, `__pycache__`,
  `*.pyc`, `.pytest_cache`, `session.json`, `runs`, `*.spec`. Keep `pyproject.toml`, `uv.lock`,
  `README.md` (hatchling reads `readme`), `mix_worker/`.
- [ ] **Step 3: `worker/Dockerfile`**:
  - stage `build` from `python:3.13-slim-bookworm`; `COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /bin/uv` (the minor that wrote `uv.lock`; pin it);
    `ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never`; copy `pyproject.toml uv.lock` then
    `uv sync --frozen --no-dev --no-install-project`, then copy `README.md mix_worker/` and `uv sync --frozen --no-dev --no-editable`.
  - final stage from the same base: `useradd --system --uid 10001 --create-home mix-worker`, `install -d -o 10001 -g 10001 /data`,
    `COPY --from=build /app/.venv /app/.venv`, `ENV PATH=/app/.venv/bin:$PATH PYTHONUNBUFFERED=1` and the three `/data` paths,
    `VOLUME /data`, `USER mix-worker`, `WORKDIR /data`, `STOPSIGNAL SIGINT`,
    `ENTRYPOINT ["mix-worker", "--config", "/data/mix-worker.env"]`, `CMD ["run", "--watch"]`. OCI labels: source URL of the
    public repo, licence only if the repo has one.
- [ ] **Step 4: `worker/docker-compose.yml`**: service `mix-worker`, `image: ghcr.io/vatheo/mix-worker:latest`,
  `env_file: mix-worker.env`, `environment: WORKER_NAME: docker` (comment: change it), `volumes: [mix-worker-data:/data]`,
  `restart: on-failure`, top-level `volumes: mix-worker-data: {}`. A comment header: what to put in `mix-worker.env` (section D).
- [ ] **Step 5: verify locally** (from `worker/`):
  - `docker build -t mix-worker:dev .` → success.
  - `docker run --rm mix-worker:dev --version` → `mix-worker 0.7.9`.
  - `docker run --rm mix-worker:dev check; echo $?` → `setting SUPABASE_URL: not set…`, `5`.
  - `docker run --rm -v mw-test:/data -e SUPABASE_URL=https://example.supabase.co -e SUPABASE_KEY=sb_publishable_smoke mix-worker:dev check`
    → prints `session file: /data/session.json`, `ffmpeg` found, exit 0; then
    `docker run --rm -v mw-test:/data --entrypoint sh mix-worker:dev -c 'id; touch /data/x && echo writable'` → uid 10001, `writable`.
  - `docker run -d --name mw-stop -e SUPABASE_URL=… -e SUPABASE_KEY=… mix-worker:dev run --watch; sleep 3; time docker stop mw-stop`
    → under 10 s; `docker rm mw-stop; docker volume rm mw-test`.
  - `docker image inspect mix-worker:dev --format '{{.Size}}'` noted in the report; no `gcc` in the image
    (`docker run --rm --entrypoint sh mix-worker:dev -c 'command -v gcc || echo none'` → `none`).
  - `cd worker && uv run python -m unittest discover -s tests` green.

### Task 2: The release builds and publishes the image

**Files:**
- Modify: `.github/workflows/worker-release.yml`

**Interfaces:**
- Consumes: Task 1's `worker/` context and `worker/docker-compose.yml`; the `version` job outputs `tag`, `exists`.

- [ ] **Step 1: job `image`**, `needs: version`, `if: needs.version.outputs.exists == 'false'`, `runs-on: ubuntu-latest`,
  `permissions: { contents: read, packages: write }`. Steps: checkout; "Write the built-in server" exactly as the `build` job
  (same env, `python3 .github/scripts/write_builtin.py worker/mix_worker/builtin.py`, no uv needed); `docker/setup-qemu-action@v3`;
  `docker/setup-buildx-action@v3`; build amd64 with `load: true`, tag `mix-worker:smoke`; smoke: `--version` prints the version
  without `worker-v`, and `docker run --rm mix-worker:smoke check | grep -F '(built in)'`; build arm64 `load: true` tag
  `mix-worker:smoke-arm64` and `docker run --rm --platform linux/arm64 mix-worker:smoke-arm64 --version`;
  `docker/login-action@v3` to `ghcr.io` with `github.actor` / `secrets.GITHUB_TOKEN`; `docker/build-push-action@v6` with
  `context: worker`, `platforms: linux/amd64,linux/arm64`, `push: true`, tags `ghcr.io/vatheo/mix-worker:<version>` and `:latest`
  (version = tag minus `worker-v`, computed in a step), `cache-from/to: type=gha`.
- [ ] **Step 2: `release` job**: `needs: [version, build, image]`; `gh release create` also attaches `worker/docker-compose.yml`.
- [ ] **Step 3: header comment** of the workflow names the image and the compose file in one or two lines.
- [ ] **Step 4: verify**: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/worker-release.yml'))"` (or
  `actionlint` if installed) → no error; the version-strip and smoke commands run by hand against `mix-worker:dev` give the same
  output. The real run is checked after the merge (spec success criteria).

### Task 3: Docs

**Files:**
- Modify: `worker/README.md` (new section **D. With Docker on a server** after C; "Three ways" becomes "Four ways"; quick links),
  `worker/CLAUDE.md`, `worker/RELEASE_NOTES.md`, `docs/architecture/000-how-it-works.md` §15 (release) and §17 (worker),
  `docs/architecture/100-features.md` (new row, spec 035), `CHANGELOG.md`, `docs/README.md` if it lists specs, any
  `contracts/worker.md` that lists the release assets; `README.md` (owner's manual) one line if it points at section C.

- [ ] **Step 1: section D** contents, in order: what it is (same worker, built from the source, amd64 and arm64); the account steps
  1–2 of section C (link, not repeated); `mix-worker.env` with `WORKER_EMAIL`, `WORKER_PASSWORD='…'` (single quotes: compose takes
  them literally; no `$` interpolation), `WORKER_NAME`; `chmod 600`; get `docker-compose.yml` from the release; `docker compose up
  -d`, `docker compose logs -f` (expected first lines as in C); `docker compose run --rm mix-worker check`; update:
  `docker compose pull && docker compose up -d`; exit 4/5/7 are retried by Docker at most once a minute, fix and `up -d`; a host
  folder instead of the volume needs `chown 10001:10001`; build it yourself: `docker build -t mix-worker worker/` plus
  `SUPABASE_URL`/`SUPABASE_KEY`; GHCR package made public once by the owner; same shared-mode limits as C (one worker per address,
  no VPN).
- [ ] **Step 2: the other pages** per the file list; mark the spec status "Implemented, worker 0.7.9".
- [ ] **Step 3: verify**: every new link resolves (`grep` the anchors); `yarn typecheck && yarn lint && yarn test` exit 0;
  public-safe check from `docs/dev-guide/000-contributing.md#keep-it-public-safe` on the diff.
