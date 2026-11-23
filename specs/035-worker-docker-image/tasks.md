# Tasks: The worker as a Docker image

Every commit: `cd worker && uv run python -m unittest discover -s tests` green and `yarn typecheck && yarn lint && yarn test`;
`type(scope): summary`; docs in the same commit. No push.

- [x] T001 Plan Task 1: `worker/Dockerfile`, `.dockerignore`, `docker-compose.yml`, version 0.7.9; local build, `--version`, exit 5
  with no server, `check` on a named volume, `docker stop` under 10 s, no compiler
- [x] T002 Plan Task 2: `image` job in `worker-release.yml` (built-in server, QEMU, amd64 + arm64 smoke, GHCR push `<version>` and
  `latest`), release waits for it and attaches `docker-compose.yml`
- [x] T003 Plan Task 3: README section D, `worker/CLAUDE.md`, RELEASE_NOTES, how-it-works §15 §17, inventory, CHANGELOG; commit
  `feat(worker): a Docker image for a server, amd64 and arm64 (spec 035, 0.7.9)`
- [ ] T004 After the merge (owner OK to push): the release run's `image` job green, both tags on GHCR; owner sets the package public
- [ ] T005 Final: worker tests, `yarn typecheck && yarn lint && yarn test`, public-safe check
