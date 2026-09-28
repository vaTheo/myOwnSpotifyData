# Tracklistify JSON Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner import a Tracklistify `tracklist.json` on the Mix screen and create a Spotify playlist from it, with no SoundCloud link required.

**Architecture:** A pure parser (`features/mix/tracklistify.ts`) turns Tracklistify's JSON into the existing `TracklistRow[]` shape; a thin `state.ts` wrapper (`startTracklistifyImport`) builds a synthetic `MixView`/`mixRows` pair from it (no URL exists, so a `tracklistify:<audio_filename>` key stands in); the existing "Create playlist from mix" job, Search matching and row-review UI are reused unchanged except one accuracy addition (an ISRC-first Search query) and a handful of Mix.tsx spots that assumed a real SoundCloud URL always exists.

**Tech Stack:** Preact + `@preact/signals`, TypeScript ~6.0.3, Vitest (Node environment, no DOM), yarn classic.

**Spec:** `docs/superpowers/specs/2026-09-28-tracklistify-import-design.md`

## Global Constraints

- Node 24, yarn classic 1.22. Run `yarn typecheck`, `yarn lint` and `yarn test` locally before any push; all three must pass.
- `typescript` is pinned `~6.0.3` — never bump it or add a dependency to satisfy this feature.
- `moduleResolution: bundler` — every new relative import carries **no** file extension.
- Tests sit next to source as `src/**/*.test.ts`, run in Vitest's **Node** environment. **No DOM or component tests** — `Mix.tsx` changes (Task 4) are verified by `yarn typecheck` + `yarn lint` + `yarn build` + a manual walkthrough, never a new test file, matching the rest of this codebase's UI files.
- Every new persisted field (`TracklistRow.confidence`, `TracklistRow.isrc`, `MixRow['sources'].tracklistify`) must be **optional** — old saved mixes lack them and must still type-check. **No `DB_VERSION` bump.**
- Never runs on page load. `startTracklistifyImport` fires only from the Mix screen's file-picker `onChange`, exactly like `startMixLookup` only fires from its form submit.
- **A wrong track is never added to a playlist.** The new ISRC-first Search query (Task 2) still goes through the existing `pickMatch` accept rule — it is never trusted blindly.
- The Spotify Web API has **no folder concept** at all. The only accommodation is the `tracklistify/` playlist-**name** prefix (Task 3) — nothing attempts real folder placement.
- ESLint flat config: single quotes, semicolons, ES5 trailing commas, 80 columns. `yarn format` is available but not CI-enforced — run it anyway on touched files.

## Review Focus

- **A track whose `metadata` key is entirely absent** (not just sparse) — the parser must degrade `label`/`isrc` to `null` without throwing on a missing object, not just on missing sub-fields. *(Task 1)*
- **A `time_in_mix` value `parseClock` cannot parse** (garbage or an unexpected shape) — the row must still import with `startSec: null`, never abort the whole file. *(Task 1)*
- **An ISRC search hit that fails the artist/title `pickMatch` check** (Spotify's credited-artist spelling differs from Tracklistify's) — resolution must fall through to the existing field/plain queries, never silently give up and never accept the ISRC hit unchecked. *(Task 2)*
- **Re-importing the same file while a different, edited mix is open** — the `hasManualRows` + `confirm` guard must fire before the edits are discarded, exactly as the existing SoundCloud "Look up again" guard does. Not covered by an automated test (`state.ts` has none, by repo convention) — exercised in Task 3's manual walkthrough.
- **Reopening a previously-saved Tracklistify-origin mix and creating its playlist** — the reopened view must still carry `sources.tracklistify === true` (so the `tracklistify/` name prefix and description text still apply), since `openMix` predates this feature and copies `sources` generically. Not covered by an automated test — exercised in Task 4's manual walkthrough.

---

## Task 1: Data model + the Tracklistify parser

**Files:**
- Modify: `src/db/schema.ts:198` (`MixRowSource`), `src/db/schema.ts:200-224` (`TracklistRow`), `src/db/schema.ts:246-252` (`MixRow['sources']`)
- Create: `src/features/mix/tracklistify.ts`
- Test: `src/features/mix/tracklistify.test.ts`

