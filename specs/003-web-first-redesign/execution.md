# Execution: one subagent per step

How the rest of [tasks.md](tasks.md) is built (owner's request, 2026-11-06: keep the main conversation small so it can be compacted).
The main session is a **controller**. It does not write code, read source files, or look at screenshots. Each step runs in a fresh
**implementer** subagent, which reads this file and its brief, does the work, runs the checks and the visual loop, commits, and
returns a report of ten lines at most. A **reviewer** subagent checks each step's diff. The controller keeps a ledger, which is what
survives compaction.

## Resuming after a compaction

1. Read this file, then the ledger, `.superpowers/sdd/<this plan's directory>/progress.md` (run
   `bash ~/.claude/plugins/cache/anthropic-plugin-directory/superpowers/6.4.2-8ca22dba9a94/skills/subagent-driven-development/scripts/sdd-workspace specs/003-web-first-redesign/execution.md`
   to print the directory).
2. Run `git log --oneline -12`.
3. A step whose `Step <id>: complete` line is in the ledger is done. Never dispatch it again. Resume at the first step without one.

## Steps

All steps run in order, one at a time (they share `src/styles.css` and `tools/shots/pages.ts`). **Stop** means the controller stops
after that step and asks the owner to approve the contact sheet (spec SC-010, and the owner's own request). The controller does not
wait on any other step.

| Step | Story | Tasks | Implementer model | Stop after |
|---|---|---|---|---|
| S01 | US2 tables | T046–T049: column builders, table styles, Top as tables, Compare periods | opus | — |
| S02 | US2 tables | T050–T053: Playlist and Match, Artist, Artists and Under the radar, shots (grid roles, SC-001) | opus | **Stop** (P1 MVP) |
| S03 | US3 details | T054–T058: `trackFacts`, `SideSheet`, `TrackDetails`, `?d=` wiring, in-place expansions removed | opus | — |
| S04 | US3 details | T059–T062: `ListDetail`, Playlists and Artists list–detail, shots | opus | **Stop** |
| S05 | US4 history | T063–T067: series helpers, `MonthBars`, `Meter`, `YearMonthGrid` | opus | — |
| S06 | US4 history | T068–T076: Crate shared, hub cards, the five views, details history chart, shots | opus | **Stop** |
| S07 | US5 Settings | T077–T080: Settings sections and index, Import, shots | opus | **Stop** |
| S08 | US6 Mix | T081–T085: the Mix workspace, `#/mix/<key>`, shots | opus | **Stop** |
| S09 | US7 find | T086–T093: track filters, search index, `FilterBar`, `KeyPicker`, `SearchView`, shots | opus | **Stop** |
| S10 | US8 Overview | T094–T098: `overviewBlocks`, Overview screen, default address, shots | opus | **Stop** |
| S11 | Polish | T099, T100, T102: Firefox/WebKit shots, keyboard walkthrough, quickstart §13 checks. T101 (Lighthouse on the owner's real profile) is the owner's: the subagent writes the steps in its report | opus | — |
| S12 | Docs | T103–T109: the round's documents | opus | — |
| S13 | Final | T110 gate, then one whole-branch review (opus), one fix wave if needed | opus | — |
| S14 | Non-regression | T111–T113: `regression.md` (one row per feature and old address), `yarn regression` end-to-end suite, `yarn invariants` (vs `main`: DB_VERSION, `confirm()` texts, hosts, dependencies, test names, model outputs on demo data) | opus | — |
| S15 | Non-regression | T114–T115: run everything on three browsers, fix each regression with a failing test first, the owner's real-profile checklist | opus | **Stop** (merge is the owner's) |

## The controller's loop, per step

1. Record BASE (`git rev-parse HEAD`).
2. Write the step's brief to `<workspace>/step-<id>-brief.md`. It holds the tasks' lines copied from `tasks.md` (only those tasks),
   any ruling from the ledger that touches them, and the interfaces earlier steps produced, if the brief cannot find them by reading
   the code.
3. Dispatch the implementer with `model` set as in the table. The prompt, short:
   - *"You are implementing step <id> of the web-first redesign in `/home/tvincent/code/myOwnSpotifyData/.claude/worktrees/task-design`."*
   - *"Read `specs/003-web-first-redesign/execution.md`, section 'Rules for every subagent', then your brief `<path>`: it is your
     requirements."*
   - *"Write your full report to `<workspace>/step-<id>-report.md` and return only the short report the rules describe."*
4. On DONE: run `yarn -s typecheck; yarn -s lint; yarn -s test` (exit codes only) and `yarn -s shots:summary | head -12`.
5. Run the skill's `scripts/review-package <this file> BASE HEAD` and dispatch the reviewer (`model: opus`, owner's choice 2026-11-06) with these inputs:
   - the brief, the report and the package paths;
   - the global constraints: the "Non-negotiable rules" of the root `CLAUDE.md`, and spec FR-046 to FR-049;
   - the instruction: *"write your review to `<workspace>/step-<id>-review.md`; return the verdicts (spec ✅/❌, quality approved or not)
     and at most ten one-line findings"*.
6. Findings that are Critical or Important: resume the same implementer with the findings (rounds 1–3), then a fresh opus implementer
   (rounds 4–5), each followed by a scoped re-review. Minor findings go to the ledger. After round 5, rule on what is left and record it.
7. Ledger: `Step <id>: complete (commits <base7>..<head7>, review clean | <K> parked)`, plus any `Ruling:` lines.
8. If the step is a **Stop**, run `yarn shots:sheet` and tell the owner in three lines at most: what is done, the contact-sheet
   path, and the question "approve, or what to change?". Then wait.

## Rules for every subagent (implementer and reviewer)

**Read first**: the root `CLAUDE.md` (its "Non-negotiable rules" bind you), then only the spec and contract sections your brief names:
`spec.md`, `contracts/screens.md`, `contracts/components.md`, `contracts/design-tokens.md`, `contracts/routes.md`, `data-model.md`,
`research.md`. Do not read the whole of every document.

**Never**:

- ask the user anything, or dispatch subagents of your own;
- push;
- add a dependency;
- bump `DB_VERSION`;
- add a Spotify call, scope or external host;
- change a `confirm()` text;
- change how rankings, the Crate rules, Match or gates compute (FR-049);
- leave a failure without a visible place (constitution VII).

**Code conventions**:

- **Imports and style**: Preact with signals. Relative imports carry no extension. Components read only the design tokens
  (`src/ui/theme/tokens.css`); no raw colours.
- **Shared components**: use the existing ones (`src/ui/components/`: `Button`, `IconButton`, `SegmentedButtons`, `Card`,
  `StatusLine`, `EmptyState`, `Flag`, `KeyPill`/`BpmText`, `NoData`, `ProgressBar`, `TextField`, `FileDrop`) and `src/ui/icons.tsx`.
- **Tables**: use `src/ui/table/DataTable.tsx` (`Column<Row>`, the `sort`/`onSort` signals per screen, `rankOf`, `expanded`, `groupOf`).
  For the frame, use `src/ui/layout/` (`windowClass`, `titles.ts`, `Nav`, `TopBar`, `ScreenTabs`).
- **Tests**: test-first for every new pure function, in a `*.test.ts` next to its source. No DOM tests.
- **Formatting**: run `yarn -s prettier --write <the files you changed>`.

**Shell, which refuses some commands**:

- Commands with heredocs, subshells, loops over `$(…)`, or the letters "git" inside another word (`digit`, `github`) are refused.
  Write files with the Write and Edit tools.
- For a scripted edit, save a Python file in your scratchpad and run `python3 -I <file> <args>`.
- Run each git command alone and plainly.

**Checks, judged by exit code and never by grepping the output**: `yarn -s typecheck`, `yarn -s lint`, `yarn -s test`.

**The visual loop** (research D19), at the end of your step:

1. Add or update the step's pages in `tools/shots/pages.ts`: role and text selectors, `window.__demo.set` for job states, `READY` for
   built stories.
2. Run `yarn -s shots --reporter=dot > <scratchpad>/shots.log 2>&1; echo $?`. It takes about four minutes. For a quick look while
   working: `yarn -s shots --reporter=dot --project=1440 -g "<page ids>"`.
3. Read `yarn -s shots:summary <checks>`. Findings in the screens your step owns must reach 0. Findings left in screens of later
   steps are listed in your report, not fixed.
4. Look at the screen-sized screenshots of your pages: `shots-output/pages/<1440|390>/<id>.png`, eight images at most. Fix what is
   misaligned and run again.
5. Run `yarn -s shots:sheet`.

**Bookkeeping**:

- Tick your tasks in `tasks.md` (`- [X]`).
- Add a row for your step to the Progress table of `visual-backlog.md`.
- Commit `type(scope): summary`, ending with the two trailer lines:

  ```text
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Rn4nTK1NA34r6Pq9QTfmyN
  ```

**The short report** you return (the full one goes to the report file), ten lines at most:

```text
Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Commits: <sha7> <subject> (one per line)
Checks: typecheck 0 · lint 0 · test 0 (<n> tests)
Shots: exit <n> · <check>: <count> … (only what is left, and whose step owns it)
Looked at: <page ids and widths>
Concerns: <one line each, or none>
```

## State on 2026-11-06, before S01

| Area | State |
|---|---|
| Done | Setup (visual loop, demo data), Phase 2 (tokens, Roboto, icons, components), US1 (frame), and T041–T045 (sort, keyboard, `DataTable`). The owner approved the look and the frame |
| Commits | `9aeebe5` loop, `9319496` look, `9da6fae` frame, `556d143` table |
| Open findings | rows 41 px (`a.main`, closed by S01/S02 tables), four-figure ranks clipped (Artists, S02). The screen's 960 px cap (`.screen` in `src/styles.css`) is lifted for table screens in S01/S02 |
| Tools | `yarn shots`, `yarn shots:summary`, `yarn shots:sheet`, demo variants `full`, `empty`, `old-import`, `no-reach`, `locked`, `signed-out` |
