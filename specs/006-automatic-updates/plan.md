# Automatic Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On open and on return to the app, run the Spotify sync (when the library is older than 12 hours), then the BPM and key run,
then Artist reach, one at a time, and show every job's state in a Settings **Updates** card with an on/off switch.

**Architecture:** A pure chain (`src/model/autoChain.ts`) decides which step runs next from injected predicates and a `run(step, auto)`
callback; `model/state.ts` wires it to the existing `startSync`/`startLookup`/`startReach`, which gain an `{ auto }` option (no wake
lock, no banner except the lock-out and an expired login). A pure `updateLines` (`src/model/updateLines.ts`) builds the card's rows
from the job signals; `ui/Settings.tsx` renders them. `main.tsx` and `autoSync.ts`'s resume trigger call the chain after the server sync.

**Tech Stack:** TypeScript ~6.0.3, Preact + `@preact/signals`, Vitest. No new dependency.

**Spec:** [spec.md](spec.md)

**Branch:** work on `task/general-dev`, commits `type(scope): summary`, each green.

## Global Constraints

- `AUTO_SYNC_AGE_MS = 12 * 60 * 60 * 1000`; the Spotify step is due when `lastSyncAt` is null or `now - lastSyncAt >= AUTO_SYNC_AGE_MS`,
  and not while `syncState` is `locked` with `retryAt > now`.
- Order: `spotify`, `features`, `reach`. One step at a time; never while `jobsBusy()`.
- A step that ended `failed` is not re-run by the chain in the same page session; the Spotify step runs at most once per page session.
- Automatic runs: no `acquireWakeLock`, no `banner` except the Spotify lock-out (`warnBanner(lockMessage(...))`) and the expired-login
  logout path. Tapped runs behave exactly as today.
- Switch: `localStorage` key `autoUpdates`, value `'off'` means off; anything else (absent included) means on. Every access in try/catch.
- Nothing automatic calls `startImport`, `startRekordboxImport`, Create playlist or Like all songs.
- Relative imports carry no extension; tests next to source; no DOM tests (`src/model/*.test.ts` must not import `state.ts`).
- After each task: `yarn typecheck && yarn lint && yarn test`, judged by exit code, not by grepping output.

## Review Focus