**Interfaces:**
- Consumes: `parseClock` from `src/features/mix/parse.ts` (`export function parseClock(s: string): number | null`, already exists).
- Produces: `parseTracklistifyJson(text: string): TracklistifyImport` and the `TracklistifyImport` type, both exported from `src/features/mix/tracklistify.ts`, for Task 3 to call. `TracklistRow.confidence?: number | null` and `.isrc?: string | null`, and `MixRowSource` gains `'tracklistify'`, for Task 2 and Task 3 to rely on.

- [ ] **Step 1: Write the failing test**

Create `src/features/mix/tracklistify.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseTracklistifyJson } from './tracklistify';

function fixture(
  overrides: {
    mixInfo?: { title?: unknown; audio_filename?: unknown };
    tracks?: unknown;
  } = {}
): string {
  const mix_info = {
    title:
      'pi⧸live: Hannah D, Pjenne & Ed Kent b3b all night long @ Miscellania 06-06-2026 [2393242113]',
    artist: 'Unknown artist',
    audio_filename:
      'pi⧸live: Hannah D, Pjenne & Ed Kent b3b all night long @ Miscellania 06-06-2026 [2393242113].m4a',
    ...overrides.mixInfo,
  };
  const tracks =
    overrides.tracks !== undefined
      ? overrides.tracks
      : [
          {
            song_name: 'Noble Booth',
            artist: 'Stefan Gubatz',
            time_in_mix: '00:00:00',
            confidence: 86.11812625600001,
            duration: null,
            metadata: {
              isrc: 'DECH62001634',
              album: 'Fliester Dubs - EP',
              label: 'Primary Colours',
              release_date: '2025',
              genres: ['Electronic'],
              shazam_id: '825039928',
            },
          },
          {
            song_name: 'Katerina',
            artist: 'Mixxwave',
            time_in_mix: '00:25:50',
            confidence: 97.79107572,
            duration: null,
            metadata: {
              genres: ['Electronic'],
              shazam_id: '836945321',
              links: {
                shazam: 'https://www.shazam.com/track/836945321/katerina',
              },
            },
          },
          {
            song_name: 'Pep A Cat Up (Original Mix)',
            artist: 'Chris Carrier & DJ W!ld',
            time_in_mix: '01:55:50',
            confidence: 95.170307262,
            duration: null,
            metadata: {
              shazam_id: '81243411',
              links: {
                shazam:
                  'https://www.shazam.com/track/81243411/pep-a-cat-up-original-mix',
              },
            },
          },
        ];
  return JSON.stringify({ mix_info, track_count: tracks.length, tracks });
}

describe('parseTracklistifyJson', () => {
  it('parses a real-shaped file into rows, the synthetic url and a cleaned title', () => {
    const result = parseTracklistifyJson(fixture());
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.url).toBe(
      'tracklistify:pi⧸live: Hannah D, Pjenne & Ed Kent b3b all night long @ Miscellania 06-06-2026 [2393242113].m4a'
    );
    // ⧸ (U+29F8) restored to a plain slash in the title; the url key keeps
    // the raw audio_filename unmodified.
    expect(result.title).toBe(
      'pi/live: Hannah D, Pjenne & Ed Kent b3b all night long @ Miscellania 06-06-2026 [2393242113]'
    );
    expect(result.rows).toHaveLength(3);
  });

  it('maps the full-metadata row exactly', () => {
    const result = parseTracklistifyJson(fixture());
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.rows[0]).toEqual({
      startSec: 0,
      endSec: null,
      artist: 'Stefan Gubatz',
      title: 'Noble Booth',
      label: 'Primary Colours',
      source: 'tracklistify',
      gap: false,
      detected: { artist: 'Stefan Gubatz', title: 'Noble Booth' },
      referenceCount: null,
      confidence: 86.11812625600001,
      isrc: 'DECH62001634',
    });
  });

  it('parses time_in_mix past the first hour', () => {
    const result = parseTracklistifyJson(fixture());
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.rows[2].startSec).toBe(1 * 3600 + 55 * 60 + 50);
  });

  it('degrades sparse metadata to null fields, not a crash', () => {
    const result = parseTracklistifyJson(fixture());
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.rows[1].isrc).toBeNull(); // "Katerina": no isrc, no label
    expect(result.rows[1].label).toBeNull();
    expect(result.rows[2].isrc).toBeNull(); // "Pep A Cat Up": sparsest row
    expect(result.rows[2].label).toBeNull();
  });

  it('degrades a track with no metadata key at all', () => {
    const result = parseTracklistifyJson(
      fixture({
        tracks: [
          {
            song_name: 'No Metadata Track',
            artist: 'Someone',
            time_in_mix: '00:01:00',
            confidence: 90,
            duration: null,
          },
        ],
      })
    );
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.rows[0].label).toBeNull();
    expect(result.rows[0].isrc).toBeNull();
  });

  it('degrades wrong-typed confidence/isrc rather than accepting them', () => {
    const result = parseTracklistifyJson(
      fixture({
        tracks: [
          {
            song_name: 'Bad Types',
            artist: 'Someone',
            time_in_mix: '00:01:00',
            confidence: '90%', // wrong type: string, not number
            duration: null,
            metadata: { isrc: 12345, label: 'Real Label' }, // isrc: number
          },
        ],
      })
    );
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.rows[0].confidence).toBeNull();
    expect(result.rows[0].isrc).toBeNull();
    expect(result.rows[0].label).toBe('Real Label');
  });

  it('degrades an unparseable time_in_mix to a null startSec, not a failure', () => {
    const result = parseTracklistifyJson(
      fixture({
        tracks: [
          {
            song_name: 'No Time',
            artist: 'Someone',
            time_in_mix: 'unknown',
            confidence: 90,
            duration: null,
            metadata: {},
          },
        ],
      })
    );
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.rows[0].startSec).toBeNull();
  });

  it('drops a malformed track entry but keeps the good ones', () => {
    const result = parseTracklistifyJson(
      fixture({
        tracks: [
          { song_name: '', artist: 'Missing Title Artist' },
          {
            song_name: 'Kept Track',
            artist: 'Kept Artist',
            time_in_mix: '00:02:00',
            confidence: 80,
            duration: null,
            metadata: {},
          },
        ],
      })
    );
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].title).toBe('Kept Track');
  });

  it('errors when every track entry is malformed', () => {
    const result = parseTracklistifyJson(fixture({ tracks: [{}] }));
    expect(result).toEqual({
      status: 'error',
      message: 'No tracks found in that file.',
    });
  });

  it('errors on invalid JSON', () => {
    const result = parseTracklistifyJson('not json {');
    expect(result.status).toBe('error');
  });

  it('errors when mix_info.title is missing', () => {
    const result = parseTracklistifyJson(
      fixture({ mixInfo: { title: undefined } })
    );
    expect(result).toEqual({
      status: 'error',
      message: "That doesn't look like a Tracklistify tracklist.json.",
    });
  });

  it('errors when mix_info.audio_filename is missing', () => {
    const result = parseTracklistifyJson(
      fixture({ mixInfo: { audio_filename: undefined } })
    );
    expect(result.status).toBe('error');
  });

  it('errors when tracks is missing or not an array', () => {
    const missingTracks = JSON.stringify({
      mix_info: { title: 'x', audio_filename: 'x.m4a' },
    });
    expect(parseTracklistifyJson(missingTracks).status).toBe('error');
    const wrongType = JSON.stringify({
      mix_info: { title: 'x', audio_filename: 'x.m4a' },
      tracks: 'not-an-array',
    });
    expect(parseTracklistifyJson(wrongType).status).toBe('error');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test src/features/mix/tracklistify.test.ts`
