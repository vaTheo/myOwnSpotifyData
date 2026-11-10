# Tasks: The worker asks again by itself after a rate-limit stop

Every commit: `cd worker && python -m unittest discover -s tests` green and `yarn typecheck && yarn lint && yarn test`; `type(scope): summary`; docs in the same commit. No push.

- [x] T001 Failing tests: `tests/test_autoresume.py` (plan after a rate-limited partial, due once after 30 min, cap of 6, other endings plan nothing, complete run resets, manual run replaces the plan, failed or existing insert not counted, 0 = off, shared and once one line), `tests/test_run_queue.py` `AutoAskAgain` (fake clock and sleep: partial sent then one insert after 30 min that runs; 6 cycles; not a rate limit; shared; once; 0 minutes; a failed insert is one line), `tests/test_server.py` `Enqueue` (open check then the app's row; exists; error mapping; the app's payload in `sync.ts`; shared never inserts), `tests/test_config.py` (defaults 30 and 6, 0 allowed, bad values named)
- [x] T002 `autoresume.py`, `Outcome.stopped`, `ServerClient.enqueue`, `Settings.auto_resume_minutes`/`auto_resumes`, `run_queue` wiring and the `check` line; T001 green
- [x] T003 `.env.example` = `mix_worker/env.example`; version 0.7.3 in `pyproject.toml` and `__init__.py`, `uv lock`
- [x] T004 Docs per plan "Documentation"; commit `feat(worker): ask again by itself after a rate-limit stop`
- [x] T005 Review I1: no automatic ask when `WORKER_RESUME_DAYS` is 0 (test first), one line says why; ADR-08 consequence sentence
- [x] T006 Final: worker tests, `yarn typecheck && yarn lint && yarn test`, public-safe check
