# Tasks: The worker drops a finding found between two hits of one song

Every commit: `cd worker && python -m unittest discover -s tests` green (and the repo's `yarn typecheck && yarn lint && yarn test` if the app side is touched); `type(scope): summary`; docs in the same commit. No push.

- [x] T001 Write failing tests in `worker/tests/test_scan.py` (class beside `Merge`): A@720 X@780 A@840 gap 180 → one row A, 2 hits, X gone; A@0 X@60 A@181 → X stays; A, X, B → X stays; A, X, Y, A → both dropped; A, X, A, Z, A → X and Z dropped, one A row; same hit time ties keep input order; a hit at exactly t1 or t2 is an A hit; Shazam id key equality (same `shazam_id`, different names) counts as A; hits of two different songs interleaved A,B,A,B within the gap (nearest-pair rule: state what happens and pin it); the count of dropped hits is returned
- [x] T002 Implement `drop_sandwiched(hits: list[Hit], gap: int) -> tuple[list[Hit], int]` in `worker/mix_worker/scan.py` per plan "Run rule"; T001 green
- [x] T003 `scan()`: apply it just before `return merge(hits, gap)`, set `report["sandwiched"]` (the count) and one progress `say(...)` line when the count > 0; `hits_out` unchanged; extend the pipeline test (`worker/tests/test_pipeline.py` or `test_scan.py`) to pin the report key and that the result tracks lose X
- [x] T004 Version 0.7.2 in `worker/pyproject.toml` and `worker/mix_worker/__init__.py` (the test pins them equal), `uv lock`; `worker/RELEASE_NOTES.md` entry
- [x] T005 Docs per plan "Documentation"; commit `feat(worker): drop findings between two hits of one song`
- [x] T006 Final: `python -m unittest discover -s tests` (in worker/), `yarn typecheck && yarn lint && yarn test`, public-safe check; the result shape test against the app's fixture keys stays green