Expected: FAIL — `Cannot find module './tracklistify'` (the module does not exist yet).

- [ ] **Step 3: Add the schema fields**

Edit `src/db/schema.ts`. Change line 198 from:

```ts
export type MixRowSource = 'trackid' | 'description' | 'pasted' | 'manual';
```

to:

```ts
export type MixRowSource =
  | 'trackid'
  | 'description'
  | 'pasted'
  | 'manual'
  | 'tracklistify';
```

In the `TracklistRow` interface (currently ending at line 224 with `referenceCount: number | null;`), add two fields immediately after `referenceCount`:

```ts
  /** TrackId `referenceCount` (how many corpus mixes hold the track), else null. */
  referenceCount: number | null;
  /** Tracklistify's 0-100 match confidence, or absent/null for every other
   *  source and for rows saved before this field existed. Display only —
   *  no threshold filters on it. */
  confidence?: number | null;
  /** ISRC from Tracklistify's metadata, or absent/null. Lets
   *  spotifySearch.ts try an exact-recording Search query first. */
  isrc?: string | null;
```

In `MixRow['sources']` (lines 246-252), add one field after `linkOut`:

```ts
  sources: {
    trackid: boolean;
    description: boolean;
    pasted: boolean;
    /** A "full tracklist at <url>" link found in the description, or null. */
    linkOut: string | null;
    /** True for a mix whose working list came from a Tracklistify import.
     *  Absent (not false) on every row saved before this feature and on
     *  every SoundCloud-origin mix. */
    tracklistify?: boolean;
  };
```

