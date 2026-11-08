# Research: Shared track facts

## D1 Numbering and what exists

`origin/main` (2026-11-08): specs 001 to 013, ADR-01 to ADR-14, inventory up to F29, migrations 0001 to 0003 (`0001_init`, `0002_jobs`, `0003_job_control`).
**Decision**: round 014, ADR-15, F30, `0004_shared_facts.sql`, constitution 2.5.0. Re-check `git ls-tree origin/main` before the first commit; numbering is shared across branches.

## D2 Accepted ranges (from the code)

- **BPM**: `reccobeats.ts` `toFeature` keeps `tempo > 0` as `bpm`, else null. **Decision**: the store accepts `30 <= bpm <= 300` (numeric, null allowed). A DJ library sits in 60 to 200; the wide
  bounds still refuse 0, negatives, 10,000. The client applies the same bounds before sending, so a value ReccoBeats returns outside them is simply not shared.
  Constants `SHARED_BPM_MIN = 30`, `SHARED_BPM_MAX = 300`, pinned equal to the SQL by a test that reads the migration.
- **Key**: `toFeature` keeps an integer `0..11` (pitch class, C = 0), `KeySig` in `model/keys.ts`; `major` is true, false or null (`mode` 1, 0, else). **Decision**: `key smallint` check `between 0 and 11`;
  `major boolean`; `major` may not be set when `key` is null. The "known set" is these 24 pitch-class and mode pairs plus the partial forms below.
- **At least one half**: a row needs `bpm` or `key` non-null (a row with neither is a not-found marker and is never shared; ReccoBeats not-found is per user, 90 days, `LOOKUP_NOT_FOUND_TTL_MS`).
- **Energy** (also in `FeatureValue`) is not shared (spec: BPM and key only). A store hit writes `energy: null`. `grep energy src/` shows no screen that needs it for ranking; check before T016.
- **Source label**: `text check (source in ('reccobeats'))`; the column exists so a later source can be added by a migration. Rekordbox is never a label here.
- **Id shape**: Spotify ids are 22 base-62 characters: `^[0-9A-Za-z]{22}$` for track and artist ids.

## D3 Freshness

- **BPM and key**: none. `lookup.ts` `isFresh` treats a found value as final forever; a tempo does not change. A shared row never expires; correction is the owner's job in the dashboard (spec edge case).
- **Reach**: `reachRun.ts` `isDue`: an `ok` row is fresh for `REACH_TTL_MS` = 90 days. **Decision**: a shared number is used only while `startedAt - measuredAt < REACH_TTL_MS` (the same constant, imported, not copied) and only for a pair
  (artist, source) whose local row is due. `notFound` and `retryLater` are never shared (they are per user and carry a gate). Only `ok` rows of `listenbrainz` (listeners, `total_user_count`) and `deezer` (fans, `nb_fan`) are shared:
  Wikipedia views depend on a per-user identity row (titles), and the spec names listeners and fans.

## D4 Table and policy design

See [contracts/server-sql.md](contracts/server-sql.md). In short: `shared_track_facts (track_id pk, bpm, key, major, source, added_at)` and `shared_artist_reach (artist_id, source, measured_on, value, added_at; pk on the first three)`;
no user column (FR-001); RLS enabled; one insert policy `to authenticated with check (true)` (the check constraints do the validating); **no** select, update or delete policy, and the grant is `insert` only (belt and braces: no policy and no grant).

## D5 Reading by id with no list

PostgREST filters (`?track_id=in.(...)`) need a select policy, which would also allow `?select=*` to page everything. **Decision**: two `security definer` functions, `get_track_facts(ids text[])` and `get_artist_reach(ids text[])`, `set search_path = ''`,
fully qualified names, `language plpgsql stable`; each raises `'too many ids'` above **200** and returns only rows whose id is in the array; `execute` granted to `authenticated` only. The array cap is the anti-enumeration measure: a caller can
still try ids it guesses (Spotify ids are public, spec assumption), but needs 5,000 calls to walk a million guesses and gets nothing it did not name. `get_artist_reach` returns the newest row per (artist, source) (`distinct on`).
Callers cannot learn anything about another user: rows hold no user.

## D6 Insert only, so "the stored value is unchanged" and "a newer number replaces an old one"

- **Tracks**: primary key `track_id`; the client sends `Prefer: resolution=ignore-duplicates` with `?on_conflict=track_id`, so a second submission is silently dropped and the stored row is unchanged (US3 scenario 2, two users at once: one wins).
- **Reach**: the key includes `measured_on` (a date), so a newer measurement is a new row; the read function returns the newest per (artist, source). Rows are small (one per artist, source and day at most); growth is bounded by the 90-day refresh.
  `measured_on` check: `between current_date - 7 and current_date + 1`, so a client cannot post a far-future date that would pin a number as "newest" forever or a stale one as fresh.
- **Risk to verify on the real project** (quickstart step 4): `INSERT ... ON CONFLICT DO NOTHING` under an insert-only grant. If Postgres asks for a select privilege on the conflict column, the fallback, in order: (a) `grant select (track_id)` as a column
  grant (no select policy exists, so a query returns zero rows anyway); (b) `add_track_facts(rows jsonb)` as a third definer function. Decide at the manual check, record in ADR-15.

## D7 Where the shortcut hooks in