1. A failed step retried on every resume (a loop hammering ReccoBeats or Spotify) — pinned in Task 1 (`does not rerun a failed step`).
2. Two chains at once (open's chain still running when the resume trigger fires) — pinned in Task 1 (`trigger while running is a no-op`).
3. The lock-out ignored after a pull rewrote `syncState` — pinned in Task 1 (`skips spotify while locked`).
4. Disconnect racing the chain: a step starting after the wipe — pinned in Task 1 (`stop prevents further steps`) and Task 3's wiring.
5. A tap on Sync now during the chain's BPM step lost or run twice — pinned in Task 1 (`request runs next`, `request dedupes`).

---

### Task 1: The chain (`src/model/autoChain.ts`)

**Files:**
- Create: `src/model/autoChain.ts`
- Test: `src/model/autoChain.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type AutoStep = 'spotify' | 'features' | 'reach';
  export const AUTO_STEPS: readonly AutoStep[]; // ['spotify', 'features', 'reach']
  export const AUTO_SYNC_AGE_MS: number;
  export type StepResult = 'done' | 'failed';
  export interface ChainView {
    current: AutoStep | null;
    waiting: AutoStep[];          // in run order, taps first
    failed: AutoStep[];           // failed this session
  }
  export interface ChainDeps {
    autoOn(): boolean;            // switch on
    signedIn(): boolean;          // Spotify session
    busy(): boolean;              // jobsBusy()
    waitIdle(): Promise<void>;    // resolves once busy() is false
    now(): number;
    lastSyncAt(): number | null;
    lockedUntil(): number | null; // syncState.retryAt when locked, else null
    run(step: AutoStep, auto: boolean): Promise<StepResult>;
    onView(view: ChainView): void;
  }
  export function isSpotifyDue(lastSyncAt: number | null, lockedUntil: number | null, now: number): boolean;
  export interface Chain { trigger(): Promise<void>; request(step: AutoStep): Promise<void>; stop(): void; }
  export function createChain(deps: ChainDeps): Chain;
  ```
- Semantics: `trigger()` returns at once if a loop runs, or `!autoOn() || !signedIn()`; otherwise queues the auto steps (spotify only if
  `isSpotifyDue` and not yet run this session; any step in `failed` skipped) and runs the loop. `request(step)` puts `step` first in the
  queue as a tap (removed from the auto part if there; ignored if it is `current` or already queued as a tap), clears it from `failed`,
  and starts the loop if none runs. The loop: `await waitIdle()`, re-check `signedIn()` (and `autoOn()` for an auto entry, else drop
  it), call `run`, record `failed` or clear it, `onView` after every change. `stop()` empties the queue; the running step finishes.

- [ ] **Step 1: Write the failing tests** in `src/model/autoChain.test.ts` with a fake `ChainDeps` (a `calls: [AutoStep, boolean][]`
  log, `run` resolving from a per-step result map, `waitIdle` resolving at once, `now = () => T`):
  - `isSpotifyDue`: `(null, null, T)` → true; `(T - AUTO_SYNC_AGE_MS + 1, null, T)` → false; `(T - AUTO_SYNC_AGE_MS, null, T)` → true;
    `(null, T + 1, T)` → false; `(null, T - 1, T)` → true.
  - `runs the three steps in order`: lastSyncAt null → `calls` = `[['spotify',true],['features',true],['reach',true]]`.
  - `skips spotify when fresh`: lastSyncAt `T - 1000` → `[['features',true],['reach',true]]`.
  - `skips spotify while locked`: lockedUntil `T + 60_000` → no spotify call.
  - `spotify at most once per session`: two `trigger()` with lastSyncAt null (fake keeps it null) → one spotify call.
  - `does not rerun a failed step`: features → 'failed'; second `trigger()` → calls only `reach` the second time; view `failed` = `['features']`.
  - `trigger while running is a no-op`: first `run` awaits a manual promise; a second `trigger()` adds nothing; after resolving, calls are one each.
  - `off or signed out runs nothing`: `autoOn` false → no calls; `signedIn` false → no calls.
  - `request runs next`: during a blocked `features` run, `request('spotify')` with spotify fresh → after release, calls continue
    `['spotify',false]` then `['reach',true]`.
  - `request dedupes`: `request('reach')` twice while `features` runs → one reach call, with `auto=false`.
  - `request works with the switch off`: `autoOn` false, `request('features')` → `[['features',false]]`.
  - `request clears a failure`: features failed, then `request('features')` → done → view `failed` = `[]`.
  - `stop prevents further steps`: `stop()` during a blocked `spotify` run → after release, no more calls.
  - `waits for an idle library`: `waitIdle` returns a manual promise → no `run` before it resolves.
- [ ] **Step 2: Run** `yarn test src/model/autoChain.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** `src/model/autoChain.ts` per the Interfaces block. Queue entries `{ step, auto }`; a `running` flag guards the loop.
- [ ] **Step 4: Run** `yarn test src/model/autoChain.test.ts` → PASS; then `yarn typecheck && yarn lint && yarn test` exit 0.
- [ ] **Step 5: Commit** `feat(model): automatic job chain (round 006)`.

### Task 2: Update lines (`src/model/updateLines.ts`)

**Files:**
- Create: `src/model/updateLines.ts`
- Test: `src/model/updateLines.test.ts`

**Interfaces:**
- Consumes: `AutoStep`, `ChainView`, `AUTO_SYNC_AGE_MS` (Task 1); `SyncState` (`../sync/runner`), `LookupState` (`../features/lookup`),
  `ReachState`, `ArtistReachSummary` (`../features/reachRun`), `ImportSummary` (`../history/importer`), `RekordboxSummary`
  (`../features/rekordboxImport`), `ServerStatus` (`../server/types`), `formatDateTime` (`../ui/format`). Type-only imports except `formatDateTime`.
- Produces:
  ```ts
  export type UpdateJob = 'server' | 'spotify' | 'features' | 'reach' | 'history' | 'rekordbox';
  export type UpdateTone = 'ok' | 'running' | 'waiting' | 'paused' | 'failed' | 'off' | 'manual';
  export interface UpdateLine { job: UpdateJob; label: string; tone: UpdateTone; text: string; retry: AutoStep | null; }
  export interface UpdateInputs {
    now: number; autoOn: boolean; chain: ChainView;
    server: ServerStatus; sync: SyncState; lastSyncAt: number | null;
    lookup: LookupState; features: { covered: number; total: number } | null;
    reach: ReachState; reachSummary: ArtistReachSummary | null;
    history: ImportSummary | null; rekordbox: RekordboxSummary | null;
  }
  export function updateLines(i: UpdateInputs): UpdateLine[]; // always the six jobs, in UpdateJob order
  ```
- Labels: `Server`, `Spotify`, `BPM and key`, `Artist reach`, `History`, `Rekordbox`. Texts (exact):
  - running: `Running · {done} / {total} {unit}` (`playlists` for spotify, `tracks` for features, `artists` for reach; server:
    `Running · {dataset}`); waiting (in `chain.waiting`): `Waiting`; failed: `Failed · {message}` with `retry` = the step;
  - spotify locked (`retryAt > now`): tone `paused`, `Paused by Spotify until {formatDateTime(retryAt)}`;
  - spotify ok: `Synced {formatDateTime(lastSyncAt)} · next after {formatDateTime(lastSyncAt + AUTO_SYNC_AGE_MS)}` when `autoOn`, else
    `Synced {…}`; never synced: `Never`;
  - features idle/done: `{covered} / {total} tracks with BPM or key`; reach idle/done: `Checked {formatDateTime(ranAt)}` or `Never`;
  - automatic job with `autoOn` false and not running: tone `off`, text prefixed `Off · ` then the idle text;
  - server: `connected` → `Up to date · {formatDateTime(lastSyncAt)}` (`Never` when null); `offline`/`paused`/`error`/`signedOut`/`unset`
    → tone `paused`/`paused`/`failed`/`manual`/`manual` with texts `Offline`, `Paused by the server`, `Failed · {message}`, `Not signed in`, `Not set up`;
  - history: `Imported {formatDateTime(importedAt)} · needs a new export` or `Never · needs a file`, tone `manual`; rekordbox the same with
    `needs a new XML` / `needs a file`.
  - A missing number is never printed as 0: `features` null → `Never`.
- [ ] **Step 1: Write the failing tests**, one per rule above, with fixed `now` and asserting `{tone, text, retry}` of the job's line;
  plus `six lines in order` and `failed shows retry only for automatic jobs` (history/rekordbox/server `retry` always null).
- [ ] **Step 2: Run** `yarn test src/model/updateLines.test.ts` → FAIL.
- [ ] **Step 3: Implement** `updateLines` (one small function per job).
- [ ] **Step 4: Run** the file → PASS; the three commands exit 0.
- [ ] **Step 5: Commit** `feat(model): Updates card lines (round 006)`.

### Task 3: Wiring (`model/state.ts`, `main.tsx`, `server/autoSync.ts`)

**Files:**
- Modify: `src/model/state.ts` (`startSync` `:722`, `startLookup` `:883`, `startReach` `:954`, `disconnect` `:1574`, new exports)
- Modify: `src/main.tsx` (after `await startServerSync()`, and the `sync:` dep of `installAutoSync`)
- Test: `src/server/autoSync.test.ts` (unchanged contract; add one case only if `AutoSyncDeps` changes — it should not)

**Interfaces:**
- Consumes: `createChain`, `AutoStep`, `ChainView` (Task 1).
- Produces (in `state.ts`):
  ```ts
  export interface JobOptions { auto?: boolean }
  export async function startSync(priorityId?: string, opts?: JobOptions): Promise<void>;
  export async function startLookup(opts?: JobOptions): Promise<void>;
  export async function startReach(opts?: JobOptions): Promise<void>;
  export const autoUpdates: Signal<boolean>;          // from localStorage 'autoUpdates'
  export function setAutoUpdates(on: boolean): void;  // persists; on → runAutoChain(); off → chain drops auto entries
  export const chainView: Signal<ChainView>;
  export function runAutoChain(): void;               // void chain.trigger()
  export function requestJob(step: AutoStep): void;   // void chain.request(step)
  ```
- `run(step, auto)` maps: `spotify` → `startSync(undefined, {auto})`, `features` → `startLookup({auto})`, `reach` → `startReach({auto})`;
  result `'failed'` when the job's state ends `error` (spotify also: `cancelled` counts as done), else `'done'`. `features`/`reach` with
  no model → `'done'` without a call. `waitIdle` polls `jobsBusy()` with `effect` from `@preact/signals` (resolve on the first false).
- With `opts.auto`: pass no `acquireWakeLock`; skip `clearBanner()` and every `banner.value =` except the lock-out and the auth logout.
- `disconnect`: call `chain.stop()` first, before the `jobsBusy()` check.
- `main.tsx`: `runAutoChain()` right after `await startServerSync()`; `sync: async () => { await startServerSync(); runAutoChain(); }`.
- [ ] **Step 1:** Implement the options in the three wrappers; `yarn typecheck` exit 0 (existing callers unchanged).
- [ ] **Step 2:** Add the chain instance, `autoUpdates`, `setAutoUpdates`, `chainView`, `runAutoChain`, `requestJob`; wire `disconnect` and `main.tsx`.
- [ ] **Step 3:** `yarn typecheck && yarn lint && yarn test` exit 0.
- [ ] **Step 4: Commit** `feat(app): run the sync, BPM and reach jobs by themselves after the server sync (round 006)`.

### Task 4: Settings Updates card

**Files:**
- Modify: `src/ui/Settings.tsx` (new `UpdatesCard` first in `Settings()`; the Sync now, Look up (ReccoBeats) and Look up artists buttons)
- Modify: `src/styles.css` only if a tone needs a class beyond the existing `muted`/`warn`/`error`

**Interfaces:**
- Consumes: `updateLines` (Task 2); `autoUpdates`, `setAutoUpdates`, `chainView`, `requestJob` (Task 3); `coverage` (existing).
- `UpdatesCard`: `<h2>Updates</h2>`, a checkbox labelled `Automatic updates` bound to `autoUpdates`, then one row per line: label,
  text (class `error` for failed, `warn` for paused, `muted` for off/manual), and a `Retry` button when `retry` is set (`requestJob`).
- The three buttons call `requestJob('spotify' | 'features' | 'reach')` instead of the start functions; each stays disabled while its
  own job runs (and Sync now while locked); while `chainView.current` is another chain step they stay enabled (the tap is queued);
  otherwise the existing `jobsBusy()` gating stays. The playlist screen's own sync button is unchanged (`startSync(id)`).
- [ ] **Step 1:** Implement; `yarn typecheck && yarn lint && yarn test` exit 0.
- [ ] **Step 2:** `yarn dev`, open `http://127.0.0.1:5173/myOwnSpotifyData/#/settings`: the card shows six lines; switch off and reload:
  no job starts; switch on: the chain starts (watch the network panel: no Spotify call when the library is under 12 hours old).
- [ ] **Step 3: Commit** `feat(ui): Updates card and Automatic updates switch in Settings (round 006)`.

### Task 5: Docs and decision

**Files:**
- Create: `docs/architecture/700-adr/ADR-11-automatic-updates.md` (supersedes ADR-02's "only from a button"; amends ADR-04's "start only
  from Settings"; context, options from the spec's question, decision, consequences)
- Modify: ADR-02 and ADR-04 (status line `Amended by ADR-11`), `docs/architecture/700-adr/README.md`, `.specify/memory/constitution.md`
  (II and IV reworded, 2.1.0 → 2.2.0, Sync Impact Report, Last Amended 2026-11-07), root `CLAUDE.md` (the two non-negotiable lines),
  `src/features/CLAUDE.md` (ADR-02 row), `docs/architecture/000-how-it-works.md` §7, §14 (jobs table: "Started from" gains the chain;
  `autoChain.ts`, `updateLines.ts`), §16 (`autoSync.ts` calls the chain), `docs/architecture/100-features.md` (F21 row, last round line),
  `docs/architecture/800-limits-roadmap.md` (two devices running reach at once; 12 h fixed), `README.md` (owner's manual: Updates card
  and switch), `CHANGELOG.md`, `docs/README.md` (lists ADR-11)
- Create: `specs/006-automatic-updates/tasks.md` marking T1–T5 done
- [ ] **Step 1:** Write the pages; every new link answered both ways.
- [ ] **Step 2:** `yarn typecheck && yarn lint && yarn test` exit 0; `wc -l CLAUDE.md` ≤ 150.
- [ ] **Step 3: Commit** `docs(round 006): ADR-11, constitution 2.2.0, how-it-works, inventory F21, README, CHANGELOG`.
