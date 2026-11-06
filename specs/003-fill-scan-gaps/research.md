# Research: Fill the gaps of a worker scan

Checked on 2026-11-06 on the owner's computer (worker 0.2.0, yt-dlp 2026.10.26, the packaged ffmpeg n9.0.2) and against the
live public endpoints named below. Every decision keeps the worker's rules (`worker/CLAUDE.md`): one recognition at a time,
everything external injected in tests, no Spotify host, no key.

## R1. Gaps and the replay schedule

- **Revised at implementation (owner's pick, 2026-11-06)**: the worker already held the owner's first draft of a second pass;
  the owner chose to keep it: `gap_positions` — a place 7 s after each probe that found nothing, at most one every 30 s — each
  heard at ×1, then ×0.96, then ×1.04 (`cut_probe(speed=…)`, R2), stopping at the first match. Cost: up to 3 calls a place,
  about one place per two unmatched probes at a 15 s step. Settings `WORKER_SECOND_PASS_STEP_SECONDS` (30, 0 = off),
  `WORKER_SECOND_PASS_OFFSET_SECONDS` (7), `WORKER_SECOND_PASS_SPEEDS` (0.96,1.04). The rest of this section is the plan as
  first written.

- **Decision**: after the first pass, a **gap** is a maximal run of consecutive probes that produced no hit (no match or
  skipped), bounded by hits or by the set's start or end. In each run, probes 1, 3, 5… (counted from the run's start) are
  replayed, alternately at **+4 %** and **−4 %** speed (1st +4, 3rd −4, 5th +4…); probes 2, 4, 6… are not. A replay covers the
  same moment of the set as the probe it replays. The second pass starts once the first pass ends (the gaps are only known
  then), keeps the cooldown, the jitter and the rate-limit pauses of the first pass, and logs one line per replay
  (`replay 3/41 · 00:34:00 · −4 % · NEW · …`). `WORKER_REPLAY_SPEED_PERCENT` (default 4; 0 turns the second pass off).