- [ ] **Step 4: Write the parser**

Create `src/features/mix/tracklistify.ts`:

```ts
import type { MixRowSource, TracklistRow } from '../../db/schema';
import { parseClock } from './parse';

export type TracklistifyImport =
  | { status: 'ok'; url: string; title: string; rows: TracklistRow[] }
  | { status: 'error'; message: string };

interface TracklistifyTrackJson {
  song_name?: unknown;
  artist?: unknown;
  time_in_mix?: unknown;
  confidence?: unknown;
  metadata?: {
    isrc?: unknown;
    label?: unknown;
  };
}

interface TracklistifyJson {
  mix_info?: {
    title?: unknown;
    audio_filename?: unknown;
  };
  tracks?: unknown;
}

const SOURCE: MixRowSource = 'tracklistify';

/** One track entry to a row, or null when it has no usable artist/title. */
function toRow(track: TracklistifyTrackJson): TracklistRow | null {
  const artist = typeof track.artist === 'string' ? track.artist.trim() : '';
  const title =
    typeof track.song_name === 'string' ? track.song_name.trim() : '';
  if (artist === '' || title === '') return null;
  const startSec =
    typeof track.time_in_mix === 'string'
      ? parseClock(track.time_in_mix)
      : null;
  const confidence =
    typeof track.confidence === 'number' ? track.confidence : null;
  const label =
    typeof track.metadata?.label === 'string' ? track.metadata.label : null;
  const isrc =
    typeof track.metadata?.isrc === 'string' ? track.metadata.isrc : null;
  return {
    startSec,
    endSec: null,
    artist,
    title,
    label,
    source: SOURCE,
    gap: false,
    detected: { artist, title },
    referenceCount: null,
    confidence,
    isrc,
  };
}

/**
 * Parses a Tracklistify `tracklist.json`. Never throws: a malformed file, a
 * wrong shape, or zero usable tracks all return `status: 'error'`; one
 * malformed track entry among good ones is dropped, not fatal (spec §5).
 * `url` is the synthetic `tracklistify:<audio_filename>` save key (spec §4);
 * `title` restores Tracklistify's filesystem-safe `⧸` to a plain `/`.
 */
export function parseTracklistifyJson(text: string): TracklistifyImport {
  let json: TracklistifyJson;
  try {
    json = JSON.parse(text) as TracklistifyJson;
  } catch {
    return { status: 'error', message: 'That is not a JSON file.' };
  }
  const rawTitle = json.mix_info?.title;
  const audioFilename = json.mix_info?.audio_filename;
  if (
    typeof rawTitle !== 'string' ||
    rawTitle.trim() === '' ||
    typeof audioFilename !== 'string' ||
    audioFilename.trim() === '' ||
    !Array.isArray(json.tracks)
  ) {
    return {
      status: 'error',
      message: "That doesn't look like a Tracklistify tracklist.json.",
    };
  }
  const rows = (json.tracks as TracklistifyTrackJson[])
    .map(toRow)
    .filter((r): r is TracklistRow => r !== null);
  if (rows.length === 0) {
    return { status: 'error', message: 'No tracks found in that file.' };
  }
  return {
    status: 'ok',
    url: `tracklistify:${audioFilename}`,
    title: rawTitle.trim().replace(/⧸/g, '/'),
    rows,
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `yarn test src/features/mix/tracklistify.test.ts`
Expected: PASS, all 13 tests green.

- [ ] **Step 6: Typecheck**

Run: `yarn typecheck`
Expected: PASS — confirms the two new optional `TracklistRow` fields and the widened `MixRowSource`/`sources` type don't break any existing file that builds those object literals (`parse.ts`, `lookup.ts`, `state.ts`).

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.ts src/features/mix/tracklistify.ts src/features/mix/tracklistify.test.ts
git commit -m "feat(mix): parse a Tracklistify tracklist.json into TracklistRow[]"
```

