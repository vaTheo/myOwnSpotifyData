# Mix tracklist: design

Date: 2026-09-06. Status: draft for the owner to review before any code.
Builds on `2026-09-04-spotify-dj-webapp-design.md`, the Crate specs, and the
`2026-09-05-bpm-key-design.md` / `2026-09-05-artist-reach-design.md` features
(this spec assumes `DB_VERSION` 3 — the two reach stores — has landed).
Research: `../research/2026-09-06-mix-tracklist-sources.md`.
Live probe: this spec's author re-ran the two endpoints on **2026-09-06** from
the app's own origin; the exact responses are quoted in §3 and §8, and where
they refine the research they win.

## 1. Goal

The owner is a DJ. They want to paste a SoundCloud DJ-mix link into the app on
their phone and get back a **draft tracklist** — rows of artist, title and,
where a source knew it, a start time — that they can correct by hand and match
against their own library. The honest deliverable is a *draft with holes*, not
the full tracklist: research §1 and §6 show that no free, browser-only path
returns every track (the best measured free source resolved **32.6%** of one
real 190-minute mix), so the screen is built to make correcting a partial list
cheap, and to say plainly where the rows came from.

Everything is done from **public, keyless endpoints the providers already
expose**, in the browser, with the app's own origin. The app **never fetches or
analyses the mix audio** — that path was declined (research §2, §5.1): the
SoundCloud stream resolver refuses the app's origin, and the SoundCloud API
Terms forbid fingerprinting by purpose on any machine. This feature adds no
recognition, no key, no second setting and no server. It is research §6's
recommended "option A", built as a screen.