- **Rationale**: the owner's words ("0-15s +4%, 15-30s no replay, 30-45 -4%, 45-60s no replay"). Half the unmatched probes is
  a bounded cost: on the LYL Radio set at 12 s every 15 s (≈520 probes, ≈70 % unmatched by the first comparison's rate) about
  180 replays, ≈ 12 minutes more at 2.5 s ± 50 % plus the answer time; under SC-003's 75 minutes for 2 h.
- **Alternatives**: every unmatched probe at both speeds (×2 calls on gaps, 3× the owner's budget); shifted offsets at normal
  speed (the first pass already steps every 15 s with 12 s probes, 3 s apart: a shift adds little); a replay at 0 % (the same
  probe again: Shazam answered no already).

## R1b. Fewer calls (owner, 2026-11-06, from the Artaphine run)

- **Evidence**: on Artaphine (1 h, 241 probes, 28 tracks on the first pass) the second pass made 75 calls before its third
  refusal: ×1 49 calls → 4 new tracks, ×0.96 18 → 3, ×1.04 8 → 0; 34 calls only re-found a track already known. Shazam refused
  at about 150, 100 and 100 calls apart whether the calls were 5 s or 10 s apart: a count over a window, not the spacing.
- **Decision**: (1) `inside_known` drops a run of misses with the same track just before and after it within the merge gap
  (180 s): replayed on the Artaphine log, places fall from 75 to 47 and all 7 new tracks are kept; (2) a planned break of
  `WORKER_BREAK_SECONDS` (180 ± 40 %) after every `WORKER_BREAK_EVERY_CALLS` (80) calls, a rate-limit pause resetting the
  count. ×1 and both speeds stay (owner).

## R1c. Retries refined (owner, 2026-11-06)

- The doubled pace after a refusal halves again after every `RECOVER_AFTER_CALLS` (40) calls without refusal, down to the base.
- A refusal (or 3 unanswered probes in a row) on the first pass with tracks already found ends the scan early and sends a
  **done** result with `mix_info.stopped_early {at, reason}` and the job's `error` set to "Stopped early at … ; ask again
  later for the rest" (shown next to Done on the phone); with nothing found it still fails.
- The ShazamIO HTTP client gets one attempt (it used to retry server errors up to 5 times, unlogged); a Shazam server error
  (`FailedDecodeJson`, status 5xx) is the worker's own "no answer" retry, logged and counted.
- A send to the server is retried after 30 s, 1 min, 2 min (± 40 %) when offline or a server error; paused, unauthorized and
  too large are not retried. Catalogue busy waits (2 s, 4 s) are spread ± 40 % too.

## R2. Speed correction with the packaged ffmpeg

- **Decision**: a replay at factor `f` (1.04 or 0.96) cuts `probe_seconds × f` seconds from the probe's start and filters
  `aresample=16000,asetrate=<16000·f>,aresample=16000`, so the output is exactly `probe_seconds` long, faster (higher) for
  `f > 1` and slower (lower) for `f < 1`, which is what a DJ's pitch fader does (speed and pitch together, no key lock).
- **Evidence**: on 2026-11-06, 12.48 s of input at `asetrate=16640` gave a 12.00 s WAV; 11.52 s at `asetrate=15360` gave
  12.00 s (the bundled ffmpeg, `lavfi` sine input). The same scratch-file path as D4 of round 002 (no pipe: the WAV header).
- **Alternatives**: `atempo` (changes speed but keeps pitch: not what a pitch fader does; Shazam's fingerprint is pitch
  sensitive); `rubberband` (not in the build).

## R3. Clues: description, comments, chapters through yt-dlp

- **Decision**: after the download, one more `extract_info(url, download=False)` with `getcomments: True`, `socket_timeout:
  20`, YouTube `max_comments: 500` (extractor argument), run in a thread joined after **90 s**; whatever has not arrived by
  then is dropped and logged. From the info dict: `description` (every platform), `chapters` (YouTube: `start_time`, `title`),
  `comments` (`start_time` seconds on SoundCloud — `yt_dlp/extractor/soundcloud.py:446`; on YouTube `start_time` is absent,
  so a clock at the head of the comment's text, `12:34 …`, gives its position, else the comment is set-wide and dropped
  unless it parses as a tracklist line).
- **Evidence**: the LYL Radio set on 2026-11-06: `description` 1 000+ characters (no tracklist), 1 comment with
  `start_time 623.373`. A separate call keeps the download path exactly as today (FR-008: a comment failure never touches it).
- **Alternatives**: comments in the download call (a slow comment page would delay or fail the download); SoundCloud's API
  directly (yt-dlp already handles its client id); 1001Tracklists (no API, its terms forbid scraping — out).

## R4. Reading "Artist – Title" lines

- **Decision**: a Python port of the app's line rules (`src/features/mix/parse.ts`: clock prefixes, index and side prefixes,
  ` - `/` – `/` — ` split, trailing `[Label]`), in `worker/mix_worker/clues.py`. The description uses the app's run guard
  (≥ 5 matching lines in a run, `MIX_DESCRIPTION_MIN_RUN`) so prose is never read as tracks; a comment or chapter is one
  clue, read as a track line only when the whole text (after an optional clock) is one `Artist – Title`. Cases shared with
  the app: `src/features/mix/parse.cases.json`, read by `parse.test.ts` and `worker/tests/test_clues.py`, so the two parsers
  cannot drift.
- **Comment rules, from the owner's five sets (R8)**:
  - a leading reply mention is dropped: `@handle: ` or `@handle ` (a reply on SoundCloud carries its question's
    `start_time`, so the answer sits at the moment asked about);
  - **separators are not standard** (owner, 2026-11-06): ` // ` in the Whomp set is one DJ's habit; others use new lines,
    ` / `, ` | `, `•`, `·`, `;`, `,`, numbering (`1. … 2. …`, `1) …`) or a clock before each track (`00:00 … 05:30 …`). The
    reader never hardcodes one: after dropping an optional leading `Tracklist`/`TL`/`Track list` word and colon, it splits the
    text by each candidate in turn — clocks and numbering as **item starts**, the others as **separators** — and keeps the
    split giving the most pieces that parse as `Artist – Title` (R4's line rules), provided at least 3 do and they are at
    least two thirds of the pieces; ties go to the split with fewer pieces (so ` / ` inside "Deep Inside / Orbit" never wins
    over a cleaner split). Such a comment is a **set-wide tracklist** (its comment position is meaningless: the DJ posts it
    anywhere); pieces carrying a clock keep it as their time. Pieces that do not parse are kept as text. A comment where no
    split reaches 3 is one clue, read as one track line or as text;
  - a line whose title is `Unreleased`, `ID`, `???`, `?` names no track: kept as text, never looked up;
  - a line with two ` - ` (`Stefano Greppi - Danilove - Politics is a jungle`) is tried both ways (artist = first part, or
    first two parts); equality decides, never a guess;
  - a title followed by a sentence (`Mary Mac. Vinyl only`) is tried as written, then cut before the first `. `/`! `/`? `.
- **Alternatives**: calling the TS parser (no JS runtime is guaranteed); a looser comment rule (chatter like "omg - what a
  drop" would become lookups; the catalogue's equality check would still refuse, but at the cost of calls).

## R5. The catalogues for name lookups: Deezer, then MusicBrainz

- **Decision**: `GET https://api.deezer.com/search?q=<artist> <title>&limit=10` (free text; keyless), one at a time, at most
  **1 lookup per 0.2 s** and **100 per set**. A result is accepted only when (a) its `artist.name` and the clue's artist share
  an `artistCore` over the clue's artist runs, and (b) its `title` equals the clue's title under `sameTitle(cleanTitle(·))`, or
  its `title_short` does and its `title_version` is empty — so a remix is accepted only when the clue names it. The first
  accepted result gives `isrc` (present in the search answer), `link` and `id`. Ported rules: `normalize`
  (`src/model/normalize.ts`), `cleanTitle`, `artistRuns` (`src/features/rekordbox-match.ts`), `artistCore`, `sameTitle`
  (`src/features/mix/spotifySearch.ts`), with shared cases in `src/features/mix/match.cases.json` read by both suites.
- **Evidence**: 2026-11-06, `q=Rosie Gaines Closer Than Close` → `Closer Than Close (Mentor Original Radio Edit)`, `title_short
  Closer Than Close`, `title_version (Mentor Original Radio Edit)`, `isrc GBCVW0700091`: a clue "Rosie Gaines – Closer Than
  Close" makes **no** candidate from that row (a version not named), as the spec wants. The fielded form
  `q=artist:"Rosie Gaines" track:"Closer Than Close"` answered `total: 0` the same day: not used. Deezer is already one of the
  app's keyless sources (artist reach, ADR-04); its documented limit is 50 requests per 5 s.
- **Then MusicBrainz** when Deezer accepts nothing: `GET https://musicbrainz.org/ws/2/recording?query=artist:"…" AND
  recording:"…"&fmt=json&limit=5`, User-Agent `myOwnSpotifyData-worker/<version> (https://github.com/vaTheo/myOwnSpotifyData)`
  (no email), 1 request per 1.1 s; the same equality rules on `artist-credit[0].name` (and the credit's other names) and
  `title`; the recording's MBID kept, its ISRCs only if the answer carries them (no second call). The score is ignored:
  equality decides.
- **Evidence (2026-11-06, the owner's sets)**: Deezer finds `Space Above – Leave Home (Edit Select Remix)` (ISRC
  NLCK41072412) for the comment "Space Above - Leave Home Edit Select Remix" and `Rrose – Onceless (Original Mix)` for "Rrose -
  onceless", but nothing for "JALA - Not Surrender", "The Real - Mary Mac", "Nigm - Sunken", "Ina Kacz - Visionary";
  MusicBrainz finds `Jala – Not Surrender`, `The Real – Mary Mac`, `Nigm – Sunken` (score 100), not Ina Kacz nor IPAR.
  Underground and vinyl-only tracks are MusicBrainz's ground; a candidate without ISRC is searched by name by the app's
  existing Create playlist and is "not found" when Spotify does not have it.
- **Budget**: `WORKER_LOOKUPS` (100) counts clues looked up, each at most one Deezer and one MusicBrainz call: a 30-line
  description takes about a minute.
- **Alternatives**: Discogs search (needs a token: out); Spotify Search (the worker never calls Spotify, Principle III).

## R8. Links in a clue, and the five reference sets

- **Decision**: a clue whose text is a link to one release or track by id is read by that id, keyless: a Discogs
  `…/master/<id>` or `…/release/<id>` → `https://api.discogs.com/masters|releases/<id>` (25 requests a minute without a
  token; artist names lose Discogs' ` (2)` suffix); a Deezer `…/track/<id>` → `https://api.deezer.com/track/<id>`. A release with
  exactly one track becomes a candidate (its artist and track title confirmed by R5's rules); a release with several tracks
  (`Rouge – Deep Inside / Orbit`, 2 tracks, master 320251) only enriches the clue's text ("Discogs: Rouge – Deep Inside /
  Orbit"), never a candidate. Other links (Spotify, Bandcamp, YouTube) stay text.
- **Reference sets** (owner, 2026-11-06), saved anonymised (authors as `listener N`, mentions as `@someone`) in
  `worker/tests/fixtures/clues/`; the split search is also tested on the same Whomp list re-written with each other separator
  (new lines, ` | `, `•`, `;`, numbering, clocks), so no separator is privileged:

| Set | What it holds | Expected |
|---|---|---|
| `whomp023-mars-o10c` | the DJ's tracklist in one comment, ` // ` separated (one DJ's habit, not a standard), with `???`, `Unreleased`, a two-dash line | 15 set-wide pieces (14 tracks and `???`) found by the split search; `???` and `Von Riu - Unreleased` not looked up |
| `vault-sessions-105-tauceti` | "track id?" answered by the DJ `@someone: Space Above - Leave Home Edit Select Remix` at 51:32; a question naming another time ("starts at 27:23") | one candidate at 51:32 (Deezer, ISRC NLCK41072412); the question stays a clue |
| `tauceti-artaphine-series-092` | replies `@someone: JALA - Not Surrender` at 12:05, `@someone: Rrose - onceless` at 4:02 | two candidates (MusicBrainz; Deezer) |
| `naone-the-lot-radio-01-11-2025` | `@someone The Real - Mary Mac. Vinyl only` at 8:15 (no colon), a Discogs master link at 41:59, many "ID?" | candidate The Real – Mary Mac (MusicBrainz, after the sentence cut); the Discogs clue enriched, no candidate |
| `closing-at-nuits-sonores-…` | 31 `Artist - Title` lines in the description, no times | 31 set-wide lines; candidates where a catalogue has the exact pair (Nigm – Sunken via MusicBrainz) |

## R6. A refused second pass keeps what was found

- **Decision**: the second pass returns `(hits, stopped)`; a `RateLimited` beyond the pauses or 3 probes in a row without
  answer stops it (`stopped = "rate limited" | "no answer"`) and the scan sends the first pass's rows plus the replays' hits,
  with `mix_info.second_pass: {replays, found, stopped}`; the first pass keeps its 002 rules (a refusal there still fails the
  request — not in this round's scope).

## R7. The result's additions and the app

- **Decision** (data-model.md): a track gains optional `origin` (`"replay"` or `"clue"`), `speed_percent` (replays), and
  `clue` (candidates: the clue's author, position, text); `mix_info` gains `gaps: [{start, end, clues: [...]}]` (positions in
  seconds, only the gaps still empty after the second pass and the clues they hold) and `clues: [...]` (set-wide lines).
  The app's import (`tracklistify.ts`) ignores unknown keys today, so an older app reads the rows as before (FR-014). The
  app maps them to `TracklistRow.origin?`, `speedPercent?`, `clue?`, gap rows with `clues?`, and `MixRow.clues?`: optional
  fields, no `DB_VERSION` bump (ADR-05); `validateMix` checks them on pull (strings, ≤ 1 000 characters per text, ≤ 30 clues
  per gap, ≤ 200 set-wide).
- **Size**: clues are cut nearest-gap first so the result stays under `WORKER_RESULT_MAX_BYTES`; the cut is logged.
