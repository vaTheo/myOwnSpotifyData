# Shazam on DJ mixes: what makes a scan accurate (2026-11-13)

> **Status**: Reference (measured on the dates below; Shazam's behaviour may change)
> **Last updated**: 2026-11-13

The owner's question: the worker's scan of a DJ mix lists many tracks that are not in the mix, yet some real tracks show up once,
at a low %. How should Shazam be asked so that real tracks are found and wrong ones are not, without losing the real track found
once? The owner's guesses were the way the sound is sent, the sample length and the sample rate.

This note holds everything the research found: desk research (2026-11-12), 2,406 live probes on four mixes (2026-11-12 and 13),
the options and what each was **measured** to gain and lose, and a second web round. Nothing in the worker was changed.

## 1. Short answer

1. **The sound format is not a lever.** Sample rate, channels, loudness and a longer window change nothing (§5.1). The one hard
   rule: a probe shorter than 12 s finds nothing unless it is padded with silence.
2. **Speed is the lever on finding.** Shazam hears a track only within about ±5 % of its original speed (§5.2).
3. **Wrong rows cannot be avoided, only labelled.** Outside its speed window, or on a track it does not hold, Shazam often names
   another track instead of nothing: old dance hits ("magnets") or tracks sharing a loop with the played one ("twins") (§5.3).
4. **One signal separates real from wrong and never failed: the position in the track advances in step** between two windows
   that share no audio (§5.4). Shazam returns that position; the worker throws it away.
5. **The % column is a speed measure, not a certainty** (§4).
6. **Measured on three saved results** (§6): keeping the evidence and labelling rows (option A) marks a core of rows as certain,
   with no wrong row among them and no extra call. One more label, also free, marks 27 more of the removed rows of the hardest mix;
   10 others are rows the worker no longer lists since 0.7.2 (§6.3). Confirming rows heard once (option B) promotes 0, 1 and 2 more rows for 14, 38 and 232 extra calls.
   Scanning a whole mix again at the DJ's speed (option C) found no track the result lacked.
7. **What stays unsolved:** on the hardest mix, 72 of 127 rows stay plain "heard once", 32 the owner kept and 40 the owner
   removed, and nothing measured tells them apart. The owner's word after the measurement (2026-11-13): most of those 32 are
   wrong too, kept because they are good tracks to hear. So on that mix nearly every row that is not Solid is wrong.

## 2. Method

**Round 1, desk research (2026-11-12).** Six notes, each checked by a second reader: the library (ShazamIO 0.9.0 and
shazamio-core 2.0.0 source), Shazam's algorithm (the 2003 paper, the patents, the open clients), published work on DJ mixes, other
tools and practitioners, sound preparation, and the owner's past scans.

**Round 2, live probes (2026-11-12 and 13).** A throwaway harness, outside the repository, cuts probes from a mix with the
worker's own ffmpeg and library and keeps Shazam's **whole** raw answer. It asks one probe at a time, 6 s or more apart, and
waits while the worker scans. 2,406 probes were sent: 1,866 in the first batch, 540 for the gain and loss tables.

| Mix | Length | Truth used | Scanned by the worker |
|---|---|---|---|
| A | 82 min | the artist's tracklist, 31 entries, no times | yes |
| B | 123 min | a tracklist found on the web, timed, some titles cut, two "unknown" stretches; TrackId.net knows the mix | yes |
| C | 147 min | a tracklist confirmed by the artist, timed, 29 entries | no (the download failed twice) |
| D | 182 min | none; the owner's own marks on the saved rows, **kept** or **removed** ("kept" includes wrong rows the owner likes) | yes |

All four are techno, trance, acid or EBM sets. Unreleased tracks are normal in them, so silence in places is expected.

**Round 3, a second web round (2026-11-13),** on the questions the probes raised (§7), and three checks its findings suggested,
run on the answers already held (§6.3).

**Checks.** Every batch of numbers was re-derived by independent readers who did not see the analysis scripts; the corrections
they found are folded in. The last tables (§6) were re-derived with a second script written independently.

**Pace met.** One refusal after about 250 calls in 16 minutes at 3 to 4 s between calls. At 6 to 8 s idle between calls: one
refusal in 2,153 calls (it came right after 426 calls in one hour). The worker's default pace (about 2 s before each call) met a
refusal about every 250 calls in its own log.

## 3. What the worker does today

Read in `worker/mix_worker/scan.py` and `config.py`; nothing here is new, it frames the findings.

- First pass: a 12 s probe every 15 s, mono 16 kHz, at normal speed.
- Second pass: only where the first pass named **nothing** (and not between two probes of one track), one place every 30 s, 7 s
  after the missed probe, re-cut at ×0.91, then ×1.09, then ×1 (`second_pass_order`). A place leaves the list at the first speed
  that names a track. A place where the first pass named any track is never asked again.
- `track_entry` keeps the track and one "confidence". The position in the track, both raw skews, the match ids and the other
  matches are dropped.
- Every answer becomes a hit. Hits of one track within 180 s merge into a row (`merge`). A hit strictly between two hits of
  another track is dropped (`drop_sandwiched`). There is no threshold on the % or on the number of hits.
- `WORKER_MAX_SKEW` (0.1) rejects an answer whose larger skew is above 10 %.
- A probe shorter than 12 s is sent as it is: the last probe of a mix, or any probe when `WORKER_PROBE_SECONDS` is set under 12.

## 4. What Shazam returns

An answer holds `matches[]` and one `track`. Each match has `id`, `offset`, `timeskew` and `frequencyskew`.

- **`offset`** is the position in the catalogue track, in seconds, where the probe starts. Apple documents the same field in its
  SDK as "the timecode in the reference recording that matches the start of the query".
- **`timeskew`** is the tempo difference and **`frequencyskew`** the pitch difference between the probe and the catalogue track.
  A pitch fader moves both together (timeskew ≈ frequencyskew). Key lock moves the tempo only (frequencyskew ≈ 0).
- **Speed in the mix.** A probe re-cut at speed `s` reports skews relative to the re-cut audio. The track plays in the mix at
  `(1 + timeskew) / s`. Second-pass answers must be mapped back this way before anything is judged.
- **Several matches** are not a score. Where the entries agree on speed and position they are copies of one recording
  (compilations, remasters). More often they disagree, hundreds of seconds apart in their tracks: several candidates. On mix C,
  100 of 118 true answers carry one entry, 8 carry entries that agree and 10 entries that disagree; of 17 false answers, 5 carry
  one entry and 12 entries that disagree.
- **No score.** The answer of the endpoint the library calls holds no confidence. Apple's SDK has one since iOS 18.4 and
  macOS 15.4 (`SHMatchedMediaItem.confidence`, 0.0 to 1.0), but that SDK needs an Apple platform (§7).

**The worker's % is a speed measure.** `confidence_of` is 0.6 × a frequency score + 0.4 × a time score, each
100 × (1 − min(|skew|, 0.1) / 0.1). A real track played 4.8 % fast reads 52 %. A wrong answer at original speed reads 100 %. For
a second-pass row the skews are those of the re-cut audio, so a track played 9 % fast and found at ×0.91 reads 96 %.

## 5. Findings

### 5.1 The sound format is not a lever

- The library computes a signature locally (mono 16 kHz, four bands from 250 to 5,500 Hz) and sends only that. The sample rate
  and channels of the probe never reach Shazam.
- Live, on 15 places inside real tracks of mix C: at 5 easy places the listed track was named 5 of 5 times by each of 12 s mono
  16 kHz, 12 s stereo 44.1 kHz, 12 dB quieter, and a 14 s window. At 10 hard places it was named 0 of 10 times by each.
- Window length on 8 real places of mix A: 8 s 0 of 8, 10 s 0 of 8, 12, 13 and 14 s 8 of 8. Short audio padded with silence to
  12 s: 12 of 12. An 11 s probe without padding: 0 of 4.

### 5.2 Speed: Shazam hears within about ±5 %

Re-cuts of real hits of mix A:

| Change | Recognised | Not recognised |
|---|---|---|
| Pitch and tempo together (a pitch fader) | ×0.95 to ×1.05 | ×0.94 and below, ×1.06 and above |
| Pitch only | ±0.5 %, ±1 % | ±2 % and more |
| Tempo only | inconsistent from one track to the next | — |

- The limit applies to the **total** speed: a track the DJ already plays 1.55 % slow was recognised at −4.5 % and not at −5.5 %.
- The lower edge is not reliable: one track failed at ×0.95.
- **Outside the window Shazam may name a wrong track**: at +5.3 % total it named another track instead of nothing.
- Apple gives the same figure for its own SDK: "Keeping the skew to less than 5 percent should be safe" (WWDC 2022, session
  10028).
- A track really played with key lock was recognised from −3.5 % to +4.25 % total.
- The three speeds of the second pass cover −12.8 % to +15.4 % without a hole: ×1.09 hears −12.8 to −3.7 %, ×1 hears ±5 %,
  ×0.91 hears +4.4 to +15.4 %. The weakness is not the speeds; it is **where** and **in which order** they are asked (§3).
- Proof on mix D, where the DJ plays most tracks 4 to 8 % slow: on one 7-minute stretch, at ×1, 12 of 31 probes named a track,
  5 different tracks, none twice in step. At ×1.06 one real track answered 17 times, in step on 14 of 14 pairs. The reverse
  control: a track played at original speed answered 14 times at ×1 and 0 times at ×1.06.

### 5.3 Wrong answers: magnets and twins

- **Magnets** come back across mixes and DJs: "Alice Deejay — Better Off Alone" (wrong in three of four mixes, 13 times in one
  scan), "Darude — Sandstorm", "Rank 1 — Airwave", "Fragma — Toca's Miracle", "Faithless — Insomnia", "Tiësto — Adagio for
  Strings". Their answers carry 12 to 20 entries that disagree with each other.
- **Why these records.** No source names them, but each exists in far more catalogue entries than a techno record. On
  MusicBrainz (a proxy, not Shazam's index) the six magnets above have 139 to 311 recordings each, mostly on compilations,
  against 46 and 71 for two techno classics. The lead of "Better Off Alone" is sampled by at least seven later releases.
  Retrieval research calls such references hubs: "a song which occurs frequently as a false positive" (Aucouturier and Pachet,
  2007). A monitoring vendor flags a reference that "matches with many different sound recordings with different metadata".
- **Twins** share a loop or a sample with the played track. They repeat, with the position stuck or jumping.
- Wrong answers appear when the played track is outside the speed window, in a blend of two tracks, or absent from the catalogue.
  Published work says the same of this family of fingerprints: on real DJ mixes an open implementation was wrong in 32 to 49 %
  of the seconds where it named a track, and named a track in 51 to 75 % of the seconds where it held no reference (Sonnleitner,
  Arzt, Widmer, ISMIR 2016).
- Six or more entries: 2 of 294 true answers (they carry 6 and 14) and 9 of 46 false ones, on the three mixes with a tracklist.
  On mix D the number of entries sorts the unconfirmed rows better than anything else (§6.3).

### 5.4 What separates real from wrong

**In step (the strong signal).** Two answers naming one track, on windows that share no audio (12 s or more apart, at most 60 s),
are in step when the position advanced by the time between the windows × the playing speed, within 0.5 s.

| Data | True tracks in step | Wrong tracks in step |
|---|---|---|
| Mix C, windows 12 and 24 s from an answer | 23 of 26 | 0 of 17 |
| Mixes A and B, pairs of windows | 90 of 94 | 0 of 13 |
| Mix A, a full 15 s grid of 325 probes | all 15 real tracks | 0 of 5 wrong runs |

- True pairs are within 0.01 to 0.11 s. The closest wrong pair was 0.95 s off, so 0.5 s is the limit to use.
- **Windows must share no audio.** Windows 6 s apart also "confirmed" 9 of 24 wrong pairs.
- For 14 of the 17 wrong answers of mix C, the track really listed answered on a neighbouring window.

**Shape of the two skews (a flag, not proof).** Distance d = min(|timeskew − frequencyskew|, |frequencyskew|), on skews mapped back
to the mix: 0 for a pitch fader or key lock. True answers: d ≤ 0.003 for 293 of 294 (median 0.0002). Wrong answers: 19 of 46 also
pass. On mix D, 13 of 18 rows the owner kept fail it, so it must never delete a row.

**Not usable.** The number of hits or a % threshold (they would delete real rows heard once); whether the track's key equals the
match id; whether an ISRC is present; a comparison of the mix with the track's 30 s Deezer preview (it passed 12 of 15 real
tracks and 0 of 5 wrong ones on mix A, but kept and removed rows alike on mix D: it confirms similar audio, not that the track
was played).

**A small bonus.** In a blend, the second entry of `matches[]` is sometimes the other real track (3 of 217, 10 of 174 and 8 of
243 answers on mixes A, B, C). No track was gained from it on mix A.

### 5.5 Real tracks can read "out of step"

- On mix C, 3 of 26 true answers were named again with the position out of step: the DJ loops or jumps.
- On mix D, one real track's three worker hits sit at 29.7, 30.4 and 113.9 s into the track, 30 s apart in the mix. A denser scan
  shows errors of +6.9, +34.5 and −69.1 s: whole phrases (6.9 s is 16 beats at that tempo). Later in the same track every pair is
  in step. Whether the DJ loops the intro or the fingerprint locks onto a repeat cannot be told from the data.
- So "heard several times, never in step" holds both twins and real tracks at their mix-in. It is a warning, never a deletion.
- Published work knows the effect: "Since exact repetition is not uncommon, especially in electronic music, a query can be found
  at multiple, equally correct time offsets" (Six et al., TISMIR 2018). A DJ-mix benchmark leaves the position out of its
  scoring as "not meaningful for highly repetitive musical content" (Sonnleitner, Arzt, Widmer, ISMIR 2016).
- The example above fits a repeated intro better than a loop. Its three hits sit on three parallel lines 64 beats apart, one
  earlier and one later than the first; a loop can only move the position back.

### 5.6 The TrackId.net check is asked at the wrong speed

On mix D the saved result holds 11 TrackId.net rows. The worker's own Shazam check, asked at normal speed, says "agrees" for 2,
"differs" for 4, "no match" for 4. A scan at ×1.06 hears 5 of the 11 in step, among them 3 the check marked "differs" and 1 it
marked "no match": the DJ plays them 6 to 8 % slow, outside what a normal-speed probe can hear.

## 6. Options, and what each was measured to gain and lose

**A. Evidence, no extra call.** Keep per hit the position, both skews, the number of matches, the probe time and the cut speed.
Show the speed in the mix instead of the %. Give every row a level from its own hits: **Solid** (two hits in step), **Out of
step** (several hits, none in step), **Heard once**. Delete nothing on a level. Pad the last probe to 12 s and refuse a
`WORKER_PROBE_SECONDS` under 12.

**B. A, plus confirm.** For every row that is not Solid, two more probes 24 s before and after, re-cut so the track sits at its
original speed. In step: Solid.

**C. B, plus a wider second pass.** Also ask again, at other speeds, the places where the first pass named a track that is not
Solid, and keep the best answer instead of the first.

### 6.1 Measured on the worker's three saved results

Every Shazam row of each saved result was rebuilt from the worker's log (hit times and cut speeds), its windows were asked again
with the raw answer kept, and the levels were computed as the options would. "Good" means true (A, B) or kept by the owner (D);
"bad" means false or removed. Mix B has rows that cannot be judged (cut titles, unknown stretches): "unsure".

| | Mix A | Mix B | Mix D |
|---|---|---|---|
| Shazam rows in the saved result | 25 = 18 good, 7 bad | 29 = 10 good, 5 bad, 14 unsure | 127 = 47 good, 80 bad |
| Today, rows heard 2 or more times | 20 = 18 good, 2 bad | 14 = 6 good, 2 bad, 6 unsure | 22 = 11 good, 11 bad |
| **A: Solid** | 18 = 18 good, **0 bad** | 10 = 6 good, **0 bad**, 4 unsure | 11 = 11 good, **0 bad** |
| A: Out of step | 2 = 2 bad | 4 = 2 bad, 2 unsure | 13 = 2 good, 11 bad |
| A: Heard once | 5 = 5 bad | 15 = 4 good, 3 bad, 8 unsure | 103 = 34 good, 69 bad |
| **B: Solid** | 18 (no change) | 11 = 7 good, 0 bad, 4 unsure | 13 = 13 good, 0 bad |
| B: rows it promotes | 0 | 1 | 2 |
| B: extra Shazam calls | 14 | 38 | 232 |
| After B, not Solid | 7 = 7 bad | 18 = 3 good, 5 bad, 10 unsure | 114 = 34 good, 80 bad |

Read as gain and loss:

- **A gains certainty.** No bad row is Solid in any of the three results (39 Solid rows). On mix A every real row is Solid and
  every wrong row is flagged. Compared with "heard twice or more", which the app already shows, A removes the wrong rows that
  repeat (2, 2 and 11).
- **A loses nothing while every row stays visible.** If rows that are not Solid were hidden, the loss would be 0 good rows on
  mix A, 4 of 10 on mix B and 36 of 47 kept rows on mix D.
- **B gains little.** It promotes 0, 1 and 2 rows. On mix D that is 2 of the 34 kept rows heard once, for 232 calls. One of the
  two is the row the owner's question was about: a real track heard once at 60 %.
- **B never promoted a bad row** (0 of 7, 0 of 5, 0 of 80).
- **Neither A nor B sorts the rest of mix D.** Among the 114 rows left, a real-record shape with few matches is found on 10 kept
  and 13 removed rows: no help.
- Counted by song instead of by row, Solid songs under A then B: 15 then 15 of 22 on mix A, 10 then 11 of 29 on mix B, 6 then 8
  of 94 on mix D.

### 6.2 Option C, measured on the whole of mix D

The whole mix was asked every 30 s at ×1.06, which hears tracks played 0.9 to 10.4 % slow: 415 places with the earlier, denser
stretches; 173 named a track.

- **Gain: no new track.** 7 tracks are Solid at ×1.06. All 7 are already in the saved result: 4 as Shazam rows, 3 as TrackId.net
  rows. One of them was "Out of step" under A and becomes Solid.
- **Loss: more doubtful names.** 53 other tracks were named without a pair in step (101 answers), 42 of them absent from the
  saved result. Listed as rows, they would add to the trash.
- **Cost.** One more speed over a whole mix is about one call per 30 s: 364 calls on this mix. Today's second pass there asked
  505 place-speeds.
- What the scan missed at normal speed is therefore mostly absent from Shazam's catalogue, not hidden by the speed.

### 6.3 One more label that costs no call, and one the worker already makes useless

Checked on the same rows after the second web round suggested them.

- **Many candidates.** The answer of the row's first hit lists 10 or more entries.
- **Inside another track.** The row starts inside the stretch of a Solid song, more than 30 s from its ends.

Applied after "Solid" and before the other levels:

| Level under A | Mix A | Mix B | Mix D | Three results |
|---|---|---|---|---|
| Solid | 18 good | 6 good, 4 unsure | 11 good | 35 good, **0 bad**, 4 unsure |
| Inside another track | 3 bad | none | 10 bad | **0 good**, 13 bad |
| Many candidates | none | none | 3 good, 27 bad | 3 good, 27 bad |
| Out of step | 2 bad | 2 bad, 2 unsure | 1 good, 3 bad | 1 good, 7 bad, 2 unsure |
| Heard once | 2 bad | 4 good, 3 bad, 8 unsure | 32 good, 40 bad | 36 good, 45 bad, 8 unsure |

- **Correction (2026-11-13, found while building spec 029).** "Inside another track" is not a new gain. The three saved
  results were made by workers older than 0.7.2. Since 0.7.2 the worker drops a hit that lies between two hits of another song
  at most 180 s apart (the sandwich rule, spec 019), so a scan made today no longer lists those 13 rows at all. The label is not
  built.
- On mix D, 30 of the 80 removed rows carry a specific warning (27 Many candidates, 3 Out of step), with 4 of the 47 kept rows
  among them; the 10 "inside" rows are ones a current worker drops. The plain "heard once" pile falls from 103 rows to 72.
- With the cut at 6 entries instead of 10: 32 removed and 6 kept rows on mix D. At 3 entries: 40 and 11. No Solid row of any
  result has 3 entries or more.
- The cut was chosen on these data, and only mix D has rows it catches. It is a label to show, not a rule to delete on.

**Checked and found useless** for sorting the rows of mix D that are not Solid:

- *Tempo.* Catalogue BPM (ReccoBeats, by ISRC) × playing speed gives the tempo a track is played at. The Solid rows sit at 131 to
  132.5 BPM. Wrong rows land there too: within 1 % of the set's tempo are 34 of 60 removed rows and 5 of 11 kept ones, and 42
  rows have no BPM at all. The time skew maps a look-alike's tempo onto the mix by construction.
- *A busy neighbourhood.* The number of other tracks named within 60 s is the same for kept and removed rows (median 3).
- *A missing ISRC.* It points to kept rows on mix D (10 kept, 4 removed) and to wrong rows on mix B (3 bad of 4).

### 6.4 Recommendation after the measurement

1. **Build A, with the Many candidates label of §6.3.** It is where the measured gain is, and it costs no call.
2. **Do not build B now.** Its gain is real but small (3 rows over three results for 284 calls). It could come later as an
   optional setting.
3. **Do not build C.** On the mix where it should help most it found nothing new.
4. **A cheap extra worth its own decision:** ask the TrackId.net check again at the second-pass speeds when the normal-speed
   probe disagrees. Measured on mix D: 4 of the 8 failing checks are real tracks played slow (§5.6).

The pick is the owner's; this note only records the measurement.

## 7. Second web round (2026-11-13)

Aimed only at what the measurements raised. Three research agents opened the sources; their notes, with the quotes and the
queries tried, are kept with the data (§13). Lines marked ✓ were also opened by the author of this note. What the round says
about magnets and about position jumps is in §5.3 and §5.5.

**Scores and fields**

- ✓ A real confidence exists, in Apple's SDK only. `SHMatchedMediaItem.confidence`: "The level of confidence in the match
  result", 0.0 to 1.0, from iOS 18.4 and macOS 15.4
  ([Apple](https://developer.apple.com/documentation/shazamkit/shmatchedmediaitem/confidence)). In July 2022 Apple staff wrote
  that ShazamKit "does not expose any confidence levels currently"
  ([forum](https://developer.apple.com/forums/thread/710146)). The worker cannot use it: Linux, keyless.
- Apple's matcher holds a private score and speed skew: a developer printed `sh_score` and `sh_speedSkew` from a custom
  catalogue and noted they are not public ([forum](https://developer.apple.com/forums/thread/695585)). ShazamKit for Android
  has no confidence and no time skew.
- `retryms` in an answer means "send more audio": one open client sends again once its recording reaches that length.
- No source says what the number of entries of `matches[]` means on the endpoint the library calls; §4 gives what was measured.

**How a winner is chosen**

- Shazam's own patent (US 9,275,141 B2): "a candidate signature file with a longest continuity length may be considered to be a
  best matching file"; "candidates at incorrect offsets may eventually diverge from tracking and can be flagged and eliminated"
  ([patent](https://patents.google.com/patent/US9275141B2/en)). This is "in step".
- ✓ A rights service for DJ mixes does the same. Patent US 11,037,258 B2 (Dubset, Pexeso): blocks of 3 to 6 s; a match that
  recurs in successive blocks is more likely right; the start time in the release should advance with the block; results
  shorter than 7 s are purged; several passes with a wider tolerance for pitch and timing; the DJ's own tracklist text breaks
  ties ([patent](https://patents.google.com/patent/US11037258B2/en)). The first round found one open tool doing it: ACRCloud's
  scanner merges two hits only when the offsets advance with the mix time. No Shazam-based tool surveyed uses the offset.
- A 2025 fingerprinting paper fits a straight line through position against time with a robust regression and keeps the line
  with the most matches (Singh et al., [arXiv 2511.05399](https://arxiv.org/abs/2511.05399)): "in step", with the windows off
  the line dropped instead of counted against the track.
- **Every published system rejects a lone short hit**: at least 50 s in Sonnleitner's benchmark, at least 7 s merged in the
  patent. Their best figures on real techno (precision about 0.96) come only after dropping short plays. Keeping a row heard
  once, with a label, is this project's own choice, and no published method confirms such a row.
- A popularity prior is patented by Google (US 9,529,907 B2). Nothing shows Shazam uses one.

**Twins**

- They are a known research problem, sample identification: a fingerprint finds a track that shares a sample with the query
  (Gururani and Lerch, [ISMIR 2017](https://archives.ismir.net/ismir2017/paper/000118.pdf); Cheston, Van Balen and Durand,
  [2025](https://arxiv.org/abs/2502.06364)). A sample is told apart there by how short its aligned stretch is: 4.5 s on
  average, 25 s at most. A plain landmark fingerprint rarely names a sample's source, so the twins Shazam does name are
  probably long shared loops.
- No source tells "same recording" from "shares a loop" with only the track id, the position and the two skews of a 12 s window.

**Second opinions** (none usable by the worker: an account, a key, a price, or no interface for programs)

- AudD: a token; "First 300 requests for free", then $2 to $5 per 1,000. Its endpoint for long files returns, per 12 s, the
  position in the file and in the song, so "in step" could be applied to its answers.
- ACRCloud: an account; "14 days for the free trial"; it returns a real score (70 to 100) and both skews.
- audiotag.info: an account; free up to 3 hours of audio a month.
- ✓ TrackSniff (August 2025; free for 50 recognitions a month; five confidence tiers; a DJ school found "it correctly identified
  well-known tracks but also got several wrong", [article](https://www.digitaldjtips.com/tracksniff-shazam-alternative/)).
  ✓ set79 ("We leave gaps rather than guess"; it cross-references SoundCloud comments,
  [vendor blog](https://set79.com/blog/why-shazam-doesnt-work-on-dj-mixes)). ✓ Beatport Track ID (May 2026, "built specifically
  for DJs and electronic music environments", live listening in the phone app only,
  [article](https://www.youbeat.it/en/beatport-track-id-dj-music-discovery/)).
- AHA Music runs on ACRCloud's engine. SoundHound, Gracenote, DJ Monitor and Pex serve businesses only.

**The ceiling**

- No figure exists for the share of tracks of techno or trance sets that Shazam holds. Shazam took in Beatport's catalogue in
  2013 and Juno's archive, vinyl included, in 2014, so released records sold in those stores are probably held. What is missing
  is unreleased tracks, edits, dubplates and releases sold elsewhere only. This fits §6.2.
- In a data set of 4,902 mixes, mostly techno then trance, the communities fully identified 7 % of the mixes (Raveform, 2026,
  [site](https://mir-aidj.github.io/raveform)).

**Metadata and clues within the rules**

- Deezer answers `track/isrc:{ISRC}` without a key: BPM (often 0 on techno), release date, rank. MusicBrainz by ISRC gives the
  first release date but asks for contact details in the request. iTunes has no ISRC lookup; Discogs search needs a token.
- No published tool uses tempo continuity, key compatibility, label or year, or the other DJs who played a track, to reject a
  false identification. Tempo was tested here and fails (§6.3). Who else played a track cannot be reached within the rules: a
  name search, or a site that forbids robots.
- ✓ **Tested:** SoundCloud's timed comments sometimes name tracks. The yt-dlp the worker ships reads them (`--write-comments`;
  each comment has its text and its position in the mix), on the host and the exact link the worker already uses. On three of
  the four mixes: 51, 189 and 2 comments; 4, 0 and 0 of them name a track. On mix C, 3 of the 4 names are in the artist's
  tracklist at that position. Right when present, but rare, and Shazam had named those three already.
- Mixcloud's public interface reads without a key and has a `sections` field for a mix; it was empty on Mixcloud's own example.

**Pace**

- No maintainer publishes an accepted rate. SongRec moved its default interval to 10 s, then 8 s, and its owner wrote in
  February 2026 "I guess that Apple hardened their rate limit policy". Users report that a client which keeps retrying stays
  limited. This matches the record of §2.

## 8. From the first round, still true

- Tools that cut wrong rows do it by demanding repeats (three hits, "5 times in a row"), which deletes the real track heard once.
- Key lock is the common case: 2.5 % of 24,202 tracks of real mixes are transposed in key (Kim et al., ISMIR 2020, on
  1001Tracklists data). A varispeed re-cut is right for a pitch fader and adds a pitch error for key lock; the measurements above
  show Shazam tolerates only ±1 % of pitch.
- Some recordings give a confident wrong answer at many positions: a library maintainer measured one track right at 12 of 21
  offsets and a wrong track at the other 9.
- The Shazam app itself sends many requests for one recognition; one probe is one chance.
- 12 s is the library's window. 15 s or more is not sent.

## 9. Limits of this research

- The thresholds (0.5 s, 60 s, 0.003) come from four mixes and were set on the same data. Changing them changes little: see §10.
- Mix D has no tracklist. "Kept" is the owner's judgement and includes wrong rows the owner likes: by the owner's word
  (2026-11-13), most of the 32 kept rows that stay "heard once". The "good" counts of mix D outside Solid are therefore too
  high, and option B's two promotions out of 34 fit that: few of those rows were real.
- Mix C was never scanned by the worker, so it has no row-level table.
- Option B was asked at 24 s on each side only, and option C at one speed (×1.06) on one mix.
- The cut of the "many candidates" label (10 entries) was chosen on mix D, the only result where it catches rows.
- Key lock was tested less than the pitch fader.
- The saved rows were rebuilt by asking the same windows again. For 7 of 181 rows Shazam did not repeat the answer of the row's
  first hit.
- A track Shazam does not hold is never found, whatever is built.

## 10. Checks on the tables of §6

- **Independent script.** A second script, written without reading the first, rebuilt the rows from the same log and raw answers.
  It gives the same counts for every cell of §6.1 and for §6.2 (415 places, 173 answers, 7 Solid tracks, 53 other tracks, 42
  absent from the result). Its three verdicts: no false or removed row is Solid under A or B at any setting tried; B promotes
  3 rows, all true or kept; all 7 tracks Solid at ×1.06 are in the saved result, 4 as Shazam rows and 3 as TrackId.net rows.
- **Sensitivity.** The counts of §6.1 do not move when the tolerance goes from 0.2 to 1.0 s. When the two windows may be up to
  180 s apart instead of 60 s, one more kept row of mix D becomes Solid (12 under A, 14 under B) and still no bad row does.
- **What the labels cannot say.** On mix B, 4 Solid rows are "unsure" (cut titles or unknown stretches), so the "0 bad" there
  rests on 6 judged rows. The name matching drops text in brackets, so two remixes of one track count as one song.
- **Not re-derived.** §6.3 was computed once, with the first script only.

## 11. Rejected, and why

| Idea | Why not |
|---|---|
| Another sample rate, stereo, louder or quieter probes, a 14 s window | measured: no effect (§5.1) |
| A minimum number of hits, or a % threshold | deletes real rows heard once; the % is a speed |
| Deleting rows whose skews fit no real record | 13 of 18 kept rows on mix D fail it |
| Confirming on a window 6 s away | shares audio: also confirms wrong answers |
| The Deezer preview comparison | confirms similar audio, not the play; a new outbound host |
| Tempo plausibility (catalogue BPM × speed against the set's tempo) | measured: wrong rows sit on the set's tempo too (§6.3) |
| Thinning the signature | no evidence beyond one user report of 2020 |
| A paid or keyed second recogniser (ACRCloud, AudD) | breaks the keyless rule (ADR-04) |

## 12. Noticed, not done

- `WORKER_PROBE_SECONDS` accepts 2 to 12, and anything under 12 silently finds nothing.
- The comment "every place at ×1 first" in the second pass no longer matches the default order 0.91, 1.09, 1.
- `specs/002-mix-analysis-worker/research.md` is out of date on the device profile (D2, D3) and on the skew limit and the use of
  `matches[0]` (D5). `specs/003-fill-scan-gaps/research.md` R2 says rubberband is not in the build; it is, on Linux.
- [Limits and roadmap](../architecture/800-limits-roadmap.md) still describes the worker's pacing as one probe a minute.
- The worker's default pace meets a refusal about every 250 calls; 6 to 8 s between calls met one in 2,153. Other clients moved
  to 8 to 10 s in 2026 (§7).
- TrackId.net answered a research fetch with a challenge page (HTTP 403) on 2026-11-13. Not checked from the worker, whose scan
  of 2026-11-12 still got its rows.

## 13. Where the data is

The raw answers (2,406 records), the harness, the analysis scripts, the six desk-research notes and the web notes are kept by the
owner outside the repository: the mixes and the saved results are the owner's data, and the repository is public. The scripts
that produce §6: `rows.py` and `gainloss.py` (levels per row), `analyze_c.py` (option C), `partition.py`, `features.py` and
`tempo_and_entries.py` (§6.3).

## Links

- [How the app works](../architecture/000-how-it-works.md) §17, the worker
- [Limits and roadmap](../architecture/800-limits-roadmap.md)
- [ADR index](../architecture/700-adr/README.md): ADR-04 (keyless sources), ADR-08 (the worker), ADR-10 (name lookup for clues),
  ADR-17 (TrackId.net) bound any fix
- Worker research of earlier rounds: `specs/002-mix-analysis-worker/research.md`, `specs/003-fill-scan-gaps/research.md`
- [Documentation map](../README.md)
