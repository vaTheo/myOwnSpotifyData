# Quickstart: validating shared track facts

Prerequisites: the three gates green; a real Supabase project with `0004_shared_facts.sql` applied; two users (the owner and a second email) with libraries that share tracks; never the demo for steps 3 to 8.

1. **Automated**: `yarn typecheck && yarn lint && yarn test`, judged by exit code (not grep). `sharedFacts.test.ts` (accepted and refused rows, two users, server down, rekordbox never sent), `lookup.test.ts`, `reachRun.test.ts` (pacing test unchanged) and `rules.test.ts` cover the code side.
2. **Apply the migration**: SQL editor, paste `0004_shared_facts.sql`. Expect no error; the file is idempotent only through `create ... if not exists` guards the task adds.
3. **Policies by hand** (SQL editor, "run as authenticated" or curl with user A's token): a select on both tables is refused (there is no select policy); an update or delete is refused; `get_track_facts` with 201 ids is refused; with ids of two known tracks returns exactly those two.
4. **Refused rows** (curl with user A's token): bpm 0, bpm 999, key 12, key -1, major without key, a 21-character id, an extra column, a `measured_on` a year ahead: each answers 400 and stores nothing. A valid row answers 201 with an empty body (the insert uses `Prefer: return=minimal`, so nothing is read back); the same id again, with a different bpm, answers success and the stored row is unchanged (this is the `ON CONFLICT DO NOTHING` under an insert-only grant check, research D6).
5. **First user**: user A runs **Look up BPM and key**. Afterwards the dashboard table editor shows rows for the tracks found, with no user column.
6. **Second user**: user B (overlapping library) runs it. The card says "From the shared store: N tracks"; the network tab shows RPC calls of at most 200 ids and ReccoBeats calls only for the rest; the by-id and by-ISRC passes of the shared tracks end in under a minute.
7. **Rekordbox**: import a rekordbox file with a BPM different from ReccoBeats' for one track, then run: the Crate shows the rekordbox value, the table holds no rekordbox value (compare the row).
8. **Reach**: A runs **Look up artists**, then B: B's ListenBrainz and Deezer phases are shorter, the card names the artists taken from the store; numbers older than 90 days (set a row's `measured_on` back in the dashboard) are measured again and a newer row appears.
9. **Server down**: switch the network off, or break the key, in the middle of a run: the run ends `done`, the card gives the reason, the results equal a run without the server.
10. **Remove server data** as B: the shared rows B contributed are still there; A's data is untouched.
11. **No server settings**: a build without them shows no notice, no store line, and behaves as before.

## Recorded output of steps 3 and 4 (T022, filled at T033)

Run on the real project by the owner; paste the exact output here. `$URL` is the project URL, `$TOKEN_A` user A's access token, `$ANON` the public key.

Step 3 (policies):

```
curl -s "$URL/rest/v1/shared_track_facts?select=*" -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN_A"
curl -s -X PATCH "$URL/rest/v1/shared_track_facts?track_id=eq.<id>" -H ... -d '{"bpm":100}'
curl -s -X DELETE "$URL/rest/v1/shared_track_facts?track_id=eq.<id>" -H ...
curl -s -X POST "$URL/rest/v1/rpc/get_track_facts" -H ... -d '{"ids":[<201 ids>]}'
curl -s -X POST "$URL/rest/v1/rpc/get_track_facts" -H ... -d '{"ids":["<known1>","<known2>"]}'
```

Expected: select refused, PATCH and DELETE refused or affecting nothing, 201 ids refused (`too many ids`), two ids return exactly two rows of four columns. Output: _not yet recorded_.

Step 4 (refused rows): one POST to `/rest/v1/shared_track_facts` per case (bpm 0, 999; key 12, -1; major without key; 21-character id; an extra column) and to `/rest/v1/shared_artist_reach` (`measured_on` a year ahead), each expecting 400 and no stored row; then a valid row (201, empty body) and the same id with another bpm (success, stored row unchanged). Output: _not yet recorded_.
