# Contract: worker (round 004)

- New settings: `WORKER_REFUSAL_WARN_CALLS` (150), `WORKER_RESUME_DAYS` (7; 0 = never resume).
- `scan.scan(..., progress=callable, resume=state)`: `progress(dict)` called at step changes and at most once a minute;
  it may raise `StopRequested`. `ScanOutput` gains `warnings`, `resumed`.
- `pipeline.run_one`: wires progress to `ServerClient.progress(token, job_id, worker, body)` → `Result` with the row;
  a stop seen ends the run with `stopped_early.reason = "by you"`.
- `runstate.py` (new): `load(link, settings)`, `save(...)`, `clear(link)`; atomic writes under `<work_dir>/runs/`.
- Second pass: places × speeds in speed order (R6).
