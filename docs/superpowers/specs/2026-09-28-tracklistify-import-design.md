# Import a Tracklistify JSON tracklist: design

Date: 2026-09-28. Status: draft for the owner to review before any code.
Builds on `2026-09-06-mix-tracklist-design.md` (the Mix screen, the `mixes`
store, `MixRow`/`TracklistRow`, `hasManualRows`/`editTracklistRow`) and
`2026-09-06-mix-playlist-design.md` (`spotifySearch.ts`, `createPlaylist.ts`,
`startCreatePlaylist`, the `post` client method — all reused **unchanged**
except the one addition in §6). Platform research
`../research/2026-09-04-spotify-platform-research.md` line ~58 confirms
`GET /search` still supports the `isrc:` field filter.

Owner decisions folded in (2026-09-28, binding):

1. **Standalone import — no SoundCloud link required.** A Tracklistify scan is
   run on the owner's computer against any local audio file (not necessarily
   ever posted to SoundCloud), so the import cannot depend on a link. It joins
   the existing saved-mixes list as its own kind of entry.
2. **No real Spotify folders.** The Web API has no folder concept at all — not
   even readable, let alone settable. The created playlist's **name** carries a
   `tracklistify/` prefix instead, so same-sourced playlists at least sort and
   group together in the owner's list; nothing more is attempted.
3. **No dedup, no confidence threshold.** Rows import exactly as Tracklistify
   reports them (including a track played twice), and at whatever confidence
   Tracklistify gave. The existing per-row Delete button is how the owner
   prunes — no new logic.

## 1. Goal

The owner already runs Tracklistify on their computer to Shazam-scan a local DJ
set; `InfoCards` on the Mix screen already links to it as the recommended tool.
Today the resulting `tracklist.json` goes nowhere: this feature imports it,
producing the same **reviewable, editable `TracklistRow[]` list** the SoundCloud
lookup and TrackId already produce, so it flows into the **existing**
"Create playlist from mix" job with no change to that job's matching or
creation logic beyond one accuracy improvement (§6).

**In scope:** a new file picker on the Mix screen; a pure parser,
`src/features/mix/tracklistify.ts`; a `startTracklistifyImport` wrapper in
`src/model/state.ts`; two new optional `TracklistRow` fields (`confidence`,
`isrc`); one new `MixRowSource` value; an optional `tracklistify` flag on
`MixRow`/`MixView.sources`; an ISRC-first Search query in `spotifySearch.ts`;
a handful of `Mix.tsx` touchpoints so the existing SoundCloud-only assumptions
(a real URL always exists) don't silently mis-render a Tracklistify mix.

**Out of scope, stated so it is not re-litigated:** real Spotify folders
(impossible via the API); a confidence threshold or auto-dropping low-confidence
rows; deduplicating repeated tracks; an editable playlist-name box (the
SoundCloud flow has none either — stay consistent); parsing `tracklist.m3u`
(the JSON already carries everything the m3u does, plus metadata); any audio
(the app still never fetches or analyses mix audio).

## 2. The Tracklistify JSON shape

