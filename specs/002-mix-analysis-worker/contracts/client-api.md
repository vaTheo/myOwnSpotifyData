# Contract: the app side (`src/`)

Builds on `../../001-backend-data-sync/contracts/client-api.md`: `createServerClient`, `ServerResult`, `runPull`, the state wiring.
Everything here is additive; no `DB_VERSION` bump; no new dependency.

## `src/features/mix/url.ts` (pure)

- `requestKey(input: string): string | null` — the canonical link for a request and the `mixes` key: a SoundCloud permalink →
  `normalizeMixUrl(input)`; an `on.soundcloud.com` short link → `null` (the app cannot resolve it without a lookup; the screen
  says "Look up first"); any other `https:` URL → host lower-cased, hash dropped, `utm_*`, `si`, `feature` params dropped,
  the rest kept; `http:`, free text → `null`.

## `src/features/mix/worker.ts` (pure, new)

- `mergeWorkerRows(existing: TracklistRow[], incoming: TracklistRow[]): TracklistRow[]` — the rule of data-model.md: untouched
  scan rows (`source === 'tracklistify'` and `artist`/`title` equal to `detected`) are replaced, everything else kept, ordered by
  `startSec` (nulls last, stable).
- `resultToRows(result: unknown): { ok: true; title: string; author: string | null; rows: TracklistRow[] } | { ok: false; message: string }`
  — `parseTracklistifyJson(JSON.stringify(result))` reused as is, then `validateRow('mixes'-row semantics)` on each row;
  zero valid rows → `ok: false`.
- `jobView(row: unknown): MixJobView | null` — validation of one pulled `jobs` row (data-model.md); `null` is "rejected".
- `requestStatusText(view: MixJobView | undefined, server: ServerStatus): { label: string; canAsk: boolean }` — the one place that
  turns a request state and the server state into the button's wording (FR-001, FR-003, US2 scenario 5); unit-tested for every
  `ServerStatus` arm and every job status.

## `src/server/sync.ts`

- `runPull` gains a step after the mixes branch: `pullJobs(deps, token)` — pages the request history, validates each row with
  `jobView`, writes `MIX_JOBS_META` (per url, newest first, 20 max), then for each `done` row with `applied_at` null, oldest
  first: fetches its `result`, `resultToRows`, reads the local mix for `payload.url`, builds the merged `MixRow` (new mix when
  absent: `title`, `author`, `playerSrc: null`, `slug: null`, `sources` all false + `worker: true`, `savedAt: now`), `putMix`,
  marks `applied_at` with the `is.null` guard, and flags `serverPending.mixes` so the next push carries it. A rejected result
  (`ok: false`) is counted in `rejected`, the row is **not** marked applied, and the screen shows "Result rejected" for it
  (`MixJobView.rejected = true`, local only).
- `runRemoveAll` is unchanged (it already deletes `jobs`); `SERVER_METAS` gains `MIX_JOBS_META` so sign-out and removal clear it.
- `requestIdentify(deps, token, url): Promise<ServerResult<MixJobView | 'exists'>>` — the "Already requested" check then the
  insert.

## `src/server/validate.ts`

- `validateJobRow(value: unknown): MixJobRow | null` (the server row shape, used by `jobView`); `validateSummary` untouched.

## `src/db/schema.ts`, `src/db/repo.ts`

- `MixRow.identifyJobId?: string`, `MixRow.identifiedAt?: number`, `MixRow['sources'].worker?: boolean`.
- `MIX_JOBS_META = 'mixJobs'`, `MixJobView`, `MixJobs = Record<string, MixJobView[]>`.
- `repo.getMeta`/`putMeta`/`deleteMeta` as they are; no new store.

## `src/model/state.ts`

- `mixJobs = signal<MixJobs>({})`, loaded by `loadSavedMixes()` (same place the saved mixes load, never on app load).
- `startIdentifyRequest(url: string): Promise<void>` — the button: `requestKey`, server state gate, `requestIdentify`, then the
  new view prepended to `mixJobs[url]` and `MIX_JOBS_META` written; failures → `mixError` (inline, never a banner); no
  `jobsBusy()` membership (it is one request, under a second).
- `startServerPull` already ends with `loadSavedMixes()`, which now also refreshes `mixJobs`; nothing else changes in the
  pull/push wiring. `startServerSignOut` and `removeServerData` delete `MIX_JOBS_META` and reset `mixJobs`.
- No new `confirm()`.

## `src/ui/Mix.tsx`

- Under the link box: the "Identify on my computer" button with `requestStatusText`'s label; disabled when `canAsk` is false; the
  latest request's state line ("Waiting for your computer since 09:12", "Running on <name> since 09:40", "Done 10:05", "Failed
  10:05: <reason>", "Result rejected"); "Ask again" when done or failed; a collapsed "Earlier requests (n)" list.
- `isTracklistifyView` (no real url) becomes `!view.url.startsWith('https://')`: a worker mix has a real url, may carry
  SoundCloud layers, and shows the provenance line "From your computer · <n> tracks · <date>" beside the existing "From
  Tracklistify" one. The dead "Tracklistify ›" link in the info card is replaced by the worker's manual link (`worker/README.md`).
- Row rendering, editing, deleting, Create playlist from mix, dig links: unchanged (rows are `source: 'tracklistify'`).

## Tests (next to source, `yarn test`)

`url.test.ts` (`requestKey` accepted/refused), `worker.test.ts` (merge rule: edit kept, manual kept, untouched replaced, order;
`resultToRows` on the F15 fixtures and on a result with no `metadata`; `jobView` rejections; `requestStatusText` matrix),
`sync.test.ts` (pull applies one result, marks it, second device skips it, rejected result not marked, history meta written,
`requestIdentify` "exists"), `validate.test.ts` (`validateJobRow`), `repo.test.ts` (optional fields survive a round trip).

## Requests card (added after the first live run)

- `requestList(jobs, mixes, server): RequestListItem[]` in `src/features/mix/worker.ts` — every key's latest request: running,
  then waiting oldest first (the worker's order), then finished newest first; title from the saved mix, else host · last path
  part; `canAskAgain` on a failed or rejected request when `requestStatusText` allows it.
- `RequestsCard` on the Mix screen under the request button: badge, title, state line (tracks on a done saved mix), Check now
  (`startServerSync`), a row opens its saved mix or puts the link in the box.
- `startServerPull` reloads `mixJobs` after every successful pull, also when no result was applied, so a state change shows.
