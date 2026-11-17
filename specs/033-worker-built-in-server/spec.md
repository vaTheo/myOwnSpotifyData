# Feature Specification: The worker executable knows the app's server

**Feature Branch**: `feat/worker-built-in-server`

**Created**: 2026-11-17

**Status**: Approved (owner 2026-11-17: option A, "I would prefer if the keys are not readable from the repo so as env it's good")

**Input**: Owner (2026-11-17): "So you should put the key and the URL directly in the worker so it work from the start".

## Today (as found, 2026-11-17)

- Every user of the worker uses the same `SUPABASE_URL` and `SUPABASE_KEY` (the project URL and publishable key); the account
  comes from `mix-worker login`.
- A downloaded executable's first start wrote `mix-worker.env` and stopped (exit 6) until the user filled the two values.
- The app gets the same two values at build time from the repository variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY`
  (`.github/workflows/ci.yml`); they are not in the code.

## What changes (option A)

- `worker/mix_worker/builtin.py` holds `SUPABASE_URL = ""` and `SUPABASE_KEY = ""` in the repository. Never a value committed.
- The release build (`.github/workflows/worker-release.yml`), after the tests and before PyInstaller, overwrites it in the
  runner's checkout with the repository secrets `SUPABASE_URL` and `SUPABASE_KEY` (`.github/scripts/write_builtin.py`; owner
  2026-11-17: secrets, for the worker build only, so its log masks them; the app build keeps its `VITE_` variables). A
  missing secret, a URL not in
  `https://` or a key not `sb_publishable_…` fails the build. The smoke test checks `check` reads `(built in)` with no settings
  file.
- `load_settings(builtin=)` uses the built-in pair only when neither the file nor the environment sets `SUPABASE_URL` or
  `SUPABASE_KEY`, and only as a whole pair: a URL set alone is refused, never sent the built-in key.
- A packaged first start with a built-in server writes `mix-worker.env` (the optional settings) and goes on to the sign-in; with
  none (a local build), it writes it and exits 6 as before.
- `check` prints `server: <url> (built in)` or `(settings)`.
- The Mix screen's worker help no longer asks to fill the two values (English and French).
- Worker 0.7.7.

## Option not picked

B: the two values written in `config.py`. Refused by the owner: the values must not be readable from the repository.

## Checks

`python -m unittest discover -s tests` (from `worker/`), `yarn typecheck`, `yarn lint`, `yarn test`; the release workflow's
smoke test on the four systems.