## Task 2: ISRC-first Search query

**Files:**
- Modify: `src/features/mix/spotifySearch.ts:94-97` (the `queries` array in `searchTrack`)
- Test: `src/features/mix/spotifySearch.test.ts` (add cases to the existing `describe('searchTrack', ...)` block)

**Interfaces:**
- Consumes: `TracklistRow.isrc` (Task 1).
- Produces: no new exports — `searchTrack`'s signature and existing behavior for rows without `isrc` are unchanged (pinned by the existing test file staying green).

- [ ] **Step 1: Write the failing tests**

In `src/features/mix/spotifySearch.test.ts`, inside the existing `describe('searchTrack', ...)` block (after the last existing `it(...)`, before the closing `});`), add:

```ts
  it('tries an isrc query first when the row carries one', async () => {
    const hit = track();
    const { client, get } = mockClient([hit]);
    const m = await searchTrack(client, row({ isrc: 'DECH62001634' }));
    expect(m.uri).toBe('spotify:track:t1');
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][1]).toEqual({
      q: 'isrc:DECH62001634',
      type: 'track',
      limit: 5,
    });
  });

  it('falls through to the field and plain queries when the isrc hit fails pickMatch', async () => {
    const wrongArtist = track({
      artists: [{ id: 'a2', name: 'Someone Else' }],
    });
    const hit = track();
    const { client, get } = mockClient([wrongArtist], [hit]);
    const m = await searchTrack(client, row({ isrc: 'DECH62001634' }));
    expect(m.uri).toBe('spotify:track:t1');
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls[0][1]).toMatchObject({ q: 'isrc:DECH62001634' });
    expect(get.mock.calls[1][1]).toMatchObject({
      q: 'artist:"Fisher" track:"Losing It"',
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn test src/features/mix/spotifySearch.test.ts -t "isrc"`
Expected: FAIL — both new cases fail (the first because `get.mock.calls[0][1]` is the field query, not `isrc:…`; the row helper does not yet carry `isrc` at the type level either way, since Task 1 already added it).

- [ ] **Step 3: Add the ISRC-first query**

In `src/features/mix/spotifySearch.ts`, change the `queries` array inside `searchTrack` (currently):

```ts
  const queries = [
    `artist:"${artist}" track:"${title}"`,
    `${row.artist} ${row.title}`,
  ];
```

to:

```ts
  const queries = [
    ...(row.isrc ? [`isrc:${row.isrc}`] : []),
    `artist:"${artist}" track:"${title}"`,
    `${row.artist} ${row.title}`,
  ];
```

The loop below it (`for (const q of queries) { ... }`) is unchanged — it already applies `pickMatch` to every query's results in order, so the ISRC query is never trusted blindly.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn test src/features/mix/spotifySearch.test.ts`
Expected: PASS, every test in the file green — including the pre-existing ones, confirming rows with no `isrc` still run exactly the two queries they ran before.

- [ ] **Step 5: Typecheck and lint**

Run: `yarn typecheck && yarn lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/mix/spotifySearch.ts src/features/mix/spotifySearch.test.ts
git commit -m "feat(mix): try an ISRC-exact Search query before text matching"
```

## Task 3: The standalone import wrapper and playlist naming

