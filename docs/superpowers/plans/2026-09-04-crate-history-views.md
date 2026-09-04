# Crate History Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Five new history views over the imported Extended Streaming History — Heavy rotation, Forgotten gems, All-time classics, By year and Finish rate — gathered behind a new **Crate** tab, so the owner can answer "what should I play tonight" from a phone in a few taps. Everything is computed from the export; Spotify's Web API has no play counts.

**Architecture:** Two new pure cores added to the existing app. The import worker's `PlayAggregator` gains per-month buckets and per-track play outcomes (`attempts` / `finished` / `skipped`) and stamps the summary `version: 2`; `src/model/crate.ts` turns those `PlayRow[]` into the five ranked lists in one in-memory pass each. The screens are Preact function components under `src/ui/crate/`, routed by the URL hash, reading module-level selection signals so a tab switch keeps each view's setting. The Crate is gated on `historySummary.version === 2`, never on sniffing rows.

**Tech Stack:** Unchanged. TypeScript 6.0.x, Vite 8, Preact 10 + @preact/signals, idb 8, fflate 0.8, Vitest 5, fake-indexeddb 6, ESLint 10 flat config, yarn classic, Node 24, GitHub Pages via Actions. No new dependency.

**Spec:** `docs/superpowers/specs/2026-09-04-crate-history-views-design.md` (authority). It builds on `docs/superpowers/specs/2026-09-04-spotify-dj-webapp-design.md` and on the research file `docs/superpowers/research/2026-09-04-history-export-semantics.md`. The shipped app's plan is `docs/superpowers/plans/2026-09-04-spotify-dj-webapp.md`.

## Global Constraints

- Node 24 (`.nvmrc`), yarn classic 1.22. Install with `yarn`. Never `npm install`.
- `typescript` pinned `~6.0.3`. Do not upgrade: `typescript-eslint` 8 supports `<6.1` only.
- `vite` stays an explicit devDependency (Vitest peer, and used directly by the build).
- ESM everywhere (`"type": "module"`). With `moduleResolution: bundler`, relative imports carry **no** `.js` extension.
- Prettier: single quotes, semicolons, ES5 trailing commas, 80 columns. Run `yarn format` before each commit; every code block in this plan is already Prettier-formatted, so `yarn format` should rewrite nothing.
- Before every commit: `yarn typecheck && yarn lint && yarn test` must pass. `yarn build` must pass in Tasks 3 to 7.
- Pure logic is unit-tested; **screens are not**. Tasks 5, 6 and 7 write no test and say so — every number their screens print comes from `src/model/crate.ts`, which Task 2 covers. Tasks 5 to 7 end with a manual pass in `yarn dev` instead.
- `src/model/state.ts` gets no unit test either: importing it in Vitest's Node environment pulls in `src/auth/browser.ts`, which touches `localStorage` at module scope.
- Only the Client ID is configuration: `VITE_SPOTIFY_CLIENT_ID`. Never reference a client secret anywhere.
- Dev is opened at `http://127.0.0.1:5173/myOwnSpotifyData/`, never `localhost`.
- A play still counts when `ms_played >= 30000` and `spotify_track_uri` starts with `spotify:track:`. Short records now also reach the aggregator, but only to feed `attempts` / `finished` / `skipped`; they never add a play, a month bucket, `msPlayed`, `firstTs` or `lastTs`.
- `DB_VERSION` stays `1` (spec §5): play records are schemaless, `replacePlays` already clears the store, and the current `upgrade` callback would throw on a bump. The four new `PlayRow` fields are optional so rows from an older import still type-check.
- The Crate is enabled by `historySummary.value?.version === 2` and by nothing else. A summary without a version shows the re-import state; no summary shows the empty state.
- Sync still runs only when the user taps Sync. Never on page load.
- Nothing is caught silently: every failure ends in a state signal that a screen renders.
- Commit messages: conventional prefix (`feat:`, `test:`, `chore:`, `docs:`), end with
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu`.
- Do not push. The owner pushes.

## File Structure

New files:

| File | Task | Responsibility |
| --- | --- | --- |
| `src/model/crate.ts` | 2 | The five pure computations plus `monthKey`, `lastMonths`, `periodMonths`, `yearsWithPlays`, `hasMonthData`, `gemCutoff`, `rateBand` and the thresholds |
| `src/model/crate.test.ts` | 2 | 21 tests: window arithmetic, each view's threshold, sort order and tie-break, rows without months ignored |
| `src/ui/crate/CrateHub.tsx` | 3, 4 | `#/crate`: provenance line and the five rows, each with its live count and current setting |
| `src/ui/crate/CrateView.tsx` | 3, 5 | Wraps every sub-screen in `CrateShell` and dispatches on the route's `view` |
| `src/ui/crate/selections.ts` | 4 | The six module-level selection signals (survive tab switches, reset on reload) |
| `src/ui/crate/shared.tsx` | 4, 5 | `useCrateRows`, `CrateShell`, `CrateRow`, `PlaylistLinks`, `OpenMonthLink`, `Paged`, `trackLabel`, `inNoPlaylist`, `monthLabel`, `STALE_MS` |
| `src/ui/crate/CrateEmpty.tsx` | 4 | The "crate is empty" and "needs importing again" cards |
| `src/ui/crate/Rotation.tsx` | 5 | Heavy rotation |
| `src/ui/crate/Gems.tsx` | 5 | Forgotten gems |
| `src/ui/crate/Classics.tsx` | 5, 6 | All-time classics |
| `src/ui/crate/ByYear.tsx` | 5, 6 | By year, with the season and month chips and the period preselect |
| `src/ui/crate/Finish.tsx` | 5, 7 | Finish rate |

Modified files:

| File | Task | Change |
| --- | --- | --- |
| `src/db/schema.ts` | 1 | `PlayRow` gains optional `months`, `attempts`, `finished`, `skipped` |
| `src/history/records.ts` | 1 | `Outcomes`, `Outcome`, `outcomeOf`, `monthOf`; `PlayAggregator` takes short records and gains `outcomes()` and `zone()` |
| `src/history/process.ts` | 1 | The `done` message gains `outcomes` and `zone` |
| `src/history/importer.ts` | 1 | `ImportSummary` gains `version?: 2`, `outcomes`, `zone`; `tracks` and `matchedTracks` count rows with `plays > 0` |
| `src/model/aggregate.ts` | 1 | `Model` gains `plays` and `playlistsOfNameKey`; `playsFor` ignores a zero-play row on both paths |
| `src/history/records.test.ts` | 1 | Rewritten: 13 tests |
| `src/model/aggregate.test.ts`, `src/history/process.test.ts`, `src/history/importer.test.ts` | 1 | Fixtures and new cases for the fields above |
| `src/router.ts`, `src/router.test.ts` | 3 | `CRATE_VIEWS`, `CrateView`, the two new `Route` members, `#/crate/...` parsing and hrefs |
| `src/app.tsx` | 3 | Tab bar becomes Crate · Top · Playlists · Artists · Settings; `#/import` highlights Settings; two new screen cases |
| `src/ui/components/Segmented.tsx` | 3 | `scroll?: boolean` |
| `src/ui/components/Badge.tsx` | 3 | Kinds `'todo'` (amber) and `'skip'` (red) |
| `src/ui/components/Empty.tsx` | 3 | `href?` and `cta?`, defaulting to today's values |
| `src/styles.css` | 3, 4 | `.back`, `.provenance`, `.caption`, `.legend`, `.footer-note`, `.strip`, `.hub-row` and children, `.segmented.scroll`, `.badge.todo`, `.badge.skip`, `.sublist li`, `.sublist ul`, `.sublist p` |
| `src/model/state.ts` | 4 | `CRATE_NOTICE_META`, `CrateStatus`, the `crateStatus` computed, the once-only re-import banner |
| `src/ui/format.ts`, `src/ui/format.test.ts` | 4 | `formatDate` accepts an epoch as well as an ISO string |
| `src/ui/Settings.tsx` | 7 | The "Listening history" card becomes `HistoryCard`: range, track count, import zone and the zone-mismatch warning |
| `src/ui/Import.tsx` | 7 | The last-import card gains the zone line and the starts / played-through line |
| `CLAUDE.md`, `README.md` | 7 | Spec pointers, Crate architecture and conventions, the "Using it" list |

Decisions taken while assembling this plan, where the spec left a choice open:

- **`shared.tsx` is model-implicit.** Everything it exports except `playlistsOfRow` reads `model` from `src/model/state` rather than taking a `Model` parameter, so no screen ever holds the model. `CrateRow` prints `badge1` then `badge2` verbatim and does **not** apply the amber rule itself, because badge 2's precedence differs per view (Heavy rotation puts its blue `New` ahead of amber).
- **`CrateShell` is owned by `CrateView`.** It renders only the `‹ Crate` link and the `<h1>`; every screen is a fragment that starts at its control, then the caption, then the list or the empty state — spec §3's order, with the control reachable when the result is empty.
- **The Crate's empty states are inline `<div class="empty">` blocks, not the `Empty` component.** `Empty` renders a fixed `No {what} yet.` sentence, which none of the Crate's approved copy fits, and `Try 6 months` is a signal write rather than a link. Spec §6 still mandates `Empty`'s new `href?`/`cta?` props, so Task 3 adds them; they end up unused, and the four existing call sites keep today's defaults.
- **`FinishItem.rate`'s scale is unspecified in spec §5.** The badge percent is computed from the row (`finished / outcomes`, rounded) and banded through `rateBand(pct / 100)`, so the badge colour and the `65%+ green · under 35% red` legend cannot disagree by a rounding step.
- **`playsFor` falls through** from a zero-play id row to the name path rather than returning `null` at once: before Task 1 a short-only track had no row at all and the name path was reached, so blocking it would silently drop counts the Playlist and Artist screens show today.
- **`ImportSummary.version` is optional** (`version?: 2`), so a summary written by the previous release still types as an `ImportSummary` and can drive the re-import state.
- Two exports go beyond spec §5's signature block, both because a caption needs them: `gemCutoff(now, months)` (Forgotten gems prints "nothing since Sep 2025") and `rateBand(rate)` (the Finish badge colour).

Verification: the seven tasks were applied in order to a scratch copy of the repository and gated with `yarn typecheck && yarn lint && yarn test && yarn build`, plus `prettier --check`. All four pass. The suite goes from **111 tests in 15 files** to **148 tests in 16 files**.

---

### Task 1: Month buckets, play outcomes and a versioned import summary

**Files:**
- Create: none
- Modify:
  - `src/db/schema.ts` (the `PlayRow` interface)
  - `src/history/records.ts` (`RawRecord`; new `Outcomes`, `Outcome`,
    `SKIP_REASONS`, `outcomeOf`, `monthOf`, `TrackTotals`; the whole
    `PlayAggregator` class)
  - `src/history/process.ts` (the `done` arm of `ImportMessage`, the final
    `post` in `processFiles`)
  - `src/history/importer.ts` (the `ImportSummary` interface, the `summary`
    literal inside `worker.onmessage`)
  - `src/model/aggregate.ts` (the `Model` interface, `buildModel`, `playsFor`)
- Test:
  - `src/history/records.test.ts` (rewritten)
  - `src/model/aggregate.test.ts` (fixture rows, two new tests)
  - `src/history/process.test.ts` (one new test)
  - `src/history/importer.test.ts` (fixtures, one new test)

**Interfaces:**
- Consumes (existing code, unchanged):
  - `PlayRow { trackId; plays; msPlayed; firstTs; lastTs; trackName; artistName }`
    and `AllRows`, `DjDb` from `src/db/schema.ts`
  - `MIN_PLAY_MS = 30_000`, `RecordClass`, `ImportCounts`, `emptyCounts()`,
    `trackIdFromUri(uri: unknown): string | null`,
    `classify(record: unknown): RecordClass` from `src/history/records.ts`
  - `nameKey(artist: string, title: string): string` from `src/model/normalize.ts`
  - `replacePlays(rows: PlayRow[]): Promise<void>`,
    `putMeta(name, value): Promise<void>` from `src/db/repo.ts`
- Produces (later Crate tasks rely on these):
  - `PlayRow` gains `months?: Record<string, number>`, `attempts?: number`,
    `finished?: number`, `skipped?: number`
  - `interface Outcomes { attempts: number; finished: number; skipped: number }`
    (`src/history/records.ts`)
  - `type Outcome = 'finished' | 'skipped' | 'neutral'`,
    `outcomeOf(record: unknown): Outcome`
  - `PlayAggregator` gains `outcomes(): Outcomes` and `zone(): string`
  - `ImportMessage`'s `done` arm gains `outcomes: Outcomes` and `zone: string`
  - `ImportSummary` gains `version?: 2`, `outcomes: Outcomes`, `zone: string`;
    `tracks` and `matchedTracks` count only rows with `plays > 0`
  - `Model` gains `plays: PlayRow[]` and
    `playlistsOfNameKey: Map<string, Set<string>>`
  - `playsFor` keeps its signature and returns `null` for a row with
    `plays === 0`

**Notes:**
- `DB_VERSION` stays `1` (spec §5, deviation recorded in §8): play records are
  schemaless, `replacePlays` already clears the store, and the current
  `upgrade` callback creates every store unconditionally so a bump would throw
  on an existing database. Old rows keep feeding the existing play badges
  until the owner re-imports.
- `playsFor` falls through from a zero-play id row to the name path instead of
  returning `null` immediately. Before this task a short-only track had no row
  at all and the name path was reached; blocking it now would silently drop
  counts the Playlist and Artist screens show today.
- `version` is optional (`version?: 2`) so a summary stored by the previous
  release still types as an `ImportSummary`. The gate later tasks use is
  exactly `historySummary.value?.version === 2`; per spec §3 the Crate is
  never enabled by sniffing rows for `months`.
- `ImportSummary.matchedTracks` is filtered on `plays > 0` as well. The spec
  names only `tracks`, but `Import.tsx` renders "N tracks matched your
  playlists" directly under "across M tracks", and N > M would read as a bug.
- `playlistsOfNameKey` is built from playlist **entries**, not from
  `rows.tracks`: its only purpose is playlist membership, which a track row
  alone cannot answer.
- Left for the UI task: `Import.tsx`'s "Not counted: … under 30 s" line is
  slightly false once short records feed `attempts`/`finished`/`skipped`. Spec
  §3 rewrites that card anyway; do not touch it here.
- `sum(months) === plays` holds for every record with a parseable `ts`. A
  credited record whose `ts` is missing or unparseable still counts as a play
  and gets no month; real exports always carry `ts`.

- [ ] **Step 1: Rewrite the records test**

`src/history/records.test.ts` (complete new file; `rec()`'s default `ts` moves
to mid-month at noon UTC so month bucketing is the same in every zone):

```ts
import { describe, expect, it } from 'vitest';
import {
  MIN_PLAY_MS,
  PlayAggregator,
  classify,
  emptyCounts,
  outcomeOf,
  trackIdFromUri,
} from './records';

function rec(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ts: '2024-01-15T12:00:00Z',
    platform: 'android',
    ms_played: 200000,
    conn_country: 'FR',
    ip_addr: null,
    master_metadata_track_name: 'Song',
    master_metadata_album_artist_name: 'Artist',
    master_metadata_album_album_name: 'Album',
    spotify_track_uri: 'spotify:track:t1',
    episode_name: null,
    episode_show_name: null,
    spotify_episode_uri: null,
    audiobook_title: null,
    audiobook_uri: null,
    audiobook_chapter_uri: null,
    audiobook_chapter_title: null,
    reason_start: 'trackdone',
    reason_end: 'trackdone',
    shuffle: false,
    skipped: false,
    offline: false,
    offline_timestamp: null,
    incognito_mode: false,
    ...over,
  };
}

describe('trackIdFromUri', () => {
  it('extracts the id from track uris only', () => {
    expect(trackIdFromUri('spotify:track:abc')).toBe('abc');
    expect(trackIdFromUri('spotify:episode:abc')).toBeNull();
    expect(trackIdFromUri('spotify:track:')).toBeNull();
    expect(trackIdFromUri(null)).toBeNull();
  });
});

describe('classify', () => {
  it('applies the 30 second rule to track plays', () => {
    expect(classify(rec())).toBe('credited');
    expect(classify(rec({ ms_played: MIN_PLAY_MS }))).toBe('credited');
    expect(classify(rec({ ms_played: MIN_PLAY_MS - 1 }))).toBe('short');
    expect(classify(rec({ ms_played: null }))).toBe('short');
  });

  it('classifies podcasts, audiobooks, null-metadata rows and junk', () => {
    expect(
      classify(
        rec({
          spotify_track_uri: null,
          spotify_episode_uri: 'spotify:episode:e',
        })
      )
    ).toBe('podcast');
    expect(
      classify(
        rec({ spotify_track_uri: null, audiobook_uri: 'spotify:show:b' })
      )
    ).toBe('audiobook');
    expect(classify(rec({ spotify_track_uri: null }))).toBe('unattributed');
    expect(classify(null)).toBe('malformed');
    expect(classify('x')).toBe('malformed');
    expect(classify([])).toBe('malformed');
  });
});

describe('outcomeOf', () => {
  it('lets trackdone win over the skipped flag', () => {
    expect(outcomeOf(rec({ reason_end: 'trackdone', skipped: true }))).toBe(
      'finished'
    );
  });

  it('counts the four skip reasons and the skipped flag', () => {
    for (const reason of ['fwdbtn', 'backbtn', 'endplay', 'unknown']) {
      expect(outcomeOf(rec({ reason_end: reason }))).toBe('skipped');
    }
    expect(outcomeOf(rec({ reason_end: 'logout', skipped: true }))).toBe(
      'skipped'
    );
  });

  it('leaves interruptions and the pre-2017 values neutral', () => {
    for (const reason of [
      'logout',
      'remote',
      'trackerror',
      'unexpected-exit',
      'unexpected-exit-while-paused',
      'switched-to-audio',
      '',
      'appload',
      'clickrow',
      'clickside',
      'playbtn',
      'popup',
      'uriopen',
    ]) {
      expect(outcomeOf(rec({ reason_end: reason }))).toBe('neutral');
    }
    expect(outcomeOf(rec({ reason_end: null }))).toBe('neutral');
    expect(outcomeOf(42)).toBe('neutral');
  });
});

describe('PlayAggregator', () => {
  it('counts plays per track with totals, first and last timestamps', () => {
    const agg = new PlayAggregator();
    agg.add(rec({ ts: '2024-03-15T12:00:00Z' }));
    agg.add(rec({ ts: '2022-01-15T12:00:00Z', ms_played: 50000 }));
    agg.add(rec({ ms_played: 1000 }));
    agg.add(
      rec({
        spotify_track_uri: 'spotify:track:t2',
        ts: '2025-01-15T12:00:00Z',
        master_metadata_track_name: null,
      })
    );
    agg.add(rec({ spotify_track_uri: null }));
    agg.add(42);
    expect(agg.counts).toEqual({
      ...emptyCounts(),
      credited: 3,
      short: 1,
      unattributed: 1,
      malformed: 1,
    });
    const rows = agg.rows().sort((a, b) => a.trackId.localeCompare(b.trackId));
    expect(rows).toEqual([
      {
        trackId: 't1',
        plays: 2,
        msPlayed: 250000,
        firstTs: '2022-01-15T12:00:00Z',
        lastTs: '2024-03-15T12:00:00Z',
        trackName: 'Song',
        artistName: 'Artist',
        months: { '2022-01': 1, '2024-03': 1 },
        attempts: 3,
        finished: 3,
        skipped: 0,
      },
      {
        trackId: 't2',
        plays: 1,
        msPlayed: 200000,
        firstTs: '2025-01-15T12:00:00Z',
        lastTs: '2025-01-15T12:00:00Z',
        trackName: null,
        artistName: 'Artist',
        months: { '2025-01': 1 },
        attempts: 1,
        finished: 1,
        skipped: 0,
      },
    ]);
    expect(agg.range()).toEqual({
      first: '2022-01-15T12:00:00Z',
      last: '2025-01-15T12:00:00Z',
    });
    expect(agg.outcomes()).toEqual({
      attempts: 4,
      finished: 4,
      skipped: 0,
    });
  });

  it('fills names from a later record when the first was null', () => {
    const agg = new PlayAggregator();
    agg.add(rec({ master_metadata_track_name: null }));
    agg.add(rec());
    expect(agg.rows()[0].trackName).toBe('Song');
  });

  it('keeps the latest non-null name when a later record renames a track', () => {
    const agg = new PlayAggregator();
    agg.add(rec({ master_metadata_track_name: 'Old title' }));
    agg.add(rec({ master_metadata_track_name: null }));
    agg.add(rec({ master_metadata_track_name: 'New title' }));
    expect(agg.rows()[0].trackName).toBe('New title');
  });

  it('has no range when nothing was credited', () => {
    expect(new PlayAggregator().range()).toBeNull();
  });

  it('gives a short-only track a row with no play', () => {
    const agg = new PlayAggregator();
    agg.add(
      rec({
        spotify_track_uri: 'spotify:track:s1',
        ms_played: 4000,
        reason_end: 'fwdbtn',
      })
    );
    agg.add(
      rec({
        spotify_track_uri: 'spotify:track:s1',
        ms_played: 1200,
        reason_end: 'backbtn',
      })
    );
    expect(agg.rows()).toEqual([
      {
        trackId: 's1',
        plays: 0,
        msPlayed: 0,
        firstTs: '',
        lastTs: '',
        trackName: 'Song',
        artistName: 'Artist',
        months: {},
        attempts: 2,
        finished: 0,
        skipped: 2,
      },
    ]);
    expect(agg.counts.short).toBe(2);
    expect(agg.range()).toBeNull();
    expect(agg.outcomes()).toEqual({
      attempts: 2,
      finished: 0,
      skipped: 2,
    });
  });

  it('buckets credited plays by month so the months sum to the plays', () => {
    const agg = new PlayAggregator();
    agg.add(rec({ ts: '2024-07-15T12:00:00Z' }));
    agg.add(rec({ ts: '2024-07-20T12:00:00Z' }));
    agg.add(rec({ ts: '2025-02-15T12:00:00Z' }));
    agg.add(
      rec({
        ts: '2025-02-16T12:00:00Z',
        ms_played: 2000,
        reason_end: 'fwdbtn',
      })
    );
    const row = agg.rows()[0];
    expect(row.months).toEqual({ '2024-07': 2, '2025-02': 1 });
    const summed = Object.values(row.months ?? {}).reduce((a, b) => a + b, 0);
    expect(summed).toBe(row.plays);
    expect(row.attempts).toBe(4);
    expect(row.skipped).toBe(1);
  });

  it('reports the device zone alongside the outcome totals', () => {
    const agg = new PlayAggregator();
    agg.add(rec());
    expect(agg.zone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(agg.outcomes()).toEqual({
      attempts: 1,
      finished: 1,
      skipped: 0,
    });
  });
});
```

- [ ] **Step 2: Update the aggregate test**

In `src/model/aggregate.test.ts`, add the `nameKey` import. Replace:

```ts
import {
  artistKey,
  artistTracks,
  buildModel,
  playlistRanking,
  playsFor,
  topArtists,
  topTracks,
} from './aggregate';
```

with:

```ts
import {
  artistKey,
  artistTracks,
  buildModel,
  playlistRanking,
  playsFor,
  topArtists,
  topTracks,
} from './aggregate';
import { nameKey } from './normalize';
```