Learned from two real `tracklist.json` files the owner produced (fixtures for
§8's tests come from these, trimmed):

```jsonc
{
  "mix_info": {
    "title": "pi⧸live: Hannah D, Pjenne & Ed Kent b3b all night long @ Miscellania 06-06-2026 [2393242113]",
    "artist": "Unknown artist",       // always this literal string in both samples — never used
    "audio_filename": "pi⧸live: Hannah D, Pjenne & Ed Kent b3b all night long @ Miscellania 06-06-2026 [2393242113].m4a"
    // date, track_count, total_duration also present, all unused
  },
  "tracks": [
    {
      "song_name": "Noble Booth",
      "artist": "Stefan Gubatz",
      "time_in_mix": "00:00:00",      // always "H:MM:SS" / "HH:MM:SS" — parseClock already parses this
      "confidence": 86.11812625600001, // 0-100, float
      "duration": null,                // always null in both samples — unused
      "metadata": {
        "isrc": "DECH62001634",        // present on ~85% of tracks in the samples, absent on the rest
        "album": "Fliester Dubs - EP", // unused
        "label": "Primary Colours",    // maps to TracklistRow.label
        "release_date": "2025",        // unused
        "genres": ["Electronic"],      // unused
        "shazam_id": "825039928",      // unused — the app links out to Spotify search, not Shazam
        "apple_music_id": "1815207694",// unused
        "artwork_url": "https://…",    // unused — TrackRow shows no art anywhere in this app
        "links": { "shazam": "…", "spotify_search": "…", "deezer_search": "…" } // unused — searchUrl already builds this app's own Spotify search link
      }
    }
    // … one object per identified track, in mix order; a track can repeat (a genuine replay or a beatmatched transition)
  ]
}
```

Two things worth flagging explicitly:

- **`mix_info.title` is filename-derived and can be messy** — Tracklistify's
  own output-folder naming embeds a trailing id from whatever tool the owner
  used to obtain the audio (`[2393242113]` in one sample, `-96525389` with no
  brackets at all in the other). There is no reliable general rule to strip
  this across arbitrary downloader conventions, so it is **not** stripped (§5).
  It also encodes a literal `/` as `⧸` (U+29F8, filesystem-safe) — that **is**
  always safe to reverse and is fixed at parse time.
- **No Spotify id anywhere**, only a plain-text `spotify_search` URL (unused —
  the existing `searchUrl` in `Mix.tsx` already builds an equivalent link from
  `row.artist`/`row.title`). Matching still goes through Search (§6).

## 3. Data model — three additions, no `DB_VERSION` bump

Each is an **optional** field, so old stored `MixRow`s (which won't have them)
still read back and type-check — the same pattern `MixRow.playlistUrl?` already
uses (`schema.ts`).

```ts
// schema.ts
export type MixRowSource =
  | 'trackid'
  | 'description'
  | 'pasted'
  | 'manual'
  | 'tracklistify';

export interface TracklistRow {
  // … existing fields unchanged …
  /** Tracklistify's 0-100 match confidence for this row, or absent/null for
   *  every other source and for rows from an older import. Display only —
   *  no threshold filters on it (owner decision 3). */
  confidence?: number | null;
  /** ISRC from Tracklistify's metadata, when present, else null. Used by
   *  spotifySearch.ts to try an exact-recording Search query first (§6). */
  isrc?: string | null;
}

export interface MixRow {
  // …
  sources: {
    trackid: boolean;
    description: boolean;
    pasted: boolean;
    linkOut: string | null;
    /** True for a mix whose working list came from a Tracklistify import.
     *  Absent (not false) on every row saved before this feature and on
     *  every SoundCloud-origin mix — the sole "where did this mix come
     *  from" discriminator; read as `=== true`, never as `!== false`. */
    tracklistify?: boolean;
  };
}
```

`MixView.sources` (`state.ts`) is already typed as `MixRow['sources']`, so the
new field arrives there for free — no separate declaration. `openMix`,
`saveMix` and `startCreatePlaylist` already copy `sources` as a whole object in
both directions, so no code change is needed at those call sites either.

## 4. The save key, since there is no URL

`MixRow.url` (`keyPath: 'url'`) is always a real link today. For a Tracklistify
import it becomes the synthetic string `` `tracklistify:${mix_info.audio_filename}` ``
— stable per source audio file (so re-running Tracklistify on the same file and
re-importing **updates** the existing saved mix, exactly like "Look up again"
does for a SoundCloud mix, rather than creating a duplicate saved entry), and
never shown to the owner directly (the screen always shows `title`, never
`url`). `mix_info.audio_filename` is required for this reason — the parser
errors (§5) if it or `mix_info.title` is missing, rather than inventing a
fallback key for a shape neither real sample produced.

`isShortLink(row.url)` (called from `openMix`) returns `false` for this key,
same as for any non-`on.soundcloud.com` string — no change needed there.

## 5. The parser — `src/features/mix/tracklistify.ts` (pure, never throws)

```ts
export type TracklistifyImport =
  | {
      status: 'ok';
      url: string;    // the synthetic tracklistify:<audio_filename> key
      title: string;  // mix_info.title with ⧸ restored to /
      rows: TracklistRow[];
    }
  | { status: 'error'; message: string };

export function parseTracklistifyJson(text: string): TracklistifyImport;
```

Steps, all defensive since this is an owner-supplied file:

1. `JSON.parse(text)` — a `SyntaxError` → `{ status: 'error', message: 'That
   is not a JSON file.' }`.
2. Validate the shape needed: `mix_info.title` and `mix_info.audio_filename`
   are non-empty strings, and `tracks` is an array. Any miss →
   `{ status: 'error', message: "That doesn't look like a Tracklistify
   tracklist.json." }`.
3. Build `url` and `title` (§4; the `⧸` → `/` replace happens here, once, so
   every downstream read — the saved-mixes list, the playlist name — is
   already clean).
4. Map `tracks[]` to `TracklistRow[]`, **skipping** (not failing on) any entry
   whose `song_name` or `artist` is missing/empty — one bad entry does not
   sink the import, matching `parseTrackLine`'s existing per-line leniency in
   `parse.ts`. For a kept entry:
   - `artist: track.artist`, `title: track.song_name` (trimmed).
   - `startSec: track.time_in_mix ? parseClock(track.time_in_mix) : null` —
     `parseClock` already handles `"H:MM:SS"`/`"HH:MM:SS"`; an unparseable
     string degrades to `null`, not a failure.
   - `endSec: null`, `gap: false` (Tracklistify reports identified spots only,
     no `ID`/unidentified spans).
   - `label: track.metadata?.label ?? null` — the one `metadata` field with an
     existing home on `TracklistRow`.
   - `confidence: typeof track.confidence === 'number' ? track.confidence : null`.
   - `isrc: typeof track.metadata?.isrc === 'string' ? track.metadata.isrc : null`.
   - `source: 'tracklistify'`, `detected: { artist, title }`,
     `referenceCount: null` (TrackId-specific; not applicable here).
5. If **zero** rows survive step 4 (every entry was malformed, or `tracks` was
   empty), `{ status: 'error', message: 'No tracks found in that file.' }`.

**Test fixtures** are the owner's two real files (trimmed to a handful of
tracks each), specifically including the sparse-metadata rows — "Pep A Cat Up"
and "Phoenix (Roelbeat Remix)" (`shazam_id`/`links` only, no `isrc`/`album`/
`label`), and "Katerina" (no `isrc`, has everything else) — so the "missing
`metadata` sub-fields degrade to null, not a crash" behaviour is pinned, not
just asserted for the common case.

## 6. Import entry point — `src/model/state.ts` + `src/ui/Mix.tsx`

**UI.** A file picker beside the existing SoundCloud-link form, following the
Rekordbox-XML picker's exact pattern (`Settings.tsx`):

```tsx
<label class="file">
  <span>Or import a Tracklistify tracklist.json</span>
  <input type="file" accept=".json,application/json" onChange={onJson} />
</label>
```

```ts
const onJson = (event: Event) => {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) void startTracklistifyImport(file);
};
```

No worker: a mix's `tracklist.json` is at most a few hundred KB (tens of
tracks), read on the main thread with `file.text()` — unlike the Rekordbox XML
path (a whole collection), there is no case for offloading this.