**Files:**
- Modify: `src/model/state.ts:24` (new import), `src/model/state.ts:651` (new confirm constant), `src/model/state.ts:736` (new function, after `startMixLookup`), `src/model/state.ts:899-902` (`startCreatePlaylist`'s name/description)

**Interfaces:**
- Consumes: `parseTracklistifyJson`/`TracklistifyImport` (Task 1); existing `hasManualRows`, `mixState`, `mixRows`, `mixError` signals; existing `storageMessage` (`../util/errors`).
- Produces: `startTracklistifyImport(file: File): Promise<void>`, for Task 4's file-picker `onChange` to call.

This task has **no automated test** — `state.ts` imports the browser singletons (`auth/browser.ts` touches `localStorage` at module scope), the same reason `startMixLookup`/`startCreatePlaylist` are untested. It is verified by typecheck, build, and a manual walkthrough (Step 5 below), matching every other `start*` wrapper in this file.

- [ ] **Step 1: Add the import**

In `src/model/state.ts`, after line 24 (`import { parseDescription, parsePasted } from '../features/mix/parse';`), add:

```ts
import { parseTracklistifyJson } from '../features/mix/tracklistify';
```

- [ ] **Step 2: Add the confirm constant**

After line 651 (`const REPLACE_WITH_LOOKUP = ...;`), add:

```ts
const REPLACE_WITH_TRACKLISTIFY =
  'Importing this file replaces the current tracklist, including your edits. Continue?';
```

- [ ] **Step 3: Add `startTracklistifyImport`**

Immediately after the closing `}` of `startMixLookup` (line 736, right before `export function applyDescriptionTracklist(): void {`), add:

```ts
/**
 * Imports a Tracklistify tracklist.json as a standalone mix — no SoundCloud
 * link exists for these, so the working list and a synthetic save key (spec
 * §4) are built directly from the file. Never on load: only from the Mix
 * screen's file picker. Parse/read failures go through `mixError` (the
 * general "nothing is swallowed" channel), never `mixState`'s `error` arm,
 * which is reserved for the one SoundCloud-link-shaped message.
 */
export async function startTracklistifyImport(file: File): Promise<void> {
  mixError.value = null;
  let text: string;
  try {
    text = await file.text();
  } catch (err) {
    mixError.value = `Could not read that file: ${storageMessage(err)}`;
    return;
  }
  const parsed = parseTracklistifyJson(text);
  if (parsed.status === 'error') {
    mixError.value = parsed.message;
    return;
  }
  if (hasManualRows(mixRows.value) && !confirm(REPLACE_WITH_TRACKLISTIFY)) {
    return;
  }
  const view: MixView = {
    url: parsed.url,
    title: parsed.title,
    author: null,
    playerSrc: null,
    sources: {
      trackid: false,
      description: false,
      pasted: false,
      linkOut: null,
      tracklistify: true,
    },
    descriptionRows: [],
    trackid: null,
    oembedError: null,
    trackidError: null,
    shortLink: false,
  };
  mixState.value = { status: 'ready', view };
  mixRows.value = parsed.rows;
}
```

- [ ] **Step 4: Branch the playlist name and description**

In `startCreatePlaylist`, replace (currently lines 899-902):

```ts
  const name = (
    (view.title ?? 'Mix tracklist').trim() || 'Mix tracklist'
  ).slice(0, 100);
  const description = `From ${view.url} · via DJ Data`.slice(0, 300);
```

with:

```ts
  const rawTitle = (view.title ?? 'Mix tracklist').trim() || 'Mix tracklist';
  const name = (
    view.sources.tracklistify ? `tracklistify/${rawTitle}` : rawTitle
  ).slice(0, 100);
  const description = (
    view.sources.tracklistify
      ? 'From a Tracklistify scan · via DJ Data'
      : `From ${view.url} · via DJ Data`
  ).slice(0, 300);
```

- [ ] **Step 5: Typecheck, build, and a manual walkthrough**

Run: `yarn typecheck && yarn build`
Expected: PASS.

`startTracklistifyImport` has no UI trigger until Task 4 adds the file picker, so its runtime behavior (the confirm-before-replace guard, the built `MixView`, the saved-mix title) is exercised together with Task 4's own walkthrough (Task 4 Step 6), not separately here. This step's typecheck + build pass is this task's complete verification, matching every other untested `start*` wrapper in this file.

- [ ] **Step 6: Commit**

```bash
git add src/model/state.ts
git commit -m "feat(mix): standalone Tracklistify import wrapper and playlist naming"
```

## Task 4: The Mix screen UI

**Files:**
- Modify: `src/ui/Mix.tsx` — imports (line ~28), `sourceLabel` (lines 69-75), `provenanceLine` (lines 77-94), `Provenance` (lines 438-521), `Mix()` (lines 650-706)

**Interfaces:**
- Consumes: `startTracklistifyImport` (Task 3); `TracklistRow.confidence`, `MixRow['sources'].tracklistify` (Task 1); existing `mixRows`, `mixState`, `mixError`, `plural` (`./format`).
- Produces: nothing further downstream — this is the last task.

No automated test (repo convention: no DOM/component tests). Verified by typecheck, lint, build, and the manual walkthrough in Step 6.

- [ ] **Step 1: Import `startTracklistifyImport`**

In `src/ui/Mix.tsx`, the import block from `../model/state` (starting at line 11) is alphabetised and already lists `startMixLookup,` immediately before `type MixView,`. Add `startTracklistifyImport,` on its own line between them (`'startT' > 'startM'` alphabetically).

- [ ] **Step 2: `sourceLabel` — the new source's label**

Replace (currently lines 69-75):

```ts
function sourceLabel(row: TracklistRow): string {
  if (row.source === 'trackid') return 'TrackId';
  if (row.source === 'description') return 'description';
  if (row.source === 'pasted') return 'pasted';
  return row.detected === null ? 'added' : 'edited';
}
```

with:

```ts
function sourceLabel(row: TracklistRow): string {
  if (row.source === 'trackid') return 'TrackId';
  if (row.source === 'description') return 'description';
  if (row.source === 'pasted') return 'pasted';
  if (row.source === 'tracklistify') return 'Tracklistify';
  return row.detected === null ? 'added' : 'edited';
}
```

- [ ] **Step 3: `provenanceLine` — show the confidence**

Replace (currently lines 84-94):

```ts
function provenanceLine(row: TracklistRow, match: MixMatch | null): string {
  const parts = [sourceLabel(row)];
  if (match && match.playlistCount > 0) {
    parts.push(`in ${plural(match.playlistCount, 'playlist')}`);
  }
  if (row.referenceCount !== null) {
    const n = row.referenceCount;
    parts.push(`${n.toLocaleString()} other ${n === 1 ? 'mix' : 'mixes'}`);
  }
  return parts.join(' · ');
}
```

with:

```ts
function provenanceLine(row: TracklistRow, match: MixMatch | null): string {
  const parts = [sourceLabel(row)];
  if (match && match.playlistCount > 0) {
    parts.push(`in ${plural(match.playlistCount, 'playlist')}`);
  }
  if (row.referenceCount !== null) {
    const n = row.referenceCount;
    parts.push(`${n.toLocaleString()} other ${n === 1 ? 'mix' : 'mixes'}`);
  }
  if (row.confidence != null) {
    parts.push(`${Math.round(row.confidence)}% match`);
  }
  return parts.join(' · ');
}
```

- [ ] **Step 4: `Provenance` — fold in `sources.tracklistify`**

In the `Provenance` function, replace the `foundSomething` computation (currently):

```ts
  const foundSomething =
    tid !== null ||
    view.sources.description ||
    view.sources.linkOut !== null ||
    view.sources.pasted;
```

with:

```ts
  const foundSomething =
    tid !== null ||
    view.sources.description ||
    view.sources.linkOut !== null ||
    view.sources.pasted ||
    view.sources.tracklistify === true;
```

Then add a caption block. Insert it immediately before the existing `{view.sources.description && (...)}` block:

```tsx
      {view.sources.tracklistify === true && (
        <p class="caption">
          From Tracklistify ·{' '}
          {plural(mixRows.value.filter((r) => !r.gap).length, 'track')}
        </p>
      )}
```

- [ ] **Step 5: `Mix()` — the file picker, and the two URL-shaped assumptions**

Replace the whole `Mix()` function (currently lines 650-706) with:

```tsx
export function Mix() {
  const [url, setUrl] = useState('');
  const state = mixState.value;
  const isTracklistifyView =
    state.status === 'ready' && state.view.sources.tracklistify === true;
  const viewUrl =
    state.status === 'ready' && !isTracklistifyView ? state.view.url : null;
  // Load the saved mixes once, on mount (never on app load).
  useEffect(() => {
    void loadSavedMixes();
  }, []);
  // Reopening a saved SoundCloud mix seeds the input from its url, so the
  // always-present top button is the "Look up again" re-fetch path (spec §4,
  // no second control). A Tracklistify-origin view has no real url, so it
  // must never be stuffed into this box (design doc §9).
  useEffect(() => {
    if (viewUrl !== null) setUrl(viewUrl);
  }, [viewUrl]);
  const onJson = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) void startTracklistifyImport(file);
  };
  return (
    <section class="mix">
      <h1>Mix tracklist</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim() !== '' && state.status !== 'looking') {
            void startMixLookup(url);
          }
        }}
      >
        <input
          class="filter"
          type="text"
          inputMode="url"
          placeholder="Paste a SoundCloud mix link"
          value={url}
          onInput={(e) => setUrl((e.currentTarget as HTMLInputElement).value)}
        />
        <button
          type="submit"
          class="primary"
          disabled={state.status === 'looking' || url.trim() === ''}
        >
          {state.status === 'looking'
            ? 'Looking up…'
            : state.status === 'ready' && !isTracklistifyView
              ? 'Look up again'
              : 'Look up'}
        </button>
      </form>
      <label class="file">
        <span>Or import a Tracklistify tracklist.json</span>
        <input
          type="file"
          accept=".json,application/json"
          onChange={onJson}
        />
      </label>
      {state.status === 'looking' && <p class="muted">Looking up the mix…</p>}
      {state.status === 'error' && (
        <p class="error">
          That is not a SoundCloud track link. Paste the link to the mix's page.
        </p>
      )}
      {mixError.value !== null && <p class="error">{mixError.value}</p>}
      {state.status === 'idle' && <SavedMixes />}
      {state.status === 'ready' && <Ready view={state.view} />}
      <InfoCards />
    </section>
  );
}
```

- [ ] **Step 6: Typecheck, lint, build, and the manual walkthrough**

Run: `yarn typecheck && yarn lint && yarn build`
Expected: PASS.

Run `yarn dev`, open `http://127.0.0.1:5173/myOwnSpotifyData/` (never `localhost`), log in, go to `#/mix`. Using one of the owner's real `tracklist.json` files (or the console fixture from Task 3 Step 5):

1. Pick the file via "Or import a Tracklistify tracklist.json". Rows appear with a "Tracklistify · NN% match" provenance line each; a caption reads "From Tracklistify · N tracks".
2. Edit one row, delete another, confirm the list updates.
3. Tap "Save mix" — it appears in the saved-mixes list (back via "‹ Mixes") with a clean title (no `⧸`).
4. Reopen it. The SoundCloud "Paste a SoundCloud mix link" box stays empty and the submit button reads "Look up", not "Look up again" — **Review Focus item confirming the useEffect/button guards**.
5. With this Tracklistify mix open and an edited row, import a **different** `tracklist.json` — the browser's confirm dialog appears before the list is replaced; cancelling it leaves the current rows untouched — **Review Focus item 4**.
6. Tap "Create playlist from mix" (granting the re-login scope prompt first if this is the first time). The created playlist's name starts with `tracklistify/`. Confirm in Spotify (web or the app) that the private playlist exists with that name and the expected tracks.
7. Close and reopen the saved mix again, then tap "Create playlist from mix" a second time — a **second** new `tracklistify/…` playlist is created (never relabelled, matching the existing SoundCloud mix behavior) — **Review Focus item 5**, confirming the reopened view still carries `sources.tracklistify`.

- [ ] **Step 7: Commit**

```bash
git add src/ui/Mix.tsx
git commit -m "feat(mix): Tracklistify import UI on the Mix screen"
```