Add two rows with no credited play to the fixture. Replace:

```ts
    {
      trackId: 'other-id-2',
      plays: 1,
      msPlayed: 3,
      firstTs: '',
      lastTs: '',
      trackName: 'Relinked Song',
      artistName: 'Daft Punk',
    },
  ],
};
```

with:

```ts
    {
      trackId: 'other-id-2',
      plays: 1,
      msPlayed: 3,
      firstTs: '',
      lastTs: '',
      trackName: 'Relinked Song',
      artistName: 'Daft Punk',
    },
    {
      trackId: 'other-id-3',
      plays: 0,
      msPlayed: 0,
      firstTs: '',
      lastTs: '',
      trackName: 'Relinked Song',
      artistName: 'Daft Punk',
      months: {},
      attempts: 2,
      finished: 0,
      skipped: 2,
    },
    {
      trackId: 't3',
      plays: 0,
      msPlayed: 0,
      firstTs: '',
      lastTs: '',
      trackName: 'Song t3',
      artistName: 'Justice',
      months: {},
      attempts: 5,
      finished: 0,
      skipped: 5,
    },
  ],
};
```

Add a `buildModel` test. Replace:

```ts
  it('maps tracks to playlists', () => {
    expect([...model.playlistsOfTrack.get('t2')!]).toEqual(['p1', 'p2']);
    expect([...model.playlistsOfTrack.get('t1')!]).toEqual(['p1']);
  });
});
```

with:

```ts
  it('maps tracks to playlists', () => {
    expect([...model.playlistsOfTrack.get('t2')!]).toEqual(['p1', 'p2']);
    expect([...model.playlistsOfTrack.get('t1')!]).toEqual(['p1']);
  });

  it('keeps the raw play rows and maps track names to playlists', () => {
    const inPlaylists = (artist: string, title: string) => [
      ...(model.playlistsOfNameKey.get(nameKey(artist, title)) ?? []),
    ];
    expect(model.plays).toBe(rows.plays);
    expect(inPlaylists('Daft Punk', 'Relinked Song')).toEqual(['p1']);
    expect(inPlaylists('Daft Punk', 'Song t2')).toEqual(['p1', 'p2']);
    expect(inPlaylists('Justice', 'Song t3')).toEqual(['p2']);
    expect(inPlaylists('Daft Punk', 'Song t9')).toEqual([]);
  });
});
```

Add the zero-play test. Replace:

```ts
    expect(playsFor(model, track('t3', [justice]))).toBeNull();
    expect(playsFor(model, track('x', []))).toBeNull();
  });
});
```

with:

```ts
    expect(playsFor(model, track('t3', [justice]))).toBeNull();
    expect(playsFor(model, track('x', []))).toBeNull();
  });

  it('ignores rows with no credited play on both paths', () => {
    expect(model.playsById.get('t3')?.plays).toBe(0);
    expect(model.playsByName.has(nameKey('Justice', 'Song t3'))).toBe(false);
    expect(
      playsFor(model, {
        id: 'other-id-3',
        name: 'Relinked Song',
        artists: [daft],
      })
    ).toEqual({ plays: 8, msPlayed: 5, source: 'name' });
  });
});
```

- [ ] **Step 3: Update the process test**

In `src/history/process.test.ts`, add a test at the end of the
`describe('processFiles', …)` block. Replace:

```ts
  it('reports when nothing matches', async () => {
    const messages = await collect([jsonFile('Playlist1.json', [])]);
    expect(messages).toEqual([
      {
        type: 'error',
        code: 'no-files',
        message: expect.stringContaining('Streaming_History_Audio'),
      },
    ]);
  });
});
```

with:

```ts
  it('reports when nothing matches', async () => {
    const messages = await collect([jsonFile('Playlist1.json', [])]);
    expect(messages).toEqual([
      {
        type: 'error',
        code: 'no-files',
        message: expect.stringContaining('Streaming_History_Audio'),
      },
    ]);
  });

  it('reports the import zone, the outcome totals and the months', async () => {
    const messages = await collect([
      jsonFile('Streaming_History_Audio_2024_0.json', [
        rec({ ts: '2024-05-15T12:00:00Z', reason_end: 'trackdone' }),
        rec({
          ts: '2024-05-16T12:00:00Z',
          ms_played: 4000,
          reason_end: 'fwdbtn',
        }),
        rec({ ts: '2024-05-17T12:00:00Z', reason_end: 'logout' }),
      ]),
    ]);
    const done = messages.at(-1);
    if (done?.type !== 'done') throw new Error('expected done');
    expect(done.zone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(done.outcomes).toEqual({ attempts: 3, finished: 1, skipped: 1 });
    expect(done.plays).toHaveLength(1);
    expect(done.plays[0].plays).toBe(2);
    expect(done.plays[0].months).toEqual({ '2024-05': 2 });
  });
});
```

- [ ] **Step 4: Update the importer test**

In `src/history/importer.test.ts`, add a short-only row helper. Replace:

```ts
const play = (trackId: string) => ({
  trackId,
  plays: 3,
  msPlayed: 90000,
  firstTs: '2020-01-01T00:00:00Z',
  lastTs: '2021-01-01T00:00:00Z',
  trackName: 'S',
  artistName: 'A',
});
```

with:

```ts
const play = (trackId: string) => ({
  trackId,
  plays: 3,
  msPlayed: 90000,
  firstTs: '2020-01-01T00:00:00Z',
  lastTs: '2021-01-01T00:00:00Z',
  trackName: 'S',
  artistName: 'A',
  months: { '2020-01': 2, '2021-01': 1 },
  attempts: 4,
  finished: 3,
  skipped: 1,
});

const shortOnly = (trackId: string) => ({
  trackId,
  plays: 0,
  msPlayed: 0,
  firstTs: '',
  lastTs: '',
  trackName: 'S',
  artistName: 'A',
  months: {},
  attempts: 4,
  finished: 0,
  skipped: 4,
});
```

Carry the new `done` fields and assert the new summary fields. Replace:

```ts
    const worker = new FakeWorker([
      { type: 'progress', file: 'f0', index: 0, total: 2 },
      {
        type: 'done',
        plays: [play('a'), play('b')],
        counts: { ...emptyCounts(), credited: 6 },
        range: { first: '2020-01-01T00:00:00Z', last: '2021-01-01T00:00:00Z' },
        processed: ['f0', 'f1'],
        skipped: [],
      },
    ]);
```

with:

```ts
    const worker = new FakeWorker([
      { type: 'progress', file: 'f0', index: 0, total: 2 },
      {
        type: 'done',
        plays: [play('a'), play('b')],
        counts: { ...emptyCounts(), credited: 6 },
        outcomes: { attempts: 8, finished: 6, skipped: 2 },
        zone: 'Europe/Paris',
        range: { first: '2020-01-01T00:00:00Z', last: '2021-01-01T00:00:00Z' },
        processed: ['f0', 'f1'],
        skipped: [],
      },
    ]);
```

Replace:

```ts
    expect(states.at(-1)).toEqual({
      status: 'done',
      summary: {
        importedAt: 77,
        plays: 6,
        tracks: 2,
        matchedTracks: 1,
        counts: { ...emptyCounts(), credited: 6 },
        range: { first: '2020-01-01T00:00:00Z', last: '2021-01-01T00:00:00Z' },
        processed: ['f0', 'f1'],
        skipped: [],
      },
    });
```

with:

```ts
    expect(states.at(-1)).toEqual({
      status: 'done',
      summary: {
        version: 2,
        importedAt: 77,
        plays: 6,
        tracks: 2,
        matchedTracks: 1,
        counts: { ...emptyCounts(), credited: 6 },
        outcomes: { attempts: 8, finished: 6, skipped: 2 },
        zone: 'Europe/Paris',
        range: { first: '2020-01-01T00:00:00Z', last: '2021-01-01T00:00:00Z' },
        processed: ['f0', 'f1'],
        skipped: [],
      },
    });
```

Replace (in "keeps the previous history when every file was skipped"):

```ts
          {
            type: 'done',
            plays: [],
            counts: emptyCounts(),
            range: null,
            processed: [],
            skipped: [
```

with:

```ts
          {
            type: 'done',
            plays: [],
            counts: emptyCounts(),
            outcomes: { attempts: 0, finished: 0, skipped: 0 },
            zone: 'Europe/Paris',
            range: null,
            processed: [],
            skipped: [
```

Add the counting test at the end of the file. Replace:

```ts
  it('reports a worker that cannot be created', async () => {
    const states: ImportState[] = [];
    await runImport([], {
      createWorker: () => {
        throw new Error('Worker is not defined');
      },
      knownTrackIds: new Set(),
      now: () => 1,
      onState: (s) => states.push(s),
    });
    expect(states.at(-1)).toEqual({
      status: 'error',
      message: 'Could not start the import worker: Worker is not defined',
    });
  });
});
```

with:

```ts
  it('reports a worker that cannot be created', async () => {
    const states: ImportState[] = [];
    await runImport([], {
      createWorker: () => {
        throw new Error('Worker is not defined');
      },
      knownTrackIds: new Set(),
      now: () => 1,
      onState: (s) => states.push(s),
    });
    expect(states.at(-1)).toEqual({
      status: 'error',
      message: 'Could not start the import worker: Worker is not defined',
    });
  });

  it('counts only tracks with a credited play', async () => {
    const states: ImportState[] = [];
    await runImport([], {
      createWorker: () =>
        new FakeWorker([
          {
            type: 'done',
            plays: [play('a'), shortOnly('b')],
            counts: { ...emptyCounts(), credited: 3, short: 4 },
            outcomes: { attempts: 8, finished: 3, skipped: 5 },
            zone: 'America/New_York',
            range: {
              first: '2020-01-01T00:00:00Z',
              last: '2021-01-01T00:00:00Z',
            },
            processed: ['f0'],
            skipped: [],
          },
        ]) as unknown as Worker,
      knownTrackIds: new Set(['a', 'b']),
      now: () => 5,
      onState: (s) => states.push(s),
    });
    const last = states.at(-1);
    if (last?.status !== 'done') throw new Error('expected done');
    expect(last.summary.version).toBe(2);
    expect(last.summary.tracks).toBe(1);
    expect(last.summary.matchedTracks).toBe(1);
    expect(last.summary.zone).toBe('America/New_York');
    expect(last.summary.outcomes).toEqual({
      attempts: 8,
      finished: 3,
      skipped: 5,
    });
    // The skipped-only row is still stored: the finish-rate view needs it.
    expect((await getAllRows()).plays.map((p) => p.trackId)).toEqual([
      'a',
      'b',
    ]);
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

```bash
yarn test src/history/records.test.ts src/model/aggregate.test.ts src/history/process.test.ts src/history/importer.test.ts
```

Expected: `Test Files 4 failed (4)`, `Tests 14 failed | 21 passed (35)`.

- `src/history/records.test.ts`: 7 failed. The three `outcomeOf` tests error
  because `outcomeOf` is not exported yet (`outcomeOf is not a function`, or a
  link-time "does not provide an export named 'outcomeOf'" depending on how
  Vite resolves it). `counts plays per track with totals, first and last
  timestamps` fails its row `toEqual`, which now expects `months`, `attempts`,
  `finished` and `skipped`. `gives a short-only track a row with no play` gets
  `[]` from `agg.rows()`, because short records still create no row. `buckets
  credited plays by month so the months sum to the plays` reads
  `row.months` as `undefined`. `reports the device zone alongside the outcome
  totals` fails on `agg.zone is not a function`.
- `src/model/aggregate.test.ts`: 4 failed — `keeps the raw play rows and maps
  track names to playlists` throws `TypeError: Cannot read properties of
  undefined (reading 'get')` (`model.playlistsOfNameKey` does not exist);
  `ignores rows with no credited play on both paths` fails because
  `playsByName` folded the zero rows in (`has(...)` is `true`); and the two
  older tests `prefers the exact id and falls back to artist and title` and
  `annotates top tracks with playlists and plays` now see the `t3` zero row
  and get `{ plays: 0, msPlayed: 0, source: 'id' }` where they expect `null`.
- `src/history/process.test.ts`: 1 failed — `reports the import zone, the
  outcome totals and the months` gets `undefined` for `done.zone`.
- `src/history/importer.test.ts`: 2 failed — `stores plays and a summary on
  done`, whose summary `toEqual` misses `version`, `outcomes` and `zone`, and
  `counts only tracks with a credited play`, where `tracks` is `2` not `1`.

- [ ] **Step 6: Implement the schema and the aggregator**

`src/db/schema.ts` — replace:

```ts
export interface PlayRow {
  trackId: string;
  plays: number;
  msPlayed: number;
  firstTs: string;
  lastTs: string;
  trackName: string | null;
  artistName: string | null;
}
```

with:

```ts
export interface PlayRow {
  trackId: string;
  plays: number;
  msPlayed: number;
  firstTs: string;
  lastTs: string;
  trackName: string | null;
  artistName: string | null;
  /** 'YYYY-MM' -> credited plays, bucketed in the importing device's zone. */
  months?: Record<string, number>;
  /** Every record with a track URI, including plays under 30 s. */
  attempts?: number;
  /** Records whose reason_end was 'trackdone'. */
  finished?: number;
  /** Records the skip rule counted as a skip. */
  skipped?: number;
  // The four are optional so rows written by an older import still type-check.
  // DB_VERSION stays 1: play records are schemaless, replacePlays clears the
  // store, and the current upgrade callback would throw on a bump.
}
```

`src/history/records.ts` — replace:

```ts
interface RawRecord {
  ts?: unknown;
  ms_played?: unknown;
  spotify_track_uri?: unknown;
  spotify_episode_uri?: unknown;
  audiobook_uri?: unknown;
  master_metadata_track_name?: unknown;
  master_metadata_album_artist_name?: unknown;
}
```

with:

```ts
interface RawRecord {
  ts?: unknown;
  ms_played?: unknown;
  spotify_track_uri?: unknown;
  spotify_episode_uri?: unknown;
  audiobook_uri?: unknown;
  master_metadata_track_name?: unknown;
  master_metadata_album_artist_name?: unknown;
  reason_end?: unknown;
  skipped?: unknown;
}

export interface Outcomes {
  attempts: number;
  finished: number;
  skipped: number;
}

export type Outcome = 'finished' | 'skipped' | 'neutral';

/** reason_end values that mean the listener moved on. */
const SKIP_REASONS = new Set(['fwdbtn', 'backbtn', 'endplay', 'unknown']);

/** A row while it is being built: PlayRow's optional fields are always set. */
type TrackTotals = PlayRow & {
  months: Record<string, number>;
  attempts: number;
  finished: number;
  skipped: number;
};
```

In the same file, add `outcomeOf` and `monthOf` after `classify`. Replace:

```ts
export class PlayAggregator {
  readonly counts: ImportCounts = emptyCounts();
  private readonly byId = new Map<string, PlayRow>();

  add(record: unknown): void {
    const cls = classify(record);
    this.counts[cls] += 1;
    if (cls !== 'credited') return;
    const r = record as RawRecord;
    const id = trackIdFromUri(r.spotify_track_uri);
    if (!id) return;
    const ts = text(r.ts) ?? '';
    const ms = r.ms_played as number;
    const row = this.byId.get(id);
    if (!row) {
      this.byId.set(id, {
        trackId: id,
        plays: 1,
        msPlayed: ms,
        firstTs: ts,
        lastTs: ts,
        trackName: text(r.master_metadata_track_name),
        artistName: text(r.master_metadata_album_artist_name),
      });
      return;
    }
    row.plays += 1;
    row.msPlayed += ms;
    if (ts && (!row.firstTs || ts < row.firstTs)) row.firstTs = ts;
    if (ts > row.lastTs) row.lastTs = ts;
    // Keep the latest name Spotify reported; older exports carry null names.
    const trackName = text(r.master_metadata_track_name);
    if (trackName !== null) row.trackName = trackName;
    const artistName = text(r.master_metadata_album_artist_name);
    if (artistName !== null) row.artistName = artistName;
  }

  rows(): PlayRow[] {
    return [...this.byId.values()];
  }

  range(): { first: string; last: string } | null {
    let first = '';
    let last = '';
    for (const row of this.byId.values()) {
      if (row.firstTs && (!first || row.firstTs < first)) first = row.firstTs;
      if (row.lastTs > last) last = row.lastTs;
    }
    return first ? { first, last } : null;
  }
}
```

with:

```ts
/**
 * reason_end decides first: records carry `skipped: true` next to 'trackdone',
 * and the flag is false for every play between 2015-04-13 and 2022-10-16, so
 * it may only ever add skips.
 */
export function outcomeOf(record: unknown): Outcome {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return 'neutral';
  }
  const r = record as RawRecord;
  if (r.reason_end === 'trackdone') return 'finished';
  if (
    r.skipped === true ||
    (typeof r.reason_end === 'string' && SKIP_REASONS.has(r.reason_end))
  ) {
    return 'skipped';
  }
  // logout, remote, trackerror, the two unexpected exits, switched-to-audio,
  // the empty string and the pre-2017 values are neither: they say nothing
  // about whether the listener liked the track.
  return 'neutral';
}

/** 'YYYY-MM' in the importing device's zone, or null for an unusable ts. */
function monthOf(ts: string): string | null {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return null;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
}

export class PlayAggregator {
  readonly counts: ImportCounts = emptyCounts();
  private readonly byId = new Map<string, TrackTotals>();
  private readonly totals: Outcomes = {
    attempts: 0,
    finished: 0,
    skipped: 0,
  };

  add(record: unknown): void {
    const cls = classify(record);
    this.counts[cls] += 1;
    // Short records credit no play but still say how the track ended.
    if (cls !== 'credited' && cls !== 'short') return;
    const r = record as RawRecord;
    const id = trackIdFromUri(r.spotify_track_uri);
    if (!id) return;
    let row = this.byId.get(id);
    if (!row) {
      row = {
        trackId: id,
        plays: 0,
        msPlayed: 0,
        firstTs: '',
        lastTs: '',
        trackName: null,
        artistName: null,
        months: {},
        attempts: 0,
        finished: 0,
        skipped: 0,
      };
      this.byId.set(id, row);
    }
    row.attempts += 1;
    this.totals.attempts += 1;
    const outcome = outcomeOf(record);
    if (outcome === 'finished') {
      row.finished += 1;
      this.totals.finished += 1;
    } else if (outcome === 'skipped') {
      row.skipped += 1;
      this.totals.skipped += 1;
    }
    // Keep the latest name Spotify reported; older exports carry null names.
    const trackName = text(r.master_metadata_track_name);
    if (trackName !== null) row.trackName = trackName;
    const artistName = text(r.master_metadata_album_artist_name);
    if (artistName !== null) row.artistName = artistName;
    if (cls !== 'credited') return;
    const ts = text(r.ts) ?? '';
    row.plays += 1;
    row.msPlayed += r.ms_played as number;
    if (ts && (!row.firstTs || ts < row.firstTs)) row.firstTs = ts;
    if (ts > row.lastTs) row.lastTs = ts;
    // sum(months) === plays for every record with a parseable ts.
    const month = monthOf(ts);
    if (month) row.months[month] = (row.months[month] ?? 0) + 1;
  }

  rows(): PlayRow[] {
    return [...this.byId.values()];
  }

  outcomes(): Outcomes {
    return { ...this.totals };
  }