- **BPM and key run (`lookup.ts` `runLookup`)**: `todo` is the candidates whose `reccobeats` field is not fresh (a rekordbox value does not make a track fresh: today such a track is still looked up on ReccoBeats, and stays so). New step before pass 1:
  ask the store for `todo` ids in batches of 200 (`PASS_SHARED = 'shared store'`, shown while it runs). Each valid hit becomes the same `FeatureRow` an outside hit becomes (`withReccobeats(rows.get(id), candidate, value, null, at)`: only `reccobeats` is written; the row's
  `rekordbox` is spread through untouched, as today), counted in `found`, removed from `todo`. Pass 1 and pass 2 then run on what remains. After each outside batch's `write`, the found values (built from the `FetchedFeature` only, never from a row) are queued and sent in a
  batch of up to 200 (`shareTracks`), after the local write, so a store failure never loses a local row. The year pass is unchanged (D9).
- **Rekordbox never sent, never overwritten**: submissions are built from `FetchedFeature` fields (`bpm`, `key`, `major`) in the run, so there is no code path from `row.rekordbox` to the port; a store hit is written into `reccobeats` only. A test puts a distinct rekordbox value on a row and asserts the submitted bodies
  contain neither it nor `rekordbox`, and that the row's rekordbox is byte-equal afterwards. The import (`rekordboxImport.ts`) is not touched and has no port.
- **Reach run (`reachRun.ts` `runReach`)**: before `musicbrainzPhase`, for candidates with a due `listenbrainz` or `deezer` row, ask `readReach` in batches of 200; for each valid, young `ok` number write the local `ArtistReachRow` through `writeReach` (`status: 'ok'`, `value`, `fetchedAt: measuredAt`,
  `retryAfter: null`, `sourceUrl: 'https://open.spotify.com/artist/<id>'`: the source's own page URL needs an MBID or Deezer id the run may not have yet, and the row's `sourceUrl` must stay an `https:` link for `validate.ts`; the Settings card says the number came from the shared store). The listenbrainz and deezer phases then skip those
  artists through `reachDue`. The MusicBrainz, Deezer-id and Wikidata identity steps still run for the user's own `artistIdentity` rows (not shared this round); the saving is the ListenBrainz request (1/s) and the Deezer fans request per known artist. After the listenbrainz and deezer phases (checkpoints), the run's own `ok` rows (outside answers
  only, tracked in a set) are sent with `measured_on` = the run's start date. `lookedUp` counts only artists asked outside; `written` counts store hits too, so `reachChanged` pushes them.
- **Pacing test** stays green: the shortcut adds no sleep, no `fetchFn` call to a source, and `deps.shared` is optional (absent in that test).

## D8 Failures (FR-007, SC-004)

The port never throws and every call has a 10 s timeout (`AbortSignal.timeout` on the injected fetch). On the first failed read or write in a run, the port is switched off for the rest of the run (no retry loop, no slow-down), the run continues outside, and the done state carries
`shared: { fromStore, sent, error }`. `error` is the server's message (`offline`, `unauthorized`, `paused`, a refused-rows message). No port is built without server settings, a session or outside the real app (demo). Not signed in or paused: `sharedPort()` returns undefined and the card
says nothing (FR-008); an actual failure says why. A refused batch (400 from the check constraint) is reported with its count; it cannot happen for rows the client pre-validated, so it signals a client/server version mismatch.

## D9 Spec problems found (settled with the owner 2026-11-08: 1 measured on the by-id and ISRC passes; 2 partial rows stay partial; 3 newest dated row; 4 no backfill, the owner clears existing results and re-runs; spec.md amended)

1. **SC-001** says the second user's run finishes the shared tracks in under 1 minute. The BPM and key run also has the release-year pass (round 005): one album request per found track, 1 per second, and years are explicitly not shared this round. A store hit has no ReccoBeats id (`rid`), so the year pass also asks `fetchTrackRids` (40 per request) first.
   The by-id and by-ISRC passes meet SC-001; the whole run does not. Recommendation: measure SC-001 on those two passes, and queue "share release years" in Limits and roadmap as the next round.
2. **Edge case "a later full result may fill the missing half only"** needs an update, which FR-002 forbids. Plan: not built; a partial row stays partial for everyone (the user whose run finds it complete still fills their own copy). Options for the owner: accept this, or add a third definer function that fills a null column only.
3. **US4 scenario 2** ("the store keeps the newer") is met by appending a dated row and reading the newest (D6), not by replacing, because of the same rule. Behaviour is as the spec wants; the storage is not "one row per artist".
4. **FR-009 versus value**: tracks already looked up before this round are never contributed (the store receives only what a run's outside lookup returns). The owner's existing library therefore fills the store only as new tracks are looked up. A one-time "send what I already have" would need an owner decision.
5. The MusicBrainz and Deezer-id identity steps are not shared, so the reach shortcut saves less than the BPM one (D7).

## D10 Risks recorded

- A wrong value stays wrong for everyone until the owner fixes it in the dashboard (dashboard SQL uses the service role and bypasses the rules).
- A malicious account holder can insert a bad-but-valid value for an id nobody has looked up yet (only an unknown id; a known id is immutable). The ranges bound the damage; the owner creates every account (ADR-14).
- Spam: an account can insert many rows. Bounded by the free tier, by the owner creating accounts, and for reach by one row per artist, source and day. Settings already shows used storage.
- The store tells the server which tracks a user has asked about (spec assumption, same as sync).
