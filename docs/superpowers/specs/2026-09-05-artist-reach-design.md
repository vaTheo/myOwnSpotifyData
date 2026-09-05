# Artist reach: design

Date: 2026-09-05. Status: owner authorised a first version, to be tried
before any merge. Builds on `2026-09-04-spotify-dj-webapp-design.md`,
`2026-09-04-crate-history-views-design.md` and `2026-09-05-bpm-key-design.md`
(this spec assumes that feature's `DB_VERSION` 2 has landed).
Research: `../research/2026-09-05-artist-reach-sources.md`.

## 1. Goal

The owner wanted the artists in their playlists ranked by how well known they
are, so they can tell an artist nobody has heard of from one everybody plays.
Spotify itself will no longer answer that: `GET /artists/{id}` no longer
returns `followers` or `popularity` for a Development Mode app (research §1).
Two free, keyless replacements survive every gate and are callable from
`https://vatheo.github.io`: **ListenBrainz** `total_user_count` (how many
ListenBrainz users have ever played the artist) and **Deezer** `nb_fan` (how
many Deezer users pressed follow). Both are small, platform-specific
audiences, not Spotify monthly listeners, so this app says *ListenBrainz
listeners* and *Deezer fans* and never anything else. It shows them side by
side and never sums them: across the 276 pairs of the research's 24-artist
sample the two order 19.9% of pairs in opposite directions (Kendall tau-a
0.601), so a blended "fame score" would be a fiction (research §3).

So this is **a filter, not a ranking**. No free source orders the underground
tail, and the two that cover it disagree. What can be done exactly is
*subtract the demonstrably famous*: Wikidata is keyed on the Spotify artist id
itself (P1902), is CC0, and costs a handful of batched requests for the whole
library (§3.2), and Wikipedia pageviews describe whoever it finds (research
§4.1). Artists with a real public profile — an article in any language — are
grouped at the bottom under a **Well known** heading with a plain line saying
why, never hidden, because the app is not confident enough to hide anything.
Everyone else is listed with both audience numbers and with the owner's own
data beside them (tracks, playlists, plays from the imported history), which is
the half of the question that needs no external source at all. Out of scope for
this version: any single blended score, a reach number on track rows, artist
images, Last.fm, Discogs, and any source that needs a secret or a paid tier
(research §5).

## 2. Data

### The universe, and the gate

**Candidates are the artists who appear in the owner's synced playlists with a
Spotify id.** `model.artists` is built inside the loop over `rows.entries`
(`src/model/aggregate.ts:67-99`), so an artist the owner played heavily but
never saved to a playlist is not in this feature at all: not a candidate, not
in the coverage denominator, and contributing no plays. Artists known only by
name are equally out of scope — `artistKey` falls back to `name:<normalized>`
for them and no source in this design can be keyed on a name (§3). One
consequence to keep in mind when reading the list: the plays column is *"plays
of the tracks you saved"*, not *"plays of this artist"*.

**The gate is `artistReachSummary.version === 1`** — never sniffing rows, the
same rule the Crate uses on `historySummary.version === 2`. Every screen in §5
that hides something before the first run reads exactly that test and nothing
else.

### `DB_VERSION` 3, two new stores

The `upgrade` callback keeps its guarded shape (`db.objectStoreNames.contains`),
so a version 2 database keeps every playlist, track, play and feature row and
gains the two stores. `disconnect` needs no change: `wipeDb` deletes the whole
database.

The three unions are declared once, here, and used everywhere else by name:

```ts
/** How far a per-artist identity step has got. 'unchecked' is the initial state. */
export type ResolveStatus = 'unchecked' | 'ok' | 'notFound' | 'retryLater';

/** The three sources that produce a stored number, i.e. `ArtistReachRow.source`. */
export type ReachSource = 'listenbrainz' | 'deezer' | 'wikipedia';

export type ReachStatus = 'ok' | 'notFound' | 'retryLater';
```

```ts
/** New store `artistIdentity`, keyPath 'artistId'. */
export interface ArtistIdentityRow {
  /** Spotify artist id; the only key any lookup starts from. */
  artistId: string;
  /** Spotify's name, kept so a run can verify what a source echoes back. */
  name: string;
  mbid: string | null;
  mbidStatus: ResolveStatus;
  qid: string | null;
  qidStatus: ResolveStatus;
  /** Wikidata `wikibase:sitelinks`, all languages; null until Wikidata answered. */
  sitelinks: number | null;
  /** Article path segments exactly as the sitelink spells them, or null. */
  wikiTitles: { en: string | null; fr: string | null };
  deezerArtistId: number | null;
  /** The name Deezer echoed, kept as the record of what §3.3's check accepted. */
  deezerName: string | null;
  deezerStatus: ResolveStatus;
  /** When the row was last written; the one clock §4.5's retry rules read. */
  resolvedAt: number;
  /** Epoch ms before which a 'retryLater' step must not be asked again. */
  retryAfter: number | null;
}
```

```ts
/** New store `artistReach`, keyPath 'key' = `${artistId}|${source}`. */
export interface ArtistReachRow {
  key: string;
  artistId: string;
  source: ReachSource;
  status: ReachStatus;
  /**
   * listenbrainz: total_user_count. deezer: nb_fan.
   * wikipedia: en + fr views over the last 12 complete months.
   * null unless status is 'ok'.
   */
  value: number | null;
  /**
   * listenbrainz fills `listens` (total_listen_count), kept so a later version
   * can show listens per listener without re-fetching a source paced at one
   * request per second; wikipedia fills `en`, `fr` and `months`; deezer fills
   * nothing. All optional so a source can gain a field without a version bump.
   */
  extra?: { listens?: number; en?: number; fr?: number; months?: number };
  fetchedAt: number;
  /** Epoch ms before which a 'retryLater' row must not be asked again. */
  retryAfter: number | null;
  /** The exact URL the number came from, kept as provenance. */
  sourceUrl: string;
}
```

Two fields beyond the cache sketch in research §4.3 are load-bearing:
`qidStatus` and `deezerStatus`, because `qid: null` and `deezerArtistId: null`
otherwise cannot be told apart from "not asked yet". There is a single
timestamp per identity row, `resolvedAt`, rather than one per step. The
coupling is benign in practice: MusicBrainz is phase 1, so it always reads
`resolvedAt` before any later phase can rewrite the row; Deezer never rewrites
an identity row once `deezerArtistId` is `ok`, because a refreshed `nb_fan`
goes into an `artistReach` row with its own `fetchedAt`; and an `unchecked`
QID enters Wikidata's pass 1 whatever the stamp says. The only combination
that loses a cycle is a stale `notFound` QID on a row MusicBrainz rewrote
earlier in the same run, and the next run picks it up.

`DjDb` (`src/db/schema.ts:140-148`) — the typed store map `openDB<DjDb>` is
parameterised on — gains `artistIdentity: { key: string; value:
ArtistIdentityRow }` and `artistReach: { key: string; value: ArtistReachRow }`;
without them `db.createObjectStore('artistIdentity', …)` and every
`tx.objectStore('artistReach')` fail to type-check. `AllRows` gains
`artistIdentity: ArtistIdentityRow[]` and `artistReach: ArtistReachRow[]`;
`getAllRows` reads both stores in its one transaction. `repo.ts` gains
`putIdentities(rows)` and `putReach(rows)`, both shaped like the existing
`putFeatures` (`src/db/repo.ts:141-147`). No getter is added: `getAllRows`
already reads both stores, and §5.6 hands the run the model's own arrays
rather than re-reading IndexedDB.

The two row types and the three unions above (`ResolveStatus`, `ReachSource`,
`ReachStatus`) live in `db/schema.ts`.

Meta row, read on load and written at the end of **every** run — including one
that ends in the error state, and one in which every source paused. It must be,
because §2's gate is this record: a first run that wrote a few hundred rows and
then failed would otherwise leave the gate closed and the pre-run card on
screen, hiding the checkpoints it did produce. `runReach` writes it as its last
act on every exit path, before reporting `done` or `error`.

```ts
export const ARTIST_REACH_SUMMARY_META = 'artistReachSummary';

export interface ArtistReachSummary {
  version: 1;
  ranAt: number;
  /** Candidates: artists with a Spotify id in the owner's playlists at run end. */
  artists: number;
  /** Candidates with at least one `ok` reach row in any source. */
  covered: number;
  /** Identities with an MBID (`mbid !== null`). */
  resolved: number;
  /** `artistReach` rows with status 'ok' for that source. */
  listenbrainz: number;
  deezer: number;
  /** Identities with at least one Wikipedia sitelink title (`wikiTitles.en` or `.fr`). */
  wikipedia: number;
  /** Identities for which `isWellKnown` is true (`sitelinks >= 1`). */
  wellKnown: number;
  /** Sources that gave up mid-run; `ReachStep` and the rule are in §4. */
  paused: ReachStep[];
}
```

**Every count in that record describes the whole store at `ranAt`, not the
run's own work.** The Settings coverage line (§5.5) shows the same seven
counts computed live from the model, using these exact definitions, through
one type that shares the record's field list — the same relationship the
existing `Coverage` interface has with the Audio data card:

```ts
/** `reachCoverage(m)`'s result; every field is defined exactly as above. */
export type ReachCoverage = Omit<
  ArtistReachSummary,
  'version' | 'ranAt' | 'paused'
>;
```

The summary stores those numbers at `ranAt` for provenance and for the
`as of` date, and nothing else reads them. What *this run* did is a separate,
in-memory line with deliberately different wording, defined in §4.2 and drawn
in §5.5. `covered` earns its place as a stored field rather than a derived one
so that `reachCoverage`'s output and this record hold an identical set of
numbers; a coverage line whose leading figure had no counterpart in the record
is exactly the seam that made the two lines readable as the same quantity.

Two invariants fall out of the definitions and are worth stating, because a
mock that breaks either is wrong: `covered <= artists`, and
`wellKnown >= wikipedia` (an en or fr sitelink title implies at least one
sitelink).

`ArtistReachSummary` and `ReachStep` live in `src/features/reachRun.ts` beside
the run that writes them, as `ImportSummary` lives in `history/importer.ts`.

### Model additions (`src/model/aggregate.ts`)

`Model` gains `identities: Map<string, ArtistIdentityRow>` (by `artistId`) and
`reach: Map<string, ArtistReachRow>` (by the row's own composite `key`), both
built in `buildModel` from the new `AllRows` arrays. No other aggregation
changes.

### Pure helpers (`src/model/reach.ts`)

```ts
/** One sitelink in any language is enough; `null` fails. */
export const WELL_KNOWN_MIN_SITELINKS = 1;

export interface Reach {
  listenbrainz: ArtistReachRow | undefined;
  deezer: ArtistReachRow | undefined;
  wikipedia: ArtistReachRow | undefined;
}

export function reachFor(model: Model, artistId: string): Reach;
export function isWellKnown(identity: ArtistIdentityRow | undefined): boolean;

/** True once any history has been imported; §5.3's subtitle reads it too. */
export function hasHistory(m: Model): boolean;

export type ReachSort = 'plays' | 'listeners' | 'fans';
export type ReachGroup = 'radar' | 'unknown' | 'known';

export interface UnderRadarRow {
  agg: ArtistAgg;
  artistId: string;
  group: ReachGroup;
  rank: number;
  tracks: number;
  playlists: number;
  /** Sum of playsFor over the artist's tracks; 0 when no history is loaded. */
  plays: number;
  /** null means unknown, never zero. */
  listeners: number | null;
  fans: number | null;
  views: number | null;
  sitelinks: number | null;
}

export function rankUnderTheRadar(
  model: Model,
  sort: ReachSort
): UnderRadarRow[];
```

`reachFor` is three map reads. A row counts as a number only when
`status === 'ok'` and `value !== null`; anything else reads as unknown.
`hasHistory(m)` is `m.plays.length > 0`, named once here because `model.plays`
includes rows with no credited play (`src/model/aggregate.ts:44`, and the
`p.plays === 0` guard at `:124`) and both §2's sort fallback and §5.3's
subtitle must ask the same question.

**The "well known" rule.** `isWellKnown` is true when the identity's
`sitelinks` is a number and is at least `WELL_KNOWN_MIN_SITELINKS` (1) — the
artist's Wikidata item carries at least one Wikipedia article, in any
language. `null` sitelinks fail, and so does 0. Nothing else enters the test:
not the view count, not the number of languages.

Justification, one line from research §3's table: the only sampled item with 0
sitelinks is Palms Trax, who at 943 ListenBrainz listeners is not well known,
and every sampled artist who does have an article carries a Wikidata item that
somebody wrote an encyclopedia entry about — which is all this app is
competent to assert. Anything above that line starts discriminating between
artists the app has no business ranking: the sitelink count compresses at the
bottom (Anz 1, Shanti Celeste 3, Overmono 4) and the view count measures
curiosity rather than reach (Kettama's single-sitelink article draws 119,770
views a year, more than FISHER's English count). Anz remains the borderline —
1 sitelink, 1,012 ListenBrainz listeners, 703 Deezer fans, genuinely small —
and lands under Well known, which is safe precisely because **Well known is a
heading at the bottom of the same list, never a filter that removes rows.**
Because the rule is one clause on one field, `isWellKnown` takes the identity
alone; the `Reach` interface stays, since `reachFor` still returns it and the
row lines in §5 still read all three sources.

The Wikipedia pageviews phase (§4.4) is kept, but **only to inform the
public-profile line** — `Wikipedia · 3 languages · 14k views/yr` — never the
grouping. If that phase pauses or has nothing for an artist, the line simply
loses its views part and no artist changes group.

**`rankUnderTheRadar`.** One pass over `model.artists`, keeping only those
with `id !== null`. Per artist: `tracks` is `agg.trackKeys.size`, `playlists`
is `agg.playlistIds.size`, `plays` is the sum of
`playsFor(model, track)?.plays ?? 0` over the artist's tracks — `playsFor`
returns `PlaysInfo | null` (`src/model/aggregate.ts:151-167`), so the `?? 0` is
required for the expression to type-check. The work is `Σ |artists per track|`
across the library — linear in the library's artist credits, roughly two to
three times its track count, not one pass.

**Memoised.** `rankUnderTheRadar` keeps a module-level one-entry memo keyed on
the `Model` object identity and the `ReachSort` value; the same pair returns
the same array. This is what makes §5.3's filter cheap: `UnderRadar` may call
it straight from its render body, and a keystroke then costs one `includes`
per row and no re-sort. The model identity only changes when `loadFromDb`
rebuilds it, which is exactly when the ranking must be recomputed.

Groups, assigned before sorting:

| Group | Rule |
| --- | --- |
| `known` | `isWellKnown` is true — checked first, so a famous artist lands here whether or not a reach number was fetched |
| `radar` | not well known and at least one of ListenBrainz / Deezer is a number |
| `unknown` | not well known and neither is a number |

Output order is `radar`, then `unknown`, then `known`; each group is sorted
independently by `sort`:

- **`plays`** (default): `plays` descending. Tie-breaks: `tracks` desc,
  `playlists` desc, `agg.name.localeCompare(other.agg.name)` ascending,
  `artistId` ascending (a total order, so the list never reshuffles between
  renders). When `hasHistory(model)` is false, every artist's sort key is
  `tracks` instead, with the same tie-break chain minus its first step. The
  fallback is per model, not per artist: "plays from the imported history when
  present, else saved-track count" reads on *the history*, and switching units
  row by row would compare 12 plays against 12 tracks in one column.
- **`listeners`**: ListenBrainz ascending, `null` last (a missing number is
  not a small one). Tie-breaks: `fans` asc with null last, `plays` desc, then
  the `agg.name` / `artistId` chain.
- **`fans`**: Deezer ascending, `null` last. Tie-breaks: `listeners` asc with
  null last, `plays` desc, then the `agg.name` / `artistId` chain.

`rank` is `index + 1` over the whole returned list and **runs on across the
group headings** — row 1 to row N, one numbering — matching the Artists tab's
existing rule that the rank comes from the unfiltered list so the text filter
never renumbers anything.

## 3. Identity resolution

Everything starts from the Spotify artist id the app already holds in
`TrackRow.artists[].id`. **Name search is forbidden at every step**: it
returned a 13-fan homonym for FISHER on Deezer, the actress "India Fisher" on
MusicBrainz at score 100, and did not return FISHER's Wikidata item at all
(research §4.2).

### 3.1 Spotify artist id → MusicBrainz MBID (`src/features/musicbrainz.ts`)

```
GET https://musicbrainz.org/ws/2/url
      ?resource=https://open.spotify.com/artist/{artistId}
      &inc=artist-rels&fmt=json
```

(The `resource` value is percent-encoded in the query string.) Present for
24/24 of the sample. Take the relation whose `type` is `free streaming` and
which carries an `artist` object — **that is the load-bearing guard**; the MBID
is `relation.artist.id`. The reverse lookup returns the URL entity for exactly
the URL asked for, so the echoed `resource` always contains `/artist/`;
checking it anyway is cheap insurance against a future response shape, not the
rule that keeps Cinthie's `open.spotify.com/user/…` URL out (that hazard lives
in the *forward* direction, artist → its URLs, research §4.2).

- 200 with a usable relation → `mbid`, `mbidStatus: 'ok'`. **Permanent**:
  MBIDs do not change and are never re-resolved.
- 404, or 200 with no artist relation → `mbidStatus: 'notFound'`.
- **503 means rate-limited or globally busy, never "artist absent"** — three
  independent triggers are documented (research §2 and §4.3). Retry with
  `backoffMs` from `src/util/retry.ts`, at most `MAX_5XX_RETRIES` (3) times;
  still failing, `mbidStatus: 'retryLater'`.
- One request per second (`MB_INTERVAL_MS = 1000`), the documented rate.
- **No custom header is sent** — not `User-Agent` (a forbidden header in
  browser JS), not `Api-User-Agent`. Research §4.5 records that
  `Api-User-Agent` returns 200 but that whether it is acceptable to
  MusicBrainz is **(unverified)**; the owner's ruling is to send neither, stay
  at 1 req/s and back off on 503.

### 3.2 Spotify artist id → Wikidata QID (`src/features/wikidata.ts`)

One `POST https://query.wikidata.org/sparql`, `Content-Type:
application/x-www-form-urlencoded`, body `query=<urlencoded>`, header
`Accept: application/sparql-results+json`. Verified live on 2026-09-05: that
exact shape answers 200 with `access-control-allow-origin: *`, and
`wikibase:sitelinks` binds an `xsd:integer`. Batches of **150 ids** (research
§4.3 sizes the batch at ~200 and warns to chunk inside the 60 s query timeout;
150 keeps headroom and 1,000 artists is 7 POSTs). The POSTs are sequential,
well inside the documented 60 s of processing per 60 s per UA+IP and the
5-parallel-queries cap.

**Pass 1 input** is every candidate whose identity row is in one of three
states, measured on `resolvedAt`:

- `qidStatus: 'unchecked'` (including an identity row that does not exist yet);
- `qidStatus: 'notFound'` and `resolvedAt` older than `REACH_NOT_FOUND_TTL_MS`
  (30 days);
- `qidStatus: 'ok'` and `resolvedAt` older than `REACH_TTL_MS` (90 days) — the
  QID is kept, only `sitelinks` and `wikiTitles` are rewritten.

That third case is load-bearing, not bookkeeping: §2's well-known rule is
`sitelinks >= 1` and nothing else, so an artist who gains their first Wikipedia
article moves out of the under-the-radar list only when the sitelink count is
refreshed. A `retryLater` QID is skipped until its `retryAfter` has passed
(§4.5) and then enters as an `unchecked` id would.

Pass 1, direct on P1902:

```sparql
SELECT ?sid ?item ?sitelinks ?en ?fr WHERE {
  VALUES ?sid { "3PyJHH2wyfQK3WZrk9rpmP" "…" }
  ?item wdt:P1902 ?sid .
  OPTIONAL { ?item wikibase:sitelinks ?sitelinks }
  OPTIONAL { ?en schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
  OPTIONAL { ?fr schema:about ?item ; schema:isPartOf <https://fr.wikipedia.org/> }
}
```

**Pass 2 input** is every id still without a `qid` after pass 1 that has an
MBID, swapping the third line for `?item wdt:P434 ?mbid .` and
`VALUES ?mbid { … }`, selecting `?mbid` in place of `?sid`. That chain took the
sample from 10/24 to 15/24 and cut false-underground verdicts from 7 to 2
(research §4.2).

- **Never `SAMPLE`** on P434 or P1902. Both are multi-valued — 1,711 items
  site-wide carry more than one P1902, and Moodymann's item carries two P434
  values of which only the second has the Spotify relation — and sampling is
  exactly what produced a wrong "not recoverable" verdict during the research.
  The `VALUES` join handles the multi-valued side correctly.
- If one id comes back bound to **more than one distinct `?item`**, record
  `qidStatus: 'notFound'`. Ambiguity the app cannot resolve must not promote
  an artist out of the underground list.
- QID from the last path segment of `item.value`
  (`http://www.wikidata.org/entity/Q…`). `sitelinks` parsed as an integer,
  absent → `null`. `wikiTitles.en` / `.fr` are the **last path segment of the
  sitelink URL, kept verbatim** (percent-encoded, underscores intact) — never
  a guessed title, and no decode/re-encode round trip, so the value drops
  straight into the pageviews path.
- An id absent from both passes → `qidStatus: 'notFound'`.
- A non-2xx or a transport failure → `qidStatus` left `unchecked` for the
  whole batch, so the next run simply asks again; it counts as one failure
  against the Wikidata source (§4.5).
- Once `qidStatus === 'ok'` the **QID is permanent** and never re-resolved;
  only `sitelinks` and `wikiTitles` come back on the 90-day clock above, and
  one POST covers 150 artists.

### 3.3 Artist → Deezer artist id, via a single-artist ISRC (`src/features/deezer.ts`)

Deezer sends no `access-control-allow-origin` header at all, so every request
goes through JSONP: `?output=jsonp&callback=<name>`, answered as
`text/javascript` (research §2).

```
GET https://api.deezer.com/track/isrc:{ISRC}?output=jsonp&callback=cb   → artist.id
GET https://api.deezer.com/artist/{deezerArtistId}?output=jsonp&callback=cb → nb_fan
```

`track.artist` is the **release's** main artist, so 6 of 61 resolved ISRCs
during the research landed on a different entity and returned a silently wrong
number — Bambounou → "Bambounou x Bruce" 7 against a real 9,528, Anetha →
Niki Istrefi 1,418 against 13,984, Hugo LX → Asynchrone 244 against 585
(research §4.2). The rule:

1. **Candidate ISRCs come only from tracks whose Spotify artist array is
   exactly this one artist** — `track.artists.length === 1 &&
   track.artists[0].id === artistId`, not local, `isrc !== null`. Deduped and
   sorted ascending so a run is deterministic.
2. Normalise the returned Deezer `artist.name` with `normalize()` from
   `src/model/normalize.ts` and compare it to the Spotify name; **exact
   equality** after normalisation. On a mismatch, try the next candidate.
3. No single-artist ISRC, or every candidate mismatched → `deezerStatus:
   'notFound'` and the row shows nothing. Never a number from a collaboration
   or a remix credit.

The JSONP body is `unknown` by construction (§3.4), so the Deezer caller
narrows every field before use with `field`/`num`-style guards, exactly as
`src/features/reccobeats.ts:36-43` does: `artist.id` must be a finite number
and `artist.name` a string, or the candidate is a miss.

The strictness is deliberate and asymmetric. Research §4.2 records that strict
contributor matching would reject the correct "Byron Aquarius", so this rule
will cost some true matches; that direction reads as *no reach data*, which is
honest. A loose rule accepts "Bambounou x Bruce", and a spuriously small
`nb_fan` marks an established artist as underground — precisely the answer the
feature exists to give.

**Ruling (not from the research): at most 3 candidate ISRCs per artist per
run**, so one artist costs at most 4 requests and a library of collaborators
cannot swallow the Deezer budget.

`deezerArtistId` is permanent once `ok`; only `nb_fan` is re-fetched later, at
one request instead of two.

### 3.4 JSONP transport (`src/features/jsonp.ts`)

A small helper, no dependency: a unique callback name per request
(`__djReach<counter>`) assigned on `window`, a `<script>` appended to
`document.head`, and a `finally` that deletes the global and removes the
element whatever happens.

```ts
export function jsonp(url: string, timeoutMs: number): Promise<unknown>;
```

**It resolves with `unknown`, never a caller-chosen generic.** JSONP executes a
remote script in the page's own context, so whatever reaches the callback is
untyped by construction and a generic the caller instantiates would be an
assertion rather than a check. Narrowing is the caller's job (§3.3).

- **Per-request timeout `JSONP_TIMEOUT_MS = 10_000`.** JSONP has no status
  codes at all, so a silent timeout is a **retry**, never a miss (research
  §4.3). This is a different budget from the `fetch` timeout in §4 and stays
  its own constant.
- A `script.onerror` is likewise a transport failure, not an absence.

The two rules below belong to the Deezer caller in §3.3, which is why the
helper stays generic and `jsonpFn` can be injected in tests:

- Quota errors arrive as **HTTP 200 with `{"error":{"code":4}}` in the body**,
  so the body is inspected and the status is not. Code 4 → sleep and retry the
  same request, at most 5 times; still refused, that counts as one failure
  against the Deezer source (§4.5). Any other `error` object → that candidate
  is a miss.
- Pace: **`DEEZER_INTERVAL_MS = 250`, 4 requests per second.** The research
  measured the quota at ~50 requests per 5 s per IP and sized the job at ≤8
  req/s; the owner chose half of that envelope for headroom, because a breach
  is invisible in the status line.

## 4. Reach lookup job (`src/features/reachRun.ts`)

Manual, resumable, checkpointed, **never on page load** — the same shape as
the playlist sync, the history import and the ReccoBeats lookup. It is
network-bound and runs on the main thread with awaits; no worker.

**Every `fetch` in §3.1, §3.2, §4.3 and §4.4 carries
`AbortSignal.timeout(REACH_REQUEST_TIMEOUT_MS)`, 15 s.** An abort is a network
failure and takes that source's backoff path. Without it a hung request on a
flaky mobile connection would strand `reachState` on `running` forever, and
§5.6 claims `running` synchronously, so the button would stay disabled with no
way back.

**`reachState` is an in-memory signal only and is never persisted to meta** —
unlike `syncState` (`src/model/state.ts:125-126`). After a reload the card is
simply idle again, and a new run resumes from the checkpoints in IndexedDB
because every step is idempotent: rows are written as they resolve, and the
freshness rules in §4.5 skip whatever already answers.

### 4.1 Candidates

```ts
export interface ReachCandidate {
  artistId: string;
  name: string;
  /** ISRCs of tracks credited to this artist alone, sorted, deduped. */
  isrcs: string[];
}
export function reachCandidates(model: Model): ReachCandidate[];
```

Every artist in `model.artists` with `id !== null` — §2's universe. ISRCs are
built with `normalizeIsrc` from `src/features/reccobeats.ts:30` (uppercase,
dash-free), so a candidate is in the form Deezer's `/track/isrc:` path expects
and the two features agree on one ISRC format. Pure, so it is unit-tested; it
is the run's input only, never a render-time helper (§5.5).

### 4.2 Phases and state

The run is **one phase per source**, in this order: MusicBrainz →
ListenBrainz → Deezer → Wikidata → Wikipedia. ListenBrainz needs the MBID that
MusicBrainz produces, Wikipedia needs the title that Wikidata produces, and
Wikidata is a batch query over 150 ids that cannot be expressed per artist at
all. Phases still satisfy "checkpointed per artist": every row is written to
IndexedDB as it resolves, so stopping mid-phase loses nothing and the next run
picks up exactly what is missing.

```ts
/**
 * The five phases. `ReachSource` is the subset that produces a stored number
 * and is what `ArtistReachRow.source` holds; MusicBrainz and Wikidata resolve
 * identities, and both can pause, which is why `paused` carries this union
 * and not the narrower one.
 */
export type ReachStep = ReachSource | 'musicbrainz' | 'wikidata';

/** What this run did, as opposed to what the store holds (§2). */
export interface ReachRunCounts {
  /** Artists processed in any phase this run. */
  lookedUp: number;
  /** `ok` rows written this run. */
  written: number;
  /** Artists that ended the run with no `ok` row in any source. */
  unresolved: number;
}

export type ReachState =
  | { status: 'idle' }
  | {
      status: 'running';
      step: ReachStep;
      done: number;
      total: number;
      /** Sources that gave up; the card names them while the run continues. */
      paused: ReachStep[];
    }
  | {
      status: 'done';
      summary: ArtistReachSummary;
      run: ReachRunCounts;
      paused: ReachStep[];
    }
  | { status: 'error'; message: string; paused: ReachStep[] };

export interface ReachDeps {
  fetchFn: typeof fetch;
  /** Injected so the JSONP path is testable without a DOM. */
  jsonpFn: (url: string, timeoutMs: number) => Promise<unknown>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  onState: (state: ReachState) => void;
  /** Optional: the run is long enough that the screen must stay awake. */
  acquireWakeLock?: () => Promise<() => Promise<void>>;
}

export async function runReach(
  deps: ReachDeps,
  candidates: ReachCandidate[],
  identities: ArtistIdentityRow[],
  reach: ArtistReachRow[]
): Promise<void>;
```

`paused` is carried on **`running`, `done` and `error` alike**, so a run in
which Deezer pauses and MusicBrainz then errors still names the pause; §5.5
renders it from whichever state is current.

`done` and `total` reset at each phase and count **artists** (batches for
Wikidata), so the progress bar always measures the step it names. `runReach`
never throws: a failure ends in the error state, like `runLookup`.

**The run threads its own writes.** `runReach` holds a
`Map<string, ArtistIdentityRow>` and a `Map<string, ArtistReachRow>`, seeded
from the two arrays it was handed and updated on every write — the same
pattern as `runLookup`, which is given `existing` rather than re-reading
(`src/model/state.ts:284-287`). Later phases therefore see earlier phases'
results without a model reload: the ListenBrainz phase reads the MBIDs phase 1
just wrote, and the Wikipedia phase reads the titles phase 4 just wrote.
Without this a first run would resolve identities and fetch nothing at all.
The passed arrays are the run's starting point and are never re-read mid-run;
IndexedDB is written through on every row so a stop loses nothing, and the
model reloads exactly once, at the end (and after an error — §5.6). Freshness
in §4.5 is judged against the maps, so a row this run already wrote is not
asked again later in the same run.

**Wake lock.** `runReach` acquires `deps.acquireWakeLock?.()` before the first
phase and releases it in a `finally` covering every exit path — completion, a
paused source, an error, a storage failure. With the screen asleep Android
throttles timers and a 45-minute run stalls silently on `running`; the app
already solves this for the sync (`src/model/state.ts:137-140`, passed at
`:180`).

**What the run costs.** For a planning figure of 1,000 artists, none of them
yet resolved:

| Phase | Requests | Pace | Wall clock |
| --- | --- | --- | --- |
| MusicBrainz | 1 per artist | 1 req/s | ~16.7 min |
| ListenBrainz | 1 per artist with an MBID | 1 req/s | ~16.7 min |
| Deezer | 2 per artist that matches on its first ISRC | 250 ms | ~8.3 min |
| Wikidata | 1 POST per 150 ids, two passes | sequential | ~10 s |
| Wikipedia | 2 per artist with an en or fr title (~600) | 250 ms | ~5 min |
| | | **Total** | **~47 min** |

So **roughly 45 to 50 minutes for 1,000 artists**, which is what §5.2 tells the
owner. The ceiling is nearer an hour: Deezer reaches 16.7 min if every artist
needs all three ISRC candidates, and any 503 backoff is on top. The Wikipedia
row assumes the research's 16-of-24 article rate on a deliberately
famous-weighted sample; a real DJ library will not come close to it, so that
row is generous and the total is pessimistic. Later runs are far shorter:
§4.5's freshness rules skip everything that already answers.

### 4.3 ListenBrainz (`src/features/listenbrainz.ts`)

```
GET https://api.listenbrainz.org/1/stats/artist/{mbid}/listeners
```

Verified live on 2026-09-05 with `access-control-allow-origin: *`. The body is
`{ "payload": { artist_mbid, artist_name, from_ts, last_updated, listeners,
range, to_ts, total_listen_count, total_user_count } }` — FISHER answers
`total_user_count` 5,051 and `total_listen_count` 69,448. **Read
`payload.total_user_count` (the stored `value`), `payload.total_listen_count`
(`extra.listens`) and `payload.artist_name`, under `payload` only**; a missing
`total_user_count` is `notFound`.

- **HTTP 204 with an empty body means unknown** — not 404, not an error
  object — so parse defensively: `notFound`.
- Verify the echoed `artist_name` against the Spotify name with `normalize()`.
  On a mismatch store `notFound` and no number. This costs coverage when a
  spelling diverges, and is the same honest direction as §3.3.
- One request per second (`LB_INTERVAL_MS = 1000`), the documented limit
  ("never more than ONE call per second"); the live window is 30 per 10 s and
  **distinct MBIDs are cache misses that each decrement it**, so the pace is
  not padded.
- 429 → honour `Retry-After` via `parseRetryAfter`, at most 5 retries. A
  `Retry-After` above 60 s pauses the source rather than hanging the card, and
  every artist still owed a request in this phase is written `retryLater` with
  `retryAfter` per §4.5, so the next run does not re-ask before ListenBrainz
  said it would answer. (This differs from the ReccoBeats lookup, which
  *throws* on the same condition — `src/features/reccobeats.ts:122-128`, turned
  into the error state at `src/features/lookup.ts:217-219` — and so aborts the
  whole run; with five independent sources, pausing one is the better answer.)
- 5xx, an abort or a transport failure → `backoffMs`, at most
  `MAX_5XX_RETRIES`, then `retryLater`.
- `sourceUrl` is the request URL.

### 4.4 Wikipedia pageviews (`src/features/wikipedia.ts`)

Two requests per artist that has a title, one per language:

```
GET https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article
      /{project}/all-access/user/{title}/monthly/{start}/{end}
```

(one path, wrapped here for width.) `project` is `en.wikipedia.org` or
`fr.wikipedia.org`; `title` is the stored sitelink segment; `start`/`end` are
`YYYYMMDD00`. Verified live on 2026-09-05: that host answers 200 with
`access-control-allow-origin: *`, and a 12-month window returns 12 `items[]`,
each with a `timestamp` (`"2025090100"`) and `views`.

- **The last 12 complete months only.** The current month reads as a collapse
  (Kettama's August-2026 bucket is 402 against a 12,791 monthly average), so
  the window ends on the last day of the month *before* the current one. With
  `now` = 5 Sep 2026 that is `2025090100` to `2026083100`, the exact window
  the research's table used. Month boundaries are computed in **UTC** — the
  API is UTC-dated, unlike the Crate's month buckets, which are deliberately
  local.
- `value` = the sum of `items[].views` over **en + fr**. Anetha gets more
  French views (4,331) than English (3,227), so an English-only rule would
  systematically understate this owner's artists. `extra` carries `en`, `fr`
  and `months` (12).
- A 404 for one language contributes 0; 404 for both → `notFound`. A 200 with
  every bucket at zero is stored as `ok` with `value: 0` — neither status
  proves the title is wrong (research §4.2) — and §5.3 simply omits the views
  part, so no row ever reads `0 views/yr`.
- **Ruling (no rate limit is documented — research records that as
  (unverified)): `WIKIPEDIA_INTERVAL_MS = 250`, 4 requests per second**, which
  matches the research's own ~2–3 minute estimate for this phase.
- If the whole phase pauses (§4.5), nothing changes group: the well-known rule
  reads `sitelinks` alone (§2). The public-profile line loses its views part,
  the Settings card names the paused source, and a missing views figure is
  never mistaken for "nobody reads about them".

### 4.5 Refresh, retry and pausing

```ts
export const REACH_TTL_MS = 90 * 24 * 60 * 60 * 1000;      // numbers
export const REACH_NOT_FOUND_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const REACH_RETRY_LATER_TTL_MS = 24 * 60 * 60 * 1000;
export const REACH_REQUEST_TIMEOUT_MS = 15_000;
export const MAX_SOURCE_FAILURES = 3;
```

Three TTLs, one table, referenced from every section that needs them. The
clock is `fetchedAt` on an `artistReach` row and `resolvedAt` on an
`artistIdentity` row.

| Status | Written with | Asked again |
| --- | --- | --- |
| `retryLater` | `retryAfter = now + REACH_RETRY_LATER_TTL_MS` (1 day) — or `now + Retry-After × 1000` when a source named a longer wait, so the later of the two always applies | once `now >= retryAfter`; the run skips the row until then |
| `notFound` | `retryAfter: null` | when the clock is older than `REACH_NOT_FOUND_TTL_MS` (30 days) |
| `ok` | `retryAfter: null` | when the clock is older than `REACH_TTL_MS` (90 days) |

`retryAfter` is written on **every** `retryLater`, on reach rows and identity
rows alike; that is the field's only writer and the only thing that gates a
`retryLater` retry. *(The 1-day floor is a ruling, not a research figure: it
keeps a globally-busy MusicBrainz from being hammered on the next tap without
making a transient failure permanent.)*

- MBID, QID and Deezer artist id are permanent once `ok`; only the numbers,
  the sitelink count and the titles come back on the 90-day clock.
- **Three consecutive failures on one source pause it for the rest of the
  run** (`MAX_SOURCE_FAILURES`) — a transport error, an abort, a 5xx past its
  retries, a JSONP timeout, or a quota answer past its retries all count; any
  success resets the counter to zero. A paused source is added to
  `ReachState.paused` and to the summary, and every other phase continues: a
  paused MusicBrainz still leaves ListenBrainz free to work through the
  artists that already have an MBID.
- **An artist a paused source never reached is left exactly as it was** —
  usually `unchecked` for that source — and is asked again on the very next
  run. Only an artist whose own request failed past its retries is written
  `retryLater`. A day-long lock-out over one bad minute of network would be
  the wrong trade.
- Every artist step is **idempotent**, so a partial run is still useful — the
  list simply shows fewer resolved artists.

## 5. Screens

### 5.1 Artists tab

The h1 becomes **`Artists`** (the current "Artists by saved tracks" would lie
on one of the two options) followed by a `Segmented`:

```
Saved tracks | Under the radar
```

Default `Saved tracks`, whose screen is exactly today's: the same ranking, the
same `Filter`, the same rows. `Artists.tsx` becomes the dispatcher; the new
view lives in `src/ui/UnderRadar.tsx`.

The three new selections are module-level signals in
**`src/ui/artistSelections.ts`** — `artistView`, `radarSort` and `radarFilter`
— on the precedent of `src/ui/crate/selections.ts`, so a tab switch keeps each
setting and a reload resets it. The dedicated file matters here beyond
convention: `Artists.tsx` renders the view switcher and `UnderRadar.tsx` reads
`artistView` and `radarSort`, so putting them in either component would make
the dispatcher and the view import each other. The existing `filter` signal
stays where it is, in `Artists.tsx`, since only the Saved tracks screen reads
it.

### 5.2 Under the radar — before a run

Gate: `artistReachSummary.value?.version === 1` is false (§2). A card, not the
`Empty` component, because the copy needs a heading and a button — the same
shape as `CrateEmpty`:

> ### No reach data yet
>
> Under the radar shows the artists in your playlists with the smallest
> audiences on ListenBrainz and Deezer, and moves the ones with a Wikipedia
> article to the bottom. It needs one lookup first: roughly 45 to 50 minutes
> for 1,000 artists, and you can stop it and come back.
>
> [ **Look up artists** ]  → navigates to `#/settings`

### 5.3 Under the radar — the list

```
806 of 1,204 artists have reach data · as of 5 Sep 2026
[ Most played | Fewest listeners | Fewest fans ]
[ Filter artists                              ]
─────────────────────────────────────────────
 1  Hugo LX
    3 tracks · 2 playlists · 41 plays
    54 ListenBrainz listeners · 585 Deezer fans
 2  Adryiano
    5 tracks · 3 playlists · 22 plays
    562 ListenBrainz listeners · 2,327 Deezer fans
─────────────────────────────────────────────
 No reach data
 Not resolved yet · Look up artists ›
 41  Some Artist
     2 tracks · 1 playlist
     no reach data
─────────────────────────────────────────────
 Well known
 96  Peggy Gou
     12 tracks · 5 playlists · 318 plays
     5,896 ListenBrainz listeners · 202,216 Deezer fans
     Wikipedia · 19 languages · 289k views/yr
 97  Anetha
     4 tracks · 2 playlists · 61 plays
     705 ListenBrainz listeners · 13,984 Deezer fans
     Wikipedia · 3 languages · 7,558 views/yr

Wikipedia figures CC BY-SA 4.0
```

- **Caption** (`p.caption`): `806 of 1,204 artists have reach data · as of
  5 Sep 2026` — the two numbers from `reachCoverage(model)` (`covered` of
  `artists`, §2), the date from `artistReachSummary.ranAt` via `formatDate`.
  The caption is computed live so it never lags a partial run.
- **Sort control**: a second `Segmented` labelled `Most played`,
  `Fewest listeners`, `Fewest fans`; default `Most played`; the `radarSort`
  signal from §5.1. It is passed `scroll` — three labels this long overflow a
  phone's width, and `Segmented` already supports the horizontal-scroll
  variant (`src/ui/components/Segmented.tsx:5`).
- **Filter**: the existing `Filter` with placeholder `Filter artists`,
  narrowing on `normalize(name).includes(query)` exactly as today, over the
  memoised list from §2. Ranks come from the unfiltered list, so filtering
  never renumbers. **A group heading whose rows have all been filtered out is
  not rendered.**
- **Subtitle**: `12 tracks · 5 playlists · 318 plays` through `plural`. The
  plays part is omitted when `hasHistory(model)` is false or the artist has
  none — parts only when known.
- **Reach line**: `5,896 ListenBrainz listeners · 202,216 Deezer fans`; when
  only one is known, only that part; when neither, the literal
  `no reach data`. Never a zero standing in for a missing number.
- **Public-profile line**, on Well known rows only, under the reach line:
  `Wikipedia · 19 languages · 289k views/yr`. "languages" is `sitelinks`; the
  view count is compact (§6). The views part is omitted when there is no `ok`
  Wikipedia row **or** when its `value` is 0, leaving
  `Wikipedia · 1 language` — which is not an edge case under §2's rule: an
  artist whose only article is in neither English nor French has a sitelink
  count and no views row at all.
- **Group headings**: the `radar` group **never** carries a heading — it is the
  view. `No reach data` and `Well known` **always** carry theirs when they hold
  a row, including when one of them is the first group rendered; a list of
  nothing but unresolved artists must not read as if absence were the answer.
  When `radar` is empty the muted line `No under-the-radar artists yet.`
  precedes the other groups, so the missing first block is stated rather than
  inferred.
- **Retry affordance**, muted, directly under the `No reach data` heading:
  `Not resolved yet · Look up artists ›`, linking to `#/settings`. Research
  §4.4 asks that an unresolved artist read *no reach data* with a way to try
  again; once per group is enough, and the artist's own screen repeats it
  (§5.4).
- **Attribution footer**, muted, under the list whenever any Well known row is
  rendered: `Wikipedia figures CC BY-SA 4.0`.
- Rows carry the existing Spotify link (`artistUrl(agg.id)`) and link to
  `#/artist/<key>`. No cover art, matching the Crate's row rules.
- Artists with no Spotify id are absent, per §2's universe.
- With no artists at all, the h1 and both `Segmented` controls still render and
  `<Empty what="artists" />` takes the place of the list — unlike today's
  `Artists.tsx:14`, which returns `Empty` instead of the whole `<section>` and
  would take the view switcher down with it.

### 5.4 Artist screen (`#/artist/<key>`)

Under the existing `128 saved tracks in 12 playlists · Open in Spotify` line,
and only once `artistReachSummary.value?.version === 1` (nothing new appears
for an owner who has never run the job, and nothing at all for an artist
without a Spotify id):

```
5,896 ListenBrainz listeners · 202,216 Deezer fans
Wikipedia · 19 languages · 289k views/yr
as of 5 Sep 2026 · Wikipedia figures CC BY-SA 4.0
ListenBrainz › · Deezer › · Wikipedia ›
```

- The reach and public-profile lines use the same strings as the list rows,
  including the rule that omits a zero or missing view count.
- Unresolved artist: `No reach data.` followed by `Look up artists ›`
  (`#/settings`).
- `as of` is the newest `fetchedAt` among the artist's `ok` rows,
  via `formatDate`. The CC BY-SA credit sits beside it and appears only when a
  Wikipedia figure is on screen.
- Links appear only where the id behind them is known:
  `https://listenbrainz.org/artist/{mbid}/` and
  `https://www.deezer.com/artist/{deezerArtistId}` — both verified live on
  2026-09-05 as human pages answering 200 — and Wikipedia as
  `https://en.wikipedia.org/wiki/{title}` (or `fr.` when only French exists),
  reconstructed from the stored sitelink segment and therefore exact.

### 5.5 Settings: "Artist reach" card

Placed after "Audio data", built like it:

```
Artist reach
Reach data for 806 of 1,204 artists · MusicBrainz 1,151 · ListenBrainz 742 ·
Deezer 517 · Wikipedia 214 · well known 233

Resolving artists · MusicBrainz
[███████░░░░░░░░░]
120 / 1,204 artists

Looked up 604 artists · 158 new numbers · 398 unresolved
Deezer stopped answering after three tries; the rest of this run skipped it.
Last error: ListenBrainz is unreachable: Failed to fetch

[ Look up artists ]
as of 5 Sep 2026
Artist data via MusicBrainz and ListenBrainz · Deezer · Wikidata (CC0) · Wikipedia (CC BY-SA)
```

That block draws every line the card can render, not one moment: the progress
bar and the result line never appear together, and the coverage line is one
line that wraps. Its numbers are consistent with §2's definitions — 806
covered of 1,204 candidates, 233 well known against 214 with an en or fr
article, and 398 unresolved because 1,204 − 806 = 398 — and no number is
repeated between the coverage line and the result line, because the two count
different things.

- **Coverage line** — what the store *holds*, computed live:
  `Reach data for X of Y artists · MusicBrainz R · ListenBrainz A · Deezer B ·
  Wikipedia C · well known W`, with every term exactly as §2 defines it. Y is
  the universe — every candidate — not the work a run would still do, which
  would shrink to zero as the job succeeds; and the source counts **overlap on
  purpose**, so they can add up to more than X. This follows the existing
  `coverage()` reasoning (`src/model/state.ts:227-252`) word for word.
- Implemented as `reachCoverage(m)` in `src/model/state.ts` beside `coverage`,
  **memoised on the `Model` object identity** so it is not recomputed on every
  Settings render. It is a pure function of the model and would sit equally well
  in `model/reach.ts`; it goes next to `coverage` because the two are the same
  helper for two cards, `Settings.tsx` already imports `coverage` from
  `state.ts`, and splitting them would leave a reader hunting two files for one
  pattern. §5.3's caption imports it from there too. It counts artists with
  `id !== null` straight from `model.artists` and **must not call
  `reachCandidates`**, whose per-artist
  ISRC collection, dedupe and sort is job-only work and far heavier than
  `candidateIds` (`src/model/state.ts:236`, called from `Settings.tsx:116`).
- With nothing synced: `Sync your playlists first.` in the muted colour.
- **Progress** through the existing component: label
  `Resolving artists · MusicBrainz` (the step label from
  `SOURCE_LABEL: Record<ReachStep, string>` = `MusicBrainz`, `ListenBrainz`,
  `Deezer`, `Wikidata`, `Wikipedia`), `unit="artists"` — `Wikidata` alone
  passes `unit="batches"`. The component prints the counter itself, so the
  numbers are never said twice.
- **Result line** after a run, muted — what *this run* did, from
  `ReachState.run` (§4.2), never from the summary:
  `Looked up 604 artists · 158 new numbers · 398 unresolved`, i.e.
  `lookedUp`, `written`, `unresolved`. The wording is deliberately unlike the
  coverage line's: the two answer different questions and agree only on the
  first run. `lookedUp` and `written` are the two genuinely run-scoped numbers;
  `unresolved` is deliberately a whole-store figure standing beside them
  (`artists − covered`, so 1,204 − 806 = 398 in the block above), because *what
  is still missing* is the question the owner asks once a run has stopped, and
  answering it with "artists this run happened to touch and fail on" would
  understate it every time. Because `reachState` is not persisted (§4), the
  line is gone after a reload while the coverage line and the `as of` date
  survive. When the run
  had nothing to do: `Nothing new to look up.`, the phrasing the Audio data
  card already uses.
- **Paused line**, warn colour, one per entry in `paused`, the source name from
  `SOURCE_LABEL`:
  `Deezer stopped answering after three tries; the rest of this run skipped it.`
  It reads `reachState.paused` while `running`, `done` or `error`, and is
  absent only when `idle` — so a pause followed by an error is still shown.
- **Error line**: `Last error: {message}` in the error colour.
- **Button** `Look up artists`, `Looking up…` while running.
- `as of 5 Sep 2026` from `ranAt` via `formatDate`; absent before the first
  run.
- The attribution line is permanent, whether or not a run has happened.

**The busy rule.** `src/model/state.ts` exports one predicate,
`jobsBusy(): boolean` — true while any of the sync, the history import, the
ReccoBeats lookup, the Rekordbox import or the reach run is `running` — and the
three existing guards the app already has are switched to it, so no two of the
five ever overlap:

- `AudioCard`'s `busy` (`src/ui/Settings.tsx:109`), which gates the ReccoBeats
  button and the Rekordbox XML input, so neither can start mid-run. Both they
  and the reach run call `loadFromDb()` on completion
  (`src/model/state.ts:303`, and §5.6 here), so the later one would clobber the
  earlier one's model rebuild.
- `Settings`' `working` (`src/ui/Settings.tsx:190-194`), which disables the
  **Disconnect** button, so the owner is stopped before the destructive
  `confirm()` rather than after it.
- `disconnect()`'s own guard (`src/model/state.ts:333-343`), §5.6.

The Sync button (`src/ui/Settings.tsx:223-230`) additionally gains
`|| reachState.value.status === 'running'`, since a sync started mid-run is the
same `loadFromDb()` clobber; it keeps `isSyncBusy(state)` for its own
quota lock-out. `jobsBusy` deliberately reads `syncState.status === 'running'`
only and **not** `isSyncBusy`: a Spotify quota lock-out lasting hours must not
block a run that touches no Spotify endpoint. The pre-existing overlap between
a sync and a ReccoBeats lookup is out of scope for this spec. The new card's
own button is disabled when there is no model or when `jobsBusy()` is true.
Nothing starts on load.

### 5.6 State, wiring and disconnect

`src/model/state.ts` gains `reachState`, `artistReachSummary`, `reachCoverage`,
`jobsBusy` and `startReach()`, which mirrors `startLookup`
(`src/model/state.ts:274-306`) exactly: it claims
`{ status: 'running', … } as ReachState` synchronously so a second tap cannot
start a second run, passes the model's own identity and reach rows rather than
re-reading IndexedDB (a rejected read would strand the state on `running`
forever, because `runReach` never throws), calls `loadFromDb()` afterwards even
on an error so a partial run shows its coverage, and pushes an error into the
banner. It passes `'wakeLock' in navigator ? acquireWakeLock : undefined`,
exactly as `startSync` does at `src/model/state.ts:180`.

`disconnect` gains the run to its guard list — now `jobsBusy()` — and its
banner becomes:

> Wait for the current sync, history import, lookup, Rekordbox import or
> artist lookup to finish before disconnecting.

and it resets `reachState` to `{ status: 'idle' }` and `artistReachSummary` to
`null`. `wipeDb` already deletes the whole database, so both new stores go
with it.

## 6. Components and styles

No new dependency and no new shared component. `Segmented`, `TrackRow`,
`Progress`, `Empty`, `Filter` and `util/retry.ts` are reused as they are;
`Empty` keeps only its existing role, the "no artists at all" fallback, since
the pre-run gate needs a heading and a button and therefore a card (§5.2). No
`Badge` is added: the reach numbers are a line of text, not a pill, so the
Crate's "never a third badge" discipline is untouched.

- The reach and public-profile lines are passed to `TrackRow` through its
  existing `badges` slot as `<span class="reach">` elements. `.badges` is a
  wrapping flex row (`src/styles.css:236`), so each line takes
  `flex-basis: 100%` and the two stack under the subtitle without touching
  `TrackRow`.

  ```css
  .reach {
    flex-basis: 100%;
    font-size: 0.8rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  ```

- Group headings are `<li class="group">` inside the existing `ul.list`, so
  they scroll with the rows:

  ```css
  .list li.group {
    padding: 14px 4px 6px;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--muted);
    border-bottom: 1px solid #2a2a2a;
  }
  ```

- The Artist screen's links reuse the existing `.provenance` block
  (`src/styles.css:388-397`: muted, stacked, undecorated links) and the `›`
  chevron the app already uses on `Open Aug 2026 ›` and
  `Spotify's own top lists ›`. The Under the radar list's attribution footer
  and its `Look up artists ›` line use the same `.provenance` block. The
  `‹`/`›` characters stay as they are elsewhere; no icons are added.
- `src/ui/format.ts` gains one function:

  ```ts
  /** 1,352 -> '1,352'; 288,783 -> '289k'; 999,999 -> '1m'; 1,240,000 -> '1.2m'. */
  export function compactCount(n: number): string;
  ```

  Under 10,000: `toLocaleString()`. Under 999,500: `Math.round(n / 1000)`
  plus `k`. Otherwise `(n / 1e6).toFixed(1)` with a trailing `.0` dropped —
  the rule `formatBpm` already uses — plus `m`. The 999,500 boundary exists so
  the `k` branch can never print `1000k`. It is used only for the yearly view
  count, where the exact figure carries no meaning; listeners and fans are
  always printed in full.

## 7. Tests

All in Vitest's Node environment, next to their source, no DOM.

- **`db/repo.test.ts`**: `artistIdentity` and `artistReach` round trips; a
  version 2 database with playlists, tracks and feature rows reopened at
  version 3 keeps every row and gains both stores (mirroring the existing
  v1→v2 test).
- **`model/reach.test.ts`**: `reachFor` returns the three rows and ignores a
  `notFound`/`retryLater` row; `hasHistory` false on an empty `plays` array and
  true on one holding a zero-play row. `isWellKnown` across the whole truth
  table, which is now three cases: `sitelinks` null → false, 0 → false, 1 →
  true; and an artist with 1 sitelink but a `notFound` Wikipedia row is still
  true, because the views never enter the test. `rankUnderTheRadar`: group
  assignment including a well-known artist with no reach numbers landing in
  `known`; an artist with only a Wikipedia number and no sitelinks landing in
  `unknown` (Wikipedia views are not one of the two audience numbers); artists
  without a Spotify id excluded; each sort with its tie-break chain; nulls last
  on both number sorts; the whole-model fallback to saved tracks when
  `hasHistory` is false; ranks running on across groups; and the memo returning
  the identical array reference for a repeated `(model, sort)` pair and a fresh
  one when either changes.
- **`features/musicbrainz.test.ts`** (mocked fetch): URL and query string;
  the `free streaming` artist relation picked; a relation with no `artist`
  object ignored; 404 → `notFound`; 503 → `retryLater` after
  `MAX_5XX_RETRIES` backoffs; an aborted request treated as a transport
  failure; no custom header on the request.
- **`features/listenbrainz.test.ts`**: URL; the three fields read from under
  `payload`; 204 with an empty body → `notFound`; a body with no
  `total_user_count` → `notFound`; a name mismatch → `notFound` and no value; a
  name differing only by case and accents accepted; 429 with `Retry-After` then
  success; a `Retry-After` above 60 s pausing the source and writing
  `retryLater` rows with `retryAfter` for the artists still owed a request.
- **`features/jsonp.test.ts`**: a unique callback per call; the global and the
  script element removed on success, on error and on timeout; the 10 s
  `JSONP_TIMEOUT_MS` rejecting as retryable; the callback's argument handed
  back untouched, which the test has to narrow itself because the helper
  declares `unknown`.
- **`features/deezer.test.ts`** (injected `jsonpFn`): the single-artist ISRC
  rule (a two-artist track never contributes a candidate); the normalised name
  comparison accepting a match and rejecting "Bambounou x Bruce"; the next
  candidate tried after a mismatch; the 3-candidate cap; no candidate →
  `notFound`; a body whose `artist.id` is not a finite number treated as a
  miss; `error.code 4` retried five times then counted as one source failure;
  another `error` code treated as a miss; a known `deezerArtistId` skipping the
  ISRC request.
- **`features/wikidata.test.ts`**: chunking at 150; the query contains
  `VALUES` and `wdt:P1902` and **no** `SAMPLE`; pass 1's input is the three
  categories of §3.2 — `unchecked`, `notFound` past 30 days, `ok` past 90 days
  — and excludes a fresh `ok` and a `retryLater` whose `retryAfter` has not
  passed; an `ok` id refreshed past 90 days keeps its QID and gains new
  `sitelinks`; pass 2 runs only over pass 1's misses that have an MBID and keys
  on `wdt:P434`; QID, sitelinks and both sitelink segments parsed; two items
  for one id → `notFound`; an id in neither pass → `notFound`.
- **`features/wikipedia.test.ts`**: the window is the last 12 complete months
  in UTC, checked on the 1st and the 31st of a month and across a year
  boundary; the `YYYYMMDD00` formatting; the en+fr sum; a 404 on one language
  contributing 0; 404 on both → `notFound`; an all-zero 200 → `ok` with 0.
- **`features/reachRun.test.ts`**: `reachCandidates` (id-less artists
  excluded, single-artist ISRCs collected through `normalizeIsrc`, sorted and
  deduped); phase order and the step labels emitted; the in-memory maps
  threading writes across phases, so a single run resolves an MBID in phase 1
  and fetches its ListenBrainz number in phase 2 from the arrays it was handed
  as empty; a second run skipping fresh rows and re-asking at the 90/30-day
  boundaries and once `retryAfter` has passed; permanence of MBID, QID and
  Deezer id; three consecutive failures pausing one source while the others
  finish, with the artists that source never reached left `unchecked`; `paused`
  present on `running`, `done` and `error`; the summary's counts against §2's
  definitions and the `ReachRunCounts` against §4.2's; the wake lock released
  on the success path, the paused path and the error path; an error ending in
  the error state with rows already written intact.
- **`ui/format.test.ts`**: `compactCount` at 999, 9,999, 10,000, 288,783,
  999,499, 999,999 and 1,240,000.
- **Screens**: no unit tests, per the project's convention. A browser
  walkthrough in the final review on the real library, which is also the first
  measurement of the numbers the research could not get (research §6, point 6):
  how many artists resolve to an MBID, and how many have a single-artist ISRC.

## 8. Policy notes

**Rulings made while planning.**

- *Placement.* Research §4.4 recommends a Crate-family route reached from
  Settings, on the Import precedent. The owner chose the **Artists tab**
  behind a Segmented instead: this is an artist-level view, the Artists tab is
  where artists already live, and it costs no new tab and no new hub row. Only
  the placement diverged — §4.4's gating recommendation is kept in full
  (decision 5, §5.2).
- *Well known is one clause.* An artist is well known when their Wikidata item
  carries at least one Wikipedia article, in any language (§2). Earlier drafts
  added a five-sitelink threshold and a 1,000-views floor; both were dropped
  because the research's own table shows the sitelink count compresses at the
  bottom and the view count measures curiosity rather than reach, so a
  threshold above "has an article" would have the app ranking artists it cannot
  rank. The consequence — a genuinely small artist such as Anz landing under
  Well known on the strength of one article — is deliberate, and it is safe
  because **Well known is a heading at the bottom of the same list, never a
  filter that removes rows.**
- *The Wikipedia phase is kept for the line, not the grouping.* It costs a
  client, a test file, a UTC month window and ~5 minutes per run, and it now
  decides nothing: it fills `Wikipedia · 3 languages · 14k views/yr`. That is
  the one part of this design whose value the research does not demonstrate,
  and the browser walkthrough (§7) should report whether the owner reads the
  views at all; if not, the phase is dropped and the public-profile line keeps
  only its language count.
- *Phases, not a per-artist pipeline.* Forced by the Wikidata batch; per-artist
  checkpointing is preserved because every row is written as it resolves, and
  the run threads its own writes through in-memory maps (§4.2) so a later phase
  sees an earlier one's results.
- *"Most played" falls back per model, not per artist* (§2), so the column
  never mixes plays with track counts.
- *An ambiguous Wikidata id is `notFound`*, so the app never promotes an
  artist out of the list on evidence it cannot disambiguate.
- *A ListenBrainz or Deezer name mismatch stores no number.* Both cost
  coverage in the safe direction.
- *Invented constants, labelled as such*: the 3-candidate ISRC cap (§3.3),
  `WIKIPEDIA_INTERVAL_MS = 250` where no rate limit is documented (§4.4), the
  1-day `retryLater` floor and the 15 s request timeout (§4.5). Deezer's 4
  req/s is the owner's choice inside the research's ≤8 req/s envelope, not a
  misreading of it.
- *Facts verified live on 2026-09-05, after the research*: the ListenBrainz
  response envelope (everything under `payload`), the Wikimedia pageviews host
  and its `items[]` shape, the Wikidata SPARQL POST form and its integer
  `sitelinks` binding, and the two human pages this app links to
  (`listenbrainz.org/artist/{mbid}/`, `www.deezer.com/artist/{id}`). They are
  stated as facts above and no longer carry `(unverified)`.
- *Still unverified, and carried through as such*: whether `Api-User-Agent` is
  acceptable to MusicBrainz (moot — the app sends no custom header),
  ListenBrainz's redistribution licence, any Wikimedia pageviews rate limit,
  and the real coverage of Deezer's single-artist-ISRC path, which the browser
  walkthrough measures first.
- *Not done: exporting the identity and reach rows.* Research §4.3 suggests
  putting all three caches inside the existing zip so a laptop run can reach
  the phone. The app has no export surface at all today and adding one is a
  separate feature, so this is out of scope rather than overlooked.

**Privacy.** What leaves the browser is Spotify artist ids, ISRCs from the
owner's own library, and the MusicBrainz ids and Wikipedia article titles
derived from them — to MusicBrainz, ListenBrainz, Deezer, Wikidata and
Wikimedia. ListenBrainz receives an MBID and neither an artist id nor an ISRC;
Wikimedia receives an article title and nothing else. No token, no user id, no
playlist and no listening history is ever sent anywhere. Nothing is published:
every number is stored in this browser's IndexedDB and shown only to the person
who fetched it. Spotify exposure stays in the tier research §4.5 allows: artist
ids, not Spotify Content, and no library-wide harvesting.

**Terms.**

- **Deezer** expressly contemplates "personal web pages, blog… and personal
  applications" (§I of their terms) and limits use to "a non-commercial
  purpose and in a non-commercial environment" (§IV). A working DJ preparing
  paid sets is arguably commercial; **the owner accepted that framing for this
  personal app on 2026-09-05** (research §6, question 2). The useful negative:
  no clause restricts caching or local storage, so the IndexedDB design is
  clear. §II(c) reserves the right to withdraw access without notice, and
  JSONP has been toggled before, so the app degrades to "no Deezer number"
  rather than to an error screen.
- **MusicBrainz** asks for a self-identifying User-Agent that browser
  JavaScript cannot set. The app sends no custom header, stays at 1 req/s and
  backs off on 503 (§3.1).
- **ListenBrainz** is keyless and open; its redistribution licence was not
  read **(unverified)** and is very likely moot, since the numbers are shown
  only to the person who fetched them. Its documented *popularity* endpoints
  moved behind auth during the research, so this endpoint could close the same
  way: a failure there is a source that pauses, never a broken screen.
- **Wikidata is CC0**; **Wikipedia figures are CC BY-SA 4.0**. Both are
  credited on the Settings card, permanently:
  `Artist data via MusicBrainz and ListenBrainz · Deezer · Wikidata (CC0) · Wikipedia (CC BY-SA)`.
  Because the Wikipedia figure also renders on two screens a reader can reach
  without ever opening Settings, `Wikipedia figures CC BY-SA 4.0` sits under
  the Under the radar list (§5.3) and beside the Artist screen's `as of` date
  (§5.4), wherever a language count or a view count is shown.

**Sources deliberately not used.** Resident Advisor (origin allowlist *and*
terms 4.4(f) barring automated access), 1001Tracklists (no API), SoundCloud
(a client secret a static site cannot hold, on top of a paid tier), Beatport
(no anonymous token path), Discogs (its API terms forbid this app's
persisted-then-browsed caching, and the metric measures vinyl collecting
rather than reach), kworb and Bandsintown (no CORS header at all), Last.fm
(ToS 2.7 needs prior written approval), and the Spotify-scrape datasets on
HuggingFace and Kaggle — the BPM research's "do not use or re-host" ruling on
that corpus stands. Research §5 records each in one line so none of them is
researched again.