**Wrapper** (parallel to `startMixLookup`, same guard shape):

```ts
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

`REPLACE_WITH_TRACKLISTIFY` is a new string constant alongside the existing
`REPLACE_WITH_*` ones: `'Importing this file replaces the current tracklist,
including your edits. Continue?'`.

Parse/read failures use the **general** `mixError` channel — not `MixState`'s
`error` arm, whose existing comment reserves it for exactly one message ("that
is not a SoundCloud link"); reusing it here would either violate that or
require a second, unrelated message down the same narrow arm. `mixError` is
already the codebase's catch-all for "something failed that isn't a banner and
isn't that one link-shape error" (storage failures today; this is the same
kind of failure).

Saving (`saveMix`) and reopening (`openMix`) need **no changes** — both already
copy `view`/`row` fields generically, including `sources` as a whole object, so
the new `tracklistify` flag rides along for free.

## 7. Track resolution — one addition to `spotifySearch.ts`

When a row carries an ISRC, `searchTrack` tries it **first**, still through
the existing `pickMatch` accept rule — never trusted blindly, so "never add a
wrong track" (the mix-playlist spec's central invariant) holds even if
Spotify's `isrc:` index is imperfect or the row's artist text is spelled
differently from Spotify's credit:

```ts
export async function searchTrack(
  client: Pick<SpotifyClient, 'get'>,
  row: TracklistRow
): Promise<RowMatch> {
  if (!isIdentified(row)) return { row, uri: null, matchedName: null };
  const artist = stripQuotes(primaryArtist(row.artist));
  const title = stripQuotes(row.title);
  const queries = [
    ...(row.isrc ? [`isrc:${row.isrc}`] : []),
    `artist:"${artist}" track:"${title}"`,
    `${row.artist} ${row.title}`,
  ];
  for (const q of queries) {
    // unchanged: GET /search, pickMatch(row, items), return on first hit
  }
  return { row, uri: null, matchedName: null };
}
```

A row with no `isrc` (any non-Tracklistify row, or a Tracklistify row whose
`metadata` lacked one) runs exactly the two queries it runs today — no
behaviour change for the existing SoundCloud/TrackId/pasted paths.

## 8. Playlist naming — one branch in `startCreatePlaylist`

```ts
const rawTitle = (view.title ?? 'Mix tracklist').trim() || 'Mix tracklist';
const name = (
  view.sources.tracklistify ? `tracklistify/${rawTitle}` : rawTitle
).slice(0, 100);
const description = (
  view.sources.tracklistify
    ? `From a Tracklistify scan · via DJ Data`
    : `From ${view.url} · via DJ Data`
).slice(0, 300);
```

Fully automatic, like the existing flow — no name-editing box (owner decision:
stay consistent with the SoundCloud path, which has none either). The
`⧸` → `/` fix already happened in the parser (§5), so `rawTitle` is clean;
the odd trailing `[id]`/`-id` suffix some source filenames carry is **not**
stripped (§2) — renaming in Spotify afterward is always available.