  /** The zone the month keys were bucketed in, shown on the Import screen. */
  zone(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  range(): { first: string; last: string } | null {
    let first = '';
    let last = '';
    for (const row of this.byId.values()) {
      if (row.firstTs && (!first || row.firstTs < first)) first = row.firstTs;
      if (row.lastTs > last) last = row.lastTs;
    }
    return first ? { first, last } : null;
  }
}
```

- [ ] **Step 7: Implement the message, the summary and the model**

`src/history/process.ts` — replace:

```ts
import { PlayAggregator, type ImportCounts } from './records';

export type ImportMessage =
  | { type: 'progress'; file: string; index: number; total: number }
  | {
      type: 'done';
      plays: PlayRow[];
      counts: ImportCounts;
      range: { first: string; last: string } | null;
      processed: string[];
      skipped: { name: string; reason: string }[];
    }
```

with:

```ts
import { PlayAggregator, type ImportCounts, type Outcomes } from './records';

export type ImportMessage =
  | { type: 'progress'; file: string; index: number; total: number }
  | {
      type: 'done';
      plays: PlayRow[];
      counts: ImportCounts;
      outcomes: Outcomes;
      /** IANA zone the month keys were bucketed in. */
      zone: string;
      range: { first: string; last: string } | null;
      processed: string[];
      skipped: { name: string; reason: string }[];
    }
```

In the same file, replace the final `post` of `processFiles`:

```ts
  post({
    type: 'done',
    plays: aggregator.rows(),
    counts: aggregator.counts,
    range: aggregator.range(),
    processed,
    skipped,
  });
```

with:

```ts
  post({
    type: 'done',
    plays: aggregator.rows(),
    counts: aggregator.counts,
    outcomes: aggregator.outcomes(),
    zone: aggregator.zone(),
    range: aggregator.range(),
    processed,
    skipped,
  });
```

`src/history/importer.ts` — replace:

```ts
import type { ImportCounts } from './records';

export const HISTORY_SUMMARY_META = 'historySummary';

export interface ImportSummary {
  importedAt: number;
  plays: number;
  tracks: number;
  matchedTracks: number;
  counts: ImportCounts;
  range: { first: string; last: string } | null;
  processed: string[];
  skipped: { name: string; reason: string }[];
}
```

with:

```ts
import type { ImportCounts, Outcomes } from './records';

export const HISTORY_SUMMARY_META = 'historySummary';

export interface ImportSummary {
  /**
   * 2 since the Crate views. Optional because summaries stored by an earlier
   * version have no version at all; those show the re-import state.
   */
  version?: 2;
  importedAt: number;
  plays: number;
  /** Tracks with at least one credited play; short-only rows do not count. */
  tracks: number;
  matchedTracks: number;
  counts: ImportCounts;
  outcomes: Outcomes;
  /** IANA zone the month keys were bucketed in. */
  zone: string;
  range: { first: string; last: string } | null;
  processed: string[];
  skipped: { name: string; reason: string }[];
}
```

In the same file, replace the summary literal inside `worker.onmessage`:

```ts
          await replacePlays(message.plays);
          const summary: ImportSummary = {
            importedAt: deps.now(),
            plays: message.counts.credited,
            tracks: message.plays.length,
            matchedTracks: message.plays.filter((p) =>
              deps.knownTrackIds.has(p.trackId)
            ).length,
            counts: message.counts,
            range: message.range,
            processed: message.processed,
            skipped: message.skipped,
          };
```

with:

```ts
          await replacePlays(message.plays);
          // Rows with no credited play exist only for the finish-rate view;
          // they are stored but never counted as tracks the owner played.
          const played = message.plays.filter((p) => p.plays > 0);
          const summary: ImportSummary = {
            version: 2,
            importedAt: deps.now(),
            plays: message.counts.credited,
            tracks: played.length,
            matchedTracks: played.filter((p) =>
              deps.knownTrackIds.has(p.trackId)
            ).length,
            counts: message.counts,
            outcomes: message.outcomes,
            zone: message.zone,
            range: message.range,
            processed: message.processed,
            skipped: message.skipped,
          };
```

`src/model/aggregate.ts` — replace:

```ts
export interface Model {
  playlists: PlaylistRow[];
  playlistsById: Map<string, PlaylistRow>;
  tracksByKey: Map<string, TrackRow>;
  entriesByPlaylist: Map<string, EntryRow[]>;
  playlistsOfTrack: Map<string, Set<string>>;
  artists: ArtistAgg[];
  artistsByKey: Map<string, ArtistAgg>;
  topItems: Map<string, TopItemsRow>;
  topRank: Map<string, Map<Period, number>>;
  playsById: Map<string, PlayRow>;
  playsByName: Map<string, { plays: number; msPlayed: number }>;
}
```

with:

```ts
export interface Model {
  playlists: PlaylistRow[];
  playlistsById: Map<string, PlaylistRow>;
  tracksByKey: Map<string, TrackRow>;
  entriesByPlaylist: Map<string, EntryRow[]>;
  playlistsOfTrack: Map<string, Set<string>>;
  /** nameKey(lead artist, title) -> playlists holding a track of that name. */
  playlistsOfNameKey: Map<string, Set<string>>;
  artists: ArtistAgg[];
  artistsByKey: Map<string, ArtistAgg>;
  topItems: Map<string, TopItemsRow>;
  topRank: Map<string, Map<Period, number>>;
  /** Every imported row, including tracks with no credited play. */
  plays: PlayRow[];
  playsById: Map<string, PlayRow>;
  playsByName: Map<string, { plays: number; msPlayed: number }>;
}
```

In `buildModel`, replace:

```ts
  const playlistsOfTrack = new Map<string, Set<string>>();
  const artistsByKey = new Map<string, ArtistAgg>();
```

with:

```ts
  const playlistsOfTrack = new Map<string, Set<string>>();
  const playlistsOfNameKey = new Map<string, Set<string>>();
  const artistsByKey = new Map<string, ArtistAgg>();
```

Replace:

```ts
    const track = tracksByKey.get(entry.trackKey);
    if (!track) continue;
    for (const ref of track.artists) {
```

with:

```ts
    const track = tracksByKey.get(entry.trackKey);
    if (!track) continue;
    // Consulted after playlistsOfTrack so a relinked id, whose history row
    // has a different track id, is not reported as being in no playlist.
    const lead = track.artists[0]?.name;
    if (lead) {
      const key = nameKey(lead, track.name);
      const named = playlistsOfNameKey.get(key) ?? new Set<string>();
      named.add(entry.playlistId);
      playlistsOfNameKey.set(key, named);
    }
    for (const ref of track.artists) {
```

Replace:

```ts
  const playsById = new Map(rows.plays.map((p) => [p.trackId, p]));
  const playsByName = new Map<string, { plays: number; msPlayed: number }>();
  for (const p of rows.plays) {
    if (!p.trackName || !p.artistName) continue;
```

with:

```ts
  const playsById = new Map(rows.plays.map((p) => [p.trackId, p]));
  const playsByName = new Map<string, { plays: number; msPlayed: number }>();
  for (const p of rows.plays) {
    // A row built from short records only would create a name key totalling
    // zero, which playsFor would then report as "0 plays".
    if (p.plays === 0) continue;
    if (!p.trackName || !p.artistName) continue;
```

Replace:

```ts
  return {
    playlists,
    playlistsById,
    tracksByKey,
    entriesByPlaylist,
    playlistsOfTrack,
    artists,
    artistsByKey,
    topItems,
    topRank,
    playsById,
    playsByName,
  };
}
```

with:

```ts
  return {
    playlists,
    playlistsById,
    tracksByKey,
    entriesByPlaylist,
    playlistsOfTrack,
    playlistsOfNameKey,
    artists,
    artistsByKey,
    topItems,
    topRank,
    plays: rows.plays,
    playsById,
    playsByName,
  };
}
```

Replace:

```ts
  if (track.id) {
    const byId = model.playsById.get(track.id);
    if (byId)
      return { plays: byId.plays, msPlayed: byId.msPlayed, source: 'id' };
  }
```

with:

```ts
  if (track.id) {
    const byId = model.playsById.get(track.id);
    // A row with no credited play is not a play count. Fall through to the
    // name path, which is where this track landed before short-only rows
    // existed at all.
    if (byId && byId.plays > 0)
      return { plays: byId.plays, msPlayed: byId.msPlayed, source: 'id' };
  }
```

- [ ] **Step 8: Run the tests to verify they pass**

```bash
yarn test src/history/records.test.ts src/model/aggregate.test.ts src/history/process.test.ts src/history/importer.test.ts
```

Expected: PASS. 4 files, 35 tests — records 13, aggregate 11, process 6,
importer 5.

- [ ] **Step 9: Commit**

```bash
yarn format && yarn typecheck && yarn lint && yarn test && yarn build
git add src/db/schema.ts src/history/records.ts src/history/records.test.ts \
  src/history/process.ts src/history/process.test.ts \
  src/history/importer.ts src/history/importer.test.ts \
  src/model/aggregate.ts src/model/aggregate.test.ts
git commit -m "feat(history): month buckets, play outcomes and a versioned summary

Aggregate short records as well as credited ones so every track gets
attempts, finished and skipped counts, bucket credited plays per month in
the importing device's zone, and report both plus the zone in the import
summary as version 2. Rows with no credited play never show as a count.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

---

### Task 2: Crate computations

**Files:**
- Create: `src/model/crate.ts`
- Modify: none. `src/db/schema.ts` already carries `months?`, `attempts?`,
  `finished?` and `skipped?` on `PlayRow` from Task 1; do not add them again.
- Test: `src/model/crate.test.ts`

**Interfaces:**
- Consumes:
  - `PlayRow` from `src/db/schema` (Task 1):
    `{ trackId: string; plays: number; msPlayed: number; firstTs: string; lastTs: string; trackName: string | null; artistName: string | null; months?: Record<string, number>; attempts?: number; finished?: number; skipped?: number }`
  - Task 1's `PlayAggregator` gives **every** row a `months` object, `{}`
    included, so a track whose records were all under 30 s (`plays: 0`) still
    reaches `finishRate`. `hasMonthData` is the gate on that field; if Task 1
    ever created `months` lazily, the Skipped tab would lose most of its
    population (skips average ~14 s). The `finishRate` test below pins it.
- Produces (`src/model/crate.ts`, pure, no imports beyond the `PlayRow` type):
  - `ROTATION_WINDOWS = [1, 3, 6] as const`, `GEM_WINDOWS = [6, 12, 24] as const`,
    `MIN_GEM_PLAYS = 10`, `MIN_ROTATION_PLAYS = 3`,
    `CLASSIC_MIN_PLAYS_PER_YEAR = 3`, `CLASSIC_MIN_YEARS = 3`,
    `FINISH_MIN_OUTCOMES = 10`, `PAGE_SIZE = 100`
  - `type Season = 'winter' | 'spring' | 'summer' | 'autumn'`
  - `type YearPeriod = 'all' | Season | number`
  - `monthKey(d: Date): string`
  - `lastMonths(now: Date, count: number): string[]`
  - `periodMonths(year: number, period: YearPeriod): string[]`
  - `yearsWithPlays(rows: PlayRow[]): number[]`
  - `hasMonthData(row: PlayRow): row is PlayRow & { months: Record<string, number> }`
  - `interface RotationItem { row: PlayRow; windowPlays: number; isNew: boolean }`,
    `heavyRotation(rows: PlayRow[], now: Date, months: number): RotationItem[]`
  - `interface GemItem { row: PlayRow; lastPlayed: Date }`,
    `forgottenGems(rows: PlayRow[], now: Date, months: number): GemItem[]`,
    `gemCutoff(now: Date, months: number): Date`
  - `interface ClassicItem { row: PlayRow; yearsActive: number; perYear: Map<number, number> }`,
    `classics(rows: PlayRow[], sortBy: 'years' | 'plays'): ClassicItem[]`
  - `interface YearItem { row: PlayRow; selectionPlays: number; yearPlays: number }`,
    `interface YearResult { items: YearItem[]; plays: number; tracks: number }`,
    `byYear(rows: PlayRow[], year: number, period: YearPeriod): YearResult`
  - `interface FinishItem { row: PlayRow; rate: number; outcomes: number; unclear: number }`,
    `finishRate(rows: PlayRow[], tab: 'finished' | 'skipped'): FinishItem[]`
  - `type RateBand = 'high' | 'mid' | 'low'`, `rateBand(rate: number): RateBand`
    (`'high'` → `<Badge kind="plays">` green, `'low'` → `<Badge kind="skip">`
    red, `'mid'` → a plain `<Badge>` grey)

Two exports go beyond the spec's §5 block, both for the screens: `gemCutoff`
(the Gems caption says "nothing since Sep 2025") and `rateBand` (the Finish
badge colour). Everything else matches §5 name for name.

- [ ] **Step 1: Write the failing test**

`src/model/crate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { PlayRow } from '../db/schema';
import {
  CLASSIC_MIN_PLAYS_PER_YEAR,
  CLASSIC_MIN_YEARS,
  FINISH_MIN_OUTCOMES,
  GEM_WINDOWS,
  MIN_GEM_PLAYS,
  MIN_ROTATION_PLAYS,
  PAGE_SIZE,
  ROTATION_WINDOWS,
  byYear,
  classics,
  finishRate,
  forgottenGems,
  gemCutoff,
  hasMonthData,
  heavyRotation,
  lastMonths,
  monthKey,
  periodMonths,
  rateBand,
  yearsWithPlays,
} from './crate';

/** Mid-month, noon UTC: the same calendar month in every time zone. */
const NOW = new Date('2026-09-15T12:00:00Z');

/** `plays` mirrors the importer's invariant `sum(months) === plays`. */
function row(
  trackId: string,
  months: Record<string, number> | undefined,
  over: Partial<PlayRow> = {}
): PlayRow {
  const plays = Object.values(months ?? {}).reduce((sum, n) => sum + n, 0);
  const base: PlayRow = {
    trackId,
    plays,
    msPlayed: plays * 200_000,
    firstTs: '2016-06-15T12:00:00Z',
    lastTs: '2026-09-15T12:00:00Z',
    trackName: `Song ${trackId}`,
    artistName: 'Daft Punk',
  };
  return months === undefined
    ? { ...base, ...over }
    : { ...base, months, ...over };
}

/** Gems care only about lifetime plays and the last play; the month is filler. */
function gem(trackId: string, plays: number, lastTs: string): PlayRow {
  return row(trackId, { '2019-06': plays }, { lastTs });
}

function outcome(
  trackId: string,
  plays: number,
  counts: { finished: number; skipped: number; attempts: number }
): PlayRow {
  return row(trackId, { '2026-08': plays }, counts);
}

describe('thresholds', () => {
  it('pins the numbers the captions and chip rows quote', () => {
    expect(ROTATION_WINDOWS).toEqual([1, 3, 6]);
    expect(GEM_WINDOWS).toEqual([6, 12, 24]);
    expect([MIN_ROTATION_PLAYS, MIN_GEM_PLAYS]).toEqual([3, 10]);
    expect([CLASSIC_MIN_PLAYS_PER_YEAR, CLASSIC_MIN_YEARS]).toEqual([3, 3]);
    expect(FINISH_MIN_OUTCOMES).toBe(10);
    expect(PAGE_SIZE).toBe(100);
  });
});

describe('monthKey and lastMonths', () => {
  it('pads the month and ends the window with now', () => {
    expect(monthKey(NOW)).toBe('2026-09');
    expect(lastMonths(NOW, 1)).toEqual(['2026-09']);
    expect(lastMonths(NOW, 3)).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(lastMonths(NOW, 6)).toEqual([
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
  });

  it('crosses the year boundary, oldest first', () => {
    const january = new Date('2026-01-15T12:00:00Z');
    expect(lastMonths(january, 3)).toEqual(['2025-11', '2025-12', '2026-01']);
    expect(lastMonths(new Date('2026-02-15T12:00:00Z'), 6)).toEqual([
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });
});

describe('periodMonths', () => {
  it('takes Winter from December of the previous year', () => {
    expect(periodMonths(2022, 'winter')).toEqual([
      '2021-12',
      '2022-01',
      '2022-02',
    ]);
  });

  it('lists the other seasons, a single month and the whole year', () => {
    expect(periodMonths(2022, 'spring')).toEqual([
      '2022-03',
      '2022-04',
      '2022-05',
    ]);
    expect(periodMonths(2022, 'summer')).toEqual([
      '2022-06',
      '2022-07',
      '2022-08',
    ]);
    expect(periodMonths(2022, 'autumn')).toEqual([
      '2022-09',
      '2022-10',
      '2022-11',
    ]);
    expect(periodMonths(2022, 6)).toEqual(['2022-06']);
    const all = periodMonths(2022, 'all');
    expect(all).toHaveLength(12);
    expect([all[0], all[11]]).toEqual(['2022-01', '2022-12']);
  });
});

describe('yearsWithPlays', () => {
  it('lists years ascending and ignores rows without months', () => {
    const rows = [
      row('a', { '2019-03': 2, '2016-11': 1 }),
      row('b', { '2019-05': 4, '2022-01': 0 }),
      row('c', undefined, { plays: 99 }),
    ];
    expect(yearsWithPlays(rows)).toEqual([2016, 2019]);
    expect(hasMonthData(rows[0])).toBe(true);
    expect(hasMonthData(rows[2])).toBe(false);
  });
});

const rotation = [
  row('hot', { '2024-01': 14, '2026-07': 9, '2026-08': 12, '2026-09': 6 }),
  row('fresh', { '2026-09': 5 }),
  row('edge', { '2026-08': 3 }),
  row('thin', { '2026-09': 2 }),
  row('old', { '2026-06': 40 }),
  row('nomonths', undefined, { plays: 500 }),
];

describe('heavyRotation', () => {
  it('keeps three or more plays in the window, most played first', () => {
    expect(
      heavyRotation(rotation, NOW, 3).map((i) => [i.row.trackId, i.windowPlays])
    ).toEqual([
      ['hot', 27],
      ['fresh', 5],
      ['edge', 3],
    ]);
  });

  it('flags a track whose every play falls inside the window', () => {
    expect(
      heavyRotation(rotation, NOW, 3).map((i) => [i.row.trackId, i.isNew])
    ).toEqual([
      ['hot', false],
      ['fresh', true],
      ['edge', true],
    ]);
  });

  it('widens to six months and ties on lifetime plays then name', () => {
    expect(heavyRotation(rotation, NOW, 6).map((i) => i.row.trackId)).toEqual([
      'old',
      'hot',
      'fresh',
      'edge',
    ]);
    const ties = [
      row('t1', { '2026-08': 4 }, { trackName: 'Beta' }),
      row('t2', { '2026-08': 4 }, { trackName: 'Alpha' }),
      row('t3', { '2020-01': 30, '2026-08': 4 }, { trackName: 'Zulu' }),
    ];
    expect(heavyRotation(ties, NOW, 3).map((i) => i.row.trackName)).toEqual([
      'Zulu',
      'Alpha',
      'Beta',
    ]);
  });
});

const gems = [
  gem('gem', 214, '2023-02-19T12:00:00Z'),
  gem('recent', 80, '2026-08-15T12:00:00Z'),
  gem('thin', 9, '2019-06-15T12:00:00Z'),
  gem('exact', 10, '2019-06-15T12:00:00Z'),
  gem('edgeIn', 12, '2026-03-14T12:00:00Z'),
  gem('edgeOut', 13, '2026-03-16T12:00:00Z'),
  row('nomonths', undefined, { plays: 500, lastTs: '2016-01-15T12:00:00Z' }),
];

describe('forgottenGems', () => {
  it('needs ten plays and nothing since the cutoff, most played first', () => {
    const items = forgottenGems(gems, NOW, 12);
    expect(items.map((i) => i.row.trackId)).toEqual(['gem', 'exact']);
    expect(items[0].lastPlayed.toISOString()).toBe('2023-02-19T12:00:00.000Z');
  });

  it('cuts to the day at six months', () => {
    expect(forgottenGems(gems, NOW, 6).map((i) => i.row.trackId)).toEqual([
      'gem',
      'edgeIn',
      'exact',
    ]);
  });

  it('clamps the cutoff to the end of a shorter month', () => {
    const cutoff = gemCutoff(new Date(2026, 7, 31, 12), 6);
    expect([cutoff.getFullYear(), cutoff.getMonth(), cutoff.getDate()]).toEqual(
      [2026, 1, 28]
    );
    const year = gemCutoff(NOW, 12);
    expect([year.getFullYear(), year.getMonth()]).toEqual([2025, 8]);
  });
});

const classicRows = [
  row('classic', {
    '2020-01': 30,
    '2016-05': 8,
    '2018-07': 3,
    '2017-03': 11,
    '2019-02': 2,
  }),
  row('twoYears', { '2016-05': 20, '2017-05': 20 }),
  row('thinYears', { '2016-05': 2, '2017-05': 2, '2018-05': 2, '2019-05': 2 }),
  row('steady', { '2021-01': 3, '2022-01': 3, '2023-01': 3 }),
  row('heavy', { '2021-01': 60, '2022-01': 3, '2023-01': 3 }),
  row('nomonths', undefined, { plays: 900 }),
];

describe('classics', () => {
  it('needs three years of three plays and sorts by years then plays', () => {
    expect(
      classics(classicRows, 'years').map((i) => [i.row.trackId, i.yearsActive])
    ).toEqual([
      ['classic', 4],
      ['heavy', 3],
      ['steady', 3],
    ]);
  });

  it('sorts by plays then years and folds months into ordered years', () => {
    const items = classics(classicRows, 'plays');
    expect(items.map((i) => [i.row.trackId, i.row.plays])).toEqual([
      ['heavy', 66],
      ['classic', 54],
      ['steady', 9],
    ]);
    expect([...items[1].perYear]).toEqual([
      [2016, 8],
      [2017, 11],
      [2018, 3],
      [2019, 2],
      [2020, 30],
    ]);
  });
});

const yearRows = [
  row('a', {
    '2021-12': 4,
    '2022-01': 6,
    '2022-03': 20,
    '2022-07': 5,
    '2026-08': 3,
  }),
  row('b', { '2022-02': 8, '2022-03': 20, '2023-05': 2 }),
  row('c', { '2022-03': 1 }),
  row('nomonths', undefined, { plays: 77 }),
];

describe('byYear', () => {
  it('sums the year and drops tracks with no plays in it', () => {
    const result = byYear(yearRows, 2022, 'all');
    expect(
      result.items.map((i) => [i.row.trackId, i.selectionPlays, i.yearPlays])
    ).toEqual([
      ['a', 31, 31],
      ['b', 28, 28],
      ['c', 1, 1],
    ]);
    expect([result.plays, result.tracks]).toEqual([60, 3]);
  });

  it('keeps the year total when Winter reaches into the previous year', () => {
    const result = byYear(yearRows, 2022, 'winter');
    expect(
      result.items.map((i) => [i.row.trackId, i.selectionPlays, i.yearPlays])
    ).toEqual([
      ['a', 10, 31],
      ['b', 8, 28],
    ]);
    expect([result.plays, result.tracks]).toEqual([18, 2]);
  });

  it('drills into one month and ties on lifetime plays', () => {
    const result = byYear(yearRows, 2022, 3);
    expect(result.items.map((i) => i.row.trackId)).toEqual(['a', 'b', 'c']);
    expect([result.plays, result.tracks]).toEqual([41, 3]);
  });

  it('returns an empty result for a month with no plays', () => {
    expect(byYear(yearRows, 2022, 5)).toEqual({
      items: [],
      plays: 0,
      tracks: 0,
    });
  });
});

const finishRows = [
  outcome('loyal', 300, { finished: 312, skipped: 12, attempts: 331 }),
  outcome('mixed', 20, { finished: 10, skipped: 10, attempts: 25 }),
  outcome('tieA', 5, { finished: 5, skipped: 5, attempts: 10 }),
  // Short records only: `plays: 0` with an empty `months`, still counted.
  row('bail', {}, { finished: 2, skipped: 14, attempts: 20 }),
  outcome('rare', 30, { finished: 5, skipped: 4, attempts: 12 }),
  row('nomonths', undefined, { plays: 60, finished: 50, skipped: 50 }),
];

describe('finishRate', () => {
  it('needs ten clear outcomes and ranks Finished by rate then plays', () => {
    const items = finishRate(finishRows, 'finished');
    expect(items.map((i) => i.row.trackId)).toEqual([
      'loyal',
      'mixed',
      'tieA',
      'bail',
    ]);
    expect(items[0].outcomes).toBe(324);
    expect(items[0].unclear).toBe(7);
    expect(items[0].rate).toBeCloseTo(0.963, 3);
  });

  it('ranks Skipped by rate ascending then outcomes, keeping short rows', () => {
    const items = finishRate(finishRows, 'skipped');
    expect(items.map((i) => i.row.trackId)).toEqual([
      'bail',
      'mixed',
      'tieA',
      'loyal',
    ]);
    expect(items[0].row.plays).toBe(0);
    expect([items[0].rate, items[0].outcomes, items[0].unclear]).toEqual([
      0.125, 16, 4,
    ]);
  });

  it('bands the rate for the badge colour', () => {
    expect([rateBand(1), rateBand(0.65)]).toEqual(['high', 'high']);
    expect([rateBand(0.6499), rateBand(0.35)]).toEqual(['mid', 'mid']);
    expect([rateBand(0.3499), rateBand(0)]).toEqual(['low', 'low']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/model/crate.test.ts`
Expected: FAIL during collection, `Error: Cannot find module './crate'
imported from src/model/crate.test.ts`, "Tests no tests".

- [ ] **Step 3: Implement**

`src/model/crate.ts` (new file):

```ts
import type { PlayRow } from '../db/schema';

export const ROTATION_WINDOWS = [1, 3, 6] as const; // months
export const GEM_WINDOWS = [6, 12, 24] as const; // months
export const MIN_GEM_PLAYS = 10;
export const MIN_ROTATION_PLAYS = 3;
export const CLASSIC_MIN_PLAYS_PER_YEAR = 3;
export const CLASSIC_MIN_YEARS = 3;
export const FINISH_MIN_OUTCOMES = 10;
export const PAGE_SIZE = 100;

const RATE_HIGH = 0.65;
const RATE_LOW = 0.35;

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';
export type YearPeriod = 'all' | Season | number; // 1..12

const SEASON_MONTHS: Record<Season, number[]> = {
  winter: [12, 1, 2],
  spring: [3, 4, 5],
  summer: [6, 7, 8],
  autumn: [9, 10, 11],
};

const MONTHS_OF_YEAR = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function yearMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Local zone, the same rule the importer used to write the month keys. */
export function monthKey(d: Date): string {
  return yearMonth(d.getFullYear(), d.getMonth() + 1);
}

/** Oldest first, ending with the month `now` falls in. */
export function lastMonths(now: Date, count: number): string[] {
  const keys: string[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    keys.push(monthKey(new Date(now.getFullYear(), now.getMonth() - back, 1)));
  }
  return keys;
}

export function periodMonths(year: number, period: YearPeriod): string[] {
  if (period === 'all') return MONTHS_OF_YEAR.map((m) => yearMonth(year, m));
  if (typeof period === 'number') return [yearMonth(year, period)];
  // Winter opens in December of the previous year.
  return SEASON_MONTHS[period].map((m) =>
    yearMonth(period === 'winter' && m === 12 ? year - 1 : year, m)
  );
}

/** Rows from an import before month buckets are ignored by every view. */
export function hasMonthData(
  row: PlayRow
): row is PlayRow & { months: Record<string, number> } {
  return row.months !== undefined;
}

export function yearsWithPlays(rows: PlayRow[]): number[] {
  const years = new Set<number>();
  for (const row of rows) {
    if (!hasMonthData(row)) continue;
    for (const [key, plays] of Object.entries(row.months)) {
      if (plays > 0) years.add(Number(key.slice(0, 4)));
    }
  }
  return [...years].sort((a, b) => a - b);
}

function sumMonths(months: Record<string, number>, keys: string[]): number {
  let total = 0;
  for (const key of keys) total += months[key] ?? 0;
  return total;
}

/** Last resort so rows that tie on every number keep a stable order. */
function compareNames(a: PlayRow, b: PlayRow): number {
  return (
    (a.trackName ?? '').localeCompare(b.trackName ?? '') ||
    a.trackId.localeCompare(b.trackId)
  );
}

export interface RotationItem {
  row: PlayRow;
  windowPlays: number;
  isNew: boolean;
}

export function heavyRotation(
  rows: PlayRow[],
  now: Date,
  months: number
): RotationItem[] {
  const keys = lastMonths(now, months);
  const items: RotationItem[] = [];
  for (const row of rows) {
    if (!hasMonthData(row)) continue;
    const windowPlays = sumMonths(row.months, keys);
    if (windowPlays < MIN_ROTATION_PLAYS) continue;
    items.push({ row, windowPlays, isNew: windowPlays === row.plays });
  }
  return items.sort(
    (a, b) =>
      b.windowPlays - a.windowPlays ||
      b.row.plays - a.row.plays ||
      compareNames(a.row, b.row)
  );
}

export interface GemItem {
  row: PlayRow;
  lastPlayed: Date;
}

/**
 * `now` minus `months` calendar months, keeping the time of day and clamping
 * to the end of a shorter month: 31 August minus 6 months is 28 February.
 */
export function gemCutoff(now: Date, months: number): Date {
  const day = now.getDate();
  const cutoff = new Date(now);
  cutoff.setDate(1);
  cutoff.setMonth(cutoff.getMonth() - months);
  const lastDay = new Date(
    cutoff.getFullYear(),
    cutoff.getMonth() + 1,
    0
  ).getDate();
  cutoff.setDate(Math.min(day, lastDay));
  return cutoff;
}

export function forgottenGems(
  rows: PlayRow[],
  now: Date,
  months: number
): GemItem[] {
  const cutoff = gemCutoff(now, months).getTime();
  const items: GemItem[] = [];
  for (const row of rows) {
    if (!hasMonthData(row)) continue;
    if (row.plays < MIN_GEM_PLAYS) continue;
    const lastPlayed = new Date(row.lastTs);
    // An unparseable timestamp gives NaN, which fails this test and is dropped.
    if (!(lastPlayed.getTime() < cutoff)) continue;
    items.push({ row, lastPlayed });
  }
  return items.sort(
    (a, b) => b.row.plays - a.row.plays || compareNames(a.row, b.row)
  );
}

export interface ClassicItem {
  row: PlayRow;
  yearsActive: number;
  perYear: Map<number, number>;
}

export function classics(
  rows: PlayRow[],
  sortBy: 'years' | 'plays'
): ClassicItem[] {
  const items: ClassicItem[] = [];
  for (const row of rows) {
    if (!hasMonthData(row)) continue;
    const totals = new Map<number, number>();
    for (const [key, plays] of Object.entries(row.months)) {
      if (plays <= 0) continue;
      const year = Number(key.slice(0, 4));
      totals.set(year, (totals.get(year) ?? 0) + plays);
    }
    let yearsActive = 0;
    for (const plays of totals.values()) {
      if (plays >= CLASSIC_MIN_PLAYS_PER_YEAR) yearsActive += 1;
    }
    if (yearsActive < CLASSIC_MIN_YEARS) continue;
    // Ascending, so the expansion strip can walk the years as they come.
    const perYear = new Map([...totals.entries()].sort((a, b) => a[0] - b[0]));
    items.push({ row, yearsActive, perYear });
  }
  return items.sort((a, b) =>
    sortBy === 'years'
      ? b.yearsActive - a.yearsActive ||
        b.row.plays - a.row.plays ||
        compareNames(a.row, b.row)
      : b.row.plays - a.row.plays ||
        b.yearsActive - a.yearsActive ||
        compareNames(a.row, b.row)
  );
}

export interface YearItem {
  row: PlayRow;
  selectionPlays: number;
  yearPlays: number;
}

export interface YearResult {
  items: YearItem[];
  plays: number;
  tracks: number;
}

export function byYear(
  rows: PlayRow[],
  year: number,
  period: YearPeriod
): YearResult {
  const selectionKeys = periodMonths(year, period);
  const yearKeys = periodMonths(year, 'all');
  const items: YearItem[] = [];
  let plays = 0;
  for (const row of rows) {
    if (!hasMonthData(row)) continue;
    const selectionPlays = sumMonths(row.months, selectionKeys);
    if (selectionPlays <= 0) continue;
    const yearPlays = sumMonths(row.months, yearKeys);
    items.push({ row, selectionPlays, yearPlays });
    plays += selectionPlays;
  }
  items.sort(
    (a, b) =>
      b.selectionPlays - a.selectionPlays ||
      b.row.plays - a.row.plays ||
      compareNames(a.row, b.row)
  );
  return { items, plays, tracks: items.length };
}

export interface FinishItem {
  row: PlayRow;
  rate: number;
  outcomes: number;
  unclear: number;
}

export function finishRate(
  rows: PlayRow[],
  tab: 'finished' | 'skipped'
): FinishItem[] {
  const items: FinishItem[] = [];
  for (const row of rows) {
    if (!hasMonthData(row)) continue;
    const finished = row.finished ?? 0;
    const outcomes = finished + (row.skipped ?? 0);
    if (outcomes < FINISH_MIN_OUTCOMES) continue;
    items.push({
      row,
      rate: finished / outcomes,
      outcomes,
      // Version 2 rows always have attempts >= outcomes; the clamp only keeps
      // a stale row from rendering a negative count.
      unclear: Math.max(0, (row.attempts ?? 0) - outcomes),
    });
  }
  return items.sort((a, b) =>
    tab === 'finished'
      ? b.rate - a.rate ||
        b.row.plays - a.row.plays ||
        compareNames(a.row, b.row)
      : a.rate - b.rate || b.outcomes - a.outcomes || compareNames(a.row, b.row)
  );
}

export type RateBand = 'high' | 'mid' | 'low';

/** 65% or more reads green, under 35% red, the rest grey. */
export function rateBand(rate: number): RateBand {
  if (rate >= RATE_HIGH) return 'high';
  if (rate < RATE_LOW) return 'low';
  return 'mid';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/model/crate.test.ts`
Expected: PASS, 21 tests.

- [ ] **Step 5: Commit**

```bash
yarn format && yarn typecheck && yarn lint && yarn test
git add src/model/crate.ts src/model/crate.test.ts
git commit -m "feat(model): crate computations over the month buckets

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

---

### Task 3: Crate routes, tab bar, shared components and styles

**Files:**
- Create: `src/ui/crate/CrateHub.tsx`, `src/ui/crate/CrateView.tsx` (minimal
  placeholders; Tasks 4–7 replace their bodies)
- Modify: `src/router.ts` (the `Route` union, a new `isCrateView` helper,
  `parseRoute`'s switch, `routeHref`'s switch), `src/app.tsx` (screen imports,
  `TABS`, `tabOf`, `Screen`), `src/ui/components/Segmented.tsx` (the
  `Segmented` props and the wrapper's `class`),
  `src/ui/components/Badge.tsx` (the `kind` union),
  `src/ui/components/Empty.tsx` (the whole `Empty` component),
  `src/styles.css` (`.badge.top` block, `.segmented button.active` block,
  `.sublist li` block, plus a new block appended at the end)
- Test: `src/router.test.ts` (complete new version below)

**Interfaces:**
- Consumes (existing code only — nothing from Tasks 1 and 2, so this task can
  be executed independently of them):
  - `src/router.ts`: `Route`, `parseRoute(hash: string): Route`,
    `routeHref(route: Route): string`, the module-private
    `decodeSegment(segment: string): string`
  - `src/app.tsx`: `route` signal, `installRouter()`, `TABS`, `tabOf`,
    `Screen`, `App`
  - `src/ui/components/Segmented.tsx`:
    `Segmented<T extends string>(p: { options: { value: T; label: string }[]; value: T; onChange: (value: T) => void })`
  - `src/ui/components/Badge.tsx`:
    `Badge(p: { kind?: 'plays' | 'top'; children: ComponentChildren })`
  - `src/ui/components/Empty.tsx`: `Empty(p: { what: string })`
  - `src/styles.css`: `.row`, `.badge`, `.segmented`, `.sublist`, `.empty`,
    `.muted`, `.warn`, the CSS variables in `:root`
- Produces (Tasks 4–7 rely on all of these):
  - `export const CRATE_VIEWS = ['rotation', 'gems', 'classics', 'year', 'finish'] as const`
    in `src/router.ts` (hub order = spec §3 workflow order)
  - `export type CrateView = (typeof CRATE_VIEWS)[number]`
  - `Route` gains `| { name: 'crate' }` and
    `| { name: 'crateView'; view: CrateView; period?: string }`
  - `parseRoute` handles `#/crate`, `#/crate/<view>`,
    `#/crate/year/<YYYY-MM>`; an unknown view yields `{ name: 'crate' }`
  - `routeHref({ name: 'crate' })` → `#/crate`;
    `routeHref({ name: 'crateView', view, period? })` → `#/crate/<view>` or
    `#/crate/<view>/<period>`
  - `export function CrateHub()` in `src/ui/crate/CrateHub.tsx`
  - `export function CrateView(p: { view: CrateView; period?: string })` in
    `src/ui/crate/CrateView.tsx` (neither declares a return type, like every
    existing component)
  - `Segmented` gains `scroll?: boolean` (renders `class="segmented scroll"`)
  - `Badge` gains kinds `'todo'` and `'skip'`
  - `Empty` gains `href?: string` and `cta?: string`, defaulting to
    `'#/settings'` and `'Sync in Settings'`
  - CSS classes `.back`, `.provenance`, `.caption`, `.legend`, `.footer-note`,
    `.strip`, `.hub-row` (with `.hub-row .main`, `.hub-row .name`,
    `.hub-row .sub`, `.hub-row .chev`), `.segmented.scroll`, `.badge.todo`,
    `.badge.skip`, and `.sublist li` at a 44 px touch target

Contracts this task fixes for Tasks 4–7, so they do not drift:

- A hub row's contents nest inside `<span class="main">`, as the approved
  mockup does: `.hub-row` is the flex container and its only flex children are
  `.main` and `.chev`, so a `name`/`sub`/`badges` group placed directly in the
  row would push the chevron off the right edge.
- The expansion block is a `<div class="sublist">`, and Task 4's `CrateRow`
  owns that wrapper. Its direct children are `<p>` lines: a facts line, a
  `<p class="strip">` number strip and the `Open <Mon YYYY> ›` link. The
  playlist links arrive as a nested `<ul>` of `<li>`, so `.sublist li` sizes
  the playlist rows only — which is why it carries the 44 px touch target and
  `display: flex`. Task 4 adds the `.sublist ul` and `.sublist p` resets for
  the rest.
- `Empty` gains only `href` and `cta` (spec §6). The Crate's custom empty
  texts (`Nothing with 3+ plays since Jul 2026.`) do not fit `Empty`'s fixed
  `No {what} yet.` sentence: render them with the inline
  `<div class="empty">…</div>` pattern already used in `src/ui/Artist.tsx`
  lines 13–19. Do not add a `message` prop to the shared component. The two
  new props are therefore added because spec §6 mandates them, and no Crate
  screen ends up passing them; the four existing `Empty` call sites keep
  today's `#/settings` link through the defaults.
- Inside `src/ui/crate/CrateView.tsx` the component name collides with the
  `CrateView` type, so the type is imported aliased:
  `import { routeHref, type CrateView as View } from '../../router';`. Tasks 5,
  6 and 7 rewrite that file and must keep the alias, otherwise `tsc` reports
  "Import declaration conflicts with local declaration of 'CrateView'".
- The default route stays `top` (spec §2), even though Crate is now the
  leftmost tab. `parseRoute('')` returning `{ name: 'top' }` is intentional.

- [ ] **Step 1: Write the failing test**

Replace `src/router.test.ts` entirely with:

```ts
import { describe, expect, it } from 'vitest';
import { CRATE_VIEWS, parseRoute, routeHref } from './router';

describe('parseRoute', () => {
  it('defaults to top for empty or unknown hashes', () => {
    expect(parseRoute('')).toEqual({ name: 'top' });
    expect(parseRoute('#')).toEqual({ name: 'top' });
    expect(parseRoute('#/nope')).toEqual({ name: 'top' });
  });

  it('parses every list screen', () => {
    expect(parseRoute('#/top')).toEqual({ name: 'top' });
    expect(parseRoute('#/playlists')).toEqual({ name: 'playlists' });
    expect(parseRoute('#/artists')).toEqual({ name: 'artists' });
    expect(parseRoute('#/import')).toEqual({ name: 'import' });
    expect(parseRoute('#/settings')).toEqual({ name: 'settings' });
  });

  it('parses detail screens and decodes their ids', () => {
    expect(parseRoute('#/playlist/37i9dQ')).toEqual({
      name: 'playlist',
      id: '37i9dQ',
    });
    expect(parseRoute('#/artist/name%3Adaft%20punk')).toEqual({
      name: 'artist',
      key: 'name:daft punk',
    });
  });

  it('keeps a malformed escape rather than throwing', () => {
    expect(parseRoute('#/artist/%zz')).toEqual({ name: 'artist', key: '%zz' });
    expect(parseRoute('#/playlist/%E0%A4%A')).toEqual({
      name: 'playlist',
      id: '%E0%A4%A',
    });
  });

  it('treats a detail route without an id as its list', () => {
    expect(parseRoute('#/playlist/')).toEqual({ name: 'playlists' });
    expect(parseRoute('#/artist')).toEqual({ name: 'artists' });
  });

  it('parses the crate hub', () => {
    expect(parseRoute('#/crate')).toEqual({ name: 'crate' });
    expect(parseRoute('#/crate/')).toEqual({ name: 'crate' });
  });

  it('parses every crate view', () => {
    expect(CRATE_VIEWS).toEqual([
      'rotation',
      'gems',
      'classics',
      'year',
      'finish',
    ]);
    for (const view of CRATE_VIEWS) {
      expect(parseRoute(`#/crate/${view}`)).toEqual({
        name: 'crateView',
        view,
      });
    }
  });

  it('parses the period segment of the by-year route', () => {
    expect(parseRoute('#/crate/year/2022-06')).toEqual({
      name: 'crateView',
      view: 'year',
      period: '2022-06',
    });
  });

  it('sends an unknown crate view to the hub', () => {
    expect(parseRoute('#/crate/nope')).toEqual({ name: 'crate' });
    expect(parseRoute('#/crate/nope/2022-06')).toEqual({ name: 'crate' });
  });
});

