# Tasks: The worker signs in by itself with a password

Every commit: `cd worker && uv run python -m unittest discover -s tests` green and `yarn typecheck && yarn lint && yarn test`;
`type(scope): summary`; docs in the same commit. No push.

- [x] T001 Failing tests: `tests/test_password_sign_in.py` (settings, `PasswordSignIn`, the commands, `run_queue`; the password in
  no output, log or file) and `tests/test_server.py` (`sign_in_password` URL, body, headers; 400 refused)
- [x] T002 `config.py` (`_account`, `Settings.worker_email`/`worker_password` `repr=False`, `signs_in_by_password`, quoted values
  kept whole), `server.py` (`sign_in_password`), `session.py` (`PasswordSignIn`, `WRONG_PASSWORD`), `cli.py` (`cmd_run`, `run_queue
  (account=)`, `cmd_login`, `check`, the double-click path); T001 green, every existing test unchanged
- [x] T003 `.env.example` = `mix_worker/env.example` (the two settings, the header corrected); version 0.7.8 in `pyproject.toml` and
  `__init__.py`, `uv lock`
- [x] T004 Docs per plan "Documentation": README form C (account, `shared_workers` row, executable, `/etc/mix-worker.env` mode 600,
  systemd unit, `check`, `journalctl`, shared-mode limits, Shazam's address, cookies), settings table, exit 4, troubleshooting;
  RELEASE_NOTES, `worker/CLAUDE.md`, `contracts/worker.md`, how-it-works §17, inventory F49, ADR-16 amendment, `README.md`,
  `CHANGELOG.md`, `docs/README.md`; commit `feat(worker): sign in by itself with a password (spec 034, 0.7.8)`
- [ ] T005 Owner: create the dedicated account and its `shared_workers` row, then follow README form C on the LXC (outside the code)
- [x] T006 Final: worker tests, `yarn typecheck && yarn lint && yarn test`, public-safe check (no real email, password, URL or path)