## 9. Other `Mix.tsx` touchpoints

Four small, easy-to-miss spots that assume a real, navigable URL or a fixed
`MixRowSource` set:

- **`sourceLabel`** (currently an if-chain ending in "edited"/"added" — a new
  `source` value would silently fall through to "edited" and TypeScript would
  not catch it): add `if (row.source === 'tracklistify') return 'Tracklistify';`
  before the fallback.
- **`provenanceLine`**: append `` `${Math.round(row.confidence)}% match` `` to
  the parts array when `row.confidence != null` — same generic pattern already
  used for `referenceCount`, so it composes with the "Tracklistify" source
  label automatically (e.g. "Tracklistify · 87% match").
- **`Provenance`'s `foundSomething`/`nothingFound`**: fold `view.sources
  .tracklistify` into the `foundSomething` OR-chain (else a Tracklistify-only
  view wrongly prints "Nothing found automatically"), and add one caption line
  parallel to the existing TrackId one: `From Tracklistify · {plural(count,
  'track')}` when true.
- **`Mix()`'s URL-input `useEffect`** (`setUrl(viewUrl)` on every ready view):
  guard it on `!state.view.sources.tracklistify`, so opening a Tracklistify mix
  never stuffs the synthetic `tracklistify:…` key into the "Paste a SoundCloud
  mix link" box. Same guard on the submit button's label (`'Look up again'` vs
  `'Look up'`) — it should read `'Look up'` for a Tracklistify-origin view,
  since there is nothing to look up again.

`Ready`'s player (`view.playerSrc !== null`) and the "Replace with the
description tracklist" button (`view.descriptionRows.length > 0`) are already
correctly gated by existing nullable/empty checks — a Tracklistify view sets
both to their empty form (§6), so neither needs a new guard.

## 10. Tests

- **`tracklistify.test.ts`** (pure, fixtures from §5):
  - Full parse of a trimmed real file: row count, `startSec` values, `label`,
    `confidence`, `isrc` all correct; `url`/`title` built correctly including
    the `⧸` → `/` fix.
  - Sparse-metadata rows (no `isrc`/`album`/`label`) degrade to `null` fields,
    not a crash.
  - Malformed JSON → `error`, message names the problem.
  - Valid JSON, wrong shape (`tracks` missing or not an array) → `error`.
  - One malformed track entry (empty `song_name`) among otherwise-good ones →
    that entry dropped, the rest imported.
  - Every entry malformed → `error`, "No tracks found in that file."
- **`spotifySearch.test.ts`**: add one case — a row with `isrc` set sends
  `isrc:<code>` as the **first** query; if that query's results fail
  `pickMatch` (wrong artist), the existing field/plain queries still run
  (never trusted blindly). Existing cases (no `isrc`) are unchanged and stay
  green, pinning "no behaviour change for non-Tracklistify rows."
- **`state.ts`**: no unit tests, same reason as `startMixLookup`/
  `startCreatePlaylist` (imports the browser singletons). Verified by
  `yarn typecheck` + `yarn build` + a manual walkthrough: pick a
  `tracklist.json` on the Mix screen → rows appear with confidence shown →
  edit/delete a row → Create playlist from mix → playlist named
  `tracklistify/<title>` appears in Spotify; re-import the same file → the
  same saved-mix entry updates rather than duplicating.

## 11. Policy notes

- **No real folders — a naming convention only.** Stated once so it is not
  re-raised: the Spotify Web API exposes no folder concept whatsoever. The
  `tracklistify/` name prefix (§8) is the entire accommodation.
- **A wrong track is never added.** The ISRC-first query (§7) is an
  *accuracy* improvement layered on the existing strict `pickMatch` rule, not
  a bypass of it — the mix-playlist spec's central invariant is unchanged.
- **Nothing is swallowed.** A bad file, an unreadable file, or a JSON with no
  usable tracks all surface through `mixError`, inline on the Mix screen —
  same channel and same "no banner on this screen" rule the existing storage
  failures already use.
- **No audio anywhere.** This feature reads a JSON file the owner's own tool
  already produced; the app itself still never fetches or analyses audio.

---

### Open points and the assumptions taken

1. **`mix_info.audio_filename` and `.title` are required.** Both real samples
   have them; no fallback key is invented for a shape neither sample produced
   (§4). If a future Tracklistify version omits them, the import fails with a
   clear message rather than guessing a key that could collide.
2. **Playlist-name cap (100 chars) reused from the existing flow**, now with a
   12-character `tracklistify/` prefix eating into it — not reprobed here; the
   mix-playlist spec already notes this cap is a defensive guess, not a
   measured Spotify maximum.