describe('routeHref', () => {
  it('round-trips every route', () => {
    const routes = [
      { name: 'top' },
      { name: 'playlists' },
      { name: 'playlist', id: 'abc' },
      { name: 'artists' },
      { name: 'artist', key: 'name:daft punk' },
      { name: 'import' },
      { name: 'settings' },
      { name: 'crate' },
      { name: 'crateView', view: 'rotation' },
      { name: 'crateView', view: 'year', period: '2022-06' },
    ] as const;
    for (const r of routes) {
      expect(parseRoute(routeHref(r))).toEqual(r);
    }
  });

  it('encodes ids', () => {
    expect(routeHref({ name: 'artist', key: 'name:daft punk' })).toBe(
      '#/artist/name%3Adaft%20punk'
    );
  });

  it('formats crate routes', () => {
    expect(routeHref({ name: 'crate' })).toBe('#/crate');
    expect(routeHref({ name: 'crateView', view: 'gems' })).toBe('#/crate/gems');
    expect(
      routeHref({ name: 'crateView', view: 'year', period: '2022-06' })
    ).toBe('#/crate/year/2022-06');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/router.test.ts`

Expected: `Test Files 1 failed (1)`, `Tests 6 failed | 6 passed (12)`. The six
failures, in order:

```
× parses the crate hub
    AssertionError: expected { name: 'top' } to deeply equal { name: 'crate' }
× parses every crate view
    AssertionError: expected undefined to deeply equal [ Array(5) ]
× parses the period segment of the by-year route
    AssertionError: expected { name: 'top' } to deeply equal { name: 'crateView', …(2) }
× sends an unknown crate view to the hub
    AssertionError: expected { name: 'top' } to deeply equal { name: 'crate' }
× round-trips every route
    AssertionError: expected { name: 'top' } to deeply equal { name: 'crate' }
× formats crate routes
    AssertionError: expected '#/crateView' to be '#/crate/gems'
```

`expected undefined` in the second one is `CRATE_VIEWS`, which the module does
not export yet; a missing named export reads as `undefined` here rather than
throwing at import time.

- [ ] **Step 3: Implement the crate routes**

In `src/router.ts`, replace these lines:

```ts
export type Route =
  | { name: 'top' }
  | { name: 'playlists' }
  | { name: 'playlist'; id: string }
  | { name: 'artists' }
  | { name: 'artist'; key: string }
  | { name: 'import' }
  | { name: 'settings' };
```

with:

```ts
/** Hub order, which is also the order of the rows on the Crate hub. */
export const CRATE_VIEWS = [
  'rotation',
  'gems',
  'classics',
  'year',
  'finish',
] as const;

export type CrateView = (typeof CRATE_VIEWS)[number];

export type Route =
  | { name: 'top' }
  | { name: 'playlists' }
  | { name: 'playlist'; id: string }
  | { name: 'artists' }
  | { name: 'artist'; key: string }
  | { name: 'import' }
  | { name: 'settings' }
  | { name: 'crate' }
  | { name: 'crateView'; view: CrateView; period?: string };
```

Then replace these lines:

```ts
/** decodeURIComponent throws on a malformed escape; keep the raw segment. */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
```

with:

```ts
/** decodeURIComponent throws on a malformed escape; keep the raw segment. */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function isCrateView(value: string): value is CrateView {
  return (CRATE_VIEWS as readonly string[]).includes(value);
}
```

Then replace these lines:

```ts
  const tail = rest.join('/');
  switch (head) {
    case 'playlists':
      return { name: 'playlists' };
```

with:

```ts
  const tail = rest.join('/');
  switch (head) {
    case 'crate': {
      // `tail` is everything after `crate`, so split it again: the first
      // segment is the view, whatever follows is the period.
      const [view = '', ...periodParts] = tail.split('/');
      if (!isCrateView(view)) return { name: 'crate' };
      const period = periodParts.join('/');
      return period
        ? { name: 'crateView', view, period: decodeSegment(period) }
        : { name: 'crateView', view };
    }
    case 'playlists':
      return { name: 'playlists' };
```

Finally replace these lines:

```ts
    case 'artist':
      return `#/artist/${encodeURIComponent(route.key)}`;
    default:
      return `#/${route.name}`;
```

with:

```ts
    case 'artist':
      return `#/artist/${encodeURIComponent(route.key)}`;
    case 'crateView':
      return route.period
        ? `#/crate/${route.view}/${encodeURIComponent(route.period)}`
        : `#/crate/${route.view}`;
    default:
      return `#/${route.name}`;
```

The complete file after those four replacements:

```ts
/** Hub order, which is also the order of the rows on the Crate hub. */
export const CRATE_VIEWS = [
  'rotation',
  'gems',
  'classics',
  'year',
  'finish',
] as const;

export type CrateView = (typeof CRATE_VIEWS)[number];

export type Route =
  | { name: 'top' }
  | { name: 'playlists' }
  | { name: 'playlist'; id: string }
  | { name: 'artists' }
  | { name: 'artist'; key: string }
  | { name: 'import' }
  | { name: 'settings' }
  | { name: 'crate' }
  | { name: 'crateView'; view: CrateView; period?: string };

/** decodeURIComponent throws on a malformed escape; keep the raw segment. */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function isCrateView(value: string): value is CrateView {
  return (CRATE_VIEWS as readonly string[]).includes(value);
}

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  const [head, ...rest] = path.split('/');
  const tail = rest.join('/');
  switch (head) {
    case 'crate': {
      // `tail` is everything after `crate`, so split it again: the first
      // segment is the view, whatever follows is the period.
      const [view = '', ...periodParts] = tail.split('/');
      if (!isCrateView(view)) return { name: 'crate' };
      const period = periodParts.join('/');
      return period
        ? { name: 'crateView', view, period: decodeSegment(period) }
        : { name: 'crateView', view };
    }
    case 'playlists':
      return { name: 'playlists' };
    case 'playlist':
      return tail
        ? { name: 'playlist', id: decodeSegment(tail) }
        : { name: 'playlists' };
    case 'artists':
      return { name: 'artists' };
    case 'artist':
      return tail
        ? { name: 'artist', key: decodeSegment(tail) }
        : { name: 'artists' };
    case 'import':
      return { name: 'import' };
    case 'settings':
      return { name: 'settings' };
    default:
      return { name: 'top' };
  }
}

export function routeHref(route: Route): string {
  switch (route.name) {
    case 'playlist':
      return `#/playlist/${encodeURIComponent(route.id)}`;
    case 'artist':
      return `#/artist/${encodeURIComponent(route.key)}`;
    case 'crateView':
      return route.period
        ? `#/crate/${route.view}/${encodeURIComponent(route.period)}`
        : `#/crate/${route.view}`;
    default:
      return `#/${route.name}`;
  }
}
```

The period is carried through verbatim: `parseRoute` does not check that it
looks like `YYYY-MM`. The By year screen (Task 6) already has to cope with a
year that is absent from the imported history, so it validates the value there.

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test src/router.test.ts`
Expected: `Test Files 1 passed (1)`, `Tests 12 passed (12)`.

- [ ] **Step 5: Extend the three shared components**

Replace the whole of `src/ui/components/Segmented.tsx`:

```tsx
export function Segmented<T extends string>(p: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  scroll?: boolean;
}) {
  return (
    <div class={p.scroll ? 'segmented scroll' : 'segmented'} role="tablist">
      {p.options.map((o) => (
        <button
          type="button"
          key={o.value}
          role="tab"
          aria-selected={o.value === p.value}
          class={o.value === p.value ? 'active' : ''}
          onClick={() => p.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
```

In `src/ui/components/Badge.tsx`, replace these lines:

```tsx
export function Badge(p: {
  kind?: 'plays' | 'top';
  children: ComponentChildren;
}) {
```

with:

```tsx
export function Badge(p: {
  kind?: 'plays' | 'top' | 'todo' | 'skip';
  children: ComponentChildren;
}) {
```

Replace the whole of `src/ui/components/Empty.tsx`:

```tsx
export function Empty(p: { what: string; href?: string; cta?: string }) {
  return (
    <div class="empty">
      <p>No {p.what} yet.</p>
      <a href={p.href ?? '#/settings'}>{p.cta ?? 'Sync in Settings'}</a>
    </div>
  );
}
```

The existing four call sites (`Top.tsx`, `Playlists.tsx`, `Artists.tsx`, and
`Playlist.tsx`) pass only `what`, so they keep today's link.

- [ ] **Step 6: Create the two Crate screen placeholders**

These two files exist so the router, the tab bar and the CSS can be verified
now; Tasks 4 to 7 replace their bodies with the real screens.

`src/ui/crate/CrateHub.tsx`:

```tsx
import { routeHref, type CrateView } from '../../router';

const ROWS: { view: CrateView; label: string }[] = [
  { view: 'rotation', label: 'Heavy rotation' },
  { view: 'gems', label: 'Forgotten gems' },
  { view: 'classics', label: 'All-time classics' },
  { view: 'year', label: 'By year' },
  { view: 'finish', label: 'Finish rate' },
];

export function CrateHub() {
  return (
    <section>
      <h1>Crate</h1>
      {ROWS.map((row) => (
        <a
          key={row.view}
          class="hub-row"
          href={routeHref({ name: 'crateView', view: row.view })}
        >
          <span class="main">
            <span class="name">{row.label}</span>
          </span>
          <span class="chev">›</span>
        </a>
      ))}
    </section>
  );
}
```

`src/ui/crate/CrateView.tsx`:

```tsx
import { routeHref, type CrateView as View } from '../../router';

const TITLES: Record<View, string> = {
  rotation: 'Heavy rotation',
  gems: 'Forgotten gems',
  classics: 'All-time classics',
  year: 'By year',
  finish: 'Finish rate',
};

export function CrateView(p: { view: View; period?: string }) {
  return (
    <section>
      <a class="back" href={routeHref({ name: 'crate' })}>
        ‹ Crate
      </a>
      <h1>{TITLES[p.view]}</h1>
      <p class="caption">
        {p.period ? `Coming soon · ${p.period}` : 'Coming soon'}
      </p>
    </section>
  );
}
```

- [ ] **Step 7: Wire the tab bar and the screen switch**

In `src/app.tsx`, replace these lines:

```tsx
import { Artists } from './ui/Artists';
import { Import } from './ui/Import';
```

with:

```tsx
import { Artists } from './ui/Artists';
import { CrateHub } from './ui/crate/CrateHub';
import { CrateView } from './ui/crate/CrateView';
import { Import } from './ui/Import';
```

Then replace these lines:

```tsx
const TABS: { route: Route; label: string }[] = [
  { route: { name: 'top' }, label: 'Top' },
  { route: { name: 'playlists' }, label: 'Playlists' },
  { route: { name: 'artists' }, label: 'Artists' },
  { route: { name: 'import' }, label: 'Import' },
  { route: { name: 'settings' }, label: 'Settings' },
];

function tabOf(r: Route): Route['name'] {
  if (r.name === 'playlist') return 'playlists';
  if (r.name === 'artist') return 'artists';
  return r.name;
}
```

with:

```tsx
const TABS: { route: Route; label: string }[] = [
  { route: { name: 'crate' }, label: 'Crate' },
  { route: { name: 'top' }, label: 'Top' },
  { route: { name: 'playlists' }, label: 'Playlists' },
  { route: { name: 'artists' }, label: 'Artists' },
  { route: { name: 'settings' }, label: 'Settings' },
];

function tabOf(r: Route): Route['name'] {
  if (r.name === 'playlist') return 'playlists';
  if (r.name === 'artist') return 'artists';
  if (r.name === 'crateView') return 'crate';
  if (r.name === 'import') return 'settings';
  return r.name;
}
```

Then replace these lines:

```tsx
function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'top':
      return <Top />;
```

with:

```tsx
function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'crate':
      return <CrateHub />;
    case 'crateView':
      return <CrateView view={route.view} period={route.period} />;
    case 'top':
      return <Top />;
```

Import keeps its screen and its route; it is reached from Settings, from the
Crate provenance line and from the Crate empty states, and it highlights the
Settings tab while it is open.

- [ ] **Step 8: Add the Crate styles**

In `src/styles.css`, replace these lines:

```css
.badge.top {
  background: #1f2a44;
  color: #9cc0ff;
}
```

with:

```css
.badge.top {
  background: #1f2a44;
  color: #9cc0ff;
}

.badge.todo {
  background: #3a2a00;
  color: #ffd27a;
}

.badge.skip {
  background: #3d1416;
  color: #f0a0a2;
}
```

Then replace these lines:

```css
.segmented button.active {
  background: var(--surface-2);
  color: var(--text);
}
```

with:

```css
.segmented button.active {
  background: var(--surface-2);
  color: var(--text);
}

.segmented.scroll {
  overflow-x: auto;
  scrollbar-width: none;
}

.segmented.scroll::-webkit-scrollbar {
  display: none;
}

.segmented.scroll button {
  flex: none;
  min-height: 44px;
  padding: 8px 14px;
}
```

Then replace these lines:

```css
.sublist li {
  padding: 6px 0;
}
```

with:

```css
.sublist li {
  padding: 6px 0;
  min-height: 44px;
  display: flex;
  align-items: center;
}
```

Then append this block to the end of the file, after the existing last rule
(`input[type='file'] { width: 100%; }`):

```css
.back {
  display: inline-block;
  color: var(--accent);
  text-decoration: none;
  font-size: 0.9rem;
  padding: 6px 0;
}

.provenance {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--muted);
  font-size: 0.9rem;
  margin: 0 0 10px;
}

.provenance a {
  text-decoration: none;
}

.caption {
  color: var(--muted);
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
  margin: 0 0 8px;
}

.legend {
  color: var(--muted);
  font-size: 0.8rem;
  margin: -4px 0 8px;
}

.footer-note {
  color: var(--muted);
  font-size: 0.85rem;
  margin: 10px 0 8px;
}

.strip {
  color: var(--muted);
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  line-height: 1.5;
  margin: 4px 0;
}

.hub-row {
  display: flex;
  gap: 10px;
  align-items: center;
  width: 100%;
  min-height: 64px;
  padding: 10px 4px;
  border: 0;
  border-bottom: 1px solid #2a2a2a;
  border-radius: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  text-decoration: none;
}

.hub-row .main {
  flex: 1;
  min-width: 0;
}

.hub-row .name {
  display: block;
  font-weight: 600;
}

.hub-row .sub {
  display: block;
  font-size: 0.85rem;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hub-row .chev {
  color: var(--muted);
  flex: none;
}
```

`.hub-row` carries `border-radius: 0`, `background: none`, `padding`,
`min-height` and `text-decoration: none` because the global `button` rule
(`src/styles.css` lines 84–93) sets a radius, a surface background and a
48 px min-height, and the global `a` rule underlines links: the class has to
work for both an `<a>` (the placeholder and the hub of Task 4) and a
`<button>`.

- [ ] **Step 9: Run the full gate**

Run: `yarn format && yarn typecheck && yarn lint && yarn test && yarn build`

Expected: all five pass, and `yarn format` rewrites nothing (every block in
this task is already Prettier-formatted). `src/router.test.ts` contributes 12
passing tests, and with Tasks 1 and 2 in front of it the suite stands at
**147 tests in 16 files** (from 111 on the pre-Crate `main`). `yarn build`
emits `dist/assets/index-*.js`, `dist/assets/index-*.css` and
`dist/assets/import.worker-*.js` with no warning.

- [ ] **Step 10: Commit**

```bash
git add src
git commit -m "feat(crate): crate routes, tab bar and shared component variants

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

---

### Task 4: Crate state, shared row, hub and empty states

**Files:**

- Create: `src/ui/crate/selections.ts`, `src/ui/crate/shared.tsx`,
  `src/ui/crate/CrateEmpty.tsx`
- Modify: `src/model/state.ts` (the two import lines, a new
  `CRATE_NOTICE_META` / `CrateStatus` / `crateStatus` block, a new
  `showCrateNotice`, one added line in `loadFromDb`), `src/ui/format.ts`
  (`formatDate` accepts an epoch), `src/ui/crate/CrateHub.tsx` (the whole
  Task 3 placeholder is replaced; the export name `CrateHub` is unchanged so
  `src/app.tsx` needs no edit), `src/styles.css` (two rules appended)
- Test: `src/ui/format.test.ts` (one case added)
- Unchanged: `src/ui/crate/CrateView.tsx` keeps the Task 3 placeholder;
  Task 5 replaces it.

**Interfaces:**

- Consumes:
  - Existing code, exactly as it stands: `Model`, `Model.tracksByKey`,
    `Model.playlistsById`, `Model.playlists`, `Model.playlistsOfTrack`
    (`src/model/aggregate.ts`); `nameKey(artist, title)`
    (`src/model/normalize.ts`); `PlayRow` (`src/db/schema.ts`);
    `getMeta<T>(name)`, `putMeta(name, value)` (`src/db/repo.ts`);
    `ImportSummary`, `HISTORY_SUMMARY_META` (`src/history/importer.ts`);
    `TrackRow({ rank?, title, subtitle?, onClick?, spotifyUrl?, badges?,
    children? })`, `Badge({ kind?, children })`; `plural(n, word)`,
    `formatDate(iso)`, `artistNames(artists)` (`src/ui/format.ts`);
    `model`, `historySummary`, `banner`, `loadFromDb` (`src/model/state.ts`).
  - Task 1: `Model.plays: PlayRow[]` (an array, not a `Map` like the
    existing `playsById`), `Model.playlistsOfNameKey: Map<string,
    Set<string>>`, `ImportSummary.version?: 2`, `ImportSummary.zone`,
    `ImportSummary.outcomes`, `PlayRow.months?: Record<string, number>`.
  - Task 2 (`src/model/crate.ts`): `hasMonthData`, `yearsWithPlays`,
    `heavyRotation`, `forgottenGems`, `classics`, `byYear`, `finishRate`,
    `CLASSIC_MIN_YEARS`, `FINISH_MIN_OUTCOMES`, `type YearPeriod`.
  - Task 3: `type CrateView = 'rotation' | 'gems' | 'classics' | 'year' |
    'finish'` and the routes, so that
    `routeHref({ name: 'crate' }) === '#/crate'`,
    `routeHref({ name: 'crateView', view: 'rotation' }) === '#/crate/rotation'`
    and
    `routeHref({ name: 'crateView', view: 'year', period: '2026-08' }) ===
    '#/crate/year/2026-08'` (load-bearing for `OpenMonthLink`);
    `Badge` kind `'todo'`; the placeholder `export function CrateHub()`.
  - Task 3's CSS: `.hub-row` **and** its four child rules `.hub-row .main`,
    `.hub-row .name`, `.hub-row .sub`, `.hub-row .chev` (spec §6 names only
    `.hub-row`; the hub markup below collapses without the children). The
    `.hub-row` block also has to neutralise the global `button` rule
    (`border-radius`, `background`, `min-height`) and the global `a`
    underline, because the markup below is a `<button>` while Task 3's
    placeholder was an `<a>`. Task 3 writes all five rules; do not restate
    them here.

- Produces:
  - `src/model/state.ts`: `CRATE_NOTICE_META = 'crateNoticeShown'`,
    `type CrateStatus = 'empty' | 'reimport' | 'ready'`,
    `crateStatus: ReadonlySignal<CrateStatus>`.
  - `src/ui/format.ts`: `formatDate(value: string | number): string` (the
    parameter is widened; every existing call site keeps working). Spec §3
    needs an ms→day format twice — the hub provenance line and the Settings
    "Listening history" card — so the later Settings task reuses this
    instead of adding a second helper.
  - `src/ui/crate/selections.ts`: `rotationMonths: Signal<number>` (3),
    `gemMonths: Signal<number>` (12), `classicSort: Signal<'years' |
    'plays'>` (`'years'`), `yearSel: Signal<number | null>` (`null` = latest
    year with plays), `yearPeriod: Signal<YearPeriod>` (`'all'`),
    `finishTab: Signal<'finished' | 'skipped'>` (`'finished'`).
  - `src/ui/crate/shared.tsx`, the contract every Crate screen in Tasks 5,
    6 and 7 is written against:

    ```ts
    export const STALE_MS: number; // 35 days, spec §3
    export type CrateRowData = PlayRow & { months: Record<string, number> };
    export function useCrateRows(): CrateRowData[];
    export function monthLabel(key: string): string; // '2026-08' -> 'Aug 2026'
    export function trackLabel(row: PlayRow): { title: string; subtitle: string };
    export function trackUrl(row: PlayRow): string;
    export function playlistsOfRow(m: Model, row: PlayRow): string[];
    export function inNoPlaylist(row: PlayRow): boolean;
    export function CrateRow(p: {
      rank: number;
      row: PlayRow;
      badge1: ComponentChildren;
      badge2?: ComponentChildren;
      expanded: boolean;
      onToggle: () => void;
      children?: ComponentChildren;
    }): JSX.Element;
    export function PlaylistLinks(p: { row: PlayRow }): JSX.Element | null;
    export function OpenMonthLink(p: { month: string }): JSX.Element;
    export function CrateShell(p: {
      title: string;
      children?: ComponentChildren;
    }): JSX.Element;
    ```

    Three rules the screens depend on, so none of them re-implements it:

    - Everything except `playlistsOfRow` is **model-implicit**: it reads
      `model` from `src/model/state` itself, so a screen never touches the
      model. `playlistsOfRow` keeps an explicit `Model` because its only two
      callers already hold one.
    - `CrateRow` renders `badge1` then `badge2` exactly as given. It does
      **not** apply the amber rule itself: badge 2's precedence differs per
      view (Heavy rotation puts `New` ahead of amber), so each screen picks
      its own badge 2 with `inNoPlaylist(row)`.
    - `CrateRow`'s `children` are the expansion content and are rendered
      inside a `div.sublist`, so put the facts line in `<p class="muted">`,
      the number strip in `<p class="strip">`, then `<PlaylistLinks row={…}/>`
      and, where a date is named, `<OpenMonthLink month={…}/>`.
      `PlaylistLinks` renders the `In 2 playlists` count line itself,
      followed by one linked `<li>` per playlist, or the matching "no
      playlist" sentence.

    `CrateShell` renders only the `‹ Crate` back link and the `<h1>`; Task 5's
    `CrateView` wraps every screen in it, and each screen therefore starts at
    its control. Task 5 appends one more export,
    `Paged({ shown, total, step, onMore })`.
  - `src/ui/crate/CrateEmpty.tsx`: `CrateEmpty({ status: 'empty' |
    'reimport' })`.
  - `src/ui/crate/CrateHub.tsx`: `CrateHub()`, the real hub.

- [ ] **Step 1: Write the failing test**

The hub prints `Imported 2 Sep 2026` from `ImportSummary.importedAt`, which
is epoch milliseconds, while `formatDate` takes an ISO string. Add the case
to `src/ui/format.test.ts` (the current line 2 import gains `formatDate` and
a fourth `it` block is appended, so the whole file becomes):

```ts
import { describe, expect, it } from 'vitest';
import { artistNames, artistUrl, formatDate, plural } from './format';

describe('format helpers', () => {
  it('pluralises', () => {
    expect(plural(1, 'playlist')).toBe('1 playlist');
    expect(plural(0, 'track')).toBe('0 tracks');
    expect(plural(2500, 'play')).toBe(`${(2500).toLocaleString()} plays`);
  });

  it('joins artist names', () => {
    expect(
      artistNames([
        { id: 'a', name: 'Alpha' },
        { id: null, name: 'Beta' },
      ])
    ).toBe('Alpha, Beta');
    expect(artistNames([])).toBe('');
  });

  it('links artists by id and not local-file artists', () => {
    expect(artistUrl('4tZwfgrHOc3mvqYlEYSvVi')).toBe(
      'https://open.spotify.com/artist/4tZwfgrHOc3mvqYlEYSvVi'
    );
    expect(artistUrl(null)).toBeNull();
  });

  it('formats a day from an ISO string or an epoch', () => {
    // Noon UTC: the same calendar day in every zone the phone might use.
    const ms = Date.UTC(2026, 8, 15, 12, 0, 0);
    expect(formatDate(ms)).toBe(formatDate(new Date(ms).toISOString()));
    expect(formatDate(ms)).toContain('2026');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn typecheck && yarn test src/ui/format.test.ts`

Expected: FAIL at `yarn typecheck`, on the two `formatDate(ms)` calls of the
new `it` block:

```
src/ui/format.test.ts(31,23): error TS2345: Argument of type 'number' is not assignable to parameter of type 'string'.
src/ui/format.test.ts(32,23): error TS2345: Argument of type 'number' is not assignable to parameter of type 'string'.
```

Vitest alone reports `Tests 4 passed (4)`, because `new Date(number)` already
works at runtime; that is why the red step runs `typecheck` first.

- [ ] **Step 3: Implement**

In `src/ui/format.ts`, replace:

```ts
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { dateStyle: 'medium' });
}
```

with:

```ts
/** Accepts an export timestamp (ISO) or a stored epoch (`importedAt`). */
export function formatDate(value: string | number): string {
  return new Date(value).toLocaleDateString([], { dateStyle: 'medium' });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn typecheck && yarn test src/ui/format.test.ts`
Expected: typecheck clean, PASS, 4 tests.

- [ ] **Step 5: Add the crate state to `src/model/state.ts`**

Three edits. First, two one-line import replacements. They are separate
lines in the file, so apply them one at a time rather than as one block.

Line 1 — `signal` alone becomes `computed, signal`. Replace:

```ts
import { signal } from '@preact/signals';
```

with:

```ts
import { computed, signal } from '@preact/signals';
```

Line 3 — the repo import gains `putMeta`. Replace:

```ts
import { getAllRows, getMeta, wipeDb } from '../db/repo';
```

with:

```ts
import { getAllRows, getMeta, putMeta, wipeDb } from '../db/repo';
```

Second, after the existing signal block, replace:

```ts
export const banner = signal<string | null>(null);

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
```

with:

```ts
export const banner = signal<string | null>(null);

export const CRATE_NOTICE_META = 'crateNoticeShown';

const CRATE_NOTICE = 'The new Crate views need your history imported again.';

export type CrateStatus = 'empty' | 'reimport' | 'ready';

/**
 * What the Crate can show: an import made before the month buckets existed
 * carries no `version`, so it is detected from the summary and never by
 * sniffing rows.
 */
export const crateStatus = computed<CrateStatus>(() => {
  const summary = historySummary.value;
  if (!summary) return 'empty';
  return summary.version === 2 ? 'ready' : 'reimport';
});

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Said once per browser; the hub's re-import card carries it from then on. */
async function showCrateNotice(): Promise<void> {
  if ((await getMeta<boolean>(CRATE_NOTICE_META)) === true) return;
  banner.value = CRATE_NOTICE;
  await putMeta(CRATE_NOTICE_META, true);
}
```

Third, in `loadFromDb`, replace:

```ts
    historySummary.value =
      (await getMeta<ImportSummary>(HISTORY_SUMMARY_META)) ?? null;
```

with:

```ts
    historySummary.value =
      (await getMeta<ImportSummary>(HISTORY_SUMMARY_META)) ?? null;
    if (crateStatus.value === 'reimport') await showCrateNotice();
```

`disconnect()` needs no change: it sets `historySummary.value = null`, which
drives `crateStatus` back to `'empty'`, and `wipeDb()` takes the meta flag
with it.

`state.ts` has no unit test in this repo and gets none here: importing it in
the Node test environment pulls in `src/auth/browser.ts`, which touches
`localStorage` at module scope.

- [ ] **Step 6: Write the selection signals**

`src/ui/crate/selections.ts`:

```ts
import { signal } from '@preact/signals';
import type { YearPeriod } from '../../model/crate';

// Module level, so a tab switch keeps each view's setting and a reload
// resets it (design §4). The hub reads them to label and count its rows.
export const rotationMonths = signal<number>(3);
export const gemMonths = signal<number>(12);
export const classicSort = signal<'years' | 'plays'>('years');
/** null: the latest year with plays. */
export const yearSel = signal<number | null>(null);
export const yearPeriod = signal<YearPeriod>('all');
export const finishTab = signal<'finished' | 'skipped'>('finished');
```

- [ ] **Step 7: Write the shared row helpers**

`src/ui/crate/shared.tsx`:

```tsx
import type { ComponentChildren } from 'preact';
import type { PlayRow } from '../../db/schema';
import type { Model } from '../../model/aggregate';
import { hasMonthData } from '../../model/crate';
import { nameKey } from '../../model/normalize';
import { model } from '../../model/state';
import { routeHref } from '../../router';
import { TrackRow } from '../components/TrackRow';
import { artistNames, plural } from '../format';

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Spec §3: an export whose last play is older than this reads as stale. The
 * hub's provenance line and Heavy rotation's empty state both need it.
 */
export const STALE_MS = 35 * 24 * 60 * 60 * 1000;

/** A play row from an import that recorded month buckets. */
export type CrateRowData = PlayRow & { months: Record<string, number> };

/** Every Crate view works on these rows; older rows are simply absent. */
export function useCrateRows(): CrateRowData[] {
  const m = model.value;
  return m ? m.plays.filter(hasMonthData) : [];
}

/** '2026-08' -> 'Aug 2026'. */
export function monthLabel(key: string): string {
  const [year, month] = key.split('-');
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
}

/**
 * The synced track wins: the export holds whatever names Spotify wrote at
 * play time, and either of them can be null.
 */
export function trackLabel(row: PlayRow): { title: string; subtitle: string } {
  const track = model.value?.tracksByKey.get(row.trackId);
  if (track) return { title: track.name, subtitle: artistNames(track.artists) };
  return {
    title: row.trackName ?? 'Unknown title',
    subtitle: row.artistName ?? 'Unknown artist',
  };
}

export function trackUrl(row: PlayRow): string {
  return `https://open.spotify.com/track/${row.trackId}`;
}

/** By id first, then by artist and title, so a relinked id still matches. */
export function playlistsOfRow(m: Model, row: PlayRow): string[] {
  const byId = m.playlistsOfTrack.get(row.trackId);
  if (byId && byId.size > 0) return [...byId];
  if (!row.artistName || !row.trackName) return [];
  const byName = m.playlistsOfNameKey.get(
    nameKey(row.artistName, row.trackName)
  );
  return byName ? [...byName] : [];
}

/** The amber badge stays silent until a playlist has actually been synced. */
export function inNoPlaylist(row: PlayRow): boolean {
  const m = model.value;
  return !!m && m.playlists.length > 0 && playlistsOfRow(m, row).length === 0;
}

/**
 * Badge 2 is passed in already decided: the amber rule competes with `New`
 * on Heavy rotation, so the precedence belongs to each screen, not here.
 */
export function CrateRow(p: {
  rank: number;
  row: PlayRow;
  badge1: ComponentChildren;
  badge2?: ComponentChildren;
  expanded: boolean;
  onToggle: () => void;
  children?: ComponentChildren;
}) {
  const label = trackLabel(p.row);
  return (
    <TrackRow
      rank={p.rank}
      title={label.title}
      subtitle={label.subtitle}
      spotifyUrl={trackUrl(p.row)}
      onClick={p.onToggle}
      badges={
        <>
          {p.badge1}
          {p.badge2}
        </>
      }
    >
      {p.expanded && <div class="sublist">{p.children}</div>}
    </TrackRow>
  );
}

export function PlaylistLinks(p: { row: PlayRow }) {
  const m = model.value;
  if (!m) return null;
  const ids = playlistsOfRow(m, p.row);
  if (ids.length === 0) {
    return (
      <p>
        {m.playlists.length === 0
          ? 'Sync your playlists in Settings to see where this sits'
          : `Not in any of your ${plural(m.playlists.length, 'playlist')}`}
      </p>
    );
  }
  return (
    <>
      <p>In {plural(ids.length, 'playlist')}</p>
      <ul>
        {ids.map((id) => (
          <li key={id}>
            <a href={routeHref({ name: 'playlist', id })}>
              {m.playlistsById.get(id)?.name ?? id}
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

export function OpenMonthLink(p: { month: string }) {
  return (
    <p>
      <a href={routeHref({ name: 'crateView', view: 'year', period: p.month })}>
        Open {monthLabel(p.month)} ›
      </a>
    </p>
  );
}

/** The `‹ Crate` link and the title of spec §3, before any data check. */
export function CrateShell(p: { title: string; children?: ComponentChildren }) {
  return (
    <section>
      <a class="back" href={routeHref({ name: 'crate' })}>
        ‹ Crate
      </a>
      <h1>{p.title}</h1>
      {p.children}
    </section>
  );
}
```

- [ ] **Step 8: Write the empty and re-import card**

`src/ui/crate/CrateEmpty.tsx`:

```tsx
import { routeHref } from '../../router';

type EmptyKind = 'empty' | 'reimport';

const HEADING: Record<EmptyKind, string> = {
  empty: 'Your crate is empty',
  reimport: 'Your history needs importing again',
};

const BODY: Record<EmptyKind, string> = {
  empty:
    'These five views are built from your Spotify Extended streaming history, the zip you request from Spotify. The Web API has no play counts, so nothing here can be filled in by syncing.',
  reimport:
    "The year, month and skip views need data the old import didn't keep. Your play counts still work everywhere else.",
};

export function CrateEmpty(p: { status: EmptyKind }) {
  return (
    <>
      <div class="card">
        <h2>{HEADING[p.status]}</h2>
        <p>{BODY[p.status]}</p>
        <button
          type="button"
          class="primary"
          onClick={() => {
            location.hash = routeHref({ name: 'import' });
          }}
        >
          Import history
        </button>
      </div>
      <p class="empty">
        <a href={routeHref({ name: 'top' })}>Spotify's own top lists ›</a>
      </p>
    </>
  );
}
```

- [ ] **Step 9: Replace the hub**

`src/ui/crate/CrateHub.tsx` — replace the whole Task 3 placeholder file
with:

```tsx
import type { PlayRow } from '../../db/schema';
import type { ImportSummary } from '../../history/importer';
import {
  CLASSIC_MIN_YEARS,
  FINISH_MIN_OUTCOMES,
  byYear,
  classics,
  finishRate,
  forgottenGems,
  heavyRotation,
  yearsWithPlays,
  type YearPeriod,
} from '../../model/crate';
import { crateStatus, historySummary, model } from '../../model/state';
import { routeHref, type CrateView } from '../../router';
import { Badge } from '../components/Badge';
import { formatDate, plural } from '../format';
import { CrateEmpty } from './CrateEmpty';
import {
  classicSort,
  finishTab,
  gemMonths,
  rotationMonths,
  yearPeriod,
  yearSel,
} from './selections';
import { STALE_MS, monthLabel, trackLabel, useCrateRows } from './shared';

interface HubRow {
  view: CrateView;
  name: string;
  top: string;
  count: number;
  setting: string;
}

function topLine(row: PlayRow | undefined, prefix: string): string {
  if (!row) return 'Nothing yet';
  const label = trackLabel(row);
  return `${prefix}: ${label.subtitle} — ${label.title}`;
}

function rotationSetting(months: number): string {
  return `last ${months === 1 ? '1 month' : `${months} months`}`;
}

function gemSetting(months: number): string {
  if (months % 12 !== 0) return `unplayed ${months} months+`;
  const years = months / 12;
  return `unplayed ${years === 1 ? '1 year' : `${years} years`}+`;
}

function yearSetting(year: number, period: YearPeriod): string {
  if (period === 'all') return String(year);
  if (typeof period === 'number') {
    return monthLabel(`${year}-${String(period).padStart(2, '0')}`);
  }
  return `${period[0].toUpperCase()}${period.slice(1)} ${year}`;
}

/**
 * Every row is computed with that view's current setting, so the badges say
 * what the user would actually land on.
 */
function hubRows(rows: PlayRow[], now: Date): HubRow[] {
  const rotation = heavyRotation(rows, now, rotationMonths.value);
  const gems = forgottenGems(rows, now, gemMonths.value);
  const classic = classics(rows, classicSort.value);
  const years = yearsWithPlays(rows);
  const year =
    yearSel.value ??
    (years.length > 0 ? years[years.length - 1] : now.getFullYear());
  const yearView = byYear(rows, year, yearPeriod.value);
  const finish = finishRate(rows, finishTab.value);
  return [
    {
      view: 'rotation',
      name: 'Heavy rotation',
      top: topLine(rotation[0]?.row, 'Top'),
      count: rotation.length,
      setting: rotationSetting(rotationMonths.value),
    },
    {
      view: 'gems',
      name: 'Forgotten gems',
      top: topLine(gems[0]?.row, 'Top'),
      count: gems.length,
      setting: gemSetting(gemMonths.value),
    },
    {
      view: 'classics',
      name: 'All-time classics',
      top: topLine(classic[0]?.row, 'Top'),
      count: classic.length,
      setting: `${CLASSIC_MIN_YEARS}+ years`,
    },
    {
      view: 'year',
      name: 'By year',
      top: topLine(yearView.items[0]?.row, `Top in ${year}`),
      count: yearView.tracks,
      setting: yearSetting(year, yearPeriod.value),
    },
    {
      view: 'finish',
      name: 'Finish rate',
      top: topLine(finish[0]?.row, 'Top'),
      count: finish.length,
      setting: `${FINISH_MIN_OUTCOMES}+ outcomes`,
    },
  ];
}

function Provenance(p: { summary: ImportSummary }) {
  const range = p.summary.range;
  const stale =
    range !== null && Date.now() - Date.parse(range.last) > STALE_MS;
  return (
    <p class="provenance">
      {range && stale ? (
        <span class="warn">
          History ends {monthLabel(range.last.slice(0, 7))} ·{' '}
          <a href={routeHref({ name: 'import' })}>re-import</a>
        </span>
      ) : (
        <span>
          {range
            ? `${range.first.slice(0, 4)} – ${range.last.slice(0, 4)} · `
            : ''}
          {plural(p.summary.plays, 'play')}
        </span>
      )}
      <span>
        Imported {formatDate(p.summary.importedAt)} ·{' '}
        <a href={routeHref({ name: 'import' })}>Update import</a>
      </span>
    </p>
  );
}

export function CrateHub() {
  const status = crateStatus.value;
  const summary = historySummary.value;
  const m = model.value;
  const rows = useCrateRows();
  if (status !== 'ready' || !m) {
    return (
      <section>
        <h1>Crate</h1>
        {summary && <Provenance summary={summary} />}
        <CrateEmpty status={status === 'reimport' ? 'reimport' : 'empty'} />
      </section>
    );
  }
  return (
    <section>
      <h1>Crate</h1>
      {summary && <Provenance summary={summary} />}
      {hubRows(rows, new Date()).map((row) => (
        <button
          key={row.view}
          type="button"
          class="hub-row"
          onClick={() => {
            location.hash = routeHref({ name: 'crateView', view: row.view });
          }}
        >
          <span class="main">
            <span class="name">{row.name}</span>
            <span class="sub">{row.top}</span>
            <span class="badges">
              <Badge kind="plays">{plural(row.count, 'track')}</Badge>
              <Badge>{row.setting}</Badge>
            </span>
          </span>
          <span class="chev">›</span>
        </button>
      ))}
    </section>
  );
}
```

The selection signals are read inside `hubRows`, which runs during
`CrateHub`'s render, so the hub re-renders when Task 5's controls change a
setting. Reading them inside the `onClick` closures instead would lose that
subscription.

- [ ] **Step 10: Two CSS rules for the expansion block**

`CrateRow` wraps the expansion in `div.sublist`, which already carries the
38 px indent, the 0.9 rem size and the muted colour, and which Task 3 gives
`li { min-height: 44px }`. Its children still need list and paragraph
resets. Append these two rules at the very end of `src/styles.css`. The last
rule at this point is Task 3's `.hub-row .chev`, not the `input[type='file']`
rule that ended the file before Task 3:

```css
.sublist ul {
  list-style: none;
  margin: 4px 0;
  padding: 0;
}

.sublist p {
  margin: 2px 0;
}
```

- [ ] **Step 11: Verify and commit**

Run: `yarn format && yarn typecheck && yarn lint && yarn test && yarn build`
Expected: all pass, `yarn format` rewrites nothing, and the suite stands at
**148 tests in 16 files** — `src/ui/format.test.ts` goes from 3 to 4, and this
task adds no other test.

The gate is what proves `shared.tsx` compiles: `CrateShell`, `CrateRow`,
`PlaylistLinks`, `OpenMonthLink`, `trackUrl` and `playlistsOfRow` have no
caller until Task 5, which is where they first render.

With `yarn dev`, on a browser whose IndexedDB holds no history: `#/crate`
shows the "Your crate is empty" card, the `Import history` button reaches
`#/import` and the top-lists link reaches `#/top`. After importing an
export: the provenance line reads `2016 – 2026 · N plays` over
`Imported <date> · Update import`, the five hub rows show a green track
count and their setting, and each one navigates to its view (the Task 3
placeholder until Task 5). Stop the server.

```bash
git add src
git commit -m "feat(crate): crate status, shared row helpers and the hub

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

**Decisions this task makes that the spec left open:**

- The whole `shared.tsx` surface except `playlistsOfRow` is model-implicit:
  it reads `model` from `src/model/state` rather than taking a `Model`
  parameter. Tasks 5, 6 and 7 render rows without ever holding the model, so
  a screen cannot pass a stale one.
- `CrateRow` renders `badge2` exactly as given instead of applying the amber
  rule itself, because Heavy rotation puts its blue `New` badge ahead of
  amber while the other four screens put amber first (spec §3 gives the
  precedence per view, not globally).
- `STALE_MS` (35 days, spec §3) is exported from `shared.tsx` so the hub's
  provenance line and Heavy rotation's stale empty state read the same
  number.
- `formatDate` is widened to `string | number` rather than adding a second
  helper; spec §3 needs a day format from `importedAt` here and again in the
  Settings card (Task 7), which therefore does not widen it a second time.
- Two CSS rules (`.sublist ul`, `.sublist p`) are added here because they
  belong to markup Task 3 could not see; they collide with nothing in
  spec §6's list.
- The stale provenance replaces only the range-and-plays span, leaving
  `Imported <date> · Update import` below it, so the export date stays
  visible; `re-import` and `Update import` therefore both link to
  `#/import`.
- A view with no rows shows `Nothing yet` in place of the `Top:` line.
- `By year`'s setting badge is the year alone while the period is `All`, and
  `Mar 2026` / `Winter 2026` when a month or season is selected.
- `monthLabel(range.last.slice(0, 7))` reads the export's UTC month while
  §5 buckets months in the device zone; the difference is at most a day on a
  provenance line.
- A failed import right after an old import burns the `crateNoticeShown`
  flag, because `loadFromDb` sets the banner and `startImport` then
  overwrites it with the error. Accepted: the hub's re-import card carries
  the same message durably.

---

### Task 5: Heavy rotation and Forgotten gems screens, and the CrateView dispatcher

**Files:**
- Create: `src/ui/crate/Rotation.tsx`, `src/ui/crate/Gems.tsx`, `src/ui/crate/Classics.tsx` (placeholder), `src/ui/crate/ByYear.tsx` (placeholder), `src/ui/crate/Finish.tsx` (placeholder)
- Modify: `src/ui/crate/CrateView.tsx` (whole file: the Task 3 placeholder becomes the dispatcher), `src/ui/crate/shared.tsx` (append the `Paged` footer component; no existing line changes)
- Test: none. UI screens carry no unit tests; the task ends with the full gate.

**Interfaces:**

- Consumes, from `src/model/crate.ts` (Task 2, spec §5): `ROTATION_WINDOWS: readonly [1, 3, 6]`, `GEM_WINDOWS: readonly [6, 12, 24]`, `MIN_ROTATION_PLAYS: 3`, `MIN_GEM_PLAYS: 10`, `PAGE_SIZE: 100`, `monthKey(d: Date): string`, `lastMonths(now: Date, count: number): string[]` (oldest first, includes now's month), `yearsWithPlays(rows: PlayRow[]): number[]`, `hasMonthData(row: PlayRow): row is PlayRow & { months: Record<string, number> }`, `heavyRotation(rows: PlayRow[], now: Date, months: number): RotationItem[]` with `RotationItem { row; windowPlays; isNew }`, `forgottenGems(rows: PlayRow[], now: Date, months: number): GemItem[]` with `GemItem { row; lastPlayed: Date }`.
- Consumes, from `src/ui/crate/shared.tsx` (Task 4), in their model-implicit forms (each reads `model` from `src/model/state` itself, so screens never touch the model):
  - `useCrateRows(): CrateRowData[]` — the imported play rows that have month data (`CrateRowData` is `PlayRow & { months }`, so it is a `PlayRow` everywhere a `PlayRow` is wanted).
  - `CrateShell(p: { title: string; children?: ComponentChildren })` — the `‹ Crate` link plus the `<h1>`, and nothing else. `CrateView` below wraps every screen in it, so each screen starts at its own control.
  - `CrateRow(p: { rank: number; row: PlayRow; badge1: ComponentChildren; badge2?: ComponentChildren; expanded: boolean; onToggle: () => void; children?: ComponentChildren })` — title, artist and Spotify link from `trackLabel`/`trackUrl`; renders `children` inside a `div.sublist` only when `expanded`; renders `badge1` then `badge2` verbatim, so this screen owns badge 2's precedence.
  - `PlaylistLinks(p: { row: PlayRow })` — `In 2 playlists` plus the links, or `Not in any of your 41 playlists`.
  - `OpenMonthLink(p: { month: string })` — `Open Aug 2026 ›` to `#/crate/year/2026-08`.
  - `monthLabel(month: string): string` — `'2026-08'` → `'Aug 2026'`.
  - `inNoPlaylist(row: PlayRow): boolean` — true only when the track is in none of the synced playlists **and** at least one playlist has been synced, so the amber rule of spec §3 ("amber is suppressed when no playlist has been synced") lives there and is never re-implemented in a screen.
  - `STALE_MS: number` — 35 days, spec §3's staleness threshold, shared with the hub's provenance line.
- Consumes, from `src/ui/crate/selections.ts` (Task 4): `rotationMonths: Signal<number>` (default 3), `gemMonths: Signal<number>` (default 12).
- Consumes, from `src/ui/crate/CrateEmpty.tsx` (Task 4): `CrateEmpty(p: { status: 'empty' | 'reimport' })` — the no-import / old-import card. It takes the status as a prop, so `CrateView` derives it from `crateStatus` the same way `CrateHub` does.
- Consumes, from `src/model/state.ts`: `crateStatus` (Task 4), a computed signal whose value is `'ready'` when `historySummary.value?.version === 2`, `'reimport'` for a summary without a version and `'empty'` for no summary; and the existing `historySummary: Signal<ImportSummary | null>` with `range: { first: string; last: string } | null`.
- Consumes, existing code: `Segmented<T extends string>({ options, value, onChange })` from `src/ui/components/Segmented`, `Badge({ kind?: 'plays' | 'top' | 'todo' | 'skip', children })` from `src/ui/components/Badge` (the two new kinds land with the CSS in Task 3), `plural(n, word)` and `formatDate(iso)` from `src/ui/format`, `PlayRow` from `src/db/schema`, `CrateView` (the route union `'rotation' | 'gems' | 'classics' | 'year' | 'finish'`) from `src/router` (Task 3).
- Produces: `CrateView({ view, period }: { view: CrateView; period?: string })` (the same props the Task 3 placeholder already receives from `src/app.tsx`, so `src/app.tsx` needs no edit), `Rotation()`, `Gems()`, `Classics()`, `ByYear({ period }: { period?: string })`, `Finish()`, and `Paged({ shown, total, step, onMore })` in `shared.tsx` for Tasks 6 and 7.

Decisions this task fixes, so Tasks 6 and 7 match:

- **The Crate empty states are inline `.empty` blocks, not the `Empty` component.** `Empty` renders `No {what} yet.`, and spec §6 only gives it `href?`/`cta?`, so neither "Nothing with 3+ plays since Jul 2026." nor a `Try 6 months` action (a signal write, not a link) fits through it. Both screens use the `.empty` markup already in `src/styles.css` and used by `src/ui/Playlist.tsx`.
- **`Segmented` is string-only** (`Segmented<T extends string>`), so the numeric window signals are bridged with `String(...)` / `Number(...)` at the call site.
- **Badge 2 precedence**: `isNew` → blue `New`, else `inNoPlaylist` → amber `not in a playlist`, else the grey context number. This is what mockup rows 4 and 5 of Heavy rotation show.
- **Fact lines use `class="muted"`**, not the mockup's `.facts`: `.facts` already exists in `src/styles.css` as the `<ul>` rule of the Import screen. Number strips use `.strip` from spec §6.
- `styles.css` is not touched here; every class used (`.list`, `.empty`, `.muted`, `.actions`, `.caption`, `.strip`, `.footer-note`, `.badge.todo`) already exists or arrived with Task 3.
- **`rank` is `i + 1`** because these two lists are never filtered, only paged, so the rendered index is the rank of the unfiltered list (spec §3). A list that filters must carry its pre-filter index instead.
- Copy rules for the cases the spec's single example leaves open: a one-month range prints `Sep 2026` (no dash); a range inside one year prints `Jul – Sep 2026`; a range across New Year prints `Oct 2025 – Mar 2026`; strip labels are bare short month names even when the window crosses New Year; a gem whose first and last play share a year prints `214 plays · 2019`; the stale sentence says `the last month` for 1 and `the last 3 months` otherwise; the `Try 6 months` button is hidden when the control is already on 6 months.

- [ ] **Step 1: Add the `Paged` footer to `src/ui/crate/shared.tsx`**

Append at the end of `src/ui/crate/shared.tsx`, after the exports Task 4 wrote. No existing line changes and no new import: the caller passes `step`, so `shared.tsx` does not need `PAGE_SIZE`.

```tsx
/** List footer: spec §3 renders PAGE_SIZE rows, then grows on demand. */
export function Paged(p: {
  shown: number;
  total: number;
  step: number;
  onMore: () => void;
}) {
  if (p.total <= p.shown) return null;
  return (
    <>
      <p class="footer-note">
        Showing the top {p.shown.toLocaleString()} of {p.total.toLocaleString()}
      </p>
      <div class="actions">
        <button type="button" onClick={p.onMore}>
          Show {p.step.toLocaleString()} more
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Create the three placeholder screens**

They exist only so the dispatcher type-checks; Tasks 6 and 7 replace their bodies.

`src/ui/crate/Classics.tsx`:

```tsx
export function Classics() {
  return <p class="empty">All-time classics arrives in the next task.</p>;
}
```

`src/ui/crate/ByYear.tsx`:

```tsx
export function ByYear(p: { period?: string }) {
  return (
    <p class="empty">
      By year arrives in the next task
      {p.period ? ` (${p.period})` : ''}.
    </p>
  );
}
```

`src/ui/crate/Finish.tsx`:

```tsx
export function Finish() {
  return <p class="empty">Finish rate arrives in the next task.</p>;
}
```

- [ ] **Step 3: Replace `src/ui/crate/CrateView.tsx` with the dispatcher**

Replace the entire contents of the Task 3 placeholder (which rendered a `‹ Crate` link, a title and a "Coming soon" caption) with the file below. The route union is aliased on import because this module exports a component of the same name.

```tsx
import { crateStatus } from '../../model/state';
import type { CrateView as CrateViewName } from '../../router';
import { ByYear } from './ByYear';
import { Classics } from './Classics';
import { CrateEmpty } from './CrateEmpty';
import { Finish } from './Finish';
import { Gems } from './Gems';
import { Rotation } from './Rotation';
import { CrateShell } from './shared';

const TITLE: Record<CrateViewName, string> = {
  rotation: 'Heavy rotation',
  gems: 'Forgotten gems',
  classics: 'All-time classics',
  year: 'By year',
  finish: 'Finish rate',
};

function Body({ view, period }: { view: CrateViewName; period?: string }) {
  switch (view) {
    case 'rotation':
      return <Rotation />;
    case 'gems':
      return <Gems />;
    case 'classics':
      return <Classics />;
    case 'year':
      return <ByYear period={period} />;
    case 'finish':
      return <Finish />;
  }
}

export function CrateView({
  view,
  period,
}: {
  view: CrateViewName;
  period?: string;
}) {
  return (
    <CrateShell title={TITLE[view]}>
      {crateStatus.value === 'ready' ? (
        <Body view={view} period={period} />
      ) : (
        <CrateEmpty
          status={crateStatus.value === 'reimport' ? 'reimport' : 'empty'}
        />
      )}
    </CrateShell>
  );
}
```

- [ ] **Step 4: Write the Heavy rotation screen**

`src/ui/crate/Rotation.tsx`:

```tsx
import { signal } from '@preact/signals';
import type { PlayRow } from '../../db/schema';
import {
  MIN_ROTATION_PLAYS,
  PAGE_SIZE,
  ROTATION_WINDOWS,
  hasMonthData,
  heavyRotation,
  lastMonths,
  monthKey,
} from '../../model/crate';
import { historySummary } from '../../model/state';
import { Badge } from '../components/Badge';
import { Segmented } from '../components/Segmented';
import { plural } from '../format';
import { rotationMonths } from './selections';
import {
  CrateRow,
  OpenMonthLink,
  Paged,
  PlaylistLinks,
  STALE_MS,
  inNoPlaylist,
  monthLabel,
  useCrateRows,
} from './shared';

const expanded = signal<string | null>(null);
const shown = signal(PAGE_SIZE);

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const OPTIONS = ROTATION_WINDOWS.map((n) => ({
  value: String(n),
  label: n === 1 ? '1 month' : `${n} months`,
}));

function shortMonth(key: string): string {
  return SHORT_MONTHS[Number(key.slice(5, 7)) - 1];
}

function windowLabel(months: number): string {
  return months === 1 ? 'month' : `${months} months`;
}

function rangeLabel(keys: string[]): string {
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (first === last) return monthLabel(last);
  if (first.slice(0, 4) === last.slice(0, 4)) {
    return `${shortMonth(first)} – ${monthLabel(last)}`;
  }
  return `${monthLabel(first)} – ${monthLabel(last)}`;
}

function stripText(row: PlayRow, keys: string[]): string {
  if (!hasMonthData(row)) return '';
  return keys
    .map((key) => {
      const n = row.months[key] ?? 0;
      return `${shortMonth(key)} ${n > 0 ? n.toLocaleString() : '—'}`;
    })
    .join(' · ');
}

/** The window month the row was last played in, for `Open Aug 2026 ›`. */
function latestMonth(row: PlayRow, keys: string[]): string | null {
  if (!hasMonthData(row)) return null;
  for (let i = keys.length - 1; i >= 0; i -= 1) {
    const key = keys[i];
    if ((row.months[key] ?? 0) > 0) return key;
  }
  return null;
}

function staleMonth(now: Date): string | null {
  const range = historySummary.value?.range;
  if (!range) return null;
  const last = Date.parse(range.last);
  if (Number.isNaN(last) || now.getTime() - last <= STALE_MS) return null;
  return monthKey(new Date(last));
}

export function Rotation() {
  const rows = useCrateRows();
  const now = new Date();
  const months = rotationMonths.value;
  const keys = lastMonths(now, months);
  const items = heavyRotation(rows, now, months);
  const caption = [rangeLabel(keys)];
  if (now.getDate() < 8) {
    const current = shortMonth(keys[keys.length - 1]);
    caption.push(`${current} is ${plural(now.getDate(), 'day')} in`);
  }
  caption.push(`${MIN_ROTATION_PLAYS}+ plays`, plural(items.length, 'track'));
  const stale = staleMonth(now);
  return (
    <>
      <Segmented
        options={OPTIONS}
        value={String(months)}
        onChange={(v) => {
          rotationMonths.value = Number(v);
          shown.value = PAGE_SIZE;
        }}
      />
      <p class="caption">{caption.join(' · ')}</p>
      {items.length === 0 ? (
        <div class="empty">
          {stale ? (
            <>
              <p>
                Your history ends {monthLabel(stale)}, so nothing falls in the
                last {windowLabel(months)}.
              </p>
              <a href="#/import">Import a fresh export</a>
            </>
          ) : (
            <>
              <p>
                Nothing with {MIN_ROTATION_PLAYS}+ plays since{' '}
                {monthLabel(keys[0])}.
              </p>
              {months !== 6 && (
                <button
                  type="button"
                  onClick={() => {
                    rotationMonths.value = 6;
                    shown.value = PAGE_SIZE;
                  }}
                >
                  Try 6 months
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          <ul class="list">
            {items.slice(0, shown.value).map((item, i) => {
              const id = item.row.trackId;
              const strip = stripText(item.row, keys);
              const month = latestMonth(item.row, keys);
              return (
                <CrateRow
                  key={id}
                  rank={i + 1}
                  row={item.row}
                  badge1={
                    <Badge kind="plays">
                      {plural(item.windowPlays, 'play')}
                    </Badge>
                  }
                  badge2={
                    item.isNew ? (
                      <Badge kind="top">New</Badge>
                    ) : inNoPlaylist(item.row) ? (
                      <Badge kind="todo">not in a playlist</Badge>
                    ) : (
                      <Badge>{item.row.plays.toLocaleString()} lifetime</Badge>
                    )
                  }
                  expanded={expanded.value === id}
                  onToggle={() => {
                    expanded.value = expanded.value === id ? null : id;
                  }}
                >
                  <p class="muted">
                    {item.windowPlays.toLocaleString()} of{' '}
                    {plural(item.row.plays, 'play')}
                    {item.isNew ? ', all in this window' : ''}
                  </p>
                  {strip && <p class="strip">{strip}</p>}
                  <PlaylistLinks row={item.row} />
                  {month && <OpenMonthLink month={month} />}
                </CrateRow>
              );
            })}
          </ul>
          <Paged
            shown={shown.value}
            total={items.length}
            step={PAGE_SIZE}
            onMore={() => {
              shown.value += PAGE_SIZE;
            }}
          />
        </>
      )}
    </>
  );
}
```

- [ ] **Step 5: Write the Forgotten gems screen**

`src/ui/crate/Gems.tsx`:

```tsx
import { signal } from '@preact/signals';
import type { PlayRow } from '../../db/schema';
import {
  GEM_WINDOWS,
  MIN_GEM_PLAYS,
  PAGE_SIZE,
  forgottenGems,
  hasMonthData,
  monthKey,
  yearsWithPlays,
} from '../../model/crate';
import { Badge } from '../components/Badge';
import { Segmented } from '../components/Segmented';
import { formatDate, plural } from '../format';
import { gemMonths } from './selections';
import {
  CrateRow,
  OpenMonthLink,
  Paged,
  PlaylistLinks,
  inNoPlaylist,
  monthLabel,
  useCrateRows,
} from './shared';

const expanded = signal<string | null>(null);
const shown = signal(PAGE_SIZE);

function gemLabel(months: number): string {
  if (months === 6) return '6 months';
  return months === 12 ? '1 year' : '2 years';
}

const OPTIONS = GEM_WINDOWS.map((n) => ({
  value: String(n),
  label: gemLabel(n),
}));

/** Day 1 of the cutoff month: the caption names a month, not a day. */
function cutoffMonth(now: Date, months: number): string {
  return monthKey(new Date(now.getFullYear(), now.getMonth() - months, 1));
}

function spanLabel(row: PlayRow, lastPlayed: Date): string {
  const first = new Date(row.firstTs).getFullYear();
  const last = lastPlayed.getFullYear();
  return first === last ? String(first) : `${first} – ${last}`;
}

/** Years this track was played in at all, against the export's year count. */
function yearsActive(row: PlayRow): number {
  if (!hasMonthData(row)) return 0;
  const years = new Set<string>();
  for (const [key, n] of Object.entries(row.months)) {
    if (n > 0) years.add(key.slice(0, 4));
  }
  return years.size;
}

export function Gems() {
  const rows = useCrateRows();
  const now = new Date();
  const months = gemMonths.value;
  const items = forgottenGems(rows, now, months);
  const span = yearsWithPlays(rows).length;
  const since = monthLabel(cutoffMonth(now, months));
  return (
    <>
      <Segmented
        options={OPTIONS}
        value={String(months)}
        onChange={(v) => {
          gemMonths.value = Number(v);
          shown.value = PAGE_SIZE;
        }}
      />
      <p class="caption">
        Played {MIN_GEM_PLAYS}+ times, nothing since {since} ·{' '}
        {plural(items.length, 'track')}
      </p>
      {items.length === 0 ? (
        <div class="empty">
          <p>
            Nothing forgotten. Everything you have played {MIN_GEM_PLAYS}+ times
            has come round in the last{' '}
            {months === 12 ? 'year' : gemLabel(months)}.
          </p>
          {months !== 6 && (
            <button
              type="button"
              onClick={() => {
                gemMonths.value = 6;
                shown.value = PAGE_SIZE;
              }}
            >
              Try 6 months
            </button>
          )}
        </div>
      ) : (
        <>
          <ul class="list">
            {items.slice(0, shown.value).map((item, i) => {
              const id = item.row.trackId;
              const month = monthKey(item.lastPlayed);
              return (
                <CrateRow
                  key={id}
                  rank={i + 1}
                  row={item.row}
                  badge1={
                    <Badge kind="plays">{plural(item.row.plays, 'play')}</Badge>
                  }
                  badge2={
                    inNoPlaylist(item.row) ? (
                      <Badge kind="todo">not in a playlist</Badge>
                    ) : (
                      <Badge>last {monthLabel(month)}</Badge>
                    )
                  }
                  expanded={expanded.value === id}
                  onToggle={() => {
                    expanded.value = expanded.value === id ? null : id;
                  }}
                >
                  <p class="muted">
                    {plural(item.row.plays, 'play')} ·{' '}
                    {spanLabel(item.row, item.lastPlayed)}
                  </p>
                  <p class="strip">
                    {yearsActive(item.row).toLocaleString()} of{' '}
                    {plural(span, 'year')} · last {formatDate(item.row.lastTs)}
                  </p>
                  <PlaylistLinks row={item.row} />
                  <OpenMonthLink month={month} />
                </CrateRow>
              );
            })}
          </ul>
          <Paged
            shown={shown.value}
            total={items.length}
            step={PAGE_SIZE}
            onMore={() => {
              shown.value += PAGE_SIZE;
            }}
          />
        </>
      )}
    </>
  );
}
```

- [ ] **Step 6: Run the full gate**

Run: `yarn format && yarn typecheck && yarn lint && yarn test && yarn build`
Expected: all pass with the suite still at **148 tests in 16 files** — this
task adds no test, and none of the four screens it writes has a caller outside
`CrateView`.

With `yarn dev` and an imported history: open `#/crate/rotation`, check the caption reads `Jul – Sep 2026 · 3+ plays · N tracks` (with the `Sep is 4 days in` clause only in the first week of a month), tap a row and check the expansion shows `27 of 41 plays`, the `Jul 9 · Aug 12 · Sep 6` strip, the playlists and `Open Aug 2026 ›`; switch to `1 month` and back. Open `#/crate/gems`, check the three windows, an expansion and `Open Feb 2023 ›`. Open `#/crate/classics`, `#/crate/year` and `#/crate/finish` and check the shell, title and placeholder line render. Stop the server.

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "feat(crate): heavy rotation and forgotten gems screens

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

---

### Task 6: All-time classics and By year screens

**Files:**
- Modify: `src/ui/crate/Classics.tsx` (whole file: the Task 5 placeholder is replaced by the real screen), `src/ui/crate/ByYear.tsx` (whole file: same)
- Test: none. These are UI screens; the plan's rule is that screens carry no unit
  tests and the task ends with the full gate. Every number they print comes from
  `src/model/crate.ts`, covered by `src/model/crate.test.ts` in Task 2.

**Interfaces:**

- Consumes, from Task 2 (`src/model/crate.ts`):
  - `CLASSIC_MIN_PLAYS_PER_YEAR = 3`, `CLASSIC_MIN_YEARS = 3`, `PAGE_SIZE = 100`
  - `type YearPeriod = 'all' | Season | number` (1..12)
  - `monthKey(d: Date): string` — `'YYYY-MM'` in the device zone
  - `periodMonths(year: number, period: YearPeriod): string[]` — oldest first;
    Winter is `['<year-1>-12', '<year>-01', '<year>-02']`
  - `yearsWithPlays(rows: PlayRow[]): number[]` — ascending
  - `classics(rows: PlayRow[], sortBy: 'years' | 'plays'): ClassicItem[]` with
    `ClassicItem { row: PlayRow; yearsActive: number; perYear: Map<number, number> }`.
    **`perYear` holds every year with at least one credited play, not only the
    qualifying 3+-play years** — the strip prints `—` for a missing key, so a
    year with 1 play must show `1`, not a gap. Task 2 builds it that way and
    `crate.test.ts` pins it (`classic`'s 2019 entry is a single 2-play year
    that still appears in `perYear`).
  - `byYear(rows: PlayRow[], year: number, period: YearPeriod): YearResult` with
    `YearResult { items: YearItem[]; plays: number; tracks: number }` and
    `YearItem { row: PlayRow; selectionPlays: number; yearPlays: number }`;
    `items` sorted by `selectionPlays` descending.
- Consumes, from Task 3 (components):
  - `Segmented<T extends string>({ options, value, onChange, scroll? })`
  - `Badge({ kind?: 'plays' | 'top' | 'todo' | 'skip'; children })`
- Consumes, from Task 4 (`src/ui/crate/selections.ts`):
  `classicSort: Signal<'years' | 'plays'>`, `yearSel: Signal<number | null>`,
  `yearPeriod: Signal<YearPeriod>`
- Consumes, from Task 4 (`src/ui/crate/shared.tsx`), all model-implicit:
  - `useCrateRows(): CrateRowData[]` — the play rows that carry month data
  - `CrateRow({ rank: number; row: PlayRow; badge1: ComponentChildren; badge2?: ComponentChildren; expanded: boolean; onToggle: () => void; children?: ComponentChildren })`
    — a `TrackRow` titled from the synced track or the export names; it owns the
    expansion wrapper (`div.sublist`), so `children` is the expansion body only,
    and it renders `badge1` then `badge2` verbatim
  - `PlaylistLinks({ row: PlayRow })` — the `In 2 playlists` line and the links,
    or `Not in any of your 41 playlists`
  - `OpenMonthLink({ month: string })` — `Open Aug 2026 ›` to `#/crate/year/2026-08`
  - `monthLabel(key: string): string` — `'2026-08'` → `'Aug 2026'`
  - `inNoPlaylist(row: PlayRow): boolean` — true only when playlists have been
    synced **and** none of them contains the row (spec §3: amber is suppressed
    when no playlist has been synced)
- Consumes, from Task 5 (`src/ui/crate/shared.tsx`):
  `Paged({ shown: number; total: number; step: number; onMore: () => void })` —
  the `Showing the top 100 of 918` footer note and the `Show 100 more` button;
  renders nothing when `shown >= total`
- **Neither screen renders a `CrateShell`.** Task 5's `CrateView` already wraps
  every view in it, so the `‹ Crate` link and the `<h1>` are done; both files
  return a fragment that starts at the control and continues with the caption
  and then the list or the empty state, which is exactly spec §3's order.
- Consumes, from existing code: `plural`, `formatDate` (`src/ui/format.ts`),
  `historySummary` (`src/model/state.ts`), `PlayRow` (`src/db/schema.ts`).
- Produces: `Classics()` and `ByYear({ period }: { period?: string })`, the two
  screens Task 5's `CrateView` already dispatches to.

- [ ] **Step 1: Write the failing test**

Skipped by rule: these are UI screens, and the plan writes no unit tests for
screens. The pure functions behind both files (`classics`, `byYear`,
`periodMonths`, `yearsWithPlays`, `monthKey`) already have failing-then-passing
tests in Task 2. Go straight to Step 2.

- [ ] **Step 2: Replace the All-time classics screen**

Replace the whole of `src/ui/crate/Classics.tsx` — the Task 5 placeholder, whose
only job was to give `CrateView` something to dispatch to — with:

```tsx
import { signal } from '@preact/signals';
import type { PlayRow } from '../../db/schema';
import {
  CLASSIC_MIN_PLAYS_PER_YEAR,
  CLASSIC_MIN_YEARS,
  PAGE_SIZE,
  classics,
  monthKey,
  yearsWithPlays,
} from '../../model/crate';
import { historySummary } from '../../model/state';
import { Badge } from '../components/Badge';
import { Segmented } from '../components/Segmented';
import { formatDate, plural } from '../format';
import { classicSort } from './selections';
import {
  CrateRow,
  OpenMonthLink,
  Paged,
  PlaylistLinks,
  inNoPlaylist,
  useCrateRows,
} from './shared';

const expanded = signal<string | null>(null);
const limit = signal(PAGE_SIZE);

function yearOf(iso: string | undefined): number | null {
  if (!iso) return null;
  const year = new Date(iso).getFullYear();
  return Number.isFinite(year) ? year : null;
}

/**
 * Every year the export covers, gaps included: the strip prints a dash for a
 * year without plays, so the span comes from the import range and not from the
 * years that happen to have rows.
 */
function spanYears(rows: PlayRow[]): number[] {
  const range = historySummary.value?.range;
  const played = yearsWithPlays(rows);
  const first = yearOf(range?.first) ?? played[0] ?? new Date().getFullYear();
  const last = yearOf(range?.last) ?? played[played.length - 1] ?? first;
  const years: number[] = [];
  for (let y = first; y <= last; y += 1) years.push(y);
  return years.length > 0 ? years : [first];
}

function yearStrip(span: number[], perYear: Map<number, number>): string {
  return span
    .map((y) => `'${String(y).slice(2)} ${perYear.get(y) ?? '—'}`)
    .join(' · ');
}

export function Classics() {
  const rows = useCrateRows();
  const span = spanYears(rows);
  const items = classics(rows, classicSort.value);
  const shown = items.slice(0, limit.value);
  const caption =
    `Played ${CLASSIC_MIN_PLAYS_PER_YEAR}+ times in ` +
    `${CLASSIC_MIN_YEARS}+ of your ${span.length} years · ` +
    plural(items.length, 'track');
  return (
    <>
      <Segmented
        options={[
          { value: 'years', label: 'Most years' },
          { value: 'plays', label: 'Most plays' },
        ]}
        value={classicSort.value}
        onChange={(v) => {
          classicSort.value = v;
          limit.value = PAGE_SIZE;
        }}
      />
      <p class="caption">{caption}</p>
      {items.length === 0 ? (
        <p class="empty">
          No track reaches {CLASSIC_MIN_YEARS} years yet. Your history covers{' '}
          {plural(span.length, 'year')}.
        </p>
      ) : (
        <>
          <ul class="list">
            {shown.map((item, i) => (
              <CrateRow
                key={item.row.trackId}
                rank={i + 1}
                row={item.row}
                expanded={expanded.value === item.row.trackId}
                onToggle={() => {
                  expanded.value =
                    expanded.value === item.row.trackId
                      ? null
                      : item.row.trackId;
                }}
                badge1={
                  <Badge kind="top">
                    {item.yearsActive} of {span.length} years
                  </Badge>
                }
                badge2={
                  inNoPlaylist(item.row) ? (
                    <Badge kind="todo">not in a playlist</Badge>
                  ) : (
                    <Badge kind="plays">{plural(item.row.plays, 'play')}</Badge>
                  )
                }
              >
                <p class="muted">
                  {plural(item.row.plays, 'play')} · last{' '}
                  {formatDate(item.row.lastTs)}
                </p>
                <p class="strip">{yearStrip(span, item.perYear)}</p>
                <PlaylistLinks row={item.row} />
                <OpenMonthLink month={monthKey(new Date(item.row.lastTs))} />
              </CrateRow>
            ))}
          </ul>
          <Paged
            shown={shown.length}
            total={items.length}
            step={PAGE_SIZE}
            onMore={() => {
              limit.value += PAGE_SIZE;
            }}
          />
        </>
      )}
    </>
  );
}
```

Four details that are easy to get wrong:

- The screen returns a **fragment**, not a `CrateShell`: Task 5's `CrateView`
  already rendered the `‹ Crate` link and the `<h1>`. Control, caption, then
  the list or the empty state — spec §3's order, with the control reachable
  even when the list is empty.
- The `Segmented` options stay inline in the JSX. Hoisting them to a module
  const widens `value` to `string`, `T` infers as `string`, and
  `classicSort.value = v` then fails to type-check. `Top.tsx` keeps them inline
  for the same reason.
- Badge 1 is blue (`kind="top"`) because it is the sort key on the default tab;
  badge 2 is the green play count, replaced by the amber `not in a playlist`
  badge — never both, never a third (spec §3). `CrateRow` prints the two as
  given, so this precedence lives here.
- `formatDate` takes the ISO string straight from `row.lastTs`; `monthKey` needs
  a `Date`, hence `new Date(item.row.lastTs)`.

- [ ] **Step 3: Replace the By year screen**

Replace the whole of `src/ui/crate/ByYear.tsx` — again the Task 5 placeholder —
with:

```tsx
import { signal } from '@preact/signals';
import type { PlayRow } from '../../db/schema';
import {
  PAGE_SIZE,
  byYear,
  periodMonths,
  yearsWithPlays,
  type YearPeriod,
} from '../../model/crate';
import { Badge } from '../components/Badge';
import { Segmented } from '../components/Segmented';
import { formatDate, plural } from '../format';
import { yearPeriod, yearSel } from './selections';
import {
  CrateRow,
  Paged,
  PlaylistLinks,
  inNoPlaylist,
  monthLabel,
  useCrateRows,
} from './shared';

const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');

const PERIOD_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'winter', label: 'Winter' },
  { value: 'spring', label: 'Spring' },
  { value: 'summer', label: 'Summer' },
  { value: 'autumn', label: 'Autumn' },
  ...MONTHS.map((label, i) => ({ value: String(i + 1), label })),
];

const expanded = signal<string | null>(null);
const limit = signal(PAGE_SIZE);

/**
 * The route's period segment is applied once per value: arriving from
 * `Open Aug 2026 ›` selects 2026 and August, but a later tap on another chip is
 * never undone by a re-render of the same screen.
 */
let lastAppliedPeriod: string | null = null;

function applyPeriod(period: string): void {
  if (period === lastAppliedPeriod) return;
  lastAppliedPeriod = period;
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return;
  yearSel.value = Number(match[1]);
  yearPeriod.value = month;
  limit.value = PAGE_SIZE;
}

function toPeriod(value: string): YearPeriod {
  const month = Number(value);
  return month >= 1 && month <= 12 ? month : (value as YearPeriod);
}

function monthName(key: string): string {
  return MONTHS[Number(key.slice(5, 7)) - 1] ?? key;
}

/** `2022`, `Mar 2022`, `Jun – Aug 2022`, `Dec 2021 – Feb 2022`. */
function selectionLabel(year: number, period: YearPeriod): string {
  if (period === 'all') return String(year);
  const months = periodMonths(year, period);
  const first = months[0];
  const last = months[months.length - 1];
  if (first === last) return monthLabel(first);
  if (first.slice(0, 4) === last.slice(0, 4)) {
    return `${monthName(first)} – ${monthLabel(last)}`;
  }
  return `${monthLabel(first)} – ${monthLabel(last)}`;
}

function monthStrip(row: PlayRow, year: number): string {
  return MONTHS.map((label, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
    return `${label} ${row.months?.[key] ?? '—'}`;
  }).join(' · ');
}

export function ByYear({ period }: { period?: string }) {
  if (period) applyPeriod(period);
  const rows = useCrateRows();
  const years = yearsWithPlays(rows);
  const year =
    yearSel.value ?? years[years.length - 1] ?? new Date().getFullYear();
  const selection = yearPeriod.value;
  const result = byYear(rows, year, selection);
  const label = selectionLabel(year, selection);
  const shown = result.items.slice(0, limit.value);
  const caption =
    `${label} · ${plural(result.plays, 'play')} · ` +
    plural(result.tracks, 'track');
  return (
    <>
      <Segmented
        scroll
        options={years.map((y) => ({ value: String(y), label: String(y) }))}
        value={String(year)}
        onChange={(v) => {
          yearSel.value = Number(v);
          limit.value = PAGE_SIZE;
        }}
      />
      <Segmented
        scroll
        options={PERIOD_OPTIONS}
        value={String(selection)}
        onChange={(v) => {
          yearPeriod.value = toPeriod(v);
          limit.value = PAGE_SIZE;
        }}
      />
      <p class="caption">{caption}</p>
      {result.items.length === 0 ? (
        <p class="empty">No plays in {label}.</p>
      ) : (
        <>
          <ul class="list">
            {shown.map((item, i) => (
              <CrateRow
                key={item.row.trackId}
                rank={i + 1}
                row={item.row}
                expanded={expanded.value === item.row.trackId}
                onToggle={() => {
                  expanded.value =
                    expanded.value === item.row.trackId
                      ? null
                      : item.row.trackId;
                }}
                badge1={
                  <Badge kind="plays">
                    {plural(item.selectionPlays, 'play')}
                  </Badge>
                }
                badge2={
                  inNoPlaylist(item.row) ? (
                    <Badge kind="todo">not in a playlist</Badge>
                  ) : selection === 'all' ? (
                    <Badge>of {item.row.plays.toLocaleString()} all-time</Badge>
                  ) : (
                    <Badge>
                      of {item.yearPlays.toLocaleString()} in {year}
                    </Badge>
                  )
                }
              >
                <p class="muted">
                  {plural(item.row.plays, 'play')} lifetime · last{' '}
                  {formatDate(item.row.lastTs)}
                </p>
                <p class="strip">{monthStrip(item.row, year)}</p>
                <PlaylistLinks row={item.row} />
              </CrateRow>
            ))}
          </ul>
          <Paged
            shown={shown.length}
            total={result.items.length}
            step={PAGE_SIZE}
            onMore={() => {
              limit.value += PAGE_SIZE;
            }}
          />
        </>
      )}
    </>
  );
}
```

Five details that are easy to get wrong:

- `applyPeriod` writes the signals during render, before they are read. That is
  deliberate: an effect would paint the latest year first and then jump to the
  linked month. The `lastAppliedPeriod` guard makes the write happen at most
  once per period string, so the extra render cannot loop, and tapping a chip
  after arriving from `#/crate/year/2026-08` sticks.
- `limit` is reset in the two `onChange` handlers **and** in `applyPeriod` —
  that third path is the only selection change that never runs an `onChange`.
- `shown` is a `slice`, never a `filter`, so `i + 1` is the rank in the full
  list (spec §3, "Rank comes from the unfiltered list"), and `Paged` gets
  `shown.length` rather than `limit.value` so the footer never claims more rows
  than were rendered.
- `Segmented` is typed `<T extends string>`, so both chip rows carry string
  values: years are `String(y)` and back through `Number(v)`, periods are
  `'all' | 'winter' | … | '1' … '12'` and back through `toPeriod`.
- The strip always prints all twelve months of the selected year, with `—` for
  a month the track was never played in — including when a single month is
  selected, which is what makes the row worth expanding.

- [ ] **Step 4: Run the gate and check both screens by hand**

```bash
yarn format && yarn typecheck && yarn lint && yarn test && yarn build
```

Expected: `format` rewrites nothing, `typecheck` and `lint` are silent, the
Vitest suite still reports **148 tests in 16 files** (this task adds no test),
and `build` writes `dist/` without warnings.

Then, with an imported history:

```bash
yarn dev
```

Open `http://127.0.0.1:5173/myOwnSpotifyData/#/crate/classics` and check: the
caption names the span (`Played 3+ times in 3+ of your 11 years · 62 tracks`),
`Most plays` re-sorts without losing the control, the `‹ Crate` link above the
title still goes back to the hub, a row expands to one number per year with
dashes for gaps, and `Open Aug 2026 ›` lands on
`#/crate/year/2026-08` with 2026 and Aug preselected. On that screen: tap
another month — the selection sticks; tap `All` — badge 2 flips to
`of 358 all-time`; pick a year with more than 100 tracks and check
`Showing the top 100 of 918` and `Show 100 more`; pick a month with no plays and
check `No plays in Feb 2022.` with both chip rows still reachable. Stop the
server.

- [ ] **Step 5: Commit**

```bash
git add src/ui/crate
git commit -m "feat(crate): all-time classics and by year screens

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

---

### Task 7: Finish rate screen, Settings and Import cards, docs

This task has no pure module of its own: it is three UI edits and two
documents. Following the plan's testing rule (UI screens have no unit tests),
it writes no test: every number the Finish screen prints comes from
`finishRate` and `rateBand`, covered by `src/model/crate.test.ts` in Task 2.
The task ends with the full gate including `yarn build` and a manual pass on
the phone layout.

**Files:**
- Replace (the file was created as a placeholder in Task 5; its whole contents
  are given below, so there is no old block to quote):
  `src/ui/crate/Finish.tsx`
- Modify: `src/ui/Settings.tsx` (the "Listening history" card becomes a
  `HistoryCard` component with a `historyLine` helper; the `Settings` function
  body and the import block), `src/ui/Import.tsx` (the `Summary` component,
  plus a new `startsLine` helper), `CLAUDE.md` (spec pointers, three
  Architecture bullets, two new Conventions bullets), `README.md` (the
  "Using it" list)
- Test: none
- Not touched: `src/ui/format.ts` and `src/ui/format.test.ts`. Task 4 already
  widened `formatDate` to `formatDate(value: string | number)` and added the
  epoch case to the test; the Settings card below simply calls it. Do not
  widen it a second time.

**Interfaces:**

- Consumes, from existing code (unchanged by this task):
  - `PlayRow { trackId; plays; msPlayed; firstTs; lastTs; trackName; artistName }`
    from `src/db/schema.ts`, plus the optional fields Task 1 adds:
    `months?: Record<string, number>`, `attempts?: number`, `finished?: number`,
    `skipped?: number`
  - `Segmented` and `Progress` components; `plural`, `formatDateTime` from
    `src/ui/format.ts`; `routeHref` from `src/router.ts`; the signals
    `historySummary`, `importState`, `syncState`, `lastSyncAt`, `isSyncBusy`,
    `startSync`, `disconnect` from `src/model/state.ts`
- Consumes, from earlier Crate tasks (exact shapes this file depends on):
  - Task 1 `src/history/importer.ts`: `ImportSummary` with `version?: 2`,
    `zone: string` and `outcomes: { attempts; finished; skipped }`
  - Task 2 `src/model/crate.ts`:
    `FINISH_MIN_OUTCOMES = 10`,
    `interface FinishItem { row: PlayRow; rate: number; outcomes: number; unclear: number }`,
    `finishRate(rows: PlayRow[], tab: 'finished' | 'skipped'): FinishItem[]`,
    `rateBand(rate: number): 'high' | 'mid' | 'low'` (bands a 0..1 rate at
    0.65 and 0.35)
  - Task 3 `src/ui/components/Badge.tsx`: `kind?: 'plays' | 'top' | 'todo' | 'skip'`
  - Task 3 `src/styles.css`: `.caption`, `.legend`, `.strip`, `.badge.todo`,
    `.badge.skip`, `.sublist li { min-height: 44px }`
  - Task 4 `src/ui/crate/selections.ts`:
    `finishTab: Signal<'finished' | 'skipped'>` (module-level, default
    `'finished'`)
  - Task 4 `src/ui/format.ts`: `formatDate(value: string | number): string`,
    already widened there, which the Settings card below calls on
    `summary.importedAt` (epoch ms) and on the two range strings
  - Task 4 `src/ui/crate/shared.tsx`, all model-implicit:
    `useCrateRows(): CrateRowData[]`,
    `CrateRow({ rank, row, badge1, badge2?, expanded, onToggle, children? })`
    — it owns the `div.sublist` expansion wrapper and prints the two badges
    verbatim — `PlaylistLinks({ row })` (the `In 2 playlists` count line and
    the links, or the matching "no playlist" sentence) and
    `inNoPlaylist(row): boolean`. The Finish screen therefore never touches
    the model, and the row rule of spec §3 (synced names over export names,
    the `https://open.spotify.com/track/<id>` link, playlists by id then by
    name key) lives once, in `shared.tsx`.
  - Task 5 `src/ui/crate/shared.tsx`:
    `Paged({ shown, total, step, onMore })`, the paging footer
  - Task 5 `src/ui/crate/CrateView.tsx`: wraps every view in `CrateShell`, so
    the `‹ Crate` back link and the `<h1>Finish rate</h1>` are already on the
    page and this file starts at the Segmented control
- Produces:
  - `export function Finish()` in `src/ui/crate/Finish.tsx`, the real screen
    replacing the placeholder Task 5's `CrateView` already dispatches to

- [ ] **Step 1: Write the Finish rate screen**

Full contents of `src/ui/crate/Finish.tsx`, replacing the placeholder Task 5
created:

```tsx
import { signal } from '@preact/signals';
import {
  FINISH_MIN_OUTCOMES,
  PAGE_SIZE,
  finishRate,
  rateBand,
  type FinishItem,
} from '../../model/crate';
import { Badge } from '../components/Badge';
import { Segmented } from '../components/Segmented';
import { plural } from '../format';
import { finishTab } from './selections';
import {
  CrateRow,
  Paged,
  PlaylistLinks,
  inNoPlaylist,
  useCrateRows,
} from './shared';

type Tab = 'finished' | 'skipped';

/** One row open at a time, keyed by track id. Reset when the tab changes. */
const expanded = signal<string | null>(null);
const limit = signal(PAGE_SIZE);

const TAB_OPTIONS: { value: Tab; label: string }[] = [
  { value: 'finished', label: 'Finished' },
  { value: 'skipped', label: 'Skipped' },
];

const CAPTION: Record<Tab, string> = {
  finished: 'Tracks you play to the end',
  skipped: 'You bail out of these',
};

/**
 * Both tabs show "<n>% finished", so the colour band is read off the integer
 * the row displays rather than off FinishItem.rate: the badge and the legend
 * can never disagree by a rounding step.
 */
function percentFinished(item: FinishItem): number {
  return Math.round(((item.row.finished ?? 0) / item.outcomes) * 100);
}

function rateKind(pct: number): 'plays' | 'skip' | undefined {
  const band = rateBand(pct / 100);
  if (band === 'high') return 'plays';
  if (band === 'low') return 'skip';
  return undefined;
}

export function Finish() {
  const rows = useCrateRows();
  const tab = finishTab.value;
  const items = finishRate(rows, tab);
  const shown = items.slice(0, limit.value);
  // Control, caption and legend render before the data check, so an empty
  // result still leaves the Segmented reachable (spec section 3).
  return (
    <>
      <Segmented
        options={TAB_OPTIONS}
        value={tab}
        onChange={(v) => {
          finishTab.value = v;
          expanded.value = null;
          limit.value = PAGE_SIZE;
        }}
      />
      <p class="caption">
        {CAPTION[tab]} · {FINISH_MIN_OUTCOMES}+ clear outcomes ·{' '}
        {plural(items.length, 'track')}
      </p>
      <p class="legend">65%+ green · under 35% red</p>
      {items.length === 0 ? (
        <p class="empty">
          No track has {FINISH_MIN_OUTCOMES} clear outcomes yet.
        </p>
      ) : (
        <>
          <ul class="list">
            {shown.map((item, i) => {
              const row = item.row;
              const pct = percentFinished(item);
              return (
                <CrateRow
                  key={row.trackId}
                  rank={i + 1}
                  row={row}
                  expanded={expanded.value === row.trackId}
                  onToggle={() => {
                    expanded.value =
                      expanded.value === row.trackId ? null : row.trackId;
                  }}
                  badge1={<Badge kind={rateKind(pct)}>{pct}% finished</Badge>}
                  badge2={
                    inNoPlaylist(row) ? (
                      <Badge kind="todo">not in a playlist</Badge>
                    ) : (
                      <Badge>
                        {(row.finished ?? 0).toLocaleString()} of{' '}
                        {item.outcomes.toLocaleString()}
                      </Badge>
                    )
                  }
                >
                  <p class="muted">
                    {plural(row.plays, 'play')} ·{' '}
                    {plural(row.attempts ?? 0, 'start')}
                  </p>
                  <p class="strip">
                    {(row.finished ?? 0).toLocaleString()} finished ·{' '}
                    {(row.skipped ?? 0).toLocaleString()} skipped ·{' '}
                    {item.unclear.toLocaleString()} unclear
                  </p>
                  <PlaylistLinks row={row} />
                </CrateRow>
              );
            })}
          </ul>
          <Paged
            shown={shown.length}
            total={items.length}
            step={PAGE_SIZE}
            onMore={() => {
              limit.value += PAGE_SIZE;
            }}
          />
        </>
      )}
    </>
  );
}
```

Three details that are easy to get wrong:

- The screen returns a **fragment**, not a `CrateShell`: Task 5's `CrateView`
  already rendered the `‹ Crate` link and the `<h1>`.
- `finishRate` runs over `useCrateRows()`, the rows that carry month buckets.
  That is the same gate `finishRate` applies internally, and it keeps the
  short-only rows (`plays: 0`, `months: {}`) that make up most of the Skipped
  tab.
- `rateKind` bands `pct / 100` through Task 2's `rateBand`, so the 65 / 35
  thresholds exist in exactly one place and the legend cannot drift from the
  badge colours.

Run: `yarn typecheck && yarn lint`
Expected: both pass.

- [ ] **Step 2: Rewrite the Settings "Listening history" card**

Four edits in `src/ui/Settings.tsx`, applied in the order given: the card is
replaced before the variable it used is deleted, so the file never references
an undefined symbol between two edits. `formatDate` already accepts an epoch
(Task 4 widened it), so nothing in `src/ui/format.ts` changes here.

First, the import block. Replace these exact lines:

```tsx
import {
  disconnect,
  historySummary,
  importState,
  isSyncBusy,
  lastSyncAt,
  startSync,
  syncState,
} from '../model/state';
import { Progress } from './components/Progress';
import { formatDateTime, plural } from './format';
```

with:

```tsx
import type { ImportSummary } from '../history/importer';
import {
  disconnect,
  historySummary,
  importState,
  isSyncBusy,
  lastSyncAt,
  startSync,
  syncState,
} from '../model/state';
import { routeHref } from '../router';
import { Progress } from './components/Progress';
import { formatDate, formatDateTime, plural } from './format';
```

Second, insert the card component above `export function Settings()`. Replace
this exact line:

```tsx
export function Settings() {
```

with:

```tsx
function historyLine(summary: ImportSummary, zoneAtImport?: string): string {
  const parts = [
    `Imported ${formatDate(summary.importedAt)}:`,
    `${plural(summary.plays, 'play')} across`,
    `${plural(summary.tracks, 'track')}.`,
  ];
  if (summary.range) {
    parts.push(`${formatDate(summary.range.first)} –`);
    parts.push(`${formatDate(summary.range.last)}.`);
  }
  if (zoneAtImport) parts.push(`Months bucketed in ${zoneAtImport}.`);
  return parts.join(' ');
}

function HistoryCard() {
  const summary = historySummary.value;
  const importHref = routeHref({ name: 'import' });
  if (!summary) {
    return (
      <div class="card">
        <h2>Listening history</h2>
        <p>No history imported yet.</p>
        <p>
          <a href={importHref}>Import history</a>
        </p>
      </div>
    );
  }
  // Only a version 2 summary knows which zone bucketed its months; an older
  // one has no zone to compare, so it never shows the mismatch warning.
  const zoneAtImport = summary.version === 2 ? summary.zone : undefined;
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <div class="card">
      <h2>Listening history</h2>
      <p>{historyLine(summary, zoneAtImport)}</p>
      {zoneAtImport && zoneAtImport !== deviceZone && (
        <p class="warn">
          This phone is now on {deviceZone}. Re-import to re-bucket months.
        </p>
      )}
      <p>
        <a href={importHref}>Update import</a>
      </p>
    </div>
  );
}

export function Settings() {
```

Third, the card itself. Replace these exact lines:

```tsx
      <div class="card">
        <h2>Listening history</h2>
        <p>
          {history
            ? `Imported ${formatDateTime(history.importedAt)}: ${plural(history.plays, 'play')}.`
            : 'No history imported yet. Use the Import tab.'}
        </p>
      </div>
```

with:

```tsx
      <HistoryCard />
```

Fourth, that leaves `const history = historySummary.value;` unused in
`Settings()`, so replace this exact line:

```tsx
  const history = historySummary.value;
```

with nothing (delete it). `formatDateTime` and `plural` are still used by the
Spotify sync card above.

Run: `yarn typecheck && yarn lint`
Expected: both pass, no unused-variable error.

- [ ] **Step 3: Add the version 2 lines to the Import summary**

Two edits in `src/ui/Import.tsx`.

First, the helper. Replace these exact lines:

```tsx
function Summary({ summary }: { summary: ImportSummary }) {
  const c = summary.counts;
```

with:

```tsx
/** "214,908 starts, 61% played through"; the clause is dropped at zero. */
function startsLine(o: {
  attempts: number;
  finished: number;
  skipped: number;
}): string {
  const starts = plural(o.attempts, 'start');
  const outcomes = o.finished + o.skipped;
  if (outcomes === 0) return starts;
  const pct = Math.round((o.finished / outcomes) * 100);
  return `${starts}, ${pct}% played through`;
}

function Summary({ summary }: { summary: ImportSummary }) {
  const c = summary.counts;
```

Second, the two new facts, after the date range and before the "Imported …"
line. Replace these exact lines:

```tsx
      {summary.range && (
        <li>
          From {formatDate(summary.range.first)} to{' '}
          {formatDate(summary.range.last)}
        </li>
      )}
      <li>
        Imported {formatDateTime(summary.importedAt)} from{' '}
        {plural(summary.processed.length, 'file')}
      </li>
```

with:

```tsx
      {summary.range && (
        <li>
          From {formatDate(summary.range.first)} to{' '}
          {formatDate(summary.range.last)}
        </li>
      )}
      {summary.version === 2 && summary.zone && (
        <li>Months use {summary.zone}, this phone's zone at import</li>
      )}
      {summary.version === 2 && summary.outcomes && (
        <li>{startsLine(summary.outcomes)}</li>
      )}
      <li>
        Imported {formatDateTime(summary.importedAt)} from{' '}
        {plural(summary.processed.length, 'file')}
      </li>
```

Both lines are gated on `version === 2` and on the field itself, so a summary
written before this version renders exactly as it does today.

Run: `yarn typecheck && yarn lint`
Expected: both pass.

- [ ] **Step 4: Update CLAUDE.md**

Three edits.

First, the spec pointers. Replace these exact lines:

```markdown
Design spec: `docs/superpowers/specs/2026-09-04-spotify-dj-webapp-design.md`.
Verified Spotify platform facts: `docs/superpowers/research/2026-09-04-spotify-platform-research.md`.
```

with:

```markdown
Design specs: `docs/superpowers/specs/2026-09-04-spotify-dj-webapp-design.md`
(the app) and `docs/superpowers/specs/2026-09-04-crate-history-views-design.md`
(the five Crate views).
Verified facts: `docs/superpowers/research/2026-09-04-spotify-platform-research.md`
(the Spotify platform) and
`docs/superpowers/research/2026-09-04-history-export-semantics.md`
(`reason_end`, month bucketing, thresholds).
```

Second, three Architecture bullets. Replace these exact lines:

```markdown
- `history/` export file matching, the 30-second play rule, zip processing (`process.ts`, one file in memory at a time), the worker and the main-thread importer.
- `model/` in-memory aggregation (`buildModel`) and signals (`state.ts`).
- `ui/` one Preact component per screen plus small shared components; hash routes from `router.ts`.
```

with:

```markdown
- `history/` export file matching, the 30-second play rule, outcome classification (`trackdone` is finished; `fwdbtn`/`backbtn`/`endplay`/`unknown` or the `skipped` flag is skipped; everything else is neutral), per-month buckets in the device's zone, zip processing (`process.ts`, one file in memory at a time), the worker and the main-thread importer.
- `model/` in-memory aggregation (`buildModel`), the pure Crate computations (`crate.ts`: `heavyRotation`, `forgottenGems`, `classics`, `byYear`, `finishRate`, each one pass over `PlayRow[]`) and signals (`state.ts`).
- `ui/` one Preact component per screen plus small shared components; the five Crate views live in `ui/crate/` (`CrateView` dispatches, `shared.tsx` holds the row helpers, `selections.ts` holds the module-level selection signals); hash routes from `router.ts`.
```

Third, two new Conventions bullets. Replace these exact lines:

```markdown
- **Never sync on page load.** Spotify's unpublished daily quota on playlist reads locks accounts out for hours. Sync only from the Settings button or a playlist's own button.
- **Every failure is shown.** Errors end in a state signal that Settings or a banner renders; nothing is swallowed.
```

with:

```markdown
- **Never sync on page load.** Spotify's unpublished daily quota on playlist reads locks accounts out for hours. Sync only from the Settings button or a playlist's own button.
- **The tab bar is Crate · Top · Playlists · Artists · Settings.** Import is not a tab: `#/import` is still a route, it highlights the Settings tab, and it is reached from the Settings history card, the Crate provenance line and every Crate empty state. The default route stays `top`, even though Crate is the leftmost tab.
- **The Crate is gated on `historySummary.version === 2`**, never on sniffing rows. A version 2 summary also carries `zone` (the device zone that bucketed the months) and `outcomes` (`attempts`, `finished`, `skipped`); `PlayRow.months`, `attempts`, `finished` and `skipped` are optional so rows from an older import still type-check. Month keys are local-zone `YYYY-MM`, and `sum(months) === plays`.
- **Every failure is shown.** Errors end in a state signal that Settings or a banner renders; nothing is swallowed.
```

- [ ] **Step 5: Update README.md**

Replace the whole "Using it" section. These exact lines:

```markdown
## Using it

- **Settings → Sync now** fetches your top lists and the playlists you own.
  Spotify enforces an unpublished daily quota on playlist reads; if it hits,
  the app keeps what it synced and tells you when to retry.
- **Import** takes `my_spotify_data.zip` from Spotify's privacy page
  (request _Extended streaming history_; it arrives by email). A play counts
  once a track was listened to for at least 30 seconds.
- **Disconnect** in Settings removes the login and all cached data.
```

become:

```markdown
## Using it

- **Crate** is the "what do I play tonight" tab, built entirely from the
  imported history: _Heavy rotation_ (most plays in the last 1, 3 or 6
  months), _Forgotten gems_ (10+ lifetime plays, nothing for 6 months, 1 year
  or 2 years), _All-time classics_ (played in the most distinct years), _By
  year_ (top tracks of a year, with season and month chips) and _Finish rate_
  (what you play to the end versus what you bail out of). Spotify's Web API
  has no play counts, so none of this can be filled in by syncing.
- **Settings → Sync now** fetches your top lists and the playlists you own.
  Spotify enforces an unpublished daily quota on playlist reads; if it hits,
  the app keeps what it synced and tells you when to retry.
- **Import** takes `my_spotify_data.zip` from Spotify's privacy page
  (request _Extended streaming history_; it arrives by email). A play counts
  once a track was listened to for at least 30 seconds. Months are bucketed
  in the phone's time zone at import time, so re-import after moving zones.
- **Re-import once for the Crate.** An import made before the Crate shipped
  kept no month, start or skip data, so the year, month and finish-rate views
  stay empty until you import the export again; the app says so once and the
  Settings history card links straight to Import. Play counts from the old
  import keep working everywhere else in the meantime.
- **Disconnect** in Settings removes the login and all cached data.
```

- [ ] **Step 6: Verify and commit**

Run: `yarn format && yarn typecheck && yarn lint && yarn test && yarn build`
Expected: all five pass, the suite still at **148 tests in 16 files** (this
task adds no test), and `yarn build` writes `dist/`.

Then a manual pass, since screens have no unit tests. Run `yarn dev`, open
`http://127.0.0.1:5173/myOwnSpotifyData/` (never `localhost`) with the phone
viewport in devtools and check:

1. `#/crate/finish`: the Finished/Skipped control, the caption
   `Tracks you play to the end · 10+ clear outcomes · N tracks`, the legend
   `65%+ green · under 35% red`, green badges at the top of Finished and red
   ones at the top of Skipped, and one row expanding at a time with the two
   fact lines and the playlist links.
2. Flip to Skipped: the caption changes to `You bail out of these`, the badges
   still read `<n>% finished`, and any open row closes.
3. A window where `finishRate` returns nothing still shows the control, the
   caption `· 0 tracks` and `No track has 10 clear outcomes yet.`
4. `#/settings`: the history card reads
   `Imported <date>: N plays across M tracks. <first> – <last>. Months
   bucketed in <zone>.` with `Update import` linking to `#/import`, and the
   Settings tab stays highlighted after following it.
5. `#/import`: the last-import card shows the two new lines.

Stop the dev server, then commit:

```bash
git add src/ui/crate/Finish.tsx src/ui/Settings.tsx src/ui/Import.tsx \
  CLAUDE.md README.md
git commit -m "feat(crate): finish rate screen, history card, import facts and docs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011mnksovCdMeazWrftqUExu"
```

Do not push.