Four layers, all free and keyless, all verified CORS-open from
`https://vatheo.github.io` (research §3, §4.3, and this spec's probe):

1. **SoundCloud oEmbed** — the mix `title`, `author_name`, `description`
   (parsed for a hand-written tracklist, or a "full tracklist at <url>" link),
   and the player iframe.
2. **TrackId.net** — a corpus of ~384,000 already-analysed mixes; when the
   pasted mix is in it, the per-track identified spans (`startTime`, `endTime`,
   `artist`, `title`, `label`, `referenceCount`) are the deliverable. The exact
   two-call flow and the mandatory guard are §3.3.
3. **Paste-your-own-tracklist** — a first-class textarea, parsed with the same
   grammar as the description, for the common case where the owner found a
   tracklist on MixesDB or in a comment (research §4.3: MixesDB carried one for
   23 of 24 sampled mixes).
4. **The embedded SoundCloud player** with `show_comments=true`, so the owner
   can read the timed comments — where, on 2 of 9 mixes censused, a single
   comment holds a whole pasted tracklist (research §4.3).

**In scope:** one screen at `#/mix`, reached from a Settings card; the two
network lookups; the two parsers; live matching of each row to the owner's
library through the existing text matcher; per-row editing; saving mixes to a
new IndexedDB store; and two honest info cards pointing at off-phone tools.

**Out of scope, and stated so it is not re-litigated:** any audio fetch,
fingerprint, or recognition API (research §2, §3, §5); a server or Cloudflare
Worker; any paid service (AudD, ACRCloud); MixesDB/1001Tracklists scraping
(link out, never depend — research §4.3); a second app setting. No new
dependency; reuse existing components; one new store; one new route.

## 2. Data

### No gate, and the placement

Unlike the Crate (gated on `historySummary.version === 2`), the Mix screen is
**always reachable** — it needs no import and no run first; an owner who has
only connected Spotify can paste a link. It is **not a new tab** (the tab bar
`Crate · Top · Playlists · Artists · Settings` is fixed). A **"Mix tracklist"
card in Settings** links to a new hash route `#/mix`, exactly as the history
`#/import` route is reached from the Settings history card (`app.tsx:51`,
`tabOf` maps `import → settings`). The Settings tab stays highlighted on
`#/mix`.

### `DB_VERSION` 4, one new store `mixes`

The `upgrade` callback keeps its guarded shape (`db.objectStoreNames.contains`,
`repo.ts:68-92`), so a version 3 database keeps every playlist, track, play,
feature, identity and reach row and gains one store. `wipeDb` deletes the whole
database, so `disconnect` needs no change there.

```ts
// repo.ts, appended inside upgrade(), after the artistReach guard:
if (!db.objectStoreNames.contains('mixes'))
  db.createObjectStore('mixes', { keyPath: 'url' });
```

```ts
// schema.ts
export const DB_VERSION = 4; // was 3
```

**`mixes` is deliberately *not* added to `AllRows`, `getAllRows` or
`buildModel`.** Every job in the app ends in `loadFromDb()`, which re-reads
every library store and rebuilds the whole `Model` — right for library writes,
wrong for saving one mix document, and nothing outside `Mix.tsx` reads a mix.
So the store is declared in `DjDb` (needed for the typed transaction and the
guarded create) and reached through three dedicated repo functions shaped like
`putFeatures` (`repo.ts:216-222`); the model is untouched.

```ts
// schema.ts, DjDb gains one line:
mixes: { key: string; value: MixRow };
```

```ts
// repo.ts
export async function getMixes(): Promise<MixRow[]> {
  const db = await openDb();
  return db.getAll('mixes'); // newest-first ordering is applied in state.ts
}
export async function putMix(row: MixRow): Promise<void> {
  const db = await openDb();
  await db.put('mixes', row);
}
export async function deleteMix(url: string): Promise<void> {
  const db = await openDb();
  await db.delete('mixes', url);
}
```

### The stored types (`schema.ts`, beside the reach rows)

```ts
/** Where a tracklist row came from. 'manual' = the owner typed or edited it. */
export type MixRowSource = 'trackid' | 'description' | 'pasted' | 'manual';

export interface TracklistRow {
  /** Seconds from the start of the mix, or null when the source had no time. */
  startSec: number | null;
  /** Seconds; TrackId is the only source with an end, else null. */
  endSec: number | null;
  /** Shown and edited. Seeded from `detected`; the owner may overwrite it. */
  artist: string;
  title: string;
  /** MixesDB / TrackId label, or null. */
  label: string | null;
  source: MixRowSource;
  /**
   * true for an "ID · unidentified · mm:ss – mm:ss" stretch. `artist`/`title`
   * are ignored for a gap row: it links to nothing and matches nothing.
   */
  gap: boolean;
  /**
   * The values the source produced, kept beside the edited ones so an edit is
   * reversible and provenance survives. null for a row the owner added from
   * scratch (source 'manual').
   */
  detected: { artist: string; title: string } | null;
  /** TrackId `referenceCount` (how many corpus mixes hold the track), else null. */
  referenceCount: number | null;
}

/** New store `mixes`, keyPath 'url'. One row per saved mix. */
export interface MixRow {
  /** normalizeMixUrl(pasted) — the store key, and the guard's comparand (§3). */
  url: string;
  /** oEmbed `title` verbatim (it already ends "… by <author>"), or null. */
  title: string | null;
  /** oEmbed `author_name` verbatim, kept for provenance; not rendered beside the title. */
  author: string | null;
  /**
   * The validated player iframe src (§5.3), or null. Stored so reopening a
   * saved mix restores the player with no network call — it is a derived
   * public URL, not audio, and never carries a token.
   */
  playerSrc: string | null;
  /** TrackId slug when that layer answered, so the provenance link survives a
   *  reopen; null when TrackId did not answer. Never derived from the permalink. */
  slug: string | null;
  /** Which layers answered, for the provenance line and the saved-mixes list. */
  sources: {
    trackid: boolean;
    description: boolean;
    pasted: boolean;
    /** A "full tracklist at <url>" link found in the description, or null. */
    linkOut: string | null;
  };
  /** The one working list the owner curated, in play order. */
  rows: TracklistRow[];
  savedAt: number;
}
```

`title` is stored raw and rendered as the heading **without re-appending the
author** — the probe returned `title: "Exclusive: Shonky - May Mix by XLR8R"`
with `author_name: "XLR8R"`, so rendering both would read "… by XLR8R —
XLR8R". `author` is kept for provenance only.

`MixRow` and `TracklistRow` live in `schema.ts` because they are store types,
exactly as `ArtistReachRow` does. Every result union in §3 and every signal in
§4 lives in `src/features/mix/` or `state.ts`, never in `schema.ts`.

## 3. Sources and parsers

Every network call is a **pure function behind an injected `fetchFn:
typeof fetch`**, returning a typed result whose union has an explicit
`error` / `notFound` / (where relevant) `linkedOut` arm — nothing is swallowed,
per CLAUDE.md's "every failure is shown". No test ever hits the network; each
fetch function is exercised with a mocked `fetchFn`. All requests use the
browser's **default `fetch` credentials** and must **never** set
`credentials: 'include'`: both TrackId endpoints reply
`access-control-allow-credentials: true` (verified), which the app neither
needs nor wants to trigger.

### 3.1 URL normalization (`src/features/mix/url.ts`)

Real share links are messy — `?si=…` tracking params, `?in=user/sets/…`,
`m.soundcloud.com`, a trailing slash — and TrackId's `?url=` filter is an
**exact** string match (research §3: a trailing slash, an upper-cased path and
the bare host each returned `rowCount: 0`). Without normalization the owner
pastes a link to a mix that *is* in the corpus and is told "not found". One
pure function fixes it, and its output is the single canonical string used
three ways: sent to both providers, compared by the guard, and used as the
`mixes` store key (so one mix cannot save twice under two tracking params).

```ts
/** Canonical SoundCloud permalink, or null when the input is not one. */
export function normalizeMixUrl(input: string): string | null;
```

Rules, each with a test in §7:

- Trim; parse as a URL (return `null` if it does not parse).
- Host must be `soundcloud.com`, `www.soundcloud.com` or `m.soundcloud.com`;
  anything else (including `on.soundcloud.com` short links, which need a
  redirect the app cannot follow cross-origin) → `null`. No best-effort note is
  shown for a short link: expanding it would need a network call `normalizeMixUrl`
  must not make, and the `error` state already tells the owner to paste the
  mix's page link (resolved at implementation — §8).
- Lowercase the **host only** — never the path. The research measured an
  upper-cased path returning `rowCount: 0`, so the path is preserved verbatim.
- Rewrite the host to `soundcloud.com`.
- **Drop the entire query string and fragment.**
- Strip exactly one trailing `/`.
- Require a path of at least two segments (`/user/slug`); a bare
  `/user` profile link → `null`.

### 3.2 SoundCloud oEmbed (`src/features/mix/oembed.ts`)

```
GET https://soundcloud.com/oembed?format=json&url=<encodeURIComponent(normUrl)>
```

Verified 2026-09-06: `access-control-allow-origin: *`, HTTP 200, a 12-key body
(`version, type, provider_name, provider_url, height, width, title,
description, thumbnail_url, html, author_name, author_url` — research §2 lists
the same twelve and notes **no `duration` field**). The player `html` is an
`<iframe>` whose `src` was, verbatim:
`https://w.soundcloud.com/player/?visual=true&url=https%3A%2F%2Fapi.soundcloud.com%2Ftracks%2F268511571&show_artwork=true`.

```ts
export type OembedResult =
  | {
      status: 'ok';
      title: string;
      author: string;
      description: string;
      /** The player iframe src, validated (§5.3), or null when absent/untrusted. */
      playerSrc: string | null;
    }
  | { status: 'notFound' } // 404 or any non-2xx: the URL is not a public track
  | { status: 'error'; message: string }; // transport failure / non-JSON

export function fetchOembed(
  fetchFn: typeof fetch,
  normUrl: string
): Promise<OembedResult>;
```

- The body is `unknown`; narrow every field (`typeof x === 'string'`) before
  use, as `reccobeats.ts` does for JSONP bodies.
- Descriptions carry raw HTML fragments and `\r\n` (research §2), so
  `description` is passed on **raw** and cleaned inside the parser (§3.4).
- `playerSrc` is extracted from `html` (`src="…"`) and kept only if it starts
  with the literal `https://w.soundcloud.com/player/` (§5.3); otherwise `null`.
- A 404 is `notFound` (a private, deleted or mistyped mix), never `error`; a
  network/JSON failure is `error`. Both are shown — a failed oEmbed does not
  hide a successful TrackId lookup (§4).

### 3.3 TrackId.net (`src/features/mix/trackid.ts`)

**Two calls, confirmed by probe on 2026-09-06.** The list `?url=` response
carries the mix's metadata but **not** the per-track spans; a second call by
`slug` returns them.

**Call 1 — list, and the guard:**

```
GET https://trackid.net/api/public/audiostreams?url=<encodeURIComponent(normUrl)>
```

Verified: `access-control-allow-origin: https://vatheo.github.io` (reflects the
origin), `access-control-allow-credentials: true`, HTTP 200, body
`{ result: { audiostreams: [record], rowCount: 1 } }`. Each `record` carries
`id, url, slug, title, channel, duration, trackCount, timeHitRate,
trackHitRate, styles, detectionProcesses, …` — but in the list response
**`detectionProcesses[].detectionProcessMusicTracks` is `[]`** (measured: the
whole list body was 1,020 bytes and held zero spans).

> **THE MANDATORY GUARD (research §3, non-negotiable).** Any unrecognised query
> parameter is *silently ignored* and returns the whole unfiltered corpus with
> a huge `rowCount`, so a client that trusts a `200` shows a random mix as the
> answer. **Accept the list result only when `result.rowCount === 1` AND
> `result.audiostreams[0].url === normUrl`.** Anything else — `rowCount: 0`,
> `rowCount > 1`, or a `url` mismatch — is `notFound`, never a fallback to the
> first record. Read the `slug` **from this validated record** (never derive it
> from the permalink: the research found the literal last permalink segment
> 404s, and TrackId's slug is title-derived). Never treat `trackCount` as the
> number of identified spans — the probe returned `trackCount: 16` in the list,
> `0` in the detail, and 18 actual spans.

**Call 2 — detail by slug, the spans:**

```
GET https://trackid.net/api/public/audiostreams/<slug>
```

Verified: HTTP 200, 6,474 bytes, body `{ result: <record> }` where **`result`
is the record itself** (not `result.audiostreams[0]` — a different envelope
from call 1). The record's `detectionProcesses[].detectionProcessMusicTracks[]`
held **18** spans. Quoted verbatim, the span field list is:

```
id, musicTrackId, startTime, endTime, artist, title, label, labelSlug,
slug, referenceCount, isNew, accountMusicTrack
```

`startTime` / `endTime` are `"HH:MM:SS"` strings (e.g. `"00:11:44"` →
`"00:16:16"`); the record `duration` is `"03:10:37.1910000"` (fractional
seconds). `by-slug` guard, load-bearing not insurance: **accept only when
`result.url === normUrl` AND `result.slug === slug`** (the value from call 1);
otherwise `notFound`.

```ts
export type TrackIdResult =
  | {
      status: 'ok';
      slug: string;
      /** trackid.net page for the provenance link: https://trackid.net/audiostream/<slug>. */
      title: string;
      channel: string;
      durationSec: number | null;
      /** 0..1, the honest coverage figure; render as a percentage. */
      timeHitRate: number | null;
      rows: TracklistRow[]; // may be [] when the mix is known but no track was identified
    }
  | { status: 'notFound' } // rowCount≠1, url mismatch, rowCount 0, or detail mismatch
  | { status: 'error'; message: string };

export function fetchTrackId(
  fetchFn: typeof fetch,
  normUrl: string
): Promise<TrackIdResult>;
```

- **Two politely-spaced requests**, list then detail; if the list is
  `notFound`, the detail call is never made.
- `timeHitRate` is the number the owner is shown as coverage — the probe
  returned `0.3263038975216904`, i.e. **32.6%**, which lands exactly on the
  research's measured "32.6% of runtime" (research §1, §3). It ties the
  provenance line to the research figure and is never confused with a track
  count.
- A "mix known, zero spans" mix (`rows: []`) is `status: 'ok'` — §5 shows the
  known-but-empty line and the trackid.net link, not "nothing found".

**Span mapping (`tidSpansToRows`, pure, tested):**

1. **Flatten** `detectionProcessMusicTracks` across *all* `detectionProcesses`
   (there can be a reprocess pass: the probe's record had process 1 with 15
   spans and a reprocess with 3). Parse each `startTime` / `endTime` with the
   shared `parseClock` (§3.5) to seconds.
2. **Merge a reprocess continuation, but not a genuine replay.** Two spans with
   the **same `musicTrackId`** are merged into one (earliest start, latest end)
   **only when they overlap or abut** — the later start is within
   `MIX_MERGE_TOLERANCE_SEC = 5` of the earlier end. The probe gives both
   discriminating cases, and both are §7 test rows:
   - Apollonia "Chez Michel" `02:37:32–02:39:40` (process 1) and `02:39:41–…`
     (reprocess) — a 1-second gap → **one row**.
   - Pierre Codarin "Jazzed My Table" `00:39:40–00:43:20` and `02:55:19–…` —
     two hours apart → **two rows** (the track was genuinely played twice).
3. **Sort** ascending by `startSec`, then `endSec`.
4. **Emit `ID · unidentified` gap rows** for every stretch of ≥
   `MIX_GAP_MIN_SEC = 60` with no identified span (research §5.5: "emit every
   span ≥60 s with no accepted run"): the head (0 → first start), each
   between-span gap, and the tail (last end → `durationSec`) **only when
   `durationSec` is known** — it is, from the list `duration`. A gap row is
   `{ gap: true, startSec, endSec, source: 'trackid', artist: '', title: '',
   detected: null }`.
5. Each identified row is `{ source: 'trackid', startSec, endSec, artist,
   title, label, referenceCount, detected: { artist, title }, gap: false }`.

The gap rows share the `rows` array with the identified ones, so the count ever
shown is `rows.filter((r) => !r.gap).length` — the probe's 18 identified spans,
never the list's `trackCount` 16, never the detail's 0, and never inflated by
the gap rows the array also holds.

### 3.4 Description parser (`src/features/mix/parse.ts`)

```ts
export interface ParsedTracklist {
  rows: TracklistRow[]; // source 'description' or 'pasted'
  /** A "full tracklist at <url>" link found instead of a listing, or null. */
  linkOut: string | null;
}

/** oEmbed description: unescape entities, strip tags, then parseLines(text, 5). */
export function parseDescription(rawDescription: string): ParsedTracklist;

/** Pasted text: parseLines(text, 1) — the owner deliberately pasted a list. */
export function parsePasted(text: string): ParsedTracklist;
```

`parseDescription` first turns the raw description into plain lines: decode
HTML entities (`&amp;` → `&`, `&#39;` → `'`), replace `<br>`/`</p>` with a
newline, strip remaining tags, split on `\r?\n`. Then it delegates to
`parseLines`.

### 3.5 The line grammar (`parseLines`, `parseClock`, pure)

```ts
/** MIN_RUN is 5 for a description (keep prose out), 1 for a paste. */
export function parseLines(text: string, minRun: number): ParsedTracklist;

/** "H:MM:SS" / "M:SS" / "M.SS", one or two H: groups, '.' or ':' as separator,
 *  fractional trailing seconds tolerated; seconds from zero, or null. */
export function parseClock(s: string): number | null;
```

A line is parsed by stripping **at most one leading prefix**, then splitting on
the **first spaced dash** into artist and title, then peeling an optional
trailing `[Label]`. All three dash characters `-`, `–`, `—` are accepted; the
dash must be surrounded by spaces so a hyphenated title (`Sun-El`) is not split.
`ID`, `?` and `unknown` are legitimate artist or title values and are kept
verbatim (they simply get no Spotify link and no library match — §5.3).

The six shapes the research requires (§4.4), each a prefix form, all tested:

| # | Shape | Prefix stripped → `startSec` |
| --- | --- | --- |
| 1 | `1. Artist - Title` | `^\d{1,3}[.)]\s+` → none (index) |
| 2 | `Artist - Title` (often under a `Tracklist:` header) | none → none |
| 3 | `a1. Artist - Title` | `^[a-dA-D]\d{1,2}[.)]\s+` → none (side-position) |
| 4 | `[0:00]: Artist - Title` / `[1:00:30] Artist - Title` | `^[\[(]\s*<clock>\s*[\])]\s*:?\s*` → `parseClock` |
| 5 | `00:00 Artist - Title` / `hh:mm:ss Artist – Title` | `^<clock>\s+` → `parseClock` |
| 6 | `[42] Artist - Track [Label]` (MixesDB) | `^\[\d{1,3}\]\s*` → **minutes** (`n*60`); trailing `[Label]` peeled |

Shape 6's bracketed integer is **minutes** (research §4.3: MixesDB's convention
is `[123] = 2h03m`), distinct from a bracketed `clock` (shape 4). A line that
matches no shape but is non-blank is a *non-matching* line.

**Prefix order is load-bearing**, because `.` is both a time separator and an
index separator (research §4.4). The **clock prefixes (shapes 4 and 5) are
tried before the index prefixes (1, 3, 6)**, and an index prefix requires
**whitespace after its separator** (`^\d{1,3}[.)]\s+`, not `\s*`). So
`1.30 Artist - Title` matches shape 5 first → `startSec` 90; `1. Artist - Title`
falls through to shape 1 → an index, no time. Both are a named §7 test pair.

**The ≥5-line run guard (research §4.4).** Split into lines. A **run** is a
maximal sequence of matching lines in which **blank lines are transparent**
(skipped, they neither match nor break) and a **non-blank non-matching line
breaks** the run. The tracklist is every matching line that belongs to a run of
length `≥ minRun`; if no run reaches `minRun`, `rows` is empty. This keeps a
prose description with one stray `Label - Remixer` line out (a 4-row block is
rejected — §7), while a pasted three-track list is accepted because
`parsePasted` calls it with `minRun = 1`.

**Link-out detection.** Independently of the run guard, a line containing
`tracklist` or `track list` **and** a URL-ish token (`https?://…`, or a
`word.tld/…` such as `dkmn.tl/270-ErisDrew` or `thelotradio.com`) sets
`linkOut` to that token (research §4.4: "Full tracklist here: …", "find the
track list on …"). `linkOut` is surfaced as a link (§5.2) rather than lost in
an empty state. If a real listing (`rows` non-empty) is also present, both are
kept; the rows win the display and the link sits under them.

### 3.6 Library match (`src/features/mix/match.ts`, pure)

Each non-gap, non-`ID` row is matched to the owner's synced library **live at
render time, never stored** — a resync changes the library and a saved match
would go stale, and `FeaturePills` already resolves BPM/key live off
`model.features`. The join uses the **existing text matcher**:
`cleanTitle` + `primaryArtist` from `features/rekordbox-match.ts` and
`normalize` from `model/normalize.ts` — the same key
`` `${cleanTitle(name)}|${normalize(primaryArtist(artist))}` `` that
`rekordbox-match.ts:49-52` builds, so the mix row and a Rekordbox row match the
library the same way.

```ts
export interface MixMatch {
  trackId: string;
  playlistCount: number;
}
/** Memoised on Model identity, as rankUnderTheRadar is (artist-reach §2). */
export function libraryTitleIndex(model: Model): Map<string, string[]>;
export function matchMixRow(
  model: Model,
  index: Map<string, string[]>,
  row: TracklistRow
): MixMatch | null;
```

`libraryTitleIndex` walks `model.tracksByKey`, skips locals and id-less tracks,
and maps the text key → the list of Spotify ids that share it. `matchMixRow`
returns a match only when the row's key hits **exactly one** id (an ambiguous
key is no match — the safe direction, as in artist-reach §3.3); `playlistCount`
is `model.playlistsOfTrack.get(trackId)?.size ?? 0` (for a non-local track the
`playlistsOfTrack` key is the track id). A gap row or a row whose artist/title
is `ID`/`?`/`unknown` returns `null` without a lookup.

## 4. The lookup flow

`src/features/mix/lookup.ts` orchestrates the two fetches; `state.ts` wires it
to signals and IndexedDB. **Manual, never on page load** — the lookup runs only
from the screen's button, honouring CLAUDE.md's rule (the concern there is
Spotify's playlist quota; these endpoints touch no Spotify quota, but the
never-on-load discipline is kept uniformly). Two quick fetches, **main thread
with awaits, no worker** (as the reach run: network-bound, not CPU-bound).

```ts
export interface MixDeps {
  fetchFn: typeof fetch;
  sleep: (ms: number) => Promise<void>;
}
export interface MixLookup {
  oembed: OembedResult;
  trackid: TrackIdResult;
}
/** Runs oEmbed and TrackId in parallel; never throws — each arm carries its
 *  own error status so one failure cannot hide the other's result. */
export function lookupMix(deps: MixDeps, normUrl: string): Promise<MixLookup>;
```

The two layers are independent, so `startMixLookup` folds **both** statuses
into the one `MixView` (§4) — this is what makes "every failure is shown" true:
a TrackId `error` still renders beside an oEmbed `ok`, each with its own line.
`sleep` spaces the TrackId list and detail calls politely.

### Signals and actions (`src/model/state.ts`)

A fresh lookup and a reopened saved mix must render through **one** path, so
the `ready` state carries a small **view model** rather than the raw
`OembedResult` / `TrackIdResult`: a live lookup builds it from the two results,
and `openMix` builds the identical shape from the stored `MixRow` (with the
error fields null). The editable rows always live in their own `mixRows` signal.

```ts
export interface MixView {
  url: string;
  title: string | null;
  author: string | null;
  playerSrc: string | null;
  sources: MixRow['sources']; // trackid / description / pasted / linkOut
  /**
   * The description's parsed rows, kept so the "Replace with the description
   * tracklist" button (§5.2) has something to apply and `startMixLookup` can
   * seed from them. Empty when the description held no listing, and empty on
   * reopen (the raw description is not stored). `sources.description` is just
   * `descriptionRows.length > 0`.
   */
  descriptionRows: TracklistRow[];
  /** TrackId provenance summary (identified count, hit rate, whether empty), or null. */
  trackid: { slug: string; count: number; timeHitRate: number | null; empty: boolean } | null;
  /** Layer error messages to show inline; null when the layer was fine or not live. */
  oembedError: string | null;
  trackidError: string | null;
}

export type MixState =
  | { status: 'idle' }
  | { status: 'looking'; url: string }
  | { status: 'ready'; view: MixView }
  | { status: 'error'; message: string }; // only "that is not a SoundCloud link"

export const mixState = signal<MixState>({ status: 'idle' });
/** The one working, editable tracklist. Its own signal so an edit re-renders. */
export const mixRows = signal<TracklistRow[]>([]);
/** Saved mixes, newest first; loaded when the Mix screen mounts. */
export const savedMixes = signal<MixRow[]>([]);
```

- `startMixLookup(pastedUrl)` — mirrors `startLookup` (`state.ts:386`): claim
  `{ status: 'looking' }` synchronously so a second tap cannot double-run;
  `normalizeMixUrl` first, and a `null` there is
  `{ status: 'error', message: 'That is not a SoundCloud track link.' }` with
  no fetch. Then `lookupMix`. Parse the description once with
  `parseDescription(oembed.description)` (when oEmbed answered `ok`) and build a
  `MixView`: each layer's error into `oembedError`/`trackidError`; `playerSrc`
  and the TrackId summary from the `ok` arms; `descriptionRows` and
  `sources.linkOut` from the parse; `sources.description = descriptionRows.length
  > 0`. Set `{ status: 'ready', view }`; then **seed `mixRows`** from the richest
  layer that answered — the TrackId `ok` rows if non-empty, else
  `view.descriptionRows` if non-empty, else `[]`. It does **not** call
  `loadFromDb()` (mixes are not in the model) and does **not** join
  `jobsBusy()` (it clobbers no model rebuild — §8).
- `applyDescriptionTracklist()` — replaces `mixRows` with `view.descriptionRows`;
  if the working list holds any edited or `manual` row, `confirm()` first (the
  idiomatic guard here, as in `startSync`). The button appears only when
  `view.descriptionRows` is non-empty and those rows are not already what is
  shown.
- `applyPastedTracklist(text)` — `parsePasted(text)`; same replace-with-confirm
  rule; sets the `pasted` source flag; a `linkOut`-only paste is a no-op with a
  gentle inline note.
- Row edits mutate a copy of `mixRows`: editing artist/title keeps `detected`
  and, if the values now differ from `detected`, flips `source` to `manual`;
  add-row appends `{ source: 'manual', detected: null, … }`; delete-row splices.
- `saveMix()` — builds a `MixRow` from the current `MixView` (`url`, `title`,
  `author`, `playerSrc`, `sources`, `slug` = `view.trackid?.slug ?? null`), the
  working `mixRows`, and `Date.now()`; `putMix`; then refresh `savedMixes` via
  `getMixes()` sorted by `savedAt` desc.
- `loadSavedMixes()` — `getMixes()` → `savedMixes`, called on screen mount.
- `openMix(url)` — reads the saved row from `savedMixes` (already in memory),
  loads its `rows` into `mixRows`, and sets `{ status: 'ready', view }` with a
  `MixView` built from the stored `MixRow`: `url`/`title`/`author`/`playerSrc`/
  `sources` copied over, `oembedError`/`trackidError` null, `descriptionRows: []`
  (the raw description is not stored, so the "Replace with the description
  tracklist" button does not appear on a reopened mix — the owner already
  curated the saved list), and the `trackid` summary reconstructed from the
  stored `slug` as `{ slug, count: rows without a gap, timeHitRate: null, empty:
  count === 0 }` when `sources.trackid` (the stored row does not keep the hit
  rate, so it is null on reopen and the provenance line drops the percentage).
  **It performs no network call** — reopening a saved mix must not re-fetch, or
  never-on-load is broken. A "Look up again" button is the only way to re-fetch.
- `removeMix(url)` — `deleteMix(url)` then refresh `savedMixes`.
- `disconnect()` (`state.ts:500`) resets the three new signals alongside the
  existing ones — `mixState = { status: 'idle' }`, `mixRows = []`,
  `savedMixes = []`; `wipeDb` already drops the store. That reset list is
  exhaustive by hand, so it is called out here so the addition is not missed.

## 5. Screens

### 5.1 Settings: "Mix tracklist" card

A new card in `Settings.tsx`, placed after "Artist reach", built like the
history card (a heading, a line, a link — no run, no state):

```
Mix tracklist
Paste a SoundCloud DJ-mix link to draft its tracklist from public sources —
or type your own.

Open mix tracklist ›     → routeHref({ name: 'mix' }) = #/mix
```

### 5.2 Mix screen (`src/ui/Mix.tsx`, route `#/mix`)

`#/mix` is **parameterless** — a SoundCloud URL inside a hash route would fight
`parseRoute`'s `/` split for no gain, so the open/selected mix is in-screen
signal state, not in the URL. Router wiring:

- `router.ts`: `Route` gains `| { name: 'mix' }`; `parseRoute` gains
  `case 'mix': return { name: 'mix' };`; `routeHref`'s `default` already yields
  `#/mix`.
- `app.tsx`: `Screen` gains `case 'mix': return <Mix />;`; `tabOf` gains
  `if (r.name === 'mix') return 'settings';`.

The screen always shows, top to bottom: the **h1 `Mix tracklist`**, the **paste
box** (a URL input + `Look up` button), and — once a lookup or an open has
happened — the player, the tracklist, the paste-your-own textarea, and the two
info cards (§5.4). Below all of that, when nothing is open, the **saved-mixes
list**.

**States**, derived from `mixState` (and, when `ready`, its `view`):

- **idle** — h1, the URL input with placeholder `Paste a SoundCloud mix link`,
  a `Look up` button (disabled until the input is non-empty), then the
  saved-mixes list (or, empty, the muted line `No saved mixes yet.`), then the
  two info cards.
- **looking** — the input and a muted line `Looking up the mix…`
  (`<p class="muted">`, no `Progress` — there is no count to bar). Button reads
  `Looking up…`, disabled.
- **error** (not a SoundCloud link) — `p.error`:
  `That is not a SoundCloud track link. Paste the link to the mix's page.`
  The input stays so the owner can fix it.
- **ready** — one **provenance line** (`p.caption`) naming what answered, then
  the player, the tracklist, the paste box and the info cards. The provenance
  line is the "source badge" the brief asks for, realised as **text, not a new
  pill** (following artist-reach §6's "No `Badge` is added"). All fields come
  from `view`:
  - TrackId with spans: `From TrackId.net · 18 tracks · 33% of the mix identified · Open on TrackId.net ›`
    (`view.trackid.count`; `Math.round(view.trackid.timeHitRate*100)`, dropped
    on reopen where the hit rate is null; link `https://trackid.net/audiostream/<view.trackid.slug>`).
  - TrackId known but empty (`view.trackid.empty`): `TrackId.net has this mix but identified no tracks yet · Open on TrackId.net ›`.
  - Description listing (`view.sources.description`): `From the mix description`.
  - `view.sources.linkOut` present: `The description links a full tracklist · <linkOut> ›` (an `<a>`).
  - Nothing automatic: `Nothing found automatically — paste a tracklist below, or read the player's comments.`
  - Each failed layer gets its **own** muted/error line so nothing is hidden,
    from `view.trackidError` / `view.oembedError`:
    `TrackId.net could not be reached: {message}` / `The mix page could not be read: {message}`.

**The player.** When `view.playerSrc` is non-null (it passed the literal
`https://w.soundcloud.com/player/` prefix check — the check is what makes
"rebuild, don't inject" safe), render an `<iframe>` the app builds itself from
that src with `&show_comments=true` appended (the src already has a query
string, so `&`, not `?`), fixed `width="100%" height="400"`,
`loading="lazy"`, `allow="autoplay; encrypted-media"`. The app never injects
the oEmbed `html` verbatim. When `playerSrc` is null, no player is rendered and
no error is shown (the tracklist may still be present from TrackId).

**The tracklist** (`ul.list` of `TrackRow`) — §5.3. Above it, when
`view.descriptionRows` is non-empty and those rows are not the ones shown, one
button: `Replace with the description tracklist` (`applyDescriptionTracklist`,
with the `confirm()` guard). Below it, an `Add track` button and a `Save mix`
button (`Saved ✓` transiently after `saveMix`).

**The paste box** — a first-class element on every ready screen, not an empty
state: a `<textarea>` labelled `Paste a tracklist` with placeholder
`e.g. from MixesDB or a player comment`, and an `Add these tracks` button
(`applyPastedTracklist`). It sits under the tracklist so a partial automatic
list can be completed by hand.

**Saved-mixes list** (idle only) — a `ul.list` of `TrackRow`s: title =
`mix.title ?? mix.url`, subtitle = `{n} tracks · saved {formatDate(savedAt)}`
where `n` is `rows.filter((r) => !r.gap).length` (gaps never counted),
`onClick` → `openMix`, plus a small `Remove` affordance (`confirm()` then
`removeMix`).

### 5.3 Tracklist rows

Each identified row is a `TrackRow`:

- **title** = `` `${row.artist} – ${row.title}` `` (an en-dash), or, for a gap
  row, the literal `ID · unidentified`.
- **subtitle** = the time and label: `formatClock(startSec)` (and `– formatClock(endSec)`
  when both are known), then `· {label}` when a label exists. A gap row's
  subtitle is `formatClock(startSec) – formatClock(endSec)`, and the whole row
  carries a muted class. `formatClock` prints `m:ss` under an hour and
  `h:mm:ss` at or above it.
- **spotifyUrl** = `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${title}`)}`
  — rendered by the existing `SpotifyLink` (search, not a track page, because
  the app holds no Spotify id for the identified track). **A gap row, or a row
  whose artist or title normalises to `id`/`?`/`unknown`, gets no link.**
- **badges slot** (the wrapping `.badges` flex row, reused as artist-reach
  reused it — text and pills, no new component):
  - When `matchMixRow` hits: `<FeaturePills trackId={match.trackId} />` (the
    BPM/key pills the brief asks for) and a text span `in {n} playlists`
    (`plural`). This is the "in N playlists" the brief specifies, live from the
    owner's library.
  - A muted provenance span naming `row.source` — `TrackId`, `description`,
    `pasted`, or `edited` (when `source === 'manual'` and `detected !== null`) /
    `added` (when `detected === null`). Text, not a pill.
  - `referenceCount` when present: `{n} other mixes` (muted) — the TrackId
    signal of how common the track is.
- **editing** — a small `Edit` button per row toggles the title/subtitle into
  two text inputs (artist, title) plus a label input; committing writes back
  through the `state.ts` edit action (§4). A `Delete` button removes the row.
  Editing is deliberately shallow: no drag-reorder in v1 (rows stay in detected
  order; a manual add appends and can be given a time by editing).

### 5.4 The two info cards

Both are plain `div.card`s at the foot of the screen, always present, purely
informational — no run, no key, no promise.

**Automatic full scan (on your computer):**

```
Automatic full scan (on your computer)
This app only shows what public sources already know about a mix — it never
listens to the audio. To identify every track yourself, run a full scan on
your computer with an open-source tool:

Tracklistify ›     → https://github.com/betmoar/tracklistify
SongRec ›          → https://github.com/marin-m/SongRec

They run off your phone and use Shazam to recognise the audio.
```

**Auto Shazam → Spotify:**

```
Auto Shazam
In Shazam on your phone, turn on "Sync to Spotify". A "My Shazam Tracks"
playlist then appears in Spotify — it shows up under Playlists here and syncs
like any other playlist.
```

## 6. Components and styles

No new dependency, no new shared component. Reused as-is: `TrackRow` (title,
subtitle, `spotifyUrl`, `badges`), `FeaturePills` (BPM/key), `SpotifyLink`
(search href). `Segmented`, `Filter`, `Empty`, `Badge`, `Progress` and the
`Banner` are **not** used — there is no view switcher (§8: one working list, not
three), the lookup shows a plain `<p class="muted">Looking up the mix…</p>`
rather than a `Progress` (there is no count to bar), and — crucially — **every
failure is shown inline** through `view.oembedError` / `view.trackidError` and
`mixState.error` (§4, §5.2), so the Mix screen raises **no `BannerMessage`** and
`visibleBanner`'s route-scope list is untouched. A per-layer error must sit
next to the layer that failed, which a global banner cannot do. Row provenance
is text, so the Crate's "never a new badge kind" discipline holds and
`styles.css` needs only three small additions:

```css
.mix-player { width: 100%; border: 0; border-radius: 8px; }
.list li.gap .title { color: var(--muted); font-style: italic; }
.mix .src { flex-basis: 100%; font-size: 0.8rem; color: var(--muted); }
```

`Mix.tsx` reuses the tap-target and list styles the other screens already have;
the URL input and the textarea reuse `.filter` / existing form styling. Buttons
are the standard 44px targets.

`src/ui/format.ts` gains one pure helper, tested in `format.test.ts`:

```ts
/** 44 -> '0:44'; 704 -> '11:44'; 11437 -> '3:10:37'. Under an hour: m:ss. */
export function formatClock(totalSeconds: number): string;
```

## 7. Tests

All in Vitest's Node environment, next to their source, no DOM or component
tests (CLAUDE.md). Every fetch function takes an injected `fetchFn`; **no test
touches the network.**

- **`features/mix/url.test.ts`** — `normalizeMixUrl` on: a plain permalink; a
  link with `?si=…` and `?utm_source=…` (query dropped); a `?in=user/sets/…`
  link (query dropped); `m.soundcloud.com` and `www.` (host rewritten); a
  trailing slash (stripped once); an **upper-cased path** (path preserved, host
  lowercased); a non-SoundCloud host → `null`; a bare `/user` profile → `null`;
  garbage that does not parse → `null`. Idempotence: `f(f(x)) === f(x)`.
- **`features/mix/oembed.test.ts`** (mocked fetch) — the request URL and its
  `encodeURIComponent`; a 200 mapped to `title`/`author`/`description`; the
  `playerSrc` extracted from `html` and kept, and a foreign-prefix src
  rejected to `null`; a 404 → `notFound`; a transport throw → `error`; a
  non-JSON body → `error`.
- **`features/mix/trackid.test.ts`** (mocked fetch) — **the guard**:
  `rowCount === 0` → `notFound`; `rowCount > 1` → `notFound` (never the first
  record); `rowCount === 1` with a mismatched `url` → `notFound`; the happy
  path reads the `slug` from the validated record and issues the detail call to
  `/audiostreams/<slug>`; the detail whose `result.url`/`slug` mismatches →
  `notFound`. **Span mapping**: the probe's fixture (`raw/architecture/tid-shonky.json`)
  → 18 identified rows; the **Apollonia** pair merges to one row; the **Pierre
  Codarin** pair stays two; gap rows appear for head/between/tail stretches
  ≥ 60 s and `durationSec` sets the tail; **the identified count is
  `rows.filter((r) => !r.gap).length` = 18 while the whole `rows` array is
  longer** (it also holds the gap rows); `trackCount` (16 in the list, 0 in the
  detail) never appears as the count; `timeHitRate` carried through; a
  `rowCount: 1` mix whose detail spans are `[]` → `ok` with `rows: []`.
- **`features/mix/parse.test.ts`** — all **six shapes** parse (numbered, bare,
  side-position, bracketed clock with one and two `H:` groups, bare offset with
  `:` and `.` separators, MixesDB `[42]`+trailing `[Label]`); all three dash
  characters; **the prefix-order pair** `1.30 Artist - Title` (start 90 s) vs
  `1. Artist - Title` (index, no time) from §3.5;
  `ID`/`?`/`unknown` kept as values; the **≥5-line run guard** (a
  block of 5 accepted; a block of **4 rejected** → no tracklist; blank lines
  inside a run are transparent; a prose line breaks the run); `parsePasted`
  accepts a 3-line list (`minRun` 1); the **link-out** line
  (`Full tracklist here: dkmn.tl/…`, `find the track list on thelotradio.com`)
  captured into `linkOut`, and a listing-plus-link keeps both; `parseDescription`
  strips HTML entities and `<br>`; `parseClock` on `1:00:30`, `0:00`, `11:44`,
  `1.02.30`, and the fractional `03:10:37.1910000` duration.
- **`features/mix/match.test.ts`** — `libraryTitleIndex` keys with
  `cleanTitle`/`primaryArtist`/`normalize`; `matchMixRow` hits a unique library
  track and returns its `playlistCount`; an ambiguous key (two ids) → `null`; a
  gap row and an `ID` row → `null` with no lookup; the memo returns the same
  Map for a repeated `Model`.
- **`features/mix/lookup.test.ts`** — `lookupMix` runs both arms; an oEmbed
  `error` with a TrackId `ok` still returns the TrackId rows (nothing hidden);
  both failing returns two error arms; never throws.
- **`db/repo.test.ts`** — a `mixes` round trip through `getMixes`/`putMix`/
  `deleteMix`; and **a version 3 database with playlists, tracks, features,
  identity and reach rows reopened at version 4 keeps every row and gains the
  `mixes` store** (mirroring the v2→v3 test, but asserting the new store through
  `getMixes()` since `getAllRows` does not read it).
- **`ui/format.test.ts`** — `formatClock` at 0, 44, 704, 3599, 3600, 11437.
- **Screens** — no unit tests, per convention. A browser walkthrough at review
  on the owner's real library: paste a known-in-corpus mix, a known-absent mix,
  and a mix whose description carries a tracklist; confirm the guard, the gaps,
  the library matches and the player comments.

## 8. Policy notes

**Rulings made while planning.**

- *Placement is a Settings card + a route, not a tab.* The tab bar is fixed;
  `#/mix` highlights Settings exactly as `#/import` does (`app.tsx` `tabOf`).
- *`mixes` is out of the aggregation `Model`.* Nothing but `Mix.tsx` reads it,
  and folding it into `getAllRows`/`buildModel` would rebuild the whole model
  on every mix save. The store is declared in `DjDb` and reached through three
  dedicated repo functions. Cost if wrong: a second read path.
- *The library match is computed live, never stored.* A resync changes the
  library, so a stored `trackId` would go stale; `FeaturePills` already resolves
  live. The index is memoised on `Model` identity, as `rankUnderTheRadar` is.
- *One working list, seeded — not a three-way view switcher.* `source` lives on
  the row and includes `manual`, so a switcher would silently discard the
  owner's edits. The richest layer seeds `mixRows`; the other layer is applied
  by an explicit, `confirm()`-guarded button; a paste replaces likewise.
- *The mix lookup does **not** join `jobsBusy()`* and does not call
  `loadFromDb()`: it writes no library store and rebuilds no model, so it
  clobbers nothing and needs no mutual exclusion with the five existing jobs. A
  reviewer will ask; this is the answer.
- *No worker* — two fetches on the main thread with awaits, as the reach run.
- *`ID`/`?`/`unknown` rows are inert* — kept as values, but no Spotify search
  and no library match, so the screen never searches Spotify for "ID ID".
- *Gap rows only where the timeline is known* — TrackId, using the list
  `duration` for the tail; the description has no `duration` field, so a parsed
  description never invents tail gaps.
- *Invented constants, labelled as such*: `MIX_MERGE_TOLERANCE_SEC = 5`,
  `MIX_GAP_MIN_SEC = 60` (the research's ≥60 s rule, §5.5), `MIN_RUN = 5` for a
  description / `1` for a paste (the research's ≥5-line guard, §4.4).

**Verified facts (this spec's probe, 2026-09-06, and research 2026-09-06).**

- oEmbed: `GET https://soundcloud.com/oembed?format=json&url=…` →
  `access-control-allow-origin: *`, 12 keys, **no `duration`**, player `html`
  an iframe with src prefix `https://w.soundcloud.com/player/`.
- TrackId list: `GET https://trackid.net/api/public/audiostreams?url=…` →
  origin reflected, `{ result: { audiostreams: [record], rowCount } }`, spans
  **empty** in this response.
- TrackId detail (**the spans endpoint, confirmed**):
  `GET https://trackid.net/api/public/audiostreams/<slug>` →
  `{ result: <record> }` (`result` *is* the record), with
  `detectionProcesses[].detectionProcessMusicTracks[]` whose fields are exactly
  `id, musicTrackId, startTime, endTime, artist, title, label, labelSlug,
  slug, referenceCount, isNew, accountMusicTrack`. `startTime`/`endTime` are
  `"HH:MM:SS"`, `duration` is `"HH:MM:SS.fffffff"`. `/audiostreams/<id>` and
  `/audiostreams/<id>/tracks` both return **404** — the endpoint is keyed by
  `slug`, from the validated list record.

**Rulings made while implementing.** Recorded here because each differs from,
or resolves a gap left open by, the sections above.

- _`on.soundcloud.com` short links resolve to `null`, with no owner note_
  (§3.1). This was the design's one `(to confirm at implementation)` point. The
  host allowlist already excludes the short-link host, and expanding it would
  need a redirect `normalizeMixUrl` cannot follow cross-origin, so the lean
  rule takes the smallest thing that works: the `error` state
  (`That is not a SoundCloud track link.`) already tells the owner to paste the
  mix's page link. Cost if wrong: an owner who pastes a short link is told it is
  not a track link rather than being helped to expand it; revisit only if it
  recurs.
- _The paste box reports its outcome so the screen can render §4's "gentle
  inline note"_ (§4, §5.2). `applyPastedTracklist` returns
  `'added' | 'linkOnly' | 'empty'` rather than `void`, and the Mix screen holds
  that in local state to show a muted note beside the paste box for a link-only
  or empty paste. A new `mixError` signal (never a `BannerMessage`, so §6 holds)
  carries a rejected `putMix`/`deleteMix`/`getMixes`, rendered inline — the two
  surfaces §6 did not enumerate, added so nothing is swallowed. Cost if wrong: a
  second inline channel on one screen.

**Terms and privacy.**

- **TrackId.net** publishes **no terms of use** at any probed URL (research §3,
  §8 Q4); a privacy policy exists and is silent on the API, and the endpoints
  are under `/api/public/`. Using it as the default read path is a decision the
  owner takes, the same standard the 2026-09-05 artist-reach research applied to
  Discogs. Recorded as the owner's call, not a finding.
- **SoundCloud oEmbed** is advertised by SoundCloud in every track page's
  `<head>` (research §2), public metadata, no audio, no fingerprint — the
  cleanest route here.
- **The embedded player** carries a small, non-zero terms note: SoundCloud's
  User Terms ask written consent to embed Content on a destination "dedicated to
  a genre or artist", and reserve the right to block widget use (research §2
  row 6). The app embeds only the mix the owner pasted, in a personal tool; the
  player degrades to "no player" if the iframe is blocked.
- **Privacy**: the only thing that leaves the browser is the pasted
  (normalised) SoundCloud URL — to `soundcloud.com` (oEmbed) and `trackid.net`.
  No token, no Spotify id, no library and no listening history is ever sent. The
  player iframe loads from `w.soundcloud.com` as any embed does. Saved mixes
  live only in this browser's IndexedDB.

**Off-app routes, stated so they are not re-proposed as app features** (research
§2, §5): audio fetch (origin allowlist, verified), fingerprinting in the browser
(purpose clauses bind any machine), AudD/ACRCloud (spendable key cannot live in
a public bundle; a Worker adds a second setting and a paid plan), MixesDB /
1001Tracklists scraping (offline / no CORS / Turnstile — link out only). The
honest full-audio path is the owner's own computer (§5.4), which is exactly what
the two info cards point at.
