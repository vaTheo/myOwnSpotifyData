# Implementation Plan: The worker signs in by itself with a password

**Branch**: `feat/worker-password-sign-in` | **Date**: 2026-11-19 | **Spec**: [spec.md](spec.md)

## Summary

Two optional settings, `WORKER_EMAIL` and `WORKER_PASSWORD`, read by `config.py` (`_account`: both or neither, one alone is a
`SettingsError` naming the other, exit 5); `Settings.worker_password` has `repr=False`, `Settings.signs_in_by_password` says
whether both are set. `ServerClient.sign_in_password(email, password)` posts `{email, password}` to
`/auth/v1/token?grant_type=password` (same host and key as every sign-in) and returns the session triple like `refresh`.
`session.PasswordSignIn(email, password, path, line, now)`:

- `sign_in(client)`: the grant; ok → a `Session` saved as today (0600) and one line `signed in as <email> by password · session
  kept at <path>`; offline/paused → the `Result` as is; anything else → an `unauthorized` refusal ("sign-in refused: the email or
  password is wrong (WORKER_EMAIL, WORKER_PASSWORD): <server message>"), logged once and **kept**, so every later call in the run
  returns it without a request (SC-004).
- `fresh(session, client)`: no session → sign in; another email (case ignored) → one line, sign in; else `ensure_fresh`, and a
  refused refresh → one line, sign in. Refused means `None` (401/403) **or** an `error` with status 400 or 422: GoTrue answers a
  dead refresh token with 400 (`refresh_token_not_found`, `refresh_token_already_used`, `session_not_found`); the session file is
  cleared first. Only with an account: without one, a 400 refresh stays exit 2 as before (FR-010).

`cli.py`: `password_sign_in(settings, deps)` builds it (None when unset). `cmd_run` signs in before the loop when set and passes
`account=` to `run_queue`; without the settings it is unchanged (the fake `run_queue` of the existing tests keeps its signature).
`run_queue(account=None)`: one `keep(session)` replaces the three `ensure_fresh` calls and the request's `token()`; with an account
it is `account.fresh`, without it `ensure_fresh` as before, and a refusal already logged is not logged again as `server: …`.
`cmd_login` with the settings asks nothing: a session of that account is kept, another replaced. `check` adds `sign-in: by
password as <email>` only when set. The double-click path signs in by `cmd_run`, not by the prompt.

`parse_env_file`: a value starting with a quote is kept whole between that quote and the last same quote when only spaces or a
`#` comment follow (before, `'x'  # c` kept its quotes); the template says to quote the password.

Version 0.7.8, `uv lock`. No server migration, no app change, no new host, no new dependency.

## Decisions the spec left open

- Email comparison ignores case and surrounding spaces (GoTrue stores emails lower-cased).
- Any refusal other than offline/paused (a 400 "Invalid login credentials", "Email not confirmed", an answer without a session)
  counts as a refused sign-in: exit 4, once per run, the server's message appended.
- The README's unit reads the settings with `--config /etc/mix-worker.env` only, no `EnvironmentFile=`: the password is not in
  the process environment and systemd never parses its quotes.
- The README's unit sets `RestartPreventExitStatus=4 5 7`, so systemd never restarts a refused password, a bad setting or an
  account no longer listed; `Restart=on-failure` with 60 s still covers 2 and 3.

## Tests (written first)

`tests/test_password_sign_in.py`: settings (unset, whole from the file between quotes with a trailing comment, whole from the
environment, environment wins, one alone names the other, not in the repr); `PasswordSignIn` (no session, same account kept,
other account replaced, refused refresh → one sign-in, wrong password once, offline/paused not a refusal); the commands through
`main` (run, no command, valid session, other account, wrong password exit 4, offline 2, paused 3, one setting exit 5, `login`
without prompt, `check`, `logout` then run); `run_queue` (refused refresh at start, refused refresh inside a request's `token()`,
wrong password after a refused refresh, no account unchanged). Every test that writes or prints asserts the password appears in
no output, log line or file. `tests/test_server.py`: the grant's URL, body and headers; a 400 maps to `error` with the message.

## Documentation (same batch)

`worker/README.md` (form C, settings, exit 4, troubleshooting), `worker/.env.example` = `mix_worker/env.example`,
`worker/RELEASE_NOTES.md` (0.7.8), `worker/CLAUDE.md`, `specs/002-mix-analysis-worker/contracts/worker.md` (commands, exits,
settings), how-it-works §17, inventory F49, ADR-16 amendment, `README.md` (owner's manual), `CHANGELOG.md`, `docs/README.md`.
